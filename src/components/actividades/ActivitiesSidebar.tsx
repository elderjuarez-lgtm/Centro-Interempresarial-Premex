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
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-gradient-to-b from-[#0E224D] via-[#132E66] to-[#0B1C3F] text-white flex flex-col border-r border-blue-900/40 shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 print:hidden ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-3.5 flex items-center justify-between gap-2 border-b border-white/10 bg-[#0A1838]/70">
          <button
            type="button"
            onClick={() => onSwitchModule('launcher')}
            title="Volver al Portal de Módulos Premex"
            className="bg-white rounded-xl px-2.5 py-1.5 flex items-center shadow-xs hover:opacity-95 transition-opacity cursor-pointer"
          >
            <PremexBrandLogo className="h-7 w-auto" />
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

        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
          <ActividadesModuleLogo className="w-10 h-10 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-sm tracking-tight text-white truncate">
              Panel de Actividades
            </h1>
            <p className="text-[11px] text-emerald-200/85 truncate">
              Cierre Contable · Gmail &amp; Tasks
            </p>
          </div>
        </div>

        <div className="mx-3.5 my-3 px-3.5 py-3 rounded-xl bg-white/8 border border-white/12">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-200/80">
              Periodo Activo
            </span>
            <span className="text-xs font-bold text-emerald-300 tabular-nums">
              {completionPct}%
            </span>
          </div>
          <div className="text-sm font-bold text-white truncate mt-0.5">
            {formatPeriodLabel(selectedPeriod)}
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-blue-200/85 tabular-nums">
            <span>{completedCount} realizadas</span>
            <span>
              {pendingCount} pend.{overdueCount > 0 ? ` · ${overdueCount} venc.` : ''}
            </span>
          </div>
        </div>

        <div className="px-4 py-2 text-[11px] font-semibold tracking-wider text-sky-200/60 uppercase">
          Navegación
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
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight truncate">
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
                  {item.counter && (
                    <span
                      className={`text-[11px] font-mono font-semibold tabular-nums ${
                        isActive ? 'text-white' : 'text-sky-200/90'
                      }`}
                    >
                      {item.counter}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-4 h-4 text-sky-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="p-3.5 border-t border-white/10 bg-[#0A1838]/70">
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onSwitchModule('launcher');
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-xs font-semibold text-sky-100 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver al Portal de Módulos</span>
          </button>
        </div>
      </aside>
    </>
  );
};
