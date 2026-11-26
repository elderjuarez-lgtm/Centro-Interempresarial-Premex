import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import { ViaticoLiquidation } from '../types';
import { StoredReceiptMedia } from '../services/viaticosMediaStore';
import { readJpegExifOrientation } from '../services/viaticosInvoiceAi';
import { formatViaticoAmount, roundExchangeRate, roundMoney } from './viaticos';
import { PREMEX_LOGO_SRC } from '../components/ModuleIcons';

function sanitizeFileSlug(text: string): string {
  return String(text || 'liquidacion')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function fetchPremexLogoBytes(): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(PREMEX_LOGO_SRC);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Generates an Excel (.xlsx) workbook replicating the exact official Premex
 * Viáticos format (Cabecera LIQUIDACIÓN / SEMANA # / NOMBRE:, Premex logo,
 * exact 14 columns with #B7DEE8 header shading, Total Liquidación row, plus
 * a secondary "Detalle Impuestos" worksheet prepared for accounting workflows).
 */
export async function generateViaticosExcelBytes(
  liquidation: ViaticoLiquidation,
  costCenter?: string
): Promise<{ bytes: Uint8Array; filename: string }> {
  const resolvedCostCenter = String(costCenter ?? liquidation.centroCosto ?? '').trim();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Suite Corporativa Premex';
  wb.created = new Date();

  const ws = wb.addWorksheet('Liquidación de Viáticos', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // Exact 14 column widths matching the Premex template
  ws.columns = [
    { key: 'fechaDoc', width: 13 },
    { key: 'serieDoc', width: 13 },
    { key: 'noDoc', width: 16 },
    { key: 'nit', width: 13 },
    { key: 'proveedor', width: 26 },
    { key: 'moneda', width: 14 },
    { key: 'valorFactura', width: 14 },
    { key: 'tipoCambio', width: 12 },
    { key: 'valorReintegrar', width: 15 },
    { key: 'categoria', width: 20 },
    { key: 'clienteContacto', width: 26 },
    { key: 'objetivoComercial', width: 28 },
    { key: 'descripcionGasto', width: 34 },
    { key: 'kilometraje', width: 13 },
  ];

  // Top Header Rows (rows 1–5)
  ws.getRow(1).height = 10;
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 24;
  ws.getRow(4).height = 24;
  ws.getRow(5).height = 12;

  const thinBottom: Partial<ExcelJS.Borders> = {
    bottom: { style: 'thin', color: { argb: 'FF1E293B' } },
  };

  // LIQUIDACIÓN
  ws.getCell('A2').value = 'LIQUIDACIÓN';
  ws.getCell('A2').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  ws.mergeCells('B2:E2');
  ws.getCell('B2').value = liquidation.lineaLiquidacion;
  ws.getCell('B2').font = { name: 'Calibri', size: 12, bold: false, color: { argb: 'FF0F172A' } };
  ws.getCell('B2').alignment = { vertical: 'middle', horizontal: 'left' };
  ['B2', 'C2', 'D2', 'E2'].forEach((addr) => {
    ws.getCell(addr).border = thinBottom;
  });

  // SEMANA #
  ws.getCell('A3').value = 'SEMANA #';
  ws.getCell('A3').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  ws.mergeCells('B3:E3');
  ws.getCell('B3').value = liquidation.semana;
  ws.getCell('B3').font = { name: 'Calibri', size: 12, bold: false, color: { argb: 'FF0F172A' } };
  ws.getCell('B3').alignment = { vertical: 'middle', horizontal: 'center' };
  ['B3', 'C3', 'D3', 'E3'].forEach((addr) => {
    ws.getCell(addr).border = thinBottom;
  });

  // NOMBRE:
  ws.getCell('A4').value = 'NOMBRE:';
  ws.getCell('A4').font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF0F172A' } };
  ws.mergeCells('B4:E4');
  ws.getCell('B4').value = liquidation.consultorNombre;
  ws.getCell('B4').font = { name: 'Calibri', size: 12, bold: false, color: { argb: 'FF0F172A' } };
  ws.getCell('B4').alignment = { vertical: 'middle', horizontal: 'center' };
  ['B4', 'C4', 'D4', 'E4'].forEach((addr) => {
    ws.getCell(addr).border = thinBottom;
  });

  // Premex Logo + Tagline in center/right header
  const logoBytes = await fetchPremexLogoBytes();
  if (logoBytes) {
    const imgId = wb.addImage({
      buffer: logoBytes,
      extension: 'png',
    });
    ws.addImage(imgId, {
      tl: { col: 6.7, row: 0.6 },
      ext: { width: 82, height: 82 },
    });
  }

  ws.mergeCells('I2:K4');
  const taglineCell = ws.getCell('I2');
  taglineCell.value = 'NOURISHING\nPOSSIBILITIES\nTOGETHER';
  taglineCell.font = {
    name: 'Calibri',
    size: 10,
    bold: true,
    color: { argb: 'FF64748B' },
  };
  taglineCell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  // Optional right metadata (Empresa / Estado)
  ws.mergeCells('L2:N2');
  ws.getCell('L2').value = `Empresa: ${liquidation.empresa}`;
  ws.getCell('L2').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('L2').alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells('L3:N3');
  const fxSummaryLabel =
    liquidation.monedaBase === 'Dólares' &&
    liquidation.tipoCambioLiquidacion &&
    liquidation.tipoCambioLiquidacion > 0
      ? `Moneda base: ${liquidation.monedaBase} · T/C Liq: ${roundExchangeRate(
          liquidation.tipoCambioLiquidacion
        )}`
      : `Moneda base: ${liquidation.monedaBase}`;
  ws.getCell('L3').value = fxSummaryLabel;
  ws.getCell('L3').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('L3').alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells('L4:N4');
  ws.getCell('L4').value = `Centro de Costo: ${resolvedCostCenter || 'Sin asignar'}`;
  ws.getCell('L4').font = { name: 'Calibri', size: 9, bold: true, color: { argb: 'FF132B63' } };
  ws.getCell('L4').alignment = { horizontal: 'right', vertical: 'middle' };

  // Row 6: Exact 14 Table Column Headers
  const headerLabels = [
    'Fecha Doc.',
    'Serie Doc.',
    'No. Doc.',
    'NIT',
    'Proveedor',
    'Moneda',
    'Valor Factura',
    'Tipo de Cambio',
    'Valor Reintegrar',
    'Categoría',
    'Cliente/Contacto',
    'Objetivo Comercial',
    'Descripción del Gastos',
    'Kilometraje',
  ];

  const headerRow = ws.getRow(6);
  headerRow.height = 28;
  headerLabels.forEach((label, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFB7DEE8' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF0F172A' } },
      bottom: { style: 'thin', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FF0F172A' } },
    };
  });

  // Data Rows (Row 7 onwards)
  const firstDataRow = 7;
  const thinGrid: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF334155' } },
    bottom: { style: 'thin', color: { argb: 'FF334155' } },
    left: { style: 'thin', color: { argb: 'FF334155' } },
    right: { style: 'thin', color: { argb: 'FF334155' } },
  };

  liquidation.items.forEach((item, index) => {
    const r = ws.getRow(firstDataRow + index);
    r.height = 26;
    const values = [
      item.fechaDoc,
      item.serieDoc,
      item.noDoc,
      item.nit,
      item.proveedor,
      item.moneda,
      roundMoney(item.valorFactura),
      roundExchangeRate(item.tipoCambio),
      roundMoney(item.valorReintegrar),
      item.categoria,
      item.clienteContacto,
      item.objetivoComercial,
      item.descripcionGasto,
      item.kilometraje,
    ];

    values.forEach((val, colIdx) => {
      const cell = r.getCell(colIdx + 1);
      cell.value = val;
      cell.font = {
        name: 'Calibri',
        size: 10,
        bold: colIdx === 10, // Cliente/Contacto bold as in template
        color: { argb: 'FF0F172A' },
      };
      cell.border = thinGrid;

      if (colIdx === 6 || colIdx === 8) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colIdx === 7) {
        cell.numFmt = '#,##0.00##';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else if (colIdx === 0 || colIdx === 5 || colIdx === 13) {
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
      }
    });
  });

  const lastDataRow = firstDataRow + Math.max(liquidation.items.length, 1) - 1;
  if (liquidation.items.length === 0) {
    const emptyRow = ws.getRow(firstDataRow);
    emptyRow.height = 22;
    for (let c = 1; c <= 14; c++) {
      emptyRow.getCell(c).border = thinGrid;
    }
  }

  // Blank separator line just like the template
  const spacerRowIdx = lastDataRow + 1;
  const spacerRow = ws.getRow(spacerRowIdx);
  spacerRow.height = 14;
  for (let c = 1; c <= 14; c++) {
    spacerRow.getCell(c).border = thinGrid;
  }

  // Total Liquidación Row (Merged F..H + Total in I)
  const totalRowIdx = spacerRowIdx + 1;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.height = 24;

  ws.mergeCells(`F${totalRowIdx}:H${totalRowIdx}`);
  const totalLabelCell = ws.getCell(`F${totalRowIdx}`);
  totalLabelCell.value = 'Total Liquidación';
  totalLabelCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  totalLabelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ['F', 'G', 'H'].forEach((col) => {
    ws.getCell(`${col}${totalRowIdx}`).border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'medium', color: { argb: 'FF0F172A' } },
    };
  });

  const totalValueCell = ws.getCell(`I${totalRowIdx}`);
  totalValueCell.value =
    liquidation.items.length > 0
      ? { formula: `SUM(I${firstDataRow}:I${lastDataRow})`, result: liquidation.totalLiquidacion }
      : 0;
  totalValueCell.numFmt = '#,##0.00';
  totalValueCell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF0F172A' } };
  totalValueCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDCEEF5' },
  };
  totalValueCell.alignment = { horizontal: 'right', vertical: 'middle' };
  totalValueCell.border = {
    top: { style: 'medium', color: { argb: 'FF0F172A' } },
    bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
    left: { style: 'medium', color: { argb: 'FF0F172A' } },
    right: { style: 'medium', color: { argb: 'FF0F172A' } },
  };

  // Worksheet 2: Fiscal / Tax Breakdown (prepared for accounting upload)
  const wsTax = wb.addWorksheet('Detalle Impuestos');
  wsTax.columns = [
    { header: 'Fecha Doc.', width: 13 },
    { header: 'Serie', width: 13 },
    { header: 'No. Doc.', width: 16 },
    { header: 'NIT', width: 14 },
    { header: 'Proveedor', width: 26 },
    { header: 'Moneda', width: 14 },
    { header: 'Aplica Impuestos', width: 16 },
    { header: '% Impuesto', width: 12 },
    { header: 'Base Sin Impuesto', width: 18 },
    { header: 'Monto Impuesto', width: 16 },
    { header: 'Valor Factura', width: 15 },
    { header: 'Tipo Cambio', width: 13 },
    { header: 'Valor Reintegrar', width: 16 },
    { header: 'Categoría', width: 20 },
    { header: 'Centro de Costo', width: 24 },
    { header: 'Comprobante Adjunto', width: 26 },
  ];

  const taxHeaderRow = wsTax.getRow(1);
  taxHeaderRow.height = 24;
  taxHeaderRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF132B63' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  liquidation.items.forEach((item) => {
    const row = wsTax.addRow([
      item.fechaDoc,
      item.serieDoc,
      item.noDoc,
      item.nit,
      item.proveedor,
      item.moneda,
      item.aplicaImpuestos ? 'Sí' : 'No',
      item.aplicaImpuestos ? item.porcentajeImpuesto : 0,
      roundMoney(item.valorSinImpuesto),
      roundMoney(item.montoImpuesto),
      roundMoney(item.valorFactura),
      roundExchangeRate(item.tipoCambio),
      roundMoney(item.valorReintegrar),
      item.categoria,
      resolvedCostCenter || 'Sin asignar',
      item.attachmentName || 'Sin archivo adjunto',
    ]);
    [9, 10, 11, 13].forEach((cIdx) => {
      row.getCell(cIdx).numFmt = '#,##0.00';
      row.getCell(cIdx).alignment = { horizontal: 'right', vertical: 'middle' };
    });
    row.getCell(12).numFmt = '#,##0.00##';
    row.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  const buffer = await wb.xlsx.writeBuffer();
  const bytes = new Uint8Array(buffer);
  const filename = `Liquidacion_Viaticos_Sem${sanitizeFileSlug(
    liquidation.semana || '00'
  )}_${sanitizeFileSlug(liquidation.consultorNombre)}.xlsx`;
  return { bytes, filename };
}

export async function exportViaticosExcel(
  liquidation: ViaticoLiquidation,
  costCenter?: string
): Promise<string> {
  const { bytes, filename } = await generateViaticosExcelBytes(liquidation, costCenter);
  const blob = new Blob([new Uint8Array(bytes)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, filename);
  return filename;
}

function drawCanvasWithExifOrientation(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  orientation: number
): string | null {
  const swapsAxes = orientation >= 5 && orientation <= 8;
  const targetW = swapsAxes ? srcH : srcW;
  const targetH = swapsAxes ? srcW : srcH;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);

  switch (orientation) {
    case 2:
      ctx.transform(-1, 0, 0, 1, targetW, 0);
      break;
    case 3:
      ctx.transform(-1, 0, 0, -1, targetW, targetH);
      break;
    case 4:
      ctx.transform(1, 0, 0, -1, 0, targetH);
      break;
    case 5:
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      ctx.transform(0, 1, -1, 0, targetW, 0);
      break;
    case 7:
      ctx.transform(0, -1, -1, 0, targetW, targetH);
      break;
    case 8:
      ctx.transform(0, -1, 1, 0, 0, targetH);
      break;
    default:
      break;
  }

  ctx.drawImage(source, 0, 0, srcW, srcH);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/**
 * Normalizes any browser-supported image dataUrl into clean upright PNG/JPEG bytes
 * suitable for embedding inside pdf-lib (explicitly baking JPEG EXIF Orientation
 * so vertical phone photos never appear rotated horizontally inside the PDF).
 */
async function convertDataUrlToEmbeddableImage(
  dataUrl: string,
  mimeType: string
): Promise<{ bytes: Uint8Array; format: 'jpeg' | 'png' } | null> {
  const cleanMime = mimeType.toLowerCase();

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const buf = new Uint8Array(await blob.arrayBuffer());

    if (cleanMime === 'image/png') {
      return { bytes: buf, format: 'png' };
    }

    const exifOrientation =
      cleanMime === 'image/jpeg' || cleanMime === 'image/jpg'
        ? readJpegExifOrientation(buf)
        : 1;

    // Only skip canvas normalization for standard upright (EXIF=1) JPEGs
    if ((cleanMime === 'image/jpeg' || cleanMime === 'image/jpg') && exifOrientation === 1) {
      return { bytes: buf, format: 'jpeg' };
    }

    // Bake EXIF orientation deterministically using raw pixels ('none') + EXIF transform
    if (typeof createImageBitmap === 'function') {
      try {
        const rawBitmap = await createImageBitmap(blob, {
          imageOrientation: 'none',
        } as ImageBitmapOptions);
        try {
          const jpegUrl = drawCanvasWithExifOrientation(
            rawBitmap,
            rawBitmap.width,
            rawBitmap.height,
            exifOrientation
          );
          if (jpegUrl) {
            const outRes = await fetch(jpegUrl);
            return {
              bytes: new Uint8Array(await outRes.arrayBuffer()),
              format: 'jpeg',
            };
          }
        } finally {
          rawBitmap.close?.();
        }
      } catch {
        // Fallback below if browser does not support imageOrientation: 'none'
      }
    }
  } catch {
    // Fall through to HTMLImageElement decoding
  }

  // Fallback: browser <img> auto-orients EXIF / converts WebP cleanly via HTMLCanvasElement
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const jpegUrl = drawCanvasWithExifOrientation(
          img,
          img.naturalWidth || img.width,
          img.naturalHeight || img.height,
          1
        );
        if (!jpegUrl) {
          resolve(null);
          return;
        }
        const res = await fetch(jpegUrl);
        resolve({ bytes: new Uint8Array(await res.arrayBuffer()), format: 'jpeg' });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

function toAsciiSafe(text: string): string {
  // pdf-lib StandardFonts (Helvetica) use WinAnsi encoding; replace unsupported characters safely
  return String(text || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2014|\u2013/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\xFF]/g, ' ');
}

function truncateText(text: string, maxLen: number): string {
  const safe = toAsciiSafe(text).trim();
  if (safe.length <= maxLen) return safe;
  return `${safe.slice(0, maxLen - 3)}...`;
}

/**
 * Generates a single compiled PDF containing:
 *  - Page 1: Corporate Premex Viáticos Cover & Itemized Summary
 *  - Subsequent Pages: Every attached receipt image (fitted cleanly with header metadata)
 *    AND every page of attached PDF invoices merged directly via pdf-lib!
 */
export async function generateViaticosReceiptsPdfBytes(
  liquidation: ViaticoLiquidation,
  mediaMap: Record<string, StoredReceiptMedia>
): Promise<{ bytes: Uint8Array; filename: string; embeddedCount: number; totalItems: number }> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const premexNavy = rgb(0.075, 0.169, 0.388); // #132B63
  const premexBlue = rgb(0.118, 0.376, 0.659); // #1E60A8
  const slateDark = rgb(0.06, 0.09, 0.16);
  const slateMuted = rgb(0.39, 0.45, 0.55);
  const borderLight = rgb(0.85, 0.89, 0.94);
  const headerTint = rgb(0.84, 0.93, 0.96);

  // Page 1: Cover & Summary Sheet (Letter: 612 x 792 pt)
  let coverPage = pdfDoc.addPage([612, 792]);
  const { width, height } = coverPage.getSize();

  // Top Premex Navy Banner
  coverPage.drawRectangle({
    x: 0,
    y: height - 86,
    width,
    height: 86,
    color: premexNavy,
  });

  // Optional Premex Logo on cover
  const logoBytes = await fetchPremexLogoBytes();
  if (logoBytes) {
    try {
      const logoImg = await pdfDoc.embedPng(logoBytes);
      coverPage.drawRectangle({
        x: width - 92,
        y: height - 74,
        width: 58,
        height: 58,
        color: rgb(1, 1, 1),
      });
      coverPage.drawImage(logoImg, {
        x: width - 89,
        y: height - 71,
        width: 52,
        height: 52,
      });
    } catch {
      // skip logo if png decode fails
    }
  }

  coverPage.drawText('PREMEX - COMPROBANTES DE LIQUIDACION DE VIATICOS', {
    x: 36,
    y: height - 38,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  coverPage.drawText(
    truncateText(
      `${liquidation.lineaLiquidacion}  |  Semana #${liquidation.semana}  |  ${liquidation.empresa}`,
      76
    ),
    {
      x: 36,
      y: height - 58,
      size: 10,
      font: fontRegular,
      color: rgb(0.82, 0.9, 1),
    }
  );

  // Metadata Box
  let y = height - 114;
  coverPage.drawText('LIQUIDACION:', { x: 36, y, size: 9, font: fontBold, color: slateMuted });
  coverPage.drawText(truncateText(liquidation.lineaLiquidacion, 60), {
    x: 120,
    y,
    size: 10,
    font: fontBold,
    color: slateDark,
  });

  coverPage.drawText('SEMANA #:', { x: 430, y, size: 9, font: fontBold, color: slateMuted });
  coverPage.drawText(truncateText(liquidation.semana || '-', 12), {
    x: 495,
    y,
    size: 10,
    font: fontBold,
    color: slateDark,
  });

  y -= 20;
  coverPage.drawText('CONSULTOR:', { x: 36, y, size: 9, font: fontBold, color: slateMuted });
  coverPage.drawText(truncateText(liquidation.consultorNombre, 52), {
    x: 120,
    y,
    size: 10,
    font: fontBold,
    color: slateDark,
  });

  coverPage.drawText('MONEDA BASE:', { x: 430, y, size: 9, font: fontBold, color: slateMuted });
  const pdfCurrencyLabel =
    liquidation.monedaBase === 'Dólares' &&
    liquidation.tipoCambioLiquidacion &&
    liquidation.tipoCambioLiquidacion > 0
      ? `${liquidation.monedaBase} (T/C ${roundExchangeRate(
          liquidation.tipoCambioLiquidacion
        )})`
      : liquidation.monedaBase;
  coverPage.drawText(truncateText(toAsciiSafe(pdfCurrencyLabel), 24), {
    x: 500,
    y,
    size: 9,
    font: fontBold,
    color: premexBlue,
  });

  y -= 20;
  coverPage.drawText('CORREO:', { x: 36, y, size: 9, font: fontBold, color: slateMuted });
  coverPage.drawText(truncateText(liquidation.consultorEmail || '-', 55), {
    x: 120,
    y,
    size: 9,
    font: fontRegular,
    color: slateDark,
  });

  coverPage.drawText('TOTAL REINTEGRAR:', {
    x: 360,
    y,
    size: 9,
    font: fontBold,
    color: premexNavy,
  });
  coverPage.drawText(
    toAsciiSafe(formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)),
    {
      x: 472,
      y,
      size: 11,
      font: fontBold,
      color: premexNavy,
    }
  );

  // Summary Table Header
  y -= 28;
  coverPage.drawRectangle({
    x: 36,
    y: y - 6,
    width: width - 72,
    height: 20,
    color: headerTint,
    borderColor: borderLight,
    borderWidth: 0.75,
  });

  const drawSummaryHeaders = (page: typeof coverPage, rowY: number) => {
    page.drawText('#', { x: 42, y: rowY, size: 8, font: fontBold, color: slateDark });
    page.drawText('Fecha', { x: 60, y: rowY, size: 8, font: fontBold, color: slateDark });
    page.drawText('Doc / NIT', { x: 112, y: rowY, size: 8, font: fontBold, color: slateDark });
    page.drawText('Proveedor', { x: 192, y: rowY, size: 8, font: fontBold, color: slateDark });
    page.drawText('Categoria', { x: 318, y: rowY, size: 8, font: fontBold, color: slateDark });
    page.drawText('Imp.', { x: 405, y: rowY, size: 8, font: fontBold, color: slateDark });
    page.drawText('Reintegrar', { x: 446, y: rowY, size: 8, font: fontBold, color: slateDark });
    page.drawText('Soporte', { x: 515, y: rowY, size: 8, font: fontBold, color: slateDark });
  };

  drawSummaryHeaders(coverPage, y);
  y -= 20;

  let embeddedCount = 0;

  liquidation.items.forEach((item, idx) => {
    if (y < 72) {
      coverPage = pdfDoc.addPage([612, 792]);
      y = 740;
      coverPage.drawRectangle({
        x: 36,
        y: y - 6,
        width: width - 72,
        height: 20,
        color: headerTint,
      });
      drawSummaryHeaders(coverPage, y);
      y -= 20;
    }

    const hasMedia = Boolean(item.attachmentId && mediaMap[item.attachmentId]);
    coverPage.drawText(String(idx + 1), { x: 42, y, size: 8, font: fontRegular, color: slateMuted });
    coverPage.drawText(truncateText(item.fechaDoc || '-', 12), {
      x: 60,
      y,
      size: 8,
      font: fontRegular,
      color: slateDark,
    });
    coverPage.drawText(
      truncateText([item.serieDoc, item.noDoc].filter(Boolean).join('-') || '-', 15),
      { x: 112, y, size: 8, font: fontRegular, color: slateDark }
    );
    coverPage.drawText(truncateText(item.proveedor || '-', 24), {
      x: 192,
      y,
      size: 8,
      font: fontBold,
      color: slateDark,
    });
    coverPage.drawText(truncateText(item.categoria, 16), {
      x: 318,
      y,
      size: 8,
      font: fontRegular,
      color: slateDark,
    });
    coverPage.drawText(item.aplicaImpuestos ? 'Si' : 'No', {
      x: 408,
      y,
      size: 8,
      font: fontRegular,
      color: item.aplicaImpuestos ? premexBlue : slateMuted,
    });
    coverPage.drawText(toAsciiSafe(formatViaticoAmount(item.valorReintegrar)), {
      x: 446,
      y,
      size: 8,
      font: fontBold,
      color: slateDark,
    });
    coverPage.drawText(hasMedia ? 'Adjunto' : 'Manual', {
      x: 515,
      y,
      size: 8,
      font: hasMedia ? fontBold : fontRegular,
      color: hasMedia ? rgb(0.05, 0.52, 0.35) : slateMuted,
    });

    coverPage.drawLine({
      start: { x: 36, y: y - 5 },
      end: { x: width - 36, y: y - 5 },
      thickness: 0.5,
      color: borderLight,
    });

    y -= 18;
  });

  // Footer Total Strip on summary page
  y -= 8;
  coverPage.drawRectangle({
    x: 330,
    y: y - 8,
    width: width - 366,
    height: 24,
    color: headerTint,
    borderColor: premexNavy,
    borderWidth: 0.8,
  });
  coverPage.drawText('TOTAL LIQUIDACION:', {
    x: 340,
    y: y,
    size: 9,
    font: fontBold,
    color: premexNavy,
  });
  coverPage.drawText(
    toAsciiSafe(formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)),
    {
      x: 465,
      y: y,
      size: 10,
      font: fontBold,
      color: premexNavy,
    }
  );

  // Append every attached receipt image or PDF page (deduplicated so a bulk/shared document is attached only once)
  const seenAttachmentIds = new Set<string>();
  for (let idx = 0; idx < liquidation.items.length; idx++) {
    const item = liquidation.items[idx];
    if (!item.attachmentId) continue;
    if (seenAttachmentIds.has(item.attachmentId)) continue;
    const media = mediaMap[item.attachmentId];
    if (!media || !media.dataUrl) continue;
    seenAttachmentIds.add(item.attachmentId);

    const matchingItems = liquidation.items
      .map((it, i) => ({ it, num: i + 1 }))
      .filter((entry) => entry.it.attachmentId === item.attachmentId);

    const mime = (media.mimeType || '').toLowerCase();

    if (mime === 'application/pdf' || media.fileName.toLowerCase().endsWith('.pdf')) {
      try {
        const res = await fetch(media.dataUrl);
        const pdfBytes = await res.arrayBuffer();
        const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const srcPages = srcDoc.getPages();

        for (let pIdx = 0; pIdx < srcPages.length; pIdx++) {
          const srcPage = srcPages[pIdx];
          const embeddedPage = await pdfDoc.embedPage(srcPage);
          // Always keep compiled PDF sheets strictly Vertical Letter [612, 792]
          const added = pdfDoc.addPage([612, 792]);
          const { width: pw, height: ph } = added.getSize();
          const topBannerH = pIdx === 0 ? 26 : 0;

          if (pIdx === 0) {
            added.drawRectangle({
              x: 0,
              y: ph - 22,
              width: pw,
              height: 22,
              color: premexNavy,
            });
            const pdfBannerText =
              matchingItems.length > 1
                ? `Soportes #${matchingItems.map((m) => m.num).join(', #')} (${matchingItems.length} facturas) | ${media.fileName}`
                : `Soporte #${idx + 1} | ${item.fechaDoc} | ${item.proveedor} | ${item.noDoc} | ${formatViaticoAmount(
                    item.valorReintegrar,
                    liquidation.monedaBase,
                    true
                  )}`;
            added.drawText(
              truncateText(pdfBannerText, 92),
              {
                x: 14,
                y: ph - 15,
                size: 8,
                font: fontBold,
                color: rgb(1, 1, 1),
              }
            );
          }

          const rot = ((srcPage.getRotation().angle % 360) + 360) % 360;
          const rawW = embeddedPage.width || 612;
          const rawH = embeddedPage.height || 792;
          const effW = rot === 90 || rot === 270 ? rawH : rawW;
          const effH = rot === 90 || rot === 270 ? rawW : rawH;

          const pad = 18;
          const availW = pw - pad * 2;
          const availH = ph - topBannerH - pad * 2;
          const scale = Math.min(availW / effW, availH / effH);

          const drawW = rawW * scale;
          const drawH = rawH * scale;
          const visualW = effW * scale;
          const visualH = effH * scale;
          const boxLeft = (pw - visualW) / 2;
          const boxBottom = pad + (availH - visualH) / 2;

          if (rot === 90) {
            added.drawPage(embeddedPage, {
              x: boxLeft,
              y: boxBottom + visualH,
              width: drawW,
              height: drawH,
              rotate: degrees(-90),
            });
          } else if (rot === 180) {
            added.drawPage(embeddedPage, {
              x: boxLeft + visualW,
              y: boxBottom + visualH,
              width: drawW,
              height: drawH,
              rotate: degrees(180),
            });
          } else if (rot === 270) {
            added.drawPage(embeddedPage, {
              x: boxLeft + visualW,
              y: boxBottom,
              width: drawW,
              height: drawH,
              rotate: degrees(90),
            });
          } else {
            added.drawPage(embeddedPage, {
              x: boxLeft,
              y: boxBottom,
              width: drawW,
              height: drawH,
            });
          }
        }
        embeddedCount++;
      } catch (err) {
        console.warn('Could not merge attached PDF receipt:', media.fileName, err);
      }
    } else {
      const converted = await convertDataUrlToEmbeddableImage(media.dataUrl, mime);
      if (!converted) continue;

      try {
        const embeddedImg =
          converted.format === 'png'
            ? await pdfDoc.embedPng(converted.bytes)
            : await pdfDoc.embedJpg(converted.bytes);

        const page = pdfDoc.addPage([612, 792]);
        const { width: pw, height: ph } = page.getSize();

        // Top metadata banner
        page.drawRectangle({
          x: 0,
          y: ph - 66,
          width: pw,
          height: 66,
          color: premexNavy,
        });
        page.drawText(
          truncateText(
            `COMPROBANTE #${idx + 1} - ${item.proveedor || 'Factura'}`,
            65
          ),
          {
            x: 32,
            y: ph - 26,
            size: 11,
            font: fontBold,
            color: rgb(1, 1, 1),
          }
        );
        page.drawText(
          truncateText(
            `Fecha: ${item.fechaDoc || '-'}  |  Serie/No: ${
              [item.serieDoc, item.noDoc].filter(Boolean).join('-') || '-'
            }  |  NIT: ${item.nit || '-'}  |  Monto: ${formatViaticoAmount(
              item.valorFactura,
              item.moneda,
              true
            )} (Reintegro: ${formatViaticoAmount(
              item.valorReintegrar,
              liquidation.monedaBase,
              true
            )})`,
            98
          ),
          {
            x: 32,
            y: ph - 43,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.84, 0.91, 1),
          }
        );
        page.drawText(
          truncateText(
            `Categoria: ${item.categoria}  |  Cliente: ${item.clienteContacto || '-'}  |  Impuestos: ${
              item.aplicaImpuestos ? `Si (${item.porcentajeImpuesto}%)` : 'No'
            }`,
            98
          ),
          {
            x: 32,
            y: ph - 57,
            size: 8,
            font: fontRegular,
            color: rgb(0.75, 0.85, 0.98),
          }
        );

        // Fit image crisply inside remaining area
        const margin = 32;
        const maxW = pw - margin * 2;
        const maxH = ph - 66 - 52;
        const dims = embeddedImg.scale(1);
        const scale = Math.min(maxW / dims.width, maxH / dims.height, 1.5);
        const drawW = dims.width * scale;
        const drawH = dims.height * scale;
        const xPos = (pw - drawW) / 2;
        const yPos = 32 + (maxH - drawH) / 2;

        page.drawRectangle({
          x: xPos - 4,
          y: yPos - 4,
          width: drawW + 8,
          height: drawH + 8,
          borderColor: borderLight,
          borderWidth: 1,
        });

        page.drawImage(embeddedImg, {
          x: xPos,
          y: yPos,
          width: drawW,
          height: drawH,
        });

        embeddedCount++;
      } catch (err) {
        console.warn('Could not embed receipt image into PDF:', media.fileName, err);
      }
    }
  }

  const pdfBytes = await pdfDoc.save();
  const bytes = new Uint8Array(pdfBytes);
  const filename = `Comprobantes_Viaticos_Sem${sanitizeFileSlug(
    liquidation.semana || '00'
  )}_${sanitizeFileSlug(liquidation.consultorNombre)}.pdf`;

  return { bytes, filename, embeddedCount, totalItems: liquidation.items.length };
}

export async function exportViaticosReceiptsPdf(
  liquidation: ViaticoLiquidation,
  mediaMap: Record<string, StoredReceiptMedia>
): Promise<{ filename: string; embeddedCount: number; totalItems: number }> {
  const { bytes, filename, embeddedCount, totalItems } = await generateViaticosReceiptsPdfBytes(
    liquidation,
    mediaMap
  );
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  triggerBlobDownload(blob, filename);
  return { filename, embeddedCount, totalItems };
}

function wrapPdfText(
  text: string,
  font: { widthOfTextAtSize: (t: string, size: number) => number },
  fontSize: number,
  maxWidth: number,
  maxLines = 4
): string[] {
  const safe = toAsciiSafe(text).replace(/\s+/g, ' ').trim();
  if (!safe) return [''];
  if (font.widthOfTextAtSize(safe, fontSize) <= maxWidth) return [safe];

  const words = safe.split(' ');
  const lines: string[] = [];
  let current = '';

  const pushWrappedToken = (token: string) => {
    if (font.widthOfTextAtSize(token, fontSize) <= maxWidth) {
      current = token;
      return;
    }
    let slice = '';
    for (const ch of token) {
      if (font.widthOfTextAtSize(slice + ch, fontSize) <= maxWidth) {
        slice += ch;
      } else {
        if (slice) lines.push(slice);
        slice = ch;
        if (lines.length >= maxLines) return;
      }
    }
    current = slice;
  };

  for (const word of words) {
    if (lines.length >= maxLines) break;
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (lines.length >= maxLines) {
        current = '';
        break;
      }
      pushWrappedToken(word);
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    let trimmed = last;
    while (trimmed.length > 3 && font.widthOfTextAtSize(`${trimmed}...`, fontSize) > maxWidth) {
      trimmed = trimmed.slice(0, -1);
    }
    if (trimmed.length < last.length || words.join(' ').length > lines.join(' ').length) {
      lines[maxLines - 1] = `${trimmed.replace(/\.+$/, '')}...`;
    }
  }

  return lines.length > 0 ? lines : [''];
}

/**
 * Generates a crisp Landscape Letter PDF faithfully reproducing the official Premex
 * Excel Viáticos worksheet (Cabecera LIQUIDACIÓN / SEMANA # / NOMBRE / CENTRO DE COSTO,
 * Premex logo, exact 14-column grid with #B7DEE8 shading, Total Liquidación row,
 * tax breakdown, and corporate approval signature lines) ready to print or preview.
 */
export async function generateViaticosPlanillaPdfBytes(
  liquidation: ViaticoLiquidation,
  costCenter?: string
): Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string }> {
  const resolvedCostCenter = String(costCenter ?? liquidation.centroCosto ?? '').trim();
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 792; // Landscape Letter (11 x 8.5 in)
  const pageH = 612;
  const marginX = 24;
  const bottomLimit = 46;

  const premexNavy = rgb(0.075, 0.169, 0.388); // #132B63
  const slateDark = rgb(0.06, 0.09, 0.16);
  const slateMuted = rgb(0.38, 0.45, 0.54);
  const gridLine = rgb(0.22, 0.28, 0.36);
  const lightLine = rgb(0.75, 0.8, 0.86);
  const excelHeaderBg = rgb(0.718, 0.871, 0.91); // #B7DEE8
  const excelTotalBg = rgb(0.863, 0.933, 0.961); // #DCEEF5
  const zebraBg = rgb(0.976, 0.984, 0.994);

  // 14 columns summing exactly to 744pt (792 - 24*2)
  const columns: {
    label: string;
    width: number;
    align: 'left' | 'center' | 'right';
    bold?: boolean;
  }[] = [
    { label: 'Fecha Doc.', width: 44, align: 'center' },
    { label: 'Serie Doc.', width: 42, align: 'left' },
    { label: 'No. Doc.', width: 54, align: 'left' },
    { label: 'NIT', width: 42, align: 'left' },
    { label: 'Proveedor', width: 76, align: 'left' },
    { label: 'Moneda', width: 44, align: 'center' },
    { label: 'Valor Factura', width: 44, align: 'right' },
    { label: 'T.C.', width: 30, align: 'right' },
    { label: 'Valor Reintegrar', width: 48, align: 'right', bold: true },
    { label: 'Categoria', width: 58, align: 'left' },
    { label: 'Cliente / Contacto', width: 78, align: 'left', bold: true },
    { label: 'Objetivo Comercial', width: 74, align: 'left' },
    { label: 'Descripcion del Gasto', width: 80, align: 'left' },
    { label: 'Km', width: 30, align: 'center' },
  ];

  const colOffsets: number[] = [];
  let accX = marginX;
  columns.forEach((c) => {
    colOffsets.push(accX);
    accX += c.width;
  });
  const totalTableW = accX - marginX;

  let embeddedLogo: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  const logoBytes = await fetchPremexLogoBytes();
  if (logoBytes) {
    try {
      embeddedLogo = await pdfDoc.embedPng(logoBytes);
    } catch {
      embeddedLogo = null;
    }
  }

  const statusLabel =
    liquidation.estado === 'enviada'
      ? 'Cerrada y Enviada'
      : liquidation.estado === 'cerrada'
      ? 'Cerrada'
      : 'Abierta (Borrador)';

  const drawPageHeader = (page: ReturnType<typeof pdfDoc.addPage>, isFirstPage: boolean): number => {
    if (isFirstPage) {
      // Top Left Form Fields matching official Premex Excel layout
      const labelX = marginX;
      const valX = marginX + 94;
      const valW = 248;

      const drawHeaderLine = (
        rowY: number,
        label: string,
        value: string,
        centerValue = false
      ) => {
        page.drawText(label, {
          x: labelX,
          y: rowY,
          size: 8.5,
          font: fontBold,
          color: slateDark,
        });
        const cleanVal = truncateText(value || '-', 48);
        const textW = fontRegular.widthOfTextAtSize(cleanVal, 8.5);
        const drawX = centerValue ? valX + Math.max(0, (valW - textW) / 2) : valX + 4;
        page.drawText(cleanVal, {
          x: drawX,
          y: rowY,
          size: 8.5,
          font: centerValue ? fontBold : fontRegular,
          color: slateDark,
        });
        page.drawLine({
          start: { x: valX, y: rowY - 3 },
          end: { x: valX + valW, y: rowY - 3 },
          thickness: 0.75,
          color: gridLine,
        });
      };

      drawHeaderLine(pageH - 36, 'LIQUIDACION', liquidation.lineaLiquidacion || 'Sin titulo');
      drawHeaderLine(pageH - 53, 'SEMANA #', liquidation.semana || '-', true);
      drawHeaderLine(pageH - 70, 'NOMBRE:', liquidation.consultorNombre || '-', true);
      drawHeaderLine(
        pageH - 87,
        'CENTRO COSTO:',
        resolvedCostCenter || 'Sin asignar',
        false
      );

      // Center Premex Logo + Tagline
      const logoX = marginX + 368;
      if (embeddedLogo) {
        page.drawImage(embeddedLogo, {
          x: logoX,
          y: pageH - 88,
          width: 56,
          height: 56,
        });
      }
      const tagX = embeddedLogo ? logoX + 64 : logoX;
      page.drawText('NOURISHING', {
        x: tagX,
        y: pageH - 48,
        size: 8.5,
        font: fontBold,
        color: slateMuted,
      });
      page.drawText('POSSIBILITIES', {
        x: tagX,
        y: pageH - 60,
        size: 8.5,
        font: fontBold,
        color: slateMuted,
      });
      page.drawText('TOGETHER', {
        x: tagX,
        y: pageH - 72,
        size: 8.5,
        font: fontBold,
        color: slateMuted,
      });

      // Right Corporate Metadata
      const rightMeta = [
        `Empresa: ${truncateText(liquidation.empresa || '-', 32)}`,
        `Moneda base: ${truncateText(liquidation.monedaBase, 24)}`,
        `Estado: ${statusLabel}`,
        `Impresion: ${new Date().toLocaleDateString('es-GT')}`,
      ];
      rightMeta.forEach((line, idx) => {
        const w = fontRegular.widthOfTextAtSize(line, 7.5);
        page.drawText(line, {
          x: pageW - marginX - w,
          y: pageH - 36 - idx * 14,
          size: 7.5,
          font: idx === 0 ? fontBold : fontRegular,
          color: idx === 0 ? premexNavy : slateMuted,
        });
      });

      return pageH - 104;
    }

    // Continuation Page Compact Header
    page.drawText(
      truncateText(
        `PREMEX · PLANILLA DE VIATICOS (Continuacion) · ${liquidation.lineaLiquidacion} · Sem #${liquidation.semana || '-'} · ${liquidation.consultorNombre}`,
        118
      ),
      {
        x: marginX,
        y: pageH - 32,
        size: 8.5,
        font: fontBold,
        color: premexNavy,
      }
    );
    return pageH - 46;
  };

  const drawTableHeader = (page: ReturnType<typeof pdfDoc.addPage>, topY: number): number => {
    const headerH = 24;
    const bottomY = topY - headerH;
    page.drawRectangle({
      x: marginX,
      y: bottomY,
      width: totalTableW,
      height: headerH,
      color: excelHeaderBg,
      borderColor: gridLine,
      borderWidth: 0.8,
    });

    columns.forEach((col, i) => {
      const x = colOffsets[i];
      if (i > 0) {
        page.drawLine({
          start: { x, y: bottomY },
          end: { x, y: topY },
          thickness: 0.6,
          color: gridLine,
        });
      }
      const lines = wrapPdfText(col.label, fontBold, 6.8, col.width - 5, 2);
      const totalTextH = lines.length * 8.2;
      const startTextY = bottomY + (headerH + totalTextH) / 2 - 6.8;
      lines.forEach((ln, li) => {
        const lw = fontBold.widthOfTextAtSize(ln, 6.8);
        page.drawText(ln, {
          x: x + Math.max(2, (col.width - lw) / 2),
          y: startTextY - li * 8.2,
          size: 6.8,
          font: fontBold,
          color: slateDark,
        });
      });
    });

    return bottomY;
  };

  let page = pdfDoc.addPage([pageW, pageH]);
  let cursorY = drawPageHeader(page, true);
  cursorY = drawTableHeader(page, cursorY);

  const cellFontSize = 6.6;
  const lineH = 8.4;

  const rowsToDraw =
    liquidation.items.length > 0
      ? liquidation.items.map((item) => [
          item.fechaDoc || '',
          item.serieDoc || '',
          item.noDoc || '',
          item.nit || '',
          item.proveedor || '',
          item.moneda || '',
          formatViaticoAmount(item.valorFactura),
          formatViaticoAmount(item.tipoCambio),
          formatViaticoAmount(item.valorReintegrar),
          item.categoria || '',
          item.clienteContacto || '',
          item.objetivoComercial || '',
          item.descripcionGasto || '',
          item.kilometraje || '',
        ])
      : [['Sin facturas registradas', '', '', '', '', '', '', '', '', '', '', '', '', '']];

  rowsToDraw.forEach((cells, rowIdx) => {
    const wrappedPerCol = cells.map((val, colIdx) => {
      const col = columns[colIdx];
      const fontToUse = col.bold ? fontBold : fontRegular;
      return wrapPdfText(val, fontToUse, cellFontSize, col.width - 5, 4);
    });
    const maxLineCount = Math.max(1, ...wrappedPerCol.map((ls) => ls.length));
    const rowH = Math.max(16, maxLineCount * lineH + 6);

    if (cursorY - rowH < bottomLimit) {
      page = pdfDoc.addPage([pageW, pageH]);
      cursorY = drawPageHeader(page, false);
      cursorY = drawTableHeader(page, cursorY);
    }

    const rowBottom = cursorY - rowH;
    if (rowIdx % 2 === 1) {
      page.drawRectangle({
        x: marginX,
        y: rowBottom,
        width: totalTableW,
        height: rowH,
        color: zebraBg,
      });
    }

    // Row border box
    page.drawRectangle({
      x: marginX,
      y: rowBottom,
      width: totalTableW,
      height: rowH,
      borderColor: lightLine,
      borderWidth: 0.55,
    });

    wrappedPerCol.forEach((lines, colIdx) => {
      const col = columns[colIdx];
      const x = colOffsets[colIdx];
      const fontToUse = col.bold ? fontBold : fontRegular;

      if (colIdx > 0) {
        page.drawLine({
          start: { x, y: rowBottom },
          end: { x, y: cursorY },
          thickness: 0.45,
          color: lightLine,
        });
      }

      const blockH = lines.length * lineH;
      const startY = rowBottom + (rowH + blockH) / 2 - cellFontSize - 0.5;
      lines.forEach((ln, li) => {
        const lw = fontToUse.widthOfTextAtSize(ln, cellFontSize);
        let drawX = x + 3;
        if (col.align === 'right') {
          drawX = x + col.width - lw - 3;
        } else if (col.align === 'center') {
          drawX = x + Math.max(2, (col.width - lw) / 2);
        }
        page.drawText(ln, {
          x: drawX,
          y: startY - li * lineH,
          size: cellFontSize,
          font: fontToUse,
          color: slateDark,
        });
      });
    });

    cursorY = rowBottom;
  });

  // Blank separator row + Total Liquidación row + Fiscal Summary + Signatures
  const footerNeededH = 122;
  if (cursorY - footerNeededH < bottomLimit) {
    page = pdfDoc.addPage([pageW, pageH]);
    cursorY = drawPageHeader(page, false);
  }

  // Blank separator row matching Premex Excel template
  const spacerH = 10;
  page.drawRectangle({
    x: marginX,
    y: cursorY - spacerH,
    width: totalTableW,
    height: spacerH,
    borderColor: lightLine,
    borderWidth: 0.5,
  });
  cursorY -= spacerH;

  // Total Liquidación Row (Merged cols F..H + Total under col I)
  const totalRowH = 20;
  const totalBottom = cursorY - totalRowH;
  const labelBoxX = colOffsets[5]; // Moneda..T.C.
  const labelBoxW = columns[5].width + columns[6].width + columns[7].width;
  const totalBoxX = colOffsets[8]; // Valor Reintegrar
  const totalBoxW = columns[8].width;

  page.drawRectangle({
    x: labelBoxX,
    y: totalBottom,
    width: labelBoxW,
    height: totalRowH,
    color: rgb(1, 1, 1),
    borderColor: slateDark,
    borderWidth: 1.1,
  });
  const totalLbl = 'Total Liquidacion';
  const totalLblW = fontBold.widthOfTextAtSize(totalLbl, 8.2);
  page.drawText(totalLbl, {
    x: labelBoxX + (labelBoxW - totalLblW) / 2,
    y: totalBottom + 6.5,
    size: 8.2,
    font: fontBold,
    color: slateDark,
  });

  page.drawRectangle({
    x: totalBoxX,
    y: totalBottom,
    width: totalBoxW,
    height: totalRowH,
    color: excelTotalBg,
    borderColor: slateDark,
    borderWidth: 1.1,
  });
  const totalNumStr = toAsciiSafe(formatViaticoAmount(liquidation.totalLiquidacion));
  const totalNumW = fontBold.widthOfTextAtSize(totalNumStr, 8.2);
  page.drawText(totalNumStr, {
    x: totalBoxX + totalBoxW - totalNumW - 3,
    y: totalBottom + 6.5,
    size: 8.2,
    font: fontBold,
    color: premexNavy,
  });

  // Currency summary text to the right of total cell
  const totalWithCurrency = toAsciiSafe(
    `${formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)} (${
      liquidation.monedaBase
    })`
  );
  page.drawText(totalWithCurrency, {
    x: totalBoxX + totalBoxW + 8,
    y: totalBottom + 6.5,
    size: 8,
    font: fontBold,
    color: premexNavy,
  });

  // Compact Fiscal Breakdown Strip
  const taxStripY = totalBottom - 24;
  page.drawRectangle({
    x: marginX,
    y: taxStripY,
    width: totalTableW,
    height: 18,
    color: rgb(0.96, 0.975, 0.99),
    borderColor: lightLine,
    borderWidth: 0.6,
  });
  const fiscalLine = toAsciiSafe(
    `Resumen Fiscal:  Comprobantes: ${liquidation.items.length}   |   Con Impuestos: ${formatViaticoAmount(
      liquidation.totalConImpuestos,
      liquidation.monedaBase,
      true
    )}   |   Impuesto Estimado (IVA): ${formatViaticoAmount(
      liquidation.totalImpuestos,
      liquidation.monedaBase,
      true
    )}   |   Sin Impuestos: ${formatViaticoAmount(
      liquidation.totalSinImpuestos,
      liquidation.monedaBase,
      true
    )}`
  );
  page.drawText(fiscalLine, {
    x: marginX + 8,
    y: taxStripY + 5.5,
    size: 7.4,
    font: fontRegular,
    color: slateDark,
  });

  // Corporate Approval Signature Lines
  const sigY = taxStripY - 46;
  const sigW = 200;
  const sigPositions = [
    { x: marginX + 18, title: 'Elaborado por / Consultor', sub: liquidation.consultorNombre },
    { x: marginX + 272, title: 'Revisado por / Jefatura', sub: 'Firma y fecha de autorizacion' },
    { x: marginX + 526, title: 'Recibido / Contabilidad', sub: resolvedCostCenter ? `C.C.: ${resolvedCostCenter}` : 'Registro contable Odoo' },
  ];
  sigPositions.forEach((sig) => {
    page.drawLine({
      start: { x: sig.x, y: sigY + 18 },
      end: { x: sig.x + sigW, y: sigY + 18 },
      thickness: 0.75,
      color: gridLine,
    });
    const titleW = fontBold.widthOfTextAtSize(sig.title, 7.6);
    page.drawText(sig.title, {
      x: sig.x + (sigW - titleW) / 2,
      y: sigY + 7,
      size: 7.6,
      font: fontBold,
      color: slateDark,
    });
    const subTxt = truncateText(sig.sub || '', 36);
    const subW = fontRegular.widthOfTextAtSize(subTxt, 6.8);
    page.drawText(subTxt, {
      x: sig.x + (sigW - subW) / 2,
      y: sigY - 3,
      size: 6.8,
      font: fontRegular,
      color: slateMuted,
    });
  });

  // Stamp footer page numbers on every page
  const allPages = pdfDoc.getPages();
  allPages.forEach((p, idx) => {
    const leftFooter = toAsciiSafe(
      `Suite Corporativa Premex · Planilla Imprimible de Viaticos · ${liquidation.empresa}`
    );
    const rightFooter = `Pagina ${idx + 1} de ${allPages.length}`;
    p.drawText(leftFooter, {
      x: marginX,
      y: 18,
      size: 7,
      font: fontRegular,
      color: slateMuted,
    });
    const rw = fontRegular.widthOfTextAtSize(rightFooter, 7);
    p.drawText(rightFooter, {
      x: pageW - marginX - rw,
      y: 18,
      size: 7,
      font: fontBold,
      color: slateMuted,
    });
  });

  const pdfBytes = await pdfDoc.save();
  const filename = `Planilla_Imprimible_Sem${sanitizeFileSlug(
    liquidation.semana || '00'
  )}_${sanitizeFileSlug(liquidation.consultorNombre)}.pdf`;

  return { bytes: new Uint8Array(pdfBytes), filename };
}

export async function exportViaticosPlanillaPdf(
  liquidation: ViaticoLiquidation,
  costCenter?: string
): Promise<string> {
  const { bytes, filename } = await generateViaticosPlanillaPdfBytes(liquidation, costCenter);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  triggerBlobDownload(blob, filename);
  return filename;
}

export const DEFAULT_VIATICOS_EMAIL_GREETING =
  'Estimado equipo de Contabilidad y Tesorería,';

export function formatViaticosEmailGreeting(recipientGreetingName?: string): string {
  const clean = String(recipientGreetingName || '').trim();
  if (!clean) return DEFAULT_VIATICOS_EMAIL_GREETING;
  return `Estimado ${clean},`;
}

export function applyGreetingToViaticosEmailBody(
  bodyText: string,
  recipientGreetingName?: string
): string {
  const nextGreeting = formatViaticosEmailGreeting(recipientGreetingName);
  const lines = String(bodyText || '').split('\n');
  if (lines.length === 0) return nextGreeting;
  if (/^\s*estimad[oa]s?\b/i.test(lines[0])) {
    if (lines[0].trim() === nextGreeting) return bodyText;
    lines[0] = nextGreeting;
    return lines.join('\n');
  }
  return bodyText;
}

export function buildViaticosEmailDraft(
  liquidation: ViaticoLiquidation,
  _costCenter?: string,
  recipientGreetingName?: string
): {
  subject: string;
  body: string;
} {
  const totalFormatted = formatViaticoAmount(
    liquidation.totalLiquidacion,
    liquidation.monedaBase,
    true
  );

  const subject = `Liquidación de Viáticos - Semana #${liquidation.semana || '-'} - ${
    liquidation.consultorNombre
  } (${liquidation.lineaLiquidacion})`;

  const body = [
    formatViaticosEmailGreeting(recipientGreetingName),
    '',
    'Se remite el cierre formal de la siguiente Liquidación de Viáticos:',
    '',
    `• Liquidación: ${liquidation.lineaLiquidacion}`,
    `• Semana #: ${liquidation.semana || '-'}`,
    `• Consultor: ${liquidation.consultorNombre} (${liquidation.consultorEmail || 'Sin correo'})`,
    `• Empresa / Sociedad: ${liquidation.empresa}`,
    `• Cantidad de comprobantes: ${liquidation.items.length}`,
    `• TOTAL LIQUIDACIÓN A REINTEGRAR: ${totalFormatted}`,
    '',
    'Se adjuntan a este correo los archivos oficiales descargados desde la Suite Premex:',
    '1. Archivo Excel (.xlsx) diligenciado con el formato oficial Premex y detalle de impuestos.',
    '2. Planilla imprimible en PDF (.pdf) y/o PDF compilado con todas las imágenes y facturas adjuntas.',
    '',
    'Saludos cordiales,',
    liquidation.consultorNombre,
  ].join('\n');

  return { subject, body };
}
