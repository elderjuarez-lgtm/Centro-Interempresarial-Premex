import React from 'react';
import { Download, CheckCircle2, ArrowLeftRight } from 'lucide-react';
import {
  BankPendingCategory,
  BankReconciliationSummary,
  BankTab,
} from '../../types';
import {
  DEFAULT_PENDING_CATEGORY_LABEL,
  formatBankMoney,
  getBankSignedAmount,
  getLedgerSignedAmount,
  inferPendingCategoryForBank,
  inferPendingCategoryForLedger,
} from '../../utils/bankReconciliation';

interface BankPendientesViewProps {
  summary: BankReconciliationSummary;
  onUpdateBankItemMeta: (
    itemId: string,
    patch: { categoriaPendiente?: BankPendingCategory; comentario?: string }
  ) => void;
  onUpdateLedgerItemMeta: (
    itemId: string,
    patch: { categoriaPendiente?: BankPendingCategory; comentario?: string }
  ) => void;
  onExportExcel: () => void;
  onNavigateTab: (tab: BankTab) => void;
  isReadOnly?: boolean;
}

const CATEGORIES: BankPendingCategory[] = [
  'deposito_transito',
  'cheque_transito',
  'nota_debito',
  'nota_credito',
  'por_identificar',
];

export const BankPendientesView: React.FC<BankPendientesViewProps> = ({
  summary,
  onUpdateBankItemMeta,
  onUpdateLedgerItemMeta,
  onExportExcel,
  onNavigateTab,
  isReadOnly = false,
}) => {
  const currency = summary.account?.moneda || 'USD';
  const totalPending =
    summary.unmatchedBankItems.length + summary.unmatchedLedgerItems.length;

  return (
    <div className="space-y-6">
      {/* Header Summary Strip */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Partidas Conciliatorias Abiertas ({totalPending})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            {summary.unmatchedBankItems.length} en extracto pendientes de contabilizar ·{' '}
            {summary.unmatchedLedgerItems.length} en libros en tránsito bancario
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigateTab('cruce')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#19377B] bg-[#1E60A8]/8 hover:bg-[#1E60A8]/15 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>Ir a Mesa de Cruce</span>
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar Anexos</span>
          </button>
        </div>
      </div>

      {totalPending === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
          <h4 className="text-base font-bold text-slate-900">
            Todas las partidas están conciliadas
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            No existen partidas abiertas en extracto ni movimientos en tránsito para esta cuenta y periodo.
          </p>
        </div>
      ) : (
        <>
          {/* Table 1: Unmatched Bank Statement Items (Need ERP Journal Entry) */}
          <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#132B63]">
                  En Extracto Bancario — No registradas en Libros ({summary.unmatchedBankItems.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Comisiones, impuestos bancarios (GMF), rendimientos o consignaciones por identificar que requieren ajuste contable
                </p>
              </div>
              <div className="text-xs font-mono text-slate-700 tabular-nums">
                NC: +{formatBankMoney(summary.notasCreditoNoContabilizadas, currency)} · ND: -
                {formatBankMoney(summary.notasDebitoNoContabilizadas, currency)}
              </div>
            </div>

            {summary.unmatchedBankItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Sin partidas pendientes en el extracto bancario.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-5">Fecha / Ref</th>
                      <th className="py-2.5 px-3">Concepto Extracto</th>
                      <th className="py-2.5 px-3 text-right">Importe</th>
                      <th className="py-2.5 px-3">Clasificación</th>
                      <th className="py-2.5 px-5">Comentario / Acción Contable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {summary.unmatchedBankItems.map((item) => {
                      const signedVal = getBankSignedAmount(item);
                      const activeCat = inferPendingCategoryForBank(item);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-5 whitespace-nowrap">
                            <div className="font-mono font-semibold text-slate-800">
                              {item.referencia}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {item.fecha}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-xs">
                            <div className="line-clamp-2">{item.descripcion}</div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            <span
                              className={
                                signedVal >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }
                            >
                              {formatBankMoney(signedVal, currency, true)}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <select
                              aria-label={`Clasificación para ${item.referencia}`}
                              value={activeCat}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                onUpdateBankItemMeta(item.id, {
                                  categoriaPendiente: e.target.value as BankPendingCategory,
                                })
                              }
                              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-hidden focus:border-[#1E60A8] disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {DEFAULT_PENDING_CATEGORY_LABEL[c]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-5 min-w-[220px]">
                            <input
                              type="text"
                              value={item.comentario || ''}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                onUpdateBankItemMeta(item.id, {
                                  comentario: e.target.value,
                                })
                              }
                              placeholder={
                                isReadOnly
                                  ? 'Sin comentarios (Solo Consulta)'
                                  : 'Escribir nota de ajuste contable...'
                              }
                              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-hidden focus:border-[#1E60A8] disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Table 2: Unmatched Book Ledger Items (In Transit) */}
          <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-teal-900">
                  En Libros Contables — En Tránsito Bancario ({summary.unmatchedLedgerItems.length})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Cheques girados no cobrados, transferencias ACH en curso o consignaciones pendientes de canje
                </p>
              </div>
              <div className="text-xs font-mono text-slate-700 tabular-nums">
                Depósitos: +{formatBankMoney(summary.depositosEnTransito, currency)} · Pagos: -
                {formatBankMoney(summary.chequesEnTransito, currency)}
              </div>
            </div>

            {summary.unmatchedLedgerItems.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Sin partidas en tránsito en el auxiliar contable.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-5">Fecha / Comp.</th>
                      <th className="py-2.5 px-3">Tercero y Concepto</th>
                      <th className="py-2.5 px-3 text-right">Importe</th>
                      <th className="py-2.5 px-3">Clasificación</th>
                      <th className="py-2.5 px-5">Comentario / Seguimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {summary.unmatchedLedgerItems.map((item) => {
                      const signedVal = getLedgerSignedAmount(item);
                      const activeCat = inferPendingCategoryForLedger(item);
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-5 whitespace-nowrap">
                            <div className="font-mono font-semibold text-slate-800">
                              {item.comprobante}
                            </div>
                            <div className="text-[11px] font-mono text-slate-400">
                              {item.fecha}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-slate-700 max-w-xs">
                            <div className="font-semibold text-slate-900">{item.tercero}</div>
                            <div className="text-[11px] text-slate-500 line-clamp-1">
                              {item.descripcion}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            <span
                              className={
                                signedVal >= 0 ? 'text-emerald-700' : 'text-rose-700'
                              }
                            >
                              {formatBankMoney(signedVal, currency, true)}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <select
                              aria-label={`Clasificación para ${item.comprobante}`}
                              value={activeCat}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                onUpdateLedgerItemMeta(item.id, {
                                  categoriaPendiente: e.target.value as BankPendingCategory,
                                })
                              }
                              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:outline-hidden focus:border-teal-700 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {DEFAULT_PENDING_CATEGORY_LABEL[c]}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-3 px-5 min-w-[220px]">
                            <input
                              type="text"
                              value={item.comentario || ''}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                onUpdateLedgerItemMeta(item.id, {
                                  comentario: e.target.value,
                                })
                              }
                              placeholder={
                                isReadOnly
                                  ? 'Sin comentarios (Solo Consulta)'
                                  : 'Escribir seguimiento de partida en tránsito...'
                              }
                              className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-hidden focus:border-teal-700 disabled:bg-slate-50 disabled:text-slate-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
};
