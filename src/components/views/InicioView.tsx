import React from 'react';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  UploadCloud, 
  FileSpreadsheet,
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
  differences,
  matrizCxc,
  matrizCxp,
  setActiveTab,
  onOpenGoogleSheets,
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
    <div className="space-y-5">
      {/* Executive Summary Header */}
      <section className="bg-white rounded-2xl border border-slate-200 px-5 sm:px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[#1E60A8]">
            Centro de Conciliación · {getIntercompanyScopeLabel(activeScope)}
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 mt-1">
            Gestión y Conciliación Bilateral de Saldos
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Resumen ejecutivo de cuentas por cobrar, cuentas por pagar y discrepancias activas del periodo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('diferencias')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors whitespace-nowrap cursor-pointer"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Ver {discrepantPairs.length} diferencias</span>
          </button>

          {!readOnly && (
            <button
              type="button"
              onClick={() => setActiveTab('carga')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#132B63] hover:bg-[#1E60A8] text-white text-xs font-semibold rounded-xl transition-colors whitespace-nowrap cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Cargar Archivo Excel</span>
            </button>
          )}
        </div>
      </section>

      {/* Single-Elevation 4-Column Metric Strip */}
      <section className="bg-white rounded-2xl border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
        <div className="p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Total CxC</span>
            <ArrowUpRight className="w-4 h-4 text-[#1E60A8]" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(totalCxc)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            <span className="font-semibold text-[#1E60A8]">{matrizCxc.societies.length}</span> sociedades emisoras
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Total CxP</span>
            <ArrowDownRight className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatCurrency(totalCxp)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            <span className="font-semibold text-indigo-600">{matrizCxp.societies.length}</span> sociedades receptoras
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Diferencia Neta Global</span>
            <Scale className={`w-4 h-4 ${netDifference === 0 ? 'text-emerald-600' : 'text-amber-600'}`} />
          </div>
          <div className={`mt-1.5 text-2xl font-bold font-mono tabular-nums ${
            netDifference === 0 ? 'text-emerald-700' : 'text-amber-700'
          }`}>
            {formatCurrency(netDifference)}
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {netDifference === 0
              ? 'Balance cuadrado entre carteras'
              : `Disparidad neta de ${formatCurrency(Math.abs(netDifference))}`}
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span>Efectividad de Cuadre</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {matchPercentage}%
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${matchPercentage}%` }}
              />
            </div>
            <span className="text-xs text-slate-500 font-medium tabular-nums">
              {reconciledPairs.length}/{differences.length}
            </span>
          </div>
        </div>
      </section>

      {/* Main Content Split: Differences Requiring Attention & Workflow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column (2 spans): Differences attention list */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base">
              Discrepancias Principales a Conciliar
            </h3>
            <button
              type="button"
              onClick={() => setActiveTab('diferencias')}
              className="text-xs font-semibold text-[#1E60A8] hover:text-[#132B63] flex items-center gap-1 cursor-pointer"
            >
              <span>Ver todas ({differences.length})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {topDifferences.length === 0 ? (
            <div className="py-10 text-center text-slate-500">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <p className="font-semibold text-sm text-slate-800">Conciliación completa al 100%</p>
              <p className="text-xs text-slate-500 mt-0.5">No existen discrepancias entre cuentas por cobrar y por pagar.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {topDifferences.map((diff) => (
                <div key={diff.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-slate-50/70 px-2 rounded-xl transition-colors">
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
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 tabular-nums">
                      <span>CxC: <strong className="font-mono text-slate-700">{formatCurrency(diff.cxc)}</strong></span>
                      <span className="text-slate-300">·</span>
                      <span>CxP Contraparte: <strong className="font-mono text-slate-700">{formatCurrency(diff.cxp)}</strong></span>
                    </div>
                    {diff.comentario && (
                      <p className="text-[11px] text-[#1E60A8] mt-1 line-clamp-1">
                        {diff.comentario}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold font-mono tabular-nums text-amber-700">
                      {formatCurrency(diff.diferencia)}
                    </div>
                    <div className="text-[11px] font-medium text-amber-700">
                      Diferencia
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Workflow Steps */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <h3 className="font-bold text-slate-900 text-sm sm:text-base pb-3 border-b border-slate-100 mb-3">
            Flujo de Trabajo
          </h3>

          <div className="divide-y divide-slate-100 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('carga')}
              className="w-full py-2.5 px-2 text-left hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex items-start gap-3"
            >
              <span className="w-5 h-5 rounded-md bg-slate-100 text-[#132B63] flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                1
              </span>
              <div>
                <p className="font-semibold text-slate-800">Cargar Archivo Excel</p>
                <p className="text-slate-500 mt-0.5">Importar hojas de CxC y CxP.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('empresas')}
              className="w-full py-2.5 px-2 text-left hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex items-start gap-3"
            >
              <span className="w-5 h-5 rounded-md bg-slate-100 text-[#132B63] flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                2
              </span>
              <div>
                <p className="font-semibold text-slate-800">Empresas a Conciliar</p>
                <p className="text-slate-500 mt-0.5">Catálogo y orden de sociedades.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('conciliacion')}
              className="w-full py-2.5 px-2 text-left hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex items-start gap-3"
            >
              <span className="w-5 h-5 rounded-md bg-slate-100 text-[#132B63] flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                3
              </span>
              <div>
                <p className="font-semibold text-slate-800">Inspeccionar Matrices</p>
                <p className="text-slate-500 mt-0.5">Matrices bilaterales de CxC y CxP.</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('diferencias')}
              className="w-full py-2.5 px-2 text-left hover:bg-slate-50 rounded-lg cursor-pointer transition-colors flex items-start gap-3"
            >
              <span className="w-5 h-5 rounded-md bg-slate-100 text-[#132B63] flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                4
              </span>
              <div>
                <p className="font-semibold text-slate-800">Ajustar Diferencias</p>
                <p className="text-slate-500 mt-0.5">Revisión y notas de discrepancias.</p>
              </div>
            </button>

            {!readOnly && (
              <button
                type="button"
                onClick={onOpenGoogleSheets}
                className="w-full py-2.5 px-2 text-left hover:bg-emerald-50/60 rounded-lg cursor-pointer transition-colors flex items-start gap-3"
              >
                <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
                  5
                </span>
                <div className="flex items-center gap-1.5">
                  <div>
                    <p className="font-semibold text-emerald-900">Exportar a Google Sheets</p>
                    <p className="text-emerald-700 mt-0.5">Enviar reporte consolidado a Drive.</p>
                  </div>
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                </div>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
