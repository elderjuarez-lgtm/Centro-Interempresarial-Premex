import React from 'react';
import { 
  Building2, 
  Receipt, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  ArrowRight, 
  UploadCloud, 
  Grid3X3, 
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  Save
} from 'lucide-react';
import { Movement, DifferenceRow, ActiveTab, MatrixResult, ReconciliationScope } from '../../types';
import { getIntercompanyScopeLabel } from '../../utils/demoData';
import { formatCurrency } from '../../utils/reconciliation';

interface InicioViewProps {
  movements: Movement[];
  differences: DifferenceRow[];
  matrizCxc: MatrixResult;
  matrizCxp: MatrixResult;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenGoogleSheets: () => void;
  onOpenSaveModal?: () => void;
  activeScope?: ReconciliationScope;
  readOnly?: boolean;
}

export const InicioView: React.FC<InicioViewProps> = ({
  movements,
  differences,
  matrizCxc,
  matrizCxp,
  setActiveTab,
  onOpenGoogleSheets,
  onOpenSaveModal,
  activeScope = 'internacionales',
  readOnly = false,
}) => {
  const totalCxc = matrizCxc.grandTotal;
  const totalCxp = matrizCxp.grandTotal;
  const netDifference = Math.round((totalCxc - totalCxp + Number.EPSILON) * 100) / 100;

  const reconciledPairs = differences.filter((d) => d.estado === 'conciliado');
  const discrepantPairs = differences.filter((d) => d.estado !== 'conciliado');
  const matchPercentage = differences.length > 0 
    ? Math.round((reconciledPairs.length / differences.length) * 100) 
    : 100;

  const topDifferences = [...discrepantPairs].sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia)).slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Welcome & System Status Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0a2540] via-[#0f3460] to-[#1a365d] p-6 sm:p-8 text-white shadow-lg border border-blue-900/50">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold mb-3">
            <span className="w-2 h-2 rounded-full animate-pulse bg-blue-300"></span>
            Centro de Conciliación — {getIntercompanyScopeLabel(activeScope)}
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
            Gestión y Conciliación Bilateral de Saldos
          </h1>
          <p className="mt-2 text-sm sm:text-base text-blue-100/80 leading-relaxed">
            Consolide movimientos de cuentas por cobrar y pagar entre entidades del grupo, identifique discrepancias y exporte matrices sincronizadas directamente a Google Sheets.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {!readOnly && (
              <button
                onClick={() => setActiveTab('carga')}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer"
              >
                <UploadCloud className="w-4 h-4" />
                <span>Cargar Archivo Excel</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('diferencias')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs sm:text-sm font-semibold rounded-xl backdrop-blur-xs border border-white/20 transition-all cursor-pointer"
            >
              <AlertTriangle className="w-4 h-4 text-amber-300" />
              <span>Ver {discrepantPairs.length} Diferencias</span>
            </button>

            {!readOnly && onOpenSaveModal && (
              <button
                onClick={onOpenSaveModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Conciliación</span>
              </button>
            )}

            {!readOnly && (
              <button
                onClick={onOpenGoogleSheets}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-md transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exportar a Google Sheets</span>
              </button>
            )}
          </div>
        </div>

        {/* Decorative background grid */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-10 pointer-events-none hidden lg:block">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <pattern id="grid-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100" height="100" fill="url(#grid-pattern)" />
          </svg>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total CXC */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Cuentas por Cobrar (CxC)
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold font-mono text-slate-900">
            {formatCurrency(totalCxc)}
          </div>
          <div className="mt-2 flex items-center text-xs text-slate-500 gap-1.5">
            <span className="font-semibold text-blue-600">{matrizCxc.societies.length}</span>
            <span>sociedades emisoras registradas</span>
          </div>
        </div>

        {/* Total CXP */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Cuentas por Pagar (CxP)
            </span>
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold font-mono text-slate-900">
            {formatCurrency(totalCxp)}
          </div>
          <div className="mt-2 flex items-center text-xs text-slate-500 gap-1.5">
            <span className="font-semibold text-indigo-600">{matrizCxp.societies.length}</span>
            <span>sociedades receptoras registradas</span>
          </div>
        </div>

        {/* Net Difference */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Diferencia Neta Global
            </span>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              netDifference === 0 
                ? 'bg-emerald-50 text-emerald-600' 
                : 'bg-amber-50 text-amber-600'
            }`}>
              <Scale className="w-5 h-5" />
            </div>
          </div>
          <div className={`mt-3 text-2xl font-bold font-mono ${
            netDifference === 0 ? 'text-emerald-600' : 'text-amber-600'
          }`}>
            {formatCurrency(netDifference)}
          </div>
          <div className="mt-2 text-xs text-slate-500">
            {netDifference === 0 
              ? 'Balance perfecto entre carteras' 
              : `Disparidad neta de ${formatCurrency(Math.abs(netDifference))}`}
          </div>
        </div>

        {/* Reconciled percentage */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Efectividad de Conciliación
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold font-mono text-slate-900">
            {matchPercentage}%
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${matchPercentage}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {reconciledPairs.length}/{differences.length} pares
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Split: Differences Requiring Attention & Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Differences attention list */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Discrepancias Principales a Conciliar
              </h3>
              <p className="text-xs text-slate-500">
                Pares intercompany con diferencia mayor calculada como (CxC - CxP de la contraparte)
              </p>
            </div>
            <button
              onClick={() => setActiveTab('diferencias')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <span>Ver todas ({differences.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {topDifferences.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-slate-800">¡Conciliación completa al 100%!</p>
              <p className="text-xs text-slate-500">No existen discrepancias entre cuentas por cobrar y por pagar.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topDifferences.map((diff) => (
                <div key={diff.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 p-2 rounded-xl transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-800 truncate">
                        {diff.sociedad}
                      </span>
                      <span className="text-xs text-slate-400">↔</span>
                      <span className="font-semibold text-sm text-slate-600 truncate">
                        {diff.contraparte}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span>CxC: <strong className="font-mono text-slate-700">{formatCurrency(diff.cxc)}</strong></span>
                      <span>•</span>
                      <span>CxP Contraparte: <strong className="font-mono text-slate-700">{formatCurrency(diff.cxp)}</strong></span>
                    </div>
                    {diff.comentario && (
                      <p className="text-[11px] text-blue-700 bg-blue-50/80 px-2.5 py-1 rounded-md mt-1.5 line-clamp-1 italic">
                        "{diff.comentario}"
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono text-amber-600">
                      {formatCurrency(diff.diferencia)}
                    </div>
                    <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      Diferencia
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Workflow Steps & Tips */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <h3 className="font-bold text-slate-900 text-base">
            Flujo de Conciliación
          </h3>

          <div className="space-y-3.5 text-xs">
            <div 
              onClick={() => setActiveTab('carga')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/60 cursor-pointer transition-colors flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                1
              </div>
              <div>
                <p className="font-semibold text-slate-800">Cargar Archivo Excel</p>
                <p className="text-slate-500 mt-0.5">Sube el archivo con las pestañas "Cuentas por cobrar" y "Cuentas por pagar".</p>
              </div>
            </div>

            <div 
              onClick={() => setActiveTab('empresas')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/60 cursor-pointer transition-colors flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                2
              </div>
              <div>
                <p className="font-semibold text-slate-800">Empresas a Conciliar</p>
                <p className="text-slate-500 mt-0.5">Define y agrega manualmente las empresas que alimentan y ordenan la matriz.</p>
              </div>
            </div>

            <div 
              onClick={() => setActiveTab('conciliacion')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/60 cursor-pointer transition-colors flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                3
              </div>
              <div>
                <p className="font-semibold text-slate-800">Inspeccionar Matrices</p>
                <p className="text-slate-500 mt-0.5">Examina la matriz de CxC y la matriz de CxP con sus totales cruzados.</p>
              </div>
            </div>

            <div 
              onClick={() => setActiveTab('diferencias')}
              className="p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/60 cursor-pointer transition-colors flex items-start gap-3"
            >
              <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                4
              </div>
              <div>
                <p className="font-semibold text-slate-800">Ajustar Diferencias</p>
                <p className="text-slate-500 mt-0.5">Escribe comentarios y explicaciones en las discrepancias detectadas.</p>
              </div>
            </div>

            {!readOnly && (
              <div
                onClick={onOpenGoogleSheets}
                className="p-3 rounded-xl bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200 cursor-pointer transition-colors flex items-start gap-3"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                  5
                </div>
                <div>
                  <p className="font-semibold text-emerald-900">Guardar en Google Sheets</p>
                  <p className="text-emerald-700 mt-0.5">Sube el reporte final a la nube para los auditores y la gerencia.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
