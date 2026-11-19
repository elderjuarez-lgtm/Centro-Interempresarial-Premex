import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  FolderPlus,
  AlertTriangle,
  CheckCircle2,
  X,
  Calendar,
  FileCheck2,
  ShieldAlert,
} from 'lucide-react';
import {
  BankAccount,
  BankClosedReconciliation,
  BankReconciliationSummary,
} from '../../types';
import {
  SPANISH_MONTHS,
  formatBankMoney,
  formatPeriodLabel,
  getNextMonthPeriod,
  normalizePeriodKey,
} from '../../utils/bankReconciliation';

// ============================================================================
// 1. Close Reconciliation Confirmation Modal
// ============================================================================

interface CloseReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  period: string;
  societiesCount: number;
  accountSummaries: { account: BankAccount; summary: BankReconciliationSummary }[];
  openItemsCount: number;
  onConfirmClose: (notes: string) => void;
}

export const CloseReconciliationModal: React.FC<CloseReconciliationModalProps> = ({
  isOpen,
  onClose,
  period,
  societiesCount,
  accountSummaries,
  openItemsCount,
  onConfirmClose,
}) => {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) setNotes('');
  }, [isOpen, period]);

  const diffAccounts = useMemo(
    () => accountSummaries.filter(({ summary }) => Math.abs(summary.diferenciaNeta) > 1),
    [accountSummaries]
  );
  const squaredCount = accountSummaries.length - diffAccounts.length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-bank-rec-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-[#132B63] text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="close-bank-rec-title" className="text-sm font-bold truncate">
                Cerrar Conciliación Bancaria · {period}
              </h3>
              <p className="text-[11px] text-sky-200/90 truncate">
                El entregable quedará archivado en el Historial en modo solo lectura
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-sky-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Compact Quantitative Audit Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border border-slate-200 rounded-xl p-4 bg-slate-50/70">
            <div>
              <div className="text-[11px] font-medium text-slate-500">Sociedades</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                {societiesCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Cuentas Bancarias</div>
              <div className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                {accountSummaries.length}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Cuadradas</div>
              <div className="text-lg font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
                {squaredCount}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-500">Partidas SAP</div>
              <div className="text-lg font-bold text-[#132B63] font-mono tabular-nums mt-0.5">
                {openItemsCount}
              </div>
            </div>
          </div>

          {/* Discrepancy Check */}
          {diffAccounts.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-2">
              <div className="flex items-start gap-2.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-bold">
                    {diffAccounts.length} cuenta(s) presentan diferencia pendiente al cierre
                  </div>
                  <p className="text-amber-800/90 mt-0.5">
                    Puedes cancelar para terminar el cuadre o continuar el cierre dejando constancia
                    en las observaciones.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-amber-200/70 border-t border-amber-200/70 pt-2">
                {diffAccounts.slice(0, 6).map(({ account, summary }) => (
                  <div
                    key={account.id}
                    className="py-1.5 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-slate-800 truncate">
                      <strong className="font-semibold">{account.sociedad}</strong> ·{' '}
                      {account.banco}
                    </span>
                    <span className="font-mono tabular-nums font-bold text-amber-900 shrink-0">
                      {formatBankMoney(summary.diferenciaNeta, account.moneda)}
                    </span>
                  </div>
                ))}
                {diffAccounts.length > 6 && (
                  <div className="pt-1.5 text-[11px] text-amber-800">
                    y {diffAccounts.length - 6} cuenta(s) adicional(es)...
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 flex items-center gap-2.5 text-xs text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Todas las cuentas bancarias del periodo <strong>{period}</strong> se encuentran
                cuadradas y listas para archivo definitivo.
              </span>
            </div>
          )}

          {/* Optional Closing Notes */}
          <div className="space-y-1.5">
            <label
              htmlFor="bank-close-notes"
              className="block text-xs font-semibold text-slate-700"
            >
              Observaciones de cierre (opcional)
            </label>
            <textarea
              id="bank-close-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              placeholder="Ej. Cierre mensual revisado contra extractos bancarios y FBL3N de SAP..."
              className="w-full px-3.5 py-2.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
            />
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            Al confirmar, la conciliación de <strong>{period}</strong> pasará al{' '}
            <strong>Historial de Conciliaciones</strong> en modo de consulta inmutable y quedará
            habilitado el botón <strong>Abrir Conciliación</strong> para iniciar el siguiente
            periodo.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirmClose(notes.trim())}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#0E224D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Confirmar Cierre</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. Open New Reconciliation Modal (only permitted when openPeriod === null)
// ============================================================================

interface OpenReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  latestClosedPeriod: string | null;
  closedReconciliations: BankClosedReconciliation[];
  onConfirmOpen: (payload: { period: string; carryOverOpenItems: boolean }) => void;
}

export const OpenReconciliationModal: React.FC<OpenReconciliationModalProps> = ({
  isOpen,
  onClose,
  latestClosedPeriod,
  closedReconciliations,
  onConfirmOpen,
}) => {
  const suggested = useMemo(
    () => getNextMonthPeriod(latestClosedPeriod),
    [latestClosedPeriod]
  );

  const [monthIndex, setMonthIndex] = useState<number>(suggested.monthIndex);
  const [year, setYear] = useState<number>(suggested.year);
  const [carryOverOpenItems, setCarryOverOpenItems] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setMonthIndex(suggested.monthIndex);
      setYear(suggested.year);
      setCarryOverOpenItems(false);
    }
  }, [isOpen, suggested.monthIndex, suggested.year]);

  const candidatePeriod = formatPeriodLabel(monthIndex, year);

  const alreadyClosedMatch = useMemo(() => {
    const key = normalizePeriodKey(candidatePeriod);
    return closedReconciliations.find((c) => normalizePeriodKey(c.period) === key) || null;
  }, [candidatePeriod, closedReconciliations]);

  const yearOptions = useMemo(() => {
    const base = Math.max(2025, suggested.year - 1);
    return [base, base + 1, base + 2, base + 3, base + 4];
  }, [suggested.year]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-bank-rec-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 bg-[#1E60A8] text-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <FolderPlus className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="open-bank-rec-title" className="text-sm font-bold truncate">
                Abrir Nueva Conciliación Bancaria
              </h3>
              <p className="text-[11px] text-sky-100 truncate">
                Inicia un nuevo periodo mensual manteniendo el maestro de sociedades y cuentas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-sky-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            aria-label="Cerrar ventana"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {latestClosedPeriod && (
            <div className="text-xs text-slate-600 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Última conciliación cerrada: <strong className="text-slate-900">{latestClosedPeriod}</strong>
              </span>
            </div>
          )}

          {/* Month & Year Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="open-rec-month"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Mes a conciliar
              </label>
              <div className="relative">
                <select
                  id="open-rec-month"
                  value={monthIndex}
                  onChange={(e) => setMonthIndex(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] cursor-pointer"
                >
                  {SPANISH_MONTHS.map((m, idx) => (
                    <option key={m} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="open-rec-year"
                className="block text-xs font-semibold text-slate-700 mb-1.5"
              >
                Año
              </label>
              <select
                id="open-rec-year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] cursor-pointer font-mono tabular-nums"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected Period Summary */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <Calendar className="w-4 h-4 text-[#1E60A8] shrink-0" />
              <span>Periodo a abrir</span>
            </div>
            <span className="text-sm font-bold text-[#132B63]">{candidatePeriod}</span>
          </div>

          {/* Duplicate Period Guard */}
          {alreadyClosedMatch && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5 flex items-start gap-2.5 text-xs text-rose-900">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Periodo ya cerrado en el Historial</div>
                <p className="mt-0.5 text-rose-800">
                  La conciliación de <strong>{alreadyClosedMatch.period}</strong> ya se encuentra
                  cerrada. Selecciona un periodo diferente para abrir una nueva conciliación.
                </p>
              </div>
            </div>
          )}

          {/* Optional Carry-over of Open Items */}
          <label className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={carryOverOpenItems}
              onChange={(e) => setCarryOverOpenItems(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E60A8] focus:ring-[#1E60A8]"
            />
            <div className="text-xs">
              <div className="font-semibold text-slate-800">
                Arrastrar partidas abiertas SAP pendientes del cierre anterior
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Déjalo desmarcado si vas a cargar un nuevo archivo FBL3N limpio desde SAP para{' '}
                {candidatePeriod}. El catálogo de sociedades y subcuentas 00/01/02 siempre se
                conserva.
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={Boolean(alreadyClosedMatch)}
            onClick={() =>
              onConfirmOpen({
                period: candidatePeriod,
                carryOverOpenItems,
              })
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-45 disabled:cursor-not-allowed rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Abrir Conciliación</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. Blocked Open Notice Modal (strict sequential guard)
// ============================================================================

interface BlockedOpenNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  openPeriod: string;
  onProceedToCloseCurrent: () => void;
}

export const BlockedOpenNoticeModal: React.FC<BlockedOpenNoticeModalProps> = ({
  isOpen,
  onClose,
  openPeriod,
  onProceedToCloseCurrent,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="blocked-open-rec-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 id="blocked-open-rec-title" className="text-sm font-bold text-slate-900">
                Debes cerrar la conciliación actual primero
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Actualmente la conciliación del periodo{' '}
                <strong className="text-slate-900">{openPeriod}</strong> se encuentra{' '}
                <strong>abierta</strong>. No es posible abrir una nueva conciliación mientras la
                anterior no haya sido cerrada.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Entendido
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onProceedToCloseCurrent();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#0E224D] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Cerrar {openPeriod}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
