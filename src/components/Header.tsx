import React from 'react';
import { 
  Menu, 
  FileSpreadsheet, 
  Download, 
  LogOut, 
  CheckCircle2,
  Calendar,
  Save,
  Lock,
  Layers
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ActiveTab, ClosedMonthRecord, EntityMapping } from '../types';
import { downloadExcelTemplate } from '../utils/excel';

interface HeaderProps {
  activeTab: ActiveTab;
  onToggleMobileMenu: () => void;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onOpenGoogleSheetsModal: () => void;
  onOpenSaveModal: () => void;
  hasUnsavedChanges?: boolean;
  hasToken: boolean;
  selectedMonth: string;
  setSelectedMonth: (m: string) => void;
  availableMonths: string[];
  closedMonths?: Record<string, ClosedMonthRecord>;
  entities?: EntityMapping[];
}

const TAB_TITLES: Record<ActiveTab, { title: string; subtitle: string }> = {
  inicio: {
    title: 'Panel General de Conciliación',
    subtitle: 'Visión consolidada de saldos, partidas abiertas y estado de cuadre intercompany',
  },
  empresas: {
    title: 'Empresas a Conciliar',
    subtitle: 'Listado oficial y orden de las empresas que conforman las matrices',
  },
  carga: {
    title: 'Carga de Archivos',
    subtitle: 'Importación de libro Excel con hojas de Cuentas por cobrar y Cuentas por pagar',
  },
  movimientos: {
    title: 'Movimientos Detallados',
    subtitle: 'Auditoría de facturas registradas clasificadas en CXC y CXP',
  },
  conciliacion: {
    title: 'Matrices de Conciliación',
    subtitle: 'Matriz de Cuentas por Cobrar y Matriz de Cuentas por Pagar bilaterales',
  },
  diferencias: {
    title: 'Diferencias de Conciliación',
    subtitle: 'Cálculo de disparidades (CxC - CxP de contraparte) con comentarios editables',
  },
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onToggleMobileMenu,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  onOpenGoogleSheetsModal,
  onOpenSaveModal,
  hasUnsavedChanges = false,
  hasToken,
  selectedMonth,
  setSelectedMonth,
  availableMonths,
  closedMonths = {},
  entities = [],
}) => {
  const isSelectedMonthClosed = selectedMonth !== 'ALL' && Boolean(closedMonths[selectedMonth]);
  const currentInfo = TAB_TITLES[activeTab] || {
    title: 'Centro Interempresarial',
    subtitle: 'Gestión corporativa',
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/80 shadow-xs backdrop-blur-md">
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
        {/* Left: Mobile Toggle & Page Title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-hidden"
            aria-label="Abrir menú de navegación"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight truncate">
                {currentInfo.title}
              </h2>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shrink-0 bg-blue-50 text-blue-800 border-blue-200">
                <Layers className="w-3 h-3 text-blue-600" />
                <span>Anitox</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block truncate">
              {currentInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Right: Actions and Google Integration */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Quick Month / Period Selector Dropdown */}
          <div
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs border ${
              isSelectedMonthClosed
                ? 'bg-slate-100 border-slate-300'
                : 'bg-blue-50/90 border-blue-200/90'
            }`}
            title={isSelectedMonthClosed ? 'Mes cerrado permanentemente (Solo lectura)' : 'Seleccionar mes a conciliar'}
          >
            {isSelectedMonthClosed ? (
              <Lock className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            ) : (
              <Calendar className="w-4 h-4 text-blue-700 shrink-0" />
            )}
            <select
              aria-label="Filtrar por mes a conciliar"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={`bg-transparent font-bold focus:outline-hidden cursor-pointer text-xs pr-1 ${
                isSelectedMonthClosed ? 'text-slate-800' : 'text-blue-900'
              }`}
            >
              <option value="ALL">Todos los Meses</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {closedMonths[m] ? `${m} (Cerrado)` : m}
                </option>
              ))}
            </select>
          </div>

          {/* Download Excel Template */}
          <button
            onClick={() => downloadExcelTemplate(entities)}
            title="Descargar plantilla Excel con hojas CxC y CxP, NIT y columna mes"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Plantilla Excel</span>
          </button>

          {/* Primary Action: Guardar Conciliación (Nube + Link) */}
          <button
            onClick={onOpenSaveModal}
            title="Guardar conciliación en la nube y obtener enlace para compartir"
            className="relative inline-flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 rounded-lg shadow-sm shadow-blue-700/20 transition-all cursor-pointer"
          >
            <Save className="w-4 h-4 text-blue-100" />
            <span>Guardar Conciliación</span>
            {hasUnsavedChanges && (
              <span
                className="w-2 h-2 rounded-full bg-amber-300 ring-2 ring-blue-700"
                title="Hay cambios sin guardar"
              />
            )}
          </button>

          {/* Secondary Cloud Export: Guardar en Google Sheets */}
          <button
            onClick={onOpenGoogleSheetsModal}
            className="inline-flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-sm shadow-emerald-700/20 transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
            <span className="hidden xl:inline">Google Sheets</span>
            <span className="xl:hidden">Sheets</span>
          </button>

          {/* Google Sign In / Account section */}
          {currentUser ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="flex items-center gap-2" title={currentUser.email || 'Usuario Google'}>
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || 'Usuario'}
                    className="w-8 h-8 rounded-full border border-blue-200 ring-1 ring-blue-500/20"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                    {currentUser.displayName ? currentUser.displayName[0] : 'U'}
                  </div>
                )}
                <div className="hidden xl:block text-left text-xs">
                  <div className="font-semibold text-slate-800 truncate max-w-[130px]">
                    {currentUser.displayName || 'Conectado'}
                  </div>
                  <div className="text-[11px] text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Conectado</span>
                  </div>
                </div>
              </div>

              <button
                onClick={onSignOut}
                title="Cerrar sesión de Google"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onSignInWithGoogle}
              title="Conectar con tu cuenta de Google"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span className="hidden sm:inline">Iniciar Sesión Google</span>
              <span className="sm:hidden">Google</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
