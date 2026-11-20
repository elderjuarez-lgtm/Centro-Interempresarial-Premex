import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  Download,
  Send,
  Check,
  Copy,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Unlock,
  Printer,
  Paperclip,
  RefreshCw,
} from 'lucide-react';
import { EffectivePermissions, ViaticoLiquidation } from '../../types';
import {
  StoredReceiptMedia,
  getReceiptMediaBatch,
} from '../../services/viaticosMediaStore';
import { formatViaticoAmount } from '../../utils/viaticos';
import {
  buildViaticosEmailDraft,
  exportViaticosExcel,
  exportViaticosReceiptsPdf,
  generateViaticosExcelBytes,
  generateViaticosPlanillaPdfBytes,
  generateViaticosReceiptsPdfBytes,
} from '../../utils/viaticosExport';
import { getAccessToken } from '../../services/auth';
import {
  GmailAttachment,
  GoogleWorkspaceAuthError,
  buildCorporatePlainTextHtmlEmail,
  parseEmailAddressList,
  sendGmailHtmlMessage,
} from '../../services/googleWorkspaceActivities';

interface ViaticosCloseEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidation: ViaticoLiquidation | null;
  costCenter?: string;
  mediaMap: Record<string, StoredReceiptMedia>;
  permissions: EffectivePermissions;
  accessToken?: string | null;
  onReconnectWorkspace?: () => Promise<string | null>;
  onInvalidateWorkspaceToken?: () => void;
  onConfirmCloseLiquidation: () => Promise<void>;
  onMarkAsSent: (sentToEmail: string) => Promise<void>;
  onReopenLiquidation?: () => Promise<void>;
  onPreviewPlanillaPdf?: () => void;
}

export const ViaticosCloseEmailModal: React.FC<ViaticosCloseEmailModalProps> = ({
  isOpen,
  onClose,
  liquidation,
  costCenter,
  mediaMap,
  permissions,
  accessToken,
  onReconnectWorkspace,
  onInvalidateWorkspaceToken,
  onConfirmCloseLiquidation,
  onMarkAsSent,
  onReopenLiquidation,
  onPreviewPlanillaPdf,
}) => {
  const [recipientEmail, setRecipientEmail] = useState('contabilidad@premexcorp.com');
  const [ccEmail, setCcEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachExcel, setAttachExcel] = useState(true);
  const [attachReceiptsPdf, setAttachReceiptsPdf] = useState(true);
  const [attachPlanillaPdf, setAttachPlanillaPdf] = useState(false);
  const [autoCloseOnDownload, setAutoCloseOnDownload] = useState(false);

  const [hydratedMedia, setHydratedMedia] = useState<Record<string, StoredReceiptMedia>>({});
  const [isSendingGmail, setIsSendingGmail] = useState(false);
  const [sendStepLabel, setSendStepLabel] = useState('');
  const [isAuthorizingGoogle, setIsAuthorizingGoogle] = useState(false);
  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(false);

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
  const [sentSummary, setSentSummary] = useState<{
    to: string[];
    cc: string[];
    attachments: string[];
  } | null>(null);
  const [copiedBody, setCopiedBody] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !liquidation) return;
    const draft = buildViaticosEmailDraft(liquidation, costCenter);
    setSubject(draft.subject);
    setBody(draft.body);
    setCcEmail(liquidation.consultorEmail || '');
    if (liquidation.sentToEmail) {
      setRecipientEmail(liquidation.sentToEmail);
    }
    setAttachExcel(true);
    setAttachReceiptsPdf(true);
    setAttachPlanillaPdf(false);
    setExcelResult(null);
    setPdfResult(null);
    setSentSummary(null);
    setErrorMsg(null);
    setSuccessMsg(null);
    setNeedsGoogleAuth(false);
    setSendStepLabel('');
    setCopiedBody(false);

    // Preload any IndexedDB receipt media for this liquidation so PDF compilation includes every support
    const ids = liquidation.items.map((it) => it.attachmentId || '').filter(Boolean);
    if (ids.length > 0) {
      getReceiptMediaBatch(ids)
        .then((loaded) => setHydratedMedia(loaded))
        .catch(() => setHydratedMedia({}));
    } else {
      setHydratedMedia({});
    }
  }, [isOpen, liquidation, costCenter]);

  if (!isOpen || !liquidation) return null;

  const combinedMediaMap: Record<string, StoredReceiptMedia> = {
    ...mediaMap,
    ...hydratedMedia,
  };

  const attachedFilesCount = liquidation.items.filter((item) =>
    Boolean(item.attachmentId && combinedMediaMap[item.attachmentId])
  ).length;
  const isDraft = liquidation.estado === 'borrador';

  const ensureReceiptMediaLoaded = async (): Promise<Record<string, StoredReceiptMedia>> => {
    const ids = liquidation.items.map((it) => it.attachmentId || '').filter(Boolean);
    if (ids.length === 0) return combinedMediaMap;
    try {
      const loaded = await getReceiptMediaBatch(ids);
      const merged = { ...combinedMediaMap, ...loaded };
      setHydratedMedia((prev) => ({ ...prev, ...loaded }));
      return merged;
    } catch {
      return combinedMediaMap;
    }
  };

  const resolveGoogleToken = async (): Promise<string | null> => {
    const direct = (accessToken || '').trim() || (await getAccessToken()) || '';
    if (direct) return direct;
    if (onReconnectWorkspace) {
      setSendStepLabel('Autorizando conexión con Gmail...');
      const renewed = await onReconnectWorkspace();
      if (renewed && renewed.trim()) return renewed.trim();
    }
    return null;
  };

  const handleAuthorizeGoogle = async () => {
    if (!onReconnectWorkspace) return;
    setIsAuthorizingGoogle(true);
    setErrorMsg(null);
    try {
      const renewed = await onReconnectWorkspace();
      if (renewed) {
        setNeedsGoogleAuth(false);
        setSuccessMsg('Sesión de Google conectada. Ya puedes presionar "Enviar por Gmail".');
      } else {
        setErrorMsg('No se completó la autorización de Google. Intenta nuevamente.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo autorizar la cuenta de Google.');
    } finally {
      setIsAuthorizingGoogle(false);
    }
  };

  const handleSendDirectGmail = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setNeedsGoogleAuth(false);

    const toList = parseEmailAddressList(recipientEmail);
    const ccList = parseEmailAddressList(ccEmail);

    if (toList.length === 0) {
      setErrorMsg('Ingresa al menos un correo destinatario válido en el campo "Para".');
      return;
    }
    if (!subject.trim()) {
      setErrorMsg('El asunto del correo no puede estar vacío.');
      return;
    }
    if (!attachExcel && !attachReceiptsPdf && !attachPlanillaPdf) {
      setErrorMsg('Selecciona al menos el archivo Excel y/o PDF para adjuntar en la liquidación.');
      return;
    }

    setIsSendingGmail(true);
    try {
      const token = await resolveGoogleToken();
      if (!token) {
        setNeedsGoogleAuth(true);
        setErrorMsg(
          'Tu cuenta de Google requiere autorización para enviar correos por Gmail. Presiona "Autorizar Google" para continuar.'
        );
        return;
      }

      const attachments: GmailAttachment[] = [];

      if (attachExcel) {
        setSendStepLabel('Generando archivo Excel oficial (.xlsx)...');
        const excelPkg = await generateViaticosExcelBytes(liquidation, costCenter);
        attachments.push({
          filename: excelPkg.filename,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          bytes: excelPkg.bytes,
        });
        setExcelResult(excelPkg.filename);
      }

      if (attachReceiptsPdf) {
        setSendStepLabel('Compilando PDF con resumen y comprobantes...');
        const freshMedia = await ensureReceiptMediaLoaded();
        const pdfPkg = await generateViaticosReceiptsPdfBytes(liquidation, freshMedia);
        attachments.push({
          filename: pdfPkg.filename,
          mimeType: 'application/pdf',
          bytes: pdfPkg.bytes,
        });
        setPdfResult({
          filename: pdfPkg.filename,
          embeddedCount: pdfPkg.embeddedCount,
          totalItems: pdfPkg.totalItems,
        });
      }

      if (attachPlanillaPdf) {
        setSendStepLabel('Generando Planilla Imprimible PDF...');
        const planillaPkg = await generateViaticosPlanillaPdfBytes(liquidation, costCenter);
        attachments.push({
          filename: planillaPkg.filename,
          mimeType: 'application/pdf',
          bytes: planillaPkg.bytes,
        });
      }

      setSendStepLabel('Enviando correo con adjuntos por Gmail...');
      const htmlBody = buildCorporatePlainTextHtmlEmail({
        moduleLabel: 'Liquidación de Viáticos',
        title: liquidation.lineaLiquidacion || 'Liquidación de Viáticos',
        subtitle: `Semana #${liquidation.semana || '-'} · ${liquidation.consultorNombre} · ${liquidation.empresa} · Total ${formatViaticoAmount(
          liquidation.totalLiquidacion,
          liquidation.monedaBase,
          true
        )}`,
        bodyText: body,
        attachmentNames: attachments.map((a) => a.filename),
        accentHex: '#132B63',
      });

      await sendGmailHtmlMessage({
        to: toList,
        cc: ccList,
        subject: subject.trim(),
        htmlBody,
        attachments,
        accessTokenOverride: token,
      });

      if (permissions.canOperate) {
        setSendStepLabel('Actualizando estado de la liquidación...');
        await onMarkAsSent(toList.join(', '));
      }

      setSentSummary({
        to: toList,
        cc: ccList,
        attachments: attachments.map((a) => a.filename),
      });
      setSuccessMsg(
        `Correo enviado automáticamente por Gmail a ${toList.join(', ')} con ${attachments.length} archivo(s) adjunto(s) (${attachments
          .map((a) => a.filename)
          .join(' + ')}).`
      );
    } catch (err: any) {
      if (err instanceof GoogleWorkspaceAuthError) {
        onInvalidateWorkspaceToken?.();
        setNeedsGoogleAuth(true);
      }
      setErrorMsg(
        err?.message ||
          'No se pudo enviar el correo por Gmail. Verifica tu conexión o vuelve a autorizar Google.'
      );
    } finally {
      setIsSendingGmail(false);
      setSendStepLabel('');
    }
  };

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
      const filename = await exportViaticosExcel(liquidation, costCenter);
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
      const freshMedia = await ensureReceiptMediaLoaded();
      const res = await exportViaticosReceiptsPdf(liquidation, freshMedia);
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
      const freshMedia = await ensureReceiptMediaLoaded();
      const xlsxName = await exportViaticosExcel(liquidation, costCenter);
      setExcelResult(xlsxName);
      const pdfRes = await exportViaticosReceiptsPdf(liquidation, freshMedia);
      setPdfResult(pdfRes);
      setSuccessMsg('Se descargaron los archivos locales (Excel oficial + PDF con comprobantes).');
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

  const selectedAttachmentsCount =
    (attachExcel ? 1 : 0) + (attachReceiptsPdf ? 1 : 0) + (attachPlanillaPdf ? 1 : 0);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[94dvh] sm:max-h-[92vh] pb-safe"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 bg-[#132B63] text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-200 truncate">
              Envío Automático por Gmail · Semana #{liquidation.semana || '-'} · {liquidation.monedaBase}
            </div>
            <h3 className="text-sm sm:text-base font-bold truncate mt-0.5">
              {liquidation.lineaLiquidacion || 'Liquidación de Viáticos'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 flex-1">
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
            <div className="px-4 py-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMsg}</span>
              </div>
              {needsGoogleAuth && onReconnectWorkspace && (
                <button
                  type="button"
                  onClick={handleAuthorizeGoogle}
                  disabled={isAuthorizingGoogle}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl shrink-0 cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isAuthorizingGoogle ? 'animate-spin' : ''}`} />
                  <span>{isAuthorizingGoogle ? 'Autorizando...' : 'Autorizar Google'}</span>
                </button>
              )}
            </div>
          )}

          {successMsg && (
            <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1.5">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span className="font-medium leading-relaxed">{successMsg}</span>
              </div>
              {sentSummary && (
                <div className="pl-6 text-[11px] text-emerald-800/90 space-y-0.5">
                  <div>
                    <strong>Para:</strong> {sentSummary.to.join(', ')}
                    {sentSummary.cc.length > 0 ? ` · CC: ${sentSummary.cc.join(', ')}` : ''}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Paperclip className="w-3 h-3 shrink-0" />
                    <span className="font-mono">{sentSummary.attachments.join(' · ')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Direct Gmail Dispatch Section */}
          <div className="rounded-xl border border-[#1E60A8]/25 bg-sky-50/40 p-4 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#132B63] flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>1. Envío Directo por Gmail con Adjuntos</span>
              </h4>
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

            {/* Recipients */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Para (separa varios correos con coma)
                </label>
                <input
                  type="text"
                  inputMode="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="contabilidad@premexcorp.com"
                  className="w-full min-h-[42px] px-3 py-2 text-xs bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  CC (Copia al Consultor / Jefatura)
                </label>
                <input
                  type="text"
                  inputMode="email"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  placeholder="consultor@premexcorp.com"
                  className="w-full min-h-[42px] px-3 py-2 text-xs bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Asunto</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-xs bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            {/* Automatic Attachments Checklist */}
            <div className="rounded-xl bg-white border border-slate-200 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Archivos que se adjuntarán automáticamente ({selectedAttachmentsCount})</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    attachExcel
                      ? 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={attachExcel}
                    onChange={(e) => setAttachExcel(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>Excel Oficial (.xlsx)</span>
                    </div>
                    <div className="text-[11px] text-slate-600 leading-snug mt-0.5">
                      Planilla 14 columnas + hoja Detalle Impuestos
                    </div>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                    attachReceiptsPdf
                      ? 'bg-rose-50/60 border-rose-300 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={attachReceiptsPdf}
                    onChange={(e) => setAttachReceiptsPdf(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-rose-700 focus:ring-rose-600"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                      <span>PDF Comprobantes (.pdf)</span>
                    </div>
                    <div className="text-[11px] text-slate-600 leading-snug mt-0.5">
                      Portada resumen + {attachedFilesCount} factura(s)/foto(s)
                    </div>
                  </div>
                </label>
              </div>

              <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={attachPlanillaPdf}
                  onChange={(e) => setAttachPlanillaPdf(e.target.checked)}
                  className="rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                />
                <span>
                  Adjuntar adicionalmente la <strong>Planilla Imprimible Horizontal (.pdf)</strong>
                </span>
              </label>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Cuerpo del Correo
              </label>
              <textarea
                rows={6}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono leading-relaxed bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCopyEmailBody}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
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
                onClick={handleSendDirectGmail}
                disabled={isSendingGmail || liquidation.items.length === 0 || selectedAttachmentsCount === 0}
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 py-2.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-55 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {isSendingGmail ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    <span>{sendStepLabel || 'Enviando por Gmail...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 shrink-0" />
                    <span>
                      Enviar por Gmail
                      {attachExcel && attachReceiptsPdf ? ' (Excel + PDF)' : ''}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Optional Local Download Backup */}
          <div className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50/70">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                2. Descarga Local y Cierre Manual (Opcional)
              </h4>
            </div>

            {isDraft && permissions.canOperate && (
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoCloseOnDownload}
                  onChange={(e) => setAutoCloseOnDownload(e.target.checked)}
                  className="rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
                />
                <span>Cerrar formalmente esta liquidación al descargar el paquete local</span>
              </label>
            )}

            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadFullPackage}
                disabled={isGeneratingBundle || liquidation.items.length === 0}
                className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 min-h-[42px] px-3.5 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
              >
                {isGeneratingBundle ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>
                  {isGeneratingBundle ? 'Generando...' : 'Descargar Excel + PDF'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadExcelOnly}
                disabled={isGeneratingExcel || liquidation.items.length === 0}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {isGeneratingExcel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                )}
                <span>Solo Excel</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdfOnly}
                disabled={isGeneratingPdf || liquidation.items.length === 0}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {isGeneratingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-rose-700" />
                )}
                <span>Solo PDF</span>
              </button>

              {onPreviewPlanillaPdf && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPreviewPlanillaPdf();
                  }}
                  disabled={liquidation.items.length === 0}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 text-xs font-semibold text-[#132B63] bg-white hover:bg-sky-50 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Printer className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Vista PDF</span>
                </button>
              )}

              {isDraft && permissions.canOperate && !autoCloseOnDownload && (
                <button
                  type="button"
                  onClick={handleCloseOnly}
                  disabled={isClosing}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 py-2 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer"
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
                      {pdfResult.filename} ({pdfResult.embeddedCount} soporte(s) + resumen)
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
