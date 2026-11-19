import React, { useState, useEffect, useRef } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  Plus,
  Printer,
  FileSpreadsheet,
  Trash2,
  X,
  Check,
  RotateCcw,
  ListFilter,
  Pencil,
} from 'lucide-react';
import {
  BankCurrency,
  BankReconcilingSection,
  BankReconciliationSummary,
  SapDocumentClass,
  SapSubaccountType,
} from '../../types';
import {
  RECONCILING_SECTION_META,
  SAP_DOCUMENT_CLASS_LABELS,
  formatAccountProductLine,
  formatAccountSapHeaderLine,
  formatBankMoney,
  formatOfficialCellAmount,
  formatOfficialMonthBanner,
  formatSheetDate,
  getSapDocumentClassLabel,
} from '../../utils/bankReconciliation';

export interface AddReconcilingItemPayload {
  section: BankReconcilingSection;
  claseDocumento: SapDocumentClass;
  subcuentaTipo: SapSubaccountType;
  documento: string;
  fecha: string;
  concepto: string;
  valor: number;
  tercero?: string;
  comentario?: string;
}

interface BankOfficialSheetProps {
  summary: BankReconciliationSummary;
  selectedMonth: string;
  isReadOnly?: boolean;
  onUpdateSaldoExtracto: (accountId: string, newExtracto: number) => void;
  onSyncExtractoToCta00: (accountId: string) => void;
  onUpdateMonthlyBalances: (
    accountId: string,
    patch: {
      saldoLibros: number;
      saldoExtracto: number;
      saldoCuenta00?: number;
      saldoCuenta01?: number;
      saldoCuenta02?: number;
      fechaCorte: string;
    }
  ) => void;
  onAddReconcilingItem: (accountId: string, payload: AddReconcilingItemPayload) => void;
  onDeleteLineItem: (source: 'sap' | 'bank' | 'ledger', itemId: string) => void;
  onOpenAccountPartidas: (accountId: string) => void;
  onOpenPrintPreview: () => void;
  onExportOfficialExcel: () => void;
}

const SECTION_ORDER: BankReconcilingSection[] = [
  'mas_notas_debito_libros',
  'menos_notas_credito_libros',
  'menos_cheques_pendientes',
  'mas_consignaciones_pendientes',
];

const SAP_CLASSES: SapDocumentClass[] = ['CB', 'DZ', 'AB', 'KZ', 'KR', 'DC'];

const defaultClassForSection = (section: BankReconcilingSection): SapDocumentClass => {
  if (section === 'menos_cheques_pendientes' || section === 'mas_consignaciones_pendientes') {
    return 'CB';
  }
  return 'AB';
};

const defaultSubaccountForSection = (section: BankReconcilingSection): SapSubaccountType => {
  if (section === 'mas_consignaciones_pendientes' || section === 'menos_notas_credito_libros') {
    return '01';
  }
  return '02';
};

const AmountDisplay: React.FC<{
  value: number;
  currency: BankCurrency;
  dashZero?: boolean;
  bold?: boolean;
}> = ({ value, currency, dashZero = false, bold = false }) => {
  const { symbol, figure } = formatOfficialCellAmount(value, currency, dashZero);
  return (
    <div
      className={`flex items-center justify-between gap-2 font-mono tabular-nums text-[12px] ${
        bold ? 'font-bold text-slate-950' : 'text-slate-900'
      }`}
    >
      <span className="shrink-0 select-none">{symbol}</span>
      <span className="text-right truncate">{figure}</span>
    </div>
  );
};

export const BankOfficialSheet: React.FC<BankOfficialSheetProps> = ({
  summary,
  selectedMonth,
  isReadOnly = false,
  onUpdateSaldoExtracto,
  onSyncExtractoToCta00,
  onUpdateMonthlyBalances,
  onAddReconcilingItem,
  onDeleteLineItem,
  onOpenAccountPartidas,
  onOpenPrintPreview,
  onExportOfficialExcel,
}) => {
  const account = summary.account;

  // Live click-to-edit inside the #C4D79B SALDO EN EXTRACTO cell
  const [isInlineEditingExtracto, setIsInlineEditingExtracto] = useState(false);
  const [inlineExtractoDraft, setInlineExtractoDraft] = useState('');
  const inlineExtractoInputRef = useRef<HTMLInputElement | null>(null);

  // Full period balances drawer (00 / 01 / 02 + Extracto + Cutoff)
  const [isEditingBalances, setIsEditingBalances] = useState(false);
  const [c00Input, setC00Input] = useState('');
  const [c01Input, setC01Input] = useState('');
  const [c02Input, setC02Input] = useState('');
  const [balanceExtractoInput, setBalanceExtractoInput] = useState('');
  const [cutoffInput, setCutoffInput] = useState('');

  // Inline Add Partida form
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newSection, setNewSection] = useState<BankReconcilingSection>('mas_notas_debito_libros');
  const [newClase, setNewClase] = useState<SapDocumentClass>('AB');
  const [newSubcuenta, setNewSubcuenta] = useState<SapSubaccountType>('02');
  const [newDoc, setNewDoc] = useState('');
  const [newFecha, setNewFecha] = useState('');
  const [newConcepto, setNewConcepto] = useState('');
  const [newValor, setNewValor] = useState('');
  const [newTercero, setNewTercero] = useState('');
  const [newComentario, setNewComentario] = useState('');

  useEffect(() => {
    setIsInlineEditingExtracto(false);
    setIsEditingBalances(false);
    setIsAddingItem(false);
  }, [account?.id, selectedMonth]);

  useEffect(() => {
    if (isInlineEditingExtracto && inlineExtractoInputRef.current) {
      inlineExtractoInputRef.current.focus();
      inlineExtractoInputRef.current.select();
    }
  }, [isInlineEditingExtracto]);

  if (!account) return null;

  const currency = account.moneda;
  const cutoffFormatted = formatSheetDate(summary.fechaCorte);
  const monthBanner = formatOfficialMonthBanner(selectedMonth);
  const absDiff = Math.abs(summary.diferenciaNeta);
  const isExact = absDiff <= 0.01;
  const isRoundingTolerance = !isExact && absDiff <= 1;

  const startInlineExtractoEdit = () => {
    if (isReadOnly) return;
    setInlineExtractoDraft(String(summary.saldoExtracto));
    setIsInlineEditingExtracto(true);
  };

  const commitInlineExtractoEdit = () => {
    setIsInlineEditingExtracto(false);
    const parsed = Number(inlineExtractoDraft);
    if (!Number.isFinite(parsed)) return;
    const rounded = Math.round(parsed * 100) / 100;
    if (Math.abs(rounded - summary.saldoExtracto) > 0.001) {
      onUpdateSaldoExtracto(account.id, rounded);
    }
  };

  const openBalanceEditor = () => {
    if (isReadOnly) return;
    setC00Input(String(summary.saldoCuenta00));
    setC01Input(String(summary.saldoCuenta01));
    setC02Input(String(summary.saldoCuenta02));
    setBalanceExtractoInput(String(summary.saldoExtracto));
    setCutoffInput(summary.fechaCorte);
    setIsAddingItem(false);
    setIsInlineEditingExtracto(false);
    setIsEditingBalances(true);
  };

  const openAddItemForm = (presetSection?: BankReconcilingSection) => {
    if (isReadOnly) return;
    const sec = presetSection || 'mas_notas_debito_libros';
    setNewSection(sec);
    setNewClase(defaultClassForSection(sec));
    setNewSubcuenta(defaultSubaccountForSection(sec));
    setNewDoc('');
    setNewFecha(summary.fechaCorte);
    setNewConcepto('');
    setNewValor('');
    setNewTercero('');
    setNewComentario('');
    setIsEditingBalances(false);
    setIsInlineEditingExtracto(false);
    setIsAddingItem(true);
  };

  const handleSelectSection = (sec: BankReconcilingSection) => {
    setNewSection(sec);
    setNewClase(defaultClassForSection(sec));
    setNewSubcuenta(defaultSubaccountForSection(sec));
  };

  const handleSaveBalances = (e: React.FormEvent) => {
    e.preventDefault();
    const n00 = Number(c00Input);
    const n01 = Number(c01Input);
    const n02 = Number(c02Input);
    const nExt = Number(balanceExtractoInput);
    if (
      !Number.isFinite(n00) ||
      !Number.isFinite(n01) ||
      !Number.isFinite(n02) ||
      !Number.isFinite(nExt)
    ) {
      return;
    }
    const r00 = Math.round(n00 * 100) / 100;
    const r01 = Math.round(n01 * 100) / 100;
    const r02 = Math.round(n02 * 100) / 100;
    const rLibros = Math.round((r00 + r01 + r02) * 100) / 100;
    const rExt = Math.round(nExt * 100) / 100;
    onUpdateMonthlyBalances(account.id, {
      saldoLibros: rLibros,
      saldoExtracto: rExt,
      saldoCuenta00: r00,
      saldoCuenta01: r01,
      saldoCuenta02: r02,
      fechaCorte: cutoffInput || summary.fechaCorte,
    });
    setIsEditingBalances(false);
  };

  const handleSaveNewItem = (e: React.FormEvent) => {
    e.preventDefault();
    const numericVal = Math.abs(Number(newValor));
    if (!Number.isFinite(numericVal) || numericVal <= 0 || !newConcepto.trim()) return;
    onAddReconcilingItem(account.id, {
      section: newSection,
      claseDocumento: newClase,
      subcuentaTipo: newSubcuenta,
      documento: newDoc.trim() || `DOC-${Date.now().toString().slice(-5)}`,
      fecha: newFecha || summary.fechaCorte,
      concepto: newConcepto.trim(),
      valor: Math.round(numericVal * 100) / 100,
      tercero: newTercero.trim() || undefined,
      comentario: newComentario.trim() || undefined,
    });
    setIsAddingItem(false);
  };

  const masNd = summary.officialLines.masNotasDebito;
  const menosChq = summary.officialLines.menosCheques;
  const menosNc = summary.officialLines.menosNotasCredito;
  const masCons = summary.officialLines.masConsignaciones;

  const block1Rows = Math.max(4, masNd.length, menosChq.length);
  const block2Rows = Math.max(3, menosNc.length, masCons.length);
  const totalPartidasCount = masNd.length + menosChq.length + menosNc.length + masCons.length;

  const sectionMeta = RECONCILING_SECTION_META[newSection];

  return (
    <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden print:border-0 print:rounded-none">
      {/* Action & Status Toolbar (hidden on print) */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 bg-slate-50/80 flex flex-col xl:flex-row xl:items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs">
          <span className="font-bold text-slate-900">Entregable Oficial</span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-600">
            Corte:{' '}
            <strong className="font-mono text-slate-800">{cutoffFormatted || 'Sin fecha'}</strong>
          </span>
          <span className="text-slate-300">·</span>
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              isExact || isRoundingTolerance ? 'text-emerald-700' : 'text-rose-700'
            }`}
          >
            {isExact || isRoundingTolerance ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>
              {isExact
                ? 'Conciliación cuadrada'
                : isRoundingTolerance
                ? `Cuadrada (redondeo ${formatBankMoney(summary.diferenciaNeta, currency, true)})`
                : `Diferencia por revisar: ${formatBankMoney(summary.diferenciaNeta, currency, true)}`}
            </span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isReadOnly && summary.hasSapSubaccounts && !summary.saldoExtractoMatchesCta00 && (
            <button
              type="button"
              onClick={() => onSyncExtractoToCta00(account.id)}
              title={`Restablecer Saldo en Extracto al saldo de Subcuenta 00 (${formatBankMoney(
                summary.saldoCuenta00,
                currency
              )})`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Igualar a Cta 00</span>
            </button>
          )}
          {!isReadOnly && (
            <>
              <button
                type="button"
                onClick={openBalanceEditor}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Saldos 00/01/02</span>
              </button>
              <button
                type="button"
                onClick={() => openAddItemForm()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar Partida</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onOpenAccountPartidas(account.id)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#19377B] bg-[#1E60A8]/10 hover:bg-[#1E60A8]/18 rounded-lg transition-colors cursor-pointer"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Partidas ({totalPartidasCount})</span>
          </button>
          <button
            type="button"
            onClick={onOpenPrintPreview}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#132B63]" />
            <span>Imprimir / PDF</span>
          </button>
          <button
            type="button"
            onClick={onExportOfficialExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            <span>Descargar Excel Entregable</span>
          </button>
        </div>
      </div>

      {/* Inline Editor: SAP 00 / 01 / 02 & Extracto Balances */}
      {!isReadOnly && isEditingBalances && (
        <form
          onSubmit={handleSaveBalances}
          className="px-5 py-4 bg-blue-50/70 border-b border-blue-200 space-y-3 print:hidden"
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-bold text-[#132B63]">
              Ajuste de Subcuentas SAP (00 / 01 / 02) y Saldo Extracto ({monthBanner})
            </div>
            <button
              type="button"
              onClick={() => setIsEditingBalances(false)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Cerrar editor de saldos"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha de Corte</label>
              <input
                type="date"
                required
                value={cutoffInput}
                onChange={(e) => setCutoffInput(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cta 00 Principal ({currency})
              </label>
              <input
                type="number"
                step="any"
                required
                value={c00Input}
                onChange={(e) => setC00Input(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono tabular-nums focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cta 01 Ingresos ({currency})
              </label>
              <input
                type="number"
                step="any"
                required
                value={c01Input}
                onChange={(e) => setC01Input(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono tabular-nums focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Cta 02 Egresos ({currency})
              </label>
              <input
                type="number"
                step="any"
                required
                value={c02Input}
                onChange={(e) => setC02Input(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono tabular-nums focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Saldo en Extracto ({currency})
              </label>
              <input
                type="number"
                step="any"
                required
                value={balanceExtractoInput}
                onChange={(e) => setBalanceExtractoInput(e.target.value)}
                className="w-full px-3 py-2 bg-[#C4D79B]/35 rounded-lg border border-slate-400 font-mono tabular-nums font-bold focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-600 font-mono tabular-nums">
              <span>
                Saldo Libros (00+01+02):{' '}
                <strong className="text-slate-900">
                  {formatBankMoney(
                    (Number(c00Input) || 0) + (Number(c01Input) || 0) + (Number(c02Input) || 0),
                    currency
                  )}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => setBalanceExtractoInput(c00Input)}
                className="text-[#1E60A8] hover:underline font-sans font-semibold cursor-pointer"
              >
                Igualar Extracto a Cta 00
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEditingBalances(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Guardar Saldos</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Inline Editor: Add SAP Open Item / Reconciling Difference */}
      {!isReadOnly && isAddingItem && (
        <form
          onSubmit={handleSaveNewItem}
          className="px-5 py-4 bg-emerald-50/60 border-b border-emerald-200 space-y-3 print:hidden"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Registrar Partida Abierta SAP / Partida Conciliatoria
              </div>
              <p className="text-[11px] text-slate-600">{sectionMeta.helper}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsAddingItem(false)}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Cerrar formulario de partida"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {SECTION_ORDER.map((secKey) => {
              const meta = RECONCILING_SECTION_META[secKey];
              const active = newSection === secKey;
              return (
                <button
                  key={secKey}
                  type="button"
                  onClick={() => handleSelectSection(secKey)}
                  className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#132B63] text-white border-[#132B63] font-semibold'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-[#1E60A8]'
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wider opacity-80">
                    {meta.side === 'libros' ? 'Lado Libros' : 'Lado Extracto'} · {meta.signLabel}
                  </div>
                  <div className="truncate mt-0.5">{meta.title}</div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Clase SAP</label>
              <select
                value={newClase}
                onChange={(e) => setNewClase(e.target.value)}
                className="w-full px-2.5 py-2 bg-white rounded-lg border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              >
                {SAP_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c} · {SAP_DOCUMENT_CLASS_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Subcuenta</label>
              <select
                value={newSubcuenta}
                onChange={(e) => setNewSubcuenta(e.target.value as SapSubaccountType)}
                className="w-full px-2.5 py-2 bg-white rounded-lg border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              >
                <option value="01">01 · Ingresos Pend.</option>
                <option value="02">02 · Egresos Pend.</option>
                <option value="00">00 · Principal</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nº Documento</label>
              <input
                type="text"
                value={newDoc}
                onChange={(e) => setNewDoc(e.target.value)}
                placeholder="Ej. 6000020548"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Fecha *</label>
              <input
                type="date"
                required
                value={newFecha}
                onChange={(e) => setNewFecha(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Valor ({currency}) *
              </label>
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={newValor}
                onChange={(e) => setNewValor(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 font-mono tabular-nums focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tercero (Ref. 3)</label>
              <input
                type="text"
                value={newTercero}
                onChange={(e) => setNewTercero(e.target.value)}
                placeholder="Cliente / proveedor"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Concepto / Texto *</label>
              <input
                type="text"
                required
                value={newConcepto}
                onChange={(e) => setNewConcepto(e.target.value)}
                placeholder="Ej. RENDIMIENTOS, TRANSFERENCIA ACH EN TRANSITO"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Observación / Comentario (opcional)
              </label>
              <input
                type="text"
                value={newComentario}
                onChange={(e) => setNewComentario(e.target.value)}
                placeholder="Referencia contable o explicación"
                className="w-full px-3 py-2 bg-white rounded-lg border border-slate-300 focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingItem(false)}
              className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Agregar a Conciliación</span>
            </button>
          </div>
        </form>
      )}

      {/* Official Premex Corporate Reconciliation Sheet */}
      <div className="p-4 sm:p-6 overflow-x-auto bg-white print:p-0 bank-print-sheet">
        <div className="min-w-[860px] border-2 border-slate-900 bg-white">
          {/* Corporate Olive-Green Centered Header (6 exact lines) */}
          <div className="bg-[#C4D79B] text-slate-950 text-center py-3.5 px-4 border-b-2 border-slate-900 leading-snug">
            <div className="text-lg sm:text-xl font-extrabold tracking-tight uppercase">
              {account.sociedad}
            </div>
            <div className="text-xs font-bold tracking-wide mt-0.5">CONCILIACION DE BANCOS</div>
            <div className="text-xs font-bold uppercase mt-0.5">{account.banco}</div>
            <div className="text-xs font-bold mt-0.5">{formatAccountProductLine(account)}</div>
            <div className="text-xs font-bold font-mono mt-0.5">
              {formatAccountSapHeaderLine(account)}
            </div>
            <div className="text-xs font-extrabold tracking-wider uppercase mt-2">
              {monthBanner}
            </div>
          </div>

          {/* 8-Column Symmetric Reconciliation Grid */}
          <table className="w-full table-fixed border-collapse text-[12px] text-slate-950">
            <colgroup>
              <col className="w-[10.5%]" />
              <col className="w-[9.5%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
              <col className="w-[10.5%]" />
              <col className="w-[9.5%]" />
              <col className="w-[18%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr className="bg-[#C4D79B] border-b-2 border-slate-900 font-bold text-[11px] uppercase">
                <th className="py-1.5 px-2 text-center border-r border-slate-900">DTO.</th>
                <th className="py-1.5 px-2 text-center border-r border-slate-900">FECHA</th>
                <th className="py-1.5 px-2 text-center border-r border-slate-900">CONCEPTO</th>
                <th className="py-1.5 px-2 text-center border-r-2 border-slate-900">VALOR</th>
                <th className="py-1.5 px-2 text-center border-r border-slate-900">DTO.</th>
                <th className="py-1.5 px-2 text-center border-r border-slate-900">FECHA</th>
                <th className="py-1.5 px-2 text-center border-r border-slate-900">CONCEPTO</th>
                <th className="py-1.5 px-2 text-center">VALOR</th>
              </tr>
            </thead>

            <tbody>
              {/* Top Spacer */}
              <tr className="h-3.5">
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r-2 border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td />
              </tr>

              {/* Row: SALDO EN LIBROS | SALDO EN EXTRACTO (double bottom border + live click-to-edit on Extracto) */}
              <tr className="h-9">
                <td className="border-r border-slate-900" />
                <td className="px-1.5 text-center font-bold font-mono text-[11px] border-r border-slate-900">
                  {cutoffFormatted}
                </td>
                <td className="px-2 font-bold border-r border-slate-900">SALDO EN LIBROS</td>
                <td
                  onClick={openBalanceEditor}
                  title={
                    isReadOnly
                      ? undefined
                      : 'Saldo Libros = Cta 00 + Cta 01 + Cta 02 · Clic para editar subcuentas'
                  }
                  className={`px-2 border-t-2 border-l border-r-2 border-b-[3px] border-b-double border-slate-950 bg-white ${
                    isReadOnly ? '' : 'cursor-pointer hover:bg-blue-50/70 transition-colors'
                  }`}
                >
                  <AmountDisplay value={summary.saldoLibros} currency={currency} bold />
                </td>

                <td className="border-r border-slate-900" />
                <td className="px-1.5 text-center font-bold font-mono text-[11px] border-r border-slate-900">
                  {cutoffFormatted}
                </td>
                <td className="px-2 font-bold border-r border-slate-900">SALDO EN EXTRACTO</td>
                <td
                  onClick={() => {
                    if (!isInlineEditingExtracto) startInlineExtractoEdit();
                  }}
                  title={
                    isReadOnly
                      ? undefined
                      : 'Haz clic para editar directamente el Saldo en Extracto (Enter guarda, Esc cancela)'
                  }
                  className={`px-2 border-t-2 border-l border-b-[3px] border-b-double border-slate-950 bg-[#C4D79B] ${
                    isReadOnly
                      ? ''
                      : isInlineEditingExtracto
                      ? 'ring-2 ring-[#1E60A8] ring-inset'
                      : 'cursor-pointer hover:brightness-95 transition-all'
                  }`}
                >
                  {isInlineEditingExtracto ? (
                    <input
                      ref={inlineExtractoInputRef}
                      type="number"
                      step="any"
                      value={inlineExtractoDraft}
                      onChange={(e) => setInlineExtractoDraft(e.target.value)}
                      onBlur={commitInlineExtractoEdit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitInlineExtractoEdit();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          setIsInlineEditingExtracto(false);
                        }
                      }}
                      aria-label="Editar Saldo en Extracto en vivo"
                      className="w-full bg-white/95 text-slate-950 font-mono font-bold tabular-nums text-right text-[12px] px-1.5 py-0.5 rounded-xs border border-[#1E60A8] focus:outline-hidden"
                    />
                  ) : (
                    <AmountDisplay value={summary.saldoExtracto} currency={currency} bold />
                  )}
                </td>
              </tr>

              {/* Mid Spacer */}
              <tr className="h-4">
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r-2 border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td />
              </tr>

              {/* Section 1 Subtotals: MAS NOTAS DEBITO NO CONTABILIZADAS | MENOS CHEQUES PENDIENTES */}
              <tr className="h-8">
                <td className="border-r border-slate-900" />
                <td className="px-1.5 text-center font-bold border-r border-slate-900">MAS</td>
                <td className="px-2 font-bold border-r border-slate-900">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">NOTAS DEBITO NO CONTABILIZADAS</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => openAddItemForm('mas_notas_debito_libros')}
                        title="Agregar Nota Débito no contabilizada (+ Libros)"
                        className="p-0.5 text-slate-400 hover:text-[#1E60A8] shrink-0 cursor-pointer print:hidden"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-2 bg-[#CCFFFF] border-y-2 border-l border-r-2 border-slate-900">
                  <AmountDisplay
                    value={summary.notasCreditoNoContabilizadas}
                    currency={currency}
                    dashZero
                    bold
                  />
                </td>

                <td className="border-r border-slate-900" />
                <td className="px-1.5 text-center font-bold border-r border-slate-900">MENOS</td>
                <td className="px-2 font-bold border-r border-slate-900">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">CHEQUES PENDIENTES</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => openAddItemForm('menos_cheques_pendientes')}
                        title="Agregar Cheque / Pago Pendiente (- Extracto)"
                        className="p-0.5 text-slate-400 hover:text-[#1E60A8] shrink-0 cursor-pointer print:hidden"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-2 bg-[#CCFFFF] border-y-2 border-l border-slate-900">
                  <AmountDisplay
                    value={summary.chequesEnTransito}
                    currency={currency}
                    dashZero
                    bold
                  />
                </td>
              </tr>

              {/* Block 1 Detail Rows */}
              {Array.from({ length: block1Rows }).map((_, idx) => {
                const leftItem = masNd[idx];
                const rightItem = menosChq[idx];
                return (
                  <tr key={`b1-${idx}`} className="h-7 hover:bg-slate-50/70">
                    <td
                      className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900 truncate"
                      title={
                        leftItem?.claseDocumento
                          ? `${leftItem.claseDocumento} (${getSapDocumentClassLabel(
                              leftItem.claseDocumento
                            )}) · Subcuenta ${leftItem.subcuentaTipo || '-'}`
                          : undefined
                      }
                    >
                      {leftItem?.dto || ''}
                    </td>
                    <td className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900">
                      {leftItem ? formatSheetDate(leftItem.fecha) : ''}
                    </td>
                    <td className="px-2 border-r border-slate-900 group">
                      {leftItem && (
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate" title={leftItem.concepto}>
                            {leftItem.concepto}
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onDeleteLineItem(leftItem.source, leftItem.id)}
                              title="Eliminar partida"
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 transition-opacity shrink-0 cursor-pointer print:hidden"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 border-r-2 border-slate-900">
                      {leftItem && <AmountDisplay value={leftItem.valor} currency={currency} />}
                    </td>

                    <td
                      className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900 truncate"
                      title={
                        rightItem?.claseDocumento
                          ? `${rightItem.claseDocumento} (${getSapDocumentClassLabel(
                              rightItem.claseDocumento
                            )}) · Subcuenta ${rightItem.subcuentaTipo || '-'}`
                          : undefined
                      }
                    >
                      {rightItem?.dto || ''}
                    </td>
                    <td className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900">
                      {rightItem ? formatSheetDate(rightItem.fecha) : ''}
                    </td>
                    <td className="px-2 border-r border-slate-900 group">
                      {rightItem && (
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate" title={rightItem.concepto}>
                            {rightItem.concepto}
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onDeleteLineItem(rightItem.source, rightItem.id)}
                              title="Eliminar partida"
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 transition-opacity shrink-0 cursor-pointer print:hidden"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2">
                      {rightItem && <AmountDisplay value={rightItem.valor} currency={currency} />}
                    </td>
                  </tr>
                );
              })}

              {/* Section 2 Subtotals: MENOS NOTAS CREDITO NO CONTABILIZADAS | MAS CONSIGNACIONES PENDIENTES */}
              <tr className="h-8">
                <td className="border-r border-slate-900" />
                <td className="px-1.5 text-center font-bold border-r border-slate-900">MENOS</td>
                <td className="px-2 font-bold border-r border-slate-900">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">NOTAS CREDITO NO CONTABILIZADAS</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => openAddItemForm('menos_notas_credito_libros')}
                        title="Agregar Nota Crédito no contabilizada (- Libros)"
                        className="p-0.5 text-slate-400 hover:text-[#1E60A8] shrink-0 cursor-pointer print:hidden"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-2 bg-[#CCFFFF] border-y-2 border-l border-r-2 border-slate-900">
                  <AmountDisplay
                    value={summary.notasDebitoNoContabilizadas}
                    currency={currency}
                    dashZero
                    bold
                  />
                </td>

                <td className="border-r border-slate-900" />
                <td className="px-1.5 text-center font-bold border-r border-slate-900">MAS</td>
                <td className="px-2 font-bold border-r border-slate-900">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">CONSIGNACIONES PENDIENTES</span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => openAddItemForm('mas_consignaciones_pendientes')}
                        title="Agregar Consignación Pendiente (+ Extracto)"
                        className="p-0.5 text-slate-400 hover:text-[#1E60A8] shrink-0 cursor-pointer print:hidden"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-2 bg-[#CCFFFF] border-y-2 border-l border-slate-900">
                  <AmountDisplay
                    value={summary.depositosEnTransito}
                    currency={currency}
                    dashZero
                    bold
                  />
                </td>
              </tr>

              {/* Block 2 Detail Rows */}
              {Array.from({ length: block2Rows }).map((_, idx) => {
                const leftItem = menosNc[idx];
                const rightItem = masCons[idx];
                return (
                  <tr key={`b2-${idx}`} className="h-7 hover:bg-slate-50/70">
                    <td
                      className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900 truncate"
                      title={
                        leftItem?.claseDocumento
                          ? `${leftItem.claseDocumento} (${getSapDocumentClassLabel(
                              leftItem.claseDocumento
                            )}) · Subcuenta ${leftItem.subcuentaTipo || '-'}`
                          : undefined
                      }
                    >
                      {leftItem?.dto || ''}
                    </td>
                    <td className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900">
                      {leftItem ? formatSheetDate(leftItem.fecha) : ''}
                    </td>
                    <td className="px-2 border-r border-slate-900 group">
                      {leftItem && (
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate" title={leftItem.concepto}>
                            {leftItem.concepto}
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onDeleteLineItem(leftItem.source, leftItem.id)}
                              title="Eliminar partida"
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 transition-opacity shrink-0 cursor-pointer print:hidden"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2 border-r-2 border-slate-900">
                      {leftItem && <AmountDisplay value={leftItem.valor} currency={currency} />}
                    </td>

                    <td
                      className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900 truncate"
                      title={
                        rightItem?.claseDocumento
                          ? `${rightItem.claseDocumento} (${getSapDocumentClassLabel(
                              rightItem.claseDocumento
                            )}) · Subcuenta ${rightItem.subcuentaTipo || '-'}`
                          : undefined
                      }
                    >
                      {rightItem?.dto || ''}
                    </td>
                    <td className="px-1.5 text-center font-mono text-[11px] border-r border-slate-900">
                      {rightItem ? formatSheetDate(rightItem.fecha) : ''}
                    </td>
                    <td className="px-2 border-r border-slate-900 group">
                      {rightItem && (
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate" title={rightItem.concepto}>
                            {rightItem.concepto}
                          </span>
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onDeleteLineItem(rightItem.source, rightItem.id)}
                              title="Eliminar partida"
                              className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-rose-600 transition-opacity shrink-0 cursor-pointer print:hidden"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-2">
                      {rightItem && <AmountDisplay value={rightItem.valor} currency={currency} />}
                    </td>
                  </tr>
                );
              })}

              {/* Final Footer Row: TOTAL CONCILIADO | TOTAL CONCILIADO */}
              <tr className="h-9 bg-[#C4D79B] border-t-2 border-slate-900 font-bold text-[12px]">
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="px-2 uppercase tracking-tight border-r border-slate-900">
                  TOTAL CONCILIADO
                </td>
                <td className="px-2 border-r-2 border-slate-900">
                  <AmountDisplay
                    value={summary.saldoConciliadoLibros}
                    currency={currency}
                    bold
                  />
                </td>
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="px-2 uppercase tracking-tight border-r border-slate-900">
                  TOTAL CONCILIADO
                </td>
                <td className="px-2">
                  <AmountDisplay
                    value={summary.saldoConciliadoExtracto}
                    currency={currency}
                    bold
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Reconciliation Footnote Summary */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Partidas Libros:{' '}
              <strong className="text-slate-800 font-mono">{masNd.length + menosNc.length}</strong>
            </span>
            <span>
              Partidas Extracto:{' '}
              <strong className="text-slate-800 font-mono">
                {menosChq.length + masCons.length}
              </strong>
            </span>
          </div>
          <div className="font-mono font-bold tabular-nums">
            Diferencia (Libros − Extracto):{' '}
            <span
              className={
                isExact || isRoundingTolerance ? 'text-emerald-700' : 'text-rose-700'
              }
            >
              {formatBankMoney(summary.diferenciaNeta, currency, true)}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};
