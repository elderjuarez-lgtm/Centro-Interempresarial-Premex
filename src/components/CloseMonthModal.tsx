import React, { useState, useEffect } from 'react';
import {
  Lock,
  X,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Copy,
  Check,
  Link2,
  AlertCircle,
  UploadCloud,
  Calendar
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ClosedMonthRecord, ReconciliationScope } from '../types';
import { INTERCOMPANY_SCOPES, getIntercompanyScopeLabel } from '../utils/demoData';
import { getShareableUrl } from '../services/reconciliationStore';

export interface ScopeClosureInfo {
  docId: string;
  entitiesCount: number;
  availableMonths: string[];
  closedMonths: Record<string, ClosedMonthRecord>;
  monthStats: Record<string, { movementsCount: number; differencesCount: number }>;
}

interface CloseMonthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMonth: string;
  activeScope: ReconciliationScope;
  scopeDetails: Record<ReconciliationScope, ScopeClosureInfo>;
  currentUser: User | null;
  onSignInWithGoogle: () => Promise<{ user: User; accessToken: string } | null | void>;
  onConfirmCloseMonth: (
    month: string,
    targetScope: ReconciliationScope
  ) => Promise<{
    url: string;
    closedRecord: ClosedMonthRecord;
  }>;
  onLoadNewMonth?: (targetScope: ReconciliationScope) => void;
}

export const CloseMonthModal: React.FC<CloseMonthModalProps> = ({
  isOpen,
  onClose,
  defaultMonth,
  activeScope,
  scopeDetails,
  currentUser,
  onSignInWithGoogle,
  onConfirmCloseMonth,
  onLoadNewMonth,
}) => {
  const [targetScope, setTargetScope] = useState<ReconciliationScope>(activeScope);
  const [targetMonth, setTargetMonth] = useState<string>(defaultMonth);
  const [confirmed, setConfirmed] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    scope: ReconciliationScope;
    month: string;
    url: string;
    closedRecord: ClosedMonthRecord;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const pickBestMonthForScope = (scope: ReconciliationScope, preferredMonth: string): string => {
    const info = scopeDetails[scope];
    if (preferredMonth !== 'ALL' && info.availableMonths.includes(preferredMonth)) {
      return preferredMonth;
    }
    const firstOpen = info.availableMonths.find((m) => !info.closedMonths[m]);
    return firstOpen || info.availableMonths[0] || 'Septiembre 2026';
  };

  useEffect(() => {
    if (isOpen) {
      setTargetScope(activeScope);
      setTargetMonth(pickBestMonthForScope(activeScope, defaultMonth));
      setConfirmed(false);
      setClosing(false);
      setError(null);
      setResult(null);
      setCopied(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeScope, defaultMonth]);

  if (!isOpen) return null;

  const currentInfo = scopeDetails[targetScope];
  const scopeLabel = getIntercompanyScopeLabel(targetScope);

  const existingClosure =
    targetMonth && targetMonth !== 'ALL' ? currentInfo.closedMonths[targetMonth] : undefined;
  const stats = currentInfo.monthStats[targetMonth] || {
    movementsCount: 0,
    differencesCount: 0,
  };

  const handleConfirm = async () => {
    if (!confirmed || !targetMonth || targetMonth === 'ALL' || existingClosure) return;
    setError(null);
    setClosing(true);

    try {
      if (!currentUser) {
        const authRes = await onSignInWithGoogle();
        if (!authRes) {
          return;
        }
      }
      const res = await onConfirmCloseMonth(targetMonth, targetScope);
      setResult({
        scope: targetScope,
        month: targetMonth,
        url: res.url,
        closedRecord: res.closedRecord,
      });
    } catch (err: any) {
      console.error('Error al cerrar mes:', err);
      let friendlyMsg = err?.message || 'No se pudo cerrar el mes en la nube.';
      if (friendlyMsg.startsWith('{')) {
        try {
          const parsed = JSON.parse(friendlyMsg);
          friendlyMsg = parsed.error || friendlyMsg;
        } catch {
          // keep original
        }
      }
      setError(friendlyMsg);
    } finally {
      setClosing(false);
    }
  };

  const handleCopy = (urlToCopy: string) => {
    if (!urlToCopy) return;
    navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0a2540] via-[#0f3460] to-[#1a365d] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">
                Cerrar Conciliación del Mes
              </h3>
              <p className="text-xs text-blue-200">
                Cierre permanente de {scopeLabel} ({targetMonth})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Scope Selector */}
          <div className="p-1 bg-slate-100 rounded-xl border border-slate-200 grid grid-cols-3 gap-1">
            {INTERCOMPANY_SCOPES.map((sc) => {
              const selected = targetScope === sc;
              return (
                <button
                  key={sc}
                  type="button"
                  disabled={closing}
                  onClick={() => {
                    setTargetScope(sc);
                    setTargetMonth(pickBestMonthForScope(sc, defaultMonth));
                    setConfirmed(false);
                    setError(null);
                    setResult(null);
                  }}
                  className={`py-1.5 px-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                    selected
                      ? 'bg-[#1E60A8] text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {getIntercompanyScopeLabel(sc)}
                </button>
              );
            })}
          </div>

          {/* Month Selector */}
          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Período a cerrar ({scopeLabel}):</span>
            </div>
            <select
              value={targetMonth}
              disabled={closing}
              onChange={(e) => {
                setTargetMonth(e.target.value);
                setConfirmed(false);
                setError(null);
                setResult(null);
              }}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {currentInfo.availableMonths.map((m) => (
                <option key={m} value={m}>
                  {currentInfo.closedMonths[m] ? `${m} (Ya cerrado)` : m}
                </option>
              ))}
            </select>
          </div>

          {/* Summary metrics for selected month */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Empresas ({scopeLabel})</div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {currentInfo.entitiesCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-blue-700">Partidas del Mes</div>
              <div className="text-base font-bold font-mono text-blue-950 mt-0.5">
                {stats.movementsCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-amber-700">Diferencias</div>
              <div className="text-base font-bold font-mono text-amber-900 mt-0.5">
                {stats.differencesCount}
              </div>
            </div>
          </div>

          {result ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs space-y-2">
                <div className="font-bold text-sm flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>¡Mes de {result.month} cerrado para {scopeLabel}!</span>
                </div>
                <p className="text-emerald-800">
                  Este período quedó protegido permanentemente en <strong>{scopeLabel}</strong> como solo lectura.
                </p>
                {result.closedRecord.archiveId && (
                  <div className="pt-1 text-[11px] font-mono text-emerald-900 bg-white/80 px-2.5 py-1.5 rounded-lg border border-emerald-200">
                    ID de Archivo Inmutable: <strong>{result.closedRecord.archiveId}</strong>
                  </div>
                )}
              </div>

              {result.url && (
                <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
                  <div className="text-xs font-bold text-blue-950">
                    Enlace actualizado ({scopeLabel}):
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-mono truncate">
                      <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate select-all">{result.url}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(result.url)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors shrink-0 cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>¡Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copiar Link</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : existingClosure ? (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-slate-100 border border-slate-300 text-slate-800 text-xs space-y-2">
                <div className="font-bold flex items-center gap-2 text-slate-900">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    {targetMonth} ya se encuentra cerrado para {scopeLabel}
                  </span>
                </div>
                <p className="text-slate-600">
                  Cerrado por <strong>{existingClosure.closedBy}</strong> el{' '}
                  {new Date(existingClosure.closedAt).toLocaleString('es-CO')}.
                </p>
                {existingClosure.archiveId && (
                  <div className="text-[11px] font-mono bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                    ID Archivo: <strong>{existingClosure.archiveId}</strong>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 font-mono truncate">
                  <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate select-all">
                    {getShareableUrl(currentInfo.docId, targetScope)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(getShareableUrl(currentInfo.docId, targetScope))}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? '¡Copiado!' : 'Copiar Link'}</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-xs space-y-2">
                <div className="font-bold flex items-center gap-2 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Cierre permanente ({scopeLabel})</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-amber-900/90">
                  <li>
                    Se bloqueará permanentemente el período <strong>{targetMonth}</strong> en{' '}
                    <strong>{scopeLabel}</strong>.
                  </li>
                  <li>
                    Ningún usuario podrá modificar, reemplazar ni eliminar movimientos o comentarios de{' '}
                    <strong>{targetMonth}</strong>.
                  </li>
                  <li>
                    Se creará un respaldo permanente e inmutable en Firebase Firestore para{' '}
                    <strong>{scopeLabel}</strong>.
                  </li>
                </ul>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  {currentUser
                    ? `Se registrará el cierre bajo tu usuario (${currentUser.displayName || 'Usuario Conectado'}).`
                    : 'Al confirmar se te pedirá iniciar sesión con Google para firmar y guardar el cierre permanente.'}
                </span>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="font-medium">
                  Confirmo que revisé las cifras de <strong>{scopeLabel}</strong> y deseo cerrar permanentemente el mes de{' '}
                  <strong>{targetMonth}</strong>.
                </span>
              </label>

              {error && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-semibold">No se pudo cerrar el mes:</div>
                    <div className="text-rose-700 mt-0.5">{error}</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            {result || existingClosure ? 'Listo' : 'Cancelar'}
          </button>

          {result && onLoadNewMonth && (
            <button
              type="button"
              onClick={() => onLoadNewMonth(result.scope)}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Cargar Nuevo Mes ({scopeLabel})</span>
            </button>
          )}

          {!result && !existingClosure && (
            <button
              type="button"
              disabled={!confirmed || closing || stats.movementsCount === 0}
              onClick={handleConfirm}
              title={
                stats.movementsCount === 0
                  ? `No hay movimientos cargados en ${scopeLabel} para ${targetMonth}`
                  : undefined
              }
              className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              {closing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cerrando {scopeLabel}...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 text-amber-300" />
                  <span>Cerrar Mes ({scopeLabel})</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
