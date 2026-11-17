import React from 'react';
import { 
  LayoutDashboard, 
  UploadCloud, 
  ReceiptText, 
  Grid3X3, 
  AlertTriangle,
  FileSpreadsheet,
  Building2,
  ChevronRight,
  Layers,
  ArrowLeft,
  X
} from 'lucide-react';
import { ActiveModuleId, ActiveTab, EffectivePermissions } from '../types';
import { IntercompanyModuleLogo, PremexBrandLogo } from './ModuleIcons';
import { AppSwitcherMenu } from './AppSwitcherMenu';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  differencesCount: number;
  movementsCount: number;
  entitiesCount: number;
  onSwitchModule?: (moduleId: ActiveModuleId) => void;
  permissions?: EffectivePermissions;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  onCloseMobile,
  differencesCount,
  movementsCount,
  entitiesCount,
  onSwitchModule,
  permissions,
}) => {
  const allMenuItems = [
    {
      id: 'inicio' as ActiveTab,
      label: 'Inicio',
      description: 'Panel de control general',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'empresas' as ActiveTab,
      label: 'Empresas a Conciliar',
      description: 'Empresas que alimentan la matriz',
      icon: Building2,
      badge: entitiesCount > 0 ? entitiesCount : null,
    },
    {
      id: 'carga' as ActiveTab,
      label: 'Carga de Archivos',
      description: 'Importar Excel (CxC y CxP)',
      icon: UploadCloud,
      badge: null,
    },
    {
      id: 'movimientos' as ActiveTab,
      label: 'Movimientos',
      description: 'Registro de facturas y partidas',
      icon: ReceiptText,
      badge: movementsCount > 0 ? movementsCount : null,
    },
    {
      id: 'conciliacion' as ActiveTab,
      label: 'Conciliación',
      description: 'Matrices de CxC y CxP',
      icon: Grid3X3,
      badge: null,
    },
    {
      id: 'diferencias' as ActiveTab,
      label: 'Diferencias de Conciliación',
      description: 'Comparativa CxC vs CxP',
      icon: AlertTriangle,
      badge: differencesCount > 0 ? `${differencesCount}` : null,
      badgeColor: differencesCount > 0 ? 'text-amber-300' : 'text-emerald-300',
    },
  ];

  const menuItems = permissions?.isReadOnly
    ? allMenuItems.filter((item) => item.id !== 'carga')
    : allMenuItems;

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div 
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-gradient-to-b from-[#0E224D] via-[#132E66] to-[#0B1C3F] text-white flex flex-col border-r border-blue-900/40 shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Premex Brand & Modular App Switcher */}
        <div className="px-4 py-3.5 flex items-center justify-between gap-2 border-b border-white/10 bg-[#0A1838]/70">
          <button
            type="button"
            onClick={() => onSwitchModule?.('launcher')}
            title="Volver al Portal de Módulos Premex"
            className="bg-white rounded-xl px-2.5 py-1.5 flex items-center shadow-xs hover:opacity-95 transition-opacity cursor-pointer"
          >
            <PremexBrandLogo className="h-7 w-auto" />
          </button>

          <div className="flex items-center gap-1">
            {onSwitchModule && (
              <AppSwitcherMenu
                currentModule="intercompany"
                onSelectModule={(mod) => {
                  onCloseMobile();
                  onSwitchModule(mod);
                }}
                canAccessModule={permissions?.canAccessModule}
                variant="dark"
              />
            )}
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 text-blue-300 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Active Module Header */}
        <div className="px-5 py-4 flex items-center gap-3 border-b border-white/10">
          <IntercompanyModuleLogo className="w-10 h-10 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-sm tracking-tight text-white leading-tight truncate">
              Conciliación Intercompany
            </h1>
            <p className="text-[11px] text-sky-200/80 font-medium truncate">
              Centro Interempresarial · Anitox
            </p>
          </div>
        </div>

        {/* Single Active Reconciliation Context (Anitox) */}
        <div className="px-3.5 py-2.5 mx-3.5 my-3 rounded-xl bg-white/8 border border-white/12">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-sky-200/80">
            <span>Sociedad / Grupo</span>
            <span className="text-emerald-300 font-semibold">Activo</span>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-sky-300 shrink-0" />
              <span className="text-sm font-bold text-white truncate">Anitox</span>
            </div>
            <span className="text-[11px] font-mono text-sky-100/90 tabular-nums shrink-0">
              {entitiesCount} emp. · {movementsCount} mov.
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="px-4 py-2 text-[11px] font-semibold tracking-wider text-sky-200/60 uppercase">
          Vistas del Módulo
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setActiveTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full group text-left px-3.5 py-2.5 rounded-xl flex items-center justify-between transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#1E60A8] text-white font-semibold shadow-sm'
                    : 'text-blue-100/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-white/8 text-sky-200 group-hover:bg-white/15 group-hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="truncate text-left">
                    <div className="text-sm font-medium leading-tight">
                      {item.label}
                    </div>
                    <div
                      className={`text-[11px] truncate mt-0.5 ${
                        isActive ? 'text-sky-100' : 'text-blue-200/60'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  {item.badge && (
                    <span
                      className={`text-[11px] font-mono font-semibold tabular-nums ${
                        isActive
                          ? 'text-white'
                          : item.badgeColor || 'text-sky-200/90'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-4 h-4 text-sky-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer: Return to Modular Hub & Google Sheets Ready */}
        <div className="p-3.5 border-t border-white/10 bg-[#0A1838]/70 space-y-2">
          {onSwitchModule && (
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onSwitchModule('launcher');
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-semibold text-sky-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al Portal de Módulos</span>
            </button>
          )}
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] text-sky-200/80">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Sincronización Google Sheets disponible</span>
          </div>
        </div>
      </aside>
    </>
  );
};

