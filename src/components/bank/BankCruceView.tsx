import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Link2,
  Unlink2,
  Search,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react';
import {
  BankAccount,
  BankMatchGroup,
  BankReconciliationSummary,
  BankStatementItem,
  BookLedgerItem,
} from '../../types';
import {
  formatBankMoney,
  getBankSignedAmount,
  getLedgerSignedAmount,
} from '../../utils/bankReconciliation';

interface BankCruceViewProps {
  account: BankAccount | null;
  selectedMonth: string;
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
  summary: BankReconciliationSummary;
  onRunAutoMatch: () => void;
  onCreateManualMatch: (bankIds: string[], ledgerIds: string[], note?: string) => void;
  onDeleteMatch: (matchId: string) => void;
  isReadOnly?: boolean;
}

export const BankCruceView: React.FC<BankCruceViewProps> = ({
  account,
  selectedMonth,
  statementItems,
  ledgerItems,
  matches,
  summary,
  onRunAutoMatch,
  onCreateManualMatch,
  onDeleteMatch,
  isReadOnly = false,
}) => {
  const [filterMode, setFilterMode] = useState<'pendientes' | 'conciliados' | 'todos'>('pendientes');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBankIds, setSelectedBankIds] = useState<string[]>([]);
  const [selectedLedgerIds, setSelectedLedgerIds] = useState<string[]>([]);
  const [manualNote, setManualNote] = useState('');

  const accountId = account?.id || '';
  const currency = account?.moneda || 'USD';

  const scopedBank = useMemo(
    () =>
      statementItems.filter(
        (i) =>
          i.cuentaId === accountId &&
          (selectedMonth === 'ALL' || i.mes === selectedMonth)
      ),
    [statementItems, accountId, selectedMonth]
  );

  const scopedLedger = useMemo(
    () =>
      ledgerItems.filter(
        (i) =>
          i.cuentaId === accountId &&
          (selectedMonth === 'ALL' || i.mes === selectedMonth)
      ),
    [ledgerItems, accountId, selectedMonth]
  );

  const scopedMatches = useMemo(
    () =>
      matches.filter(
        (m) =>
          m.cuentaId === accountId &&
          (selectedMonth === 'ALL' || m.mes === selectedMonth)
      ),
    [matches, accountId, selectedMonth]
  );

  const q = searchQuery.trim().toLowerCase();

  const visibleBank = useMemo(() => {
    return scopedBank.filter((item) => {
      const isMatched = summary.matchedBankIds.has(item.id);
      if (filterMode === 'pendientes' && isMatched) return false;
      if (filterMode === 'conciliados' && !isMatched) return false;
      if (!q) return true;
      return (
        item.referencia.toLowerCase().includes(q) ||
        item.descripcion.toLowerCase().includes(q) ||
        item.fecha.toLowerCase().includes(q) ||
        String(item.valor).includes(q)
      );
    });
  }, [scopedBank, summary.matchedBankIds, filterMode, q]);

  const visibleLedger = useMemo(() => {
    return scopedLedger.filter((item) => {
      const isMatched = summary.matchedLedgerIds.has(item.id);
      if (filterMode === 'pendientes' && isMatched) return false;
      if (filterMode === 'conciliados' && !isMatched) return false;
      if (!q) return true;
      return (
        item.comprobante.toLowerCase().includes(q) ||
        item.tercero.toLowerCase().includes(q) ||
        item.descripcion.toLowerCase().includes(q) ||
        item.fecha.toLowerCase().includes(q) ||
        String(item.valor).includes(q)
      );
    });
  }, [scopedLedger, summary.matchedLedgerIds, filterMode, q]);

  const bankById = useMemo(() => new Map(scopedBank.map((b) => [b.id, b])), [scopedBank]);
  const ledgerById = useMemo(() => new Map(scopedLedger.map((l) => [l.id, l])), [scopedLedger]);

  const selectedBankTotal = useMemo(
    () =>
      selectedBankIds.reduce((acc, id) => {
        const item = bankById.get(id);
        return acc + (item ? getBankSignedAmount(item) : 0);
      }, 0),
    [selectedBankIds, bankById]
  );

  const selectedLedgerTotal = useMemo(
    () =>
      selectedLedgerIds.reduce((acc, id) => {
        const item = ledgerById.get(id);
        return acc + (item ? getLedgerSignedAmount(item) : 0);
      }, 0),
    [selectedLedgerIds, ledgerById]
  );

  const selectionDelta = Math.round((selectedBankTotal - selectedLedgerTotal) * 100) / 100;
  const hasSelection = selectedBankIds.length > 0 || selectedLedgerIds.length > 0;
  const canConfirmManualMatch =
    selectedBankIds.length > 0 &&
    selectedLedgerIds.length > 0 &&
    Math.abs(selectionDelta) <= 0.01;

  const toggleBankId = (id: string) => {
    if (isReadOnly || summary.matchedBankIds.has(id)) return;
    setSelectedBankIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleLedgerId = (id: string) => {
    if (isReadOnly || summary.matchedLedgerIds.has(id)) return;
    setSelectedLedgerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirmMatch = () => {
    if (isReadOnly || !canConfirmManualMatch) return;
    onCreateManualMatch(selectedBankIds, selectedLedgerIds, manualNote.trim() || undefined);
    setSelectedBankIds([]);
    setSelectedLedgerIds([]);
    setManualNote('');
  };

  return (
    <div className="space-y-5">
      {/* Toolbar: Auto-Match + Filter Tabs + Search */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          {!isReadOnly ? (
            <button
              type="button"
              onClick={onRunAutoMatch}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Conciliar Automáticamente</span>
            </button>
          ) : (
            <span className="text-xs font-semibold text-amber-800 px-1">
              Modo Solo Consulta · Visualización sin edición de cruces
            </span>
          )}

          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
            {(
              [
                {
                  id: 'pendientes',
                  label: `Pendientes (${summary.unmatchedBankItemsCount + summary.unmatchedLedgerItemsCount})`,
                },
                {
                  id: 'conciliados',
                  label: `Conciliados (${scopedMatches.length})`,
                },
                { id: 'todos', label: 'Todos' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterMode(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  filterMode === tab.id
                    ? 'bg-white text-[#19377B] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar referencia, tercero o valor..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Limpiar búsqueda"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Interactive Manual Match Bar (Supports 1-to-1 and N-to-M Batch Matching) */}
      {!isReadOnly && hasSelection && (
        <div
          className={`rounded-2xl border p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 ${
            canConfirmManualMatch
              ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
              : 'bg-amber-50/80 border-amber-300 text-amber-950'
          }`}
        >
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs tabular-nums">
            <div>
              <span className="text-slate-600">Extracto ({selectedBankIds.length}): </span>
              <strong className="font-mono text-sm">
                {formatBankMoney(selectedBankTotal, currency, true)}
              </strong>
            </div>
            <div>
              <span className="text-slate-600">Libros ({selectedLedgerIds.length}): </span>
              <strong className="font-mono text-sm">
                {formatBankMoney(selectedLedgerTotal, currency, true)}
              </strong>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-600">Diferencia: </span>
              <strong
                className={`font-mono text-sm ${
                  Math.abs(selectionDelta) <= 0.01 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatBankMoney(selectionDelta, currency, true)}
              </strong>
              {canConfirmManualMatch ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-700" />
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="Nota opcional del cruce (ej. Lote 1 a 2)..."
              className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl w-56 focus:outline-hidden focus:border-[#1E60A8]"
            />
            <button
              type="button"
              onClick={handleConfirmMatch}
              disabled={!canConfirmManualMatch}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 disabled:text-slate-500 rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Emparejar Selección</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedBankIds([]);
                setSelectedLedgerIds([]);
                setManualNote('');
              }}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Dual-Pane Side-by-Side Workbench (Extracto Bancario | Auxiliar Contable) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Left Pane: Extracto Bancario */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[#132B63]">Extracto Bancario</h3>
              <p className="text-[11px] text-slate-500">
                Crédito (+) = Abono · Débito (-) = Retiro/Cargo
              </p>
            </div>
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              {visibleBank.length} reg.
            </span>
          </div>

          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            {visibleBank.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay movimientos de extracto en esta vista.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2 w-8">{isReadOnly ? 'Est' : 'Sel'}</th>
                    <th className="py-2.5 px-2">Fecha / Ref</th>
                    <th className="py-2.5 px-2">Descripción</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleBank.map((item) => {
                    const isMatched = summary.matchedBankIds.has(item.id);
                    const isSelected = selectedBankIds.includes(item.id);
                    const signedVal = getBankSignedAmount(item);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleBankId(item.id)}
                        className={`transition-colors ${
                          isMatched
                            ? 'bg-emerald-50/40 text-slate-500'
                            : isSelected
                            ? 'bg-[#1E60A8]/10'
                            : isReadOnly
                            ? 'hover:bg-slate-50'
                            : 'hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <td className="py-2.5 pl-4 pr-2 align-top">
                          {isMatched ? (
                            <CheckCircle2
                              className="w-4 h-4 text-emerald-600 mt-0.5"
                              aria-label="Conciliado"
                            />
                          ) : isReadOnly ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-amber-400 mt-1.5"
                              title="Pendiente"
                            />
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              aria-label={`Seleccionar movimiento bancario ${item.referencia}`}
                              className="mt-0.5 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8] cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-2 align-top whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-800">
                            {item.referencia}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.fecha}</div>
                        </td>
                        <td className="py-2.5 px-2 align-top">
                          <div className="text-slate-800 leading-snug line-clamp-2">
                            {item.descripcion}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {item.tipo === 'CREDITO' ? 'Abono bancario' : 'Cargo bancario'}
                          </div>
                        </td>
                        <td className="py-2.5 pl-2 pr-4 align-top text-right whitespace-nowrap font-mono font-bold tabular-nums">
                          <span
                            className={
                              signedVal >= 0 ? 'text-emerald-700' : 'text-slate-900'
                            }
                          >
                            {formatBankMoney(signedVal, currency, true)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Pane: Auxiliar Contable (Libros) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden flex flex-col">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-teal-900">Auxiliar Contable (Libros)</h3>
              <p className="text-[11px] text-slate-500">
                Débito (+) = Ingreso a bancos · Crédito (-) = Egreso/Pago
              </p>
            </div>
            <span className="text-xs font-mono text-slate-600 tabular-nums">
              {visibleLedger.length} reg.
            </span>
          </div>

          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            {visibleLedger.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No hay asientos contables en esta vista.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2.5 pl-4 pr-2 w-8">{isReadOnly ? 'Est' : 'Sel'}</th>
                    <th className="py-2.5 px-2">Fecha / Comp.</th>
                    <th className="py-2.5 px-2">Tercero y Concepto</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {visibleLedger.map((item) => {
                    const isMatched = summary.matchedLedgerIds.has(item.id);
                    const isSelected = selectedLedgerIds.includes(item.id);
                    const signedVal = getLedgerSignedAmount(item);

                    return (
                      <tr
                        key={item.id}
                        onClick={() => toggleLedgerId(item.id)}
                        className={`transition-colors ${
                          isMatched
                            ? 'bg-emerald-50/40 text-slate-500'
                            : isSelected
                            ? 'bg-teal-600/10'
                            : isReadOnly
                            ? 'hover:bg-slate-50'
                            : 'hover:bg-slate-50 cursor-pointer'
                        }`}
                      >
                        <td className="py-2.5 pl-4 pr-2 align-top">
                          {isMatched ? (
                            <CheckCircle2
                              className="w-4 h-4 text-emerald-600 mt-0.5"
                              aria-label="Conciliado"
                            />
                          ) : isReadOnly ? (
                            <span
                              className="inline-block w-2 h-2 rounded-full bg-amber-400 mt-1.5"
                              title="Pendiente"
                            />
                          ) : (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              aria-label={`Seleccionar comprobante contable ${item.comprobante}`}
                              className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-700 cursor-pointer"
                            />
                          )}
                        </td>
                        <td className="py-2.5 px-2 align-top whitespace-nowrap">
                          <div className="font-mono font-semibold text-slate-800">
                            {item.comprobante}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{item.fecha}</div>
                        </td>
                        <td className="py-2.5 px-2 align-top">
                          <div className="font-semibold text-slate-800 truncate max-w-[240px]">
                            {item.tercero}
                          </div>
                          <div className="text-[11px] text-slate-500 line-clamp-1">
                            {item.descripcion}
                          </div>
                        </td>
                        <td className="py-2.5 pl-2 pr-4 align-top text-right whitespace-nowrap font-mono font-bold tabular-nums">
                          <span
                            className={
                              signedVal >= 0 ? 'text-emerald-700' : 'text-slate-900'
                            }
                          >
                            {formatBankMoney(signedVal, currency, true)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Matched Groups Audit Table with 1-Click Unmatch */}
      {scopedMatches.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Cruces Confirmados ({scopedMatches.length})
              </h4>
              <p className="text-[11px] text-slate-500">
                Historial de partidas conciliadas (soporta cruces 1 a 1 y lotes N a M)
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-2.5 px-5">Referencias Extracto</th>
                  <th className="py-2.5 px-4">Comprobantes Libros</th>
                  <th className="py-2.5 px-4">Método</th>
                  <th className="py-2.5 px-4 text-right">Importe Conciliado</th>
                  {!isReadOnly && <th className="py-2.5 px-5 text-right">Acción</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {scopedMatches.map((group) => {
                  const bItems = group.bankItemIds
                    .map((id) => bankById.get(id))
                    .filter(Boolean) as BankStatementItem[];
                  const lItems = group.ledgerItemIds
                    .map((id) => ledgerById.get(id))
                    .filter(Boolean) as BookLedgerItem[];
                  const matchedAmount = bItems.reduce(
                    (s, b) => s + getBankSignedAmount(b),
                    0
                  );

                  return (
                    <tr key={group.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-5 font-mono text-slate-800">
                        {bItems.map((b) => b.referencia).join(', ') || '—'}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-mono text-slate-800">
                          {lItems.map((l) => l.comprobante).join(', ') || '—'}
                        </div>
                        {group.note && (
                          <div className="text-[11px] text-slate-500">{group.note}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        {group.method === 'automatico_ref'
                          ? 'Automático · Ref'
                          : group.method === 'automatico_valor'
                          ? 'Automático · Valor/Fecha'
                          : `Manual (${bItems.length}×${lItems.length})`}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                        {formatBankMoney(matchedAmount, currency, true)}
                      </td>
                      {!isReadOnly && (
                        <td className="py-2.5 px-5 text-right">
                          <button
                            type="button"
                            onClick={() => onDeleteMatch(group.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Unlink2 className="w-3.5 h-3.5" />
                            <span>Deshacer</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
