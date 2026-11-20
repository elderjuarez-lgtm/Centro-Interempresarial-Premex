import React, { useState, useMemo, useEffect } from 'react';
import {
  History,
  Search,
  Eye,
  Download,
  Printer,
  ArrowLeft,
  FolderPlus,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Landmark,
  FileSpreadsheet,
  FileText,
  Calendar,
  User as UserIcon,
  Layers,
  Send,
} from 'lucide-react';
import { BankAccount, BankClosedReconciliation } from '../../types';
import {
  RECONCILING_SECTION_META,
  computeBankReconciliationSummary,
  formatBankMoney,
  formatSheetDate,
  getBankBrandMeta,
  getEffectiveSapItemSection,
  getSapDocumentClassLabel,
} from '../../utils/bankReconciliation';
import {
  BankBatchSheetEntry,
  BankExportMode,
  exportBankBatchPdf,
  exportSapDeliverableWorkbook,
  generateBankBatchPdfBytes,
  generateSapDeliverableWorkbookBytes,
} from '../../utils/bankOfficialExport';
import { BankOfficialSheet } from './BankOfficialSheet';
import { BankPrintPreviewModal } from './BankPrintPreviewModal';
import {
  BankExportAccountItem,
  BankExportFormat,
  BankExportModal,
} from './BankExportModal';
import { BankEmailModal } from './BankEmailModal';

interface BankHistorialViewProps {
  closedReconciliations: BankClosedReconciliation[];
  openPeriod: string | null;
  isReadOnly?: boolean;
  accessToken?: string | null;
  onReconnectWorkspace?: () => Promise<string | null>;
  onInvalidateWorkspaceToken?: () => void;
  onRequestOpenReconciliation: () => void;
  onRequestCloseCurrent: () => void;
  onGoToCentroCuadre: () => void;
  onNotify: (type: 'success' | 'info' | 'error', message: string) => void;
}

interface HistorialExportContext {
  records: BankClosedReconciliation[];
  items: BankExportAccountItem[];
  format: BankExportFormat;
  mode: BankExportMode;
  initialAccountId?: string;
  initialSocietyKey?: string;
  title: string;
  subtitle: string;
}

interface HistorialEmailContext {
  records: BankClosedReconciliation[];
  items: BankExportAccountItem[];
  initialAccountId?: string;
  initialSocietyKey?: string;
  title: string;
  subtitle: string;
}

interface HistorialPrintPreviewState {
  records: BankClosedReconciliation[];
  entries: BankBatchSheetEntry[];
  selectedItems: BankExportAccountItem[];
  mode: BankExportMode;
  scopeLabel: string;
  selectedMonth: string;
}

const formatClosedDateTime = (iso: string): string => {
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return iso;
    return dt.toLocaleString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
};

const getAccountSocietyKey = (acc: BankAccount): string =>
  (acc.codigoSociedad || acc.sociedad || '').trim().toUpperCase();

const buildExportItemsFromRecords = (
  records: BankClosedReconciliation[]
): BankExportAccountItem[] => {
  const items: BankExportAccountItem[] = [];
  records.forEach((rec) => {
    rec.accounts.forEach((acc) => {
      items.push({
        account: acc,
        period: rec.period,
        summary: computeBankReconciliationSummary(
          acc,
          [],
          [],
          [],
          rec.period,
          rec.sapOpenItems
        ),
      });
    });
  });
  return items;
};

export const BankHistorialView: React.FC<BankHistorialViewProps> = ({
  closedReconciliations,
  openPeriod,
  isReadOnly = false,
  accessToken = null,
  onReconnectWorkspace,
  onInvalidateWorkspaceToken,
  onRequestOpenReconciliation,
  onRequestCloseCurrent,
  onGoToCentroCuadre,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [selectedClosedId, setSelectedClosedId] = useState<string | null>(null);
  const [checkedClosedIds, setCheckedClosedIds] = useState<Set<string>>(new Set());
  const [detailSocietyKey, setDetailSocietyKey] = useState<string>('ALL');
  const [detailAccountId, setDetailAccountId] = useState<string>('');
  const [exportContext, setExportContext] = useState<HistorialExportContext | null>(null);
  const [emailContext, setEmailContext] = useState<HistorialEmailContext | null>(null);
  const [printPreview, setPrintPreview] = useState<HistorialPrintPreviewState | null>(null);

  const selectedClosed = useMemo(
    () => closedReconciliations.find((c) => c.id === selectedClosedId) || null,
    [closedReconciliations, selectedClosedId]
  );

  // Keep detail view selection valid when entering a closed period
  useEffect(() => {
    if (!selectedClosed) {
      setDetailSocietyKey('ALL');
      setDetailAccountId('');
      return;
    }
    setDetailSocietyKey('ALL');
    setDetailAccountId(selectedClosed.accounts[0]?.id || '');
  }, [selectedClosed?.id]);

  // Prune stale checked IDs if closedReconciliations changes
  useEffect(() => {
    const validIds = new Set(closedReconciliations.map((c) => c.id));
    setCheckedClosedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [closedReconciliations]);

  // Filter master list
  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return closedReconciliations;
    return closedReconciliations.filter((rec) => {
      if (rec.period.toLowerCase().includes(q)) return true;
      if (rec.closedByName.toLowerCase().includes(q)) return true;
      if ((rec.notes || '').toLowerCase().includes(q)) return true;
      if (
        rec.societies.some(
          (s) =>
            s.nombre.toLowerCase().includes(q) || s.codigoSociedad.toLowerCase().includes(q)
        )
      ) {
        return true;
      }
      if (
        rec.accounts.some(
          (a) => a.banco.toLowerCase().includes(q) || a.sociedad.toLowerCase().includes(q)
        )
      ) {
        return true;
      }
      return false;
    });
  }, [closedReconciliations, search]);

  const checkedRecords = useMemo(
    () => closedReconciliations.filter((r) => checkedClosedIds.has(r.id)),
    [closedReconciliations, checkedClosedIds]
  );

  const checkedTotalAccounts = useMemo(
    () => checkedRecords.reduce((sum, r) => sum + r.accounts.length, 0),
    [checkedRecords]
  );

  // Compute frozen summaries for the inspected closed reconciliation
  const closedSummaries = useMemo(() => {
    if (!selectedClosed) return [];
    return selectedClosed.accounts.map((acc) => ({
      account: acc,
      summary: computeBankReconciliationSummary(
        acc,
        [],
        [],
        [],
        selectedClosed.period,
        selectedClosed.sapOpenItems
      ),
    }));
  }, [selectedClosed]);

  const closedSocietyButtons = useMemo(() => {
    if (!selectedClosed) return [];
    const map = new Map<
      string,
      { key: string; codigoSociedad: string; nombre: string; total: number; squared: number }
    >();
    selectedClosed.societies.forEach((s) => {
      const k = s.codigoSociedad.trim().toUpperCase();
      map.set(k, {
        key: k,
        codigoSociedad: s.codigoSociedad,
        nombre: s.nombre,
        total: 0,
        squared: 0,
      });
    });
    closedSummaries.forEach(({ account, summary }) => {
      const k = getAccountSocietyKey(account);
      if (!map.has(k)) {
        map.set(k, {
          key: k,
          codigoSociedad: account.codigoSociedad || '',
          nombre: account.sociedad,
          total: 0,
          squared: 0,
        });
      }
      const entry = map.get(k)!;
      entry.total += 1;
      if (Math.abs(summary.diferenciaNeta) <= 1) entry.squared += 1;
    });
    return Array.from(map.values()).filter((e) => e.total > 0);
  }, [selectedClosed, closedSummaries]);

  const scopedClosedSummaries = useMemo(() => {
    if (detailSocietyKey === 'ALL') return closedSummaries;
    return closedSummaries.filter(
      ({ account }) => getAccountSocietyKey(account) === detailSocietyKey
    );
  }, [closedSummaries, detailSocietyKey]);

  useEffect(() => {
    if (!selectedClosed) return;
    const exists = scopedClosedSummaries.some(({ account }) => account.id === detailAccountId);
    if (!exists && scopedClosedSummaries.length > 0) {
      setDetailAccountId(scopedClosedSummaries[0].account.id);
    }
  }, [selectedClosed, scopedClosedSummaries, detailAccountId]);

  const activeClosedEntry = useMemo(
    () =>
      scopedClosedSummaries.find(({ account }) => account.id === detailAccountId) ||
      scopedClosedSummaries[0] ||
      null,
    [scopedClosedSummaries, detailAccountId]
  );

  const activeAccountOpenItems = useMemo(() => {
    if (!selectedClosed || !activeClosedEntry) return [];
    return selectedClosed.sapOpenItems.filter(
      (i) => i.cuentaId === activeClosedEntry.account.id
    );
  }, [selectedClosed, activeClosedEntry]);

  // ============================================================================
  // Unified Individual & Masivo Export Handlers (Single or Multiple Closed Periods)
  // ============================================================================

  const openHistorialExportModal = (opts: {
    records: BankClosedReconciliation[];
    format: BankExportFormat;
    mode: BankExportMode;
    initialAccountId?: string;
    initialSocietyKey?: string;
  }) => {
    const items = buildExportItemsFromRecords(opts.records);
    if (items.length === 0) {
      onNotify('info', 'No hay cuentas bancarias visibles en los cierres seleccionados.');
      return;
    }
    const isSingleRec = opts.records.length === 1;
    setExportContext({
      records: opts.records,
      items,
      format: opts.format,
      mode: opts.mode,
      initialAccountId: opts.initialAccountId,
      initialSocietyKey: opts.initialSocietyKey || 'ALL',
      title: isSingleRec
        ? `Descargar Historial · ${opts.records[0].period}`
        : `Descarga Masiva del Historial (${opts.records.length} periodos)`,
      subtitle: isSingleRec
        ? `Cierre archivado · ${items.length} cuenta(s) bancaria(s) disponibles`
        : `${opts.records.map((r) => r.period).join(', ')} · ${items.length} conciliación(es)`,
    });
  };

  const openHistorialEmailModal = (opts: {
    records: BankClosedReconciliation[];
    initialAccountId?: string;
    initialSocietyKey?: string;
  }) => {
    const items = buildExportItemsFromRecords(opts.records);
    if (items.length === 0) {
      onNotify('info', 'No hay cuentas bancarias visibles en los cierres seleccionados.');
      return;
    }
    const isSingleRec = opts.records.length === 1;
    setEmailContext({
      records: opts.records,
      items,
      initialAccountId: opts.initialAccountId,
      initialSocietyKey: opts.initialSocietyKey || 'ALL',
      title: isSingleRec
        ? `Enviar Conciliación Cerrada · ${opts.records[0].period}`
        : `Enviar Historial por Correo (${opts.records.length} periodos)`,
      subtitle: isSingleRec
        ? `Cierre archivado · ${items.length} cuenta(s) bancaria(s)`
        : `${opts.records.map((r) => r.period).join(', ')} · ${items.length} conciliación(es)`,
    });
  };

  const buildHistorialExcelBytes = async (
    records: BankClosedReconciliation[],
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return null;
    const selectedPairKeys = new Set(selectedItems.map((it) => `${it.period}::${it.account.id}`));
    const selectedPeriods = new Set(selectedItems.map((it) => it.period));
    const scopedOpenItems = records.flatMap((rec) =>
      selectedPeriods.has(rec.period)
        ? rec.sapOpenItems.filter((i) => selectedPairKeys.has(`${rec.period}::${i.cuentaId}`))
        : []
    );
    const scopedBalanceRows = records.flatMap((rec) =>
      selectedPeriods.has(rec.period) ? rec.sapBalanceRows : []
    );
    const primaryPeriod = selectedItems[0].period;
    const cleanScope = scopeLabel.replace(/^Historial_/i, '');
    return generateSapDeliverableWorkbookBytes({
      activeSummary: selectedItems[0].summary,
      centerSummaries: selectedItems.map((i) => i.summary),
      batchEntries: selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
      mode,
      sapOpenItems: scopedOpenItems,
      sapBalanceRows: scopedBalanceRows,
      statementItems: [],
      ledgerItems: [],
      matches: [],
      selectedMonth: selectedPeriods.size === 1 ? primaryPeriod : 'MultiPeriodo',
      scopeLabel: `Historial_${cleanScope}`,
    });
  };

  const buildHistorialPdfBytes = async (
    selectedItems: BankExportAccountItem[],
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return null;
    return generateBankBatchPdfBytes(
      selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
      `Historial_${scopeLabel}`
    );
  };

  const executeHistorialExcel = async (
    records: BankClosedReconciliation[],
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return;
    try {
      const selectedPairKeys = new Set(
        selectedItems.map((it) => `${it.period}::${it.account.id}`)
      );
      const selectedPeriods = new Set(selectedItems.map((it) => it.period));

      const scopedOpenItems = records.flatMap((rec) =>
        selectedPeriods.has(rec.period)
          ? rec.sapOpenItems.filter((i) => selectedPairKeys.has(`${rec.period}::${i.cuentaId}`))
          : []
      );
      const scopedBalanceRows = records.flatMap((rec) =>
        selectedPeriods.has(rec.period) ? rec.sapBalanceRows : []
      );
      const primaryPeriod = selectedItems[0].period;

      const cleanScope = scopeLabel.replace(/^Historial_/i, '');
      await exportSapDeliverableWorkbook({
        activeSummary: selectedItems[0].summary,
        centerSummaries: selectedItems.map((i) => i.summary),
        batchEntries: selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
        mode,
        sapOpenItems: scopedOpenItems,
        sapBalanceRows: scopedBalanceRows,
        statementItems: [],
        ledgerItems: [],
        matches: [],
        selectedMonth: selectedPeriods.size === 1 ? primaryPeriod : 'MultiPeriodo',
        scopeLabel: `Historial_${cleanScope}`,
      });

      onNotify(
        'success',
        mode === 'individual'
          ? `Excel histórico individual (${selectedItems[0].account.banco} · ${primaryPeriod}) descargado.`
          : `Excel histórico masivo descargado: Resumen Consolidado + ${selectedItems.length} hoja(s) oficial(es) con fórmulas vivas.`
      );
    } catch (err: unknown) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo exportar el entregable histórico.'
      );
    }
  };

  const executeHistorialPdf = async (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return;
    try {
      await exportBankBatchPdf(
        selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
        `Historial_${scopeLabel}`
      );
      onNotify(
        'success',
        mode === 'individual'
          ? `PDF histórico individual (${selectedItems[0].account.banco} · ${selectedItems[0].period}) descargado.`
          : `PDF histórico masivo descargado con ${selectedItems.length} hoja(s) oficial(es) horizontales.`
      );
    } catch (err: unknown) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo generar el documento PDF histórico.'
      );
    }
  };

  const openHistorialPdfPreview = (
    records: BankClosedReconciliation[],
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => {
    if (selectedItems.length === 0) return;
    const uniquePeriods = new Set(selectedItems.map((i) => i.period));
    setPrintPreview({
      records,
      entries: selectedItems.map((i) => ({ summary: i.summary, period: i.period })),
      selectedItems,
      mode,
      scopeLabel: `Historial_${scopeLabel}`,
      selectedMonth:
        uniquePeriods.size === 1 ? selectedItems[0].period : `${uniquePeriods.size} periodos`,
    });
  };

  const toggleCheckRecord = (id: string) => {
    setCheckedClosedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleChecked =
    filteredHistory.length > 0 && filteredHistory.every((r) => checkedClosedIds.has(r.id));

  const toggleCheckAllVisible = () => {
    setCheckedClosedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleChecked) {
        filteredHistory.forEach((r) => next.delete(r.id));
      } else {
        filteredHistory.forEach((r) => next.add(r.id));
      }
      return next;
    });
  };

  // Shared modals rendered in both Detail and Master List views
  const renderSharedModals = () => (
    <>
      {exportContext && (
        <BankExportModal
          isOpen={true}
          onClose={() => setExportContext(null)}
          title={exportContext.title}
          subtitle={exportContext.subtitle}
          items={exportContext.items}
          initialFormat={exportContext.format}
          initialMode={exportContext.mode}
          initialAccountId={exportContext.initialAccountId}
          initialSocietyKey={exportContext.initialSocietyKey}
          onExecuteExcel={(sel, mode, scope) =>
            executeHistorialExcel(exportContext.records, sel, mode, scope)
          }
          onExecutePdf={executeHistorialPdf}
          onOpenPdfPreview={(sel, mode, scope) =>
            openHistorialPdfPreview(exportContext.records, sel, mode, scope)
          }
        />
      )}

      {emailContext && (
        <BankEmailModal
          isOpen={true}
          onClose={() => setEmailContext(null)}
          title={emailContext.title}
          subtitle={emailContext.subtitle}
          items={emailContext.items}
          initialAccountId={emailContext.initialAccountId}
          initialSocietyKey={emailContext.initialSocietyKey}
          buildExcelBytes={(sel, mode, scope) =>
            buildHistorialExcelBytes(emailContext.records, sel, mode, scope)
          }
          buildPdfBytes={buildHistorialPdfBytes}
          accessToken={accessToken}
          onReconnectWorkspace={onReconnectWorkspace}
          onInvalidateWorkspaceToken={onInvalidateWorkspaceToken}
          onSentSuccess={(msg) => onNotify('success', msg)}
        />
      )}

      {printPreview && (
        <BankPrintPreviewModal
          isOpen={true}
          onClose={() => setPrintPreview(null)}
          entries={printPreview.entries}
          selectedMonth={printPreview.selectedMonth}
          scopeLabel={printPreview.scopeLabel}
          onExportFullExcel={() =>
            executeHistorialExcel(
              printPreview.records,
              printPreview.selectedItems,
              printPreview.mode,
              printPreview.scopeLabel
            )
          }
        />
      )}
    </>
  );

  // ============================================================================
  // DETAIL CONSULTATION MODE (Read-only frozen snapshot)
  // ============================================================================

  if (selectedClosed) {
    return (
      <div className="space-y-5">
        {/* Top Consultation Header Bar */}
        <section className="bg-white rounded-2xl border border-slate-200/90 px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 print:hidden">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedClosedId(null)}
              className="mt-0.5 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Historial</span>
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-[#132B63]">
                  <Lock className="w-3.5 h-3.5" />
                  Conciliación Cerrada
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatClosedDateTime(selectedClosed.closedAtIso)}</span>
                <span aria-hidden="true">·</span>
                <span>Por {selectedClosed.closedByName}</span>
              </div>
              <h3 className="text-base font-bold text-slate-900 mt-0.5 truncate">
                {selectedClosed.period}
              </h3>
              {selectedClosed.notes && (
                <p className="text-xs text-slate-600 mt-1">{selectedClosed.notes}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                openHistorialExportModal({
                  records: [selectedClosed],
                  format: 'pdf',
                  mode: 'masivo',
                  initialAccountId: activeClosedEntry?.account.id,
                  initialSocietyKey: detailSocietyKey,
                })
              }
              disabled={selectedClosed.accounts.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
              title="Descargar o imprimir PDF (individual o masivo)"
            >
              <Printer className="w-3.5 h-3.5 text-[#132B63]" />
              <span>Descargar PDF</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openHistorialExportModal({
                  records: [selectedClosed],
                  format: 'excel',
                  mode: 'masivo',
                  initialAccountId: activeClosedEntry?.account.id,
                  initialSocietyKey: detailSocietyKey,
                })
              }
              disabled={selectedClosed.accounts.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#0E224D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              title="Descargar Excel entregable (individual o masivo)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Descargar Excel</span>
            </button>
            <button
              type="button"
              onClick={() =>
                openHistorialEmailModal({
                  records: [selectedClosed],
                  initialAccountId: activeClosedEntry?.account.id,
                  initialSocietyKey: detailSocietyKey,
                })
              }
              disabled={selectedClosed.accounts.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              title="Enviar conciliación cerrada por correo Gmail (PDF, Excel o ambos)"
            >
              <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Enviar Correo</span>
            </button>
          </div>
        </section>

        {/* Frozen Society Filter Buttons */}
        {closedSocietyButtons.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200/90 p-4 space-y-3 print:hidden">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                <Building2 className="w-4 h-4 text-[#1E60A8]" />
                <span>Sociedades archivadas en {selectedClosed.period}</span>
              </div>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {selectedClosed.accountsCount} cuenta(s) · {selectedClosed.openItemsCount}{' '}
                partida(s) SAP
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDetailSocietyKey('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  detailSocietyKey === 'ALL'
                    ? 'bg-[#132B63] text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                Todas ({closedSummaries.length})
              </button>
              {closedSocietyButtons.map((soc) => {
                const active = detailSocietyKey === soc.key;
                return (
                  <button
                    key={soc.key}
                    type="button"
                    onClick={() => setDetailSocietyKey(soc.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#1E60A8] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    {soc.codigoSociedad ? `${soc.codigoSociedad} · ` : ''}
                    {soc.nombre} ({soc.squared}/{soc.total})
                  </button>
                );
              })}
            </div>

            {/* Frozen Bank Cards Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 pt-1">
              {scopedClosedSummaries.map(({ account, summary }) => {
                const isSelected = activeClosedEntry?.account.id === account.id;
                const isOk = Math.abs(summary.diferenciaNeta) <= 1;
                const brand = getBankBrandMeta(account.banco);
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => setDetailAccountId(account.id)}
                    className={`text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gradient-to-br from-[#0E224D] via-[#132E66] to-[#1E60A8] text-white border-[#132B63] shadow-sm'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-[#1E60A8]/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSelected
                              ? 'bg-white/20 text-white'
                              : `${brand.badgeBg} ${brand.badgeText}`
                          }`}
                        >
                          {brand.monogram}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold truncate">{account.banco}</div>
                          <div
                            className={`text-[11px] truncate ${
                              isSelected ? 'text-sky-200' : 'text-slate-500'
                            }`}
                          >
                            {account.sociedad} · {account.numeroCuenta}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold whitespace-nowrap shrink-0 ${
                          isSelected
                            ? isOk
                              ? 'text-emerald-300'
                              : 'text-amber-300'
                            : isOk
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {isOk ? 'Cuadrado' : 'Con dif.'}
                      </span>
                    </div>
                    <div
                      className={`mt-2.5 pt-2 border-t flex items-center justify-between text-[11px] font-mono tabular-nums ${
                        isSelected
                          ? 'border-white/15 text-sky-100'
                          : 'border-slate-100 text-slate-600'
                      }`}
                    >
                      <span>Libros: {formatBankMoney(summary.saldoLibros, account.moneda)}</span>
                      <span>Extracto: {formatBankMoney(summary.saldoExtracto, account.moneda)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Frozen Corporate Deliverable Sheet (Strictly Read-Only) */}
        {activeClosedEntry ? (
          <>
            <BankOfficialSheet
              summary={activeClosedEntry.summary}
              selectedMonth={selectedClosed.period}
              isReadOnly={true}
              onUpdateSaldoExtracto={() => {}}
              onSyncExtractoToCta00={() => {}}
              onUpdateMonthlyBalances={() => {}}
              onAddReconcilingItem={() => {}}
              onDeleteLineItem={() => {}}
              onOpenAccountPartidas={() => {}}
              onOpenPrintPreview={() =>
                openHistorialExportModal({
                  records: [selectedClosed],
                  format: 'pdf',
                  mode: 'individual',
                  initialAccountId: activeClosedEntry.account.id,
                  initialSocietyKey: detailSocietyKey,
                })
              }
              onExportOfficialExcel={() =>
                openHistorialExportModal({
                  records: [selectedClosed],
                  format: 'excel',
                  mode: 'individual',
                  initialAccountId: activeClosedEntry.account.id,
                  initialSocietyKey: detailSocietyKey,
                })
              }
            />

            {/* Frozen Subaccounts 00 / 01 / 02 + FBL3N Open Items Table */}
            <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden print:hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Detalle Congelado SAP 00 / 01 / 02 y Partidas Abiertas ·{' '}
                    {activeClosedEntry.account.banco}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Cta 00:{' '}
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
                      {formatBankMoney(
                        activeClosedEntry.summary.saldoCuenta00,
                        activeClosedEntry.account.moneda
                      )}
                    </span>{' '}
                    · Cta 01:{' '}
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
                      {formatBankMoney(
                        activeClosedEntry.summary.saldoCuenta01,
                        activeClosedEntry.account.moneda
                      )}
                    </span>{' '}
                    · Cta 02:{' '}
                    <span className="font-mono tabular-nums font-semibold text-slate-800">
                      {formatBankMoney(
                        activeClosedEntry.summary.saldoCuenta02,
                        activeClosedEntry.account.moneda
                      )}
                    </span>
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-600">
                  {activeAccountOpenItems.length} partida(s) FBL3N archivada(s)
                </span>
              </div>

              {activeAccountOpenItems.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No se registraron partidas abiertas SAP (FBL3N) para esta cuenta al cierre de{' '}
                  {selectedClosed.period}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                        <th className="py-2.5 px-3">Clase / Subcta</th>
                        <th className="py-2.5 px-3">No. Doc / Ref</th>
                        <th className="py-2.5 px-3">Fecha</th>
                        <th className="py-2.5 px-3">Tercero / Texto</th>
                        <th className="py-2.5 px-3">Sección Entregable</th>
                        <th className="py-2.5 px-3 text-right">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeAccountOpenItems.map((item) => {
                        const effSection = getEffectiveSapItemSection(item);
                        const meta = RECONCILING_SECTION_META[effSection];
                        return (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-800 whitespace-nowrap">
                              <span className="font-bold">{item.claseDocumento}</span> · Cta{' '}
                              {item.subcuentaTipo}
                              <div className="text-[10px] font-sans text-slate-500">
                                {getSapDocumentClassLabel(item.claseDocumento)}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-slate-800 whitespace-nowrap">
                              <div>{item.numeroDocumento || '-'}</div>
                              {item.referencia && item.referencia !== item.numeroDocumento && (
                                <div className="text-[10px] text-slate-500">{item.referencia}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                              {formatSheetDate(item.fechaDocumento || item.fechaContabilizacion)}
                            </td>
                            <td className="py-2.5 px-3 text-slate-800 max-w-xs">
                              <div className="font-medium truncate">{item.texto || '-'}</div>
                              {item.claveRef3 && (
                                <div className="text-[11px] text-slate-500 truncate">
                                  {item.claveRef3}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                              {meta.shortLabel}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                              {formatBankMoney(item.importeMonedaLocal, item.monedaLocal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
            No hay cuentas visibles en esta conciliación cerrada para el filtro seleccionado.
          </div>
        )}

        {renderSharedModals()}
      </div>
    );
  }

  // ============================================================================
  // MASTER LIST MODE (Archive Table of Closed Reconciliations)
  // ============================================================================

  return (
    <div className="space-y-5">
      {/* Top Action & Filter Bar */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#1E60A8]" />
          <h3 className="text-sm font-bold text-slate-900">
            Historial de Conciliaciones Cerradas
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {closedReconciliations.length > 0 && (
            <>
              <button
                type="button"
                onClick={() =>
                  openHistorialExportModal({
                    records: checkedRecords.length > 0 ? checkedRecords : closedReconciliations,
                    format: 'excel',
                    mode: 'masivo',
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Descargar múltiples cuentas o periodos cerrados en Excel o PDF"
              >
                <Layers className="w-3.5 h-3.5 text-emerald-700" />
                <span>Descarga Masiva</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  openHistorialEmailModal({
                    records: checkedRecords.length > 0 ? checkedRecords : closedReconciliations,
                  })
                }
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Enviar conciliaciones cerradas por correo Gmail"
              >
                <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Enviar Correo</span>
              </button>
            </>
          )}
          {!isReadOnly && openPeriod && (
            <button
              type="button"
              onClick={onRequestCloseCurrent}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#132B63] bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Cerrar {openPeriod}</span>
            </button>
          )}
          {!isReadOnly && (
            <button
              type="button"
              onClick={onRequestOpenReconciliation}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                openPeriod
                  ? 'bg-slate-100 text-slate-500 hover:bg-slate-200/70 border border-slate-200'
                  : 'bg-[#1E60A8] hover:bg-[#132B63] text-white'
              }`}
              title={
                openPeriod
                  ? `Debes cerrar ${openPeriod} antes de abrir una nueva conciliación`
                  : 'Abrir un nuevo periodo de conciliación bancaria'
              }
            >
              {openPeriod ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <FolderPlus className="w-3.5 h-3.5" />
              )}
              <span>Abrir Conciliación</span>
            </button>
          )}
        </div>
      </section>

      {/* Search & Empty / List State */}
      {closedReconciliations.length === 0 ? (
        <section className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#132B63] flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h4 className="text-sm font-bold text-slate-900">
              Aún no hay conciliaciones cerradas en el historial
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              {openPeriod
                ? `Periodo actual (${openPeriod}) abierto. Cierra la conciliación para archivarla aquí.`
                : 'No hay periodos archivados.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={onGoToCentroCuadre}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Landmark className="w-3.5 h-3.5 text-[#132B63]" />
              <span>Ir al Centro de Cuadre</span>
            </button>
            {!isReadOnly && openPeriod && (
              <button
                type="button"
                onClick={onRequestCloseCurrent}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#0E224D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Cerrar {openPeriod}</span>
              </button>
            )}
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          {/* Search toolbar */}
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por periodo, usuario, sociedad, banco u observación..."
                className="w-full pl-9 pr-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:bg-white focus:border-[#1E60A8]"
              />
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              {filteredHistory.length} de {closedReconciliations.length} cierre(s)
            </div>
          </div>

          {/* Contextual Multi-Period Bulk Selection Strip */}
          {checkedRecords.length > 0 && (
            <div className="px-5 py-2.5 bg-blue-50/70 border-b border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-[#132B63] font-semibold">
                <Layers className="w-4 h-4 shrink-0" />
                <span>
                  {checkedRecords.length} periodo(s) seleccionado(s) ·{' '}
                  <span className="font-mono tabular-nums">{checkedTotalAccounts}</span>{' '}
                  conciliación(es)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    openHistorialExportModal({
                      records: checkedRecords,
                      format: 'excel',
                      mode: 'masivo',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Excel Masivo</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openHistorialExportModal({
                      records: checkedRecords,
                      format: 'pdf',
                      mode: 'masivo',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>PDF Masivo</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openHistorialEmailModal({
                      records: checkedRecords,
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#132B63] bg-white hover:bg-sky-50 border border-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Enviar Correo</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckedClosedIds(new Set())}
                  className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer whitespace-nowrap"
                >
                  Limpiar
                </button>
              </div>
            </div>
          )}

          {filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No se encontraron conciliaciones cerradas que coincidan con &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 pl-4 pr-2 w-9">
                      <input
                        type="checkbox"
                        checked={allVisibleChecked}
                        onChange={toggleCheckAllVisible}
                        aria-label="Seleccionar todos los periodos visibles para descarga masiva"
                        className="w-4 h-4 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8] cursor-pointer"
                      />
                    </th>
                    <th className="py-3 px-3">Periodo</th>
                    <th className="py-3 px-4">Fecha y Responsable</th>
                    <th className="py-3 px-4">Cobertura</th>
                    <th className="py-3 px-4">Estado al Cierre</th>
                    <th className="py-3 px-4 text-right">Partidas SAP</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((rec) => {
                    const allSquared = rec.diffAccountsCount === 0;
                    const isChecked = checkedClosedIds.has(rec.id);
                    return (
                      <tr
                        key={rec.id}
                        className={`transition-colors ${
                          isChecked ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'
                        }`}
                      >
                        <td className="py-3.5 pl-4 pr-2 align-top">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleCheckRecord(rec.id)}
                            aria-label={`Seleccionar ${rec.period} para descarga masiva`}
                            className="w-4 h-4 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8] cursor-pointer mt-0.5"
                          />
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <div className="flex items-center gap-2 font-bold text-slate-900">
                            <Calendar className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                            <span>{rec.period}</span>
                          </div>
                          {rec.notes && (
                            <p className="text-[11px] text-slate-500 mt-1 max-w-xs line-clamp-2">
                              {rec.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top whitespace-nowrap">
                          <div className="text-slate-800 font-medium font-mono tabular-nums">
                            {formatClosedDateTime(rec.closedAtIso)}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <UserIcon className="w-3 h-3 shrink-0" />
                            <span className="truncate max-w-[180px]">{rec.closedByName}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-top whitespace-nowrap font-mono tabular-nums text-slate-700">
                          <div>{rec.societiesCount} sociedad(es)</div>
                          <div className="text-[11px] text-slate-500">
                            {rec.accountsCount} cuenta(s) bancaria(s)
                          </div>
                        </td>
                        <td className="py-3.5 px-4 align-top whitespace-nowrap">
                          {allSquared ? (
                            <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {rec.squaredAccountsCount}/{rec.accountsCount} cuadradas
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <div className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{rec.diffAccountsCount} con diferencia</span>
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                {rec.squaredAccountsCount} cuadrada(s)
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                          {rec.openItemsCount}
                        </td>
                        <td className="py-3.5 px-4 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelectedClosedId(rec.id)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Consultar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openHistorialExportModal({
                                  records: [rec],
                                  format: 'excel',
                                  mode: 'masivo',
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              title="Descargar Excel individual o masivo de este periodo"
                            >
                              <Download className="w-3.5 h-3.5 text-teal-700" />
                              <span>Excel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openHistorialExportModal({
                                  records: [rec],
                                  format: 'pdf',
                                  mode: 'masivo',
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              title="Descargar o imprimir PDF individual o masivo de este periodo"
                            >
                              <Printer className="w-3.5 h-3.5 text-[#132B63]" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openHistorialEmailModal({
                                  records: [rec],
                                })
                              }
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              title="Enviar este periodo cerrado por correo Gmail"
                            >
                              <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
                              <span>Correo</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {renderSharedModals()}
    </div>
  );
};
