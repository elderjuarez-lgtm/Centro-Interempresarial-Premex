import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  Download,
  Mail,
  Check,
  Copy,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Unlock,
} from 'lucide-react';
import { EffectivePermissions, ViaticoLiquidation } from '../../types';
import { StoredReceiptMedia } from '../../services/viaticosMediaStore';
import { formatViaticoAmount } from '../../utils/viaticos';
import {
  buildViaticosEmailDraft,
  exportViaticosExcel,
  exportViaticosReceiptsPdf,
} from '../../utils/viaticosExport';

interface ViaticosCloseEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidation: ViaticoLiquidation | null;
  mediaMap: Record<string, StoredReceiptMedia>;
  permissions: EffectivePermissions;
  onConfirmCloseLiquidation: () => Promise<void>;
  onMarkAsSent: (sentToEmail: string) => Promise<void>;
  onReopenLiquidation?: () => Promise<void>;
}

export const ViaticosCloseEmailModal: React.FC<ViaticosCloseEmailModalProps> = ({
  isOpen,
  onClose,
  liquidation,
  mediaMap,
  permissions,
  onConfirmCloseLiquidation,
  onMarkAsSent,
  onReopenLiquidation,
}) => {
  const [recipientEmail, setRecipientEmail] = useState('contabilidad@premexcorp.com');
  const [ccEmail, setCcEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [autoCloseOnDownload, setAutoCloseOnDownload] = useState(true);

  const [isGeneratingBundle, setIsGeneratingBundle] = useState(false);
  const [isGeneratingExcel, setIsGeneratingExcel] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  const [excelResult, setExcelResult] = useState<string | null>(null);
  const [pdfResult, setPdfResult] = useState<{
    filename: string;
    embeddedCount: number;
    totalItems: number;
  } | null>(null);
  const [copiedBody, setCopiedBody] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !liquidation) return;
    const draft = buildViaticosEmailDraft(liquidation);
    setSubject(draft.subject);
    setBody(draft.body);
    setCcEmail(liquidation.consultorEmail || '');
    if (liquidation.sentToEmail) {
      setRecipientEmail(liquidation.sentToEmail);
    }
    setExcelResult(null);
    setPdfResult(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setCopiedBody(false);
  }, [isOpen, liquidation]);

  if (!isOpen || !liquidation) return null;

  const attachedFilesCount = liquidation.items.filter(
    (item) => Boolean(item.attachmentId && mediaMap[item.attachmentId])
  ).length;
  const isDraft = liquidation.estado === 'borrador';

  const handleCloseOnly = async () => {
    if (!permissions.canOperate) return;
    setIsClosing(true);
    setErrorMsg(null);
    try {
      await onConfirmCloseLiquidation();
      setSuccessMsg('Liquidación cerrada correctamente y protegida contra modificaciones.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo cerrar la liquidación.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleDownloadExcelOnly = async () => {
    setIsGeneratingExcel(true);
    setErrorMsg(null);
    try {
      const filename = await exportViaticosExcel(liquidation);
      setExcelResult(filename);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error generando el archivo Excel.');
    } finally {
      setIsGeneratingExcel(false);
    }
  };

  const handleDownloadPdfOnly = async () => {
    setIsGeneratingPdf(true);
    setErrorMsg(null);
    try {
      const res = await exportViaticosReceiptsPdf(liquidation, mediaMap);
      setPdfResult(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error compilando el PDF de comprobantes.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleDownloadFullPackage = async () => {
    setIsGeneratingBundle(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      if (isDraft && autoCloseOnDownload && permissions.canOperate) {
        await onConfirmCloseLiquidation();
      }
      const xlsxName = await exportViaticosExcel(liquidation);
      setExcelResult(xlsxName);
      const pdfRes = await exportViaticosReceiptsPdf(liquidation, mediaMap);
      setPdfResult(pdfRes);
      setSuccessMsg(
        'Se descargaron los dos archivos (Excel oficial + PDF con comprobantes). Adjúntalos en tu correo.'
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo generar el paquete completo de descarga.');
    } finally {
      setIsGeneratingBundle(false);
    }
  };

  const handleCopyEmailBody = async () => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopiedBody(true);
      setTimeout(() => setCopiedBody(false), 2200);
    } catch {
      setErrorMsg('No se pudo copiar al portapapeles.');
    }
  };

  const handleOpenMailClient = async () => {
    setErrorMsg(null);
    const to = recipientEmail.trim();
    const cc = ccEmail.trim();
    const params = new URLSearchParams();
    if (cc) params.set('cc', cc);
    params.set('subject', subject);
    params.set('body', body);

    const mailtoUrl = `mailto:${encodeURIComponent(to)}?${params.toString().replace(/\+/g, '%20')}`;
    const anchor = document.createElement('a');
    anchor.href = mailtoUrl;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    if (permissions.canOperate) {
      try {
        await onMarkAsSent(to || 'contabilidad@premexcorp.com');
        setSuccessMsg(
          'Borrador abierto en tu cliente de correo y liquidación marcada como enviada. Recuerda adjuntar el Excel y el PDF descargados.'
        );
      } catch (err: any) {
        setErrorMsg(err?.message || 'Se abrió el correo, pero no se pudo actualizar el estado.');
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#132B63] text-white flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-200">
              Cierre y Envío Corporativo · Semana #{liquidation.semana || '-'}
            </div>
            <h3 className="text-base font-bold truncate mt-0.5">
              {liquidation.lineaLiquidacion || 'Liquidación de Viáticos'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Summary KPIs Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4 border-b border-slate-200">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Consultor
              </div>
              <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                {liquidation.consultorNombre}
              </div>
              <div className="text-[11px] text-slate-500 truncate">{liquidation.empresa}</div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Facturas / Soportes
              </div>
              <div className="text-xs font-bold text-slate-900 mt-0.5 tabular-nums">
                {liquidation.items.length} registros
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {attachedFilesCount} foto/PDF adjunto(s)
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Impuestos Estimados
              </div>
              <div className="text-xs font-bold text-slate-900 mt-0.5 tabular-nums font-mono">
                {formatViaticoAmount(liquidation.totalImpuestos, liquidation.monedaBase, true)}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                Con imp.: {formatViaticoAmount(liquidation.totalConImpuestos)}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Liquidación
              </div>
              <div className="text-sm font-extrabold text-[#132B63] mt-0.5 tabular-nums font-mono">
                {formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)}
              </div>
              <div className="text-[11px] font-semibold text-emerald-700">
                {liquidation.estado === 'enviada'
                  ? 'Enviada'
                  : liquidation.estado === 'cerrada'
                  ? 'Cerrada'
                  : 'Borrador abierto'}
              </div>
            </div>
          </div>

          {/* Alerts */}
          {errorMsg && (
            <div className="px-4 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Step 1: Close & Download Package */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                  1. Paquete de Adjuntos Oficiales (Excel + PDF)
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Descarga el formato oficial Premex en Excel (.xlsx) y el PDF compilado con todas las facturas e imágenes tomadas.
                </p>
              </div>
              {!isDraft && permissions.isAdmin && onReopenLiquidation && (
                <button
                  type="button"
                  onClick={onReopenLiquidation}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg cursor-pointer"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Reabrir (Admin)</span>
                </button>
              )}
            </div>

            {isDraft && permissions.canOperate && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoCloseOnDownload}
                  onChange={(e) => setAutoCloseOnDownload(e.target.checked)}
                  className="rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                />
                <span>
                  Cerrar formalmente esta liquidación al generar los archivos de envío
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleDownloadFullPackage}
                disabled={isGeneratingBundle || liquidation.items.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
              >
                {isGeneratingBundle ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {isGeneratingBundle
                    ? 'Generando Excel y PDF...'
                    : isDraft && autoCloseOnDownload && permissions.canOperate
                    ? 'Cerrar y Descargar Excel + PDF'
                    : 'Descargar Paquete (Excel + PDF)'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcelOnly}
                disabled={isGeneratingExcel || liquidation.items.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {isGeneratingExcel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                )}
                <span>Solo Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdfOnly}
                disabled={isGeneratingPdf || liquidation.items.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-rose-700" />
                )}
                <span>Solo PDF Comprobantes</span>
              </button>

              {isDraft && permissions.canOperate && !autoCloseOnDownload && (
                <button
                  type="button"
                  onClick={handleCloseOnly}
                  disabled={isClosing}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer"
                >
                  {isClosing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  <span>Solo Cerrar</span>
                </button>
              )}
            </div>

            {(excelResult || pdfResult) && (
              <div className="pt-2 border-t border-slate-200/80 space-y-1 text-[11px]">
                {excelResult && (
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-mono truncate">{excelResult}</span>
                  </div>
                )}
                {pdfResult && (
                  <div className="flex items-center gap-1.5 text-emerald-800">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="font-mono truncate">
                      {pdfResult.filename} ({pdfResult.embeddedCount} comprobante(s) visual(es) + portada resumen)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Email Dispatch Draft */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                2. Enviar por Correo Electrónico
              </h4>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Preparamos el asunto y desglose completo con el total liquidado. Adjunta los dos archivos descargados en el mensaje de correo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Para (Destinatario Contabilidad / Tesorería)
                </label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="contabilidad@premexcorp.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  CC (Copia al Consultor)
                </label>
                <input
                  type="email"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  placeholder="consultor@premexcorp.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Asunto
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Cuerpo del Correo
              </label>
              <textarea
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono leading-relaxed rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleCopyEmailBody}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                {copiedBody ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Texto copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copiar texto</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenMailClient}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl transition-colors cursor-pointer"
              >
                <Mail className="w-4 h-4" />
                <span>Abrir Correo y Marcar Enviada</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
