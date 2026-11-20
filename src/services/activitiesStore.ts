import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  activeFirebaseInfo,
  registerFirestoreListener,
  withFirestoreTimeout,
  fetchWithTimeout,
  isRecoverableFirestoreSdkError,
} from './auth';
import { handleFirestoreError, OperationType } from './reconciliationStore';
import {
  ActivityExecutionRecord,
  ActivityNotificationRecipient,
  ActivityPeriodicity,
  ActivityResponsible,
  ActivitySociety,
  ActivityTemplate,
} from '../types';
import { getCurrentPeriodKey, normalizeResponsibleIds } from '../utils/activities';
import { normalizeActivityCountry } from '../utils/countryHolidays';
import { normalizeEmail } from '../utils/permissions';

export const DEFAULT_ACTIVITIES_DOC_ID = 'premex-actividades-principal';

export interface SavedActivitiesWorkspaceDoc {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  selectedPeriod: string;
  societies: ActivitySociety[];
  responsibles: ActivityResponsible[];
  activities: ActivityTemplate[];
  executions: Record<string, ActivityExecutionRecord>;
  notificationRecipients: ActivityNotificationRecipient[];
  notifyAdminsAutomatically: boolean;
  subtleReminderDaysBefore: number;
  updatedAtIso?: string;
}

const VALID_PERIODICITIES = new Set<ActivityPeriodicity>([
  'MENSUAL',
  'TRIMESTRAL',
  'SEMANAL',
  'ANUAL',
]);

const sanitizeSociety = (s: ActivitySociety, idx = 0): ActivitySociety => {
  const codigo = String(s.codigo || s.nombre || `SOC${idx + 1}`)
    .trim()
    .toUpperCase()
    .slice(0, 40);
  const cleanRespIds = normalizeResponsibleIds(s.responsablesIds)
    .map((id) => id.slice(0, 120))
    .slice(0, 50);
  const clean: ActivitySociety = {
    id: String(s.id || `soc-${codigo.toLowerCase()}`).slice(0, 120),
    codigo,
    nombre: String(s.nombre || codigo).trim().slice(0, 120),
    pais: normalizeActivityCountry(s.pais).slice(0, 80),
    activa: s.activa !== false,
  };
  if (cleanRespIds.length > 0) {
    clean.responsablesIds = cleanRespIds;
  }
  return clean;
};

const sanitizeResponsible = (r: ActivityResponsible, idx = 0): ActivityResponsible => {
  const clean: ActivityResponsible = {
    id: String(r.id || `resp-${idx + 1}`).slice(0, 120),
    nombre: String(r.nombre || 'Responsable').trim().slice(0, 120),
    email: normalizeEmail(r.email || '').slice(0, 160),
    cargo: r.cargo ? String(r.cargo).trim().slice(0, 120) : '',
    activo: r.activo !== false,
  };
  if (Array.isArray(r.notificarA) && r.notificarA.length > 0) {
    const cleanEmails = Array.from(
      new Set(
        r.notificarA
          .map((em) => normalizeEmail(em).slice(0, 160))
          .filter((em) => em.includes('@'))
      )
    ).slice(0, 30);
    if (cleanEmails.length > 0) {
      clean.notificarA = cleanEmails;
    }
  }
  return clean;
};

const sanitizeTemplate = (a: ActivityTemplate, idx = 0): ActivityTemplate => {
  const cleanMap: Record<string, string[]> = {};
  if (a.responsablesPorSociedad && typeof a.responsablesPorSociedad === 'object') {
    Object.entries(a.responsablesPorSociedad)
      .slice(0, 100)
      .forEach(([socCode, rawVal]) => {
        const cleanSoc = String(socCode || '').trim().toUpperCase().slice(0, 40);
        const cleanIds = normalizeResponsibleIds(rawVal)
          .map((id) => id.slice(0, 120))
          .slice(0, 25);
        if (cleanSoc && cleanIds.length > 0) {
          cleanMap[cleanSoc] = cleanIds;
        }
      });
  }

  const periodicidad: ActivityPeriodicity = VALID_PERIODICITIES.has(a.periodicidad)
    ? a.periodicidad
    : 'MENSUAL';

  const clean: ActivityTemplate = {
    id: String(a.id || `act-${idx + 1}`).slice(0, 120),
    nombre: String(a.nombre || 'Actividad').trim().slice(0, 180),
    periodicidad,
    diaSugerido: Math.min(31, Math.max(1, Math.round(Number(a.diaSugerido) || 10))),
    descripcion: a.descripcion ? String(a.descripcion).trim().slice(0, 400) : '',
    responsablesPorSociedad: cleanMap,
    activa: a.activa !== false,
  };

  if (a.aplicarATodosResponsables) {
    clean.aplicarATodosResponsables = true;
  }

  if (Array.isArray(a.notificarAdicionales) && a.notificarAdicionales.length > 0) {
    clean.notificarAdicionales = Array.from(
      new Set(
        a.notificarAdicionales
          .map((em) => normalizeEmail(em).slice(0, 160))
          .filter((em) => em.includes('@'))
      )
    ).slice(0, 30);
  }
  return clean;
};

const sanitizeExecution = (
  key: string,
  e: ActivityExecutionRecord
): ActivityExecutionRecord => {
  const clean: ActivityExecutionRecord = {
    id: String(e.id || key).slice(0, 160),
    periodKey: String(e.periodKey || getCurrentPeriodKey()).trim().slice(0, 20),
    activityId: String(e.activityId || '').trim().slice(0, 120),
    societyCode: String(e.societyCode || '').trim().toUpperCase().slice(0, 40),
    responsibleId: String(e.responsibleId || '').trim().slice(0, 120),
    responsibleName: String(e.responsibleName || '').trim().slice(0, 200),
    responsibleEmail: normalizeEmail(e.responsibleEmail || '').slice(0, 160),
    fechaSugerida: String(e.fechaSugerida || '').trim().slice(0, 20),
    estado: e.estado === 'realizada' ? 'realizada' : 'pendiente',
  };

  if (Array.isArray(e.responsibleIds) && e.responsibleIds.length > 0) {
    clean.responsibleIds = normalizeResponsibleIds(e.responsibleIds)
      .map((id) => id.slice(0, 120))
      .slice(0, 25);
  }
  if (Array.isArray(e.responsibleNames) && e.responsibleNames.length > 0) {
    clean.responsibleNames = e.responsibleNames
      .map((n) => String(n || '').trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 25);
  }
  if (Array.isArray(e.responsibleEmails) && e.responsibleEmails.length > 0) {
    clean.responsibleEmails = Array.from(
      new Set(
        e.responsibleEmails
          .map((em) => normalizeEmail(em).slice(0, 160))
          .filter((em) => em.includes('@'))
      )
    ).slice(0, 25);
  }

  if (e.completadaAtIso) clean.completadaAtIso = String(e.completadaAtIso).slice(0, 60);
  if (e.completadaPorNombre) clean.completadaPorNombre = String(e.completadaPorNombre).slice(0, 120);
  if (e.completadaPorEmail) clean.completadaPorEmail = normalizeEmail(e.completadaPorEmail).slice(0, 160);
  if (e.origenConfirmacion === 'google_tasks' || e.origenConfirmacion === 'panel') {
    clean.origenConfirmacion = e.origenConfirmacion;
  }
  if (e.comentarioCierre) clean.comentarioCierre = String(e.comentarioCierre).trim().slice(0, 500);
  if (e.ultimoRecordatorioIso) clean.ultimoRecordatorioIso = String(e.ultimoRecordatorioIso).slice(0, 60);
  if (typeof e.recordatoriosEnviadosCount === 'number') {
    clean.recordatoriosEnviadosCount = Math.max(0, Math.round(e.recordatoriosEnviadosCount));
  }
  if (e.notificacionCierreEnviadaIso) {
    clean.notificacionCierreEnviadaIso = String(e.notificacionCierreEnviadaIso).slice(0, 60);
  }
  if (Array.isArray(e.notificacionCierreDestinatarios)) {
    clean.notificacionCierreDestinatarios = e.notificacionCierreDestinatarios
      .map((d) => normalizeEmail(d).slice(0, 160))
      .filter(Boolean)
      .slice(0, 50);
  }
  if (e.googleTaskId) clean.googleTaskId = String(e.googleTaskId).slice(0, 200);
  if (e.googleTaskListId) clean.googleTaskListId = String(e.googleTaskListId).slice(0, 200);
  if (e.googleTaskOwnerEmail) {
    clean.googleTaskOwnerEmail = normalizeEmail(e.googleTaskOwnerEmail).slice(0, 160);
  }
  if (e.googleTaskSyncedAtIso) {
    clean.googleTaskSyncedAtIso = String(e.googleTaskSyncedAtIso).slice(0, 60);
  }
  if (e.googleTasksByEmail && typeof e.googleTasksByEmail === 'object') {
    const cleanLinks: Record<string, { taskId: string; taskListId: string; syncedAtIso: string }> =
      {};
    Object.entries(e.googleTasksByEmail)
      .slice(0, 30)
      .forEach(([rawKey, val]) => {
        const safeKey = String(rawKey || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_')
          .slice(0, 160);
        if (safeKey && val && typeof val === 'object' && val.taskId && val.taskListId) {
          cleanLinks[safeKey] = {
            taskId: String(val.taskId).slice(0, 200),
            taskListId: String(val.taskListId).slice(0, 200),
            syncedAtIso: String(val.syncedAtIso || new Date().toISOString()).slice(0, 60),
          };
        }
      });
    if (Object.keys(cleanLinks).length > 0) {
      clean.googleTasksByEmail = cleanLinks;
    }
  }
  return clean;
};

const sanitizeRecipient = (
  r: ActivityNotificationRecipient,
  idx = 0
): ActivityNotificationRecipient => ({
  id: String(r.id || `notif-${idx + 1}`).slice(0, 120),
  nombre: String(r.nombre || 'Destinatario').trim().slice(0, 120),
  email: normalizeEmail(r.email || '').slice(0, 160),
  tipo: r.tipo === 'administrador' ? 'administrador' : 'designado',
  activo: r.activo !== false,
});

const sanitizeExecutionsMap = (
  raw: Record<string, ActivityExecutionRecord> | undefined
): Record<string, ActivityExecutionRecord> => {
  const out: Record<string, ActivityExecutionRecord> = {};
  if (!raw || typeof raw !== 'object') return out;
  Object.entries(raw)
    .slice(0, 3000)
    .forEach(([k, val]) => {
      const cleanKey = String(k || '').trim().slice(0, 160);
      if (cleanKey && val && typeof val === 'object') {
        out[cleanKey] = sanitizeExecution(cleanKey, val);
      }
    });
  return out;
};

const toFirestoreValue = (val: unknown): unknown => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    Object.entries(val as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
};

const fromFirestoreValue = (val: Record<string, any> | undefined): any => {
  if (!val || typeof val !== 'object') return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) return (val.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in val) {
    const obj: Record<string, any> = {};
    Object.entries(val.mapValue?.fields || {}).forEach(([k, v]) => {
      obj[k] = fromFirestoreValue(v as Record<string, any>);
    });
    return obj;
  }
  return undefined;
};

const getRestBaseUrl = () => {
  const { projectId, databaseId } = activeFirebaseInfo;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}`;
};

const parseWorkspaceFields = (
  docId: string,
  data: Record<string, any>
): SavedActivitiesWorkspaceDoc => ({
  id: docId,
  ownerId: String(data.ownerId || ''),
  ownerName: data.ownerName ? String(data.ownerName) : undefined,
  title: String(data.title || 'Panel de Actividades Premex'),
  selectedPeriod: String(data.selectedPeriod || getCurrentPeriodKey()),
  societies: Array.isArray(data.societies) ? data.societies.map(sanitizeSociety) : [],
  responsibles: Array.isArray(data.responsibles)
    ? data.responsibles.map(sanitizeResponsible)
    : [],
  activities: Array.isArray(data.activities) ? data.activities.map(sanitizeTemplate) : [],
  executions: sanitizeExecutionsMap(data.executions),
  notificationRecipients: Array.isArray(data.notificationRecipients)
    ? data.notificationRecipients.map(sanitizeRecipient)
    : [],
  notifyAdminsAutomatically: data.notifyAdminsAutomatically !== false,
  subtleReminderDaysBefore:
    typeof data.subtleReminderDaysBefore === 'number'
      ? Math.min(30, Math.max(0, Math.round(data.subtleReminderDaysBefore)))
      : 3,
  updatedAtIso:
    data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate().toISOString()
      : data.updatedAt
      ? String(data.updatedAt)
      : undefined,
});

const fetchAuthActivitiesViaRest = async (
  docId: string
): Promise<SavedActivitiesWorkspaceDoc | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/activity_workspaces/${encodeURIComponent(
    docId
  )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${idToken}` } },
    10000
  );
  if (!res.ok) return null;
  const raw = await res.json();
  const fields: Record<string, any> = {};
  Object.entries(raw.fields || {}).forEach(([k, v]) => {
    fields[k] = fromFirestoreValue(v as Record<string, any>);
  });
  return parseWorkspaceFields(docId, fields);
};

export const subscribeToActivitiesWorkspace = (
  docId: string,
  onData: (saved: SavedActivitiesWorkspaceDoc | null) => void,
  onError?: (err: unknown) => void
) => {
  const safeId = /^[a-zA-Z0-9_-]{1,128}$/.test(docId) ? docId : DEFAULT_ACTIVITIES_DOC_ID;
  const path = `activity_workspaces/${safeId}`;
  const ref = doc(db, 'activity_workspaces', safeId);
  let isActive = true;

  fetchAuthActivitiesViaRest(safeId)
    .then((parsed) => {
      if (isActive && parsed) onData(parsed);
    })
    .catch(() => {});

  const unsubscribe = onSnapshot(
    ref,
    (snapshot) => {
      if (!isActive) return;
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(parseWorkspaceFields(snapshot.id, snapshot.data()));
    },
    (error) => {
      if (!isActive || isRecoverableFirestoreSdkError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError) onError(wrapped);
      }
    }
  );

  return registerFirestoreListener(() => {
    isActive = false;
    unsubscribe();
  });
};

export const saveActivitiesWorkspaceToCloud = async (params: {
  targetId?: string;
  title: string;
  selectedPeriod: string;
  societies: ActivitySociety[];
  responsibles: ActivityResponsible[];
  activities: ActivityTemplate[];
  executions: Record<string, ActivityExecutionRecord>;
  notificationRecipients: ActivityNotificationRecipient[];
  notifyAdminsAutomatically: boolean;
  subtleReminderDaysBefore: number;
}): Promise<{ id: string; updatedAtIso: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      'Inicia sesión con tu cuenta de Google para guardar el Panel de Actividades en la nube.'
    );
  }

  await user.getIdToken().catch(() => {});

  const docId =
    params.targetId && /^[a-zA-Z0-9_-]{1,128}$/.test(params.targetId)
      ? params.targetId
      : DEFAULT_ACTIVITIES_DOC_ID;
  const path = `activity_workspaces/${docId}`;

  const cleanSocieties = params.societies.slice(0, 100).map(sanitizeSociety);
  const cleanResponsibles = params.responsibles.slice(0, 200).map(sanitizeResponsible);
  const cleanActivities = params.activities.slice(0, 200).map(sanitizeTemplate);
  const cleanExecutions = sanitizeExecutionsMap(params.executions);
  const cleanRecipients = params.notificationRecipients.slice(0, 100).map(sanitizeRecipient);
  const safeTitle = String(params.title || 'Panel de Actividades Premex').trim().slice(0, 150);
  const safePeriod = String(params.selectedPeriod || getCurrentPeriodKey()).trim().slice(0, 20);
  const ownerName = String(user.displayName || user.email || 'Usuario').slice(0, 120);
  const safeDays = Math.min(30, Math.max(0, Math.round(Number(params.subtleReminderDaysBefore) || 3)));

  const updateFields = {
    ownerName,
    title: safeTitle,
    selectedPeriod: safePeriod,
    societies: cleanSocieties,
    responsibles: cleanResponsibles,
    activities: cleanActivities,
    executions: cleanExecutions,
    notificationRecipients: cleanRecipients,
    notifyAdminsAutomatically: Boolean(params.notifyAdminsAutomatically),
    subtleReminderDaysBefore: safeDays,
    societiesCount: cleanSocieties.length,
    activitiesCount: cleanActivities.length,
  };

  try {
    const ref = doc(db, 'activity_workspaces', docId);
    const snap = await withFirestoreTimeout(getDoc(ref), 8500, path);
    if (snap.exists()) {
      await withFirestoreTimeout(
        updateDoc(ref, {
          ...updateFields,
          updatedAt: serverTimestamp(),
        }),
        8500,
        path
      );
    } else {
      await withFirestoreTimeout(
        setDoc(ref, {
          ownerId: user.uid,
          ...updateFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        8500,
        path
      );
    }
  } catch (error) {
    if (isRecoverableFirestoreSdkError(error)) {
      const existing = await fetchAuthActivitiesViaRest(docId);
      const isUpdate = Boolean(existing);
      const idToken = await user.getIdToken();
      const rawFields: Record<string, unknown> = isUpdate
        ? updateFields
        : { ownerId: user.uid, ...updateFields };
      const firestoreFields: Record<string, unknown> = {};
      Object.entries(rawFields).forEach(([k, v]) => {
        firestoreFields[k] = toFirestoreValue(v);
      });

      const { projectId, databaseId } = activeFirebaseInfo;
      const docName = `projects/${projectId}/databases/${databaseId}/documents/activity_workspaces/${docId}`;

      const writeOp: Record<string, unknown> = {
        update: { name: docName, fields: firestoreFields },
        updateTransforms: isUpdate
          ? [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
          : [
              { fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' },
              { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
            ],
        currentDocument: { exists: isUpdate },
      };

      if (isUpdate) {
        writeOp.updateMask = {
          fieldPaths: [
            'ownerName',
            'title',
            'selectedPeriod',
            'societies',
            'responsibles',
            'activities',
            'executions',
            'notificationRecipients',
            'notifyAdminsAutomatically',
            'subtleReminderDaysBefore',
            'societiesCount',
            'activitiesCount',
          ],
        };
      }

      const res = await fetchWithTimeout(
        `${getRestBaseUrl()}/documents:commit?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ writes: [writeOp] }),
        },
        12000
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error?.message ||
            `Error HTTP ${res.status} al guardar el Panel de Actividades en la nube (${path}).`
        );
      }
    } else {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  return { id: docId, updatedAtIso: new Date().toISOString() };
};
