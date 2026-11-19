import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  FileSpreadsheet,
  FileText,
  Send,
  Trash2,
  FolderOpen,
  Users,
  Pencil,
  Check,
  X,
  UserCheck,
  Mail,
  Lock,
  Unlock,
  Calendar,
  Coins,
  Archive,
  Printer,
} from 'lucide-react';
import {
  EffectivePermissions,
  ModuleCompanyEntry,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoLiquidation,
  ViaticoLiquidationStatus,
} from '../../types';
import {
  CURRENCY_SYMBOLS,
  VIATICO_CURRENCIES,
  formatViaticoAmount,
  resolveLiquidationCostCenter,
} from '../../utils/viaticos';
import { normalizeEmail } from '../../utils/permissions';

interface ViaticosHistorialViewProps {
  viewMode: 'cerradas' | 'historial';
  liquidaciones: ViaticoLiquidation[];
  consultores: ViaticoConsultor[];
  moduleCompanies?: ModuleCompanyEntry[];
  activeLiquidationId: string;
  permissions: EffectivePermissions;
  isLockedToOwnConsultor: boolean;
  onOpenLiquidation: (id: string) => void;
  onCreateNewLiquidation: () => void;
  onDeleteLiquidation: (id: string) => void;
  onPreviewPlanillaPdf: (liq: ViaticoLiquidation) => void;
  onDownloadExcel: (liq: ViaticoLiquidation) => void;
  onDownloadPdf: (liq: ViaticoLiquidation) => void;
  onOpenCloseConfirmFor: (liq: ViaticoLiquidation) => void;
  onOpenCloseEmailFor: (liq: ViaticoLiquidation) => void;
  onReopenLiquidation?: (liqId: string) => void;
  onUpsertConsultor: (consultor: ViaticoConsultor) => void;
  onDeleteConsultor: (consultorId: string) => void;
}

export const ViaticosHistorialView: React.FC<ViaticosHistorialViewProps> = ({
  viewMode,
  liquidaciones,
  consultores,
  moduleCompanies = [],
  activeLiquidationId,
  permissions,
  isLockedToOwnConsultor,
  onOpenLiquidation,
  onCreateNewLiquidation,
  onDeleteLiquidation,
  onPreviewPlanillaPdf,
  onDownloadExcel,
  onDownloadPdf,
  onOpenCloseConfirmFor,
  onOpenCloseEmailFor,
  onReopenLiquidation,
  onUpsertConsultor,
  onDeleteConsultor,
}) => {
  const isClosedMode = viewMode === 'cerradas';
  const [subTab, setSubTab] = useState<'liquidaciones' | 'consultores'>('liquidaciones');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ViaticoLiquidationStatus>('ALL');
  const [weekFilter, setWeekFilter] = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | ViaticoCurrency>('ALL');
  const [confirmDeleteLiqId, setConfirmDeleteLiqId] = useState<string | null>(null);

  // Reset filters cleanly when toggling between Cerradas and Historial tabs
  useEffect(() => {
    setSubTab('liquidaciones');
    setStatusFilter('ALL');
    setWeekFilter('ALL');
    setCurrencyFilter('ALL');
    setSearchQuery('');
    setConfirmDeleteLiqId(null);
  }, [viewMode]);

  // Consultant CRUD modal state (Admins only)
  const [isConsultorModalOpen, setIsConsultorModalOpen] = useState(false);
  const [editingConsultorId, setEditingConsultorId] = useState<string | null>(null);
  const [cNombre, setCNombre] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cEmpresa, setCEmpresa] = useState('Premex Corp');
  const [cCargo, setCCargo] = useState('Consultor Comercial');
  const [cCentroCosto, setCCentroCosto] = useState('');
  const [cMoneda, setCMoneda] = useState<ViaticoCurrency>('Quetzales');
  const [cActivo, setCActivo] = useState(true);
  const [cError, setCError] = useState<string | null>(null);

  const existingCostCenters = useMemo(() => {
    const set = new Set<string>();
    consultores.forEach((c) => {
      if (c.centroCosto?.trim()) set.add(c.centroCosto.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [consultores]);

  // Base list scoped to closed/sent in 'cerradas' mode, or all liquidaciones in 'historial' mode
  const scopedLiquidaciones = useMemo(
    () =>
      isClosedMode
        ? liquidaciones.filter((l) => l.estado !== 'borrador')
        : liquidaciones,
    [liquidaciones, isClosedMode]
  );

  const availableWeeks = useMemo(() => {
    const set = new Set<string>();
    scopedLiquidaciones.forEach((l) => {
      const w = (l.semana || '').trim();
      if (w) set.add(w);
    });
    return Array.from(set).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
      return b.localeCompare(a);
    });
  }, [scopedLiquidaciones]);

  const availableCurrencies = useMemo(() => {
    const set = new Set<ViaticoCurrency>();
    scopedLiquidaciones.forEach((l) => {
      if (l.monedaBase) set.add(l.monedaBase);
    });
    return Array.from(set);
  }, [scopedLiquidaciones]);

  const stats = useMemo(() => {
    const borradores = liquidaciones.filter((l) => l.estado === 'borrador').length;
    const cerradas = scopedLiquidaciones.filter((l) => l.estado === 'cerrada').length;
    const enviadas = scopedLiquidaciones.filter((l) => l.estado === 'enviada').length;
    const totalFacturas = scopedLiquidaciones.reduce((sum, l) => sum + l.items.length, 0);

    const totalsByCurrency: Partial<Record<ViaticoCurrency, number>> = {};
    scopedLiquidaciones.forEach((l) => {
      totalsByCurrency[l.monedaBase] =
        (totalsByCurrency[l.monedaBase] || 0) + l.totalLiquidacion;
    });

    return {
      total: scopedLiquidaciones.length,
      borradores,
      cerradas,
      enviadas,
      totalFacturas,
      distinctWeeks: availableWeeks.length,
      totalsByCurrency: Object.entries(totalsByCurrency) as [ViaticoCurrency, number][],
    };
  }, [liquidaciones, scopedLiquidaciones, availableWeeks.length]);

  const filteredLiquidaciones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedLiquidaciones.filter((l) => {
      if (statusFilter !== 'ALL' && l.estado !== statusFilter) return false;
      if (weekFilter !== 'ALL' && (l.semana || '').trim() !== weekFilter) return false;
      if (currencyFilter !== 'ALL' && l.monedaBase !== currencyFilter) return false;
      if (!q) return true;
      return (
        l.lineaLiquidacion.toLowerCase().includes(q) ||
        l.consultorNombre.toLowerCase().includes(q) ||
        l.consultorEmail.toLowerCase().includes(q) ||
        l.semana.toLowerCase().includes(q) ||
        l.empresa.toLowerCase().includes(q) ||
        l.monedaBase.toLowerCase().includes(q)
      );
    });
  }, [scopedLiquidaciones, searchQuery, statusFilter, weekFilter, currencyFilter]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    statusFilter !== 'ALL' ||
    weekFilter !== 'ALL' ||
    currencyFilter !== 'ALL';

  const openNewConsultorModal = () => {
    setEditingConsultorId(null);
    setCNombre('');
    setCEmail('');
    setCEmpresa(moduleCompanies[0]?.nombre || 'Premex Corp');
    setCCargo('Consultor Comercial');
    setCCentroCosto('');
    setCMoneda('Quetzales');
    setCActivo(true);
    setCError(null);
    setIsConsultorModalOpen(true);
  };

  const openEditConsultorModal = (c: ViaticoConsultor) => {
    setEditingConsultorId(c.id);
    setCNombre(c.nombreCompleto);
    setCEmail(c.email);
    setCEmpresa(c.empresa);
    setCCargo(c.cargo || '');
    setCCentroCosto(c.centroCosto || '');
    setCMoneda(c.monedaBase);
    setCActivo(c.activo);
    setCError(null);
    setIsConsultorModalOpen(true);
  };

  const handleSaveConsultor = (e: React.FormEvent) => {
    e.preventDefault();
    setCError(null);
    const cleanName = cNombre.trim();
    const cleanEmail = normalizeEmail(cEmail);
    if (!cleanName) {
      setCError('Ingresa el nombre completo del consultor.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setCError('Ingresa un correo corporativo válido (ej. nombre.apellido@premexcorp.com).');
      return;
    }

    onUpsertConsultor({
      id:
        editingConsultorId ||
        `cons-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      nombreCompleto: cleanName,
      email: cleanEmail,
      empresa: cEmpresa.trim() || 'Premex Corp',
      cargo: cCargo.trim(),
      centroCosto: cCentroCosto.trim(),
      monedaBase: cMoneda,
      activo: cActivo,
    });
    setIsConsultorModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      {isClosedMode ? (
        <section className="bg-white rounded-2xl border border-slate-200/90 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Liquidaciones Cerradas
            </div>
            <div className="mt-1.5 text-2xl font-bold text-[#132B63] font-mono tabular-nums">
              {stats.total}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {stats.cerradas} cerradas · {stats.enviadas} enviadas por correo
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Semanas Concluidas
            </div>
            <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {stats.distinctWeeks}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {availableCurrencies.length}{' '}
              {availableCurrencies.length === 1 ? 'moneda' : 'monedas'} registradas
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Comprobantes Respaldados
            </div>
            <div className="mt-1.5 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {stats.totalFacturas}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              Listos para descarga Excel y PDF
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Total Cerrado por Moneda
            </div>
            {stats.totalsByCurrency.length === 0 ? (
              <div className="mt-1.5 text-sm font-mono text-slate-400">—</div>
            ) : (
              <div className="mt-1.5 space-y-0.5">
                {stats.totalsByCurrency.slice(0, 3).map(([cur, amt]) => (
                  <div
                    key={cur}
                    className="text-sm font-bold text-[#132B63] font-mono tabular-nums leading-tight"
                  >
                    {formatViaticoAmount(amt, cur, true)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-2xl border border-slate-200/90 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Liquidaciones Visibles
            </div>
            <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {stats.total}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {stats.totalFacturas} comprobantes registrados
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Liquidaciones Abiertas
            </div>
            <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
              {stats.borradores}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">En curso · Pendientes de cierre</div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Cerradas / Enviadas
            </div>
            <div className="mt-1.5 text-2xl font-bold text-emerald-700 font-mono tabular-nums">
              {stats.cerradas + stats.enviadas}
            </div>
            <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
              {stats.enviadas} enviadas · {stats.cerradas} cerradas
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Consultores Disponibles
            </div>
            <div className="mt-1.5 text-2xl font-bold text-[#132B63] font-mono tabular-nums">
              {consultores.filter((c) => c.activo).length}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">
              {isLockedToOwnConsultor ? 'Perfil vinculado a tu correo' : 'Catálogo habilitado'}
            </div>
          </div>
        </section>
      )}

      {/* Filter & Sub-navigation Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 flex flex-wrap items-center justify-between gap-3">
        {isClosedMode ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#132B63]/10 text-[#132B63] flex items-center justify-center shrink-0">
              <Archive className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-slate-900">
                Archivo de Liquidaciones Cerradas ({filteredLiquidaciones.length})
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Filtra por semana o moneda para consultar comprobantes y descargar Excel o PDF.
              </p>
            </div>
          </div>
        ) : (
          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70">
            <button
              type="button"
              onClick={() => setSubTab('liquidaciones')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subTab === 'liquidaciones'
                  ? 'bg-white text-[#19377B] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Todas las Liquidaciones ({liquidaciones.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('consultores')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                subTab === 'consultores'
                  ? 'bg-white text-[#19377B] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Consultores Disponibles ({consultores.length})
            </button>
          </div>
        )}

        {isClosedMode || subTab === 'liquidaciones' ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative w-52 sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar línea, consultor o sociedad..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Week Filter */}
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
              <select
                value={weekFilter}
                aria-label="Filtrar por semana"
                onChange={(e) => setWeekFilter(e.target.value)}
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">Todas las semanas</option>
                {availableWeeks.map((w) => (
                  <option key={w} value={w}>
                    Semana #{w}
                  </option>
                ))}
              </select>
            </div>

            {/* Currency Filter */}
            <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5">
              <Coins className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
              <select
                value={currencyFilter}
                aria-label="Filtrar por moneda"
                onChange={(e) =>
                  setCurrencyFilter(e.target.value as 'ALL' | ViaticoCurrency)
                }
                className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer"
              >
                <option value="ALL">Todas las monedas</option>
                {availableCurrencies.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur} ({CURRENCY_SYMBOLS[cur]})
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              aria-label="Filtrar por estado"
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | ViaticoLiquidationStatus)
              }
              className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5"
            >
              {isClosedMode ? (
                <>
                  <option value="ALL">Cerradas y enviadas</option>
                  <option value="cerrada">Solo cerradas (sin enviar)</option>
                  <option value="enviada">Cerradas y enviadas</option>
                </>
              ) : (
                <>
                  <option value="ALL">Todos los estados</option>
                  <option value="borrador">Abiertas (Borrador)</option>
                  <option value="cerrada">Cerradas</option>
                  <option value="enviada">Enviadas</option>
                </>
              )}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setWeekFilter('ALL');
                  setCurrencyFilter('ALL');
                }}
                className="text-xs font-semibold text-[#1E60A8] hover:text-[#132B63] px-2 py-1 cursor-pointer whitespace-nowrap"
              >
                Limpiar
              </button>
            )}

            {permissions.canOperate && (
              <button
                type="button"
                onClick={onCreateNewLiquidation}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva Liquidación</span>
              </button>
            )}
          </div>
        ) : (
          permissions.isAdmin && (
            <button
              type="button"
              onClick={openNewConsultorModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Consultor</span>
            </button>
          )
        )}
      </div>

      {/* LIQUIDACIONES TABLE (Used in both 'cerradas' and 'historial' modes) */}
      {(isClosedMode || subTab === 'liquidaciones') && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Semana / Línea de Liquidación</th>
                  <th className="py-3 px-4">Moneda</th>
                  <th className="py-3 px-4">Consultor</th>
                  <th className="py-3 px-4 text-center">Facturas</th>
                  <th className="py-3 px-4 text-right">Total Reintegrar</th>
                  <th className="py-3 px-4">Estado / Cierre</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLiquidaciones.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      {isClosedMode && scopedLiquidaciones.length === 0
                        ? 'Aún no hay liquidaciones cerradas registradas. Cuando cierres una liquidación aparecerá aquí para consulta y descarga de Excel y PDF.'
                        : 'No se encontraron liquidaciones con los filtros seleccionados.'}
                    </td>
                  </tr>
                ) : (
                  filteredLiquidaciones.map((liq) => {
                    const isActive = liq.id === activeLiquidationId;
                    const isDraft = liq.estado === 'borrador';
                    return (
                      <tr
                        key={liq.id}
                        className={`transition-colors ${
                          isActive ? 'bg-sky-50/60' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span className="font-mono text-[#1E60A8] tabular-nums shrink-0">
                              Sem #{liq.semana || '-'}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="truncate max-w-[260px]">
                              {liq.lineaLiquidacion || 'Sin título'}
                            </span>
                            {isActive && (
                              <span className="text-[10px] font-bold text-[#1E60A8] shrink-0">
                                · En vista
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            {liq.empresa} · Actualizado{' '}
                            {new Date(liq.updatedAtIso).toLocaleDateString('es-GT')}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="font-semibold text-slate-800">{liq.monedaBase}</div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {CURRENCY_SYMBOLS[liq.monedaBase]}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">
                            {liq.consultorNombre}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {liq.consultorEmail || 'Sin correo'}
                          </div>
                          {(() => {
                            const cc = resolveLiquidationCostCenter(liq, consultores);
                            return cc ? (
                              <div className="text-[10px] font-semibold text-[#132B63] mt-0.5">
                                C.C.: {cc}
                              </div>
                            ) : null;
                          })()}
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-700">
                          {liq.items.length}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-[#132B63] whitespace-nowrap">
                          {formatViaticoAmount(liq.totalLiquidacion, liq.monedaBase, true)}
                        </td>

                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-semibold">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                liq.estado === 'enviada'
                                  ? 'bg-emerald-500'
                                  : liq.estado === 'cerrada'
                                  ? 'bg-sky-600'
                                  : 'bg-amber-500'
                              }`}
                            />
                            <span
                              className={
                                liq.estado === 'enviada'
                                  ? 'text-emerald-700'
                                  : liq.estado === 'cerrada'
                                  ? 'text-sky-700'
                                  : 'text-amber-700'
                              }
                            >
                              {liq.estado === 'enviada'
                                ? 'Cerrada y Enviada'
                                : liq.estado === 'cerrada'
                                ? 'Cerrada'
                                : 'Abierta'}
                            </span>
                          </div>
                          {liq.closedAtIso && !isDraft && (
                            <div className="text-[10px] text-slate-500 tabular-nums mt-0.5">
                              Cierre: {new Date(liq.closedAtIso).toLocaleDateString('es-GT')}
                              {liq.closedBy ? ` · ${liq.closedBy}` : ''}
                            </div>
                          )}
                          {liq.sentToEmail && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                              Para: {liq.sentToEmail}
                            </div>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onOpenLiquidation(liq.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1E60A8] hover:bg-[#1E60A8]/10 rounded-lg cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              <span>{isDraft ? 'Abrir' : 'Consultar'}</span>
                            </button>

                            {isDraft && permissions.canOperate && (
                              <button
                                type="button"
                                onClick={() => onOpenCloseConfirmFor(liq)}
                                disabled={liq.items.length === 0}
                                title="Cerrar liquidación"
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#132B63] bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg cursor-pointer"
                              >
                                <Lock className="w-3 h-3" />
                                <span>Cerrar</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onPreviewPlanillaPdf(liq)}
                              disabled={liq.items.length === 0}
                              title="Vista PDF e Imprimir Planilla Excel"
                              className="p-1.5 text-[#1E60A8] hover:bg-sky-50 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onDownloadExcel(liq)}
                              disabled={liq.items.length === 0}
                              title="Descargar Excel Premex"
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onDownloadPdf(liq)}
                              disabled={liq.items.length === 0}
                              title="Descargar PDF con comprobantes"
                              className="p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <FileText className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenCloseEmailFor(liq)}
                              disabled={liq.items.length === 0}
                              title="Enviar por correo electrónico"
                              className="p-1.5 text-[#132B63] hover:bg-slate-100 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <Send className="w-4 h-4" />
                            </button>

                            {!isDraft && permissions.isAdmin && onReopenLiquidation && (
                              <button
                                type="button"
                                onClick={() => onReopenLiquidation(liq.id)}
                                title="Reabrir liquidación (Solo Administrador)"
                                className="p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg cursor-pointer"
                              >
                                <Unlock className="w-4 h-4" />
                              </button>
                            )}

                            {permissions.canOperate &&
                              (isDraft || permissions.isAdmin) &&
                              (confirmDeleteLiqId === liq.id ? (
                                <div className="inline-flex items-center gap-1 ml-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteLiquidation(liq.id);
                                      setConfirmDeleteLiqId(null);
                                    }}
                                    className="px-2 py-1 text-[11px] font-semibold bg-rose-600 text-white rounded-lg cursor-pointer"
                                  >
                                    Eliminar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteLiqId(null)}
                                    className="px-2 py-1 text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-lg cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteLiqId(liq.id)}
                                  title="Eliminar liquidación"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* SUB-TAB 2: CONSULTORES CATALOG (Only in 'historial' mode) */}
      {!isClosedMode && subTab === 'consultores' && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-[#1E60A8]" />
                <span>Listado de Consultores Disponibles</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                La aplicación detecta automáticamente el consultor que está liquidando cruzando su correo (<span className="font-mono">primerNombre.primerApellido@empresa</span>) y su nivel de permiso.
              </p>
            </div>
            {!permissions.isAdmin && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                <Lock className="w-3.5 h-3.5" />
                <span>Administrado por Rol Administrador</span>
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Consultor</th>
                  <th className="py-3 px-4">Correo Corporativo (Vínculo)</th>
                  <th className="py-3 px-4">Empresa / Sociedad</th>
                  <th className="py-3 px-4">Centro de Costo (Contabilidad)</th>
                  <th className="py-3 px-4">Moneda Base</th>
                  <th className="py-3 px-4">Estado</th>
                  {permissions.isAdmin && (
                    <th className="py-3 px-4 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {consultores.map((c) => (
                  <tr
                    key={c.id}
                    className={`transition-colors ${
                      c.activo ? 'hover:bg-slate-50/80' : 'bg-slate-50 opacity-60'
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <UserCheck className="w-3.5 h-3.5 text-[#1E60A8]" />
                        <span>{c.nombreCompleto}</span>
                      </div>
                      {c.cargo && (
                        <div className="text-[11px] text-slate-500 mt-0.5">{c.cargo}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700">
                      <span className="inline-flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{c.email}</span>
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-800">{c.empresa}</td>
                    <td className="py-3.5 px-4">
                      {c.centroCosto ? (
                        <span className="font-semibold text-[#132B63]">{c.centroCosto}</span>
                      ) : (
                        <span className="text-amber-700 italic">Sin asignar</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700">{c.monedaBase}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`font-semibold ${
                          c.activo ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {permissions.isAdmin && (
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditConsultorModal(c)}
                            title="Editar consultor"
                            className="p-1.5 text-slate-500 hover:text-[#1E60A8] hover:bg-slate-100 rounded-lg cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteConsultor(c.id)}
                            title="Eliminar consultor"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Consultant Create / Edit Modal (Admin only) */}
      {isConsultorModalOpen && permissions.isAdmin && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setIsConsultorModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#132B63] text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingConsultorId ? 'Editar Consultor' : 'Nuevo Consultor Liquidador'}
              </h3>
              <button
                type="button"
                onClick={() => setIsConsultorModalOpen(false)}
                className="p-1 text-blue-200 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveConsultor} className="p-5 space-y-3.5">
              {cError && (
                <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs">
                  {cError}
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={cNombre}
                  onChange={(e) => setCNombre(e.target.value)}
                  placeholder="Ej. Elder Juarez Hernandez"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Correo Corporativo (nombre.apellido@dominio) *
                </label>
                <input
                  type="email"
                  required
                  value={cEmail}
                  onChange={(e) => setCEmail(e.target.value)}
                  placeholder="elder.juarez@premexcorp.com"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Empresa / Sociedad (BD Viáticos)
                  </label>
                  <input
                    type="text"
                    list="viaticos-module-companies-list"
                    value={cEmpresa}
                    onChange={(e) => setCEmpresa(e.target.value)}
                    placeholder="Premex Corp"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                  />
                  <datalist id="viaticos-module-companies-list">
                    {moduleCompanies.map((comp) => (
                      <option key={comp.id} value={comp.nombre}>
                        {comp.codigo ? `${comp.codigo} · ` : ''}
                        {comp.pais || ''}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Moneda Base
                  </label>
                  <select
                    value={cMoneda}
                    onChange={(e) => setCMoneda(e.target.value as ViaticoCurrency)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    {VIATICO_CURRENCIES.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Centro de Costo (se carga automáticamente en Contabilidad / Odoo)
                </label>
                <input
                  type="text"
                  list="viaticos-cost-centers-list"
                  value={cCentroCosto}
                  onChange={(e) => setCCentroCosto(e.target.value)}
                  placeholder="Ej. CC-201 Comercial Guatemala"
                  className="w-full px-3 py-2 text-xs font-semibold text-[#132B63] rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
                <datalist id="viaticos-cost-centers-list">
                  {existingCostCenters.map((cc) => (
                    <option key={cc} value={cc} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Cargo / Área
                </label>
                <input
                  type="text"
                  value={cCargo}
                  onChange={(e) => setCCargo(e.target.value)}
                  placeholder="Ej. Consultor Técnico Comercial"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={cActivo}
                  onChange={(e) => setCActivo(e.target.checked)}
                  className="rounded border-slate-300 text-[#1E60A8]"
                />
                <span>Consultor activo disponible en el listado</span>
              </label>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsConsultorModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Consultor</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
