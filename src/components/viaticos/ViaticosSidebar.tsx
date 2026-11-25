import React from 'react';
import {
  FileText,
  FolderClock,
  Archive,
  Calculator,
  ChevronRight,
  X,
  ArrowLeft,
  UserCheck,
  Mail,
  Building2,
} from 'lucide-react';
import { ActiveModuleId, EffectivePermissions, ViaticosTab } from '../../types';
import { PremexBrandLogo, ViaticosModuleLogo } from '../ModuleIcons';
import { AppSwitcherMenu } from '../AppSwitcherMenu';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { ROLE_METADATA, USER_TYPE_METADATA } from '../../utils/permissions';

interface ViaticosSidebarProps {
  activeTab: ViaticosTab;
  onSelectTab: (tab: ViaticosTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
  openLiquidacionesCount: number;
  closedLiquidacionesCount: number;
  accountingLiquidacionesCount: number;
  liquidacionesCount: number;
  sociedadesCount?: number;
  emailGroupsCount?: number;
  consultorScopeLabel: string;
}

export const ViaticosSidebar: React.FC<ViaticosSidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  onSwitchModule,
  permissions,
  openLiquidacionesCount,
  closedLiquidacionesCount,
  accountingLiquidacionesCount,
  liquidacionesCount,
  sociedadesCount,
  emailGroupsCount,
  consultorScopeLabel,
}) => {
  const allNavItems: {
    id: ViaticosTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string;
  }[] = [
    {
      id: 'liquidador',
      label: 'Liquidadores',
      description: 'Abiertas, facturas y planilla',
      icon: FileText,
      counter: String(openLiquidacionesCount),
    },
    {
      id: 'sociedades',
      label: 'Sociedad',
      description: 'Sociedades asignadas y catálogo',
      icon: Building2,
      counter: typeof sociedadesCount === 'number' ? String(sociedadesCount) : undefined,
    },
    {
      id: 'cerradas',
      label: 'Liquidaciones Cerradas',
      description: 'Consulta, Excel y PDF cerrados',
      icon: Archive,
      counter: String(closedLiquidacionesCount),
    },
    {
      id: 'contabilidad',
      label: 'Contabilidad',
      description: 'Consolidado Odoo · Centros de costo',
      icon: Calculator,
      counter: String(accountingLiquidacionesCount),
    },
    {
      id: 'historial',
      label: 'Historial y Consultores',
      description: 'Todas las semanas y catálogo',
      icon: FolderClock,
      counter: String(liquidacionesCount),
    },
    {
      id: 'correos',
      label: 'Listas de Correos',
      description: 'Autorizadores y copia contable',
      icon: Mail,
      counter: typeof emailGroupsCount === 'number' ? String(emailGroupsCount) : undefined,
    },
  ];

  const navItems = allNavItems.filter((item) => permissions.canAccessViaticosPanel(item.id));
  const roleLabel = ROLE_METADATA[permissions.role].label;
  const userTypeLabel = USER_TYPE_METADATA[permissions.userType]?.shortLabel || 'Usuario';

  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0E224D] text-white flex flex-col border-r border-blue-900/40 transition-transform duration-200 ease-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand + App Switcher Header */}
        <div className="px-4 h-14 pt-safe flex items-center justify-between gap-2 border-b border-white/10 bg-[#0A1838]/70 shrink-0">
          <button
            type="button"
            onClick={() => onSwitchModule('launcher')}
            title="Volver al Portal de Módulos Premex"
            className="bg-white rounded-lg px-2 py-1 flex items-center hover:opacity-95 transition-opacity cursor-pointer"
          >
            <PremexBrandLogo className="h-6 w-auto" />
          </button>

          <div className="flex items-center gap-1">
            <AppSwitcherMenu
              currentModule="viaticos"
              onSelectModule={(mod) => {
                onCloseMobile();
                onSwitchModule(mod);
              }}
              canAccessModule={permissions.canAccessModule}
              variant="dark"
            />
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden p-1.5 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Module Identity Block */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3">
          <ViaticosModuleLogo className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-[13px] tracking-tight text-white truncate">
              Liquidación de Viáticos
            </h1>
            <p className="text-[11px] text-sky-200/80 truncate">
              Lectura IA · Odoo y Planilla
            </p>
          </div>
        </div>

        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={item.description}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full group text-left px-3 py-2.5 rounded-lg flex items-center justify-between transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#1E60A8] text-white font-semibold'
                    : 'text-blue-100/85 hover:bg-white/8 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-white' : 'text-sky-200/80 group-hover:text-white'
                    }`}
                  />
                  <span className="text-[13px] truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  {item.counter && (
                    <span
                      className={`text-[11px] font-mono font-semibold tabular-nums ${
                        active ? 'text-white' : 'text-sky-200/80'
                      }`}
                    >
                      {item.counter}
                    </span>
                  )}
                  {active && <ChevronRight className="w-3.5 h-3.5 text-sky-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Active Consultant / Role Context */}
        <div className="px-4 py-3 border-t border-white/10 bg-[#0A1838]/40 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-sky-200/70">
            <UserCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>
              {userTypeLabel} · {roleLabel}
            </span>
          </div>
          <p className="text-xs text-white/90 font-medium leading-snug truncate" title={consultorScopeLabel}>
            {consultorScopeLabel}
          </p>
        </div>

        {/* Install App + Return to Launcher */}
        <div className="p-3.5 pb-safe border-t border-white/10 bg-[#0A1838]/70 space-y-2">
          <PWAInstallButton variant="sidebar" />
          <button
            type="button"
            onClick={() => onSwitchModule('launcher')}
            className="w-full min-h-[42px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-semibold text-sky-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Portal de Módulos</span>
          </button>
        </div>
      </aside>
    </>
  );
};
