import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FileSpreadsheet,
  FileText,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Search,
  Layers,
  FileCheck2,
  Loader2,
  Building2,
} from 'lucide-react';
import { BankAccount, BankReconciliationSummary } from '../../types';
import { BankExportMode } from '../../utils/bankOfficialExport';
import { formatBankMoney } from '../../utils/bankReconciliation';

export type BankExportFormat = 'excel' | 'pdf';

export interface BankExportAccountItem {
  account: BankAccount;
  summary: BankReconciliationSummary;
  period: string;
}

interface BankExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  items: BankExportAccountItem[];
  initialFormat: BankExportFormat;
  initialMode: BankExportMode;
  initialAccountId?: string;
  initialSocietyKey?: string;
  onExecuteExcel: (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => Promise<void>;
  onExecutePdf: (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => Promise<void>;
  onOpenPdfPreview: (
    selectedItems: BankExportAccountItem[],
    mode: BankExportMode,
    scopeLabel: string
  ) => void;
}

const getSocietyKey = (acc: BankAccount): string =>
  (acc.codigoSociedad || acc.sociedad || '').trim().toUpperCase();

const getItemKey = (item: BankExportAccountItem): string =>
  `${item.period}::${item.account.id}`;

export const BankExportModal: React.FC<BankExportModalProps> = ({
  isOpen,
  onClose,
  title = 'Descargar Conciliaciones Bancarias',
  subtitle,
  items,
  initialFormat,
  initialMode,
  initialAccountId,
  initialSocietyKey = 'ALL',
  onExecuteExcel,
  onExecutePdf,
  onOpenPdfPreview,
}) => {
  const [format, setFormat] = useState<BankExportFormat>(initialFormat);
  const [mode, setMode] = useState<BankExportMode>(initialMode);
  const [singleKey, setSingleKey] = useState<string>('');
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [activeSocietyFilter, setActiveSocietyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const uniquePeriods = useMemo(
    () => Array.from(new Set(items.map((i) => i.period))),
    [items]
  );
  const isMultiPeriod = uniquePeriods.length > 1;

  const societiesList = useMemo(() => {
    const map = new Map<
      string,
      { key: string; code: string; name: string; count: number }
    >();
    items.forEach(({ account }) => {
      const key = getSocietyKey(account);
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, {
          key,
          code: account.codigoSociedad || '',
          name: account.sociedad || 'Sin Sociedad',
          count: 1,
        });
      }
    });
    return Array.from(map.values());
  }, [items]);

  // Reset modal controls cleanly every time it opens
  useEffect(() => {
    if (!isOpen) return;
    setFormat(initialFormat);
    setMode(items.length <= 1 ? 'individual' : initialMode);
    setSearchQuery('');

    const matchedSingle =
      (initialAccountId
        ? items.find((i) => i.account.id === initialAccountId)
        : null) || items[0];
    setSingleKey(matchedSingle ? getItemKey(matchedSingle) : '');

    const normalizedSoc =
      initialSocietyKey && initialSocietyKey !== 'ALL'
        ? initialSocietyKey.trim().toUpperCase()
        : 'ALL';
    setActiveSocietyFilter(normalizedSoc);

    const initialBatch =
      normalizedSoc === 'ALL'
        ? items
        : items.filter((i) => getSocietyKey(i.account) === normalizedSoc);
    setSelectedKeys(new Set((initialBatch.length > 0 ? initialBatch : items).map(getItemKey)));
  }, [isOpen, initialFormat, initialMode, initialAccountId, initialSocietyKey, items]);

  const groupedSingleOptions = useMemo(() => {
    const map = new Map<string, BankExportAccountItem[]>();
    items.forEach((item) => {
      const socLabel = `${item.account.codigoSociedad ? `${item.account.codigoSociedad} · ` : ''}${
        item.account.sociedad
      }${isMultiPeriod ? ` — ${item.period}` : ''}`;
      const list = map.get(socLabel) || [];
      list.push(item);
      map.set(socLabel, list);
    });
    return Array.from(map.entries());
  }, [items, isMultiPeriod]);

  const selectedSingleItem = useMemo(
    () => items.find((i) => getItemKey(i) === singleKey) || items[0] || null,
    [items, singleKey]
  );

  const visibleChecklistItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (activeSocietyFilter !== 'ALL' && getSocietyKey(item.account) !== activeSocietyFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.account.banco.toLowerCase().includes(q) ||
        item.account.sociedad.toLowerCase().includes(q) ||
        (item.account.codigoSociedad || '').toLowerCase().includes(q) ||
        item.account.numeroCuenta.toLowerCase().includes(q) ||
        (item.account.cuentaMayor00 || '').toLowerCase().includes(q) ||
        item.period.toLowerCase().includes(q)
      );
    });
  }, [items, activeSocietyFilter, searchQuery]);

  const selectedBatchItems = useMemo(
    () => items.filter((i) => selectedKeys.has(getItemKey(i))),
    [items, selectedKeys]
  );

  if (!isOpen) return null;

  const effectiveSelection =
    mode === 'individual'
      ? selectedSingleItem
        ? [selectedSingleItem]
        : []
      : selectedBatchItems;

  const computeScopeLabel = (): string => {
    if (mode === 'individual' && selectedSingleItem) {
      return `${selectedSingleItem.account.sociedad}_${selectedSingleItem.account.banco}`;
    }
    if (selectedBatchItems.length === items.length) {
      return isMultiPeriod ? 'Historial_Consolidado' : 'Todas_Sociedades';
    }
    const selectedSocs = Array.from(
      new Set(selectedBatchItems.map((i) => i.account.codigoSociedad || i.account.sociedad))
    );
    if (selectedSocs.length === 1) {
      return `Soc_${selectedSocs[0]}`;
    }
    return `Seleccion_${selectedBatchItems.length}`;
  };

  const handleSelectSocietyPreset = (socKey: string) => {
    setActiveSocietyFilter(socKey);
    const matching =
      socKey === 'ALL'
        ? items
        : items.filter((i) => getSocietyKey(i.account) === socKey);
    setSelectedKeys(new Set(matching.map(getItemKey)));
  };

  const toggleItemKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSelectVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      visibleChecklistItems.forEach((i) => next.add(getItemKey(i)));
      return next;
    });
  };

  const handleClearVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      visibleChecklistItems.forEach((i) => next.delete(getItemKey(i)));
      return next;
    });
  };

  const handlePrimaryDownload = async () => {
    if (effectiveSelection.length === 0 || isDownloading) return;
    const scopeLabel = computeScopeLabel();
    setIsDownloading(true);
    try {
      if (format === 'excel') {
        await onExecuteExcel(effectiveSelection, mode, scopeLabel);
      } else {
        await onExecutePdf(effectiveSelection, mode, scopeLabel);
      }
      onClose();
    } finally {
      setIsDownloading(false);
    }
  };

  const handleOpenPreview = () => {
    if (effectiveSelection.length === 0) return;
    const scopeLabel = computeScopeLabel();
    onClose();
    onOpenPdfPreview(effectiveSelection, mode, scopeLabel);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-slate-900 truncate">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {subtitle ||
                (isMultiPeriod
                  ? `${uniquePeriods.length} periodos · ${items.length} conciliación(es) disponibles`
                  : `${uniquePeriods[0] || ''} · ${items.length} cuenta(s) disponible(s)`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg cursor-pointer shrink-0"
            aria-label="Cerrar diálogo de descarga"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. Format Switcher: Excel vs PDF */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              1. Formato de archivo
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setFormat('excel')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  format === 'excel'
                    ? 'bg-emerald-50/70 border-emerald-600 text-emerald-950 ring-1 ring-emerald-600/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    format === 'excel'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">Excel Entregable (.xlsx)</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    Fórmulas vivas SAP + partidas FBL3N
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  format === 'pdf'
                    ? 'bg-blue-50/70 border-[#1E60A8] text-[#132B63] ring-1 ring-[#1E60A8]/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    format === 'pdf'
                      ? 'bg-[#132B63] text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">Documento PDF (.pdf)</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    Formato oficial horizontal con firmas
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Mode Switcher: Individual vs Masivo */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">
              2. Tipo de descarga
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('individual')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  mode === 'individual'
                    ? 'bg-[#132B63] border-[#132B63] text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    mode === 'individual'
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <FileCheck2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">Individual</div>
                  <div
                    className={`text-[11px] truncate ${
                      mode === 'individual' ? 'text-sky-200' : 'text-slate-500'
                    }`}
                  >
                    1 cuenta bancaria específica
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={items.length === 0}
                onClick={() => setMode('masivo')}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 ${
                  mode === 'masivo'
                    ? 'bg-[#132B63] border-[#132B63] text-white'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    mode === 'masivo'
                      ? 'bg-white/15 text-white'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold">Masivo ({items.length})</div>
                  <div
                    className={`text-[11px] truncate ${
                      mode === 'masivo' ? 'text-sky-200' : 'text-slate-500'
                    }`}
                  >
                    Todas, por sociedad o selección
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Account / Scope Selection */}
          {mode === 'individual' ? (
            <div className="space-y-3">
              <label
                htmlFor="bank-export-single-select"
                className="block text-xs font-semibold text-slate-700"
              >
                3. Cuenta bancaria a descargar
              </label>
              <select
                id="bank-export-single-select"
                value={singleKey}
                onChange={(e) => setSingleKey(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 bg-slate-50 border border-slate-300 rounded-xl focus:outline-hidden focus:bg-white focus:border-[#1E60A8]"
              >
                {groupedSingleOptions.map(([groupLabel, groupItems]) => (
                  <optgroup key={groupLabel} label={groupLabel}>
                    {groupItems.map((it) => {
                      const k = getItemKey(it);
                      return (
                        <option key={k} value={k}>
                          {it.account.banco} · Cta {it.account.numeroCuenta} ({it.account.moneda})
                          {isMultiPeriod ? ` — ${it.period}` : ''}
                        </option>
                      );
                    })}
                  </optgroup>
                ))}
              </select>

              {selectedSingleItem && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-slate-900 truncate">
                      {selectedSingleItem.account.sociedad} · {selectedSingleItem.account.banco}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                      Cta {selectedSingleItem.account.numeroCuenta} · Libros:{' '}
                      {formatBankMoney(
                        selectedSingleItem.summary.saldoLibros,
                        selectedSingleItem.account.moneda
                      )}{' '}
                      · Extracto:{' '}
                      {formatBankMoney(
                        selectedSingleItem.summary.saldoExtracto,
                        selectedSingleItem.account.moneda
                      )}
                    </div>
                  </div>
                  {Math.abs(selectedSingleItem.summary.diferenciaNeta) <= 1 ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Cuadrada</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-semibold font-mono tabular-nums shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>
                        Dif.{' '}
                        {formatBankMoney(
                          selectedSingleItem.summary.diferenciaNeta,
                          selectedSingleItem.account.moneda,
                          true
                        )}
                      </span>
                    </span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700">
                  3. Alcance masivo ({selectedBatchItems.length} de {items.length} seleccionada
                  {selectedBatchItems.length === 1 ? '' : 's'})
                </label>
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  <button
                    type="button"
                    onClick={handleSelectVisible}
                    className="text-[#1E60A8] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Seleccionar visibles
                  </button>
                  <span className="text-slate-300" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={handleClearVisible}
                    className="text-slate-500 hover:text-slate-800 hover:underline cursor-pointer whitespace-nowrap"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Society Quick Presets */}
              {societiesList.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectSocietyPreset('ALL')}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      activeSocietyFilter === 'ALL'
                        ? 'bg-[#1E60A8] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                    }`}
                  >
                    Todas ({items.length})
                  </button>
                  {societiesList.map((soc) => {
                    const active = activeSocietyFilter === soc.key;
                    return (
                      <button
                        key={soc.key}
                        type="button"
                        onClick={() => handleSelectSocietyPreset(soc.key)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? 'bg-[#1E60A8] text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                        }`}
                      >
                        <Building2 className="w-3 h-3 shrink-0" />
                        <span>
                          {soc.code ? `${soc.code} · ` : ''}
                          {soc.name} ({soc.count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search within checklist */}
              {items.length > 5 && (
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filtrar cuentas por banco, sociedad, número o periodo..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white focus:border-[#1E60A8]"
                  />
                </div>
              )}

              {/* Compact Multi-Select Checklist */}
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto bg-white">
                {visibleChecklistItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No hay cuentas que coincidan con el filtro.
                  </div>
                ) : (
                  visibleChecklistItems.map((item) => {
                    const key = getItemKey(item);
                    const checked = selectedKeys.has(key);
                    const isOk = Math.abs(item.summary.diferenciaNeta) <= 1;
                    return (
                      <label
                        key={key}
                        className={`flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs cursor-pointer transition-colors ${
                          checked ? 'bg-blue-50/40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItemKey(key)}
                            className="w-4 h-4 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8] cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 truncate">
                              {item.account.banco}{' '}
                              <span className="font-normal text-slate-500 font-mono">
                                · {item.account.numeroCuenta}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {item.account.codigoSociedad ? `${item.account.codigoSociedad} · ` : ''}
                              {item.account.sociedad}
                              {isMultiPeriod ? ` · ${item.period}` : ''} · {item.account.moneda}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`text-[11px] font-semibold font-mono tabular-nums whitespace-nowrap shrink-0 ${
                            isOk ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {isOk ? 'Cuadrada' : 'Con dif.'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Output Summary */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-600">
            {format === 'excel' ? (
              mode === 'individual' ? (
                <>
                  <strong className="text-slate-900">Excel Individual:</strong> hoja oficial + Partidas SAP + Balance 00/01/02.
                </>
              ) : (
                <>
                  <strong className="text-slate-900">Excel Masivo:</strong> consolidado +{' '}
                  <span className="font-semibold font-mono tabular-nums">{effectiveSelection.length}</span>{' '}
                  hoja(s) oficial(es) + Partidas SAP + Balance 00/01/02.
                </>
              )
            ) : mode === 'individual' ? (
              <>
                <strong className="text-slate-900">PDF Individual:</strong> 1 página horizontal con firmas.
              </>
            ) : (
              <>
                <strong className="text-slate-900">PDF Masivo:</strong>{' '}
                <span className="font-semibold font-mono tabular-nums">{effectiveSelection.length}</span>{' '}
                página(s) horizontal(es) numerada(s) con firmas.
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cancelar
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {format === 'pdf' && (
              <button
                type="button"
                disabled={effectiveSelection.length === 0 || isDownloading}
                onClick={handleOpenPreview}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 disabled:opacity-40 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#132B63]" />
                <span>Vista previa / Imprimir</span>
              </button>
            )}

            <button
              type="button"
              disabled={effectiveSelection.length === 0 || isDownloading}
              onClick={() => void handlePrimaryDownload()}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 ${
                format === 'excel'
                  ? 'bg-emerald-700 hover:bg-emerald-800'
                  : 'bg-[#132B63] hover:bg-[#1E60A8]'
              }`}
            >
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>
                {isDownloading
                  ? 'Generando...'
                  : format === 'excel'
                  ? mode === 'individual'
                    ? 'Descargar Excel Individual'
                    : `Descargar Excel Masivo (${effectiveSelection.length})`
                  : mode === 'individual'
                  ? 'Descargar PDF Individual'
                  : `Descargar PDF Masivo (${effectiveSelection.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
