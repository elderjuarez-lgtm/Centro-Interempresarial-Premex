import React, { useMemo } from 'react';
import {
  Menu,
  Calendar,
  Download,
  Save,
  Landmark,
  CheckCircle2,
  LogOut,
  Loader2,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { ActiveModuleId, BankAccount, BankTab, EffectivePermissions } from '../../types';
import { ROLE_METADATA } from '../../utils/permissions';

interface BankHeaderProps {
  activeTab: BankTab;
  onToggleMobileMenu: () => void;
  accounts: BankAccount[];
  selectedAccountId: string;
  onSelectAccountId: (id: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  availableMonths: string[];
  closedPeriodKeys: Set<string>;
  onOpenPrintPreview: () => void;
  onExportExcel: () => void;
  onSaveCloud: () => void;
  isSavingCloud: boolean;
  hasUnsavedChanges: boolean;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onSwitchModule: (moduleId: ActiveModuleId) => void;
  permissions: EffectivePermissions;
}

const BANK_TAB_LABEL: Record<BankTab, string> = {
  resumen: 'Centro de Cuadre · Conciliación de Bancos',
  pendientes: 'Partidas Abiertas SAP (FBL3N)',
  cuentas: 'Maestro de Sociedades y Cuentas Bancarias',
  carga: 'Carga Masiva SAP (Catálogo, Balance 00/01/02 y FBL3N)',
  historial: 'Historial de Conciliaciones Cerradas',
};

export const BankHeader: React.FC<BankHeaderProps> = ({
  activeTab,
  onToggleMobileMenu,
  accounts,
  selectedAccountId,
  onSelectAccountId,
  selectedMonth,
  setSelectedMonth,
  availableMonths,
  closedPeriodKeys,
  onOpenPrintPreview,
  onExportExcel,
  onSaveCloud,
  isSavingCloud,
  hasUnsavedChanges,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  onSwitchModule,
  permissions,
}) => {
  const accountsByCompany = useMemo(() => {
    const map = new Map<string, BankAccount[]>();
    accounts.forEach((acc) => {
      const codePrefix = acc.codigoSociedad ? `${acc.codigoSociedad} · ` : '';
      const key = `${codePrefix}${(acc.sociedad || 'Sin Sociedad').trim()}`;
      const list = map.get(key) || [];
      list.push(acc);
      map.set(key, list);
    });
    return Array.from(map.entries());
  }, [accounts]);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90 print:hidden">
      <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-3">
        {/* Left: Mobile menu + Breadcrumb + Page title */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
            aria-label="Abrir menú bancario"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <button
                type="button"
                onClick={() => onSwitchModule('launcher')}
                className="hover:text-[#1E60A8] transition-colors cursor-pointer"
              >
                Premex
              </button>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="text-[#19377B]">Tesorería SAP 00/01/02</span>
              {!permissions.isAdmin && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className={permissions.isReadOnly ? 'text-amber-700' : 'text-teal-700'}>
                    {ROLE_METADATA[permissions.role].shortLabel}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
              {BANK_TAB_LABEL[activeTab]}
            </h2>
          </div>
        </div>

        {/* Right: Account selector grouped by society, Period selector, Print/PDF, Excel, Save, Auth */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Account selector grouped by Society */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Landmark className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              aria-label="Seleccionar cuenta bancaria"
              value={selectedAccountId}
              onChange={(e) => onSelectAccountId(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-hidden cursor-pointer max-w-[230px] truncate"
            >
              {accountsByCompany.map(([socLabel, accList]) => (
                <optgroup key={socLabel} label={socLabel}>
                  {accList.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.banco} ({acc.moneda}) · {acc.numeroCuenta}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Month selector */}
          <div className="flex items-center gap-1.5 bg-[#1E60A8]/8 border border-[#1E60A8]/20 rounded-xl px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#19377B] shrink-0" />
            <select
              aria-label="Seleccionar periodo bancario"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-[#132B63] focus:outline-hidden cursor-pointer"
            >
              {availableMonths.map((m) => {
                const isClosed = closedPeriodKeys.has(
                  m
                    .trim()
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .replace(/\s+/g, ' ')
                );
                return (
                  <option key={m} value={m}>
                    {isClosed ? `${m} (Cerrada)` : m}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Print / PDF Official Sheet */}
          <button
            type="button"
            onClick={onOpenPrintPreview}
            disabled={!selectedAccountId}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Descargar o imprimir PDF oficial (individual o masivo)"
          >
            <Printer className="w-3.5 h-3.5 text-[#132B63]" />
            <span className="hidden xl:inline">Imprimir / PDF</span>
          </button>

          {/* Export Official Deliverable Excel */}
          <button
            type="button"
            onClick={onExportExcel}
            disabled={!selectedAccountId}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Descargar libro entregable Excel con fórmulas vivas (individual o masivo)"
          >
            <Download className="w-3.5 h-3.5 text-teal-700" />
            <span className="hidden xl:inline">Excel Entregable</span>
            <span className="xl:hidden">Excel</span>
          </button>

          {/* Save Cloud (hidden for Solo Consulta) */}
          {!permissions.isReadOnly && (
            <button
              type="button"
              onClick={onSaveCloud}
              disabled={isSavingCloud}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSavingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>
                {isSavingCloud
                  ? 'Guardando...'
                  : hasUnsavedChanges
                  ? 'Guardar cambios'
                  : 'Guardar Nube'}
              </span>
            </button>
          )}

          {/* Auth Profile */}
          {currentUser ? (
            <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-200">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Usuario'}
                  className="w-7 h-7 rounded-full border border-slate-200"
                  title={currentUser.email || 'Usuario conectado'}
                />
              ) : (
                <div
                  className="w-7 h-7 rounded-full bg-[#19377B]/10 text-[#19377B] flex items-center justify-center font-bold text-xs"
                  title={currentUser.email || 'Usuario conectado'}
                >
                  {currentUser.displayName ? currentUser.displayName[0] : 'U'}
                </div>
              )}
              <div className="hidden 2xl:block text-[11px] leading-tight">
                <div className="font-semibold text-slate-800 max-w-[110px] truncate">
                  {currentUser.displayName || 'Usuario'}
                </div>
                <div className="text-emerald-700 flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Conectado</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Cerrar sesión"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignInWithGoogle}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Google</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile account selector bar */}
      <div className="md:hidden px-4 pb-2.5 flex items-center gap-2">
        <Landmark className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
        <select
          aria-label="Seleccionar cuenta bancaria en móvil"
          value={selectedAccountId}
          onChange={(e) => onSelectAccountId(e.target.value)}
          className="w-full text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
        >
          {accountsByCompany.map(([socLabel, accList]) => (
            <optgroup key={socLabel} label={socLabel}>
              {accList.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.banco} ({acc.moneda}) · {acc.numeroCuenta}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </header>
  );
};
