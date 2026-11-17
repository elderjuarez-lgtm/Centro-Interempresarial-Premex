import React, { useState, useMemo } from 'react';
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
  VIATICO_CURRENCIES,
  formatViaticoAmount,
} from '../../utils/viaticos';
import { normalizeEmail } from '../../utils/permissions';

interface ViaticosHistorialViewProps {
  liquidaciones: ViaticoLiquidation[];
  consultores: ViaticoConsultor[];
  moduleCompanies?: ModuleCompanyEntry[];
  activeLiquidationId: string;
  permissions: EffectivePermissions;
  isLockedToOwnConsultor: boolean;
  onOpenLiquidation: (id: string) => void;
  onCreateNewLiquidation: () => void;
  onDeleteLiquidation: (id: string) => void;
  onDownloadExcel: (liq: ViaticoLiquidation) => void;
  onDownloadPdf: (liq: ViaticoLiquidation) => void;
  onOpenCloseEmailFor: (liq: ViaticoLiquidation) => void;
  onUpsertConsultor: (consultor: ViaticoConsultor) => void;
  onDeleteConsultor: (consultorId: string) => void;
}

export const ViaticosHistorialView: React.FC<ViaticosHistorialViewProps> = ({
  liquidaciones,
  consultores,
  moduleCompanies = [],
  activeLiquidationId,
  permissions,
  isLockedToOwnConsultor,
  onOpenLiquidation,
  onCreateNewLiquidation,
  onDeleteLiquidation,
  onDownloadExcel,
  onDownloadPdf,
  onOpenCloseEmailFor,
  onUpsertConsultor,
  onDeleteConsultor,
}) => {
  const [subTab, setSubTab] = useState<'liquidaciones' | 'consultores'>('liquidaciones');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ViaticoLiquidationStatus>('ALL');
  const [confirmDeleteLiqId, setConfirmDeleteLiqId] = useState<string | null>(null);

  // Consultant CRUD modal state (Admins only)
  const [isConsultorModalOpen, setIsConsultorModalOpen] = useState(false);
  const [editingConsultorId, setEditingConsultorId] = useState<string | null>(null);
  const [cNombre, setCNombre] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cEmpresa, setCEmpresa] = useState('Premex Corp');
  const [cCargo, setCCargo] = useState('Consultor Comercial');
  const [cMoneda, setCMoneda] = useState<ViaticoCurrency>('Quetzales');
  const [cActivo, setCActivo] = useState(true);
  const [cError, setCError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const borradores = liquidaciones.filter((l) => l.estado === 'borrador').length;
    const cerradas = liquidaciones.filter((l) => l.estado === 'cerrada').length;
    const enviadas = liquidaciones.filter((l) => l.estado === 'enviada').length;
    const totalFacturas = liquidaciones.reduce((sum, l) => sum + l.items.length, 0);
    return {
      total: liquidaciones.length,
      borradores,
      cerradas,
      enviadas,
      totalFacturas,
    };
  }, [liquidaciones]);

  const filteredLiquidaciones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return liquidaciones.filter((l) => {
      if (statusFilter !== 'ALL' && l.estado !== statusFilter) return false;
      if (!q) return true;
      return (
        l.lineaLiquidacion.toLowerCase().includes(q) ||
        l.consultorNombre.toLowerCase().includes(q) ||
        l.consultorEmail.toLowerCase().includes(q) ||
        l.semana.toLowerCase().includes(q) ||
        l.empresa.toLowerCase().includes(q)
      );
    });
  }, [liquidaciones, searchQuery, statusFilter]);

  const openNewConsultorModal = () => {
    setEditingConsultorId(null);
    setCNombre('');
    setCEmail('');
    setCEmpresa(moduleCompanies[0]?.nombre || 'Premex Corp');
    setCCargo('Consultor Comercial');
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
      monedaBase: cMoneda,
      activo: cActivo,
    });
    setIsConsultorModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
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
            Borradores Activos
          </div>
          <div className="mt-1.5 text-2xl font-bold text-amber-700 font-mono tabular-nums">
            {stats.borradores}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">Pendientes de cierre</div>
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

      {/* Sub-navigation Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-3.5 flex flex-wrap items-center justify-between gap-3">
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
            Historial de Liquidaciones ({liquidaciones.length})
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

        {subTab === 'liquidaciones' ? (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar semana, línea o consultor..."
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

            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | ViaticoLiquidationStatus)
              }
              className="text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5"
            >
              <option value="ALL">Todos los estados</option>
              <option value="borrador">Borradores</option>
              <option value="cerrada">Cerradas</option>
              <option value="enviada">Enviadas</option>
            </select>

            {permissions.canOperate && (
              <button
                type="button"
                onClick={onCreateNewLiquidation}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Consultor</span>
            </button>
          )
        )}
      </div>

      {/* SUB-TAB 1: LIQUIDACIONES TABLE */}
      {subTab === 'liquidaciones' && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Semana / Línea de Liquidación</th>
                  <th className="py-3 px-4">Consultor</th>
                  <th className="py-3 px-4 text-center">Facturas</th>
                  <th className="py-3 px-4 text-right">Total Reintegrar</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLiquidaciones.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-500">
                      No se encontraron liquidaciones con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filteredLiquidaciones.map((liq) => {
                    const isActive = liq.id === activeLiquidationId;
                    return (
                      <tr
                        key={liq.id}
                        className={`transition-colors ${
                          isActive ? 'bg-sky-50/60' : 'hover:bg-slate-50/80'
                        }`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-2">
                            <span>{liq.lineaLiquidacion || 'Sin título'}</span>
                            {isActive && (
                              <span className="text-[10px] font-bold text-[#1E60A8]">
                                · Activa
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                            Semana #{liq.semana || '-'} · {liq.empresa} · Actualizado{' '}
                            {new Date(liq.updatedAtIso).toLocaleDateString('es-GT')}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800">
                            {liq.consultorNombre}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {liq.consultorEmail || 'Sin correo'}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono tabular-nums text-slate-700">
                          {liq.items.length}
                        </td>

                        <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-[#132B63]">
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
                                ? 'Enviada'
                                : liq.estado === 'cerrada'
                                ? 'Cerrada'
                                : 'Borrador'}
                            </span>
                          </div>
                          {liq.sentToEmail && (
                            <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
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
                              <span>Abrir</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onDownloadExcel(liq)}
                              title="Descargar Excel Premex"
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onDownloadPdf(liq)}
                              title="Descargar PDF con comprobantes"
                              className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                            >
                              <FileText className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenCloseEmailFor(liq)}
                              title="Cerrar y enviar por correo"
                              className="p-1.5 text-[#132B63] hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              <Send className="w-4 h-4" />
                            </button>

                            {permissions.canOperate &&
                              (liq.estado === 'borrador' || permissions.isAdmin) &&
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

      {/* SUB-TAB 2: CONSULTORES CATALOG */}
      {subTab === 'consultores' && (
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
