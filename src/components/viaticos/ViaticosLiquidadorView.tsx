import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  Upload,
  Camera,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Plus,
  Pencil,
  Trash2,
  Eye,
  X,
  Check,
  Loader2,
  AlertTriangle,
  Lock,
  RotateCcw,
  RotateCw,
  FileSpreadsheet,
  Send,
  Paperclip,
  Archive,
  Calendar,
  Coins,
  Printer,
  Download,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ZoomIn,
  ZoomOut,
  Users,
  Search,
  Layers,
} from 'lucide-react';
import {
  EffectivePermissions,
  ModuleCompanyEntry,
  OdooExpenseType,
  ViaticoCategory,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoExpenseItem,
  ViaticoLiquidation,
  ViaticoOdooCatalogs,
} from '../../types';
import {
  StoredReceiptMedia,
  saveReceiptMedia,
} from '../../services/viaticosMediaStore';
import {
  detectInvoiceFileKind,
  extractInvoiceViaServer,
  extractMultipleInvoicesFromPdfViaServer,
  prepareFileForExtraction,
  readFileAsDataUrl,
  rotateImageDataUrl90,
} from '../../services/viaticosInvoiceAi';
import {
  CURRENCY_SYMBOLS,
  DEFAULT_TAX_RATE_BY_CURRENCY,
  VIATICO_CATEGORIES,
  VIATICO_CURRENCIES,
  calculateTaxBreakdown,
  formatExchangeRate,
  formatViaticoAmount,
  roundExchangeRate,
  roundMoney,
} from '../../utils/viaticos';
import { normalizeCompanyKey } from '../../utils/permissions';
import {
  findMatchingCostCenterEntry,
  mergeOdooCatalogsWithDefaults,
  resolveDetectedCostCenterFromCatalog,
  resolveOdooDocTypeByHint,
  resolveOdooExpenseCodeByHint,
  resolveOdooTaxIndicatorByHint,
  suggestOdooDocTypeForItem,
  suggestOdooExpenseCodeForItem,
  suggestOdooTaxIndicatorForItem,
} from '../../utils/viaticosOdooCatalogs';
import { PremexBrandLogo } from '../ModuleIcons';

interface ViaticosLiquidadorViewProps {
  liquidation: ViaticoLiquidation | null;
  visibleLiquidaciones: ViaticoLiquidation[];
  availableConsultores: ViaticoConsultor[];
  moduleCompanies?: ModuleCompanyEntry[];
  odooCatalogs?: ViaticoOdooCatalogs;
  isLockedToOwnConsultor: boolean;
  detectedFromEmailLabel: string | null;
  mediaMap: Record<string, StoredReceiptMedia>;
  loadingMediaIds?: Set<string>;
  onLoadReceiptMedia?: (attachmentId: string) => Promise<StoredReceiptMedia | null>;
  onMediaSaved: (media: StoredReceiptMedia) => void;
  permissions: EffectivePermissions;
  onSelectLiquidation: (id: string) => void;
  onCreateNewLiquidation: () => void;
  onUpdateHeader: (patch: {
    lineaLiquidacion?: string;
    semana?: string;
    consultorId?: string;
    consultorNombre?: string;
    consultorEmail?: string;
    empresa?: string;
    centroCosto?: string;
    odooEmployeeName?: string;
    odooAnalyticDistribution?: string;
    monedaBase?: ViaticoCurrency;
    tipoCambioLiquidacion?: number;
  }) => void;
  resolvedCostCenter: string;
  onAddOrUpdateItem: (item: ViaticoExpenseItem, isEdit: boolean) => void;
  onAddMultipleItems?: (items: ViaticoExpenseItem[]) => void;
  onBulkUpdateItems?: (
    itemIds: string[],
    patch: Partial<
      Pick<
        ViaticoExpenseItem,
        | 'clienteContacto'
        | 'objetivoComercial'
        | 'descripcionGasto'
        | 'categoria'
        | 'kilometraje'
        | 'odooCostCenterCode'
        | 'odooAnalyticDistribution'
        | 'splitByEmployeesCount'
        | 'splitEmployeeNames'
      >
    >
  ) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenCloseConfirmModal: () => void;
  onOpenCloseEmailModal: () => void;
  onOpenPlanillaPdfPreview: () => void;
  onQuickDownloadExcel: () => void;
  onQuickDownloadPdf: () => void;
  isDownloadingExcel: boolean;
  isDownloadingPdf: boolean;
  onOpenClosedArchive: () => void;
  zoomPercent?: number;
}

type InlineEditableField =
  | 'fechaDoc'
  | 'serieDoc'
  | 'noDoc'
  | 'nit'
  | 'proveedor'
  | 'moneda'
  | 'valorFactura'
  | 'tipoCambio'
  | 'valorReintegrar'
  | 'categoria'
  | 'clienteContacto'
  | 'objetivoComercial'
  | 'descripcionGasto'
  | 'kilometraje'
  | 'impuestos'
  | 'odooCostCenterCode';

interface PendingUploadFile {
  id: string;
  file: File;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface ItemFormState {
  id: string;
  fechaDoc: string;
  serieDoc: string;
  noDoc: string;
  nit: string;
  proveedor: string;
  moneda: ViaticoCurrency;
  valorFactura: string;
  tipoCambio: string;
  valorReintegrarManual: string;
  categoria: ViaticoCategory;
  clienteContacto: string;
  objetivoComercial: string;
  descripcionGasto: string;
  kilometraje: string;
  aplicaImpuestos: boolean;
  porcentajeImpuesto: string;
  montoImpuestoManual: string;
  odooDocType: string;
  odooProductId: string;
  odooTaxIndicator: string;
  odooExpenseType: OdooExpenseType | '';
  odooCostCenterCode: string;
  odooAnalyticDistribution: string;
  splitByEmployeesEnabled: boolean;
  splitByEmployeesCount: string;
  splitEmployeeNames: string[];
  attachmentId?: string;
  attachmentName?: string;
  attachmentMimeType?: string;
  attachmentSize?: number;
  extractedByAi?: boolean;
  extractionConfidence?: 'alta' | 'media' | 'baja';
  extractionNotes?: string;
}

const getTodayFormatted = (): string => {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const createEmptyForm = (
  baseCurrency: ViaticoCurrency,
  defaultCliente = '',
  defaultObjetivo = '',
  docExchangeRate?: number | null
): ItemFormState => ({
  id: '',
  fechaDoc: getTodayFormatted(),
  serieDoc: '',
  noDoc: '',
  nit: '',
  proveedor: '',
  moneda: baseCurrency,
  valorFactura: '',
  tipoCambio: docExchangeRate && docExchangeRate > 0 ? String(docExchangeRate) : '1.00',
  valorReintegrarManual: '',
  categoria: 'Alimentación',
  clienteContacto: defaultCliente,
  objetivoComercial: defaultObjetivo,
  descripcionGasto: '',
  kilometraje: '',
  aplicaImpuestos: DEFAULT_TAX_RATE_BY_CURRENCY[baseCurrency] > 0,
  porcentajeImpuesto: String(DEFAULT_TAX_RATE_BY_CURRENCY[baseCurrency] || 0),
  montoImpuestoManual: '',
  odooDocType: '',
  odooProductId: '',
  odooTaxIndicator: '',
  odooExpenseType: '',
  odooCostCenterCode: '',
  odooAnalyticDistribution: '',
  splitByEmployeesEnabled: false,
  splitByEmployeesCount: '2',
  splitEmployeeNames: [],
});

export const ViaticosLiquidadorView: React.FC<ViaticosLiquidadorViewProps> = ({
  liquidation,
  visibleLiquidaciones,
  availableConsultores,
  moduleCompanies = [],
  odooCatalogs,
  isLockedToOwnConsultor,
  detectedFromEmailLabel,
  mediaMap,
  loadingMediaIds,
  onLoadReceiptMedia,
  onMediaSaved,
  permissions,
  onSelectLiquidation,
  onCreateNewLiquidation,
  onUpdateHeader,
  resolvedCostCenter,
  onAddOrUpdateItem,
  onAddMultipleItems,
  onBulkUpdateItems,
  onDeleteItem,
  onOpenCloseConfirmModal,
  onOpenCloseEmailModal,
  onOpenPlanillaPdfPreview,
  onQuickDownloadExcel,
  onQuickDownloadPdf,
  isDownloadingExcel,
  isDownloadingPdf,
  onOpenClosedArchive,
  zoomPercent = 100,
}) => {
  const catalogs = useMemo(
    () => mergeOdooCatalogsWithDefaults(odooCatalogs),
    [odooCatalogs]
  );
  const activeCostCenterLabels = useMemo(
    () =>
      catalogs.costCenters
        .filter((cc) => cc.activo !== false)
        .map((cc) => cc.cuentaAnalitica),
    [catalogs.costCenters]
  );
  const [showOdooDocFields, setShowOdooDocFields] = useState(false);
  const [splitEmployeeSearch, setSplitEmployeeSearch] = useState('');
  const isZoomHigh = zoomPercent >= 120;
  const isZoomExtra = zoomPercent >= 135;
  const baseCurrency: ViaticoCurrency = liquidation?.monedaBase || 'Quetzales';
  const docExchangeRate =
    liquidation?.monedaBase === 'Dólares' &&
    typeof liquidation.tipoCambioLiquidacion === 'number' &&
    liquidation.tipoCambioLiquidacion > 0
      ? liquidation.tipoCambioLiquidacion
      : null;

  const [docFxDraft, setDocFxDraft] = useState<string>(() =>
    docExchangeRate ? String(docExchangeRate) : '1.00'
  );

  useEffect(() => {
    if (liquidation?.monedaBase === 'Dólares') {
      setDocFxDraft(
        liquidation.tipoCambioLiquidacion && liquidation.tipoCambioLiquidacion > 0
          ? String(liquidation.tipoCambioLiquidacion)
          : '1.00'
      );
    }
  }, [liquidation?.id, liquidation?.monedaBase, liquidation?.tipoCambioLiquidacion]);

  const handleDocFxDraftChange = (raw: string) => {
    setDocFxDraft(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      onUpdateHeader({ tipoCambioLiquidacion: roundExchangeRate(parsed) });
    }
  };

  const handleDocFxBlur = () => {
    const parsed = Number(docFxDraft);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDocFxDraft(docExchangeRate ? String(docExchangeRate) : '1.00');
    } else {
      setDocFxDraft(String(roundExchangeRate(parsed)));
    }
  };

  const lastCliente = useMemo(() => {
    const items = liquidation?.items || [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].clienteContacto) return items[i].clienteContacto;
    }
    return '';
  }, [liquidation?.items]);

  const lastObjetivo = useMemo(() => {
    const items = liquidation?.items || [];
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].objetivoComercial) return items[i].objetivoComercial;
    }
    return '';
  }, [liquidation?.items]);

  // Multi-liquidation switcher filters (Week, Currency, Status)
  const [switcherScope, setSwitcherScope] = useState<'open' | 'closed' | 'all'>('all');
  const [switcherWeekFilter, setSwitcherWeekFilter] = useState<string>('ALL');
  const [switcherCurrencyFilter, setSwitcherCurrencyFilter] = useState<'ALL' | ViaticoCurrency>('ALL');
  const [isDesktopSwitcherFiltersOpen, setIsDesktopSwitcherFiltersOpen] = useState(false);
  const [isDesktopHeaderEditing, setIsDesktopHeaderEditing] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isMobileHeaderExpanded, setIsMobileHeaderExpanded] = useState(false);

  const [form, setForm] = useState<ItemFormState>(() =>
    createEmptyForm(baseCurrency, lastCliente, lastObjetivo, docExchangeRate)
  );
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [activeMediaPreview, setActiveMediaPreview] = useState<StoredReceiptMedia | null>(null);
  const [uploadQueue, setUploadQueue] = useState<PendingUploadFile[]>([]);
  const [isExtractingAi, setIsExtractingAi] = useState(false);
  const [aiStatusBanner, setAiStatusBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRotatingImage, setIsRotatingImage] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [lightboxItem, setLightboxItem] = useState<{
    item: ViaticoExpenseItem;
    media: StoredReceiptMedia;
  } | null>(null);
  const [receiptZoom, setReceiptZoom] = useState<number>(1);
  const [bulkProgressText, setBulkProgressText] = useState<string | null>(null);
  const [inlineEditCell, setInlineEditCell] = useState<{
    itemId: string;
    field: InlineEditableField;
  } | null>(null);
  const [inlineDraftValue, setInlineDraftValue] = useState<string>('');
  const [inlineTaxDraft, setInlineTaxDraft] = useState<{
    aplica: boolean;
    rate: string;
  }>({ aplica: true, rate: '12' });
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkApplyCliente, setBulkApplyCliente] = useState(false);
  const [bulkCliente, setBulkCliente] = useState('');
  const [bulkApplyObjetivo, setBulkApplyObjetivo] = useState(false);
  const [bulkObjetivo, setBulkObjetivo] = useState('');
  const [bulkApplyDescripcion, setBulkApplyDescripcion] = useState(false);
  const [bulkDescripcion, setBulkDescripcion] = useState('');
  const [bulkApplyCategoria, setBulkApplyCategoria] = useState(false);
  const [bulkCategoria, setBulkCategoria] = useState<ViaticoCategory>('Alimentación');
  const [bulkApplyKilometraje, setBulkApplyKilometraje] = useState(false);
  const [bulkKilometraje, setBulkKilometraje] = useState('');
  const [bulkApplyCeco, setBulkApplyCeco] = useState(false);
  const [bulkCeco, setBulkCeco] = useState('');
  const [bulkApplySplit, setBulkApplySplit] = useState(false);
  const [bulkSplitMode, setBulkSplitMode] = useState<'set' | 'clear'>('set');
  const [bulkSplitCount, setBulkSplitCount] = useState('2');
  const [bulkSplitEmployeeNames, setBulkSplitEmployeeNames] = useState<string[]>([]);
  const [bulkSplitSearch, setBulkSplitSearch] = useState('');
  const [bulkEditError, setBulkEditError] = useState<string | null>(null);
  const [splitModalItem, setSplitModalItem] = useState<ViaticoExpenseItem | null>(null);
  const [splitModalCount, setSplitModalCount] = useState('2');
  const [splitModalNames, setSplitModalNames] = useState<string[]>([]);
  const [splitModalSearch, setSplitModalSearch] = useState('');
  const [splitModalError, setSplitModalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const bulkPdfInputRef = useRef<HTMLInputElement>(null);
  const prevLiqIdRef = useRef<string | null>(liquidation?.id || null);

  // Reset capture form cleanly whenever the user switches to another liquidation (different week/currency)
  useEffect(() => {
    const nextId = liquidation?.id || null;
    if (nextId === prevLiqIdRef.current) return;
    prevLiqIdRef.current = nextId;
    setEditingItemId(null);
    setInlineEditCell(null);
    setSelectedItemIds([]);
    setBulkApplyCliente(false);
    setBulkCliente('');
    setBulkApplyObjetivo(false);
    setBulkObjetivo('');
    setBulkApplyDescripcion(false);
    setBulkDescripcion('');
    setBulkApplyCategoria(false);
    setBulkApplyKilometraje(false);
    setBulkKilometraje('');
    setBulkApplyCeco(false);
    setBulkCeco('');
    setBulkApplySplit(false);
    setBulkSplitMode('set');
    setBulkSplitCount('2');
    setBulkSplitEmployeeNames([]);
    setBulkSplitSearch('');
    setBulkEditError(null);
    setSplitModalItem(null);
    setSplitModalError(null);
    setBulkProgressText(null);
    setActiveMediaPreview(null);
    setUploadQueue([]);
    setAiStatusBanner(null);
    setFormError(null);
    setForm(createEmptyForm(baseCurrency, lastCliente, lastObjetivo, docExchangeRate));

    if (liquidation) {
      setSwitcherScope((prev) => {
        if (prev === 'open' && liquidation.estado !== 'borrador') return 'all';
        if (prev === 'closed' && liquidation.estado === 'borrador') return 'all';
        return prev;
      });
      setSwitcherWeekFilter((prev) =>
        prev !== 'ALL' && (liquidation.semana || '').trim() !== prev ? 'ALL' : prev
      );
      setSwitcherCurrencyFilter((prev) =>
        prev !== 'ALL' && liquidation.monedaBase !== prev ? 'ALL' : prev
      );
    }
  }, [liquidation, baseCurrency, docExchangeRate, lastCliente, lastObjetivo]);

  // Sync default invoice currency if the user edits baseCurrency in the header while form is fresh
  useEffect(() => {
    if (editingItemId) return;
    setForm((prev) => {
      if (prev.valorFactura.trim() !== '' || prev.proveedor.trim() !== '') return prev;
      if (prev.moneda === baseCurrency) return prev;
      const defaultRate = DEFAULT_TAX_RATE_BY_CURRENCY[baseCurrency] || 0;
      return {
        ...prev,
        moneda: baseCurrency,
        tipoCambio: docExchangeRate ? String(docExchangeRate) : '1.00',
        aplicaImpuestos: defaultRate > 0,
        porcentajeImpuesto: String(defaultRate),
        montoImpuestoManual: '',
      };
    });
  }, [baseCurrency, docExchangeRate, editingItemId]);

  // Keep new-item exchange rate synchronized with document-level USD FX whenever set
  useEffect(() => {
    if (editingItemId) return;
    if (docExchangeRate && docExchangeRate > 0) {
      setForm((prev) => ({
        ...prev,
        tipoCambio: String(docExchangeRate),
      }));
    } else if (baseCurrency !== 'Dólares') {
      setForm((prev) =>
        prev.moneda === baseCurrency && prev.valorFactura.trim() === ''
          ? { ...prev, tipoCambio: '1.00' }
          : prev
      );
    }
  }, [docExchangeRate, baseCurrency, editingItemId]);

  // Distinct weeks and currencies across visible liquidations
  const openLiquidaciones = useMemo(
    () => visibleLiquidaciones.filter((l) => l.estado === 'borrador'),
    [visibleLiquidaciones]
  );
  const closedLiquidaciones = useMemo(
    () => visibleLiquidaciones.filter((l) => l.estado !== 'borrador'),
    [visibleLiquidaciones]
  );

  const availableWeeks = useMemo(() => {
    const set = new Set<string>();
    visibleLiquidaciones.forEach((l) => {
      const w = (l.semana || '').trim();
      if (w) set.add(w);
    });
    return Array.from(set).sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
      return b.localeCompare(a);
    });
  }, [visibleLiquidaciones]);

  const availableCurrencies = useMemo(() => {
    const set = new Set<ViaticoCurrency>();
    visibleLiquidaciones.forEach((l) => {
      if (l.monedaBase) set.add(l.monedaBase);
    });
    return Array.from(set);
  }, [visibleLiquidaciones]);

  const filterMatches = (
    l: ViaticoLiquidation,
    scope: 'open' | 'closed' | 'all',
    week: string,
    currency: 'ALL' | ViaticoCurrency
  ) => {
    if (scope === 'open' && l.estado !== 'borrador') return false;
    if (scope === 'closed' && l.estado === 'borrador') return false;
    if (week !== 'ALL' && (l.semana || '').trim() !== week) return false;
    if (currency !== 'ALL' && l.monedaBase !== currency) return false;
    return true;
  };

  const filteredSwitcherLiquidaciones = useMemo(
    () =>
      visibleLiquidaciones.filter((l) =>
        filterMatches(l, switcherScope, switcherWeekFilter, switcherCurrencyFilter)
      ),
    [visibleLiquidaciones, switcherScope, switcherWeekFilter, switcherCurrencyFilter]
  );

  const openTabsList = useMemo(
    () =>
      openLiquidaciones.filter((l) =>
        filterMatches(l, 'open', switcherWeekFilter, switcherCurrencyFilter)
      ),
    [openLiquidaciones, switcherWeekFilter, switcherCurrencyFilter]
  );

  const applySwitcherFiltersAndAutoSelect = (
    nextScope: 'open' | 'closed' | 'all',
    nextWeek: string,
    nextCurrency: 'ALL' | ViaticoCurrency
  ) => {
    setSwitcherScope(nextScope);
    setSwitcherWeekFilter(nextWeek);
    setSwitcherCurrencyFilter(nextCurrency);

    const matches = visibleLiquidaciones.filter((l) =>
      filterMatches(l, nextScope, nextWeek, nextCurrency)
    );
    if (matches.length > 0 && (!liquidation || !matches.some((m) => m.id === liquidation.id))) {
      onSelectLiquidation(matches[0].id);
    }
  };

  const isLocked =
    !liquidation ||
    liquidation.estado !== 'borrador' ||
    !permissions.canOperate;

  // Unique suggestions from existing items in this liquidation
  const clienteSuggestions = useMemo(() => {
    const set = new Set<string>();
    liquidation?.items.forEach((it) => {
      if (it.clienteContacto.trim()) set.add(it.clienteContacto.trim());
    });
    return Array.from(set);
  }, [liquidation?.items]);

  const objetivoSuggestions = useMemo(() => {
    const set = new Set<string>();
    liquidation?.items.forEach((it) => {
      if (it.objetivoComercial.trim()) set.add(it.objetivoComercial.trim());
    });
    return Array.from(set);
  }, [liquidation?.items]);

  // Live computed math for form
  const numericValorFactura = Math.max(0, Number(form.valorFactura) || 0);
  const numericTipoCambio =
    Number(form.tipoCambio) > 0 ? Number(form.tipoCambio) : 1;
  const hasManualReintegrar =
    form.moneda !== baseCurrency &&
    form.valorReintegrarManual.trim() !== '' &&
    Number.isFinite(Number(form.valorReintegrarManual)) &&
    Number(form.valorReintegrarManual) >= 0;
  const computedReintegrar = hasManualReintegrar
    ? roundMoney(Number(form.valorReintegrarManual))
    : roundMoney(numericValorFactura * numericTipoCambio);
  const numericTaxRate = Math.max(0, Number(form.porcentajeImpuesto) || 0);
  const manualTaxOverride =
    form.montoImpuestoManual.trim() !== '' &&
    Number.isFinite(Number(form.montoImpuestoManual))
      ? Number(form.montoImpuestoManual)
      : undefined;

  const computedTax = calculateTaxBreakdown({
    valorFactura: numericValorFactura,
    aplicaImpuestos: form.aplicaImpuestos,
    porcentajeImpuesto: numericTaxRate,
    montoImpuestoOverride: manualTaxOverride,
  });

  const processSingleReceiptFile = async (pending: PendingUploadFile) => {
    if (!liquidation) return;
    setIsExtractingAi(true);
    setAiStatusBanner(null);
    setFormError(null);

    try {
      const prepared = await prepareFileForExtraction(pending.file, pending.dataUrl);
      const mediaRecord: StoredReceiptMedia = {
        id: pending.id,
        fileName: pending.fileName,
        mimeType: prepared.mimeType,
        size: pending.size,
        dataUrl: prepared.dataUrl,
        createdAtIso: new Date().toISOString(),
      };
      const saveRes = await saveReceiptMedia(mediaRecord);
      const savedMedia = saveRes.media;
      onMediaSaved(savedMedia);
      setActiveMediaPreview(savedMedia);

      setForm((prev) => ({
        ...prev,
        attachmentId: mediaRecord.id,
        attachmentName: mediaRecord.fileName,
        attachmentMimeType: mediaRecord.mimeType,
        attachmentSize: mediaRecord.size,
      }));

      // Call server-side Gemini multimodal invoice extractor
      const extracted = await extractInvoiceViaServer({
        dataUrl: prepared.dataUrl,
        mimeType: prepared.mimeType,
        fileName: mediaRecord.fileName,
        baseCurrency: liquidation.monedaBase,
        availableCostCenters: activeCostCenterLabels,
      });

      const detectedCeco = resolveDetectedCostCenterFromCatalog(
        extracted.centroCostoDetectado,
        catalogs.costCenters
      );

      const suggestedTaxRate = extracted.aplicaImpuestos
        ? extracted.porcentajeImpuesto > 0
          ? extracted.porcentajeImpuesto
          : DEFAULT_TAX_RATE_BY_CURRENCY[extracted.moneda] || 12
        : 0;

      const suggestedDocType =
        resolveOdooDocTypeByHint(extracted.tipoDocumentoSugerido, catalogs) ||
        suggestOdooDocTypeForItem(
          {
            nit: extracted.nit || '',
            serieDoc: extracted.serieDoc || '',
            noDoc: extracted.noDoc || '',
            aplicaImpuestos: extracted.aplicaImpuestos,
            moneda: extracted.moneda,
            proveedor: extracted.proveedor || '',
            extractionNotes: extracted.notasExtraccion || '',
          },
          catalogs
        );
      const suggestedProduct =
        resolveOdooExpenseCodeByHint(extracted.codigoGastoSugerido, catalogs) ||
        suggestOdooExpenseCodeForItem(
          {
            categoria: extracted.categoriaSugerida || 'Alimentación',
            descripcionGasto: extracted.descripcionSugerida || '',
            proveedor: extracted.proveedor || '',
            moneda: extracted.moneda,
          },
          undefined,
          catalogs
        );
      const suggestedTax =
        resolveOdooTaxIndicatorByHint(extracted.indicadorImpuestoSugerido, catalogs) ||
        suggestOdooTaxIndicatorForItem(
          {
            aplicaImpuestos: extracted.aplicaImpuestos,
            categoria: extracted.categoriaSugerida || 'Alimentación',
            moneda: extracted.moneda,
            extractionNotes: extracted.notasExtraccion || '',
            descripcionGasto: extracted.descripcionSugerida || '',
            proveedor: extracted.proveedor || '',
          },
          suggestedDocType,
          catalogs
        );

      setForm((prev) => ({
        ...prev,
        fechaDoc: extracted.fechaDoc || prev.fechaDoc || getTodayFormatted(),
        serieDoc: extracted.serieDoc || '',
        noDoc: extracted.noDoc || '',
        nit: extracted.nit || '',
        proveedor: extracted.proveedor || '',
        moneda: extracted.moneda,
        valorFactura: extracted.valorFactura > 0 ? String(extracted.valorFactura) : '',
        tipoCambio:
          docExchangeRate && docExchangeRate > 0
            ? String(docExchangeRate)
            : extracted.moneda === liquidation.monedaBase
            ? '1.00'
            : String(extracted.tipoCambioSugerido || 1),
        valorReintegrarManual: '',
        categoria: extracted.categoriaSugerida || prev.categoria,
        clienteContacto: prev.clienteContacto || lastCliente,
        objetivoComercial: prev.objetivoComercial || lastObjetivo,
        descripcionGasto: extracted.descripcionSugerida || prev.descripcionGasto,
        aplicaImpuestos: extracted.aplicaImpuestos,
        porcentajeImpuesto: String(suggestedTaxRate),
        montoImpuestoManual:
          extracted.aplicaImpuestos && extracted.montoImpuesto > 0
            ? String(extracted.montoImpuesto)
            : '',
        odooDocType: suggestedDocType,
        odooProductId: suggestedProduct,
        odooTaxIndicator: suggestedTax,
        odooExpenseType: prev.odooExpenseType || catalogs.defaultExpenseType || 'Gasto',
        odooCostCenterCode: detectedCeco ? detectedCeco.cuentaAnalitica : prev.odooCostCenterCode,
        odooAnalyticDistribution: detectedCeco
          ? detectedCeco.analyticDistribution
          : prev.odooAnalyticDistribution,
        attachmentId: mediaRecord.id,
        attachmentName: mediaRecord.fileName,
        attachmentMimeType: mediaRecord.mimeType,
        attachmentSize: mediaRecord.size,
        extractedByAi: true,
        extractionConfidence: extracted.confianza,
        extractionNotes: extracted.notasExtraccion,
      }));

      const detectedCecoNote = detectedCeco
        ? ` · CECO detectado: ${detectedCeco.cuentaAnalitica}`
        : '';

      setAiStatusBanner({
        type: extracted.confianza === 'baja' ? 'warning' : 'success',
        text:
          extracted.confianza === 'baja'
            ? `Lectura parcial (${extracted.notasExtraccion || 'imagen con baja nitidez'}). Verifica y completa los campos antes de agregar.${detectedCecoNote}`
            : `Factura leída (${extracted.proveedor || 'proveedor detectado'} · ${extracted.moneda})${detectedCecoNote}${
                extracted.notasExtraccion ? ` — ${extracted.notasExtraccion}` : ''
              }`,
      });
    } catch (err: any) {
      setAiStatusBanner({
        type: 'error',
        text:
          err?.message ||
          'El archivo se adjuntó correctamente, pero no se pudo leer automáticamente. Puedes digitar los campos manualmente.',
      });
    } finally {
      setIsExtractingAi(false);
    }
  };

  const handleFilesSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isLocked) return;

    const accepted: PendingUploadFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const detected = detectInvoiceFileKind(file);
      if (detected.kind === 'unsupported') continue;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        accepted.push({
          id: `rcpt-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          file,
          fileName: file.name || `comprobante-${Date.now()}.jpg`,
          mimeType: detected.mimeType,
          size: file.size,
          dataUrl,
        });
      } catch {
        // Skip unreadable file entries and report below if nothing could be loaded
      }
    }

    if (accepted.length === 0) {
      setAiStatusBanner({
        type: 'error',
        text: 'Solo se admiten imágenes (JPG, PNG, WEBP, HEIC) o documentos PDF de facturas.',
      });
      return;
    }

    const [first, ...rest] = accepted;
    if (rest.length > 0) {
      setUploadQueue((prev) => [...prev, ...rest]);
    }
    setEditingItemId(null);
    await processSingleReceiptFile(first);
  };

  const handleBulkPdfSelected = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || isLocked || !liquidation) return;
    const file = fileList[0];
    const detected = detectInvoiceFileKind(file);
    if (detected.kind !== 'pdf') {
      setAiStatusBanner({
        type: 'error',
        text: 'Para la carga masiva debes seleccionar un archivo PDF que contenga varias facturas.',
      });
      return;
    }

    setIsExtractingAi(true);
    setAiStatusBanner(null);
    setFormError(null);
    setBulkProgressText(`Preparando PDF "${file.name}" para lectura masiva...`);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const originalFileName = file.name || `facturas-masivas-${Date.now()}.pdf`;

      const { invoices: extractedList, totalPages } =
        await extractMultipleInvoicesFromPdfViaServer({
          dataUrl,
          fileName: originalFileName,
          baseCurrency: liquidation.monedaBase,
          availableCostCenters: activeCostCenterLabels,
          onProgress: ({ currentChunk, totalChunks, totalPages: pages, extractedSoFar }) => {
            setBulkProgressText(
              `Leyendo bloque ${currentChunk}/${totalChunks} (${pages} pág.) · ${extractedSoFar} factura(s) detectada(s)...`
            );
          },
        });

      const ensureFallbackBulkMedia = async (): Promise<StoredReceiptMedia> => {
        const mediaId = `rcpt-bulk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const mediaRecord: StoredReceiptMedia = {
          id: mediaId,
          fileName: originalFileName,
          mimeType: 'application/pdf',
          size: file.size,
          dataUrl,
          createdAtIso: new Date().toISOString(),
        };
        const saveRes = await saveReceiptMedia(mediaRecord);
        onMediaSaved(saveRes.media);
        return saveRes.media;
      };

      if (extractedList.length === 0) {
        const fallbackMedia = await ensureFallbackBulkMedia();
        setActiveMediaPreview(fallbackMedia);
        setAiStatusBanner({
          type: 'warning',
          text: `No se detectaron facturas legibles dentro de "${originalFileName}". El PDF quedó adjunto para revisión o carga individual.`,
        });
        return;
      }

      setBulkProgressText(
        `Separando soportes PDF individuales para ${extractedList.length} factura(s)...`
      );

      let fallbackBulkMedia: StoredReceiptMedia | null = null;
      let firstAssignedMedia: StoredReceiptMedia | null = null;
      let splitAttachmentCount = 0;
      const splitMediaByKey = new Map<string, StoredReceiptMedia>();

      const resolveMediaForExtractedInvoice = async (
        extracted: (typeof extractedList)[number],
        idx: number
      ): Promise<StoredReceiptMedia> => {
        if (extracted.extractedPdfDataUrl) {
          const splitKey = `${extracted.pageStart || 0}-${extracted.pageEnd || 0}-${
            extracted.extractedPdfFileName || ''
          }`;
          const existing = splitMediaByKey.get(splitKey);
          if (existing) {
            return existing;
          }
          const splitId = `rcpt-bulk-${Date.now()}-${idx}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          const splitRecord: StoredReceiptMedia = {
            id: splitId,
            fileName:
              extracted.extractedPdfFileName ||
              `${originalFileName.replace(/\.pdf$/i, '')}_fact${idx + 1}.pdf`,
            mimeType: 'application/pdf',
            size: extracted.extractedPdfSize || file.size,
            dataUrl: extracted.extractedPdfDataUrl,
            createdAtIso: new Date().toISOString(),
          };
          const saveRes = await saveReceiptMedia(splitRecord);
          onMediaSaved(saveRes.media);
          splitMediaByKey.set(splitKey, saveRes.media);
          splitAttachmentCount += 1;
          return saveRes.media;
        }

        if (!fallbackBulkMedia) {
          fallbackBulkMedia = await ensureFallbackBulkMedia();
        }
        return fallbackBulkMedia;
      };

      const defaultCliente = form.clienteContacto.trim() || lastCliente;
      const defaultObjetivo = form.objetivoComercial.trim() || lastObjetivo;

      const itemsToAdd: ViaticoExpenseItem[] = [];
      let detectedCecoCount = 0;
      for (let idx = 0; idx < extractedList.length; idx++) {
        const extracted = extractedList[idx];
        const assignedMedia = await resolveMediaForExtractedInvoice(extracted, idx);
        if (!firstAssignedMedia) {
          firstAssignedMedia = assignedMedia;
        }

        const detectedCeco = resolveDetectedCostCenterFromCatalog(
          extracted.centroCostoDetectado,
          catalogs.costCenters
        );
        if (detectedCeco) {
          detectedCecoCount += 1;
        }

        const valorFactura = roundMoney(Math.max(0, extracted.valorFactura));
        const fx =
          docExchangeRate && docExchangeRate > 0
            ? roundExchangeRate(docExchangeRate)
            : extracted.moneda === liquidation.monedaBase
            ? 1
            : roundExchangeRate(
                extracted.tipoCambioSugerido > 0 ? extracted.tipoCambioSugerido : 1
              );
        const valorReintegrar = roundMoney(valorFactura * fx);
        const aplicaImpuestos = extracted.aplicaImpuestos;
        const porcentajeImpuesto = aplicaImpuestos
          ? extracted.porcentajeImpuesto > 0
            ? roundMoney(extracted.porcentajeImpuesto)
            : DEFAULT_TAX_RATE_BY_CURRENCY[extracted.moneda] || 12
          : 0;
        const taxBreakdown = calculateTaxBreakdown({
          valorFactura,
          aplicaImpuestos,
          porcentajeImpuesto,
          montoImpuestoOverride:
            aplicaImpuestos && extracted.montoImpuesto > 0
              ? extracted.montoImpuesto
              : undefined,
        });

        const suggestedDocType =
          resolveOdooDocTypeByHint(extracted.tipoDocumentoSugerido, catalogs) ||
          suggestOdooDocTypeForItem(
            {
              nit: extracted.nit || '',
              serieDoc: extracted.serieDoc || '',
              noDoc: extracted.noDoc || '',
              aplicaImpuestos,
              moneda: extracted.moneda,
              proveedor: extracted.proveedor || '',
              extractionNotes: extracted.notasExtraccion || '',
            },
            catalogs
          );
        const suggestedProduct =
          resolveOdooExpenseCodeByHint(extracted.codigoGastoSugerido, catalogs) ||
          suggestOdooExpenseCodeForItem(
            {
              categoria: extracted.categoriaSugerida || 'Alimentación',
              descripcionGasto: extracted.descripcionSugerida || '',
              proveedor: extracted.proveedor || '',
              moneda: extracted.moneda,
            },
            undefined,
            catalogs
          );
        const suggestedTax =
          resolveOdooTaxIndicatorByHint(extracted.indicadorImpuestoSugerido, catalogs) ||
          suggestOdooTaxIndicatorForItem(
            {
              aplicaImpuestos,
              categoria: extracted.categoriaSugerida || 'Alimentación',
              moneda: extracted.moneda,
              extractionNotes: extracted.notasExtraccion || '',
              descripcionGasto: extracted.descripcionSugerida || '',
              proveedor: extracted.proveedor || '',
            },
            suggestedDocType,
            catalogs
          );

        itemsToAdd.push({
          id: `viat-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          fechaDoc: extracted.fechaDoc || getTodayFormatted(),
          serieDoc: extracted.serieDoc || '',
          noDoc: extracted.noDoc || '',
          nit: extracted.nit || '',
          proveedor: extracted.proveedor || `Proveedor pág. ${idx + 1}`,
          moneda: extracted.moneda,
          valorFactura,
          tipoCambio: fx,
          valorReintegrar,
          categoria: extracted.categoriaSugerida || 'Otros Gastos',
          clienteContacto: defaultCliente,
          objetivoComercial: defaultObjetivo,
          descripcionGasto: extracted.descripcionSugerida || '',
          kilometraje: '',
          aplicaImpuestos,
          porcentajeImpuesto,
          montoImpuesto: taxBreakdown.montoImpuesto,
          valorSinImpuesto: taxBreakdown.valorSinImpuesto,
          odooDocType: suggestedDocType || undefined,
          odooProductId: suggestedProduct || undefined,
          odooTaxIndicator: suggestedTax || undefined,
          odooExpenseType: catalogs.defaultExpenseType || 'Gasto',
          odooCostCenterCode: detectedCeco?.cuentaAnalitica || undefined,
          odooAnalyticDistribution: detectedCeco?.analyticDistribution || undefined,
          attachmentId: assignedMedia.id,
          attachmentName: assignedMedia.fileName,
          attachmentMimeType: assignedMedia.mimeType,
          attachmentSize: assignedMedia.size,
          extractedByAi: true,
          extractionConfidence: extracted.confianza,
          extractionNotes: extracted.notasExtraccion,
        });
      }

      if (firstAssignedMedia) {
        setActiveMediaPreview(firstAssignedMedia);
      }

      if (onAddMultipleItems) {
        onAddMultipleItems(itemsToAdd);
      } else {
        itemsToAdd.forEach((it) => onAddOrUpdateItem(it, false));
      }

      setAiStatusBanner({
        type: 'success',
        text: `Carga masiva completada: ${itemsToAdd.length} factura(s) extraída(s) desde "${originalFileName}" (${totalPages} pág.)${
          splitAttachmentCount > 0
            ? ` con ${splitAttachmentCount} PDF(s) individuales asignado(s) por línea`
            : ''
        }${
          detectedCecoCount > 0
            ? ` · ${detectedCecoCount} con CECO detectado en el documento`
            : ''
        }. Haz doble clic en cualquier celda para editar o usa los recuadros para edición masiva.`,
      });
    } catch (err: any) {
      setAiStatusBanner({
        type: 'error',
        text:
          err?.message ||
          'No se pudo completar la carga masiva del PDF. Verifica el archivo o intenta dividirlo en menos páginas.',
      });
    } finally {
      setBulkProgressText(null);
      setIsExtractingAi(false);
    }
  };

  const startInlineEdit = (item: ViaticoExpenseItem, field: InlineEditableField) => {
    if (isLocked) return;
    setInlineEditCell({ itemId: item.id, field });
    if (field === 'impuestos') {
      setInlineTaxDraft({
        aplica: item.aplicaImpuestos,
        rate: String(
          item.aplicaImpuestos
            ? item.porcentajeImpuesto || DEFAULT_TAX_RATE_BY_CURRENCY[item.moneda] || 12
            : 0
        ),
      });
      return;
    }
    const rawVal = item[field];
    setInlineDraftValue(rawVal !== undefined && rawVal !== null ? String(rawVal) : '');
  };

  const cancelInlineEdit = () => {
    setInlineEditCell(null);
  };

  const commitInlineEdit = (
    item: ViaticoExpenseItem,
    field: InlineEditableField,
    overrideRaw?: string
  ) => {
    if (isLocked) {
      setInlineEditCell(null);
      return;
    }
    const rawStr = overrideRaw !== undefined ? overrideRaw : inlineDraftValue;
    let nextItem: ViaticoExpenseItem = { ...item };

    if (field === 'impuestos') {
      const nextAplica = inlineTaxDraft.aplica;
      const nextRate = nextAplica
        ? Math.max(0, Math.min(100, Number(inlineTaxDraft.rate) || 0))
        : 0;
      const tax = calculateTaxBreakdown({
        valorFactura: item.valorFactura,
        aplicaImpuestos: nextAplica,
        porcentajeImpuesto: nextRate,
      });
      nextItem = {
        ...item,
        aplicaImpuestos: nextAplica,
        porcentajeImpuesto: roundMoney(nextRate),
        montoImpuesto: tax.montoImpuesto,
        valorSinImpuesto: tax.valorSinImpuesto,
      };
    } else if (field === 'valorFactura') {
      const parsed = Number(rawStr);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setInlineEditCell(null);
        return;
      }
      const nextValor = roundMoney(parsed);
      const nextReintegrar = roundMoney(nextValor * (item.tipoCambio > 0 ? item.tipoCambio : 1));
      const tax = calculateTaxBreakdown({
        valorFactura: nextValor,
        aplicaImpuestos: item.aplicaImpuestos,
        porcentajeImpuesto: item.porcentajeImpuesto,
      });
      nextItem = {
        ...item,
        valorFactura: nextValor,
        valorReintegrar: nextReintegrar,
        montoImpuesto: tax.montoImpuesto,
        valorSinImpuesto: tax.valorSinImpuesto,
      };
    } else if (field === 'tipoCambio') {
      const parsed = Number(rawStr);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setInlineEditCell(null);
        return;
      }
      const nextFx = roundExchangeRate(parsed);
      nextItem = {
        ...item,
        tipoCambio: nextFx,
        valorReintegrar: roundMoney(item.valorFactura * nextFx),
      };
    } else if (field === 'valorReintegrar') {
      const parsed = Number(rawStr);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setInlineEditCell(null);
        return;
      }
      const nextReintegrar = roundMoney(parsed);
      const nextFx =
        item.valorFactura > 0 && nextReintegrar > 0
          ? roundExchangeRate(nextReintegrar / item.valorFactura)
          : item.tipoCambio > 0
          ? item.tipoCambio
          : 1;
      nextItem = {
        ...item,
        valorReintegrar: nextReintegrar,
        tipoCambio: nextFx,
      };
    } else if (field === 'moneda') {
      const nextCurrency = rawStr as ViaticoCurrency;
      const nextFx =
        docExchangeRate && docExchangeRate > 0
          ? roundExchangeRate(docExchangeRate)
          : nextCurrency === baseCurrency
          ? 1
          : item.tipoCambio > 0
          ? item.tipoCambio
          : 7.8;
      const nextRate = item.aplicaImpuestos
        ? DEFAULT_TAX_RATE_BY_CURRENCY[nextCurrency] ?? item.porcentajeImpuesto
        : 0;
      const nextAplica = item.aplicaImpuestos && nextRate > 0;
      const tax = calculateTaxBreakdown({
        valorFactura: item.valorFactura,
        aplicaImpuestos: nextAplica,
        porcentajeImpuesto: nextRate,
      });
      nextItem = {
        ...item,
        moneda: nextCurrency,
        tipoCambio: nextFx,
        valorReintegrar: roundMoney(item.valorFactura * nextFx),
        aplicaImpuestos: nextAplica,
        porcentajeImpuesto: roundMoney(nextRate),
        montoImpuesto: tax.montoImpuesto,
        valorSinImpuesto: tax.valorSinImpuesto,
      };
    } else if (field === 'categoria') {
      nextItem = {
        ...item,
        categoria: rawStr as ViaticoCategory,
      };
    } else if (field === 'odooCostCenterCode') {
      const ccVal = rawStr.trim();
      if (!ccVal) {
        nextItem = {
          ...item,
          odooCostCenterCode: undefined,
          odooAnalyticDistribution: undefined,
        };
      } else {
        const matched = findMatchingCostCenterEntry(ccVal, '', catalogs.costCenters);
        nextItem = {
          ...item,
          odooCostCenterCode: matched?.cuentaAnalitica || ccVal,
          odooAnalyticDistribution: matched?.analyticDistribution || undefined,
        };
      }
    } else if (field === 'proveedor') {
      const trimmed = rawStr.trim();
      if (!trimmed) {
        setInlineEditCell(null);
        return;
      }
      nextItem = { ...item, proveedor: trimmed };
    } else {
      nextItem = {
        ...item,
        [field]: rawStr.trim(),
      };
    }

    setInlineEditCell(null);
    onAddOrUpdateItem(nextItem, true);
  };

  useEffect(() => {
    const validIds = new Set((liquidation?.items || []).map((it) => it.id));
    setSelectedItemIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [liquidation?.items]);

  const toggleSelectItem = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const toggleSelectAllItems = () => {
    const allIds = (liquidation?.items || []).map((it) => it.id);
    if (allIds.length === 0) return;
    setSelectedItemIds((prev) => (prev.length === allIds.length ? [] : allIds));
  };

  const resetBulkEditPanel = (clearSelection = false) => {
    if (clearSelection) setSelectedItemIds([]);
    setBulkApplyCliente(false);
    setBulkCliente('');
    setBulkApplyObjetivo(false);
    setBulkObjetivo('');
    setBulkApplyDescripcion(false);
    setBulkDescripcion('');
    setBulkApplyCategoria(false);
    setBulkApplyKilometraje(false);
    setBulkKilometraje('');
    setBulkApplyCeco(false);
    setBulkCeco('');
    setBulkApplySplit(false);
    setBulkSplitMode('set');
    setBulkSplitCount('2');
    setBulkSplitEmployeeNames([]);
    setBulkSplitSearch('');
    setBulkEditError(null);
  };

  const handleApplyBulkEdit = () => {
    if (isLocked || !liquidation || selectedItemIds.length === 0) return;
    setBulkEditError(null);

    const patch: Partial<
      Pick<
        ViaticoExpenseItem,
        | 'clienteContacto'
        | 'objetivoComercial'
        | 'descripcionGasto'
        | 'categoria'
        | 'kilometraje'
        | 'odooCostCenterCode'
        | 'odooAnalyticDistribution'
        | 'splitByEmployeesCount'
        | 'splitEmployeeNames'
      >
    > = {};

    if (bulkApplyCliente) patch.clienteContacto = bulkCliente.trim();
    if (bulkApplyObjetivo) patch.objetivoComercial = bulkObjetivo.trim();
    if (bulkApplyDescripcion) patch.descripcionGasto = bulkDescripcion.trim();
    if (bulkApplyCategoria) patch.categoria = bulkCategoria;
    if (bulkApplyKilometraje) patch.kilometraje = bulkKilometraje.trim();
    if (bulkApplyCeco) {
      const ccVal = bulkCeco.trim();
      if (!ccVal) {
        patch.odooCostCenterCode = undefined;
        patch.odooAnalyticDistribution = undefined;
      } else {
        const matched = findMatchingCostCenterEntry(ccVal, '', catalogs.costCenters);
        patch.odooCostCenterCode = matched?.cuentaAnalitica || ccVal;
        patch.odooAnalyticDistribution = matched?.analyticDistribution || undefined;
      }
    }
    if (bulkApplySplit) {
      if (bulkSplitMode === 'clear') {
        patch.splitByEmployeesCount = undefined;
        patch.splitEmployeeNames = undefined;
      } else {
        const parsedCount = Math.floor(Number(bulkSplitCount) || 0);
        if (!Number.isFinite(parsedCount) || parsedCount < 2) {
          setBulkEditError(
            'En "Dividir gasto", indica una cantidad de personas mayor o igual a 2.'
          );
          return;
        }
        if (bulkSplitEmployeeNames.length !== parsedCount) {
          setBulkEditError(
            `En "Dividir gasto", debes seleccionar exactamente ${parsedCount} empleados (${bulkSplitEmployeeNames.length} de ${parsedCount} seleccionados).`
          );
          return;
        }
        patch.splitByEmployeesCount = parsedCount;
        patch.splitEmployeeNames = [...bulkSplitEmployeeNames];
      }
    }

    if (Object.keys(patch).length === 0) return;

    if (onBulkUpdateItems) {
      onBulkUpdateItems(selectedItemIds, patch);
    } else {
      const idSet = new Set(selectedItemIds);
      liquidation.items.forEach((it) => {
        if (idSet.has(it.id)) {
          onAddOrUpdateItem({ ...it, ...patch }, true);
        }
      });
    }

    resetBulkEditPanel(true);
  };

  const openSplitModalForItem = (item: ViaticoExpenseItem) => {
    if (isLocked) return;
    const existingNames = Array.isArray(item.splitEmployeeNames)
      ? item.splitEmployeeNames.map((n) => String(n || '').trim().toUpperCase()).filter(Boolean)
      : [];
    const existingCount =
      item.splitByEmployeesCount && item.splitByEmployeesCount >= 2
        ? item.splitByEmployeesCount
        : existingNames.length >= 2
        ? existingNames.length
        : 2;
    setSplitModalItem(item);
    setSplitModalCount(String(existingCount));
    setSplitModalNames(existingNames);
    setSplitModalSearch('');
    setSplitModalError(null);
  };

  const handleSaveRowSplitModal = () => {
    if (!splitModalItem || isLocked) return;
    const parsedCount = Math.floor(Number(splitModalCount) || 0);
    if (!Number.isFinite(parsedCount) || parsedCount < 2) {
      setSplitModalError('Indica una cantidad de personas mayor o igual a 2.');
      return;
    }
    if (splitModalNames.length !== parsedCount) {
      setSplitModalError(
        `Debes seleccionar exactamente ${parsedCount} empleados (${splitModalNames.length} de ${parsedCount} seleccionados).`
      );
      return;
    }
    onAddOrUpdateItem(
      {
        ...splitModalItem,
        splitByEmployeesCount: parsedCount,
        splitEmployeeNames: [...splitModalNames],
      },
      true
    );
    setSplitModalItem(null);
    setSplitModalError(null);
  };

  const handleClearRowSplitModal = () => {
    if (!splitModalItem || isLocked) return;
    onAddOrUpdateItem(
      {
        ...splitModalItem,
        splitByEmployeesCount: undefined,
        splitEmployeeNames: undefined,
      },
      true
    );
    setSplitModalItem(null);
    setSplitModalError(null);
  };

  const handleRotateCurrentPreview = async () => {
    if (
      !activeMediaPreview ||
      activeMediaPreview.mimeType === 'application/pdf' ||
      isExtractingAi ||
      isRotatingImage
    ) {
      return;
    }
    setIsRotatingImage(true);
    try {
      const rotated = await rotateImageDataUrl90(activeMediaPreview.dataUrl);
      const updatedRecord: StoredReceiptMedia = {
        ...activeMediaPreview,
        mimeType: rotated.mimeType,
        dataUrl: rotated.dataUrl,
      };
      const saveRes = await saveReceiptMedia(updatedRecord);
      onMediaSaved(saveRes.media);
      setActiveMediaPreview(saveRes.media);
      setForm((prev) =>
        prev.attachmentId === updatedRecord.id
          ? { ...prev, attachmentMimeType: updatedRecord.mimeType }
          : prev
      );
      setAiStatusBanner({
        type: 'warning',
        text: 'Imagen rotada 90°. Presiona "Re-leer IA" si deseas volver a extraer los datos con esta orientación.',
      });
    } catch {
      setAiStatusBanner({
        type: 'error',
        text: 'No se pudo rotar la imagen. Puedes volver a cargarla o digitar los campos manualmente.',
      });
    } finally {
      setIsRotatingImage(false);
    }
  };

  const handleReExtractCurrent = async () => {
    if (!activeMediaPreview || !liquidation || isExtractingAi) return;
    setIsExtractingAi(true);
    setAiStatusBanner(null);
    try {
      const extracted = await extractInvoiceViaServer({
        dataUrl: activeMediaPreview.dataUrl,
        mimeType: activeMediaPreview.mimeType,
        fileName: activeMediaPreview.fileName,
        baseCurrency: liquidation.monedaBase,
        availableCostCenters: activeCostCenterLabels,
      });
      const detectedCeco = resolveDetectedCostCenterFromCatalog(
        extracted.centroCostoDetectado,
        catalogs.costCenters
      );
      const suggestedTaxRate = extracted.aplicaImpuestos
        ? extracted.porcentajeImpuesto > 0
          ? extracted.porcentajeImpuesto
          : DEFAULT_TAX_RATE_BY_CURRENCY[extracted.moneda] || 12
        : 0;
      const suggestedDocType =
        resolveOdooDocTypeByHint(extracted.tipoDocumentoSugerido, catalogs) ||
        suggestOdooDocTypeForItem(
          {
            nit: extracted.nit || '',
            serieDoc: extracted.serieDoc || '',
            noDoc: extracted.noDoc || '',
            aplicaImpuestos: extracted.aplicaImpuestos,
            moneda: extracted.moneda,
            proveedor: extracted.proveedor || '',
            extractionNotes: extracted.notasExtraccion || '',
          },
          catalogs
        );
      const suggestedProduct =
        resolveOdooExpenseCodeByHint(extracted.codigoGastoSugerido, catalogs) ||
        suggestOdooExpenseCodeForItem(
          {
            categoria: extracted.categoriaSugerida || 'Alimentación',
            descripcionGasto: extracted.descripcionSugerida || '',
            proveedor: extracted.proveedor || '',
            moneda: extracted.moneda,
          },
          undefined,
          catalogs
        );
      const suggestedTax =
        resolveOdooTaxIndicatorByHint(extracted.indicadorImpuestoSugerido, catalogs) ||
        suggestOdooTaxIndicatorForItem(
          {
            aplicaImpuestos: extracted.aplicaImpuestos,
            categoria: extracted.categoriaSugerida || 'Alimentación',
            moneda: extracted.moneda,
            extractionNotes: extracted.notasExtraccion || '',
            descripcionGasto: extracted.descripcionSugerida || '',
            proveedor: extracted.proveedor || '',
          },
          suggestedDocType,
          catalogs
        );

      setForm((prev) => ({
        ...prev,
        fechaDoc: extracted.fechaDoc || prev.fechaDoc,
        serieDoc: extracted.serieDoc,
        noDoc: extracted.noDoc,
        nit: extracted.nit,
        proveedor: extracted.proveedor || prev.proveedor,
        moneda: extracted.moneda,
        valorFactura: extracted.valorFactura > 0 ? String(extracted.valorFactura) : prev.valorFactura,
        tipoCambio:
          docExchangeRate && docExchangeRate > 0
            ? String(docExchangeRate)
            : extracted.moneda === liquidation.monedaBase
            ? '1.00'
            : String(extracted.tipoCambioSugerido || prev.tipoCambio || 1),
        valorReintegrarManual: '',
        categoria: extracted.categoriaSugerida || prev.categoria,
        descripcionGasto: extracted.descripcionSugerida || prev.descripcionGasto,
        aplicaImpuestos: extracted.aplicaImpuestos,
        porcentajeImpuesto: String(suggestedTaxRate),
        montoImpuestoManual:
          extracted.aplicaImpuestos && extracted.montoImpuesto > 0
            ? String(extracted.montoImpuesto)
            : '',
        odooDocType: suggestedDocType,
        odooProductId: suggestedProduct,
        odooTaxIndicator: suggestedTax,
        odooExpenseType: prev.odooExpenseType || catalogs.defaultExpenseType || 'Gasto',
        odooCostCenterCode: detectedCeco ? detectedCeco.cuentaAnalitica : prev.odooCostCenterCode,
        odooAnalyticDistribution: detectedCeco
          ? detectedCeco.analyticDistribution
          : prev.odooAnalyticDistribution,
        extractedByAi: true,
        extractionConfidence: extracted.confianza,
        extractionNotes: extracted.notasExtraccion,
      }));
      setAiStatusBanner({
        type: 'success',
        text: detectedCeco
          ? `Datos actualizados nuevamente mediante lectura IA · CECO detectado: ${detectedCeco.cuentaAnalitica}.`
          : 'Datos actualizados nuevamente mediante lectura IA.',
      });
    } catch (err: any) {
      setAiStatusBanner({
        type: 'error',
        text: err?.message || 'No se pudo re-analizar el documento.',
      });
    } finally {
      setIsExtractingAi(false);
    }
  };

  const handleCurrencyChange = (nextCurrency: ViaticoCurrency) => {
    const nextDefaultRate = DEFAULT_TAX_RATE_BY_CURRENCY[nextCurrency] || 0;
    setForm((prev) => ({
      ...prev,
      moneda: nextCurrency,
      tipoCambio:
        docExchangeRate && docExchangeRate > 0
          ? String(docExchangeRate)
          : nextCurrency === baseCurrency
          ? '1.00'
          : prev.tipoCambio === '1.00'
          ? '7.90'
          : prev.tipoCambio,
      valorReintegrarManual: '',
      porcentajeImpuesto: prev.aplicaImpuestos ? String(nextDefaultRate) : prev.porcentajeImpuesto,
      montoImpuestoManual: '',
    }));
  };

  const handleResetForm = (keepSuggestions = true) => {
    setEditingItemId(null);
    setActiveMediaPreview(null);
    setAiStatusBanner(null);
    setFormError(null);
    setForm(
      createEmptyForm(
        baseCurrency,
        keepSuggestions ? lastCliente : '',
        keepSuggestions ? lastObjetivo : '',
        docExchangeRate
      )
    );
  };

  const handleEditRow = (item: ViaticoExpenseItem) => {
    if (isLocked) return;
    setEditingItemId(item.id);
    setFormError(null);
    setAiStatusBanner(null);
    setSplitEmployeeSearch('');
    const hasEmpSplit =
      (item.splitByEmployeesCount || 0) >= 2 &&
      Array.isArray(item.splitEmployeeNames) &&
      item.splitEmployeeNames.length >= 2;
    setForm({
      id: item.id,
      fechaDoc: item.fechaDoc,
      serieDoc: item.serieDoc,
      noDoc: item.noDoc,
      nit: item.nit,
      proveedor: item.proveedor,
      moneda: item.moneda,
      valorFactura: String(item.valorFactura),
      tipoCambio: String(item.tipoCambio),
      valorReintegrarManual: item.moneda !== baseCurrency ? String(item.valorReintegrar) : '',
      categoria: item.categoria,
      clienteContacto: item.clienteContacto,
      objetivoComercial: item.objetivoComercial,
      descripcionGasto: item.descripcionGasto,
      kilometraje: item.kilometraje,
      aplicaImpuestos: item.aplicaImpuestos,
      porcentajeImpuesto: String(item.porcentajeImpuesto),
      montoImpuestoManual: item.aplicaImpuestos ? String(item.montoImpuesto) : '',
      odooDocType: item.odooDocType || '',
      odooProductId: item.odooProductId || '',
      odooTaxIndicator: item.odooTaxIndicator || '',
      odooExpenseType: item.odooExpenseType || '',
      odooCostCenterCode: item.odooCostCenterCode || '',
      odooAnalyticDistribution: item.odooAnalyticDistribution || '',
      splitByEmployeesEnabled: hasEmpSplit,
      splitByEmployeesCount:
        item.splitByEmployeesCount && item.splitByEmployeesCount >= 2
          ? String(item.splitByEmployeesCount)
          : '2',
      splitEmployeeNames: Array.isArray(item.splitEmployeeNames)
        ? item.splitEmployeeNames.map((n) => String(n || '').trim().toUpperCase()).filter(Boolean)
        : [],
      attachmentId: item.attachmentId,
      attachmentName: item.attachmentName,
      attachmentMimeType: item.attachmentMimeType,
      attachmentSize: item.attachmentSize,
      extractedByAi: item.extractedByAi,
      extractionConfidence: item.extractionConfidence,
      extractionNotes: item.extractionNotes,
    });
    if (
      item.odooDocType ||
      item.odooProductId ||
      item.odooTaxIndicator ||
      item.odooExpenseType ||
      item.odooCostCenterCode ||
      item.odooAnalyticDistribution
    ) {
      setShowOdooDocFields(true);
    }
    if (item.attachmentId && mediaMap[item.attachmentId]) {
      setActiveMediaPreview(mediaMap[item.attachmentId]);
    } else if (item.attachmentId && onLoadReceiptMedia) {
      setActiveMediaPreview(null);
      void onLoadReceiptMedia(item.attachmentId).then((loaded) => {
        if (loaded) setActiveMediaPreview(loaded);
      });
    } else {
      setActiveMediaPreview(null);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    setFormError(null);

    if (!form.proveedor.trim()) {
      setFormError('Ingresa el nombre del proveedor de la factura.');
      return;
    }
    if (numericValorFactura <= 0) {
      setFormError('Ingresa un valor de factura mayor a 0.');
      return;
    }

    const parsedSplitCount = Math.floor(Number(form.splitByEmployeesCount) || 0);
    if (form.splitByEmployeesEnabled) {
      if (!Number.isFinite(parsedSplitCount) || parsedSplitCount < 2) {
        setFormError(
          'En "Dividir gastos", indica una cantidad de personas mayor o igual a 2.'
        );
        return;
      }
      if (form.splitEmployeeNames.length !== parsedSplitCount) {
        setFormError(
          `En "Dividir gastos", debes seleccionar exactamente ${parsedSplitCount} empleados (${form.splitEmployeeNames.length} de ${parsedSplitCount} seleccionados).`
        );
        return;
      }
    }

    const matchedDocCostCenter = form.odooCostCenterCode.trim()
      ? findMatchingCostCenterEntry(
          form.odooCostCenterCode,
          form.odooAnalyticDistribution,
          catalogs.costCenters
        )
      : null;

    const existingItem = editingItemId
      ? liquidation?.items.find((it) => it.id === editingItemId)
      : undefined;

    const nextItem: ViaticoExpenseItem = {
      id: editingItemId || `viat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fechaDoc: form.fechaDoc.trim() || getTodayFormatted(),
      serieDoc: form.serieDoc.trim(),
      noDoc: form.noDoc.trim(),
      nit: form.nit.trim(),
      proveedor: form.proveedor.trim(),
      moneda: form.moneda,
      valorFactura: roundMoney(numericValorFactura),
      tipoCambio: roundExchangeRate(numericTipoCambio),
      valorReintegrar: computedReintegrar,
      categoria: form.categoria,
      clienteContacto: form.clienteContacto.trim(),
      objetivoComercial: form.objetivoComercial.trim(),
      descripcionGasto: form.descripcionGasto.trim(),
      kilometraje: form.kilometraje.trim(),
      aplicaImpuestos: form.aplicaImpuestos,
      porcentajeImpuesto: form.aplicaImpuestos ? roundMoney(numericTaxRate) : 0,
      montoImpuesto: computedTax.montoImpuesto,
      valorSinImpuesto: computedTax.valorSinImpuesto,
      odooDocType: form.odooDocType.trim() || undefined,
      odooProductId: form.odooProductId.trim() || undefined,
      odooTaxIndicator: form.odooTaxIndicator.trim() || undefined,
      odooExpenseType: form.odooExpenseType || undefined,
      odooCostCenterCode:
        matchedDocCostCenter?.cuentaAnalitica ||
        form.odooCostCenterCode.trim() ||
        undefined,
      odooAnalyticDistribution:
        form.odooAnalyticDistribution.trim() ||
        matchedDocCostCenter?.analyticDistribution ||
        undefined,
      splitByEmployeesCount: form.splitByEmployeesEnabled ? parsedSplitCount : undefined,
      splitEmployeeNames: form.splitByEmployeesEnabled
        ? form.splitEmployeeNames
        : undefined,
      registeredByEmail: existingItem?.registeredByEmail,
      registeredByName: existingItem?.registeredByName,
      attachmentId: form.attachmentId,
      attachmentName: form.attachmentName,
      attachmentMimeType: form.attachmentMimeType,
      attachmentSize: form.attachmentSize,
      extractedByAi: form.extractedByAi,
      extractionConfidence: form.extractionConfidence,
      extractionNotes: form.extractionNotes,
    };

    const wasEditing = Boolean(editingItemId);
    onAddOrUpdateItem(nextItem, wasEditing);

    // If there are queued receipts, load the next one automatically!
    if (!wasEditing && uploadQueue.length > 0) {
      const [nextQueued, ...remaining] = uploadQueue;
      setUploadQueue(remaining);
      setSplitEmployeeSearch('');
      setForm(
        createEmptyForm(
          baseCurrency,
          nextItem.clienteContacto || lastCliente,
          nextItem.objetivoComercial || lastObjetivo,
          docExchangeRate
        )
      );
      setActiveMediaPreview(null);
      await processSingleReceiptFile(nextQueued);
      return;
    }

    setEditingItemId(null);
    setActiveMediaPreview(null);
    setAiStatusBanner(null);
    setSplitEmployeeSearch('');
    setForm(
      createEmptyForm(
        baseCurrency,
        nextItem.clienteContacto || lastCliente,
        nextItem.objetivoComercial || lastObjetivo,
        docExchangeRate
      )
    );
  };

  if (!liquidation) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-[#1E60A8]/10 text-[#1E60A8] flex items-center justify-center mx-auto">
          <FileText className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-bold text-slate-900">
            No tienes una liquidación abierta actualmente
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {permissions.canOperate
              ? 'Crea una nueva liquidación de viáticos para comenzar a escanear facturas por foto o PDF.'
              : 'No hay liquidaciones disponibles dentro de tu alcance de empresas y permisos.'}
          </p>
        </div>
        {permissions.canOperate && (
          <button
            type="button"
            onClick={onCreateNewLiquidation}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Nueva Liquidación</span>
          </button>
        )}
      </div>
    );
  }

  const attachedCount = liquidation.items.filter(
    (it) => Boolean(it.attachmentId && mediaMap[it.attachmentId])
  ).length;

  const hasActiveSwitcherFilters =
    switcherWeekFilter !== 'ALL' ||
    switcherCurrencyFilter !== 'ALL' ||
    switcherScope !== 'all';

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* 1A. MOBILE PHONE LIQUIDATION CONTEXT & COLLAPSIBLE HEADER (< lg) */}
      <section className="lg:hidden bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="px-3 py-3.5 space-y-3.5">
          {/* Active Liquidation Picker + New Action */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Liquidación activa
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsMobileFiltersOpen((v) => !v)}
                  className={`inline-flex items-center gap-1.5 min-h-[2.5rem] px-3 py-1.5 text-sm font-semibold rounded-xl border transition-colors cursor-pointer ${
                    isMobileFiltersOpen || hasActiveSwitcherFilters
                      ? 'bg-sky-50 text-[#132B63] border-sky-200'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4 text-[#1E60A8]" />
                  <span>Filtros</span>
                </button>
                {permissions.canOperate && (
                  <button
                    type="button"
                    onClick={onCreateNewLiquidation}
                    className="inline-flex items-center gap-1.5 min-h-[2.5rem] px-3.5 py-1.5 text-sm font-bold text-[#132B63] bg-sky-50 border border-sky-200 rounded-xl cursor-pointer"
                  >
                    <Plus className="w-4 h-4 text-[#1E60A8]" />
                    <span>Nueva</span>
                  </button>
                )}
              </div>
            </div>

            <select
              value={liquidation.id}
              aria-label="Seleccionar liquidación activa"
              onChange={(e) => onSelectLiquidation(e.target.value)}
              className="w-full min-h-[3.375rem] px-3.5 py-3 text-base font-bold text-[#132B63] bg-slate-50 border border-slate-300 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
            >
              {!filteredSwitcherLiquidaciones.some((l) => l.id === liquidation.id) && (
                <option value={liquidation.id}>
                  Sem #{liquidation.semana || '-'} · {CURRENCY_SYMBOLS[liquidation.monedaBase]} · {liquidation.lineaLiquidacion} ({liquidation.estado === 'borrador' ? 'Abierta' : liquidation.estado === 'cerrada' ? 'Cerrada' : 'Enviada'})
                </option>
              )}
              {filteredSwitcherLiquidaciones.map((l) => (
                <option key={l.id} value={l.id}>
                  Sem #{l.semana || '-'} · {CURRENCY_SYMBOLS[l.monedaBase]} · {l.lineaLiquidacion} — {l.consultorNombre} (
                  {l.estado === 'borrador' ? 'Abierta' : l.estado === 'cerrada' ? 'Cerrada' : 'Enviada'})
                </option>
              ))}
            </select>
          </div>

          {/* Expandable Filter Panel on Mobile */}
          {isMobileFiltersOpen && (
            <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className={`grid gap-1 bg-slate-200/80 p-1 rounded-xl ${isZoomExtra ? 'grid-cols-1' : 'grid-cols-3'}`}>
                <button
                  type="button"
                  onClick={() =>
                    applySwitcherFiltersAndAutoSelect(
                      'open',
                      switcherWeekFilter,
                      switcherCurrencyFilter
                    )
                  }
                  className={`min-h-[2.625rem] px-2 text-sm font-bold rounded-lg transition-colors cursor-pointer tabular-nums ${
                    switcherScope === 'open'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Abiertas ({openLiquidaciones.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applySwitcherFiltersAndAutoSelect(
                      'closed',
                      switcherWeekFilter,
                      switcherCurrencyFilter
                    )
                  }
                  className={`min-h-[2.625rem] px-2 text-sm font-bold rounded-lg transition-colors cursor-pointer tabular-nums ${
                    switcherScope === 'closed'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Cerradas ({closedLiquidaciones.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applySwitcherFiltersAndAutoSelect(
                      'all',
                      switcherWeekFilter,
                      switcherCurrencyFilter
                    )
                  }
                  className={`min-h-[2.625rem] px-2 text-sm font-bold rounded-lg transition-colors cursor-pointer tabular-nums ${
                    switcherScope === 'all'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Todas ({visibleLiquidaciones.length})
                </button>
              </div>

              <div className={`grid gap-2.5 ${isZoomHigh ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <select
                  value={switcherWeekFilter}
                  aria-label="Filtrar por semana"
                  onChange={(e) =>
                    applySwitcherFiltersAndAutoSelect(
                      switcherScope,
                      e.target.value,
                      switcherCurrencyFilter
                    )
                  }
                  className="w-full min-h-[3rem] px-3 text-base font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl"
                >
                  <option value="ALL">Todas las semanas</option>
                  {availableWeeks.map((w) => (
                    <option key={w} value={w}>
                      Sem #{w}
                    </option>
                  ))}
                </select>

                <select
                  value={switcherCurrencyFilter}
                  aria-label="Filtrar por moneda"
                  onChange={(e) =>
                    applySwitcherFiltersAndAutoSelect(
                      switcherScope,
                      switcherWeekFilter,
                      e.target.value as 'ALL' | ViaticoCurrency
                    )
                  }
                  className="w-full min-h-[3rem] px-3 text-base font-semibold text-slate-800 bg-white border border-slate-300 rounded-xl"
                >
                  <option value="ALL">Todas monedas</option>
                  {availableCurrencies.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur} ({CURRENCY_SYMBOLS[cur]})
                    </option>
                  ))}
                </select>
              </div>

              {hasActiveSwitcherFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSwitcherScope('all');
                    setSwitcherWeekFilter('ALL');
                    setSwitcherCurrencyFilter('ALL');
                  }}
                  className="w-full min-h-[2.625rem] text-sm font-bold text-[#1E60A8] bg-white border border-sky-200 rounded-xl cursor-pointer"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}

          {/* Compact Summary Strip + Toggle to Edit Header Details */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-slate-900 truncate">
                {liquidation.consultorNombre}
              </div>
              <div className="text-xs text-slate-500 break-words mt-0.5 tabular-nums">
                Sem #{liquidation.semana || '-'} · {liquidation.monedaBase}
                {docExchangeRate ? ` (T/C ${docExchangeRate})` : ''} · {liquidation.empresa} ·{' '}
                {liquidation.items.length} fact.
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-extrabold font-mono text-[#132B63] tabular-nums">
                {formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)}
              </div>
            </div>
          </div>

          {liquidation.monedaBase === 'Dólares' && (
            <div className="p-3 rounded-2xl bg-sky-50/75 border border-[#1E60A8]/25 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#132B63]">
                  T/C Liquidación ($)
                </div>
                <div className="text-[11px] text-slate-600">
                  Aplica a todo el documento
                </div>
              </div>
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0.0001"
                value={docFxDraft}
                disabled={isLocked}
                onChange={(e) => handleDocFxDraftChange(e.target.value)}
                onBlur={handleDocFxBlur}
                aria-label="Tipo de cambio de liquidación en dólares"
                className="w-32 min-h-[2.75rem] px-3 py-2 text-base font-mono font-bold text-right tabular-nums text-[#132B63] bg-white border border-[#1E60A8]/40 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:bg-slate-50"
              />
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsMobileHeaderExpanded((v) => !v)}
              className="flex-1 min-w-[200px] inline-flex items-center justify-center gap-2 min-h-[2.875rem] px-3.5 py-2 text-sm font-bold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer"
            >
              {isMobileHeaderExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4 text-[#1E60A8] shrink-0" />
                  <span>Ocultar datos de liquidación</span>
                </>
              ) : (
                <>
                  <Pencil className="w-4 h-4 text-[#1E60A8] shrink-0" />
                  <span>Editar datos de liquidación</span>
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                </>
              )}
            </button>

            {closedLiquidaciones.length > 0 && (
              <button
                type="button"
                onClick={onOpenClosedArchive}
                className="inline-flex items-center justify-center gap-1.5 min-h-[2.875rem] px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl cursor-pointer shrink-0"
              >
                <Archive className="w-4 h-4 text-[#1E60A8]" />
                <span>{closedLiquidaciones.length}</span>
              </button>
            )}
          </div>

          {/* Expanded Mobile Header Fields */}
          {isMobileHeaderExpanded && (
            <div className="pt-3 border-t border-slate-200 space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Título / Liquidación
                </label>
                <input
                  type="text"
                  value={liquidation.lineaLiquidacion}
                  disabled={isLocked}
                  onChange={(e) => onUpdateHeader({ lineaLiquidacion: e.target.value })}
                  placeholder="Ej. Visita Premicol SA de CV"
                  className="w-full min-h-[3.25rem] px-3.5 py-3 text-base font-semibold text-slate-900 bg-white border border-slate-300 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:bg-slate-50"
                />
              </div>

              <div className={`grid gap-3 ${isZoomHigh ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    Semana #
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={liquidation.semana}
                    disabled={isLocked}
                    onChange={(e) => onUpdateHeader({ semana: e.target.value })}
                    placeholder="Ej. 48"
                    className="w-full min-h-[3.25rem] px-3.5 py-3 text-base font-bold text-slate-900 text-center bg-white border border-slate-300 rounded-2xl tabular-nums focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1.5">
                    Moneda
                  </label>
                  <select
                    value={liquidation.monedaBase}
                    disabled={isLocked}
                    onChange={(e) =>
                      onUpdateHeader({ monedaBase: e.target.value as ViaticoCurrency })
                    }
                    className="w-full min-h-[3.25rem] px-3.5 py-3 text-base font-bold text-slate-900 bg-white border border-slate-300 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:bg-slate-50"
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
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Nombre / Liquidador
                </label>
                {(() => {
                  const matchedHeaderConsultor =
                    availableConsultores.find((c) => c.id === liquidation.consultorId) ||
                    availableConsultores.find(
                      (c) =>
                        (c.odooEmployeeName || c.nombreCompleto || '').trim().toUpperCase() ===
                        (liquidation.odooEmployeeName || liquidation.consultorNombre || '')
                          .trim()
                          .toUpperCase()
                    );
                  const currentSelectValue = matchedHeaderConsultor?.id || liquidation.consultorId;
                  return (
                    <select
                      value={currentSelectValue}
                      disabled={isLocked || (isLockedToOwnConsultor && availableConsultores.length <= 1)}
                      onChange={(e) => {
                        const chosen = availableConsultores.find((c) => c.id === e.target.value);
                        if (!chosen) return;
                        const matchedComp =
                          moduleCompanies.length > 0
                            ? moduleCompanies.find(
                                (c) =>
                                  normalizeCompanyKey(c.nombre) ===
                                  normalizeCompanyKey(chosen.empresa)
                              ) || moduleCompanies[0]
                            : null;
                        onUpdateHeader({
                          consultorId: chosen.id,
                          consultorNombre: chosen.nombreCompleto,
                          consultorEmail: chosen.email,
                          empresa: matchedComp ? matchedComp.nombre : chosen.empresa,
                          centroCosto: chosen.centroCosto || '',
                          odooEmployeeName: chosen.odooEmployeeName || chosen.nombreCompleto,
                          odooAnalyticDistribution: chosen.odooAnalyticDistribution || '',
                        });
                      }}
                      className="w-full min-h-[3.25rem] px-3.5 py-3 text-base font-semibold text-slate-900 bg-white border border-slate-300 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:bg-slate-50"
                    >
                      {!matchedHeaderConsultor && (
                        <option value={liquidation.consultorId}>
                          {liquidation.odooEmployeeName || liquidation.consultorNombre}
                        </option>
                      )}
                      {availableConsultores.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombreCompleto}
                          {c.centroCosto ? ` · ${c.centroCosto}` : ''}
                        </option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">
                  Sociedad
                </label>
                {!isLocked && moduleCompanies.length > 0 ? (
                  <select
                    value={liquidation.empresa}
                    onChange={(e) => onUpdateHeader({ empresa: e.target.value })}
                    aria-label="Sociedad de la liquidación"
                    className="w-full min-h-[3.25rem] px-3.5 py-3 text-base font-bold text-[#132B63] bg-white border border-slate-300 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                  >
                    {!moduleCompanies.some((c) => c.nombre === liquidation.empresa) && (
                      <option value={liquidation.empresa}>{liquidation.empresa}</option>
                    )}
                    {moduleCompanies.map((c) => (
                      <option key={c.id} value={c.nombre}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-base font-bold text-[#132B63]">
                    {liquidation.empresa}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                  <span className="truncate font-mono">{liquidation.consultorEmail || 'Sin correo'}</span>
                  <span className="font-semibold text-[#132B63] shrink-0">
                    C.C.: {resolvedCostCenter || 'Sin asignar'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 1B. DESKTOP COMPACT SWITCHER + LIQUIDATION METADATA BAR (>= lg) */}
      <section className="hidden lg:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Top Switcher Bar */}
        <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-200/80 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <select
                value={liquidation.id}
                aria-label="Seleccionar liquidación activa"
                onChange={(e) => onSelectLiquidation(e.target.value)}
                className="text-xs font-semibold text-[#132B63] bg-white border border-slate-200 rounded-xl px-3 py-1.5 max-w-[340px] focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 cursor-pointer"
              >
                {!filteredSwitcherLiquidaciones.some((l) => l.id === liquidation.id) && (
                  <option value={liquidation.id}>
                    Sem #{liquidation.semana || '-'} · {CURRENCY_SYMBOLS[liquidation.monedaBase]} · {liquidation.lineaLiquidacion} ({liquidation.estado === 'borrador' ? 'Abierta' : liquidation.estado === 'cerrada' ? 'Cerrada' : 'Enviada'})
                  </option>
                )}
                {filteredSwitcherLiquidaciones.map((l) => (
                  <option key={l.id} value={l.id}>
                    Sem #{l.semana || '-'} · {CURRENCY_SYMBOLS[l.monedaBase]} · {l.lineaLiquidacion} — {l.consultorNombre} (
                    {l.estado === 'borrador' ? 'Abierta' : l.estado === 'cerrada' ? 'Cerrada' : 'Enviada'})
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setIsDesktopSwitcherFiltersOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl border transition-colors cursor-pointer whitespace-nowrap ${
                  isDesktopSwitcherFiltersOpen || hasActiveSwitcherFilters
                    ? 'bg-[#132B63]/5 text-[#132B63] border-[#132B63]/25'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Filtros</span>
                {hasActiveSwitcherFilters && (
                  <span className="font-mono text-[10px] font-bold text-[#1E60A8]">•</span>
                )}
                {isDesktopSwitcherFiltersOpen ? (
                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
              </button>

              {hasActiveSwitcherFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSwitcherScope('all');
                    setSwitcherWeekFilter('ALL');
                    setSwitcherCurrencyFilter('ALL');
                  }}
                  className="text-[11px] font-semibold text-[#1E60A8] hover:text-[#132B63] px-1.5 py-1 cursor-pointer whitespace-nowrap"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Right: Quick Action Shortcuts & Summary */}
            <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums shrink-0">
              {closedLiquidaciones.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenClosedArchive}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  title="Ir a la consulta de liquidaciones cerradas"
                >
                  <Archive className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Cerradas ({closedLiquidaciones.length})</span>
                </button>
              )}

              {permissions.canOperate && (
                <button
                  type="button"
                  onClick={onCreateNewLiquidation}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#132B63] bg-white hover:bg-sky-50 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  title="Iniciar otra liquidación (semana / moneda) manteniendo abiertas las actuales"
                >
                  <Plus className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Iniciar otra</span>
                </button>
              )}

              <span className="text-slate-300">|</span>
              <span>
                <strong className="font-semibold text-slate-900">{liquidation.items.length}</strong> fact.
              </span>
              <span className="text-slate-300">·</span>
              <span>
                <strong className="font-semibold text-slate-900">{attachedCount}</strong> sop.
              </span>
              <span className="text-slate-300">·</span>
              <span className="font-mono font-bold text-[#132B63]">
                {formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)}
              </span>
            </div>
          </div>

          {/* Collapsible Switcher Filters Drawer */}
          {isDesktopSwitcherFiltersOpen && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/70">
              <div className="inline-flex items-center bg-slate-200/70 p-0.5 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() =>
                    applySwitcherFiltersAndAutoSelect(
                      'open',
                      switcherWeekFilter,
                      switcherCurrencyFilter
                    )
                  }
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    switcherScope === 'open'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Abiertas ({openLiquidaciones.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applySwitcherFiltersAndAutoSelect(
                      'closed',
                      switcherWeekFilter,
                      switcherCurrencyFilter
                    )
                  }
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    switcherScope === 'closed'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cerradas ({closedLiquidaciones.length})
                </button>
                <button
                  type="button"
                  onClick={() =>
                    applySwitcherFiltersAndAutoSelect(
                      'all',
                      switcherWeekFilter,
                      switcherCurrencyFilter
                    )
                  }
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    switcherScope === 'all'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas ({visibleLiquidaciones.length})
                </button>
              </div>

              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1">
                <Calendar className="w-3.5 h-3.5 text-[#1E60A8]" />
                <select
                  value={switcherWeekFilter}
                  aria-label="Filtrar por semana"
                  onChange={(e) =>
                    applySwitcherFiltersAndAutoSelect(
                      switcherScope,
                      e.target.value,
                      switcherCurrencyFilter
                    )
                  }
                  className="text-xs font-semibold text-slate-700 bg-transparent focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">Todas las semanas</option>
                  {availableWeeks.map((w) => (
                    <option key={w} value={w}>
                      Sem #{w}
                    </option>
                  ))}
                </select>
              </div>

              <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1">
                <Coins className="w-3.5 h-3.5 text-[#1E60A8]" />
                <select
                  value={switcherCurrencyFilter}
                  aria-label="Filtrar por moneda"
                  onChange={(e) =>
                    applySwitcherFiltersAndAutoSelect(
                      switcherScope,
                      switcherWeekFilter,
                      e.target.value as 'ALL' | ViaticoCurrency
                    )
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
            </div>
          )}

          {/* Quick-Switch Tabs only when there is more than 1 open liquidation */}
          {switcherScope !== 'closed' && openTabsList.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto touch-scroll-x pb-0.5 pt-1.5 border-t border-slate-200/70">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                Abiertas:
              </span>
              {openTabsList.map((openLiq) => {
                const isSelected = openLiq.id === liquidation.id;
                return (
                  <button
                    key={openLiq.id}
                    type="button"
                    onClick={() => onSelectLiquidation(openLiq.id)}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] transition-colors shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#132B63] text-white border-[#132B63] font-semibold'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-[#1E60A8] hover:text-[#132B63]'
                    }`}
                  >
                    <span className="font-mono font-bold tabular-nums">
                      S{openLiq.semana || '-'}
                    </span>
                    <span
                      className={`font-semibold ${
                        isSelected ? 'text-sky-200' : 'text-[#1E60A8]'
                      }`}
                    >
                      {CURRENCY_SYMBOLS[openLiq.monedaBase]}
                    </span>
                    <span className="max-w-[140px] truncate">
                      {openLiq.lineaLiquidacion || 'Sin título'}
                    </span>
                    <span
                      className={`font-mono tabular-nums ${
                        isSelected ? 'text-white/90' : 'text-slate-500'
                      }`}
                    >
                      {formatViaticoAmount(openLiq.totalLiquidacion)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Compact Summary Metadata Strip + Toggleable Form Editor */}
        <div className="px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Liquidación:</span>
              <span className="font-bold text-slate-900 truncate max-w-[220px]">
                {liquidation.lineaLiquidacion || 'Sin título'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Semana:</span>
              <span className="font-bold text-slate-900 font-mono">#{liquidation.semana || '-'}</span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Nombre:</span>
              <span className="font-semibold text-slate-800 truncate max-w-[190px]">
                {liquidation.consultorNombre}
              </span>
            </div>

            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Sociedad:</span>
              <span className="font-semibold text-[#132B63] truncate max-w-[170px]">
                {liquidation.empresa}
              </span>
            </div>

            <div className="flex items-center gap-1.5 tabular-nums">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">Moneda:</span>
              <span className="font-semibold text-slate-800">{liquidation.monedaBase}</span>
              {liquidation.monedaBase === 'Dólares' && (
                <span className="font-mono font-bold text-[#1E60A8]">
                  (T/C {docExchangeRate || '1.00'})
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">C.C.:</span>
              <span className={`font-semibold ${resolvedCostCenter ? 'text-slate-800' : 'text-amber-700'}`}>
                {resolvedCostCenter || 'Sin asignar'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDesktopHeaderEditing((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#132B63] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Pencil className="w-3.5 h-3.5 text-[#1E60A8]" />
            <span>{isDesktopHeaderEditing ? 'Listo' : 'Editar encabezado'}</span>
            {isDesktopHeaderEditing ? (
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            )}
          </button>
        </div>

        {/* Expanded Clean Header Form Grid */}
        {isDesktopHeaderEditing && (
          <div className="px-5 py-4 bg-slate-50/50 border-t border-slate-200/80 grid grid-cols-12 gap-4 items-end">
            <div className="col-span-4">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Título / Liquidación
              </label>
              <input
                type="text"
                value={liquidation.lineaLiquidacion}
                disabled={isLocked}
                onChange={(e) => onUpdateHeader({ lineaLiquidacion: e.target.value })}
                placeholder="Ej. Visita Premicol SA de CV"
                className="w-full px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:bg-slate-100"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Semana #
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={liquidation.semana}
                disabled={isLocked}
                onChange={(e) => onUpdateHeader({ semana: e.target.value })}
                placeholder="Ej. 31"
                className="w-full px-3 py-1.5 text-xs font-semibold text-slate-900 text-center bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 tabular-nums disabled:bg-slate-100"
              />
            </div>

            <div className={liquidation.monedaBase === 'Dólares' ? 'col-span-3' : 'col-span-6'}>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Moneda Base
              </label>
              <select
                value={liquidation.monedaBase}
                disabled={isLocked}
                onChange={(e) =>
                  onUpdateHeader({ monedaBase: e.target.value as ViaticoCurrency })
                }
                className="w-full px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:opacity-70"
              >
                {VIATICO_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur}
                  </option>
                ))}
              </select>
            </div>

            {liquidation.monedaBase === 'Dólares' && (
              <div className="col-span-3">
                <label className="block text-[11px] font-semibold text-[#132B63] mb-1">
                  T/C Liquidación ($)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min="0.0001"
                  value={docFxDraft}
                  disabled={isLocked}
                  onChange={(e) => handleDocFxDraftChange(e.target.value)}
                  onBlur={handleDocFxBlur}
                  placeholder="Ej. 7.75"
                  aria-label="Tipo de cambio de liquidación en dólares"
                  className="w-full px-3 py-1.5 text-xs font-mono font-bold text-[#132B63] text-right bg-sky-50/70 border border-[#1E60A8]/40 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 tabular-nums disabled:opacity-70"
                />
              </div>
            )}

            <div className="col-span-6">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Nombre / Liquidador
                {detectedFromEmailLabel && (
                  <span className="font-normal text-slate-400 ml-1.5">
                    ({isLockedToOwnConsultor ? `bloqueado: ${detectedFromEmailLabel}` : detectedFromEmailLabel})
                  </span>
                )}
              </label>
              {(() => {
                const matchedDesktopConsultor =
                  availableConsultores.find((c) => c.id === liquidation.consultorId) ||
                  availableConsultores.find(
                    (c) =>
                      (c.odooEmployeeName || c.nombreCompleto || '').trim().toUpperCase() ===
                      (liquidation.odooEmployeeName || liquidation.consultorNombre || '')
                        .trim()
                        .toUpperCase()
                  );
                const currentDesktopSelectValue =
                  matchedDesktopConsultor?.id || liquidation.consultorId;
                return (
                  <select
                    value={currentDesktopSelectValue}
                    disabled={isLocked || (isLockedToOwnConsultor && availableConsultores.length <= 1)}
                    onChange={(e) => {
                      const chosen = availableConsultores.find((c) => c.id === e.target.value);
                      if (!chosen) return;
                      const matchedComp =
                        moduleCompanies.length > 0
                          ? moduleCompanies.find(
                              (c) =>
                                normalizeCompanyKey(c.nombre) ===
                                normalizeCompanyKey(chosen.empresa)
                            ) || moduleCompanies[0]
                          : null;
                      onUpdateHeader({
                        consultorId: chosen.id,
                        consultorNombre: chosen.nombreCompleto,
                        consultorEmail: chosen.email,
                        empresa: matchedComp ? matchedComp.nombre : chosen.empresa,
                        centroCosto: chosen.centroCosto || '',
                        odooEmployeeName: chosen.odooEmployeeName || chosen.nombreCompleto,
                        odooAnalyticDistribution: chosen.odooAnalyticDistribution || '',
                      });
                    }}
                    className="w-full px-3 py-1.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:text-slate-700 disabled:bg-slate-100"
                  >
                    {!matchedDesktopConsultor && (
                      <option value={liquidation.consultorId}>
                        {liquidation.odooEmployeeName || liquidation.consultorNombre}
                      </option>
                    )}
                    {availableConsultores.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombreCompleto}
                        {c.centroCosto ? ` · ${c.centroCosto}` : ''}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </div>

            <div className="col-span-6">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Sociedad · {liquidation.consultorEmail || 'Sin correo'}
              </label>
              {!isLocked && moduleCompanies.length > 0 ? (
                <select
                  value={liquidation.empresa}
                  onChange={(e) => onUpdateHeader({ empresa: e.target.value })}
                  aria-label="Sociedad de la liquidación"
                  className="w-full text-xs font-semibold text-[#132B63] bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                >
                  {!moduleCompanies.some((c) => c.nombre === liquidation.empresa) && (
                    <option value={liquidation.empresa}>{liquidation.empresa}</option>
                  )}
                  {moduleCompanies.map((c) => (
                    <option key={c.id} value={c.nombre}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-3 py-1.5 text-xs font-bold text-[#132B63] bg-white border border-slate-200 rounded-lg">
                  {liquidation.empresa}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Closed / Read-Only Notice with Direct Download & Archive Actions */}
      {isLocked && (
        <div className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-sm lg:text-xs text-slate-700 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Lock className="w-5 h-5 lg:w-4 lg:h-4 text-[#132B63] shrink-0 mt-0.5" />
            <div className="min-w-0 leading-relaxed">
              {liquidation.estado !== 'borrador' ? (
                <>
                  <span>
                    Esta liquidación se encuentra{' '}
                    <strong>{liquidation.estado === 'enviada' ? 'cerrada y enviada' : 'cerrada'}</strong>
                    {liquidation.closedAtIso && (
                      <>
                        {' '}el{' '}
                        <span className="font-mono tabular-nums">
                          {new Date(liquidation.closedAtIso).toLocaleDateString('es-GT')}
                        </span>
                      </>
                    )}
                    {liquidation.closedBy ? ` por ${liquidation.closedBy}` : ''}.
                  </span>
                </>
              ) : (
                <span>
                  Tu perfil está en modo <strong>Solo Consulta</strong>. Puedes inspeccionar facturas,
                  ver comprobantes y descargar el Excel o PDF compilado.
                </span>
              )}
            </div>
          </div>

          <div className={`grid gap-2.5 lg:gap-2 w-full lg:w-auto shrink-0 ${isZoomExtra ? 'grid-cols-1' : 'grid-cols-2 lg:flex lg:flex-wrap items-center'}`}>
            <button
              type="button"
              onClick={onOpenPlanillaPdfPreview}
              disabled={liquidation.items.length === 0}
              className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-[#132B63] bg-white hover:bg-sky-50 border border-slate-300 rounded-2xl lg:rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Printer className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#1E60A8]" />
              <span>Vista PDF</span>
            </button>
            <button
              type="button"
              onClick={onQuickDownloadExcel}
              disabled={liquidation.items.length === 0 || isDownloadingExcel}
              className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-slate-300 rounded-2xl lg:rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingExcel ? (
                <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-emerald-700" />
              )}
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={onQuickDownloadPdf}
              disabled={liquidation.items.length === 0 || isDownloadingPdf}
              className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-rose-800 bg-white hover:bg-rose-50 border border-slate-300 rounded-2xl lg:rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin" />
              ) : (
                <FileText className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-rose-700" />
              )}
              <span>PDF Fotos</span>
            </button>
            <button
              type="button"
              onClick={onOpenCloseEmailModal}
              disabled={liquidation.items.length === 0}
              className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-[#132B63] bg-white hover:bg-sky-50 border border-slate-300 rounded-2xl lg:rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#1E60A8]" />
              <span>Correo</span>
            </button>
            {liquidation.estado !== 'borrador' && (
              <button
                type="button"
                onClick={onOpenClosedArchive}
                className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-2xl lg:rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Archive className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                <span>Ver Cerradas</span>
              </button>
            )}
            {permissions.canOperate && (
              <button
                type="button"
                onClick={onCreateNewLiquidation}
                className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-[#132B63] bg-sky-100 hover:bg-sky-200 rounded-2xl lg:rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                <span>Nueva</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. CAPTURA DE FACTURA (ESTRUCTURA AMPLIA MÓVIL + DESKTOP) */}
      {!isLocked && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-3.5 lg:px-5 py-4 lg:py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg lg:text-sm font-extrabold text-slate-900">
              {editingItemId
                ? 'Editar Factura Seleccionada'
                : 'Registro de Factura y Comprobante'}
            </h3>

            {uploadQueue.length > 0 && (
              <span className="text-sm lg:text-xs font-semibold text-[#1E60A8] tabular-nums">
                {uploadQueue.length} comprobante(s) en cola
              </span>
            )}
          </div>

          <div className={`px-3 py-4 lg:p-5 grid grid-cols-1 gap-5 lg:gap-6 ${isZoomExtra ? '' : 'lg:grid-cols-12'}`}>
            {/* LEFT (5 cols): Receipt Uploader + Camera + Live Preview */}
            <div className={`${isZoomExtra ? '' : 'lg:col-span-5'} space-y-3.5`}>
              {/* Hidden inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void handleFilesSelected(e.target.files);
                  e.target.value = '';
                }}
              />
              <input
                ref={bulkPdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  void handleBulkPdfSelected(e.target.files);
                  e.target.value = '';
                }}
              />

              {/* Dropzone / Active Preview */}
              {activeMediaPreview ? (
                <div className="rounded-2xl lg:rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                  <div className="px-3.5 lg:px-3 py-2.5 lg:py-2 bg-slate-100/90 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 text-sm lg:text-xs font-semibold text-slate-700">
                      {activeMediaPreview.mimeType === 'application/pdf' ? (
                        <FileText className="w-5 h-5 lg:w-4 lg:h-4 text-rose-600 shrink-0" />
                      ) : (
                        <ImageIcon className="w-5 h-5 lg:w-4 lg:h-4 text-[#1E60A8] shrink-0" />
                      )}
                      <span className="truncate">{activeMediaPreview.fileName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {activeMediaPreview.mimeType !== 'application/pdf' && (
                        <button
                          type="button"
                          onClick={handleRotateCurrentPreview}
                          disabled={isExtractingAi || isRotatingImage}
                          title="Rotar imagen 90° en sentido horario"
                          className="inline-flex items-center gap-1.5 min-h-[2.75rem] lg:min-h-0 px-3 lg:px-2 py-2 lg:py-1 text-sm lg:text-[11px] font-bold text-slate-700 hover:bg-slate-200/80 rounded-xl lg:rounded-lg cursor-pointer disabled:opacity-50"
                        >
                          {isRotatingImage ? (
                            <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                          )}
                          <span>Rotar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleReExtractCurrent}
                        disabled={isExtractingAi || isRotatingImage}
                        title="Volver a leer datos de la factura con IA"
                        className="inline-flex items-center gap-1.5 min-h-[2.75rem] lg:min-h-0 px-3 lg:px-2 py-2 lg:py-1 text-sm lg:text-[11px] font-bold text-[#1E60A8] hover:bg-blue-50 rounded-xl lg:rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                        <span>Re-leer IA</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveMediaPreview(null);
                          setForm((prev) => ({
                            ...prev,
                            attachmentId: undefined,
                            attachmentName: undefined,
                            attachmentMimeType: undefined,
                            attachmentSize: undefined,
                          }));
                        }}
                        title="Quitar archivo adjunto"
                        className="min-w-[2.75rem] min-h-[2.75rem] lg:min-w-0 lg:min-h-0 inline-flex items-center justify-center p-1.5 text-slate-400 hover:text-rose-600 rounded-xl lg:rounded-lg cursor-pointer"
                      >
                        <X className="w-5 h-5 lg:w-4 lg:h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="relative h-72 lg:h-64 flex items-center justify-center bg-slate-900/5 overflow-hidden">
                    {isExtractingAi && (
                      <div className="absolute inset-0 z-10 bg-white/90 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5 p-4 text-center">
                        <Loader2 className="w-8 h-8 lg:w-7 lg:h-7 animate-spin text-[#1E60A8]" />
                        <div className="text-base lg:text-xs font-bold text-[#132B63]">
                          {bulkProgressText || 'Extrayendo datos de la factura...'}
                        </div>
                        <div className="text-xs lg:text-[11px] text-slate-500 max-w-xs">
                          {bulkProgressText
                            ? 'Cada factura detectada se agregará automáticamente a la liquidación'
                            : 'Detectando fecha, serie, número, NIT, proveedor, moneda, valor e impuestos'}
                        </div>
                      </div>
                    )}

                    {activeMediaPreview.mimeType === 'application/pdf' ? (
                      <>
                        <iframe
                          src={activeMediaPreview.dataUrl}
                          title={activeMediaPreview.fileName}
                          className="hidden lg:block w-full h-full border-0"
                        />
                        <div className="lg:hidden flex flex-col items-center justify-center gap-3 p-5 text-center">
                          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
                            <FileText className="w-7 h-7" />
                          </div>
                          <div className="text-sm font-bold text-slate-800 break-all line-clamp-2">
                            {activeMediaPreview.fileName}
                          </div>
                          <div className="text-xs text-slate-500">
                            PDF adjunto ({Math.max(1, Math.round((activeMediaPreview.size || 0) / 1024))} KB) listo para lectura y compilado vertical
                          </div>
                          <a
                            href={activeMediaPreview.dataUrl}
                            download={activeMediaPreview.fileName}
                            className="inline-flex items-center gap-2 min-h-[3rem] px-5 py-2.5 text-sm font-bold text-[#132B63] bg-white border border-slate-300 rounded-2xl"
                          >
                            <Eye className="w-4 h-4 text-[#1E60A8]" />
                            <span>Abrir / Descargar PDF</span>
                          </a>
                        </div>
                      </>
                    ) : (
                      <img
                        src={activeMediaPreview.dataUrl}
                        alt={activeMediaPreview.fileName}
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    void handleFilesSelected(e.dataTransfer.files);
                  }}
                  className={`rounded-2xl lg:rounded-xl border-2 border-dashed p-5 lg:p-6 text-center transition-colors ${
                    isDragging
                      ? 'border-[#1E60A8] bg-blue-50/70'
                      : 'border-slate-300 bg-slate-50/70 hover:border-[#1E60A8]/60'
                  }`}
                >
                  {isExtractingAi ? (
                    <div className="py-6 flex flex-col items-center gap-2.5">
                      <Loader2 className="w-8 h-8 lg:w-7 lg:h-7 animate-spin text-[#1E60A8]" />
                      <div className="text-base lg:text-xs font-bold text-[#132B63]">
                        {bulkProgressText || 'Leyendo factura con IA...'}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-14 h-14 lg:w-12 lg:h-12 rounded-2xl bg-[#1E60A8]/10 text-[#1E60A8] flex items-center justify-center mx-auto mb-3">
                        <Camera className="w-7 h-7 lg:hidden" />
                        <Upload className="w-5 h-5 hidden lg:block" />
                      </div>
                      <p className="text-base lg:text-xs font-extrabold lg:font-bold text-slate-900">
                        Subir factura o comprobante
                      </p>
                      <p className="text-sm lg:text-[11px] text-slate-500 mt-1">
                        Foto directa, factura individual o PDF masivo con varias facturas
                      </p>

                      <div className="mt-4 flex flex-col lg:flex-row lg:flex-wrap items-stretch lg:items-center justify-center gap-3 lg:gap-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="w-full lg:w-auto inline-flex items-center justify-center gap-2.5 min-h-[3.5rem] lg:min-h-0 px-5 lg:px-3.5 py-3.5 lg:py-2 text-base lg:text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-2xl lg:rounded-xl transition-colors cursor-pointer"
                        >
                          <Camera className="w-5 h-5 lg:w-3.5 lg:h-3.5" />
                          <span>Tomar Foto de Factura</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full lg:w-auto inline-flex items-center justify-center gap-2.5 min-h-[3.25rem] lg:min-h-0 px-5 lg:px-3.5 py-3 lg:py-2 text-base lg:text-xs font-bold text-[#132B63] bg-white hover:bg-slate-100 border border-slate-300 rounded-2xl lg:rounded-xl transition-colors cursor-pointer"
                        >
                          <Upload className="w-5 h-5 lg:w-3.5 lg:h-3.5 text-[#1E60A8]" />
                          <span>Subir Galería / PDF</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => bulkPdfInputRef.current?.click()}
                          disabled={isExtractingAi}
                          title="Adjunta un único PDF con múltiples facturas para leerlas y agregarlas automáticamente a la liquidación"
                          className="w-full lg:w-auto inline-flex items-center justify-center gap-2 min-h-[3.25rem] lg:min-h-0 px-5 lg:px-3.5 py-3 lg:py-2 text-base lg:text-xs font-bold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-[#1E60A8]/35 rounded-2xl lg:rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <Layers className="w-5 h-5 lg:w-3.5 lg:h-3.5 text-[#1E60A8]" />
                          <span>Carga Masiva (PDF Varias Facturas)</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Quick replace buttons when preview exists */}
              {activeMediaPreview && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5 lg:gap-2">
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 min-h-[3.125rem] lg:min-h-0 px-4 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold text-[#132B63] bg-white hover:bg-slate-50 border border-slate-300 rounded-2xl lg:rounded-xl cursor-pointer"
                  >
                    <Camera className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#1E60A8] shrink-0" />
                    <span>Tomar otra foto</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 min-h-[3.125rem] lg:min-h-0 px-4 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-2xl lg:rounded-xl cursor-pointer"
                  >
                    <Upload className="w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0" />
                    <span>Cambiar archivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => bulkPdfInputRef.current?.click()}
                    disabled={isExtractingAi}
                    className="inline-flex items-center justify-center gap-2 min-h-[3.125rem] lg:min-h-0 px-4 lg:px-2.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-[#1E60A8]/35 rounded-2xl lg:rounded-xl cursor-pointer disabled:opacity-50"
                  >
                    <Layers className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#1E60A8] shrink-0" />
                    <span>PDF Masivo</span>
                  </button>
                </div>
              )}

              {/* AI Extraction Status Banner */}
              {aiStatusBanner && (
                <div
                  className={`px-4 lg:px-3.5 py-3.5 lg:py-3 rounded-2xl lg:rounded-xl border text-sm lg:text-[11px] space-y-2.5 leading-relaxed ${
                    aiStatusBanner.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : aiStatusBanner.type === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {aiStatusBanner.type === 'success' ? (
                      <Sparkles className="w-5 h-5 lg:w-4 lg:h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 lg:w-4 lg:h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{aiStatusBanner.text}</span>
                  </div>
                  {aiStatusBanner.type === 'error' && activeMediaPreview && (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleReExtractCurrent}
                        disabled={isExtractingAi}
                        className="w-full lg:w-auto inline-flex items-center justify-center gap-2 min-h-[2.875rem] lg:min-h-0 px-4 lg:px-3.5 py-2.5 lg:py-1 text-sm lg:text-[11px] font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-50 rounded-xl lg:rounded-lg transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                        <span>Reintentar lectura IA</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT (7 cols): Editable Extracted Fields + Commercial Digitization */}
            <form onSubmit={handleSubmitItem} className={`${isZoomExtra ? '' : 'lg:col-span-7'} space-y-6 lg:space-y-4`}>
              {formError && (
                <div className="px-4 py-3 rounded-2xl lg:rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm lg:text-xs font-medium flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 lg:w-4 lg:h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Sub-section A: Invoice Extracted Fields */}
              <div className="space-y-4 lg:space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 lg:border-slate-100 pb-2 lg:pb-1.5">
                  <span className="text-sm lg:text-[11px] font-extrabold uppercase tracking-wider text-[#132B63]">
                    1. Datos de la Factura
                  </span>
                  {form.extractedByAi && (
                    <span className="text-xs lg:text-[11px] font-bold text-emerald-700 inline-flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
                      <span>Sugerido por IA</span>
                    </span>
                  )}
                </div>

                {/* Proveedor + Valor Factura + Moneda + Tipo Cambio (Phone-first spacious layout) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3">
                  <div className="lg:col-span-5">
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Proveedor *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.proveedor}
                      onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                      placeholder="Nombre del comercio o razón social"
                      className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs font-medium text-slate-900 rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Valor Factura *
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      required
                      value={form.valorFactura}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          valorFactura: e.target.value,
                          valorReintegrarManual: '',
                          montoImpuestoManual: '',
                        })
                      }
                      placeholder="0.00"
                      className="w-full min-h-[3.5rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-2xl lg:text-xs font-extrabold lg:font-normal text-right font-mono tabular-nums text-[#132B63] lg:text-slate-900 rounded-2xl lg:rounded-lg border-2 lg:border border-[#1E60A8]/40 lg:border-slate-300 bg-sky-50/20 lg:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                  </div>

                  <div className={`lg:col-span-4 grid gap-3 ${isZoomHigh ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    <div>
                      <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                        Moneda
                      </label>
                      <select
                        value={form.moneda}
                        onChange={(e) =>
                          handleCurrencyChange(e.target.value as ViaticoCurrency)
                        }
                        className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-base lg:text-xs font-semibold rounded-2xl lg:rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                      >
                        {VIATICO_CURRENCIES.map((cur) => (
                          <option key={cur} value={cur}>
                            {cur}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                        Tipo Cambio{docExchangeRate ? ` (Doc: ${docExchangeRate})` : ''}
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0.00000001"
                        value={form.tipoCambio}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            tipoCambio: e.target.value,
                            valorReintegrarManual: '',
                          })
                        }
                        className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs text-right font-mono tabular-nums rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                      />
                    </div>
                  </div>
                </div>

                {/* Taxes + Valor Reintegrar Inline Bar */}
                <div className="rounded-2xl lg:rounded-xl bg-slate-50 border border-slate-200/90 p-3.5 lg:p-3 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3 items-center">
                  <div className="lg:col-span-4">
                    <div className="text-xs lg:text-[10px] font-extrabold uppercase tracking-wider text-slate-600 lg:text-slate-500 mb-2 lg:mb-1">
                      ¿Aplica Impuestos?
                    </div>
                    <div className="grid grid-cols-2 lg:inline-flex rounded-2xl lg:rounded-lg border border-slate-300 overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            aplicaImpuestos: true,
                            porcentajeImpuesto:
                              Number(prev.porcentajeImpuesto) > 0
                                ? prev.porcentajeImpuesto
                                : String(DEFAULT_TAX_RATE_BY_CURRENCY[prev.moneda] || 12),
                          }))
                        }
                        className={`min-h-[3rem] lg:min-h-0 px-3 py-2.5 lg:py-1 text-sm lg:text-xs font-bold lg:font-semibold transition-colors cursor-pointer ${
                          form.aplicaImpuestos
                            ? 'bg-[#1E60A8] text-white'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        Sí aplica
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            aplicaImpuestos: false,
                            porcentajeImpuesto: '0',
                            montoImpuestoManual: '',
                          }))
                        }
                        className={`min-h-[3rem] lg:min-h-0 px-3 py-2.5 lg:py-1 text-sm lg:text-xs font-bold lg:font-semibold transition-colors cursor-pointer ${
                          !form.aplicaImpuestos
                            ? 'bg-slate-700 text-white'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        No aplica
                      </button>
                    </div>
                  </div>

                  {form.aplicaImpuestos ? (
                    <div className={`lg:col-span-5 grid lg:grid-cols-12 gap-3 lg:gap-2.5 items-end ${isZoomHigh ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      <div className="lg:col-span-4">
                        <label className="block text-xs lg:text-[10px] font-bold uppercase tracking-wider text-slate-600 lg:text-slate-500 mb-1.5 lg:mb-1">
                          % Impuesto
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          max="100"
                          value={form.porcentajeImpuesto}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              porcentajeImpuesto: e.target.value,
                              montoImpuestoManual: '',
                            })
                          }
                          className="w-full min-h-[3.125rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1 text-lg lg:text-xs text-right font-mono tabular-nums bg-white rounded-2xl lg:rounded-lg border border-slate-300"
                        />
                      </div>
                      <div className="lg:col-span-8">
                        <label className="block text-xs lg:text-[10px] font-bold uppercase tracking-wider text-slate-600 lg:text-slate-500 mb-1.5 lg:mb-1">
                          Monto Imp. / Base
                        </label>
                        <div className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            value={
                              form.montoImpuestoManual !== ''
                                ? form.montoImpuestoManual
                                : String(computedTax.montoImpuesto)
                            }
                            onChange={(e) =>
                              setForm({ ...form, montoImpuestoManual: e.target.value })
                            }
                            className="w-full lg:w-20 min-h-[3.125rem] lg:min-h-0 px-3.5 lg:px-2.5 py-2.5 lg:py-1 text-lg lg:text-xs text-right font-mono tabular-nums bg-white rounded-2xl lg:rounded-lg border border-slate-300"
                          />
                          <span className="text-xs lg:text-[11px] text-slate-500 font-mono tabular-nums truncate">
                            Base: {formatViaticoAmount(computedTax.valorSinImpuesto)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="lg:col-span-5 text-sm lg:text-[11px] text-slate-500">
                      Exento / sin crédito fiscal (ej. recibo exterior, Uber, Airbnb).
                    </div>
                  )}

                  <div className="lg:col-span-3 flex flex-col items-stretch lg:items-end justify-center pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-200/80">
                    <div className="text-xs lg:text-[10px] font-extrabold uppercase tracking-wider text-slate-600 lg:text-slate-500 mb-1">
                      Valor Pago / Reintegrar ({baseCurrency})
                    </div>
                    {form.moneda !== baseCurrency ? (
                      <div className="w-full lg:max-w-[175px] space-y-1">
                        <div className="relative flex items-center">
                          <span className="absolute left-2.5 text-xs font-bold text-slate-500 pointer-events-none">
                            {CURRENCY_SYMBOLS[baseCurrency] || ''}
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            aria-label={`Valor de pago en ${baseCurrency}`}
                            value={
                              form.valorReintegrarManual !== ''
                                ? form.valorReintegrarManual
                                : numericValorFactura > 0
                                ? computedReintegrar.toFixed(2)
                                : ''
                            }
                            onChange={(e) => {
                              const raw = e.target.value;
                              const parsed = Number(raw);
                              setForm((prev) => {
                                const invVal = Math.max(0, Number(prev.valorFactura) || 0);
                                let nextTc = prev.tipoCambio;
                                if (
                                  raw.trim() !== '' &&
                                  Number.isFinite(parsed) &&
                                  parsed > 0 &&
                                  invVal > 0
                                ) {
                                  nextTc = String(roundExchangeRate(parsed / invVal));
                                }
                                return {
                                  ...prev,
                                  valorReintegrarManual: raw,
                                  tipoCambio: nextTc,
                                };
                              });
                            }}
                            placeholder="0.00"
                            className="w-full min-h-[3rem] lg:min-h-0 pl-10 pr-2.5 py-2 lg:py-1 text-lg lg:text-sm font-extrabold text-right font-mono tabular-nums text-[#132B63] bg-white rounded-xl lg:rounded-lg border-2 border-[#1E60A8]/50 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                          />
                        </div>
                        <div className="text-[10px] text-[#1E60A8] font-medium text-left lg:text-right">
                          Editable: recalcula el tipo de cambio automáticamente
                        </div>
                      </div>
                    ) : (
                      <div className="text-2xl lg:text-base font-extrabold text-[#132B63] font-mono tabular-nums">
                        {formatViaticoAmount(computedReintegrar, baseCurrency, true)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Fiscal Document Fields (Fecha, Serie, No. Doc, NIT) */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 lg:gap-3 pt-1">
                  <div>
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Fecha Doc.
                    </label>
                    <input
                      type="text"
                      value={form.fechaDoc}
                      onChange={(e) => setForm({ ...form, fechaDoc: e.target.value })}
                      placeholder="DD/MM/YYYY"
                      className="w-full min-h-[3.25rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Serie Doc. (si aplica)
                    </label>
                    <input
                      type="text"
                      value={form.serieDoc}
                      onChange={(e) => setForm({ ...form, serieDoc: e.target.value })}
                      placeholder="Ej. FD0887E5"
                      className="w-full min-h-[3.25rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      No. Doc.
                    </label>
                    <input
                      type="text"
                      value={form.noDoc}
                      onChange={(e) => setForm({ ...form, noDoc: e.target.value })}
                      placeholder="Número factura"
                      className="w-full min-h-[3.25rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      NIT
                    </label>
                    <input
                      type="text"
                      value={form.nit}
                      onChange={(e) => setForm({ ...form, nit: e.target.value })}
                      placeholder="NIT / ID fiscal"
                      className="w-full min-h-[3.25rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Sub-section B: Commercial Fields Digitized by Liquidador */}
              <div className="space-y-4 lg:space-y-3 pt-2">
                <div className="border-b border-slate-200 lg:border-slate-100 pb-2 lg:pb-1.5">
                  <span className="text-sm lg:text-[11px] font-extrabold uppercase tracking-wider text-[#132B63]">
                    2. Detalle Comercial y Gasto
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3">
                  <div className="lg:col-span-4">
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Categoría *
                    </label>
                    <select
                      value={form.categoria}
                      onChange={(e) =>
                        setForm({ ...form, categoria: e.target.value as ViaticoCategory })
                      }
                      className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs font-medium rounded-2xl lg:rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    >
                      {VIATICO_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-4">
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Cliente / Contacto
                    </label>
                    <input
                      type="text"
                      list="viaticos-cliente-list"
                      value={form.clienteContacto}
                      onChange={(e) =>
                        setForm({ ...form, clienteContacto: e.target.value })
                      }
                      placeholder="Ej. Premicol - Sarmientos y Bodega"
                      className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                    <datalist id="viaticos-cliente-list">
                      {clienteSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div className="lg:col-span-4">
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Objetivo Comercial
                    </label>
                    <input
                      type="text"
                      list="viaticos-objetivo-list"
                      value={form.objetivoComercial}
                      onChange={(e) =>
                        setForm({ ...form, objetivoComercial: e.target.value })
                      }
                      placeholder="Ej. Seguimiento planta / visita técnica"
                      className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                    <datalist id="viaticos-objetivo-list">
                      {objetivoSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-3">
                  <div className="lg:col-span-9">
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Descripción del Gasto
                    </label>
                    <input
                      type="text"
                      value={form.descripcionGasto}
                      onChange={(e) =>
                        setForm({ ...form, descripcionGasto: e.target.value })
                      }
                      placeholder="Ej. Desayuno 28 de julio, Elder-Melania y Cecilia"
                      className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <label className="block text-sm lg:text-[11px] font-bold lg:font-semibold text-slate-700 mb-1.5 lg:mb-1">
                      Kilometraje
                    </label>
                    <input
                      type="text"
                      value={form.kilometraje}
                      onChange={(e) => setForm({ ...form, kilometraje: e.target.value })}
                      placeholder="Ej. 310 km"
                      className="w-full min-h-[3.375rem] lg:min-h-0 px-3.5 lg:px-2.5 py-3 lg:py-1.5 text-lg lg:text-xs rounded-2xl lg:rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Sub-section C: Clasificación Contable Odoo por Documento */}
              <div className="pt-2 border-t border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setShowOdooDocFields((v) => !v)}
                  className="w-full py-2 flex items-center justify-between gap-2 text-left hover:bg-slate-50 rounded-xl px-2 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="text-xs lg:text-[11px] font-extrabold uppercase tracking-wider text-[#132B63]">
                      3. Clasificación Odoo (Documento)
                    </span>
                    <div className="text-[11px] text-slate-500 truncate">
                      {form.odooDocType || 'Auto (FEL/Recibo)'} ·{' '}
                      {form.odooProductId || 'Auto según categoría'} ·{' '}
                      {form.odooTaxIndicator || 'Auto impuesto'}
                    </div>
                  </div>
                  {showOdooDocFields ? (
                    <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                </button>

                {showOdooDocFields && (
                  <div className="p-3.5 border-t border-slate-200 bg-white grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Tipo Documento (l10n_gt_edi_doc_type)
                      </label>
                      <select
                        value={form.odooDocType}
                        onChange={(e) =>
                          setForm({ ...form, odooDocType: e.target.value })
                        }
                        className="w-full min-h-[42px] lg:min-h-0 px-2.5 py-1.5 text-sm lg:text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="">Automático según comprobante</option>
                        {catalogs.docTypes
                          .filter((d) => d.activo !== false)
                          .map((d) => (
                            <option key={d.id} value={d.labelOdoo}>
                              {d.labelOdoo}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="lg:col-span-6">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Código de Gasto Odoo (product_id)
                      </label>
                      <select
                        value={form.odooProductId}
                        onChange={(e) =>
                          setForm({ ...form, odooProductId: e.target.value })
                        }
                        className="w-full min-h-[42px] lg:min-h-0 px-2.5 py-1.5 text-sm lg:text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="">Automático según categoría</option>
                        {catalogs.expenseCodes
                          .filter((c) => c.activo !== false)
                          .map((c) => (
                            <option key={c.id} value={c.labelOdoo}>
                              {c.labelOdoo}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="lg:col-span-5">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Indicador de Impuesto (tax_ids)
                      </label>
                      <select
                        value={form.odooTaxIndicator}
                        onChange={(e) =>
                          setForm({ ...form, odooTaxIndicator: e.target.value })
                        }
                        className="w-full min-h-[42px] lg:min-h-0 px-2.5 py-1.5 text-sm lg:text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="">Automático según documento e IVA</option>
                        {catalogs.taxIndicators
                          .filter((t) => t.activo !== false)
                          .map((t) => (
                            <option key={t.id} value={t.nombreImpuesto}>
                              {t.nombreImpuesto}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="lg:col-span-3">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Tipo Gasto (expense_type)
                      </label>
                      <select
                        value={form.odooExpenseType}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            odooExpenseType: e.target.value as OdooExpenseType | '',
                          })
                        }
                        className="w-full min-h-[42px] lg:min-h-0 px-2.5 py-1.5 text-sm lg:text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="">
                          Predeterminado ({catalogs.defaultExpenseType || 'Gasto'})
                        </option>
                        <option value="Gasto">Gasto</option>
                        <option value="Tarjeta">Tarjeta</option>
                      </select>
                    </div>

                    <div className="lg:col-span-4">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Override C.C. Documento (Opcional)
                      </label>
                      <select
                        value={form.odooCostCenterCode}
                        onChange={(e) => {
                          const ccVal = e.target.value;
                          const matched = catalogs.costCenters.find(
                            (cc) => cc.cuentaAnalitica === ccVal
                          );
                          setForm({
                            ...form,
                            odooCostCenterCode: ccVal,
                            odooAnalyticDistribution:
                              matched?.analyticDistribution || '',
                          });
                        }}
                        className="w-full min-h-[42px] lg:min-h-0 px-2.5 py-1.5 text-sm lg:text-xs rounded-lg border border-slate-300 bg-white"
                      >
                        <option value="">
                          Heredar de empleado ({resolvedCostCenter || 'sin asignar'})
                        </option>
                        {catalogs.costCenters
                          .filter((cc) => cc.activo !== false)
                          .map((cc) => (
                            <option key={cc.id} value={cc.cuentaAnalitica}>
                              {cc.cuentaAnalitica} ({cc.analyticDistribution})
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Sub-section D: Dividir gastos entre empleados (última opción, solo aplicada en descarga Odoo) */}
              <div className="pt-2 border-t border-slate-200/80">
                <div className="px-2 py-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.splitByEmployeesEnabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          splitByEmployeesEnabled: checked,
                          splitByEmployeesCount:
                            checked && (!prev.splitByEmployeesCount || Number(prev.splitByEmployeesCount) < 2)
                              ? '2'
                              : prev.splitByEmployeesCount,
                        }));
                      }}
                      className="w-5 h-5 lg:w-4 lg:h-4 rounded border-slate-300 text-[#1E60A8]"
                    />
                    <div>
                      <span className="text-xs lg:text-[11px] font-extrabold uppercase tracking-wider text-[#132B63] flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-[#1E60A8]" />
                        <span>4. Dividir gastos</span>
                      </span>
                      <div className="text-[11px] text-slate-500">
                        Repartir monto y centro de costo entre varios empleados al descargar Odoo (mantiene al empleado que liquida)
                      </div>
                    </div>
                  </label>
                  {form.splitByEmployeesEnabled && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${
                        form.splitEmployeeNames.length ===
                        Math.max(2, Math.floor(Number(form.splitByEmployeesCount) || 2))
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {form.splitEmployeeNames.length} de{' '}
                      {Math.max(2, Math.floor(Number(form.splitByEmployeesCount) || 2))} seleccionados
                    </span>
                  )}
                </div>

                {form.splitByEmployeesEnabled && (
                  <div className="p-3.5 border-t border-slate-200 bg-white space-y-3">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
                      <div className="lg:col-span-4">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Cantidad de personas *
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={2}
                          max={30}
                          step={1}
                          value={form.splitByEmployeesCount}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const parsed = Math.floor(Number(raw) || 0);
                            setForm((prev) => ({
                              ...prev,
                              splitByEmployeesCount: raw,
                              splitEmployeeNames:
                                parsed >= 2 && prev.splitEmployeeNames.length > parsed
                                  ? prev.splitEmployeeNames.slice(0, parsed)
                                  : prev.splitEmployeeNames,
                            }));
                          }}
                          className="w-full min-h-[42px] lg:min-h-0 px-3 py-1.5 text-sm lg:text-xs font-mono font-bold text-[#132B63] rounded-lg border border-slate-300 bg-white"
                        />
                      </div>

                      <div className="lg:col-span-8">
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Buscar empleado Odoo para seleccionar ({form.splitEmployeeNames.length}/
                          {Math.max(2, Math.floor(Number(form.splitByEmployeesCount) || 2))})
                        </label>
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={splitEmployeeSearch}
                            onChange={(e) => setSplitEmployeeSearch(e.target.value)}
                            placeholder="Filtrar empleados por nombre o centro de costo..."
                            className="w-full min-h-[42px] lg:min-h-0 pl-8 pr-3 py-1.5 text-sm lg:text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white"
                          />
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const targetMax = Math.max(
                        2,
                        Math.min(30, Math.floor(Number(form.splitByEmployeesCount) || 2))
                      );
                      const q = splitEmployeeSearch.trim().toLowerCase();
                      const activeEmployees = catalogs.employees.filter((emp) => {
                        if (emp.activo === false) return false;
                        if (!q) return true;
                        return (
                          emp.nombreCompleto.toLowerCase().includes(q) ||
                          (emp.centroCosto || '').toLowerCase().includes(q)
                        );
                      });
                      const limitReached = form.splitEmployeeNames.length >= targetMax;

                      return (
                        <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pr-1">
                          {activeEmployees.map((emp) => {
                            const upperName = emp.nombreCompleto.trim().toUpperCase();
                            const isChecked = form.splitEmployeeNames.includes(upperName);
                            const isDisabled = !isChecked && limitReached;
                            return (
                              <label
                                key={emp.id}
                                className={`flex items-start gap-2 p-2 rounded-lg border text-[11px] transition-colors ${
                                  isChecked
                                    ? 'bg-[#1E60A8]/10 border-[#1E60A8]/50 text-[#132B63] cursor-pointer'
                                    : isDisabled
                                    ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isDisabled}
                                  onChange={() => {
                                    setForm((prev) => {
                                      const exists = prev.splitEmployeeNames.includes(upperName);
                                      if (exists) {
                                        return {
                                          ...prev,
                                          splitEmployeeNames: prev.splitEmployeeNames.filter(
                                            (x) => x !== upperName
                                          ),
                                        };
                                      }
                                      if (prev.splitEmployeeNames.length >= targetMax) {
                                        return prev;
                                      }
                                      return {
                                        ...prev,
                                        splitEmployeeNames: [...prev.splitEmployeeNames, upperName],
                                      };
                                    });
                                  }}
                                  className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-bold truncate">{emp.nombreCompleto}</div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {emp.centroCosto || 'Sin C.C.'}
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Submit Actions */}
              <div className="pt-3 lg:pt-2 flex flex-col-reverse lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-2">
                <button
                  type="button"
                  onClick={() => handleResetForm(false)}
                  className="w-full lg:w-auto inline-flex items-center justify-center gap-2 min-h-[3.125rem] lg:min-h-0 px-4 lg:px-3 py-3 lg:py-2 text-sm lg:text-xs font-bold lg:font-semibold text-slate-600 hover:text-slate-900 bg-slate-50 lg:bg-transparent hover:bg-slate-100 border border-slate-200 lg:border-0 rounded-2xl lg:rounded-xl transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                  <span>{editingItemId ? 'Cancelar edición' : 'Limpiar campos'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isExtractingAi}
                  className="w-full lg:w-auto inline-flex items-center justify-center gap-2.5 min-h-[3.5rem] lg:min-h-0 px-6 lg:px-5 py-3.5 lg:py-2 text-base lg:text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-50 rounded-2xl lg:rounded-xl transition-colors cursor-pointer"
                >
                  {editingItemId ? (
                    <>
                      <Check className="w-5 h-5 lg:w-4 lg:h-4" />
                      <span>Guardar Cambios en Fila</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 lg:w-4 lg:h-4" />
                      <span>
                        {uploadQueue.length > 0
                          ? `Agregar y pasar al siguiente (${uploadQueue.length} en cola)`
                          : 'Agregar Factura a Liquidación'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* 3. PLANILLA OFICIAL PREMEX (Diseño Original Resumen Excel en Móvil y Desktop) */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="px-3.5 lg:px-5 py-4 lg:py-3.5 border-b border-slate-200 flex flex-col lg:flex-row lg:flex-wrap lg:items-center lg:justify-between gap-3.5 lg:gap-3">
          <div>
            <h3 className="text-base lg:text-sm font-extrabold lg:font-bold text-slate-900">
              Detalle de Liquidación de Viáticos ({liquidation.items.length})
            </h3>
            <p className="text-sm lg:text-[11px] text-slate-500 tabular-nums mt-0.5">
              Con imp.:{' '}
              <strong className="text-slate-800">
                {formatViaticoAmount(liquidation.totalConImpuestos, liquidation.monedaBase, true)}
              </strong>{' '}
              · IVA est. {formatViaticoAmount(liquidation.totalImpuestos)} · Sin imp.:{' '}
              <strong className="text-slate-800">
                {formatViaticoAmount(liquidation.totalSinImpuestos, liquidation.monedaBase, true)}
              </strong>
            </p>
          </div>

          <div className={`grid gap-2.5 lg:gap-2 w-full lg:w-auto ${isZoomExtra ? 'grid-cols-1' : 'grid-cols-2 lg:flex lg:flex-wrap items-center'}`}>
            <button
              type="button"
              onClick={onOpenPlanillaPdfPreview}
              disabled={liquidation.items.length === 0}
              className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-3 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-[#132B63] bg-sky-50/70 hover:bg-sky-100 border border-sky-200 rounded-2xl lg:rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="Visualizar e imprimir la planilla oficial en formato PDF"
            >
              <Printer className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#1E60A8]" />
              <span>Vista PDF</span>
            </button>

            <button
              type="button"
              onClick={onQuickDownloadExcel}
              disabled={liquidation.items.length === 0 || isDownloadingExcel}
              className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-3 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-2xl lg:rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingExcel ? (
                <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin text-emerald-700" />
              ) : (
                <FileSpreadsheet className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-emerald-700" />
              )}
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={onQuickDownloadPdf}
              disabled={liquidation.items.length === 0 || isDownloadingPdf}
              className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-3 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-2xl lg:rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin text-rose-700" />
              ) : (
                <FileText className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-rose-700" />
              )}
              <span>PDF Comprobantes</span>
            </button>

            {!isLocked && liquidation.estado === 'borrador' && permissions.canOperate && (
              <button
                type="button"
                onClick={onOpenCloseConfirmModal}
                disabled={liquidation.items.length === 0}
                className="inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-2xl lg:rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Lock className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                <span>Cerrar Liquidación</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCloseEmailModal}
              disabled={liquidation.items.length === 0}
              className={`${isZoomExtra ? '' : 'col-span-2 lg:col-span-1'} inline-flex items-center justify-center gap-2 min-h-[3rem] lg:min-h-0 px-3.5 lg:px-3 py-2.5 lg:py-1.5 text-sm lg:text-xs font-bold lg:font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-2xl lg:rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap`}
            >
              <Send className="w-4 h-4 lg:w-3.5 lg:h-3.5 text-[#1E60A8]" />
              <span>Enviar Correo</span>
            </button>
          </div>
        </div>

        {/* Inline double-click edit hint */}
        {!isLocked && liquidation.items.length > 0 && (
          <div className="px-4 py-2 bg-sky-50/60 border-b border-slate-200/80 text-[11px] font-medium text-[#132B63] flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Edición rápida en tabla:</strong> Haz <strong>doble clic</strong> sobre cualquier celda para editarla directamente, o marca varias filas con los recuadros para <strong>modificarlas masivamente</strong>.
            </span>
            <span className="lg:hidden text-slate-500">
              Desliza horizontalmente para ver todas las columnas →
            </span>
          </div>
        )}

        {/* Contextual Bulk Edit Bar when >= 1 invoice row is checked */}
        {!isLocked && selectedItemIds.length > 0 && (
          <div className="px-4 py-3.5 bg-[#EFF6FF] border-b border-[#1E60A8]/30 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#132B63]">
                <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-lg bg-[#1E60A8] text-white tabular-nums">
                  {selectedItemIds.length}
                </span>
                <span>
                  {selectedItemIds.length === 1
                    ? '1 factura seleccionada para edición masiva'
                    : `${selectedItemIds.length} facturas seleccionadas para edición masiva`}
                </span>
                <span className="font-normal text-slate-600 hidden sm:inline">
                  — Completa solo los campos que deseas unificar
                </span>
              </div>
              <button
                type="button"
                onClick={() => resetBulkEditPanel(true)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                Deseleccionar todo
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {/* Cliente / Contacto */}
              <div className="bg-white rounded-xl border border-slate-200 p-2 space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyCliente}
                    onChange={(e) => setBulkApplyCliente(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <span>Cliente / Contacto</span>
                </label>
                <input
                  type="text"
                  list="viaticos-cliente-list"
                  value={bulkCliente}
                  onChange={(e) => {
                    setBulkCliente(e.target.value);
                    if (!bulkApplyCliente && e.target.value.trim()) {
                      setBulkApplyCliente(true);
                    }
                  }}
                  placeholder="Ej. Agropecuaria..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              {/* Objetivo Comercial */}
              <div className="bg-white rounded-xl border border-slate-200 p-2 space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyObjetivo}
                    onChange={(e) => setBulkApplyObjetivo(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <span>Objetivo Comercial</span>
                </label>
                <input
                  type="text"
                  list="viaticos-objetivo-list"
                  value={bulkObjetivo}
                  onChange={(e) => {
                    setBulkObjetivo(e.target.value);
                    if (!bulkApplyObjetivo && e.target.value.trim()) {
                      setBulkApplyObjetivo(true);
                    }
                  }}
                  placeholder="Ej. Seguimiento técnica..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              {/* Descripción del Gasto */}
              <div className="bg-white rounded-xl border border-slate-200 p-2 space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyDescripcion}
                    onChange={(e) => setBulkApplyDescripcion(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <span>Descripción del Gasto</span>
                </label>
                <input
                  type="text"
                  value={bulkDescripcion}
                  onChange={(e) => {
                    setBulkDescripcion(e.target.value);
                    if (!bulkApplyDescripcion && e.target.value.trim()) {
                      setBulkApplyDescripcion(true);
                    }
                  }}
                  placeholder="Ej. Gira clientes región..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              {/* Categoría */}
              <div className="bg-white rounded-xl border border-slate-200 p-2 space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyCategoria}
                    onChange={(e) => setBulkApplyCategoria(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <span>Categoría</span>
                </label>
                <select
                  value={bulkCategoria}
                  onChange={(e) => {
                    setBulkCategoria(e.target.value as ViaticoCategory);
                    setBulkApplyCategoria(true);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                >
                  {VIATICO_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              {/* Kilometraje */}
              <div className="bg-white rounded-xl border border-slate-200 p-2 space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyKilometraje}
                    onChange={(e) => setBulkApplyKilometraje(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <span>Kilometraje</span>
                </label>
                <input
                  type="text"
                  value={bulkKilometraje}
                  onChange={(e) => {
                    setBulkKilometraje(e.target.value);
                    if (!bulkApplyKilometraje && e.target.value.trim()) {
                      setBulkApplyKilometraje(true);
                    }
                  }}
                  placeholder="Ej. 140 km"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                />
              </div>

              {/* Centro de Costo (CECO) */}
              <div className="bg-white rounded-xl border border-slate-200 p-2 space-y-1">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplyCeco}
                    onChange={(e) => setBulkApplyCeco(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <span>Centro de Costo (CECO)</span>
                </label>
                <select
                  value={bulkCeco}
                  onChange={(e) => {
                    setBulkCeco(e.target.value);
                    setBulkApplyCeco(true);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30"
                >
                  <option value="">
                    Heredar de empleado ({resolvedCostCenter || 'sin asignar'})
                  </option>
                  {catalogs.costCenters
                    .filter((cc) => cc.activo !== false)
                    .map((cc) => (
                      <option key={cc.id} value={cc.cuentaAnalitica}>
                        {cc.cuentaAnalitica} ({cc.analyticDistribution})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* Bulk Split Expense Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-[11px] font-bold text-[#132B63] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={bulkApplySplit}
                    onChange={(e) => {
                      setBulkApplySplit(e.target.checked);
                      setBulkEditError(null);
                    }}
                    className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                  />
                  <Users className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Dividir gasto entre empleados (aplicar a seleccionadas)</span>
                </label>

                {bulkApplySplit && (
                  <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setBulkSplitMode('set');
                        setBulkEditError(null);
                      }}
                      className={`px-2.5 py-1 cursor-pointer transition-colors ${
                        bulkSplitMode === 'set'
                          ? 'bg-[#1E60A8] text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Asignar división
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBulkSplitMode('clear');
                        setBulkEditError(null);
                      }}
                      className={`px-2.5 py-1 cursor-pointer transition-colors ${
                        bulkSplitMode === 'clear'
                          ? 'bg-rose-600 text-white'
                          : 'bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Quitar división
                    </button>
                  </div>
                )}
              </div>

              {bulkApplySplit && bulkSplitMode === 'set' && (
                <div className="space-y-2 pt-1 border-t border-slate-100">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                    <div className="sm:col-span-3">
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Cantidad personas *
                      </label>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={2}
                        max={30}
                        step={1}
                        value={bulkSplitCount}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const parsed = Math.floor(Number(raw) || 0);
                          setBulkSplitCount(raw);
                          setBulkEditError(null);
                          if (parsed >= 2 && bulkSplitEmployeeNames.length > parsed) {
                            setBulkSplitEmployeeNames((prev) => prev.slice(0, parsed));
                          }
                        }}
                        className="w-full px-2.5 py-1 text-xs font-mono font-bold text-[#132B63] rounded-lg border border-slate-300"
                      />
                    </div>
                    <div className="sm:col-span-6">
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Buscar empleado Odoo
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          value={bulkSplitSearch}
                          onChange={(e) => setBulkSplitSearch(e.target.value)}
                          placeholder="Filtrar por nombre o CECO..."
                          className="w-full pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-3 flex items-center sm:justify-end">
                      <span
                        className={`text-[11px] font-bold px-2 py-1 rounded-lg ${
                          bulkSplitEmployeeNames.length ===
                          Math.max(2, Math.floor(Number(bulkSplitCount) || 2))
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {bulkSplitEmployeeNames.length} de{' '}
                        {Math.max(2, Math.floor(Number(bulkSplitCount) || 2))} selec.
                      </span>
                    </div>
                  </div>

                  {(() => {
                    const targetMax = Math.max(
                      2,
                      Math.min(30, Math.floor(Number(bulkSplitCount) || 2))
                    );
                    const q = bulkSplitSearch.trim().toLowerCase();
                    const activeEmployees = catalogs.employees.filter((emp) => {
                      if (emp.activo === false) return false;
                      if (!q) return true;
                      return (
                        emp.nombreCompleto.toLowerCase().includes(q) ||
                        (emp.centroCosto || '').toLowerCase().includes(q)
                      );
                    });
                    const limitReached = bulkSplitEmployeeNames.length >= targetMax;

                    return (
                      <div className="max-h-36 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pr-1">
                        {activeEmployees.map((emp) => {
                          const upperName = emp.nombreCompleto.trim().toUpperCase();
                          const isChecked = bulkSplitEmployeeNames.includes(upperName);
                          const isEmpDisabled = !isChecked && limitReached;
                          return (
                            <label
                              key={emp.id}
                              className={`flex items-start gap-2 p-1.5 rounded-lg border text-[11px] transition-colors ${
                                isChecked
                                  ? 'bg-[#1E60A8]/10 border-[#1E60A8]/50 text-[#132B63] cursor-pointer'
                                  : isEmpDisabled
                                  ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={isEmpDisabled}
                                onChange={() => {
                                  setBulkEditError(null);
                                  setBulkSplitEmployeeNames((prev) => {
                                    if (prev.includes(upperName)) {
                                      return prev.filter((x) => x !== upperName);
                                    }
                                    if (prev.length >= targetMax) return prev;
                                    return [...prev, upperName];
                                  });
                                }}
                                className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="font-bold truncate">{emp.nombreCompleto}</div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {emp.centroCosto || 'Sin CECO'}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {bulkApplySplit && bulkSplitMode === 'clear' && (
                <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">
                  Al aplicar, se quitará la división entre empleados de todas las facturas seleccionadas.
                </div>
              )}
            </div>

            {bulkEditError && (
              <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{bulkEditError}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => resetBulkEditPanel(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white rounded-lg border border-slate-300 cursor-pointer"
              >
                Limpiar campos
              </button>
              <button
                type="button"
                onClick={handleApplyBulkEdit}
                disabled={
                  !bulkApplyCliente &&
                  !bulkApplyObjetivo &&
                  !bulkApplyDescripcion &&
                  !bulkApplyCategoria &&
                  !bulkApplyKilometraje &&
                  !bulkApplyCeco &&
                  !bulkApplySplit
                }
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-45 rounded-lg transition-colors cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Aplicar a {selectedItemIds.length} factura(s)</span>
              </button>
            </div>
          </div>
        )}

        {/* OFFICIAL 14-COLUMN PREMEX EXCEL SUMMARY TABLE (Mobile + Desktop) with Synchronized Top Scrollbar */}
        <SyncedHorizontalTableScroll>
          <table className="w-full text-left border-collapse text-xs min-w-[1640px]">
            <thead>
              <tr className="bg-[#C4E4EE] text-slate-900 border-b border-slate-300 text-[11px] font-bold">
                {!isLocked && (
                  <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-center w-9">
                    <input
                      type="checkbox"
                      checked={
                        liquidation.items.length > 0 &&
                        selectedItemIds.length === liquidation.items.length
                      }
                      onChange={toggleSelectAllItems}
                      aria-label="Seleccionar todas las facturas"
                      title="Seleccionar todas las facturas"
                      className="w-3.5 h-3.5 rounded border-slate-400 text-[#1E60A8] cursor-pointer"
                    />
                  </th>
                )}
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-center">
                  Fecha Doc.
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap">
                  Serie Doc.
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap">
                  No. Doc.
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap">
                  NIT
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300/80 whitespace-nowrap">
                  Proveedor
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-center">
                  Moneda
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-right">
                  Valor Factura
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-right">
                  Tipo de Cambio
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-right">
                  Valor Reintegrar
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap">
                  Categoría
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300/80 whitespace-nowrap">
                  Cliente/Contacto
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300/80 whitespace-nowrap">
                  Objetivo Comercial
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300/80 whitespace-nowrap">
                  Descripción del Gastos
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-center">
                  Kilometraje
                </th>
                <th className="py-2.5 px-2.5 border-r border-slate-300/80 whitespace-nowrap text-center">
                  Imp.
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300/80 whitespace-nowrap">
                  CECO
                </th>
                <th className="py-2.5 px-3 border-r border-slate-300/80 whitespace-nowrap text-center">
                  Dividir Gasto
                </th>
                <th className="py-2.5 px-2.5 whitespace-nowrap text-center">
                  Soporte / Acc.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {liquidation.items.length === 0 ? (
                <tr>
                  <td colSpan={!isLocked ? 19 : 18} className="py-10 text-center text-sm lg:text-xs text-slate-500">
                    Aún no hay facturas registradas en esta liquidación. Sube una foto, factura individual o PDF masivo arriba para comenzar.
                  </td>
                </tr>
              ) : (
                liquidation.items.map((item) => {
                  const media = item.attachmentId ? mediaMap[item.attachmentId] : undefined;
                  const isBeingEdited = editingItemId === item.id;
                  const isEditingCell = (field: InlineEditableField) =>
                    inlineEditCell?.itemId === item.id && inlineEditCell.field === field;
                  const cellEditTitle = !isLocked
                    ? 'Doble clic para editar este campo'
                    : undefined;
                  const editableCellClass = !isLocked
                    ? 'cursor-text hover:bg-sky-50/70 transition-colors'
                    : '';

                  const handleInlineKeyDown = (
                    e: React.KeyboardEvent,
                    field: InlineEditableField
                  ) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitInlineEdit(item, field);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelInlineEdit();
                    }
                  };

                  const isSelected = selectedItemIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isBeingEdited || isSelected
                          ? 'bg-sky-50/90'
                          : 'hover:bg-slate-50/90'
                      }`}
                    >
                      {!isLocked && (
                        <td className="py-2 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectItem(item.id)}
                            aria-label={`Seleccionar factura de ${item.proveedor}`}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8] cursor-pointer"
                          />
                        </td>
                      )}
                      {/* Fecha Doc. */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'fechaDoc')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap text-center font-mono tabular-nums text-slate-700 ${editableCellClass}`}
                      >
                        {isEditingCell('fechaDoc') ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'fechaDoc')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'fechaDoc')}
                            placeholder="DD/MM/YYYY"
                            className="w-24 px-1.5 py-1 text-xs text-center font-mono bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.fechaDoc || '—'
                        )}
                      </td>

                      {/* Serie Doc. */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'serieDoc')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap font-mono text-slate-700 ${editableCellClass}`}
                      >
                        {isEditingCell('serieDoc') ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'serieDoc')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'serieDoc')}
                            className="w-24 px-1.5 py-1 text-xs font-mono bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.serieDoc || ''
                        )}
                      </td>

                      {/* No. Doc. */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'noDoc')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap font-mono text-slate-800 ${editableCellClass}`}
                      >
                        {isEditingCell('noDoc') ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'noDoc')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'noDoc')}
                            className="w-28 px-1.5 py-1 text-xs font-mono bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.noDoc || ''
                        )}
                      </td>

                      {/* NIT */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'nit')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap font-mono text-slate-700 ${editableCellClass}`}
                      >
                        {isEditingCell('nit') ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'nit')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'nit')}
                            className="w-24 px-1.5 py-1 text-xs font-mono bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.nit || ''
                        )}
                      </td>

                      {/* Proveedor */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'proveedor')}
                        title={cellEditTitle}
                        className={`py-2 px-2.5 border-r border-slate-200/80 font-medium text-slate-900 max-w-[200px] ${editableCellClass}`}
                      >
                        {isEditingCell('proveedor') ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'proveedor')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'proveedor')}
                            className="w-44 px-1.5 py-1 text-xs bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.proveedor
                        )}
                      </td>

                      {/* Moneda */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'moneda')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap text-center text-slate-700 ${editableCellClass}`}
                      >
                        {isEditingCell('moneda') ? (
                          <select
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => commitInlineEdit(item, 'moneda', e.target.value)}
                            onBlur={() => cancelInlineEdit()}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="px-1.5 py-1 text-xs bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          >
                            {VIATICO_CURRENCIES.map((cur) => (
                              <option key={cur} value={cur}>
                                {cur}
                              </option>
                            ))}
                          </select>
                        ) : (
                          item.moneda
                        )}
                      </td>

                      {/* Valor Factura */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'valorFactura')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap text-right font-mono tabular-nums text-slate-800 ${editableCellClass}`}
                      >
                        {isEditingCell('valorFactura') ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'valorFactura')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'valorFactura')}
                            className="w-24 px-1.5 py-1 text-xs text-right font-mono bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          formatViaticoAmount(item.valorFactura)
                        )}
                      </td>

                      {/* Tipo de Cambio */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'tipoCambio')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap text-right font-mono tabular-nums text-slate-600 ${editableCellClass}`}
                      >
                        {isEditingCell('tipoCambio') ? (
                          <input
                            type="number"
                            step="any"
                            min="0.00000001"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'tipoCambio')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'tipoCambio')}
                            className="w-24 px-1.5 py-1 text-xs text-right font-mono bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          formatExchangeRate(item.tipoCambio)
                        )}
                      </td>

                      {/* Valor Reintegrar */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'valorReintegrar')}
                        title={
                          isLocked
                            ? undefined
                            : 'Doble clic para editar valor de pago y recalcular tipo de cambio'
                        }
                        className={`py-2 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-right font-mono font-bold tabular-nums text-slate-900 bg-slate-50/60 ${editableCellClass}`}
                      >
                        {isEditingCell('valorReintegrar') ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'valorReintegrar')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'valorReintegrar')}
                            className="w-24 px-1.5 py-1 text-xs text-right font-mono bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          formatViaticoAmount(item.valorReintegrar)
                        )}
                      </td>

                      {/* Categoría */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'categoria')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap text-slate-800 ${editableCellClass}`}
                      >
                        {isEditingCell('categoria') ? (
                          <select
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => commitInlineEdit(item, 'categoria', e.target.value)}
                            onBlur={() => cancelInlineEdit()}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="px-1.5 py-1 text-xs bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          >
                            {VIATICO_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        ) : (
                          item.categoria
                        )}
                      </td>

                      {/* Cliente / Contacto */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'clienteContacto')}
                        title={cellEditTitle}
                        className={`py-2 px-2.5 border-r border-slate-200/80 font-bold text-slate-900 max-w-[190px] ${editableCellClass}`}
                      >
                        {isEditingCell('clienteContacto') ? (
                          <input
                            type="text"
                            autoFocus
                            list="viaticos-cliente-list"
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'clienteContacto')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'clienteContacto')}
                            className="w-44 px-1.5 py-1 text-xs font-normal bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.clienteContacto || (
                            <span className="text-slate-300 font-normal italic">Doble clic...</span>
                          )
                        )}
                      </td>

                      {/* Objetivo Comercial */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'objetivoComercial')}
                        title={cellEditTitle}
                        className={`py-2 px-2.5 border-r border-slate-200/80 text-slate-700 max-w-[200px] ${editableCellClass}`}
                      >
                        {isEditingCell('objetivoComercial') ? (
                          <input
                            type="text"
                            autoFocus
                            list="viaticos-objetivo-list"
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'objetivoComercial')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'objetivoComercial')}
                            className="w-44 px-1.5 py-1 text-xs bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.objetivoComercial || (
                            <span className="text-slate-300 italic">Doble clic...</span>
                          )
                        )}
                      </td>

                      {/* Descripción del Gasto */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'descripcionGasto')}
                        title={cellEditTitle}
                        className={`py-2 px-2.5 border-r border-slate-200/80 text-slate-700 max-w-[230px] ${editableCellClass}`}
                      >
                        {isEditingCell('descripcionGasto') ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'descripcionGasto')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'descripcionGasto')}
                            className="w-48 px-1.5 py-1 text-xs bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.descripcionGasto || (
                            <span className="text-slate-300 italic">Doble clic...</span>
                          )
                        )}
                      </td>

                      {/* Kilometraje */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'kilometraje')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap text-center tabular-nums text-slate-700 ${editableCellClass}`}
                      >
                        {isEditingCell('kilometraje') ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) => setInlineDraftValue(e.target.value)}
                            onBlur={() => commitInlineEdit(item, 'kilometraje')}
                            onKeyDown={(e) => handleInlineKeyDown(e, 'kilometraje')}
                            placeholder="Ej. 140 km"
                            className="w-24 px-1.5 py-1 text-xs text-center bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          />
                        ) : (
                          item.kilometraje || (
                            <span className="text-slate-300">—</span>
                          )
                        )}
                      </td>

                      {/* Impuestos */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'impuestos')}
                        title={cellEditTitle}
                        className={`py-2 px-2 border-r border-slate-200/80 whitespace-nowrap text-center ${editableCellClass}`}
                      >
                        {isEditingCell('impuestos') ? (
                          <div
                            className="inline-flex items-center gap-1 bg-white p-1 rounded border border-[#1E60A8]"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitInlineEdit(item, 'impuestos');
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelInlineEdit();
                              }
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={inlineTaxDraft.aplica}
                              onChange={(e) =>
                                setInlineTaxDraft((prev) => ({
                                  aplica: e.target.checked,
                                  rate: e.target.checked
                                    ? Number(prev.rate) > 0
                                      ? prev.rate
                                      : String(DEFAULT_TAX_RATE_BY_CURRENCY[item.moneda] || 12)
                                    : '0',
                                }))
                              }
                              title="¿Aplica impuestos?"
                              className="w-3.5 h-3.5"
                            />
                            {inlineTaxDraft.aplica && (
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                autoFocus
                                value={inlineTaxDraft.rate}
                                onChange={(e) =>
                                  setInlineTaxDraft((prev) => ({ ...prev, rate: e.target.value }))
                                }
                                className="w-12 px-1 py-0.5 text-xs text-right font-mono border border-slate-300 rounded"
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => commitInlineEdit(item, 'impuestos')}
                              title="Guardar impuesto"
                              className="p-0.5 text-emerald-700 hover:bg-emerald-50 rounded cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={cancelInlineEdit}
                              title="Cancelar"
                              className="p-0.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span
                            title={
                              item.aplicaImpuestos
                                ? `Impuesto ${item.porcentajeImpuesto}%: ${formatViaticoAmount(
                                    item.montoImpuesto
                                  )} | Base: ${formatViaticoAmount(item.valorSinImpuesto)}`
                                : 'Sin impuestos (doble clic para editar)'
                            }
                            className={`text-[11px] font-semibold tabular-nums ${
                              item.aplicaImpuestos ? 'text-[#1E60A8]' : 'text-slate-400'
                            }`}
                          >
                            {item.aplicaImpuestos ? `Sí (${item.porcentajeImpuesto}%)` : 'No'}
                          </span>
                        )}
                      </td>

                      {/* CECO (Centro de Costo por línea) */}
                      <td
                        onDoubleClick={() => startInlineEdit(item, 'odooCostCenterCode')}
                        title={
                          !isLocked
                            ? `${
                                item.odooCostCenterCode
                                  ? `CECO asignado: ${item.odooCostCenterCode}`
                                  : `Heredado: ${resolvedCostCenter || 'Sin asignar'}`
                              } · Doble clic para cambiar CECO`
                            : item.odooCostCenterCode || resolvedCostCenter || ''
                        }
                        className={`py-2 px-2.5 border-r border-slate-200/80 max-w-[180px] ${
                          !isLocked ? 'cursor-pointer hover:bg-sky-50/70 transition-colors' : ''
                        }`}
                      >
                        {isEditingCell('odooCostCenterCode') ? (
                          <select
                            autoFocus
                            value={inlineDraftValue}
                            onChange={(e) =>
                              commitInlineEdit(item, 'odooCostCenterCode', e.target.value)
                            }
                            onBlur={() => cancelInlineEdit()}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') cancelInlineEdit();
                            }}
                            className="w-44 px-1.5 py-1 text-xs bg-white border border-[#1E60A8] rounded focus:outline-hidden"
                          >
                            <option value="">
                              Heredar ({resolvedCostCenter || 'sin asignar'})
                            </option>
                            {catalogs.costCenters
                              .filter((cc) => cc.activo !== false)
                              .map((cc) => (
                                <option key={cc.id} value={cc.cuentaAnalitica}>
                                  {cc.cuentaAnalitica} ({cc.analyticDistribution})
                                </option>
                              ))}
                          </select>
                        ) : item.odooCostCenterCode ? (
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => startInlineEdit(item, 'odooCostCenterCode')}
                            className="text-left w-full truncate font-semibold text-[#132B63] disabled:cursor-default cursor-pointer"
                          >
                            {item.odooCostCenterCode}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isLocked}
                            onClick={() => startInlineEdit(item, 'odooCostCenterCode')}
                            className="text-left w-full truncate text-[11px] text-slate-400 italic disabled:cursor-default cursor-pointer"
                          >
                            Heredado{resolvedCostCenter ? ` (${resolvedCostCenter.split(' ')[0]})` : ''}
                          </button>
                        )}
                      </td>

                      {/* Dividir Gasto entre empleados */}
                      <td
                        onDoubleClick={() => openSplitModalForItem(item)}
                        title={
                          Array.isArray(item.splitEmployeeNames) &&
                          item.splitEmployeeNames.length >= 2
                            ? `Dividido entre ${item.splitEmployeeNames.length}: ${item.splitEmployeeNames.join(', ')}`
                            : !isLocked
                            ? 'Clic o doble clic para dividir este gasto entre varios empleados'
                            : 'Sin dividir'
                        }
                        className="py-2 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-center"
                      >
                        {(() => {
                          const splitNames = Array.isArray(item.splitEmployeeNames)
                            ? item.splitEmployeeNames.filter(Boolean)
                            : [];
                          const hasSplit =
                            (item.splitByEmployeesCount || 0) >= 2 && splitNames.length >= 2;
                          if (hasSplit) {
                            return (
                              <button
                                type="button"
                                disabled={isLocked}
                                onClick={() => openSplitModalForItem(item)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                  isLocked
                                    ? 'bg-sky-50 text-[#132B63] border-sky-200 cursor-default'
                                    : 'bg-[#EFF6FF] hover:bg-sky-100 text-[#132B63] border-[#1E60A8]/35 cursor-pointer'
                                }`}
                              >
                                <Users className="w-3 h-3 text-[#1E60A8]" />
                                <span>÷ {splitNames.length} pers.</span>
                              </button>
                            );
                          }
                          if (isLocked) {
                            return <span className="text-[11px] text-slate-300">—</span>;
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => openSplitModalForItem(item)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-[#132B63] hover:bg-sky-50 border border-slate-200 hover:border-[#1E60A8]/35 transition-colors cursor-pointer"
                            >
                              <Users className="w-3 h-3" />
                              <span>Dividir</span>
                            </button>
                          );
                        })()}
                      </td>

                      <td className="py-2.5 px-2.5 whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          {media ? (
                            <button
                              type="button"
                              onClick={() => setLightboxItem({ item, media })}
                              title={`Ver factura escaneada: ${media.fileName}`}
                              className="min-w-[36px] min-h-[36px] lg:min-w-0 lg:min-h-0 inline-flex items-center justify-center p-2 lg:p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                            </button>
                          ) : item.attachmentId ? (
                            loadingMediaIds?.has(item.attachmentId) ? (
                              <span
                                title="Descargando factura escaneada desde la nube..."
                                className="min-w-[36px] min-h-[36px] lg:min-w-0 lg:min-h-0 p-2 lg:p-1.5 text-[#1E60A8] inline-flex items-center justify-center"
                              >
                                <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin" />
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!item.attachmentId || !onLoadReceiptMedia) return;
                                  const loaded = await onLoadReceiptMedia(item.attachmentId);
                                  if (loaded) {
                                    setLightboxItem({ item, media: loaded });
                                  } else {
                                    setAiStatusBanner({
                                      type: 'warning',
                                      text: `El comprobante "${item.attachmentName || item.attachmentId}" fue escaneado antes de activar el respaldo en la nube y aún no se ha sincronizado desde el equipo origen.`,
                                    });
                                  }
                                }}
                                title={`Descargar y ver factura escaneada: ${item.attachmentName || 'Comprobante'}`}
                                className="min-w-[36px] min-h-[36px] lg:min-w-0 lg:min-h-0 inline-flex items-center justify-center p-2 lg:p-1.5 text-[#1E60A8] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Eye className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                              </button>
                            )
                          ) : item.attachmentName ? (
                            <span
                              title={`Adjunto registrado: ${item.attachmentName}`}
                              className="p-2 lg:p-1.5 text-slate-400 inline-flex"
                            >
                              <Paperclip className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                            </span>
                          ) : null}

                          {!isLocked && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditRow(item)}
                                title="Editar fila"
                                className="min-w-[36px] min-h-[36px] lg:min-w-0 lg:min-h-0 inline-flex items-center justify-center p-2 lg:p-1.5 text-slate-500 hover:text-[#1E60A8] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <Pencil className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingItemId === item.id) handleResetForm();
                                  onDeleteItem(item.id);
                                }}
                                title="Eliminar fila"
                                className="min-w-[36px] min-h-[36px] lg:min-w-0 lg:min-h-0 inline-flex items-center justify-center p-2 lg:p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Official Footer Total Row */}
            <tfoot>
              <tr className="border-t-2 border-slate-800 bg-slate-50">
                <td colSpan={!isLocked ? 6 : 5} className="py-3 px-3 text-[11px] font-medium text-slate-500">
                  Premex Corp · Planilla de Liquidación
                </td>
                <td
                  colSpan={3}
                  className="py-3 px-3 text-center text-xs font-extrabold text-slate-900 border-x-2 border-slate-800 bg-white"
                >
                  Total Liquidación
                </td>
                <td className="py-3 px-2.5 text-right text-sm font-extrabold font-mono tabular-nums text-[#132B63] bg-[#DCEEF5] border-r-2 border-slate-800">
                  {formatViaticoAmount(liquidation.totalLiquidacion)}
                </td>
                <td colSpan={9} className="py-3 px-3 text-[11px] font-semibold text-slate-600">
                  {formatViaticoAmount(
                    liquidation.totalLiquidacion,
                    liquidation.monedaBase,
                    true
                  )}{' '}
                  ({liquidation.monedaBase})
                </td>
              </tr>
            </tfoot>
          </table>
        </SyncedHorizontalTableScroll>
      </section>

      {/* Receipt Lightbox Viewer */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-end lg:items-center justify-center p-0 lg:p-4"
          onClick={() => {
            setReceiptZoom(1);
            setLightboxItem(null);
          }}
        >
          <div
            className="bg-white rounded-t-3xl lg:rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 lg:px-5 py-3.5 bg-[#132B63] text-white flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-base lg:text-sm font-bold truncate">
                  {lightboxItem.item.proveedor} ·{' '}
                  {formatViaticoAmount(
                    lightboxItem.item.valorFactura,
                    lightboxItem.item.moneda,
                    true
                  )}
                </div>
                <div className="text-xs lg:text-[11px] text-sky-200 truncate">
                  Fecha: {lightboxItem.item.fechaDoc || '-'} · Doc:{' '}
                  {[lightboxItem.item.serieDoc, lightboxItem.item.noDoc]
                    .filter(Boolean)
                    .join('-') || '-'}{' '}
                  · {lightboxItem.media.fileName}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {lightboxItem.media.mimeType !== 'application/pdf' && (
                  <div className="inline-flex items-center bg-white/10 rounded-xl p-0.5 mr-1">
                    <button
                      type="button"
                      onClick={() => setReceiptZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))))}
                      disabled={receiptZoom <= 1}
                      aria-label="Alejar comprobante"
                      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-white disabled:opacity-40 rounded-lg cursor-pointer"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptZoom(1)}
                      className="px-2 text-xs font-mono font-bold text-white tabular-nums cursor-pointer"
                    >
                      {Math.round(receiptZoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptZoom((z) => Math.min(2.5, Number((z + 0.5).toFixed(1))))}
                      disabled={receiptZoom >= 2.5}
                      aria-label="Acercar comprobante"
                      className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-white disabled:opacity-40 rounded-lg cursor-pointer"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <a
                  href={lightboxItem.media.dataUrl}
                  download={lightboxItem.media.fileName || 'factura.jpg'}
                  className="inline-flex items-center gap-1.5 min-h-[42px] lg:min-h-0 px-3 py-2 lg:py-1.5 text-xs lg:text-[11px] font-semibold bg-white/15 hover:bg-white/25 text-white rounded-xl lg:rounded-lg transition-colors"
                  title="Descargar factura escaneada"
                >
                  <Download className="w-4 h-4 lg:w-3.5 lg:h-3.5" />
                  <span>Descargar</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setReceiptZoom(1);
                    setLightboxItem(null);
                  }}
                  className="min-w-[44px] min-h-[44px] lg:min-w-0 lg:min-h-0 inline-flex items-center justify-center p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-xl lg:rounded-lg cursor-pointer"
                  aria-label="Cerrar vista previa"
                >
                  <X className="w-6 h-6 lg:w-5 lg:h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-900/5 overflow-auto flex items-center justify-center p-4 min-h-[340px] lg:min-h-[420px]">
              {lightboxItem.media.mimeType === 'application/pdf' ? (
                <>
                  <iframe
                    src={lightboxItem.media.dataUrl}
                    title={lightboxItem.media.fileName}
                    className="hidden lg:block w-full h-[70vh] rounded-lg border border-slate-200 bg-white"
                  />
                  <div className="lg:hidden flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
                      <FileText className="w-8 h-8" />
                    </div>
                    <div className="text-base font-bold text-slate-900 break-all">
                      {lightboxItem.media.fileName}
                    </div>
                    <a
                      href={lightboxItem.media.dataUrl}
                      download={lightboxItem.media.fileName || 'factura.pdf'}
                      className="inline-flex items-center gap-2 min-h-[50px] px-5 py-3 text-sm font-bold text-white bg-[#1E60A8] rounded-2xl"
                    >
                      <Download className="w-4 h-4" />
                      <span>Abrir / Descargar PDF</span>
                    </a>
                  </div>
                </>
              ) : (
                <div className="overflow-auto max-h-[74vh] max-w-full flex items-center justify-center">
                  <img
                    src={lightboxItem.media.dataUrl}
                    alt={lightboxItem.media.fileName}
                    style={
                      receiptZoom > 1
                        ? { width: `${Math.round(receiptZoom * 100)}%`, maxWidth: 'none' }
                        : undefined
                    }
                    className={`${
                      receiptZoom === 1 ? 'max-h-[72vh] max-w-full' : ''
                    } object-contain rounded-lg shadow-md transition-all`}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Row-level Split Expense Modal ("Dividir gasto entre empleados") */}
      {splitModalItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-end lg:items-center justify-center p-0 lg:p-4"
          onClick={() => {
            setSplitModalItem(null);
            setSplitModalError(null);
          }}
        >
          <div
            className="bg-white rounded-t-3xl lg:rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#132B63] text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold flex items-center gap-2 truncate">
                  <Users className="w-4 h-4 text-sky-300 shrink-0" />
                  <span className="truncate">
                    Dividir Gasto · {splitModalItem.proveedor || 'Factura'}
                  </span>
                </div>
                <div className="text-[11px] text-sky-200 truncate mt-0.5">
                  Total:{' '}
                  {formatViaticoAmount(splitModalItem.valorReintegrar, baseCurrency, true)} · Doc:{' '}
                  {[splitModalItem.serieDoc, splitModalItem.noDoc].filter(Boolean).join('-') ||
                    'S/N'}{' '}
                  · Mantiene al liquidador principal en Odoo
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSplitModalItem(null);
                  setSplitModalError(null);
                }}
                aria-label="Cerrar división de gasto"
                className="p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Cantidad de personas *
                  </label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={2}
                    max={30}
                    step={1}
                    value={splitModalCount}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const parsed = Math.floor(Number(raw) || 0);
                      setSplitModalCount(raw);
                      setSplitModalError(null);
                      if (parsed >= 2 && splitModalNames.length > parsed) {
                        setSplitModalNames((prev) => prev.slice(0, parsed));
                      }
                    }}
                    className="w-full px-3 py-1.5 text-sm font-mono font-bold text-[#132B63] rounded-lg border border-slate-300"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Buscar empleado Odoo ({splitModalNames.length}/
                    {Math.max(2, Math.floor(Number(splitModalCount) || 2))})
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={splitModalSearch}
                      onChange={(e) => setSplitModalSearch(e.target.value)}
                      placeholder="Nombre o centro de costo..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 bg-slate-50 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="sm:col-span-3 flex sm:justify-end">
                  <div className="text-right">
                    <div className="text-[10px] font-semibold uppercase text-slate-500">
                      Monto aprox. c/u
                    </div>
                    <div className="text-xs font-extrabold font-mono text-[#132B63]">
                      {formatViaticoAmount(
                        roundMoney(
                          splitModalItem.valorReintegrar /
                            Math.max(2, Math.floor(Number(splitModalCount) || 2))
                        ),
                        baseCurrency,
                        true
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {(() => {
                const targetMax = Math.max(
                  2,
                  Math.min(30, Math.floor(Number(splitModalCount) || 2))
                );
                const q = splitModalSearch.trim().toLowerCase();
                const activeEmployees = catalogs.employees.filter((emp) => {
                  if (emp.activo === false) return false;
                  if (!q) return true;
                  return (
                    emp.nombreCompleto.toLowerCase().includes(q) ||
                    (emp.centroCosto || '').toLowerCase().includes(q)
                  );
                });
                const limitReached = splitModalNames.length >= targetMax;

                return (
                  <div className="max-h-60 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 pr-1">
                    {activeEmployees.map((emp) => {
                      const upperName = emp.nombreCompleto.trim().toUpperCase();
                      const isChecked = splitModalNames.includes(upperName);
                      const isEmpDisabled = !isChecked && limitReached;
                      return (
                        <label
                          key={emp.id}
                          className={`flex items-start gap-2 p-2 rounded-lg border text-[11px] transition-colors ${
                            isChecked
                              ? 'bg-[#1E60A8]/10 border-[#1E60A8]/50 text-[#132B63] cursor-pointer'
                              : isEmpDisabled
                              ? 'bg-slate-50 border-slate-200 text-slate-400 opacity-60 cursor-not-allowed'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isEmpDisabled}
                            onChange={() => {
                              setSplitModalError(null);
                              setSplitModalNames((prev) => {
                                if (prev.includes(upperName)) {
                                  return prev.filter((x) => x !== upperName);
                                }
                                if (prev.length >= targetMax) return prev;
                                return [...prev, upperName];
                              });
                            }}
                            className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-[#1E60A8]"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate">{emp.nombreCompleto}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {emp.centroCosto || 'Sin CECO'}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}

              {splitModalError && (
                <div className="text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{splitModalError}</span>
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                {(splitModalItem.splitByEmployeesCount || 0) >= 2 &&
                  Array.isArray(splitModalItem.splitEmployeeNames) &&
                  splitModalItem.splitEmployeeNames.length >= 2 && (
                    <button
                      type="button"
                      onClick={handleClearRowSplitModal}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg cursor-pointer"
                    >
                      Quitar división
                    </button>
                  )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSplitModalItem(null);
                    setSplitModalError(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white border border-slate-300 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveRowSplitModal}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Guardar división</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface SyncedHorizontalTableScrollProps {
  children: React.ReactNode;
}

const SyncedHorizontalTableScroll: React.FC<SyncedHorizontalTableScrollProps> = ({
  children,
}) => {
  const topBarRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
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
    <div>
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
            className="flex-1 overflow-x-auto overflow-y-hidden h-4 rounded bg-slate-200/70 touch-scroll-x [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/90 [&::-webkit-scrollbar-track]:bg-slate-200/80"
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

      <div ref={bodyRef} onScroll={handleBodyScroll} className="overflow-x-auto touch-scroll-x">
        {children}
      </div>
    </div>
  );
};
