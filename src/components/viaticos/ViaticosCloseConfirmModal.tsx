import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Mail,
  Archive,
  Plus,
  Loader2,
  AlertTriangle,
  Printer,
} from 'lucide-react';
import { ViaticoLiquidation } from '../../types';
import { StoredReceiptMedia } from '../../services/viaticosMediaStore';
import { formatViaticoAmount } from '../../utils/viaticos';

interface ViaticosCloseConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidation: ViaticoLiquidation | null;
  mediaMap: Record<string, StoredReceiptMedia>;
  onConfirmClose: (liqId: string) => Promise<void>;
  onPreviewPlanillaPdf: (liq: ViaticoLiquidation) => void;
  onDownloadExcel: (liq: ViaticoLiquidation) => Promise<void>;
  onDownloadPdf: (liq: ViaticoLiquidation) => Promise<void>;
  onOpenEmailModal: (liqId: string) => void;
  onGoToClosedArchive: () => void;
  onStartNewLiquidation: () => void;
}

export const ViaticosCloseConfirmModal: React.FC<ViaticosCloseConfirmModalProps> = ({
  isOpen,
  onClose,
  liquidation,
  mediaMap,
  onConfirmClose,
  onPreviewPlanillaPdf,
  onDownloadExcel,
  onDownloadPdf,
  onOpenEmailModal,
  onGoToClosedArchive,
  onStartNewLiquidation,
}) => {
  const [isClosing, setIsClosing] = useState(false);
  const [hasClosedNow, setHasClosedNow] = useState(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIsClosing(false);
    setHasClosedNow(false);
    setIsDownloadingExcel(false);
    setIsDownloadingPdf(false);
    setErrorMsg(null);
  }, [isOpen, liquidation?.id]);

  if (!isOpen || !liquidation) return null;

  const isAlreadyClosed = liquidation.estado !== 'borrador' || hasClosedNow;
  const attachedCount = liquidation.items.filter(
    (it) => Boolean(it.attachmentId && mediaMap[it.attachmentId])
  ).length;
  const missingAttachments = liquidation.items.length - attachedCount;

  const handleConfirm = async () => {
    if (liquidation.items.length === 0) {
      setErrorMsg('Agrega al menos una factura antes de cerrar esta liquidación.');
      return;
    }
    setIsClosing(true);
    setErrorMsg(null);
    try {
      await onConfirmClose(liquidation.id);
      setHasClosedNow(true);
    } catch (err: any) {
      setErrorMsg(err?.message || 'No se pudo cerrar la liquidación.');
    } finally {
      setIsClosing(false);
    }
  };

  const handleExcelClick = async () => {
    setIsDownloadingExcel(true);
    setErrorMsg(null);
    try {
      await onDownloadExcel(liquidation);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error generando el Excel.');
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const handlePdfClick = async () => {
    setIsDownloadingPdf(true);
    setErrorMsg(null);
    try {
      await onDownloadPdf(liquidation);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error generando el PDF.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[92dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-4 sm:px-6 py-3.5 sm:py-4 text-white flex items-center justify-between gap-3 shrink-0 ${
            isAlreadyClosed ? 'bg-emerald-800' : 'bg-[#132B63]'
          }`}
        >
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
              {isAlreadyClosed
                ? `Liquidación Concluida · Semana #${liquidation.semana || '-'}`
                : `Cierre de Liquidación · Semana #${liquidation.semana || '-'}`}
            </div>
            <h3 className="text-base font-bold truncate mt-0.5">
              {liquidation.lineaLiquidacion || 'Liquidación de Viáticos'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-4 border-b border-slate-200">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Semana / Moneda
              </div>
              <div className="text-xs font-bold text-slate-900 mt-0.5 tabular-nums">
                Semana #{liquidation.semana || '-'}
              </div>
              <div className="text-[11px] text-slate-500">{liquidation.monedaBase}</div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Consultor
              </div>
              <div className="text-xs font-bold text-slate-900 truncate mt-0.5">
                {liquidation.consultorNombre}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {liquidation.empresa}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Comprobantes
              </div>
              <div className="text-xs font-bold text-slate-900 mt-0.5 tabular-nums">
                {liquidation.items.length} facturas
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                {attachedCount} foto/PDF
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Liquidación
              </div>
              <div className="text-sm font-extrabold text-[#132B63] mt-0.5 font-mono tabular-nums">
                {formatViaticoAmount(
                  liquidation.totalLiquidacion,
                  liquidation.monedaBase,
                  true
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                {isAlreadyClosed ? 'Cerrada' : 'Abierta'}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {!isAlreadyClosed ? (
            /* PHASE 1: Confirmation before closing */
            <div className="space-y-4">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-700 leading-relaxed">
                Al cerrar esta liquidación quedará protegida contra modificaciones y disponible en{' '}
                <strong className="text-slate-900">Liquidaciones Cerradas</strong> para descarga o envío.
              </div>

              {liquidation.items.length === 0 && (
                <div className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Esta liquidación aún no tiene facturas registradas. Agrega al menos un comprobante para poder cerrarla.
                  </span>
                </div>
              )}

              {liquidation.items.length > 0 && missingAttachments > 0 && (
                <div className="px-3.5 py-2.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-amber-900 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                  <span>
                    Hay{' '}
                    <strong className="tabular-nums">{missingAttachments}</strong>{' '}
                    {missingAttachments === 1 ? 'registro' : 'registros'} sin imagen o PDF
                    adjunto en este equipo. Puedes cerrar igualmente si deseas continuar.
                  </span>
                </div>
              )}

              <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 text-sm sm:text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  Seguir Editando
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isClosing || liquidation.items.length === 0}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[46px] sm:min-h-0 px-4 py-2.5 sm:py-2 text-sm sm:text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  {isClosing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  <span>
                    {isClosing ? 'Cerrando liquidación...' : 'Confirmar y Cerrar Liquidación'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* PHASE 2: Concluded state with direct Excel/PDF downloads & next actions */
            <div className="space-y-4">
              <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">Liquidación cerrada y registrada</span>
              </div>

              {/* Direct Download & Print Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onPreviewPlanillaPdf(liquidation);
                  }}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-bold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Printer className="w-4 h-4 text-[#1E60A8]" />
                  <span>Vista PDF / Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={handleExcelClick}
                  disabled={isDownloadingExcel}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-bold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {isDownloadingExcel ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  )}
                  <span>
                    {isDownloadingExcel ? 'Generando...' : 'Excel (.xlsx)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handlePdfClick}
                  disabled={isDownloadingPdf}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-bold text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-xl transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 text-rose-700" />
                  )}
                  <span>
                    {isDownloadingPdf ? 'Compilando...' : 'PDF Comprobantes'}
                  </span>
                </button>
              </div>

              {/* Next Workflow Shortcuts */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenEmailModal(liquidation.id);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Mail className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Enviar por Correo (Opcional)</span>
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onStartNewLiquidation();
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#132B63] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Nueva Liquidación</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onGoToClosedArchive();
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>Consultar Cerradas</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
