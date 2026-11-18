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
} from 'lucide-react';
import {
  EffectivePermissions,
  ModuleCompanyEntry,
  ViaticoCategory,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoExpenseItem,
  ViaticoLiquidation,
} from '../../types';
import {
  StoredReceiptMedia,
  saveReceiptMedia,
} from '../../services/viaticosMediaStore';
import {
  detectInvoiceFileKind,
  extractInvoiceViaServer,
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
  formatViaticoAmount,
  roundMoney,
} from '../../utils/viaticos';
import { PremexBrandLogo } from '../ModuleIcons';

interface ViaticosLiquidadorViewProps {
  liquidation: ViaticoLiquidation | null;
  visibleLiquidaciones: ViaticoLiquidation[];
  availableConsultores: ViaticoConsultor[];
  moduleCompanies?: ModuleCompanyEntry[];
  isLockedToOwnConsultor: boolean;
  detectedFromEmailLabel: string | null;
  mediaMap: Record<string, StoredReceiptMedia>;
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
    monedaBase?: ViaticoCurrency;
  }) => void;
  onAddOrUpdateItem: (item: ViaticoExpenseItem, isEdit: boolean) => void;
  onDeleteItem: (itemId: string) => void;
  onOpenCloseConfirmModal: () => void;
  onOpenCloseEmailModal: () => void;
  onQuickDownloadExcel: () => void;
  onQuickDownloadPdf: () => void;
  isDownloadingExcel: boolean;
  isDownloadingPdf: boolean;
  onOpenClosedArchive: () => void;
}

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
  categoria: ViaticoCategory;
  clienteContacto: string;
  objetivoComercial: string;
  descripcionGasto: string;
  kilometraje: string;
  aplicaImpuestos: boolean;
  porcentajeImpuesto: string;
  montoImpuestoManual: string;
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
  defaultObjetivo = ''
): ItemFormState => ({
  id: '',
  fechaDoc: getTodayFormatted(),
  serieDoc: '',
  noDoc: '',
  nit: '',
  proveedor: '',
  moneda: baseCurrency,
  valorFactura: '',
  tipoCambio: '1.00',
  categoria: 'Alimentación',
  clienteContacto: defaultCliente,
  objetivoComercial: defaultObjetivo,
  descripcionGasto: '',
  kilometraje: '',
  aplicaImpuestos: DEFAULT_TAX_RATE_BY_CURRENCY[baseCurrency] > 0,
  porcentajeImpuesto: String(DEFAULT_TAX_RATE_BY_CURRENCY[baseCurrency] || 0),
  montoImpuestoManual: '',
});

export const ViaticosLiquidadorView: React.FC<ViaticosLiquidadorViewProps> = ({
  liquidation,
  visibleLiquidaciones,
  availableConsultores,
  moduleCompanies = [],
  isLockedToOwnConsultor,
  detectedFromEmailLabel,
  mediaMap,
  onMediaSaved,
  permissions,
  onSelectLiquidation,
  onCreateNewLiquidation,
  onUpdateHeader,
  onAddOrUpdateItem,
  onDeleteItem,
  onOpenCloseConfirmModal,
  onOpenCloseEmailModal,
  onQuickDownloadExcel,
  onQuickDownloadPdf,
  isDownloadingExcel,
  isDownloadingPdf,
  onOpenClosedArchive,
}) => {
  const baseCurrency: ViaticoCurrency = liquidation?.monedaBase || 'Quetzales';
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

  const [form, setForm] = useState<ItemFormState>(() =>
    createEmptyForm(baseCurrency, lastCliente, lastObjetivo)
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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const prevLiqIdRef = useRef<string | null>(liquidation?.id || null);

  // Reset capture form cleanly whenever the user switches to another liquidation (different week/currency)
  useEffect(() => {
    const nextId = liquidation?.id || null;
    if (nextId === prevLiqIdRef.current) return;
    prevLiqIdRef.current = nextId;
    setEditingItemId(null);
    setActiveMediaPreview(null);
    setUploadQueue([]);
    setAiStatusBanner(null);
    setFormError(null);
    setForm(createEmptyForm(baseCurrency, lastCliente, lastObjetivo));

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
  }, [liquidation, baseCurrency, lastCliente, lastObjetivo]);

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
        tipoCambio: '1.00',
        aplicaImpuestos: defaultRate > 0,
        porcentajeImpuesto: String(defaultRate),
        montoImpuestoManual: '',
      };
    });
  }, [baseCurrency, editingItemId]);

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
  const computedReintegrar = roundMoney(numericValorFactura * numericTipoCambio);
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
      await saveReceiptMedia(mediaRecord);
      onMediaSaved(mediaRecord);
      setActiveMediaPreview(mediaRecord);

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
      });

      const suggestedTaxRate = extracted.aplicaImpuestos
        ? extracted.porcentajeImpuesto > 0
          ? extracted.porcentajeImpuesto
          : DEFAULT_TAX_RATE_BY_CURRENCY[extracted.moneda] || 12
        : 0;

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
          extracted.moneda === liquidation.monedaBase
            ? '1.00'
            : String(extracted.tipoCambioSugerido || 1),
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
        attachmentId: mediaRecord.id,
        attachmentName: mediaRecord.fileName,
        attachmentMimeType: mediaRecord.mimeType,
        attachmentSize: mediaRecord.size,
        extractedByAi: true,
        extractionConfidence: extracted.confianza,
        extractionNotes: extracted.notasExtraccion,
      }));

      setAiStatusBanner({
        type: extracted.confianza === 'baja' ? 'warning' : 'success',
        text:
          extracted.confianza === 'baja'
            ? `Lectura parcial (${extracted.notasExtraccion || 'imagen con baja nitidez'}). Verifica y completa los campos antes de agregar.`
            : `Factura leída (${extracted.proveedor || 'proveedor detectado'} · ${extracted.moneda})${
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
      await saveReceiptMedia(updatedRecord);
      onMediaSaved(updatedRecord);
      setActiveMediaPreview(updatedRecord);
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
      });
      const suggestedTaxRate = extracted.aplicaImpuestos
        ? extracted.porcentajeImpuesto > 0
          ? extracted.porcentajeImpuesto
          : DEFAULT_TAX_RATE_BY_CURRENCY[extracted.moneda] || 12
        : 0;
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
          extracted.moneda === liquidation.monedaBase
            ? '1.00'
            : String(extracted.tipoCambioSugerido || prev.tipoCambio || 1),
        categoria: extracted.categoriaSugerida || prev.categoria,
        descripcionGasto: extracted.descripcionSugerida || prev.descripcionGasto,
        aplicaImpuestos: extracted.aplicaImpuestos,
        porcentajeImpuesto: String(suggestedTaxRate),
        montoImpuestoManual:
          extracted.aplicaImpuestos && extracted.montoImpuesto > 0
            ? String(extracted.montoImpuesto)
            : '',
        extractedByAi: true,
        extractionConfidence: extracted.confianza,
        extractionNotes: extracted.notasExtraccion,
      }));
      setAiStatusBanner({
        type: 'success',
        text: 'Datos actualizados nuevamente mediante lectura IA.',
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
      tipoCambio: nextCurrency === baseCurrency ? '1.00' : prev.tipoCambio === '1.00' ? '7.90' : prev.tipoCambio,
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
        keepSuggestions ? lastObjetivo : ''
      )
    );
  };

  const handleEditRow = (item: ViaticoExpenseItem) => {
    if (isLocked) return;
    setEditingItemId(item.id);
    setFormError(null);
    setAiStatusBanner(null);
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
      categoria: item.categoria,
      clienteContacto: item.clienteContacto,
      objetivoComercial: item.objetivoComercial,
      descripcionGasto: item.descripcionGasto,
      kilometraje: item.kilometraje,
      aplicaImpuestos: item.aplicaImpuestos,
      porcentajeImpuesto: String(item.porcentajeImpuesto),
      montoImpuestoManual: item.aplicaImpuestos ? String(item.montoImpuesto) : '',
      attachmentId: item.attachmentId,
      attachmentName: item.attachmentName,
      attachmentMimeType: item.attachmentMimeType,
      attachmentSize: item.attachmentSize,
      extractedByAi: item.extractedByAi,
      extractionConfidence: item.extractionConfidence,
      extractionNotes: item.extractionNotes,
    });
    if (item.attachmentId && mediaMap[item.attachmentId]) {
      setActiveMediaPreview(mediaMap[item.attachmentId]);
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

    const nextItem: ViaticoExpenseItem = {
      id: editingItemId || `viat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      fechaDoc: form.fechaDoc.trim() || getTodayFormatted(),
      serieDoc: form.serieDoc.trim(),
      noDoc: form.noDoc.trim(),
      nit: form.nit.trim(),
      proveedor: form.proveedor.trim(),
      moneda: form.moneda,
      valorFactura: roundMoney(numericValorFactura),
      tipoCambio: roundMoney(numericTipoCambio),
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
      setForm(
        createEmptyForm(
          baseCurrency,
          nextItem.clienteContacto || lastCliente,
          nextItem.objetivoComercial || lastObjetivo
        )
      );
      setActiveMediaPreview(null);
      await processSingleReceiptFile(nextQueued);
      return;
    }

    setEditingItemId(null);
    setActiveMediaPreview(null);
    setAiStatusBanner(null);
    setForm(
      createEmptyForm(
        baseCurrency,
        nextItem.clienteContacto || lastCliente,
        nextItem.objetivoComercial || lastObjetivo
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

  return (
    <div className="space-y-6">
      {/* 1. CABECERA OFICIAL PREMEX + SELECTOR POR SEMANA / MONEDA / ABIERTAS */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        {/* Top Switcher Bar: Status Scope + Week Filter + Currency Filter + Active Selector */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50/90 border-b border-slate-200/80 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {/* Status Scope Segmented Filter */}
              <div className="inline-flex items-center bg-slate-200/70 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() =>
                    applySwitcherFiltersAndAutoSelect(
                      'open',
                      switcherWeekFilter,
                      switcherCurrencyFilter
                    )
                  }
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
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
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
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
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                    switcherScope === 'all'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todas ({visibleLiquidaciones.length})
                </button>
              </div>

              {/* Week Filter */}
              <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1">
                <Calendar className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
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
                      Semana #{w}
                    </option>
                  ))}
                </select>
              </div>

              {/* Currency Filter */}
              <div className="inline-flex items-center gap-1 bg-white border border-slate-300 rounded-lg px-2 py-1">
                <Coins className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
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

              {/* Active Liquidation Selector Dropdown */}
              <select
                value={liquidation.id}
                aria-label="Seleccionar liquidación activa"
                onChange={(e) => onSelectLiquidation(e.target.value)}
                className="text-xs font-semibold text-[#132B63] bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 max-w-[260px] sm:max-w-[340px]"
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

              {(switcherWeekFilter !== 'ALL' ||
                switcherCurrencyFilter !== 'ALL' ||
                switcherScope !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSwitcherScope('all');
                    setSwitcherWeekFilter('ALL');
                    setSwitcherCurrencyFilter('ALL');
                  }}
                  className="text-[11px] font-semibold text-[#1E60A8] hover:text-[#132B63] px-1.5 py-1 cursor-pointer whitespace-nowrap"
                >
                  Limpiar filtros
                </button>
              )}
            </div>

            {/* Right: Quick Action Shortcuts & Summary */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
              {closedLiquidaciones.length > 0 && (
                <button
                  type="button"
                  onClick={onOpenClosedArchive}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
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
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  title="Iniciar otra liquidación (semana / moneda) manteniendo abiertas las actuales"
                >
                  <Plus className="w-3.5 h-3.5 text-[#1E60A8]" />
                  <span>Iniciar otra</span>
                </button>
              )}

              <span className="hidden xl:inline text-slate-300">|</span>
              <span className="hidden xl:inline">
                <strong className="font-semibold text-slate-900">{liquidation.items.length}</strong>{' '}
                fact.
              </span>
              <span className="hidden xl:inline text-slate-300">·</span>
              <span className="hidden xl:inline">
                <strong className="font-semibold text-slate-900">{attachedCount}</strong> sop.
              </span>
              <span className="hidden xl:inline text-slate-300">·</span>
              <span className="font-mono font-bold text-[#132B63]">
                {formatViaticoAmount(liquidation.totalLiquidacion, liquidation.monedaBase, true)}
              </span>
            </div>
          </div>

          {/* Row 2: Quick-Switch Tabs for Concurrent Open Liquidations */}
          {switcherScope !== 'closed' && openTabsList.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-1 border-t border-slate-200/70">
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
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-[#132B63] text-white border-[#132B63] font-semibold'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-[#1E60A8] hover:text-[#132B63]'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        isSelected ? 'bg-amber-300' : 'bg-amber-500'
                      }`}
                    />
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

        {/* Premex Form Header Content */}
        <div className="p-5 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: LIQUIDACIÓN / SEMANA # / NOMBRE: */}
          <div className="lg:col-span-7 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-1.5 sm:gap-3">
              <label className="sm:col-span-3 text-xs font-extrabold tracking-wide text-slate-900 uppercase">
                LIQUIDACIÓN
              </label>
              <div className="sm:col-span-9">
                <input
                  type="text"
                  value={liquidation.lineaLiquidacion}
                  disabled={isLocked}
                  onChange={(e) => onUpdateHeader({ lineaLiquidacion: e.target.value })}
                  placeholder="Ej. Visita Premicol SA de CV"
                  className="w-full px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-transparent border-b-2 border-slate-300 focus:border-[#1E60A8] focus:outline-hidden disabled:text-slate-600 disabled:border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-1.5 sm:gap-3">
              <label className="sm:col-span-3 text-xs font-extrabold tracking-wide text-slate-900 uppercase">
                SEMANA #
              </label>
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={liquidation.semana}
                  disabled={isLocked}
                  onChange={(e) => onUpdateHeader({ semana: e.target.value })}
                  placeholder="Ej. 31"
                  className="w-full px-2.5 py-1.5 text-sm font-semibold text-slate-900 text-center bg-transparent border-b-2 border-slate-300 focus:border-[#1E60A8] focus:outline-hidden tabular-nums disabled:text-slate-600 disabled:border-slate-200"
                />
              </div>

              <div className="sm:col-span-5 flex items-center gap-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase shrink-0">
                  Moneda:
                </label>
                <select
                  value={liquidation.monedaBase}
                  disabled={isLocked}
                  onChange={(e) =>
                    onUpdateHeader({ monedaBase: e.target.value as ViaticoCurrency })
                  }
                  className="flex-1 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 disabled:opacity-70"
                >
                  {VIATICO_CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 sm:items-center gap-1.5 sm:gap-3">
              <label className="sm:col-span-3 text-xs font-extrabold tracking-wide text-slate-900 uppercase">
                NOMBRE:
              </label>
              <div className="sm:col-span-9">
                <select
                  value={liquidation.consultorId}
                  disabled={isLocked || isLockedToOwnConsultor}
                  onChange={(e) => {
                    const chosen = availableConsultores.find((c) => c.id === e.target.value);
                    if (!chosen) return;
                    onUpdateHeader({
                      consultorId: chosen.id,
                      consultorNombre: chosen.nombreCompleto,
                      consultorEmail: chosen.email,
                      empresa: chosen.empresa,
                      monedaBase: chosen.monedaBase,
                    });
                  }}
                  className="w-full px-2.5 py-1.5 text-sm font-semibold text-slate-900 bg-transparent border-b-2 border-slate-300 focus:border-[#1E60A8] focus:outline-hidden disabled:text-slate-700 disabled:border-slate-200 disabled:bg-slate-50/60"
                >
                  {!availableConsultores.some((c) => c.id === liquidation.consultorId) && (
                    <option value={liquidation.consultorId}>
                      {liquidation.consultorNombre}
                    </option>
                  )}
                  {availableConsultores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombreCompleto} — {c.empresa}
                    </option>
                  ))}
                </select>
                {detectedFromEmailLabel && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    {isLockedToOwnConsultor
                      ? `Liquidador bloqueado por correo: ${detectedFromEmailLabel}`
                      : `Sesión detectada: ${detectedFromEmailLabel}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right: Premex Corporate Branding + Tagline + Empresa */}
          <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col xl:flex-row items-start sm:items-center lg:items-end xl:items-center justify-end gap-4 pt-3 lg:pt-0 border-t lg:border-t-0 border-slate-100">
            <div className="flex items-center gap-3">
              <PremexBrandLogo className="h-14 w-auto shrink-0" />
              <div className="text-[11px] font-bold tracking-[0.18em] text-slate-500 leading-tight uppercase">
                <div>NOURISHING</div>
                <div>POSSIBILITIES</div>
                <div>TOGETHER</div>
              </div>
            </div>

            <div className="sm:pl-4 sm:border-l border-slate-200 text-left sm:text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Sociedad
              </div>
              {!isLocked && moduleCompanies.length > 0 ? (
                <select
                  value={liquidation.empresa}
                  onChange={(e) => onUpdateHeader({ empresa: e.target.value })}
                  aria-label="Sociedad de la liquidación"
                  className="mt-0.5 text-xs font-bold text-[#132B63] bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 max-w-[200px]"
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
                <div className="text-xs font-bold text-[#132B63]">{liquidation.empresa}</div>
              )}
              <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                {liquidation.consultorEmail || 'Sin correo'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Closed / Read-Only Notice with Direct Download & Archive Actions */}
      {isLocked && (
        <div className="px-4 py-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Lock className="w-4 h-4 text-[#132B63] shrink-0 mt-0.5" />
            <div className="min-w-0">
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
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Puedes consultar cada factura y comprobante, descargar el Excel o el PDF, o iniciar una nueva liquidación.
                  </div>
                </>
              ) : (
                <span>
                  Tu perfil está en modo <strong>Solo Consulta</strong>. Puedes inspeccionar facturas,
                  ver comprobantes y descargar el Excel o PDF compilado.
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onQuickDownloadExcel}
              disabled={liquidation.items.length === 0 || isDownloadingExcel}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 bg-white hover:bg-emerald-50 border border-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingExcel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>Excel</span>
            </button>
            <button
              type="button"
              onClick={onQuickDownloadPdf}
              disabled={liquidation.items.length === 0 || isDownloadingPdf}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-rose-800 bg-white hover:bg-rose-50 border border-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-rose-700" />
              )}
              <span>PDF</span>
            </button>
            <button
              type="button"
              onClick={onOpenCloseEmailModal}
              disabled={liquidation.items.length === 0}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#132B63] bg-white hover:bg-sky-50 border border-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Correo</span>
            </button>
            {liquidation.estado !== 'borrador' && (
              <button
                type="button"
                onClick={onOpenClosedArchive}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>Ver Cerradas</span>
              </button>
            )}
            {permissions.canOperate && (
              <button
                type="button"
                onClick={onCreateNewLiquidation}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#132B63] bg-sky-100 hover:bg-sky-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nueva</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. CAPTURA DE FACTURA (FOTO / PDF + EXTRACCIÓN IA + DATOS COMERCIALES) */}
      {!isLocked && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                {editingItemId
                  ? 'Editar Factura Seleccionada'
                  : 'Cargar Factura (Foto o PDF) y Digitar Datos Comerciales'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Sube una foto o PDF: la aplicación extrae fecha, serie, número, NIT, proveedor, moneda, valor e impuestos automáticamente y permite ajustar cualquier campo.
              </p>
            </div>

            {uploadQueue.length > 0 && (
              <span className="text-xs font-semibold text-[#1E60A8] tabular-nums">
                {uploadQueue.length} comprobante(s) adicional(es) en cola
              </span>
            )}
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT (5 cols): Receipt Uploader + Camera + Live Preview */}
            <div className="lg:col-span-5 space-y-3">
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

              {/* Dropzone / Active Preview */}
              {activeMediaPreview ? (
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                  <div className="px-3 py-2 bg-slate-100/90 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-slate-700">
                      {activeMediaPreview.mimeType === 'application/pdf' ? (
                        <FileText className="w-4 h-4 text-rose-600 shrink-0" />
                      ) : (
                        <ImageIcon className="w-4 h-4 text-[#1E60A8] shrink-0" />
                      )}
                      <span className="truncate">{activeMediaPreview.fileName}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {activeMediaPreview.mimeType !== 'application/pdf' && (
                        <button
                          type="button"
                          onClick={handleRotateCurrentPreview}
                          disabled={isExtractingAi || isRotatingImage}
                          title="Rotar imagen 90° en sentido horario"
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-200/80 rounded-lg cursor-pointer disabled:opacity-50"
                        >
                          {isRotatingImage ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <RotateCw className="w-3.5 h-3.5" />
                          )}
                          <span>Rotar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleReExtractCurrent}
                        disabled={isExtractingAi || isRotatingImage}
                        title="Volver a leer datos de la factura con IA"
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
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
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="relative h-64 flex items-center justify-center bg-slate-900/5 overflow-hidden">
                    {isExtractingAi && (
                      <div className="absolute inset-0 z-10 bg-white/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 p-4 text-center">
                        <Loader2 className="w-7 h-7 animate-spin text-[#1E60A8]" />
                        <div className="text-xs font-bold text-[#132B63]">
                          Extrayendo datos de la factura...
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Detectando fecha, serie, número, NIT, proveedor, moneda, valor e impuestos
                        </div>
                      </div>
                    )}

                    {activeMediaPreview.mimeType === 'application/pdf' ? (
                      <>
                        <iframe
                          src={activeMediaPreview.dataUrl}
                          title={activeMediaPreview.fileName}
                          className="hidden sm:block w-full h-full border-0"
                        />
                        <div className="sm:hidden flex flex-col items-center justify-center gap-2.5 p-5 text-center">
                          <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div className="text-xs font-bold text-slate-800 break-all line-clamp-2">
                            {activeMediaPreview.fileName}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            PDF adjunto ({Math.max(1, Math.round((activeMediaPreview.size || 0) / 1024))} KB) listo para lectura y compilado final
                          </div>
                          <a
                            href={activeMediaPreview.dataUrl}
                            download={activeMediaPreview.fileName}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#132B63] bg-white border border-slate-300 rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#1E60A8]" />
                            <span>Descargar / Abrir PDF</span>
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
                  className={`rounded-xl border-2 border-dashed p-5 sm:p-6 text-center transition-colors ${
                    isDragging
                      ? 'border-[#1E60A8] bg-blue-50/70'
                      : 'border-slate-300 bg-slate-50/60 hover:border-[#1E60A8]/60'
                  }`}
                >
                  {isExtractingAi ? (
                    <div className="py-6 flex flex-col items-center gap-2">
                      <Loader2 className="w-7 h-7 animate-spin text-[#1E60A8]" />
                      <div className="text-xs font-bold text-[#132B63]">
                        Leyendo factura con IA...
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-11 h-11 rounded-xl bg-[#1E60A8]/10 text-[#1E60A8] flex items-center justify-center mx-auto mb-3">
                        <Camera className="w-5 h-5 sm:hidden" />
                        <Upload className="w-5 h-5 hidden sm:block" />
                      </div>
                      <p className="text-sm sm:text-xs font-bold text-slate-800">
                        Toma foto o sube cualquier factura o PDF
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                        Lee tickets térmicos, facturas tamaño carta/cambiarias, hoteles, combustible, boletos aéreos y recibos digitales. Todo se compila en el PDF final.
                      </p>

                      <div className="mt-4 grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
                        >
                          <Camera className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          <span>Tomar Foto</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-[#132B63] bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors cursor-pointer"
                        >
                          <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#1E60A8]" />
                          <span>Galería / PDF</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Quick replace buttons when preview exists */}
              {activeMediaPreview && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 shrink-0" />
                    <span>Otro archivo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs font-semibold text-[#132B63] bg-white hover:bg-slate-50 border border-slate-300 rounded-xl cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                    <span>Nueva foto</span>
                  </button>
                </div>
              )}

              {/* AI Extraction Status Banner */}
              {aiStatusBanner && (
                <div
                  className={`px-3.5 py-2.5 rounded-xl border text-[11px] space-y-2 leading-relaxed ${
                    aiStatusBanner.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : aiStatusBanner.type === 'warning'
                      ? 'bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {aiStatusBanner.type === 'success' ? (
                      <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <span>{aiStatusBanner.text}</span>
                  </div>
                  {aiStatusBanner.type === 'error' && activeMediaPreview && (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={handleReExtractCurrent}
                        disabled={isExtractingAi}
                        className="inline-flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Reintentar lectura IA</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT (7 cols): Editable Extracted Fields + Commercial Digitization */}
            <form onSubmit={handleSubmitItem} className="lg:col-span-7 space-y-4">
              {formError && (
                <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Sub-section A: Invoice Extracted Fields */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#132B63]">
                    Datos de la Factura (Lectura Automática / Editable)
                  </span>
                  {form.extractedByAi && (
                    <span className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>Sugerido por IA</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Fecha Doc.
                    </label>
                    <input
                      type="text"
                      value={form.fechaDoc}
                      onChange={(e) => setForm({ ...form, fechaDoc: e.target.value })}
                      placeholder="DD/MM/YYYY"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] tabular-nums"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Serie Doc. (si aplica)
                    </label>
                    <input
                      type="text"
                      value={form.serieDoc}
                      onChange={(e) => setForm({ ...form, serieDoc: e.target.value })}
                      placeholder="Ej. FD0887E5"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      No. Doc.
                    </label>
                    <input
                      type="text"
                      value={form.noDoc}
                      onChange={(e) => setForm({ ...form, noDoc: e.target.value })}
                      placeholder="Número factura"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      NIT
                    </label>
                    <input
                      type="text"
                      value={form.nit}
                      onChange={(e) => setForm({ ...form, nit: e.target.value })}
                      placeholder="NIT / ID fiscal"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Proveedor *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.proveedor}
                      onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                      placeholder="Razón social o comercio"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Moneda (Modificable)
                    </label>
                    <select
                      value={form.moneda}
                      onChange={(e) =>
                        handleCurrencyChange(e.target.value as ViaticoCurrency)
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    >
                      {VIATICO_CURRENCIES.map((cur) => (
                        <option key={cur} value={cur}>
                          {cur}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
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
                          montoImpuestoManual: '',
                        })
                      }
                      placeholder="0.00"
                      className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs text-right font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tipo Cambio
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.0001"
                      min="0.0001"
                      value={form.tipoCambio}
                      onChange={(e) => setForm({ ...form, tipoCambio: e.target.value })}
                      className="w-full px-2.5 py-2 sm:py-1.5 text-sm sm:text-xs text-right font-mono tabular-nums rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                  </div>
                </div>

                {/* Taxes + Valor Reintegrar Inline Bar */}
                <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                  <div className="sm:col-span-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      ¿Aplica Impuestos?
                    </div>
                    <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden bg-white">
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
                        className={`px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
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
                        className={`px-3 py-1 text-xs font-semibold transition-colors cursor-pointer ${
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
                    <>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
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
                          className="w-full px-2 py-1.5 sm:py-1 text-sm sm:text-xs text-right font-mono tabular-nums bg-white rounded-lg border border-slate-300"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                          Monto Imp. / Base
                        </label>
                        <div className="flex items-center gap-1.5">
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
                            className="w-24 sm:w-20 px-2 py-1.5 sm:py-1 text-sm sm:text-xs text-right font-mono tabular-nums bg-white rounded-lg border border-slate-300"
                          />
                          <span className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                            Base: {formatViaticoAmount(computedTax.valorSinImpuesto)}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-5 text-[11px] text-slate-500">
                      Exento / sin crédito fiscal (ej. recibo exterior, Uber, Airbnb).
                    </div>
                  )}

                  <div className="sm:col-span-3 sm:text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Valor Reintegrar ({baseCurrency})
                    </div>
                    <div className="text-base font-extrabold text-[#132B63] font-mono tabular-nums">
                      {formatViaticoAmount(computedReintegrar, baseCurrency, true)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sub-section B: Commercial Fields Digitized by Liquidador */}
              <div className="space-y-3 pt-1">
                <div className="border-b border-slate-100 pb-1.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#132B63]">
                    Detalle Comercial y Gasto (Digitado por Liquidador)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Categoría *
                    </label>
                    <select
                      value={form.categoria}
                      onChange={(e) =>
                        setForm({ ...form, categoria: e.target.value as ViaticoCategory })
                      }
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    >
                      {VIATICO_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
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
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                    <datalist id="viaticos-cliente-list">
                      {clienteSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
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
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                    <datalist id="viaticos-objetivo-list">
                      {objetivoSuggestions.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                  <div className="sm:col-span-9">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Descripción del Gasto
                    </label>
                    <input
                      type="text"
                      value={form.descripcionGasto}
                      onChange={(e) =>
                        setForm({ ...form, descripcionGasto: e.target.value })
                      }
                      placeholder="Ej. Desayuno 28 de julio, Elder-Melania y Cecilia"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Kilometraje
                    </label>
                    <input
                      type="text"
                      value={form.kilometraje}
                      onChange={(e) => setForm({ ...form, kilometraje: e.target.value })}
                      placeholder="Ej. 310 km"
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Actions */}
              <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleResetForm(false)}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{editingItemId ? 'Cancelar edición' : 'Limpiar campos'}</span>
                </button>

                <button
                  type="submit"
                  disabled={isExtractingAi}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0 px-5 py-2.5 sm:py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
                >
                  {editingItemId ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Guardar Cambios en Fila</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
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

      {/* 3. PLANILLA OFICIAL PREMEX (14-Column Table matching Template) */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Detalle de Liquidación de Viáticos
            </h3>
            <p className="text-[11px] text-slate-500 tabular-nums">
              Con impuestos:{' '}
              <strong className="text-slate-700">
                {formatViaticoAmount(liquidation.totalConImpuestos, liquidation.monedaBase, true)}
              </strong>{' '}
              (Imp. est. {formatViaticoAmount(liquidation.totalImpuestos)}) · Sin impuestos:{' '}
              <strong className="text-slate-700">
                {formatViaticoAmount(liquidation.totalSinImpuestos, liquidation.monedaBase, true)}
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onQuickDownloadExcel}
              disabled={liquidation.items.length === 0 || isDownloadingExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingExcel ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-700" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>Descargar Excel</span>
            </button>

            <button
              type="button"
              onClick={onQuickDownloadPdf}
              disabled={liquidation.items.length === 0 || isDownloadingPdf}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-700" />
              ) : (
                <FileText className="w-3.5 h-3.5 text-rose-700" />
              )}
              <span>Descargar PDF</span>
            </button>

            {!isLocked && liquidation.estado === 'borrador' && permissions.canOperate && (
              <button
                type="button"
                onClick={onOpenCloseConfirmModal}
                disabled={liquidation.items.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Cerrar Liquidación</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenCloseEmailModal}
              disabled={liquidation.items.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#132B63] bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Enviar Correo</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[1380px]">
            <thead>
              <tr className="bg-[#C4E4EE] text-slate-900 border-b border-slate-300 text-[11px] font-bold">
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
                <th className="py-2.5 px-2.5 whitespace-nowrap text-center">
                  Soporte / Acc.
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {liquidation.items.length === 0 ? (
                <tr>
                  <td colSpan={16} className="py-10 text-center text-slate-500">
                    Aún no hay facturas registradas en esta liquidación. Sube una foto o PDF arriba para comenzar.
                  </td>
                </tr>
              ) : (
                liquidation.items.map((item) => {
                  const media = item.attachmentId ? mediaMap[item.attachmentId] : undefined;
                  const isBeingEdited = editingItemId === item.id;
                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isBeingEdited
                          ? 'bg-sky-50/90'
                          : 'hover:bg-slate-50/90'
                      }`}
                    >
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-center font-mono tabular-nums text-slate-700">
                        {item.fechaDoc || '—'}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap font-mono text-slate-700">
                        {item.serieDoc || ''}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap font-mono text-slate-800">
                        {item.noDoc || ''}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap font-mono text-slate-700">
                        {item.nit || ''}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200/80 font-medium text-slate-900 max-w-[200px]">
                        {item.proveedor}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-center text-slate-700">
                        {item.moneda}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-right font-mono tabular-nums text-slate-800">
                        {formatViaticoAmount(item.valorFactura)}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-right font-mono tabular-nums text-slate-600">
                        {formatViaticoAmount(item.tipoCambio)}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-right font-mono font-bold tabular-nums text-slate-900 bg-slate-50/60">
                        {formatViaticoAmount(item.valorReintegrar)}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-slate-800">
                        {item.categoria}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200/80 font-bold text-slate-900 max-w-[190px]">
                        {item.clienteContacto}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200/80 text-slate-700 max-w-[200px]">
                        {item.objetivoComercial}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200/80 text-slate-700 max-w-[230px]">
                        {item.descripcionGasto}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-center tabular-nums text-slate-700">
                        {item.kilometraje}
                      </td>
                      <td className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-center">
                        <span
                          title={
                            item.aplicaImpuestos
                              ? `Impuesto ${item.porcentajeImpuesto}%: ${formatViaticoAmount(
                                  item.montoImpuesto
                                )} | Base: ${formatViaticoAmount(item.valorSinImpuesto)}`
                              : 'Sin impuestos'
                          }
                          className={`text-[11px] font-semibold tabular-nums ${
                            item.aplicaImpuestos ? 'text-[#1E60A8]' : 'text-slate-400'
                          }`}
                        >
                          {item.aplicaImpuestos ? `Sí (${item.porcentajeImpuesto}%)` : 'No'}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-center">
                        <div className="inline-flex items-center gap-1">
                          {media ? (
                            <button
                              type="button"
                              onClick={() => setLightboxItem({ item, media })}
                              title={`Ver comprobante: ${media.fileName}`}
                              className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          ) : item.attachmentName ? (
                            <span
                              title={`Adjunto registrado: ${item.attachmentName} (guardado en el equipo origen)`}
                              className="p-1.5 text-slate-400"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                            </span>
                          ) : null}

                          {!isLocked && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditRow(item)}
                                title="Editar fila"
                                className="p-1.5 text-slate-500 hover:text-[#1E60A8] hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (editingItemId === item.id) handleResetForm();
                                  onDeleteItem(item.id);
                                }}
                                title="Eliminar fila"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
                <td colSpan={5} className="py-3 px-3 text-[11px] text-slate-500">
                  Formato oficial Premex · Listo para descarga Excel y compilación PDF
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
                <td colSpan={7} className="py-3 px-3 text-[11px] font-semibold text-slate-600">
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
        </div>
      </section>

      {/* Receipt Lightbox Viewer */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3.5 bg-[#132B63] text-white flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-bold truncate">
                  {lightboxItem.item.proveedor} ·{' '}
                  {formatViaticoAmount(
                    lightboxItem.item.valorFactura,
                    lightboxItem.item.moneda,
                    true
                  )}
                </div>
                <div className="text-[11px] text-sky-200 truncate">
                  Fecha: {lightboxItem.item.fechaDoc || '-'} · Doc:{' '}
                  {[lightboxItem.item.serieDoc, lightboxItem.item.noDoc]
                    .filter(Boolean)
                    .join('-') || '-'}{' '}
                  · Archivo: {lightboxItem.media.fileName}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
                aria-label="Cerrar vista previa"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 bg-slate-900/5 overflow-auto flex items-center justify-center p-4 min-h-[420px]">
              {lightboxItem.media.mimeType === 'application/pdf' ? (
                <iframe
                  src={lightboxItem.media.dataUrl}
                  title={lightboxItem.media.fileName}
                  className="w-full h-[70vh] rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={lightboxItem.media.dataUrl}
                  alt={lightboxItem.media.fileName}
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
