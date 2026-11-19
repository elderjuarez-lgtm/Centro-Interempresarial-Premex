import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  ArrowRight,
  Info,
  Plus,
  Building2,
  Lock
} from 'lucide-react';
import { Movement, MovementType, ClosedMonthRecord, EntityMapping } from '../../types';
import { parseExcelFile, downloadExcelTemplate, normalizeNit } from '../../utils/excel';
import { formatCurrency } from '../../utils/reconciliation';

interface CargaArchivosViewProps {
  onImportMovements: (movements: Movement[], mode: 'replace' | 'append') => void;
  currentMovementsCount: number;
  selectedMonth?: string;
  registeredEntities: string[];
  entityMappings?: EntityMapping[];
  onAddMissingEntities: (names: string[]) => void;
  onGoToEmpresas: () => void;
  closedMonths?: Record<string, ClosedMonthRecord>;
  readOnly?: boolean;
}

export const CargaArchivosView: React.FC<CargaArchivosViewProps> = ({
  onImportMovements,
  currentMovementsCount,
  selectedMonth = 'Septiembre 2026',
  registeredEntities,
  entityMappings = [],
  onAddMissingEntities,
  onGoToEmpresas,
  closedMonths = {},
  readOnly = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    movements: Movement[];
    sheetsFound: string[];
    monthsFound: string[];
    warnings: string[];
    errors: string[];
    cxcCount: number;
    cxpCount: number;
    resolvedByNitCount: number;
    unmatchedNits: string[];
  } | null>(null);
  const [importMode, setImportMode] = useState<'replace' | 'append'>('replace');

  const getSuggestedOpenMonth = (currentSelected: string, closed: Record<string, ClosedMonthRecord>): string => {
    if (currentSelected && currentSelected !== 'ALL' && !closed[currentSelected]) {
      return currentSelected;
    }
    const now = new Date();
    const formatted = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(now);
    const cleaned = formatted.replace(' de ', ' ').trim();
    const capitalized = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return capitalized;
  };

  // Manual entry modal/drawer
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSociedad, setManualSociedad] = useState('');
  const [manualContraparte, setManualContraparte] = useState('');
  const [manualFactura, setManualFactura] = useState('');
  const [manualFecha, setManualFecha] = useState(new Date().toISOString().split('T')[0]);
  const [manualMes, setManualMes] = useState(() =>
    getSuggestedOpenMonth(selectedMonth, closedMonths)
  );
  const [manualValor, setManualValor] = useState('');
  const [manualTipo, setManualTipo] = useState<MovementType>('CXC');
  const [manualNotas, setManualNotas] = useState('');
  const [autoAddManualMissing, setAutoAddManualMissing] = useState(true);
  const [manualSuccessMsg, setManualSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!showManualModal) {
      setManualMes(getSuggestedOpenMonth(selectedMonth, closedMonths));
    }
  }, [selectedMonth, closedMonths, showManualModal]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Normalized lookup for registered Empresas a Conciliar (names & NITs)
  const registeredSet = useMemo(
    () => new Set(registeredEntities.map((name) => name.trim().toLowerCase())),
    [registeredEntities]
  );

  const nitToOfficialName = useMemo(() => {
    const map = new Map<string, string>();
    entityMappings.forEach((ent) => {
      if (!ent.nit || !ent.nombreOficial) return;
      const exact = normalizeNit(ent.nit);
      if (exact) {
        map.set(exact, ent.nombreOficial.trim());
        const noZeros = exact.replace(/^0+/, '');
        if (noZeros && !map.has(noZeros)) map.set(noZeros, ent.nombreOficial.trim());
      }
    });
    return map;
  }, [entityMappings]);

  const resolveManualNameOrNit = (raw: string): string => {
    const clean = raw.trim();
    if (!clean) return '';
    const normNit = normalizeNit(clean);
    if (normNit) {
      const hit = nitToOfficialName.get(normNit) || nitToOfficialName.get(normNit.replace(/^0+/, ''));
      if (hit) return hit;
    }
    return clean;
  };

  // Detect any companies in the parsed Excel file that do not exist in Empresas a Conciliar
  const missingEntities = useMemo(() => {
    if (!parsedData || parsedData.movements.length === 0) return [];
    const missingMap = new Map<string, string>();
    parsedData.movements.forEach((m) => {
      [m.sociedad, m.contraparte].forEach((raw) => {
        const clean = raw.trim();
        if (!clean) return;
        const norm = clean.toLowerCase();
        if (!registeredSet.has(norm) && !missingMap.has(norm)) {
          missingMap.set(norm, clean);
        }
      });
    });
    return Array.from(missingMap.values());
  }, [parsedData, registeredSet]);

  // Detect missing companies in the manual movement modal inputs
  const manualMissingEntities = useMemo(() => {
    const missing: string[] = [];
    const seen = new Set<string>();
    [manualSociedad, manualContraparte].forEach((raw) => {
      const clean = resolveManualNameOrNit(raw);
      if (!clean) return;
      const norm = clean.toLowerCase();
      if (!registeredSet.has(norm) && !seen.has(norm)) {
        seen.add(norm);
        missing.push(clean);
      }
    });
    return missing;
  }, [manualSociedad, manualContraparte, registeredSet, nitToOfficialName]);

  const closedMonthsInFile = useMemo(() => {
    if (!parsedData) return [];
    const found = new Set<string>();
    parsedData.movements.forEach((m) => {
      const mes = m.mes || 'Septiembre 2026';
      if (closedMonths[mes]) found.add(mes);
    });
    return Array.from(found);
  }, [parsedData, closedMonths]);

  const openMovementsInFile = useMemo(() => {
    if (!parsedData) return [];
    return parsedData.movements.filter((m) => !closedMonths[m.mes || 'Septiembre 2026']);
  }, [parsedData, closedMonths]);

  const blockedClosedRowsCount = parsedData
    ? parsedData.movements.length - openMovementsInFile.length
    : 0;

  const isManualMonthClosed = Boolean(closedMonths[manualMes.trim()]);
  const hasAnyClosedMonths = Object.keys(closedMonths).length > 0;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setSelectedFileName(file.name);
    setIsProcessing(true);
    setParsedData(null);
    setManualSuccessMsg(null);

    try {
      const result = await parseExcelFile(file, entityMappings);
      setParsedData(result);
    } catch (err: any) {
      setParsedData({
        movements: [],
        sheetsFound: [],
        monthsFound: [],
        warnings: [],
        errors: [err?.message || 'Error al procesar el archivo Excel'],
        cxcCount: 0,
        cxpCount: 0,
        resolvedByNitCount: 0,
        unmatchedNits: [],
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmImport = () => {
    if (openMovementsInFile.length === 0) return;
    onImportMovements(openMovementsInFile, importMode);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualSociedad.trim() || !manualContraparte.trim() || !manualValor) return;
    if (isManualMonthClosed) return;

    const val = parseFloat(manualValor);
    if (isNaN(val) || val <= 0) return;

    const resolvedSociedad = resolveManualNameOrNit(manualSociedad);
    const resolvedContraparte = resolveManualNameOrNit(manualContraparte);

    if (manualMissingEntities.length > 0 && autoAddManualMissing) {
      onAddMissingEntities(manualMissingEntities);
    }

    const newMov: Movement = {
      id: `manual-${Date.now()}`,
      sociedad: resolvedSociedad,
      contraparte: resolvedContraparte,
      factura: manualFactura.trim() || `MAN-${Date.now().toString().slice(-4)}`,
      fecha_factura: manualFecha,
      valor: Math.round((val + Number.EPSILON) * 100) / 100,
      tipo: manualTipo,
      mes: manualMes.trim() || 'Septiembre 2026',
      notas: manualNotas.trim() || undefined,
    };

    onImportMovements([newMov], 'append');
    setShowManualModal(false);
    // Reset manual form
    setManualSociedad('');
    setManualContraparte('');
    setManualFactura('');
    setManualValor('');
    setManualNotas('');
    setManualSuccessMsg('Movimiento manual registrado exitosamente.');
  };

  const totalParsedValue = parsedData?.movements.reduce((sum, m) => sum + m.valor, 0) || 0;

  if (readOnly) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center max-w-2xl mx-auto">
        <Lock className="w-9 h-9 text-amber-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-900">
          Carga de archivos restringida (Solo Consulta)
        </h3>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          Tu perfil tiene permisos de Solo Consulta. La importación de libros Excel y el registro
          manual de movimientos están habilitados para Operadores y Administradores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            Carga de Archivo Excel Multilibro
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => downloadExcelTemplate(entityMappings)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Plantilla Oficial</span>
          </button>

          <button
            onClick={() => setShowManualModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-blue-600" />
            <span>Agregar Manual</span>
          </button>
        </div>
      </div>

      {/* Closed months protection info banner */}
      {hasAnyClosedMonths && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2.5">
          <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>
            <strong>Meses cerrados protegidos ({Object.keys(closedMonths).join(', ')}):</strong>{' '}
            el historial cerrado no se sobrescribe.
          </span>
        </div>
      )}

      {/* Specifications Card */}
      <div className="p-4 rounded-xl bg-blue-50/60 border border-blue-200/70 text-xs text-blue-900 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            <span>Hojas requeridas</span>
          </div>
          <p className="text-blue-800">
            <strong>Cuentas por cobrar</strong> y <strong>Cuentas por pagar</strong>.
          </p>
        </div>
        <div className="space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600" />
            <span>Columnas admitidas</span>
          </div>
          <p className="text-blue-800 leading-relaxed">
            <code className="bg-indigo-100 text-indigo-900 font-bold px-1 py-0.5 rounded font-mono text-[11px]">nit_sociedad</code>,{' '}
            <code className="bg-indigo-100 text-indigo-900 font-bold px-1 py-0.5 rounded font-mono text-[11px]">nit_contraparte</code>{' '}
            (o <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[11px]">sociedad</code> /{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[11px]">contraparte</code>),{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[11px]">fecha_factura</code>,{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[11px]">factura</code>,{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[11px]">valor</code>,{' '}
            <code className="bg-blue-100 px-1 py-0.5 rounded font-mono text-[11px]">tipo</code> y{' '}
            <code className="bg-emerald-100 text-emerald-900 font-bold px-1 py-0.5 rounded font-mono text-[11px]">mes a conciliar</code>.
          </p>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-blue-600 bg-blue-50 scale-[1.01]'
            : 'border-slate-300 hover:border-blue-400 bg-white hover:bg-slate-50/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4 shadow-xs">
          <UploadCloud className="w-8 h-8" />
        </div>

        <h4 className="text-base font-bold text-slate-800">
          Arrastra tu archivo Excel aquí o haz clic para seleccionarlo
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          Formatos compatibles: .xlsx, .xls
        </p>

        {selectedFileName && (
          <div className="inline-flex items-center gap-2 mt-4 px-3.5 py-1.5 rounded-full bg-blue-100 text-blue-800 font-medium text-xs">
            <FileSpreadsheet className="w-4 h-4" />
            <span>Archivo seleccionado: {selectedFileName}</span>
          </div>
        )}
      </div>

      {/* Processing Loader */}
      {isProcessing && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800">Leyendo y validando hojas de cálculo...</p>
        </div>
      )}

      {/* Parsed Data Preview & Confirmation */}
      {parsedData && !isProcessing && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Resultados de Lectura del Archivo</span>
              </h4>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
                <span className="text-slate-500">
                  Hojas: <strong>{parsedData.sheetsFound.join(', ') || 'Ninguna'}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Meses: {parsedData.monthsFound.join(', ') || 'Septiembre 2026'}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'replace'}
                  onChange={() => setImportMode('replace')}
                />
                <span>
                  {hasAnyClosedMonths
                    ? 'Reemplazar meses abiertos (conserva cerrados)'
                    : `Reemplazar datos actuales (${currentMovementsCount})`}
                </span>
              </label>

              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input
                  type="radio"
                  name="importMode"
                  checked={importMode === 'append'}
                  onChange={() => setImportMode('append')}
                />
                <span>Anexar</span>
              </label>
            </div>
          </div>

          {/* ALERTA DE MESES CERRADOS */}
          {closedMonthsInFile.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
              <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-bold text-sm text-amber-950">
                  Mes(es) cerrado(s) protegido(s): {closedMonthsInFile.join(', ')}
                </div>
                <p className="text-amber-900">
                  Se detectaron <strong>{blockedClosedRowsCount}</strong> partida(s) pertenecientes a meses ya cerrados. Por seguridad histórica no se sobrescribirán ni importarán.
                  {openMovementsInFile.length > 0
                    ? ` Solo se aplicarán los ${openMovementsInFile.length} movimiento(s) de meses abiertos.`
                    : ' No hay movimientos de meses abiertos para importar en este archivo.'}
                </p>
              </div>
            </div>
          )}

          {/* Quick Metrics of Parsed File */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <span className="text-slate-500">Partidas CXC:</span>
              <div className="text-base font-bold font-mono text-blue-900 mt-0.5">
                {parsedData.cxcCount}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
              <span className="text-slate-500">Partidas CXP:</span>
              <div className="text-base font-bold font-mono text-indigo-900 mt-0.5">
                {parsedData.cxpCount}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-slate-500">Total Movimientos:</span>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {parsedData.movements.length}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-slate-500">Valor Acumulado:</span>
              <div className="text-base font-bold font-mono text-emerald-900 mt-0.5">
                {formatCurrency(totalParsedValue)}
              </div>
            </div>
          </div>

          {/* NIT recognition feedback & unmatched NIT warning */}
          {parsedData.resolvedByNitCount > 0 && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>Reconocimiento por NIT:</strong>{' '}
                <strong>{parsedData.resolvedByNitCount}</strong> referencia(s) asociadas al catálogo oficial.
              </span>
            </div>
          )}

          {parsedData.unmatchedNits.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">
                  NIT(s) sin coincidencia exacta en "Empresas a Conciliar":
                </div>
                <p className="text-amber-900 mt-0.5">
                  No se encontró el NIT{' '}
                  <span className="font-mono font-bold">
                    {parsedData.unmatchedNits.join(', ')}
                  </span>{' '}
                  en el catálogo actual. Verifica el campo NIT en "Empresas a Conciliar" o agrégalo antes de conciliar.
                </p>
              </div>
            </div>
          )}

          {/* ALERTA DE EMPRESAS NO EXISTENTES */}
          {parsedData.movements.length > 0 && missingEntities.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-950 text-xs space-y-3 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-bold text-sm text-rose-900">
                      Alerta: {missingEntities.length} empresa(s) o NIT(s) no existen en "Empresas a Conciliar"
                    </div>
                    <p className="text-rose-800 mt-0.5">
                      Las siguientes empresas o NITs del archivo no están registradas en la matriz. Agrégalas ahora o configura su NIT para que sus saldos aparezcan en la conciliación:
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAddMissingEntities(missingEntities)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar todas ({missingEntities.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={onGoToEmpresas}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-rose-100 text-rose-900 border border-rose-300 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Ir a Empresas</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {missingEntities.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onAddMissingEntities([name])}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white border border-rose-300 hover:border-rose-500 hover:bg-rose-100/70 text-rose-950 font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-rose-600" />
                    <span>{name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {parsedData.movements.length > 0 && missingEntities.length === 0 && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Empresas validadas:</strong> Todas las sociedades y contrapartes del archivo existen en "Empresas a Conciliar".
              </span>
            </div>
          )}

          {manualSuccessMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{manualSuccessMsg}</span>
            </div>
          )}

          {/* Errors or Warnings */}
          {parsedData.errors.length > 0 && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Errores encontrados:</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {parsedData.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {parsedData.warnings.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1">
                <Info className="w-4 h-4 text-amber-600" />
                <span>Advertencias ({parsedData.warnings.length}):</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5">
                {parsedData.warnings.slice(0, 3).map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Row Preview Table (First 5 rows) */}
          {parsedData.movements.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-700 mb-2">
                Vista previa de los primeros movimientos:
              </div>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Mes</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Sociedad</th>
                      <th className="px-3 py-2">Contraparte</th>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Factura</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                    {parsedData.movements.slice(0, 5).map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-sans font-semibold text-emerald-800 bg-emerald-50/50">
                          {m.mes || '—'}
                        </td>
                        <td className="px-3 py-2 font-bold font-sans">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              m.tipo === 'CXC'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {m.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-sans font-medium text-slate-800">{m.sociedad}</td>
                        <td className="px-3 py-2 font-sans text-slate-600">{m.contraparte}</td>
                        <td className="px-3 py-2 text-slate-500">{m.fecha_factura}</td>
                        <td className="px-3 py-2 text-slate-700 font-semibold">{m.factura}</td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {formatCurrency(m.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Confirm Button */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setParsedData(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Descartar
            </button>
            <button
              disabled={openMovementsInFile.length === 0}
              onClick={handleConfirmImport}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>
                {openMovementsInFile.length === 0
                  ? 'Sin movimientos abiertos para aplicar'
                  : `Aplicar y Conciliar ${openMovementsInFile.length} Movimientos`}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <form onSubmit={handleManualSubmit}>
              <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
                <h4 className="font-bold text-sm">Nuevo Movimiento Manual</h4>
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tipo de Movimiento
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="manualTipo"
                        checked={manualTipo === 'CXC'}
                        onChange={() => setManualTipo('CXC')}
                      />
                      <span className="font-semibold text-blue-700">CXC (Cuentas por cobrar)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="manualTipo"
                        checked={manualTipo === 'CXP'}
                        onChange={() => setManualTipo('CXP')}
                      />
                      <span className="font-semibold text-indigo-700">CXP (Cuentas por pagar)</span>
                    </label>
                  </div>
                </div>

                <datalist id="empresas-conciliar-list">
                  {entityMappings.length > 0
                    ? entityMappings.map((ent) => (
                        <option key={ent.id} value={ent.nombreOficial}>
                          {ent.nit ? `${ent.nombreOficial} (NIT: ${ent.nit})` : ent.nombreOficial}
                        </option>
                      ))
                    : registeredEntities.map((name) => (
                        <option key={name} value={name} />
                      ))}
                </datalist>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Sociedad Emisora / Titular (Nombre o NIT)
                  </label>
                  <input
                    type="text"
                    required
                    list="empresas-conciliar-list"
                    value={manualSociedad}
                    onChange={(e) => setManualSociedad(e.target.value)}
                    placeholder="Ej. Premex o 900123456-1"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Contraparte (Nombre o NIT)
                  </label>
                  <input
                    type="text"
                    required
                    list="empresas-conciliar-list"
                    value={manualContraparte}
                    onChange={(e) => setManualContraparte(e.target.value)}
                    placeholder="Ej. Pralsa Guatemala o 800654321-2"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                {manualMissingEntities.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-[11px] space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Empresa no registrada en la matriz: {manualMissingEntities.join(', ')}
                      </span>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-amber-900">
                      <input
                        type="checkbox"
                        checked={autoAddManualMissing}
                        onChange={(e) => setAutoAddManualMissing(e.target.checked)}
                      />
                      <span>Agregar automáticamente a "Empresas a Conciliar" al guardar</span>
                    </label>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Factura / Documento
                    </label>
                    <input
                      type="text"
                      required
                      value={manualFactura}
                      onChange={(e) => setManualFactura(e.target.value)}
                      placeholder="FAC-9901"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Fecha de Factura
                    </label>
                    <input
                      type="date"
                      required
                      value={manualFecha}
                      onChange={(e) => setManualFecha(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Mes a Conciliar
                    </label>
                    <input
                      type="text"
                      required
                      value={manualMes}
                      onChange={(e) => setManualMes(e.target.value)}
                      placeholder="Septiembre 2026"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Valor / Importe (USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={manualValor}
                      onChange={(e) => setManualValor(e.target.value)}
                      placeholder="150000.00"
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Notas o Referencia
                  </label>
                  <input
                    type="text"
                    value={manualNotas}
                    onChange={(e) => setManualNotas(e.target.value)}
                    placeholder="Ej. Servicios compartidos"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                {isManualMonthClosed && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2">
                    <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <span>
                      El mes <strong>{manualMes.trim()}</strong> ya está cerrado y bloqueado. Selecciona o escribe un mes abierto para registrar esta partida.
                    </span>
                  </div>
                )}
              </div>

              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isManualMonthClosed}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"
                >
                  Guardar Movimiento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
