import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { processExtractInvoiceBody } from './api/viaticos/extract-invoice.ts';

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
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
    });
  });

  // Server-side Gemini multimodal invoice extraction for Viáticos
  app.post('/api/viaticos/extract-invoice', async (req, res) => {
    const result = await processExtractInvoiceBody(req.body ?? {});
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
