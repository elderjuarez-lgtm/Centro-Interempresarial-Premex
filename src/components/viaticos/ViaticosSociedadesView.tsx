import React, { useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  Trash2,
  Check,
  X,
  Lock,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { EffectivePermissions, ModuleCompanyEntry } from '../../types';
import { normalizeCompanyKey } from '../../utils/permissions';
import { sanitizeModuleCompanyEntry } from '../../utils/moduleCompanies';
import { VIATICO_CURRENCIES } from '../../utils/viaticos';

interface ViaticosSociedadesViewProps {
  visibleCompanies: ModuleCompanyEntry[];
  allCatalogCompanies: ModuleCompanyEntry[];
  permissions: EffectivePermissions;
  onSaveModuleCompanies?: (nextCompanies: ModuleCompanyEntry[]) => Promise<void>;
  onNotify: (type: 'success' | 'info' | 'error', message: string) => void;
}

export const ViaticosSociedadesView: React.FC<ViaticosSociedadesViewProps> = ({
  visibleCompanies,
  allCatalogCompanies,
  permissions,
  onSaveModuleCompanies,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [newCodigo, setNewCodigo] = useState('');
  const [newNit, setNewNit] = useState('');
  const [newPais, setNewPais] = useState('Guatemala');
  const [newMoneda, setNewMoneda] = useState('Quetzales');
  const [isSaving, setIsSaving] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  const isRestrictedScope =
    !permissions.isAdmin && permissions.getModuleCompanyScope('viaticos') === 'selected';
  const canEditCatalog = permissions.canOperate && Boolean(onSaveModuleCompanies);

  const filteredCompanies = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleCompanies;
    return visibleCompanies.filter((c) =>
      [c.nombre, c.codigo || '', c.nit || '', c.pais || '', c.moneda || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [visibleCompanies, searchQuery]);

  const resetAddForm = () => {
    setNewNombre('');
    setNewCodigo('');
    setNewNit('');
    setNewPais('Guatemala');
    setNewMoneda('Quetzales');
    setIsAddOpen(false);
  };

  const handleAddSociety = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditCatalog || !onSaveModuleCompanies) return;
    const cleanName = newNombre.trim();
    if (!cleanName) {
      onNotify('error', 'Ingresa el nombre de la sociedad.');
      return;
    }

    const targetKey = normalizeCompanyKey(cleanName);
    const existing = allCatalogCompanies.find(
      (c) => normalizeCompanyKey(c.nombre) === targetKey
    );
    if (existing && existing.activo !== false) {
      onNotify('info', `La sociedad "${existing.nombre}" ya existe en el catálogo de Viáticos.`);
      return;
    }

    setIsSaving(true);
    try {
      let nextList: ModuleCompanyEntry[];
      if (existing) {
        nextList = allCatalogCompanies.map((c) =>
          normalizeCompanyKey(c.nombre) === targetKey
            ? sanitizeModuleCompanyEntry(
                {
                  ...c,
                  nombre: cleanName,
                  codigo: newCodigo.trim() || c.codigo,
                  nit: newNit.trim() || c.nit,
                  pais: newPais.trim() || c.pais,
                  moneda: newMoneda.trim() || c.moneda,
                  activo: true,
                },
                0
              )
            : c
        );
      } else {
        const newEntry = sanitizeModuleCompanyEntry(
          {
            id: `viaticos-comp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            nombre: cleanName,
            codigo: newCodigo.trim() || undefined,
            nit: newNit.trim() || undefined,
            pais: newPais.trim() || undefined,
            moneda: newMoneda.trim() || 'Quetzales',
            activo: true,
          },
          allCatalogCompanies.length
        );
        nextList = [...allCatalogCompanies, newEntry];
      }

      await onSaveModuleCompanies(nextList);
      resetAddForm();

      if (isRestrictedScope && !permissions.isCompanyAllowed(cleanName, 'viaticos')) {
        onNotify(
          'info',
          `Sociedad "${cleanName}" guardada en el catálogo. Un administrador debe asignarla en Permisos para que aparezca en tu lista.`
        );
      } else {
        onNotify('success', `Sociedad "${cleanName}" agregada y sincronizada en la nube.`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo agregar la sociedad.';
      onNotify('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveSociety = async (company: ModuleCompanyEntry) => {
    if (!canEditCatalog || !onSaveModuleCompanies) return;
    setIsSaving(true);
    try {
      const targetKey = normalizeCompanyKey(company.nombre);
      const nextList = allCatalogCompanies.filter(
        (c) => normalizeCompanyKey(c.nombre) !== targetKey && c.id !== company.id
      );
      await onSaveModuleCompanies(nextList);
      setConfirmRemoveId(null);
      onNotify('success', `Sociedad "${company.nombre}" quitada del módulo de Viáticos.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'No se pudo quitar la sociedad.';
      onNotify('error', msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Scope Strip */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#1E60A8] shrink-0" />
              <h2 className="text-base font-bold text-[#132B63] truncate">
                Sociedades Asignadas · Liquidación de Viáticos
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isRestrictedScope
                ? 'Se muestran únicamente las sociedades asignadas a tu usuario desde Permisos.'
                : 'Tienes acceso a todas las sociedades activas configuradas para Viáticos.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>
                {isRestrictedScope
                  ? `Permisos: ${visibleCompanies.length} asignada${visibleCompanies.length === 1 ? '' : 's'}`
                  : `Todas (${visibleCompanies.length})`}
              </span>
            </div>

            {canEditCatalog ? (
              <button
                type="button"
                onClick={() => setIsAddOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Sociedad</span>
              </button>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-500 whitespace-nowrap">
                <Lock className="w-3.5 h-3.5" />
                <span>Solo lectura</span>
              </div>
            )}
          </div>
        </div>

        {/* Inline Add Society Form */}
        {isAddOpen && canEditCatalog && (
          <form
            onSubmit={handleAddSociety}
            className="px-4 sm:px-6 py-4 bg-[#F7F9FC] border-b border-slate-200/80 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#132B63]">
                Nueva Sociedad en Viáticos
              </span>
              <button
                type="button"
                onClick={resetAddForm}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
              <div className="lg:col-span-4">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Nombre de Sociedad *
                </label>
                <input
                  type="text"
                  required
                  value={newNombre}
                  onChange={(e) => setNewNombre(e.target.value)}
                  placeholder="Ej. Premex S.A. / Anitox Guatemala"
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Código
                </label>
                <input
                  type="text"
                  value={newCodigo}
                  onChange={(e) => setNewCodigo(e.target.value)}
                  placeholder="Ej. PMX-GT"
                  className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  NIT / Tax ID
                </label>
                <input
                  type="text"
                  value={newNit}
                  onChange={(e) => setNewNit(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 text-xs font-mono text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  País
                </label>
                <input
                  type="text"
                  value={newPais}
                  onChange={(e) => setNewPais(e.target.value)}
                  placeholder="Guatemala"
                  className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              </div>

              <div className="lg:col-span-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Moneda
                </label>
                <select
                  value={newMoneda}
                  onChange={(e) => setNewMoneda(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                >
                  {VIATICO_CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving || !newNombre.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
              >
                {isSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Guardar Sociedad</span>
              </button>
            </div>
          </form>
        )}

        {/* Search Filter */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50/70 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar sociedad por nombre, código, NIT o país..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/25 focus:border-[#1E60A8]"
            />
          </div>
          <div className="text-xs text-slate-500 tabular-nums">
            Mostrando <strong className="text-slate-900">{filteredCompanies.length}</strong> de{' '}
            <strong className="text-slate-900">{visibleCompanies.length}</strong> sociedades permitidas
          </div>
        </div>

        {/* Societies Table */}
        {filteredCompanies.length === 0 ? (
          <div className="px-6 py-12 text-center space-y-2">
            <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Building2 className="w-5 h-5" />
            </div>
            <div className="text-sm font-bold text-slate-800">
              {visibleCompanies.length === 0
                ? 'No tienes sociedades asignadas en Permisos'
                : 'Ninguna sociedad coincide con tu búsqueda'}
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {visibleCompanies.length === 0
                ? 'Solicita a un administrador que te asigne sociedades en Ajustes -> Permisos o agrega una nueva sociedad si tienes permisos de edición.'
                : 'Prueba limpiando el filtro de búsqueda para ver todas tus sociedades asignadas.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 sm:px-6">Sociedad</th>
                  <th className="py-3 px-3">Código</th>
                  <th className="py-3 px-3">NIT / Tax ID</th>
                  <th className="py-3 px-3">País</th>
                  <th className="py-3 px-3">Moneda</th>
                  {canEditCatalog && <th className="py-3 px-4 sm:px-6 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map((comp) => {
                  const isConfirming = confirmRemoveId === comp.id;
                  return (
                    <tr key={comp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 sm:px-6 font-bold text-[#132B63]">
                        {comp.nombre}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {comp.codigo || '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600 tabular-nums">
                        {comp.nit || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-700">{comp.pais || '—'}</td>
                      <td className="py-3 px-3 font-medium text-slate-700">
                        {comp.moneda || 'Quetzales'}
                      </td>
                      {canEditCatalog && (
                        <td className="py-3 px-4 sm:px-6 text-right">
                          {isConfirming ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => void handleRemoveSociety(comp)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg cursor-pointer whitespace-nowrap"
                              >
                                <Check className="w-3 h-3" />
                                <span>Confirmar</span>
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => setConfirmRemoveId(null)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                              >
                                <X className="w-3 h-3" />
                                <span>Cancelar</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(comp.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200/80 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                              title={`Quitar ${comp.nombre} de Viáticos`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Quitar</span>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
