import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Database,
  FileSpreadsheet,
  FileText,
  Download,
  SlidersHorizontal,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Calendar,
  Coins,
  Users,
  Layers,
  Printer,
  RotateCcw,
  Pencil,
  Check,
  BookOpen,
  Eye,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import {
  EffectivePermissions,
  OdooExpenseType,
  UserPermissionRecord,
  ViaticoCategory,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoExpenseItem,
  ViaticoLiquidation,
  ViaticoLiquidationStatus,
  ViaticoOdooCatalogs,
  ViaticoOdooConfig,
} from '../../types';
import { StoredReceiptMedia } from '../../services/viaticosMediaStore';
import {
  CURRENCY_SYMBOLS,
  DEFAULT_VIATICO_ODOO_CONFIG,
  VIATICO_CATEGORIES,
  formatViaticoAmount,
  loadViaticoOdooConfig,
  resolveLiquidationCostCenter,
  saveViaticoOdooConfig,
} from '../../utils/viaticos';
import {
  findMatchingCostCenterEntry,
  mergeOdooCatalogsWithDefaults,
} from '../../utils/viaticosOdooCatalogs';
import {
  OdooConsolidatedExpenseRow,
  OdooExpenseUploadRow,
  buildOdooAccountingDataset,
  exportViaticosContabilidadPdf,
  exportViaticosOdooCsv,
  exportViaticosOdooExcel,
} from '../../utils/viaticosOdooExport';
import { ViaticosOdooCatalogsPanel } from './ViaticosOdooCatalogsPanel';

interface ViaticosContabilidadViewProps {
  liquidaciones: ViaticoLiquidation[];
  consultores: ViaticoConsultor[];
  odooCatalogs?: ViaticoOdooCatalogs;
  permissionRecords?: UserPermissionRecord[];
  currentUserEmail?: string;
  currentUserName?: string;
  permissions: EffectivePermissions;
  mediaMap?: Record<string, StoredReceiptMedia>;
  loadingMediaIds?: Set<string>;
  onEnsureMediaLoaded?: (ids: string[]) => Promise<void>;
  onLoadReceiptMedia?: (attachmentId: string) => Promise<StoredReceiptMedia | null>;
  onPreviewPlanillaPdf: (liq: ViaticoLiquidation) => void;
  onDownloadLiquidationExcel: (liq: ViaticoLiquidation) => void;
  onDownloadLiquidationPdf?: (liq: ViaticoLiquidation) => void;
  onAssignConsultorCostCenter: (params: {
    consultorId: string;
    consultorNombre: string;
    consultorEmail: string;
    empresa: string;
    centroCosto: string;
    odooAnalyticDistribution?: string;
    odooEmployeeName?: string;
  }) => void;
  onSaveOdooCatalogs?: (
    nextCatalogs: ViaticoOdooCatalogs,
    toastMessage?: string
  ) => void;
  onUpdateExpenseItemOdoo?: (
    liquidationId: string,
    itemId: string,
    patch: Partial<ViaticoExpenseItem>
  ) => void;
  onUpsertPermissionRecord?: (record: UserPermissionRecord) => Promise<void>;
  onNotify: (type: 'success' | 'info' | 'error', message: string) => void;
}

type AccountingSubTab =
  | 'carga_odoo'
  | 'facturas'
  | 'asientos'
  | 'centros'
  | 'bases_datos';
type StatusScopeFilter = 'CLOSED_AND_SENT' | 'ALL' | ViaticoLiquidationStatus;

export const ViaticosContabilidadView: React.FC<ViaticosContabilidadViewProps> = ({
  liquidaciones,
  consultores,
  odooCatalogs,
  permissionRecords = [],
  currentUserEmail = '',
  currentUserName = '',
  permissions,
  mediaMap = {},
  loadingMediaIds,
  onEnsureMediaLoaded,
  onLoadReceiptMedia,
  onPreviewPlanillaPdf,
  onDownloadLiquidationExcel,
  onDownloadLiquidationPdf,
  onAssignConsultorCostCenter,
  onSaveOdooCatalogs,
  onUpdateExpenseItemOdoo,
  onUpsertPermissionRecord,
  onNotify,
}) => {
  const resolvedCatalogs = useMemo(
    () => mergeOdooCatalogsWithDefaults(odooCatalogs),
    [odooCatalogs]
  );

  const [subTab, setSubTab] = useState<AccountingSubTab>('carga_odoo');
  const [statusFilter, setStatusFilter] = useState<StatusScopeFilter>('ALL');
  const [weekFilter, setWeekFilter] = useState<string>('ALL');
  const [consultorFilter, setConsultorFilter] = useState<string>('ALL');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | ViaticoCurrency>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Track explicitly excluded liquidation IDs so newly filtered/added liquidations are included automatically
  const [excludedLiqIds, setExcludedLiqIds] = useState<Set<string>>(() => new Set());

  // Odoo accounting configuration (persisted locally so accounting teams customize once)
  const [odooConfig, setOdooConfig] = useState<ViaticoOdooConfig>(() => loadViaticoOdooConfig());
  const [showOdooConfig, setShowOdooConfig] = useState(false);

  // Export loading states
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Scanned invoice Lightbox modal state
  const [receiptLightbox, setReceiptLightbox] = useState<{
    row: OdooConsolidatedExpenseRow;
    media: StoredReceiptMedia;
  } | null>(null);

  // Quick inline modal for assigning/updating a consultant's Cost Center directly from Contabilidad
  const [editingCC, setEditingCC] = useState<{
    consultorId: string;
    consultorNombre: string;
    consultorEmail: string;
    empresa: string;
    centroCosto: string;
    odooAnalyticDistribution?: string;
    odooEmployeeName?: string;
  } | null>(null);

  useEffect(() => {
    saveViaticoOdooConfig(odooConfig);
  }, [odooConfig]);

  // Existing distinct cost center suggestions for autocomplete
  const costCenterSuggestions = useMemo(() => {
    const set = new Set<string>();
    resolvedCatalogs.costCenters.forEach((cc) => {
      if (cc.activo !== false && cc.cuentaAnalitica?.trim()) {
        set.add(cc.cuentaAnalitica.trim());
      }
    });
    consultores.forEach((c) => {
      if (c.centroCosto?.trim()) set.add(c.centroCosto.trim());
    });
    liquidaciones.forEach((l) => {
      const cc = resolveLiquidationCostCenter(
        l,
        consultores,
        resolvedCatalogs,
        permissionRecords
      );
      if (cc) set.add(cc);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [consultores, liquidaciones, resolvedCatalogs, permissionRecords]);

  // Distinct filter options across all liquidadores
  const filterOptions = useMemo(() => {
    const weeks = new Set<string>();
    const consultorNames = new Set<string>();
    const companies = new Set<string>();
    const currencies = new Set<ViaticoCurrency>();

    liquidaciones.forEach((l) => {
      if (l.semana?.trim()) weeks.add(l.semana.trim());
      if (l.consultorNombre?.trim()) consultorNames.add(l.consultorNombre.trim());
      if (l.empresa?.trim()) companies.add(l.empresa.trim());
      if (l.monedaBase) currencies.add(l.monedaBase);
    });

    return {
      weeks: Array.from(weeks).sort((a, b) => {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
        return b.localeCompare(a);
      }),
      consultores: Array.from(consultorNames).sort((a, b) => a.localeCompare(b)),
      companies: Array.from(companies).sort((a, b) => a.localeCompare(b)),
      currencies: Array.from(currencies),
    };
  }, [liquidaciones]);

  // 1. Filter liquidations across ALL liquidadores
  const filteredLiquidaciones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return liquidaciones.filter((liq) => {
      if (statusFilter === 'CLOSED_AND_SENT') {
        if (liq.estado === 'borrador') return false;
      } else if (statusFilter !== 'ALL' && liq.estado !== statusFilter) {
        return false;
      }

      if (weekFilter !== 'ALL' && (liq.semana || '').trim() !== weekFilter) return false;
      if (consultorFilter !== 'ALL' && liq.consultorNombre !== consultorFilter) return false;
      if (companyFilter !== 'ALL' && liq.empresa !== companyFilter) return false;
      if (currencyFilter !== 'ALL' && liq.monedaBase !== currencyFilter) return false;

      const resolvedCC = resolveLiquidationCostCenter(
        liq,
        consultores,
        resolvedCatalogs,
        permissionRecords
      );
      if (costCenterFilter === '__UNASSIGNED__') {
        if (resolvedCC) return false;
      } else if (costCenterFilter !== 'ALL' && resolvedCC !== costCenterFilter) {
        return false;
      }

      if (!q) return true;
      const matchesHeader =
        liq.lineaLiquidacion.toLowerCase().includes(q) ||
        liq.consultorNombre.toLowerCase().includes(q) ||
        liq.consultorEmail.toLowerCase().includes(q) ||
        liq.empresa.toLowerCase().includes(q) ||
        resolvedCC.toLowerCase().includes(q) ||
        liq.semana.toLowerCase().includes(q);
      if (matchesHeader) return true;

      return liq.items.some(
        (it) =>
          it.proveedor.toLowerCase().includes(q) ||
          it.nit.toLowerCase().includes(q) ||
          it.noDoc.toLowerCase().includes(q) ||
          it.categoria.toLowerCase().includes(q) ||
          it.descripcionGasto.toLowerCase().includes(q) ||
          (it.odooProductId || '').toLowerCase().includes(q) ||
          (it.odooDocType || '').toLowerCase().includes(q)
      );
    });
  }, [
    liquidaciones,
    consultores,
    resolvedCatalogs,
    permissionRecords,
    statusFilter,
    weekFilter,
    consultorFilter,
    costCenterFilter,
    companyFilter,
    currencyFilter,
    searchQuery,
  ]);

  // 2. Apply batch selection checkboxes
  const selectedLiquidaciones = useMemo(
    () => filteredLiquidaciones.filter((l) => !excludedLiqIds.has(l.id)),
    [filteredLiquidaciones, excludedLiqIds]
  );

  // 3. Build consolidated Odoo accounting dataset from selected liquidaciones
  const dataset = useMemo(
    () =>
      buildOdooAccountingDataset(
        selectedLiquidaciones,
        consultores,
        odooConfig,
        resolvedCatalogs,
        permissionRecords
      ),
    [
      selectedLiquidaciones,
      consultores,
      odooConfig,
      resolvedCatalogs,
      permissionRecords,
    ]
  );

  // Preload scanned invoice attachments from Firestore when viewing consolidated invoices
  useEffect(() => {
    if (subTab !== 'facturas' || !onEnsureMediaLoaded) return;
    const ids = dataset.expenseRows
      .map((r) => r.attachmentId || '')
      .filter(Boolean);
    if (ids.length === 0) return;
    void onEnsureMediaLoaded(ids);
  }, [subTab, dataset.expenseRows, onEnsureMediaLoaded]);

  // Distinct liquidadores represented in the active batch
  const distinctSelectedLiquidadores = useMemo(() => {
    const s = new Set<string>();
    selectedLiquidaciones.forEach((l) => s.add(l.consultorEmail || l.consultorNombre));
    return s.size;
  }, [selectedLiquidaciones]);

  const batchLabel = useMemo(() => {
    const parts: string[] = [];
    if (weekFilter !== 'ALL') parts.push(`Sem${weekFilter}`);
    if (companyFilter !== 'ALL') parts.push(companyFilter);
    if (costCenterFilter !== 'ALL' && costCenterFilter !== '__UNASSIGNED__') {
      parts.push(costCenterFilter);
    }
    return parts.length > 0 ? parts.join('_') : 'Consolidado';
  }, [weekFilter, companyFilter, costCenterFilter]);

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    weekFilter !== 'ALL' ||
    consultorFilter !== 'ALL' ||
    costCenterFilter !== 'ALL' ||
    companyFilter !== 'ALL' ||
    currencyFilter !== 'ALL' ||
    Boolean(searchQuery.trim());

  const toggleLiquidationSelection = (id: string) => {
    setExcludedLiqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setExcludedLiqIds((prev) => {
      const next = new Set(prev);
      filteredLiquidaciones.forEach((l) => next.delete(l.id));
      return next;
    });
  };

  const unselectAllFiltered = () => {
    setExcludedLiqIds((prev) => {
      const next = new Set(prev);
      filteredLiquidaciones.forEach((l) => next.add(l.id));
      return next;
    });
  };

  const handleExportOdooExcel = async () => {
    if (dataset.expenseRows.length === 0) return;
    setIsExportingExcel(true);
    try {
      const filename = await exportViaticosOdooExcel(dataset, odooConfig, batchLabel);
      onNotify(
        'success',
        `Archivo contable Odoo descargado: ${filename} (Hoja 1: Carga Odoo Gastos + Asientos, Facturas y C.C.).`
      );
    } catch (err: any) {
      onNotify('error', err?.message || 'No se pudo generar el Excel contable para Odoo.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportOdooCsv = (mode: 'gastos' | 'asientos' | 'facturas') => {
    if (dataset.expenseRows.length === 0) return;
    try {
      const filename = exportViaticosOdooCsv(dataset, mode, batchLabel);
      onNotify(
        'success',
        mode === 'gastos'
          ? `CSV Carga Odoo (Hoja 1 · Plantilla GT S-44) descargado: ${filename}`
          : mode === 'asientos'
          ? `CSV de Asientos Odoo descargado: ${filename}`
          : `CSV Consolidado de Facturas descargado: ${filename}`
      );
    } catch (err: any) {
      onNotify('error', err?.message || 'Error al exportar CSV.');
    }
  };

  const handleExportContabilidadPdf = async () => {
    if (dataset.expenseRows.length === 0) return;
    setIsExportingPdf(true);
    try {
      const filename = await exportViaticosContabilidadPdf(dataset, odooConfig, batchLabel);
      onNotify('success', `Reporte PDF de Contabilidad descargado: ${filename}`);
    } catch (err: any) {
      onNotify('error', err?.message || 'Error generando el reporte PDF contable.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleSaveCostCenterEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCC) return;
    const matchedCC = findMatchingCostCenterEntry(
      editingCC.centroCosto,
      editingCC.odooAnalyticDistribution,
      resolvedCatalogs.costCenters
    );
    onAssignConsultorCostCenter({
      ...editingCC,
      centroCosto: matchedCC?.cuentaAnalitica || editingCC.centroCosto.trim(),
      odooAnalyticDistribution:
        editingCC.odooAnalyticDistribution?.trim() ||
        matchedCC?.analyticDistribution,
      odooEmployeeName: editingCC.odooEmployeeName?.trim().toUpperCase(),
    });
    setEditingCC(null);
  };

  const updateCategoryAccount = (
    category: ViaticoCategory,
    field: 'accountCode' | 'accountName',
    value: string
  ) => {
    setOdooConfig((prev) => ({
      ...prev,
      cuentasPorCategoria: {
        ...prev.cuentasPorCategoria,
        [category]: {
          ...prev.cuentasPorCategoria[category],
          [field]: value,
        },
      },
    }));
  };

  const allBalanced =
    dataset.totalsByCurrency.length > 0 &&
    dataset.totalsByCurrency.every((t) => t.isBalanced);

  const taxableInvoicesCount = dataset.expenseRows.filter((r) => r.aplicaImpuestos).length;

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 1. Executive Header + Odoo Export Toolbar */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#1E60A8]">
            Contabilidad · Consolidado Multi-Liquidador para Odoo
          </div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
            Descarga Contable y Distribución por Centro de Costo
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportOdooExcel}
            disabled={dataset.expenseRows.length === 0 || isExportingExcel}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 min-h-[44px] lg:min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
            <span>
              {isExportingExcel ? 'Generando Excel...' : 'Descargar Excel Odoo (.xlsx)'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleExportOdooCsv('gastos')}
            disabled={dataset.hrExpenseRows.length === 0}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] lg:min-h-[40px] px-3 py-2 text-xs font-bold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="CSV Hoja 1 exacto para importación en Odoo (Plantilla Gastos GT S-44)"
          >
            <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
            <span>CSV Carga Odoo</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportOdooCsv('asientos')}
            disabled={dataset.journalLines.length === 0}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] lg:min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="CSV en formato exacto de importación Odoo (account.move / line_ids)"
          >
            <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
            <span>CSV Asientos</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportOdooCsv('facturas')}
            disabled={dataset.expenseRows.length === 0}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] lg:min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="CSV plano consolidado con todas las facturas y centros de costo"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>CSV Facturas</span>
          </button>

          <button
            type="button"
            onClick={handleExportContabilidadPdf}
            disabled={dataset.expenseRows.length === 0 || isExportingPdf}
            className="inline-flex items-center justify-center gap-1.5 min-h-[42px] lg:min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="Descargar reporte PDF resumido para archivo contable"
          >
            <FileText className="w-3.5 h-3.5 text-rose-700" />
            <span>{isExportingPdf ? 'Generando PDF...' : 'PDF Resumen'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowOdooConfig((v) => !v)}
            className={`inline-flex items-center justify-center gap-1.5 min-h-[42px] lg:min-h-[40px] px-3 py-2 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
              showOdooConfig
                ? 'bg-sky-50 text-[#132B63] border-sky-300'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#1E60A8]" />
            <span>Cuentas Odoo</span>
          </button>
        </div>
      </section>

      {/* 2. Collapsible Odoo Chart of Accounts & Journal Mapping */}
      {showOdooConfig && (
        <section className="bg-white rounded-2xl border border-sky-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-sky-50/70 border-b border-sky-200/80 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#1E60A8]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#132B63]">
                Configuración de Cuentas y Diario Odoo
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                setOdooConfig(DEFAULT_VIATICO_ODOO_CONFIG);
                onNotify('info', 'Catálogo de cuentas Odoo restaurado a valores predeterminados.');
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restaurar predeterminados</span>
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-5">
            {/* Journal, IVA & Payable Account settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Diario Contable Odoo (journal_id)
                </label>
                <input
                  type="text"
                  value={odooConfig.diarioNombre}
                  onChange={(e) =>
                    setOdooConfig({ ...odooConfig, diarioNombre: e.target.value })
                  }
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Prefijo Referencia Asiento
                </label>
                <input
                  type="text"
                  value={odooConfig.prefijoReferencia}
                  onChange={(e) =>
                    setOdooConfig({ ...odooConfig, prefijoReferencia: e.target.value })
                  }
                  placeholder="VIAT"
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Criterio Fecha Contable
                </label>
                <select
                  value={odooConfig.criterioFechaContable}
                  onChange={(e) =>
                    setOdooConfig({
                      ...odooConfig,
                      criterioFechaContable: e.target
                        .value as ViaticoOdooConfig['criterioFechaContable'],
                    })
                  }
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                >
                  <option value="fecha_cierre">Fecha de cierre / actualización</option>
                  <option value="fecha_factura">Fecha de documento (factura)</option>
                  <option value="fecha_hoy">Fecha actual (hoy)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Etiqueta Impuesto Odoo (tax_ids)
                </label>
                <input
                  type="text"
                  value={odooConfig.etiquetaImpuesto}
                  onChange={(e) =>
                    setOdooConfig({ ...odooConfig, etiquetaImpuesto: e.target.value })
                  }
                  placeholder="IVA 12% Compras"
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Cuenta IVA Crédito Fiscal (Código)
                </label>
                <input
                  type="text"
                  value={odooConfig.cuentaIvaCodigo}
                  onChange={(e) =>
                    setOdooConfig({ ...odooConfig, cuentaIvaCodigo: e.target.value })
                  }
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Nombre Cuenta IVA
                </label>
                <input
                  type="text"
                  value={odooConfig.cuentaIvaNombre}
                  onChange={(e) =>
                    setOdooConfig({ ...odooConfig, cuentaIvaNombre: e.target.value })
                  }
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Cuenta Contrapartida Empleados (Haber)
                </label>
                <input
                  type="text"
                  value={odooConfig.cuentaContrapartidaCodigo}
                  onChange={(e) =>
                    setOdooConfig({
                      ...odooConfig,
                      cuentaContrapartidaCodigo: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-semibold text-slate-600 mb-1">
                  Nombre Cuenta Contrapartida
                </label>
                <input
                  type="text"
                  value={odooConfig.cuentaContrapartidaNombre}
                  onChange={(e) =>
                    setOdooConfig({
                      ...odooConfig,
                      cuentaContrapartidaNombre: e.target.value,
                    })
                  }
                  className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-base lg:text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>
            </div>

            {/* Category -> Odoo Account Mapping Table */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Mapeo de Categorías de Viáticos → Cuentas de Gasto Odoo
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {VIATICO_CATEGORIES.map((cat) => {
                  const cfg = odooConfig.cuentasPorCategoria[cat];
                  return (
                    <div
                      key={cat}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70"
                    >
                      <span className="sm:w-36 text-xs font-semibold text-slate-800 truncate shrink-0">
                        {cat}
                      </span>
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={cfg?.accountCode || ''}
                          onChange={(e) =>
                            updateCategoryAccount(cat, 'accountCode', e.target.value)
                          }
                          aria-label={`Código cuenta Odoo para ${cat}`}
                          placeholder="Código"
                          className="w-24 min-h-[40px] lg:min-h-0 px-2 py-1 text-base lg:text-xs font-mono bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 shrink-0"
                        />
                        <input
                          type="text"
                          value={cfg?.accountName || ''}
                          onChange={(e) =>
                            updateCategoryAccount(cat, 'accountName', e.target.value)
                          }
                          aria-label={`Nombre cuenta Odoo para ${cat}`}
                          placeholder="Nombre cuenta"
                          className="flex-1 min-w-0 min-h-[40px] lg:min-h-0 px-2 py-1 text-base lg:text-xs bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 3. KPI Summary Bar */}
      <section className="bg-white rounded-2xl border border-slate-200/90 grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <div className="p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Liquidaciones en Lote
          </div>
          <div className="mt-1.5 text-2xl font-bold text-[#132B63] font-mono tabular-nums">
            {selectedLiquidaciones.length}
            <span className="text-sm font-normal text-slate-400">
              {' '}
              / {filteredLiquidaciones.length}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {distinctSelectedLiquidadores}{' '}
            {distinctSelectedLiquidadores === 1 ? 'liquidador' : 'liquidadores'} consolidados
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Facturas / Líneas Odoo
          </div>
          <div className="mt-1.5 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {dataset.expenseRows.length}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {taxableInvoicesCount} con IVA · {dataset.expenseRows.length - taxableInvoicesCount}{' '}
            exentas · {dataset.journalLines.length} líneas asiento
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            IVA Crédito Fiscal
          </div>
          {dataset.totalsByCurrency.length === 0 ? (
            <div className="mt-1.5 text-sm font-mono text-slate-400">—</div>
          ) : (
            <div className="mt-1.5 space-y-0.5">
              {dataset.totalsByCurrency.map((t) => (
                <div
                  key={t.moneda}
                  className="text-sm font-bold text-[#1E60A8] font-mono tabular-nums"
                >
                  {formatViaticoAmount(t.totalImpuesto, t.moneda, true)}
                </div>
              ))}
            </div>
          )}
          <div className="mt-0.5 text-xs text-slate-500">
            Cuenta {odooConfig.cuentaIvaCodigo}
          </div>
        </div>

        <div className="p-4 sm:p-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center justify-between gap-2">
            <span>Total a Contabilizar</span>
            {allBalanced && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 normal-case">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Cuadrado</span>
              </span>
            )}
          </div>
          {dataset.totalsByCurrency.length === 0 ? (
            <div className="mt-1.5 text-sm font-mono text-slate-400">—</div>
          ) : (
            <div className="mt-1.5 space-y-0.5">
              {dataset.totalsByCurrency.map((t) => (
                <div
                  key={t.moneda}
                  className="text-base font-extrabold text-[#132B63] font-mono tabular-nums"
                >
                  {formatViaticoAmount(t.totalReintegrar, t.moneda, true)}
                </div>
              ))}
            </div>
          )}
          <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
            {dataset.costCenterSummary.length}{' '}
            {dataset.costCenterSummary.length === 1 ? 'centro de costo' : 'centros de costo'}
          </div>
        </div>
      </section>

      {/* 4. Missing Cost Center Warning Strip (with 1-click inline assignment) */}
      {dataset.missingCostCenterConsultores.length > 0 && (
        <div className="px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">
                {dataset.missingCostCenterConsultores.length}{' '}
                {dataset.missingCostCenterConsultores.length === 1
                  ? 'consultor en este lote no tiene Centro de Costo asignado'
                  : 'consultores en este lote no tienen Centro de Costo asignado'}
                :
              </span>{' '}
              <span>
                {dataset.missingCostCenterConsultores
                  .map((m) => m.consultorNombre)
                  .join(', ')}
                .
              </span>
            </div>
          </div>
          {permissions.canOperate && (
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              {dataset.missingCostCenterConsultores.slice(0, 3).map((m) => (
                <button
                  key={m.consultorEmail || m.consultorId}
                  type="button"
                  onClick={() =>
                    setEditingCC({
                      consultorId: m.consultorId,
                      consultorNombre: m.consultorNombre,
                      consultorEmail: m.consultorEmail,
                      empresa: m.empresa,
                      centroCosto: '',
                    })
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-amber-950 bg-white hover:bg-amber-100 border border-amber-300 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Asignar C.C. ({m.consultorNombre.split(' ')[0]})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. Filter Toolbar & Sub-View Navigation */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Sub-Tab Switcher */}
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl border border-slate-200/70 w-full lg:w-auto gap-0.5">
            <button
              type="button"
              onClick={() => setSubTab('carga_odoo')}
              className={`min-h-[40px] lg:min-h-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-colors cursor-pointer truncate ${
                subTab === 'carga_odoo'
                  ? 'bg-white text-[#132B63] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Carga Odoo Hoja 1 ({dataset.hrExpenseRows.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('facturas')}
              className={`min-h-[40px] lg:min-h-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-colors cursor-pointer truncate ${
                subTab === 'facturas'
                  ? 'bg-white text-[#132B63] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Facturas ({dataset.expenseRows.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('asientos')}
              className={`min-h-[40px] lg:min-h-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-colors cursor-pointer truncate ${
                subTab === 'asientos'
                  ? 'bg-white text-[#132B63] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Asientos ({dataset.journalLines.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('centros')}
              className={`min-h-[40px] lg:min-h-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg transition-colors cursor-pointer truncate ${
                subTab === 'centros'
                  ? 'bg-white text-[#132B63] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Lote y C.C. ({selectedLiquidaciones.length})
            </button>
            <button
              type="button"
              onClick={() => setSubTab('bases_datos')}
              className={`min-h-[40px] lg:min-h-0 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 truncate ${
                subTab === 'bases_datos'
                  ? 'bg-[#132B63] text-white shadow-2xs'
                  : 'text-[#1E60A8] hover:text-[#132B63]'
              }`}
            >
              <Database className="w-3.5 h-3.5 shrink-0" />
              <span>Bases de Datos Odoo</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-full lg:w-64">
            <Search className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar proveedor, NIT, consultor, C.C..."
              className="w-full min-h-[44px] lg:min-h-0 pl-9 lg:pl-8 pr-8 py-2 lg:py-1.5 text-base lg:text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Multi-Liquidador Filters Row */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <select
            value={statusFilter}
            aria-label="Filtrar por estado"
            onChange={(e) => setStatusFilter(e.target.value as StatusScopeFilter)}
            className="col-span-2 sm:col-span-1 min-h-[44px] lg:min-h-0 text-sm lg:text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 cursor-pointer"
          >
            <option value="ALL">Todos los estados</option>
            <option value="CLOSED_AND_SENT">Solo Cerradas y Enviadas</option>
            <option value="cerrada">Solo Cerradas</option>
            <option value="enviada">Solo Enviadas</option>
            <option value="borrador">Solo Abiertas (Borrador)</option>
          </select>

          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 min-h-[44px] lg:min-h-0 lg:py-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              value={weekFilter}
              aria-label="Filtrar por semana"
              onChange={(e) => setWeekFilter(e.target.value)}
              className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Semanas</option>
              {filterOptions.weeks.map((w) => (
                <option key={w} value={w}>
                  Semana #{w}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 min-h-[44px] lg:min-h-0 lg:py-1.5">
            <Coins className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              value={currencyFilter}
              aria-label="Filtrar por moneda"
              onChange={(e) =>
                setCurrencyFilter(e.target.value as 'ALL' | ViaticoCurrency)
              }
              className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Monedas</option>
              {filterOptions.currencies.map((cur) => (
                <option key={cur} value={cur}>
                  {cur} ({CURRENCY_SYMBOLS[cur]})
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 min-h-[44px] lg:min-h-0 lg:py-1.5 col-span-2 sm:col-span-1">
            <Users className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              value={consultorFilter}
              aria-label="Filtrar por liquidador"
              onChange={(e) => setConsultorFilter(e.target.value)}
              className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer sm:max-w-[180px]"
            >
              <option value="ALL">Todos los liquidadores</option>
              {filterOptions.consultores.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 min-h-[44px] lg:min-h-0 lg:py-1.5 col-span-2 sm:col-span-1">
            <Layers className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              value={costCenterFilter}
              aria-label="Filtrar por centro de costo"
              onChange={(e) => setCostCenterFilter(e.target.value)}
              className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer sm:max-w-[200px]"
            >
              <option value="ALL">Todos los Centros de Costo</option>
              <option value="__UNASSIGNED__">Sin Centro de Costo</option>
              {costCenterSuggestions.map((cc) => (
                <option key={cc} value={cc}>
                  {cc}
                </option>
              ))}
            </select>
          </div>

          {filterOptions.companies.length > 1 && (
            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 min-h-[44px] lg:min-h-0 lg:py-1.5 col-span-2 sm:col-span-1">
              <Building2 className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
              <select
                value={companyFilter}
                aria-label="Filtrar por sociedad"
                onChange={(e) => setCompanyFilter(e.target.value)}
                className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer sm:max-w-[170px]"
              >
                <option value="ALL">Todas las sociedades</option>
                {filterOptions.companies.map((comp) => (
                  <option key={comp} value={comp}>
                    {comp}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setStatusFilter('ALL');
                setWeekFilter('ALL');
                setConsultorFilter('ALL');
                setCostCenterFilter('ALL');
                setCompanyFilter('ALL');
                setCurrencyFilter('ALL');
                setSearchQuery('');
              }}
              className="col-span-2 sm:col-span-1 min-h-[40px] lg:min-h-0 text-xs font-semibold text-[#1E60A8] hover:text-[#132B63] px-2 py-1 cursor-pointer whitespace-nowrap text-left sm:text-center"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {/* 6.0 SUB-TAB 0: CARGA ODOO HOJA 1 (FORMATO PLANTILLA GASTOS GT S-44) */}
      {subTab === 'carga_odoo' && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-slate-900">
                Hoja 1 Odoo (hr.expense · Plantilla Gastos GT S-44) — {dataset.hrExpenseRows.length} líneas
              </span>
              <div className="text-[11px] text-slate-500">
                Los cambios en Código de Gasto, Impuesto, Tipo Documento, C.C. Interno y Distribución de Gastos (IDP, Intecap, Propina, Varios cecos) se reflejan en vivo y en la descarga a Odoo junto al usuario que opera.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSubTab('bases_datos')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[#1E60A8] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" />
              <span>Administrar Catálogos Odoo</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[2140px]">
              <thead>
                <tr className="border-b border-slate-200 bg-[#132B63] text-[10px] font-bold uppercase tracking-wider text-white">
                  <th className="py-2.5 px-3">name</th>
                  <th className="py-2.5 px-3">product_id</th>
                  <th className="py-2.5 px-2.5 text-right">total_amount_currency</th>
                  <th className="py-2.5 px-2.5 text-center">currency_id</th>
                  <th className="py-2.5 px-3">tax_ids</th>
                  <th className="py-2.5 px-3">employee_id</th>
                  <th className="py-2.5 px-2.5">expense_type</th>
                  <th className="py-2.5 px-2.5 text-center">date</th>
                  <th className="py-2.5 px-2.5">Partner_id</th>
                  <th className="py-2.5 px-3">Journal</th>
                  <th className="py-2.5 px-2.5">vendor_ref</th>
                  <th className="py-2.5 px-2.5">serial_number</th>
                  <th className="py-2.5 px-3">payment_reference</th>
                  <th className="py-2.5 px-3">l10n_gt_edi_doc_type</th>
                  <th className="py-2.5 px-3">analytic_distribution</th>
                  <th className="py-2.5 px-3">Operado por</th>
                  <th className="py-2.5 px-3">Distribuir gastos</th>
                  <th className="py-2.5 px-3">Dividir cant. / Valor</th>
                  <th className="py-2.5 px-3">Cecos (Dividir)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.hrExpenseRows.length === 0 ? (
                  <tr>
                    <td colSpan={19} className="py-12 text-center text-slate-500">
                      No hay líneas de gasto para exportar con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  dataset.hrExpenseRows.map((row) => (
                    <OdooCargaExpenseRow
                      key={row.rowKey}
                      row={row}
                      resolvedCatalogs={resolvedCatalogs}
                      canOperate={permissions.canOperate && Boolean(onUpdateExpenseItemOdoo)}
                      onUpdateExpenseItemOdoo={onUpdateExpenseItemOdoo}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 6A. SUB-TAB 1: CONSOLIDADO DE FACTURAS (TODOS LOS LIQUIDADORES) */}
      {subTab === 'facturas' && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-900">
              Detalle Consolidado de Gastos ({dataset.expenseRows.length} comprobantes)
            </span>
          </div>

          {/* Mobile Native Cards (< lg) */}
          <div className="lg:hidden divide-y divide-slate-200">
            {dataset.expenseRows.length === 0 ? (
              <div className="py-12 px-5 text-center text-sm text-slate-500">
                No hay facturas en las liquidaciones seleccionadas. Ajusta los filtros o selecciona liquidaciones en &ldquo;Lote y C.C.&rdquo;.
              </div>
            ) : (
              dataset.expenseRows.map((row) => (
                <div key={row.rowKey} className="p-4 space-y-2.5 bg-white">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[#1E60A8]">S{row.semana}</span>
                        <span>·</span>
                        <span>{row.fechaDoc || 'Sin fecha'}</span>
                        <span>·</span>
                        <span>{row.documentoCompleto}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 mt-0.5 break-words">
                        {row.proveedor}
                      </h4>
                      <div className="text-xs text-slate-600">
                        {row.consultorNombre} · {row.empresa}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-base font-extrabold font-mono tabular-nums text-[#132B63]">
                        {formatViaticoAmount(row.valorReintegrar, row.monedaBase, true)}
                      </div>
                      {row.impuestoReintegrar > 0 && (
                        <div className="text-[11px] font-mono text-[#1E60A8]">
                          IVA {formatViaticoAmount(row.impuestoReintegrar)}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 bg-slate-50 rounded-xl p-2.5 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-[#132B63]">
                        {row.categoria} ({row.cuentaGastoCodigo})
                      </span>
                      <span
                        className={`font-semibold ${
                          row.centroCosto ? 'text-slate-700' : 'text-amber-700 italic'
                        }`}
                      >
                        {row.centroCosto || 'Sin C.C.'}
                      </span>
                    </div>
                    {row.descripcionGasto && (
                      <div className="text-[11px] text-slate-600">{row.descripcionGasto}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                    {permissions.canOperate && (
                      <button
                        type="button"
                        onClick={() =>
                          setEditingCC({
                            consultorId: row.consultorId,
                            consultorNombre: row.consultorNombre,
                            consultorEmail: row.consultorEmail,
                            empresa: row.empresa,
                            centroCosto: row.centroCosto,
                          })
                        }
                        className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>{row.centroCosto ? 'Editar C.C.' : 'Asignar C.C.'}</span>
                      </button>
                    )}

                    {row.attachmentId ? (
                      mediaMap[row.attachmentId] ? (
                        <button
                          type="button"
                          onClick={() =>
                            setReceiptLightbox({
                              row,
                              media: mediaMap[row.attachmentId!],
                            })
                          }
                          className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Ver Factura</span>
                        </button>
                      ) : loadingMediaIds?.has(row.attachmentId) ? (
                        <span className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs text-[#1E60A8]">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Cargando...</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!row.attachmentId || !onLoadReceiptMedia) return;
                            const loaded = await onLoadReceiptMedia(row.attachmentId);
                            if (loaded) {
                              setReceiptLightbox({ row, media: loaded });
                            } else {
                              onNotify(
                                'info',
                                `La factura "${row.attachmentName || row.documentoCompleto}" aún no está sincronizada en la nube.`
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1.5 min-h-[38px] px-3 py-1.5 text-xs font-bold text-[#1E60A8] bg-sky-50 border border-sky-200 rounded-lg cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Cargar Factura</span>
                        </button>
                      )
                    ) : (
                      <span className="text-xs text-slate-400">Sin imagen</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[1260px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-3">Consultor / Sociedad</th>
                  <th className="py-3 px-3">Centro de Costo</th>
                  <th className="py-3 px-2.5 text-center">Sem</th>
                  <th className="py-3 px-2.5 text-center">Fecha Doc.</th>
                  <th className="py-3 px-2.5">Doc / NIT</th>
                  <th className="py-3 px-3">Proveedor</th>
                  <th className="py-3 px-3">Categoría / Cuenta Odoo</th>
                  <th className="py-3 px-2.5 text-right">Base Sin Imp.</th>
                  <th className="py-3 px-2.5 text-right">IVA / Imp.</th>
                  <th className="py-3 px-3 text-right">Total Reintegrar</th>
                  <th className="py-3 px-2.5 text-center">Soporte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.expenseRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-500">
                      No hay facturas en las liquidaciones seleccionadas. Ajusta los filtros o selecciona liquidaciones en la pestaña &ldquo;Centros de Costo y Lote&rdquo;.
                    </td>
                  </tr>
                ) : (
                  dataset.expenseRows.map((row) => (
                    <tr key={row.rowKey} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 truncate max-w-[180px]">
                          {row.consultorNombre}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {row.empresa}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-semibold truncate max-w-[170px] ${
                              row.centroCosto ? 'text-[#132B63]' : 'text-amber-700 italic'
                            }`}
                          >
                            {row.centroCosto || 'Sin asignar'}
                          </span>
                          {permissions.canOperate && (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingCC({
                                  consultorId: row.consultorId,
                                  consultorNombre: row.consultorNombre,
                                  consultorEmail: row.consultorEmail,
                                  empresa: row.empresa,
                                  centroCosto: row.centroCosto,
                                })
                              }
                              title="Asignar o editar Centro de Costo de este consultor"
                              className="p-1 text-slate-400 hover:text-[#1E60A8] hover:bg-slate-100 rounded cursor-pointer shrink-0"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono font-semibold text-[#1E60A8] tabular-nums whitespace-nowrap">
                        S{row.semana}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {row.fechaDoc || '—'}
                      </td>
                      <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                        <div>{row.documentoCompleto}</div>
                        {row.nit && (
                          <div className="text-[10px] text-slate-400">NIT {row.nit}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-slate-900 truncate max-w-[200px]">
                          {row.proveedor}
                        </div>
                        {row.descripcionGasto && (
                          <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                            {row.descripcionGasto}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-800 font-medium">{row.categoria}</div>
                        <div className="text-[11px] font-mono text-[#1E60A8]">
                          {row.cuentaGastoCodigo}{' '}
                          <span className="font-sans text-slate-500">
                            · {row.cuentaGastoNombre}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                        {formatViaticoAmount(row.baseReintegrar)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <span
                          className={
                            row.impuestoReintegrar > 0
                              ? 'text-[#1E60A8] font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {formatViaticoAmount(row.impuestoReintegrar)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-[#132B63] whitespace-nowrap">
                        {formatViaticoAmount(row.valorReintegrar, row.monedaBase, true)}
                      </td>
                      <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                        {row.attachmentId ? (
                          mediaMap[row.attachmentId] ? (
                            <button
                              type="button"
                              onClick={() =>
                                setReceiptLightbox({
                                  row,
                                  media: mediaMap[row.attachmentId!],
                                })
                              }
                              title={`Ver factura escaneada: ${mediaMap[row.attachmentId].fileName}`}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          ) : loadingMediaIds?.has(row.attachmentId) ? (
                            <span
                              title="Descargando factura escaneada..."
                              className="p-1.5 text-[#1E60A8] inline-flex"
                            >
                              <Loader2 className="w-4 h-4 animate-spin" />
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                if (!row.attachmentId || !onLoadReceiptMedia) return;
                                const loaded = await onLoadReceiptMedia(row.attachmentId);
                                if (loaded) {
                                  setReceiptLightbox({ row, media: loaded });
                                } else {
                                  onNotify(
                                    'info',
                                    `La factura "${row.attachmentName || row.documentoCompleto}" aún no está sincronizada en la nube desde el equipo del liquidador.`
                                  );
                                }
                              }}
                              title={`Cargar y ver factura escaneada: ${row.attachmentName || row.documentoCompleto}`}
                              className="p-1.5 text-[#1E60A8] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 6B. SUB-TAB 2: VISTA PREVIA ASIENTOS ODOO (DEBE / HABER) */}
      {subTab === 'asientos' && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-slate-900">
                Vista Previa de Partida Contable Odoo (account.move)
              </span>
              <span className="text-slate-400 mx-2">·</span>
              <span className="text-slate-600">
                Diario: <strong>{odooConfig.diarioNombre}</strong>
              </span>
            </div>
            {dataset.totalsByCurrency.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[11px]">
                {dataset.totalsByCurrency.map((t) => (
                  <span key={t.moneda} className="text-slate-700">
                    <strong>{CURRENCY_SYMBOLS[t.moneda]}</strong> Debe:{' '}
                    {formatViaticoAmount(t.totalDebito)} = Haber:{' '}
                    {formatViaticoAmount(t.totalCredito)}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Mobile Native Cards for Odoo Journal Lines (< lg) */}
          <div className="lg:hidden divide-y divide-slate-200">
            {dataset.journalLines.length === 0 ? (
              <div className="py-12 px-5 text-center text-sm text-slate-500">
                No hay líneas de asiento generadas con los filtros actuales.
              </div>
            ) : (
              dataset.journalLines.map((line) => (
                <div
                  key={line.lineKey}
                  className={`p-4 space-y-1.5 ${
                    line.tipoLinea === 'contrapartida'
                      ? 'bg-sky-50/70'
                      : line.tipoLinea === 'iva'
                      ? 'bg-slate-50/50'
                      : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-[#132B63] font-bold">
                        {line.asientoRef} · {line.fechaContable}
                      </div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">
                        {line.cuentaCodigo} · {line.cuentaNombre}
                      </div>
                      <div className="text-xs text-slate-600 truncate">
                        {line.partner} {line.partnerNit ? `(${line.partnerNit})` : ''}
                      </div>
                    </div>
                    <div className="text-right font-mono font-bold tabular-nums shrink-0">
                      {line.debito > 0 ? (
                        <div className="text-sm text-slate-900">
                          Debe: {formatViaticoAmount(line.debito, line.moneda, true)}
                        </div>
                      ) : (
                        <div className="text-sm text-[#132B63]">
                          Haber: {formatViaticoAmount(line.credito, line.moneda, true)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600">{line.etiqueta}</div>
                  <div className="text-[11px] font-semibold text-slate-700">
                    C.C.: {line.centroCosto || 'Sin asignar'}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[1220px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-3">Ref. Asiento (ref)</th>
                  <th className="py-3 px-2.5 text-center">Fecha</th>
                  <th className="py-3 px-3">Cuenta (account_id)</th>
                  <th className="py-3 px-3">Tercero (partner_id)</th>
                  <th className="py-3 px-3">Etiqueta (name)</th>
                  <th className="py-3 px-3">Centro Costo (analytic)</th>
                  <th className="py-3 px-2.5 text-right">Debe (debit)</th>
                  <th className="py-3 px-3 text-right">Haber (credit)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dataset.journalLines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No hay líneas de asiento generadas con los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  dataset.journalLines.map((line) => (
                    <tr
                      key={line.lineKey}
                      className={
                        line.tipoLinea === 'contrapartida'
                          ? 'bg-sky-50/70 font-semibold'
                          : line.tipoLinea === 'iva'
                          ? 'bg-slate-50/40'
                          : 'hover:bg-slate-50/70'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono text-[11px] text-[#132B63] whitespace-nowrap">
                        {line.asientoRef}
                      </td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                        {line.fechaContable}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-[#132B63]">
                          {line.cuentaCodigo}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          {line.cuentaNombre}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-900 truncate max-w-[180px]">{line.partner}</div>
                        {line.partnerNit && (
                          <div className="text-[10px] font-mono text-slate-400">
                            NIT {line.partnerNit}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 max-w-[260px]">
                        <div className="truncate" title={line.etiqueta}>
                          {line.etiqueta}
                        </div>
                        {line.impuestoOdoo && (
                          <div className="text-[10px] text-[#1E60A8]">
                            Impuesto: {line.impuestoOdoo}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={
                            line.centroCosto
                              ? 'font-semibold text-slate-800'
                              : 'text-amber-700 italic'
                          }
                        >
                          {line.centroCosto || 'Sin asignar'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                        {line.debito > 0
                          ? formatViaticoAmount(line.debito, line.moneda, true)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[#132B63] whitespace-nowrap">
                        {line.credito > 0
                          ? formatViaticoAmount(line.credito, line.moneda, true)
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 6C. SUB-TAB 3: RESUMEN POR CENTRO DE COSTO + SELECCIÓN DE LOTE DE LIQUIDACIONES */}
      {subTab === 'centros' && (
        <div className="space-y-5">
          {/* Cost Center Distribution Table */}
          <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Distribución Analítica por Centro de Costo
              </h3>
            </div>
            {/* Mobile Cards for Cost Centers (< lg) */}
            <div className="lg:hidden divide-y divide-slate-200">
              {dataset.costCenterSummary.length === 0 ? (
                <div className="py-10 px-5 text-center text-sm text-slate-500">
                  Sin datos para agrupar por Centro de Costo.
                </div>
              ) : (
                dataset.costCenterSummary.map((cc) => (
                  <div key={`${cc.centroCosto}-${cc.monedaBase}`} className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div
                          className={`text-sm font-bold ${
                            cc.centroCosto === 'Sin Centro de Costo'
                              ? 'text-amber-700 italic'
                              : 'text-[#132B63]'
                          }`}
                        >
                          {cc.centroCosto}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {cc.consultores.join(', ')}
                        </div>
                      </div>
                      <div className="text-right font-mono font-extrabold text-sm text-[#132B63] shrink-0">
                        {formatViaticoAmount(cc.totalReintegrar, cc.monedaBase, true)}
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                      <span>{cc.liquidacionesCount} liq.</span>
                      <span>{cc.facturasCount} fact.</span>
                      <span>IVA: {formatViaticoAmount(cc.totalImpuesto, cc.monedaBase, true)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4">Centro de Costo</th>
                    <th className="py-3 px-4">Consultores</th>
                    <th className="py-3 px-3 text-center">Liquidaciones</th>
                    <th className="py-3 px-3 text-center">Facturas</th>
                    <th className="py-3 px-4 text-right">Base Sin Impuesto</th>
                    <th className="py-3 px-4 text-right">IVA / Impuesto</th>
                    <th className="py-3 px-4 text-right">Total Contabilizar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dataset.costCenterSummary.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        Sin datos para agrupar por Centro de Costo.
                      </td>
                    </tr>
                  ) : (
                    dataset.costCenterSummary.map((cc) => (
                      <tr
                        key={`${cc.centroCosto}-${cc.monedaBase}`}
                        className="hover:bg-slate-50/80"
                      >
                        <td className="py-3 px-4">
                          <span
                            className={`font-bold ${
                              cc.centroCosto === 'Sin Centro de Costo'
                                ? 'text-amber-700 italic'
                                : 'text-[#132B63]'
                            }`}
                          >
                            {cc.centroCosto}
                          </span>
                          <div className="text-[11px] text-slate-500">{cc.monedaBase}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {cc.consultores.join(', ')}
                        </td>
                        <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-700">
                          {cc.liquidacionesCount}
                        </td>
                        <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-700">
                          {cc.facturasCount}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                          {formatViaticoAmount(cc.baseSinImpuesto, cc.monedaBase, true)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-[#1E60A8] whitespace-nowrap">
                          {formatViaticoAmount(cc.totalImpuesto, cc.monedaBase, true)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold tabular-nums text-[#132B63] whitespace-nowrap">
                          {formatViaticoAmount(cc.totalReintegrar, cc.monedaBase, true)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Liquidation Batch Selector Table */}
          <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Liquidaciones en Lote ({selectedLiquidaciones.length} de{' '}
                {filteredLiquidaciones.length} seleccionadas)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="px-2.5 py-1 text-xs font-semibold text-[#1E60A8] hover:bg-sky-50 rounded-lg cursor-pointer"
                >
                  Seleccionar todas
                </button>
                <button
                  type="button"
                  onClick={unselectAllFiltered}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Quitar todas
                </button>
              </div>
            </div>

            {/* Mobile Batch Selector Cards (< lg) */}
            <div className="lg:hidden divide-y divide-slate-200">
              {filteredLiquidaciones.map((liq) => {
                const isChecked = !excludedLiqIds.has(liq.id);
                const cc = resolveLiquidationCostCenter(liq, consultores);
                return (
                  <div
                    key={liq.id}
                    className={`p-4 space-y-2.5 ${isChecked ? 'bg-white' : 'bg-slate-50/70 opacity-65'}`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleLiquidationSelection(liq.id)}
                        aria-label={`Incluir liquidación ${liq.lineaLiquidacion}`}
                        className="mt-1 w-5 h-5 rounded border-slate-300 text-[#1E60A8] cursor-pointer shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold text-sm text-slate-900 break-words">
                              <span className="font-mono text-[#1E60A8] mr-1.5">
                                Sem #{liq.semana || '-'}
                              </span>
                              {liq.lineaLiquidacion || 'Sin título'}
                            </div>
                            <div className="text-xs text-slate-600">
                              {liq.consultorNombre} · {liq.empresa}
                            </div>
                          </div>
                          <div className="text-right font-mono font-bold text-sm text-[#132B63] shrink-0">
                            {formatViaticoAmount(liq.totalLiquidacion, liq.monedaBase, true)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                          <span className={cc ? 'text-xs font-semibold text-[#132B63]' : 'text-xs text-amber-700 italic'}>
                            C.C.: {cc || 'Sin asignar'}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {permissions.canOperate && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingCC({
                                    consultorId: liq.consultorId,
                                    consultorNombre: liq.consultorNombre,
                                    consultorEmail: liq.consultorEmail,
                                    empresa: liq.empresa,
                                    centroCosto: cc,
                                  })
                                }
                                className="min-h-[38px] px-2.5 py-1 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg cursor-pointer"
                              >
                                C.C.
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => onDownloadLiquidationExcel(liq)}
                              disabled={liq.items.length === 0}
                              className="min-h-[38px] px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 rounded-lg disabled:opacity-40 cursor-pointer"
                            >
                              Excel
                            </button>
                            {onDownloadLiquidationPdf && (
                              <button
                                type="button"
                                onClick={() => onDownloadLiquidationPdf(liq)}
                                disabled={liq.items.length === 0}
                                className="min-h-[38px] px-2.5 py-1 text-xs font-semibold text-rose-800 bg-rose-50 rounded-lg disabled:opacity-40 cursor-pointer"
                              >
                                PDF
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-4 w-10 text-center">Incluir</th>
                    <th className="py-3 px-3">Semana / Liquidación</th>
                    <th className="py-3 px-3">Consultor</th>
                    <th className="py-3 px-3">Centro de Costo</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-3 text-center">Fact.</th>
                    <th className="py-3 px-3 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Planilla</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLiquidaciones.map((liq) => {
                    const isChecked = !excludedLiqIds.has(liq.id);
                    const cc = resolveLiquidationCostCenter(liq, consultores);
                    return (
                      <tr
                        key={liq.id}
                        className={`transition-colors ${
                          isChecked ? 'bg-white hover:bg-slate-50/80' : 'bg-slate-50/60 opacity-60'
                        }`}
                      >
                        <td className="py-3 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleLiquidationSelection(liq.id)}
                            aria-label={`Incluir liquidación ${liq.lineaLiquidacion}`}
                            className="w-4 h-4 rounded border-slate-300 text-[#1E60A8] cursor-pointer"
                          />
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900">
                            <span className="font-mono text-[#1E60A8] mr-1.5">
                              Sem #{liq.semana || '-'}
                            </span>
                            {liq.lineaLiquidacion || 'Sin título'}
                          </div>
                          <div className="text-[11px] text-slate-500">{liq.empresa}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">
                            {liq.consultorNombre}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500">
                            {liq.consultorEmail}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={
                                cc ? 'font-semibold text-[#132B63]' : 'text-amber-700 italic'
                              }
                            >
                              {cc || 'Sin asignar'}
                            </span>
                            {permissions.canOperate && (
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingCC({
                                    consultorId: liq.consultorId,
                                    consultorNombre: liq.consultorNombre,
                                    consultorEmail: liq.consultorEmail,
                                    empresa: liq.empresa,
                                    centroCosto: cc,
                                  })
                                }
                                title="Editar Centro de Costo"
                                className="p-1 text-slate-400 hover:text-[#1E60A8] rounded cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`text-[11px] font-semibold ${
                              liq.estado === 'enviada'
                                ? 'text-emerald-700'
                                : liq.estado === 'cerrada'
                                ? 'text-sky-700'
                                : 'text-amber-700'
                            }`}
                          >
                            {liq.estado === 'enviada'
                              ? 'Enviada'
                              : liq.estado === 'cerrada'
                              ? 'Cerrada'
                              : 'Abierta'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono tabular-nums text-slate-700">
                          {liq.items.length}
                        </td>
                        <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-[#132B63] whitespace-nowrap">
                          {formatViaticoAmount(liq.totalLiquidacion, liq.monedaBase, true)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onPreviewPlanillaPdf(liq)}
                              disabled={liq.items.length === 0}
                              title="Vista PDF / Imprimir Planilla"
                              className="p-1.5 text-[#1E60A8] hover:bg-sky-50 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownloadLiquidationExcel(liq)}
                              disabled={liq.items.length === 0}
                              title="Descargar Excel individual"
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                            </button>
                            {onDownloadLiquidationPdf && (
                              <button
                                type="button"
                                onClick={() => onDownloadLiquidationPdf(liq)}
                                disabled={liq.items.length === 0}
                                title="Descargar PDF con comprobantes escaneados"
                                className="p-1.5 text-rose-700 hover:bg-rose-50 disabled:opacity-40 rounded-lg cursor-pointer"
                              >
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* 6D. SUB-TAB 4: BASES DE DATOS MAESTRAS ODOO */}
      {subTab === 'bases_datos' && onSaveOdooCatalogs && (
        <ViaticosOdooCatalogsPanel
          catalogs={resolvedCatalogs}
          permissionRecords={permissionRecords}
          permissions={permissions}
          currentUserEmail={currentUserEmail}
          currentUserName={currentUserName}
          onSaveOdooCatalogs={onSaveOdooCatalogs}
          onUpsertPermissionRecord={onUpsertPermissionRecord}
          onNotify={onNotify}
        />
      )}

      {/* Quick Inline Cost Center Assignment Modal */}
      {editingCC && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setEditingCC(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-[#132B63] text-white flex items-center justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-200">
                  Centro de Costo Analítico · Odoo
                </div>
                <h3 className="text-sm sm:text-base font-bold mt-0.5">{editingCC.consultorNombre}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCC(null)}
                aria-label="Cerrar"
                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-blue-200 hover:text-white rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCostCenterEdit} className="p-4 sm:p-5 space-y-4">
              <div className="text-xs text-slate-600">
                Centro de Costo para{' '}
                <strong className="text-slate-900">{editingCC.consultorNombre}</strong> (
                <span className="font-mono">{editingCC.consultorEmail || editingCC.empresa}</span>
                ).
              </div>

              <div>
                <label className="block text-xs sm:text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Centro de Costo *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  list="contabilidad-cost-centers-list"
                  value={editingCC.centroCosto}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    const match = findMatchingCostCenterEntry(
                      nextVal,
                      undefined,
                      resolvedCatalogs.costCenters
                    );
                    setEditingCC({
                      ...editingCC,
                      centroCosto: nextVal,
                      odooAnalyticDistribution:
                        match?.analyticDistribution ||
                        editingCC.odooAnalyticDistribution,
                    });
                  }}
                  placeholder="Ej. GT10000601 CONTABILIDAD"
                  className="w-full min-h-[44px] sm:min-h-0 px-3.5 py-2 text-base sm:text-xs font-semibold rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
                <datalist id="contabilidad-cost-centers-list">
                  {costCenterSuggestions.map((cc) => (
                    <option key={cc} value={cc} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Empleado Odoo (employee_id)
                  </label>
                  <input
                    type="text"
                    list="contabilidad-odoo-emp-list"
                    value={editingCC.odooEmployeeName || ''}
                    onChange={(e) =>
                      setEditingCC({
                        ...editingCC,
                        odooEmployeeName: e.target.value,
                      })
                    }
                    placeholder="ELDER YOVANI JUAREZ..."
                    className="w-full px-3 py-2 text-xs uppercase rounded-xl border border-slate-300"
                  />
                  <datalist id="contabilidad-odoo-emp-list">
                    {resolvedCatalogs.employees
                      .filter((emp) => emp.activo !== false)
                      .map((emp) => (
                        <option key={emp.id} value={emp.nombreCompleto} />
                      ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    C.C. Interno Odoo (JSON)
                  </label>
                  <input
                    type="text"
                    value={editingCC.odooAnalyticDistribution || ''}
                    onChange={(e) =>
                      setEditingCC({
                        ...editingCC,
                        odooAnalyticDistribution: e.target.value,
                      })
                    }
                    placeholder='{"520": 100.0}'
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCC(null)}
                  className="min-h-[44px] sm:min-h-0 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar Centro de Costo</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Scanned Invoice Lightbox Viewer (Admin / Contabilidad) */}
      {receiptLightbox && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setReceiptLightbox(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[92dvh] sm:max-h-[90vh] overflow-hidden flex flex-col pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 sm:px-5 py-3.5 bg-[#132B63] text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">
                  {receiptLightbox.row.proveedor} ·{' '}
                  {formatViaticoAmount(
                    receiptLightbox.row.valorReintegrar,
                    receiptLightbox.row.monedaBase,
                    true
                  )}
                </div>
                <div className="text-[11px] text-sky-200 truncate">
                  {receiptLightbox.row.consultorNombre} · Fecha:{' '}
                  {receiptLightbox.row.fechaDoc || '-'} · Doc:{' '}
                  {receiptLightbox.row.documentoCompleto}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={receiptLightbox.media.dataUrl}
                  download={receiptLightbox.media.fileName || 'factura.jpg'}
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 text-white rounded-xl transition-colors"
                  title="Descargar factura escaneada"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Descargar</span>
                </a>
                <button
                  type="button"
                  onClick={() => setReceiptLightbox(null)}
                  className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-xl cursor-pointer"
                  aria-label="Cerrar vista previa"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-900/5 overflow-auto flex items-center justify-center p-3 sm:p-4 min-h-[320px] sm:min-h-[420px]">
              {receiptLightbox.media.mimeType === 'application/pdf' ? (
                <>
                  <iframe
                    src={receiptLightbox.media.dataUrl}
                    title={receiptLightbox.media.fileName}
                    className="hidden md:block w-full h-[70vh] rounded-lg border border-slate-200 bg-white"
                  />
                  <div className="md:hidden bg-white rounded-2xl border border-slate-200 p-6 text-center space-y-3 w-full">
                    <FileText className="w-10 h-10 text-rose-700 mx-auto" />
                    <div className="text-sm font-bold text-slate-900">
                      Comprobante PDF ({receiptLightbox.media.fileName})
                    </div>
                    <a
                      href={receiptLightbox.media.dataUrl}
                      download={receiptLightbox.media.fileName || 'factura.pdf'}
                      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 text-xs font-bold text-white bg-[#1E60A8] rounded-xl"
                    >
                      <Download className="w-4 h-4" />
                      <span>Descargar PDF</span>
                    </a>
                  </div>
                </>
              ) : (
                <img
                  src={receiptLightbox.media.dataUrl}
                  alt={receiptLightbox.media.fileName}
                  className="max-h-[72vh] max-w-full object-contain rounded-lg shadow-md"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface OdooCargaExpenseRowProps {
  row: OdooExpenseUploadRow;
  resolvedCatalogs: ViaticoOdooCatalogs;
  canOperate: boolean;
  onUpdateExpenseItemOdoo?: (
    liquidationId: string,
    itemId: string,
    patch: Partial<ViaticoExpenseItem>
  ) => void;
}

const OdooCargaExpenseRow: React.FC<OdooCargaExpenseRowProps> = ({
  row,
  resolvedCatalogs,
  canOperate,
  onUpdateExpenseItemOdoo,
}) => {
  const isSubRow = Boolean(row.isGeneratedSubRow);
  const selectedDistOption = useMemo(
    () =>
      row.odooDistributionOptionId
        ? resolvedCatalogs.expenseDistributions.find(
            (d) => d.id === row.odooDistributionOptionId
          )
        : undefined,
    [row.odooDistributionOptionId, resolvedCatalogs.expenseDistributions]
  );

  const [localValueText, setLocalValueText] = useState<string>(() =>
    row.odooDistributionValue && row.odooDistributionValue > 0
      ? String(row.odooDistributionValue)
      : ''
  );
  const [localSplitText, setLocalSplitText] = useState<string>(() =>
    row.odooSplitCount && row.odooSplitCount >= 2 ? String(row.odooSplitCount) : '2'
  );
  const [localCecosText, setLocalCecosText] = useState<string>(
    () => row.odooSplitCostCentersText || (row.odooSplitCostCenters || []).join(', ')
  );
  const [isCecoPickerOpen, setIsCecoPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);
  const cecoBtnRef = useRef<HTMLButtonElement | null>(null);
  const cecoPopoverRef = useRef<HTMLDivElement | null>(null);

  // Sync controlled inputs if external row state changes
  useEffect(() => {
    const extVal =
      row.odooDistributionValue && row.odooDistributionValue > 0
        ? String(row.odooDistributionValue)
        : '';
    if (Number(localValueText || 0) !== Number(extVal || 0)) {
      setLocalValueText(extVal);
    }
  }, [row.odooDistributionValue]);

  useEffect(() => {
    const extSplit =
      row.odooSplitCount && row.odooSplitCount >= 2 ? String(row.odooSplitCount) : '2';
    if (localSplitText !== extSplit && row.odooDistributionMode === 'multi_ceco') {
      setLocalSplitText(extSplit);
    }
  }, [row.odooSplitCount, row.odooDistributionMode]);

  useEffect(() => {
    const extText =
      row.odooSplitCostCentersText ?? (row.odooSplitCostCenters || []).join(', ');
    if (extText !== localCecosText && !isCecoPickerOpen) {
      setLocalCecosText(extText);
    }
  }, [row.odooSplitCostCentersText, row.odooSplitCostCenters]);

  useEffect(() => {
    if (!isCecoPickerOpen) return;
    const handleOutside = (ev: MouseEvent) => {
      const target = ev.target as Node;
      if (
        cecoPopoverRef.current?.contains(target) ||
        cecoBtnRef.current?.contains(target)
      ) {
        return;
      }
      setIsCecoPickerOpen(false);
    };
    const handleScroll = () => setIsCecoPickerOpen(false);
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('resize', handleScroll);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isCecoPickerOpen]);

  const activeCostCenters = useMemo(
    () => resolvedCatalogs.costCenters.filter((cc) => cc.activo !== false),
    [resolvedCatalogs.costCenters]
  );

  const selectedCecoCodes = useMemo(() => {
    if (Array.isArray(row.odooSplitCostCenters) && row.odooSplitCostCenters.length > 0) {
      return row.odooSplitCostCenters;
    }
    return String(row.odooSplitCostCentersText || '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }, [row.odooSplitCostCenters, row.odooSplitCostCentersText]);

  const isCodeSelected = (ccCode: string, ccAnalytic: string) =>
    selectedCecoCodes.some((tok) => {
      const normTok = tok.trim().toUpperCase();
      return (
        normTok === ccCode.trim().toUpperCase() ||
        normTok === ccAnalytic.trim().toUpperCase()
      );
    });

  const handleToggleCecoCode = (ccCode: string) => {
    if (!onUpdateExpenseItemOdoo) return;
    const exists = selectedCecoCodes.some(
      (t) => t.trim().toUpperCase() === ccCode.trim().toUpperCase()
    );
    const nextList = exists
      ? selectedCecoCodes.filter(
          (t) => t.trim().toUpperCase() !== ccCode.trim().toUpperCase()
        )
      : [...selectedCecoCodes, ccCode];
    const nextText = nextList.join(', ');
    setLocalCecosText(nextText);
    onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
      odooSplitCostCenters: nextList,
      odooSplitCostCentersText: nextText,
    });
  };

  const openCecoPicker = () => {
    if (isCecoPickerOpen) {
      setIsCecoPickerOpen(false);
      return;
    }
    const rect = cecoBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const popoverW = 260;
      const popoverH = 250;
      const left = Math.max(8, Math.min(window.innerWidth - popoverW - 12, rect.right - popoverW));
      const spaceBelow = window.innerHeight - rect.bottom;
      const top =
        spaceBelow >= popoverH + 8
          ? rect.bottom + 4
          : Math.max(8, rect.top - popoverH - 4);
      setPickerPos({ top, left });
    }
    setIsCecoPickerOpen(true);
  };

  const origAmount = row.originalTotalAmountCurrency ?? row.total_amount_currency;
  const distMode = selectedDistOption?.mode || row.odooDistributionMode;

  return (
    <tr
      className={
        isSubRow
          ? 'bg-sky-50/55 hover:bg-sky-50/90 text-slate-700'
          : 'hover:bg-slate-50/80'
      }
    >
      <td className="py-2 px-3 font-medium text-slate-900 max-w-[240px]">
        {isSubRow && row.generatedReason && (
          <div className="mb-0.5 inline-flex items-center px-1.5 py-0.5 rounded bg-sky-100 text-[#1E60A8] text-[10px] font-bold">
            ↳ {row.generatedReason}
          </div>
        )}
        <div className="truncate" title={row.name}>
          {row.name}
        </div>
      </td>
      <td className="py-2 px-3">
        {!isSubRow && canOperate && onUpdateExpenseItemOdoo ? (
          <select
            value={row.product_id}
            onChange={(e) =>
              onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                odooProductId: e.target.value,
              })
            }
            aria-label="product_id"
            className="w-52 px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-200 bg-white"
          >
            {!resolvedCatalogs.expenseCodes.some(
              (c) => c.labelOdoo === row.product_id
            ) && <option value={row.product_id}>{row.product_id}</option>}
            {resolvedCatalogs.expenseCodes
              .filter((c) => c.activo !== false)
              .map((c) => (
                <option key={c.id} value={c.labelOdoo}>
                  {c.labelOdoo}
                </option>
              ))}
          </select>
        ) : (
          <span className="font-mono text-[11px] text-[#132B63]">{row.product_id}</span>
        )}
      </td>
      <td className="py-2 px-2.5 text-right font-mono font-bold tabular-nums text-[#132B63]">
        <div>{row.total_amount_currency.toFixed(2)}</div>
        {!isSubRow &&
          ((distMode === 'extra_charge' && (row.odooDistributionValue || 0) > 0) ||
            (distMode === 'multi_ceco' && (row.splitTotal || 1) >= 2)) && (
            <div className="text-[10px] font-normal text-slate-400">
              {distMode === 'multi_ceco'
                ? `1/${row.splitTotal} de ${origAmount.toFixed(2)}`
                : `de ${origAmount.toFixed(2)}`}
            </div>
          )}
      </td>
      <td className="py-2 px-2.5 text-center font-mono font-bold text-slate-700">
        {row.currency_id}
      </td>
      <td className="py-2 px-3">
        {!isSubRow && canOperate && onUpdateExpenseItemOdoo ? (
          <select
            value={row.tax_ids}
            onChange={(e) =>
              onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                odooTaxIndicator: e.target.value,
              })
            }
            aria-label="tax_ids"
            className="w-56 px-2 py-1 text-[11px] rounded-lg border border-slate-200 bg-white"
          >
            {!resolvedCatalogs.taxIndicators.some(
              (t) => t.nombreImpuesto === row.tax_ids
            ) && <option value={row.tax_ids}>{row.tax_ids}</option>}
            {resolvedCatalogs.taxIndicators
              .filter((t) => t.activo !== false)
              .map((t) => (
                <option key={t.id} value={t.nombreImpuesto}>
                  {t.nombreImpuesto}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-[11px]">{row.tax_ids}</span>
        )}
      </td>
      <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">
        <div>{row.employee_id}</div>
        <div className="text-[10px] font-mono text-slate-400">{row.consultorEmail}</div>
      </td>
      <td className="py-2 px-2.5">
        {!isSubRow && canOperate && onUpdateExpenseItemOdoo ? (
          <select
            value={row.expense_type}
            onChange={(e) =>
              onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                odooExpenseType: e.target.value as OdooExpenseType,
              })
            }
            aria-label="expense_type"
            className="px-2 py-1 text-[11px] font-semibold rounded-lg border border-slate-200 bg-white"
          >
            <option value="Gasto">Gasto</option>
            <option value="Tarjeta">Tarjeta</option>
          </select>
        ) : (
          <span>{row.expense_type}</span>
        )}
      </td>
      <td className="py-2 px-2.5 text-center font-mono tabular-nums whitespace-nowrap">
        {row.date}
      </td>
      <td className="py-2 px-2.5 font-mono whitespace-nowrap">
        {row.Partner_id || '—'}
      </td>
      <td className="py-2 px-3 whitespace-nowrap text-slate-700">{row.Journal}</td>
      <td className="py-2 px-2.5 font-mono whitespace-nowrap">
        {row.vendor_ref || '—'}
      </td>
      <td className="py-2 px-2.5 font-mono whitespace-nowrap">
        {row.serial_number || '—'}
      </td>
      <td className="py-2 px-3 max-w-[200px]">
        <div className="truncate font-mono text-[11px]" title={row.payment_reference}>
          {row.payment_reference}
        </div>
      </td>
      <td className="py-2 px-3">
        {!isSubRow && canOperate && onUpdateExpenseItemOdoo ? (
          <select
            value={row.l10n_gt_edi_doc_type}
            onChange={(e) =>
              onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                odooDocType: e.target.value,
              })
            }
            aria-label="l10n_gt_edi_doc_type"
            className="w-48 px-2 py-1 text-[11px] rounded-lg border border-slate-200 bg-white"
          >
            {!resolvedCatalogs.docTypes.some(
              (d) => d.labelOdoo === row.l10n_gt_edi_doc_type
            ) && (
              <option value={row.l10n_gt_edi_doc_type}>
                {row.l10n_gt_edi_doc_type}
              </option>
            )}
            {resolvedCatalogs.docTypes
              .filter((d) => d.activo !== false)
              .map((d) => (
                <option key={d.id} value={d.labelOdoo}>
                  {d.labelOdoo}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-[11px]">{row.l10n_gt_edi_doc_type}</span>
        )}
      </td>
      <td className="py-2 px-3">
        {!isSubRow && canOperate && onUpdateExpenseItemOdoo ? (
          <select
            value={row.analytic_distribution}
            onChange={(e) => {
              const nextAnalytic = e.target.value;
              const ccEntry = resolvedCatalogs.costCenters.find(
                (cc) => cc.analyticDistribution === nextAnalytic
              );
              onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                odooAnalyticDistribution: nextAnalytic,
                odooCostCenterCode: ccEntry?.cuentaAnalitica || '',
              });
            }}
            aria-label="analytic_distribution"
            className="w-44 px-2 py-1 text-[11px] font-mono rounded-lg border border-slate-200 bg-white"
          >
            {!resolvedCatalogs.costCenters.some(
              (cc) => cc.analyticDistribution === row.analytic_distribution
            ) && (
              <option value={row.analytic_distribution}>
                {row.analytic_distribution || 'Sin asignar'}
              </option>
            )}
            {activeCostCenters.map((cc) => (
              <option key={cc.id} value={cc.analyticDistribution}>
                {cc.analyticDistribution} · {cc.cuentaAnalitica}
              </option>
            ))}
          </select>
        ) : (
          <span className="font-mono text-[11px] text-[#1E60A8]">
            {row.analytic_distribution || 'Sin asignar'}
          </span>
        )}
      </td>
      <td className="py-2 px-3 text-[11px] text-slate-500 whitespace-nowrap">
        {row.registeredByName || row.registeredByEmail || '—'}
      </td>

      {/* Col 17: Distribuir gastos */}
      <td className="py-2 px-3">
        {isSubRow ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-sky-100 text-[#1E60A8] text-[10px] font-bold whitespace-nowrap">
            ↳ Línea adicional
          </span>
        ) : canOperate && onUpdateExpenseItemOdoo ? (
          <select
            value={row.odooDistributionOptionId || ''}
            onChange={(e) => {
              const optId = e.target.value;
              if (!optId) {
                setLocalValueText('');
                setLocalSplitText('2');
                setLocalCecosText('');
                onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                  odooDistributionOptionId: '',
                  odooDistributionValue: 0,
                  odooSplitCount: undefined,
                  odooSplitCostCentersText: '',
                  odooSplitCostCenters: [],
                });
                return;
              }
              const opt = resolvedCatalogs.expenseDistributions.find((d) => d.id === optId);
              if (!opt) return;
              if (opt.mode === 'multi_ceco') {
                const nextCount =
                  row.odooSplitCount && row.odooSplitCount >= 2 ? row.odooSplitCount : 2;
                setLocalSplitText(String(nextCount));
                setLocalValueText('');
                onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                  odooDistributionOptionId: opt.id,
                  odooDistributionValue: 0,
                  odooSplitCount: nextCount,
                });
              } else {
                const nextVal =
                  row.odooDistributionValue && row.odooDistributionValue > 0
                    ? row.odooDistributionValue
                    : 0;
                setLocalValueText(nextVal > 0 ? String(nextVal) : '');
                onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                  odooDistributionOptionId: opt.id,
                  odooDistributionValue: nextVal,
                  odooSplitCount: undefined,
                });
              }
            }}
            aria-label="Distribuir gastos"
            className="w-40 px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-200 bg-white"
          >
            <option value="">Sin distribución</option>
            {selectedDistOption && selectedDistOption.activo === false && (
              <option value={selectedDistOption.id}>{selectedDistOption.nombre}</option>
            )}
            {resolvedCatalogs.expenseDistributions
              .filter((d) => d.activo !== false)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-[11px] text-slate-600">
            {selectedDistOption?.nombre || '—'}
          </span>
        )}
      </td>

      {/* Col 18: Dividir cantidad / Valor */}
      <td className="py-2 px-3">
        {isSubRow ? (
          <span className="text-[11px] text-slate-400">—</span>
        ) : distMode === 'extra_charge' ? (
          canOperate && onUpdateExpenseItemOdoo ? (
            <div className="w-28 space-y-0.5">
              <input
                type="number"
                step="0.01"
                min="0"
                max={origAmount}
                value={localValueText}
                placeholder="Valor"
                onChange={(e) => {
                  const raw = e.target.value;
                  setLocalValueText(raw);
                  const parsed = parseFloat(raw);
                  if (!Number.isFinite(parsed) || raw.trim() === '') {
                    onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                      odooDistributionValue: 0,
                    });
                    return;
                  }
                  const clamped = Math.max(0, Math.min(origAmount, parsed));
                  onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                    odooDistributionValue: clamped,
                  });
                }}
                onBlur={() => {
                  const parsed = parseFloat(localValueText);
                  if (!Number.isFinite(parsed) || parsed <= 0) {
                    setLocalValueText('');
                  } else {
                    const clamped = Math.max(0, Math.min(origAmount, parsed));
                    setLocalValueText(String(clamped));
                  }
                }}
                aria-label="Valor distribución"
                className="w-full px-2 py-1 text-[11px] font-mono text-right rounded-lg border border-slate-200 bg-white"
              />
              <div className="text-[10px] text-slate-400 text-right font-mono">
                {selectedDistOption?.naturaleza === 'bien' ? 'XB Bien' : 'XO Serv.'}
              </div>
            </div>
          ) : (
            <span className="font-mono text-[11px]">
              {(row.odooDistributionValue || 0).toFixed(2)}
            </span>
          )
        ) : distMode === 'multi_ceco' ? (
          canOperate && onUpdateExpenseItemOdoo ? (
            <div className="w-28 space-y-0.5">
              <input
                type="number"
                step="1"
                min="2"
                max="30"
                value={localSplitText}
                placeholder="Cant."
                onChange={(e) => {
                  const raw = e.target.value;
                  setLocalSplitText(raw);
                  const parsed = parseInt(raw, 10);
                  if (Number.isFinite(parsed) && parsed >= 2) {
                    const clamped = Math.min(30, parsed);
                    onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                      odooSplitCount: clamped,
                    });
                  }
                }}
                onBlur={() => {
                  const parsed = parseInt(localSplitText, 10);
                  const clamped = Number.isFinite(parsed)
                    ? Math.max(2, Math.min(30, parsed))
                    : 2;
                  setLocalSplitText(String(clamped));
                  onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                    odooSplitCount: clamped,
                  });
                }}
                aria-label="Dividir cantidad"
                className="w-full px-2 py-1 text-[11px] font-mono text-right rounded-lg border border-slate-200 bg-white"
              />
              <div className="text-[10px] text-slate-400 text-right">
                {row.splitTotal || 2} líneas
              </div>
            </div>
          ) : (
            <span className="font-mono text-[11px]">{row.odooSplitCount || 2} líneas</span>
          )
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
      </td>

      {/* Col 19: Cecos (Dividir) */}
      <td className="py-2 px-3">
        {isSubRow ? (
          <span className="font-mono text-[11px] text-slate-500">
            {row.costCenterLabel || '—'}
          </span>
        ) : distMode === 'multi_ceco' ? (
          canOperate && onUpdateExpenseItemOdoo ? (
            <div className="flex items-center gap-1.5 min-w-[230px]">
              <input
                type="text"
                value={localCecosText}
                placeholder="Ej. GT10000300, GT10000601"
                onChange={(e) => {
                  const text = e.target.value;
                  setLocalCecosText(text);
                  const tokens = text
                    .split(/[,;\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  onUpdateExpenseItemOdoo(row.liquidationId, row.itemId, {
                    odooSplitCostCentersText: text,
                    odooSplitCostCenters: tokens,
                  });
                }}
                aria-label="Cecos separados por coma"
                className="w-40 px-2 py-1 text-[11px] font-mono rounded-lg border border-slate-200 bg-white"
              />
              <button
                ref={cecoBtnRef}
                type="button"
                onClick={openCecoPicker}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#1E60A8] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg cursor-pointer whitespace-nowrap"
                title="Seleccionar múltiples centros de costo"
              >
                <span>{selectedCecoCodes.length || 'Elegir'}</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {isCecoPickerOpen && pickerPos && (
                <div
                  ref={cecoPopoverRef}
                  style={{ top: pickerPos.top, left: pickerPos.left }}
                  className="fixed z-50 w-[260px] bg-white rounded-xl border border-slate-200 shadow-xl p-2 space-y-1.5"
                >
                  <div className="flex items-center justify-between px-1 pb-1 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-slate-800">
                      Seleccionar Cecos ({selectedCecoCodes.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCecoPickerOpen(false)}
                      className="text-[11px] font-bold text-[#1E60A8] hover:underline cursor-pointer"
                    >
                      Listo
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-0.5">
                    {activeCostCenters.map((cc) => {
                      const checked = isCodeSelected(cc.codigo, cc.analyticDistribution);
                      return (
                        <label
                          key={cc.id}
                          className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50 cursor-pointer text-[11px]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => handleToggleCecoCode(cc.codigo)}
                            className="rounded border-slate-300 text-[#1E60A8]"
                          />
                          <span className="font-mono font-semibold text-slate-800">
                            {cc.codigo}
                          </span>
                          <span className="text-slate-400 truncate">
                            {cc.analyticDistribution}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <span className="font-mono text-[11px] text-slate-600">
              {row.odooSplitCostCentersText || '—'}
            </span>
          )
        ) : distMode === 'extra_charge' && selectedDistOption ? (
          <div className="max-w-[210px] truncate text-[10px] text-slate-500" title={selectedDistOption.expenseCodeLabel}>
            {selectedDistOption.expenseCodeLabel || 'Cuenta original'}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">—</span>
        )}
      </td>
    </tr>
  );
};

