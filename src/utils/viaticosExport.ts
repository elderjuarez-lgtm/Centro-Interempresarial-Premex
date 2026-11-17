import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ViaticoLiquidation } from '../types';
import { StoredReceiptMedia } from '../services/viaticosMediaStore';
import { formatViaticoAmount, roundMoney } from './viaticos';
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
export async function exportViaticosExcel(
  liquidation: ViaticoLiquidation
): Promise<string> {
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
  ws.getCell('L3').value = `Moneda base: ${liquidation.monedaBase}`;
  ws.getCell('L3').font = { name: 'Calibri', size: 9, color: { argb: 'FF475569' } };
  ws.getCell('L3').alignment = { horizontal: 'right', vertical: 'middle' };

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
      roundMoney(item.tipoCambio),
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

      if (colIdx === 6 || colIdx === 7 || colIdx === 8) {
        cell.numFmt = '#,##0.00';
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

  // Worksheet 2: Fiscal / Tax Breakdown (prepared for upcoming accounting upload)
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
      roundMoney(item.tipoCambio),
      roundMoney(item.valorReintegrar),
      item.categoria,
      item.attachmentName || 'Sin archivo adjunto',
    ]);
    [9, 10, 11, 12, 13].forEach((cIdx) => {
      row.getCell(cIdx).numFmt = '#,##0.00';
      row.getCell(cIdx).alignment = { horizontal: 'right', vertical: 'middle' };
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const filename = `Liquidacion_Viaticos_Sem${sanitizeFileSlug(
    liquidation.semana || '00'
  )}_${sanitizeFileSlug(liquidation.consultorNombre)}.xlsx`;
  triggerBlobDownload(blob, filename);
  return filename;
}

/**
 * Normalizes any browser-supported image dataUrl into clean PNG/JPEG bytes
 * suitable for embedding inside pdf-lib.
 */
async function convertDataUrlToEmbeddableImage(
  dataUrl: string,
  mimeType: string
): Promise<{ bytes: Uint8Array; format: 'jpeg' | 'png' } | null> {
  const cleanMime = mimeType.toLowerCase();

  // Direct fast-path for standard JPEG / PNG
  if (cleanMime === 'image/jpeg' || cleanMime === 'image/jpg' || cleanMime === 'image/png') {
    try {
      const res = await fetch(dataUrl);
      const buf = new Uint8Array(await res.arrayBuffer());
      return {
        bytes: buf,
        format: cleanMime === 'image/png' ? 'png' : 'jpeg',
      };
    } catch {
      // fall through to canvas conversion
    }
  }

  // Convert WebP / other image formats cleanly via HTMLCanvasElement
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = async () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const jpegUrl = canvas.toDataURL('image/jpeg', 0.92);
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
export async function exportViaticosReceiptsPdf(
  liquidation: ViaticoLiquidation,
  mediaMap: Record<string, StoredReceiptMedia>
): Promise<{ filename: string; embeddedCount: number; totalItems: number }> {
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
  coverPage.drawText(truncateText(liquidation.monedaBase, 16), {
    x: 508,
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

  // Append every attached receipt image or PDF page
  for (let idx = 0; idx < liquidation.items.length; idx++) {
    const item = liquidation.items[idx];
    if (!item.attachmentId) continue;
    const media = mediaMap[item.attachmentId];
    if (!media || !media.dataUrl) continue;

    const mime = (media.mimeType || '').toLowerCase();

    if (mime === 'application/pdf' || media.fileName.toLowerCase().endsWith('.pdf')) {
      try {
        const res = await fetch(media.dataUrl);
        const pdfBytes = await res.arrayBuffer();
        const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const pageIndices = srcDoc.getPageIndices();
        const copiedPages = await pdfDoc.copyPages(srcDoc, pageIndices);
        copiedPages.forEach((copied, pIdx) => {
          const added = pdfDoc.addPage(copied);
          const { width: pw, height: ph } = added.getSize();
          // Subtle header ribbon on first page of embedded PDF
          if (pIdx === 0) {
            added.drawRectangle({
              x: 0,
              y: ph - 22,
              width: pw,
              height: 22,
              color: premexNavy,
            });
            added.drawText(
              truncateText(
                `Soporte #${idx + 1} | ${item.fechaDoc} | ${item.proveedor} | ${item.noDoc} | ${formatViaticoAmount(
                  item.valorReintegrar,
                  liquidation.monedaBase,
                  true
                )}`,
                92
              ),
              {
                x: 14,
                y: ph - 15,
                size: 8,
                font: fontBold,
                color: rgb(1, 1, 1),
              }
            );
          }
        });
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
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const filename = `Comprobantes_Viaticos_Sem${sanitizeFileSlug(
    liquidation.semana || '00'
  )}_${sanitizeFileSlug(liquidation.consultorNombre)}.pdf`;
  triggerBlobDownload(blob, filename);

  return { filename, embeddedCount, totalItems: liquidation.items.length };
}

export function buildViaticosEmailDraft(liquidation: ViaticoLiquidation): {
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

  const lines = liquidation.items.map(
    (item, idx) =>
      `${idx + 1}. ${item.fechaDoc || '-'} | ${item.proveedor} | Doc: ${
        [item.serieDoc, item.noDoc].filter(Boolean).join('-') || '-'
      } | ${item.categoria} | ${formatViaticoAmount(
        item.valorReintegrar,
        liquidation.monedaBase,
        true
      )}${item.aplicaImpuestos ? ' (Con impuestos)' : ' (Sin impuestos)'}`
  );

  const body = [
    'Estimado equipo de Contabilidad y Tesorería,',
    '',
    'Se remite el cierre formal de la siguiente Liquidación de Viáticos:',
    '',
    `• Liquidación: ${liquidation.lineaLiquidacion}`,
    `• Semana #: ${liquidation.semana || '-'}`,
    `• Consultor: ${liquidation.consultorNombre} (${liquidation.consultorEmail || 'Sin correo'})`,
    `• Empresa / Sociedad: ${liquidation.empresa}`,
    `• Cantidad de comprobantes: ${liquidation.items.length}`,
    `• Total con impuestos: ${formatViaticoAmount(
      liquidation.totalConImpuestos,
      liquidation.monedaBase,
      true
    )} (Impuesto estimado: ${formatViaticoAmount(
      liquidation.totalImpuestos,
      liquidation.monedaBase,
      true
    )})`,
    `• Total sin impuestos: ${formatViaticoAmount(
      liquidation.totalSinImpuestos,
      liquidation.monedaBase,
      true
    )}`,
    `• TOTAL LIQUIDACIÓN A REINTEGRAR: ${totalFormatted}`,
    '',
    'Detalle resumido de gastos:',
    ...lines,
    '',
    'Se adjuntan a este correo los dos archivos oficiales descargados desde la Suite Premex:',
    '1. Archivo Excel (.xlsx) diligenciado con el formato oficial Premex y detalle de impuestos.',
    '2. Archivo PDF (.pdf) compilado con todas las imágenes y facturas adjuntas.',
    '',
    'Saludos cordiales,',
    liquidation.consultorNombre,
  ].join('\n');

  return { subject, body };
}
