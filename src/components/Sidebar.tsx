import React from 'react';
import { 
  LayoutDashboard, 
  UploadCloud, 
  ReceiptText, 
  Grid3X3, 
  AlertTriangle,
  Building2,
  ChevronRight,
  Layers,
  ArrowLeft,
  X
} from 'lucide-react';
import {
  ActiveModuleId,
  ActiveTab,
  EffectivePermissions,
  ReconciliationScope,
} from '../types';
import {
  INTERCOMPANY_SCOPES,
  INTERCOMPANY_SCOPE_META,
  getIntercompanyScopeLabel,
} from '../utils/demoData';
import { IntercompanyModuleLogo, PremexBrandLogo } from './ModuleIcons';
import { AppSwitcherMenu } from './AppSwitcherMenu';
import { PWAInstallButton } from './PWAInstallPrompt';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  activeScope: ReconciliationScope;
  onChangeScope: (scope: ReconciliationScope) => void;
  scopeSummary: Record<ReconciliationScope, { entities: number; movements: number }>;
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
  activeScope,
  onChangeScope,
  scopeSummary,
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
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0E224D] text-white flex flex-col border-r border-blue-900/40 transition-transform duration-200 ease-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top Premex Brand & Modular App Switcher */}
        <div className="px-4 h-14 pt-safe flex items-center justify-between gap-2 border-b border-white/10 bg-[#0A1838]/70 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchModule?.('launcher')}
            title="Volver al Portal de Módulos Premex"
            className="bg-white rounded-lg px-2 py-1 flex items-center hover:opacity-95 transition-opacity cursor-pointer"
          >
            <PremexBrandLogo className="h-6 w-auto" />
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
        <div className="px-4 py-3.5 flex items-center gap-3 border-b border-white/10">
          <IntercompanyModuleLogo className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-[13px] tracking-tight text-white leading-tight truncate">
              Conciliación Intercompany
            </h1>
            <p className="text-[11px] text-sky-200/80 truncate">
              {getIntercompanyScopeLabel(activeScope)}
            </p>
          </div>
        </div>

        {/* 3-Scope Intercompany Selector */}
        <div className="px-3 py-3 border-b border-white/10 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-sky-200/70 px-1.5">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-sky-300 shrink-0" />
              <span>Ámbito</span>
            </span>
            <span className="font-mono text-sky-200/90">
              {INTERCOMPANY_SCOPE_META[activeScope].defaultCurrency}
            </span>
          </div>

          <div className="space-y-0.5">
            {INTERCOMPANY_SCOPES.map((scope) => {
              const meta = INTERCOMPANY_SCOPE_META[scope];
              const isSelected = activeScope === scope;
              const summary = scopeSummary[scope] || { entities: 0, movements: 0 };
              return (
                <button
                  key={scope}
                  type="button"
                  onClick={() => {
                    onChangeScope(scope);
                    onCloseMobile();
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#1E60A8] text-white font-semibold'
                      : 'text-blue-100/80 hover:bg-white/8 hover:text-white'
                  }`}
                >
                  <span className="text-xs truncate">{meta.label}</span>
                  <span
                    className={`text-[10px] font-mono tabular-nums shrink-0 ${
                      isSelected ? 'text-sky-100' : 'text-blue-200/60'
                    }`}
                  >
                    {summary.entities}·{summary.movements}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                type="button"
                title={item.description}
                onClick={() => {
                  setActiveTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full group text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1E60A8] text-white font-semibold'
                    : 'text-blue-100/85 hover:bg-white/8 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : 'text-sky-200/80 group-hover:text-white'
                    }`}
                  />
                  <span className="text-[13px] truncate">{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  {item.badge && (
                    <span
                      className={`text-[11px] font-mono font-semibold tabular-nums ${
                        isActive
                          ? 'text-white'
                          : item.badgeColor || 'text-sky-200/80'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-sky-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer: PWA Install & Return to Modular Hub */}
        <div className="p-3.5 pb-safe border-t border-white/10 bg-[#0A1838]/70 space-y-2">
          <PWAInstallButton variant="sidebar" />
          {onSwitchModule && (
            <button
              type="button"
              onClick={() => {
                onCloseMobile();
                onSwitchModule('launcher');
              }}
              className="w-full min-h-[42px] flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-semibold text-sky-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al Portal de Módulos</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

