import * as XLSX from 'xlsx';
import {
  ActivityExecutionRecord,
  ActivityGoogleTaskLink,
  ActivityNotificationRecipient,
  ActivityPeriodicity,
  ActivityResponsible,
  ActivitySociety,
  ActivityTemplate,
  ActivitiesWorkspaceData,
  EffectivePermissions,
  UserPermissionRecord,
} from '../types';
import { normalizeEmail } from './permissions';

export const DEFAULT_START_PERIOD = '2026-11';
export const AUTO_ACTIVATION_DAY = 15;
export const CLOSURE_ACTIVITY_ID = '__CLOSURE_CONFIRMATION__';
export const CLOSURE_SOCIETY_CODE = 'CIERRE';

export const ACTIVITY_PERIODICITY_OPTIONS: { value: ActivityPeriodicity; label: string }[] = [
  { value: 'MENSUAL', label: 'Mensual' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMANAL', label: 'Semanal' },
  { value: 'ANUAL', label: 'Anual' },
];

/**
 * Normalizes a legacy single responsibleId string or string[] into a deduplicated string[].
 */
export const normalizeResponsibleIds = (raw: unknown): string[] => {
  if (!raw) return [];
  if (typeof raw === 'string') {
    const clean = raw.trim();
    return clean ? [clean] : [];
  }
  if (Array.isArray(raw)) {
    const out: string[] = [];
    const seen = new Set<string>();
    raw.forEach((item) => {
      const clean = String(item || '').trim();
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        out.push(clean);
      }
    });
    return out;
  }
  return [];
};

export const normalizeActivityTemplate = (template: ActivityTemplate): ActivityTemplate => {
  const cleanMap: Record<string, string[]> = {};
  if (template.responsablesPorSociedad && typeof template.responsablesPorSociedad === 'object') {
    Object.entries(template.responsablesPorSociedad).forEach(([socCode, val]) => {
      const cleanSoc = String(socCode || '').trim().toUpperCase();
      const ids = normalizeResponsibleIds(val);
      if (cleanSoc && ids.length > 0) {
        cleanMap[cleanSoc] = ids;
      }
    });
  }
  return {
    ...template,
    responsablesPorSociedad: cleanMap,
    ...(template.aplicarATodosResponsables ? { aplicarATodosResponsables: true } : {}),
  };
};

export const normalizeActivitySociety = (society: ActivitySociety): ActivitySociety => ({
  ...society,
  codigo: String(society.codigo || society.nombre || '').trim().toUpperCase(),
  nombre: String(society.nombre || society.codigo || '').trim(),
  responsablesIds: normalizeResponsibleIds(society.responsablesIds),
  activa: society.activa !== false,
});

export const INITIAL_ACTIVITY_SOCIETIES: ActivitySociety[] = [
  {
    id: 'soc-premex',
    codigo: 'PREMEX',
    nombre: 'PREMEX',
    responsablesIds: ['resp-diana', 'resp-ana'],
    activa: true,
  },
  {
    id: 'soc-adiquim',
    codigo: 'ADIQUIM',
    nombre: 'ADIQUIM',
    responsablesIds: ['resp-alejandro', 'resp-diana', 'resp-ana'],
    activa: true,
  },
  {
    id: 'soc-nutreo',
    codigo: 'NUTREO',
    nombre: 'NUTREO',
    responsablesIds: ['resp-kelly', 'resp-ana'],
    activa: true,
  },
  {
    id: 'soc-alura',
    codigo: 'ALURA',
    nombre: 'ALURA',
    responsablesIds: ['resp-ana'],
    activa: true,
  },
  {
    id: 'soc-asimetrix',
    codigo: 'ASIMETRIX',
    nombre: 'ASIMETRIX',
    responsablesIds: ['resp-kelly', 'resp-diana', 'resp-ana'],
    activa: true,
  },
  {
    id: 'soc-prizma',
    codigo: 'PRIZMA',
    nombre: 'PRIZMA',
    responsablesIds: ['resp-kelly', 'resp-diana', 'resp-ana'],
    activa: true,
  },
  {
    id: 'soc-mesage',
    codigo: 'MESAGE',
    nombre: 'MESAGE',
    responsablesIds: ['resp-ana'],
    activa: true,
  },
];

export const INITIAL_ACTIVITY_RESPONSIBLES: ActivityResponsible[] = [
  {
    id: 'resp-diana',
    nombre: 'Diana Rubiano',
    email: 'diana.rubiano@premexcorp.com',
    cargo: 'Analista Contable',
    activo: true,
  },
  {
    id: 'resp-alejandro',
    nombre: 'Alejandro Atheortua',
    email: 'alejandro.atheortua@premexcorp.com',
    cargo: 'Analista Contable',
    activo: true,
  },
  {
    id: 'resp-kelly',
    nombre: 'Kelly Marín',
    email: 'kelly.marin@premexcorp.com',
    cargo: 'Analista Contable',
    activo: true,
  },
  {
    id: 'resp-ana',
    nombre: 'Ana Isabel Uribe',
    email: 'ana.isabel.uribe@premexcorp.com',
    cargo: 'Analista Tesorería y Contabilidad',
    activo: true,
  },
];

export const INITIAL_ACTIVITY_TEMPLATES: ActivityTemplate[] = [
  {
    id: 'act-01',
    nombre: 'DIFERENCIA EN CAMBIO PROVISIONADO',
    periodicidad: 'MENSUAL',
    diaSugerido: 5,
    descripcion: '',
    responsablesPorSociedad: {
      PREMEX: ['resp-diana'],
    },
    activa: true,
  },
  {
    id: 'act-02',
    nombre: 'INVENTARIO EN TRANSITO',
    periodicidad: 'MENSUAL',
    diaSugerido: 6,
    descripcion: '',
    responsablesPorSociedad: {
      PREMEX: ['resp-diana'],
      ADIQUIM: ['resp-alejandro'],
      NUTREO: ['resp-kelly'],
      ALURA: ['resp-ana'],
      ASIMETRIX: ['resp-kelly'],
      PRIZMA: ['resp-kelly'],
    },
    activa: true,
  },
  {
    id: 'act-03',
    nombre: 'DIFERENCIA EN CAMBIO CAJAS EN ME',
    periodicidad: 'MENSUAL',
    diaSugerido: 7,
    descripcion: '',
    responsablesPorSociedad: {
      PREMEX: ['resp-diana'],
      ADIQUIM: ['resp-alejandro'],
      NUTREO: ['resp-kelly'],
      ALURA: ['resp-ana'],
      ASIMETRIX: ['resp-kelly'],
      PRIZMA: ['resp-kelly'],
    },
    activa: true,
  },
  {
    id: 'act-04',
    nombre: 'EJECUCIÓN DEPRECIACIÓN',
    periodicidad: 'MENSUAL',
    diaSugerido: 8,
    descripcion: '',
    responsablesPorSociedad: {
      PREMEX: ['resp-diana'],
      ADIQUIM: ['resp-diana'],
      NUTREO: ['resp-ana'],
      ASIMETRIX: ['resp-diana'],
      PRIZMA: ['resp-diana'],
    },
    activa: true,
  },
  {
    id: 'act-05',
    nombre: 'EJECUCIÓN AMORTIZACIÓN DIFERIDOS',
    periodicidad: 'MENSUAL',
    diaSugerido: 9,
    descripcion: '',
    responsablesPorSociedad: {
      PREMEX: ['resp-diana'],
      ADIQUIM: ['resp-alejandro'],
    },
    activa: true,
  },
  {
    id: 'act-06',
    nombre: 'CONCILIACIÓN BANCARIA',
    periodicidad: 'MENSUAL',
    diaSugerido: 10,
    descripcion: '',
    responsablesPorSociedad: {
      PREMEX: ['resp-ana'],
      ADIQUIM: ['resp-ana'],
      NUTREO: ['resp-ana'],
      ALURA: ['resp-ana'],
      ASIMETRIX: ['resp-ana'],
      PRIZMA: ['resp-ana'],
      MESAGE: ['resp-ana'],
    },
    activa: true,
  },
  {
    id: 'act-07',
    nombre: 'GESTIÓN ANTICIPOS',
    periodicidad: 'TRIMESTRAL',
    diaSugerido: 15,
    descripcion: '',
    responsablesPorSociedad: {},
    activa: true,
  },
  {
    id: 'act-08',
    nombre: 'CONCILIACIÓN PRESTAMOS EMPLEADOS',
    periodicidad: 'TRIMESTRAL',
    diaSugerido: 15,
    descripcion: '',
    responsablesPorSociedad: {},
    activa: true,
  },
  {
    id: 'act-09',
    nombre: 'CONCILIACIÓN CUENTA 2370',
    periodicidad: 'MENSUAL',
    diaSugerido: 12,
    descripcion: '',
    responsablesPorSociedad: {},
    activa: true,
  },
  {
    id: 'act-10',
    nombre: 'CONCILIACIÓN CONSOLIDADOS DE NÓMINA (CUENTA 25)',
    periodicidad: 'TRIMESTRAL',
    diaSugerido: 18,
    descripcion: '',
    responsablesPorSociedad: {},
    activa: true,
  },
  {
    id: 'act-11',
    nombre: 'CONCILIACIÓN MODULO INVENTARIOS - CONTABILIDAD',
    periodicidad: 'TRIMESTRAL',
    diaSugerido: 20,
    descripcion: '',
    responsablesPorSociedad: {},
    activa: true,
  },
  {
    id: 'act-12',
    nombre: 'CONCILIACIÓN MODULO ACTIVOS FIJOS - CONTABILIDAD',
    periodicidad: 'MENSUAL',
    diaSugerido: 14,
    descripcion: '',
    responsablesPorSociedad: {},
    activa: true,
  },
];

export const INITIAL_ACTIVITY_NOTIFICATION_RECIPIENTS: ActivityNotificationRecipient[] = [];

const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export const getCurrentPeriodKey = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const current = `${y}-${m}`;
  return current < DEFAULT_START_PERIOD ? DEFAULT_START_PERIOD : current;
};

export const formatPeriodLabel = (periodKey: string): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || '').trim());
  if (!match) return periodKey || 'Periodo actual';
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return periodKey;
  return `${MONTHS_ES[monthIdx]} ${year}`;
};

export const buildRecentPeriodOptions = (
  selectedPeriodKey?: string
): { key: string; label: string }[] => {
  const startMatch = /^(\d{4})-(\d{2})$/.exec(DEFAULT_START_PERIOD);
  const startYear = startMatch ? Number(startMatch[1]) : 2026;
  const startMonth = startMatch ? Number(startMatch[2]) - 1 : 10; // Nov 2026

  const options: { key: string; label: string }[] = [];
  const seen = new Set<string>();

  // Always start from Noviembre 2026 forward (14 months: Nov 2026 -> Dic 2027)
  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(startYear, startMonth + offset, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    seen.add(key);
    options.push({ key, label: formatPeriodLabel(key) });
  }

  // Ensure the currently selected period is always present even if beyond Dec 2027
  if (selectedPeriodKey && /^\d{4}-\d{2}$/.test(selectedPeriodKey) && !seen.has(selectedPeriodKey)) {
    options.push({ key: selectedPeriodKey, label: formatPeriodLabel(selectedPeriodKey) });
    options.sort((a, b) => a.key.localeCompare(b.key));
  }

  return options;
};

export interface PeriodActivationStatus {
  isActive: boolean;
  activationDateIso: string;
  daysUntilActivation: number;
  statusLabel: string;
}

/**
 * Evaluates the automatic monthly day-15 activation rule for a given YYYY-MM period.
 */
export const getPeriodActivationStatus = (
  periodKey: string,
  referenceDate: Date = new Date()
): PeriodActivationStatus => {
  const activationDateIso = computeSuggestedDateForPeriod(periodKey, AUTO_ACTIVATION_DAY);
  const todayYmd = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(
    2,
    '0'
  )}-${String(referenceDate.getDate()).padStart(2, '0')}`;
  const todayDt = new Date(`${todayYmd}T00:00:00`);
  const actDt = new Date(`${activationDateIso}T00:00:00`);
  const diffDays = Number.isNaN(actDt.getTime())
    ? 0
    : Math.round((actDt.getTime() - todayDt.getTime()) / (1000 * 60 * 60 * 24));
  const isActive = diffDays <= 0;

  return {
    isActive,
    activationDateIso,
    daysUntilActivation: Math.max(0, diffDays),
    statusLabel: isActive
      ? `Activación día 15 activa (desde ${formatShortDateEs(activationDateIso)})`
      : `Se activa automáticamente el ${formatShortDateEs(activationDateIso)} (en ${diffDays} ${
          diffDays === 1 ? 'día' : 'días'
        })`,
  };
};

export const makeExecutionId = (
  periodKey: string,
  activityId: string,
  societyCode: string
): string => `${periodKey}__${activityId}__${societyCode}`;

export const makeClosureExecutionId = (periodKey: string, userEmail: string): string =>
  `closure__${periodKey}__${emailToTaskMapKey(userEmail) || 'general'}`;

export const isClosureExecutionId = (executionId?: string | null): boolean =>
  String(executionId || '').startsWith('closure__');

/**
 * Resets the Activities workspace to start fresh at Noviembre 2026 while preserving
 * all configured societies, responsibles, activities, and notification recipients.
 */
export const buildResetToNov2026Workspace = (
  prev: ActivitiesWorkspaceData
): ActivitiesWorkspaceData => ({
  ...prev,
  selectedPeriod: DEFAULT_START_PERIOD,
  executions: {},
  notifyAdminsAutomatically: false,
  lastGoogleTasksSyncIso: null,
  hasUnsavedChanges: true,
});

export const computeSuggestedDateForPeriod = (
  periodKey: string,
  diaSugerido: number
): string => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(periodKey || '').trim());
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  const maxDay = new Date(year, month, 0).getDate();
  const clampedDay = Math.min(Math.max(1, Math.round(diaSugerido || 10)), maxDay);
  return `${year}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
};

export const formatShortDateEs = (isoOrYmd?: string): string => {
  if (!isoOrYmd) return '—';
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoOrYmd.trim());
  if (ymd) {
    return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
  }
  try {
    return new Date(isoOrYmd).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return isoOrYmd;
  }
};

export const formatDateTimeEs = (iso?: string | null): string => {
  if (!iso) return 'Sin registro';
  try {
    return new Date(iso).toLocaleString('es-CO', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
};

export type ActivityTrafficLight = 'realizada' | 'vencida' | 'proxima' | 'pendiente';

export const getTodayYmd = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
};

export const diffDaysFromToday = (targetYmd: string): number => {
  const today = new Date(`${getTodayYmd()}T00:00:00`);
  const target = new Date(`${targetYmd}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export const getExecutionTrafficLight = (
  exec: Pick<ActivityExecutionRecord, 'estado' | 'fechaSugerida'>,
  subtleReminderDaysBefore = 3
): ActivityTrafficLight => {
  if (exec.estado === 'realizada') return 'realizada';
  const daysLeft = diffDaysFromToday(exec.fechaSugerida);
  if (daysLeft < 0) return 'vencida';
  if (daysLeft <= Math.max(0, subtleReminderDaysBefore)) return 'proxima';
  return 'pendiente';
};

export interface MaterializedActivityAssignment {
  executionId: string;
  periodKey: string;
  activity: ActivityTemplate;
  society: ActivitySociety;
  /** Primary (first) responsible for backward compatibility */
  responsible: ActivityResponsible;
  /** All responsibles assigned to this activity × society cell (1 or more) */
  responsibles: ActivityResponsible[];
  /** Formatted label joining all responsible names */
  responsibleNamesLabel: string;
  execution: ActivityExecutionRecord;
  trafficLight: ActivityTrafficLight;
  daysLeft: number;
  /** True when auto-activated for all responsibles without manual cell assignment */
  isAutoAssignedAll?: boolean;
  /** True when the period has reached or passed the automatic day-15 activation date */
  isPeriodActivated?: boolean;
}

export const assignmentIncludesEmail = (
  assignment: MaterializedActivityAssignment,
  userEmail?: string | null
): boolean => {
  const norm = normalizeEmail(userEmail || '');
  if (!norm) return false;
  return assignment.responsibles.some((r) => normalizeEmail(r.email) === norm);
};

export const assignmentIncludesResponsibleId = (
  assignment: MaterializedActivityAssignment,
  responsibleId: string
): boolean => assignment.responsibles.some((r) => r.id === responsibleId);

export const emailToTaskMapKey = (email?: string | null): string => {
  const norm = normalizeEmail(email || '');
  if (!norm) return '';
  return norm.replace(/[^a-z0-9]/g, '_').slice(0, 160);
};

export const getGoogleTaskLinkForEmail = (
  exec: ActivityExecutionRecord,
  userEmail?: string | null
): ActivityGoogleTaskLink | null => {
  const key = emailToTaskMapKey(userEmail);
  if (key && exec.googleTasksByEmail?.[key]?.taskId && exec.googleTasksByEmail?.[key]?.taskListId) {
    return exec.googleTasksByEmail[key];
  }
  const normEmail = normalizeEmail(userEmail || '');
  if (
    exec.googleTaskId &&
    exec.googleTaskListId &&
    (!exec.googleTaskOwnerEmail || normalizeEmail(exec.googleTaskOwnerEmail) === normEmail)
  ) {
    return {
      taskId: exec.googleTaskId,
      taskListId: exec.googleTaskListId,
      syncedAtIso: exec.googleTaskSyncedAtIso || new Date().toISOString(),
    };
  }
  return null;
};

export const hasAnyGoogleTaskLink = (exec: ActivityExecutionRecord): boolean => {
  if (exec.googleTaskId) return true;
  if (exec.googleTasksByEmail && Object.keys(exec.googleTasksByEmail).length > 0) return true;
  return false;
};

export const withUpdatedGoogleTaskLink = (
  exec: ActivityExecutionRecord,
  userEmail: string,
  link: ActivityGoogleTaskLink
): ActivityExecutionRecord => {
  const key = emailToTaskMapKey(userEmail);
  const nextByEmail = {
    ...(exec.googleTasksByEmail || {}),
    ...(key ? { [key]: link } : {}),
  };
  return {
    ...exec,
    googleTaskId: link.taskId,
    googleTaskListId: link.taskListId,
    googleTaskOwnerEmail: normalizeEmail(userEmail) || exec.googleTaskOwnerEmail,
    googleTaskSyncedAtIso: link.syncedAtIso,
    ...(Object.keys(nextByEmail).length > 0 ? { googleTasksByEmail: nextByEmail } : {}),
  };
};

/**
 * Resolves effective responsible IDs for a given activity × society cell.
 * - If `aplicarATodosResponsables` is enabled OR the activity has no manual society assignments,
 *   tasks automatically activate for all active responsibles of the society (or all active
 *   responsibles in the catalog if the society has none) without requiring manual per-cell assignment.
 * - Otherwise uses the explicit multi-user assignment configured for that society.
 */
export const getEffectiveResponsibleIdsForCell = (
  activity: ActivityTemplate,
  society: ActivitySociety,
  allActiveResponsibleIds: string[]
): { ids: string[]; isAutoAssignedAll: boolean } => {
  const explicitIds = normalizeResponsibleIds(activity.responsablesPorSociedad?.[society.codigo]);
  const hasAnyManualAssignment = Object.values(activity.responsablesPorSociedad || {}).some(
    (val) => normalizeResponsibleIds(val).length > 0
  );

  if (activity.aplicarATodosResponsables || !hasAnyManualAssignment) {
    const societyDefaultIds = normalizeResponsibleIds(society.responsablesIds).filter((id) =>
      allActiveResponsibleIds.includes(id)
    );
    const baseIds = societyDefaultIds.length > 0 ? societyDefaultIds : allActiveResponsibleIds;
    const merged = normalizeResponsibleIds([...explicitIds, ...baseIds]);
    return { ids: merged, isAutoAssignedAll: true };
  }

  return { ids: explicitIds, isAutoAssignedAll: false };
};

/**
 * Resolves all active activity × society assignments for a given period,
 * supporting one or multiple responsibles per society cell and automatic day-15 activation.
 */
export const materializePeriodAssignments = (
  data: Pick<
    ActivitiesWorkspaceData,
    'selectedPeriod' | 'societies' | 'responsibles' | 'activities' | 'executions' | 'subtleReminderDaysBefore'
  >,
  periodOverride?: string
): MaterializedActivityAssignment[] => {
  const periodKey = periodOverride || data.selectedPeriod || getCurrentPeriodKey();
  const activationStatus = getPeriodActivationStatus(periodKey);
  const respById = new Map(data.responsibles.map((r) => [r.id, r]));
  const allActiveResponsibleIds = data.responsibles
    .filter((r) => r.activo)
    .map((r) => r.id);
  const activeSocieties = data.societies.filter((s) => s.activa);
  const results: MaterializedActivityAssignment[] = [];

  data.activities
    .filter((a) => a.activa)
    .forEach((activity) => {
      activeSocieties.forEach((society) => {
        const { ids: respIds, isAutoAssignedAll } = getEffectiveResponsibleIdsForCell(
          activity,
          society,
          allActiveResponsibleIds
        );
        if (respIds.length === 0) return;

        const resolvedResponsibles = respIds
          .map((id) => respById.get(id))
          .filter((r): r is ActivityResponsible => Boolean(r));
        if (resolvedResponsibles.length === 0) return;

        const primary = resolvedResponsibles[0];
        const responsibleNamesLabel = resolvedResponsibles.map((r) => r.nombre).join(', ');
        const executionId = makeExecutionId(periodKey, activity.id, society.codigo);
        const existing = data.executions[executionId];
        const defaultDate = computeSuggestedDateForPeriod(periodKey, activity.diaSugerido);

        const execution: ActivityExecutionRecord = existing
          ? {
              ...existing,
              responsibleId: primary.id,
              responsibleName: responsibleNamesLabel,
              responsibleEmail: primary.email,
              responsibleIds: resolvedResponsibles.map((r) => r.id),
              responsibleNames: resolvedResponsibles.map((r) => r.nombre),
              responsibleEmails: resolvedResponsibles.map((r) => r.email).filter(Boolean),
              fechaSugerida: existing.fechaSugerida || defaultDate,
            }
          : {
              id: executionId,
              periodKey,
              activityId: activity.id,
              societyCode: society.codigo,
              responsibleId: primary.id,
              responsibleName: responsibleNamesLabel,
              responsibleEmail: primary.email,
              responsibleIds: resolvedResponsibles.map((r) => r.id),
              responsibleNames: resolvedResponsibles.map((r) => r.nombre),
              responsibleEmails: resolvedResponsibles.map((r) => r.email).filter(Boolean),
              fechaSugerida: defaultDate,
              estado: 'pendiente',
            };

        const trafficLight = getExecutionTrafficLight(execution, data.subtleReminderDaysBefore);
        const daysLeft = diffDaysFromToday(execution.fechaSugerida);

        results.push({
          executionId,
          periodKey,
          activity,
          society,
          responsible: primary,
          responsibles: resolvedResponsibles,
          responsibleNamesLabel,
          execution,
          trafficLight,
          daysLeft,
          isAutoAssignedAll,
          isPeriodActivated: activationStatus.isActive,
        });
      });
    });

  return results;
};

/**
 * Enforces catalog-email-based visibility for non-administrators:
 * - Administrators see the complete workspace (all societies, activities, responsibles).
 * - Non-admin users see ONLY the societies and activities assigned to their email in the catalog
 *   (including auto-activated activities on their societies, intersected with RBAC company scope if configured).
 */
export const filterActivitiesWorkspaceForUser = (
  data: ActivitiesWorkspaceData,
  permissions: EffectivePermissions,
  userEmail: string | null
): ActivitiesWorkspaceData => {
  if (permissions.isAdmin) {
    return data;
  }

  const normEmail = normalizeEmail(userEmail || permissions.email || '');
  const matchedRespIds = new Set(
    normEmail
      ? data.responsibles
          .filter((r) => r.activo && normalizeEmail(r.email) === normEmail)
          .map((r) => r.id)
      : []
  );

  if (matchedRespIds.size === 0) {
    return {
      ...data,
      societies: [],
      activities: [],
    };
  }

  const allActiveResponsibleIds = data.responsibles
    .filter((r) => r.activo)
    .map((r) => r.id);
  const activeSocieties = data.societies.filter((s) => s.activa);

  const hasExplicitCompanyRestriction =
    permissions.getModuleCompanyScope('actividades') === 'selected';

  const societyCodesFromActivities = new Set<string>();
  data.activities
    .filter((a) => a.activa)
    .forEach((act) => {
      activeSocieties.forEach((soc) => {
        const { ids } = getEffectiveResponsibleIdsForCell(act, soc, allActiveResponsibleIds);
        if (ids.some((id) => matchedRespIds.has(id))) {
          societyCodesFromActivities.add(soc.codigo.trim().toUpperCase());
        }
      });
    });

  const visibleSocieties = activeSocieties.filter((soc) => {
    const assignedOnSociety = normalizeResponsibleIds(soc.responsablesIds).some((id) =>
      matchedRespIds.has(id)
    );
    const assignedOnAnyActivity = societyCodesFromActivities.has(soc.codigo.trim().toUpperCase());
    if (!assignedOnSociety && !assignedOnAnyActivity) return false;

    if (hasExplicitCompanyRestriction) {
      return (
        permissions.isCompanyAllowed(soc.codigo, 'actividades') ||
        permissions.isCompanyAllowed(soc.nombre, 'actividades')
      );
    }
    return true;
  });

  const visibleActivities: ActivityTemplate[] = [];
  data.activities
    .filter((a) => a.activa)
    .forEach((act) => {
      const prunedMap: Record<string, string[]> = {};
      visibleSocieties.forEach((soc) => {
        const { ids } = getEffectiveResponsibleIdsForCell(act, soc, allActiveResponsibleIds);
        if (ids.some((id) => matchedRespIds.has(id))) {
          prunedMap[soc.codigo] = ids;
        }
      });
      if (Object.keys(prunedMap).length > 0) {
        visibleActivities.push({
          ...act,
          aplicarATodosResponsables: false,
          responsablesPorSociedad: prunedMap,
        });
      }
    });

  return {
    ...data,
    societies: visibleSocieties,
    activities: visibleActivities,
  };
};

/**
 * Collects all deduplicated notification emails configured on one or more responsibles (`notificarA`).
 */
export const collectResponsibleNotifyEmails = (
  responsibles: ActivityResponsible[]
): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  responsibles.forEach((resp) => {
    (resp.notificarA || []).forEach((raw) => {
      const em = normalizeEmail(raw);
      if (em && em.includes('@') && !seen.has(em)) {
        seen.add(em);
        out.push(em);
      }
    });
  });
  return out;
};

/**
 * Resolves completion/closure notification recipients strictly from explicitly configured lists:
 * 1. Custom per-responsible recipients (`responsible.notificarA`),
 * 2. Explicitly added recipients in the Panel de Actividades recipients list (`notificationRecipients`),
 * 3. Optional activity-level extra recipients (`activity.notificarAdicionales`).
 * Never depends on whether a user holds Administrator permissions.
 */
export const resolveCompletionNotificationRecipients = (params: {
  notificationRecipients: ActivityNotificationRecipient[];
  responsibleNotifyEmails?: string[];
  allResponsibles?: ActivityResponsible[];
  activityExtraEmails?: string[];
  /** Deprecated — ignored; notifications no longer depend on admin permissions */
  notifyAdminsAutomatically?: boolean;
  /** Deprecated — ignored; notifications no longer depend on admin permissions */
  suitePermissionRecords?: UserPermissionRecord[];
}): { email: string; nombre: string; origen: string }[] => {
  const byEmail = new Map<string, { email: string; nombre: string; origen: string }>();

  const nameByEmail = new Map<string, string>();
  (params.allResponsibles || []).forEach((r) => {
    const em = normalizeEmail(r.email);
    if (em && r.nombre) nameByEmail.set(em, r.nombre);
  });
  params.notificationRecipients.forEach((r) => {
    const em = normalizeEmail(r.email);
    if (em && r.nombre) nameByEmail.set(em, r.nombre);
  });

  // 1. Per-responsible configured recipients ("Notificar a" on the user)
  (params.responsibleNotifyEmails || []).forEach((raw) => {
    const em = normalizeEmail(raw);
    if (em && em.includes('@') && !byEmail.has(em)) {
      byEmail.set(em, {
        email: em,
        nombre: nameByEmail.get(em) || em,
        origen: 'Destinatario del responsable',
      });
    }
  });

  // 2. Explicitly added general recipients (independent of admin permissions)
  params.notificationRecipients
    .filter((r) => r.activo && r.email && r.email.includes('@'))
    .forEach((r) => {
      const em = normalizeEmail(r.email);
      if (!byEmail.has(em)) {
        byEmail.set(em, {
          email: em,
          nombre: r.nombre || em,
          origen: 'Destinatario agregado',
        });
      }
    });

  // 3. Optional activity-specific recipients
  (params.activityExtraEmails || []).forEach((raw) => {
    const em = normalizeEmail(raw);
    if (em && em.includes('@') && !byEmail.has(em)) {
      byEmail.set(em, {
        email: em,
        nombre: nameByEmail.get(em) || em,
        origen: 'Destinatario de actividad',
      });
    }
  });

  return Array.from(byEmail.values());
};

export const exportActivitiesMatrixToExcel = (
  data: ActivitiesWorkspaceData,
  assignments: MaterializedActivityAssignment[]
): void => {
  const activeSocieties = data.societies.filter((s) => s.activa);
  const respById = new Map(data.responsibles.map((r) => [r.id, r]));
  const allActiveResponsibleIds = data.responsibles
    .filter((r) => r.activo)
    .map((r) => r.id);
  const assignMap = new Map(assignments.map((a) => [a.executionId, a]));
  const periodLabel = formatPeriodLabel(data.selectedPeriod);

  const matrixHeader = [
    'ACTIVIDADES',
    'PERIODICIDAD',
    'FECHA SUGERIDA',
    ...activeSocieties.map((s) => s.codigo),
  ];

  const matrixRows: (string | number)[][] = [
    [`PANEL DE ACTIVIDADES PREMEX — ${periodLabel.toUpperCase()}`],
    [],
    ['', '', '', 'SOCIEDAD / RESPONSABLE Y ESTADO'],
    matrixHeader,
  ];

  data.activities
    .filter((a) => a.activa)
    .forEach((act) => {
      const defaultDate = computeSuggestedDateForPeriod(data.selectedPeriod, act.diaSugerido);
      const row: (string | number)[] = [
        act.nombre,
        act.periodicidad,
        formatShortDateEs(defaultDate),
      ];
      activeSocieties.forEach((soc) => {
        const { ids: respIds } = getEffectiveResponsibleIdsForCell(
          act,
          soc,
          allActiveResponsibleIds
        );
        if (respIds.length === 0) {
          row.push('');
          return;
        }
        const execId = makeExecutionId(data.selectedPeriod, act.id, soc.codigo);
        const item = assignMap.get(execId);
        const names =
          item?.responsibleNamesLabel ||
          respIds
            .map((id) => respById.get(id)?.nombre)
            .filter(Boolean)
            .join(', ');
        const statusTag = item?.execution.estado === 'realizada' ? ' [REALIZADA]' : ' [PENDIENTE]';
        row.push(`${names}${statusTag}`);
      });
      matrixRows.push(row);
    });

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
  wsMatrix['!cols'] = [
    { wch: 46 },
    { wch: 15 },
    { wch: 16 },
    ...activeSocieties.map(() => ({ wch: 28 })),
  ];

  const detailRows = assignments.map((item) => ({
    Periodo: periodLabel,
    Actividad: item.activity.nombre,
    Periodicidad: item.activity.periodicidad,
    Sociedad: item.society.codigo,
    Responsables: item.responsibleNamesLabel,
    Correos: item.responsibles.map((r) => r.email).filter(Boolean).join(', '),
    'Fecha Sugerida': formatShortDateEs(item.execution.fechaSugerida),
    Estado: item.execution.estado === 'realizada' ? 'REALIZADA' : 'PENDIENTE',
    'Fecha Confirmación': item.execution.completadaAtIso
      ? formatDateTimeEs(item.execution.completadaAtIso)
      : '',
    'Confirmada Por': item.execution.completadaPorNombre || '',
    Origen:
      item.execution.origenConfirmacion === 'google_tasks'
        ? 'Google Tasks'
        : item.execution.origenConfirmacion === 'panel'
        ? 'Panel de Actividades'
        : '',
    'Google Tasks': item.execution.googleTaskId ? 'Vinculada' : 'Sin vincular',
    Comentario: item.execution.comentarioCierre || '',
  }));

  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  wsDetail['!cols'] = [
    { wch: 18 },
    { wch: 42 },
    { wch: 14 },
    { wch: 14 },
    { wch: 30 },
    { wch: 36 },
    { wch: 15 },
    { wch: 14 },
    { wch: 20 },
    { wch: 24 },
    { wch: 20 },
    { wch: 14 },
    { wch: 36 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matriz Actividades');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Seguimiento Detallado');
  XLSX.writeFile(wb, `Premex_Panel_Actividades_${data.selectedPeriod}.xlsx`);
};
