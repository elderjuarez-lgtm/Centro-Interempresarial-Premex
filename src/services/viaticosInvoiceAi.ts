import { PDFDocument } from 'pdf-lib';
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
  tipoDocumentoSugerido?: string;
  indicadorImpuestoSugerido?: string;
  codigoGastoSugerido?: string;
  modelUsed?: string;
  pageStart?: number;
  pageEnd?: number;
  extractedPdfDataUrl?: string;
  extractedPdfFileName?: string;
  extractedPdfSize?: number;
}

const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i;
// Fast mobile upload budget (~650 KB JPEG <= 880k base64 chars) — crisp for OCR & single-doc Firestore sync
const MAX_SAFE_IMAGE_DATAURL_CHARS = 880_000;
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

/**
 * Pure TypeScript JPEG APP1/EXIF Orientation reader (values 1..8).
 * Returns 1 when not present or not a JPEG.
 */
export function readJpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return 1;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;

  while (offset + 4 <= view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffda || marker === 0xffd9) break;
    if (offset + 2 > view.byteLength) break;
    const segLen = view.getUint16(offset, false);
    if (segLen < 2) break;

    if (marker === 0xffe1 && offset + segLen <= view.byteLength) {
      // "Exif\0\0" header
      if (
        offset + 10 <= view.byteLength &&
        view.getUint32(offset + 2, false) === 0x45786966 &&
        view.getUint16(offset + 6, false) === 0x0000
      ) {
        const tiffStart = offset + 8;
        if (tiffStart + 8 <= view.byteLength) {
          const endianTag = view.getUint16(tiffStart, false);
          const little = endianTag === 0x4949;
          if (little || endianTag === 0x4d4d) {
            const firstIfdRel = view.getUint32(tiffStart + 4, little);
            const ifdStart = tiffStart + firstIfdRel;
            if (ifdStart + 2 <= view.byteLength) {
              const entries = view.getUint16(ifdStart, little);
              for (let i = 0; i < entries; i++) {
                const entryOff = ifdStart + 2 + i * 12;
                if (entryOff + 12 > view.byteLength) break;
                const tag = view.getUint16(entryOff, little);
                if (tag === 0x0112) {
                  const val = view.getUint16(entryOff + 8, little);
                  return val >= 1 && val <= 8 ? val : 1;
                }
              }
            }
          }
        }
      }
    }

    offset += segLen;
  }
  return 1;
}

function drawOrientedSourceToCanvas(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  orientation: number,
  maxDim: number,
  quality: number
): string | null {
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const targetNaturalW = swapsAxes ? srcH : srcW;
  const targetNaturalH = swapsAxes ? srcW : srcH;

  let drawTotalW = targetNaturalW;
  let drawTotalH = targetNaturalH;
  if (drawTotalW > maxDim || drawTotalH > maxDim) {
    const ratio = Math.min(maxDim / drawTotalW, maxDim / drawTotalH);
    drawTotalW = Math.max(1, Math.round(drawTotalW * ratio));
    drawTotalH = Math.max(1, Math.round(drawTotalH * ratio));
  }

  // Scaled pre-transform rectangle
  const boxW = swapsAxes ? drawTotalH : drawTotalW;
  const boxH = swapsAxes ? drawTotalW : drawTotalH;

  const canvas = document.createElement('canvas');
  canvas.width = drawTotalW;
  canvas.height = drawTotalH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, drawTotalW, drawTotalH);

  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, drawTotalW, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, drawTotalW, drawTotalH);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, drawTotalH);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, drawTotalW, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, drawTotalW, drawTotalH);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, drawTotalH);
      break;
    default:
      break;
  }

  ctx.drawImage(source, 0, 0, boxW, boxH);
  return canvas.toDataURL('image/jpeg', quality);
}

function encodeSourceToAdaptiveJpeg(
  source: CanvasImageSource,
  naturalWidth: number,
  naturalHeight: number,
  exifOrientation = 1
): string | null {
  const attempts: { maxDim: number; quality: number }[] = [
    { maxDim: 1650, quality: 0.82 },
    { maxDim: 1450, quality: 0.78 },
    { maxDim: 1280, quality: 0.72 },
    { maxDim: 1080, quality: 0.64 },
  ];

  let lastDataUrl: string | null = null;
  for (const step of attempts) {
    const encoded = drawOrientedSourceToCanvas(
      source,
      naturalWidth,
      naturalHeight,
      exifOrientation,
      step.maxDim,
      step.quality
    );
    if (!encoded) return lastDataUrl;
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
 * - Explicitly reads EXIF Orientation and bakes upright vertical pixels without double-rotation
 * - Progressively compresses into a sharp JPEG optimized for fast 4G/LTE upload and crisp OCR
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

  let exifOrientation = 1;
  try {
    const headerSlice = await file.slice(0, 128 * 1024).arrayBuffer();
    exifOrientation = readJpegExifOrientation(new Uint8Array(headerSlice));
  } catch {
    exifOrientation = 1;
  }

  // Deterministic orientation baking: request raw sensor pixels ('none') and apply EXIF manually.
  if (typeof createImageBitmap === 'function') {
    try {
      const rawBitmap = await createImageBitmap(file, {
        imageOrientation: 'none',
      } as ImageBitmapOptions);
      try {
        const compressed = encodeSourceToAdaptiveJpeg(
          rawBitmap,
          rawBitmap.width,
          rawBitmap.height,
          exifOrientation
        );
        if (compressed) {
          return { dataUrl: compressed, mimeType: 'image/jpeg' };
        }
      } finally {
        rawBitmap.close?.();
      }
    } catch {
      // Fallback: browser does not support imageOrientation: 'none'; try auto-orientation
      try {
        const autoBitmap = await createImageBitmap(file, {
          imageOrientation: 'from-image',
        } as ImageBitmapOptions);
        try {
          const compressed = encodeSourceToAdaptiveJpeg(
            autoBitmap,
            autoBitmap.width,
            autoBitmap.height,
            1
          );
          if (compressed) {
            return { dataUrl: compressed, mimeType: 'image/jpeg' };
          }
        } finally {
          autoBitmap.close?.();
        }
      } catch {
        // Fall through to HTMLImageElement decoding
      }
    }
  }

  try {
    const img = await loadImageElement(originalDataUrl);
    const compressed = encodeSourceToAdaptiveJpeg(
      img,
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      1
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
 * cleanly inside the fast mobile server payload budget.
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
      img.naturalHeight || img.height,
      1
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
 * can be straightened visually, for OCR, and for the compiled vertical PDF.
 */
export async function rotateImageDataUrl90(
  dataUrl: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const img = await loadImageElement(dataUrl);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const maxDim = 1650;
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

  let rotated = canvas.toDataURL('image/jpeg', 0.84);
  if (rotated.length > MAX_SAFE_IMAGE_DATAURL_CHARS) {
    rotated = canvas.toDataURL('image/jpeg', 0.72);
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

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const requestBody = JSON.stringify({
    base64Data: safeMedia.dataUrl,
    mimeType: safeMedia.mimeType,
    fileName: params.fileName,
    baseCurrency: params.baseCurrency,
  });

  const maxClientAttempts = 2;
  let response: Response | null = null;
  let payload: any = {};

  for (let attempt = 0; attempt < maxClientAttempts; attempt++) {
    if (attempt > 0) {
      await waitMs(1300);
    }

    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), 58_000)
      : null;

    try {
      response = await fetch('/api/viaticos/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller?.signal,
      });
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (attempt < maxClientAttempts - 1) continue;
      if (err?.name === 'AbortError') {
        throw new Error(
          'La lectura de la factura tardó más de lo esperado por la red móvil. Tu comprobante quedó adjunto: presiona "Reintentar lectura IA".'
        );
      }
      throw new Error(
        'No se pudo conectar con el servidor de lectura IA. Verifica tu conexión a internet y presiona "Reintentar lectura IA".'
      );
    }

    if (timeoutId) clearTimeout(timeoutId);
    payload = await response.json().catch(() => ({}));

    if (response.ok) {
      break;
    }

    const isTransient =
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;
    if (isTransient && attempt < maxClientAttempts - 1) {
      continue;
    }

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
  return normalizeSingleExtractedInvoice(
    raw,
    params.baseCurrency,
    typeof payload?.modelUsed === 'string' ? payload.modelUsed : undefined
  );
}

function normalizeSingleExtractedInvoice(
  raw: Record<string, any>,
  baseCurrency: ViaticoCurrency,
  modelUsed?: string
): ExtractedInvoiceData {
  const moneda = normalizeExtractedCurrency(raw.moneda);
  const valorFactura = roundMoney(Math.max(0, parseSafeNumber(raw.valorFactura)));
  const tipoCambioRaw = parseSafeNumber(raw.tipoCambioSugerido);
  const tipoCambioSugerido =
    moneda === baseCurrency
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

  const rawPageStart = Number(raw.pageStart);
  const rawPageEnd = Number(raw.pageEnd);
  const pageStart =
    Number.isFinite(rawPageStart) && rawPageStart >= 1
      ? Math.floor(rawPageStart)
      : undefined;
  const pageEnd =
    Number.isFinite(rawPageEnd) && rawPageEnd >= 1
      ? Math.max(pageStart || 1, Math.floor(rawPageEnd))
      : pageStart;

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
    tipoDocumentoSugerido: raw.tipoDocumentoSugerido
      ? String(raw.tipoDocumentoSugerido).trim().toUpperCase()
      : undefined,
    indicadorImpuestoSugerido: raw.indicadorImpuestoSugerido
      ? String(raw.indicadorImpuestoSugerido).trim().toUpperCase()
      : undefined,
    codigoGastoSugerido: raw.codigoGastoSugerido
      ? String(raw.codigoGastoSugerido).trim()
      : undefined,
    modelUsed,
    ...(pageStart ? { pageStart, pageEnd } : {}),
  };
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const pureBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const binary = atob(pureBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToPdfDataUrl(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return `data:application/pdf;base64,${btoa(binary)}`;
}

async function postMultiInvoicePdfChunk(params: {
  dataUrl: string;
  fileName: string;
  baseCurrency: ViaticoCurrency;
}): Promise<ExtractedInvoiceData[]> {
  const requestBody = JSON.stringify({
    base64Data: params.dataUrl,
    mimeType: 'application/pdf',
    fileName: params.fileName,
    baseCurrency: params.baseCurrency,
    multiInvoice: true,
  });

  const maxClientAttempts = 2;
  let response: Response | null = null;
  let payload: any = {};

  for (let attempt = 0; attempt < maxClientAttempts; attempt++) {
    if (attempt > 0) {
      await waitMs(1300);
    }

    const controller =
      typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), 59_000)
      : null;

    try {
      response = await fetch('/api/viaticos/extract-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller?.signal,
      });
    } catch (err: any) {
      if (timeoutId) clearTimeout(timeoutId);
      if (attempt < maxClientAttempts - 1) continue;
      if (err?.name === 'AbortError') {
        throw new Error(
          'La lectura masiva del PDF tardó más de lo esperado. Intenta dividir el PDF en menos páginas.'
        );
      }
      throw new Error(
        'No se pudo conectar con el servidor de lectura IA para procesar el PDF masivo.'
      );
    }

    if (timeoutId) clearTimeout(timeoutId);
    payload = await response.json().catch(() => ({}));

    if (response.ok) break;

    const isTransient =
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504;
    if (isTransient && attempt < maxClientAttempts - 1) continue;

    if (response.status === 413) {
      throw new Error(
        'Un segmento del PDF supera el límite permitido por el servidor (HTTP 413).'
      );
    }
    throw new Error(
      payload?.error ||
        `No se pudo procesar el PDF masivo (HTTP ${response.status}).`
    );
  }

  const modelUsed = typeof payload?.modelUsed === 'string' ? payload.modelUsed : undefined;
  const rawList: Record<string, any>[] = Array.isArray(payload?.invoices)
    ? payload.invoices
    : payload?.extracted
    ? [payload.extracted]
    : [];

  return rawList.map((raw) =>
    normalizeSingleExtractedInvoice(raw, params.baseCurrency, modelUsed)
  );
}

/**
 * Splits a multi-page PDF into size/page-safe chunks using pdf-lib and extracts
 * every individual invoice detected across all pages.
 */
export async function extractMultipleInvoicesFromPdfViaServer(params: {
  dataUrl: string;
  fileName: string;
  baseCurrency: ViaticoCurrency;
  onProgress?: (progress: {
    currentChunk: number;
    totalChunks: number;
    totalPages: number;
    extractedSoFar: number;
  }) => void;
}): Promise<{ invoices: ExtractedInvoiceData[]; totalPages: number }> {
  const MAX_CHUNK_CHARS = 3_500_000;
  const DEFAULT_PAGES_PER_CHUNK = 3;

  let chunks: { dataUrl: string; label: string; fromPage: number; toPage: number }[] = [];
  let totalPages = 1;
  let srcDoc: PDFDocument | null = null;

  try {
    const pdfBytes = dataUrlToUint8Array(params.dataUrl);
    srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    totalPages = Math.max(1, srcDoc.getPageCount());

    if (totalPages <= DEFAULT_PAGES_PER_CHUNK && params.dataUrl.length <= MAX_CHUNK_CHARS) {
      chunks = [
        {
          dataUrl: params.dataUrl,
          label: params.fileName,
          fromPage: 1,
          toPage: totalPages,
        },
      ];
    } else {
      let pageCursor = 0;
      while (pageCursor < totalPages) {
        let span = Math.min(DEFAULT_PAGES_PER_CHUNK, totalPages - pageCursor);
        let builtDataUrl = '';
        while (span >= 1) {
          const chunkDoc = await PDFDocument.create();
          const indices = Array.from({ length: span }, (_, k) => pageCursor + k);
          const copiedPages = await chunkDoc.copyPages(srcDoc, indices);
          copiedPages.forEach((p) => chunkDoc.addPage(p));
          const bytes = await chunkDoc.save();
          const candidateUrl = uint8ArrayToPdfDataUrl(bytes);
          if (candidateUrl.length <= MAX_CHUNK_CHARS || span === 1) {
            builtDataUrl = candidateUrl;
            break;
          }
          span -= 1;
        }
        const fromPage = pageCursor + 1;
        const toPage = pageCursor + span;
        chunks.push({
          dataUrl: builtDataUrl,
          label: `${params.fileName} (págs. ${fromPage}-${toPage})`,
          fromPage,
          toPage,
        });
        pageCursor += span;
      }
    }
  } catch {
    srcDoc = null;
    if (params.dataUrl.length > MAX_SAFE_PDF_DATAURL_CHARS) {
      throw new Error(
        'No se pudo dividir el PDF pesado automáticamente. Comprime el PDF a menos de 3 MB o divídelo en archivos más pequeños.'
      );
    }
    chunks = [
      {
        dataUrl: params.dataUrl,
        label: params.fileName,
        fromPage: 1,
        toPage: totalPages,
      },
    ];
  }

  const basePdfName = params.fileName.replace(/\.pdf$/i, '').trim() || 'comprobante';
  const splitPdfCache = new Map<
    string,
    { dataUrl: string; fileName: string; size: number }
  >();

  const buildSplitPdfForRange = async (
    globalStart: number,
    globalEnd: number
  ): Promise<{ dataUrl: string; fileName: string; size: number } | null> => {
    if (!srcDoc) return null;
    const safeStart = Math.max(1, Math.min(totalPages, globalStart));
    const safeEnd = Math.max(safeStart, Math.min(totalPages, globalEnd));
    const cacheKey = `${safeStart}-${safeEnd}`;
    const existing = splitPdfCache.get(cacheKey);
    if (existing) return existing;

    const pageTag =
      safeStart === safeEnd ? `p${safeStart}` : `p${safeStart}-${safeEnd}`;
    const splitName = `${basePdfName}_${pageTag}.pdf`;

    if (
      safeStart === 1 &&
      safeEnd === totalPages &&
      params.dataUrl.length <= MAX_SAFE_PDF_DATAURL_CHARS
    ) {
      const approxBytes = Math.round((params.dataUrl.length * 3) / 4);
      const res = { dataUrl: params.dataUrl, fileName: splitName, size: approxBytes };
      splitPdfCache.set(cacheKey, res);
      return res;
    }

    try {
      const subDoc = await PDFDocument.create();
      const indices = Array.from(
        { length: safeEnd - safeStart + 1 },
        (_, offset) => safeStart - 1 + offset
      );
      const copied = await subDoc.copyPages(srcDoc, indices);
      copied.forEach((p) => subDoc.addPage(p));
      const subBytes = await subDoc.save();
      const subDataUrl = uint8ArrayToPdfDataUrl(subBytes);
      const res = {
        dataUrl: subDataUrl,
        fileName: splitName,
        size: subBytes.byteLength,
      };
      splitPdfCache.set(cacheKey, res);
      return res;
    } catch {
      return null;
    }
  };

  const allInvoices: ExtractedInvoiceData[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    params.onProgress?.({
      currentChunk: i + 1,
      totalChunks: chunks.length,
      totalPages,
      extractedSoFar: allInvoices.length,
    });
    const extractedChunk = await postMultiInvoicePdfChunk({
      dataUrl: chunk.dataUrl,
      fileName: chunk.label,
      baseCurrency: params.baseCurrency,
    });

    const chunkSpan = Math.max(1, chunk.toPage - chunk.fromPage + 1);
    for (let k = 0; k < extractedChunk.length; k++) {
      const inv = extractedChunk[k];
      let globalStart = chunk.fromPage;
      let globalEnd = chunk.toPage;

      if (inv.pageStart && inv.pageStart >= 1) {
        const clampedLocalStart = Math.min(Math.max(1, inv.pageStart), chunkSpan);
        const clampedLocalEnd = Math.min(
          Math.max(clampedLocalStart, inv.pageEnd || clampedLocalStart),
          chunkSpan
        );
        globalStart = chunk.fromPage + clampedLocalStart - 1;
        globalEnd = chunk.fromPage + clampedLocalEnd - 1;
      } else if (extractedChunk.length === chunkSpan) {
        globalStart = chunk.fromPage + k;
        globalEnd = globalStart;
      } else {
        const noteMatch = inv.notasExtraccion.match(/p[aá]g(?:ina)?\.?\s*(\d+)/i);
        if (noteMatch) {
          const parsedPage = Number(noteMatch[1]);
          if (Number.isFinite(parsedPage) && parsedPage >= 1 && parsedPage <= chunkSpan) {
            globalStart = chunk.fromPage + parsedPage - 1;
            globalEnd = globalStart;
          }
        }
      }

      const splitPdf = await buildSplitPdfForRange(globalStart, globalEnd);
      allInvoices.push({
        ...inv,
        pageStart: globalStart,
        pageEnd: globalEnd,
        ...(splitPdf
          ? {
              extractedPdfDataUrl: splitPdf.dataUrl,
              extractedPdfFileName: splitPdf.fileName,
              extractedPdfSize: splitPdf.size,
            }
          : {}),
      });
    }

    params.onProgress?.({
      currentChunk: i + 1,
      totalChunks: chunks.length,
      totalPages,
      extractedSoFar: allInvoices.length,
    });
  }

  return { invoices: allInvoices, totalPages };
}
