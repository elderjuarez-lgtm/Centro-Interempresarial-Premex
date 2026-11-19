import React, { useState, useMemo } from 'react';
import {
  Building2,
  Landmark,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowUpRight,
} from 'lucide-react';
import {
  BankAccount,
  BankAccountType,
  BankCurrency,
  BankSociety,
  ModuleCompanyEntry,
} from '../../types';
import {
  deriveSapSubaccounts,
  formatBankMoney,
  getBankBrandMeta,
  inferCutoffDateFromMonth,
  resolveAccountBalancesForMonth,
} from '../../utils/bankReconciliation';

interface BankCuentasViewProps {
  societies: BankSociety[];
  accounts: BankAccount[];
  selectedAccountId: string;
  selectedMonth: string;
  onSelectAccountAndOpen: (id: string) => void;
  isReadOnly?: boolean;
  canManageMasterData?: boolean;
  moduleCompanies?: ModuleCompanyEntry[];
  onAddSociety: (society: BankSociety) => void;
  onUpdateSociety: (society: BankSociety) => void;
  onDeleteSociety: (societyId: string) => void;
  onAddAccount: (account: BankAccount) => void;
  onUpdateAccount: (account: BankAccount) => void;
  onDeleteAccount: (accountId: string) => void;
}

const CURRENCIES: BankCurrency[] = ['COP', 'USD', 'GTQ', 'MXN', 'EUR'];
const ACCOUNT_TYPES: BankAccountType[] = [
  'Corriente',
  'Ahorros',
  'Fondo de Inversión',
  'Fiduciaria',
  'Recaudadora',
];

export const BankCuentasView: React.FC<BankCuentasViewProps> = ({
  societies,
  accounts,
  selectedAccountId,
  selectedMonth,
  onSelectAccountAndOpen,
  isReadOnly = false,
  canManageMasterData = true,
  moduleCompanies = [],
  onAddSociety,
  onUpdateSociety,
  onDeleteSociety,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
}) => {
  const [subTab, setSubTab] = useState<'cuentas' | 'sociedades'>('cuentas');
  const [societyFilterCode, setSocietyFilterCode] = useState<string>('ALL');

  // Society CRUD form state
  const [isSocietyFormOpen, setIsSocietyFormOpen] = useState(false);
  const [editingSocietyId, setEditingSocietyId] = useState<string | null>(null);
  const [socCodigo, setSocCodigo] = useState('');
  const [socNombre, setSocNombre] = useState('');
  const [socPais, setSocPais] = useState('Colombia');
  const [socMoneda, setSocMoneda] = useState<BankCurrency>('COP');
  const [socNit, setSocNit] = useState('');

  // Account CRUD form state
  const [isAccountFormOpen, setIsAccountFormOpen] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accSociedadCode, setAccSociedadCode] = useState(societies[0]?.codigoSociedad || '1000');
  const [accSociedadNombre, setAccSociedadNombre] = useState(
    societies[0]?.nombre || moduleCompanies[0]?.nombre || 'Premex S.A.S.'
  );
  const [accBanco, setAccBanco] = useState('');
  const [accNumero, setAccNumero] = useState('');
  const [accProducto, setAccProducto] = useState('');
  const [accTipo, setAccTipo] = useState<BankAccountType>('Corriente');
  const [accMoneda, setAccMoneda] = useState<BankCurrency>('COP');
  const [accPais, setAccPais] = useState('Colombia');
  const [accCta00, setAccCta00] = useState('');
  const [accCta01, setAccCta01] = useState('');
  const [accCta02, setAccCta02] = useState('');

  const canEditMaster = !isReadOnly && canManageMasterData;

  const accountCountsBySoc = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a) => {
      const k = (a.codigoSociedad || a.sociedad || '').trim().toUpperCase();
      map.set(k, (map.get(k) || 0) + 1);
    });
    return map;
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    if (societyFilterCode === 'ALL') return accounts;
    return accounts.filter(
      (a) => (a.codigoSociedad || a.sociedad || '').trim().toUpperCase() === societyFilterCode
    );
  }, [accounts, societyFilterCode]);

  // Society handlers
  const openNewSocietyForm = () => {
    setEditingSocietyId(null);
    setSocCodigo('');
    setSocNombre('');
    setSocPais('Colombia');
    setSocMoneda('COP');
    setSocNit('');
    setIsSocietyFormOpen(true);
  };

  const openEditSocietyForm = (soc: BankSociety) => {
    setEditingSocietyId(soc.id);
    setSocCodigo(soc.codigoSociedad);
    setSocNombre(soc.nombre);
    setSocPais(soc.pais);
    setSocMoneda(soc.moneda);
    setSocNit(soc.nit || '');
    setIsSocietyFormOpen(true);
  };

  const handleSaveSociety = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socCodigo.trim() || !socNombre.trim()) return;
    const payload: BankSociety = {
      id: editingSocietyId || `soc-${Date.now()}`,
      codigoSociedad: socCodigo.trim().toUpperCase(),
      nombre: socNombre.trim(),
      pais: socPais.trim() || 'Colombia',
      moneda: socMoneda,
      nit: socNit.trim() || undefined,
      activa: true,
    };
    if (editingSocietyId) onUpdateSociety(payload);
    else onAddSociety(payload);
    setIsSocietyFormOpen(false);
  };

  // Account handlers
  const openNewAccountForm = () => {
    const defaultSoc =
      societies.find((s) => s.codigoSociedad.toUpperCase() === societyFilterCode) || societies[0];
    setEditingAccountId(null);
    setAccSociedadCode(defaultSoc?.codigoSociedad || '1000');
    setAccSociedadNombre(defaultSoc?.nombre || moduleCompanies[0]?.nombre || 'Premex S.A.S.');
    setAccPais(defaultSoc?.pais || 'Colombia');
    setAccMoneda(defaultSoc?.moneda || 'COP');
    setAccBanco('');
    setAccNumero('');
    setAccProducto('');
    setAccTipo('Corriente');
    setAccCta00('');
    setAccCta01('');
    setAccCta02('');
    setIsAccountFormOpen(true);
  };

  const openEditAccountForm = (acc: BankAccount) => {
    setEditingAccountId(acc.id);
    setAccSociedadCode(acc.codigoSociedad || '');
    setAccSociedadNombre(acc.sociedad);
    setAccPais(acc.pais);
    setAccMoneda(acc.moneda);
    setAccBanco(acc.banco);
    setAccNumero(acc.numeroCuenta);
    setAccProducto(acc.productoCuenta || '');
    setAccTipo(acc.tipoCuenta);
    setAccCta00(acc.cuentaMayor00 || acc.codigoContable || '');
    setAccCta01(acc.cuentaMayor01 || '');
    setAccCta02(acc.cuentaMayor02 || '');
    setIsAccountFormOpen(true);
  };

  const handleCta00Change = (val: string) => {
    setAccCta00(val);
    const derived = deriveSapSubaccounts(val);
    if (derived.raizContable.length >= 4) {
      setAccCta01(derived.cuentaMayor01);
      setAccCta02(derived.cuentaMayor02);
    }
  };

  const handleSelectSocietyForAccount = (socCode: string) => {
    setAccSociedadCode(socCode);
    const found = societies.find((s) => s.codigoSociedad === socCode);
    if (found) {
      setAccSociedadNombre(found.nombre);
      setAccPais(found.pais);
      setAccMoneda(found.moneda);
    }
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accBanco.trim() || !accNumero.trim() || !accSociedadNombre.trim()) return;
    const derived = deriveSapSubaccounts(accCta00 || accCta01 || accCta02);
    const cta00Clean = accCta00.trim() || derived.cuentaMayor00;
    const cta01Clean = accCta01.trim() || derived.cuentaMayor01;
    const cta02Clean = accCta02.trim() || derived.cuentaMayor02;

    if (editingAccountId) {
      const existing = accounts.find((a) => a.id === editingAccountId);
      if (!existing) return;
      onUpdateAccount({
        ...existing,
        codigoSociedad: accSociedadCode.trim().toUpperCase() || undefined,
        sociedad: accSociedadNombre.trim(),
        banco: accBanco.trim(),
        numeroCuenta: accNumero.trim(),
        productoCuenta: accProducto.trim() || undefined,
        tipoCuenta: accTipo,
        moneda: accMoneda,
        pais: accPais.trim() || 'Colombia',
        codigoContable: cta00Clean || existing.codigoContable,
        raizContable: derived.raizContable || existing.raizContable,
        cuentaMayor00: cta00Clean || undefined,
        cuentaMayor01: cta01Clean || undefined,
        cuentaMayor02: cta02Clean || undefined,
      });
    } else {
      const effMonth = selectedMonth === 'ALL' ? 'Octubre 2026' : selectedMonth;
      const cutoff = inferCutoffDateFromMonth(effMonth);
      onAddAccount({
        id: `acc-${Date.now()}`,
        codigoSociedad: accSociedadCode.trim().toUpperCase() || undefined,
        sociedad: accSociedadNombre.trim(),
        banco: accBanco.trim(),
        numeroCuenta: accNumero.trim(),
        productoCuenta: accProducto.trim() || undefined,
        tipoCuenta: accTipo,
        moneda: accMoneda,
        pais: accPais.trim() || 'Colombia',
        codigoContable: cta00Clean || undefined,
        raizContable: derived.raizContable || undefined,
        cuentaMayor00: cta00Clean || undefined,
        cuentaMayor01: cta01Clean || undefined,
        cuentaMayor02: cta02Clean || undefined,
        saldoCuenta00: 0,
        saldoCuenta01: 0,
        saldoCuenta02: 0,
        saldoExtractoManual: false,
        fechaCorte: cutoff,
        saldoInicialLibros: 0,
        saldoFinalLibros: 0,
        saldoFinalExtracto: 0,
        saldosPorMes: {
          [effMonth]: {
            saldoLibros: 0,
            saldoExtracto: 0,
            saldoCuenta00: 0,
            saldoCuenta01: 0,
            saldoCuenta02: 0,
            saldoExtractoManual: false,
            fechaCorte: cutoff,
          },
        },
      });
    }
    setIsAccountFormOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Sub-navigation bar */}
      <section className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex bg-slate-100 p-1 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setSubTab('cuentas')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
              subTab === 'cuentas'
                ? 'bg-white text-[#132B63] shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Landmark className="w-3.5 h-3.5" />
            <span>Cuentas Bancarias ({accounts.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('sociedades')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-semibold transition-colors cursor-pointer ${
              subTab === 'sociedades'
                ? 'bg-white text-[#132B63] shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Maestro de Sociedades ({societies.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {subTab === 'cuentas' && (
            <select
              aria-label="Filtrar cuentas por sociedad"
              value={societyFilterCode}
              onChange={(e) => setSocietyFilterCode(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-hidden focus:border-[#1E60A8]"
            >
              <option value="ALL">Todas las sociedades</option>
              {societies.map((s) => (
                <option key={s.id} value={s.codigoSociedad.toUpperCase()}>
                  {s.codigoSociedad} · {s.nombre}
                </option>
              ))}
            </select>
          )}

          {canEditMaster && (
            <button
              type="button"
              onClick={subTab === 'cuentas' ? openNewAccountForm : openNewSocietyForm}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{subTab === 'cuentas' ? 'Nueva Cuenta Bancaria' : 'Nueva Sociedad'}</span>
            </button>
          )}
        </div>
      </section>

      {/* ==================== TAB 1: CUENTAS BANCARIAS ==================== */}
      {subTab === 'cuentas' && (
        <div className="space-y-4">
          {canEditMaster && isAccountFormOpen && (
            <form
              onSubmit={handleSaveAccount}
              className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#132B63]">
                    {editingAccountId ? 'Editar Cuenta Bancaria' : 'Nueva Cuenta Bancaria'}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAccountFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sociedad SAP *</label>
                  {societies.length > 0 ? (
                    <select
                      value={accSociedadCode}
                      onChange={(e) => handleSelectSocietyForAccount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                    >
                      {societies.map((s) => (
                        <option key={s.id} value={s.codigoSociedad}>
                          {s.codigoSociedad} · {s.nombre}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      required
                      value={accSociedadNombre}
                      onChange={(e) => setAccSociedadNombre(e.target.value)}
                      placeholder="Nombre sociedad"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Entidad Bancaria *
                  </label>
                  <input
                    type="text"
                    required
                    value={accBanco}
                    onChange={(e) => setAccBanco(e.target.value)}
                    placeholder="Ej. BANCO BANCOLOMBIA S.A"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Número de Cuenta *
                  </label>
                  <input
                    type="text"
                    required
                    value={accNumero}
                    onChange={(e) => setAccNumero(e.target.value)}
                    placeholder="Ej. 06411-9"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipo / Moneda</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={accTipo}
                      onChange={(e) => setAccTipo(e.target.value as BankAccountType)}
                      className="px-2 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                    >
                      {ACCOUNT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <select
                      value={accMoneda}
                      onChange={(e) => setAccMoneda(e.target.value as BankCurrency)}
                      className="px-2 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Producto / Denominación
                  </label>
                  <input
                    type="text"
                    value={accProducto}
                    onChange={(e) => setAccProducto(e.target.value)}
                    placeholder="Ej. Fondo de Valores RENTA LIQUIDEZ-1"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cta. Mayor SAP 00 (Principal)
                  </label>
                  <input
                    type="text"
                    value={accCta00}
                    onChange={(e) => handleCta00Change(e.target.value)}
                    placeholder="Ej. 8001502800"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cta. Mayor SAP 01 (Ingresos Pend.)
                  </label>
                  <input
                    type="text"
                    value={accCta01}
                    onChange={(e) => setAccCta01(e.target.value)}
                    placeholder="Ej. 8001502801"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cta. Mayor SAP 02 (Egresos Pend.)
                  </label>
                  <input
                    type="text"
                    value={accCta02}
                    onChange={(e) => setAccCta02(e.target.value)}
                    placeholder="Ej. 8001502802"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAccountFormOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingAccountId ? 'Actualizar Cuenta' : 'Crear Cuenta'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Banco / Producto</th>
                    <th className="py-3 px-3">Sociedad</th>
                    <th className="py-3 px-3 font-mono">No. Cuenta / Moneda</th>
                    <th className="py-3 px-3 font-mono">Subcuentas SAP (00 · 01 · 02)</th>
                    <th className="py-3 px-3 text-right">Saldo Libros ({selectedMonth})</th>
                    <th className="py-3 px-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAccounts.map((acc) => {
                    const brand = getBankBrandMeta(acc.banco);
                    const bal = resolveAccountBalancesForMonth(acc, selectedMonth);
                    const isActive = acc.id === selectedAccountId;
                    return (
                      <tr
                        key={acc.id}
                        className={`hover:bg-slate-50/80 ${isActive ? 'bg-blue-50/40' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-[11px] shrink-0 ${brand.badgeBg} ${brand.badgeText}`}
                            >
                              {brand.monogram}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900">{acc.banco}</div>
                              <div className="text-[11px] text-slate-500 truncate max-w-[240px]">
                                {acc.productoCuenta || acc.tipoCuenta}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">{acc.sociedad}</div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {acc.codigoSociedad ? `Soc. ${acc.codigoSociedad} · ` : ''}
                            {acc.pais}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-mono">
                          <div className="font-semibold text-slate-900">{acc.numeroCuenta}</div>
                          <div className="text-[11px] text-slate-500">
                            {acc.tipoCuenta} · {acc.moneda}
                          </div>
                        </td>

                        <td className="py-3 px-3 font-mono text-[11px] text-slate-700">
                          <div>
                            <span className="text-slate-400">00:</span>{' '}
                            <strong>{acc.cuentaMayor00 || acc.codigoContable || '-'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">01:</span> {acc.cuentaMayor01 || '-'} ·{' '}
                            <span className="text-slate-400">02:</span> {acc.cuentaMayor02 || '-'}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          <div className="font-bold text-slate-900">
                            {formatBankMoney(bal.saldoLibros, acc.moneda)}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Ext: {formatBankMoney(bal.saldoExtracto, acc.moneda)}
                          </div>
                        </td>

                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onSelectAccountAndOpen(acc.id)}
                              title="Abrir en Centro de Cuadre"
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#1E60A8] bg-blue-50 hover:bg-blue-100 rounded-lg cursor-pointer"
                            >
                              <span>Abrir</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                            {canEditMaster && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditAccountForm(acc)}
                                  title="Editar cuenta"
                                  className="p-1.5 text-slate-500 hover:text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDeleteAccount(acc.id)}
                                  title="Eliminar cuenta"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: MAESTRO DE SOCIEDADES ==================== */}
      {subTab === 'sociedades' && (
        <div className="space-y-4">
          {canEditMaster && isSocietyFormOpen && (
            <form
              onSubmit={handleSaveSociety}
              className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#132B63]">
                  {editingSocietyId ? 'Editar Sociedad SAP' : 'Nueva Sociedad SAP'}
                </h4>
                <button
                  type="button"
                  onClick={() => setIsSocietyFormOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Código Sociedad *
                  </label>
                  <input
                    type="text"
                    required
                    value={socCodigo}
                    onChange={(e) => setSocCodigo(e.target.value)}
                    placeholder="Ej. 1000"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Razón Social / Nombre *
                  </label>
                  <input
                    type="text"
                    required
                    value={socNombre}
                    onChange={(e) => setSocNombre(e.target.value)}
                    placeholder="Ej. Premex S.A.S."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">País *</label>
                  <input
                    type="text"
                    required
                    value={socPais}
                    onChange={(e) => setSocPais(e.target.value)}
                    placeholder="Colombia"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Moneda Local *</label>
                  <select
                    value={socMoneda}
                    onChange={(e) => setSocMoneda(e.target.value as BankCurrency)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    NIT / ID Fiscal (opcional)
                  </label>
                  <input
                    type="text"
                    value={socNit}
                    onChange={(e) => setSocNit(e.target.value)}
                    placeholder="Ej. 890903865-1"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono focus:outline-hidden focus:border-[#1E60A8]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsSocietyFormOpen(false)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-lg cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingSocietyId ? 'Actualizar Sociedad' : 'Crear Sociedad'}</span>
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 font-mono">Código SAP</th>
                    <th className="py-3 px-3">Nombre / Razón Social</th>
                    <th className="py-3 px-3">País</th>
                    <th className="py-3 px-3 font-mono">Moneda</th>
                    <th className="py-3 px-3 font-mono">NIT / ID Fiscal</th>
                    <th className="py-3 px-3 text-center">Cuentas</th>
                    {canEditMaster && <th className="py-3 px-3 text-center">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {societies.map((soc) => {
                    const count =
                      accountCountsBySoc.get(soc.codigoSociedad.trim().toUpperCase()) || 0;
                    return (
                      <tr key={soc.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono font-bold text-[#132B63]">
                          {soc.codigoSociedad}
                        </td>
                        <td className="py-3 px-3 font-semibold text-slate-900">{soc.nombre}</td>
                        <td className="py-3 px-3 text-slate-600">{soc.pais}</td>
                        <td className="py-3 px-3 font-mono font-semibold text-slate-800">
                          {soc.moneda}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-600">{soc.nit || '-'}</td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-slate-800">
                          {count}
                        </td>
                        {canEditMaster && (
                          <td className="py-3 px-3 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openEditSocietyForm(soc)}
                                title="Editar sociedad"
                                className="p-1.5 text-slate-500 hover:text-[#1E60A8] hover:bg-blue-50 rounded-lg cursor-pointer"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onDeleteSociety(soc.id)}
                                disabled={count > 0}
                                title={
                                  count > 0
                                    ? 'Elimina primero las cuentas bancarias de esta sociedad'
                                    : 'Eliminar sociedad'
                                }
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
