import React, { useState, useEffect } from 'react';
import {
  Save,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  Link2,
  Share2,
  Sparkles
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ReconciliationScope } from '../types';
import { getShareableUrl } from '../services/reconciliationStore';

interface SaveReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onSignInWithGoogle: () => Promise<{ user: User; accessToken: string } | null | void>;
  onSaveToCloud: (options: { title: string; forceNewCopy?: boolean }) => Promise<{
    id: string;
    url: string;
    updatedAtIso: string;
  }>;
  activeDocId: string;
  activeDocTitle: string;
  lastSavedAtIso: string | null;
  hasUnsavedChanges: boolean;
  entitiesCount: number;
  movementsCount: number;
  differencesCount: number;
  selectedMonth: string;
  activeScope?: ReconciliationScope;
}

export const SaveReconciliationModal: React.FC<SaveReconciliationModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSignInWithGoogle,
  onSaveToCloud,
  activeDocId,
  activeDocTitle,
  lastSavedAtIso,
  hasUnsavedChanges,
  entitiesCount,
  movementsCount,
  differencesCount,
  selectedMonth,
  activeScope = 'internacionales',
}) => {
  const scopeLabel = 'Anitox';
  const defaultTitle =
    activeDocTitle ||
    `Conciliación ${scopeLabel} - ${selectedMonth === 'ALL' ? 'Consolidado' : selectedMonth}`;

  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [savedTimestamp, setSavedTimestamp] = useState<string | null>(lastSavedAtIso);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTitle(
        activeDocTitle ||
          `Conciliación ${scopeLabel} - ${selectedMonth === 'ALL' ? 'Consolidado' : selectedMonth}`
      );
      setError(null);
      setCopied(false);
      setSavedTimestamp(lastSavedAtIso);
      setSavedUrl(lastSavedAtIso ? getShareableUrl(activeDocId, activeScope) : null);
    }
  }, [isOpen, activeDocTitle, selectedMonth, lastSavedAtIso, activeDocId, activeScope, scopeLabel]);

  if (!isOpen) return null;

  const handleSave = async (forceNewCopy = false) => {
    setError(null);
    setSaving(true);

    try {
      if (!currentUser) {
        const authRes = await onSignInWithGoogle();
        if (!authRes) {
          return;
        }
      }
      const res = await onSaveToCloud({
        title: title.trim() || defaultTitle,
        forceNewCopy,
      });
      setSavedUrl(res.url);
      setSavedTimestamp(res.updatedAtIso);
    } catch (err: any) {
      console.error('Error al guardar conciliación:', err);
      let friendlyMsg = err?.message || 'No se pudo guardar la conciliación.';
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
      setSaving(false);
    }
  };

  const handleCopy = () => {
    const urlToCopy = savedUrl || getShareableUrl(activeDocId, activeScope);
    if (!urlToCopy) return;
    navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const formattedTime = savedTimestamp
    ? new Date(savedTimestamp).toLocaleString('es-CO', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#0a2540] via-[#0f3460] to-[#1a365d] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center">
              <Save className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-white">
                Guardar y Compartir Conciliación
              </h3>
              <p className="text-xs text-blue-200">
                Guarda los saldos, empresas y comentarios para que cualquiera los vea al abrir el link
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
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Summary metrics */}
          <div className="grid grid-cols-3 gap-3 text-center text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-slate-500">Empresas</div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {entitiesCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
              <div className="text-blue-700">Movimientos</div>
              <div className="text-base font-bold font-mono text-blue-950 mt-0.5">
                {movementsCount}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-amber-700">Diferencias</div>
              <div className="text-base font-bold font-mono text-amber-900 mt-0.5">
                {differencesCount}
              </div>
            </div>
          </div>

          {/* Unsaved changes indicator */}
          {hasUnsavedChanges ? (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Tienes cambios locales pendientes por guardar en la nube. Haz clic en <strong>Guardar y Actualizar</strong> para reflejarlos en el enlace compartido.
              </span>
            </div>
          ) : formattedTime ? (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                Sincronizado en la nube • Última actualización: <strong>{formattedTime}</strong>
              </span>
            </div>
          ) : null}

          {/* Title Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Nombre de la Conciliación
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              placeholder="Ej. Conciliación Interempresarial - Septiembre 2026"
              className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Shareable Link Box */}
          {savedUrl && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                  <Share2 className="w-4 h-4 text-blue-600" />
                  <span>Enlace listo para compartir</span>
                </span>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  Actualizado
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 bg-white border border-blue-200 rounded-lg px-3 py-2 text-xs text-slate-700 font-mono truncate">
                  <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate select-all">{savedUrl}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
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
              <p className="text-[11px] text-blue-800/80">
                Los datos ya quedaron guardados en la nube. Si vas a compartir la app con otras personas desde AI Studio, recuerda publicarla primero con el botón <strong>Share / Deploy</strong> (la URL pública cargará automáticamente esta misma conciliación).
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">No se pudo guardar en la nube:</div>
                <div className="text-rose-700 mt-0.5">{error}</div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            {savedUrl && (
              <button
                type="button"
                disabled={saving}
                onClick={() => handleSave(true)}
                className="text-xs font-semibold text-slate-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                Guardar como enlace nuevo
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(false)}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>{savedUrl ? 'Actualizar Conciliación' : 'Guardar y Generar Link'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
