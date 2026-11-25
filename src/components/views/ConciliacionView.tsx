import React, { useState, useMemo } from 'react';
import { 
  FileSpreadsheet, 
  Download, 
  X,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  Lock,
  FileSearch
} from 'lucide-react';
import { MatrixResult, Movement, DifferenceRow, SymmetricMatrixResult, SymmetricMatrixCell, ClosedMonthRecord, MovimientosNavigationPreset, ReconciliationScope } from '../../types';
import { formatCurrency, formatNumber, reconcileByDocument } from '../../utils/reconciliation';
import { exportReconciliationToExcelFile } from '../../utils/excel';
import { INTERCOMPANY_SCOPE_META, getIntercompanyScopeLabel } from '../../utils/demoData';

interface ConciliacionViewProps {
  matrizCxc: MatrixResult;
  matrizCxp: MatrixResult;
  symmetricMatrix: SymmetricMatrixResult;
  differences: DifferenceRow[];
  movements: Movement[];
  onOpenGoogleSheets: () => void;
  onOpenSaveModal?: () => void;
  onOpenCloseMonthModal?: () => void;
  onInspectDocuments?: (preset: MovimientosNavigationPreset) => void;
  selectedMonth?: string;
  setSelectedMonth?: (m: string) => void;
  availableMonths?: string[];
  closedMonths?: Record<string, ClosedMonthRecord>;
  activeScope?: ReconciliationScope;
  readOnly?: boolean;
}

export const ConciliacionView: React.FC<ConciliacionViewProps> = ({
  matrizCxc,
  matrizCxp,
  symmetricMatrix,
  differences,
  movements,
  onOpenGoogleSheets,
  onOpenSaveModal,
  onOpenCloseMonthModal,
  onInspectDocuments,
  selectedMonth = 'Septiembre 2026',
  setSelectedMonth,
  availableMonths = ['Septiembre 2026'],
  closedMonths = {},
  activeScope = 'internacionales',
  readOnly = false,
}) => {
  const scopeLabel = getIntercompanyScopeLabel(activeScope);
  const currencyBannerLabel = INTERCOMPANY_SCOPE_META[activeScope].currencyBannerLabel;
  const isSelectedMonthClosed = selectedMonth !== 'ALL' && Boolean(closedMonths[selectedMonth]);
  const closedInfo = selectedMonth !== 'ALL' ? closedMonths[selectedMonth] : undefined;
  const [selectedSubTab, setSelectedSubTab] = useState<'bilateral' | 'cxc' | 'cxp' | 'ambas'>('bilateral');
  const activeBannerText = selectedMonth === 'ALL'
    ? `CONSOLIDADO HISTÓRICO (${scopeLabel.toUpperCase()}) - ( ${currencyBannerLabel} )`
    : `${selectedMonth.toUpperCase()} (${scopeLabel.toUpperCase()}) - ( ${currencyBannerLabel} )`;
  const docRecon = useMemo(() => reconcileByDocument(movements), [movements]);

  const [drilldownCell, setDrilldownCell] = useState<{
    title: string;
    type: 'CXC' | 'CXP';
    sociedad: string;
    contraparte: string;
    valor: number;
    reciprocalValor: number;
    difference?: number;
    status?: string;
    movimientos: Movement[];
  } | null>(null);

  const drilldownUnreconciled = useMemo(() => {
    if (!drilldownCell) return [];
    const expectedCpType = drilldownCell.type === 'CXC' ? 'CXP' : 'CXC';

    const socMovs = drilldownCell.movimientos.filter(
      (m) => docRecon.movementStatusMap[m.id]?.status !== 'conciliado'
    );
    const cpMovs = movements.filter(
      (m) =>
        m.sociedad === drilldownCell.contraparte &&
        m.contraparte === drilldownCell.sociedad &&
        m.tipo === expectedCpType &&
        docRecon.movementStatusMap[m.id]?.status !== 'conciliado'
    );

    return [
      ...socMovs.map((m) => ({
        movement: m,
        side: 'Sociedad' as const,
        status: docRecon.movementStatusMap[m.id],
      })),
      ...cpMovs.map((m) => ({
        movement: m,
        side: 'Contraparte' as const,
        status: docRecon.movementStatusMap[m.id],
      })),
    ];
  }, [drilldownCell, movements, docRecon.movementStatusMap]);

  const handleDownloadExcel = () => {
    exportReconciliationToExcelFile(
      differences,
      matrizCxc,
      matrizCxp,
      movements,
      symmetricMatrix.entities,
      activeBannerText
    );
  };

  // Render the exact Bilateral Table (CTAS X COBRAR or CTAS X PAGAR)
  const renderBilateralSection = (
    title: 'CTAS X COBRAR' | 'CTAS X PAGAR',
    grid: Record<string, Record<string, SymmetricMatrixCell>>
  ) => {
    return (
      <div className="border border-slate-300 rounded-lg overflow-hidden bg-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse select-none">
            <thead>
              {/* Header Row: Dark Navy Blue Background */}
              <tr className="bg-[#1b365d] text-white font-semibold">
                <th className="px-3 py-2.5 text-left border-r border-blue-900/60 sticky left-0 z-20 bg-[#1b365d] min-w-[170px] uppercase tracking-wide">
                  {title}
                </th>
                {symmetricMatrix.entities.map((ent) => (
                  <th
                    key={ent}
                    className="px-2.5 py-2.5 text-center border-r border-blue-800/40 min-w-[105px] max-w-[130px] truncate font-medium text-[11px]"
                    title={ent}
                  >
                    {ent}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {symmetricMatrix.entities.map((soc) => {
                return (
                  <tr key={soc} className="hover:bg-blue-50/20 transition-colors">
                    {/* Row Header Entity: Sticky Left */}
                    <td
                      className="px-3 py-1.5 font-semibold font-sans text-slate-800 border-r border-slate-200 sticky left-0 z-10 bg-white hover:bg-slate-50 truncate"
                      title={soc}
                    >
                      {soc}
                    </td>

                    {/* Cells */}
                    {symmetricMatrix.entities.map((cp) => {
                      const cell = grid[soc]?.[cp];
                      const isDiagonal = soc === cp;
                      const hasVal = cell && cell.valor > 0;

                      // Shading rules matching screenshot:
                      // - Diagonal: Peach/Yellow (#fef3c7 / #ffedd5)
                      // - Reconciled: Soft Green (#bbf7d0)
                      // - Discrepancy: Soft Yellow (#fef08a)
                      // - Empty: White
                      let cellBg = 'bg-white';
                      let cellText = 'text-slate-800';

                      if (isDiagonal) {
                        cellBg = 'bg-[#fef3c7]'; // Light peach/yellow diagonal
                      } else if (hasVal) {
                        if (cell.status === 'reconciled') {
                          cellBg = 'bg-[#bbf7d0] hover:bg-[#86efac]';
                          cellText = 'text-[#14532d] font-bold';
                        } else {
                          cellBg = 'bg-[#fef08a] hover:bg-[#fde047]';
                          cellText = 'text-[#854d0e] font-bold';
                        }
                      }

                      return (
                        <td
                          key={cp}
                          onClick={() => {
                            if (hasVal) {
                              setDrilldownCell({
                                title: `${title}: ${soc} ➔ ${cp}`,
                                type: title === 'CTAS X COBRAR' ? 'CXC' : 'CXP',
                                sociedad: soc,
                                contraparte: cp,
                                valor: cell.valor,
                                reciprocalValor: cell.reciprocalValor,
                                difference: cell.difference,
                                status: cell.status,
                                movimientos: cell.movimientos,
                              });
                            }
                          }}
                          className={`px-2 py-1.5 text-right border-r border-slate-200 ${cellBg} ${cellText} ${
                            hasVal ? 'cursor-pointer hover:ring-1 hover:ring-blue-500/50' : ''
                          }`}
                        >
                          {hasVal ? formatNumber(cell.valor) : ''}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Unified View Toolbar + Color Legend */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Subtab switcher */}
            <div className="p-1 bg-slate-100 rounded-xl inline-flex items-center gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setSelectedSubTab('bilateral')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  selectedSubTab === 'bilateral'
                    ? 'bg-white text-[#132B63] shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Vista Bilateral Exacta
              </button>
              <button
                type="button"
                onClick={() => setSelectedSubTab('ambas')}
                className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  selectedSubTab === 'ambas'
                    ? 'bg-white text-[#132B63] shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Con Totales
              </button>
            </div>

            <span className="text-xs text-slate-500 tabular-nums">
              <strong className="font-semibold text-slate-800">{symmetricMatrix.entities.length}</strong> empresas ·{' '}
              <strong className="font-semibold text-slate-800">{movements.length}</strong> partidas
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onInspectDocuments &&
              (docRecon.summary.noConciliados > 0 ||
                differences.some((d) => d.estado !== 'conciliado')) && (
                <button
                  type="button"
                  onClick={() =>
                    onInspectDocuments({
                      viewMode: 'documentos',
                      sociedad: 'ALL',
                      contraparte: 'ALL',
                      docStatusFilter: 'NO_CONCILIADOS',
                      directionScope: 'PAIR_BOTH',
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors cursor-pointer"
                >
                  <FileSearch className="w-3.5 h-3.5 text-amber-700" />
                  <span>No conciliados ({docRecon.summary.noConciliados})</span>
                </button>
              )}

            <button
              type="button"
              onClick={handleDownloadExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Descargar Matriz Excel</span>
            </button>

            {isSelectedMonthClosed ? (
              <button
                type="button"
                onClick={onOpenCloseMonthModal}
                title={
                  closedInfo
                    ? `Cerrado en ${scopeLabel} el ${new Date(closedInfo.closedAt).toLocaleString('es-CO')} por ${closedInfo.closedBy}. Clic para consultar el cierre.`
                    : `Mes cerrado en ${scopeLabel}`
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-600" />
                <span>Cerrado ({scopeLabel})</span>
              </button>
            ) : (
              onOpenCloseMonthModal && (
                <button
                  type="button"
                  onClick={onOpenCloseMonthModal}
                  title={`Cerrar conciliación de ${scopeLabel} permanentemente`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-colors cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-700" />
                  <span>Cerrar {scopeLabel}</span>
                </button>
              )
            )}
          </div>
        </div>

        {/* Inline Color Legend Strip */}
        <div className="px-5 py-2 bg-slate-50/70 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold text-slate-700">Referencias:</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs bg-[#bbf7d0] border border-emerald-400" />
              Conciliado
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs bg-[#fef08a] border border-amber-400" />
              Discrepancia (clic para auditar)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-3.5 rounded-xs bg-[#fef3c7] border border-amber-200" />
              Diagonal
            </span>
          </div>
          <span className="font-mono font-semibold text-slate-500">
            {activeBannerText}
          </span>
        </div>
      </section>

      {/* BILATERAL EXACT VIEW */}
      {selectedSubTab === 'bilateral' && (
        <div className="space-y-5">
          {/* Table 1: CTAS X COBRAR */}
          <section>{renderBilateralSection('CTAS X COBRAR', symmetricMatrix.cxcGrid)}</section>

          {/* Table 2: CTAS X PAGAR */}
          <section>{renderBilateralSection('CTAS X PAGAR', symmetricMatrix.cxpGrid)}</section>
        </div>
      )}

      {/* ALTERNATIVE VIEW: Traditional with Totals */}
      {selectedSubTab === 'ambas' && (
        <div className="space-y-6">
          {/* CTAS X COBRAR with totals */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-blue-800 text-white flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-white">Matriz Cuentas por Cobrar (CXC) con Totales</h4>
                <p className="text-xs text-blue-200">Suma total por fila y por columna</p>
              </div>
              <span className="text-xs font-mono font-bold bg-white/20 px-3 py-1 rounded-full">
                Total: {formatCurrency(matrizCxc.grandTotal)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left bg-slate-200/80 sticky left-0 z-10 min-w-[180px]">
                      Sociedad \ Contraparte
                    </th>
                    {matrizCxc.counterparties.map((cp) => (
                      <th key={cp} className="px-3 py-2 text-right border-r border-slate-200 min-w-[110px]">
                        {cp}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right bg-blue-50 font-bold text-blue-900 min-w-[130px]">
                      Total CxC
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {matrizCxc.societies.map((soc) => (
                    <tr key={soc} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-semibold font-sans text-slate-800 bg-slate-50 sticky left-0 z-10 border-r border-slate-200">
                        {soc}
                      </td>
                      {matrizCxc.counterparties.map((cp) => {
                        const cell = matrizCxc.grid[soc]?.[cp];
                        const val = cell?.valor || 0;
                        return (
                          <td key={cp} className="px-3 py-2 text-right border-r border-slate-100">
                            {val > 0 ? formatNumber(val) : '—'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right font-bold text-blue-900 bg-blue-50/40">
                        {formatCurrency(matrizCxc.rowTotals[soc] || 0)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <td className="px-4 py-2.5 sticky left-0 z-10 bg-slate-200">Total Columnas</td>
                    {matrizCxc.counterparties.map((cp) => (
                      <td key={cp} className="px-3 py-2 text-right border-r border-slate-200">
                        {formatNumber(matrizCxc.colTotals[cp] || 0)}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right text-blue-950 bg-blue-100/70 font-bold">
                      {formatCurrency(matrizCxc.grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* CTAS X PAGAR with totals */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
            <div className="p-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-white">Matriz Cuentas por Pagar (CXP) con Totales</h4>
                <p className="text-xs text-indigo-200">Suma total por fila y por columna</p>
              </div>
              <span className="text-xs font-mono font-bold bg-white/20 px-3 py-1 rounded-full">
                Total: {formatCurrency(matrizCxp.grandTotal)}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <th className="px-4 py-2.5 text-left bg-slate-200/80 sticky left-0 z-10 min-w-[180px]">
                      Sociedad \ Contraparte
                    </th>
                    {matrizCxp.counterparties.map((cp) => (
                      <th key={cp} className="px-3 py-2 text-right border-r border-slate-200 min-w-[110px]">
                        {cp}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-right bg-indigo-50 font-bold text-indigo-900 min-w-[130px]">
                      Total CxP
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {matrizCxp.societies.map((soc) => (
                    <tr key={soc} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-semibold font-sans text-slate-800 bg-slate-50 sticky left-0 z-10 border-r border-slate-200">
                        {soc}
                      </td>
                      {matrizCxp.counterparties.map((cp) => {
                        const cell = matrizCxp.grid[soc]?.[cp];
                        const val = cell?.valor || 0;
                        return (
                          <td key={cp} className="px-3 py-2 text-right border-r border-slate-100">
                            {val > 0 ? formatNumber(val) : '—'}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right font-bold text-indigo-900 bg-indigo-50/40">
                        {formatCurrency(matrizCxp.rowTotals[soc] || 0)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                    <td className="px-4 py-2.5 sticky left-0 z-10 bg-slate-200">Total Columnas</td>
                    {matrizCxp.counterparties.map((cp) => (
                      <td key={cp} className="px-3 py-2 text-right border-r border-slate-200">
                        {formatNumber(matrizCxp.colTotals[cp] || 0)}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right text-indigo-950 bg-indigo-100/70 font-bold">
                      {formatCurrency(matrizCxp.grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down Modal (Strictly shows ONLY Unreconciled Documents from Sociedad or Contraparte) */}
      {drilldownCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm text-white">{drilldownCell.title}</h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  Saldo Sociedad: <strong>{formatCurrency(drilldownCell.valor)}</strong> • Recíproco Contraparte: <strong>{formatCurrency(drilldownCell.reciprocalValor)}</strong> •{' '}
                  <span className="text-amber-300 font-semibold">
                    {drilldownUnreconciled.length} documento(s) NO conciliado(s)
                  </span>
                </p>
              </div>
              <button
                onClick={() => setDrilldownCell(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {drilldownUnreconciled.length === 0 ? (
                <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <div className="font-bold text-sm">
                      Sin documentos no conciliados en esta relación
                    </div>
                    <p className="text-emerald-800 mt-0.5">
                      Todos los documentos registrados por <strong>{drilldownCell.sociedad}</strong> y por{' '}
                      <strong>{drilldownCell.contraparte}</strong> en este flujo se encuentran conciliados.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      Documentos pendientes o con diferencia de valor. Diferencia neta:{' '}
                      <strong>{formatCurrency(drilldownCell.difference || 0)}</strong>.
                    </span>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 uppercase text-[10px]">
                        <tr>
                          <th className="px-4 py-2.5">Reportado por</th>
                          <th className="px-4 py-2.5">Factura</th>
                          <th className="px-4 py-2.5">Fecha</th>
                          <th className="px-4 py-2.5">Alerta / Estado</th>
                          <th className="px-4 py-2.5 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {drilldownUnreconciled.map(({ movement: m, side, status }) => (
                          <tr key={m.id} className="bg-amber-50/25 hover:bg-amber-50/60">
                            <td className="px-4 py-2.5">
                              <div className="font-semibold text-slate-900">{m.sociedad}</div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    side === 'Sociedad'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-indigo-100 text-indigo-800'
                                  }`}
                                >
                                  {side} • {m.tipo}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 font-mono font-bold text-slate-900">{m.factura}</td>
                            <td className="px-4 py-2.5 font-mono text-slate-500">{m.fecha_factura}</td>
                            <td className="px-4 py-2.5">
                              {status?.status === 'diferencia_valor' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                  <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                                  <span>Dif. Valor ({formatCurrency(status.difference)})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                  <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                  <span>Sin {status?.expectedReciprocalType || 'contraparte'} en {m.contraparte}</span>
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-900">
                              {formatCurrency(m.valor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                {onInspectDocuments && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = drilldownCell;
                      setDrilldownCell(null);
                      onInspectDocuments({
                        viewMode: 'documentos',
                        sociedad: target.type === 'CXC' ? target.sociedad : target.contraparte,
                        contraparte: target.type === 'CXC' ? target.contraparte : target.sociedad,
                        docStatusFilter: 'NO_CONCILIADOS',
                        directionScope: 'CXC_TO_CXP',
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <FileSearch className="w-3.5 h-3.5" />
                    <span>Ver no conciliados frente a frente</span>
                  </button>
                )}
              </div>

              <button
                onClick={() => setDrilldownCell(null)}
                className="px-4 py-1.5 text-xs font-semibold bg-slate-200 hover:bg-slate-300 rounded-lg text-slate-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
