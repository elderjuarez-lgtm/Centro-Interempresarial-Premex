import React, { useState, useEffect } from 'react';
import { X, Plus, Calendar, Coins, Building2, UserCheck, Layers } from 'lucide-react';
import {
  ModuleCompanyEntry,
  ViaticoConsultor,
  ViaticoCurrency,
  ViaticoOdooCatalogs,
} from '../../types';
import {
  CURRENCY_SYMBOLS,
  VIATICO_CURRENCIES,
  getCurrentIsoWeekNumber,
  roundExchangeRate,
} from '../../utils/viaticos';
import { normalizeCompanyKey } from '../../utils/permissions';
import {
  findMatchingCostCenterEntry,
  findMatchingOdooEmployee,
} from '../../utils/viaticosOdooCatalogs';

export interface NewLiquidationPayload {
  lineaLiquidacion: string;
  semana: string;
  monedaBase: ViaticoCurrency;
  tipoCambioLiquidacion?: number;
  consultorId: string;
  empresa: string;
  centroCosto?: string;
}

interface ViaticosNewLiquidationModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableConsultores: ViaticoConsultor[];
  defaultConsultor: ViaticoConsultor | null;
  moduleCompanies: ModuleCompanyEntry[];
  isLockedToOwnConsultor: boolean;
  openLiquidacionesCount: number;
  odooCatalogs?: ViaticoOdooCatalogs;
  onCreate: (payload: NewLiquidationPayload) => void;
}

export const ViaticosNewLiquidationModal: React.FC<ViaticosNewLiquidationModalProps> = ({
  isOpen,
  onClose,
  availableConsultores,
  defaultConsultor,
  moduleCompanies,
  isLockedToOwnConsultor,
  openLiquidacionesCount,
  odooCatalogs,
  onCreate,
}) => {
  const [lineaLiquidacion, setLineaLiquidacion] = useState('');
  const [semana, setSemana] = useState(getCurrentIsoWeekNumber());
  const [monedaBase, setMonedaBase] = useState<ViaticoCurrency>('Quetzales');
  const [tipoCambioLiquidacion, setTipoCambioLiquidacion] = useState('1.00');
  const [consultorId, setConsultorId] = useState('');
  const [empresa, setEmpresa] = useState('Premex Corp');
  const [centroCosto, setCentroCosto] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pickPermittedCompany = (preferred?: string): string => {
    if (moduleCompanies.length === 0) {
      return (preferred || '').trim() || 'Premex Corp';
    }
    const prefKey = normalizeCompanyKey(preferred || '');
    if (prefKey) {
      const exact = moduleCompanies.find((c) => normalizeCompanyKey(c.nombre) === prefKey);
      if (exact) return exact.nombre;
    }
    return moduleCompanies[0].nombre;
  };

  useEffect(() => {
    if (!isOpen) return;
    const initialConsultor = defaultConsultor || availableConsultores[0] || null;
    const matchedEmp = odooCatalogs
      ? findMatchingOdooEmployee({
          email: initialConsultor?.email,
          nombre: initialConsultor?.odooEmployeeName || initialConsultor?.nombreCompleto,
          employees: odooCatalogs.employees,
        })
      : null;
    setLineaLiquidacion('');
    setSemana(getCurrentIsoWeekNumber());
    const initCurrency = initialConsultor?.monedaBase || 'Quetzales';
    setMonedaBase(initCurrency);
    setTipoCambioLiquidacion('1.00');
    setConsultorId(initialConsultor?.id || '');
    setEmpresa(pickPermittedCompany(initialConsultor?.empresa || matchedEmp?.empresa));
    setCentroCosto(initialConsultor?.centroCosto || matchedEmp?.centroCosto || '');
    setError(null);
  }, [isOpen, defaultConsultor, availableConsultores, moduleCompanies, odooCatalogs]);

  if (!isOpen) return null;

  const selectedConsultorObj = availableConsultores.find((c) => c.id === consultorId) || null;
  const matchedEmpPreview = odooCatalogs
    ? findMatchingOdooEmployee({
        email: selectedConsultorObj?.email,
        nombre: selectedConsultorObj?.odooEmployeeName || selectedConsultorObj?.nombreCompleto,
        employees: odooCatalogs.employees,
      })
    : null;
  const matchedCostCenterPreview = odooCatalogs
    ? findMatchingCostCenterEntry(
        centroCosto,
        selectedConsultorObj?.odooAnalyticDistribution || matchedEmpPreview?.analyticDistribution,
        odooCatalogs.costCenters
      )
    : null;

  const handleConsultorChange = (nextId: string) => {
    setConsultorId(nextId);
    const chosen = availableConsultores.find((c) => c.id === nextId);
    if (chosen) {
      const empMatch = odooCatalogs
        ? findMatchingOdooEmployee({
            email: chosen.email,
            nombre: chosen.odooEmployeeName || chosen.nombreCompleto,
            employees: odooCatalogs.employees,
          })
        : null;
      setEmpresa(pickPermittedCompany(chosen.empresa || empMatch?.empresa || empresa));
      setMonedaBase(chosen.monedaBase || monedaBase);
      setCentroCosto(chosen.centroCosto || empMatch?.centroCosto || '');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanLinea = lineaLiquidacion.trim();
    const cleanSemana = semana.trim();
    if (!cleanLinea) {
      setError('Ingresa una línea o descripción para identificar esta liquidación.');
      return;
    }
    if (!cleanSemana) {
      setError('Indica el número de semana correspondiente.');
      return;
    }

    const parsedFx = Number(tipoCambioLiquidacion);
    if (monedaBase === 'Dólares' && (!Number.isFinite(parsedFx) || parsedFx <= 0)) {
      setError('Ingresa un tipo de cambio válido mayor a 0 para la liquidación en Dólares.');
      return;
    }

    onCreate({
      lineaLiquidacion: cleanLinea,
      semana: cleanSemana,
      monedaBase,
      tipoCambioLiquidacion:
        monedaBase === 'Dólares' ? roundExchangeRate(parsedFx) : undefined,
      consultorId,
      empresa: empresa.trim() || 'Premex Corp',
      centroCosto: centroCosto.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-end sm:items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[92dvh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 bg-[#132B63] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-200">
              Liquidación de Viáticos · Premex
            </div>
            <h3 className="text-base font-bold mt-0.5 truncate">
              Iniciar Nueva Liquidación
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-blue-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* Parallel open liquidations reassurance */}
          {openLiquidacionesCount > 0 && (
            <div className="px-3.5 py-2.5 rounded-xl bg-sky-50/80 border border-sky-200/80 text-xs text-slate-700 flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#1E60A8] shrink-0" />
              <span>
                Liquidaciones abiertas actualmente:{' '}
                <strong className="font-bold text-[#132B63] tabular-nums">
                  {openLiquidacionesCount}
                </strong>
                .
              </span>
            </div>
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Línea de Liquidación */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Línea / Descripción de Liquidación *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={lineaLiquidacion}
              onChange={(e) => setLineaLiquidacion(e.target.value)}
              placeholder="Ej. Visita Premicol Honduras, Gira Occidente..."
              className="w-full min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 text-base sm:text-xs font-medium text-slate-900 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
            />
          </div>

          {/* Semana + Moneda */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Semana # *</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={semana}
                onChange={(e) => setSemana(e.target.value)}
                placeholder="Ej. 32"
                className="w-full min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 text-base sm:text-xs font-mono font-semibold text-slate-900 tabular-nums rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Coins className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Moneda de Liquidación *</span>
              </label>
              <select
                value={monedaBase}
                onChange={(e) => {
                  const nextCur = e.target.value as ViaticoCurrency;
                  setMonedaBase(nextCur);
                  if (nextCur === 'Dólares' && (!Number(tipoCambioLiquidacion) || Number(tipoCambioLiquidacion) <= 0)) {
                    setTipoCambioLiquidacion('1.00');
                  }
                }}
                className="w-full min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 text-base sm:text-xs font-semibold text-slate-900 bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              >
                {VIATICO_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur} ({CURRENCY_SYMBOLS[cur]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {monedaBase === 'Dólares' && (
            <div className="p-3 rounded-xl bg-sky-50/70 border border-[#1E60A8]/25 space-y-1.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-[11px] font-bold uppercase tracking-wider text-[#132B63]">
                  Tipo de Cambio de Liquidación ($) *
                </label>
                <span className="text-[11px] font-medium text-slate-600">
                  Se aplicará a todo el documento
                </span>
              </div>
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0.0001"
                required
                value={tipoCambioLiquidacion}
                onChange={(e) => setTipoCambioLiquidacion(e.target.value)}
                placeholder="Ej. 7.75 o 1.00"
                className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-base sm:text-xs font-mono font-bold text-right tabular-nums text-[#132B63] bg-white rounded-xl border border-[#1E60A8]/40 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>
          )}

          {/* Consultor */}
          <div>
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#1E60A8]" />
              <span>Consultor Liquidador</span>
            </label>
            <select
              value={consultorId}
              disabled={isLockedToOwnConsultor}
              onChange={(e) => handleConsultorChange(e.target.value)}
              className="w-full min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 text-base sm:text-xs font-semibold text-slate-900 bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] disabled:bg-slate-50 disabled:text-slate-600"
            >
              {availableConsultores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombreCompleto} — {c.empresa}
                </option>
              ))}
            </select>
          </div>

          {/* Sociedad / Empresa + Centro de Costo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Building2 className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Sociedad / Empresa</span>
              </label>
              {moduleCompanies.length > 0 ? (
                <select
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  className="w-full min-h-[44px] sm:min-h-0 px-3 py-2.5 sm:py-2 text-base sm:text-xs font-semibold text-slate-900 bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                >
                  {moduleCompanies.map((c) => (
                    <option key={c.id} value={c.nombre}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  placeholder="Premex Corp"
                  className="w-full min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 text-base sm:text-xs font-medium text-slate-900 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                />
              )}
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Layers className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Centro de Costo</span>
              </label>
              <input
                type="text"
                list="viaticos-new-liq-cc-list"
                value={centroCosto}
                onChange={(e) => setCentroCosto(e.target.value)}
                placeholder="Cargado desde consultor / Odoo"
                className="w-full min-h-[44px] sm:min-h-0 px-3.5 py-2.5 sm:py-2 text-base sm:text-xs font-semibold text-[#132B63] rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
              <datalist id="viaticos-new-liq-cc-list">
                {(odooCatalogs?.costCenters || [])
                  .filter((cc) => cc.activo !== false)
                  .map((cc) => (
                    <option key={cc.id} value={cc.cuentaAnalitica}>
                      {cc.analyticDistribution}
                    </option>
                  ))}
              </datalist>
              {(matchedEmpPreview || matchedCostCenterPreview) && (
                <div className="mt-1 text-[10px] font-mono text-slate-500 truncate">
                  {matchedEmpPreview ? `Odoo: ${matchedEmpPreview.nombreCompleto}` : ''}
                  {matchedEmpPreview && matchedCostCenterPreview ? ' · ' : ''}
                  {matchedCostCenterPreview ? matchedCostCenterPreview.analyticDistribution : ''}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:py-2 text-sm sm:text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 min-h-[46px] sm:min-h-0 px-4 py-2.5 sm:py-2 text-sm sm:text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span>Crear y Abrir Liquidación</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
