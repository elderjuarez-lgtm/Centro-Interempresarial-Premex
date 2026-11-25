import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  Printer,
  Send,
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
  onOpenEmailModal: () => void;
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
  onOpenEmailModal,
  onSaveCloud,
  isSavingCloud,
  hasUnsavedChanges,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  onSwitchModule,
  permissions,
}) => {
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [exportOpen]);

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
    <header className="sticky top-0 z-30 bg-white border-b border-slate-200 pt-safe print:hidden">
      <div className="px-3 sm:px-6 lg:px-8 min-h-[56px] py-2 flex items-center justify-between gap-2 sm:gap-3">
        {/* Left: Mobile menu + Breadcrumb + Page title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="lg:hidden min-w-[40px] min-h-[40px] -ml-1 inline-flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl cursor-pointer shrink-0"
            aria-label="Abrir menú bancario"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <button
                type="button"
                onClick={() => onSwitchModule('launcher')}
                className="hover:text-[#1E60A8] transition-colors cursor-pointer"
              >
                Premex
              </button>
              <ChevronRight className="w-3 h-3 text-slate-400" />
              <span className="text-[#19377B] font-semibold">Tesorería SAP 00/01/02</span>
              {!permissions.isAdmin && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className={permissions.isReadOnly ? 'text-amber-700' : 'text-teal-700'}>
                    {ROLE_METADATA[permissions.role].shortLabel}
                  </span>
                </>
              )}
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight truncate leading-tight">
              {BANK_TAB_LABEL[activeTab]}
            </h2>
          </div>
        </div>

        {/* Right: Account selector, Period selector, Consolidated Export/Send dropdown, Save, Auth */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Account selector grouped by Society */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Landmark className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              aria-label="Seleccionar cuenta bancaria"
              value={selectedAccountId}
              onChange={(e) => onSelectAccountId(e.target.value)}
              className="bg-transparent font-semibold text-slate-800 focus:outline-hidden cursor-pointer max-w-[210px] truncate"
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
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
            <select
              aria-label="Seleccionar periodo bancario"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-semibold text-[#132B63] focus:outline-hidden cursor-pointer"
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

          {/* Consolidated Export / Send Dropdown */}
          <div ref={exportMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              disabled={!selectedAccountId && accounts.length === 0}
              aria-expanded={exportOpen}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Descargar PDF, Excel entregable o enviar por correo"
            >
              <Download className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span className="hidden sm:inline">Exportar / Enviar</span>
              <span className="sm:hidden">Exportar</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {exportOpen && (
              <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50">
                <button
                  type="button"
                  disabled={!selectedAccountId}
                  onClick={() => {
                    setExportOpen(false);
                    onOpenPrintPreview();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-[#132B63] shrink-0" />
                  <span>Imprimir / PDF Oficial</span>
                </button>
                <button
                  type="button"
                  disabled={!selectedAccountId}
                  onClick={() => {
                    setExportOpen(false);
                    onExportExcel();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-teal-700 shrink-0" />
                  <span>Excel Entregable</span>
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  disabled={accounts.length === 0}
                  onClick={() => {
                    setExportOpen(false);
                    onOpenEmailModal();
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-[#132B63] hover:bg-slate-50 disabled:opacity-40 flex items-center gap-2.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-[#1E60A8] shrink-0" />
                  <span>Enviar Conciliación por Correo</span>
                </button>
              </div>
            )}
          </div>

          {/* Save Cloud (hidden for Solo Consulta) */}
          {!permissions.isReadOnly && (
            <button
              type="button"
              onClick={onSaveCloud}
              disabled={isSavingCloud}
              className="inline-flex items-center justify-center gap-1.5 min-h-[36px] px-3 sm:px-3.5 py-1.5 text-xs font-semibold text-white bg-[#132B63] hover:bg-[#1E60A8] disabled:opacity-60 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isSavingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {isSavingCloud
                  ? 'Guardando...'
                  : hasUnsavedChanges
                  ? 'Guardar cambios'
                  : 'Guardar Nube'}
              </span>
              <span className="sm:hidden">{isSavingCloud ? '...' : 'Guardar'}</span>
            </button>
          )}

          {/* Auth Profile */}
          {currentUser ? (
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-200">
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
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>Google</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile account selector bar */}
      <div className="md:hidden px-3 pb-2.5 flex items-center gap-2">
        <Landmark className="w-4 h-4 text-[#1E60A8] shrink-0" />
        <select
          aria-label="Seleccionar cuenta bancaria en móvil"
          value={selectedAccountId}
          onChange={(e) => onSelectAccountId(e.target.value)}
          className="w-full min-h-[40px] text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 focus:outline-hidden"
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
