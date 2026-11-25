import {
  ensureDataUrlWithinLimit,
  prepareFileForExtraction,
  readFileAsDataUrl,
} from './viaticosInvoiceAi';

export interface ClaraExtractedInvoiceData {
  numeroFactura: string;
  serieDoc: string;
  cufe: string;
  fechaFactura: string;
  nitEmisor: string;
  razonSocialEmisor: string;
  moneda: string;
  subtotal: number;
  porcentajeImpuesto: number;
  impuesto: number;
  total: number;
  indicadorImpuestoSap: string;
  cuentaMayorSugerida: string;
  centroCostoSugerido: string;
  consultorTitular: string;
  descripcionSugerida: string;
  confianza: 'alta' | 'media' | 'baja';
  notasExtraccion: string;
  modelUsed?: string;
}

export interface ServerConnectivityProbeResult {
  target: 'clara' | 'workmanager';
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  latencyMs: number;
  diagnosis: string;
}

export interface LocalAgentHealthResponse {
  ok: boolean;
  agent: string;
  version: string;
  browserActive: boolean;
  claraUrl: string;
  workManagerUrl: string;
  timestamp: string;
}

export interface LocalAgentWmCheckItemResult {
  txId: string;
  numeroFactura: string;
  estado: 'radicada' | 'no_radicada' | 'inconsistencia' | 'pendiente';
  radicacionFecha?: string;
  mensaje: string;
}

function parseNum(val: unknown): number {
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export async function extractClaraInvoiceFile(params: {
  file: File;
  expectedCurrency?: string;
  expectedAmount?: number;
  expectedMerchant?: string;
}): Promise<ClaraExtractedInvoiceData> {
  const rawUrl = await readFileAsDataUrl(params.file);
  const prepared = await prepareFileForExtraction(params.file, rawUrl);
  const safeMedia = await ensureDataUrlWithinLimit(prepared.dataUrl, prepared.mimeType);

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 55_000) : null;

  try {
    const res = await fetch('/api/clara/extract-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller?.signal,
      body: JSON.stringify({
        base64Data: safeMedia.dataUrl,
        mimeType: safeMedia.mimeType,
        fileName: params.file.name,
        expectedCurrency: params.expectedCurrency,
        expectedAmount: params.expectedAmount,
        expectedMerchant: params.expectedMerchant,
      }),
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload?.error || `Error de extracción IA (HTTP ${res.status}).`);
    }

    const raw = payload?.extracted || {};
    const confRaw = String(raw.confianza || '').toLowerCase();
    const confianza: 'alta' | 'media' | 'baja' =
      confRaw === 'alta' || confRaw === 'baja' ? confRaw : 'media';

    const total = Math.max(0, parseNum(raw.total));
    const impuesto = Math.max(0, parseNum(raw.impuesto));
    const subtotalRaw = Math.max(0, parseNum(raw.subtotal));
    const subtotal = subtotalRaw > 0 ? subtotalRaw : Math.max(0, Math.round((total - impuesto) * 100) / 100);

    return {
      numeroFactura: String(raw.numeroFactura || '').trim(),
      serieDoc: String(raw.serieDoc || '').trim(),
      cufe: String(raw.cufe || '').trim(),
      fechaFactura: String(raw.fechaFactura || '').trim(),
      nitEmisor: String(raw.nitEmisor || '').trim(),
      razonSocialEmisor: String(raw.razonSocialEmisor || '').trim(),
      moneda: String(raw.moneda || 'COP').trim().toUpperCase(),
      subtotal,
      porcentajeImpuesto: Math.max(0, parseNum(raw.porcentajeImpuesto)),
      impuesto,
      total,
      indicadorImpuestoSap: String(raw.indicadorImpuestoSap || '').trim().toUpperCase(),
      cuentaMayorSugerida: String(raw.cuentaMayorSugerida || '').trim(),
      centroCostoSugerido: String(raw.centroCostoSugerido || '').trim(),
      consultorTitular: String(raw.consultorTitular || '').trim(),
      descripcionSugerida: String(raw.descripcionSugerida || '').trim(),
      confianza,
      notasExtraccion: String(raw.notasExtraccion || '').trim(),
      modelUsed: typeof payload?.modelUsed === 'string' ? payload.modelUsed : undefined,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function probeCorporatePortalsFromServer(
  target: 'all' | 'clara' | 'workmanager' = 'all'
): Promise<{ checkedAtIso: string; results: ServerConnectivityProbeResult[] }> {
  const res = await fetch('/api/clara/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Error probando conectividad (HTTP ${res.status}).`);
  }
  return {
    checkedAtIso: String(payload.checkedAtIso || new Date().toISOString()),
    results: Array.isArray(payload.results) ? payload.results : [],
  };
}

function normalizeAgentUrl(rawUrl: string): string {
  const clean = String(rawUrl || 'http://127.0.0.1:4780').trim().replace(/\/+$/, '');
  return clean || 'http://127.0.0.1:4780';
}

export async function pingLocalAgent(
  agentUrl: string,
  bearerToken: string
): Promise<LocalAgentHealthResponse> {
  if (!bearerToken.trim()) {
    throw new Error('Ingresa el Token del Agente Puente (.env AGENT_TOKEN) antes de conectar.');
  }
  const base = normalizeAgentUrl(agentUrl);
  const res = await fetch(`${base}/health`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${bearerToken.trim()}`,
    },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `El agente local respondió HTTP ${res.status}.`);
  }
  return payload as LocalAgentHealthResponse;
}

export async function openLocalAgentSession(
  agentUrl: string,
  bearerToken: string,
  target: 'clara' | 'workmanager'
): Promise<{ ok: boolean; openedUrl: string; message: string }> {
  const base = normalizeAgentUrl(agentUrl);
  const res = await fetch(`${base}/session/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken.trim()}`,
    },
    body: JSON.stringify({ target }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `No se pudo abrir sesión ${target} (HTTP ${res.status}).`);
  }
  return payload;
}

export async function runLocalAgentClaraExtract(
  agentUrl: string,
  bearerToken: string,
  period?: string
): Promise<{
  ok: boolean;
  extractedAtIso: string;
  rawTableRowsCount: number;
  rows: string[][];
}> {
  const base = normalizeAgentUrl(agentUrl);
  const res = await fetch(`${base}/clara/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken.trim()}`,
    },
    body: JSON.stringify({ period }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Error extrayendo desde Clara (HTTP ${res.status}).`);
  }
  return payload;
}

export async function runLocalAgentWmCheck(
  agentUrl: string,
  bearerToken: string,
  invoices: Array<{
    txId: string;
    numeroFactura: string;
    nitEmisor?: string;
    total?: number;
    fecha?: string;
  }>
): Promise<{ ok: boolean; checkedAtIso: string; results: LocalAgentWmCheckItemResult[] }> {
  const base = normalizeAgentUrl(agentUrl);
  const res = await fetch(`${base}/wm/check-radicacion`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken.trim()}`,
    },
    body: JSON.stringify({ invoices }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Error verificando Work Manager (HTTP ${res.status}).`);
  }
  return payload;
}

export async function dispatchSapPackageToLocalAgent(
  agentUrl: string,
  bearerToken: string,
  packageData: unknown
): Promise<{ ok: boolean; savedFile: string; fullPath: string; itemsCount: number; message?: string }> {
  const base = normalizeAgentUrl(agentUrl);
  const res = await fetch(`${base}/sap/dispatch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${bearerToken.trim()}`,
    },
    body: JSON.stringify({ packageData }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Error enviando paquete SAP al Agente (HTTP ${res.status}).`);
  }
  return payload;
}
