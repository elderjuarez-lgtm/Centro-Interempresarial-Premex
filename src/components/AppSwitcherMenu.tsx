import React, { useState, useRef, useEffect } from 'react';
import { LayoutGrid, ArrowUpRight, Check, Home } from 'lucide-react';
import { ActiveModuleId, SuiteModuleId } from '../types';
import { ModuleEmblem } from './ModuleIcons';

interface AppSwitcherMenuProps {
  currentModule: ActiveModuleId;
  onSelectModule: (moduleId: ActiveModuleId) => void;
  variant?: 'dark' | 'light';
  canAccessModule?: (moduleId: SuiteModuleId) => boolean;
}

interface SwitcherItem {
  id: SuiteModuleId;
  title: string;
  subtitle: string;
  active: boolean;
  target?: ActiveModuleId;
}

const SWITCHER_ITEMS: SwitcherItem[] = [
  {
    id: 'intercompany',
    title: 'Conciliación Intercompany',
    subtitle: 'Internacionales, Nacionales y Anitox',
    active: true,
    target: 'intercompany',
  },
  {
    id: 'bancos',
    title: 'Conciliación Bancaria',
    subtitle: 'Extractos, auxiliar contable y cuadre',
    active: true,
    target: 'bancos',
  },
  {
    id: 'viaticos',
    title: 'Liquidación de Viáticos',
    subtitle: 'Facturas foto/PDF, lectura IA, Excel y PDF',
    active: true,
    target: 'viaticos',
  },
  {
    id: 'actividades',
    title: 'Panel de Actividades',
    subtitle: 'Matriz contable, Gmail y Google Tasks',
    active: true,
    target: 'actividades',
  },
  {
    id: 'clara',
    title: 'Clara · Work Manager · SAP',
    subtitle: 'Automatización de TC, facturas IA y bot SAP',
    active: true,
    target: 'clara',
  },
  {
    id: 'anticipos',
    title: 'Anticipos',
    subtitle: 'Próximamente en hoja de ruta',
    active: false,
  },
  {
    id: 'cxc',
    title: 'Cuentas por Cobrar',
    subtitle: 'Próximamente en hoja de ruta',
    active: false,
  },
  {
    id: 'cxp',
    title: 'Cuentas por Pagar',
    subtitle: 'Próximamente en hoja de ruta',
    active: false,
  },
  {
    id: 'ajustes',
    title: 'Ajustes y Configuraciones',
    subtitle: 'Permisos por correo, roles y empresas',
    active: true,
    target: 'ajustes',
  },
];

export const AppSwitcherMenu: React.FC<AppSwitcherMenuProps> = ({
  currentModule,
  onSelectModule,
  variant = 'dark',
  canAccessModule,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleItems = canAccessModule
    ? SWITCHER_ITEMS.filter((item) => canAccessModule(item.id))
    : SWITCHER_ITEMS;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const buttonClasses =
    variant === 'dark'
      ? 'inline-flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-blue-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer'
      : 'inline-flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:text-[#19377B] hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={buttonClasses}
        title="Cambiar de módulo o volver al Portal Premex"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <LayoutGrid className="w-4 h-4 shrink-0" />
        <span>Módulos</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-2 w-80 bg-white text-slate-800 rounded-2xl border border-slate-200 shadow-xl z-50 overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Suite Premex
            </span>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onSelectModule('launcher');
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E60A8] hover:text-[#132B63] transition-colors cursor-pointer"
            >
              <Home className="w-3.5 h-3.5" />
              <span>Portal principal</span>
            </button>
          </div>

          <div className="p-2 space-y-1 max-h-[70vh] overflow-y-auto">
            {visibleItems.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-500 text-center">
                No tienes módulos habilitados para esta cuenta.
              </div>
            ) : (
              visibleItems.map((item) => {
                const isCurrent = item.target === currentModule;
                const isSettings = item.id === 'ajustes';
                return (
                  <React.Fragment key={item.id}>
                    {isSettings && visibleItems.length > 1 && (
                      <div className="my-1.5 border-t border-slate-100" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        if (item.active && item.target) {
                          onSelectModule(item.target);
                        } else {
                          onSelectModule('launcher');
                        }
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-[#1E60A8]/10 text-[#132B63]'
                          : item.active
                          ? 'hover:bg-slate-50 text-slate-800'
                          : 'hover:bg-slate-50/70 text-slate-500'
                      }`}
                    >
                      <ModuleEmblem moduleId={item.id} className="w-9 h-9 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate leading-tight">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                      {isCurrent ? (
                        <Check className="w-4 h-4 text-[#1E60A8] shrink-0" />
                      ) : item.active ? (
                        <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <span className="text-[11px] font-medium text-slate-400 shrink-0">
                          Pronto
                        </span>
                      )}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
