import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Menu,
  ChevronRight,
  ChevronDown,
  Cloud,
  Loader2,
  Plus,
  Send,
  LogOut,
  FileSpreadsheet,
  FileText,
  Printer,
  Lock,
  Download,
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
  onOpenCloseConfirmModal: () => void;
  onOpenCloseEmailModal: () => void;
  onOpenPlanillaPdfPreview: () => void;
  onQuickDownloadExcel: () => void;
  onQuickDownloadPdf: () => void;
  isDownloadingExcel: boolean;
  isDownloadingPdf: boolean;
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
  onOpenCloseConfirmModal,
  onOpenCloseEmailModal,
  onOpenPlanillaPdfPreview,
  onQuickDownloadExcel,
  onQuickDownloadPdf,
  isDownloadingExcel,
  isDownloadingPdf,
  isSavingCloud,
  hasUnsavedChanges,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  permissions,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [exportOpen]);

  const statusInfo = (() => {
    if (!activeLiquidation) return null;
    if (activeLiquidation.estado === 'enviada') {
      return {
        text: 'Cerrada y enviada',
        shortText: 'Enviada',
        color: 'text-emerald-700',
      };
    }
    if (activeLiquidation.estado === 'cerrada') {
      return {
        text: 'Cerrada',
        shortText: 'Cerrada',
        color: 'text-sky-700',
      };
    }
    return {
      text: 'Abierta · Editable',
      shortText: 'Abierta',
      color: 'text-amber-700',
    };
  })();

  const canCloseActive = Boolean(
    activeLiquidation &&
      activeLiquidation.estado === 'borrador' &&
      permissions.canOperate
  );

  const hasItems = Boolean(activeLiquidation && activeLiquidation.items.length > 0);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 pt-safe">
      <div className="px-2.5 lg:px-6 min-h-[56px] py-2 flex items-center justify-between gap-2 lg:gap-3">
        {/* Left: Mobile toggle + Breadcrumb + Active Title */}
        <div className="flex items-center gap-2 lg:gap-3 flex-1 min-w-0 overflow-hidden">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden min-w-[40px] min-h-[40px] -ml-1 inline-flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 min-w-0 overflow-hidden">
              <button
                type="button"
                onClick={() => onSwitchModule('launcher')}
                className="hover:text-[#1E60A8] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Premex
              </button>
              <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
              <span className="text-[#19377B] font-semibold truncate lg:hidden">Viáticos</span>
              <span className="hidden lg:inline text-[#19377B] font-semibold truncate">
                Liquidación de Viáticos
              </span>
              {activeTab === 'liquidador' && statusInfo && (
                <>
                  <span className="text-slate-300 shrink-0">·</span>
                  <span className={`font-semibold truncate ${statusInfo.color}`}>
                    <span className="lg:hidden">{statusInfo.shortText}</span>
                    <span className="hidden lg:inline whitespace-nowrap">{statusInfo.text}</span>
                  </span>
                </>
              )}
            </div>

            <h2 className="text-sm lg:text-base font-bold text-slate-900 tracking-tight truncate leading-tight">
              {activeTab === 'liquidador'
                ? activeLiquidation
                  ? `${activeLiquidation.lineaLiquidacion || 'Sin título'} · Sem #${activeLiquidation.semana || '-'}`
                  : 'Panel de Liquidadores'
                : activeTab === 'sociedades'
                ? 'Sociedades Asignadas'
                : activeTab === 'cerradas'
                ? 'Liquidaciones Cerradas'
                : activeTab === 'contabilidad'
                ? 'Contabilidad y Odoo'
                : activeTab === 'correos'
                ? 'Listas de Correos y Autorizadores'
                : 'Historial y Consultores'}
            </h2>
          </div>
        </div>

        {/* Right: Nueva, Cloud Sync, Consolidated Export Menu, Primary Workflow CTA, Account */}
        <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
          {permissions.canOperate && permissions.canAccessViaticosPanel('liquidador') && (
            <button
              type="button"
              onClick={onCreateNewLiquidation}
              className="hidden lg:inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Iniciar otra liquidación (semana / moneda) sin cerrar las actuales"
            >
              <Plus className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Nueva</span>
            </button>
          )}

          {activeLiquidation && activeTab === 'liquidador' && (
            <div ref={exportMenuRef} className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setExportOpen((v) => !v)}
                disabled={!hasItems}
                aria-expanded={exportOpen}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-45 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Descargar Excel, PDF o enviar liquidación por correo"
              >
                {isDownloadingExcel || isDownloadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E60A8]" />
                ) : (
                  <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
                )}
                <span>Exportar</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {exportOpen && (
                <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                  <button
                    type="button"
                    disabled={!hasItems}
                    onClick={() => {
                      setExportOpen(false);
                      onOpenPlanillaPdfPreview();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                    <span>Vista PDF (Planilla)</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasItems || isDownloadingExcel}
                    onClick={() => {
                      setExportOpen(false);
                      onQuickDownloadExcel();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>Descargar Excel Premex</span>
                  </button>
                  <button
                    type="button"
                    disabled={!hasItems || isDownloadingPdf}
                    onClick={() => {
                      setExportOpen(false);
                      onQuickDownloadPdf();
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                    <span>Descargar PDF Compilado</span>
                  </button>
                  {canCloseActive && (
                    <>
                      <div className="my-1 border-t border-slate-100" />
                      <button
                        type="button"
                        disabled={!hasItems}
                        onClick={() => {
                          setExportOpen(false);
                          onOpenCloseEmailModal();
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#132B63] hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                        <span>Enviar Correo con Soportes</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {permissions.canOperate && (
            <button
              type="button"
              onClick={onSaveToCloud}
              disabled={isSavingCloud}
              aria-label={isSavingCloud ? 'Sincronizando en la nube' : 'Respaldar en la nube'}
              className={`inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] lg:min-w-0 lg:min-h-[36px] px-2.5 lg:px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                isSavingCloud
                  ? 'bg-sky-50 border-sky-200 text-[#132B63]'
                  : hasUnsavedChanges
                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                  : 'bg-white border-slate-200 text-emerald-700 hover:bg-slate-50'
              }`}
              title={
                isSavingCloud
                  ? 'Sincronizando cambios en la nube...'
                  : hasUnsavedChanges
                  ? 'Cambios pendientes de respaldo. Haz clic para reintentar.'
                  : 'Sincronización automática activa en la nube (Firestore)'
              }
            >
              {isSavingCloud ? (
                <Loader2 className="w-4 h-4 lg:w-3.5 lg:h-3.5 animate-spin text-[#1E60A8]" />
              ) : (
                <Cloud
                  className={`w-4 h-4 lg:w-3.5 lg:h-3.5 ${
                    hasUnsavedChanges ? 'text-amber-600' : 'text-emerald-600'
                  }`}
                />
              )}
              <span className="hidden xl:inline">
                {isSavingCloud
                  ? 'Sincronizando...'
                  : hasUnsavedChanges
                  ? 'Guardar*'
                  : 'En la nube'}
              </span>
            </button>
          )}

          {canCloseActive ? (
            <button
              type="button"
              onClick={onOpenCloseConfirmModal}
              disabled={!hasItems}
              className="inline-flex items-center gap-1.5 min-h-[40px] lg:min-h-[36px] px-3.5 lg:px-3 py-1.5 text-xs font-bold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-45 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Cerrar esta liquidación"
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="lg:hidden">Cerrar</span>
              <span className="hidden lg:inline">Cerrar Liquidación</span>
            </button>
          ) : (
            activeLiquidation && (
              <button
                type="button"
                onClick={onOpenCloseEmailModal}
                disabled={!hasItems}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] lg:min-h-[36px] px-3.5 lg:px-3 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-45 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Preparar envío por correo electrónico con Excel y PDF"
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span className="lg:hidden">Enviar</span>
                <span className="hidden lg:inline">Enviar Correo</span>
              </button>
            )
          )}

          {/* Account */}
          {currentUser ? (
            <div className="hidden lg:flex items-center gap-1.5 pl-2 border-l border-slate-200">
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
              className="hidden lg:inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl whitespace-nowrap shrink-0 cursor-pointer"
            >
              Iniciar Sesión
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
