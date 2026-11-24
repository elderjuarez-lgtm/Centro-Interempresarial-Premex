import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Printer,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  AlertCircle,
  Table as TableIcon,
} from 'lucide-react';
import { ViaticoLiquidation } from '../../types';
import { formatViaticoAmount } from '../../utils/viaticos';
import { generateViaticosPlanillaPdfBytes } from '../../utils/viaticosExport';
import { PREMEX_LOGO_SRC, PremexBrandLogo } from '../ModuleIcons';

interface ViaticosPlanillaPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidation: ViaticoLiquidation | null;
  costCenter: string;
  onDownloadExcel: (liq: ViaticoLiquidation) => Promise<void> | void;
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintableHtmlDocument(
  liquidation: ViaticoLiquidation,
  costCenter: string
): string {
  const logoAbsUrl =
    typeof window !== 'undefined'
      ? new URL(PREMEX_LOGO_SRC, window.location.origin).href
      : PREMEX_LOGO_SRC;

  const statusText =
    liquidation.estado === 'enviada'
      ? 'Cerrada y Enviada'
      : liquidation.estado === 'cerrada'
      ? 'Cerrada'
      : 'Abierta (Borrador)';

  const rowsHtml =
    liquidation.items.length === 0
      ? `<tr><td colspan="14" style="text-align:center;padding:14px;color:#64748b;">Sin facturas registradas</td></tr>`
      : liquidation.items
          .map(
            (item, idx) => `
          <tr style="background:${idx % 2 === 1 ? '#f8fafc' : '#ffffff'};">
            <td style="text-align:center;white-space:nowrap;">${escapeHtml(item.fechaDoc || '—')}</td>
            <td style="font-family:monospace;">${escapeHtml(item.serieDoc)}</td>
            <td style="font-family:monospace;">${escapeHtml(item.noDoc)}</td>
            <td style="font-family:monospace;">${escapeHtml(item.nit)}</td>
            <td style="font-weight:500;">${escapeHtml(item.proveedor)}</td>
            <td style="text-align:center;white-space:nowrap;">${escapeHtml(item.moneda)}</td>
            <td style="text-align:right;font-family:monospace;white-space:nowrap;">${escapeHtml(
              formatViaticoAmount(item.valorFactura)
            )}</td>
            <td style="text-align:right;font-family:monospace;white-space:nowrap;">${escapeHtml(
              formatViaticoAmount(item.tipoCambio)
            )}</td>
            <td style="text-align:right;font-family:monospace;font-weight:700;background:#f8fafc;white-space:nowrap;">${escapeHtml(
              formatViaticoAmount(item.valorReintegrar)
            )}</td>
            <td>${escapeHtml(item.categoria)}</td>
            <td style="font-weight:700;">${escapeHtml(item.clienteContacto)}</td>
            <td>${escapeHtml(item.objetivoComercial)}</td>
            <td>${escapeHtml(item.descripcionGasto)}</td>
            <td style="text-align:center;white-space:nowrap;">${escapeHtml(item.kilometraje)}</td>
          </tr>`
          )
          .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Planilla Viáticos - Semana ${escapeHtml(liquidation.semana || '-')} - ${escapeHtml(
    liquidation.consultorNombre
  )}</title>
  <style>
    @page {
      size: letter landscape;
      margin: 9mm 10mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Calibri, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .header-grid {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 10px;
    }
    .header-fields {
      width: 44%;
      font-size: 11px;
    }
    .field-row {
      display: flex;
      align-items: baseline;
      margin-bottom: 5px;
    }
    .field-label {
      width: 115px;
      font-weight: 800;
      letter-spacing: 0.02em;
      flex-shrink: 0;
    }
    .field-value {
      flex: 1;
      border-bottom: 1px solid #1e293b;
      padding: 0 6px 2px;
      min-height: 16px;
    }
    .field-value.center {
      text-align: center;
      font-weight: 600;
    }
    .brand-center {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .brand-center img {
      height: 54px;
      width: auto;
    }
    .brand-tagline {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.16em;
      color: #64748b;
      line-height: 1.35;
      text-transform: uppercase;
    }
    .meta-right {
      text-align: right;
      font-size: 9.5px;
      color: #475569;
      line-height: 1.45;
    }
    .meta-right .corp {
      font-weight: 700;
      color: #132B63;
      font-size: 10.5px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    th {
      background: #B7DEE8 !important;
      color: #0f172a;
      font-weight: 700;
      text-align: center;
      padding: 5px 4px;
      border: 1px solid #1e293b;
      line-height: 1.2;
    }
    td {
      border: 1px solid #64748b;
      padding: 4px 4px;
      vertical-align: middle;
      line-height: 1.25;
      word-break: break-word;
    }
    .spacer-row td {
      height: 10px;
      padding: 0;
      background: #ffffff;
    }
    .total-label {
      border: 1.5px solid #0f172a !important;
      text-align: center;
      font-weight: 800;
      font-size: 10.5px;
      background: #ffffff !important;
    }
    .total-value {
      border: 1.5px solid #0f172a !important;
      text-align: right;
      font-family: monospace;
      font-weight: 800;
      font-size: 10.5px;
      color: #132B63;
      background: #DCEEF5 !important;
    }
    .no-border {
      border: none !important;
      background: transparent !important;
    }
    .fiscal-strip {
      margin-top: 8px;
      padding: 5px 10px;
      background: #f1f5f9 !important;
      border: 1px solid #cbd5e1;
      font-size: 9px;
      color: #1e293b;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .signatures {
      margin-top: 28px;
      display: flex;
      justify-content: space-around;
      gap: 24px;
      page-break-inside: avoid;
    }
    .sig-box {
      width: 28%;
      text-align: center;
    }
    .sig-line {
      border-top: 1px solid #1e293b;
      padding-top: 4px;
      font-size: 9.5px;
      font-weight: 700;
    }
    .sig-sub {
      font-size: 8.5px;
      color: #64748b;
      margin-top: 2px;
    }
  </style>
</head>
<body>
  <div class="header-grid">
    <div class="header-fields">
      <div class="field-row">
        <div class="field-label">LIQUIDACIÓN</div>
        <div class="field-value">${escapeHtml(liquidation.lineaLiquidacion || 'Sin título')}</div>
      </div>
      <div class="field-row">
        <div class="field-label">SEMANA #</div>
        <div class="field-value center">${escapeHtml(liquidation.semana || '-')}</div>
      </div>
      <div class="field-row">
        <div class="field-label">NOMBRE:</div>
        <div class="field-value center">${escapeHtml(liquidation.consultorNombre || '-')}</div>
      </div>
      <div class="field-row">
        <div class="field-label">CENTRO DE COSTO:</div>
        <div class="field-value">${escapeHtml(costCenter || 'Sin asignar')}</div>
      </div>
    </div>

    <div class="brand-center">
      <img src="${escapeHtml(logoAbsUrl)}" alt="Premex" />
      <div class="brand-tagline">
        <div>NOURISHING</div>
        <div>POSSIBILITIES</div>
        <div>TOGETHER</div>
      </div>
    </div>

    <div class="meta-right">
      <div class="corp">${escapeHtml(liquidation.empresa)}</div>
      <div>Moneda base: <strong>${escapeHtml(liquidation.monedaBase)}</strong></div>
      ${
        liquidation.monedaBase === 'Dólares' &&
        liquidation.tipoCambioLiquidacion &&
        liquidation.tipoCambioLiquidacion > 0
          ? `<div>T/C Liquidación: <strong>${escapeHtml(
              String(liquidation.tipoCambioLiquidacion)
            )}</strong></div>`
          : ''
      }
      <div>Estado: ${escapeHtml(statusText)}</div>
      <div>Fecha impresión: ${escapeHtml(new Date().toLocaleDateString('es-GT'))}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Fecha Doc.</th>
        <th>Serie Doc.</th>
        <th>No. Doc.</th>
        <th>NIT</th>
        <th>Proveedor</th>
        <th>Moneda</th>
        <th>Valor Factura</th>
        <th>Tipo de Cambio</th>
        <th>Valor Reintegrar</th>
        <th>Categoría</th>
        <th>Cliente/Contacto</th>
        <th>Objetivo Comercial</th>
        <th>Descripción del Gastos</th>
        <th>Kilometraje</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="spacer-row">
        <td colspan="14"></td>
      </tr>
      <tr>
        <td colspan="5" class="no-border"></td>
        <td colspan="3" class="total-label">Total Liquidación</td>
        <td class="total-value">${escapeHtml(formatViaticoAmount(liquidation.totalLiquidacion))}</td>
        <td colspan="5" class="no-border" style="padding-left:10px;font-weight:700;color:#132B63;">
          ${escapeHtml(
            formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)
          )} (${escapeHtml(liquidation.monedaBase)})
        </td>
      </tr>
    </tbody>
  </table>

  <div class="fiscal-strip">
    <span><strong>Comprobantes:</strong> ${liquidation.items.length}</span>
    <span><strong>Con Impuestos:</strong> ${escapeHtml(
      formatViaticoAmount(liquidation.totalConImpuestos, liquidation.monedaBase, true)
    )}</span>
    <span><strong>IVA / Impuesto Est.:</strong> ${escapeHtml(
      formatViaticoAmount(liquidation.totalImpuestos, liquidation.monedaBase, true)
    )}</span>
    <span><strong>Sin Impuestos:</strong> ${escapeHtml(
      formatViaticoAmount(liquidation.totalSinImpuestos, liquidation.monedaBase, true)
    )}</span>
  </div>

  <div class="signatures">
    <div class="sig-box">
      <div class="sig-line">Elaborado por / Consultor</div>
      <div class="sig-sub">${escapeHtml(liquidation.consultorNombre)}</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">Revisado por / Jefatura</div>
      <div class="sig-sub">Firma y fecha de autorización</div>
    </div>
    <div class="sig-box">
      <div class="sig-line">Recibido / Contabilidad</div>
      <div class="sig-sub">${
        costCenter ? `C.C.: ${escapeHtml(costCenter)}` : 'Registro contable Odoo'
      }</div>
    </div>
  </div>
</body>
</html>`;
}

export const ViaticosPlanillaPdfModal: React.FC<ViaticosPlanillaPdfModalProps> = ({
  isOpen,
  onClose,
  liquidation,
  costCenter,
  onDownloadExcel,
}) => {
  const [viewMode, setViewMode] = useState<'sheet' | 'pdf'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'pdf' : 'sheet'
  );
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>('Planilla_Viaticos.pdf');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pdfIframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!isOpen || !liquidation) return;

    let cancelled = false;
    let createdUrl: string | null = null;

    setIsGenerating(true);
    setErrorMsg(null);
    setPdfBlobUrl(null);

    generateViaticosPlanillaPdfBytes(liquidation, costCenter)
      .then(({ bytes, filename }) => {
        if (cancelled) return;
        const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(blob);
        setPdfBlobUrl(createdUrl);
        setPdfFilename(filename);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setErrorMsg(err?.message || 'No se pudo generar la vista PDF de la planilla.');
      })
      .finally(() => {
        if (!cancelled) setIsGenerating(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [isOpen, liquidation, costCenter]);

  if (!isOpen || !liquidation) return null;

  const handleDownloadPdf = () => {
    if (!pdfBlobUrl) return;
    const a = document.createElement('a');
    a.href = pdfBlobUrl;
    a.download = pdfFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleDownloadExcelClick = async () => {
    setIsDownloadingExcel(true);
    try {
      await onDownloadExcel(liquidation);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const handlePrintPlanilla = () => {
    // Print using a clean hidden landscape iframe (never window.open)
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(printFrame);

    const html = buildPrintableHtmlDocument(liquidation, costCenter);
    const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
    if (!frameDoc || !printFrame.contentWindow) {
      document.body.removeChild(printFrame);
      window.print();
      return;
    }

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    const triggerPrint = () => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch {
        window.print();
      } finally {
        setTimeout(() => {
          if (printFrame.parentNode) {
            printFrame.parentNode.removeChild(printFrame);
          }
        }, 1200);
      }
    };

    // Wait briefly so the Premex logo renders cleanly before the print dialog opens
    setTimeout(triggerPrint, 320);
  };

  const statusLabel =
    liquidation.estado === 'enviada'
      ? 'Cerrada y Enviada'
      : liquidation.estado === 'cerrada'
      ? 'Cerrada'
      : 'Abierta';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl w-full max-w-[1280px] h-[94dvh] sm:h-[92vh] flex flex-col overflow-hidden pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-[#132B63] text-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-200 truncate">
                Vista Planilla · Semana #{liquidation.semana || '-'} ·{' '}
                {liquidation.monedaBase}
              </div>
              <h3 className="text-sm sm:text-base font-bold truncate mt-0.5">
                {liquidation.lineaLiquidacion || 'Liquidación de Viáticos'} —{' '}
                {liquidation.consultorNombre}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="sm:hidden min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePrintPlanilla}
              className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-bold text-[#132B63] bg-white hover:bg-sky-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4 text-[#1E60A8]" />
              <span>Imprimir</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={!pdfBlobUrl || isGenerating}
              className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-sky-600 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Descargar PDF</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadExcelClick}
              disabled={isDownloadingExcel}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white/95 bg-white/12 hover:bg-white/20 border border-white/20 rounded-xl transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {isDownloadingExcel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
              )}
              <span>Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar vista previa"
              className="hidden sm:inline-flex min-w-[40px] min-h-[40px] items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Toolbar: View Switcher & Metadata */}
        <div className="px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="grid grid-cols-2 sm:inline-flex items-center bg-slate-200/80 p-0.5 rounded-xl w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode('sheet')}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                viewMode === 'sheet'
                  ? 'bg-white text-[#132B63] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Hoja Imprimible</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pdf')}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-0 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                viewMode === 'pdf'
                  ? 'bg-white text-[#132B63] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Documento PDF</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span>
              <strong className="text-slate-800">C.C.:</strong>{' '}
              {costCenter || 'Sin asignar'}
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-mono font-bold text-[#132B63] tabular-nums">
              {formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)}
            </span>
          </div>
        </div>

        {/* Main Preview Canvas */}
        <div className="flex-1 overflow-auto bg-slate-200/70 p-3 sm:p-6">
          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {viewMode === 'pdf' ? (
            <div className="h-full min-h-[520px] flex flex-col">
              {isGenerating ? (
                <div className="flex-1 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#1E60A8]" />
                  <div className="text-sm font-bold text-[#132B63]">
                    Renderizando planilla oficial en formato PDF...
                  </div>
                  <p className="text-xs text-slate-500">
                    Ajustando las 14 columnas en hoja horizontal carta para impresión limpia.
                  </p>
                </div>
              ) : pdfBlobUrl ? (
                <>
                  {/* Desktop inline PDF viewer */}
                  <iframe
                    ref={pdfIframeRef}
                    src={pdfBlobUrl}
                    title={pdfFilename}
                    className="hidden md:block w-full flex-1 min-h-[560px] rounded-xl border border-slate-300 bg-white shadow-sm"
                  />
                  {/* Mobile fallback notice (mobile browsers don't embed blob PDFs cleanly) */}
                  <div className="md:hidden bg-white rounded-xl border border-slate-200 p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-[#132B63]/10 text-[#132B63] flex items-center justify-center mx-auto">
                      <FileText className="w-6 h-6" />
                    </div>
                    <h4 className="text-sm font-bold text-slate-900">
                      PDF Horizontal listo para descargar o imprimir
                    </h4>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      En teléfonos móviles puedes usar <strong>Vista Hoja Imprimible</strong> para revisarlo en pantalla o descargar el PDF directamente.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleDownloadPdf}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-[#1E60A8] rounded-xl cursor-pointer"
                      >
                        <Download className="w-4 h-4" />
                        <span>Descargar PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('sheet')}
                        className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-[#132B63] bg-slate-100 rounded-xl cursor-pointer"
                      >
                        <TableIcon className="w-4 h-4" />
                        <span>Ver Hoja en Pantalla</span>
                      </button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            /* Exact Landscape Paper Sheet Representation matching Premex Excel Format */
            <div className="bg-white rounded-xl border border-slate-300 shadow-md mx-auto max-w-[1160px] p-5 sm:p-7 space-y-4">
              {/* Sheet Header matching Premex Excel rows 2-4 */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center pb-2">
                <div className="md:col-span-5 space-y-2 text-xs">
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 font-extrabold text-slate-900 shrink-0">
                      LIQUIDACIÓN
                    </span>
                    <span className="flex-1 border-b border-slate-700 pb-0.5 font-medium text-slate-900">
                      {liquidation.lineaLiquidacion || 'Sin título'}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 font-extrabold text-slate-900 shrink-0">
                      SEMANA #
                    </span>
                    <span className="flex-1 border-b border-slate-700 pb-0.5 text-center font-semibold font-mono tabular-nums text-slate-900">
                      {liquidation.semana || '-'}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 font-extrabold text-slate-900 shrink-0">
                      NOMBRE:
                    </span>
                    <span className="flex-1 border-b border-slate-700 pb-0.5 text-center font-semibold text-slate-900">
                      {liquidation.consultorNombre}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="w-28 font-extrabold text-slate-900 shrink-0">
                      CENTRO COSTO:
                    </span>
                    <span className="flex-1 border-b border-slate-700 pb-0.5 font-semibold text-[#132B63]">
                      {costCenter || 'Sin asignar'}
                    </span>
                  </div>
                </div>

                <div className="md:col-span-4 flex items-center justify-center gap-3">
                  <PremexBrandLogo className="h-14 w-auto shrink-0" />
                  <div className="text-[10px] font-bold tracking-[0.18em] text-slate-500 leading-tight uppercase">
                    <div>NOURISHING</div>
                    <div>POSSIBILITIES</div>
                    <div>TOGETHER</div>
                  </div>
                </div>

                <div className="md:col-span-3 md:text-right text-[11px] text-slate-600 space-y-0.5">
                  <div className="font-bold text-[#132B63] text-xs">{liquidation.empresa}</div>
                  <div>
                    Moneda base: <strong className="text-slate-800">{liquidation.monedaBase}</strong>
                  </div>
                  <div>Estado: {statusLabel}</div>
                  <div className="tabular-nums">
                    Fecha: {new Date().toLocaleDateString('es-GT')}
                  </div>
                </div>
              </div>

              {/* Exact 14-Column Premex Excel Table */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[11px] min-w-[1060px]">
                  <thead>
                    <tr className="bg-[#B7DEE8] text-slate-900 font-bold">
                      <th className="border border-slate-700 px-2 py-2 text-center">Fecha Doc.</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Serie Doc.</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">No. Doc.</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">NIT</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Proveedor</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Moneda</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Valor Factura</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Tipo de Cambio</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Valor Reintegrar</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Categoría</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Cliente/Contacto</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Objetivo Comercial</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Descripción del Gastos</th>
                      <th className="border border-slate-700 px-2 py-2 text-center">Kilometraje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidation.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={14}
                          className="border border-slate-400 py-8 text-center text-slate-400"
                        >
                          Sin facturas registradas
                        </td>
                      </tr>
                    ) : (
                      liquidation.items.map((item, idx) => (
                        <tr key={item.id} className={idx % 2 === 1 ? 'bg-slate-50/70' : 'bg-white'}>
                          <td className="border border-slate-400 px-1.5 py-1.5 text-center font-mono tabular-nums whitespace-nowrap">
                            {item.fechaDoc || '—'}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 font-mono">
                            {item.serieDoc}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 font-mono">
                            {item.noDoc}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 font-mono">
                            {item.nit}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 font-medium text-slate-900">
                            {item.proveedor}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 text-center whitespace-nowrap">
                            {item.moneda}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatViaticoAmount(item.valorFactura)}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {formatViaticoAmount(item.tipoCambio)}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 text-right font-mono font-bold tabular-nums bg-slate-50 whitespace-nowrap">
                            {formatViaticoAmount(item.valorReintegrar)}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5">
                            {item.categoria}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 font-bold text-slate-900">
                            {item.clienteContacto}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 text-slate-700">
                            {item.objetivoComercial}
                          </td>
                          <td className="border border-slate-400 px-2 py-1.5 text-slate-700">
                            {item.descripcionGasto}
                          </td>
                          <td className="border border-slate-400 px-1.5 py-1.5 text-center tabular-nums whitespace-nowrap">
                            {item.kilometraje}
                          </td>
                        </tr>
                      ))
                    )}
                    {/* Blank grid separator line */}
                    <tr>
                      <td colSpan={14} className="border border-slate-400 h-3 bg-white" />
                    </tr>
                    {/* Total Liquidación row */}
                    <tr>
                      <td colSpan={5} className="border-0" />
                      <td
                        colSpan={3}
                        className="border-2 border-slate-900 px-3 py-2 text-center text-xs font-extrabold text-slate-900 bg-white"
                      >
                        Total Liquidación
                      </td>
                      <td className="border-2 border-slate-900 px-2 py-2 text-right text-xs font-extrabold font-mono tabular-nums text-[#132B63] bg-[#DCEEF5]">
                        {formatViaticoAmount(liquidation.totalLiquidacion)}
                      </td>
                      <td
                        colSpan={5}
                        className="border-0 pl-3 py-2 text-xs font-bold text-[#132B63] font-mono tabular-nums"
                      >
                        {formatViaticoAmount(
                          liquidation.totalLiquidacion,
                          liquidation.monedaBase,
                          true
                        )}{' '}
                        ({liquidation.monedaBase})
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Fiscal Summary Strip */}
              <div className="px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-700 tabular-nums">
                <span>
                  <strong className="text-slate-900">Comprobantes:</strong>{' '}
                  {liquidation.items.length}
                </span>
                <span>
                  <strong className="text-slate-900">Con Impuestos:</strong>{' '}
                  {formatViaticoAmount(
                    liquidation.totalConImpuestos,
                    liquidation.monedaBase,
                    true
                  )}
                </span>
                <span>
                  <strong className="text-slate-900">IVA / Impuesto Estimado:</strong>{' '}
                  {formatViaticoAmount(
                    liquidation.totalImpuestos,
                    liquidation.monedaBase,
                    true
                  )}
                </span>
                <span>
                  <strong className="text-slate-900">Sin Impuestos:</strong>{' '}
                  {formatViaticoAmount(
                    liquidation.totalSinImpuestos,
                    liquidation.monedaBase,
                    true
                  )}
                </span>
              </div>

              {/* Corporate Signatures */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 pb-2">
                <div className="text-center">
                  <div className="border-t border-slate-700 pt-1.5 text-xs font-bold text-slate-900">
                    Elaborado por / Consultor
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {liquidation.consultorNombre}
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-700 pt-1.5 text-xs font-bold text-slate-900">
                    Revisado por / Jefatura
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Firma y fecha de autorización
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-slate-700 pt-1.5 text-xs font-bold text-slate-900">
                    Recibido / Contabilidad
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {costCenter ? `C.C.: ${costCenter}` : 'Registro contable Odoo'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
