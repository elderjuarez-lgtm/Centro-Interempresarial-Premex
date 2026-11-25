import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { resolveServerGeminiApiKey } from '../viaticos/extract-invoice.ts';

const ALLOWED_INVOICE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'image/bmp',
  'image/avif',
  'application/pdf',
]);

const modelCooldownUntil = new Map<string, number>();

export interface ClaraExtractInvoiceBody {
  base64Data?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  expectedCurrency?: unknown;
  expectedAmount?: unknown;
  expectedMerchant?: unknown;
}

export interface ClaraExtractInvoiceResult {
  status: number;
  body: Record<string, unknown>;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = resolveServerGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferMimeType(rawMime: unknown, base64Data: string, fileName: unknown): string {
  const explicit = String(rawMime || '').trim().toLowerCase();
  if (explicit && explicit !== 'application/octet-stream') {
    return explicit === 'image/jpg' ? 'image/jpeg' : explicit;
  }
  const dataUriMatch = base64Data.match(/^data:([^;]+);base64,/i);
  if (dataUriMatch?.[1]) {
    const fromUri = dataUriMatch[1].trim().toLowerCase();
    if (fromUri && fromUri !== 'application/octet-stream') {
      return fromUri === 'image/jpg' ? 'image/jpeg' : fromUri;
    }
  }
  const lowerName = String(fileName || '').toLowerCase();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.webp')) return 'image/webp';
  if (lowerName.endsWith('.heic')) return 'image/heic';
  if (lowerName.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function normalizeIsoDate(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const [, dd, mm, y] = dmyMatch;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymdMatch) {
    const [, yyyy, mm, dd] = ymdMatch;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return s;
}

function parseModelJsonObject(rawText: string): Record<string, unknown> {
  let clean = rawText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  const parsed = JSON.parse(clean);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INVALID_JSON_RESPONSE: Expected JSON object');
  }
  return parsed as Record<string, unknown>;
}

function extractUpstreamErrorMeta(err: unknown): {
  code: number | null;
  statusText: string;
  rawMessage: string;
} {
  const rawMessage =
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err || '');
  const numericStatus =
    typeof (err as any)?.status === 'number'
      ? (err as any).status
      : typeof (err as any)?.code === 'number'
      ? (err as any).code
      : null;

  let code: number | null = numericStatus;
  let statusText = String((err as any)?.statusText || '');

  if (rawMessage.includes('{')) {
    try {
      const start = rawMessage.indexOf('{');
      const parsed = JSON.parse(rawMessage.slice(start));
      if (typeof parsed?.error?.code === 'number') code = parsed.error.code;
      if (typeof parsed?.error?.status === 'string') statusText = parsed.error.status;
    } catch {
      // ignore
    }
  }

  const upper = `${rawMessage} ${statusText}`.toUpperCase();
  if (!code) {
    if (upper.includes('503') || upper.includes('UNAVAILABLE')) code = 503;
    else if (upper.includes('429') || upper.includes('RESOURCE_EXHAUSTED')) code = 429;
    else if (upper.includes('403') || upper.includes('PERMISSION_DENIED')) code = 403;
    else if (upper.includes('404') || upper.includes('NOT_FOUND')) code = 404;
  }

  return { code, statusText: upper, rawMessage };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`DEADLINE_EXCEEDED: ${label} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function buildClaraInvoiceSystemInstruction(): string {
  return `Eres un auditor contable y especialista RPA de Premex encargado de leer facturas electrónicas y comprobantes adjuntos en Clara (Colombia, Guatemala, Centroamérica, EE.UU. y servicios cloud) para su validación contra Work Manager y posterior contabilización en SAP.

REGLAS CRÍTICAS DE EXTRACCIÓN:
1. Emisor vs Receptor:
   - Extrae ÚNICAMENTE el proveedor EMISOR (razonSocialEmisor y nitEmisor).
   - NUNCA devuelvas el NIT ni la razón social de Premex, Premezclas, Adiquim, Nutreo, Anitox ni del consultor/tarjetahabiente como emisor.
   - Tampoco devuelvas el NIT del certificador electrónico o proveedor tecnológico.
2. Número de factura y serie:
   - numeroFactura: incluye el prefijo/serie + consecutivo oficial de la factura tal como se busca en Work Manager (ej. "FEAV-984512", "SETT-10421", "CWF-441092", "F001-0004521"). Si viene separado en serie y número, únelos limpiamente (y devuelve también serieDoc por separado).
   - cufe: si es Factura Electrónica DIAN Colombia o DTE con CUFE/CUDE/UUID visible, extráelo o devuelve "".
3. Fecha de emisión:
   - fechaFactura: estrictamente en formato ISO YYYY-MM-DD (ej. "2026-11-18"). Nunca fecha de vencimiento.
4. Valores numéricos exactos (en la moneda original del documento):
   - moneda: código ISO de 3 letras ("COP", "USD", "GTQ", "MXN", "HNL", "EUR", "CRC").
   - subtotal: base gravable / subtotal antes de impuestos (si no aparece desglosado, calcúlalo como total - impuesto).
   - impuesto: monto total de impuestos (IVA, Impoconsumo, ISV, VAT, Sales Tax). Si está exento o no aplica, devuelve 0.
   - porcentajeImpuesto: porcentaje numérico predominante (ej. 19, 8, 5, 12, 0).
   - total: valor TOTAL FINAL pagado (sin descuentos posteriores ni cambio).
5. Clasificación contable SAP sugerida:
   - indicadorImpuestoSap: sugiere el código SAP más probable: "V19" (IVA 19% Colombia), "V5" (IVA 5% tiquetes/bienes), "IC8" (Impoconsumo 8% restaurantes), "V12" (IVA 12% Guatemala), "V0" (Exento local 0%), "S0" (Exterior / servicio digital sin IVA local).
   - cuentaMayorSugerida: sugiere una cuenta PUC/SAP de gasto corporativo si es clara (ej. "5155150001" viajes/tiquetes, "5195600003" alimentación/casino, "5135700002" software/cloud, "5195250001" suministros/papelería, "5145250001" mantenimiento) o "".
   - descripcionSugerida: resumen breve y profesional en español del gasto para texto de posición SAP (máx. 80 caracteres).
   - centroCostoSugerido y consultorTitular: solo si aparecen impresos en el documento o nota; de lo contrario "".
   - confianza: "alta", "media" o "baja".
   - notasExtraccion: explicación breve (máx. 140 caracteres) sobre régimen, impuestos o particularidades.`;
}

const CLARA_INVOICE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    numeroFactura: { type: Type.STRING, description: 'Prefijo y número oficial completo de factura.' },
    serieDoc: { type: Type.STRING, description: 'Serie o prefijo si aplica.' },
    cufe: { type: Type.STRING, description: 'CUFE / CUDE / UUID electrónico si es visible.' },
    fechaFactura: { type: Type.STRING, description: 'Fecha de emisión en formato YYYY-MM-DD.' },
    nitEmisor: { type: Type.STRING, description: 'NIT / Tax ID del proveedor emisor únicamente.' },
    razonSocialEmisor: { type: Type.STRING, description: 'Razón social o nombre comercial del emisor.' },
    moneda: { type: Type.STRING, description: 'Código ISO moneda: COP, USD, GTQ, MXN, EUR, etc.' },
    subtotal: { type: Type.NUMBER, description: 'Subtotal base antes de impuestos.' },
    porcentajeImpuesto: { type: Type.NUMBER, description: 'Porcentaje de impuesto (19, 8, 5, 12, 0).' },
    impuesto: { type: Type.NUMBER, description: 'Valor monetario total del impuesto.' },
    total: { type: Type.NUMBER, description: 'Monto total final de la factura.' },
    indicadorImpuestoSap: { type: Type.STRING, description: 'Indicador SAP sugerido: V19, V5, IC8, V12, V0 o S0.' },
    cuentaMayorSugerida: { type: Type.STRING, description: 'Cuenta mayor SAP sugerida o cadena vacía.' },
    centroCostoSugerido: { type: Type.STRING, description: 'Centro de costo si aparece en el documento o vacío.' },
    consultorTitular: { type: Type.STRING, description: 'Titular o huésped/pasajero si aparece o vacío.' },
    descripcionSugerida: { type: Type.STRING, description: 'Descripción corta del gasto en español.' },
    confianza: { type: Type.STRING, description: 'alta, media o baja.' },
    notasExtraccion: { type: Type.STRING, description: 'Nota breve sobre impuestos, CUFE o legibilidad.' },
  },
  required: [
    'numeroFactura',
    'serieDoc',
    'cufe',
    'fechaFactura',
    'nitEmisor',
    'razonSocialEmisor',
    'moneda',
    'subtotal',
    'porcentajeImpuesto',
    'impuesto',
    'total',
    'indicadorImpuestoSap',
    'cuentaMayorSugerida',
    'centroCostoSugerido',
    'consultorTitular',
    'descripcionSugerida',
    'confianza',
    'notasExtraccion',
  ],
};

export async function processClaraExtractInvoiceBody(
  body: ClaraExtractInvoiceBody
): Promise<ClaraExtractInvoiceResult> {
  try {
    const { base64Data, mimeType, fileName, expectedCurrency, expectedAmount, expectedMerchant } =
      body ?? {};

    if (typeof base64Data !== 'string' || !base64Data.trim()) {
      return {
        status: 400,
        body: { error: 'No se recibió el contenido de la factura para lectura IA.' },
      };
    }

    const cleanMime = inferMimeType(mimeType, base64Data, fileName);
    if (!ALLOWED_INVOICE_MIMES.has(cleanMime)) {
      return {
        status: 400,
        body: { error: `Formato no compatible (${cleanMime}). Usa JPG, PNG, WebP o PDF.` },
      };
    }

    const ai = getGeminiClient();
    if (!ai) {
      return {
        status: 503,
        body: {
          error:
            'Falta configurar GEMINI_API_KEY en el servidor (Settings > Secrets o Vercel Environment Variables) para ejecutar la lectura inteligente de facturas.',
        },
      };
    }

    const pureBase64 = base64Data.includes(',')
      ? base64Data.split(',')[1].trim()
      : base64Data.trim();

    if (!pureBase64) {
      return { status: 400, body: { error: 'El archivo adjunto llegó vacío.' } };
    }

    const contextHint = [
      expectedMerchant ? `Comercio reportado en Clara: "${String(expectedMerchant).slice(0, 120)}".` : '',
      expectedAmount ? `Monto cobrado en tarjeta Clara: ${Number(expectedAmount) || 0} ${String(expectedCurrency || '')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    const candidateModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite'];
    const now = Date.now();
    const orderedModels = [
      ...candidateModels.filter((m) => (modelCooldownUntil.get(m) || 0) <= now),
      ...candidateModels.filter((m) => (modelCooldownUntil.get(m) || 0) > now),
    ];

    let lastError: unknown = null;
    for (let i = 0; i < orderedModels.length; i++) {
      const model = orderedModels[i];
      if (i > 0) await sleep(200);

      try {
        const config: Record<string, unknown> = {
          systemInstruction: buildClaraInvoiceSystemInstruction(),
          responseMimeType: 'application/json',
          responseSchema: CLARA_INVOICE_SCHEMA,
        };
        if (model === 'gemini-4-hydrogen') {
          config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
        }

        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime,
                    data: pureBase64,
                  },
                },
                {
                  text: `Extrae de forma estructurada los datos fiscales y contables de esta factura (${String(
                    fileName || 'factura'
                  )}) para cruce con Work Manager y contabilización SAP. ${contextHint}`,
                },
              ],
            },
            config,
          }),
          24_000,
          model
        );

        const rawText = (response.text ?? '').trim();
        if (!rawText) throw new Error('EMPTY_MODEL_RESPONSE');

        const parsed = parseModelJsonObject(rawText);
        modelCooldownUntil.delete(model);

        return {
          status: 200,
          body: {
            extracted: {
              ...parsed,
              fechaFactura: normalizeIsoDate(parsed.fechaFactura),
            },
            modelUsed: model,
          },
        };
      } catch (err) {
        lastError = err;
        const { code, statusText } = extractUpstreamErrorMeta(err);
        if (code === 429 || statusText.includes('RESOURCE_EXHAUSTED')) {
          modelCooldownUntil.set(model, Date.now() + 90_000);
        } else if (code === 503 || statusText.includes('UNAVAILABLE')) {
          modelCooldownUntil.set(model, Date.now() + 45_000);
        }
      }
    }

    throw lastError || new Error('No se pudo extraer la factura.');
  } catch (err: any) {
    const { code, statusText } = extractUpstreamErrorMeta(err);
    if (code === 403 || statusText.includes('API_KEY_INVALID')) {
      return {
        status: 403,
        body: { error: 'Clave Gemini API inválida o sin permisos en Settings > Secrets.' },
      };
    }
    if (code === 429 || statusText.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        body: { error: 'Límite temporal de lectura IA alcanzado. Reintenta en unos segundos.' },
      };
    }
    return {
      status: 500,
      body: {
        error: 'No se pudo completar la lectura automática de la factura. Puedes reintentar o digitar los datos.',
      },
    };
  }
}

type VercelLikeReq = IncomingMessage & { body?: unknown };
type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (data: unknown) => void;
};

async function readJsonBody(req: VercelLikeReq): Promise<ClaraExtractInvoiceBody> {
  if (req.body && typeof req.body === 'object') return req.body as ClaraExtractInvoiceBody;
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as ClaraExtractInvoiceBody;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  return raw ? (JSON.parse(raw) as ClaraExtractInvoiceBody) : {};
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
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Método no permitido. Usa POST.' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const result = await processClaraExtractInvoiceBody(body);
    sendJson(res, result.status, result.body);
  } catch {
    sendJson(res, 400, { error: 'JSON inválido en la solicitud.' });
  }
}
