import React, { useState, useMemo } from 'react';
import { User } from 'firebase/auth';
import {
  Search,
  ArrowRight,
  CheckCircle2,
  LogOut,
  X,
  Check,
  Sparkles,
  FileSpreadsheet,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { ActiveModuleId, EffectivePermissions, SuiteModuleId } from '../types';
import { PremexBrandLogo, ModuleEmblem } from './ModuleIcons';
import { ROLE_METADATA, SUPER_ADMIN_EMAIL } from '../utils/permissions';

export interface LauncherLiveMetrics {
  intercompanyEntitiesCount: number;
  intercompanyMovementsCount: number;
  intercompanyDifferencesCount: number;
  intercompanyPeriod: string;
  bankAccountsCount: number;
  bankReconciledPct: number;
  bankPendingCount: number;
  bankPeriod: string;
  viaticosLiquidacionesCount: number;
  viaticosOpenCount: number;
  viaticosTotalLabel: string;
  configuredUsersCount?: number;
}

interface ModuleLauncherProps {
  onOpenModule: (moduleId: ActiveModuleId) => void;
  currentUser: User | null;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  metrics: LauncherLiveMetrics;
  permissions: EffectivePermissions;
}

interface SuiteModuleDefinition {
  id: SuiteModuleId;
  name: string;
  category:
    | 'Conciliación'
    | 'Tesorería'
    | 'Gastos y Viáticos'
    | 'Cartera y Proveedores'
    | 'Administración';
  shortDesc: string;
  status: 'active' | 'planned';
  targetModule?: ActiveModuleId;
  accentBorderHover: string;
  roadmapDetails?: {
    objective: string;
    inputs: string[];
    outputs: string[];
    integrationNote: string;
  };
}

const SUITE_MODULES: SuiteModuleDefinition[] = [
  {
    id: 'intercompany',
    name: 'Conciliación Intercompany',
    category: 'Conciliación',
    shortDesc:
      'Matrices bilaterales CxC vs CxP entre sociedades Anitox, diferencias con comentarios, correos de ajuste y cierre mensual.',
    status: 'active',
    targetModule: 'intercompany',
    accentBorderHover: 'hover:border-[#2169B5]/60',
  },
  {
    id: 'bancos',
    name: 'Conciliación Bancaria',
    category: 'Tesorería',
    shortDesc:
      'Cruce automático y manual entre extractos bancarios y auxiliar contable, partidas en tránsito y cuadre formal en Excel.',
    status: 'active',
    targetModule: 'bancos',
    accentBorderHover: 'hover:border-teal-600/50',
  },
  {
    id: 'viaticos',
    name: 'Liquidación de Viáticos',
    category: 'Gastos y Viáticos',
    shortDesc:
      'Carga de facturas por foto o PDF con lectura IA, registro comercial, detección de consultor por correo, cierre con Excel oficial Premex y PDF compilado.',
    status: 'active',
    targetModule: 'viaticos',
    accentBorderHover: 'hover:border-sky-600/50',
  },
  {
    id: 'anticipos',
    name: 'Anticipos',
    category: 'Tesorería',
    shortDesc:
      'Control de anticipos otorgados a proveedores y empleados, seguimiento de legalizaciones y saldos abiertos por antigüedad.',
    status: 'planned',
    accentBorderHover: 'hover:border-amber-500/50',
    roadmapDetails: {
      objective:
        'Centralizar el ciclo de vida de anticipos a proveedores, contratistas y empleados desde el desembolso hasta su cruce con factura o legalización.',
      inputs: [
        'Auxiliar contable de cuentas de anticipos (proveedores y viáticos)',
        'Relación de facturas aplicadas y comprobantes de legalización',
        'Catálogo de terceros y centros de costo Premex',
      ],
      outputs: [
        'Matriz de antigüedad de anticipos sin legalizar (30 / 60 / 90+ días)',
        'Alertas automáticas por responsable y proveedor',
        'Reporte de depuración mensual exportable a Excel',
      ],
      integrationNote:
        'Se conectará con Conciliación Bancaria para vincular desembolsos y con Cuentas por Pagar para aplicar saldos automáticamente.',
    },
  },
  {
    id: 'cxc',
    name: 'Cuentas por Cobrar',
    category: 'Cartera y Proveedores',
    shortDesc:
      'Conciliación de cartera comercial, cruces de recaudos contra facturación electrónica y análisis de vencimientos.',
    status: 'planned',
    accentBorderHover: 'hover:border-indigo-500/50',
    roadmapDetails: {
      objective:
        'Conciliar saldos del módulo comercial frente a la contabilidad general, identificar pagos no aplicados y depurar notas crédito pendientes.',
      inputs: [
        'Cartera detallada por cliente y factura (subledger comercial)',
        'Mayor contable de cuentas por cobrar locales y del exterior',
        'Recibos de caja y abonos identificados desde Bancos',
      ],
      outputs: [
        'Conciliación submayor vs contabilidad con diferencias por NIT',
        'Tablero de edades de cartera y partidas sin cruzar',
        'Estados de cuenta consolidados listos para envío a clientes',
      ],
      integrationNote:
        'Compartirá el directorio corporativo y recibirá los recaudos conciliados directamente desde el módulo de Conciliación Bancaria.',
    },
  },
  {
    id: 'cxp',
    name: 'Cuentas por Pagar',
    category: 'Cartera y Proveedores',
    shortDesc:
      'Cruce de estados de cuenta de proveedores contra libros contables, validación de retenciones y programación de pagos.',
    status: 'planned',
    accentBorderHover: 'hover:border-rose-500/50',
    roadmapDetails: {
      objective:
        'Automatizar la circularización y conciliación de estados de cuenta enviados por proveedores frente a las facturas causadas en ERP.',
      inputs: [
        'Estado de cuenta Excel/CSV enviado por el proveedor',
        'Auxiliar contable de cuentas por pagar y anticipos aplicados',
        'Órdenes de compra y notas débito/crédito en trámite',
      ],
      outputs: [
        'Cruce factura a factura detectando facturas faltantes o diferencias de valor',
        'Resumen de facturas aprobadas para lote de tesorería',
        'Carta de respuesta estructurada con soporte para el proveedor',
      ],
      integrationNote:
        'Integrado con Anticipos y Conciliación Bancaria para validar pagos ejecutados y evitar duplicidades.',
    },
  },
  {
    id: 'ajustes',
    name: 'Ajustes y Configuraciones',
    category: 'Administración',
    shortDesc:
      'Control de accesos por correo electrónico: define módulos habilitados, sociedades visibles y roles de Administrador, Operador o Solo Consulta.',
    status: 'active',
    targetModule: 'ajustes',
    accentBorderHover: 'hover:border-[#132B63]/60',
  },
];

const ROADMAP_NOTES_STORAGE_KEY = 'premex_suite_roadmap_notes_v1';

export const ModuleLauncher: React.FC<ModuleLauncherProps> = ({
  onOpenModule,
  currentUser,
  onSignInWithGoogle,
  onSignOut,
  metrics,
  permissions,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'planned'>('all');
  const [selectedRoadmapModule, setSelectedRoadmapModule] =
    useState<SuiteModuleDefinition | null>(null);
  const [roadmapNotes, setRoadmapNotes] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(ROADMAP_NOTES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [noteDraft, setNoteDraft] = useState('');
  const [savedNoteFeedback, setSavedNoteFeedback] = useState(false);

  const authorizedModules = useMemo(
    () => SUITE_MODULES.filter((mod) => permissions.canAccessModule(mod.id)),
    [permissions]
  );

  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return authorizedModules.filter((mod) => {
      if (statusFilter !== 'all' && mod.status !== statusFilter) return false;
      if (!q) return true;
      return (
        mod.name.toLowerCase().includes(q) ||
        mod.shortDesc.toLowerCase().includes(q) ||
        mod.category.toLowerCase().includes(q)
      );
    });
  }, [authorizedModules, searchQuery, statusFilter]);

  const activeCount = authorizedModules.filter((m) => m.status === 'active').length;
  const plannedCount = authorizedModules.length - activeCount;
  const roleLabel = ROLE_METADATA[permissions.role].label;
  const companyScopeSummary = useMemo(() => {
    if (permissions.isAdmin || permissions.companyScope === 'all') {
      return 'Todas las empresas';
    }
    const restrictedModulesCount = Object.values(permissions.moduleCompanyAccess).filter(
      (rule) => rule && rule.scope === 'selected'
    ).length;
    if (permissions.allowedCompanies.length === 0) {
      return 'Sin empresas asignadas';
    }
    if (restrictedModulesCount > 1) {
      return `Alcance por módulo (${restrictedModulesCount} mód.)`;
    }
    if (permissions.allowedCompanies.length === 1) {
      return permissions.allowedCompanies[0];
    }
    return `${permissions.allowedCompanies.length} empresas autorizadas`;
  }, [permissions]);

  const handleTileClick = (mod: SuiteModuleDefinition) => {
    if (mod.status === 'active' && mod.targetModule) {
      onOpenModule(mod.targetModule);
    } else {
      setSelectedRoadmapModule(mod);
      setNoteDraft(roadmapNotes[mod.id] || '');
      setSavedNoteFeedback(false);
    }
  };

  const handleSaveRoadmapNote = () => {
    if (!selectedRoadmapModule) return;
    const next = {
      ...roadmapNotes,
      [selectedRoadmapModule.id]: noteDraft.trim(),
    };
    setRoadmapNotes(next);
    try {
      localStorage.setItem(ROADMAP_NOTES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota
    }
    setSavedNoteFeedback(true);
    setTimeout(() => setSavedNoteFeedback(false), 2200);
  };

  const renderLiveTelemetry = (mod: SuiteModuleDefinition) => {
    if (mod.id === 'intercompany') {
      return (
        <span className="text-xs text-slate-600 tabular-nums">
          <strong className="font-semibold text-slate-900">
            {metrics.intercompanyEntitiesCount}
          </strong>{' '}
          sociedades ·{' '}
          <strong
            className={`font-semibold ${
              metrics.intercompanyDifferencesCount > 0
                ? 'text-amber-700'
                : 'text-emerald-700'
            }`}
          >
            {metrics.intercompanyDifferencesCount}
          </strong>{' '}
          diferencias · {metrics.intercompanyPeriod === 'ALL' ? 'Todos los meses' : metrics.intercompanyPeriod}
        </span>
      );
    }

    if (mod.id === 'bancos') {
      return (
        <span className="text-xs text-slate-600 tabular-nums">
          <strong className="font-semibold text-slate-900">
            {metrics.bankAccountsCount}
          </strong>{' '}
          cuentas ·{' '}
          <strong className="font-semibold text-teal-700">
            {metrics.bankReconciledPct}%
          </strong>{' '}
          conciliado · {metrics.bankPendingCount} pend.
        </span>
      );
    }

    if (mod.id === 'viaticos') {
      return (
        <span className="text-xs text-slate-600 tabular-nums">
          <strong className="font-semibold text-slate-900">
            {metrics.viaticosLiquidacionesCount}
          </strong>{' '}
          liq. ·{' '}
          <strong className="font-semibold text-sky-700">
            {metrics.viaticosOpenCount}
          </strong>{' '}
          abiertas · {metrics.viaticosTotalLabel}
        </span>
      );
    }

    if (mod.id === 'ajustes') {
      return (
        <span className="text-xs text-slate-600 tabular-nums">
          <strong className="font-semibold text-slate-900">
            {metrics.configuredUsersCount ?? 0}
          </strong>{' '}
          correos · 3 roles · Control RBAC
        </span>
      );
    }

    const hasUserNote = Boolean(roadmapNotes[mod.id]?.trim());
    return (
      <span className="text-xs text-slate-500">
        {hasUserNote
          ? 'Requerimientos registrados · Próxima fase'
          : `${mod.category} · Arquitectura lista para activar`}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-slate-900 flex flex-col font-sans antialiased">
      {/* 3-Zone Premex Top Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200/90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Zone 1: Premex Brand */}
          <div className="flex items-center gap-3.5 min-w-0">
            <PremexBrandLogo className="h-10 w-auto shrink-0" />
            <div className="h-6 w-px bg-slate-200 hidden sm:block shrink-0" />
            <div className="hidden sm:block min-w-0">
              <div className="text-sm font-bold text-[#132B63] tracking-tight leading-none">
                Suite de Conciliaciones
              </div>
              <div className="text-[11px] text-slate-500 mt-1 leading-none">
                Plataforma Financiera Modular
              </div>
            </div>
          </div>

          {/* Zone 2: Clean Segmented Module Filter */}
          <nav
            aria-label="Filtrar módulos"
            className="hidden md:flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/70"
          >
            {(
              [
                { id: 'all', label: `Todos (${authorizedModules.length})` },
                { id: 'active', label: `Activos (${activeCount})` },
                {
                  id: 'planned',
                  label: `Próximos (${plannedCount})`,
                },
              ] as const
            ).map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white text-[#19377B] shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Shared Google Account Control */}
          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-2.5">
                <div
                  className="flex items-center gap-2"
                  title={currentUser.email || 'Usuario Google'}
                >
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'Usuario'}
                      className="w-8 h-8 rounded-full border border-slate-200"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#19377B]/10 text-[#19377B] flex items-center justify-center font-bold text-xs">
                      {currentUser.displayName ? currentUser.displayName[0] : 'U'}
                    </div>
                  )}
                  <div className="hidden lg:block text-left">
                    <div className="text-xs font-semibold text-slate-800 max-w-[160px] truncate leading-tight">
                      {currentUser.displayName || 'Usuario Premex'}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1 leading-tight">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[145px]">
                        {roleLabel}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onSignOut}
                  title="Cerrar sesión"
                  className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onSignInWithGoogle}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
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
                <span>Iniciar Sesión</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {/* Executive Premex Hero Banner (Clean single-surface corporate blue band) */}
        <section className="rounded-2xl bg-gradient-to-r from-[#132B63] via-[#1B4A8E] to-[#2470BC] text-white p-6 sm:p-8 border border-[#19377B]/30 mb-8">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-widest text-sky-200 mb-2">
                Ecosistema Financiero Premex · {roleLabel} · {companyScopeSummary}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Selecciona el módulo de conciliación
              </h1>
              <p className="text-sm text-blue-100/90 mt-2 leading-relaxed">
                Accede de forma independiente a cada aplicativo financiero. Cada módulo mantiene su
                propia lógica contable, carga de archivos, cuadres y control de permisos por correo y empresa.
              </p>
            </div>

            {/* Live Search Field inside Hero */}
            <div className="w-full lg:w-80 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar módulo (viáticos, bancos, intercompany, ajustes...)"
                  aria-label="Buscar módulo financiero"
                  className="w-full pl-10 pr-9 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 text-sm rounded-xl border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-sky-300"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Limpiar búsqueda"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Unboxed Operational Strip (Zero Pills, Tabular Numerals, Real Metrics) */}
          <div className="mt-6 pt-5 border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 sm:divide-x sm:divide-white/15">
            <div className="sm:pr-6">
              <div className="text-[11px] font-medium text-sky-200/90 uppercase tracking-wider">
                Módulos Habilitados
              </div>
              <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                <span className="text-xl font-bold text-white">{activeCount} activos</span>
                <span className="text-xs text-blue-200/80">
                  de {authorizedModules.length} autorizados
                </span>
              </div>
            </div>

            {permissions.canAccessModule('intercompany') ? (
              <div className="sm:px-6">
                <div className="text-[11px] font-medium text-sky-200/90 uppercase tracking-wider">
                  Intercompany Anitox
                </div>
                <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                  <span className="text-xl font-bold text-white">
                    {metrics.intercompanyEntitiesCount} sociedades
                  </span>
                  <span className="text-xs text-blue-200/80">
                    · {metrics.intercompanyMovementsCount} mov. ·{' '}
                    {metrics.intercompanyDifferencesCount} diferencias
                  </span>
                </div>
              </div>
            ) : (
              <div className="sm:px-6">
                <div className="text-[11px] font-medium text-sky-200/90 uppercase tracking-wider">
                  Rol Asignado
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white">{roleLabel}</span>
                  <span className="text-xs text-blue-200/80">
                    · {permissions.isReadOnly ? 'Lectura y exportación' : 'Operación autorizada'}
                  </span>
                </div>
              </div>
            )}

            {permissions.canAccessModule('bancos') ? (
              <div className="sm:pl-6">
                <div className="text-[11px] font-medium text-sky-200/90 uppercase tracking-wider">
                  Conciliación Bancaria
                </div>
                <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                  <span className="text-xl font-bold text-white">
                    {metrics.bankAccountsCount} cuentas
                  </span>
                  <span className="text-xs text-blue-200/80">
                    · {metrics.bankReconciledPct}% conciliado · {metrics.bankPendingCount} partidas abiertas
                  </span>
                </div>
              </div>
            ) : (
              <div className="sm:pl-6">
                <div className="text-[11px] font-medium text-sky-200/90 uppercase tracking-wider">
                  Alcance de Empresas
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-xl font-bold text-white truncate">
                    {companyScopeSummary}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Mobile Filter Tabs */}
        <div className="flex md:hidden items-center gap-2 mb-5 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', label: `Todos (${authorizedModules.length})` },
              { id: 'active', label: `Activos (${activeCount})` },
              { id: 'planned', label: `Próximos (${plannedCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border whitespace-nowrap shrink-0 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-[#19377B] text-white border-[#19377B]'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Modular App Grid */}
        {authorizedModules.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <p className="text-sm font-semibold text-slate-800">
              No tienes módulos asignados actualmente
            </p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Tu correo ({permissions.email || 'sin sesión'}) aún no tiene módulos habilitados en el directorio de permisos. Solicita acceso al administrador ({SUPER_ADMIN_EMAIL}).
            </p>
          </div>
        ) : filteredModules.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
            <p className="text-sm font-semibold text-slate-800">
              No se encontraron módulos para &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Intenta buscar otro nombre o limpia el filtro actual.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#19377B] rounded-xl transition-colors cursor-pointer"
            >
              Mostrar módulos habilitados
            </button>
          </div>
        ) : (
          <section aria-label="Aplicaciones de la suite">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                Aplicaciones Financieras
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                Mostrando {filteredModules.length} de {authorizedModules.length} módulos habilitados
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredModules.map((mod) => {
                const isActive = mod.status === 'active';
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => handleTileClick(mod)}
                    className={`group text-left bg-white rounded-2xl border border-slate-200/90 p-6 flex flex-col justify-between transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-hidden focus:ring-2 focus:ring-[#2169B5]/40 cursor-pointer ${mod.accentBorderHover} ${
                      isActive ? '' : 'bg-white/80'
                    }`}
                  >
                    <div>
                      {/* Emblem + Unboxed Status Text */}
                      <div className="flex items-start justify-between gap-4 mb-5">
                        <div className="transition-transform duration-150 group-hover:scale-105">
                          <ModuleEmblem
                            moduleId={mod.id}
                            className={`w-14 h-14 ${isActive ? '' : 'opacity-85 group-hover:opacity-100'}`}
                          />
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            isActive ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {isActive ? 'Disponible' : 'Próximamente'}
                        </span>
                      </div>

                      {/* Title & Description */}
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                        {mod.category}
                      </div>
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#19377B] transition-colors leading-snug">
                        {mod.name}
                      </h3>
                      <p className="text-xs sm:text-[13px] text-slate-600 mt-2 leading-relaxed">
                        {mod.shortDesc}
                      </p>
                    </div>

                    {/* Footer Telemetry & Action */}
                    <div className="mt-6 pt-3.5 border-t border-slate-100 flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate">{renderLiveTelemetry(mod)}</div>
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 ${
                          isActive ? 'text-[#1E60A8]' : 'text-slate-500 group-hover:text-slate-800'
                        }`}
                      >
                        <span>{isActive ? 'Abrir' : 'Alcance'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Concise Platform Architecture Footnote (Clean 3-column unboxed strip) */}
        <section className="mt-10 pt-8 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-start gap-3">
            <Layers className="w-5 h-5 text-[#1E60A8] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Arquitectura Escalable</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Cada proceso financiero vive en su propio módulo independiente, listo para incorporar Anticipos, CxC y CxP sin afectar los módulos en producción.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Excel y Reportes Corporativos</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Plantillas estandarizadas de carga y exportación multipestaña diseñadas para auditoría y cierres mensuales.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-[#132B63] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sesión Única y Respaldo en Nube</h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Tu cuenta corporativa de Google sincroniza el trabajo en la nube y permite compartir conciliaciones con tu equipo.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Planned Module Roadmap Modal (Ensures Zero Dead Clicks) */}
      {selectedRoadmapModule && selectedRoadmapModule.roadmapDetails && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedRoadmapModule(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <ModuleEmblem moduleId={selectedRoadmapModule.id} className="w-12 h-12 shrink-0" />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Hoja de Ruta · {selectedRoadmapModule.category}
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Módulo de {selectedRoadmapModule.name}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRoadmapModule(null)}
                aria-label="Cerrar ventana"
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Objetivo Funcional
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {selectedRoadmapModule.roadmapDetails.objective}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <h4 className="text-xs font-bold text-slate-800 mb-2">Entradas Esperadas</h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {selectedRoadmapModule.roadmapDetails.inputs.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-[#1E60A8] font-bold">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <h4 className="text-xs font-bold text-slate-800 mb-2">Entregables del Módulo</h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {selectedRoadmapModule.roadmapDetails.outputs.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-teal-700 font-bold">·</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex items-start gap-2.5 text-xs text-[#19377B] bg-[#1E60A8]/5 border border-[#1E60A8]/15 rounded-xl p-3.5">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-[#1E60A8]" />
                <span>{selectedRoadmapModule.roadmapDetails.integrationNote}</span>
              </div>

              {/* Priority / Requirement Capture */}
              <div>
                <label
                  htmlFor="roadmap-note"
                  className="block text-xs font-bold text-slate-700 mb-1.5"
                >
                  Notas o requerimientos específicos de Premex para este módulo
                </label>
                <textarea
                  id="roadmap-note"
                  rows={3}
                  value={noteDraft}
                  disabled={permissions.isReadOnly}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder={
                    permissions.isReadOnly
                      ? 'Perfil en modo Solo Consulta (sin edición de notas).'
                      : 'Ej. Formato de ERP a importar, sociedades prioritarias o reglas de cruce particulares...'
                  }
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1E60A8]/30 focus:border-[#1E60A8] disabled:bg-slate-100 disabled:text-slate-500"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSelectedRoadmapModule(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                Cerrar
              </button>

              {!permissions.isReadOnly && (
                <button
                  type="button"
                  onClick={handleSaveRoadmapNote}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#1E60A8] hover:bg-[#132B63] rounded-xl transition-colors cursor-pointer"
                >
                  {savedNoteFeedback ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Notas guardadas</span>
                    </>
                  ) : (
                    <span>Guardar notas de alcance</span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
