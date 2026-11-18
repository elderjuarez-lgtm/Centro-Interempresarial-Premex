import type { IncomingMessage, ServerResponse } from 'http';

type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (data: unknown) => void;
};

export default function handler(_req: IncomingMessage, res: VercelLikeRes) {
  const payload = {
    ok: true,
    service: 'premex-suite-api',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
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
