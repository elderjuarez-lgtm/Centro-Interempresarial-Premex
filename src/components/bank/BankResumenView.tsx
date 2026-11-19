import React, { useMemo, useState, useEffect } from 'react';
import {
  Building2,
  CheckCircle2,
  AlertTriangle,
  Search,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  FileSpreadsheet,
  Layers,
  Landmark,
  FileText,
} from 'lucide-react';
import {
  BankAccount,
  BankMatchGroup,
  BankReconciliationSummary,
  BankSociety,
  BankStatementItem,
  BankTab,
  BookLedgerItem,
  SapOpenItem,
} from '../../types';
import {
  computeBankReconciliationSummary,
  formatBankMoney,
  getBankBrandMeta,
} from '../../utils/bankReconciliation';
import { AddReconcilingItemPayload, BankOfficialSheet } from './BankOfficialSheet';

interface BankResumenViewProps {
  societies: BankSociety[];
  accounts: BankAccount[];
  selectedAccountId: string;
  onSelectAccountId: (id: string) => void;
  summary: BankReconciliationSummary;
  sapOpenItems: SapOpenItem[];
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
  selectedMonth: string;
  onNavigateTab: (tab: BankTab) => void;
  onOpenAccountPartidas: (accountId: string) => void;
  onUpdateSaldoExtracto: (accountId: string, newExtracto: number) => void;
  onSyncExtractoToCta00: (accountId: string) => void;
  onUpdateMonthlyBalances: (
    accountId: string,
    patch: {
      saldoLibros: number;
      saldoExtracto: number;
      saldoCuenta00?: number;
      saldoCuenta01?: number;
      saldoCuenta02?: number;
      fechaCorte: string;
    }
  ) => void;
  onAddReconcilingItem: (accountId: string, payload: AddReconcilingItemPayload) => void;
  onDeleteLineItem: (source: 'sap' | 'bank' | 'ledger', itemId: string) => void;
  onOpenExportModal: (opts: {
    format: 'excel' | 'pdf';
    mode: 'individual' | 'masivo';
    societyKey?: string;
    accountId?: string;
  }) => void;
  isReadOnly?: boolean;
}

type CardStatusFilter = 'ALL' | 'DIFF' | 'OK';

const getAccountSocietyKey = (acc: BankAccount): string =>
  (acc.codigoSociedad || acc.sociedad || '').trim().toUpperCase();

export const BankResumenView: React.FC<BankResumenViewProps> = ({
  societies,
  accounts,
  selectedAccountId,
  onSelectAccountId,
  summary,
  sapOpenItems,
  statementItems,
  ledgerItems,
  matches,
  selectedMonth,
  onNavigateTab,
  onOpenAccountPartidas,
  onUpdateSaldoExtracto,
  onSyncExtractoToCta00,
  onUpdateMonthlyBalances,
  onAddReconcilingItem,
  onDeleteLineItem,
  onOpenExportModal,
  isReadOnly = false,
}) => {
  const [selectedSocietyKey, setSelectedSocietyKey] = useState<string>('ALL');
  const [bankSearch, setBankSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CardStatusFilter>('ALL');
  const [isConsolidatedOpen, setIsConsolidatedOpen] = useState(false);
  const [batchDrafts, setBatchDrafts] = useState<Record<string, string>>({});

  // Compute summaries for every visible account for the active period
  const allAccountSummaries = useMemo(() => {
    return accounts.map((acc) => ({
      account: acc,
      summary: computeBankReconciliationSummary(
        acc,
        statementItems,
        ledgerItems,
        matches,
        selectedMonth,
        sapOpenItems
      ),
    }));
  }, [accounts, statementItems, ledgerItems, matches, selectedMonth, sapOpenItems]);

  // Unified society list combining BankSociety catalog + any societies referenced by accounts
  const societyButtons = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        codigoSociedad: string;
        nombre: string;
        pais: string;
        moneda: string;
        totalAccounts: number;
        squaredAccounts: number;
        diffAccounts: number;
      }
    >();

    societies.forEach((s) => {
      const key = s.codigoSociedad.trim().toUpperCase();
      map.set(key, {
        key,
        codigoSociedad: s.codigoSociedad,
        nombre: s.nombre,
        pais: s.pais,
        moneda: s.moneda,
        totalAccounts: 0,
        squaredAccounts: 0,
        diffAccounts: 0,
      });
    });

    allAccountSummaries.forEach(({ account, summary: accSum }) => {
      const key = getAccountSocietyKey(account);
      if (!map.has(key)) {
        map.set(key, {
          key,
          codigoSociedad: account.codigoSociedad || '',
          nombre: account.sociedad,
          pais: account.pais,
          moneda: account.moneda,
          totalAccounts: 0,
          squaredAccounts: 0,
          diffAccounts: 0,
        });
      }
      const entry = map.get(key)!;
      entry.totalAccounts += 1;
      if (Math.abs(accSum.diferenciaNeta) <= 1) {
        entry.squaredAccounts += 1;
      } else {
        entry.diffAccounts += 1;
      }
    });

    return Array.from(map.values()).filter((s) => s.totalAccounts > 0 || societies.length > 0);
  }, [societies, allAccountSummaries]);

  // Accounts filtered by society
  const societyScopedSummaries = useMemo(() => {
    if (selectedSocietyKey === 'ALL') return allAccountSummaries;
    return allAccountSummaries.filter(
      ({ account }) => getAccountSocietyKey(account) === selectedSocietyKey
    );
  }, [allAccountSummaries, selectedSocietyKey]);

  // Accounts filtered by search + status filter for the interactive cards grid
  const visibleBankCards = useMemo(() => {
    const q = bankSearch.trim().toLowerCase();
    return societyScopedSummaries.filter(({ account, summary: s }) => {
      const isOk = Math.abs(s.diferenciaNeta) <= 1;
      if (statusFilter === 'OK' && !isOk) return false;
      if (statusFilter === 'DIFF' && isOk) return false;
      if (!q) return true;
      return (
        account.banco.toLowerCase().includes(q) ||
        account.numeroCuenta.toLowerCase().includes(q) ||
        account.sociedad.toLowerCase().includes(q) ||
        (account.codigoSociedad || '').toLowerCase().includes(q) ||
        (account.cuentaMayor00 || '').toLowerCase().includes(q) ||
        (account.productoCuenta || '').toLowerCase().includes(q)
      );
    });
  }, [societyScopedSummaries, bankSearch, statusFilter]);

  // When user switches Society filter, ensure an account from that society is selected
  useEffect(() => {
    if (selectedSocietyKey === 'ALL') return;
    const stillVisible = societyScopedSummaries.some(
      ({ account }) => account.id === selectedAccountId
    );
    if (!stillVisible && societyScopedSummaries.length > 0) {
      onSelectAccountId(societyScopedSummaries[0].account.id);
    }
  }, [selectedSocietyKey, societyScopedSummaries, selectedAccountId, onSelectAccountId]);

  const scopeStats = useMemo(() => {
    const total = societyScopedSummaries.length;
    const squared = societyScopedSummaries.filter(
      ({ summary: s }) => Math.abs(s.diferenciaNeta) <= 1
    ).length;
    return { total, squared, pending: total - squared };
  }, [societyScopedSummaries]);

  const activeAccount = summary.account;

  const commitBatchExtracto = (accId: string, currentVal: number) => {
    const raw = batchDrafts[accId];
    if (raw === undefined) return;
    const parsed = Number(raw);
    setBatchDrafts((prev) => {
      const next = { ...prev };
      delete next[accId];
      return next;
    });
    if (!Number.isFinite(parsed)) return;
    const rounded = Math.round(parsed * 100) / 100;
    if (Math.abs(rounded - currentVal) > 0.001) {
      onUpdateSaldoExtracto(accId, rounded);
    }
  };

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#132B63] flex items-center justify-center mx-auto">
          <Landmark className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Aún no hay cuentas bancarias configuradas
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
            Carga el Balance SAP o configura tus sociedades y cuentas bancarias para iniciar.
          </p>
        </div>
        {!isReadOnly && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onNavigateTab('carga')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1E60A8] hover:bg-[#132B63] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Cargar Balance / Partidas SAP</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('cuentas')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Building2 className="w-4 h-4" />
              <span>Configurar Sociedades y Cuentas</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* BLOQUE 1: Selector Interactivo de Sociedad */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4 print:hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <Building2 className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Sociedades del Grupo</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
              <span>
                <strong className="text-slate-900 font-mono">{scopeStats.total}</strong> cuenta(s)
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-emerald-700 font-semibold">
                <strong className="font-mono">{scopeStats.squared}</strong> cuadrada(s)
              </span>
              {scopeStats.pending > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-rose-700 font-semibold">
                    <strong className="font-mono">{scopeStats.pending}</strong> con diferencia
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                onOpenExportModal({
                  format: 'pdf',
                  mode: 'masivo',
                  societyKey: selectedSocietyKey,
                  accountId: activeAccount?.id,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Descargar o imprimir PDF (individual o masivo)"
            >
              <FileText className="w-3.5 h-3.5 text-[#132B63]" />
              <span>Descargar PDF</span>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenExportModal({
                  format: 'excel',
                  mode: 'masivo',
                  societyKey: selectedSocietyKey,
                  accountId: activeAccount?.id,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Descargar Excel entregable (individual o masivo)"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Descargar Excel</span>
            </button>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => onNavigateTab('carga')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Cargar Balance / Partidas</span>
              </button>
            )}
          </div>
        </div>

        {/* Society Horizontal Button Strip */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedSocietyKey('ALL')}
            className={`px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer ${
              selectedSocietyKey === 'ALL'
                ? 'bg-[#132B63] text-white border-[#132B63] shadow-xs'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-white hover:border-[#1E60A8]/50'
            }`}
          >
            <span>Todas las sociedades</span>
            <span
              className={`font-mono text-[11px] ${
                selectedSocietyKey === 'ALL' ? 'text-sky-200' : 'text-slate-400'
              }`}
            >
              {accounts.length}
            </span>
          </button>

          {societyButtons.map((soc) => {
            const isActive = selectedSocietyKey === soc.key;
            const hasIssues = soc.diffAccounts > 0;
            return (
              <button
                key={soc.key}
                type="button"
                onClick={() => setSelectedSocietyKey(soc.key)}
                className={`px-3.5 py-2 rounded-xl border text-xs transition-all flex items-center gap-2 cursor-pointer ${
                  isActive
                    ? 'bg-[#132B63] text-white border-[#132B63] shadow-xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-[#1E60A8]/50 hover:bg-slate-50 font-medium'
                }`}
              >
                {soc.codigoSociedad && (
                  <span
                    className={`font-mono font-bold text-[11px] ${
                      isActive ? 'text-sky-200' : 'text-[#1E60A8]'
                    }`}
                  >
                    {soc.codigoSociedad}
                  </span>
                )}
                <span className="truncate max-w-[190px]">{soc.nombre}</span>
                <span
                  className={`font-mono text-[11px] ${
                    isActive ? 'text-white/80' : 'text-slate-400'
                  }`}
                >
                  ({soc.totalAccounts})
                </span>
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    hasIssues
                      ? isActive
                        ? 'bg-amber-300'
                        : 'bg-rose-500'
                      : isActive
                      ? 'bg-emerald-300'
                      : 'bg-emerald-500'
                  }`}
                  title={
                    hasIssues
                      ? `${soc.diffAccounts} cuenta(s) con diferencia`
                      : 'Todas las cuentas cuadradas'
                  }
                />
              </button>
            );
          })}
        </div>
      </section>

      {/* BLOQUE 2: Cuadros Vistosos de Bancos (Tarjetas Botón) */}
      <section className="space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={bankSearch}
              onChange={(e) => setBankSearch(e.target.value)}
              placeholder="Buscar banco, cuenta, raíz SAP o producto..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#1E60A8]"
            />
          </div>

          <div className="inline-flex bg-slate-200/70 p-0.5 rounded-xl text-xs self-start sm:self-auto">
            {(
              [
                { id: 'ALL', label: `Todos (${societyScopedSummaries.length})` },
                { id: 'DIFF', label: `Con diferencia (${scopeStats.pending})` },
                { id: 'OK', label: `Cuadrados (${scopeStats.squared})` },
              ] as { id: CardStatusFilter; label: string }[]
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  statusFilter === f.id
                    ? 'bg-white text-[#132B63] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visibleBankCards.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 px-6 py-8 text-center text-xs text-slate-500">
            No se encontraron bancos con los filtros actuales.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {visibleBankCards.map(({ account: acc, summary: accSum }) => {
              const isSelected = acc.id === activeAccount?.id;
              const isOk = Math.abs(accSum.diferenciaNeta) <= 1;
              const brand = getBankBrandMeta(acc.banco);

              return (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => onSelectAccountId(acc.id)}
                  className={`group text-left rounded-2xl border p-4 transition-all duration-150 relative overflow-hidden cursor-pointer ${
                    isSelected
                      ? 'bg-gradient-to-br from-[#0E224D] via-[#132E66] to-[#1E60A8] text-white border-[#132B63] shadow-md'
                      : 'bg-white text-slate-900 border-slate-200/90 hover:border-[#1E60A8]/60 hover:shadow-sm'
                  }`}
                >
                  {/* Top accent bar */}
                  <div
                    className={`absolute top-0 inset-x-0 h-1 ${
                      isSelected ? 'bg-sky-300/70' : brand.accentBar
                    }`}
                  />

                  <div className="flex items-start justify-between gap-2.5 pt-0.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold text-xs tracking-tight shrink-0 shadow-2xs ${
                          isSelected
                            ? 'bg-white/15 text-white border border-white/25'
                            : `${brand.badgeBg} ${brand.badgeText}`
                        }`}
                      >
                        {brand.monogram}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-bold leading-snug truncate ${
                            isSelected ? 'text-white' : 'text-slate-900'
                          }`}
                          title={acc.banco}
                        >
                          {acc.banco}
                        </div>
                        <div
                          className={`text-[11px] font-mono truncate mt-0.5 ${
                            isSelected ? 'text-sky-100/90' : 'text-slate-500'
                          }`}
                        >
                          {acc.codigoSociedad ? `Soc. ${acc.codigoSociedad} · ` : ''}
                          {acc.cuentaMayor00 || acc.numeroCuenta} · {acc.moneda}
                        </div>
                      </div>
                    </div>

                    <div
                      className="shrink-0 mt-0.5"
                      title={
                        isOk
                          ? 'Conciliación cuadrada'
                          : `Diferencia: ${formatBankMoney(accSum.diferenciaNeta, acc.moneda, true)}`
                      }
                    >
                      {isOk ? (
                        <CheckCircle2
                          className={`w-4 h-4 ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`}
                        />
                      ) : (
                        <AlertTriangle
                          className={`w-4 h-4 ${isSelected ? 'text-amber-300' : 'text-rose-600'}`}
                        />
                      )}
                    </div>
                  </div>

                  <div
                    className={`mt-3.5 pt-3 border-t flex items-end justify-between gap-2 ${
                      isSelected ? 'border-white/15' : 'border-slate-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <div
                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                          isSelected ? 'text-sky-200/80' : 'text-slate-400'
                        }`}
                      >
                        Saldo Extracto
                      </div>
                      <div
                        className={`text-sm font-bold font-mono tabular-nums truncate mt-0.5 ${
                          isSelected ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {formatBankMoney(accSum.saldoExtracto, acc.moneda)}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className={`text-[10px] uppercase tracking-wider font-semibold ${
                          isSelected ? 'text-sky-200/80' : 'text-slate-400'
                        }`}
                      >
                        {isOk ? 'Estado' : 'Diferencia'}
                      </div>
                      <div
                        className={`text-xs font-bold font-mono tabular-nums mt-0.5 ${
                          isOk
                            ? isSelected
                              ? 'text-emerald-300'
                              : 'text-emerald-700'
                            : isSelected
                            ? 'text-amber-300'
                            : 'text-rose-700'
                        }`}
                      >
                        {isOk
                          ? 'Cuadrada'
                          : formatBankMoney(accSum.diferenciaNeta, acc.moneda, true)}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* BLOQUE 3: Entregable Oficial CONCILIACION DE BANCOS */}
      <BankOfficialSheet
        summary={summary}
        selectedMonth={selectedMonth}
        isReadOnly={isReadOnly}
        onUpdateSaldoExtracto={onUpdateSaldoExtracto}
        onSyncExtractoToCta00={onSyncExtractoToCta00}
        onUpdateMonthlyBalances={onUpdateMonthlyBalances}
        onAddReconcilingItem={onAddReconcilingItem}
        onDeleteLineItem={onDeleteLineItem}
        onOpenAccountPartidas={onOpenAccountPartidas}
        onOpenPrintPreview={() =>
          onOpenExportModal({
            format: 'pdf',
            mode: 'individual',
            societyKey: selectedSocietyKey,
            accountId: activeAccount?.id,
          })
        }
        onExportOfficialExcel={() =>
          onOpenExportModal({
            format: 'excel',
            mode: 'individual',
            societyKey: selectedSocietyKey,
            accountId: activeAccount?.id,
          })
        }
      />

      {/* BLOQUE 4: Auditoría de Subcuentas SAP (00 / 01 / 02) + Cuadro Consolidado Desplegable */}
      {activeAccount && (
        <section className="space-y-4 print:hidden">
          {/* 3 Compact SAP Subaccount Audit Cards */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#1E60A8]" />
                <h3 className="text-sm font-bold text-slate-900">
                  Auditoría Contable SAP · Subcuentas 00 / 01 / 02
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {activeAccount.raizContable
                  ? `Raíz ${activeAccount.raizContable} · ${activeAccount.sociedad}`
                  : activeAccount.sociedad}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Subcuenta 00 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Subcuenta 00 · Principal
                    </div>
                    <div className="text-xs font-mono font-semibold text-slate-800">
                      {activeAccount.cuentaMayor00 || activeAccount.codigoContable || 'No asignada'}
                    </div>
                  </div>
                  {Math.abs(summary.diffSubcuenta00) <= 0.01 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  )}
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Balance Cta 00:</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatBankMoney(summary.saldoCuenta00, activeAccount.moneda)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Saldo Extracto:</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatBankMoney(summary.saldoExtracto, activeAccount.moneda)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      Math.abs(summary.diffSubcuenta00) <= 0.01
                        ? 'text-emerald-700'
                        : 'text-amber-700'
                    }`}
                  >
                    Dif: {formatBankMoney(summary.diffSubcuenta00, activeAccount.moneda, true)}
                  </span>
                  {!isReadOnly && Math.abs(summary.diffSubcuenta00) > 0.01 && (
                    <button
                      type="button"
                      onClick={() => onSyncExtractoToCta00(activeAccount.id)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1E60A8] hover:underline cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Igualar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Subcuenta 01 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Subcuenta 01 · Ingresos Pend.
                    </div>
                    <div className="text-xs font-mono font-semibold text-slate-800">
                      {activeAccount.cuentaMayor01 || 'No asignada'}
                    </div>
                  </div>
                  {Math.abs(summary.diffSubcuenta01) <= 1 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Balance Cta 01:</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatBankMoney(summary.saldoCuenta01, activeAccount.moneda)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Partidas FBL3N (01):</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatBankMoney(summary.sumSapItems01, activeAccount.moneda)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      Math.abs(summary.diffSubcuenta01) <= 1 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    Dif: {formatBankMoney(summary.diffSubcuenta01, activeAccount.moneda, true)}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {summary.scopedSapItems.filter((i) => i.subcuentaTipo === '01').length} partida(s)
                  </span>
                </div>
              </div>

              {/* Subcuenta 02 */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Subcuenta 02 · Egresos Pend.
                    </div>
                    <div className="text-xs font-mono font-semibold text-slate-800">
                      {activeAccount.cuentaMayor02 || 'No asignada'}
                    </div>
                  </div>
                  {Math.abs(summary.diffSubcuenta02) <= 1 ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Balance Cta 02:</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatBankMoney(summary.saldoCuenta02, activeAccount.moneda)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Partidas FBL3N (02):</span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {formatBankMoney(summary.sumSapItems02, activeAccount.moneda)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      Math.abs(summary.diffSubcuenta02) <= 1 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    Dif: {formatBankMoney(summary.diffSubcuenta02, activeAccount.moneda, true)}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {summary.scopedSapItems.filter((i) => i.subcuentaTipo === '02').length} partida(s)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Collapsible Consolidated Center Table with Inline Batch Extracto Editing */}
          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <button
              type="button"
              onClick={() => setIsConsolidatedOpen((v) => !v)}
              className="w-full px-5 py-3.5 flex items-center justify-between gap-3 bg-slate-50/80 hover:bg-slate-100/70 transition-colors text-left cursor-pointer"
            >
              <div className="text-sm font-bold text-slate-900">
                Cuadro Consolidado ({societyScopedSummaries.length} cuentas)
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1E60A8] shrink-0">
                <span>{isConsolidatedOpen ? 'Ocultar tabla' : 'Desplegar tabla'}</span>
                {isConsolidatedOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </button>

            {isConsolidatedOpen && (
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Sociedad / Banco</th>
                      <th className="py-2.5 px-3 font-mono">Cta 00</th>
                      <th className="py-2.5 px-3 text-right">Saldo Libros</th>
                      <th className="py-2.5 px-3 text-right">Saldo Extracto (Editable)</th>
                      <th className="py-2.5 px-3 text-right">Conc. Libros</th>
                      <th className="py-2.5 px-3 text-right">Conc. Extracto</th>
                      <th className="py-2.5 px-3 text-right">Diferencia</th>
                      <th className="py-2.5 px-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {societyScopedSummaries.map(({ account: acc, summary: rowSum }) => {
                      const isOk = Math.abs(rowSum.diferenciaNeta) <= 1;
                      const isRowActive = acc.id === activeAccount.id;
                      const draftVal =
                        batchDrafts[acc.id] !== undefined
                          ? batchDrafts[acc.id]
                          : String(rowSum.saldoExtracto);

                      return (
                        <tr
                          key={acc.id}
                          className={`hover:bg-slate-50/80 ${
                            isRowActive ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => onSelectAccountId(acc.id)}
                              className="text-left group cursor-pointer"
                            >
                              <div className="font-bold text-slate-900 group-hover:text-[#1E60A8]">
                                {acc.banco}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {acc.codigoSociedad ? `${acc.codigoSociedad} · ` : ''}
                                {acc.sociedad} · {acc.numeroCuenta} ({acc.moneda})
                              </div>
                            </button>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            <div>{acc.cuentaMayor00 || acc.codigoContable || '-'}</div>
                            <div className="text-[10px] text-slate-400">
                              {formatBankMoney(rowSum.saldoCuenta00, acc.moneda)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                            {formatBankMoney(rowSum.saldoLibros, acc.moneda)}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isReadOnly ? (
                              <span className="font-mono tabular-nums font-semibold text-slate-900">
                                {formatBankMoney(rowSum.saldoExtracto, acc.moneda)}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="any"
                                value={draftVal}
                                onChange={(e) =>
                                  setBatchDrafts((prev) => ({
                                    ...prev,
                                    [acc.id]: e.target.value,
                                  }))
                                }
                                onBlur={() => commitBatchExtracto(acc.id, rowSum.saldoExtracto)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                  } else if (e.key === 'Escape') {
                                    setBatchDrafts((prev) => {
                                      const next = { ...prev };
                                      delete next[acc.id];
                                      return next;
                                    });
                                  }
                                }}
                                aria-label={`Saldo Extracto de ${acc.banco}`}
                                className="w-36 px-2 py-1 text-right font-mono tabular-nums font-semibold bg-[#C4D79B]/25 border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8] focus:bg-white"
                              />
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {formatBankMoney(rowSum.saldoConciliadoLibros, acc.moneda)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                            {formatBankMoney(rowSum.saldoConciliadoExtracto, acc.moneda)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${
                              isOk ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {isOk
                              ? 'Cuadrada'
                              : formatBankMoney(rowSum.diferenciaNeta, acc.moneda, true)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {!isReadOnly &&
                                rowSum.hasSapSubaccounts &&
                                !rowSum.saldoExtractoMatchesCta00 && (
                                  <button
                                    type="button"
                                    onClick={() => onSyncExtractoToCta00(acc.id)}
                                    title="Igualar Saldo Extracto a Subcuenta 00"
                                    className="px-2 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md cursor-pointer"
                                  >
                                    = Cta 00
                                  </button>
                                )}
                              <button
                                type="button"
                                onClick={() => onSelectAccountId(acc.id)}
                                className="px-2 py-1 text-[11px] font-semibold text-[#1E60A8] hover:bg-blue-50 rounded-md cursor-pointer"
                              >
                                Ver hoja
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
          </div>
        </section>
      )}
    </div>
  );
};
