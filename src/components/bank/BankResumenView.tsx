import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ArrowLeftRight,
  Download,
  Sparkles,
  UploadCloud,
  Landmark,
} from 'lucide-react';
import {
  BankAccount,
  BankMatchGroup,
  BankReconciliationSummary,
  BankStatementItem,
  BankTab,
  BookLedgerItem,
} from '../../types';
import {
  computeBankReconciliationSummary,
  formatBankMoney,
} from '../../utils/bankReconciliation';

interface BankResumenViewProps {
  accounts: BankAccount[];
  selectedAccountId: string;
  onSelectAccountId: (id: string) => void;
  summary: BankReconciliationSummary;
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
  selectedMonth: string;
  onNavigateTab: (tab: BankTab) => void;
  onRunAutoMatch: () => void;
  onExportExcel: () => void;
  isReadOnly?: boolean;
  canManageAccounts?: boolean;
}

export const BankResumenView: React.FC<BankResumenViewProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccountId,
  summary,
  statementItems,
  ledgerItems,
  matches,
  selectedMonth,
  onNavigateTab,
  onRunAutoMatch,
  onExportExcel,
  isReadOnly = false,
  canManageAccounts = true,
}) => {
  const account = summary.account;

  if (!account) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
        <Landmark className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h3 className="text-base font-bold text-slate-800">
          No hay cuentas bancarias disponibles
        </h3>
        <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          {canManageAccounts
            ? 'Agrega tu primera cuenta bancaria para comenzar a conciliar extractos contra libros.'
            : 'No existen cuentas bancarias asociadas a las sociedades autorizadas para tu usuario.'}
        </p>
        {canManageAccounts && !isReadOnly && (
          <button
            type="button"
            onClick={() => onNavigateTab('cuentas')}
            className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
          >
            Configurar cuentas bancarias
          </button>
        )}
      </div>
    );
  }

  const isBalanced = Math.abs(summary.diferenciaNeta) <= 0.01;
  const currency = account.moneda;

  return (
    <div className="space-y-6">
      {/* Executive KPI Strip (Single elevation, clean dividers, tabular-nums) */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-500">
              {account.sociedad} · {account.pais} · Cuenta {account.tipoCuenta} ({account.moneda})
            </div>
            <h3 className="text-lg font-bold text-slate-900 mt-0.5">
              {account.banco}{' '}
              <span className="font-mono text-sm font-medium text-slate-500">
                {account.numeroCuenta}
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isReadOnly && (
              <button
                type="button"
                onClick={onRunAutoMatch}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Conciliar Automáticamente</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateTab('cruce')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#19377B] bg-[#1E60A8]/8 hover:bg-[#1E60A8]/15 rounded-xl transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{isReadOnly ? 'Ver Mesa de Cruce' : 'Abrir Mesa de Cruce'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Saldo Final Extracto
            </div>
            <div className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {formatBankMoney(summary.saldoExtracto, currency)}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              {summary.totalBankItems} movimientos · {summary.unmatchedBankItemsCount} sin cruzar
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Saldo Final Libros
            </div>
            <div className="mt-1.5 text-xl font-bold text-slate-900 font-mono tabular-nums">
              {formatBankMoney(summary.saldoLibros, currency)}
            </div>
            <div className="mt-1 text-xs text-slate-500 tabular-nums">
              {summary.totalLedgerItems} asientos · {summary.unmatchedLedgerItemsCount} en tránsito
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Avance de Cruce
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-xl font-bold text-teal-700 font-mono tabular-nums">
                {summary.reconciledPct}%
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {summary.matchedBankItemsCount + summary.matchedLedgerItemsCount} de{' '}
                {summary.totalBankItems + summary.totalLedgerItems} partidas
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-600 rounded-full transition-all duration-300"
                style={{ width: `${summary.reconciledPct}%` }}
              />
            </div>
          </div>

          <div className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Diferencia Neta de Cuadre
            </div>
            <div
              className={`mt-1.5 text-xl font-bold font-mono tabular-nums ${
                isBalanced ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {formatBankMoney(summary.diferenciaNeta, currency, true)}
            </div>
            <div
              className={`mt-1 text-xs font-semibold flex items-center gap-1 ${
                isBalanced ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {isBalanced ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Cuadre bancario exacto</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Requiere revisión de saldos</span>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Formal Proof of Reconciliation Bridge (Cuadro de Conciliación Bancaria) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Bank Statement Proof */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-[#132B63]">
                1. Conciliación según Extracto Bancario
              </h4>
              <p className="text-[11px] text-slate-500">
                Ajuste por partidas registradas en libros aún no reflejadas en banco
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500">{currency}</span>
          </div>

          <div className="divide-y divide-slate-100 text-sm">
            <div className="px-5 py-3.5 flex items-center justify-between gap-4">
              <span className="font-medium text-slate-700">Saldo final según extracto bancario</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatBankMoney(summary.saldoExtracto, currency)}
              </span>
            </div>

            <div className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-slate-700">(+) Depósitos / recaudos en tránsito</div>
                <div className="text-[11px] text-slate-500">
                  Débitos en auxiliar contable sin abono aún en banco
                </div>
              </div>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                +{formatBankMoney(summary.depositosEnTransito, currency)}
              </span>
            </div>

            <div className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-slate-700">(-) Cheques / transferencias en tránsito</div>
                <div className="text-[11px] text-slate-500">
                  Créditos en auxiliar contable pendientes de cobro bancario
                </div>
              </div>
              <span className="font-mono font-semibold text-rose-700 tabular-nums">
                -{formatBankMoney(summary.chequesEnTransito, currency)}
              </span>
            </div>

            <div className="px-5 py-4 bg-[#19377B]/5 flex items-center justify-between gap-4">
              <span className="font-bold text-[#132B63]">Saldo Conciliado según Extracto</span>
              <span className="font-mono text-base font-extrabold text-[#132B63] tabular-nums">
                {formatBankMoney(summary.saldoConciliadoExtracto, currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Accounting Books Proof */}
        <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-bold text-teal-900">
                2. Conciliación según Auxiliar Contable (Libros)
              </h4>
              <p className="text-[11px] text-slate-500">
                Ajuste por cargos o abonos bancarios pendientes de contabilizar
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-slate-500">{currency}</span>
          </div>

          <div className="divide-y divide-slate-100 text-sm">
            <div className="px-5 py-3.5 flex items-center justify-between gap-4">
              <span className="font-medium text-slate-700">Saldo final según libros contables</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatBankMoney(summary.saldoLibros, currency)}
              </span>
            </div>

            <div className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-slate-700">(+) Notas crédito / rendimientos no registrados</div>
                <div className="text-[11px] text-slate-500">
                  Créditos en extracto pendientes de causar en ERP
                </div>
              </div>
              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                +{formatBankMoney(summary.notasCreditoNoContabilizadas, currency)}
              </span>
            </div>

            <div className="px-5 py-3.5 flex items-center justify-between gap-4">
              <div>
                <div className="text-slate-700">(-) Notas débito / comisiones e impuestos bancarios</div>
                <div className="text-[11px] text-slate-500">
                  Débitos en extracto (GMF, SWIFT, comisiones) por contabilizar
                </div>
              </div>
              <span className="font-mono font-semibold text-rose-700 tabular-nums">
                -{formatBankMoney(summary.notasDebitoNoContabilizadas, currency)}
              </span>
            </div>

            <div className="px-5 py-4 bg-teal-50/80 flex items-center justify-between gap-4">
              <span className="font-bold text-teal-950">Saldo Conciliado según Libros</span>
              <span className="font-mono text-base font-extrabold text-teal-950 tabular-nums">
                {formatBankMoney(summary.saldoConciliadoLibros, currency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Consolidated Multi-Account Overview Table */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-slate-900">
              Estado Consolidado de Cuentas Bancarias
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              Haz clic en cualquier cuenta para activar su mesa de conciliación
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => onNavigateTab('carga')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
              >
                <UploadCloud className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Cargar Extracto / Libros</span>
              </button>
            )}
            <button
              type="button"
              onClick={onExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-teal-700" />
              <span>Descargar Cuadre</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-5">Banco / Cuenta</th>
                <th className="py-3 px-4">Sociedad</th>
                <th className="py-3 px-4 text-right">Saldo Extracto</th>
                <th className="py-3 px-4 text-right">Saldo Libros</th>
                <th className="py-3 px-4 text-right">Avance</th>
                <th className="py-3 px-5 text-right">Diferencia Neta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {accounts.map((acc) => {
                const rowSummary = computeBankReconciliationSummary(
                  acc,
                  statementItems,
                  ledgerItems,
                  matches,
                  selectedMonth
                );
                const isSelected = acc.id === selectedAccountId;
                const rowBalanced = Math.abs(rowSummary.diferenciaNeta) <= 0.01;

                return (
                  <tr
                    key={acc.id}
                    onClick={() => onSelectAccountId(acc.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#1E60A8]/6' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-5">
                      <div className="font-semibold text-slate-900 flex items-center gap-2">
                        <span>{acc.banco}</span>
                        {isSelected && (
                          <span className="text-[11px] font-semibold text-[#1E60A8]">· Activa</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        {acc.numeroCuenta} · {acc.moneda}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div>{acc.sociedad}</div>
                      <div className="text-[11px] text-slate-400">{acc.pais}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                      {formatBankMoney(rowSummary.saldoExtracto, acc.moneda)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-800">
                      {formatBankMoney(rowSummary.saldoLibros, acc.moneda)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums">
                      <span className="font-semibold text-teal-700">
                        {rowSummary.reconciledPct}%
                      </span>
                      <div className="text-[11px] text-slate-400">
                        {rowSummary.unmatchedBankItemsCount + rowSummary.unmatchedLedgerItemsCount}{' '}
                        pend.
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right font-mono font-bold tabular-nums">
                      <span className={rowBalanced ? 'text-emerald-700' : 'text-rose-600'}>
                        {formatBankMoney(rowSummary.diferenciaNeta, acc.moneda, true)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
