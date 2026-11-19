import React, { useMemo, useState, useEffect } from 'react';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Download,
  UploadCloud,
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  BankAccount,
  BankReconcilingSection,
  BankSociety,
  BankTab,
  SapDocumentClass,
  SapOpenItem,
  SapSubaccountType,
} from '../../types';
import {
  RECONCILING_SECTION_META,
  SAP_DOCUMENT_CLASS_LABELS,
  classifySapOpenItem,
  formatBankMoney,
  formatSheetDate,
  getEffectiveSapItemSection,
  getSapDocumentClassLabel,
  inferCutoffDateFromMonth,
} from '../../utils/bankReconciliation';

interface BankPendientesViewProps {
  societies: BankSociety[];
  accounts: BankAccount[];
  sapOpenItems: SapOpenItem[];
  selectedMonth: string;
  initialAccountFilterId?: string;
  onClearInitialAccountFilter?: () => void;
  onAddSapOpenItem: (item: Omit<SapOpenItem, 'id' | 'seccionAuto'>) => void;
  onUpdateSapOpenItem: (itemId: string, patch: Partial<SapOpenItem>) => void;
  onReclassifySapOpenItem: (itemId: string, manualSection?: BankReconcilingSection) => void;
  onDeleteSapOpenItem: (itemId: string) => void;
  onExportExcel: () => void;
  onNavigateTab: (tab: BankTab) => void;
  isReadOnly?: boolean;
}

const SAP_CLASSES: SapDocumentClass[] = ['CB', 'DZ', 'AB', 'KZ', 'KR', 'DC'];
const SECTIONS: BankReconcilingSection[] = [
  'mas_notas_debito_libros',
  'menos_notas_credito_libros',
  'menos_cheques_pendientes',
  'mas_consignaciones_pendientes',
];

export const BankPendientesView: React.FC<BankPendientesViewProps> = ({
  societies,
  accounts,
  sapOpenItems,
  selectedMonth,
  initialAccountFilterId,
  onClearInitialAccountFilter,
  onAddSapOpenItem,
  onUpdateSapOpenItem,
  onReclassifySapOpenItem,
  onDeleteSapOpenItem,
  onExportExcel,
  onNavigateTab,
  isReadOnly = false,
}) => {
  const [societyFilter, setSocietyFilter] = useState<string>('ALL');
  const [accountFilter, setAccountFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [subaccountFilter, setSubaccountFilter] = useState<string>('ALL');
  const [sectionFilter, setSectionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Create form state
  const [isCreating, setIsCreating] = useState(false);
  const [createAccountId, setCreateAccountId] = useState<string>(accounts[0]?.id || '');
  const [createSubcuenta, setCreateSubcuenta] = useState<SapSubaccountType>('02');
  const [createClase, setCreateClase] = useState<SapDocumentClass>('CB');
  const [createDoc, setCreateDoc] = useState('');
  const [createRef, setCreateRef] = useState('');
  const [createRef3, setCreateRef3] = useState('');
  const [createFecha, setCreateFecha] = useState(inferCutoffDateFromMonth(selectedMonth));
  const [createImporte, setCreateImporte] = useState('');
  const [createTexto, setCreateTexto] = useState('');
  const [createComentario, setCreateComentario] = useState('');

  // Inline Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    numeroDocumento: string;
    claveRef3: string;
    claseDocumento: SapDocumentClass;
    subcuentaTipo: SapSubaccountType;
    fechaDocumento: string;
    importeMonedaLocal: string;
    texto: string;
    comentario: string;
  } | null>(null);

  useEffect(() => {
    if (initialAccountFilterId) {
      const targetAcc = accounts.find((a) => a.id === initialAccountFilterId);
      if (targetAcc) {
        setSocietyFilter(
          (targetAcc.codigoSociedad || targetAcc.sociedad || 'ALL').trim().toUpperCase()
        );
        setAccountFilter(targetAcc.id);
      }
      onClearInitialAccountFilter?.();
    }
  }, [initialAccountFilterId, accounts, onClearInitialAccountFilter]);

  useEffect(() => {
    if (!createAccountId && accounts.length > 0) {
      setCreateAccountId(accounts[0].id);
    }
  }, [accounts, createAccountId]);

  const accountById = useMemo(() => {
    const map = new Map<string, BankAccount>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  const societyOptions = useMemo(() => {
    const map = new Map<string, string>();
    societies.forEach((s) =>
      map.set(s.codigoSociedad.trim().toUpperCase(), `${s.codigoSociedad} · ${s.nombre}`)
    );
    accounts.forEach((a) => {
      const k = (a.codigoSociedad || a.sociedad || '').trim().toUpperCase();
      if (k && !map.has(k)) {
        map.set(k, a.codigoSociedad ? `${a.codigoSociedad} · ${a.sociedad}` : a.sociedad);
      }
    });
    return Array.from(map.entries());
  }, [societies, accounts]);

  const chainedAccounts = useMemo(() => {
    if (societyFilter === 'ALL') return accounts;
    return accounts.filter(
      (a) => (a.codigoSociedad || a.sociedad || '').trim().toUpperCase() === societyFilter
    );
  }, [accounts, societyFilter]);

  // Period-scoped open items
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return sapOpenItems.filter((item) => {
      if (selectedMonth !== 'ALL' && item.mes && item.mes !== selectedMonth) return false;
      const acc = accountById.get(item.cuentaId);
      const itemSocKey = (
        item.sociedadCodigo ||
        acc?.codigoSociedad ||
        item.sociedadNombre ||
        ''
      )
        .trim()
        .toUpperCase();

      if (societyFilter !== 'ALL' && itemSocKey !== societyFilter) return false;
      if (accountFilter !== 'ALL' && item.cuentaId !== accountFilter) return false;
      if (classFilter !== 'ALL' && item.claseDocumento.toUpperCase() !== classFilter) return false;
      if (subaccountFilter !== 'ALL' && item.subcuentaTipo !== subaccountFilter) return false;

      const effSec = getEffectiveSapItemSection(item);
      if (sectionFilter !== 'ALL' && effSec !== sectionFilter) return false;

      if (!q) return true;
      return (
        item.numeroDocumento.toLowerCase().includes(q) ||
        item.referencia.toLowerCase().includes(q) ||
        item.claveRef3.toLowerCase().includes(q) ||
        item.claveRef1.toLowerCase().includes(q) ||
        item.texto.toLowerCase().includes(q) ||
        item.cuentaMayor.toLowerCase().includes(q) ||
        (acc?.banco || '').toLowerCase().includes(q)
      );
    });
  }, [
    sapOpenItems,
    selectedMonth,
    accountById,
    societyFilter,
    accountFilter,
    classFilter,
    subaccountFilter,
    sectionFilter,
    searchQuery,
  ]);

  const totalsSummary = useMemo(() => {
    const byCurrency = new Map<string, { sum01: number; sum02: number; count: number }>();
    filteredItems.forEach((item) => {
      const curr = item.monedaLocal || 'COP';
      const entry = byCurrency.get(curr) || { sum01: 0, sum02: 0, count: 0 };
      entry.count += 1;
      if (item.subcuentaTipo === '01') entry.sum01 += item.importeMonedaLocal;
      if (item.subcuentaTipo === '02') entry.sum02 += item.importeMonedaLocal;
      byCurrency.set(curr, entry);
    });
    return Array.from(byCurrency.entries());
  }, [filteredItems]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAcc = accountById.get(createAccountId);
    const val = Number(createImporte);
    if (!targetAcc || !Number.isFinite(val) || Math.abs(val) < 0.001 || !createTexto.trim()) {
      return;
    }
    const gl =
      createSubcuenta === '01'
        ? targetAcc.cuentaMayor01 || `${targetAcc.raizContable || ''}01`
        : createSubcuenta === '02'
        ? targetAcc.cuentaMayor02 || `${targetAcc.raizContable || ''}02`
        : targetAcc.cuentaMayor00 || targetAcc.codigoContable || '';

    const effectiveMonth = selectedMonth === 'ALL' ? 'Octubre 2026' : selectedMonth;

    onAddSapOpenItem({
      cuentaId: targetAcc.id,
      sociedadCodigo: targetAcc.codigoSociedad || '1000',
      sociedadNombre: targetAcc.sociedad,
      cuentaMayor: gl,
      raizContable: targetAcc.raizContable || '',
      subcuentaTipo: createSubcuenta,
      claveRef1: '',
      claveRef3: createRef3.trim(),
      referencia: createRef.trim() || createDoc.trim() || `REF-${Date.now().toString().slice(-4)}`,
      numeroDocumento: createDoc.trim() || `DOC-${Date.now().toString().slice(-5)}`,
      claseDocumento: createClase,
      fechaDocumento: createFecha || inferCutoffDateFromMonth(effectiveMonth),
      fechaContabilizacion: createFecha || inferCutoffDateFromMonth(effectiveMonth),
      importeMonedaLocal: Math.round(val * 100) / 100,
      monedaLocal: targetAcc.moneda,
      texto: createTexto.trim(),
      mes: effectiveMonth,
      comentario: createComentario.trim() || undefined,
      origen: 'manual',
    });

    setCreateDoc('');
    setCreateRef('');
    setCreateRef3('');
    setCreateImporte('');
    setCreateTexto('');
    setCreateComentario('');
    setIsCreating(false);
  };

  const startEdit = (item: SapOpenItem) => {
    if (isReadOnly) return;
    setEditingId(item.id);
    setEditDraft({
      numeroDocumento: item.numeroDocumento,
      claveRef3: item.claveRef3,
      claseDocumento: item.claseDocumento,
      subcuentaTipo: item.subcuentaTipo,
      fechaDocumento: item.fechaDocumento,
      importeMonedaLocal: String(item.importeMonedaLocal),
      texto: item.texto,
      comentario: item.comentario || '',
    });
  };

  const saveEdit = (item: SapOpenItem) => {
    if (!editDraft) return;
    const val = Number(editDraft.importeMonedaLocal);
    if (!Number.isFinite(val) || Math.abs(val) < 0.001 || !editDraft.texto.trim()) return;
    const acc = accountById.get(item.cuentaId);
    const gl =
      editDraft.subcuentaTipo === '01'
        ? acc?.cuentaMayor01 || item.cuentaMayor
        : editDraft.subcuentaTipo === '02'
        ? acc?.cuentaMayor02 || item.cuentaMayor
        : acc?.cuentaMayor00 || item.cuentaMayor;

    const rounded = Math.round(val * 100) / 100;
    onUpdateSapOpenItem(item.id, {
      numeroDocumento: editDraft.numeroDocumento.trim() || item.numeroDocumento,
      claveRef3: editDraft.claveRef3.trim(),
      claseDocumento: editDraft.claseDocumento,
      subcuentaTipo: editDraft.subcuentaTipo,
      cuentaMayor: gl,
      fechaDocumento: editDraft.fechaDocumento || item.fechaDocumento,
      importeMonedaLocal: rounded,
      texto: editDraft.texto.trim(),
      comentario: editDraft.comentario.trim() || undefined,
      seccionAuto: classifySapOpenItem(editDraft.claseDocumento, rounded),
    });
    setEditingId(null);
    setEditDraft(null);
  };

  const createPreviewSection = useMemo(() => {
    const num = Number(createImporte);
    if (!Number.isFinite(num) || num === 0) return null;
    return classifySapOpenItem(createClase, num);
  }, [createClase, createImporte]);

  return (
    <div className="space-y-5">
      {/* Top Action & Summary Strip */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Partidas Abiertas SAP (FBL3N) · Gestión y Reclasificación
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtra por sociedad, cuenta bancaria, clase de documento SAP o subcuenta (01 / 02).
              Las reglas automáticas clasifican cada partida y permiten reclasificación manual.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!isReadOnly && (
              <>
                <button
                  type="button"
                  onClick={() => setIsCreating((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Nueva Partida Abierta</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('carga')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#19377B] bg-[#1E60A8]/10 hover:bg-[#1E60A8]/18 rounded-xl transition-colors cursor-pointer"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Cargar FBL3N</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel Entregable</span>
            </button>
          </div>
        </div>

        {/* Multi-Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 text-xs">
          <select
            aria-label="Filtrar por sociedad"
            value={societyFilter}
            onChange={(e) => {
              setSocietyFilter(e.target.value);
              setAccountFilter('ALL');
            }}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#1E60A8]"
          >
            <option value="ALL">Todas las sociedades</option>
            {societyOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por cuenta bancaria"
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#1E60A8]"
          >
            <option value="ALL">Todas las cuentas ({chainedAccounts.length})</option>
            {chainedAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.banco} · {acc.numeroCuenta} ({acc.moneda})
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por clase SAP"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#1E60A8]"
          >
            <option value="ALL">Todas las clases SAP</option>
            {SAP_CLASSES.map((c) => (
              <option key={c} value={c}>
                {c} · {SAP_DOCUMENT_CLASS_LABELS[c]}
              </option>
            ))}
          </select>

          <select
            aria-label="Filtrar por subcuenta"
            value={subaccountFilter}
            onChange={(e) => setSubaccountFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#1E60A8]"
          >
            <option value="ALL">Todas subcuentas</option>
            <option value="01">Subcuenta 01 (Ingresos)</option>
            <option value="02">Subcuenta 02 (Egresos)</option>
            <option value="00">Subcuenta 00 (Principal)</option>
          </select>

          <select
            aria-label="Filtrar por sección entregable"
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#1E60A8]"
          >
            <option value="ALL">Todas las secciones</option>
            {SECTIONS.map((s) => (
              <option key={s} value={s}>
                {RECONCILING_SECTION_META[s].signLabel} · {RECONCILING_SECTION_META[s].title}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Doc, ref, tercero, texto..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#1E60A8]"
            />
          </div>
        </div>

        {/* Filtered Totals Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
          <div>
            Mostrando <strong className="font-mono text-slate-900">{filteredItems.length}</strong>{' '}
            partida(s) abierta(s)
            {selectedMonth !== 'ALL' && (
              <>
                {' '}
                · Periodo <strong className="text-slate-800">{selectedMonth}</strong>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums text-[11px]">
            {totalsSummary.map(([curr, t]) => (
              <span key={curr}>
                <strong className="text-slate-800">{curr}</strong>: Sub 01{' '}
                <strong className="text-slate-900">
                  {formatBankMoney(t.sum01, curr as BankAccount['moneda'], true)}
                </strong>{' '}
                · Sub 02{' '}
                <strong className="text-slate-900">
                  {formatBankMoney(t.sum02, curr as BankAccount['moneda'], true)}
                </strong>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Inline Create SAP Open Item Form */}
      {!isReadOnly && isCreating && (
        <form
          onSubmit={handleCreateSubmit}
          className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-[#132B63]">
                Alta Manual de Partida Abierta SAP
              </h4>
              <p className="text-xs text-slate-500">
                Usa importe negativo (-) o positivo (+) según la regla SAP FBL3N para clasificación
                automática.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="lg:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Cuenta Bancaria *</label>
              <select
                required
                value={createAccountId}
                onChange={(e) => setCreateAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.codigoSociedad ? `${acc.codigoSociedad} · ` : ''}
                    {acc.sociedad} — {acc.banco} ({acc.numeroCuenta} · {acc.moneda})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Subcuenta SAP *</label>
              <select
                value={createSubcuenta}
                onChange={(e) => setCreateSubcuenta(e.target.value as SapSubaccountType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
              >
                <option value="01">01 · Ingresos Pendientes</option>
                <option value="02">02 · Egresos Pendientes</option>
                <option value="00">00 · Principal</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Clase Documento *</label>
              <select
                value={createClase}
                onChange={(e) => setCreateClase(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
              >
                {SAP_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c} · {SAP_DOCUMENT_CLASS_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nº Documento *</label>
              <input
                type="text"
                required
                value={createDoc}
                onChange={(e) => setCreateDoc(e.target.value)}
                placeholder="Ej. 1500090411"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Referencia</label>
              <input
                type="text"
                value={createRef}
                onChange={(e) => setCreateRef(e.target.value)}
                placeholder="Ej. CE-9041"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha Documento *</label>
              <input
                type="date"
                required
                value={createFecha}
                onChange={(e) => setCreateFecha(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Importe con Signo *
              </label>
              <input
                type="number"
                step="any"
                required
                value={createImporte}
                onChange={(e) => setCreateImporte(e.target.value)}
                placeholder="-155735 o +485000"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono tabular-nums focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tercero (Ref. 3)</label>
              <input
                type="text"
                value={createRef3}
                onChange={(e) => setCreateRef3(e.target.value)}
                placeholder="Quien pagó / proveedor"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Texto / Concepto *</label>
              <input
                type="text"
                required
                value={createTexto}
                onChange={(e) => setCreateTexto(e.target.value)}
                placeholder="Descripción de la partida en el entregable"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Comentario interno</label>
              <input
                type="text"
                value={createComentario}
                onChange={(e) => setCreateComentario(e.target.value)}
                placeholder="Observaciones de auditoría"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <div className="text-xs text-slate-600">
              Clasificación automática prevista:{' '}
              <strong className="text-[#132B63]">
                {createPreviewSection
                  ? `${RECONCILING_SECTION_META[createPreviewSection].signLabel} · ${RECONCILING_SECTION_META[createPreviewSection].title}`
                  : 'Ingresa un importe (+/-)'}
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Guardar Partida</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Open Items Table */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="px-6 py-12 text-center text-xs text-slate-500">
            No hay partidas abiertas SAP registradas con los filtros seleccionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3">Sociedad / Cuenta</th>
                  <th className="py-3 px-3 font-mono">Cta. Mayor / Sub</th>
                  <th className="py-3 px-3 font-mono">Clase / Doc</th>
                  <th className="py-3 px-3 font-mono">Fecha</th>
                  <th className="py-3 px-3">Texto y Tercero (Ref. 3)</th>
                  <th className="py-3 px-3 text-right">Importe ML</th>
                  <th className="py-3 px-3">Sección Entregable</th>
                  {!isReadOnly && <th className="py-3 px-3 text-center">Acciones</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => {
                  const acc = accountById.get(item.cuentaId);
                  const effSection = getEffectiveSapItemSection(item);
                  const isManualOverride = Boolean(item.seccionManual);
                  const isEditing = editingId === item.id && editDraft !== null;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 align-top">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900">
                          {item.sociedadCodigo} · {item.sociedadNombre}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {acc ? `${acc.banco} (${acc.numeroCuenta})` : 'Cuenta no enlazada'}
                        </div>
                      </td>

                      <td className="py-2.5 px-3 font-mono">
                        {isEditing ? (
                          <select
                            value={editDraft.subcuentaTipo}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                subcuentaTipo: e.target.value as SapSubaccountType,
                              })
                            }
                            className="px-2 py-1 border border-slate-300 rounded-md bg-white text-xs"
                          >
                            <option value="01">01</option>
                            <option value="02">02</option>
                            <option value="00">00</option>
                          </select>
                        ) : (
                          <>
                            <div className="font-semibold text-slate-800">{item.cuentaMayor}</div>
                            <div className="text-[11px] text-slate-500">
                              Subcuenta {item.subcuentaTipo}
                            </div>
                          </>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono">
                        {isEditing ? (
                          <div className="space-y-1">
                            <select
                              value={editDraft.claseDocumento}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, claseDocumento: e.target.value })
                              }
                              className="w-full px-1.5 py-1 border border-slate-300 rounded-md bg-white text-xs"
                            >
                              {SAP_CLASSES.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={editDraft.numeroDocumento}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, numeroDocumento: e.target.value })
                              }
                              className="w-28 px-1.5 py-1 border border-slate-300 rounded-md bg-white text-xs"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="font-bold text-[#132B63]">
                              {item.claseDocumento}{' '}
                              <span className="font-sans font-normal text-slate-500">
                                · {getSapDocumentClassLabel(item.claseDocumento)}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600">{item.numeroDocumento}</div>
                          </>
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editDraft.fechaDocumento}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, fechaDocumento: e.target.value })
                            }
                            className="px-1.5 py-1 border border-slate-300 rounded-md bg-white text-xs"
                          />
                        ) : (
                          formatSheetDate(item.fechaDocumento)
                        )}
                      </td>

                      <td className="py-2.5 px-3 min-w-[220px]">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input
                              type="text"
                              value={editDraft.texto}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, texto: e.target.value })
                              }
                              placeholder="Texto / Concepto"
                              className="w-full px-2 py-1 border border-slate-300 rounded-md bg-white text-xs"
                            />
                            <input
                              type="text"
                              value={editDraft.claveRef3}
                              onChange={(e) =>
                                setEditDraft({ ...editDraft, claveRef3: e.target.value })
                              }
                              placeholder="Tercero (Clave Ref. 3)"
                              className="w-full px-2 py-1 border border-slate-300 rounded-md bg-white text-xs"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-slate-900">{item.texto}</div>
                            {item.claveRef3 && (
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Tercero: {item.claveRef3}
                              </div>
                            )}
                            {item.comentario && (
                              <div className="text-[11px] text-slate-400 italic mt-0.5">
                                {item.comentario}
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            value={editDraft.importeMonedaLocal}
                            onChange={(e) =>
                              setEditDraft({ ...editDraft, importeMonedaLocal: e.target.value })
                            }
                            className="w-28 px-2 py-1 text-right border border-slate-300 rounded-md bg-white text-xs"
                          />
                        ) : (
                          <span
                            className={`font-bold ${
                              item.importeMonedaLocal < 0 ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {formatBankMoney(item.importeMonedaLocal, item.monedaLocal, true)}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 min-w-[230px]">
                        {isReadOnly ? (
                          <div className="font-medium text-slate-800">
                            {RECONCILING_SECTION_META[effSection].signLabel} ·{' '}
                            {RECONCILING_SECTION_META[effSection].title}
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <select
                              aria-label={`Clasificación de ${item.numeroDocumento}`}
                              value={item.seccionManual || '__AUTO__'}
                              onChange={(e) => {
                                const val = e.target.value;
                                onReclassifySapOpenItem(
                                  item.id,
                                  val === '__AUTO__' ? undefined : (val as BankReconcilingSection)
                                );
                              }}
                              className={`w-full px-2 py-1.5 rounded-lg border text-[11px] font-medium focus:outline-hidden focus:border-[#1E60A8] cursor-pointer ${
                                isManualOverride
                                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                                  : 'bg-white border-slate-200 text-slate-800'
                              }`}
                            >
                              <option value="__AUTO__">
                                Auto: {RECONCILING_SECTION_META[item.seccionAuto].signLabel} ·{' '}
                                {RECONCILING_SECTION_META[item.seccionAuto].title}
                              </option>
                              {SECTIONS.map((s) => (
                                <option key={s} value={s}>
                                  Manual: {RECONCILING_SECTION_META[s].signLabel} ·{' '}
                                  {RECONCILING_SECTION_META[s].title}
                                </option>
                              ))}
                            </select>
                            {isManualOverride && (
                              <button
                                type="button"
                                onClick={() => onReclassifySapOpenItem(item.id, undefined)}
                                className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:underline cursor-pointer"
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>Restablecer regla automática</span>
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {!isReadOnly && (
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          {isEditing ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => saveEdit(item)}
                                title="Guardar cambios"
                                className="p-1.5 text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingId(null);
                                  setEditDraft(null);
                                }}
                                title="Cancelar"
                                className="p-1.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEdit(item)}
                                title="Editar partida"
                                className="p-1.5 text-slate-500 hover:text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteSapOpenItem(item.id)}
                                title="Eliminar partida"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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
