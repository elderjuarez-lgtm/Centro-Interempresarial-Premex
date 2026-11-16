import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Trash2,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Lock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileSearch,
  List,
  ArrowLeftRight
} from 'lucide-react';
import {
  Movement,
  MovementType,
  ClosedMonthRecord,
  DocumentComparisonRow,
  MovimientosNavigationPreset,
  MovementDocStatus
} from '../../types';
import { formatCurrency, reconcileByDocument } from '../../utils/reconciliation';

interface MovimientosViewProps {
  movements: Movement[];
  setMovements: React.Dispatch<React.SetStateAction<Movement[]>>;
  selectedMonth?: string;
  closedMonths?: Record<string, ClosedMonthRecord>;
  navigationPreset?: MovimientosNavigationPreset | null;
  onConsumeNavigationPreset?: () => void;
}

type DocStatusFilter = 'ALL' | 'CONCILIADOS' | 'NO_CONCILIADOS';

export const MovimientosView: React.FC<MovimientosViewProps> = ({
  movements,
  setMovements,
  selectedMonth = 'ALL',
  closedMonths = {},
  navigationPreset,
  onConsumeNavigationPreset,
}) => {
  const [viewMode, setViewMode] = useState<'documentos' | 'lista'>('documentos');
  const [searchTerm, setSearchTerm] = useState('');
  const [monthFilter, setMonthFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | MovementType>('ALL');
  const [sociedadFilter, setSociedadFilter] = useState<string>('ALL');
  const [contraparteFilter, setContraparteFilter] = useState<string>('ALL');
  const [docStatusFilter, setDocStatusFilter] = useState<DocStatusFilter>('ALL');
  const [directionScope, setDirectionScope] = useState<'PAIR_BOTH' | 'CXC_TO_CXP'>('PAIR_BOTH');
  const [sortBy, setSortBy] = useState<'fecha' | 'sociedad' | 'valor' | 'factura'>('fecha');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Apply external navigation presets (e.g. from Diferencias or Matrices drill-down)
  useEffect(() => {
    if (!navigationPreset) return;
    setViewMode(navigationPreset.viewMode || 'documentos');
    setSociedadFilter(navigationPreset.sociedad || 'ALL');
    setContraparteFilter(navigationPreset.contraparte || 'ALL');
    setDocStatusFilter(navigationPreset.docStatusFilter || 'ALL');
    setDirectionScope(navigationPreset.directionScope || 'PAIR_BOTH');
    setMonthFilter('ALL');
    setTypeFilter('ALL');
    setSearchTerm('');
    setCurrentPage(1);
    if (onConsumeNavigationPreset) {
      onConsumeNavigationPreset();
    }
  }, [navigationPreset, onConsumeNavigationPreset]);

  // Distinct months, societies and counterparties for filters
  const monthsList = useMemo(() => {
    return Array.from(new Set(movements.map((m) => m.mes || 'Septiembre 2026'))).sort();
  }, [movements]);

  const companiesList = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m) => {
      if (m.sociedad) set.add(m.sociedad);
      if (m.contraparte) set.add(m.contraparte);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [movements]);

  // Pre-filter movements by month if monthFilter !== 'ALL' before document reconciliation
  const monthScopedMovements = useMemo(() => {
    if (monthFilter === 'ALL') return movements;
    return movements.filter((m) => (m.mes || 'Septiembre 2026') === monthFilter);
  }, [movements, monthFilter]);

  // Full document-level reconciliation engine
  const docRecon = useMemo(
    () => reconcileByDocument(monthScopedMovements),
    [monthScopedMovements]
  );

  // Pair-filtered & search-filtered comparative rows (before docStatusFilter, for accurate counts)
  const pairScopedDocRows = useMemo(() => {
    return docRecon.rows.filter((row) => {
      if (sociedadFilter !== 'ALL' && contraparteFilter !== 'ALL') {
        const directMatch =
          row.sociedad === sociedadFilter && row.contraparte === contraparteFilter;
        const reverseMatch =
          row.sociedad === contraparteFilter && row.contraparte === sociedadFilter;
        if (directionScope === 'CXC_TO_CXP') {
          if (!directMatch) return false;
        } else {
          if (!directMatch && !reverseMatch) return false;
        }
      } else if (sociedadFilter !== 'ALL') {
        if (row.sociedad !== sociedadFilter && row.contraparte !== sociedadFilter) return false;
      } else if (contraparteFilter !== 'ALL') {
        if (row.sociedad !== contraparteFilter && row.contraparte !== contraparteFilter) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const match =
          row.facturaDisplay.toLowerCase().includes(term) ||
          (row.counterpartyFacturaDisplay
            ? row.counterpartyFacturaDisplay.toLowerCase().includes(term)
            : false) ||
          row.sociedad.toLowerCase().includes(term) ||
          row.contraparte.toLowerCase().includes(term) ||
          row.mes.toLowerCase().includes(term);
        if (!match) return false;
      }

      return true;
    });
  }, [docRecon.rows, sociedadFilter, contraparteFilter, directionScope, searchTerm]);

  // Document filter counts & global summary for the active selection
  const docSummary = useMemo(() => {
    let conciliados = 0;
    let conciliadosPorDocumento = 0;
    let conciliadosPorValor = 0;
    let conDiferenciaValor = 0;
    let sinContraparte = 0;
    let totalCxc = 0;
    let totalCxp = 0;

    pairScopedDocRows.forEach((r) => {
      totalCxc += r.cxcValor;
      totalCxp += r.cxpValor;
      if (r.status === 'conciliado') {
        conciliados += 1;
        if (r.matchMethod === 'valor') conciliadosPorValor += 1;
        else conciliadosPorDocumento += 1;
      } else if (r.status === 'diferencia_valor') {
        conDiferenciaValor += 1;
      } else {
        sinContraparte += 1;
      }
    });

    totalCxc = Math.round((totalCxc + Number.EPSILON) * 100) / 100;
    totalCxp = Math.round((totalCxp + Number.EPSILON) * 100) / 100;
    const diferenciaGlobal = Math.round((totalCxc - totalCxp + Number.EPSILON) * 100) / 100;

    return {
      total: pairScopedDocRows.length,
      conciliados,
      conciliadosPorDocumento,
      conciliadosPorValor,
      conDiferenciaValor,
      sinContraparte,
      noConciliados: conDiferenciaValor + sinContraparte,
      totalCxc,
      totalCxp,
      diferenciaGlobal,
    };
  }, [pairScopedDocRows]);

  const filteredDocRows = useMemo(() => {
    if (docStatusFilter === 'CONCILIADOS') {
      return pairScopedDocRows.filter((r) => r.status === 'conciliado');
    }
    if (docStatusFilter === 'NO_CONCILIADOS') {
      return pairScopedDocRows.filter((r) => r.status !== 'conciliado');
    }
    return pairScopedDocRows;
  }, [pairScopedDocRows, docStatusFilter]);

  const filteredDocTotals = useMemo(() => {
    const cxc = filteredDocRows.reduce((s, r) => s + r.cxcValor, 0);
    const cxp = filteredDocRows.reduce((s, r) => s + r.cxpValor, 0);
    const diff = cxc - cxp;
    return {
      cxc: Math.round((cxc + Number.EPSILON) * 100) / 100,
      cxp: Math.round((cxp + Number.EPSILON) * 100) / 100,
      diff: Math.round((diff + Number.EPSILON) * 100) / 100,
    };
  }, [filteredDocRows]);

  // Dual side-by-side tables when both Sociedad & Contraparte are selected
  const hasBothPairSelected =
    sociedadFilter !== 'ALL' &&
    contraparteFilter !== 'ALL' &&
    sociedadFilter !== contraparteFilter;

  const matchesDocStatus = (m: Movement): boolean => {
    if (docStatusFilter === 'ALL') return true;
    const st = docRecon.movementStatusMap[m.id]?.status;
    if (docStatusFilter === 'CONCILIADOS') return st === 'conciliado';
    return st !== 'conciliado';
  };

  const matchesSearch = (m: Movement): boolean => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const matchedCpFactura = docRecon.movementStatusMap[m.id]?.matchedCounterpartyFactura;
    return (
      m.factura.toLowerCase().includes(term) ||
      (matchedCpFactura ? matchedCpFactura.toLowerCase().includes(term) : false) ||
      m.sociedad.toLowerCase().includes(term) ||
      m.contraparte.toLowerCase().includes(term) ||
      (m.mes ? m.mes.toLowerCase().includes(term) : false) ||
      (m.notas ? m.notas.toLowerCase().includes(term) : false)
    );
  };

  const sociedadReportedMovements = useMemo(() => {
    if (!hasBothPairSelected) return [];
    return monthScopedMovements
      .filter(
        (m) =>
          m.sociedad === sociedadFilter &&
          m.contraparte === contraparteFilter &&
          matchesDocStatus(m) &&
          matchesSearch(m)
      )
      .sort((a, b) => a.factura.localeCompare(b.factura));
  }, [hasBothPairSelected, monthScopedMovements, sociedadFilter, contraparteFilter, docStatusFilter, searchTerm, docRecon.movementStatusMap]);

  const contraparteReportedMovements = useMemo(() => {
    if (!hasBothPairSelected) return [];
    return monthScopedMovements
      .filter(
        (m) =>
          m.sociedad === contraparteFilter &&
          m.contraparte === sociedadFilter &&
          matchesDocStatus(m) &&
          matchesSearch(m)
      )
      .sort((a, b) => a.factura.localeCompare(b.factura));
  }, [hasBothPairSelected, monthScopedMovements, sociedadFilter, contraparteFilter, docStatusFilter, searchTerm, docRecon.movementStatusMap]);

  // Detailed list filtering & sorting
  const filteredMovements = useMemo(() => {
    return monthScopedMovements
      .filter((m) => {
        if (typeFilter !== 'ALL' && m.tipo !== typeFilter) return false;
        if (sociedadFilter !== 'ALL' && m.sociedad !== sociedadFilter) return false;
        if (contraparteFilter !== 'ALL' && m.contraparte !== contraparteFilter) return false;
        if (!matchesDocStatus(m)) return false;
        if (!matchesSearch(m)) return false;
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortBy === 'fecha') {
          diff = a.fecha_factura.localeCompare(b.fecha_factura);
        } else if (sortBy === 'sociedad') {
          diff = a.sociedad.localeCompare(b.sociedad);
        } else if (sortBy === 'factura') {
          diff = a.factura.localeCompare(b.factura);
        } else if (sortBy === 'valor') {
          diff = a.valor - b.valor;
        }
        return sortOrder === 'asc' ? diff : -diff;
      });
  }, [monthScopedMovements, typeFilter, sociedadFilter, contraparteFilter, docStatusFilter, searchTerm, sortBy, sortOrder, docRecon.movementStatusMap]);

  const totalPages = Math.ceil(filteredMovements.length / itemsPerPage) || 1;
  const paginatedMovements = filteredMovements.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const totalFilteredValue = filteredMovements.reduce((sum, m) => sum + m.valor, 0);

  const handleDelete = (m: Movement) => {
    const mes = m.mes || 'Septiembre 2026';
    if (closedMonths[mes]) return;
    if (window.confirm('¿Deseas eliminar este movimiento de la conciliación?')) {
      setMovements((prev) => prev.filter((item) => item.id !== m.id));
    }
  };

  const toggleSort = (col: 'fecha' | 'sociedad' | 'valor' | 'factura') => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
  };

  const handleSwapPair = () => {
    if (!hasBothPairSelected) return;
    const prevSoc = sociedadFilter;
    const prevCp = contraparteFilter;
    setSociedadFilter(prevCp);
    setContraparteFilter(prevSoc);
  };

  const renderDocStatusBadge = (
    docStatus: MovementDocStatus | undefined,
    counterpartyName?: string
  ) => {
    if (!docStatus) return null;
    if (docStatus.status === 'conciliado') {
      if (docStatus.matchMethod === 'valor') {
        return (
          <div className="flex flex-col items-start gap-0.5">
            <span
              title={
                docStatus.matchedCounterpartyFactura
                  ? `Cruce exclusivo 1 a 1 por valor exacto contra factura ${docStatus.matchedCounterpartyFactura}. Queda bloqueado para otros cruces.`
                  : 'Cruce exclusivo 1 a 1 por valor exacto. Queda bloqueado para otros cruces.'
              }
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300 whitespace-nowrap"
            >
              <CheckCircle2 className="w-3 h-3 text-teal-600 shrink-0" />
              <span>Conciliado (por Valor)</span>
            </span>
            {docStatus.matchedCounterpartyFactura && (
              <span className="text-[10px] font-mono text-teal-800 pl-1">
                Ref. Cp: {docStatus.matchedCounterpartyFactura}
              </span>
            )}
          </div>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>Conciliado</span>
        </span>
      );
    }
    if (docStatus.status === 'diferencia_valor') {
      return (
        <span
          title={`Diferencia de valor contra contraparte (${formatCurrency(docStatus.difference)})`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap"
        >
          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
          <span>Alerta Dif. ({formatCurrency(docStatus.difference)})</span>
        </span>
      );
    }
    return (
      <span
        title={`No registrado como ${docStatus.expectedReciprocalType} en ${counterpartyName || 'la contraparte'}`}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap"
      >
        <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
        <span>Alerta: Sin {docStatus.expectedReciprocalType} en contraparte</span>
      </span>
    );
  };

  const renderComparisonRowStatus = (row: DocumentComparisonRow) => {
    if (row.status === 'conciliado') {
      if (row.matchMethod === 'valor') {
        return (
          <span
            title="Cruce exclusivo 1 a 1 por valor exacto (el documento queda bloqueado y no puede volver a conciliar con otro valor)"
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-900 border border-teal-300 whitespace-nowrap"
          >
            <CheckCircle2 className="w-3 h-3 text-teal-600 shrink-0" />
            <span>Conciliado (por Valor)</span>
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
          <span>Conciliado</span>
        </span>
      );
    }
    if (row.status === 'diferencia_valor') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
          <span>Alerta: Diferencia de valor</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">
        <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
        <span>
          {row.cxcValor > 0
            ? `Alerta: Falta CXP en ${row.contraparte}`
            : `Alerta: Falta CXC en ${row.sociedad}`}
        </span>
      </span>
    );
  };

  const renderSideTable = (
    title: string,
    subtitle: string,
    counterpartyLabel: string,
    items: Movement[],
    accent: 'blue' | 'indigo'
  ) => {
    const total = items.reduce((s, m) => s + m.valor, 0);
    const alertCount = items.filter(
      (m) => docRecon.movementStatusMap[m.id]?.status !== 'conciliado'
    ).length;

    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
        <div
          className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2 ${
            accent === 'blue'
              ? 'bg-blue-50/80 border-blue-200'
              : 'bg-indigo-50/80 border-indigo-200'
          }`}
        >
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-900">{title}</h4>
            <p className="text-[11px] text-slate-600">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            {alertCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold border border-rose-200">
                {alertCount} con alerta
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                100% conciliado
              </span>
            )}
            <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-0.5 rounded-lg border border-slate-200">
              {formatCurrency(total)}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[10px]">
              <tr>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Factura</th>
                <th className="px-3 py-2.5">Fecha</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5">Estado Documento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                    No hay documentos que coincidan con el filtro actual en este lado.
                  </td>
                </tr>
              ) : (
                items.map((m) => {
                  const st = docRecon.movementStatusMap[m.id];
                  const isAlert = st?.status !== 'conciliado';
                  return (
                    <tr
                      key={m.id}
                      className={`transition-colors ${
                        isAlert ? 'bg-amber-50/35 hover:bg-amber-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            m.tipo === 'CXC'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {m.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900">
                        {m.factura}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-slate-500 text-[11px]">
                        {m.fecha_factura}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900">
                        {formatCurrency(m.valor)}
                      </td>
                      <td className="px-3 py-2.5">
                        {renderDocStatusBadge(st, counterpartyLabel)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Movimientos y Conciliación por Documento
          </h3>
          <p className="text-xs text-slate-500">
            Identifique factura por factura qué documentos concilian y el origen exacto de las variaciones reportadas en la Matriz y Diferencias.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Sub-tab View Switcher */}
          <div className="p-1 bg-slate-100 rounded-xl flex items-center gap-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('documentos')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'documentos'
                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSearch className="w-3.5 h-3.5" />
              <span>Conciliación por Documento</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('lista')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                viewMode === 'lista'
                  ? 'bg-white text-blue-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Listado de Partidas</span>
            </button>
          </div>

          {selectedMonth !== 'ALL' && (
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                closedMonths[selectedMonth]
                  ? 'bg-slate-100 border-slate-300 text-slate-800'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              {closedMonths[selectedMonth] ? (
                <Lock className="w-3.5 h-3.5 text-slate-600" />
              ) : (
                <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>
                {selectedMonth}
                {closedMonths[selectedMonth] ? ' (Cerrado)' : ''}
              </span>
            </div>
          )}

          <div className="px-3.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 font-semibold">
            {movements.length} partidas
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          {/* Search box */}
          <div className="relative lg:col-span-4">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por factura, sociedad, mes o nota..."
              className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Month Filter */}
          <div className="lg:col-span-2">
            <select
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 truncate"
            >
              <option value="ALL">Mes: Todos</option>
              {monthsList.map((mes) => (
                <option key={mes} value={mes}>
                  {mes}
                </option>
              ))}
            </select>
          </div>

          {/* Sociedad Filter */}
          <div className="lg:col-span-2">
            <select
              aria-label="Filtrar por Sociedad"
              value={sociedadFilter}
              onChange={(e) => {
                setSociedadFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 truncate font-medium"
            >
              <option value="ALL">Sociedad: Todas</option>
              {companiesList.map((soc) => (
                <option key={soc} value={soc}>
                  Soc: {soc}
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button when pair selected */}
          {hasBothPairSelected && (
            <div className="lg:col-span-1 flex justify-center">
              <button
                type="button"
                onClick={handleSwapPair}
                title="Invertir Sociedad y Contraparte"
                className="p-1.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-300 text-slate-600 hover:text-blue-700 transition-colors cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Contraparte Filter */}
          <div className={hasBothPairSelected ? 'lg:col-span-3' : 'lg:col-span-2'}>
            <select
              aria-label="Filtrar por Contraparte"
              value={contraparteFilter}
              onChange={(e) => {
                setContraparteFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500 truncate font-medium"
            >
              <option value="ALL">Contraparte: Todas</option>
              {companiesList.map((cp) => (
                <option key={cp} value={cp}>
                  Cp: {cp}
                </option>
              ))}
            </select>
          </div>

          {/* Type Filter (list mode only when no swap button) */}
          {!hasBothPairSelected && (
            <div className="lg:col-span-2">
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Tipo: Todos</option>
                <option value="CXC">Sólo CXC (Por cobrar)</option>
                <option value="CXP">Sólo CXP (Por pagar)</option>
              </select>
            </div>
          )}
        </div>

        {/* Document Status Filter Pills + Direction Scope */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-500 font-semibold mr-1">Documentos:</span>
            <button
              type="button"
              onClick={() => {
                setDocStatusFilter('ALL');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                docStatusFilter === 'ALL'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Todos ({docSummary.total})
            </button>
            <button
              type="button"
              onClick={() => {
                setDocStatusFilter('CONCILIADOS');
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                docStatusFilter === 'CONCILIADOS'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Conciliados ({docSummary.conciliados})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setDocStatusFilter('NO_CONCILIADOS');
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                docStatusFilter === 'NO_CONCILIADOS'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>No Conciliados / Alerta ({docSummary.noConciliados})</span>
            </button>
          </div>

          {hasBothPairSelected && viewMode === 'documentos' && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold">Flujo comparativo:</span>
              <button
                type="button"
                onClick={() => setDirectionScope('CXC_TO_CXP')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  directionScope === 'CXC_TO_CXP'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {sociedadFilter} (CxC) vs {contraparteFilter} (CxP)
              </button>
              <button
                type="button"
                onClick={() => setDirectionScope('PAIR_BOTH')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer ${
                  directionScope === 'PAIR_BOTH'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Ambos flujos
              </button>
            </div>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: CONCILIACIÓN POR DOCUMENTO */}
      {viewMode === 'documentos' && (
        <div className="space-y-6">
          {/* Global Difference Verification Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total CxC (Sociedad)</div>
              <div className="text-lg font-bold font-mono text-blue-950 mt-1">
                {formatCurrency(docSummary.totalCxc)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {docSummary.total} documento(s) evaluados
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
              <div className="text-xs text-slate-500 font-medium">Total CxP (Contraparte)</div>
              <div className="text-lg font-bold font-mono text-indigo-950 mt-1">
                {formatCurrency(docSummary.totalCxp)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Partidas recíprocas registradas
              </div>
            </div>

            <div
              className={`p-4 rounded-2xl border shadow-xs ${
                Math.abs(docSummary.diferenciaGlobal) < 0.01
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-amber-50 border-amber-300'
              }`}
            >
              <div className="text-xs font-semibold text-slate-700">
                Diferencia Global Reportada (CxC - CxP)
              </div>
              <div
                className={`text-lg font-bold font-mono mt-1 ${
                  Math.abs(docSummary.diferenciaGlobal) < 0.01
                    ? 'text-emerald-700'
                    : 'text-amber-900'
                }`}
              >
                {formatCurrency(docSummary.diferenciaGlobal)}
              </div>
              <div className="text-[11px] text-slate-600 mt-0.5">
                Cuadra con Matriz y tabla de Diferencias
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
              <div className="text-xs text-slate-500 font-medium">Estado por Documento</div>
              <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] font-bold">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {docSummary.conciliadosPorDocumento} por Doc.
                </span>
                {docSummary.conciliadosPorValor > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 border border-teal-200">
                    {docSummary.conciliadosPorValor} por Valor
                  </span>
                )}
                {docSummary.conDiferenciaValor > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                    {docSummary.conDiferenciaValor} Dif. Valor
                  </span>
                )}
                {docSummary.sinContraparte > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                    {docSummary.sinContraparte} Sin Contraparte
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* DUAL TABLES WHEN SOCIEDAD AND CONTRAPARTE ARE SELECTED */}
          {hasBothPairSelected ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <h4 className="text-sm font-bold text-slate-900">
                  Comparativo Bilateral: {sociedadFilter} ↔ {contraparteFilter}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setSociedadFilter('ALL');
                    setContraparteFilter('ALL');
                    setDirectionScope('PAIR_BOTH');
                  }}
                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                >
                  Limpiar selección de par
                </button>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {renderSideTable(
                  `Reportado por ${sociedadFilter}`,
                  `Partidas emitidas por ${sociedadFilter} hacia ${contraparteFilter}`,
                  contraparteFilter,
                  sociedadReportedMovements,
                  'blue'
                )}
                {renderSideTable(
                  `Reportado por ${contraparteFilter}`,
                  `Partidas emitidas por ${contraparteFilter} hacia ${sociedadFilter}`,
                  sociedadFilter,
                  contraparteReportedMovements,
                  'indigo'
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 text-xs text-blue-900 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Tip:</strong> Selecciona una <strong>Sociedad</strong> y una{' '}
                <strong>Contraparte</strong> arriba (o haz clic en cualquier par de la tabla comparativa) para abrir las dos tablas frente a frente con lo que reportó cada empresa.
              </span>
            </div>
          )}

          {/* COMPARATIVE DOCUMENT RECONCILIATION TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Tabla Comparativa por Documento (Factura)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Cruce exclusivo 1 a 1: primero por número de documento y luego por valor exacto (cada documento conciliado queda bloqueado).
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-600">
                Mostrando {filteredDocRows.length} de {docSummary.total} documento(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Factura / Doc</th>
                    <th className="px-4 py-3">Mes</th>
                    <th className="px-4 py-3">Sociedad (CxC)</th>
                    <th className="px-4 py-3">Contraparte (CxP)</th>
                    <th className="px-4 py-3 text-right">Reportado Sociedad (CxC)</th>
                    <th className="px-4 py-3 text-right">Reportado Contraparte (CxP)</th>
                    <th className="px-4 py-3 text-right">Diferencia</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDocRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 text-xs">
                        {docStatusFilter === 'NO_CONCILIADOS'
                          ? '¡Excelente! No hay documentos con diferencia ni alertas para los filtros seleccionados.'
                          : 'No se encontraron documentos para los filtros actuales.'}
                      </td>
                    </tr>
                  ) : (
                    filteredDocRows.map((row) => {
                      const isConciliated = row.status === 'conciliado';
                      return (
                        <tr
                          key={row.id}
                          className={`transition-colors ${
                            isConciliated
                              ? 'hover:bg-slate-50/70'
                              : 'bg-amber-50/30 hover:bg-amber-50/60'
                          }`}
                        >
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">
                            <div>{row.facturaDisplay}</div>
                            {row.counterpartyFacturaDisplay && (
                              <div className="text-[10px] font-medium text-teal-700 mt-0.5">
                                ↔ Cp: {row.counterpartyFacturaDisplay}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 whitespace-nowrap">
                              {row.mes}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            <button
                              type="button"
                              onClick={() => {
                                setSociedadFilter(row.sociedad);
                                setContraparteFilter(row.contraparte);
                                setDirectionScope('CXC_TO_CXP');
                              }}
                              title="Ver tablas bilaterales de este par"
                              className="text-left hover:text-blue-700 hover:underline cursor-pointer"
                            >
                              {row.sociedad}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            <button
                              type="button"
                              onClick={() => {
                                setSociedadFilter(row.sociedad);
                                setContraparteFilter(row.contraparte);
                                setDirectionScope('CXC_TO_CXP');
                              }}
                              title="Ver tablas bilaterales de este par"
                              className="text-left hover:text-blue-700 hover:underline cursor-pointer"
                            >
                              {row.contraparte}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            <div className="font-bold text-blue-900">
                              {formatCurrency(row.cxcValor)}
                            </div>
                            {row.cxcFecha !== '—' && (
                              <div className="text-[10px] text-slate-400">{row.cxcFecha}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono">
                            <div className="font-bold text-indigo-900">
                              {formatCurrency(row.cxpValor)}
                            </div>
                            {row.cxpFecha !== '—' && (
                              <div className="text-[10px] text-slate-400">{row.cxpFecha}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold">
                            <span
                              className={
                                isConciliated
                                  ? 'text-emerald-600'
                                  : row.diferencia > 0
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }
                            >
                              {formatCurrency(row.diferencia)}
                            </span>
                          </td>
                          <td className="px-4 py-3">{renderComparisonRowStatus(row)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredDocRows.length > 0 && (
                  <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 text-xs">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-slate-900 uppercase">
                        Totales de documentos mostrados ({filteredDocRows.length})
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-blue-950">
                        {formatCurrency(filteredDocTotals.cxc)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-indigo-950">
                        {formatCurrency(filteredDocTotals.cxp)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono ${
                          Math.abs(filteredDocTotals.diff) < 0.01
                            ? 'text-emerald-700'
                            : 'text-amber-800'
                        }`}
                      >
                        {formatCurrency(filteredDocTotals.diff)}
                      </td>
                      <td className="px-4 py-3 text-[11px] font-normal text-slate-600">
                        {Math.abs(filteredDocTotals.diff) < 0.01
                          ? '✓ Documentos filtrados cuadrados'
                          : 'Variación acumulada en documentos mostrados'}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: LISTADO DE PARTIDAS */}
      {viewMode === 'lista' && (
        <div className="space-y-4">
          <div className="bg-white px-4 py-3 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div>
              Mostrando <strong>{filteredMovements.length}</strong> de {movements.length} partidas.
            </div>
            <div className="font-semibold text-slate-700">
              Suma filtrada:{' '}
              <span className="font-mono text-blue-900">{formatCurrency(totalFilteredValue)}</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3">Mes</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th
                      onClick={() => toggleSort('sociedad')}
                      className="px-4 py-3 cursor-pointer hover:text-slate-900 select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Sociedad</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="px-4 py-3">Contraparte</th>
                    <th
                      onClick={() => toggleSort('fecha')}
                      className="px-4 py-3 cursor-pointer hover:text-slate-900 select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Fecha Factura</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('factura')}
                      className="px-4 py-3 cursor-pointer hover:text-slate-900 select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>Factura</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th
                      onClick={() => toggleSort('valor')}
                      className="px-4 py-3 text-right cursor-pointer hover:text-slate-900 select-none"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>Valor</span>
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      </div>
                    </th>
                    <th className="px-4 py-3">Estado Doc</th>
                    <th className="px-4 py-3">Notas</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedMovements.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                        No se encontraron movimientos con los filtros seleccionados.
                      </td>
                    </tr>
                  ) : (
                    paginatedMovements.map((m) => {
                      const rowMonth = m.mes || 'Septiembre 2026';
                      const isRowClosed = Boolean(closedMonths[rowMonth]);
                      const docStatus = docRecon.movementStatusMap[m.id];
                      return (
                        <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
                                isRowClosed
                                  ? 'bg-slate-100 text-slate-700 border-slate-300'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200/70'
                              }`}
                            >
                              {isRowClosed && <Lock className="w-2.5 h-2.5 text-slate-500" />}
                              {rowMonth}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                m.tipo === 'CXC'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}
                            >
                              {m.tipo}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-800">
                            {m.sociedad}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{m.contraparte}</td>
                          <td className="px-4 py-3 text-slate-500 font-mono">
                            {m.fecha_factura}
                          </td>
                          <td className="px-4 py-3 font-mono font-medium text-slate-900">
                            {m.factura}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(m.valor)}
                          </td>
                          <td className="px-4 py-3">
                            {renderDocStatusBadge(docStatus, m.contraparte)}
                          </td>
                          <td className="px-4 py-3 text-slate-500 text-[11px] max-w-xs truncate">
                            {m.notas || '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {isRowClosed ? (
                              <span
                                title={`Mes ${rowMonth} cerrado: protegido contra eliminación`}
                                className="inline-flex items-center justify-center p-1 text-slate-400"
                              >
                                <Lock className="w-3.5 h-3.5" />
                              </span>
                            ) : (
                              <button
                                onClick={() => handleDelete(m)}
                                title="Eliminar partida"
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Página {currentPage} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    className="p-1 rounded-md text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    className="p-1 rounded-md text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
