import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Database,
  FileSpreadsheet,
  FileText,
  Download,
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
  Pencil,
  Check,
  Eye,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  BadgeCheck,
  Filter,
  FolderOpen,
} from 'lucide-react';
import {
  EffectivePermissions,
  OdooExpenseType,
  UserPermissionRecord,
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
  formatViaticoAmount,
  loadViaticoOdooConfig,
  resolveLiquidationCostCenter,
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
  onMarkLiquidationsContabilizadas?: (
    liquidationIds: string[],
    contabilizada: boolean
  ) => void;
  onUpsertPermissionRecord?: (record: UserPermissionRecord) => Promise<void>;
  onNotify: (type: 'success' | 'info' | 'error', message: string) => void;
}

type AccountingSubTab =
  | 'carga_odoo'
  | 'facturas'
  | 'centros'
  | 'bases_datos';
type StatusScopeFilter = 'CLOSED_AND_SENT' | 'ALL' | ViaticoLiquidationStatus;
type ContabilizadoFilter = 'ALL' | 'pendientes' | 'contabilizadas';

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
  onMarkLiquidationsContabilizadas,
  onUpsertPermissionRecord,
  onNotify,
}) => {
  const resolvedCatalogs = useMemo(
    () => mergeOdooCatalogsWithDefaults(odooCatalogs),
    [odooCatalogs]
  );

  const [subTab, setSubTab] = useState<AccountingSubTab>('carga_odoo');
  const [statusFilter, setStatusFilter] = useState<StatusScopeFilter>('ALL');
  const [contabilizadoFilter, setContabilizadoFilter] =
    useState<ContabilizadoFilter>('ALL');
  const [weekFilter, setWeekFilter] = useState<string>('ALL');
  const [consultorFilter, setConsultorFilter] = useState<string>('ALL');
  const [costCenterFilter, setCostCenterFilter] = useState<string>('ALL');
  const [companyFilter, setCompanyFilter] = useState<string>('ALL');
  const [currencyFilter, setCurrencyFilter] = useState<'ALL' | ViaticoCurrency>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Agrupación por liquidación (desactivada por defecto; activable a solicitud del usuario)
  const [groupByLiquidation, setGroupByLiquidation] = useState<boolean>(false);
  const [collapsedLiqIds, setCollapsedLiqIds] = useState<Set<string>>(() => new Set());
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(false);

  // Alerta explícita de contabilizado tras descarga de archivo Odoo
  const [accountingDownloadAlert, setAccountingDownloadAlert] = useState<{
    variant: 'success' | 'warning';
    formatLabel: string;
    filename: string;
    exportedCount: number;
    newlyCount: number;
    alreadyCount: number;
    summaryLabel: string;
    atIso: string;
  } | null>(null);

  // Track explicitly excluded liquidation IDs so newly filtered/added liquidations are included automatically
  const [excludedLiqIds, setExcludedLiqIds] = useState<Set<string>>(() => new Set());

  // Odoo defaults for product-based accounting export
  const [odooConfig] = useState<ViaticoOdooConfig>(() => loadViaticoOdooConfig());

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

  // 1A. Filter liquidations across ALL liquidadores (before contabilizado filter so pill counts stay accurate)
  const baseFilteredLiquidaciones = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = liquidaciones.filter((liq) => {
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

    return list.sort((a, b) => {
      const wa = Number(a.semana);
      const wb = Number(b.semana);
      if (Number.isFinite(wa) && Number.isFinite(wb) && wa !== wb) {
        return wb - wa;
      }
      const semCmp = (b.semana || '').localeCompare(a.semana || '');
      if (semCmp !== 0) return semCmp;
      const consCmp = a.consultorNombre.localeCompare(b.consultorNombre);
      if (consCmp !== 0) return consCmp;
      return (b.updatedAtIso || b.createdAtIso || '').localeCompare(
        a.updatedAtIso || a.createdAtIso || ''
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

  const contabilizadoCounts = useMemo(() => {
    let pendientes = 0;
    let contabilizadas = 0;
    baseFilteredLiquidaciones.forEach((l) => {
      if (l.contabilizada) contabilizadas += 1;
      else pendientes += 1;
    });
    return {
      total: baseFilteredLiquidaciones.length,
      pendientes,
      contabilizadas,
    };
  }, [baseFilteredLiquidaciones]);

  // 1B. Apply Contabilizado filter
  const filteredLiquidaciones = useMemo(() => {
    if (contabilizadoFilter === 'pendientes') {
      return baseFilteredLiquidaciones.filter((l) => !l.contabilizada);
    }
    if (contabilizadoFilter === 'contabilizadas') {
      return baseFilteredLiquidaciones.filter((l) => Boolean(l.contabilizada));
    }
    return baseFilteredLiquidaciones;
  }, [baseFilteredLiquidaciones, contabilizadoFilter]);

  // 2. Apply batch selection checkboxes
  const selectedLiquidaciones = useMemo(
    () => filteredLiquidaciones.filter((l) => !excludedLiqIds.has(l.id)),
    [filteredLiquidaciones, excludedLiqIds]
  );

  // 2B. Grouped per-liquidation datasets (for Agrupado por Liquidación)
  const groupedLiquidations = useMemo(
    () =>
      filteredLiquidaciones.map((liq) => ({
        liq,
        resolvedCC: resolveLiquidationCostCenter(
          liq,
          consultores,
          resolvedCatalogs,
          permissionRecords
        ),
        dataset: buildOdooAccountingDataset(
          [liq],
          consultores,
          odooConfig,
          resolvedCatalogs,
          permissionRecords
        ),
      })),
    [
      filteredLiquidaciones,
      consultores,
      odooConfig,
      resolvedCatalogs,
      permissionRecords,
    ]
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
    const ids = Array.from(
      new Set([
        ...dataset.expenseRows.map((r) => r.attachmentId || ''),
        ...filteredLiquidaciones.flatMap((l) =>
          l.items.map((it) => it.attachmentId || '')
        ),
      ])
    ).filter(Boolean);
    if (ids.length === 0) return;
    void onEnsureMediaLoaded(ids);
  }, [subTab, dataset.expenseRows, filteredLiquidaciones, onEnsureMediaLoaded]);

  // Distinct liquidadores represented in the active batch
  const distinctSelectedLiquidadores = useMemo(() => {
    const s = new Set<string>();
    selectedLiquidaciones.forEach((l) => s.add(l.consultorEmail || l.consultorNombre));
    return s.size;
  }, [selectedLiquidaciones]);

  const alreadyContabilizedInBatch = useMemo(
    () => selectedLiquidaciones.filter((l) => Boolean(l.contabilizada)),
    [selectedLiquidaciones]
  );

  const batchLabel = useMemo(() => {
    const parts: string[] = [];
    if (weekFilter !== 'ALL') parts.push(`Sem${weekFilter}`);
    if (consultorFilter !== 'ALL') parts.push(consultorFilter.split(' ').slice(0, 2).join('_'));
    if (companyFilter !== 'ALL') parts.push(companyFilter);
    if (costCenterFilter !== 'ALL' && costCenterFilter !== '__UNASSIGNED__') {
      parts.push(costCenterFilter);
    }
    return parts.length > 0 ? parts.join('_') : 'Consolidado';
  }, [weekFilter, consultorFilter, companyFilter, costCenterFilter]);

  const buildSingleLiquidationSlug = (liq: ViaticoLiquidation) => {
    const consPart = (liq.consultorNombre || 'Consultor')
      .split(' ')
      .slice(0, 2)
      .join('_');
    return `Sem${liq.semana || '0'}_${consPart}_${(liq.lineaLiquidacion || 'Liq').slice(0, 20)}`;
  };

  const hasActiveFilters =
    statusFilter !== 'ALL' ||
    contabilizadoFilter !== 'ALL' ||
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

  const toggleLiquidationCollapse = (id: string) => {
    setCollapsedLiqIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAllLiquidations = () => setCollapsedLiqIds(new Set());
  const collapseAllLiquidations = () =>
    setCollapsedLiqIds(new Set(filteredLiquidaciones.map((l) => l.id)));

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

  const registerDownloadAndTriggerAlert = (
    exportedLiqs: ViaticoLiquidation[],
    formatLabel: string,
    filename: string
  ) => {
    if (exportedLiqs.length === 0) return;
    const alreadyMarked = exportedLiqs.filter((l) => Boolean(l.contabilizada));
    const newlyMarked = exportedLiqs.filter((l) => !l.contabilizada);
    const summaryLabel =
      exportedLiqs
        .slice(0, 3)
        .map((l) => `Sem #${l.semana || '-'} · ${l.consultorNombre}`)
        .join(' | ') +
      (exportedLiqs.length > 3 ? ` (+${exportedLiqs.length - 3} más)` : '');

    onMarkLiquidationsContabilizadas?.(
      exportedLiqs.map((l) => l.id),
      true
    );

    setAccountingDownloadAlert({
      variant: alreadyMarked.length > 0 ? 'warning' : 'success',
      formatLabel,
      filename,
      exportedCount: exportedLiqs.length,
      newlyCount: newlyMarked.length,
      alreadyCount: alreadyMarked.length,
      summaryLabel,
      atIso: new Date().toISOString(),
    });
  };

  const handleExportOdooExcel = async (targetLiquidations?: ViaticoLiquidation[]) => {
    const targetList =
      targetLiquidations && targetLiquidations.length > 0
        ? targetLiquidations
        : selectedLiquidaciones;
    const exportDataset = buildOdooAccountingDataset(
      targetList,
      consultores,
      odooConfig,
      resolvedCatalogs,
      permissionRecords,
      { expandEmployeeSplitsForDownload: true }
    );
    if (exportDataset.expenseRows.length === 0) return;
    const exportSlug =
      targetList.length === 1 && targetLiquidations
        ? buildSingleLiquidationSlug(targetList[0])
        : batchLabel;
    setIsExportingExcel(true);
    try {
      const filename = await exportViaticosOdooExcel(exportDataset, odooConfig, exportSlug);
      registerDownloadAndTriggerAlert(targetList, 'Excel Odoo (.xlsx)', filename);
      onNotify(
        'success',
        `Archivo contable Odoo descargado: ${filename} (${targetList.length} liquidación(es) marcada(s) como CONTABILIZADAS).`
      );
    } catch (err: any) {
      onNotify('error', err?.message || 'No se pudo generar el Excel contable para Odoo.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportOdooCsv = (
    mode: 'gastos' | 'facturas',
    targetLiquidations?: ViaticoLiquidation[]
  ) => {
    const targetList =
      targetLiquidations && targetLiquidations.length > 0
        ? targetLiquidations
        : selectedLiquidaciones;
    const exportDataset = buildOdooAccountingDataset(
      targetList,
      consultores,
      odooConfig,
      resolvedCatalogs,
      permissionRecords,
      { expandEmployeeSplitsForDownload: true }
    );
    if (exportDataset.expenseRows.length === 0) return;
    const exportSlug =
      targetList.length === 1 && targetLiquidations
        ? buildSingleLiquidationSlug(targetList[0])
        : batchLabel;
    try {
      const filename = exportViaticosOdooCsv(exportDataset, mode, exportSlug);
      if (mode === 'gastos') {
        registerDownloadAndTriggerAlert(
          targetList,
          'CSV Carga Odoo (Hoja 1)',
          filename
        );
      }
      onNotify(
        'success',
        mode === 'gastos'
          ? `CSV Carga Odoo (Hoja 1 · Plantilla GT S-44) descargado: ${filename} (${targetList.length} liquidación(es) marcada(s) como CONTABILIZADAS).`
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
            onClick={() => {
              void handleExportOdooExcel();
            }}
            disabled={dataset.expenseRows.length === 0 || isExportingExcel}
            className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-2 min-h-[40px] px-4 py-2 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
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
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-[#132B63] bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="CSV Hoja 1 exacto para importación en Odoo (Plantilla Gastos GT S-44)"
          >
            <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
            <span>CSV Carga Odoo</span>
          </button>

          <button
            type="button"
            onClick={() => handleExportOdooCsv('facturas')}
            disabled={dataset.expenseRows.length === 0}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="CSV plano consolidado con todas las facturas y centros de costo"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>CSV Facturas</span>
          </button>

          <button
            type="button"
            onClick={handleExportContabilidadPdf}
            disabled={dataset.expenseRows.length === 0 || isExportingPdf}
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 disabled:opacity-50 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            title="Descargar reporte PDF resumido para archivo contable"
          >
            <FileText className="w-3.5 h-3.5 text-rose-700" />
            <span>{isExportingPdf ? 'Generando PDF...' : 'PDF Resumen'}</span>
          </button>
        </div>
      </section>

      {/* 1B. Alerta de Contabilizado tras descarga */}
      {accountingDownloadAlert && (
        <section
          role="alert"
          className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs ${
            accountingDownloadAlert.variant === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-emerald-50 border-emerald-300 text-emerald-950'
          }`}
        >
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                accountingDownloadAlert.variant === 'warning'
                  ? 'bg-amber-200/80 text-amber-900'
                  : 'bg-emerald-200/80 text-emerald-900'
              }`}
            >
              {accountingDownloadAlert.variant === 'warning' ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <BadgeCheck className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider">
                  {accountingDownloadAlert.variant === 'warning'
                    ? 'Alerta de Contabilizado (Ya descargado previamente)'
                    : 'Alerta de Contabilizado'}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-white/80 border border-current/15 font-semibold">
                  {accountingDownloadAlert.formatLabel}
                </span>
              </div>
              <p className="text-xs leading-relaxed">
                {accountingDownloadAlert.variant === 'warning' ? (
                  <>
                    Atención: <strong>{accountingDownloadAlert.alreadyCount}</strong> de{' '}
                    <strong>{accountingDownloadAlert.exportedCount}</strong> liquidación(es)
                    descargada(s) (<strong>{accountingDownloadAlert.summaryLabel}</strong>) ya
                    tenían marca de <strong>Contabilizado</strong>. Verifica en Odoo antes de
                    reimportar para evitar duplicados.
                  </>
                ) : (
                  <>
                    Se descargó <strong>{accountingDownloadAlert.filename}</strong> y se
                    marcó automáticamente como <strong>Contabilizado</strong> (
                    <strong>{accountingDownloadAlert.exportedCount}</strong> liquidación(es):{' '}
                    <strong>{accountingDownloadAlert.summaryLabel}</strong>).
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {contabilizadoCounts.pendientes > 0 &&
              contabilizadoFilter !== 'pendientes' && (
                <button
                  type="button"
                  onClick={() => setContabilizadoFilter('pendientes')}
                  className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white hover:bg-slate-50 border border-current/20 text-slate-900 cursor-pointer whitespace-nowrap"
                >
                  Ver solo pendientes ({contabilizadoCounts.pendientes})
                </button>
              )}
            <button
              type="button"
              onClick={() => setAccountingDownloadAlert(null)}
              aria-label="Cerrar alerta de contabilizado"
              className="p-1.5 rounded-lg hover:bg-black/5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
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
            exentas · contabilización por producto
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

      {/* 4B. Persistent Alert Strip if current batch includes already-contabilized liquidations */}
      {alreadyContabilizedInBatch.length > 0 &&
        contabilizadoFilter === 'ALL' &&
        !accountingDownloadAlert && (
          <div className="px-4 py-2.5 rounded-2xl bg-emerald-50/90 border border-emerald-200 text-emerald-950 text-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <BadgeCheck className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>
                <strong>Alerta de Contabilizado:</strong>{' '}
                {alreadyContabilizedInBatch.length} liquidación(es) visible(s) ya fueron
                descargadas y marcadas como <strong>Contabilizadas</strong>.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setContabilizadoFilter('pendientes')}
              className="px-2.5 py-1 text-[11px] font-bold text-emerald-900 bg-white hover:bg-emerald-100 border border-emerald-300 rounded-lg cursor-pointer whitespace-nowrap"
            >
              Ocultar contabilizadas (ver {contabilizadoCounts.pendientes} pendientes)
            </button>
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

        {/* Multi-Liquidador Primary Filter Row */}
        {(() => {
          const secondaryActiveCount =
            (statusFilter !== 'ALL' ? 1 : 0) +
            (currencyFilter !== 'ALL' ? 1 : 0) +
            (costCenterFilter !== 'ALL' ? 1 : 0) +
            (companyFilter !== 'ALL' ? 1 : 0);

          return (
            <>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                {/* Contabilizado Quick Filter */}
                <div
                  role="group"
                  aria-label="Filtrar por estado de contabilización"
                  className="col-span-2 sm:col-span-1 inline-flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 gap-0.5"
                >
                  <button
                    type="button"
                    onClick={() => setContabilizadoFilter('ALL')}
                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      contabilizadoFilter === 'ALL'
                        ? 'bg-white text-[#132B63] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas ({contabilizadoCounts.total})
                  </button>
                  <button
                    type="button"
                    onClick={() => setContabilizadoFilter('pendientes')}
                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                      contabilizadoFilter === 'pendientes'
                        ? 'bg-amber-100 text-amber-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pendientes ({contabilizadoCounts.pendientes})
                  </button>
                  <button
                    type="button"
                    onClick={() => setContabilizadoFilter('contabilizadas')}
                    className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1 ${
                      contabilizadoFilter === 'contabilizadas'
                        ? 'bg-emerald-100 text-emerald-950 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <BadgeCheck className="w-3 h-3" />
                    <span>Contabilizadas ({contabilizadoCounts.contabilizadas})</span>
                  </button>
                </div>

                <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5 col-span-2 sm:col-span-1">
                  <Users className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                  <select
                    value={consultorFilter}
                    aria-label="Filtrar por consultor o liquidador"
                    onChange={(e) => setConsultorFilter(e.target.value)}
                    className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer sm:max-w-[200px]"
                  >
                    <option value="ALL">Consultor: Todos</option>
                    {filterOptions.consultores.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                  <select
                    value={weekFilter}
                    aria-label="Filtrar por semana"
                    onChange={(e) => setWeekFilter(e.target.value)}
                    className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer"
                  >
                    <option value="ALL">Semana: Todas</option>
                    {filterOptions.weeks.map((w) => (
                      <option key={w} value={w}>
                        Semana #{w}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowMoreFilters((v) => !v)}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
                    showMoreFilters || secondaryActiveCount > 0
                      ? 'bg-[#132B63]/5 text-[#132B63] border-[#132B63]/25'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>
                    Más filtros{secondaryActiveCount > 0 ? ` (${secondaryActiveCount})` : ''}
                  </span>
                  {showMoreFilters ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </button>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setContabilizadoFilter('ALL');
                      setWeekFilter('ALL');
                      setConsultorFilter('ALL');
                      setCostCenterFilter('ALL');
                      setCompanyFilter('ALL');
                      setCurrencyFilter('ALL');
                      setSearchQuery('');
                    }}
                    className="col-span-2 sm:col-span-1 min-h-[36px] lg:min-h-0 text-xs font-semibold text-[#1E60A8] hover:text-[#132B63] px-2 py-1 cursor-pointer whitespace-nowrap text-left sm:text-center"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              {/* Secondary Collapsible Filters Drawer */}
              {(showMoreFilters || secondaryActiveCount > 0) && (
                <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                  <select
                    value={statusFilter}
                    aria-label="Filtrar por estado de liquidación"
                    onChange={(e) => setStatusFilter(e.target.value as StatusScopeFilter)}
                    className="min-h-[40px] lg:min-h-0 text-sm lg:text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 cursor-pointer"
                  >
                    <option value="ALL">Todos los estados</option>
                    <option value="CLOSED_AND_SENT">Solo Cerradas y Enviadas</option>
                    <option value="cerrada">Solo Cerradas</option>
                    <option value="enviada">Solo Enviadas</option>
                    <option value="borrador">Solo Abiertas (Borrador)</option>
                  </select>

                  <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5">
                    <Coins className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                    <select
                      value={currencyFilter}
                      aria-label="Filtrar por moneda"
                      onChange={(e) =>
                        setCurrencyFilter(e.target.value as 'ALL' | ViaticoCurrency)
                      }
                      className="w-full text-sm lg:text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer"
                    >
                      <option value="ALL">Todas las monedas</option>
                      {filterOptions.currencies.map((cur) => (
                        <option key={cur} value={cur}>
                          {cur} ({CURRENCY_SYMBOLS[cur]})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5">
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
                    <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 min-h-[40px] lg:min-h-0 lg:py-1.5">
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
                </div>
              )}
            </>
          );
        })()}
      </section>

      {/* 6.0 SUB-TAB 0: CARGA ODOO HOJA 1 (FORMATO PLANTILLA GASTOS GT S-44) */}
      {subTab === 'carga_odoo' && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-clip">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-slate-900">
                Hoja 1 Odoo (hr.expense · Plantilla Gastos GT S-44) —{' '}
                {groupByLiquidation
                  ? `${filteredLiquidaciones.length} liquidación(es) · ${dataset.hrExpenseRows.length} líneas seleccionadas`
                  : `${dataset.hrExpenseRows.length} líneas`}
              </span>
              <div className="text-[11px] text-slate-500">
                Agrupa por liquidación para revisar y descargar una liquidación individual o un lote consolidado. Al descargar se marca automáticamente como Contabilizado.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setGroupByLiquidation((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border cursor-pointer transition-colors ${
                  groupByLiquidation
                    ? 'bg-[#132B63] text-white border-[#132B63]'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>
                  {groupByLiquidation ? 'Agrupado por liquidación' : 'Agrupar por liquidación'}
                </span>
              </button>

              {groupByLiquidation && filteredLiquidaciones.length > 1 && (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={expandAllLiquidations}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Expandir
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllLiquidations}
                    className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Colapsar
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={() => setSubTab('bases_datos')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-[#1E60A8] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl cursor-pointer"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Administrar Catálogos Odoo</span>
              </button>
            </div>
          </div>

          {groupByLiquidation ? (
            <div className="p-3 sm:p-4 space-y-3 bg-slate-50/60">
              {groupedLiquidations.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                  No hay liquidaciones para mostrar con los filtros actuales.
                </div>
              ) : (
                groupedLiquidations.map(({ liq, resolvedCC, dataset: liqDataset }) => {
                  const isIncluded = !excludedLiqIds.has(liq.id);
                  const isCollapsed = collapsedLiqIds.has(liq.id);
                  const isContab = Boolean(liq.contabilizada);
                  const contabDateLabel = liq.contabilizadaAtIso
                    ? new Date(liq.contabilizadaAtIso).toLocaleDateString('es-GT', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      })
                    : '';

                  return (
                    <div
                      key={liq.id}
                      className={`rounded-2xl border overflow-clip bg-white transition-all ${
                        isContab
                          ? 'border-emerald-300/90'
                          : isIncluded
                          ? 'border-slate-200'
                          : 'border-slate-200 opacity-70'
                      }`}
                    >
                      {/* Liquidation Group Header */}
                      <div
                        className={`px-3.5 sm:px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b ${
                          isContab
                            ? 'bg-emerald-50/75 border-emerald-200/80'
                            : 'bg-slate-50/90 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={isIncluded}
                            onChange={() => toggleLiquidationSelection(liq.id)}
                            aria-label={`Incluir liquidación ${liq.lineaLiquidacion}`}
                            title="Incluir o excluir del lote consolidado"
                            className="mt-1 w-4 h-4 rounded border-slate-300 text-[#1E60A8] cursor-pointer shrink-0"
                          />

                          <button
                            type="button"
                            onClick={() => toggleLiquidationCollapse(liq.id)}
                            aria-label={isCollapsed ? 'Expandir liquidación' : 'Colapsar liquidación'}
                            className="mt-0.5 p-1 rounded-lg text-slate-600 hover:bg-white/80 hover:text-[#132B63] cursor-pointer shrink-0"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </button>

                          <div
                            onClick={() => toggleLiquidationCollapse(liq.id)}
                            className="min-w-0 cursor-pointer"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#132B63] text-white font-mono text-[11px] font-bold">
                                Sem #{liq.semana || '-'}
                              </span>
                              <span className="text-sm font-bold text-slate-900 break-words">
                                {liq.lineaLiquidacion || 'Liquidación de Viáticos'}
                              </span>

                              {isContab ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-bold"
                                  title={
                                    liq.contabilizadaPorNombre
                                      ? `Contabilizado por ${liq.contabilizadaPorNombre}${contabDateLabel ? ` el ${contabDateLabel}` : ''}`
                                      : 'Liquidación descargada y contabilizada'
                                  }
                                >
                                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>
                                    Contabilizado
                                    {contabDateLabel ? ` · ${contabDateLabel}` : ''}
                                    {(liq.contabilizadaDescargasCount || 0) > 1
                                      ? ` (${liq.contabilizadaDescargasCount}x)`
                                      : ''}
                                  </span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/90 border border-amber-200 text-amber-900 text-[11px] font-semibold">
                                  <Filter className="w-3 h-3 text-amber-700" />
                                  <span>Pendiente</span>
                                </span>
                              )}

                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  liq.estado === 'enviada'
                                    ? 'bg-sky-100 text-sky-800'
                                    : liq.estado === 'cerrada'
                                    ? 'bg-indigo-100 text-indigo-800'
                                    : 'bg-slate-200 text-slate-700'
                                }`}
                              >
                                {liq.estado === 'enviada'
                                  ? 'Enviada'
                                  : liq.estado === 'cerrada'
                                  ? 'Cerrada'
                                  : 'Abierta'}
                              </span>
                            </div>

                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                              <span className="font-semibold text-slate-800">
                                {liq.consultorNombre}
                              </span>
                              <span>· {liq.empresa}</span>
                              <span
                                className={
                                  resolvedCC ? 'font-mono text-[#1E60A8]' : 'text-amber-700 italic'
                                }
                              >
                                · C.C.: {resolvedCC || 'Sin asignar'}
                              </span>
                              <span>
                                · {liq.items.length} fact. ({liqDataset.hrExpenseRows.length} líneas Odoo)
                              </span>
                              <span className="font-mono font-bold text-[#132B63]">
                                · {formatViaticoAmount(liq.totalLiquidacion, liq.monedaBase, true)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Per-liquidation quick Odoo export + contabilizado toggle */}
                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              void handleExportOdooExcel([liq]);
                            }}
                            disabled={liqDataset.hrExpenseRows.length === 0 || isExportingExcel}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-45 rounded-lg cursor-pointer whitespace-nowrap"
                            title="Descargar Excel Odoo (.xlsx) solo de esta liquidación y marcar como Contabilizado"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                            <span>Excel Odoo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleExportOdooCsv('gastos', [liq])}
                            disabled={liqDataset.hrExpenseRows.length === 0}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-[#132B63] bg-white hover:bg-sky-50 border border-sky-200 disabled:opacity-45 rounded-lg cursor-pointer whitespace-nowrap"
                            title="Descargar CSV Hoja 1 Odoo solo de esta liquidación y marcar como Contabilizado"
                          >
                            <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
                            <span>CSV Odoo</span>
                          </button>

                          {permissions.canOperate && onMarkLiquidationsContabilizadas && (
                            <button
                              type="button"
                              onClick={() => {
                                onMarkLiquidationsContabilizadas([liq.id], !isContab);
                                onNotify(
                                  isContab ? 'info' : 'success',
                                  isContab
                                    ? `Liquidación "${liq.lineaLiquidacion}" marcada nuevamente como Pendiente.`
                                    : `Liquidación "${liq.lineaLiquidacion}" marcada como Contabilizada.`
                                );
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border cursor-pointer whitespace-nowrap ${
                                isContab
                                  ? 'bg-white text-slate-600 hover:text-slate-900 border-slate-300'
                                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200'
                              }`}
                              title={
                                isContab
                                  ? 'Revertir a Pendiente de contabilizar'
                                  : 'Marcar manualmente como Contabilizada'
                              }
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>{isContab ? 'Desmarcar' : 'Marcar contab.'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Liquidation Expense Lines */}
                      {!isCollapsed && (
                        <StickyHorizontalScrollContainer>
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
                              {liqDataset.hrExpenseRows.length === 0 ? (
                                <tr>
                                  <td colSpan={19} className="py-6 text-center text-slate-400">
                                    Esta liquidación aún no tiene comprobantes registrados.
                                  </td>
                                </tr>
                              ) : (
                                liqDataset.hrExpenseRows.map((row) => (
                                  <OdooCargaExpenseRow
                                    key={row.rowKey}
                                    row={row}
                                    resolvedCatalogs={resolvedCatalogs}
                                    canOperate={
                                      permissions.canOperate && Boolean(onUpdateExpenseItemOdoo)
                                    }
                                    onUpdateExpenseItemOdoo={onUpdateExpenseItemOdoo}
                                  />
                                ))
                              )}
                            </tbody>
                          </table>
                        </StickyHorizontalScrollContainer>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <StickyHorizontalScrollContainer>
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
            </StickyHorizontalScrollContainer>
          )}
        </section>
      )}

      {/* 6A. SUB-TAB 1: CONSOLIDADO DE FACTURAS (TODOS LOS LIQUIDADORES) */}
      {subTab === 'facturas' && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-clip">
          <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-900">
              Detalle Consolidado de Gastos (
              {groupByLiquidation
                ? `${filteredLiquidaciones.length} liquidación(es) · ${dataset.expenseRows.length} comprobantes seleccionados`
                : `${dataset.expenseRows.length} comprobantes`}
              )
            </span>
            <button
              type="button"
              onClick={() => setGroupByLiquidation((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-xl border cursor-pointer transition-colors ${
                groupByLiquidation
                  ? 'bg-[#132B63] text-white border-[#132B63]'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>
                {groupByLiquidation ? 'Agrupado por liquidación' : 'Agrupar por liquidación'}
              </span>
            </button>
          </div>

          {groupByLiquidation ? (
            <div className="p-3 sm:p-4 space-y-3 bg-slate-50/60">
              {groupedLiquidations.length === 0 ? (
                <div className="py-12 px-5 text-center text-sm text-slate-500 bg-white rounded-xl border border-slate-200">
                  No hay liquidaciones para mostrar con los filtros actuales.
                </div>
              ) : (
                groupedLiquidations.map(({ liq, resolvedCC, dataset: liqDataset }) => {
                  const isCollapsed = collapsedLiqIds.has(liq.id);
                  const isContab = Boolean(liq.contabilizada);
                  return (
                    <div
                      key={liq.id}
                      className={`rounded-2xl border overflow-clip bg-white ${
                        isContab ? 'border-emerald-300/90' : 'border-slate-200'
                      }`}
                    >
                      <div
                        className={`px-3.5 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 border-b ${
                          isContab
                            ? 'bg-emerald-50/75 border-emerald-200/80'
                            : 'bg-slate-50/90 border-slate-200/80'
                        }`}
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleLiquidationCollapse(liq.id)}
                            aria-label={isCollapsed ? 'Expandir liquidación' : 'Colapsar liquidación'}
                            className="mt-0.5 p-1 rounded-lg text-slate-600 hover:bg-white/80 cursor-pointer shrink-0"
                          >
                            {isCollapsed ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronUp className="w-4 h-4" />
                            )}
                          </button>
                          <div
                            onClick={() => toggleLiquidationCollapse(liq.id)}
                            className="min-w-0 cursor-pointer"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-[#132B63] text-white font-mono text-[11px] font-bold">
                                Sem #{liq.semana || '-'}
                              </span>
                              <span className="text-sm font-bold text-slate-900">
                                {liq.lineaLiquidacion || 'Liquidación de Viáticos'}
                              </span>
                              {isContab ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-bold">
                                  <BadgeCheck className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>Contabilizado</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/90 border border-amber-200 text-amber-900 text-[11px] font-semibold">
                                  <span>Pendiente</span>
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-600 flex flex-wrap gap-x-2.5">
                              <span className="font-semibold text-slate-800">
                                {liq.consultorNombre}
                              </span>
                              <span>· {liq.empresa}</span>
                              <span>· C.C.: {resolvedCC || 'Sin asignar'}</span>
                              <span>· {liqDataset.expenseRows.length} comprobantes</span>
                              <span className="font-mono font-bold text-[#132B63]">
                                · {formatViaticoAmount(liq.totalLiquidacion, liq.monedaBase, true)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              void handleExportOdooExcel([liq]);
                            }}
                            disabled={liqDataset.hrExpenseRows.length === 0 || isExportingExcel}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-45 rounded-lg cursor-pointer"
                          >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                            <span>Excel Odoo</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleExportOdooCsv('gastos', [liq])}
                            disabled={liqDataset.hrExpenseRows.length === 0}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-[#132B63] bg-white hover:bg-sky-50 border border-sky-200 disabled:opacity-45 rounded-lg cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
                            <span>CSV Odoo</span>
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <StickyHorizontalScrollContainer>
                          <table className="w-full text-left border-collapse text-xs min-w-[1160px]">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="py-2.5 px-3">Fecha Doc.</th>
                                <th className="py-2.5 px-2.5">Doc / NIT</th>
                                <th className="py-2.5 px-3">Proveedor / Descripción</th>
                                <th className="py-2.5 px-3">Categoría / Cuenta Odoo</th>
                                <th className="py-2.5 px-2.5 text-right">Base Sin Imp.</th>
                                <th className="py-2.5 px-2.5 text-right">IVA / Imp.</th>
                                <th className="py-2.5 px-3 text-right">Total Reintegrar</th>
                                <th className="py-2.5 px-2.5 text-center">Soporte</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {liqDataset.expenseRows.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="py-6 text-center text-slate-400">
                                    Sin comprobantes registrados en esta liquidación.
                                  </td>
                                </tr>
                              ) : (
                                liqDataset.expenseRows.map((row) => (
                                  <tr key={row.rowKey} className="hover:bg-slate-50/80">
                                    <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                                      {row.fechaDoc || '—'}
                                    </td>
                                    <td className="py-2.5 px-2.5 font-mono text-slate-700 whitespace-nowrap">
                                      <div>{row.documentoCompleto}</div>
                                      {row.nit && (
                                        <div className="text-[10px] text-slate-400">NIT {row.nit}</div>
                                      )}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <div className="font-medium text-slate-900 truncate max-w-[220px]">
                                        {row.proveedor}
                                      </div>
                                      {row.descripcionGasto && (
                                        <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
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
                                      {formatViaticoAmount(row.impuestoReintegrar)}
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
                                            className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer"
                                            title="Ver factura escaneada"
                                          >
                                            <Eye className="w-4 h-4" />
                                          </button>
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
                                            className="p-1.5 text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer"
                                            title="Cargar factura escaneada"
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
                        </StickyHorizontalScrollContainer>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <>
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

          <StickyHorizontalScrollContainer className="hidden lg:block">
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
          </StickyHorizontalScrollContainer>
            </>
          )}
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
                            <div className="font-bold text-sm text-slate-900 break-words flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[#1E60A8]">
                                Sem #{liq.semana || '-'}
                              </span>
                              <span>{liq.lineaLiquidacion || 'Sin título'}</span>
                              {liq.contabilizada && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                                  <BadgeCheck className="w-3 h-3 text-emerald-700" />
                                  <span>Contabilizado</span>
                                </span>
                              )}
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
                            <button
                              type="button"
                              onClick={() => {
                                void handleExportOdooExcel([liq]);
                              }}
                              disabled={liq.items.length === 0 || isExportingExcel}
                              className="min-h-[38px] px-2.5 py-1 text-xs font-semibold text-white bg-[#132B63] rounded-lg disabled:opacity-40 cursor-pointer"
                            >
                              Excel Odoo
                            </button>
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
                          <div className="flex flex-col items-center gap-1">
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
                            {liq.contabilizada ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                                <BadgeCheck className="w-3 h-3 text-emerald-700" />
                                <span>Contabilizado</span>
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium text-amber-700">
                                Pendiente contab.
                              </span>
                            )}
                          </div>
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
                              onClick={() => {
                                void handleExportOdooExcel([liq]);
                              }}
                              disabled={liq.items.length === 0 || isExportingExcel}
                              title="Descargar Excel Odoo (.xlsx) y marcar Contabilizado"
                              className="p-1.5 text-[#132B63] hover:bg-sky-50 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <FileSpreadsheet className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDownloadLiquidationExcel(liq)}
                              disabled={liq.items.length === 0}
                              title="Descargar Planilla Excel individual"
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 rounded-lg cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
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
  const valueFocusedRef = useRef(false);
  const splitFocusedRef = useRef(false);
  const cecosFocusedRef = useRef(false);
  const cecoBtnRef = useRef<HTMLButtonElement | null>(null);
  const cecoPopoverRef = useRef<HTMLDivElement | null>(null);

  // Sync controlled inputs if external row state changes while not actively focused
  useEffect(() => {
    if (valueFocusedRef.current) return;
    const extVal =
      row.odooDistributionValue && row.odooDistributionValue > 0
        ? String(row.odooDistributionValue)
        : '';
    if (Number(localValueText || 0) !== Number(extVal || 0)) {
      setLocalValueText(extVal);
    }
  }, [row.odooDistributionValue, row.odooDistributionOptionId]);

  useEffect(() => {
    if (splitFocusedRef.current) return;
    const extSplit =
      row.odooSplitCount && row.odooSplitCount >= 2 ? String(row.odooSplitCount) : '2';
    if (localSplitText !== extSplit && row.odooDistributionMode === 'multi_ceco') {
      setLocalSplitText(extSplit);
    }
  }, [row.odooSplitCount, row.odooDistributionMode, row.odooDistributionOptionId]);

  useEffect(() => {
    if (cecosFocusedRef.current || isCecoPickerOpen) return;
    const extText =
      row.odooSplitCostCentersText ?? (row.odooSplitCostCenters || []).join(', ');
    if (extText !== localCecosText) {
      setLocalCecosText(extText);
    }
  }, [row.odooSplitCostCentersText, row.odooSplitCostCenters, isCecoPickerOpen]);

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
                onFocus={() => {
                  valueFocusedRef.current = true;
                }}
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
                  valueFocusedRef.current = false;
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
                onFocus={() => {
                  splitFocusedRef.current = true;
                }}
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
                  splitFocusedRef.current = false;
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
                onFocus={() => {
                  cecosFocusedRef.current = true;
                }}
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
                onBlur={() => {
                  cecosFocusedRef.current = false;
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

interface StickyHorizontalScrollContainerProps {
  children: React.ReactNode;
  className?: string;
}

const StickyHorizontalScrollContainer: React.FC<StickyHorizontalScrollContainerProps> = ({
  children,
  className = '',
}) => {
  const topBarRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const syncingSourceRef = useRef<'top' | 'body' | null>(null);
  const [metrics, setMetrics] = useState({
    scrollWidth: 0,
    clientWidth: 0,
    scrollLeft: 0,
  });

  useEffect(() => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;

    const updateMetrics = () => {
      setMetrics({
        scrollWidth: bodyEl.scrollWidth,
        clientWidth: bodyEl.clientWidth,
        scrollLeft: bodyEl.scrollLeft,
      });
    };

    updateMetrics();

    const ro = new ResizeObserver(updateMetrics);
    ro.observe(bodyEl);
    if (bodyEl.firstElementChild) {
      ro.observe(bodyEl.firstElementChild);
    }
    window.addEventListener('resize', updateMetrics);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateMetrics);
    };
  }, [children]);

  const hasOverflow = metrics.scrollWidth > metrics.clientWidth + 2;
  const maxBodyScroll = Math.max(0, metrics.scrollWidth - metrics.clientWidth);

  const handleBodyScroll = () => {
    const bodyEl = bodyRef.current;
    const topEl = topBarRef.current;
    if (!bodyEl) return;

    setMetrics((prev) => ({
      ...prev,
      scrollLeft: bodyEl.scrollLeft,
      scrollWidth: bodyEl.scrollWidth,
      clientWidth: bodyEl.clientWidth,
    }));

    if (syncingSourceRef.current === 'top') {
      syncingSourceRef.current = null;
      return;
    }

    if (topEl) {
      const topMax = Math.max(1, topEl.scrollWidth - topEl.clientWidth);
      const bodyMax = Math.max(1, bodyEl.scrollWidth - bodyEl.clientWidth);
      syncingSourceRef.current = 'body';
      topEl.scrollLeft = (bodyEl.scrollLeft / bodyMax) * topMax;
      requestAnimationFrame(() => {
        if (syncingSourceRef.current === 'body') {
          syncingSourceRef.current = null;
        }
      });
    }
  };

  const handleTopScroll = () => {
    const bodyEl = bodyRef.current;
    const topEl = topBarRef.current;
    if (!bodyEl || !topEl) return;

    if (syncingSourceRef.current === 'body') {
      syncingSourceRef.current = null;
      return;
    }

    const topMax = Math.max(1, topEl.scrollWidth - topEl.clientWidth);
    const bodyMax = Math.max(1, bodyEl.scrollWidth - bodyEl.clientWidth);
    syncingSourceRef.current = 'top';
    bodyEl.scrollLeft = (topEl.scrollLeft / topMax) * bodyMax;
    setMetrics((prev) => ({ ...prev, scrollLeft: bodyEl.scrollLeft }));
    requestAnimationFrame(() => {
      if (syncingSourceRef.current === 'top') {
        syncingSourceRef.current = null;
      }
    });
  };

  const scrollByStep = (delta: number) => {
    const bodyEl = bodyRef.current;
    if (!bodyEl) return;
    bodyEl.scrollBy({ left: delta, behavior: 'smooth' });
  };

  return (
    <div className={className}>
      {hasOverflow && (
        <div className="sticky top-0 z-20 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200 px-3 py-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => scrollByStep(-360)}
            disabled={metrics.scrollLeft <= 1}
            title="Desplazar tabla hacia la izquierda"
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-bold text-[#132B63] bg-white hover:bg-sky-50 disabled:opacity-40 border border-slate-300 rounded-lg cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Izq.</span>
          </button>

          <div
            ref={topBarRef}
            onScroll={handleTopScroll}
            aria-label="Barra superior de desplazamiento horizontal"
            className="flex-1 overflow-x-auto overflow-y-hidden h-4 rounded bg-slate-200/70"
          >
            <div style={{ width: `${Math.max(metrics.scrollWidth, 1)}px`, height: '1px' }} />
          </div>

          <button
            type="button"
            onClick={() => scrollByStep(360)}
            disabled={metrics.scrollLeft >= maxBodyScroll - 1}
            title="Desplazar tabla hacia la derecha"
            className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-bold text-[#132B63] bg-white hover:bg-sky-50 disabled:opacity-40 border border-slate-300 rounded-lg cursor-pointer shrink-0"
          >
            <span>Der.</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div ref={bodyRef} onScroll={handleBodyScroll} className="overflow-x-auto">
        {children}
      </div>
    </div>
  );
};

