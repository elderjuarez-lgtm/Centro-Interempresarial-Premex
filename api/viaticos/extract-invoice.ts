import type { IncomingMessage, ServerResponse } from 'http';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

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

// Short circuit-breaker window when primary model experiences a temporary 503 demand spike
let primaryModelCooldownUntil = 0;

export interface ExtractInvoiceRequestBody {
  base64Data?: unknown;
  mimeType?: unknown;
  fileName?: unknown;
  baseCurrency?: unknown;
}

export interface ExtractInvoiceResult {
  status: number;
  body: Record<string, unknown>;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
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
      // ignore non-JSON message
    }
  }

  const upper = `${rawMessage} ${statusText}`.toUpperCase();
  if (!code) {
    if (upper.includes('503') || upper.includes('UNAVAILABLE')) code = 503;
    else if (upper.includes('429') || upper.includes('RESOURCE_EXHAUSTED')) code = 429;
    else if (upper.includes('403') || upper.includes('PERMISSION_DENIED')) code = 403;
    else if (upper.includes('404') || upper.includes('NOT_FOUND')) code = 404;
    else if (upper.includes('500') || upper.includes('INTERNAL')) code = 500;
  }

  return { code, statusText: upper, rawMessage };
}

function isFailoverEligibleError(err: unknown): boolean {
  const { code, statusText, rawMessage } = extractUpstreamErrorMeta(err);
  const combined = `${statusText} ${rawMessage}`.toUpperCase();
  return (
    code === 503 ||
    code === 500 ||
    code === 429 ||
    code === 504 ||
    code === 404 ||
    combined.includes('NOT_FOUND') ||
    combined.includes('UNAVAILABLE') ||
    combined.includes('HIGH DEMAND') ||
    combined.includes('OVERLOADED') ||
    combined.includes('RESOURCE_EXHAUSTED') ||
    combined.includes('DEADLINE_EXCEEDED') ||
    combined.includes('FETCH FAILED') ||
    combined.includes('ECONNRESET') ||
    combined.includes('ETIMEDOUT') ||
    combined.includes('EMPTY_MODEL_RESPONSE')
  );
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
  return JSON.parse(clean) as Record<string, unknown>;
}

function normalizeDateField(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const [, dd, mm, y] = dmyMatch;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }
  return s;
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
  if (lowerName.endsWith('.gif')) return 'image/gif';
  if (lowerName.endsWith('.bmp')) return 'image/bmp';
  if (lowerName.endsWith('.avif')) return 'image/avif';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';

  return 'image/jpeg';
}

function buildInvoiceSystemInstruction(targetBaseCurrency: string): string {
  return `Eres un auditor contable senior especializado en lectura y extracción de datos de facturas, recibos, tickets térmicos y comprobantes electrónicos de viaje de cualquier país y formato (todas las facturas son diferentes en diseño, idioma, orientación y estructura).

Tu trabajo es analizar cuidadosamente la imagen o PDF adjunto — INCLUSO SI LA FOTO FUE TOMADA CON CELULAR Y VIENE ROTADA 90°, 180° O 270°, INCLINADA O EN PAPEL TÉRMICO DE BAJO CONTRASTE — y extraer los campos solicitados con máxima precisión. Soporta tickets de restaurante/gasolinera, facturas electrónicas FEL Guatemala, SAR Honduras, DIAN Colombia, CFDI México, Hacienda Costa Rica, recibos digitales de Uber, DiDi, Airbnb, Booking, hoteles, peajes y aerolíneas.

INSTRUCCIONES CRÍTICAS POR CAMPO:
1. fechaDoc: Fecha de EMISIÓN o TRANSACCIÓN del documento convertida estrictamente al formato DD/MM/YYYY (ej. "09/11/2026"). Nunca uses la fecha de vencimiento ni fecha de resolución si existe fecha de emisión/certificación/caja. Si no aparece fecha legible, devuelve "".
2. serieDoc: Serie o prefijo fiscal del documento SOLO si aplica y aparece impreso.
   - En FEL Guatemala suele aparecer como "SERIE:" (código hexadecimal de 8 caracteres como "6B3BA528", "FD0887E5", "65387fe9", "946c5118") o prefijo alfanumérico.
   - En DIAN Colombia / CFDI México puede ser el prefijo o serie (ej. "SETT", "FE", "A").
   - Si el documento NO tiene serie (ej. recibos de Uber, Airbnb, hoteles internacionales, tickets sin serie), devuelve "".
3. noDoc: Número de factura, Número de DTE, correlativo, folio o código de confirmación/reserva (ej. "3564651523", "4261236653", "RC4AM3PJBD"). No repitas la serie dentro de noDoc si ya la separaste en serieDoc.
4. nit: NIT, RTN, RUC, RFC o Tax ID del EMISOR / PROVEEDOR únicamente.
   - REGLA CRÍTICA DE EMISOR VS RECEPTOR (especialmente en tickets térmicos FEL Guatemala):
     * El EMISOR (quien vende el producto/servicio) y su NIT aparecen en el ENCABEZADO SUPERIOR del ticket, ANTES de las palabras "DOCUMENTO TRIBUTARIO ELECTRONICO" / "FACTURA".
     * Debajo de "SERIE:" y "NUMERO:" casi siempre aparecen el "NIT:" y "NOMBRE:" del COMPRADOR / RECEPTOR (por ejemplo: "PREMEZCLAS LATINOAMERICANAS, SOCIEDAD ANONIMA", "PREMEX", "ANITOX", "CONSUMIDOR FINAL", "CF" o el nombre del consultor).
     * NUNCA devuelvas el NIT ni el nombre de Premex / Premezclas Latinoamericanas / Anitox / Consumidor Final / CF ni el NIT del Certificador (ej. INFILE, DIGIFACT, MEGAPRINT). Devuelve ÚNICAMENTE el NIT del EMISOR que vende el bien o servicio.
   - Limpia espacios sobrantes. Si es un recibo extranjero sin NIT/ID fiscal visible (ej. Uber, Airbnb), devuelve "".
5. proveedor: Nombre comercial o razón social clara del EMISOR de la factura (ubicado en el encabezado superior del comprobante, ej. "FRANQUICIA DE SERVICIO Y CALIDAD, S.A.", "La paneria, s.a.", "Uno Guatemala, s. a", "Uber", "AIRBNB"). NUNCA pongas "PREMEZCLAS LATINOAMERICANAS", "PREMEX", "ANITOX" ni el nombre del comprador/cliente ni del certificador FEL.
6. moneda: Identifica la moneda original del documento usando símbolos, códigos ISO y país del emisor, y devuelve EXACTAMENTE una de estas etiquetas:
   - "Quetzales" (Q, GTQ, FEL Guatemala / SAT)
   - "Dólares" (USD, US$, $, recibos en EE.UU., Airbnb USD, aerolíneas en USD)
   - "Pesos Colombianos" (COP, DIAN Colombia, $ con valores en miles como 45.000)
   - "Lempiras" (L, Lps, HNL, SAR Honduras)
   - "Pesos Mexicanos" (MXN, CFDI México, SAT México)
   - "Euros" (EUR, €)
   - "Colones" (CRC, ₡, Hacienda Costa Rica)
   Si no hay indicio suficiente, sugiere "${targetBaseCurrency}".
7. valorFactura: Monto TOTAL FINAL pagado en la moneda original de la factura (número decimal positivo usando punto decimal, ej. 72.00 o 346.04).
   - Busca "TOTAL", "TOTAL A PAGAR", "GRAND TOTAL", "TOTAL PAGADO", "AMOUNT PAID".
   - No devuelvas un subtotal parcial, descuentos, ahorro ni el vuelto/cambio.
   - Interpreta correctamente separadores de miles y decimales (ej. "Q 1,250.50" -> 1250.50; "$ 45.000,00" -> 45000).
8. tipoCambioSugerido: Tipo de cambio hacia la moneda base "${targetBaseCurrency}".
   - Si la moneda de la factura es igual a "${targetBaseCurrency}", devuelve exactamente 1.
   - Si aparece un tipo de cambio impreso en la factura, úsalo.
   - Si es "Dólares" hacia "Quetzales", sugiere 7.80 (o el valor impreso). Si no conoces la tasa exacta, devuelve 1 y menciónalo en notasExtraccion.
9. aplicaImpuestos: booleano (true/false) indicando si la factura aplica impuestos fiscales recuperables/gravados:
   - true si muestra IVA, ISV, ITBMS, VAT, Sales Tax, Impoconsumo, o si es una Factura FEL Régimen General en Guatemala (que por ley incluye 12% IVA en el precio total aunque no venga en línea separada).
   - false si dice "Pequeño Contribuyente", "No genera derecho a crédito fiscal", "Exento", "No responsable de IVA", recibo simple sin valor fiscal, o plataforma extranjera sin desglose fiscal local (ej. Uber/Airbnb extranjero sin impuesto fiscal local).
10. porcentajeImpuesto: porcentaje numérico aplicable (ej. 12 para FEL Guatemala régimen general, 15 para Honduras ISV, 19 para Colombia IVA, 16 para México IVA, 13 para Costa Rica, o el % impreso en el documento). Devuelve 0 si aplicaImpuestos es false.
11. montoImpuesto: monto numérico de impuesto en la moneda de la factura.
   - Si la factura imprime explícitamente el valor del impuesto (IVA/ISV/VAT/Tax), extrae exactamente ese valor.
   - Si aplicaImpuestos es true y el impuesto está incluido en el total sin línea separada (típico en FEL Guatemala IVA 12%), calcula: round(valorFactura - (valorFactura / (1 + porcentajeImpuesto / 100)), 2). En combustible de Guatemala, si aparece IDP separado, calcula el IVA sobre (Total - IDP) si es visible.
   - Si aplicaImpuestos es false, devuelve 0.
12. categoriaSugerida: clasifica estrictamente en una de estas opciones:
   "Alimentación", "Combustible / Lub", "Taxis / Buses", "Hospedaje", "Peajes / Parqueo", "Boletos Aéreos", "Atención a Clientes", "Otros Gastos".
13. descripcionSugerida: resumen breve y útil en español basado en los ítems/conceptos leídos (ej. "Desayuno y café", "Combustible gasolina súper", "Viaje Uber", "Hospedaje 3 noches").
14. confianza: "alta" si todos los campos clave se leyeron claramente, "media" si algún campo tuvo ligera ambigüedad o falta dato menor, "baja" si la imagen es borrosa o incompleta.
15. notasExtraccion: frase breve y útil en español (máx. 140 caracteres) explicando el tipo de comprobante detectado (ej. "Factura FEL Guatemala régimen general con IVA 12% incluido").`;
}

const INVOICE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fechaDoc: {
      type: Type.STRING,
      description: 'Fecha de emisión de la factura en formato DD/MM/YYYY.',
    },
    serieDoc: {
      type: Type.STRING,
      description: 'Serie o prefijo fiscal del documento si aplica, o cadena vacía.',
    },
    noDoc: {
      type: Type.STRING,
      description: 'Número de factura, DTE, correlativo o código de confirmación.',
    },
    nit: {
      type: Type.STRING,
      description: 'NIT, RTN, RUC o RFC del proveedor EMISOR (nunca del comprador/Premex).',
    },
    proveedor: {
      type: Type.STRING,
      description: 'Nombre comercial o razón social del proveedor EMISOR (nunca del comprador/Premex).',
    },
    moneda: {
      type: Type.STRING,
      description:
        'Moneda sugerida: Quetzales, Dólares, Pesos Colombianos, Lempiras, Pesos Mexicanos, Euros o Colones.',
    },
    valorFactura: {
      type: Type.NUMBER,
      description: 'Valor total final pagado de la factura en su moneda original.',
    },
    tipoCambioSugerido: {
      type: Type.NUMBER,
      description: 'Tipo de cambio sugerido hacia la moneda base de reintegro.',
    },
    aplicaImpuestos: {
      type: Type.BOOLEAN,
      description: 'Indica si el comprobante aplica impuestos fiscales (IVA/ISV/VAT).',
    },
    porcentajeImpuesto: {
      type: Type.NUMBER,
      description: 'Porcentaje de impuesto aplicable (ej. 12, 15, 19, 16, 0).',
    },
    montoImpuesto: {
      type: Type.NUMBER,
      description: 'Monto numérico de impuestos en la moneda original.',
    },
    categoriaSugerida: {
      type: Type.STRING,
      description: 'Categoría de viático sugerida.',
    },
    descripcionSugerida: {
      type: Type.STRING,
      description: 'Descripción breve del gasto en español.',
    },
    confianza: {
      type: Type.STRING,
      description: 'Nivel de confianza de la lectura: alta, media o baja.',
    },
    notasExtraccion: {
      type: Type.STRING,
      description: 'Nota breve sobre tipo de documento, impuestos o moneda.',
    },
  },
  required: [
    'fechaDoc',
    'serieDoc',
    'noDoc',
    'nit',
    'proveedor',
    'moneda',
    'valorFactura',
    'tipoCambioSugerido',
    'aplicaImpuestos',
    'porcentajeImpuesto',
    'montoImpuesto',
    'categoriaSugerida',
    'descripcionSugerida',
    'confianza',
    'notasExtraccion',
  ],
};

interface ExtractionAttemptSpec {
  model: string;
  useLowThinking: boolean;
  delayBeforeMs: number;
  timeoutMs: number;
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

async function runInvoiceExtractionWithFailover(params: {
  ai: GoogleGenAI;
  filePart: { inlineData: { mimeType: string; data: string } };
  promptPart: { text: string };
  systemInstruction: string;
}): Promise<{ extracted: Record<string, unknown>; modelUsed: string }> {
  const customModel = (process.env.GEMINI_INVOICE_MODEL || '').trim();
  const liteInCooldown = Date.now() < primaryModelCooldownUntil;

  const baseAttempts: ExtractionAttemptSpec[] = liteInCooldown
    ? [
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayBeforeMs: 0, timeoutMs: 16_000 },
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayBeforeMs: 400, timeoutMs: 14_000 },
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayBeforeMs: 900, timeoutMs: 16_000 },
      ]
    : [
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayBeforeMs: 0, timeoutMs: 14_000 },
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayBeforeMs: 400, timeoutMs: 16_000 },
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayBeforeMs: 900, timeoutMs: 16_000 },
      ];

  const attempts: ExtractionAttemptSpec[] = customModel
    ? [
        { model: customModel, useLowThinking: false, delayBeforeMs: 0, timeoutMs: 16_000 },
        ...baseAttempts.filter((a) => a.model !== customModel),
      ]
    : baseAttempts;

  const deadlineAt = Date.now() + 50_000;
  let lastError: unknown = null;
  const skipped404Models = new Set<string>();

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (skipped404Models.has(attempt.model)) continue;

    const remainingBeforeDelay = deadlineAt - Date.now();
    if (remainingBeforeDelay <= 3_000) break;

    if (attempt.delayBeforeMs > 0) {
      await sleep(Math.min(attempt.delayBeforeMs, Math.max(0, remainingBeforeDelay - 3_000)));
    }

    const effectiveTimeout = Math.min(attempt.timeoutMs, deadlineAt - Date.now());
    if (effectiveTimeout <= 2_000) break;

    try {
      const response = await withTimeout(
        params.ai.models.generateContent({
          model: attempt.model,
          contents: { parts: [params.filePart, params.promptPart] },
          config: {
            systemInstruction: params.systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: INVOICE_RESPONSE_SCHEMA,
            ...(attempt.useLowThinking
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
          },
        }),
        effectiveTimeout,
        attempt.model
      );

      const rawText = (response.text ?? '').trim();
      if (!rawText) {
        throw new Error('EMPTY_MODEL_RESPONSE');
      }

      const parsed = parseModelJsonObject(rawText);
      if (attempt.model === 'gemini-3.1-flash-lite') {
        primaryModelCooldownUntil = 0;
      }
      return { extracted: parsed, modelUsed: attempt.model };
    } catch (err) {
      lastError = err;
      const { code, statusText } = extractUpstreamErrorMeta(err);
      console.warn(
        `[viaticos/extract-invoice] Attempt ${i + 1}/${attempts.length} failed on ${attempt.model} (code=${code}, status=${statusText || 'ERR'})`
      );

      if (code === 404 || statusText.includes('NOT_FOUND')) {
        skipped404Models.add(attempt.model);
      }

      if (
        attempt.model === 'gemini-3.1-flash-lite' &&
        (code === 503 || statusText.includes('UNAVAILABLE') || statusText.includes('DEADLINE_EXCEEDED'))
      ) {
        primaryModelCooldownUntil = Date.now() + 60_000;
      }

      if (!isFailoverEligibleError(err)) {
        throw err;
      }
    }
  }

  throw lastError || new Error('No se pudo completar la lectura de la factura.');
}

export async function processExtractInvoiceBody(
  body: ExtractInvoiceRequestBody
): Promise<ExtractInvoiceResult> {
  try {
    const { base64Data, mimeType, fileName, baseCurrency } = body ?? {};

    if (typeof base64Data !== 'string' || !base64Data.trim()) {
      return {
        status: 400,
        body: {
          error: 'No se recibió el contenido del archivo de la factura.',
        },
      };
    }

    const cleanMime = inferMimeType(mimeType, base64Data, fileName);
    if (!ALLOWED_INVOICE_MIMES.has(cleanMime)) {
      return {
        status: 400,
        body: {
          error: `Formato no compatible (${cleanMime || 'desconocido'}). Sube una imagen JPG, PNG, WebP o un archivo PDF.`,
        },
      };
    }

    const ai = getGeminiClient();
    if (!ai) {
      return {
        status: 503,
        body: {
          error:
            'Falta configurar GEMINI_API_KEY en el servidor (Vercel Environment Variables o Settings > Secrets). Tu comprobante quedó adjunto y puedes ingresar los datos manualmente.',
        },
      };
    }

    const normalizedMime = cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime;
    const pureBase64 = base64Data.includes(',')
      ? base64Data.split(',')[1].trim()
      : base64Data.trim();

    if (!pureBase64) {
      return {
        status: 400,
        body: {
          error: 'El archivo de la factura llegó vacío o dañado. Intenta cargarlo nuevamente.',
        },
      };
    }

    const targetBaseCurrency =
      typeof baseCurrency === 'string' && baseCurrency.trim()
        ? baseCurrency.trim()
        : 'Quetzales';

    const systemInstruction = buildInvoiceSystemInstruction(targetBaseCurrency);

    const filePart = {
      inlineData: {
        mimeType: normalizedMime,
        data: pureBase64,
      },
    };

    const promptPart = {
      text: `Analiza esta factura, recibo o comprobante (${String(
        fileName || 'documento'
      )}) e identifica todos los campos solicitados en JSON. Si la foto de celular viene rotada o de lado, léela igualmente en su orientación correcta. Distingue estrictamente entre el EMISOR (proveedor en el encabezado superior) y el RECEPTOR/COMPRADOR (Premex / Premezclas Latinoamericanas / Anitox / CF, que nunca debe ir como proveedor ni NIT). La moneda base de liquidación es "${targetBaseCurrency}".`,
    };

    const { extracted, modelUsed } = await runInvoiceExtractionWithFailover({
      ai,
      filePart,
      promptPart,
      systemInstruction,
    });

    const normalizedExtracted = {
      ...extracted,
      fechaDoc: normalizeDateField(extracted.fechaDoc),
    };

    return {
      status: 200,
      body: { extracted: normalizedExtracted, modelUsed },
    };
  } catch (err: any) {
    console.error('Error extracting invoice with Gemini:', err);
    const { code, statusText } = extractUpstreamErrorMeta(err);

    if (
      code === 403 ||
      statusText.includes('API_KEY_INVALID') ||
      statusText.includes('PERMISSION_DENIED')
    ) {
      return {
        status: 403,
        body: {
          error:
            'No se pudo autenticar la clave de Gemini API. Verifica la configuración en Settings > Secrets o en las variables de entorno del servidor.',
        },
      };
    }

    if (code === 429 || statusText.includes('RESOURCE_EXHAUSTED')) {
      return {
        status: 429,
        body: {
          error:
            'Se alcanzó temporalmente el límite de solicitudes de lectura automática. Espera unos segundos y presiona "Reintentar lectura IA".',
        },
      };
    }

    if (
      code === 503 ||
      statusText.includes('UNAVAILABLE') ||
      statusText.includes('HIGH DEMAND')
    ) {
      return {
        status: 503,
        body: {
          error:
            'El servicio de lectura IA presenta alta demanda temporal en este instante. Tu comprobante ya quedó adjunto: presiona "Reintentar lectura IA" en unos segundos o completa los campos manualmente.',
        },
      };
    }

    return {
      status: 500,
      body: {
        error:
          'No se pudo completar la lectura automática de esta factura. Tu comprobante quedó adjunto: puedes presionar "Reintentar lectura IA" o digitar los datos manualmente.',
      },
    };
  }
}

type VercelLikeReq = IncomingMessage & {
  body?: unknown;
};

type VercelLikeRes = ServerResponse & {
  status?: (code: number) => VercelLikeRes;
  json?: (data: unknown) => void;
};

async function readJsonBody(req: VercelLikeReq): Promise<ExtractInvoiceRequestBody> {
  if (req.body && typeof req.body === 'object') {
    return req.body as ExtractInvoiceRequestBody;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    return JSON.parse(req.body) as ExtractInvoiceRequestBody;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw) as ExtractInvoiceRequestBody;
}

function sendJson(res: VercelLikeRes, status: number, payload: Record<string, unknown>) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof res.status === 'function') {
    const statusRes = res.status(status);
    if (typeof statusRes.json === 'function') {
      statusRes.json(payload);
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

  let body: ExtractInvoiceRequestBody;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, {
      error: 'No se pudo interpretar el cuerpo JSON de la solicitud.',
    });
    return;
  }

  const result = await processExtractInvoiceBody(body);
  sendJson(res, result.status, result.body);
}
