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

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Optimizes large mobile camera photos (> 1.1MB or > 1800px) into crisp JPEGs
 * before OCR so upload and Gemini vision decoding stay fast and reliable.
 * PDFs are preserved untouched.
 */
export async function prepareFileForExtraction(
  file: File,
  originalDataUrl: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const mime = (file.type || '').toLowerCase();
  if (mime === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return { dataUrl: originalDataUrl, mimeType: 'application/pdf' };
  }

  if (file.size <= 1_100_000 && (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp')) {
    return { dataUrl: originalDataUrl, mimeType: mime };
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1800;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ dataUrl: originalDataUrl, mimeType: mime || 'image/jpeg' });
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.86);
        resolve({ dataUrl: compressed, mimeType: 'image/jpeg' });
      } catch {
        resolve({ dataUrl: originalDataUrl, mimeType: mime || 'image/jpeg' });
      }
    };
    img.onerror = () =>
      resolve({ dataUrl: originalDataUrl, mimeType: mime || 'image/jpeg' });
    img.src = originalDataUrl;
  });
}

function parseSafeNumber(val: unknown): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const str = String(val ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!str) return 0;
  // Handle European/Colombian style 1.250,50 -> 1250.50
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
  const response = await fetch('/api/viaticos/extract-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Data: params.dataUrl,
      mimeType: params.mimeType,
      fileName: params.fileName,
      baseCurrency: params.baseCurrency,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
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
