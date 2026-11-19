import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
  BankCurrency,
  BankMatchGroup,
  BankReconciliationSummary,
  BankStatementItem,
  BookLedgerItem,
  SapBalanceRow,
  SapOpenItem,
} from '../types';
import {
  RECONCILING_SECTION_META,
  formatAccountProductLine,
  formatAccountSapHeaderLine,
  formatOfficialCellAmount,
  formatOfficialMonthBanner,
  formatSheetDate,
  getEffectiveSapItemSection,
  getSapDocumentClassLabel,
} from './bankReconciliation';

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1200);
};

const sanitizeSlug = (raw: string): string =>
  String(raw || 'Premex')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || 'Premex';

const getExcelNumFmt = (currency: BankCurrency): string => {
  if (currency === 'COP') return '"$" * #,##0;"$" * (#,##0);"$" * "-"';
  if (currency === 'GTQ') return '"Q" * #,##0.00;"Q" * (#,##0.00);"Q" * "-"';
  if (currency === 'EUR') return '"€" * #,##0.00;"€" * (#,##0.00);"€" * "-"';
  if (currency === 'MXN') return '"MX$" * #,##0.00;"MX$" * (#,##0.00);"MX$" * "-"';
  return '"US$" * #,##0.00;"US$" * (#,##0.00);"US$" * "-"';
};

const toAsciiPdf = (raw: string): string =>
  String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();

const OLIVE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFC4D79B' },
};
const CYAN_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFCCFFFF' },
};
const SOFT_HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF132B63' },
};
const THIN_DARK: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FF1E293B' },
};
const MED_DARK: Partial<ExcelJS.Border> = {
  style: 'medium',
  color: { argb: 'FF0F172A' },
};
const DOUBLE_DARK: Partial<ExcelJS.Border> = {
  style: 'double',
  color: { argb: 'FF0F172A' },
};

/**
 * Sheet 1: Exact Corporate Deliverable `Conciliacion Bancos` with LIVE Excel Formulas.
 */
const populateOfficialExcelSheet = (
  ws: ExcelJS.Worksheet,
  summary: BankReconciliationSummary,
  selectedMonth: string
) => {
  if (!summary.account) return;
  const acc = summary.account;
  const numFmt = getExcelNumFmt(acc.moneda);
  const cutoffFormatted = formatSheetDate(summary.fechaCorte);
  const monthBanner = formatOfficialMonthBanner(selectedMonth);

  ws.views = [{ showGridLines: true }];
  ws.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
  };

  ws.columns = [
    { width: 15 }, // A: DTO (Libros)
    { width: 13 }, // B: FECHA (Libros)
    { width: 36 }, // C: CONCEPTO (Libros)
    { width: 19 }, // D: VALOR (Libros)
    { width: 15 }, // E: DTO (Extracto)
    { width: 13 }, // F: FECHA (Extracto)
    { width: 36 }, // G: CONCEPTO (Extracto)
    { width: 19 }, // H: VALOR (Extracto)
  ];

  // Header Banner Rows 1..6 (exact Premex corporate olive header)
  const headerLines = [
    { text: acc.sociedad.toUpperCase(), size: 15, height: 26 },
    { text: 'CONCILIACION DE BANCOS', size: 11, height: 19 },
    { text: acc.banco.toUpperCase(), size: 11, height: 19 },
    { text: formatAccountProductLine(acc), size: 11, height: 19 },
    { text: formatAccountSapHeaderLine(acc), size: 10.5, height: 18 },
    { text: monthBanner, size: 11, height: 22 },
  ];

  headerLines.forEach((line, idx) => {
    const r = idx + 1;
    ws.mergeCells(r, 1, r, 8);
    const cell = ws.getCell(r, 1);
    cell.value = line.text;
    cell.font = { name: 'Calibri', size: line.size, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(r).height = line.height;
    for (let c = 1; c <= 8; c += 1) {
      const cCell = ws.getCell(r, c);
      cCell.fill = OLIVE_FILL;
      cCell.border = {
        top: r === 1 ? MED_DARK : undefined,
        left: c === 1 ? MED_DARK : undefined,
        right: c === 8 ? MED_DARK : undefined,
        bottom: r === 6 ? MED_DARK : undefined,
      };
    }
  });

  // Row 7: Column Headers
  const colTitles = ['DTO.', 'FECHA', 'CONCEPTO', 'VALOR', 'DTO.', 'FECHA', 'CONCEPTO', 'VALOR'];
  ws.getRow(7).height = 22;
  colTitles.forEach((title, idx) => {
    const c = idx + 1;
    const cell = ws.getCell(7, c);
    cell.value = title;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF000000' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = OLIVE_FILL;
    cell.border = {
      top: MED_DARK,
      bottom: MED_DARK,
      left: c === 1 || c === 5 ? MED_DARK : THIN_DARK,
      right: c === 8 ? MED_DARK : THIN_DARK,
    };
  });

  const applySideRowBorders = (rowIdx: number) => {
    for (let c = 1; c <= 8; c += 1) {
      ws.getCell(rowIdx, c).border = {
        left: c === 1 || c === 5 ? MED_DARK : THIN_DARK,
        right: c === 8 ? MED_DARK : THIN_DARK,
      };
    }
  };

  // Row 8: Spacer
  ws.getRow(8).height = 14;
  applySideRowBorders(8);

  // Row 9: SALDO EN LIBROS (white + double underline) | SALDO EN EXTRACTO (#C4D79B + double underline)
  ws.getRow(9).height = 23;
  applySideRowBorders(9);
  ws.getCell(9, 2).value = cutoffFormatted;
  ws.getCell(9, 2).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(9, 2).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(9, 3).value = 'SALDO EN LIBROS';
  ws.getCell(9, 3).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(9, 3).alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getCell(9, 4).value = summary.saldoLibros;
  ws.getCell(9, 4).numFmt = numFmt;
  ws.getCell(9, 4).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(9, 4).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(9, 4).border = {
    top: MED_DARK,
    bottom: DOUBLE_DARK,
    left: MED_DARK,
    right: MED_DARK,
  };

  ws.getCell(9, 6).value = cutoffFormatted;
  ws.getCell(9, 6).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(9, 6).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(9, 7).value = 'SALDO EN EXTRACTO';
  ws.getCell(9, 7).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(9, 7).alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getCell(9, 8).value = summary.saldoExtracto;
  ws.getCell(9, 8).numFmt = numFmt;
  ws.getCell(9, 8).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(9, 8).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(9, 8).fill = OLIVE_FILL;
  ws.getCell(9, 8).border = {
    top: MED_DARK,
    bottom: DOUBLE_DARK,
    left: MED_DARK,
    right: MED_DARK,
  };

  // Row 10: Spacer
  ws.getRow(10).height = 14;
  applySideRowBorders(10);

  const masNd = summary.officialLines.masNotasDebito;
  const menosChq = summary.officialLines.menosCheques;
  const menosNc = summary.officialLines.menosNotasCredito;
  const masCons = summary.officialLines.masConsignaciones;

  const block1SubRow = 11;
  const block1StartRow = 12;
  const block1Count = Math.max(4, masNd.length, menosChq.length);
  const block1EndRow = block1StartRow + block1Count - 1;

  // Row 11: Section 1 Subtotals with LIVE SUM FORMULAS
  ws.getRow(block1SubRow).height = 22;
  applySideRowBorders(block1SubRow);
  ws.getCell(block1SubRow, 2).value = 'MAS';
  ws.getCell(block1SubRow, 2).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block1SubRow, 2).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(block1SubRow, 3).value = 'NOTAS DEBITO NO CONTABILIZADAS';
  ws.getCell(block1SubRow, 3).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block1SubRow, 4).value = {
    formula: `SUM(D${block1StartRow}:D${block1EndRow})`,
    result: summary.notasCreditoNoContabilizadas,
  };
  ws.getCell(block1SubRow, 4).numFmt = numFmt;
  ws.getCell(block1SubRow, 4).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block1SubRow, 4).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(block1SubRow, 4).fill = CYAN_FILL;
  ws.getCell(block1SubRow, 4).border = {
    top: MED_DARK,
    bottom: MED_DARK,
    left: MED_DARK,
    right: MED_DARK,
  };

  ws.getCell(block1SubRow, 6).value = 'MENOS';
  ws.getCell(block1SubRow, 6).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block1SubRow, 6).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(block1SubRow, 7).value = 'CHEQUES PENDIENTES';
  ws.getCell(block1SubRow, 7).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block1SubRow, 8).value = {
    formula: `SUM(H${block1StartRow}:H${block1EndRow})`,
    result: summary.chequesEnTransito,
  };
  ws.getCell(block1SubRow, 8).numFmt = numFmt;
  ws.getCell(block1SubRow, 8).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block1SubRow, 8).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(block1SubRow, 8).fill = CYAN_FILL;
  ws.getCell(block1SubRow, 8).border = {
    top: MED_DARK,
    bottom: MED_DARK,
    left: MED_DARK,
    right: MED_DARK,
  };

  // Detail Block 1
  for (let i = 0; i < block1Count; i += 1) {
    const r = block1StartRow + i;
    ws.getRow(r).height = 19;
    applySideRowBorders(r);
    const leftItem = masNd[i];
    const rightItem = menosChq[i];

    if (leftItem) {
      ws.getCell(r, 1).value = leftItem.dto;
      ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 2).value = formatSheetDate(leftItem.fecha);
      ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 3).value = leftItem.concepto;
      ws.getCell(r, 4).value = leftItem.valor;
      ws.getCell(r, 4).numFmt = numFmt;
      ws.getCell(r, 4).alignment = { horizontal: 'right', vertical: 'middle' };
      for (let c = 1; c <= 4; c += 1) ws.getCell(r, c).font = { name: 'Calibri', size: 9.5 };
    }

    if (rightItem) {
      ws.getCell(r, 5).value = rightItem.dto;
      ws.getCell(r, 5).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 6).value = formatSheetDate(rightItem.fecha);
      ws.getCell(r, 6).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 7).value = rightItem.concepto;
      ws.getCell(r, 8).value = rightItem.valor;
      ws.getCell(r, 8).numFmt = numFmt;
      ws.getCell(r, 8).alignment = { horizontal: 'right', vertical: 'middle' };
      for (let c = 5; c <= 8; c += 1) ws.getCell(r, c).font = { name: 'Calibri', size: 9.5 };
    }
  }

  // Section 2 Subtotals with LIVE SUM FORMULAS
  const block2SubRow = block1EndRow + 1;
  const block2StartRow = block2SubRow + 1;
  const block2Count = Math.max(3, menosNc.length, masCons.length);
  const block2EndRow = block2StartRow + block2Count - 1;

  ws.getRow(block2SubRow).height = 22;
  applySideRowBorders(block2SubRow);
  ws.getCell(block2SubRow, 2).value = 'MENOS';
  ws.getCell(block2SubRow, 2).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block2SubRow, 2).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(block2SubRow, 3).value = 'NOTAS CREDITO NO CONTABILIZADAS';
  ws.getCell(block2SubRow, 3).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block2SubRow, 4).value = {
    formula: `SUM(D${block2StartRow}:D${block2EndRow})`,
    result: summary.notasDebitoNoContabilizadas,
  };
  ws.getCell(block2SubRow, 4).numFmt = numFmt;
  ws.getCell(block2SubRow, 4).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block2SubRow, 4).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(block2SubRow, 4).fill = CYAN_FILL;
  ws.getCell(block2SubRow, 4).border = {
    top: MED_DARK,
    bottom: MED_DARK,
    left: MED_DARK,
    right: MED_DARK,
  };

  ws.getCell(block2SubRow, 6).value = 'MAS';
  ws.getCell(block2SubRow, 6).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block2SubRow, 6).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getCell(block2SubRow, 7).value = 'CONSIGNACIONES PENDIENTES';
  ws.getCell(block2SubRow, 7).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block2SubRow, 8).value = {
    formula: `SUM(H${block2StartRow}:H${block2EndRow})`,
    result: summary.depositosEnTransito,
  };
  ws.getCell(block2SubRow, 8).numFmt = numFmt;
  ws.getCell(block2SubRow, 8).font = { name: 'Calibri', size: 10, bold: true };
  ws.getCell(block2SubRow, 8).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(block2SubRow, 8).fill = CYAN_FILL;
  ws.getCell(block2SubRow, 8).border = {
    top: MED_DARK,
    bottom: MED_DARK,
    left: MED_DARK,
    right: MED_DARK,
  };

  // Detail Block 2
  for (let i = 0; i < block2Count; i += 1) {
    const r = block2StartRow + i;
    ws.getRow(r).height = 19;
    applySideRowBorders(r);
    const leftItem = menosNc[i];
    const rightItem = masCons[i];

    if (leftItem) {
      ws.getCell(r, 1).value = leftItem.dto;
      ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 2).value = formatSheetDate(leftItem.fecha);
      ws.getCell(r, 2).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 3).value = leftItem.concepto;
      ws.getCell(r, 4).value = leftItem.valor;
      ws.getCell(r, 4).numFmt = numFmt;
      ws.getCell(r, 4).alignment = { horizontal: 'right', vertical: 'middle' };
      for (let c = 1; c <= 4; c += 1) ws.getCell(r, c).font = { name: 'Calibri', size: 9.5 };
    }

    if (rightItem) {
      ws.getCell(r, 5).value = rightItem.dto;
      ws.getCell(r, 5).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 6).value = formatSheetDate(rightItem.fecha);
      ws.getCell(r, 6).alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getCell(r, 7).value = rightItem.concepto;
      ws.getCell(r, 8).value = rightItem.valor;
      ws.getCell(r, 8).numFmt = numFmt;
      ws.getCell(r, 8).alignment = { horizontal: 'right', vertical: 'middle' };
      for (let c = 5; c <= 8; c += 1) ws.getCell(r, c).font = { name: 'Calibri', size: 9.5 };
    }
  }

  // Final Row: TOTAL CONCILIADO with LIVE EXCEL FORMULAS
  const totalRow = block2EndRow + 1;
  ws.getRow(totalRow).height = 24;
  ws.getCell(totalRow, 3).value = 'TOTAL CONCILIADO';
  ws.getCell(totalRow, 4).value = {
    formula: `D9+D${block1SubRow}-D${block2SubRow}`,
    result: summary.saldoConciliadoLibros,
  };
  ws.getCell(totalRow, 4).numFmt = numFmt;
  ws.getCell(totalRow, 4).alignment = { horizontal: 'right', vertical: 'middle' };

  ws.getCell(totalRow, 7).value = 'TOTAL CONCILIADO';
  ws.getCell(totalRow, 8).value = {
    formula: `H9-H${block1SubRow}+H${block2SubRow}`,
    result: summary.saldoConciliadoExtracto,
  };
  ws.getCell(totalRow, 8).numFmt = numFmt;
  ws.getCell(totalRow, 8).alignment = { horizontal: 'right', vertical: 'middle' };

  for (let c = 1; c <= 8; c += 1) {
    const cell = ws.getCell(totalRow, c);
    cell.fill = OLIVE_FILL;
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FF000000' } };
    cell.border = {
      top: MED_DARK,
      bottom: MED_DARK,
      left: c === 1 || c === 5 ? MED_DARK : THIN_DARK,
      right: c === 8 ? MED_DARK : THIN_DARK,
    };
  }

  // Verification footer row with LIVE DIFERENCIA formula
  const diffRowIdx = totalRow + 2;
  ws.getRow(diffRowIdx).height = 20;
  ws.mergeCells(diffRowIdx, 1, diffRowIdx, 6);
  ws.getCell(diffRowIdx, 1).value =
    Math.abs(summary.diferenciaNeta) <= 1
      ? 'VERIFICACION DE CUADRE: CONCILIACION CUADRADA'
      : 'VERIFICACION DE CUADRE: EXISTE DIFERENCIA POR REVISAR';
  ws.getCell(diffRowIdx, 1).font = {
    name: 'Calibri',
    size: 9.5,
    bold: true,
    color: { argb: Math.abs(summary.diferenciaNeta) <= 1 ? 'FF166534' : 'FFB91C1C' },
  };
  ws.getCell(diffRowIdx, 7).value = 'DIFERENCIA NETA';
  ws.getCell(diffRowIdx, 7).font = { name: 'Calibri', size: 9.5, bold: true };
  ws.getCell(diffRowIdx, 7).alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getCell(diffRowIdx, 8).value = {
    formula: `D${totalRow}-H${totalRow}`,
    result: summary.diferenciaNeta,
  };
  ws.getCell(diffRowIdx, 8).numFmt = numFmt;
  ws.getCell(diffRowIdx, 8).font = {
    name: 'Calibri',
    size: 10,
    bold: true,
    color: { argb: Math.abs(summary.diferenciaNeta) <= 1 ? 'FF166534' : 'FFB91C1C' },
  };
  ws.getCell(diffRowIdx, 8).alignment = { horizontal: 'right', vertical: 'middle' };
};

export interface SapDeliverableWorkbookOptions {
  activeSummary: BankReconciliationSummary;
  centerSummaries: BankReconciliationSummary[];
  sapOpenItems: SapOpenItem[];
  sapBalanceRows: SapBalanceRow[];
  statementItems?: BankStatementItem[];
  ledgerItems?: BookLedgerItem[];
  matches?: BankMatchGroup[];
  selectedMonth: string;
  scopeLabel: string;
}

const styleStandardTableHeader = (row: ExcelJS.Row) => {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = SOFT_HEADER_FILL;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: THIN_DARK,
      bottom: MED_DARK,
      left: THIN_DARK,
      right: THIN_DARK,
    };
  });
};

/**
 * Generates the complete 5-sheet Corporate Deliverable Excel (.xlsx) with LIVE formulas:
 * 1. Conciliacion Bancos
 * 2. Centro Conciliaciones
 * 3. Partidas Abiertas SAP
 * 4. Balance 00-01-02
 * 5. Cruce Bilateral (when bilateral matches/records exist)
 */
export const exportSapDeliverableWorkbook = async (
  opts: SapDeliverableWorkbookOptions
): Promise<string> => {
  const {
    activeSummary,
    centerSummaries,
    sapOpenItems,
    sapBalanceRows,
    statementItems = [],
    ledgerItems = [],
    matches = [],
    selectedMonth,
    scopeLabel,
  } = opts;

  if (!activeSummary.account) return '';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Centro Interempresarial Premex';
  wb.created = new Date();

  // Sheet 1: Conciliacion Bancos (active bank official deliverable with live formulas)
  const wsOfficial = wb.addWorksheet('Conciliacion Bancos');
  populateOfficialExcelSheet(wsOfficial, activeSummary, selectedMonth);

  // Sheet 2: Centro Conciliaciones (all accounts in selected society filter)
  const wsCentro = wb.addWorksheet('Centro Conciliaciones');
  wsCentro.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  wsCentro.columns = [
    { header: 'Cod. Soc.', key: 'codSoc', width: 11 },
    { header: 'Sociedad', key: 'sociedad', width: 22 },
    { header: 'Banco', key: 'banco', width: 24 },
    { header: 'No. Cuenta', key: 'cuenta', width: 18 },
    { header: 'Cta. Mayor 00', key: 'cta00', width: 15 },
    { header: 'Moneda', key: 'moneda', width: 9 },
    { header: 'Saldo Cta 00', key: 's00', width: 17 },
    { header: 'Saldo Cta 01', key: 's01', width: 16 },
    { header: 'Saldo Cta 02', key: 's02', width: 16 },
    { header: 'Saldo Libros', key: 'libros', width: 17 },
    { header: 'Saldo Extracto', key: 'extracto', width: 17 },
    { header: 'Conc. Libros', key: 'concLibros', width: 17 },
    { header: 'Conc. Extracto', key: 'concExtracto', width: 17 },
    { header: 'Diferencia', key: 'diff', width: 15 },
    { header: 'Estado', key: 'estado', width: 14 },
  ];
  styleStandardTableHeader(wsCentro.getRow(1));

  const validCenter = centerSummaries.filter((s) => Boolean(s.account));
  validCenter.forEach((s) => {
    if (!s.account) return;
    const isOk = Math.abs(s.diferenciaNeta) <= 1;
    const row = wsCentro.addRow({
      codSoc: s.account.codigoSociedad || '-',
      sociedad: s.account.sociedad,
      banco: s.account.banco,
      cuenta: s.account.numeroCuenta,
      cta00: s.account.cuentaMayor00 || s.account.codigoContable || '-',
      moneda: s.account.moneda,
      s00: s.saldoCuenta00,
      s01: s.saldoCuenta01,
      s02: s.saldoCuenta02,
      libros: s.saldoLibros,
      extracto: s.saldoExtracto,
      concLibros: s.saldoConciliadoLibros,
      concExtracto: s.saldoConciliadoExtracto,
      diff: s.diferenciaNeta,
      estado: isOk ? 'CUADRADA' : 'POR REVISAR',
    });
    const nf = getExcelNumFmt(s.account.moneda);
    for (let c = 7; c <= 14; c += 1) {
      row.getCell(c).numFmt = nf;
      row.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' };
    }
    row.getCell(15).font = {
      name: 'Calibri',
      size: 9.5,
      bold: true,
      color: { argb: isOk ? 'FF166534' : 'FFB91C1C' },
    };
  });

  // Sheet 3: Partidas Abiertas SAP (FBL3N)
  const wsPartidas = wb.addWorksheet('Partidas Abiertas SAP');
  wsPartidas.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  wsPartidas.columns = [
    { header: 'Sociedad', key: 'soc', width: 11 },
    { header: 'Razón Social', key: 'socName', width: 22 },
    { header: 'Cta. Mayor', key: 'ctaMayor', width: 15 },
    { header: 'Subcuenta', key: 'sub', width: 11 },
    { header: 'Clase Doc.', key: 'clase', width: 11 },
    { header: 'Desc. Clase', key: 'claseDesc', width: 22 },
    { header: 'Sección Entregable', key: 'seccion', width: 32 },
    { header: 'Nº Documento', key: 'numDoc', width: 16 },
    { header: 'Referencia', key: 'ref', width: 16 },
    { header: 'Clave Ref. 1', key: 'ref1', width: 14 },
    { header: 'Tercero (Clave Ref. 3)', key: 'ref3', width: 26 },
    { header: 'Fecha Doc.', key: 'fDoc', width: 13 },
    { header: 'Fe. Contab.', key: 'fCont', width: 13 },
    { header: 'Importe ML', key: 'importe', width: 18 },
    { header: 'Moneda', key: 'moneda', width: 9 },
    { header: 'Texto', key: 'texto', width: 34 },
  ];
  styleStandardTableHeader(wsPartidas.getRow(1));

  sapOpenItems.forEach((item) => {
    const effSection = getEffectiveSapItemSection(item);
    const row = wsPartidas.addRow({
      soc: item.sociedadCodigo,
      socName: item.sociedadNombre,
      ctaMayor: item.cuentaMayor,
      sub: item.subcuentaTipo,
      clase: item.claseDocumento,
      claseDesc: getSapDocumentClassLabel(item.claseDocumento),
      seccion: `${RECONCILING_SECTION_META[effSection].signLabel} · ${RECONCILING_SECTION_META[effSection].title}`,
      numDoc: item.numeroDocumento,
      ref: item.referencia,
      ref1: item.claveRef1,
      ref3: item.claveRef3,
      fDoc: formatSheetDate(item.fechaDocumento),
      fCont: formatSheetDate(item.fechaContabilizacion),
      importe: item.importeMonedaLocal,
      moneda: item.monedaLocal,
      texto: item.texto,
    });
    row.getCell(14).numFmt = getExcelNumFmt(item.monedaLocal);
    row.getCell(14).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Sheet 4: Balance 00-01-02
  const wsBal = wb.addWorksheet('Balance 00-01-02');
  wsBal.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  wsBal.columns = [
    { header: 'Sociedad', key: 'soc', width: 12 },
    { header: 'Razón Social', key: 'socName', width: 24 },
    { header: 'Cta.mayor', key: 'cta', width: 16 },
    { header: 'Raíz Contable', key: 'raiz', width: 14 },
    { header: 'Subcuenta', key: 'sub', width: 11 },
    { header: 'Denominación cuenta', key: 'denom', width: 42 },
    { header: 'Nuevo Saldo', key: 'saldo', width: 19 },
    { header: 'Moneda', key: 'moneda', width: 10 },
    { header: 'Periodo', key: 'mes', width: 16 },
  ];
  styleStandardTableHeader(wsBal.getRow(1));

  sapBalanceRows.forEach((b) => {
    const row = wsBal.addRow({
      soc: b.sociedadCodigo,
      socName: b.sociedadNombre,
      cta: b.cuentaMayor,
      raiz: b.raizContable,
      sub: b.subcuentaTipo,
      denom: b.denominacion,
      saldo: b.nuevoSaldo,
      moneda: b.moneda,
      mes: b.mes,
    });
    row.getCell(7).numFmt = getExcelNumFmt(b.moneda);
    row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Sheet 5: Cruce Bilateral (included whenever bilateral matches exist)
  if (matches.length > 0) {
    const wsCruce = wb.addWorksheet('Cruce Bilateral');
    wsCruce.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    wsCruce.columns = [
      { header: '#', key: 'idx', width: 6 },
      { header: 'Periodo', key: 'mes', width: 16 },
      { header: 'Método', key: 'method', width: 22 },
      { header: 'Ref. Extracto', key: 'refBank', width: 24 },
      { header: 'Valor Extracto', key: 'valBank', width: 18 },
      { header: 'Comp. Libros', key: 'refLedger', width: 24 },
      { header: 'Tercero', key: 'tercero', width: 28 },
      { header: 'Valor Libros', key: 'valLedger', width: 18 },
      { header: 'Nota', key: 'note', width: 28 },
    ];
    styleStandardTableHeader(wsCruce.getRow(1));
    const bankMap = new Map(statementItems.map((b) => [b.id, b]));
    const ledgerMap = new Map(ledgerItems.map((l) => [l.id, l]));

    matches.forEach((m, idx) => {
      const bList = m.bankItemIds
        .map((id) => bankMap.get(id))
        .filter(Boolean) as BankStatementItem[];
      const lList = m.ledgerItemIds
        .map((id) => ledgerMap.get(id))
        .filter(Boolean) as BookLedgerItem[];
      wsCruce.addRow({
        idx: idx + 1,
        mes: m.mes,
        method:
          m.method === 'automatico_ref'
            ? 'Automático (Ref)'
            : m.method === 'automatico_valor'
            ? 'Automático (Valor/Fecha)'
            : 'Manual',
        refBank: bList.map((b) => b.referencia).join(', '),
        valBank: bList.reduce((s, b) => s + (b.tipo === 'CREDITO' ? b.valor : -b.valor), 0),
        refLedger: lList.map((l) => l.comprobante).join(', '),
        tercero: lList.map((l) => l.tercero).join(', '),
        valLedger: lList.reduce((s, l) => s + (l.tipo === 'DEBITO' ? l.valor : -l.valor), 0),
        note: m.note || '',
      });
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `Conciliacion_Bancos_SAP_${sanitizeSlug(scopeLabel)}_${sanitizeSlug(
    selectedMonth === 'ALL' ? 'Consolidado' : selectedMonth
  )}.xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, filename);
  return filename;
};

/**
 * Backward-compatible wrapper used by BankPrintPreviewModal.
 */
export const exportOfficialBankReconciliationExcel = async (
  summaries: BankReconciliationSummary[],
  scopeLabel: string,
  selectedMonth: string
): Promise<string> => {
  const valid = summaries.filter((s) => Boolean(s.account));
  if (valid.length === 0) return '';
  return exportSapDeliverableWorkbook({
    activeSummary: valid[0],
    centerSummaries: valid,
    sapOpenItems: valid.flatMap((s) => s.scopedSapItems),
    sapBalanceRows: [],
    selectedMonth,
    scopeLabel,
  });
};

// ============================================================================
// Printable Landscape PDF Generator matching the Official Premex Bank Sheet
// ============================================================================

export async function generateBankOfficialPdfBytes(
  summary: BankReconciliationSummary,
  selectedMonth: string
): Promise<{ bytes: Uint8Array<ArrayBuffer>; filename: string }> {
  const acc = summary.account;
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageW = 792; // Landscape Letter
  const pageH = 612;
  const marginX = 28;
  const contentW = pageW - marginX * 2; // 736pt

  const oliveBg = rgb(0.769, 0.843, 0.608); // #C4D79B
  const cyanBg = rgb(0.8, 1.0, 1.0); // #CCFFFF
  const darkInk = rgb(0.06, 0.09, 0.14);
  const mutedInk = rgb(0.36, 0.42, 0.5);
  const borderDark = rgb(0.12, 0.16, 0.22);
  const okGreen = rgb(0.08, 0.44, 0.22);
  const alertRed = rgb(0.72, 0.12, 0.16);

  const page = pdfDoc.addPage([pageW, pageH]);
  let cursorY = pageH - 26;

  // 1. Corporate Olive Header Block
  const headerH = 104;
  page.drawRectangle({
    x: marginX,
    y: cursorY - headerH,
    width: contentW,
    height: headerH,
    color: oliveBg,
    borderColor: borderDark,
    borderWidth: 1.1,
  });

  const centerText = (text: string, y: number, size: number, bold = true) => {
    const safe = toAsciiPdf(text);
    const font = bold ? fontBold : fontRegular;
    const w = font.widthOfTextAtSize(safe, size);
    page.drawText(safe, {
      x: marginX + Math.max(4, (contentW - w) / 2),
      y,
      size,
      font,
      color: darkInk,
    });
  };

  centerText((acc?.sociedad || 'PREMEX S.A.S').toUpperCase(), cursorY - 19, 14, true);
  centerText('CONCILIACION DE BANCOS', cursorY - 35, 9.5, true);
  centerText((acc?.banco || '').toUpperCase(), cursorY - 49, 9.5, true);
  centerText(acc ? formatAccountProductLine(acc) : '', cursorY - 63, 9.5, true);
  centerText(acc ? formatAccountSapHeaderLine(acc) : '', cursorY - 77, 9, true);
  centerText(formatOfficialMonthBanner(selectedMonth), cursorY - 94, 9.5, true);

  cursorY -= headerH;

  // 2. Column Headers (8 columns = 368pt left + 368pt right = 736pt)
  const colWidths = [62, 56, 166, 84, 62, 56, 166, 84];
  const colX: number[] = [];
  let accX = marginX;
  colWidths.forEach((w) => {
    colX.push(accX);
    accX += w;
  });

  const colLabels = ['DTO.', 'FECHA', 'CONCEPTO', 'VALOR', 'DTO.', 'FECHA', 'CONCEPTO', 'VALOR'];
  const colHeaderH = 20;

  page.drawRectangle({
    x: marginX,
    y: cursorY - colHeaderH,
    width: contentW,
    height: colHeaderH,
    color: oliveBg,
    borderColor: borderDark,
    borderWidth: 1.0,
  });

  colLabels.forEach((lbl, idx) => {
    const x = colX[idx];
    const w = colWidths[idx];
    if (idx > 0) {
      page.drawLine({
        start: { x, y: cursorY },
        end: { x, y: cursorY - colHeaderH },
        thickness: idx === 4 ? 1.2 : 0.7,
        color: borderDark,
      });
    }
    const tw = fontBold.widthOfTextAtSize(lbl, 8);
    page.drawText(lbl, {
      x: x + (w - tw) / 2,
      y: cursorY - 13,
      size: 8,
      font: fontBold,
      color: darkInk,
    });
  });

  cursorY -= colHeaderH;

  const currency: BankCurrency = acc?.moneda || 'COP';
  const fitText = (text: string, maxW: number, size: number, bold = false): string => {
    const safe = toAsciiPdf(text);
    const font = bold ? fontBold : fontRegular;
    if (font.widthOfTextAtSize(safe, size) <= maxW) return safe;
    let t = safe;
    while (t.length > 3 && font.widthOfTextAtSize(`${t}...`, size) > maxW) {
      t = t.slice(0, -1);
    }
    return `${t}...`;
  };

  const drawAmountCell = (
    colIdx: number,
    rowTopY: number,
    rowH: number,
    value: number,
    opts?: {
      fill?: ReturnType<typeof rgb>;
      bold?: boolean;
      box?: boolean;
      doubleBottom?: boolean;
      dashZero?: boolean;
    }
  ) => {
    const x = colX[colIdx];
    const w = colWidths[colIdx];
    if (opts?.fill || opts?.box) {
      page.drawRectangle({
        x,
        y: rowTopY - rowH,
        width: w,
        height: rowH,
        color: opts.fill,
        borderColor: borderDark,
        borderWidth: opts.box ? 1.0 : 0.5,
      });
    }
    if (opts?.doubleBottom) {
      page.drawLine({
        start: { x, y: rowTopY - rowH - 2.2 },
        end: { x: x + w, y: rowTopY - rowH - 2.2 },
        thickness: 0.9,
        color: borderDark,
      });
    }
    const formatted = formatOfficialCellAmount(value, currency, Boolean(opts?.dashZero));
    const font = opts?.bold ? fontBold : fontRegular;
    const size = 8.2;
    const textY = rowTopY - rowH / 2 - 3;
    page.drawText(toAsciiPdf(formatted.symbol), {
      x: x + 4,
      y: textY,
      size,
      font,
      color: darkInk,
    });
    const figW = font.widthOfTextAtSize(formatted.figure, size);
    page.drawText(formatted.figure, {
      x: x + w - figW - 5,
      y: textY,
      size,
      font,
      color: darkInk,
    });
  };

  const bodyStartY = cursorY;

  const drawTextCell = (
    colIdx: number,
    rowTopY: number,
    rowH: number,
    text: string,
    align: 'left' | 'center' = 'left',
    bold = false,
    size = 8
  ) => {
    const x = colX[colIdx];
    const w = colWidths[colIdx];
    const fitted = fitText(text, w - 8, size, bold);
    const font = bold ? fontBold : fontRegular;
    const tw = font.widthOfTextAtSize(fitted, size);
    const tx = align === 'center' ? x + (w - tw) / 2 : x + 4;
    page.drawText(fitted, {
      x: tx,
      y: rowTopY - rowH / 2 - 3,
      size,
      font,
      color: darkInk,
    });
  };

  cursorY -= 10;

  // Row: SALDO EN LIBROS | SALDO EN EXTRACTO
  const balRowH = 20;
  const cutoffStr = formatSheetDate(summary.fechaCorte);
  drawTextCell(1, cursorY, balRowH, cutoffStr, 'center', true, 8);
  drawTextCell(2, cursorY, balRowH, 'SALDO EN LIBROS', 'left', true, 8.2);
  drawAmountCell(3, cursorY, balRowH, summary.saldoLibros, {
    bold: true,
    box: true,
    doubleBottom: true,
  });

  drawTextCell(5, cursorY, balRowH, cutoffStr, 'center', true, 8);
  drawTextCell(6, cursorY, balRowH, 'SALDO EN EXTRACTO', 'left', true, 8.2);
  drawAmountCell(7, cursorY, balRowH, summary.saldoExtracto, {
    fill: oliveBg,
    bold: true,
    box: true,
    doubleBottom: true,
  });
  cursorY -= balRowH + 11;

  // Section 1 Subtotals
  const subH = 19;
  drawTextCell(1, cursorY, subH, 'MAS', 'center', true, 8);
  drawTextCell(2, cursorY, subH, 'NOTAS DEBITO NO CONTABILIZADAS', 'left', true, 7.8);
  drawAmountCell(3, cursorY, subH, summary.notasCreditoNoContabilizadas, {
    fill: cyanBg,
    bold: true,
    box: true,
    dashZero: true,
  });

  drawTextCell(5, cursorY, subH, 'MENOS', 'center', true, 8);
  drawTextCell(6, cursorY, subH, 'CHEQUES PENDIENTES', 'left', true, 7.8);
  drawAmountCell(7, cursorY, subH, summary.chequesEnTransito, {
    fill: cyanBg,
    bold: true,
    box: true,
    dashZero: true,
  });
  cursorY -= subH;

  const masNd = summary.officialLines.masNotasDebito;
  const menosChq = summary.officialLines.menosCheques;
  const menosNc = summary.officialLines.menosNotasCredito;
  const masCons = summary.officialLines.masConsignaciones;

  const maxBlock1 = Math.min(10, Math.max(4, masNd.length, menosChq.length));
  const itemRowH = 16;
  for (let i = 0; i < maxBlock1; i += 1) {
    const lItem = masNd[i];
    const rItem = menosChq[i];
    if (lItem) {
      drawTextCell(0, cursorY, itemRowH, lItem.dto, 'center', false, 7.6);
      drawTextCell(1, cursorY, itemRowH, formatSheetDate(lItem.fecha), 'center', false, 7.6);
      drawTextCell(2, cursorY, itemRowH, lItem.concepto, 'left', false, 7.6);
      drawAmountCell(3, cursorY, itemRowH, lItem.valor);
    }
    if (rItem) {
      drawTextCell(4, cursorY, itemRowH, rItem.dto, 'center', false, 7.6);
      drawTextCell(5, cursorY, itemRowH, formatSheetDate(rItem.fecha), 'center', false, 7.6);
      drawTextCell(6, cursorY, itemRowH, rItem.concepto, 'left', false, 7.6);
      drawAmountCell(7, cursorY, itemRowH, rItem.valor);
    }
    cursorY -= itemRowH;
  }

  // Section 2 Subtotals
  drawTextCell(1, cursorY, subH, 'MENOS', 'center', true, 8);
  drawTextCell(2, cursorY, subH, 'NOTAS CREDITO NO CONTABILIZADAS', 'left', true, 7.8);
  drawAmountCell(3, cursorY, subH, summary.notasDebitoNoContabilizadas, {
    fill: cyanBg,
    bold: true,
    box: true,
    dashZero: true,
  });

  drawTextCell(5, cursorY, subH, 'MAS', 'center', true, 8);
  drawTextCell(6, cursorY, subH, 'CONSIGNACIONES PENDIENTES', 'left', true, 7.8);
  drawAmountCell(7, cursorY, subH, summary.depositosEnTransito, {
    fill: cyanBg,
    bold: true,
    box: true,
    dashZero: true,
  });
  cursorY -= subH;

  const maxBlock2 = Math.min(8, Math.max(3, menosNc.length, masCons.length));
  for (let i = 0; i < maxBlock2; i += 1) {
    const lItem = menosNc[i];
    const rItem = masCons[i];
    if (lItem) {
      drawTextCell(0, cursorY, itemRowH, lItem.dto, 'center', false, 7.6);
      drawTextCell(1, cursorY, itemRowH, formatSheetDate(lItem.fecha), 'center', false, 7.6);
      drawTextCell(2, cursorY, itemRowH, lItem.concepto, 'left', false, 7.6);
      drawAmountCell(3, cursorY, itemRowH, lItem.valor);
    }
    if (rItem) {
      drawTextCell(4, cursorY, itemRowH, rItem.dto, 'center', false, 7.6);
      drawTextCell(5, cursorY, itemRowH, formatSheetDate(rItem.fecha), 'center', false, 7.6);
      drawTextCell(6, cursorY, itemRowH, rItem.concepto, 'left', false, 7.6);
      drawAmountCell(7, cursorY, itemRowH, rItem.valor);
    }
    cursorY -= itemRowH;
  }

  // Vertical column dividers across body
  const bodyEndY = cursorY;
  page.drawRectangle({
    x: marginX,
    y: bodyEndY,
    width: contentW,
    height: bodyStartY - bodyEndY,
    borderColor: borderDark,
    borderWidth: 1.0,
  });
  for (let c = 1; c < 8; c += 1) {
    page.drawLine({
      start: { x: colX[c], y: bodyStartY },
      end: { x: colX[c], y: bodyEndY },
      thickness: c === 4 ? 1.2 : 0.65,
      color: borderDark,
    });
  }

  // Total Conciliado Footer Bar
  const totalH = 22;
  page.drawRectangle({
    x: marginX,
    y: cursorY - totalH,
    width: contentW,
    height: totalH,
    color: oliveBg,
    borderColor: borderDark,
    borderWidth: 1.1,
  });
  for (let c = 1; c < 8; c += 1) {
    page.drawLine({
      start: { x: colX[c], y: cursorY },
      end: { x: colX[c], y: cursorY - totalH },
      thickness: c === 4 ? 1.2 : 0.65,
      color: borderDark,
    });
  }
  drawTextCell(2, cursorY, totalH, 'TOTAL CONCILIADO', 'left', true, 8.8);
  drawAmountCell(3, cursorY, totalH, summary.saldoConciliadoLibros, { bold: true });
  drawTextCell(6, cursorY, totalH, 'TOTAL CONCILIADO', 'left', true, 8.8);
  drawAmountCell(7, cursorY, totalH, summary.saldoConciliadoExtracto, { bold: true });
  cursorY -= totalH + 14;

  // Net Difference Strip
  const isOk = Math.abs(summary.diferenciaNeta) <= 1;
  const diffFormatted = formatOfficialCellAmount(summary.diferenciaNeta, currency, false);
  page.drawText(
    isOk
      ? 'ESTADO DE CUADRE: CONCILIACION CUADRADA'
      : 'ESTADO DE CUADRE: EXISTE DIFERENCIA PENDIENTE DE AJUSTE',
    {
      x: marginX,
      y: cursorY,
      size: 8.5,
      font: fontBold,
      color: isOk ? okGreen : alertRed,
    }
  );
  const diffText = `DIFERENCIA NETA: ${toAsciiPdf(diffFormatted.symbol)} ${diffFormatted.figure}`;
  const diffW = fontBold.widthOfTextAtSize(diffText, 8.5);
  page.drawText(diffText, {
    x: marginX + contentW - diffW,
    y: cursorY,
    size: 8.5,
    font: fontBold,
    color: isOk ? okGreen : alertRed,
  });

  // Corporate Signature Lines
  const sigY = 58;
  const sigW = 190;
  const sigPositions = [
    marginX + 16,
    marginX + contentW / 2 - sigW / 2,
    marginX + contentW - sigW - 16,
  ];
  const sigLabels = [
    'Elaborado por (Contabilidad)',
    'Revisado por (Tesoreria)',
    'Aprobado por (Gerencia Financiera)',
  ];
  sigPositions.forEach((sx, idx) => {
    page.drawLine({
      start: { x: sx, y: sigY },
      end: { x: sx + sigW, y: sigY },
      thickness: 0.75,
      color: borderDark,
    });
    const tw = fontRegular.widthOfTextAtSize(sigLabels[idx], 7.5);
    page.drawText(sigLabels[idx], {
      x: sx + (sigW - tw) / 2,
      y: sigY - 12,
      size: 7.5,
      font: fontRegular,
      color: mutedInk,
    });
  });

  page.drawText(
    toAsciiPdf(`Centro Interempresarial Premex · Tesoreria SAP 00/01/02 · ${acc?.sociedad || ''}`),
    { x: marginX, y: 18, size: 7, font: fontRegular, color: mutedInk }
  );

  const saved = await pdfDoc.save();
  const filename = `Conciliacion_Bancos_${sanitizeSlug(acc?.sociedad || 'Premex')}_${sanitizeSlug(
    acc?.numeroCuenta || 'Cuenta'
  )}_${sanitizeSlug(selectedMonth)}.pdf`;
  return { bytes: new Uint8Array(saved), filename };
}

export async function exportBankOfficialPdf(
  summary: BankReconciliationSummary,
  selectedMonth: string
): Promise<string> {
  const { bytes, filename } = await generateBankOfficialPdfBytes(summary, selectedMonth);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  triggerBlobDownload(blob, filename);
  return filename;
}
