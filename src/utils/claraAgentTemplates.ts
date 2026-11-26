export type AgentDownloadKey =
  | 'agent_mjs'
  | 'agent_package_json'
  | 'agent_env_example'
  | 'sap_python_bot'
  | 'sap_odata_bot'
  | 'agent_readme'
  | 'python_agent_py'
  | 'python_standalone_py'
  | 'python_requirements'
  | 'python_env_example'
  | 'python_readme';

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
    runtime: 'nodejs',
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

const PYTHON_REQUIREMENTS = `playwright>=1.50.0
requests>=2.32.0
python-dotenv>=1.0.1
openpyxl>=3.1.5
`;

const PYTHON_ENV_EXAMPLE = `# Configuracion del Agente y Extractor Python (Clara + Work Manager :8037)
PORT=4780
ALLOWED_ORIGINS=http://localhost:3000,https://ais-dev-7yf7xwi7yo2z6be3yuhcf4-757511843072.us-west2.run.app,https://ais-pre-7yf7xwi7yo2z6be3yuhcf4-757511843072.us-west2.run.app,*
AGENT_TOKEN=cambia-este-token-secreto-premex-2026

CLARA_URL=https://colombia.clara.com/auth/login
CLARA_TX_URL=https://colombia.clara.com/transactions
CLARA_USER=
CLARA_PASSWORD=

WM_URL=https://pan.iluma.bio:8037/Account/Login
WM_SEARCH_URL=https://pan.iluma.bio:8037/
WM_USER=
WM_PASSWORD=
WM_VERIFY_SSL=false

# playwright = automatiza navegador Chromium (recomendado para 2FA y JS)
# requests   = usa tu sesion requests/BeautifulSoup en WM
WM_MODE=playwright
HEADLESS=false
SAP_DISPATCH_DIR=./sap-queue
`;

const PYTHON_AGENT_PY = `"""
Agente Puente RPA en Python para Premex Suite (Clara + Work Manager :8037 + SAP)
--------------------------------------------------------------------------------
Funciona 100% compatible con la pestaña "Conectores RPA" y "Extracción Clara" de la app web.
Expone http://127.0.0.1:4780 y permite:
  1. Login automático en Work Manager (:8037) usando tus credenciales de .env (o sesión manual).
  2. Login persistente en Clara (incluyendo 2FA) + extracción estructurada de movimientos y tabla.
  3. Consulta en vivo de radicación en Work Manager (:8037) por Playwright o por tu propia lógica requests.
  4. Despacho directo del paquete SAP a carpeta local ./sap-queue.

Instalación rápida:
  pip install -r requirements_clara_wm.txt
  playwright install chromium
  cp .env.python.example .env   # y completa AGENT_TOKEN, WM_USER, WM_PASSWORD
  python clara_wm_agent.py
"""
from __future__ import annotations

import hmac
import json
import os
import re
import sys
import threading
import urllib3
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from playwright.sync_api import BrowserContext, Page, sync_playwright

load_dotenv()
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

PORT = int(os.getenv("PORT", "4780"))
AGENT_TOKEN = os.getenv("AGENT_TOKEN", "").strip()
CLARA_URL = os.getenv("CLARA_URL", "https://colombia.clara.com/auth/login").strip()
CLARA_TX_URL = os.getenv("CLARA_TX_URL", "https://colombia.clara.com/transactions").strip()
CLARA_USER = os.getenv("CLARA_USER", "").strip()
CLARA_PASSWORD = os.getenv("CLARA_PASSWORD", "").strip()

WM_URL = os.getenv("WM_URL", "https://pan.iluma.bio:8037/Account/Login").strip()
WM_SEARCH_URL = os.getenv("WM_SEARCH_URL", "https://pan.iluma.bio:8037/").strip()
WM_USER = os.getenv("WM_USER", "").strip()
WM_PASSWORD = os.getenv("WM_PASSWORD", "").strip()
WM_VERIFY_SSL = os.getenv("WM_VERIFY_SSL", "false").strip().lower() == "true"
WM_MODE = os.getenv("WM_MODE", "playwright").strip().lower()
HEADLESS = os.getenv("HEADLESS", "false").strip().lower() == "true"

PROFILE_DIR = Path.cwd() / ".pw-profile-python"
SAP_DISPATCH_DIR = Path(os.getenv("SAP_DISPATCH_DIR", "./sap-queue")).resolve()
ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,*").split(",") if o.strip()
]

if not AGENT_TOKEN or len(AGENT_TOKEN) < 12:
    print("[ERROR] Configura AGENT_TOKEN en .env (mínimo 12 caracteres) antes de iniciar.")
    sys.exit(1)


class BrowserManager:
    """Mantiene una única instancia Playwright en un hilo dedicado (thread-safe para HTTP)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pw = None
        self._context: BrowserContext | None = None
        self._captured_clara_api: list[dict[str, Any]] = []

    def ensure_context(self) -> BrowserContext:
        if self._context is not None:
            return self._context
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        self._pw = sync_playwright().start()
        self._context = self._pw.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=HEADLESS,
            ignore_https_errors=not WM_VERIFY_SSL,
            viewport={"width": 1366, "height": 860},
            args=["--disable-blink-features=AutomationControlled"],
        )
        self._context.on("response", self._on_response)
        return self._context

    def _on_response(self, response) -> None:
        """Intercepta respuestas JSON de Clara automáticamente si navegas por movimientos."""
        try:
            url = response.url.lower()
            if "clara.com" in url and "transaction" in url and response.status == 200:
                ctype = (response.headers.get("content-type") or "").lower()
                if "json" in ctype:
                    payload = response.json()
                    items = payload if isinstance(payload, list) else payload.get("data") or payload.get("items") or payload.get("results") or []
                    if isinstance(items, list) and items:
                        self._captured_clara_api = items
        except Exception:
            pass

    def run(self, fn):
        with self._lock:
            ctx = self.ensure_context()
            return fn(ctx)


BROWSER = BrowserManager()


def clean_amount(raw: Any) -> float:
    if isinstance(raw, (int, float)):
        return round(abs(float(raw)), 2)
    s = re.sub(r"[^\\d.,-]", "", str(raw or "").strip())
    if not s:
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        if len(parts[-1]) <= 2:
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    try:
        return round(abs(float(s)), 2)
    except ValueError:
        return 0.0


def normalize_clara_api_item(item: dict[str, Any], idx: int) -> dict[str, Any]:
    """Convierte un objeto JSON interceptado de Clara al esquema de la app Premex."""
    amount_raw = item.get("amount") or item.get("billingAmount") or item.get("total") or 0
    if isinstance(amount_raw, dict):
        amount_val = clean_amount(amount_raw.get("value") or amount_raw.get("amount"))
        currency = str(amount_raw.get("currency") or "COP").upper()
    else:
        amount_val = clean_amount(amount_raw)
        currency = str(item.get("currency") or item.get("currencyCode") or "COP").upper()

    merchant = item.get("merchant") or {}
    merchant_name = (
        merchant.get("name")
        if isinstance(merchant, dict)
        else str(item.get("merchantName") or item.get("comercio") or "Comercio Clara")
    )
    user_obj = item.get("user") or item.get("cardholder") or {}
    holder_name = (
        user_obj.get("fullName") or user_obj.get("name")
        if isinstance(user_obj, dict)
        else str(item.get("cardholderName") or item.get("tarjetahabiente") or "Usuario Clara")
    )
    cc_obj = item.get("costCenter") or {}
    cost_center = (
        cc_obj.get("name") or cc_obj.get("code")
        if isinstance(cc_obj, dict)
        else str(item.get("costCenterName") or item.get("centroCosto") or "")
    )
    raw_date = str(item.get("createdAt") or item.get("transactionDate") or item.get("fecha") or "")
    fecha = raw_date[:10] if len(raw_date) >= 10 else datetime.now().strftime("%Y-%m-%d")

    return {
        "claraTxId": str(item.get("id") or item.get("transactionId") or f"CLR-PY-{idx + 1}"),
        "fecha": fecha,
        "sociedad": str(item.get("legalEntity") or item.get("company") or "PREMEX"),
        "tarjetahabiente": str(holder_name or "Usuario Clara"),
        "comercio": str(merchant_name or "Comercio Clara"),
        "nitComercio": str(item.get("taxId") or item.get("nit") or ""),
        "pais": str(item.get("country") or "Colombia"),
        "moneda": currency or "COP",
        "valor": amount_val,
        "centroCosto": str(cost_center or ""),
        "observacion": str(item.get("memo") or item.get("description") or item.get("notes") or f"Gasto {merchant_name}"),
        "facturaNumero": str(item.get("invoiceNumber") or ""),
        "origenRegistro": "rpa_clara",
    }


def login_clara_if_needed(page: Page) -> None:
    """Completa usuario/clave en Clara si están en .env; si hay 2FA espera login manual."""
    if "/auth/login" not in page.url.lower():
        return
    if CLARA_USER and CLARA_PASSWORD:
        email_input = page.locator('input[type="email"], input[name*="email" i], input[name*="user" i]').first
        pass_input = page.locator('input[type="password"]').first
        if email_input.count() > 0 and pass_input.count() > 0:
            email_input.fill(CLARA_USER)
            pass_input.fill(CLARA_PASSWORD)
            btn = page.locator('button[type="submit"]').first
            if btn.count() > 0:
                btn.click()
            page.wait_for_timeout(3000)


def login_wm_playwright_if_needed(page: Page) -> None:
    """
    Inicia sesión automáticamente en Work Manager (:8037) usando WM_USER / WM_PASSWORD de .env.
    Si tu pantalla de login usa otros IDs de input, ajústalos aquí.
    """
    if "/account/login" not in page.url.lower():
        return
    if not (WM_USER and WM_PASSWORD):
        return
    user_input = page.locator(
        'input[name="UserName"], input[name="Email"], input[id*="User" i], input[id*="Email" i], input[type="text"], input[type="email"]'
    ).first
    pass_input = page.locator('input[type="password"]').first
    if user_input.count() > 0 and pass_input.count() > 0:
        user_input.fill(WM_USER)
        pass_input.fill(WM_PASSWORD)
        submit_btn = page.locator('button[type="submit"], input[type="submit"]').first
        if submit_btn.count() > 0:
            submit_btn.click()
            page.wait_for_load_state("domcontentloaded", timeout=20_000)
            page.wait_for_timeout(1200)


def wm_check_via_requests(invoices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    MODO REQUESTS (Python puro sin navegador):
    Adapta esta función con el código exacto que ya te funcionó en Python para
    iniciar sesión en Work Manager (:8037) y consultar cada factura.
    """
    session = requests.Session()
    session.verify = WM_VERIFY_SSL

    # 1. Login en WM (ajusta los campos del formulario ASP.NET / MVC según tu prueba exitosa)
    login_page = session.get(WM_URL, timeout=20)
    token_match = re.search(r'name="__RequestVerificationToken"[^>]*value="([^"]+)"', login_page.text)
    payload = {
        "UserName": WM_USER,
        "Email": WM_USER,
        "Password": WM_PASSWORD,
    }
    if token_match:
        payload["__RequestVerificationToken"] = token_match.group(1)
    session.post(WM_URL, data=payload, timeout=20)

    results = []
    for item in invoices[:100]:
        tx_id = item.get("txId")
        numero = str(item.get("numeroFactura") or "").strip()
        if not numero:
            results.append({"txId": tx_id, "numeroFactura": "", "estado": "pendiente", "mensaje": "Sin número de factura."})
            continue
        # --- PERSONALIZA AQUÍ TU ENDPOINT DE CONSULTA EN WORK MANAGER ---
        resp = session.get(WM_SEARCH_URL, params={"search": numero, "factura": numero}, timeout=20)
        upper = resp.text.upper()
        found = numero.upper() in upper
        is_rejected = any(w in upper for w in ("RECHAZ", "RECLAMO", "ANULAD"))
        results.append({
            "txId": tx_id,
            "numeroFactura": numero,
            "estado": "inconsistencia" if (found and is_rejected) else ("radicada" if found else "no_radicada"),
            "radicacionFecha": datetime.now().strftime("%Y-%m-%d") if found else None,
            "mensaje": (
                "Localizada con reclamo/rechazo en WM (Python requests)."
                if (found and is_rejected)
                else ("Confirmada radicada en WM (Python requests)." if found else "No encontrada en WM (Python requests).")
            ),
        })
    return results


def open_session(target: str) -> dict[str, Any]:
    def _task(ctx: BrowserContext):
        url = WM_URL if target == "workmanager" else CLARA_URL
        page = ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=45_000)
        if target == "workmanager":
            login_wm_playwright_if_needed(page)
            msg = "Pestaña de Work Manager (:8037) abierta en Python Playwright."
        else:
            login_clara_if_needed(page)
            msg = "Pestaña de Clara abierta en Python Playwright (completa 2FA si aplica)."
        return {"ok": True, "target": target, "openedUrl": page.url, "message": msg}

    return BROWSER.run(_task)


def extract_clara(period: str | None = None) -> dict[str, Any]:
    def _task(ctx: BrowserContext):
        page = next((p for p in ctx.pages if "clara.com" in p.url), None)
        if page is None:
            page = ctx.new_page()
            page.goto(CLARA_TX_URL, wait_until="domcontentloaded", timeout=45_000)
            login_clara_if_needed(page)

        if "/auth/login" in page.url.lower():
            raise RuntimeError("Sesión de Clara pendiente de login/2FA en el navegador Python.")

        page.wait_for_timeout(1200)
        rows = page.evaluate(
            """() => {
                const trs = Array.from(document.querySelectorAll('table tbody tr, [role="row"]'));
                return trs.map((tr) =>
                    Array.from(tr.querySelectorAll('td, [role="cell"]'))
                        .map((td) => (td.textContent || '').replace(/\\s+/g, ' ').trim())
                ).filter((cols) => cols.length >= 3);
            }"""
        )

        structured = [
            normalize_clara_api_item(item, i)
            for i, item in enumerate(BROWSER._captured_clara_api)
        ]

        return {
            "ok": True,
            "engine": "python-playwright",
            "extractedAtIso": datetime.now(timezone.utc).isoformat(),
            "sourceUrl": page.url,
            "period": period or "ALL",
            "rawTableRowsCount": len(rows),
            "rows": rows,
            "transactions": structured,
        }

    return BROWSER.run(_task)


def check_wm(invoices: list[dict[str, Any]]) -> dict[str, Any]:
    if WM_MODE == "requests":
        results = wm_check_via_requests(invoices)
        return {
            "ok": True,
            "engine": "python-requests",
            "checkedAtIso": datetime.now(timezone.utc).isoformat(),
            "results": results,
        }

    def _task(ctx: BrowserContext):
        page = next((p for p in ctx.pages if "pan.iluma.bio" in p.url), None)
        if page is None:
            page = ctx.new_page()
            page.goto(WM_URL, wait_until="domcontentloaded", timeout=45_000)
        login_wm_playwright_if_needed(page)

        if "/account/login" in page.url.lower():
            raise RuntimeError("Work Manager está en Login. Configura WM_USER/WM_PASSWORD en .env o inicia sesión manual.")

        results = []
        for item in invoices[:100]:
            tx_id = item.get("txId")
            numero = str(item.get("numeroFactura") or "").strip()
            if not numero:
                results.append({"txId": tx_id, "numeroFactura": "", "estado": "pendiente", "mensaje": "Sin número de factura."})
                continue

            search_input = page.locator(
                'input[type="search"], input[name*="Factura" i], input[id*="Factura" i], input[placeholder*="Buscar" i]'
            ).first
            if search_input.count() == 0:
                results.append({
                    "txId": tx_id,
                    "numeroFactura": numero,
                    "estado": "pendiente",
                    "mensaje": "Abre la vista de consulta en WM (:8037) o ajusta el selector en clara_wm_agent.py.",
                })
                continue

            search_input.fill("")
            search_input.fill(numero)
            search_input.press("Enter")
            page.wait_for_timeout(900)
            body_text = page.locator("table tbody").inner_text() if page.locator("table tbody").count() > 0 else page.content()
            upper = body_text.upper()
            found = numero.upper() in upper
            is_rejected = any(w in upper for w in ("RECHAZ", "RECLAMO", "ANULAD"))
            results.append({
                "txId": tx_id,
                "numeroFactura": numero,
                "estado": "inconsistencia" if (found and is_rejected) else ("radicada" if found else "no_radicada"),
                "radicacionFecha": datetime.now().strftime("%Y-%m-%d") if found else None,
                "mensaje": (
                    "Localizada con reclamo/rechazo en WM (:8037)."
                    if (found and is_rejected)
                    else ("Confirmada radicada en WM (:8037)." if found else "No encontrada en WM (:8037).")
                ),
            })

        return {
            "ok": True,
            "engine": "python-playwright",
            "checkedAtIso": datetime.now(timezone.utc).isoformat(),
            "results": results,
        }

    return BROWSER.run(_task)


class AgentHandler(BaseHTTPRequestHandler):
    def _cors_headers(self) -> None:
        origin = self.headers.get("Origin", "")
        allow = "*"
        if origin and (origin in ALLOWED_ORIGINS or "*" in ALLOWED_ORIGINS):
            allow = origin
        self.send_header("Access-Control-Allow-Origin", allow)
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _check_auth(self) -> bool:
        auth = self.headers.get("Authorization", "")
        token = auth[7:].strip() if auth.startswith("Bearer ") else ""
        if not token or not hmac.compare_digest(token, AGENT_TOKEN):
            self._send_json(401, {"error": "Token de agente Python inválido o faltante."})
            return False
        return True

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        data = self.rfile.read(length)
        return json.loads(data.decode("utf-8"))

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self) -> None:
        if self.path.rstrip("/") == "/health":
            if not self._check_auth():
                return
            self._send_json(200, {
                "ok": True,
                "agent": "premex-clara-wm-python-agent",
                "runtime": "python",
                "version": "1.1.0",
                "browserActive": BROWSER._context is not None,
                "claraUrl": CLARA_URL,
                "workManagerUrl": WM_URL,
                "wmMode": WM_MODE,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            return
        self._send_json(404, {"error": "Ruta no encontrada."})

    def do_POST(self) -> None:
        if not self._check_auth():
            return
        path = self.path.rstrip("/")
        try:
            body = self._read_json()
            if path == "/session/open":
                target = str(body.get("target") or "clara").lower()
                self._send_json(200, open_session(target))
                return
            if path == "/clara/extract":
                self._send_json(200, extract_clara(body.get("period")))
                return
            if path == "/wm/check-radicacion":
                invoices = body.get("invoices") or []
                self._send_json(200, check_wm(invoices))
                return
            if path == "/sap/dispatch":
                pkg = body.get("packageData") or {}
                items = pkg.get("items") or []
                if not items:
                    self._send_json(400, {"error": "Paquete SAP vacío."})
                    return
                SAP_DISPATCH_DIR.mkdir(parents=True, exist_ok=True)
                stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                file_name = f"paquete_sap_bot_{stamp}.json"
                full_path = SAP_DISPATCH_DIR / file_name
                full_path.write_text(json.dumps(pkg, indent=2, ensure_ascii=False), encoding="utf-8")
                self._send_json(200, {
                    "ok": True,
                    "savedFile": file_name,
                    "fullPath": str(full_path),
                    "itemsCount": len(items),
                })
                return
            self._send_json(404, {"error": "Ruta POST no encontrada."})
        except RuntimeError as exc:
            self._send_json(409, {"error": str(exc)})
        except Exception as exc:
            self._send_json(500, {"error": str(exc)})

    def log_message(self, fmt: str, *args) -> None:
        print(f"[Python Agent] {fmt % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), AgentHandler)
    print(f"[Premex Python RPA Agent] Escuchando en http://127.0.0.1:{PORT} (WM_MODE={WM_MODE})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\nDeteniendo Agente Python...")
`;

const PYTHON_STANDALONE_PY = `"""
Extractor Independiente en Python: Clara + Work Manager (:8037) -> JSON para App Premex
-------------------------------------------------------------------------------------
Úsalo si prefieres ejecutar un script Python directamente en tu equipo (sin mantener
un servidor HTTP encendido) y luego subir el archivo resultante en la app web con el
botón "Importar JSON Python".

Dos modos de uso:
  1) Extraer desde Clara y verificar automáticamente en Work Manager:
       python clara_wm_standalone.py --output clara_wm_extraccion.json

  2) Leer un archivo wm_pendientes_python.json descargado desde la app web,
     consultar/operar cada factura en Work Manager (:8037) y generar el resultado:
       python clara_wm_standalone.py --wm-input wm_pendientes_python.json --output wm_resultados_python.json

Requisitos:
  pip install -r requirements_clara_wm.txt
  playwright install chromium
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import urllib3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright

load_dotenv()
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

CLARA_URL = os.getenv("CLARA_URL", "https://colombia.clara.com/auth/login").strip()
WM_URL = os.getenv("WM_URL", "https://pan.iluma.bio:8037/Account/Login").strip()
PROFILE_DIR = Path.cwd() / ".pw-profile-python"


def get_credentials(prefix: str, label: str) -> tuple[str, str]:
    user = os.getenv(f"{prefix}_USER", "").strip()
    pwd = os.getenv(f"{prefix}_PASSWORD", "").strip()
    if not user:
        user = input(f"Usuario {label}: ").strip()
    if not pwd and user:
        pwd = getpass.getpass(f"Contraseña {label} (oculta): ")
    return user, pwd


def verificar_en_work_manager(page, invoices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Reemplaza o ajusta aquí los selectores con los mismos pasos que ya te funcionaron
    en tu prueba Python de Work Manager (:8037).
    """
    wm_user, wm_pass = get_credentials("WM", "Work Manager (:8037)")
    page.goto(WM_URL, wait_until="domcontentloaded", timeout=45_000)

    if "/account/login" in page.url.lower() and wm_user and wm_pass:
        page.locator('input[type="text"], input[type="email"], input[name*="User" i]').first.fill(wm_user)
        page.locator('input[type="password"]').first.fill(wm_pass)
        page.locator('button[type="submit"], input[type="submit"]').first.click()
        page.wait_for_load_state("domcontentloaded", timeout=25_000)
        page.wait_for_timeout(1200)

    if "/account/login" in page.url.lower():
        input("Completa el login en Work Manager en la ventana de Chromium y presiona ENTER aquí...")

    results = []
    for item in invoices:
        tx_id = item.get("txId")
        numero = str(item.get("numeroFactura") or "").strip()
        if not numero:
            results.append({"txId": tx_id, "numeroFactura": "", "estado": "pendiente", "mensaje": "Sin N° factura."})
            continue

        # --- AJUSTA TU BÚSQUEDA O TRANSACCIÓN EN WM AQUÍ ---
        search_box = page.locator(
            'input[type="search"], input[name*="Factura" i], input[id*="Factura" i], input[placeholder*="Buscar" i]'
        ).first
        if search_box.count() == 0:
            input(f"Navega a la consulta de facturas en WM para buscar {numero} y presiona ENTER...")
            search_box = page.locator('input[type="search"], input[type="text"]').first

        search_box.fill("")
        search_box.fill(numero)
        search_box.press("Enter")
        page.wait_for_timeout(900)

        text = page.locator("table tbody").inner_text() if page.locator("table tbody").count() > 0 else page.content()
        upper = text.upper()
        found = numero.upper() in upper
        is_rejected = any(w in upper for w in ("RECHAZ", "RECLAMO", "ANULAD"))

        results.append({
            "txId": tx_id,
            "numeroFactura": numero,
            "estado": "inconsistencia" if (found and is_rejected) else ("radicada" if found else "no_radicada"),
            "radicacionFecha": datetime.now().strftime("%Y-%m-%d") if found else None,
            "mensaje": (
                "Factura con reclamo/rechazo en WM."
                if (found and is_rejected)
                else ("Radicada en WM (:8037)." if found else "No radicada en WM (:8037).")
            ),
        })
    return results


def extraer_clara_y_wm(output_path: Path) -> None:
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    captured_api: list[dict[str, Any]] = []

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
            ignore_https_errors=True,
            viewport={"width": 1366, "height": 860},
        )
        page = ctx.new_page()

        def on_resp(resp):
            try:
                if "clara.com" in resp.url.lower() and "transaction" in resp.url.lower() and resp.status == 200:
                    if "json" in (resp.headers.get("content-type") or "").lower():
                        data = resp.json()
                        items = data if isinstance(data, list) else data.get("data") or data.get("items") or []
                        if isinstance(items, list) and items:
                            captured_api.extend(items)
            except Exception:
                pass

        page.on("response", on_resp)
        page.goto(CLARA_URL, wait_until="domcontentloaded", timeout=45_000)
        input("Inicia sesión en Clara (2FA incluido), abre la tabla de Movimientos y presiona ENTER aquí...")

        rows = page.evaluate(
            """() => Array.from(document.querySelectorAll('table tbody tr')).map(tr =>
                Array.from(tr.querySelectorAll('td')).map(td => (td.textContent || '').replace(/\\s+/g, ' ').trim())
            ).filter(r => r.length >= 3)"""
        )

        transactions = []
        for idx, item in enumerate(captured_api):
            amt = item.get("amount") or {}
            val = amt.get("value") if isinstance(amt, dict) else item.get("amount", 0)
            curr = amt.get("currency", "COP") if isinstance(amt, dict) else item.get("currency", "COP")
            merch = item.get("merchant") or {}
            name = merch.get("name") if isinstance(merch, dict) else item.get("merchantName", "Comercio Clara")
            transactions.append({
                "claraTxId": str(item.get("id") or f"CLR-PY-{idx + 1}"),
                "fecha": str(item.get("createdAt") or datetime.now().strftime("%Y-%m-%d"))[:10],
                "sociedad": str(item.get("legalEntity") or "PREMEX"),
                "tarjetahabiente": str((item.get("user") or {}).get("fullName") or "Usuario Clara"),
                "comercio": str(name),
                "nitComercio": str(item.get("taxId") or ""),
                "moneda": str(curr).upper(),
                "valor": abs(float(re.sub(r"[^\\d.]", "", str(val or 0)) or 0)),
                "centroCosto": str((item.get("costCenter") or {}).get("name") or ""),
                "observacion": str(item.get("memo") or item.get("description") or f"Gasto {name}"),
                "facturaNumero": str(item.get("invoiceNumber") or ""),
            })

        payload = {
            "schemaVersion": "premex-clara-python-v1",
            "extractedAtIso": datetime.now(timezone.utc).isoformat(),
            "source": "clara_wm_standalone.py",
            "transactions": transactions,
            "rows": rows,
        }
        output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[OK] Archivo generado: {output_path} ({len(transactions)} tx API, {len(rows)} filas tabla).")
        ctx.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Extractor Python Clara + Work Manager (:8037)")
    parser.add_argument("--wm-input", help="Ruta a wm_pendientes_python.json exportado desde la app web")
    parser.add_argument("--output", default="clara_wm_extraccion.json", help="Archivo JSON de salida para importar en la app")
    args = parser.parse_args()

    out = Path(args.output)
    if args.wm_input:
        data = json.loads(Path(args.wm_input).read_text(encoding="utf-8"))
        invoices = data.get("invoices") or data.get("items") or []
        PROFILE_DIR.mkdir(parents=True, exist_ok=True)
        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=str(PROFILE_DIR),
                headless=False,
                ignore_https_errors=True,
                viewport={"width": 1366, "height": 860},
            )
            page = ctx.new_page()
            results = verificar_en_work_manager(page, invoices)
            ctx.close()
        out.write_text(
            json.dumps(
                {
                    "schemaVersion": "premex-clara-python-v1",
                    "checkedAtIso": datetime.now(timezone.utc).isoformat(),
                    "results": results,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        print(f"[OK] Resultados WM guardados en {out} ({len(results)} facturas). Súbelo en la app web.")
    else:
        extraer_clara_y_wm(out)


if __name__ == "__main__":
    main()
`;

const PYTHON_README = `# Guía Rápida: Automatización en Python (Clara + Work Manager :8037)

Como ya probaste que puedes autenticarte y operar Work Manager desde Python, tienes **dos formas** de conectarlo con la Suite Premex:

## Opción 1: Puente Python en Vivo (recomendada)
La app web se comunica en directo con tu script Python en \`http://127.0.0.1:4780\`:

1. Instala dependencias una sola vez:
   \`\`\`bash
   pip install -r requirements_clara_wm.txt
   playwright install chromium
   \`\`\`
2. Renombra \`.env.python.example\` a \`.env\` y configura:
   - \`AGENT_TOKEN\` (ej. \`premex-python-secret-2026\`)
   - \`WM_USER\` y \`WM_PASSWORD\` (o déjalos vacíos para loguearte manualmente)
   - \`WM_MODE=playwright\` (o \`requests\` si prefieres usar tu sesión \`requests\` en \`wm_check_via_requests\`)
3. Ejecuta:
   \`\`\`bash
   python clara_wm_agent.py
   \`\`\`
4. En la app web (**Conectores RPA**):
   - URL: \`http://127.0.0.1:4780\`
   - Token: el mismo \`AGENT_TOKEN\` del \`.env\`
   - Haz clic en **Probar Agente Local**.
5. Desde **Extracción Clara** usa **"Leer Clara vía Agente"** y desde **Work Manager** usa **"Consultar WM (:8037) vía Agente"**.

## Opción 2: Script Python Independiente + Importar JSON
Si prefieres correr tu script Python cuando tú quieras sin dejar el servidor HTTP abierto:
1. Descarga \`wm_pendientes_python.json\` desde la pestaña **Work Manager** (**Exportar para Python**).
2. Ejecuta:
   \`\`\`bash
   python clara_wm_standalone.py --wm-input wm_pendientes_python.json --output wm_resultados_python.json
   \`\`\`
   *(O ejecuta \`python clara_wm_standalone.py\` para extraer movimientos de Clara a \`clara_wm_extraccion.json\`)*
3. Sube el JSON resultante en la app con el botón **"Importar JSON Python"**.
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

1. Crea una carpeta local y guarda package.json, .env.example (renómbralo a .env) y agent.mjs (o usa los scripts Python: clara_wm_agent.py).
2. Ejecuta:
   npm install
   npm run install-browsers
   npm start
3. En la app web Premex (Conectores y RPA), escribe http://127.0.0.1:4780 y el AGENT_TOKEN definido en .env.
4. Usa "Abrir Sesión Clara" / "Abrir Sesión WM" para autenticarte una sola vez (2FA incluido).
5. Descarga paquete_sap_bot.json y ejecútalo con sap_posting_bot.py o sap_odata_poster.mjs.
`;

export function getAgentTemplateSpec(key: AgentDownloadKey): {
  fileName: string;
  content: string;
  mime: string;
  title: string;
} {
  switch (key) {
    case 'agent_package_json':
      return {
        fileName: 'package.json',
        content: AGENT_PACKAGE_JSON,
        mime: 'application/json;charset=utf-8',
        title: 'package.json (Agente Node.js)',
      };
    case 'agent_env_example':
      return {
        fileName: '.env.example',
        content: AGENT_ENV_EXAMPLE,
        mime: 'text/plain;charset=utf-8',
        title: '.env.example (Agente Node.js)',
      };
    case 'agent_mjs':
      return {
        fileName: 'agent.mjs',
        content: AGENT_MJS,
        mime: 'text/javascript;charset=utf-8',
        title: 'agent.mjs (Agente Node.js)',
      };
    case 'sap_python_bot':
      return {
        fileName: 'sap_posting_bot.py',
        content: SAP_PYTHON_BOT,
        mime: 'text/x-python;charset=utf-8',
        title: 'sap_posting_bot.py (Bot SAP GUI FB60)',
      };
    case 'sap_odata_bot':
      return {
        fileName: 'sap_odata_poster.mjs',
        content: SAP_ODATA_BOT,
        mime: 'text/javascript;charset=utf-8',
        title: 'sap_odata_poster.mjs (SAP OData)',
      };
    case 'agent_readme':
      return {
        fileName: 'README_AGENT_PREMEX.md',
        content: AGENT_README,
        mime: 'text/markdown;charset=utf-8',
        title: 'README_AGENT_PREMEX.md',
      };
    case 'python_agent_py':
      return {
        fileName: 'clara_wm_agent.py',
        content: PYTHON_AGENT_PY,
        mime: 'text/x-python;charset=utf-8',
        title: 'clara_wm_agent.py (Puente HTTP Python + Playwright/Requests)',
      };
    case 'python_standalone_py':
      return {
        fileName: 'clara_wm_standalone.py',
        content: PYTHON_STANDALONE_PY,
        mime: 'text/x-python;charset=utf-8',
        title: 'clara_wm_standalone.py (Extractor CLI Python sin servidor)',
      };
    case 'python_requirements':
      return {
        fileName: 'requirements_clara_wm.txt',
        content: PYTHON_REQUIREMENTS,
        mime: 'text/plain;charset=utf-8',
        title: 'requirements_clara_wm.txt',
      };
    case 'python_env_example':
      return {
        fileName: '.env.python.example',
        content: PYTHON_ENV_EXAMPLE,
        mime: 'text/plain;charset=utf-8',
        title: '.env.python.example (Variables Python)',
      };
    case 'python_readme':
      return {
        fileName: 'README_PYTHON_RPA.md',
        content: PYTHON_README,
        mime: 'text/markdown;charset=utf-8',
        title: 'README_PYTHON_RPA.md (Guía paso a paso Python)',
      };
  }
}

export function downloadAgentTemplateFile(key: AgentDownloadKey) {
  const spec = getAgentTemplateSpec(key);
  triggerTextFileDownload(spec.fileName, spec.content, spec.mime);
}
