import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Menu,
  ChevronRight,
  ChevronDown,
  Cloud,
  Loader2,
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { ActiveModuleId, ClaraTab, EffectivePermissions } from '../../types';

interface ClaraHeaderProps {
  activeTab: ClaraTab;
  selectedPeriod: string;
  availablePeriods: string[];
  onChangePeriod: (period: string) => void;
  onToggleMobileMenu: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  onReconcileAll: () => void;
  onDownloadClaraTemplate: () => void;
  onDownloadWmTemplate: () => void;
  onDownloadSapJson: () => void;
  onDownloadSapExcel: () => void;
  onSaveToCloud: () => void;
  isSavingCloud: boolean;
  hasUnsavedChanges: boolean;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  permissions: EffectivePermissions;
}

const TAB_TITLES: Record<ClaraTab, string> = {
  bandeja: 'Extracción Clara y Lectura IA de Facturas',
  workmanager: 'Validación de Radicación en Work Manager (:8037)',
  contabilizacion: 'Centro de Despacho y Contabilización SAP',
  terceros: 'Catálogo de Terceros y Reglas de Centros de Costo',
  conectores: 'Panel de Control RPA, Conectores y Bitácora',
};

export const ClaraHeader: React.FC<ClaraHeaderProps> = ({
  activeTab,
  selectedPeriod,
  availablePeriods,
  onChangePeriod,
  onToggleMobileMenu,
  onSwitchModule,
  onReconcileAll,
  onDownloadClaraTemplate,
  onDownloadWmTemplate,
  onDownloadSapJson,
  onDownloadSapExcel,
  onSaveToCloud,
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

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 pt-safe">
      <div className="px-3 lg:px-6 min-h-[56px] py-2 flex items-center justify-between gap-2 lg:gap-3">
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
              <span className="text-[#19377B] font-semibold truncate">
                Automatización Clara · WM · SAP
              </span>
            </div>
            <h2 className="text-sm lg:text-base font-bold text-slate-900 tracking-tight truncate leading-tight">
              {TAB_TITLES[activeTab]}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
          <select
            aria-label="Filtrar por periodo"
            value={selectedPeriod}
            onChange={(e) => onChangePeriod(e.target.value)}
            className="hidden sm:block min-h-[36px] px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 cursor-pointer"
          >
            <option value="ALL">Todos los periodos</option>
            {availablePeriods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onReconcileAll}
            className="hidden md:inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Recalcular cruces entre Clara, Facturas IA, Work Manager y Reglas SAP"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#1E60A8]" />
            <span>Recalcular Cruces</span>
          </button>

          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span className="hidden sm:inline">Exportar</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {exportOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    onDownloadSapJson();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#132B63] hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <FileJson className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                  <span>Paquete JSON Bot SAP</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    onDownloadSapExcel();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>Excel Lote Contable SAP</span>
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    onDownloadClaraTemplate();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Plantilla Carga Clara</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExportOpen(false);
                    onDownloadWmTemplate();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Plantilla Work Manager</span>
                </button>
              </div>
            )}
          </div>

          {permissions.canOperate && (
            <button
              type="button"
              onClick={onSaveToCloud}
              disabled={isSavingCloud}
              className={`inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-bold rounded-xl border transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 ${
                isSavingCloud
                  ? 'bg-sky-50 border-sky-200 text-[#132B63]'
                  : hasUnsavedChanges
                  ? 'bg-[#132B63] border-[#132B63] text-white hover:bg-[#1E60A8]'
                  : 'bg-white border-slate-200 text-emerald-700 hover:bg-slate-50'
              }`}
              title={
                hasUnsavedChanges
                  ? 'Guardar cambios en la nube (Firestore)'
                  : 'Sincronizado en la nube'
              }
            >
              {isSavingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5" />
              )}
              <span className="hidden xl:inline">
                {isSavingCloud ? 'Guardando...' : hasUnsavedChanges ? 'Guardar Nube*' : 'En la nube'}
              </span>
            </button>
          )}

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
