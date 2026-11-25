import React from 'react';
import {
  FileScan,
  ShieldCheck,
  Send,
  Users,
  Cpu,
  ChevronRight,
  X,
  ArrowLeft,
  UserCheck,
} from 'lucide-react';
import { ActiveModuleId, ClaraTab, EffectivePermissions } from '../../types';
import { PremexBrandLogo, ClaraModuleLogo } from '../ModuleIcons';
import { AppSwitcherMenu } from '../AppSwitcherMenu';
import { PWAInstallButton } from '../PWAInstallPrompt';
import { ROLE_METADATA, USER_TYPE_METADATA } from '../../utils/permissions';

interface ClaraSidebarProps {
  activeTab: ClaraTab;
  onSelectTab: (tab: ClaraTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
  transactionsCount: number;
  pendingWmCount: number;
  readySapCount: number;
  pendingVendorsCount: number;
  logsCount: number;
  agentConnected: boolean;
}

export const ClaraSidebar: React.FC<ClaraSidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  onSwitchModule,
  permissions,
  transactionsCount,
  pendingWmCount,
  readySapCount,
  pendingVendorsCount,
  logsCount,
  agentConnected,
}) => {
  const navItems: {
    id: ClaraTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string;
  }[] = [
    {
      id: 'bandeja',
      label: 'Extracción Clara & IA',
      description: 'Movimientos Clara, facturas y cuadre',
      icon: FileScan,
      counter: String(transactionsCount),
    },
    {
      id: 'workmanager',
      label: 'Validación Work Manager',
      description: 'Radicación :8037 y cruce documental',
      icon: ShieldCheck,
      counter: String(pendingWmCount),
    },
    {
      id: 'contabilizacion',
      label: 'Despacho Bot SAP',
      description: 'Paquete JSON, FB60 y seguimiento BELNR',
      icon: Send,
      counter: String(readySapCount),
    },
    {
      id: 'terceros',
      label: 'Terceros y Reglas CC',
      description: 'Homologación NIT y centros de costo SAP',
      icon: Users,
      counter: String(pendingVendorsCount),
    },
    {
      id: 'conectores',
      label: 'Conectores RPA & Bitácora',
      description: 'Clara, Work Manager :8037, Agente y logs',
      icon: Cpu,
      counter: String(logsCount),
    },
  ];

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
              currentModule="clara"
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
          <ClaraModuleLogo className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-[13px] tracking-tight text-white truncate">
              Clara · WM · SAP
            </h1>
            <p className="text-[11px] text-indigo-200/85 truncate">
              RPA Gastos Corporativos
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
                      active ? 'text-white' : 'text-indigo-200/80 group-hover:text-white'
                    }`}
                  />
                  <span className="text-[13px] truncate">{item.label}</span>
                </div>
                <div className="flex items-center gap-1.5 ml-2 shrink-0">
                  {item.counter !== undefined && (
                    <span
                      className={`text-[11px] font-mono font-semibold tabular-nums ${
                        active ? 'text-white' : 'text-indigo-200/80'
                      }`}
                    >
                      {item.counter}
                    </span>
                  )}
                  {active && <ChevronRight className="w-3.5 h-3.5 text-indigo-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        <div className="px-4 py-3 border-t border-white/10 bg-[#0A1838]/40 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200/75">
            <UserCheck className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
            <span>
              {userTypeLabel} · {roleLabel}
            </span>
          </div>
          <p className="text-xs text-white/90 font-medium leading-snug truncate">
            {agentConnected ? 'Agente RPA local en línea' : 'Modo Web Híbrido + IA'}
          </p>
        </div>

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
