import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Layers,
  ListChecks,
  Loader2,
  X,
  Lock,
  FolderPlus,
} from 'lucide-react';
import {
  BankAccount,
  BankSociety,
  EffectivePermissions,
} from '../../types';
import {
  ParsedSapBalanceResult,
  ParsedSapCatalogResult,
  ParsedSapFbl3nResult,
  downloadSapBalanceTemplate,
  downloadSapCatalogTemplate,
  downloadSapFbl3nTemplate,
  parseSapBalance000102File,
  parseSapCatalogFile,
  parseSapFbl3nOpenItemsFile,
} from '../../utils/bankExcel';
import {
  RECONCILING_SECTION_META,
  formatBankMoney,
  formatSheetDate,
  getSapDocumentClassLabel,
} from '../../utils/bankReconciliation';

type UploadTab = 'balance' | 'fbl3n' | 'catalogo';

interface BankCargaViewProps {
  societies: BankSociety[];
  accounts: BankAccount[];
  selectedAccount: BankAccount | null;
  selectedMonth: string;
  permissions: EffectivePermissions;
  isReadOnly?: boolean;
  isPeriodClosed?: boolean;
  openPeriod?: string | null;
  onRequestOpenReconciliation?: () => void;
  onApplySapCatalogImport: (result: ParsedSapCatalogResult) => void;
  onApplySapBalanceImport: (result: ParsedSapBalanceResult) => void;
  onApplySapFbl3nImport: (result: ParsedSapFbl3nResult, mode: 'replace' | 'append') => void;
}

export const BankCargaView: React.FC<BankCargaViewProps> = ({
  societies,
  accounts,
  selectedAccount,
  selectedMonth,
  permissions,
  isReadOnly = false,
  isPeriodClosed = false,
  openPeriod = null,
  onRequestOpenReconciliation,
  onApplySapCatalogImport,
  onApplySapBalanceImport,
  onApplySapFbl3nImport,
}) => {
  const [activeMode, setActiveMode] = useState<UploadTab>('balance');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [importMergeMode, setImportMergeMode] = useState<'replace' | 'append'>('replace');

  const [catalogPreview, setCatalogPreview] = useState<ParsedSapCatalogResult | null>(null);
  const [balancePreview, setBalancePreview] = useState<ParsedSapBalanceResult | null>(null);
  const [fbl3nPreview, setFbl3nPreview] = useState<ParsedSapFbl3nResult | null>(null);
  const [excludedCompaniesWarning, setExcludedCompaniesWarning] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const effectiveMonth = selectedMonth === 'ALL' ? 'Octubre 2026' : selectedMonth;

  const clearPreviews = () => {
    setCatalogPreview(null);
    setBalancePreview(null);
    setFbl3nPreview(null);
    setParseError(null);
    setLoadedFileName(null);
    setExcludedCompaniesWarning([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleModeChange = (mode: UploadTab) => {
    setActiveMode(mode);
    clearPreviews();
  };

  const isCompanyAuthorized = (nameOrCode: string): boolean => {
    if (permissions.getModuleCompanyScope('bancos') !== 'selected') return true;
    return permissions.isCompanyAllowed(nameOrCode, 'bancos');
  };

  const handleFilePicked = async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setExcludedCompaniesWarning([]);
    setLoadedFileName(file.name);

    try {
      const blocked = new Set<string>();

      if (activeMode === 'catalogo') {
        const res = await parseSapCatalogFile(file, societies, accounts);
        const allowedSocieties = res.societies.filter((s) => {
          const ok = isCompanyAuthorized(s.nombre) || isCompanyAuthorized(s.codigoSociedad);
          if (!ok) blocked.add(s.nombre);
          return ok;
        });
        const allowedAccounts = res.accounts.filter((a) => {
          const ok = isCompanyAuthorized(a.sociedadNombre) || isCompanyAuthorized(a.codigoSociedad);
          if (!ok) blocked.add(a.sociedadNombre);
          return ok;
        });
        setCatalogPreview({ ...res, societies: allowedSocieties, accounts: allowedAccounts });
      } else if (activeMode === 'balance') {
        const res = await parseSapBalance000102File(file, effectiveMonth, societies, accounts);
        const allowedGroups = res.groups.filter((g) => {
          const ok = isCompanyAuthorized(g.sociedadNombre) || isCompanyAuthorized(g.sociedadCodigo);
          if (!ok) blocked.add(g.sociedadNombre);
          return ok;
        });
        const allowedKeys = new Set(allowedGroups.map((g) => g.sociedadCodigo.toUpperCase()));
        const allowedRawRows = res.rawRows.filter((r) =>
          allowedKeys.has(r.sociedadCodigo.toUpperCase())
        );
        setBalancePreview({ ...res, groups: allowedGroups, rawRows: allowedRawRows });
      } else if (activeMode === 'fbl3n') {
        const res = await parseSapFbl3nOpenItemsFile(
          file,
          effectiveMonth,
          societies,
          accounts,
          selectedAccount
        );
        const allowedItems = res.items.filter((i) => {
          const ok = isCompanyAuthorized(i.sociedadNombre) || isCompanyAuthorized(i.sociedadCodigo);
          if (!ok) blocked.add(i.sociedadNombre);
          return ok;
        });
        setFbl3nPreview({ ...res, items: allowedItems });
      }

      if (blocked.size > 0) {
        setExcludedCompaniesWarning(Array.from(blocked));
      }
    } catch (err: unknown) {
      setParseError(
        err instanceof Error ? err.message : 'No se pudo procesar el archivo seleccionado.'
      );
    } finally {
      setIsParsing(false);
    }
  };

  if (isReadOnly) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
        Tu perfil es de solo consulta y no tiene permisos para ejecutar cargas masivas SAP.
      </div>
    );
  }

  if (isPeriodClosed) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-[#132B63] flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="text-sm font-bold text-slate-900">
            Periodo {effectiveMonth} cerrado · Carga masiva bloqueada
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {openPeriod
              ? `Estás visualizando un periodo cerrado. Selecciona el periodo abierto (${openPeriod}) para cargar archivos SAP.`
              : 'No existe una conciliación abierta actualmente. Abre una nueva conciliación para cargar el Balance SAP 00/01/02 y las Partidas Abiertas FBL3N del siguiente mes.'}
          </p>
        </div>
        {!openPeriod && onRequestOpenReconciliation && (
          <button
            type="button"
            onClick={onRequestOpenReconciliation}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Abrir Nueva Conciliación</span>
          </button>
        )}
      </div>
    );
  }

  const tabs: {
    id: UploadTab;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      id: 'balance',
      title: 'Balance SAP (00 / 01 / 02)',
      subtitle: 'Agrupa por Sociedad + Raíz y precarga Extracto = Cta 00',
      icon: Layers,
    },
    {
      id: 'fbl3n',
      title: 'Partidas Abiertas SAP (FBL3N)',
      subtitle: 'Clasificación automática CB / DZ / AB / KZ / KR / DC',
      icon: ListChecks,
    },
    {
      id: 'catalogo',
      title: 'Catálogo Sociedades y Cuentas',
      subtitle: 'Importación masiva del maestro bancario 00 / 01 / 02',
      icon: Building2,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Mode Selector Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleModeChange(tab.id)}
              className={`text-left rounded-2xl border p-4 transition-all cursor-pointer ${
                active
                  ? 'bg-[#132B63] text-white border-[#132B63] shadow-sm'
                  : 'bg-white text-slate-800 border-slate-200/90 hover:border-[#1E60A8]/60'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? 'bg-white/15 text-white' : 'bg-[#1E60A8]/10 text-[#1E60A8]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xs font-bold leading-snug">{tab.title}</div>
              </div>
              <p
                className={`text-[11px] mt-2 leading-relaxed ${
                  active ? 'text-sky-100/90' : 'text-slate-500'
                }`}
              >
                {tab.subtitle}
              </p>
            </button>
          );
        })}
      </section>

      {/* Template Download + Dropzone Card */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {tabs.find((t) => t.id === activeMode)?.title}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Formatos soportados: <span className="font-mono">.xlsx, .xls, .csv</span> · Periodo
              destino: <strong className="text-slate-800">{effectiveMonth}</strong>
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (activeMode === 'catalogo') downloadSapCatalogTemplate(societies, accounts);
              else if (activeMode === 'balance')
                downloadSapBalanceTemplate(accounts, effectiveMonth);
              else downloadSapFbl3nTemplate(accounts, effectiveMonth);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#132B63] bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Descargar Plantilla Excel</span>
          </button>
        </div>

        {/* File Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFilePicked(file);
          }}
          className="border-2 border-dashed border-slate-300 hover:border-[#1E60A8] bg-slate-50/70 hover:bg-blue-50/30 rounded-2xl p-8 text-center transition-colors cursor-pointer"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFilePicked(file);
            }}
          />

          {isParsing ? (
            <div className="flex flex-col items-center gap-2 text-slate-600">
              <Loader2 className="w-7 h-7 animate-spin text-[#1E60A8]" />
              <span className="text-xs font-semibold">Analizando archivo SAP...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-11 h-11 rounded-xl bg-[#1E60A8]/10 text-[#1E60A8] flex items-center justify-center">
                <UploadCloud className="w-5 h-5" />
              </div>
              <div className="text-sm font-bold text-slate-900">
                {loadedFileName
                  ? `Archivo cargado: ${loadedFileName}`
                  : 'Arrastra tu archivo SAP aquí o haz clic para seleccionarlo'}
              </div>
              <p className="text-xs text-slate-500 max-w-lg">
                {activeMode === 'balance' &&
                  'Columnas esperadas: Sociedad, Cta.mayor (terminación 00 / 01 / 02), Denominación cuenta, Nuevo Saldo y opcional Moneda.'}
                {activeMode === 'fbl3n' &&
                  'Columnas FBL3N: Sociedad, Cuenta de mayor, Clave referencia 1 y 3 (Tercero), Referencia, Nº documento, Clase de documento, Fecha de documento, Fe.contabilización, Importe en moneda local, Moneda local y Texto.'}
                {activeMode === 'catalogo' &&
                  'Hojas esperadas: Sociedades (Codigo_Sociedad, Nombre, Pais, Moneda, NIT) y Cuentas_Bancarias (Banco, Numero_Cuenta, Cuenta_Mayor_00/01/02).'}
              </p>
            </div>
          )}
        </div>

        {/* Parse Errors & RBAC Warnings */}
        {parseError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {excludedCompaniesWarning.length > 0 && (
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Por permisos de sociedad en el módulo Bancos se omitieron registros de:{' '}
              <strong>{excludedCompaniesWarning.join(', ')}</strong>.
            </span>
          </div>
        )}
      </section>

      {/* ==================== PREVIEW 1: BALANCE SAP 00/01/02 ==================== */}
      {activeMode === 'balance' && balancePreview && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#1E60A8]" />
                <span>
                  Vista Previa Balance SAP · {balancePreview.groups.length} banco(s) agrupados (
                  {balancePreview.rawRows.length} filas)
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Saldo en Libros = Cta 00 + Cta 01 + Cta 02 · Saldo en Extracto se precarga con Cta
                00.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearPreviews}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Descartar</span>
              </button>
              <button
                type="button"
                disabled={balancePreview.groups.length === 0}
                onClick={() => onApplySapBalanceImport(balancePreview)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aplicar Balance SAP ({balancePreview.groups.length})</span>
              </button>
            </div>
          </div>

          {balancePreview.warnings.length > 0 && (
            <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 space-y-1">
              {balancePreview.warnings.slice(0, 5).map((w, i) => (
                <div key={i}>• {w}</div>
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Sociedad / Raíz</th>
                  <th className="py-2.5 px-3">Cuenta Destino</th>
                  <th className="py-2.5 px-3 text-right">Cta 00 (Extracto)</th>
                  <th className="py-2.5 px-3 text-right">Cta 01 (Ingresos)</th>
                  <th className="py-2.5 px-3 text-right">Cta 02 (Egresos)</th>
                  <th className="py-2.5 px-3 text-right">Total Libros</th>
                  <th className="py-2.5 px-3">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {balancePreview.groups.map((g) => (
                  <tr key={g.groupKey} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">
                        {g.sociedadCodigo} · {g.sociedadNombre}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        Raíz {g.raizContable} · {g.moneda} · {g.mes}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-800">
                        {g.matchedAccountLabel || g.bancoInferido}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                        {g.denominacionPrincipal}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatBankMoney(g.saldoCuenta00, g.moneda)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatBankMoney(g.saldoCuenta01, g.moneda)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700">
                      {formatBankMoney(g.saldoCuenta02, g.moneda)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-[#132B63]">
                      {formatBankMoney(g.saldoLibrosTotal, g.moneda)}
                    </td>
                    <td className="py-2.5 px-3 text-[11px] font-semibold">
                      {g.willAutoCreateAccount ? (
                        <span className="text-blue-700">
                          Crear {g.willAutoCreateSociety ? 'Sociedad y Cuenta' : 'Cuenta nueva'}
                        </span>
                      ) : (
                        <span className="text-emerald-700">Actualizar saldos</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================== PREVIEW 2: PARTIDAS ABIERTAS FBL3N ==================== */}
      {activeMode === 'fbl3n' && fbl3nPreview && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">
                Vista Previa Partidas Abiertas FBL3N · {fbl3nPreview.items.length} partida(s)
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Clasificadas automáticamente por Clase de Documento (CB vs otras) y signo del
                importe.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex bg-slate-200/70 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setImportMergeMode('replace')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    importMergeMode === 'replace'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Reemplazar periodo
                </button>
                <button
                  type="button"
                  onClick={() => setImportMergeMode('append')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    importMergeMode === 'append'
                      ? 'bg-white text-[#132B63] shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Acumular
                </button>
              </div>
              <button
                type="button"
                onClick={clearPreviews}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={fbl3nPreview.items.length === 0}
                onClick={() => onApplySapFbl3nImport(fbl3nPreview, importMergeMode)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aplicar Partidas ({fbl3nPreview.items.length})</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[420px]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Soc. / Cuenta Mayor</th>
                  <th className="py-2.5 px-3 font-mono">Clase / Doc</th>
                  <th className="py-2.5 px-3 font-mono">Fecha</th>
                  <th className="py-2.5 px-3">Texto y Tercero (Ref. 3)</th>
                  <th className="py-2.5 px-3 text-right">Importe ML</th>
                  <th className="py-2.5 px-3">Sección Auto Entregable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fbl3nPreview.items.slice(0, 120).map((item) => (
                  <tr key={item.rowIndex} className="hover:bg-slate-50/70">
                    <td className="py-2 px-3">
                      <div className="font-mono font-semibold text-slate-900">
                        {item.sociedadCodigo} · {item.cuentaMayor} ({item.subcuentaTipo})
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {item.matchedAccountLabel || 'Se creará cuenta automáticamente'}
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono">
                      <span className="font-bold text-[#132B63]">{item.claseDocumento}</span> ·{' '}
                      {item.numeroDocumento}
                      <div className="text-[10px] font-sans text-slate-400">
                        {getSapDocumentClassLabel(item.claseDocumento)}
                      </div>
                    </td>
                    <td className="py-2 px-3 font-mono text-slate-600">
                      {formatSheetDate(item.fechaDocumento)}
                    </td>
                    <td className="py-2 px-3">
                      <div className="font-medium text-slate-800">{item.texto}</div>
                      {item.claveRef3 && (
                        <div className="text-[11px] text-slate-500">{item.claveRef3}</div>
                      )}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-mono tabular-nums font-bold ${
                        item.importeMonedaLocal < 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatBankMoney(item.importeMonedaLocal, item.monedaLocal, true)}
                    </td>
                    <td className="py-2 px-3 font-medium text-slate-800">
                      {RECONCILING_SECTION_META[item.seccionAuto].signLabel} ·{' '}
                      {RECONCILING_SECTION_META[item.seccionAuto].title}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ==================== PREVIEW 3: CATALOGO SOCIEDADES Y CUENTAS ==================== */}
      {activeMode === 'catalogo' && catalogPreview && (
        <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900">
                Vista Previa Catálogo · {catalogPreview.societies.length} sociedad(es) y{' '}
                {catalogPreview.accounts.length} cuenta(s) bancaria(s)
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Las sociedades y cuentas existentes se actualizan conservando sus saldos históricos.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearPreviews}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={
                  catalogPreview.societies.length === 0 && catalogPreview.accounts.length === 0
                }
                onClick={() => onApplySapCatalogImport(catalogPreview)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-xl transition-colors cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Aplicar Catálogo</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[380px]">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Sociedad</th>
                  <th className="py-2.5 px-3">Banco</th>
                  <th className="py-2.5 px-3 font-mono">No. Cuenta / Moneda</th>
                  <th className="py-2.5 px-3 font-mono">Cta 00 / 01 / 02</th>
                  <th className="py-2.5 px-3">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalogPreview.accounts.map((acc, i) => (
                  <tr key={`${acc.codigoSociedad}-${acc.numeroCuenta}-${i}`}>
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      {acc.codigoSociedad} · {acc.sociedadNombre}
                    </td>
                    <td className="py-2 px-3 text-slate-800">{acc.banco}</td>
                    <td className="py-2 px-3 font-mono text-slate-700">
                      {acc.numeroCuenta} · {acc.moneda}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-600">
                      {acc.cuentaMayor00 || '-'} / {acc.cuentaMayor01 || '-'} /{' '}
                      {acc.cuentaMayor02 || '-'}
                    </td>
                    <td className="py-2 px-3 text-[11px] font-semibold">
                      {acc.matchedAccountId ? (
                        <span className="text-emerald-700">Actualizar</span>
                      ) : (
                        <span className="text-blue-700">Nueva cuenta</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
