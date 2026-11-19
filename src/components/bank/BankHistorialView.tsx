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
  Calendar,
  User as UserIcon,
} from 'lucide-react';
import {
  BankAccount,
  BankClosedReconciliation,
  BankReconciliationSummary,
} from '../../types';
import {
  RECONCILING_SECTION_META,
  computeBankReconciliationSummary,
  formatBankMoney,
  formatSheetDate,
  getBankBrandMeta,
  getEffectiveSapItemSection,
  getSapDocumentClassLabel,
} from '../../utils/bankReconciliation';
import { exportSapDeliverableWorkbook } from '../../utils/bankOfficialExport';
import { BankOfficialSheet } from './BankOfficialSheet';
import { BankPrintPreviewModal } from './BankPrintPreviewModal';

interface BankHistorialViewProps {
  closedReconciliations: BankClosedReconciliation[];
  openPeriod: string | null;
  isReadOnly?: boolean;
  onRequestOpenReconciliation: () => void;
  onRequestCloseCurrent: () => void;
  onGoToCentroCuadre: () => void;
  onNotify: (type: 'success' | 'info' | 'error', message: string) => void;
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

export const BankHistorialView: React.FC<BankHistorialViewProps> = ({
  closedReconciliations,
  openPeriod,
  isReadOnly = false,
  onRequestOpenReconciliation,
  onRequestCloseCurrent,
  onGoToCentroCuadre,
  onNotify,
}) => {
  const [search, setSearch] = useState('');
  const [selectedClosedId, setSelectedClosedId] = useState<string | null>(null);
  const [detailSocietyKey, setDetailSocietyKey] = useState<string>('ALL');
  const [detailAccountId, setDetailAccountId] = useState<string>('');
  const [isExportingId, setIsExportingId] = useState<string | null>(null);
  const [printSnapshot, setPrintSnapshot] = useState<{
    summary: BankReconciliationSummary;
    period: string;
    record: BankClosedReconciliation;
  } | null>(null);

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

  // Filter master list
  const filteredHistory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return closedReconciliations;
    return closedReconciliations.filter((rec) => {
      if (rec.period.toLowerCase().includes(q)) return true;
      if (rec.closedByName.toLowerCase().includes(q)) return true;
      if ((rec.notes || '').toLowerCase().includes(q)) return true;
      if (rec.societies.some((s) => s.nombre.toLowerCase().includes(q) || s.codigoSociedad.toLowerCase().includes(q))) {
        return true;
      }
      if (rec.accounts.some((a) => a.banco.toLowerCase().includes(q) || a.sociedad.toLowerCase().includes(q))) {
        return true;
      }
      return false;
    });
  }, [closedReconciliations, search]);

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

  // Export Excel Deliverable from any frozen snapshot
  const handleExportClosedExcel = async (
    record: BankClosedReconciliation,
    focusAccountId?: string
  ) => {
    if (record.accounts.length === 0) {
      onNotify('info', 'Este cierre no contiene cuentas bancarias visibles para exportar.');
      return;
    }
    setIsExportingId(record.id);
    try {
      const centerSummaries = record.accounts.map((acc) =>
        computeBankReconciliationSummary(acc, [], [], [], record.period, record.sapOpenItems)
      );
      const activeSummary =
        (focusAccountId
          ? centerSummaries.find((s) => s.account?.id === focusAccountId)
          : null) || centerSummaries[0];

      await exportSapDeliverableWorkbook({
        activeSummary,
        centerSummaries,
        sapOpenItems: record.sapOpenItems,
        sapBalanceRows: record.sapBalanceRows,
        statementItems: [],
        ledgerItems: [],
        matches: [],
        selectedMonth: record.period,
        scopeLabel: `Cerrada_${record.period}`,
      });
      onNotify(
        'success',
        `Entregable Excel histórico de ${record.period} descargado correctamente.`
      );
    } catch (err: unknown) {
      onNotify(
        'error',
        err instanceof Error ? err.message : 'No se pudo exportar el entregable histórico.'
      );
    } finally {
      setIsExportingId(null);
    }
  };

  const handleOpenClosedPrint = (
    record: BankClosedReconciliation,
    focusAccountId?: string
  ) => {
    const targetAcc =
      (focusAccountId ? record.accounts.find((a) => a.id === focusAccountId) : null) ||
      record.accounts[0] ||
      null;
    if (!targetAcc) {
      onNotify('info', 'No hay cuentas bancarias disponibles en este cierre para imprimir.');
      return;
    }
    const frozenSummary = computeBankReconciliationSummary(
      targetAcc,
      [],
      [],
      [],
      record.period,
      record.sapOpenItems
    );
    setPrintSnapshot({ summary: frozenSummary, period: record.period, record });
  };

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

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenClosedPrint(selectedClosed, activeClosedEntry?.account.id)}
              disabled={!activeClosedEntry}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5 text-[#132B63]" />
              <span>Imprimir / PDF</span>
            </button>
            <button
              type="button"
              onClick={() =>
                void handleExportClosedExcel(selectedClosed, activeClosedEntry?.account.id)
              }
              disabled={isExportingId === selectedClosed.id || !activeClosedEntry}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#0E224D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>
                {isExportingId === selectedClosed.id ? 'Generando...' : 'Descargar Excel'}
              </span>
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
                handleOpenClosedPrint(selectedClosed, activeClosedEntry.account.id)
              }
              onExportOfficialExcel={() =>
                void handleExportClosedExcel(selectedClosed, activeClosedEntry.account.id)
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

        {/* Print Preview Modal for Historical Snapshot */}
        {printSnapshot && (
          <BankPrintPreviewModal
            isOpen={true}
            onClose={() => setPrintSnapshot(null)}
            summary={printSnapshot.summary}
            selectedMonth={printSnapshot.period}
            onExportFullExcel={() =>
              handleExportClosedExcel(
                printSnapshot.record,
                printSnapshot.summary.account?.id
              )
            }
          />
        )}
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
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#1E60A8]" />
            <h3 className="text-sm font-bold text-slate-900">
              Historial de Conciliaciones Cerradas
            </h3>
          </div>
          <p className="text-xs text-slate-500">
            Archivo permanente de periodos cerrados con instantáneas de saldos 00/01/02, partidas
            FBL3N y entregables descargables.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
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
                ? `La conciliación actual (${openPeriod}) permanece abierta. Cuando finalices el cuadre, utiliza el botón «Cerrar Conciliación» para archivarla aquí y habilitar la apertura del siguiente periodo.`
                : 'Cierra una conciliación mensual para conservar su entregable oficial y consultarlo en cualquier momento.'}
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

          {filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No se encontraron conciliaciones cerradas que coincidan con &ldquo;{search}&rdquo;.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                    <th className="py-3 px-4">Periodo</th>
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
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3.5 px-4 align-top">
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
                              onClick={() => void handleExportClosedExcel(rec)}
                              disabled={isExportingId === rec.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
                              title="Descargar Excel entregable con fórmulas vivas"
                            >
                              <Download className="w-3.5 h-3.5 text-teal-700" />
                              <span>Excel</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenClosedPrint(rec)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              title="Vista previa de impresión horizontal y PDF"
                            >
                              <Printer className="w-3.5 h-3.5 text-[#132B63]" />
                              <span>PDF</span>
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

      {/* Print Preview Modal triggered directly from List */}
      {printSnapshot && (
        <BankPrintPreviewModal
          isOpen={true}
          onClose={() => setPrintSnapshot(null)}
          summary={printSnapshot.summary}
          selectedMonth={printSnapshot.period}
          onExportFullExcel={() =>
            handleExportClosedExcel(
              printSnapshot.record,
              printSnapshot.summary.account?.id
            )
          }
        />
      )}
    </div>
  );
};
