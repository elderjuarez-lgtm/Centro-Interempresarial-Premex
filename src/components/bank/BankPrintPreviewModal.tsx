import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Printer,
  Download,
  FileSpreadsheet,
  Loader2,
  FileText,
  Eye,
} from 'lucide-react';
import { BankReconciliationSummary } from '../../types';
import {
  BankBatchSheetEntry,
  exportBankBatchPdf,
  exportOfficialBankReconciliationExcel,
  generateBankBatchPdfBytes,
} from '../../utils/bankOfficialExport';
import {
  formatAccountProductLine,
  formatAccountSapHeaderLine,
  formatBankMoney,
  formatOfficialCellAmount,
  formatOfficialMonthBanner,
  formatSheetDate,
} from '../../utils/bankReconciliation';

interface BankPrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Single-sheet legacy prop (still supported) */
  summary?: BankReconciliationSummary;
  selectedMonth: string;
  /** Optional multi-sheet entries for Individual (1) or Masivo (N) print/PDF preview */
  entries?: BankBatchSheetEntry[];
  scopeLabel?: string;
  onExportFullExcel?: () => Promise<void>;
}

const escapeHtml = (raw: string): string =>
  String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const buildSinglePageSectionHtml = (
  summary: BankReconciliationSummary,
  selectedMonth: string,
  pageNumber: number,
  totalPages: number
): string => {
  const acc = summary.account;
  if (!acc) return '';

  const currency = acc.moneda;
  const cutoff = formatSheetDate(summary.fechaCorte);
  const monthBanner = formatOfficialMonthBanner(selectedMonth);

  const fmtCell = (val: number, dashZero = false) => {
    const { symbol, figure } = formatOfficialCellAmount(val, currency, dashZero);
    return `<div class="amt"><span>${escapeHtml(symbol)}</span><span>${escapeHtml(
      figure
    )}</span></div>`;
  };

  const masNd = summary.officialLines.masNotasDebito;
  const menosChq = summary.officialLines.menosCheques;
  const menosNc = summary.officialLines.menosNotasCredito;
  const masCons = summary.officialLines.masConsignaciones;

  const b1 = Math.max(4, masNd.length, menosChq.length);
  const b2 = Math.max(3, menosNc.length, masCons.length);

  const block1Html = Array.from({ length: b1 })
    .map((_, idx) => {
      const l = masNd[idx];
      const r = menosChq[idx];
      return `<tr>
        <td class="c mono">${l ? escapeHtml(l.dto) : ''}</td>
        <td class="c mono">${l ? escapeHtml(formatSheetDate(l.fecha)) : ''}</td>
        <td>${l ? escapeHtml(l.concepto) : ''}</td>
        <td class="sep">${l ? fmtCell(l.valor) : ''}</td>
        <td class="c mono">${r ? escapeHtml(r.dto) : ''}</td>
        <td class="c mono">${r ? escapeHtml(formatSheetDate(r.fecha)) : ''}</td>
        <td>${r ? escapeHtml(r.concepto) : ''}</td>
        <td>${r ? fmtCell(r.valor) : ''}</td>
      </tr>`;
    })
    .join('');

  const block2Html = Array.from({ length: b2 })
    .map((_, idx) => {
      const l = menosNc[idx];
      const r = masCons[idx];
      return `<tr>
        <td class="c mono">${l ? escapeHtml(l.dto) : ''}</td>
        <td class="c mono">${l ? escapeHtml(formatSheetDate(l.fecha)) : ''}</td>
        <td>${l ? escapeHtml(l.concepto) : ''}</td>
        <td class="sep">${l ? fmtCell(l.valor) : ''}</td>
        <td class="c mono">${r ? escapeHtml(r.dto) : ''}</td>
        <td class="c mono">${r ? escapeHtml(formatSheetDate(r.fecha)) : ''}</td>
        <td>${r ? escapeHtml(r.concepto) : ''}</td>
        <td>${r ? fmtCell(r.valor) : ''}</td>
      </tr>`;
    })
    .join('');

  const isOk = Math.abs(summary.diferenciaNeta) <= 1;

  return `<section class="sheet-page">
    <div class="sheet">
      <div class="hdr">
        <div class="soc">${escapeHtml(acc.sociedad)}</div>
        <div class="sub">CONCILIACION DE BANCOS</div>
        <div class="sub">${escapeHtml(acc.banco.toUpperCase())}</div>
        <div class="sub">${escapeHtml(formatAccountProductLine(acc))}</div>
        <div class="sub mono">${escapeHtml(formatAccountSapHeaderLine(acc))}</div>
        <div class="mes">${escapeHtml(monthBanner)}</div>
      </div>
      <table>
        <colgroup>
          <col style="width:10.5%" /><col style="width:9.5%" /><col style="width:18%" /><col style="width:12%" />
          <col style="width:10.5%" /><col style="width:9.5%" /><col style="width:18%" /><col style="width:12%" />
        </colgroup>
        <thead>
          <tr>
            <th>DTO.</th><th>FECHA</th><th>CONCEPTO</th><th class="sep">VALOR</th>
            <th>DTO.</th><th>FECHA</th><th>CONCEPTO</th><th>VALOR</th>
          </tr>
        </thead>
        <tbody>
          <tr><td></td><td></td><td></td><td class="sep"></td><td></td><td></td><td></td><td></td></tr>
          <tr>
            <td></td>
            <td class="c b mono">${escapeHtml(cutoff)}</td>
            <td class="b">SALDO EN LIBROS</td>
            <td class="b box-double sep">${fmtCell(summary.saldoLibros)}</td>
            <td></td>
            <td class="c b mono">${escapeHtml(cutoff)}</td>
            <td class="b">SALDO EN EXTRACTO</td>
            <td class="b box-double olive">${fmtCell(summary.saldoExtracto)}</td>
          </tr>
          <tr><td></td><td></td><td></td><td class="sep"></td><td></td><td></td><td></td><td></td></tr>
          <tr>
            <td></td>
            <td class="c b">MAS</td>
            <td class="b">NOTAS DEBITO NO CONTABILIZADAS</td>
            <td class="b box cyan sep">${fmtCell(summary.notasCreditoNoContabilizadas, true)}</td>
            <td></td>
            <td class="c b">MENOS</td>
            <td class="b">CHEQUES PENDIENTES</td>
            <td class="b box cyan">${fmtCell(summary.chequesEnTransito, true)}</td>
          </tr>
          ${block1Html}
          <tr>
            <td></td>
            <td class="c b">MENOS</td>
            <td class="b">NOTAS CREDITO NO CONTABILIZADAS</td>
            <td class="b box cyan sep">${fmtCell(summary.notasDebitoNoContabilizadas, true)}</td>
            <td></td>
            <td class="c b">MAS</td>
            <td class="b">CONSIGNACIONES PENDIENTES</td>
            <td class="b box cyan">${fmtCell(summary.depositosEnTransito, true)}</td>
          </tr>
          ${block2Html}
          <tr class="tot">
            <td></td><td></td><td>TOTAL CONCILIADO</td><td class="sep">${fmtCell(
              summary.saldoConciliadoLibros
            )}</td>
            <td></td><td></td><td>TOTAL CONCILIADO</td><td>${fmtCell(
              summary.saldoConciliadoExtracto
            )}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="foot ${isOk ? 'ok' : 'warn'}">
      <span>${
        isOk
          ? 'VERIFICACION DE CUADRE: CONCILIACION CUADRADA'
          : 'VERIFICACION DE CUADRE: EXISTE DIFERENCIA PENDIENTE DE AJUSTE'
      }</span>
      <span>DIFERENCIA NETA: ${escapeHtml(formatBankMoney(summary.diferenciaNeta, currency, true))}</span>
    </div>
    <div class="sigs">
      <div class="sig">Elaborado por (Contabilidad)</div>
      <div class="sig">Revisado por (Tesorería)</div>
      <div class="sig">Aprobado por (Gerencia Financiera)</div>
    </div>
    ${
      totalPages > 1
        ? `<div class="page-counter">Centro Interempresarial Premex · Hoja ${pageNumber} de ${totalPages}</div>`
        : ''
    }
  </section>`;
};

const buildStandalonePrintHtml = (entries: BankBatchSheetEntry[]): string => {
  const validEntries = entries.filter((e) => Boolean(e.summary.account));
  if (validEntries.length === 0) return '';

  const docTitle =
    validEntries.length === 1 && validEntries[0].summary.account
      ? `Conciliación Bancaria - ${validEntries[0].summary.account.sociedad} - ${validEntries[0].summary.account.banco}`
      : `Conciliaciones Bancarias Masivas (${validEntries.length} hojas)`;

  const pagesHtml = validEntries
    .map((entry, idx) =>
      buildSinglePageSectionHtml(entry.summary, entry.period, idx + 1, validEntries.length)
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(docTitle)}</title>
<style>
  @page { size: letter landscape; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { margin: 0; font-family: Calibri, Arial, Helvetica, sans-serif; color: #0f172a; font-size: 11px; background: #f1f5f9; padding: 14px; }
  .sheet-page { background: #ffffff; padding: 14px; margin: 0 auto 22px auto; max-width: 1020px; border: 1px solid #cbd5e1; border-radius: 6px; }
  .sheet-page:last-child { margin-bottom: 0; }
  .sheet { border: 2px solid #0f172a; width: 100%; }
  .hdr { background: #C4D79B; text-align: center; padding: 10px 12px; border-bottom: 2px solid #0f172a; line-height: 1.35; }
  .hdr .soc { font-size: 17px; font-weight: 800; text-transform: uppercase; }
  .hdr .sub { font-size: 11.5px; font-weight: 700; }
  .hdr .mes { font-size: 12px; font-weight: 800; margin-top: 6px; letter-spacing: 0.04em; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { padding: 4px 6px; border-right: 1px solid #0f172a; height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  th:last-child, td:last-child { border-right: none; }
  th { background: #C4D79B; border-bottom: 2px solid #0f172a; text-align: center; font-weight: 700; font-size: 10.5px; }
  .sep { border-right: 2px solid #0f172a !important; }
  .c { text-align: center; }
  .b { font-weight: 700; }
  .mono { font-family: Consolas, Menlo, monospace; font-size: 10.5px; }
  .amt { display: flex; justify-content: space-between; gap: 6px; font-family: Consolas, Menlo, monospace; }
  .box { border-top: 1.5px solid #0f172a; border-bottom: 1.5px solid #0f172a; }
  .box-double { border-top: 1.5px solid #0f172a; border-bottom: 3px double #0f172a; }
  .olive { background: #C4D79B; }
  .cyan { background: #CCFFFF; }
  .tot td { background: #C4D79B; border-top: 2px solid #0f172a; font-weight: 800; height: 28px; }
  .foot { margin-top: 10px; display: flex; justify-content: space-between; font-weight: 700; font-size: 10.5px; }
  .ok { color: #166534; }
  .warn { color: #b91c1c; }
  .sigs { margin-top: 34px; display: flex; justify-content: space-between; gap: 36px; padding: 0 24px; }
  .sig { flex: 1; text-align: center; border-top: 1px solid #334155; padding-top: 5px; font-size: 10px; color: #475569; }
  .page-counter { margin-top: 10px; text-align: right; font-size: 9.5px; color: #64748b; font-weight: 600; }
  @media print {
    body { background: #ffffff; padding: 0; }
    .sheet-page { border: none; border-radius: 0; padding: 0; margin: 0; max-width: none; page-break-after: always; break-after: page; }
    .sheet-page:last-child { page-break-after: auto; break-after: auto; }
  }
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
};

export const BankPrintPreviewModal: React.FC<BankPrintPreviewModalProps> = ({
  isOpen,
  onClose,
  summary,
  selectedMonth,
  entries,
  scopeLabel,
  onExportFullExcel,
}) => {
  const [viewMode, setViewMode] = useState<'html' | 'pdf'>('html');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);

  const normalizedEntries = useMemo<BankBatchSheetEntry[]>(() => {
    if (entries && entries.length > 0) {
      return entries.filter((e) => Boolean(e.summary.account));
    }
    if (summary?.account) {
      return [{ summary, period: selectedMonth }];
    }
    return [];
  }, [entries, summary, selectedMonth]);

  useEffect(() => {
    if (!isOpen || viewMode !== 'pdf' || normalizedEntries.length === 0) return;
    let active = true;
    let createdUrl: string | null = null;
    setIsGeneratingPdf(true);

    generateBankBatchPdfBytes(normalizedEntries, scopeLabel)
      .then(({ bytes }) => {
        if (!active) return;
        const blob = new Blob([bytes], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        setPdfUrl(createdUrl);
      })
      .catch(() => {
        if (active) setPdfUrl(null);
      })
      .finally(() => {
        if (active) setIsGeneratingPdf(false);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isOpen, viewMode, normalizedEntries, scopeLabel]);

  if (!isOpen || normalizedEntries.length === 0) return null;

  const isBatch = normalizedEntries.length > 1;
  const firstEntry = normalizedEntries[0];
  const firstAcc = firstEntry.summary.account!;
  const printHtml = buildStandalonePrintHtml(normalizedEntries);

  const handlePrint = () => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(printHtml);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1200);
    }, 250);
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      await exportBankBatchPdf(normalizedEntries, scopeLabel);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadExcel = async () => {
    setIsDownloadingExcel(true);
    try {
      if (onExportFullExcel) {
        await onExportFullExcel();
      } else {
        await exportOfficialBankReconciliationExcel(
          normalizedEntries.map((e) => e.summary),
          scopeLabel || `${firstAcc.sociedad}_${firstAcc.banco}`,
          firstEntry.period
        );
      }
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa e impresión de conciliación bancaria"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Top Modal Bar */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">
              {isBatch
                ? `Vista de Impresión Masiva y PDF · ${normalizedEntries.length} hojas`
                : `Vista de Impresión y PDF · ${firstAcc.sociedad}`}
            </h3>
            <p className="text-xs text-slate-500 truncate">
              {isBatch
                ? `${scopeLabel ? `${scopeLabel.replace(/_/g, ' ')} · ` : ''}${
                    normalizedEntries.length
                  } conciliaciones oficiales horizontales · ${formatOfficialMonthBanner(
                    selectedMonth
                  )}`
                : `${firstAcc.banco} · ${formatAccountProductLine(
                    firstAcc
                  )} · ${formatOfficialMonthBanner(firstEntry.period)}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Mode Switcher */}
            <div className="inline-flex bg-slate-200/70 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setViewMode('html')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'html'
                    ? 'bg-white text-[#132B63] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{isBatch ? `Hojas (${normalizedEntries.length})` : 'Hoja Imprimible'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('pdf')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                  viewMode === 'pdf'
                    ? 'bg-white text-[#132B63] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Documento PDF</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isBatch ? `Imprimir (${normalizedEntries.length})` : 'Imprimir'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadPdf()}
              disabled={isDownloadingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>{isBatch ? `PDF Masivo (${normalizedEntries.length})` : 'PDF'}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleDownloadExcel()}
              disabled={isDownloadingExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDownloadingExcel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>{isBatch ? 'Excel Masivo' : 'Excel Individual'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              aria-label="Cerrar vista previa"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Preview Canvas */}
        <div className="flex-1 overflow-auto bg-slate-100 p-4 sm:p-6">
          {viewMode === 'html' ? (
            <div className="bg-white shadow-md border border-slate-300 rounded-lg overflow-hidden mx-auto max-w-[1060px]">
              <iframe
                title="Vista imprimible conciliación bancaria"
                srcDoc={printHtml}
                className="w-full h-[640px] border-0 bg-slate-100"
              />
            </div>
          ) : isGeneratingPdf ? (
            <div className="h-[600px] flex flex-col items-center justify-center text-slate-600 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-[#1E60A8]" />
              <span className="text-xs font-semibold">
                {isBatch
                  ? `Generando documento PDF masivo de ${normalizedEntries.length} hojas...`
                  : 'Generando documento PDF horizontal...'}
              </span>
            </div>
          ) : pdfUrl ? (
            <iframe
              title="Vista previa PDF conciliación bancaria"
              src={pdfUrl}
              className="w-full h-[640px] rounded-lg border border-slate-300 bg-white"
            />
          ) : (
            <div className="h-[400px] flex flex-col items-center justify-center text-slate-500 gap-3 text-center">
              <FileText className="w-10 h-10 text-slate-300" />
              <p className="text-xs max-w-sm">
                No se pudo previsualizar el PDF incrustado en este navegador. Usa el botón{' '}
                <strong>{isBatch ? 'PDF Masivo' : 'PDF'}</strong> para descargarlo o cambia a{' '}
                <strong>{isBatch ? 'Hojas' : 'Hoja Imprimible'}</strong>.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
