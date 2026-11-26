import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  processExtractInvoiceBody,
  resolveServerGeminiApiKey,
} from './api/viaticos/extract-invoice.ts';
import { processClaraExtractInvoiceBody } from './api/clara/extract-invoice.ts';
import { processProbeRequest } from './api/clara/probe.ts';
import {
  processOdooExpensesRequest,
  processOdooStatusRequest,
} from './api/odoo/expenses.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();

  // Support invoice images & PDFs encoded in base64 (up to 25MB)
  app.use(express.json({ limit: '25mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'premex-suite-server',
      geminiConfigured: Boolean(resolveServerGeminiApiKey()),
    });
  });

  // Server-side Gemini multimodal invoice extraction for Viáticos
  app.post('/api/viaticos/extract-invoice', async (req, res) => {
    const result = await processExtractInvoiceBody(req.body ?? {});
    res.status(result.status).json(result.body);
  });

  // Server-side Gemini multimodal invoice extraction for Clara -> WM -> SAP
  app.post('/api/clara/extract-invoice', async (req, res) => {
    const result = await processClaraExtractInvoiceBody(req.body ?? {});
    res.status(result.status).json(result.body);
  });

  // SSRF-safe connectivity diagnostic probe for Clara and Work Manager (:8037)
  app.post('/api/clara/probe', async (req, res) => {
    const result = await processProbeRequest(req.body?.target);
    res.status(result.status).json(result.body);
  });

  // Server-side Odoo Expenses (hr.expense) JSON-RPC connector & preflight validator
  app.get('/api/odoo/expenses', async (req, res) => {
    const probe = req.query?.probe === '1' || req.query?.probe === 'true';
    const result = await processOdooStatusRequest(probe);
    res.status(result.status).json(result.body);
  });

  app.post('/api/odoo/expenses', async (req, res) => {
    const result = await processOdooExpensesRequest(req.body ?? {});
    res.status(result.status).json(result.body);
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Premex Suite server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
