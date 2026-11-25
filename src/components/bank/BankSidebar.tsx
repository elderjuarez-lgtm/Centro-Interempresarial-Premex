import React from 'react';
import {
  LayoutDashboard,
  History,
  AlertCircle,
  Landmark,
  UploadCloud,
  ChevronRight,
  ArrowLeft,
  X,
} from 'lucide-react';
import { ActiveModuleId, BankAccount, BankTab, EffectivePermissions } from '../../types';
import { BancosModuleLogo, PremexBrandLogo } from '../ModuleIcons';
import { AppSwitcherMenu } from '../AppSwitcherMenu';
import { PWAInstallButton } from '../PWAInstallPrompt';

interface BankSidebarProps {
  activeTab: BankTab;
  setActiveTab: (tab: BankTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  selectedAccount: BankAccount | null;
  societiesCount: number;
  accountsCount: number;
  openItemsCount: number;
  squaredAccountsCount: number;
  closedCount: number;
  openPeriod: string | null;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
}

export const BankSidebar: React.FC<BankSidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  onCloseMobile,
  selectedAccount,
  societiesCount,
  accountsCount,
  openItemsCount,
  squaredAccountsCount,
  closedCount,
  openPeriod,
  onSwitchModule,
  permissions,
}) => {
  const allMenuItems: {
    id: BankTab;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    counter?: string | null;
  }[] = [
    {
      id: 'resumen',
      label: 'Centro de Cuadre',
      description: 'Sociedades, bancos y formato oficial',
      icon: LayoutDashboard,
      counter: accountsCount > 0 ? `${squaredAccountsCount}/${accountsCount}` : null,
    },
    {
      id: 'pendientes',
      label: 'Partidas Abiertas',
      description: 'Gestión FBL3N, clases SAP y ajustes',
      icon: AlertCircle,
      counter: openItemsCount > 0 ? String(openItemsCount) : null,
    },
    {
      id: 'cuentas',
      label: 'Sociedades y Cuentas',
      description: 'Maestro sociedades y subcuentas 00/01/02',
      icon: Landmark,
      counter: `${societiesCount}·${accountsCount}`,
    },
    {
      id: 'carga',
      label: 'Carga Masiva SAP',
      description: 'Catálogo, Balance 00/01/02 y FBL3N',
      icon: UploadCloud,
      counter: null,
    },
    {
      id: 'historial',
      label: 'Historial de Conciliaciones',
      description: 'Consulta de periodos cerrados y PDF/Excel',
      icon: History,
      counter: closedCount > 0 ? String(closedCount) : null,
    },
  ];

  const menuItems = permissions.isReadOnly
    ? allMenuItems.filter((item) => item.id !== 'carga')
    : allMenuItems;

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
        {/* Top Premex Logo & App Switcher Bar */}
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
              currentModule="bancos"
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

        {/* Active Module Identity Header */}
        <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3">
          <BancosModuleLogo className="w-8 h-8 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-bold text-[13px] tracking-tight text-white truncate">
              Conciliación Bancaria
            </h1>
            <p className="text-[11px] text-sky-200/80 truncate">
              Tesorería SAP 00 / 01 / 02
            </p>
          </div>
        </div>

        {/* Active Account Context Strip */}
        {selectedAccount && (
          <div className="px-4 py-3 border-b border-white/10 space-y-0.5 bg-[#0A1838]/30">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-200/70 truncate">
              {selectedAccount.codigoSociedad
                ? `Soc. ${selectedAccount.codigoSociedad} · ${selectedAccount.sociedad}`
                : selectedAccount.sociedad}
            </div>
            <div className="text-xs font-bold text-white truncate">
              {selectedAccount.banco}
            </div>
            <div className="text-[11px] text-blue-200/80 font-mono truncate">
              {selectedAccount.cuentaMayor00
                ? `Cta 00: ${selectedAccount.cuentaMayor00}`
                : selectedAccount.numeroCuenta}{' '}
              · {selectedAccount.moneda}
            </div>
            <div className="text-[11px] text-sky-200/85 truncate pt-0.5">
              {openPeriod ? `Ciclo abierto · ${openPeriod}` : 'Sin conciliación abierta'}
            </div>
          </div>
        )}

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

        {/* Install App + Return to Modular Hub Footer */}
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
