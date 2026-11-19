import React, { useState, useEffect } from 'react';
import { X, Plus, Calendar, Coins, Building2, UserCheck, Layers } from 'lucide-react';
import {
  ModuleCompanyEntry,
  ViaticoConsultor,
  ViaticoCurrency,
} from '../../types';
import {
  CURRENCY_SYMBOLS,
  VIATICO_CURRENCIES,
  getCurrentIsoWeekNumber,
} from '../../utils/viaticos';

export interface NewLiquidationPayload {
  lineaLiquidacion: string;
  semana: string;
  monedaBase: ViaticoCurrency;
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
  onCreate,
}) => {
  const [lineaLiquidacion, setLineaLiquidacion] = useState('');
  const [semana, setSemana] = useState(getCurrentIsoWeekNumber());
  const [monedaBase, setMonedaBase] = useState<ViaticoCurrency>('Quetzales');
  const [consultorId, setConsultorId] = useState('');
  const [empresa, setEmpresa] = useState('Premex Corp');
  const [centroCosto, setCentroCosto] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const initialConsultor = defaultConsultor || availableConsultores[0] || null;
    setLineaLiquidacion('');
    setSemana(getCurrentIsoWeekNumber());
    setMonedaBase(initialConsultor?.monedaBase || 'Quetzales');
    setConsultorId(initialConsultor?.id || '');
    setEmpresa(
      initialConsultor?.empresa ||
        moduleCompanies[0]?.nombre ||
        'Premex Corp'
    );
    setCentroCosto(initialConsultor?.centroCosto || '');
    setError(null);
  }, [isOpen, defaultConsultor, availableConsultores, moduleCompanies]);

  if (!isOpen) return null;

  const handleConsultorChange = (nextId: string) => {
    setConsultorId(nextId);
    const chosen = availableConsultores.find((c) => c.id === nextId);
    if (chosen) {
      setEmpresa(chosen.empresa || empresa);
      setMonedaBase(chosen.monedaBase || monedaBase);
      setCentroCosto(chosen.centroCosto || '');
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

    onCreate({
      lineaLiquidacion: cleanLinea,
      semana: cleanSemana,
      monedaBase,
      consultorId,
      empresa: empresa.trim() || 'Premex Corp',
      centroCosto: centroCosto.trim(),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-[#132B63] text-white flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-200">
              Liquidación de Viáticos · Premex
            </div>
            <h3 className="text-base font-bold mt-0.5">
              Iniciar Nueva Liquidación
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1.5 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Parallel open liquidations reassurance */}
          {openLiquidacionesCount > 0 && (
            <div className="px-3.5 py-2 rounded-xl bg-sky-50/80 border border-sky-200/80 text-xs text-slate-700 flex items-center gap-2">
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
            <div className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
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
              className="w-full px-3.5 py-2 text-xs font-medium text-slate-900 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
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
                required
                value={semana}
                onChange={(e) => setSemana(e.target.value)}
                placeholder="Ej. 32"
                className="w-full px-3.5 py-2 text-xs font-mono font-semibold text-slate-900 tabular-nums rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Coins className="w-3.5 h-3.5 text-[#1E60A8]" />
                <span>Moneda de Liquidación *</span>
              </label>
              <select
                value={monedaBase}
                onChange={(e) => setMonedaBase(e.target.value as ViaticoCurrency)}
                className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              >
                {VIATICO_CURRENCIES.map((cur) => (
                  <option key={cur} value={cur}>
                    {cur} ({CURRENCY_SYMBOLS[cur]})
                  </option>
                ))}
              </select>
            </div>
          </div>

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
              className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] disabled:bg-slate-50 disabled:text-slate-600"
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
                  className="w-full px-3 py-2 text-xs font-semibold text-slate-900 bg-white rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
                >
                  {!moduleCompanies.some((c) => c.nombre === empresa) && (
                    <option value={empresa}>{empresa}</option>
                  )}
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
                  className="w-full px-3.5 py-2 text-xs font-medium text-slate-900 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
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
                value={centroCosto}
                onChange={(e) => setCentroCosto(e.target.value)}
                placeholder="Cargado desde consultor"
                className="w-full px-3.5 py-2 text-xs font-semibold text-[#132B63] rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8]"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear y Abrir Liquidación</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
