import React, { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Landmark } from 'lucide-react';
import {
  BankAccount,
  BankAccountType,
  BankCurrency,
  ModuleCompanyEntry,
} from '../../types';
import { formatBankMoney } from '../../utils/bankReconciliation';
import { normalizeCompanyKey } from '../../utils/permissions';

interface BankCuentasViewProps {
  accounts: BankAccount[];
  selectedAccountId: string;
  onSelectAccountId: (id: string) => void;
  onAddAccount: (account: BankAccount) => void;
  onUpdateAccount: (account: BankAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  isReadOnly?: boolean;
  canManageMasterData?: boolean;
  moduleCompanies?: ModuleCompanyEntry[];
}

const CURRENCIES: BankCurrency[] = ['USD', 'COP', 'GTQ', 'MXN', 'EUR'];
const ACCOUNT_TYPES: BankAccountType[] = ['Corriente', 'Ahorros', 'Recaudadora'];

const EMPTY_FORM: Omit<BankAccount, 'id'> = {
  banco: '',
  numeroCuenta: '',
  sociedad: 'Premex S.A.S.',
  pais: 'Colombia',
  moneda: 'USD',
  tipoCuenta: 'Corriente',
  saldoInicialLibros: 0,
  saldoFinalExtracto: 0,
  saldoFinalLibros: 0,
};

export const BankCuentasView: React.FC<BankCuentasViewProps> = ({
  accounts,
  selectedAccountId,
  onSelectAccountId,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  isReadOnly = false,
  canManageMasterData = true,
  moduleCompanies = [],
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formState, setFormState] = useState<Omit<BankAccount, 'id'>>(EMPTY_FORM);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const activeCompanies = moduleCompanies.filter((c) => c.activo !== false);

  const openAddForm = () => {
    if (isReadOnly || !canManageMasterData) return;
    setEditingId(null);
    const defaultComp = activeCompanies[0];
    setFormState({
      ...EMPTY_FORM,
      sociedad: defaultComp?.nombre || EMPTY_FORM.sociedad,
      pais: defaultComp?.pais || EMPTY_FORM.pais,
      moneda:
        defaultComp?.moneda && CURRENCIES.includes(defaultComp.moneda as BankCurrency)
          ? (defaultComp.moneda as BankCurrency)
          : EMPTY_FORM.moneda,
    });
    setIsAdding(true);
  };

  const openEditForm = (acc: BankAccount) => {
    if (isReadOnly) return;
    setIsAdding(false);
    setEditingId(acc.id);
    setFormState({
      banco: acc.banco,
      numeroCuenta: acc.numeroCuenta,
      sociedad: acc.sociedad,
      pais: acc.pais,
      moneda: acc.moneda,
      tipoCuenta: acc.tipoCuenta,
      saldoInicialLibros: acc.saldoInicialLibros,
      saldoFinalExtracto: acc.saldoFinalExtracto,
      saldoFinalLibros: acc.saldoFinalLibros,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    if (!formState.banco.trim() || !formState.numeroCuenta.trim()) return;

    if (editingId) {
      const existing = accounts.find((a) => a.id === editingId);
      onUpdateAccount({
        id: editingId,
        ...(canManageMasterData || !existing
          ? {
              ...formState,
              banco: formState.banco.trim(),
              numeroCuenta: formState.numeroCuenta.trim(),
              sociedad: formState.sociedad.trim() || 'Premex',
              pais: formState.pais.trim() || 'Global',
            }
          : {
              ...existing,
              saldoInicialLibros: formState.saldoInicialLibros,
              saldoFinalExtracto: formState.saldoFinalExtracto,
              saldoFinalLibros: formState.saldoFinalLibros,
            }),
      });
      setEditingId(null);
    } else if (canManageMasterData) {
      const newAcc: BankAccount = {
        id: `acc-${Date.now()}`,
        ...formState,
        banco: formState.banco.trim(),
        numeroCuenta: formState.numeroCuenta.trim(),
        sociedad: formState.sociedad.trim() || 'Premex',
        pais: formState.pais.trim() || 'Global',
      };
      onAddAccount(newAcc);
      onSelectAccountId(newAcc.id);
      setIsAdding(false);
    }
    setFormState(EMPTY_FORM);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">
            Cuentas Bancarias Corporativas ({accounts.length})
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isReadOnly
              ? 'Vista de solo consulta del catálogo bancario autorizado para tus empresas.'
              : canManageMasterData
              ? 'Administra bancos, sociedades y saldos finales de extracto y libros que alimentan el cuadre bancario.'
              : 'Rol Operador: puedes actualizar los saldos de extracto y libros de tus cuentas autorizadas.'}
          </p>
        </div>

        {!isReadOnly && canManageMasterData && (
          <button
            type="button"
            onClick={openAddForm}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Cuenta Bancaria</span>
          </button>
        )}
      </div>

      {/* Add / Edit Inline Form Panel */}
      {!isReadOnly && (isAdding || editingId) && (
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-[#1E60A8]/40 p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h4 className="text-sm font-bold text-[#132B63]">
              {editingId
                ? canManageMasterData
                  ? 'Editar Cuenta Bancaria y Saldos'
                  : 'Actualizar Saldos de Conciliación'
                : 'Registrar Nueva Cuenta Bancaria'}
            </h4>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
              }}
              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Cancelar formulario"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Entidad Bancaria *</label>
              <input
                type="text"
                required
                disabled={!canManageMasterData}
                value={formState.banco}
                onChange={(e) => setFormState({ ...formState, banco: e.target.value })}
                placeholder="Ej. Bancolombia, Citibank N.A."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#1E60A8] disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Número de Cuenta *</label>
              <input
                type="text"
                required
                disabled={!canManageMasterData}
                value={formState.numeroCuenta}
                onChange={(e) => setFormState({ ...formState, numeroCuenta: e.target.value })}
                placeholder="Ej. 431-089245-12"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8] disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Sociedad (BD de Bancos)
              </label>
              <input
                type="text"
                list="bank-module-companies-list"
                disabled={!canManageMasterData}
                value={formState.sociedad}
                onChange={(e) => {
                  const val = e.target.value;
                  const matched = activeCompanies.find(
                    (c) => normalizeCompanyKey(c.nombre) === normalizeCompanyKey(val)
                  );
                  setFormState({
                    ...formState,
                    sociedad: val,
                    pais: matched?.pais ? matched.pais : formState.pais,
                    moneda:
                      matched?.moneda && CURRENCIES.includes(matched.moneda as BankCurrency)
                        ? (matched.moneda as BankCurrency)
                        : formState.moneda,
                  });
                }}
                placeholder="Ej. Premex S.A.S."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#1E60A8] disabled:bg-slate-100 disabled:text-slate-500"
              />
              <datalist id="bank-module-companies-list">
                {activeCompanies.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.codigo ? `${c.codigo} · ` : ''}
                    {c.pais || c.moneda || ''}
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">País</label>
              <input
                type="text"
                disabled={!canManageMasterData}
                value={formState.pais}
                onChange={(e) => setFormState({ ...formState, pais: e.target.value })}
                placeholder="Ej. Colombia, Estados Unidos"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:border-[#1E60A8] disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Moneda</label>
              <select
                disabled={!canManageMasterData}
                value={formState.moneda}
                onChange={(e) =>
                  setFormState({ ...formState, moneda: e.target.value as BankCurrency })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-[#1E60A8] disabled:bg-slate-100 disabled:text-slate-500"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tipo de Cuenta</label>
              <select
                disabled={!canManageMasterData}
                value={formState.tipoCuenta}
                onChange={(e) =>
                  setFormState({ ...formState, tipoCuenta: e.target.value as BankAccountType })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:outline-hidden focus:border-[#1E60A8] disabled:bg-slate-100 disabled:text-slate-500"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Saldo Inicial Libros
              </label>
              <input
                type="number"
                step="any"
                value={formState.saldoInicialLibros}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    saldoInicialLibros: Number(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Saldo Final según Extracto
              </label>
              <input
                type="number"
                step="any"
                value={formState.saldoFinalExtracto}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    saldoFinalExtracto: Number(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Saldo Final según Libros
              </label>
              <input
                type="number"
                step="any"
                value={formState.saldoFinalLibros}
                onChange={(e) =>
                  setFormState({
                    ...formState,
                    saldoFinalLibros: Number(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono focus:outline-hidden focus:border-[#1E60A8]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingId(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editingId ? 'Guardar Cambios' : 'Agregar Cuenta'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Accounts Table */}
      <section className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden">
        {accounts.length === 0 ? (
          <div className="p-10 text-center">
            <Landmark className="w-9 h-9 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">Sin cuentas registradas</p>
            <p className="text-xs text-slate-500 mt-1">
              Crea una cuenta bancaria para habilitar la carga de extractos y conciliación.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-5">Entidad y Cuenta</th>
                  <th className="py-3 px-4">Sociedad / País</th>
                  <th className="py-3 px-4 text-right">Saldo Extracto</th>
                  <th className="py-3 px-4 text-right">Saldo Libros</th>
                  <th className="py-3 px-5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                {accounts.map((acc) => {
                  const isActive = acc.id === selectedAccountId;
                  return (
                    <tr
                      key={acc.id}
                      className={isActive ? 'bg-[#1E60A8]/5' : 'hover:bg-slate-50/60'}
                    >
                      <td className="py-3.5 px-5">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <span>{acc.banco}</span>
                          {isActive && (
                            <span className="text-[11px] font-semibold text-[#1E60A8]">
                              · Seleccionada
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono text-slate-500">
                          {acc.numeroCuenta} · {acc.tipoCuenta} ({acc.moneda})
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-slate-700">
                        <div className="font-medium">{acc.sociedad}</div>
                        <div className="text-[11px] text-slate-400">{acc.pais}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                        {formatBankMoney(acc.saldoFinalExtracto, acc.moneda)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-800">
                        {formatBankMoney(acc.saldoFinalLibros, acc.moneda)}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {!isActive && (
                            <button
                              type="button"
                              onClick={() => onSelectAccountId(acc.id)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#1E60A8] hover:bg-[#1E60A8]/10 rounded-lg cursor-pointer"
                            >
                              Activar
                            </button>
                          )}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => openEditForm(acc)}
                              className="p-1.5 text-slate-500 hover:text-[#19377B] hover:bg-slate-100 rounded-lg cursor-pointer"
                              title={
                                canManageMasterData
                                  ? 'Editar cuenta y saldos'
                                  : 'Actualizar saldos finales'
                              }
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}

                          {!isReadOnly && canManageMasterData && (
                            confirmDeleteId === acc.id ? (
                              <div className="inline-flex items-center gap-1 ml-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    onDeleteAccount(acc.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2 py-1 text-[11px] font-semibold bg-rose-600 text-white rounded-lg cursor-pointer"
                                >
                                  Eliminar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-lg cursor-pointer"
                                >
                                  No
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(acc.id)}
                                disabled={accounts.length <= 1}
                                title={
                                  accounts.length <= 1
                                    ? 'Debe existir al menos una cuenta activa'
                                    : 'Eliminar cuenta'
                                }
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 rounded-lg cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
