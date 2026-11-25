export type AgentDownloadKey =
  | 'agent_mjs'
  | 'agent_package_json'
  | 'agent_env_example'
  | 'sap_python_bot'
  | 'sap_odata_bot'
  | 'agent_readme';

export function triggerTextFileDownload(fileName: string, content: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const AGENT_PACKAGE_JSON = `{
  "name": "premex-clara-wm-agent",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Agente Puente RPA local para extracción en Clara, verificación de radicación en Work Manager (:8037) y despacho a bot SAP.",
  "scripts": {
    "start": "node agent.mjs",
    "install-browsers": "npx playwright install chromium"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "playwright": "^1.50.0"
  }
}
`;

const AGENT_ENV_EXAMPLE = `PORT=4780
ALLOWED_ORIGINS=http://localhost:3000,https://tu-app-premex.vercel.app
AGENT_TOKEN=cambia-este-token-secreto-premex-2026
CLARA_URL=https://colombia.clara.com/auth/login
WM_URL=https://pan.iluma.bio:8037/Account/Login
WM_IGNORE_HTTPS_ERRORS=true
SAP_DISPATCH_DIR=./sap-queue
`;

const AGENT_MJS = `import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { chromium } from 'playwright';

const PORT = Number(process.env.PORT || 4780);
const AGENT_TOKEN = String(process.env.AGENT_TOKEN || '').trim();
const CLARA_URL = process.env.CLARA_URL || 'https://colombia.clara.com/auth/login';
const WM_URL = process.env.WM_URL || 'https://pan.iluma.bio:8037/Account/Login';
const WM_IGNORE_HTTPS_ERRORS = process.env.WM_IGNORE_HTTPS_ERRORS !== 'false';
const PROFILE_DIR = path.resolve(process.cwd(), '.pw-profile');
const SAP_DISPATCH_DIR = path.resolve(process.cwd(), process.env.SAP_DISPATCH_DIR || './sap-queue');
const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (!AGENT_TOKEN || AGENT_TOKEN.length < 16) {
  console.error('[ERROR] Configura AGENT_TOKEN en .env (mínimo 16 caracteres) antes de iniciar.');
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) {
        callback(null, true);
        return;
      }
      callback(new Error(\`Origen CORS no autorizado: \${origin}\`));
    },
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

function constantTimeTokenMatch(provided, expected) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireBearerAuth(req, res, next) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token || !constantTimeTokenMatch(token, AGENT_TOKEN)) {
    res.status(401).json({ error: 'Token de agente inválido o faltante.' });
    return;
  }
  next();
}

let sharedContext = null;
async function getBrowserContext() {
  if (sharedContext) return sharedContext;
  await fs.mkdir(PROFILE_DIR, { recursive: true });
  sharedContext = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    ignoreHTTPSErrors: WM_IGNORE_HTTPS_ERRORS,
    viewport: { width: 1366, height: 860 },
    args: ['--disable-blink-features=AutomationControlled'],
  });
  sharedContext.on('close', () => { sharedContext = null; });
  return sharedContext;
}

app.get('/health', requireBearerAuth, async (_req, res) => {
  res.json({
    ok: true,
    agent: 'premex-clara-wm-agent',
    version: '1.0.0',
    browserActive: Boolean(sharedContext),
    claraUrl: CLARA_URL,
    workManagerUrl: WM_URL,
    timestamp: new Date().toISOString(),
  });
});

app.post('/session/open', requireBearerAuth, async (req, res) => {
  try {
    const target = String(req.body?.target || 'clara').toLowerCase();
    const targetUrl = target === 'workmanager' ? WM_URL : CLARA_URL;
    const context = await getBrowserContext();
    const page = await context.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    res.json({
      ok: true,
      target,
      openedUrl: page.url(),
      message: target === 'workmanager'
        ? 'Pestaña de Work Manager abierta. Inicia sesión y deja la pestaña activa.'
        : 'Pestaña de Clara abierta. Inicia sesión (incluyendo 2FA) y deja la sesión activa.',
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'No se pudo abrir el navegador.' });
  }
});

app.post('/clara/extract', requireBearerAuth, async (req, res) => {
  try {
    const context = await getBrowserContext();
    let claraPage = context.pages().find((p) => p.url().includes('clara.com'));
    if (!claraPage) {
      claraPage = await context.newPage();
      await claraPage.goto(CLARA_URL.replace('/auth/login', '/'), { waitUntil: 'domcontentloaded', timeout: 45_000 });
    }
    if (claraPage.url().includes('/auth/login')) {
      res.status(409).json({ error: 'Sesión de Clara pendiente de login/2FA en Chromium del Agente.' });
      return;
    }
    const rows = await claraPage.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('table tbody tr'));
      return trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => (td.textContent || '').replace(/\\s+/g, ' ').trim())).filter((c) => c.length >= 3);
    });
    res.json({ ok: true, extractedAtIso: new Date().toISOString(), sourceUrl: claraPage.url(), rawTableRowsCount: rows.length, rows });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Error extrayendo desde Clara.' });
  }
});

app.post('/wm/check-radicacion', requireBearerAuth, async (req, res) => {
  try {
    const invoices = Array.isArray(req.body?.invoices) ? req.body.invoices : [];
    const context = await getBrowserContext();
    let wmPage = context.pages().find((p) => p.url().includes('pan.iluma.bio'));
    if (!wmPage) {
      wmPage = await context.newPage();
      await wmPage.goto(WM_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    }
    if (wmPage.url().toLowerCase().includes('/account/login')) {
      res.status(409).json({ error: 'Work Manager está en pantalla de Login. Inicia sesión primero.' });
      return;
    }
    const results = [];
    for (const item of invoices.slice(0, 100)) {
      const numeroFactura = String(item?.numeroFactura || '').trim();
      if (!numeroFactura) {
        results.push({ txId: item?.txId, numeroFactura: '', estado: 'pendiente', mensaje: 'Sin número de factura para buscar.' });
        continue;
      }
      const searchInput = wmPage.locator('input[type="search"], input[name*="Factura" i], input[placeholder*="Buscar" i]').first();
      if ((await searchInput.count()) === 0) {
        results.push({ txId: item?.txId, numeroFactura, estado: 'pendiente', mensaje: 'Navega a la consulta de facturas en WM y ajusta el selector.' });
        continue;
      }
      await searchInput.fill('');
      await searchInput.fill(numeroFactura);
      await searchInput.press('Enter').catch(() => {});
      await wmPage.waitForTimeout(900);
      const pageText = await wmPage.locator('table tbody').innerText().catch(() => '');
      const found = pageText.toUpperCase().includes(numeroFactura.toUpperCase());
      const upper = pageText.toUpperCase();
      const isRejected = upper.includes('RECHAZ') || upper.includes('RECLAMO') || upper.includes('ANULAD');
      results.push({
        txId: item?.txId,
        numeroFactura,
        estado: found ? (isRejected ? 'inconsistencia' : 'radicada') : 'no_radicada',
        radicacionFecha: found ? new Date().toISOString().slice(0, 10) : undefined,
        mensaje: found ? (isRejected ? 'Localizada con reclamo/rechazo en WM.' : 'Confirmada radicada en WM.') : 'No encontrada en WM.',
      });
    }
    res.json({ ok: true, checkedAtIso: new Date().toISOString(), results });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Error consultando Work Manager.' });
  }
});

app.post('/sap/dispatch', requireBearerAuth, async (req, res) => {
  try {
    const pkg = req.body?.packageData;
    if (!pkg || !Array.isArray(pkg.items) || pkg.items.length === 0) {
      res.status(400).json({ error: 'Paquete SAP vacío o inválido.' });
      return;
    }
    await fs.mkdir(SAP_DISPATCH_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = \`paquete_sap_bot_\${stamp}.json\`;
    const fullPath = path.join(SAP_DISPATCH_DIR, fileName);
    await fs.writeFile(fullPath, JSON.stringify(pkg, null, 2), 'utf8');
    res.json({ ok: true, savedFile: fileName, fullPath, itemsCount: pkg.items.length });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'No se pudo guardar el paquete SAP.' });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(\`[Premex RPA Agent] Escuchando en http://127.0.0.1:\${PORT}\`);
});
`;

const SAP_PYTHON_BOT = `"""
Bot Independiente SAP GUI Scripting (FB60) - Premex
Requisitos: pip install pywin32
Uso: python sap_posting_bot.py --input paquete_sap_bot.json --dry-run
"""
import argparse, json
from datetime import datetime
from pathlib import Path

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--output", default="sap_results.json")
    p.add_argument("--dry-run", action="store_true")
    return p.parse_args()

def connect_sap_session():
    import win32com.client
    sap_gui = win32com.client.GetObject("SAPGUI")
    return sap_gui.GetScriptingEngine.Children(0).Children(0)

def post_fb60_item(session, item):
    session.findById("wnd[0]/tbar[0]/okcd").text = "/nFB60"
    session.findById("wnd[0]").sendVKey(0)
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-ACCNT").text = str(item.get("codigoAcreedorSap") or "")
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-BLDAT").text = str(item.get("fechaFactura") or item.get("fechaClara") or "").replace("-", ".")
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/txtINVFO-XBLNR").text = str(item.get("numeroFactura") or item.get("claraTxId") or "")[:16]
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/txtINVFO-WRBTR").text = str(item.get("total") or 0)
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-WAERS").text = str(item.get("moneda") or "COP")
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/ctxtINVFO-MWSKZ").text = str(item.get("indicadorImpuesto") or "V19")
    session.findById("wnd[0]/usr/tabsTS/tabpMAIN/ssubPAGE:SAPLFDCB:0010/txtINVFO-SGTXT").text = str(item.get("textoPosicion") or "")[:50]
    grid = session.findById("wnd[0]/usr/subITEMS:SAPLFSKB:0100/tblSAPLFSKBTABLE")
    grid.getCell(0, 1).text = str(item.get("cuentaMayor") or "")
    grid.getCell(0, 4).text = str(item.get("total") or 0)
    grid.getCell(0, 8).text = str(item.get("textoPosicion") or "")[:50]
    grid.getCell(0, 14).text = str(item.get("centroCostoSap") or "")
    session.findById("wnd[0]/tbar[0]/btn[11]").press()
    return str(session.findById("wnd[0]/sbar").text or "OK")

def main():
    args = parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    items = payload.get("items", [])
    session = None if args.dry_run else connect_sap_session()
    results = []
    for item in items:
        tx_id = item.get("txId")
        missing = [k for k in ("sociedadSap", "codigoAcreedorSap", "cuentaMayor", "centroCostoSap", "total") if not item.get(k)]
        if missing:
            results.append({"txId": tx_id, "status": "error", "sapDocContable": "", "message": f"Faltan: {', '.join(missing)}"})
            continue
        if args.dry_run:
            results.append({"txId": tx_id, "status": "simulado_ok", "sapDocContable": f"SIM-{str(tx_id)[-6:]}", "message": "Simulación FB60 OK"})
            continue
        try:
            msg = post_fb60_item(session, item)
            results.append({"txId": tx_id, "status": "contabilizado", "sapDocContable": msg, "message": msg})
        except Exception as exc:
            results.append({"txId": tx_id, "status": "error", "sapDocContable": "", "message": str(exc)})
    Path(args.output).write_text(json.dumps({"processedAtIso": datetime.utcnow().isoformat() + "Z", "batchId": payload.get("batchId"), "results": results}, indent=2, ensure_ascii=False), encoding="utf-8")

if __name__ == "__main__":
    main()
`;

const SAP_ODATA_BOT = `import fs from 'node:fs/promises';

const inputFile = process.argv[2] || './paquete_sap_bot.json';
const outputFile = process.argv[3] || './sap_results.json';
const dryRun = process.argv.includes('--dry-run');

const SAP_ODATA_URL = String(process.env.SAP_ODATA_URL || '').trim();
const SAP_USER = String(process.env.SAP_USER || '').trim();
const SAP_PASSWORD = String(process.env.SAP_PASSWORD || '').trim();
const SAP_CLIENT = String(process.env.SAP_CLIENT || '100').trim();

async function main() {
  const pkg = JSON.parse(await fs.readFile(inputFile, 'utf8'));
  const results = [];
  for (const item of pkg.items || []) {
    if (dryRun) {
      results.push({ txId: item.txId, status: 'simulado_ok', sapDocContable: \`ODATA-SIM-\${String(item.txId).slice(-5)}\`, message: 'Validación OData OK' });
      continue;
    }
    if (!SAP_ODATA_URL || !SAP_USER || !SAP_PASSWORD) {
      throw new Error('Define SAP_ODATA_URL, SAP_USER y SAP_PASSWORD en entorno local.');
    }
    const auth = \`Basic \${Buffer.from(\`\${SAP_USER}:\${SAP_PASSWORD}\`).toString('base64')}\`;
    const headRes = await fetch(\`\${SAP_ODATA_URL}?sap-client=\${encodeURIComponent(SAP_CLIENT)}\`, {
      method: 'HEAD',
      headers: { Authorization: auth, 'x-csrf-token': 'Fetch' },
    });
    const csrf = headRes.headers.get('x-csrf-token') || '';
    const res = await fetch(\`\${SAP_ODATA_URL}?sap-client=\${encodeURIComponent(SAP_CLIENT)}\`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json', 'x-csrf-token': csrf },
      body: JSON.stringify({
        CompanyCode: item.sociedadSap,
        DocumentDate: item.fechaFactura || item.fechaClara,
        PostingDate: item.fechaFactura || item.fechaClara,
        DocumentType: item.claseDoc || 'KR',
        ReferenceDocument: String(item.numeroFactura || item.claraTxId || '').slice(0, 16),
        Currency: item.moneda,
        VendorCode: item.codigoAcreedorSap,
        TaxCode: item.indicadorImpuesto,
        GLAccount: item.cuentaMayor,
        CostCenter: item.centroCostoSap,
        Amount: String(item.total),
        ItemText: String(item.textoPosicion || '').slice(0, 50),
      }),
    });
    const body = await res.json().catch(() => ({}));
    results.push({
      txId: item.txId,
      status: res.ok ? 'contabilizado' : 'error',
      sapDocContable: res.ok ? String(body?.d?.AccountingDocument || 'OK') : '',
      message: res.ok ? 'Contabilizado vía OData' : body?.error?.message?.value || \`HTTP \${res.status}\`,
    });
  }
  await fs.writeFile(outputFile, JSON.stringify({ processedAtIso: new Date().toISOString(), batchId: pkg.batchId, results }, null, 2));
}

main();
`;

const AGENT_README = `# Guía Rápida: Agente Puente Local Premex (Clara + Work Manager :8037 + Bot SAP)

1. Crea una carpeta local y guarda package.json, .env.example (renómbralo a .env) y agent.mjs.
2. Ejecuta:
   npm install
   npm run install-browsers
   npm start
3. En la app web Premex (Conectores y RPA), escribe http://127.0.0.1:4780 y el AGENT_TOKEN definido en .env.
4. Usa "Abrir Sesión Clara" / "Abrir Sesión WM" para autenticarte una sola vez (2FA incluido).
5. Descarga paquete_sap_bot.json y ejecútalo con sap_posting_bot.py o sap_odata_poster.mjs.
`;

export function downloadAgentTemplateFile(key: AgentDownloadKey) {
  switch (key) {
    case 'agent_package_json':
      triggerTextFileDownload('package.json', AGENT_PACKAGE_JSON, 'application/json;charset=utf-8');
      break;
    case 'agent_env_example':
      triggerTextFileDownload('.env.example', AGENT_ENV_EXAMPLE);
      break;
    case 'agent_mjs':
      triggerTextFileDownload('agent.mjs', AGENT_MJS, 'text/javascript;charset=utf-8');
      break;
    case 'sap_python_bot':
      triggerTextFileDownload('sap_posting_bot.py', SAP_PYTHON_BOT, 'text/x-python;charset=utf-8');
      break;
    case 'sap_odata_bot':
      triggerTextFileDownload('sap_odata_poster.mjs', SAP_ODATA_BOT, 'text/javascript;charset=utf-8');
      break;
    case 'agent_readme':
      triggerTextFileDownload('README_AGENT_PREMEX.md', AGENT_README, 'text/markdown;charset=utf-8');
      break;
  }
}
