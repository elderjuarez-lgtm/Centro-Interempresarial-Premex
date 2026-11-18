import type { IncomingMessage, ServerResponse } from 'http';

type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (data: unknown) => void;
};

export default function handler(_req: IncomingMessage, res: VercelLikeRes) {
  const hasGeminiKey = Boolean(
    process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      process.env.API_KEY?.trim() ||
      process.env.VITE_GEMINI_API_KEY?.trim()
  );
  const payload = {
    ok: true,
    service: 'premex-suite-api',
    geminiConfigured: hasGeminiKey,
  };
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function') {
    const statusRes = res.status(200);
    if (typeof statusRes.json === 'function') {
      statusRes.json(payload);
      return;
    }
  }
  res.statusCode = 200;
  res.end(JSON.stringify(payload));
}
