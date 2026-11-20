import React from 'react';
import { User } from 'firebase/auth';
import {
  Menu,
  Calendar,
  Cloud,
  RefreshCw,
  Check,
  LogOut,
  CheckCircle2,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { ActiveModuleId, ActivitiesTab, EffectivePermissions } from '../../types';
import { buildRecentPeriodOptions, formatPeriodLabel } from '../../utils/activities';
import { ROLE_METADATA } from '../../utils/permissions';

interface ActivitiesHeaderProps {
  activeTab: ActivitiesTab;
  selectedPeriod: string;
  onChangePeriod: (periodKey: string) => void;
  onToggleMobileMenu: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  permissions: EffectivePermissions;
  hasUnsavedChanges: boolean;
  isSavingCloud: boolean;
  onSaveToCloud: () => void;
  isSyncingGoogleTasks: boolean;
  onPullFromGoogleTasks: () => void;
  onRequestResetPeriod?: () => void;
}

const TAB_TITLES: Record<ActivitiesTab, string> = {
  matriz: 'Matriz de Actividades',
  pendientes: 'Seguimiento y Tareas',
  sincronizacion: 'Gmail y Google Tasks',
  configuracion: 'Catálogo y Destinatarios',
};

export const ActivitiesHeader: React.FC<ActivitiesHeaderProps> = ({
  activeTab,
  selectedPeriod,
  onChangePeriod,
  onToggleMobileMenu,
  onSwitchModule,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  permissions,
  hasUnsavedChanges,
  isSavingCloud,
  onSaveToCloud,
  isSyncingGoogleTasks,
  onPullFromGoogleTasks,
  onRequestResetPeriod,
}) => {
  const periodOptions = buildRecentPeriodOptions(selectedPeriod);
  const title =
    activeTab === 'pendientes' && !permissions.isAdmin ? 'Mis Actividades' : TAB_TITLES[activeTab];
  const roleLabel = ROLE_METADATA[permissions.role].shortLabel;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200/90 pt-safe print:hidden">
      <div className="px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden min-w-[44px] min-h-[44px] -ml-1.5 inline-flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <button
                type="button"
                onClick={() => onSwitchModule('launcher')}
                className="hover:text-[#1E60A8] transition-colors cursor-pointer"
              >
                Premex
              </button>
              <span>/</span>
              <span className="text-[#0F766E] font-semibold">Panel de Actividades</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 truncate leading-tight">
              {title}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200">
            <Calendar className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              aria-label="Periodo de actividades"
              value={selectedPeriod}
              onChange={(e) => onChangePeriod(e.target.value)}
              className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer pr-1"
            >
              {periodOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
              {!periodOptions.some((o) => o.key === selectedPeriod) && (
                <option value={selectedPeriod}>{formatPeriodLabel(selectedPeriod)}</option>
              )}
            </select>
          </div>

          {permissions.isAdmin && permissions.canOperate && onRequestResetPeriod && (
            <button
              type="button"
              onClick={onRequestResetPeriod}
              title="Reiniciar el periodo de actividades para iniciar en Noviembre 2026"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold rounded-xl border border-amber-200 bg-amber-50/80 text-amber-900 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">Reiniciar Nov 2026</span>
            </button>
          )}

          {!permissions.isReadOnly && (
            <button
              type="button"
              onClick={onPullFromGoogleTasks}
              disabled={isSyncingGoogleTasks}
              title="Sincronizar tareas completadas desde Google Tasks"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-emerald-200 bg-emerald-50/70 text-emerald-800 hover:bg-emerald-100/80 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
            >
              {isSyncingGoogleTasks ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="hidden md:inline">Sync Tasks</span>
            </button>
          )}

          {permissions.canOperate && (
            <button
              type="button"
              onClick={onSaveToCloud}
              disabled={isSavingCloud}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                hasUnsavedChanges
                  ? 'bg-[#1E60A8] hover:bg-[#132B63] text-white shadow-xs'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
              }`}
            >
              {isSavingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : hasUnsavedChanges ? (
                <Cloud className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              )}
              <span className="hidden sm:inline">
                {isSavingCloud ? 'Guardando...' : hasUnsavedChanges ? 'Guardar' : 'Guardado'}
              </span>
            </button>
          )}

          {currentUser ? (
            <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200">
              <div
                className="flex items-center gap-2"
                title={`${currentUser.displayName || ''} (${currentUser.email || ''}) · ${roleLabel}`}
              >
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Usuario'}
                    className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#132B63]/10 text-[#132B63] flex items-center justify-center text-xs font-bold shrink-0">
                    {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="hidden xl:block text-left">
                  <div className="text-xs font-semibold text-slate-800 max-w-[130px] truncate leading-tight">
                    {currentUser.displayName || 'Usuario'}
                  </div>
                  <div className="text-[10px] text-slate-500 flex items-center gap-1 leading-tight">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                    <span>{roleLabel}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Cerrar sesión"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignInWithGoogle}
              className="px-3 py-2 text-xs font-semibold bg-[#132B63] text-white rounded-xl hover:bg-[#1E60A8] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Iniciar Sesión
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
