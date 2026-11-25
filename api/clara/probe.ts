import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Strict SSRF-safe allowlist: ONLY the two corporate target portals
 * may be probed from the server to diagnose network reachability / port :8037 access.
 */
const ALLOWED_PROBE_TARGETS: Record<string, string> = {
  clara: 'https://colombia.clara.com/auth/login',
  workmanager: 'https://pan.iluma.bio:8037/Account/Login',
};

export interface ProbeTargetResult {
  target: 'clara' | 'workmanager';
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  latencyMs: number;
  diagnosis: string;
}

async function probeSingleTarget(
  target: 'clara' | 'workmanager',
  url: string
): Promise<ProbeTargetResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Premex-Suite-Connectivity-Check/1.0',
      },
    });
    const latencyMs = Date.now() - startedAt;
    const status = response.status;
    const reachable = status >= 200 && status < 500;

    return {
      target,
      url,
      reachable,
      httpStatus: status,
      latencyMs,
      diagnosis:
        target === 'clara'
          ? `Portal Clara accesible desde la nube (HTTP ${status}, ${latencyMs} ms). La autenticación requiere sesión interactiva/2FA o token vía Agente Local.`
          : `Work Manager (:8037) respondió desde la nube (HTTP ${status}, ${latencyMs} ms). Puedes consultar radicación mediante Agente Local Playwright o reporte WM.`,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startedAt;
    const msg = String(err?.cause?.code || err?.name || err?.message || 'ERROR');
    const isPrivateOrTimeout =
      msg.includes('AbortError') ||
      msg.includes('ETIMEDOUT') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('DEPTH_ZERO_SELF_SIGNED_CERT') ||
      msg.includes('SELF_SIGNED');

    return {
      target,
      url,
      reachable: false,
      httpStatus: null,
      latencyMs,
      diagnosis:
        target === 'workmanager'
          ? `Work Manager (:8037) no responde directamente desde la nube (${msg}). Esto ocurre cuando :8037 está detrás de VPN/red interna o firewall corporativo: utiliza el Agente Puente Local en un equipo con acceso a la red Premex.`
          : isPrivateOrTimeout
          ? `No se pudo completar la prueba directa a Clara (${msg}). Usa el Agente Puente Local o la carga asistida.`
          : `Error de red al probar ${target}: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function processProbeRequest(rawTarget?: unknown): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const targetStr = String(rawTarget || 'all').trim().toLowerCase();
  if (!['all', 'clara', 'workmanager'].includes(targetStr)) {
    return {
      status: 400,
      body: {
        error: 'Destino de prueba no permitido. Valores válidos: clara, workmanager, all.',
      },
    };
  }

  const targetsToRun: ('clara' | 'workmanager')[] =
    targetStr === 'all'
      ? ['clara', 'workmanager']
      : [targetStr as 'clara' | 'workmanager'];

  const results = await Promise.all(
    targetsToRun.map((t) => probeSingleTarget(t, ALLOWED_PROBE_TARGETS[t]))
  );

  return {
    status: 200,
    body: {
      checkedAtIso: new Date().toISOString(),
      results,
    },
  };
}

type VercelLikeReq = IncomingMessage & { body?: unknown };
type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (data: unknown) => void;
};

async function readJsonBody(req: VercelLikeReq): Promise<{ target?: unknown }> {
  if (req.body && typeof req.body === 'object') return req.body as { target?: unknown };
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as { target?: unknown };
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as { target?: unknown }) : {};
}

function sendJson(res: VercelLikeRes, status: number, payload: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function') {
    const sRes = res.status(status);
    if (typeof sRes.json === 'function') {
      sRes.json(payload);
      return;
    }
  }
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

export default async function handler(req: VercelLikeReq, res: VercelLikeRes) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    sendJson(res, 405, { error: 'Método no permitido.' });
    return;
  }
  try {
    const body = req.method === 'POST' ? await readJsonBody(req) : {};
    const result = await processProbeRequest(body?.target);
    sendJson(res, result.status, result.body);
  } catch {
    sendJson(res, 400, { error: 'Solicitud inválida.' });
  }
}
