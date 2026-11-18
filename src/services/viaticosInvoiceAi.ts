import { ViaticoCategory, ViaticoCurrency } from '../types';
import {
  normalizeExtractedCategory,
  normalizeExtractedCurrency,
  roundMoney,
} from '../utils/viaticos';

export interface ExtractedInvoiceData {
  fechaDoc: string;
  serieDoc: string;
  noDoc: string;
  nit: string;
  proveedor: string;
  moneda: ViaticoCurrency;
  valorFactura: number;
  tipoCambioSugerido: number;
  aplicaImpuestos: boolean;
  porcentajeImpuesto: number;
  montoImpuesto: number;
  categoriaSugerida: ViaticoCategory;
  descripcionSugerida: string;
  confianza: 'alta' | 'media' | 'baja';
  notasExtraccion: string;
  modelUsed?: string;
}

const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i;
// Keep JSON + base64 safely below Vercel's 4.5 MB Serverless Function body limit
const MAX_SAFE_IMAGE_DATAURL_CHARS = 2_400_000;
const MAX_SAFE_PDF_DATAURL_CHARS = 4_000_000;

export function detectInvoiceFileKind(file: File): {
  kind: 'pdf' | 'image' | 'unsupported';
  mimeType: string;
} {
  const rawMime = (file.type || '').trim().toLowerCase();
  const lowerName = (file.name || '').trim().toLowerCase();

  if (rawMime === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return { kind: 'pdf', mimeType: 'application/pdf' };
  }

  if (rawMime.startsWith('image/')) {
    return {
      kind: 'image',
      mimeType: rawMime === 'image/jpg' ? 'image/jpeg' : rawMime,
    };
  }

  if (IMAGE_EXT_REGEX.test(lowerName)) {
    if (lowerName.endsWith('.png')) return { kind: 'image', mimeType: 'image/png' };
    if (lowerName.endsWith('.webp')) return { kind: 'image', mimeType: 'image/webp' };
    if (lowerName.endsWith('.heic')) return { kind: 'image', mimeType: 'image/heic' };
    if (lowerName.endsWith('.heif')) return { kind: 'image', mimeType: 'image/heif' };
    return { kind: 'image', mimeType: 'image/jpeg' };
  }

  return { kind: 'unsupported', mimeType: rawMime || 'application/octet-stream' };
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

function encodeSourceToAdaptiveJpeg(
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number
): string | null {
  const attempts: { maxDim: number; quality: number }[] = [
    { maxDim: 2400, quality: 0.88 },
    { maxDim: 2000, quality: 0.84 },
    { maxDim: 1650, quality: 0.78 },
    { maxDim: 1350, quality: 0.7 },
    { maxDim: 1080, quality: 0.62 },
  ];

  let lastDataUrl: string | null = null;
  for (const step of attempts) {
    let width = naturalWidth;
    let height = naturalHeight;
    if (width > step.maxDim || height > step.maxDim) {
      const ratio = Math.min(step.maxDim / width, step.maxDim / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return lastDataUrl;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);

    const encoded = canvas.toDataURL('image/jpeg', step.quality);
    lastDataUrl = encoded;
    if (encoded.length <= MAX_SAFE_IMAGE_DATAURL_CHARS) {
      return encoded;
    }
  }
  return lastDataUrl;
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
    img.src = src;
  });
}

/**
 * Normalizes mobile camera photos & screenshots:
 * - Bakes EXIF orientation into upright pixels when supported by the browser
 * - Progressively compresses into a sharp JPEG guaranteed to stay well under
 *   Vercel's 4.5MB serverless body limit and upload quickly over mobile data
 * - Preserves PDFs untouched
 */
export async function prepareFileForExtraction(
  file: File,
  originalDataUrl: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const detected = detectInvoiceFileKind(file);
  if (detected.kind === 'pdf') {
    return { dataUrl: originalDataUrl, mimeType: 'application/pdf' };
  }

  // First try createImageBitmap with EXIF orientation support (best for Android/iOS cameras)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions);
      try {
        const compressed = encodeSourceToAdaptiveJpeg(
          bitmap,
          bitmap.width,
          bitmap.height
        );
        if (compressed) {
          return { dataUrl: compressed, mimeType: 'image/jpeg' };
        }
      } finally {
        bitmap.close?.();
      }
    } catch {
      // Fall through to HTMLImageElement decoding
    }
  }

  try {
    const img = await loadImageElement(originalDataUrl);
    const compressed = encodeSourceToAdaptiveJpeg(
      img,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height
    );
    if (compressed) {
      return { dataUrl: compressed, mimeType: 'image/jpeg' };
    }
  } catch {
    // Fallback below if browser cannot decode (e.g. raw HEIC on Chrome desktop)
  }

  const fallbackMime =
    detected.kind === 'image' ? detected.mimeType : 'image/jpeg';
  return { dataUrl: originalDataUrl, mimeType: fallbackMime };
}

/**
 * Ensures an already stored data URL (e.g. when pressing "Re-leer IA") fits
 * cleanly inside the server payload budget.
 */
export async function ensureDataUrlWithinLimit(
  dataUrl: string,
  mimeType: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const cleanMime = (mimeType || 'image/jpeg').toLowerCase();
  if (cleanMime === 'application/pdf') {
    return { dataUrl, mimeType: 'application/pdf' };
  }
  if (
    dataUrl.length <= MAX_SAFE_IMAGE_DATAURL_CHARS &&
    (cleanMime === 'image/jpeg' || cleanMime === 'image/png' || cleanMime === 'image/webp')
  ) {
    return { dataUrl, mimeType: cleanMime };
  }
  try {
    const img = await loadImageElement(dataUrl);
    const compressed = encodeSourceToAdaptiveJpeg(
      img,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height
    );
    if (compressed) {
      return { dataUrl: compressed, mimeType: 'image/jpeg' };
    }
  } catch {
    // Keep original if image cannot be re-encoded
  }
  return { dataUrl, mimeType: cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime };
}

/**
 * Rotates an image data URL clockwise by 90 degrees so sideways mobile receipts
 * can be straightened visually, for OCR, and for the compiled PDF.
 */
export async function rotateImageDataUrl90(
  dataUrl: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const img = await loadImageElement(dataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const maxDim = 2200;
  let drawW = srcW;
  let drawH = srcH;
  if (drawW > maxDim || drawH > maxDim) {
    const ratio = Math.min(maxDim / drawW, maxDim / drawH);
    drawW = Math.max(1, Math.round(drawW * ratio));
    drawH = Math.max(1, Math.round(drawH * ratio));
  }

  const canvas = document.createElement('canvas');
  canvas.width = drawH;
  canvas.height = drawW;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No se pudo rotar la imagen en este navegador.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

  let rotated = canvas.toDataURL('image/jpeg', 0.86);
  if (rotated.length > MAX_SAFE_IMAGE_DATAURL_CHARS) {
    rotated = canvas.toDataURL('image/jpeg', 0.74);
  }
  return { dataUrl: rotated, mimeType: 'image/jpeg' };
}

function parseSafeNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const str = String(val ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!str) return 0;
  const normalized =
    str.includes(',') && str.includes('.')
      ? str.lastIndexOf(',') > str.lastIndexOf('.')
        ? str.replace(/\./g, '').replace(',', '.')
        : str.replace(/,/g, '')
      : str.includes(',') && !str.includes('.')
      ? /,\d{1,2}$/.test(str)
        ? str.replace(',', '.')
        : str.replace(/,/g, '')
      : str;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export async function extractInvoiceViaServer(params: {
  dataUrl: string;
  mimeType: string;
  fileName: string;
  baseCurrency: ViaticoCurrency;
}): Promise<ExtractedInvoiceData> {
  const safeMedia = await ensureDataUrlWithinLimit(params.dataUrl, params.mimeType);

  if (
    safeMedia.mimeType === 'application/pdf' &&
    safeMedia.dataUrl.length > MAX_SAFE_PDF_DATAURL_CHARS
  ) {
    throw new Error(
      'El PDF supera el tamaño máximo recomendado (~3 MB) para lectura automática. El archivo quedó adjunto: puedes reducir el PDF o ingresar los datos manualmente.'
    );
  }

  let response: Response;
  try {
    response = await fetch('/api/viaticos/extract-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64Data: safeMedia.dataUrl,
        mimeType: safeMedia.mimeType,
        fileName: params.fileName,
        baseCurrency: params.baseCurrency,
      }),
    });
  } catch {
    throw new Error(
      'No se pudo conectar con el servidor de lectura IA. Verifica tu conexión a internet y presiona "Reintentar lectura IA".'
    );
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 413) {
      throw new Error(
        'La imagen o documento es demasiado pesado para el servidor (HTTP 413). Intenta tomar la foto con menor resolución o presiona "Reintentar lectura IA".'
      );
    }
    if (response.status === 404 && !payload?.error) {
      throw new Error(
        'El servicio de lectura IA (/api/viaticos/extract-invoice) no está publicado en este despliegue (HTTP 404). Vuelve a desplegar la aplicación con la carpeta api/ y la variable GEMINI_API_KEY.'
      );
    }
    throw new Error(
      payload?.error ||
        `No se pudo extraer los datos de la factura (HTTP ${response.status}).`
    );
  }

  const raw = payload?.extracted || {};
  const moneda = normalizeExtractedCurrency(raw.moneda);
  const valorFactura = roundMoney(Math.max(0, parseSafeNumber(raw.valorFactura)));
  const tipoCambioRaw = parseSafeNumber(raw.tipoCambioSugerido);
  const tipoCambioSugerido =
    moneda === params.baseCurrency
      ? 1
      : tipoCambioRaw > 0
      ? roundMoney(tipoCambioRaw)
      : 1;

  const aplicaImpuestos = Boolean(raw.aplicaImpuestos);
  const porcentajeImpuesto = aplicaImpuestos
    ? roundMoney(Math.max(0, parseSafeNumber(raw.porcentajeImpuesto)))
    : 0;
  const montoImpuesto = aplicaImpuestos
    ? roundMoney(Math.max(0, parseSafeNumber(raw.montoImpuesto)))
    : 0;

  const confRaw = String(raw.confianza || '').toLowerCase();
  const confianza: 'alta' | 'media' | 'baja' =
    confRaw === 'alta' || confRaw === 'baja' ? confRaw : 'media';

  return {
    fechaDoc: String(raw.fechaDoc || '').trim(),
    serieDoc: String(raw.serieDoc || '').trim(),
    noDoc: String(raw.noDoc || '').trim(),
    nit: String(raw.nit || '').trim(),
    proveedor: String(raw.proveedor || '').trim(),
    moneda,
    valorFactura,
    tipoCambioSugerido,
    aplicaImpuestos,
    porcentajeImpuesto,
    montoImpuesto,
    categoriaSugerida: normalizeExtractedCategory(raw.categoriaSugerida),
    descripcionSugerida: String(raw.descripcionSugerida || '').trim(),
    confianza,
    notasExtraccion: String(raw.notasExtraccion || '').trim(),
    modelUsed: typeof payload?.modelUsed === 'string' ? payload.modelUsed : undefined,
  };
}
