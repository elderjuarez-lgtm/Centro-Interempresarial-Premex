import React, { useMemo, useState } from 'react';
import {
  Check,
  Database,
  FileCode2,
  GitBranch,
  Layers,
  Link2,
  Percent,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import {
  EffectivePermissions,
  OdooCostCenterEntry,
  OdooDistributionMode,
  OdooDistributionNature,
  OdooDocTypeEntry,
  OdooEmployeeEntry,
  OdooExpenseCodeEntry,
  OdooExpenseDistributionEntry,
  OdooExpenseType,
  OdooTaxIndicatorEntry,
  UserPermissionRecord,
  ViaticoCategory,
  ViaticoOdooCatalogs,
} from '../../types';
import { VIATICO_CATEGORIES } from '../../utils/viaticos';
import {
  createDefaultOdooCatalogs,
  extractAnalyticIdFromJson,
  findMatchingCostCenterEntry,
  formatAnalyticDistributionJson,
  resolveDistributionTaxIndicator,
} from '../../utils/viaticosOdooCatalogs';
import { normalizeEmail } from '../../utils/permissions';

interface ViaticosOdooCatalogsPanelProps {
  catalogs: ViaticoOdooCatalogs;
  permissionRecords: UserPermissionRecord[];
  permissions: EffectivePermissions;
  currentUserEmail: string;
  currentUserName: string;
  onSaveOdooCatalogs: (
    nextCatalogs: ViaticoOdooCatalogs,
    toastMessage?: string
  ) => void;
  onUpsertPermissionRecord?: (record: UserPermissionRecord) => Promise<void>;
  onNotify: (type: 'success' | 'info' | 'error', message: string) => void;
}

type CatalogSection =
  | 'employees'
  | 'costCenters'
  | 'expenseCodes'
  | 'docTypes'
  | 'taxIndicators'
  | 'expenseDistributions';

export const ViaticosOdooCatalogsPanel: React.FC<ViaticosOdooCatalogsPanelProps> = ({
  catalogs,
  permissionRecords,
  permissions,
  currentUserEmail,
  currentUserName,
  onSaveOdooCatalogs,
  onUpsertPermissionRecord,
  onNotify,
}) => {
  const [section, setSection] = useState<CatalogSection>('employees');
  const [query, setQuery] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Editing row ID across sections
  const [editingId, setEditingId] = useState<string | null>(null);

  // Employee form state
  const [empNombre, setEmpNombre] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empEmpresa, setEmpEmpresa] = useState('Premex Corp');
  const [empCentroCosto, setEmpCentroCosto] = useState('');
  const [empAnalytic, setEmpAnalytic] = useState('');
  const [syncToPermOnSave, setSyncToPermOnSave] = useState(true);

  // Cost Center form state
  const [ccCodigo, setCcCodigo] = useState('');
  const [ccCuentaAnalitica, setCcCuentaAnalitica] = useState('');
  const [ccOdooId, setCcOdooId] = useState('');

  // Expense Code form state
  const [expCodigo, setExpCodigo] = useState('');
  const [expNombre, setExpNombre] = useState('');
  const [expCat, setExpCat] = useState<ViaticoCategory | ''>('');

  // Doc Type form state
  const [docCodigo, setDocCodigo] = useState('');
  const [docNombre, setDocNombre] = useState('');
  const [docLabel, setDocLabel] = useState('');

  // Tax Indicator form state
  const [taxCodigo, setTaxCodigo] = useState('');
  const [taxNombre, setTaxNombre] = useState('');
  const [taxValidez, setTaxValidez] = useState('Guatemala');
  const [taxEtiqueta, setTaxEtiqueta] = useState('');
  const [taxTipo, setTaxTipo] = useState('Compras');
  const [taxPorcentaje, setTaxPorcentaje] = useState('12');

  // Expense Distribution form state
  const [distCodigo, setDistCodigo] = useState('');
  const [distNombre, setDistNombre] = useState('');
  const [distMode, setDistMode] = useState<OdooDistributionMode>('extra_charge');
  const [distNaturaleza, setDistNaturaleza] = useState<OdooDistributionNature>('servicio');
  const [distExpenseCode, setDistExpenseCode] = useState('');
  const [distTaxIndicator, setDistTaxIndicator] = useState('');

  const stampFields = () => ({
    updatedByEmail: normalizeEmail(currentUserEmail || permissions.email || '') || undefined,
    updatedByName: (currentUserName || permissions.displayName || '').trim() || undefined,
    updatedAtIso: new Date().toISOString(),
  });

  const resetForms = () => {
    setIsAdding(false);
    setEditingId(null);
    setEmpNombre('');
    setEmpEmail('');
    setEmpEmpresa('Premex Corp');
    setEmpCentroCosto('');
    setEmpAnalytic('');
    setCcCodigo('');
    setCcCuentaAnalitica('');
    setCcOdooId('');
    setExpCodigo('');
    setExpNombre('');
    setExpCat('');
    setDocCodigo('');
    setDocNombre('');
    setDocLabel('');
    setTaxCodigo('');
    setTaxNombre('');
    setTaxValidez('Guatemala');
    setTaxEtiqueta('');
    setTaxTipo('Compras');
    setTaxPorcentaje('12');
    setDistCodigo('');
    setDistNombre('');
    setDistMode('extra_charge');
    setDistNaturaleza('servicio');
    setDistExpenseCode('');
    setDistTaxIndicator('');
  };

  const normalizedQuery = query.trim().toLowerCase();

  const filteredEmployees = useMemo(() => {
    if (!normalizedQuery) return catalogs.employees;
    return catalogs.employees.filter(
      (e) =>
        e.nombreCompleto.toLowerCase().includes(normalizedQuery) ||
        (e.email || '').toLowerCase().includes(normalizedQuery) ||
        (e.centroCosto || '').toLowerCase().includes(normalizedQuery) ||
        (e.analyticDistribution || '').toLowerCase().includes(normalizedQuery)
    );
  }, [catalogs.employees, normalizedQuery]);

  const filteredCostCenters = useMemo(() => {
    if (!normalizedQuery) return catalogs.costCenters;
    return catalogs.costCenters.filter(
      (c) =>
        c.codigo.toLowerCase().includes(normalizedQuery) ||
        c.cuentaAnalitica.toLowerCase().includes(normalizedQuery) ||
        c.odooAnalyticId.toLowerCase().includes(normalizedQuery) ||
        c.analyticDistribution.toLowerCase().includes(normalizedQuery)
    );
  }, [catalogs.costCenters, normalizedQuery]);

  const filteredExpenseCodes = useMemo(() => {
    if (!normalizedQuery) return catalogs.expenseCodes;
    return catalogs.expenseCodes.filter(
      (c) =>
        c.codigo.toLowerCase().includes(normalizedQuery) ||
        c.nombre.toLowerCase().includes(normalizedQuery) ||
        c.labelOdoo.toLowerCase().includes(normalizedQuery) ||
        (c.categoriaVinculada || '').toLowerCase().includes(normalizedQuery)
    );
  }, [catalogs.expenseCodes, normalizedQuery]);

  const filteredDocTypes = useMemo(() => {
    if (!normalizedQuery) return catalogs.docTypes;
    return catalogs.docTypes.filter(
      (d) =>
        d.codigo.toLowerCase().includes(normalizedQuery) ||
        d.nombre.toLowerCase().includes(normalizedQuery) ||
        d.labelOdoo.toLowerCase().includes(normalizedQuery)
    );
  }, [catalogs.docTypes, normalizedQuery]);

  const filteredTaxIndicators = useMemo(() => {
    if (!normalizedQuery) return catalogs.taxIndicators;
    return catalogs.taxIndicators.filter(
      (t) =>
        t.codigo.toLowerCase().includes(normalizedQuery) ||
        t.nombreImpuesto.toLowerCase().includes(normalizedQuery) ||
        t.etiquetaFactura.toLowerCase().includes(normalizedQuery)
    );
  }, [catalogs.taxIndicators, normalizedQuery]);

  const filteredDistributions = useMemo(() => {
    const list = catalogs.expenseDistributions || [];
    if (!normalizedQuery) return list;
    return list.filter(
      (d) =>
        d.codigo.toLowerCase().includes(normalizedQuery) ||
        d.nombre.toLowerCase().includes(normalizedQuery) ||
        d.expenseCodeLabel.toLowerCase().includes(normalizedQuery) ||
        d.taxIndicatorName.toLowerCase().includes(normalizedQuery)
    );
  }, [catalogs.expenseDistributions, normalizedQuery]);

  const permissionByEmailMap = useMemo(() => {
    const map = new Map<string, UserPermissionRecord>();
    permissionRecords.forEach((p) => {
      const clean = normalizeEmail(p.email);
      if (clean) map.set(clean, p);
    });
    return map;
  }, [permissionRecords]);

  // ============================================================================
  // Handlers per Catalog
  // ============================================================================

  const startEditEmployee = (emp: OdooEmployeeEntry) => {
    setSection('employees');
    setIsAdding(true);
    setEditingId(emp.id);
    setEmpNombre(emp.nombreCompleto);
    setEmpEmail(emp.email || '');
    setEmpEmpresa(emp.empresa || 'Premex Corp');
    setEmpCentroCosto(emp.centroCosto || '');
    setEmpAnalytic(emp.analyticDistribution || '');
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = empNombre.trim().toUpperCase();
    if (!cleanName) return;

    const cleanEmail = normalizeEmail(empEmail);
    const matchedPerm = cleanEmail ? permissionByEmailMap.get(cleanEmail) : undefined;
    const matchedCC = findMatchingCostCenterEntry(
      empCentroCosto,
      empAnalytic,
      catalogs.costCenters
    );
    const finalCC = matchedCC?.cuentaAnalitica || empCentroCosto.trim();
    const finalAnalytic =
      formatAnalyticDistributionJson(empAnalytic) ||
      matchedCC?.analyticDistribution ||
      '';

    const stamp = stampFields();
    const nextEntry: OdooEmployeeEntry = {
      id: editingId || `emp-custom-${Date.now().toString(36)}`,
      nombreCompleto: cleanName,
      email: cleanEmail || undefined,
      permissionDocId: matchedPerm?.id,
      empresa: empEmpresa.trim() || 'Premex Corp',
      centroCosto: finalCC || undefined,
      analyticDistribution: finalAnalytic || undefined,
      activo: true,
      ...stamp,
    };

    const exists = editingId && catalogs.employees.some((x) => x.id === editingId);
    const nextEmployees = exists
      ? catalogs.employees.map((x) => (x.id === editingId ? nextEntry : x))
      : [nextEntry, ...catalogs.employees];

    onSaveOdooCatalogs(
      { ...catalogs, employees: nextEmployees },
      `Empleado Odoo "${cleanName}" guardado y vinculado.`
    );

    if (syncToPermOnSave && matchedPerm && onUpsertPermissionRecord) {
      try {
        await onUpsertPermissionRecord({
          ...matchedPerm,
          odooEmployeeName: cleanName,
          centroCosto: finalCC || matchedPerm.centroCosto,
          odooAnalyticDistribution: finalAnalytic || matchedPerm.odooAnalyticDistribution,
        });
      } catch (err: any) {
        onNotify('error', err?.message || 'Se guardó en viáticos, pero no se pudo actualizar Permisos.');
      }
    }

    resetForms();
  };

  const handleSyncSingleEmployeePermission = async (emp: OdooEmployeeEntry) => {
    if (!onUpsertPermissionRecord || !emp.email) return;
    const matchedPerm = permissionByEmailMap.get(normalizeEmail(emp.email));
    if (!matchedPerm) {
      onNotify(
        'info',
        `El correo ${emp.email} aún no existe en Ajustes → Permisos. Agrégalo primero en Permisos.`
      );
      return;
    }
    try {
      await onUpsertPermissionRecord({
        ...matchedPerm,
        odooEmployeeName: emp.nombreCompleto,
        centroCosto: emp.centroCosto || matchedPerm.centroCosto,
        odooAnalyticDistribution:
          emp.analyticDistribution || matchedPerm.odooAnalyticDistribution,
      });
      onNotify(
        'success',
        `Vínculo sincronizado en Permisos para ${matchedPerm.email} (${emp.nombreCompleto}).`
      );
    } catch (err: any) {
      onNotify('error', err?.message || 'Error al sincronizar permiso del usuario.');
    }
  };

  const handleSaveCostCenter = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = ccCodigo.trim().toUpperCase();
    const cleanAnalyticName = ccCuentaAnalitica.trim().toUpperCase();
    const rawId = ccOdooId.trim();
    if (!cleanAnalyticName && !cleanCode) return;

    const formattedJson = formatAnalyticDistributionJson(rawId);
    const extractedId = extractAnalyticIdFromJson(formattedJson) || rawId;
    const stamp = stampFields();

    const nextEntry: OdooCostCenterEntry = {
      id: editingId || `cc-custom-${Date.now().toString(36)}`,
      codigo: cleanCode || cleanAnalyticName.split(/\s+/)[0] || 'CC',
      cuentaAnalitica: cleanAnalyticName || cleanCode,
      odooAnalyticId: extractedId,
      analyticDistribution: formattedJson || (extractedId ? `{"${extractedId}": 100.0}` : ''),
      activo: true,
      ...stamp,
    };

    const exists = editingId && catalogs.costCenters.some((x) => x.id === editingId);
    const nextList = exists
      ? catalogs.costCenters.map((x) => (x.id === editingId ? nextEntry : x))
      : [nextEntry, ...catalogs.costCenters];

    onSaveOdooCatalogs(
      { ...catalogs, costCenters: nextList },
      `Centro de costo "${nextEntry.cuentaAnalitica}" guardado.`
    );
    resetForms();
  };

  const handleSaveExpenseCode = (e: React.FormEvent) => {
    e.preventDefault();
    const code = expCodigo.trim().toUpperCase();
    const name = expNombre.trim().toUpperCase();
    if (!code || !name) return;

    const stamp = stampFields();
    const nextEntry: OdooExpenseCodeEntry = {
      id: editingId || `exp-custom-${Date.now().toString(36)}`,
      codigo: code,
      nombre: name,
      labelOdoo: `${code} ${name}`.trim(),
      categoriaVinculada: expCat || undefined,
      activo: true,
      ...stamp,
    };

    const exists = editingId && catalogs.expenseCodes.some((x) => x.id === editingId);
    const nextList = exists
      ? catalogs.expenseCodes.map((x) => (x.id === editingId ? nextEntry : x))
      : [nextEntry, ...catalogs.expenseCodes];

    onSaveOdooCatalogs(
      { ...catalogs, expenseCodes: nextList },
      `Código de gasto "${nextEntry.labelOdoo}" guardado.`
    );
    resetForms();
  };

  const handleSaveDocType = (e: React.FormEvent) => {
    e.preventDefault();
    const code = docCodigo.trim().toUpperCase();
    const name = docNombre.trim();
    if (!code || !name) return;

    const stamp = stampFields();
    const label = docLabel.trim() || `${code} - ${name}`;
    const nextEntry: OdooDocTypeEntry = {
      id: editingId || `doc-custom-${Date.now().toString(36)}`,
      codigo: code,
      nombre: name,
      labelOdoo: label,
      activo: true,
      ...stamp,
    };

    const exists = editingId && catalogs.docTypes.some((x) => x.id === editingId);
    const nextList = exists
      ? catalogs.docTypes.map((x) => (x.id === editingId ? nextEntry : x))
      : [nextEntry, ...catalogs.docTypes];

    onSaveOdooCatalogs(
      { ...catalogs, docTypes: nextList },
      `Tipo de documento "${nextEntry.labelOdoo}" guardado.`
    );
    resetForms();
  };

  const handleSaveTaxIndicator = (e: React.FormEvent) => {
    e.preventDefault();
    const code = taxCodigo.trim().toUpperCase();
    const name = taxNombre.trim();
    if (!code || !name) return;

    const stamp = stampFields();
    const nextEntry: OdooTaxIndicatorEntry = {
      id: editingId || `tax-custom-${Date.now().toString(36)}`,
      codigo: code,
      nombreImpuesto: name,
      validezFiscal: taxValidez.trim() || 'Guatemala',
      etiquetaFactura: taxEtiqueta.trim() || 'IVA',
      tipoImpuesto: taxTipo.trim() || 'Compras',
      porcentaje: Number(taxPorcentaje) || 0,
      activo: true,
      ...stamp,
    };

    const exists = editingId && catalogs.taxIndicators.some((x) => x.id === editingId);
    const nextList = exists
      ? catalogs.taxIndicators.map((x) => (x.id === editingId ? nextEntry : x))
      : [nextEntry, ...catalogs.taxIndicators];

    onSaveOdooCatalogs(
      { ...catalogs, taxIndicators: nextList },
      `Indicador de impuesto "${nextEntry.codigo}" guardado.`
    );
    resetForms();
  };

  const handleSaveDistribution = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = distNombre.trim();
    const cleanCode = (distCodigo.trim() || cleanName.replace(/\s+/g, '_')).toUpperCase();
    if (!cleanName) return;

    const stamp = stampFields();
    const resolvedTax =
      distMode === 'multi_ceco'
        ? ''
        : resolveDistributionTaxIndicator(
            distNaturaleza,
            catalogs,
            distTaxIndicator.trim() || undefined
          );

    const nextEntry: OdooExpenseDistributionEntry = {
      id: editingId || `dist-custom-${Date.now().toString(36)}`,
      codigo: cleanCode,
      nombre: cleanName,
      mode: distMode,
      naturaleza: distNaturaleza,
      expenseCodeLabel: distMode === 'multi_ceco' ? '' : distExpenseCode.trim(),
      taxIndicatorName: resolvedTax,
      activo: true,
      isCustom: !editingId?.startsWith('dist-') || editingId?.startsWith('dist-custom-'),
      ...stamp,
    };

    const currentList = catalogs.expenseDistributions || [];
    const exists = editingId && currentList.some((x) => x.id === editingId);
    const nextList = exists
      ? currentList.map((x) => (x.id === editingId ? nextEntry : x))
      : [...currentList, nextEntry];

    onSaveOdooCatalogs(
      { ...catalogs, expenseDistributions: nextList },
      `Opción de distribución "${nextEntry.nombre}" guardada y vinculada.`
    );
    resetForms();
  };

  const toggleActive = (
    key:
      | 'employees'
      | 'costCenters'
      | 'expenseCodes'
      | 'docTypes'
      | 'taxIndicators'
      | 'expenseDistributions',
    id: string
  ) => {
    if (!permissions.canOperate) return;
    const stamp = stampFields();
    const list = (catalogs[key] || []) as Array<{ id: string; activo: boolean }>;
    const updated = list.map((item) =>
      item.id === id ? { ...item, activo: !item.activo, ...stamp } : item
    );
    onSaveOdooCatalogs({ ...catalogs, [key]: updated } as ViaticoOdooCatalogs);
  };

  const deleteEntry = (
    key:
      | 'employees'
      | 'costCenters'
      | 'expenseCodes'
      | 'docTypes'
      | 'taxIndicators'
      | 'expenseDistributions',
    id: string
  ) => {
    if (!permissions.canOperate) return;
    const list = (catalogs[key] || []) as Array<{ id: string }>;
    const updated = list.filter((item) => item.id !== id);
    onSaveOdooCatalogs(
      { ...catalogs, [key]: updated } as ViaticoOdooCatalogs,
      'Registro eliminado de la base de datos Odoo.'
    );
  };

  const handleRestoreDefaults = () => {
    if (!permissions.isAdmin) return;
    const defaults = createDefaultOdooCatalogs();
    onSaveOdooCatalogs(
      defaults,
      'Catálogos Odoo restaurados desde la plantilla GT S-44.'
    );
    resetForms();
  };

  return (
    <div className="space-y-4">
      {/* Header + Global Journal & Expense Type Defaults */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#1E60A8] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>Bases de Datos Maestras Odoo · Plantilla GT S-44</span>
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-0.5">
              Catálogos vinculados a Usuarios, Permisos y Documentos
            </h3>
            {catalogs.updatedByName && (
              <p className="text-[11px] text-slate-500 mt-0.5">
                Última edición por{' '}
                <strong className="text-slate-700">{catalogs.updatedByName}</strong> (
                {catalogs.updatedByEmail})
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permissions.isAdmin && (
              <button
                type="button"
                onClick={handleRestoreDefaults}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restaurar Base GT S-44</span>
              </button>
            )}
            {permissions.canOperate && (
              <button
                type="button"
                onClick={() => {
                  if (isAdding) {
                    resetForms();
                  } else {
                    setEditingId(null);
                    setIsAdding(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
              >
                {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{isAdding ? 'Cerrar Formulario' : 'Agregar Registro'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Odoo Sheet 1 defaults */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Diario por Defecto (Journal)
            </label>
            <input
              type="text"
              disabled={!permissions.canOperate}
              value={catalogs.defaultJournalName}
              onChange={(e) =>
                onSaveOdooCatalogs({
                  ...catalogs,
                  defaultJournalName: e.target.value,
                })
              }
              placeholder="PROV. CAJAS CHICAS"
              className="w-full min-h-[40px] lg:min-h-0 px-3 py-1.5 text-sm lg:text-xs font-semibold rounded-xl border border-slate-300 bg-white disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Tipo Gasto por Defecto (expense_type)
            </label>
            <select
              disabled={!permissions.canOperate}
              value={catalogs.defaultExpenseType}
              onChange={(e) =>
                onSaveOdooCatalogs({
                  ...catalogs,
                  defaultExpenseType: e.target.value as OdooExpenseType,
                })
              }
              className="w-full min-h-[40px] lg:min-h-0 px-3 py-1.5 text-sm lg:text-xs font-semibold rounded-xl border border-slate-300 bg-white disabled:bg-slate-50"
            >
              <option value="Gasto">Gasto</option>
              <option value="Tarjeta">Tarjeta</option>
            </select>
          </div>

          <div className="flex items-end">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en el catálogo activo..."
                className="w-full min-h-[40px] lg:min-h-0 pl-8 pr-8 py-1.5 text-sm lg:text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 5 Catalog Navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {[
            {
              id: 'employees' as CatalogSection,
              label: `Empleados ↔ Permisos (${catalogs.employees.length})`,
              icon: Users,
            },
            {
              id: 'costCenters' as CatalogSection,
              label: `Centros de Costo (${catalogs.costCenters.length})`,
              icon: Layers,
            },
            {
              id: 'expenseCodes' as CatalogSection,
              label: `Códigos de Gasto (${catalogs.expenseCodes.length})`,
              icon: FileCode2,
            },
            {
              id: 'docTypes' as CatalogSection,
              label: `Tipos Documento (${catalogs.docTypes.length})`,
              icon: UserCheck,
            },
            {
              id: 'taxIndicators' as CatalogSection,
              label: `Impuestos (${catalogs.taxIndicators.length})`,
              icon: Percent,
            },
            {
              id: 'expenseDistributions' as CatalogSection,
              label: `Distribución Gastos (${(catalogs.expenseDistributions || []).length})`,
              icon: GitBranch,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setSection(tab.id);
                  setIsAdding(false);
                  setEditingId(null);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#132B63] text-white border-[#132B63]'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Add / Edit Inline Form */}
      {isAdding && permissions.canOperate && (
        <section className="bg-white rounded-2xl border-2 border-[#1E60A8]/30 p-4 sm:p-5">
          {section === 'employees' && (
            <form onSubmit={handleSaveEmployee} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                {editingId ? 'Editar Empleado Odoo y Vínculo' : 'Nuevo Empleado Odoo ↔ Permiso y Centro de Costo'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre Empleado Odoo (MAYÚSCULAS) *
                  </label>
                  <input
                    type="text"
                    required
                    value={empNombre}
                    onChange={(e) => setEmpNombre(e.target.value)}
                    placeholder="ELDER YOVANI JUAREZ HERNANDEZ"
                    className="w-full px-3 py-2 text-xs uppercase font-semibold rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Correo Usuario / Permiso
                  </label>
                  <input
                    type="email"
                    list="odoo-cat-permission-emails"
                    value={empEmail}
                    onChange={(e) => setEmpEmail(e.target.value)}
                    placeholder="correo@premexcorp.com"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
                  />
                  <datalist id="odoo-cat-permission-emails">
                    {permissionRecords.map((p) => (
                      <option key={p.id} value={p.email}>
                        {p.displayName || p.email} ({p.role})
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Centro de Costo
                  </label>
                  <input
                    type="text"
                    list="odoo-cat-cc-options"
                    value={empCentroCosto}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEmpCentroCosto(val);
                      const match = findMatchingCostCenterEntry(
                        val,
                        undefined,
                        catalogs.costCenters
                      );
                      if (match) setEmpAnalytic(match.analyticDistribution);
                    }}
                    placeholder="GT10000601 CONTABILIDAD"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                  <datalist id="odoo-cat-cc-options">
                    {catalogs.costCenters
                      .filter((c) => c.activo !== false)
                      .map((c) => (
                        <option key={c.id} value={c.cuentaAnalitica}>
                          {c.analyticDistribution}
                        </option>
                      ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    C.C. Interno Odoo (JSON)
                  </label>
                  <input
                    type="text"
                    value={empAnalytic}
                    onChange={(e) => setEmpAnalytic(e.target.value)}
                    placeholder='{"520": 100.0}'
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                {onUpsertPermissionRecord ? (
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncToPermOnSave}
                      onChange={(e) => setSyncToPermOnSave(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#1E60A8]"
                    />
                    <span>Sincronizar automáticamente en Permisos del usuario</span>
                  </label>
                ) : (
                  <span />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetForms}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Guardar Empleado</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {section === 'costCenters' && (
            <form onSubmit={handleSaveCostCenter} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                {editingId ? 'Editar Centro de Costo' : 'Nuevo Centro de Costo + ID Interno Odoo'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={ccCodigo}
                    onChange={(e) => setCcCodigo(e.target.value)}
                    placeholder="GT10000601"
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cuenta Analítica Completa *
                  </label>
                  <input
                    type="text"
                    required
                    value={ccCuentaAnalitica}
                    onChange={(e) => setCcCuentaAnalitica(e.target.value)}
                    placeholder="GT10000601 CONTABILIDAD"
                    className="w-full px-3 py-2 text-xs uppercase rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    ID Interno Odoo o JSON *
                  </label>
                  <input
                    type="text"
                    required
                    value={ccOdooId}
                    onChange={(e) => setCcOdooId(e.target.value)}
                    placeholder='520 o {"520": 100.0}'
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForms}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Centro de Costo</span>
                </button>
              </div>
            </form>
          )}

          {section === 'expenseCodes' && (
            <form onSubmit={handleSaveExpenseCode} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                {editingId ? 'Editar Código de Gasto' : 'Nuevo Código de Gasto Odoo (product_id)'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={expCodigo}
                    onChange={(e) => setExpCodigo(e.target.value)}
                    placeholder="720107"
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre / Descripción *
                  </label>
                  <input
                    type="text"
                    required
                    value={expNombre}
                    onChange={(e) => setExpNombre(e.target.value)}
                    placeholder="LICENCIAS-TRAMITES"
                    className="w-full px-3 py-2 text-xs uppercase rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Categoría Viáticos Vinculada
                  </label>
                  <select
                    value={expCat}
                    onChange={(e) => setExpCat(e.target.value as ViaticoCategory | '')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="">Sin categoría fija</option>
                    {VIATICO_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForms}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Código</span>
                </button>
              </div>
            </form>
          )}

          {section === 'docTypes' && (
            <form onSubmit={handleSaveDocType} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                {editingId ? 'Editar Tipo Documento' : 'Nuevo Tipo de Documento Odoo'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={docCodigo}
                    onChange={(e) => setDocCodigo(e.target.value)}
                    placeholder="FACT"
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={docNombre}
                    onChange={(e) => setDocNombre(e.target.value)}
                    placeholder="Factura Electrónica"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Etiqueta Odoo (Opcional)
                  </label>
                  <input
                    type="text"
                    value={docLabel}
                    onChange={(e) => setDocLabel(e.target.value)}
                    placeholder="FACT - Factura Electrónica"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForms}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Tipo</span>
                </button>
              </div>
            </form>
          )}

          {section === 'taxIndicators' && (
            <form onSubmit={handleSaveTaxIndicator} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                {editingId ? 'Editar Indicador de Impuesto' : 'Nuevo Indicador de Impuesto Odoo (tax_ids)'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={taxCodigo}
                    onChange={(e) => setTaxCodigo(e.target.value)}
                    placeholder="XA"
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-300"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre Impuesto Odoo *
                  </label>
                  <input
                    type="text"
                    required
                    value={taxNombre}
                    onChange={(e) => setTaxNombre(e.target.value)}
                    placeholder="XA - Iva CR Fiscal Compras Gravadas Locales 12%"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Etiqueta Factura
                  </label>
                  <input
                    type="text"
                    value={taxEtiqueta}
                    onChange={(e) => setTaxEtiqueta(e.target.value)}
                    placeholder="IVA 12%"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Validez Fiscal
                  </label>
                  <input
                    type="text"
                    value={taxValidez}
                    onChange={(e) => setTaxValidez(e.target.value)}
                    placeholder="Guatemala"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    % Tasa
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={taxPorcentaje}
                    onChange={(e) => setTaxPorcentaje(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForms}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Impuesto</span>
                </button>
              </div>
            </form>
          )}

          {section === 'expenseDistributions' && (
            <form onSubmit={handleSaveDistribution} className="space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                {editingId
                  ? 'Editar Opción de Distribución de Gasto'
                  : 'Nueva Opción de Distribución / Impuesto Interno (IDP, Intecap, Propina, Varios Cecos...)'}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={distCodigo}
                    onChange={(e) => setDistCodigo(e.target.value)}
                    placeholder="IDP"
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Nombre en Desplegable *
                  </label>
                  <input
                    type="text"
                    required
                    value={distNombre}
                    onChange={(e) => setDistNombre(e.target.value)}
                    placeholder="IDP / Intecap / Propina"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Comportamiento
                  </label>
                  <select
                    value={distMode}
                    onChange={(e) =>
                      setDistMode(e.target.value as OdooDistributionMode)
                    }
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="extra_charge">Impuesto / Cargo Adicional (Línea aparte)</option>
                    <option value="multi_ceco">Dividir entre Varios Cecos</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Tipo (Bien = XB / Servicio = XO)
                  </label>
                  <select
                    disabled={distMode === 'multi_ceco'}
                    value={distNaturaleza}
                    onChange={(e) => {
                      const nextNat = e.target.value as OdooDistributionNature;
                      setDistNaturaleza(nextNat);
                      setDistTaxIndicator(
                        resolveDistributionTaxIndicator(nextNat, catalogs)
                      );
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white disabled:bg-slate-50"
                  >
                    <option value="servicio">Servicio (Indicador XO)</option>
                    <option value="bien">Bien (Indicador XB)</option>
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Cuenta / Código de Gasto Odoo Vinculado
                  </label>
                  <select
                    disabled={distMode === 'multi_ceco'}
                    value={distExpenseCode}
                    onChange={(e) => setDistExpenseCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white disabled:bg-slate-50"
                  >
                    <option value="">
                      {distMode === 'multi_ceco'
                        ? 'Mantiene la cuenta del documento original'
                        : 'Seleccionar cuenta de gasto Odoo...'}
                    </option>
                    {catalogs.expenseCodes
                      .filter((c) => c.activo !== false)
                      .map((c) => (
                        <option key={c.id} value={c.labelOdoo}>
                          {c.labelOdoo}
                        </option>
                      ))}
                  </select>
                </div>
                {distMode === 'extra_charge' && (
                  <div className="sm:col-span-2 lg:col-span-6">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Indicador de Impuesto Asignado (XO servicio / XB bien)
                    </label>
                    <select
                      value={
                        distTaxIndicator ||
                        resolveDistributionTaxIndicator(distNaturaleza, catalogs)
                      }
                      onChange={(e) => setDistTaxIndicator(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                    >
                      {catalogs.taxIndicators
                        .filter((t) => t.activo !== false)
                        .map((t) => (
                          <option key={t.id} value={t.nombreImpuesto}>
                            {t.nombreImpuesto}
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForms}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Opción de Distribución</span>
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Active Catalog Table */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="overflow-x-auto">
          {section === 'employees' && (
            <table className="w-full text-left border-collapse text-xs min-w-[960px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Empleado Odoo (employee_id)</th>
                  <th className="py-3 px-3">Correo / Permiso</th>
                  <th className="py-3 px-3">Centro de Costo</th>
                  <th className="py-3 px-3">C.C. Interno Odoo</th>
                  <th className="py-3 px-3">Usuario Opera</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  {permissions.canOperate && (
                    <th className="py-3 px-4 text-right">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => {
                  const perm = emp.email
                    ? permissionByEmailMap.get(normalizeEmail(emp.email))
                    : undefined;
                  return (
                    <tr
                      key={emp.id}
                      className={emp.activo ? 'hover:bg-slate-50/80' : 'bg-slate-50 opacity-60'}
                    >
                      <td className="py-2.5 px-4 font-bold text-slate-900">
                        {emp.nombreCompleto}
                        {emp.empresa && (
                          <div className="text-[10px] font-normal text-slate-500">
                            {emp.empresa}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {emp.email ? (
                          <div>
                            <div className="font-mono text-slate-700">{emp.email}</div>
                            <div className="text-[10px] text-slate-500">
                              {perm ? `Permiso: ${perm.role}` : 'Sin ficha en Permisos'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Sin correo vinculado</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-[#132B63]">
                        {emp.centroCosto || <span className="text-amber-700 italic">Sin asignar</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[#1E60A8]">
                        {emp.analyticDistribution || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-500">
                        {emp.updatedByName || emp.updatedByEmail || 'Base GT S-44'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          disabled={!permissions.canOperate}
                          onClick={() => toggleActive('employees', emp.id)}
                          className={`text-[11px] font-bold cursor-pointer ${
                            emp.activo ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {emp.activo ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      {permissions.canOperate && (
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {onUpsertPermissionRecord && emp.email && (
                              <button
                                type="button"
                                onClick={() => void handleSyncSingleEmployeePermission(emp)}
                                title="Vincular empleado y centro de costo en Ajustes → Permisos"
                                className="px-2 py-1 text-[11px] font-semibold text-[#1E60A8] hover:bg-sky-50 rounded-lg cursor-pointer inline-flex items-center gap-1"
                              >
                                <Link2 className="w-3 h-3" />
                                <span>Permiso</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditEmployee(emp)}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteEntry('employees', emp.id)}
                              title="Eliminar empleado"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {section === 'costCenters' && (
            <table className="w-full text-left border-collapse text-xs min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-3">Cuenta Analítica</th>
                  <th className="py-3 px-3">ID Interno</th>
                  <th className="py-3 px-3">analytic_distribution</th>
                  <th className="py-3 px-3">Usuario Opera</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  {permissions.canOperate && <th className="py-3 px-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCostCenters.map((cc) => (
                  <tr
                    key={cc.id}
                    className={cc.activo ? 'hover:bg-slate-50/80' : 'bg-slate-50 opacity-60'}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-[#132B63]">{cc.codigo}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{cc.cuentaAnalitica}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">{cc.odooAnalyticId}</td>
                    <td className="py-2.5 px-3 font-mono text-[#1E60A8]">{cc.analyticDistribution}</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {cc.updatedByName || cc.updatedByEmail || 'Base GT S-44'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        disabled={!permissions.canOperate}
                        onClick={() => toggleActive('costCenters', cc.id)}
                        className={`text-[11px] font-bold cursor-pointer ${
                          cc.activo ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {cc.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    {permissions.canOperate && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAdding(true);
                            setEditingId(cc.id);
                            setCcCodigo(cc.codigo);
                            setCcCuentaAnalitica(cc.cuentaAnalitica);
                            setCcOdooId(cc.analyticDistribution || cc.odooAnalyticId);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer mr-1"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEntry('costCenters', cc.id)}
                          title="Eliminar"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {section === 'expenseCodes' && (
            <table className="w-full text-left border-collapse text-xs min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-3">Etiqueta Odoo (product_id)</th>
                  <th className="py-3 px-3">Categoría Vinculada</th>
                  <th className="py-3 px-3">Usuario Opera</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  {permissions.canOperate && <th className="py-3 px-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredExpenseCodes.map((exp) => (
                  <tr
                    key={exp.id}
                    className={exp.activo ? 'hover:bg-slate-50/80' : 'bg-slate-50 opacity-60'}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-[#132B63]">{exp.codigo}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{exp.labelOdoo}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {exp.categoriaVinculada || 'General'}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {exp.updatedByName || exp.updatedByEmail || 'Base GT S-44'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        disabled={!permissions.canOperate}
                        onClick={() => toggleActive('expenseCodes', exp.id)}
                        className={`text-[11px] font-bold cursor-pointer ${
                          exp.activo ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {exp.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    {permissions.canOperate && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAdding(true);
                            setEditingId(exp.id);
                            setExpCodigo(exp.codigo);
                            setExpNombre(exp.nombre);
                            setExpCat(exp.categoriaVinculada || '');
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer mr-1"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEntry('expenseCodes', exp.id)}
                          title="Eliminar"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {section === 'docTypes' && (
            <table className="w-full text-left border-collapse text-xs min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-3">Nombre</th>
                  <th className="py-3 px-3">l10n_gt_edi_doc_type</th>
                  <th className="py-3 px-3">Usuario Opera</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  {permissions.canOperate && <th className="py-3 px-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDocTypes.map((doc) => (
                  <tr
                    key={doc.id}
                    className={doc.activo ? 'hover:bg-slate-50/80' : 'bg-slate-50 opacity-60'}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-[#132B63]">{doc.codigo}</td>
                    <td className="py-2.5 px-3 text-slate-800">{doc.nombre}</td>
                    <td className="py-2.5 px-3 font-semibold text-[#1E60A8]">{doc.labelOdoo}</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {doc.updatedByName || doc.updatedByEmail || 'Base GT S-44'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        disabled={!permissions.canOperate}
                        onClick={() => toggleActive('docTypes', doc.id)}
                        className={`text-[11px] font-bold cursor-pointer ${
                          doc.activo ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {doc.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    {permissions.canOperate && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAdding(true);
                            setEditingId(doc.id);
                            setDocCodigo(doc.codigo);
                            setDocNombre(doc.nombre);
                            setDocLabel(doc.labelOdoo);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer mr-1"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEntry('docTypes', doc.id)}
                          title="Eliminar"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {section === 'taxIndicators' && (
            <table className="w-full text-left border-collapse text-xs min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-3">Nombre Impuesto Odoo (tax_ids)</th>
                  <th className="py-3 px-3">Etiqueta</th>
                  <th className="py-3 px-3 text-right">%</th>
                  <th className="py-3 px-3">Usuario Opera</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  {permissions.canOperate && <th className="py-3 px-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTaxIndicators.map((tax) => (
                  <tr
                    key={tax.id}
                    className={tax.activo ? 'hover:bg-slate-50/80' : 'bg-slate-50 opacity-60'}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-[#132B63]">{tax.codigo}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{tax.nombreImpuesto}</td>
                    <td className="py-2.5 px-3 text-slate-700">{tax.etiquetaFactura}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">{tax.porcentaje}%</td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {tax.updatedByName || tax.updatedByEmail || 'Base GT S-44'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        disabled={!permissions.canOperate}
                        onClick={() => toggleActive('taxIndicators', tax.id)}
                        className={`text-[11px] font-bold cursor-pointer ${
                          tax.activo ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {tax.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    {permissions.canOperate && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAdding(true);
                            setEditingId(tax.id);
                            setTaxCodigo(tax.codigo);
                            setTaxNombre(tax.nombreImpuesto);
                            setTaxValidez(tax.validezFiscal);
                            setTaxEtiqueta(tax.etiquetaFactura);
                            setTaxTipo(tax.tipoImpuesto);
                            setTaxPorcentaje(String(tax.porcentaje));
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer mr-1"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEntry('taxIndicators', tax.id)}
                          title="Eliminar"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {section === 'expenseDistributions' && (
            <table className="w-full text-left border-collapse text-xs min-w-[920px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-3">Opción (Desplegable)</th>
                  <th className="py-3 px-3">Modo</th>
                  <th className="py-3 px-3">Bien / Servicio</th>
                  <th className="py-3 px-3">Cuenta de Gasto Vinculada</th>
                  <th className="py-3 px-3">Indicador Impuesto (XO / XB)</th>
                  <th className="py-3 px-3">Usuario Opera</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  {permissions.canOperate && <th className="py-3 px-4 text-right">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDistributions.map((dist) => (
                  <tr
                    key={dist.id}
                    className={dist.activo ? 'hover:bg-slate-50/80' : 'bg-slate-50 opacity-60'}
                  >
                    <td className="py-2.5 px-4 font-mono font-bold text-[#132B63]">
                      {dist.codigo}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{dist.nombre}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                          dist.mode === 'multi_ceco'
                            ? 'bg-sky-50 text-[#1E60A8] border border-sky-200'
                            : 'bg-amber-50 text-amber-900 border border-amber-200'
                        }`}
                      >
                        {dist.mode === 'multi_ceco'
                          ? 'Dividir Varios Cecos'
                          : 'Cargo / Impuesto Adicional'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-semibold">
                      {dist.mode === 'multi_ceco'
                        ? 'Según doc. original'
                        : dist.naturaleza === 'servicio'
                        ? 'Servicio (XO)'
                        : 'Bien (XB)'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-[#132B63]">
                      {dist.mode === 'multi_ceco'
                        ? 'Mantiene cuenta original'
                        : dist.expenseCodeLabel || 'Hereda cuenta original'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {dist.mode === 'multi_ceco'
                        ? 'Mantiene indicador original'
                        : resolveDistributionTaxIndicator(
                            dist.naturaleza,
                            catalogs,
                            dist.taxIndicatorName
                          )}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-500">
                      {dist.updatedByName || dist.updatedByEmail || 'Base GT S-44'}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        disabled={!permissions.canOperate}
                        onClick={() => toggleActive('expenseDistributions', dist.id)}
                        className={`text-[11px] font-bold cursor-pointer ${
                          dist.activo ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {dist.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    {permissions.canOperate && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setIsAdding(true);
                            setEditingId(dist.id);
                            setDistCodigo(dist.codigo);
                            setDistNombre(dist.nombre);
                            setDistMode(dist.mode);
                            setDistNaturaleza(dist.naturaleza);
                            setDistExpenseCode(dist.expenseCodeLabel);
                            setDistTaxIndicator(dist.taxIndicatorName);
                          }}
                          className="px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer mr-1"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteEntry('expenseDistributions', dist.id)}
                          title="Eliminar"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};
