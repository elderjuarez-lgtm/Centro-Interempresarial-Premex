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
  X
} from 'lucide-react';
import { ActiveTab } from '../types';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  differencesCount: number;
  movementsCount: number;
  entitiesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  isOpenMobile,
  onCloseMobile,
  differencesCount,
  movementsCount,
  entitiesCount,
}) => {
  const menuItems = [
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
      badgeColor: differencesCount > 0 ? 'bg-amber-500 text-white' : 'bg-emerald-600 text-white',
    },
  ];

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
        className={`fixed top-0 bottom-0 left-0 z-50 w-72 bg-gradient-to-b from-[#0a1b33] via-[#0d2242] to-[#09182d] text-white flex flex-col border-r border-blue-900/40 shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="h-20 px-6 flex items-center justify-between border-b border-blue-800/40 bg-[#07162b]/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20 text-white font-bold ring-2 ring-blue-400/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-base tracking-tight text-white leading-tight">
                Centro Interempresarial
              </h1>
              <p className="text-xs text-blue-300/80 font-medium">
                Conciliación Anitox
              </p>
            </div>
          </div>

          <button
            onClick={onCloseMobile}
            className="lg:hidden p-1.5 text-blue-300 hover:text-white rounded-lg hover:bg-blue-800/50"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Single Active Reconciliation Badge (Anitox) */}
        <div className="px-3.5 py-3 mx-3.5 my-3 rounded-xl bg-blue-950/70 border border-blue-800/50 space-y-2">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-blue-300/80 px-0.5">
            <span>Conciliación Activa</span>
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Activo
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 bg-blue-600/90 px-3 py-2.5 rounded-lg border border-blue-400/30 shadow-sm shadow-blue-600/30">
            <div className="flex items-center gap-2 min-w-0">
              <Layers className="w-4 h-4 text-blue-100 shrink-0" />
              <span className="text-sm font-bold text-white truncate">Anitox</span>
            </div>
            <span className="text-[10px] font-medium text-blue-100 shrink-0">
              {entitiesCount} emp. • {movementsCount} mov.
            </span>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="px-4 py-2 text-[11px] font-semibold tracking-wider text-blue-300/70 uppercase">
          Módulos Principales
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full group text-left px-3.5 py-3 rounded-xl flex items-center justify-between transition-all duration-150 ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                    : 'text-blue-100/90 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-blue-950/60 text-blue-300 group-hover:bg-blue-800/50 group-hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="truncate text-left">
                    <div className="text-sm font-medium leading-tight">
                      {item.label}
                    </div>
                    <div
                      className={`text-[11px] truncate ${
                        isActive ? 'text-blue-100' : 'text-blue-300/60'
                      }`}
                    >
                      {item.description}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-2">
                  {item.badge && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-semibold shadow-xs ${
                        isActive
                          ? 'bg-white text-blue-900'
                          : item.badgeColor || 'bg-blue-800 text-blue-100'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-4 h-4 text-blue-200" />}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer info & Google Sheets ready badge */}
        <div className="p-4 border-t border-blue-900/40 bg-[#07162b]/70">
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-blue-950/50 border border-blue-800/30 text-xs text-blue-200">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-100 truncate">Sincronización Sheets</p>
              <p className="text-[10px] text-blue-300/70 truncate">Exportación en vivo activada</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
