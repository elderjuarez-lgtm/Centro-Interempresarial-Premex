import React from 'react';
import { User } from 'firebase/auth';
import {
  Menu,
  ChevronRight,
  Cloud,
  Loader2,
  Plus,
  Send,
  LogOut,
  FileSpreadsheet,
  Lock,
} from 'lucide-react';
import {
  ActiveModuleId,
  EffectivePermissions,
  ViaticoLiquidation,
  ViaticosTab,
} from '../../types';

interface ViaticosHeaderProps {
  activeTab: ViaticosTab;
  activeLiquidation: ViaticoLiquidation | null;
  onToggleMobileMenu: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  onCreateNewLiquidation: () => void;
  onSaveToCloud: () => void;
  onOpenCloseEmailModal: () => void;
  onQuickDownloadExcel: () => void;
  isSavingCloud: boolean;
  hasUnsavedChanges: boolean;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  permissions: EffectivePermissions;
}

export const ViaticosHeader: React.FC<ViaticosHeaderProps> = ({
  activeTab,
  activeLiquidation,
  onToggleMobileMenu,
  onSwitchModule,
  onCreateNewLiquidation,
  onSaveToCloud,
  onOpenCloseEmailModal,
  onQuickDownloadExcel,
  isSavingCloud,
  hasUnsavedChanges,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  permissions,
}) => {
  const statusInfo = (() => {
    if (!activeLiquidation) return null;
    if (activeLiquidation.estado === 'enviada') {
      return { dot: 'bg-emerald-500', text: 'Cerrada y enviada', color: 'text-emerald-700' };
    }
    if (activeLiquidation.estado === 'cerrada') {
      return { dot: 'bg-sky-600', text: 'Liquidación cerrada', color: 'text-sky-700' };
    }
    return { dot: 'bg-amber-500', text: 'Borrador editable', color: 'text-amber-700' };
  })();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90">
      <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        {/* Left: Mobile toggle + Breadcrumb + Active Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <button
                type="button"
                onClick={() => onSwitchModule('launcher')}
                className="hover:text-[#1E60A8] transition-colors cursor-pointer whitespace-nowrap"
              >
                Premex
              </button>
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-[#19377B] truncate">Liquidación de Viáticos</span>
              {activeTab === 'liquidador' && statusInfo && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${statusInfo.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                    <span>{statusInfo.text}</span>
                  </span>
                </>
              )}
            </div>

            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
              {activeTab === 'liquidador'
                ? activeLiquidation
                  ? `${activeLiquidation.lineaLiquidacion || 'Sin título'} · Semana #${activeLiquidation.semana || '-'}`
                  : 'Panel de Liquidadores'
                : 'Historial de Liquidaciones y Consultores'}
            </h2>
          </div>
        </div>

        {/* Right: Single-Line Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {permissions.canOperate && (
            <button
              type="button"
              onClick={onCreateNewLiquidation}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Crear nueva liquidación semanal"
            >
              <Plus className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Nueva</span>
            </button>
          )}

          {activeLiquidation && (
            <button
              type="button"
              onClick={onQuickDownloadExcel}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Descargar Excel en formato oficial Premex"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Excel</span>
            </button>
          )}

          {permissions.canOperate && (
            <button
              type="button"
              onClick={onSaveToCloud}
              disabled={isSavingCloud}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                hasUnsavedChanges
                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
              title="Guardar cambios en la nube (Firestore)"
            >
              {isSavingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E60A8]" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-[#1E60A8]" />
              )}
              <span className="hidden sm:inline">
                {isSavingCloud
                  ? 'Guardando...'
                  : hasUnsavedChanges
                  ? 'Guardar Nube*'
                  : 'Guardar Nube'}
              </span>
            </button>
          )}

          {activeLiquidation && (
            <button
              type="button"
              onClick={onOpenCloseEmailModal}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Cerrar liquidación, descargar Excel + PDF de comprobantes y enviar por correo"
            >
              {activeLiquidation.estado === 'borrador' && permissions.canOperate ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>
                {activeLiquidation.estado === 'borrador' && permissions.canOperate
                  ? 'Cerrar y Enviar'
                  : 'Exportar / Correo'}
              </span>
            </button>
          )}

          {/* Account */}
          {currentUser ? (
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-200">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Usuario'}
                  title={currentUser.email || 'Usuario Premex'}
                  className="w-7 h-7 rounded-full border border-slate-200"
                />
              ) : (
                <div
                  title={currentUser.email || 'Usuario Premex'}
                  className="w-7 h-7 rounded-full bg-[#19377B]/10 text-[#19377B] flex items-center justify-center font-bold text-xs"
                >
                  {currentUser.displayName ? currentUser.displayName[0] : 'U'}
                </div>
              )}
              <button
                type="button"
                onClick={onSignOut}
                title="Cerrar sesión"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignInWithGoogle}
              className="hidden sm:inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              Iniciar Sesión
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
