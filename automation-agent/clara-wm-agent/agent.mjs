/**
 * Premex RPA Bridge Agent (Localhost 127.0.0.1:4780)
 * --------------------------------------------------
 * Ejecuta automatización controlada en navegador Playwright desde la PC/servidor
 * corporativo del usuario (con acceso a VPN/intranet para pan.iluma.bio:8037)
 * y expone endpoints locales autenticados por Bearer Token para la app web Premex.
 *
 * Ventajas clave:
 * 1. Usa perfil persistente Chromium (userDataDir) para que inicies sesión manual
 *    una sola vez con 2FA / Captcha en Clara y Work Manager sin guardar contraseñas
 *    en la nube.
 * 2. Evita limitaciones de Vercel Serverless (no Chromium, timeouts 60s, puertos :8037).
 * 3. Escribe el paquete JSON estructurado en disco para el bot independiente de SAP.
 */

import 'dotenv/config';
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
  console.error(
    '[ERROR] Configura AGENT_TOKEN en .env (mínimo 16 caracteres) antes de iniciar el Agente.'
  );
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
      callback(new Error(`Origen CORS no autorizado: ${origin}`));
    },
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);

function constantTimeTokenMatch(provided, expected) {
  const a = Buffer.from(String(provided || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
  sharedContext.on('close', () => {
    sharedContext = null;
  });
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

/**
 * Abre una pestaña visible en el navegador Playwright persistente para que el
 * usuario inicie sesión interactivamente (incluyendo 2FA/Captcha) en Clara o WM.
 */
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
      message:
        target === 'workmanager'
          ? 'Pestaña de Work Manager abierta. Inicia sesión y deja la pestaña abierta.'
          : 'Pestaña de Clara abierta. Inicia sesión (incluyendo 2FA) y deja la sesión activa.',
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'No se pudo abrir la sesión del navegador.' });
  }
});

/**
 * Extrae movimientos visibles en Clara usando la sesión activa del navegador.
 * Nota: Ajusta los selectores de tabla / endpoint interno según la vista de Clara vigente.
 */
app.post('/clara/extract', requireBearerAuth, async (req, res) => {
  try {
    const context = await getBrowserContext();
    const pages = context.pages();
    let claraPage = pages.find((p) => p.url().includes('clara.com'));
    if (!claraPage) {
      claraPage = await context.newPage();
      await claraPage.goto(CLARA_URL.replace('/auth/login', '/'), {
        waitUntil: 'domcontentloaded',
        timeout: 45_000,
      });
    }

    const currentUrl = claraPage.url();
    if (currentUrl.includes('/auth/login')) {
      res.status(409).json({
        error:
          'La sesión de Clara aún está en Login. Completa el ingreso (y 2FA) en la ventana Chromium del Agente y vuelve a intentar.',
      });
      return;
    }

    // Lectura genérica de filas de tabla DOM (adaptable a XHR/GraphQL de Clara)
    const periodFilter = String(req.body?.period || '').trim();
    const rows = await claraPage.evaluate(() => {
      const trs = Array.from(document.querySelectorAll('table tbody tr'));
      return trs
        .map((tr) =>
          Array.from(tr.querySelectorAll('td')).map((td) =>
            (td.textContent || '').replace(/\s+/g, ' ').trim()
          )
        )
        .filter((cells) => cells.length >= 3);
    });

    res.json({
      ok: true,
      extractedAtIso: new Date().toISOString(),
      sourceUrl: currentUrl,
      periodFilter,
      rawTableRowsCount: rows.length,
      rows,
      note: 'Si descargaste el Excel/CSV oficial desde Clara o interceptaste el JSON XHR, puedes cargarlo en la app web o adaptar el mapeo aquí.',
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Error al extraer movimientos desde Clara.' });
  }
});

/**
 * Consulta en Work Manager (:8037) el estado de radicación para un lote de facturas.
 * Recibe: { invoices: [{ txId, numeroFactura, nitEmisor, total, fecha }] }
 */
app.post('/wm/check-radicacion', requireBearerAuth, async (req, res) => {
  try {
    const invoices = Array.isArray(req.body?.invoices) ? req.body.invoices : [];
    if (invoices.length === 0) {
      res.status(400).json({ error: 'Debes enviar al menos una factura para consultar en Work Manager.' });
      return;
    }

    const context = await getBrowserContext();
    let wmPage = context.pages().find((p) => p.url().includes('pan.iluma.bio'));
    if (!wmPage) {
      wmPage = await context.newPage();
      await wmPage.goto(WM_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    }

    if (wmPage.url().toLowerCase().includes('/account/login')) {
      res.status(409).json({
        error:
          'Work Manager está en la pantalla de Login. Inicia sesión en la ventana de Chromium del Agente y vuelve a ejecutar la verificación.',
      });
      return;
    }

    // Plantilla de consulta por cada factura en el buscador de Work Manager:
    // Ajusta los selectores (`input[type="search"]`, columna estado, etc.) según el HTML de tu versión de WM.
    const results = [];
    for (const item of invoices.slice(0, 100)) {
      const numeroFactura = String(item?.numeroFactura || '').trim();
      if (!numeroFactura) {
        results.push({
          txId: item?.txId,
          numeroFactura: '',
          estado: 'pendiente',
          mensaje: 'Sin número de factura extraído para buscar en Work Manager.',
        });
        continue;
      }

      const searchInput = wmPage
        .locator('input[type="search"], input[name*="Factura" i], input[placeholder*="Buscar" i]')
        .first();

      const hasSearch = (await searchInput.count()) > 0;
      if (!hasSearch) {
        results.push({
          txId: item?.txId,
          numeroFactura,
          estado: 'pendiente',
          mensaje:
            'Navega a la bandeja de Recepción / Consulta de Facturas dentro de Work Manager y ajusta el selector de búsqueda en agent.mjs.',
        });
        continue;
      }

      await searchInput.fill('');
      await searchInput.fill(numeroFactura);
      await searchInput.press('Enter').catch(() => {});
      await wmPage.waitForTimeout(900);

      const pageText = await wmPage.locator('table tbody').innerText().catch(() => '');
      const found = pageText.toUpperCase().includes(numeroFactura.toUpperCase());
      const upperText = pageText.toUpperCase();
      const isRejected =
        upperText.includes('RECHAZ') ||
        upperText.includes('RECLAMO') ||
        upperText.includes('ANULAD');

      results.push({
        txId: item?.txId,
        numeroFactura,
        estado: found ? (isRejected ? 'inconsistencia' : 'radicada') : 'no_radicada',
        radicacionFecha: found ? new Date().toISOString().slice(0, 10) : undefined,
        mensaje: found
          ? isRejected
            ? 'Factura localizada en Work Manager con marca de reclamo o rechazo.'
            : 'Factura confirmada como radicada en Work Manager.'
          : 'No se encontró registro de radicación en la consulta de Work Manager.',
      });
    }

    res.json({
      ok: true,
      checkedAtIso: new Date().toISOString(),
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'Error consultando Work Manager.' });
  }
});

/**
 * Recibe el paquete estructurado SAP generado desde Premex Suite y lo guarda en
 * disco para ser consumido por el Bot independiente de SAP (Python GUI o OData).
 */
app.post('/sap/dispatch', requireBearerAuth, async (req, res) => {
  try {
    const pkg = req.body?.packageData;
    if (!pkg || !Array.isArray(pkg.items) || pkg.items.length === 0) {
      res.status(400).json({ error: 'Paquete SAP vacío o inválido.' });
      return;
    }

    await fs.mkdir(SAP_DISPATCH_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `paquete_sap_bot_${stamp}.json`;
    const fullPath = path.join(SAP_DISPATCH_DIR, fileName);
    await fs.writeFile(fullPath, JSON.stringify(pkg, null, 2), 'utf8');

    res.json({
      ok: true,
      savedFile: fileName,
      fullPath,
      itemsCount: pkg.items.length,
      message:
        'Paquete SAP depositado en la cola local del bot. Ejecuta sap_posting_bot.py o sap_odata_poster.mjs.',
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || 'No se pudo guardar el paquete SAP en disco.' });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Premex RPA Agent] Escuchando en http://127.0.0.1:${PORT}`);
  console.log(`[Premex RPA Agent] Orígenes CORS permitidos: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`[Premex RPA Agent] Cola de despacho SAP: ${SAP_DISPATCH_DIR}`);
});
