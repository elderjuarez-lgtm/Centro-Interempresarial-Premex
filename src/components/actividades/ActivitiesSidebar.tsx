import React from 'react';
import {
  LayoutGrid,
  CheckSquare,
  MailCheck,
  SlidersHorizontal,
  ChevronRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import { ActiveModuleId, ActivitiesTab, EffectivePermissions } from '../../types';
import { ActividadesModuleLogo, PremexBrandLogo } from '../ModuleIcons';
import { AppSwitcherMenu } from '../AppSwitcherMenu';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { formatPeriodLabel } from '../../utils/activities';

interface ActivitiesSidebarProps {
  activeTab: ActivitiesTab;
  setActiveTab: (tab: ActivitiesTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  selectedPeriod: string;
  totalAssignments: number;
  completedCount: number;
  pendingCount: number;
  overdueCount: number;
  myPendingCount: number;
  syncedTasksCount: number;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
}

export const ActivitiesSidebar: React.FC<ActivitiesSidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  onCloseMobile,
  selectedPeriod,
  totalAssignments,
  completedCount,
  pendingCount,
  overdueCount,
  myPendingCount,
  syncedTasksCount,
  onSwitchModule,
  permissions,
}) => {
  const completionPct =
    totalAssignments > 0 ? Math.round((completedCount / totalAssignments) * 100) : 0;

  const allMenuItems: {
    id: ActivitiesTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string | null;
    adminOnly?: boolean;
  }[] = [
    {
      id: 'matriz',
      label: 'Matriz de Actividades',
      description: 'Sociedades y avance',
      icon: LayoutGrid,
      counter: totalAssignments > 0 ? `${completedCount}/${totalAssignments}` : null,
    },
    {
      id: 'pendientes',
      label: permissions.isAdmin ? 'Seguimiento y Tareas' : 'Mis Actividades',
      description: 'Fechas y confirmaciones',
      icon: CheckSquare,
      counter: myPendingCount > 0 ? `${myPendingCount}` : pendingCount > 0 ? `${pendingCount}` : null,
    },
    {
      id: 'sincronizacion',
      label: 'Gmail y Google Tasks',
      description: 'Tareas y notificaciones',
      icon: MailCheck,
      counter: syncedTasksCount > 0 ? `${syncedTasksCount}` : null,
    },
    {
      id: 'configuracion',
      label: 'Catálogo y Destinatarios',
      description: 'Actividades, sociedades y equipo',
      icon: SlidersHorizontal,
      counter: null,
      adminOnly: true,
    },
  ];

  const menuItems = allMenuItems.filter((item) => !item.adminOnly || permissions.isAdmin);

  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 lg:hidden backdrop-blur-xs print:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0E224D] text-white flex flex-col border-r border-blue-900/40 transition-transform duration-200 ease-out lg:translate-x-0 print:hidden ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
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
              currentModule="actividades"
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

        <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3">
          <ActividadesModuleLogo className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-[13px] tracking-tight text-white truncate">
              Panel de Actividades
            </h1>
            <p className="text-[11px] text-emerald-200/85 truncate">
              Cierre · Gmail &amp; Tasks
            </p>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-white/10 bg-[#0A1838]/30 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white truncate">
              {formatPeriodLabel(selectedPeriod)}
            </span>
            <span className="text-xs font-bold text-emerald-300 tabular-nums shrink-0">
              {completionPct}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-blue-200/80 tabular-nums">
            <span>{completedCount} realizadas</span>
            <span>
              {pendingCount} pend.{overdueCount > 0 ? ` · ${overdueCount} venc.` : ''}
            </span>
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
                  {item.counter && (
                    <span
                      className={`text-[11px] font-mono font-semibold tabular-nums ${
                        isActive ? 'text-white' : 'text-sky-200/80'
                      }`}
                    >
                      {item.counter}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-sky-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-3.5 pb-safe border-t border-white/10 bg-[#0A1838]/70 space-y-2">
          <PWAInstallButton variant="sidebar" />
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onSwitchModule('launcher');
            }}
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
