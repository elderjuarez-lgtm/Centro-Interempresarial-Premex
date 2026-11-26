import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Code2,
  Download,
  FileCheck2,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Server,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  UserPermissionRecord,
  ViaticoConsultor,
  ViaticoLiquidation,
  ViaticoOdooCatalogs,
} from '../../types';
import { StoredReceiptMedia } from '../../services/viaticosMediaStore';
import {
  OdooConnectorStatusResponse,
  OdooExpensesPostResponse,
  fetchOdooExpensesStatus,
  submitOdooExpensesApi,
} from '../../services/viaticosOdooApi';
import {
  formatViaticoAmount,
  loadViaticoOdooConfig,
} from '../../utils/viaticos';
import {
  buildOdooAccountingDataset,
  buildOdooExpenseApiPayloads,
  exportViaticosOdooApiJson,
} from '../../utils/viaticosOdooExport';

export interface OdooApiLiquidationSyncUpdate {
  liquidationId: string;
  expenseIds: number[];
  expenseSheetId?: number;
  status: 'contabilizado_api' | 'preparado' | 'error';
  message: string;
}

interface ViaticosOdooPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  liquidaciones: ViaticoLiquidation[];
  consultores: ViaticoConsultor[];
  odooCatalogs?: ViaticoOdooCatalogs;
  permissionRecords?: UserPermissionRecord[];
  mediaMap: Record<string, StoredReceiptMedia>;
  onEnsureMediaLoaded?: (ids: string[]) => Promise<void>;
  onRecordApiSyncUpdates: (updates: OdooApiLiquidationSyncUpdate[]) => void;
  onNotify?: (type: 'success' | 'info' | 'error', message: string) => void;
}

export const ViaticosOdooPostModal: React.FC<ViaticosOdooPostModalProps> = ({
  isOpen,
  onClose,
  liquidaciones,
  consultores,
  odooCatalogs,
  permissionRecords = [],
  mediaMap,
  onEnsureMediaLoaded,
  onRecordApiSyncUpdates,
  onNotify,
}) => {
  const [statusInfo, setStatusInfo] = useState<OdooConnectorStatusResponse | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isProbing, setIsProbing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [attachReceipts, setAttachReceipts] = useState(true);
  const [createExpenseSheet, setCreateExpenseSheet] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [apiResponse, setApiResponse] = useState<OdooExpensesPostResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const odooConfig = useMemo(() => loadViaticoOdooConfig(), []);

  const dataset = useMemo(
    () =>
      buildOdooAccountingDataset(
        liquidaciones,
        consultores,
        odooConfig,
        odooCatalogs,
        permissionRecords,
        { expandEmployeeSplitsForDownload: true }
      ),
    [liquidaciones, consultores, odooConfig, odooCatalogs, permissionRecords]
  );

  const hrRows = dataset.hrExpenseRows;

  const receiptAttachmentIds = useMemo(
    () =>
      Array.from(
        new Set(hrRows.map((r) => r.attachmentId || '').filter(Boolean))
      ),
    [hrRows]
  );

  const loadedReceiptsCount = useMemo(
    () => receiptAttachmentIds.filter((id) => Boolean(mediaMap[id]?.dataUrl)).length,
    [receiptAttachmentIds, mediaMap]
  );

  const missingDataWarnings = useMemo(() => {
    const missingNit = hrRows.filter((r) => !r.Partner_id.trim()).length;
    const missingAnalytic = hrRows.filter((r) => !r.analytic_distribution.trim()).length;
    const missingProduct = hrRows.filter((r) => !r.product_id.trim()).length;
    const missingEmployee = hrRows.filter((r) => !r.employee_id.trim()).length;
    const alreadyApiPosted = liquidaciones.filter(
      (l) => l.odooSyncStatus === 'contabilizado_api'
    ).length;
    const alreadyDownloaded = liquidaciones.filter(
      (l) => l.contabilizada && l.odooSyncStatus !== 'contabilizado_api'
    ).length;

    return {
      missingNit,
      missingAnalytic,
      missingProduct,
      missingEmployee,
      alreadyApiPosted,
      alreadyDownloaded,
    };
  }, [hrRows, liquidaciones]);

  const jsonPayloads = useMemo(() => buildOdooExpenseApiPayloads(hrRows), [hrRows]);

  // Reset modal state & fetch server connector status + ensure receipt media loaded on open
  useEffect(() => {
    if (!isOpen) return;
    setApiResponse(null);
    setErrorMsg(null);
    setShowRawJson(false);

    let cancelled = false;
    setIsLoadingStatus(true);
    fetchOdooExpensesStatus(false)
      .then((res) => {
        if (cancelled) return;
        setStatusInfo(res);
        setCreateExpenseSheet(Boolean(res.createExpenseSheetDefault));
      })
      .catch((err: any) => {
        if (!cancelled) {
          setErrorMsg(err?.message || 'No se pudo consultar el servidor.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingStatus(false);
      });

    if (onEnsureMediaLoaded && receiptAttachmentIds.length > 0) {
      void onEnsureMediaLoaded(receiptAttachmentIds);
    }

    return () => {
      cancelled = true;
    };
  }, [isOpen, receiptAttachmentIds, onEnsureMediaLoaded]);

  if (!isOpen) return null;

  const batchTitle =
    liquidaciones.length === 1
      ? `${liquidaciones[0].lineaLiquidacion || 'Liquidación'} (Sem #${
          liquidaciones[0].semana || '-'
        })`
      : `${liquidaciones.length} Liquidaciones seleccionadas`;

  const handleProbeConnection = async () => {
    setIsProbing(true);
    setErrorMsg(null);
    try {
      const res = await fetchOdooExpensesStatus(true);
      setStatusInfo(res);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al probar conexión con el servidor Odoo.');
    } finally {
      setIsProbing(false);
    }
  };

  const handleSubmit = async (action: 'preview' | 'post') => {
    if (hrRows.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      if (attachReceipts && onEnsureMediaLoaded && receiptAttachmentIds.length > 0) {
        await onEnsureMediaLoaded(receiptAttachmentIds);
      }

      const res = await submitOdooExpensesApi({
        action,
        rows: hrRows,
        attachReceipts,
        createExpenseSheet,
        mediaMap,
      });
      setApiResponse(res);

      if (res.mode === 'posted' && res.expenseIdsByLiq) {
        const updates: OdooApiLiquidationSyncUpdate[] = liquidaciones.map((liq) => {
          const ids = res.expenseIdsByLiq?.[liq.id] || [];
          const sheetId = res.sheetIdsByLiq?.[liq.id];
          const hasErr = (res.results || []).some(
            (r) => r.liquidationId === liq.id && r.status === 'error'
          );
          return {
            liquidationId: liq.id,
            expenseIds: ids,
            ...(sheetId ? { expenseSheetId: sheetId } : {}),
            status: ids.length > 0 && !hasErr ? 'contabilizado_api' : hasErr ? 'error' : 'preparado',
            message:
              ids.length > 0
                ? `Contabilizado vía API Odoo (${ids.length} gasto(s) hr.expense: ${ids
                    .map((n) => `#${n}`)
                    .join(', ')})`
                : 'Sin líneas creadas en Odoo.',
          };
        });
        onRecordApiSyncUpdates(updates);
        onNotify?.(
          res.ok ? 'success' : 'info',
          res.message || 'Contabilización en módulo de Gastos Odoo completada.'
        );
      } else if (res.mode === 'prepared_dry_run') {
        const updates: OdooApiLiquidationSyncUpdate[] = liquidaciones
          .filter((l) => l.odooSyncStatus !== 'contabilizado_api')
          .map((liq) => ({
            liquidationId: liq.id,
            expenseIds: [],
            status: 'preparado',
            message: res.message || 'Payload validado y listo para conectar API Odoo.',
          }));
        if (updates.length > 0) {
          onRecordApiSyncUpdates(updates);
        }
        onNotify?.(
          'info',
          res.message ||
            'Carga validada y lista para Odoo API (pendiente activar credenciales en el servidor).'
        );
      } else if (res.error) {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error ejecutando la contabilización en Odoo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadJson = () => {
    const label =
      liquidaciones.length === 1
        ? `Sem${liquidaciones[0].semana || '00'}_${liquidaciones[0].consultorNombre}`
        : `Lote_${liquidaciones.length}_Liq`;
    const file = exportViaticosOdooApiJson(hrRows, label);
    onNotify?.('success', `Payload JSON de Odoo descargado: ${file}`);
  };

  const isConfigured = Boolean(statusInfo?.configured);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white w-full max-w-5xl rounded-2xl border border-slate-200 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 bg-[#132B63] text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-sky-200">
              <Server className="w-3.5 h-3.5" />
              <span>Integración API REST (JSON) · Módulo de Gastos Odoo (hr.expense)</span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold mt-0.5 truncate">
              Contabilizar en Gastos Odoo — {batchTitle}
            </h3>
            <p className="text-xs text-sky-100/90 mt-0.5">
              Envía por API REST en formato JSON exactamente la estructura del archivo plano (Plantilla Gastos GT S-44) con campos fiscales GT, analítica y comprobantes escaneados.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* 1. Connection Readiness Banner */}
          <section
            className={`rounded-2xl border p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
              isConfigured
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-sky-50 border-sky-200 text-[#132B63]'
            }`}
          >
            <div className="flex items-start gap-3 min-w-0">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  isConfigured
                    ? 'bg-emerald-200/80 text-emerald-900'
                    : 'bg-[#1E60A8]/15 text-[#1E60A8]'
                }`}
              >
                {isLoadingStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isConfigured ? (
                  <ShieldCheck className="w-5 h-5" />
                ) : (
                  <Server className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider">
                    {isLoadingStatus
                      ? 'Verificando conector API REST en servidor...'
                      : isConfigured
                      ? `API REST JSON Conectada (${statusInfo?.odooHost || 'Servidor configurado'})`
                      : 'Listo para conectar vía API REST JSON (Esperando URL en servidor)'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed">
                  {statusInfo?.probeResult?.message ? (
                    statusInfo.probeResult.message
                  ) : isConfigured ? (
                    'El endpoint REST JSON está activo en el servidor. Al confirmar se enviarán las líneas de gastos (hr.expense) vía POST JSON.'
                  ) : (
                    <>
                      Todo el paquete JSON REST hacia{' '}
                      <code className="px-1 py-0.5 rounded bg-white/80 font-mono text-[11px]">
                        /api/odoo/expenses
                      </code>{' '}
                      está listo. Cuando agregues la URL en{' '}
                      <span className="font-mono font-bold">
                        {(statusInfo?.missingEnvVars || ['ODOO_REST_URL (o ODOO_URL)']).join(', ')}
                      </span>{' '}
                      (y opcionalmente <span className="font-mono font-bold">ODOO_API_KEY</span>), quedará conectado automáticamente vía API REST.
                    </>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleProbeConnection}
              disabled={isProbing || isLoadingStatus}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-white hover:bg-slate-50 border border-current/20 text-slate-900 disabled:opacity-50 cursor-pointer shrink-0 whitespace-nowrap"
            >
              {isProbing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#1E60A8]" />
              )}
              <span>Probar Conexión Odoo</span>
            </button>
          </section>

          {/* 2. Summary Strip */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Liquidaciones
              </div>
              <div className="text-xl font-extrabold font-mono text-[#132B63] mt-0.5 tabular-nums">
                {liquidaciones.length}
              </div>
              <div className="text-[11px] text-slate-500">
                {liquidaciones.filter((l) => l.estado !== 'borrador').length} cerrada(s)
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Líneas hr.expense
              </div>
              <div className="text-xl font-extrabold font-mono text-slate-900 mt-0.5 tabular-nums">
                {hrRows.length}
              </div>
              <div className="text-[11px] text-slate-500">
                {dataset.expenseRows.length} factura(s) base
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Total a Contabilizar
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dataset.totalsByCurrency.length === 0 ? (
                  <div className="text-sm font-mono text-slate-400">—</div>
                ) : (
                  dataset.totalsByCurrency.map((t) => (
                    <div
                      key={t.moneda}
                      className="text-sm font-extrabold font-mono text-[#132B63] tabular-nums"
                    >
                      {formatViaticoAmount(t.totalReintegrar, t.moneda, true)}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Recibos Adjuntables
              </div>
              <div className="text-xl font-extrabold font-mono text-emerald-700 mt-0.5 tabular-nums">
                {loadedReceiptsCount}
                <span className="text-xs font-normal text-slate-500">
                  {' '}
                  / {receiptAttachmentIds.length}
                </span>
              </div>
              <div className="text-[11px] text-slate-500">Se anexan como ir.attachment</div>
            </div>
          </section>

          {/* 3. Preflight Warnings */}
          {(missingDataWarnings.alreadyApiPosted > 0 ||
            missingDataWarnings.alreadyDownloaded > 0 ||
            missingDataWarnings.missingNit > 0 ||
            missingDataWarnings.missingAnalytic > 0 ||
            missingDataWarnings.missingProduct > 0 ||
            missingDataWarnings.missingEmployee > 0) && (
            <section className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
              <div className="flex items-center gap-1.5 font-extrabold">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Validación previa del lote antes de contabilizar en Odoo</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {missingDataWarnings.alreadyApiPosted > 0 && (
                  <li>
                    <strong>{missingDataWarnings.alreadyApiPosted}</strong> liquidación(es) ya
                    fueron enviadas previamente por API Odoo. Verifica en Odoo antes de reenviar para evitar duplicados.
                  </li>
                )}
                {missingDataWarnings.alreadyDownloaded > 0 && (
                  <li>
                    <strong>{missingDataWarnings.alreadyDownloaded}</strong> liquidación(es) ya
                    tienen descarga previa de Excel/CSV marcada como Contabilizada.
                  </li>
                )}
                {missingDataWarnings.missingEmployee > 0 && (
                  <li className="text-rose-800 font-semibold">
                    {missingDataWarnings.missingEmployee} línea(s) sin Empleado Odoo (employee_id).
                  </li>
                )}
                {missingDataWarnings.missingProduct > 0 && (
                  <li className="text-rose-800 font-semibold">
                    {missingDataWarnings.missingProduct} línea(s) sin Categoría/Producto Odoo (product_id).
                  </li>
                )}
                {missingDataWarnings.missingAnalytic > 0 && (
                  <li>
                    {missingDataWarnings.missingAnalytic} línea(s) sin Distribución Analítica JSON (C.C.).
                  </li>
                )}
                {missingDataWarnings.missingNit > 0 && (
                  <li>
                    {missingDataWarnings.missingNit} línea(s) sin NIT de proveedor (Partner_id); se creará el gasto sin proveedor vinculado si no se completa.
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* 4. Posting Options */}
          <section className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={attachReceipts}
                  onChange={(e) => setAttachReceipts(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1E60A8] cursor-pointer"
                />
                <Paperclip className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Adjuntar recibos escaneados (`ir.attachment`)</span>
              </label>

              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createExpenseSheet}
                  onChange={(e) => setCreateExpenseSheet(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-[#1E60A8] cursor-pointer"
                />
                <FileCheck2 className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Crear Informe de Gastos (`hr.expense.sheet`)</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRawJson((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-[#132B63] bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>{showRawJson ? 'Ver Tabla Mapeada' : 'Ver JSON API'}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                disabled={hrRows.length === 0}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-[#132B63] bg-white hover:bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-45 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Descargar JSON</span>
              </button>
            </div>
          </section>

          {/* 5. API Result / Dry-Run Feedback */}
          {errorMsg && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="font-medium break-words">{errorMsg}</div>
            </div>
          )}

          {apiResponse && (
            <section
              className={`rounded-xl border p-3.5 text-xs space-y-2 ${
                apiResponse.mode === 'posted' && apiResponse.ok
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : apiResponse.mode === 'prepared_dry_run'
                  ? 'bg-sky-50 border-sky-200 text-[#132B63]'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="flex items-center gap-2 font-extrabold">
                {apiResponse.mode === 'posted' && apiResponse.ok ? (
                  <BadgeCheck className="w-4 h-4 text-emerald-700" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#1E60A8]" />
                )}
                <span>{apiResponse.message || apiResponse.error}</span>
              </div>

              {apiResponse.mode === 'posted' && apiResponse.results && (
                <div className="max-h-40 overflow-y-auto bg-white/80 rounded-lg border border-current/15 divide-y divide-slate-100">
                  {apiResponse.results.map((r) => (
                    <div
                      key={r.rowKey}
                      className="px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="font-mono text-slate-700 truncate max-w-[360px]">
                        {r.rowKey}
                      </span>
                      {r.status === 'created' ? (
                        <span className="font-bold text-emerald-800 font-mono">
                          hr.expense #{r.odooExpenseId}
                          {r.odooAttachmentId ? ` · ir.attachment #${r.odooAttachmentId}` : ''}
                        </span>
                      ) : (
                        <span className="font-semibold text-rose-700">{r.error}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 6. Preview Table or Raw JSON */}
          {showRawJson ? (
            <div className="rounded-xl border border-slate-200 bg-slate-950 text-sky-100 p-3.5 overflow-x-auto max-h-72 text-[11px] font-mono">
              <pre>{JSON.stringify(jsonPayloads, null, 2)}</pre>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-left border-collapse text-[11px] min-w-[1080px]">
                  <thead className="sticky top-0 bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200 z-10">
                    <tr>
                      <th className="py-2 px-2.5">Fecha Gasto / Cont.</th>
                      <th className="py-2 px-2.5">Descripción (`name`)</th>
                      <th className="py-2 px-2.5">Categoría (`product_id`)</th>
                      <th className="py-2 px-2.5">Empleado (`employee_id`)</th>
                      <th className="py-2 px-2.5">Proveedor NIT</th>
                      <th className="py-2 px-2.5">Ref / Serie</th>
                      <th className="py-2 px-2.5">GT Doc / Diario</th>
                      <th className="py-2 px-2.5">Impuestos (`tax_ids`)</th>
                      <th className="py-2 px-2.5">Analítica</th>
                      <th className="py-2 px-2.5 text-right">Total</th>
                      <th className="py-2 px-2.5 text-center">Recibo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {hrRows.map((row) => {
                      const hasMedia = Boolean(row.attachmentId && mediaMap[row.attachmentId]?.dataUrl);
                      return (
                        <tr key={row.rowKey} className="hover:bg-slate-50/80">
                          <td className="py-2 px-2.5 font-mono whitespace-nowrap">
                            <div className="font-semibold text-slate-800">{row.date}</div>
                            {row.accounting_date && row.accounting_date !== row.date && (
                              <div className="text-[10px] text-slate-400">
                                Cont: {row.accounting_date}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-2.5 max-w-[200px]">
                            <div className="font-semibold text-slate-900 truncate" title={row.name}>
                              {row.name}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {row.payment_reference}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 text-slate-700 max-w-[170px] truncate" title={row.product_id}>
                            {row.product_id}
                          </td>
                          <td className="py-2 px-2.5 font-semibold text-[#132B63] max-w-[160px] truncate" title={row.employee_id}>
                            {row.employee_id}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                            {row.Partner_id || <span className="text-amber-600">Sin NIT</span>}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                            {[row.serial_number, row.vendor_ref].filter(Boolean).join(' / ') || '—'}
                          </td>
                          <td className="py-2 px-2.5 text-slate-600 max-w-[150px] truncate">
                            <div>{row.l10n_gt_edi_doc_type}</div>
                            <div className="text-[10px] text-slate-400">{row.Journal}</div>
                          </td>
                          <td className="py-2 px-2.5 text-slate-600 max-w-[150px] truncate" title={row.tax_ids}>
                            {row.tax_ids || 'Exento'}
                          </td>
                          <td className="py-2 px-2.5 font-mono text-[10px] text-slate-700 whitespace-nowrap">
                            {row.analytic_distribution || (
                              <span className="text-amber-600">Sin C.C.</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-bold text-[#132B63] whitespace-nowrap">
                            {row.total_amount_currency.toFixed(2)} {row.currency_id}
                          </td>
                          <td className="py-2 px-2.5 text-center">
                            {hasMedia ? (
                              <span
                                title={row.attachmentName || 'Soporte listo'}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-800"
                              >
                                <Paperclip className="w-3 h-3" />
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl cursor-pointer"
          >
            Cerrar
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleSubmit('preview');
              }}
              disabled={isSubmitting || hrRows.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#132B63] bg-white hover:bg-sky-50 border border-[#1E60A8]/30 rounded-xl disabled:opacity-45 cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1E60A8]" />
              )}
              <span>Validar Payload (Pre-envío)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                void handleSubmit('post');
              }}
              disabled={isSubmitting || hrRows.length === 0}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-extrabold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-45 rounded-xl transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4 text-emerald-300" />
              )}
              <span>
                {isConfigured
                  ? `Contabilizar ${hrRows.length} Gasto(s) en Odoo`
                  : 'Contabilizar en Gastos Odoo (API)'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
