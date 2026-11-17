import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const ALLOWED_INVOICE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);

// Short circuit-breaker window when primary model experiences a temporary 503 demand spike
let primaryModelCooldownUntil = 0;

function getGeminiClient() {
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

  // Many @google/genai errors embed JSON in err.message: {"error":{"code":503,"message":...,"status":"UNAVAILABLE"}}
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

function isRetryableGeminiError(err: unknown): boolean {
  const { code, statusText, rawMessage } = extractUpstreamErrorMeta(err);
  const combined = `${statusText} ${rawMessage}`.toUpperCase();
  return (
    code === 503 ||
    code === 500 ||
    code === 429 ||
    code === 504 ||
    combined.includes('UNAVAILABLE') ||
    combined.includes('HIGH DEMAND') ||
    combined.includes('OVERLOADED') ||
    combined.includes('RESOURCE_EXHAUSTED') ||
    combined.includes('DEADLINE_EXCEEDED') ||
    combined.includes('FETCH FAILED') ||
    combined.includes('ECONNRESET') ||
    combined.includes('ETIMEDOUT')
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
  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }
  // D/M/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    const [, dd, mm, y] = dmyMatch;
    const yyyy = y.length === 2 ? `20${y}` : y;
    return `${dd.padStart(2, '0')}/${mm.padStart(2, '0')}/${yyyy}`;
  }
  return s;
}

function buildInvoiceSystemInstruction(targetBaseCurrency: string): string {
  return `Eres un auditor contable senior especializado en lectura y extracción de datos de facturas, recibos, tickets térmicos y comprobantes electrónicos de viaje de cualquier país y formato (todas las facturas son diferentes en diseño, idioma, orientación y estructura).

Tu trabajo es analizar cuidadosamente la imagen o PDF adjunto (incluyendo fotos de celular ligeramente rotadas, tickets de gasolinera/restaurante, facturas electrónicas FEL Guatemala, SAR Honduras, DIAN Colombia, CFDI México, Hacienda Costa Rica, recibos digitales de Uber, DiDi, Airbnb, Booking, hoteles, peajes y aerolíneas) y extraer los campos solicitados con máxima precisión.

INSTRUCCIONES CRÍTICAS POR CAMPO:
1. fechaDoc: Fecha de EMISIÓN o TRANSACCIÓN del documento convertida estrictamente al formato DD/MM/YYYY (ej. "28/07/2026"). Nunca uses la fecha de vencimiento ni fecha de impresión de autorización si existe fecha de emisión. Si no aparece fecha legible, devuelve "".
2. serieDoc: Serie o prefijo fiscal del documento SOLO si aplica y aparece impreso.
   - En FEL Guatemala suele aparecer como "Serie:" (ej. código hexadecimal de 8 caracteres como "FD0887E5", "65387fe9", "946c5118", "7e257e6f") o letras/números antes del correlativo.
   - En DIAN Colombia / CFDI México puede ser el prefijo o serie (ej. "SETT", "FE", "A").
   - Si el documento NO tiene serie (ej. recibos de Uber, Airbnb, hoteles internacionales, tickets sin serie), devuelve "".
3. noDoc: Número de factura, Número de DTE, correlativo, folio o código de confirmación/reserva (ej. "4261236653", "980895701", "RC4AM3PJBD", "000-001-01-00045678"). No repitas la serie dentro de noDoc si ya la separaste en serieDoc.
4. nit: NIT, RTN, RUC, RFC o Tax ID del EMISOR / PROVEEDOR únicamente.
   - CRÍTICO: Distingue siempre entre EMISOR (quien vende el producto/servicio, usualmente en el encabezado superior) y RECEPTOR / COMPRADOR (Premex, Anitox, el consultor, o "CF / Consumidor Final"). NUNCA devuelvas el NIT del receptor/comprador ni "CF".
   - Limpia espacios sobrantes. Si es un recibo extranjero sin NIT/ID fiscal visible (ej. Uber, Airbnb), devuelve "".
5. proveedor: Nombre comercial o razón social clara del EMISOR de la factura (ej. "La paneria, s.a.", "Uno Guatemala, s. a", "Federico Guillermo Catalan Acevedo", "Uber", "AIRBNB"). No pongas el nombre del comprador ni del cliente.
6. moneda: Identifica la moneda original del documento usando símbolos, códigos ISO y país del emisor, y devuelve EXACTAMENTE una de estas etiquetas:
   - "Quetzales" (Q, GTQ, FEL Guatemala / SAT)
   - "Dólares" (USD, US$, $, recibos en EE.UU., Airbnb USD, aerolíneas en USD)
   - "Pesos Colombianos" (COP, DIAN Colombia, $ con valores en miles como 45.000)
   - "Lempiras" (L, Lps, HNL, SAR Honduras)
   - "Pesos Mexicanos" (MXN, CFDI México, SAT México)
   - "Euros" (EUR, €)
   - "Colones" (CRC, ₡, Hacienda Costa Rica)
   Si no hay indicio suficiente, sugiere "${targetBaseCurrency}".
7. valorFactura: Monto TOTAL FINAL pagado en la moneda original de la factura (número decimal positivo usando punto decimal, ej. 346.04 o 2731.66).
   - Busca "TOTAL", "TOTAL A PAGAR", "GRAND TOTAL", "TOTAL PAGADO", "AMOUNT PAID".
   - No devuelvas un subtotal parcial ni el vuelto/cambio.
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
15. notasExtraccion: frase breve y útil en español (máx. 140 caracteres) explicando el tipo de comprobante detectado (ej. "Factura FEL Guatemala régimen general con IVA 12% incluido" o "Recibo internacional en USD sin crédito fiscal; validar tipo de cambio").`;
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
      description: 'NIT, RTN, RUC o RFC del proveedor EMISOR (nunca del comprador).',
    },
    proveedor: {
      type: Type.STRING,
      description: 'Nombre comercial o razón social del proveedor EMISOR.',
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
  model: 'gemini-3.1-flash-lite' | 'gemini-4-hydrogen';
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
  const liteInCooldown = Date.now() < primaryModelCooldownUntil;

  // Ordered failover plan across active free-tier multimodal models with per-attempt timeout
  const attempts: ExtractionAttemptSpec[] = liteInCooldown
    ? [
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayBeforeMs: 0, timeoutMs: 18_000 },
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayBeforeMs: 400, timeoutMs: 18_000 },
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayBeforeMs: 1200, timeoutMs: 20_000 },
      ]
    : [
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayBeforeMs: 0, timeoutMs: 18_000 },
        { model: 'gemini-3.1-flash-lite', useLowThinking: false, delayBeforeMs: 600, timeoutMs: 18_000 },
        { model: 'gemini-4-hydrogen', useLowThinking: true, delayBeforeMs: 500, timeoutMs: 18_000 },
      ];

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.delayBeforeMs > 0) {
      await sleep(attempt.delayBeforeMs);
    }

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
        attempt.timeoutMs,
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

      if (
        attempt.model === 'gemini-3.1-flash-lite' &&
        (code === 503 || statusText.includes('UNAVAILABLE') || statusText.includes('DEADLINE_EXCEEDED'))
      ) {
        primaryModelCooldownUntil = Date.now() + 60_000;
      }

      // Immediately abort on non-retryable auth/bad-request errors
      if (!isRetryableGeminiError(err) && String((err as any)?.message) !== 'EMPTY_MODEL_RESPONSE') {
        throw err;
      }
    }
  }

  throw lastError || new Error('No se pudo completar la lectura de la factura.');
}

async function startServer() {
  const app = express();

  // Support invoice images & PDFs encoded in base64 (up to 25MB)
  app.use(express.json({ limit: '25mb' }));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'premex-suite-server' });
  });

  // Server-side Gemini multimodal invoice extraction for Viáticos
  app.post('/api/viaticos/extract-invoice', async (req, res) => {
    try {
      const { base64Data, mimeType, fileName, baseCurrency } = req.body ?? {};

      if (typeof base64Data !== 'string' || !base64Data.trim()) {
        res.status(400).json({
          error: 'No se recibió el contenido del archivo de la factura.',
        });
        return;
      }

      const cleanMime = String(mimeType || '').trim().toLowerCase();
      if (!ALLOWED_INVOICE_MIMES.has(cleanMime)) {
        res.status(400).json({
          error: `Formato no compatible (${cleanMime || 'desconocido'}). Sube una imagen JPG, PNG, WebP o un archivo PDF.`,
        });
        return;
      }

      const ai = getGeminiClient();
      if (!ai) {
        res.status(503).json({
          error:
            'El servicio de extracción automática no tiene configurada la clave GEMINI_API_KEY en el servidor. Verifica Settings > Secrets o ingresa los datos manualmente.',
        });
        return;
      }

      const normalizedMime = cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime;
      const pureBase64 = base64Data.includes(',')
        ? base64Data.split(',')[1]
        : base64Data;

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
        )}) e identifica todos los campos solicitados en JSON. Recuerda que cada factura tiene un diseño distinto: lee cuidadosamente emisor, fecha, serie (si existe), número, NIT/ID fiscal del emisor, moneda, valor total pagado e impuestos. La moneda base de liquidación es "${targetBaseCurrency}".`,
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

      res.json({ extracted: normalizedExtracted, modelUsed });
    } catch (err: any) {
      console.error('Error extracting invoice with Gemini:', err);
      const { code, statusText } = extractUpstreamErrorMeta(err);

      if (code === 403 || statusText.includes('API_KEY_INVALID') || statusText.includes('PERMISSION_DENIED')) {
        res.status(403).json({
          error:
            'No se pudo autenticar la clave de Gemini API. Verifica la configuración en Settings > Secrets.',
        });
        return;
      }

      if (code === 429 || statusText.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error:
            'Se alcanzó temporalmente el límite de solicitudes de lectura automática. Espera unos segundos y presiona "Reintentar lectura IA".',
        });
        return;
      }

      if (code === 503 || statusText.includes('UNAVAILABLE') || statusText.includes('HIGH DEMAND')) {
        res.status(503).json({
          error:
            'El servicio de lectura IA presenta alta demanda temporal en este instante. Tu comprobante ya quedó adjunto: presiona "Reintentar lectura IA" en unos segundos o completa los campos manualmente.',
        });
        return;
      }

      res.status(500).json({
        error:
          'No se pudo completar la lectura automática de esta factura. Tu comprobante quedó adjunto: puedes presionar "Reintentar lectura IA" o digitar los datos manualmente.',
      });
    }
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
