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
}) => {
  const scopeLabel = 'Anitox';
  const isSelectedMonthClosed = selectedMonth !== 'ALL' && Boolean(closedMonths[selectedMonth]);
  const closedInfo = selectedMonth !== 'ALL' ? closedMonths[selectedMonth] : undefined;
  const [selectedSubTab, setSelectedSubTab] = useState<'bilateral' | 'cxc' | 'cxp' | 'ambas'>('bilateral');
  const activeBannerText = selectedMonth === 'ALL'
    ? 'CONSOLIDADO HISTÓRICO - ( CIFRAS EN DOLARES )'
    : `${selectedMonth.toUpperCase()} - ( CIFRAS EN DOLARES )`;
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
    <div className="space-y-6">
      {/* View Header & Action Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900">
              Matrices de Conciliación Interempresarial
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
              Empresas a Conciliar ({symmetricMatrix.entities.length})
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Estructura bilateral idéntica al libro de control corporativo: CTAS X COBRAR y CTAS X PAGAR alimentada por tus Empresas a Conciliar.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Subtab switcher */}
          <div className="p-1 bg-slate-100 rounded-xl flex items-center gap-1 text-xs font-semibold">
            <button
              onClick={() => setSelectedSubTab('bilateral')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedSubTab === 'bilateral'
                  ? 'bg-blue-600 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Vista Bilateral Exacta
            </button>
            <button
              onClick={() => setSelectedSubTab('ambas')}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                selectedSubTab === 'ambas'
                  ? 'bg-white text-blue-900 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Con Totales
            </button>
          </div>

          {/* Download Excel Button */}
          <button
            onClick={handleDownloadExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Descargar Matriz Excel</span>
          </button>

          {/* Save & Share Reconciliation Button */}
          {onOpenSaveModal && (
            <button
              onClick={onOpenSaveModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4 text-blue-100" />
              <span>Guardar Conciliación</span>
            </button>
          )}

          {/* Close Month (Independent per Scope) or Closed Badge */}
          {isSelectedMonthClosed ? (
            <button
              type="button"
              onClick={onOpenCloseMonthModal}
              title={
                closedInfo
                  ? `Cerrado en ${scopeLabel} el ${new Date(closedInfo.closedAt).toLocaleString('es-CO')} por ${closedInfo.closedBy}. Clic para consultar el cierre.`
                  : `Mes cerrado en ${scopeLabel}`
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-colors cursor-pointer"
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
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-700" />
                <span>Cerrar {scopeLabel}</span>
              </button>
            )
          )}

          {/* Google Sheets Sync Button */}
          <button
            onClick={onOpenGoogleSheets}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
            <span>Guardar en Sheets</span>
          </button>
        </div>
      </div>

      {/* Visual Color Legend Bar */}
      <div className="bg-white px-4 py-3 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-slate-700">Guía de Coloración:</span>
          
          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-[#bbf7d0] border border-emerald-400"></span>
            <span className="text-slate-600 font-medium">Conciliado (Saldo recíproco coincide)</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-[#fef08a] border border-amber-400"></span>
            <span className="text-slate-600 font-medium">Discrepancia / Diferencia</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded bg-[#fef3c7] border border-amber-200"></span>
            <span className="text-slate-600 font-medium">Diagonal (Misma sociedad)</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] text-slate-400 italic">
            Haz clic en cualquier celda con valor para ver únicamente los documentos no conciliados (sociedad o contraparte).
          </span>
          {onInspectDocuments && (docRecon.summary.noConciliados > 0 || differences.some((d) => d.estado !== 'conciliado')) && (
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors cursor-pointer"
            >
              <FileSearch className="w-3.5 h-3.5 text-amber-700" />
              <span>Ver documentos no conciliados ({docRecon.summary.noConciliados})</span>
            </button>
          )}
        </div>
      </div>

      {/* BILATERAL EXACT VIEW (MATCHING THE USER'S ATTACHED IMAGE) */}
      {selectedSubTab === 'bilateral' && (
        <div className="space-y-6">
          {/* Top Banner: SEPTIEMBRE 2026 - ( CIFRAS EN DOLARES ) */}
          <div className="bg-[#1b365d] text-white py-2.5 px-4 rounded-t-xl font-bold text-xs sm:text-sm tracking-wider shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-normal text-blue-200 uppercase tracking-normal">
                Mes en conciliación:
              </span>
              {setSelectedMonth && availableMonths.length > 0 && (
                <select
                  aria-label="Seleccionar mes a conciliar"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-blue-900/90 text-white font-bold border border-blue-400/40 rounded-lg px-2 py-1 text-xs focus:outline-hidden cursor-pointer"
                >
                  <option value="ALL">Todos los Meses</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {closedMonths[m] ? `${m} (Cerrado)` : m}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="font-mono text-center tracking-wide">{activeBannerText}</div>

            <div className="text-[11px] text-blue-200 font-normal">
              {symmetricMatrix.entities.length} x {symmetricMatrix.entities.length} Entidades ({movements.length} partidas)
            </div>
          </div>

          {/* Table 1: CTAS X COBRAR */}
          <section className="space-y-1">
            {renderBilateralSection('CTAS X COBRAR', symmetricMatrix.cxcGrid)}
          </section>

          {/* Table 2: CTAS X PAGAR */}
          <section className="space-y-1 pt-2">
            {renderBilateralSection('CTAS X PAGAR', symmetricMatrix.cxpGrid)}
          </section>
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
                      <strong>Sólo documentos no conciliados (Sociedad y Contraparte):</strong> Se muestran únicamente las facturas pendientes o con diferencia de valor. Diferencia neta en matriz: <strong>{formatCurrency(drilldownCell.difference || 0)}</strong>.
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
