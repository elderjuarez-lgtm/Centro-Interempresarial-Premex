import {
  doc,
  getDoc,
  getDocFromServer,
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
import { EntityMapping, Movement, ClosedMonthRecord, ReconciliationScope } from '../types';

export const DEFAULT_RECONCILIATION_ID = 'principal';
export const DEFAULT_NACIONALES_ID = 'principal-nacionales';
export const DEFAULT_ANITOX_ID = 'principal-anitox';

export const normalizeReconciliationScope = (
  scope?: string | null
): ReconciliationScope => {
  if (scope === 'nacionales') return 'nacionales';
  if (scope === 'anitox') return 'anitox';
  return 'internacionales';
};

export const getDefaultReconciliationId = (scope: ReconciliationScope): string => {
  if (scope === 'nacionales') return DEFAULT_NACIONALES_ID;
  if (scope === 'anitox') return DEFAULT_ANITOX_ID;
  return DEFAULT_RECONCILIATION_ID;
};

const createScopedCopyId = (scope: ReconciliationScope): string => {
  if (scope === 'nacionales') return `rec-nac-${Date.now()}`;
  if (scope === 'anitox') return `rec-anx-${Date.now()}`;
  return `rec-${Date.now()}`;
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<void> {
  try {
    await withFirestoreTimeout(
      getDocFromServer(doc(db, 'test', 'connection')),
      6000,
      'test/connection'
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore SDK WebChannel offline; REST fallback ready.');
    }
  }
}

export interface SavedReconciliationDoc {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  selectedMonth: string;
  entities: EntityMapping[];
  movements: Movement[];
  comments: Record<string, string>;
  closedMonths: Record<string, ClosedMonthRecord>;
  movementsCount: number;
  entitiesCount: number;
  updatedAtIso?: string;
}

const sanitizeEntities = (entities: EntityMapping[]): EntityMapping[] => {
  return entities.slice(0, 200).map((e, idx) => ({
    id: String(e.id || `ent-${idx + 1}`).slice(0, 128),
    alias: String(e.alias || e.nombreOficial || '').slice(0, 150),
    nombreOficial: String(e.nombreOficial || '').slice(0, 150),
    nit: e.nit ? String(e.nit).trim().slice(0, 60) : '',
    email: e.email ? String(e.email).trim().slice(0, 150) : '',
    codigoSociedad: String(e.codigoSociedad || `EMP-${(idx + 1) * 100}`).slice(0, 60),
    pais: e.pais ? String(e.pais).slice(0, 80) : '',
    moneda: String(e.moneda || 'USD').slice(0, 10),
  }));
};

const sanitizeMovements = (movements: Movement[]): Movement[] => {
  return movements.slice(0, 5000).map((m, idx) => {
    const clean: Movement = {
      id: String(m.id || `mov-${idx + 1}`).slice(0, 128),
      sociedad: String(m.sociedad || '').slice(0, 150),
      contraparte: String(m.contraparte || '').slice(0, 150),
      fecha_factura: String(m.fecha_factura || '').slice(0, 40),
      factura: String(m.factura || '').slice(0, 100),
      valor: Number.isFinite(Number(m.valor)) ? Number(m.valor) : 0,
      tipo: m.tipo === 'CXP' ? 'CXP' : 'CXC',
      mes: String(m.mes || 'Septiembre 2026').slice(0, 60),
    };
    if (m.notas && String(m.notas).trim()) {
      clean.notas = String(m.notas).slice(0, 300);
    }
    return clean;
  });
};

const sanitizeComments = (comments: Record<string, string>): Record<string, string> => {
  const result: Record<string, string> = {};
  Object.entries(comments)
    .slice(0, 2000)
    .forEach(([key, val]) => {
      if (key && typeof val === 'string' && val.trim()) {
        result[key.slice(0, 250)] = val.slice(0, 1000);
      }
    });
  return result;
};

const sanitizeClosedMonths = (
  closedMonths?: Record<string, ClosedMonthRecord>
): Record<string, ClosedMonthRecord> => {
  const result: Record<string, ClosedMonthRecord> = {};
  if (!closedMonths || typeof closedMonths !== 'object') return result;

  Object.entries(closedMonths)
    .slice(0, 120)
    .forEach(([monthKey, rec]) => {
      const cleanKey = String(monthKey || '').trim().slice(0, 60);
      if (!cleanKey || !rec || typeof rec !== 'object') return;
      const cleanRecord: ClosedMonthRecord = {
        month: String(rec.month || cleanKey).slice(0, 60),
        closedAt: String(rec.closedAt || new Date().toISOString()).slice(0, 60),
        closedBy: String(rec.closedBy || 'Usuario').slice(0, 120),
        movementsCount: Math.max(0, Math.min(5000, Math.trunc(Number(rec.movementsCount) || 0))),
        differencesCount: Math.max(0, Math.min(5000, Math.trunc(Number(rec.differencesCount) || 0))),
      };
      if (rec.archiveId) {
        cleanRecord.archiveId = String(rec.archiveId).slice(0, 128);
      }
      if (rec.commentsSnapshot && typeof rec.commentsSnapshot === 'object') {
        cleanRecord.commentsSnapshot = sanitizeComments(rec.commentsSnapshot);
      }
      if (Array.isArray(rec.entitiesSnapshot)) {
        cleanRecord.entitiesSnapshot = rec.entitiesSnapshot
          .slice(0, 200)
          .map((name) => String(name || '').slice(0, 150))
          .filter(Boolean);
      }
      result[cleanKey] = cleanRecord;
    });

  return result;
};

const isOfflineError = (err: unknown): boolean => isRecoverableFirestoreSdkError(err);

// --- Firestore REST API v1 conversion helpers (for corporate proxy fallback) ---
const toFirestoreValue = (val: any): any => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    Object.entries(val).forEach(([k, v]) => {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    });
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
};

const fromFirestoreValue = (val: any): any => {
  if (!val || typeof val !== 'object') return undefined;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('stringValue' in val) return String(val.stringValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('arrayValue' in val) {
    const arr = val.arrayValue?.values || [];
    return arr.map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const obj: Record<string, any> = {};
    const fields = val.mapValue?.fields || {};
    Object.entries(fields).forEach(([k, v]) => {
      obj[k] = fromFirestoreValue(v);
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

const getRestDocumentPath = (collectionName: string, docId: string) => {
  const { projectId, databaseId } = activeFirebaseInfo;
  return `projects/${projectId}/databases/${databaseId}/documents/${collectionName}/${docId}`;
};

const fetchReconciliationViaRest = async (docId: string): Promise<SavedReconciliationDoc | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/reconciliations/${encodeURIComponent(docId)}?key=${encodeURIComponent(
    activeFirebaseInfo.apiKey
  )}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error?.message || `Error HTTP ${res.status} al leer conciliación`);
  }
  const raw = await res.json();
  const fields = raw.fields || {};
  const parsed: Record<string, any> = {};
  Object.entries(fields).forEach(([k, v]) => {
    parsed[k] = fromFirestoreValue(v);
  });

  return {
    id: docId,
    ownerId: String(parsed.ownerId || ''),
    ownerName: parsed.ownerName ? String(parsed.ownerName) : undefined,
    title: String(parsed.title || 'Conciliación Interempresarial'),
    selectedMonth: String(parsed.selectedMonth || 'Septiembre 2026'),
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    movements: Array.isArray(parsed.movements) ? parsed.movements : [],
    comments: parsed.comments && typeof parsed.comments === 'object' ? parsed.comments : {},
    closedMonths:
      parsed.closedMonths && typeof parsed.closedMonths === 'object' ? parsed.closedMonths : {},
    movementsCount: Number(parsed.movementsCount || 0),
    entitiesCount: Number(parsed.entitiesCount || 0),
    updatedAtIso: parsed.updatedAt ? String(parsed.updatedAt) : undefined,
  };
};

const saveReconciliationViaRest = async (params: {
  docId: string;
  scope?: ReconciliationScope;
  forceNewCopy?: boolean;
  uid: string;
  idToken: string;
  ownerName: string;
  title: string;
  selectedMonth: string;
  entities: EntityMapping[];
  movements: Movement[];
  comments: Record<string, string>;
  closedMonths: Record<string, ClosedMonthRecord>;
}): Promise<{ id: string; url: string; updatedAtIso: string; ownerId: string }> => {
  const scope: ReconciliationScope = params.scope || 'internacionales';
  let targetDocId = params.docId;
  const existingDoc = await fetchReconciliationViaRest(targetDocId);

  const isUpdate = Boolean(existingDoc && !params.forceNewCopy);
  if (existingDoc && !isUpdate) {
    targetDocId = createScopedCopyId(scope);
  }

  const mergedClosedMonths = isUpdate && existingDoc?.closedMonths
    ? sanitizeClosedMonths({ ...existingDoc.closedMonths, ...params.closedMonths })
    : sanitizeClosedMonths(params.closedMonths);

  const docName = getRestDocumentPath('reconciliations', targetDocId);
  const fieldsMap: Record<string, any> = {
    ownerName: params.ownerName,
    title: params.title,
    selectedMonth: params.selectedMonth,
    entities: params.entities,
    movements: params.movements,
    comments: params.comments,
    closedMonths: mergedClosedMonths,
    movementsCount: params.movements.length,
    entitiesCount: params.entities.length,
  };

  if (!isUpdate) {
    fieldsMap.ownerId = params.uid;
  }

  const firestoreFields: Record<string, any> = {};
  Object.entries(fieldsMap).forEach(([k, v]) => {
    firestoreFields[k] = toFirestoreValue(v);
  });

  const writeOp: Record<string, any> = {
    update: {
      name: docName,
      fields: firestoreFields,
    },
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
        'selectedMonth',
        'entities',
        'movements',
        'comments',
        'closedMonths',
        'movementsCount',
        'entitiesCount',
      ],
    };
  }

  const commitUrl = `${getRestBaseUrl()}/documents:commit?key=${encodeURIComponent(
    activeFirebaseInfo.apiKey
  )}`;
  const res = await fetchWithTimeout(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: [writeOp] }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `Error al guardar vía Firestore REST (${res.status})`
    );
  }

  return {
    id: targetDocId,
    url: getShareableUrl(targetDocId, scope),
    updatedAtIso: new Date().toISOString(),
    ownerId: isUpdate && existingDoc?.ownerId ? existingDoc.ownerId : params.uid,
  };
};

const createClosedPeriodViaRest = async (params: {
  archiveId: string;
  uid: string;
  idToken: string;
  ownerName: string;
  reconciliationId: string;
  month: string;
  title: string;
  entities: EntityMapping[];
  movements: Movement[];
  comments: Record<string, string>;
  differencesCount: number;
  closedAtIso: string;
}): Promise<void> => {
  const docName = getRestDocumentPath('closed_periods', params.archiveId);
  const fieldsMap: Record<string, any> = {
    ownerId: params.uid,
    ownerName: params.ownerName,
    reconciliationId: params.reconciliationId,
    month: params.month,
    title: params.title,
    entities: params.entities,
    movements: params.movements,
    comments: params.comments,
    movementsCount: params.movements.length,
    entitiesCount: params.entities.length,
    differencesCount: params.differencesCount,
    closedAtIso: params.closedAtIso,
  };

  const firestoreFields: Record<string, any> = {};
  Object.entries(fieldsMap).forEach(([k, v]) => {
    firestoreFields[k] = toFirestoreValue(v);
  });

  const writeOp = {
    update: {
      name: docName,
      fields: firestoreFields,
    },
    updateTransforms: [{ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  };

  const commitUrl = `${getRestBaseUrl()}/documents:commit?key=${encodeURIComponent(
    activeFirebaseInfo.apiKey
  )}`;
  const res = await fetchWithTimeout(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: [writeOp] }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `Error al archivar mes cerrado vía Firestore REST (${res.status})`
    );
  }
};

export const getInitialScopeAndDocIdFromUrl = (
  fallbackScope: ReconciliationScope = 'internacionales'
): { scope: ReconciliationScope; docIdFromUrl: string | null } => {
  if (typeof window === 'undefined') {
    return { scope: fallbackScope, docIdFromUrl: null };
  }
  const params = new URLSearchParams(window.location.search);
  const rawScope = params.get('s')?.trim().toLowerCase();
  const rawDoc = params.get('c')?.trim() || '';
  const validDoc = rawDoc && /^[a-zA-Z0-9_-]{1,128}$/.test(rawDoc) ? rawDoc : null;

  if (
    rawScope === 'nacionales' ||
    rawScope === 'internacionales' ||
    rawScope === 'anitox'
  ) {
    return { scope: rawScope, docIdFromUrl: validDoc };
  }
  if (validDoc && (validDoc.endsWith('-nacionales') || validDoc.startsWith('rec-nac-'))) {
    return { scope: 'nacionales', docIdFromUrl: validDoc };
  }
  if (validDoc && (validDoc.endsWith('-anitox') || validDoc.startsWith('rec-anx-'))) {
    return { scope: 'anitox', docIdFromUrl: validDoc };
  }
  if (validDoc) {
    return { scope: 'internacionales', docIdFromUrl: validDoc };
  }
  return { scope: fallbackScope, docIdFromUrl: null };
};

export const getReconciliationIdFromUrl = (): string => {
  if (typeof window === 'undefined') return DEFAULT_RECONCILIATION_ID;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('c')?.trim() || '';
  if (raw && /^[a-zA-Z0-9_-]{1,128}$/.test(raw)) {
    return raw;
  }
  return DEFAULT_RECONCILIATION_ID;
};

export const getShareableUrl = (
  docId: string,
  scope: ReconciliationScope = 'internacionales'
): string => {
  if (typeof window === 'undefined') return '';
  if (scope === 'nacionales' || scope === 'anitox') {
    return `${window.location.origin}/?s=${scope}&c=${encodeURIComponent(docId)}`;
  }
  return `${window.location.origin}/?c=${encodeURIComponent(docId)}`;
};

export const subscribeToReconciliation = (
  reconciliationId: string,
  onData: (saved: SavedReconciliationDoc | null) => void,
  onError?: (err: Error) => void
) => {
  const safeId = /^[a-zA-Z0-9_-]{1,128}$/.test(reconciliationId)
    ? reconciliationId
    : DEFAULT_RECONCILIATION_ID;
  const path = `reconciliations/${safeId}`;
  const ref = doc(db, 'reconciliations', safeId);
  let isActive = true;

  // Proactively fetch once via HTTPS REST so shared links load even if WebChannel is blocked
  fetchReconciliationViaRest(safeId)
    .then((restDoc) => {
      if (isActive && restDoc) onData(restDoc);
    })
    .catch((err) => {
      if (isActive) console.warn('REST initial read fallback failed:', err);
    });

  const rawUnsub = onSnapshot(
    ref,
    (snapshot) => {
      if (!isActive) return;
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const data = snapshot.data();
      let updatedAtIso: string | undefined;
      if (data.updatedAt instanceof Timestamp) {
        updatedAtIso = data.updatedAt.toDate().toISOString();
      }
      onData({
        id: snapshot.id,
        ownerId: String(data.ownerId || ''),
        ownerName: data.ownerName ? String(data.ownerName) : undefined,
        title: String(data.title || 'Conciliación Interempresarial'),
        selectedMonth: String(data.selectedMonth || 'Septiembre 2026'),
        entities: Array.isArray(data.entities) ? data.entities : [],
        movements: Array.isArray(data.movements) ? data.movements : [],
        comments: data.comments && typeof data.comments === 'object' ? data.comments : {},
        closedMonths:
          data.closedMonths && typeof data.closedMonths === 'object' ? data.closedMonths : {},
        movementsCount: Number(data.movementsCount || 0),
        entitiesCount: Number(data.entitiesCount || 0),
        updatedAtIso,
      });
    },
    (error) => {
      if (!isActive || isOfflineError(error)) {
        return;
      }
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrappedErr: any) {
        if (onError) onError(wrappedErr);
      }
    }
  );

  return registerFirestoreListener(() => {
    isActive = false;
    rawUnsub();
  });
};

export interface SaveReconciliationParams {
  targetId: string;
  scope?: ReconciliationScope;
  forceNewCopy?: boolean;
  title: string;
  selectedMonth: string;
  entities: EntityMapping[];
  movements: Movement[];
  comments: Record<string, string>;
  closedMonths?: Record<string, ClosedMonthRecord>;
}

export const saveReconciliationToCloud = async (
  params: SaveReconciliationParams
): Promise<{ id: string; url: string; updatedAtIso: string; ownerId: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Debes iniciar sesión con Google para guardar la conciliación en la nube.');
  }

  const scope: ReconciliationScope = params.scope || 'internacionales';
  let docId = params.forceNewCopy
    ? createScopedCopyId(scope)
    : /^[a-zA-Z0-9_-]{1,128}$/.test(params.targetId)
    ? params.targetId
    : getDefaultReconciliationId(scope);

  const cleanEntities = sanitizeEntities(params.entities);
  const cleanMovements = sanitizeMovements(params.movements);
  const cleanComments = sanitizeComments(params.comments);
  const cleanClosedMonths = sanitizeClosedMonths(params.closedMonths);
  const cleanTitle = (params.title.trim() || 'Conciliación Interempresarial').slice(0, 150);
  const cleanMonth = (params.selectedMonth.trim() || 'Septiembre 2026').slice(0, 60);
  const cleanOwnerName = (user.displayName || 'Usuario').slice(0, 120);

  // Ensure active user's auth token is ready
  await withFirestoreTimeout(user.getIdToken(), 8000, 'token de autenticación').catch(() => {});

  let existingSnap;
  const initialPath = `reconciliations/${docId}`;
  try {
    existingSnap = await withFirestoreTimeout(
      getDoc(doc(db, 'reconciliations', docId)),
      8500,
      `leer ${initialPath}`
    );
  } catch (error) {
    if (isOfflineError(error)) {
      // Fallback cleanly to Firestore HTTPS REST API
      const idToken = await user.getIdToken();
      return saveReconciliationViaRest({
        docId,
        scope,
        forceNewCopy: params.forceNewCopy,
        uid: user.uid,
        idToken,
        ownerName: cleanOwnerName,
        title: cleanTitle,
        selectedMonth: cleanMonth,
        entities: cleanEntities,
        movements: cleanMovements,
        comments: cleanComments,
        closedMonths: cleanClosedMonths,
      });
    }
    handleFirestoreError(error, OperationType.GET, initialPath);
  }

  if (existingSnap && existingSnap.exists()) {
    const existingData = existingSnap.data();
    if (!params.forceNewCopy) {
      const existingClosed =
        existingData.closedMonths && typeof existingData.closedMonths === 'object'
          ? (existingData.closedMonths as Record<string, ClosedMonthRecord>)
          : {};
      const mergedClosedMonths = sanitizeClosedMonths({
        ...existingClosed,
        ...cleanClosedMonths,
      });

      try {
        await withFirestoreTimeout(
          updateDoc(doc(db, 'reconciliations', docId), {
            ownerName: cleanOwnerName,
            title: cleanTitle,
            selectedMonth: cleanMonth,
            entities: cleanEntities,
            movements: cleanMovements,
            comments: cleanComments,
            closedMonths: mergedClosedMonths,
            movementsCount: cleanMovements.length,
            entitiesCount: cleanEntities.length,
            updatedAt: serverTimestamp(),
          }),
          8500,
          `actualizar reconciliations/${docId}`
        );
      } catch (error) {
        if (isOfflineError(error)) {
          const idToken = await user.getIdToken();
          return saveReconciliationViaRest({
            docId,
            scope,
            forceNewCopy: false,
            uid: user.uid,
            idToken,
            ownerName: cleanOwnerName,
            title: cleanTitle,
            selectedMonth: cleanMonth,
            entities: cleanEntities,
            movements: cleanMovements,
            comments: cleanComments,
            closedMonths: mergedClosedMonths,
          });
        }
        handleFirestoreError(error, OperationType.UPDATE, `reconciliations/${docId}`);
      }

      return {
        id: docId,
        url: getShareableUrl(docId, scope),
        updatedAtIso: new Date().toISOString(),
        ownerId: String(existingData.ownerId || user.uid),
      };
    }

    // Forced new copy -> create new doc ID so user gets a separate snapshot link
    docId = createScopedCopyId(scope);
  }

  const createPath = `reconciliations/${docId}`;
  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'reconciliations', docId), {
        ownerId: user.uid,
        ownerName: cleanOwnerName,
        title: cleanTitle,
        selectedMonth: cleanMonth,
        entities: cleanEntities,
        movements: cleanMovements,
        comments: cleanComments,
        closedMonths: cleanClosedMonths,
        movementsCount: cleanMovements.length,
        entitiesCount: cleanEntities.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      8500,
      `crear ${createPath}`
    );
  } catch (error) {
    if (isOfflineError(error)) {
      const idToken = await user.getIdToken();
      return saveReconciliationViaRest({
        docId,
        scope,
        forceNewCopy: params.forceNewCopy,
        uid: user.uid,
        idToken,
        ownerName: cleanOwnerName,
        title: cleanTitle,
        selectedMonth: cleanMonth,
        entities: cleanEntities,
        movements: cleanMovements,
        comments: cleanComments,
        closedMonths: cleanClosedMonths,
      });
    }
    handleFirestoreError(error, OperationType.CREATE, createPath);
  }

  return {
    id: docId,
    url: getShareableUrl(docId, scope),
    updatedAtIso: new Date().toISOString(),
    ownerId: user.uid,
  };
};

export interface CloseMonthParams {
  targetId: string;
  scope?: ReconciliationScope;
  title: string;
  month: string;
  entities: EntityMapping[];
  allMovements: Movement[];
  monthMovements: Movement[];
  comments: Record<string, string>;
  differencesCount: number;
  existingClosedMonths: Record<string, ClosedMonthRecord>;
}

export const closeAndArchiveMonthInCloud = async (
  params: CloseMonthParams
): Promise<{
  saveResult: { id: string; url: string; updatedAtIso: string; ownerId: string };
  closedRecord: ClosedMonthRecord;
  nextClosedMonths: Record<string, ClosedMonthRecord>;
}> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Debes iniciar sesión con Google para cerrar y archivar el mes.');
  }

  const scope: ReconciliationScope = params.scope || 'internacionales';
  const cleanMonth = params.month.trim().slice(0, 60);
  if (!cleanMonth || cleanMonth === 'ALL') {
    throw new Error('Selecciona un mes específico para poder cerrarlo.');
  }

  const cleanOwnerName = (user.displayName || 'Usuario').slice(0, 120);
  const cleanTitle = (params.title.trim() || `Cierre Conciliación - ${cleanMonth}`).slice(0, 150);
  const cleanEntities = sanitizeEntities(params.entities);
  const cleanMonthMovements = sanitizeMovements(params.monthMovements);
  const cleanComments = sanitizeComments(params.comments);
  const safeDiffCount = Math.max(0, Math.min(5000, Math.trunc(Number(params.differencesCount) || 0)));

  const slug =
    cleanMonth
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'mes';
  const archiveId =
    scope === 'nacionales'
      ? `cierre-nac-${slug}-${Date.now()}`
      : scope === 'anitox'
      ? `cierre-anx-${slug}-${Date.now()}`
      : `cierre-${slug}-${Date.now()}`;
  const closedAtIso = new Date().toISOString();

  const closedRecord: ClosedMonthRecord = {
    month: cleanMonth,
    closedAt: closedAtIso,
    closedBy: cleanOwnerName,
    archiveId,
    movementsCount: cleanMonthMovements.length,
    differencesCount: safeDiffCount,
    commentsSnapshot: cleanComments,
    entitiesSnapshot: cleanEntities.map((e) => e.nombreOficial),
  };

  const nextClosedMonths = sanitizeClosedMonths({
    ...params.existingClosedMonths,
    [cleanMonth]: closedRecord,
  });

  // Step 1: Save/update parent reconciliation document with closedMonths lock
  const saveResult = await saveReconciliationToCloud({
    targetId: params.targetId,
    scope,
    title: cleanTitle,
    selectedMonth: cleanMonth,
    entities: cleanEntities,
    movements: params.allMovements,
    comments: cleanComments,
    closedMonths: nextClosedMonths,
  });

  // Step 2: Create permanent immutable archive document in /closed_periods/{archiveId}
  const archivePath = `closed_periods/${archiveId}`;
  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'closed_periods', archiveId), {
        ownerId: user.uid,
        ownerName: cleanOwnerName,
        reconciliationId: saveResult.id,
        month: cleanMonth,
        title: cleanTitle,
        entities: cleanEntities,
        movements: cleanMonthMovements,
        comments: cleanComments,
        movementsCount: cleanMonthMovements.length,
        entitiesCount: cleanEntities.length,
        differencesCount: safeDiffCount,
        closedAtIso,
        createdAt: serverTimestamp(),
      }),
      8500,
      `archivar ${archivePath}`
    );
  } catch (error) {
    if (isOfflineError(error)) {
      const idToken = await user.getIdToken();
      await createClosedPeriodViaRest({
        archiveId,
        uid: user.uid,
        idToken,
        ownerName: cleanOwnerName,
        reconciliationId: saveResult.id,
        month: cleanMonth,
        title: cleanTitle,
        entities: cleanEntities,
        movements: cleanMonthMovements,
        comments: cleanComments,
        differencesCount: safeDiffCount,
        closedAtIso,
      });
    } else {
      handleFirestoreError(error, OperationType.CREATE, archivePath);
    }
  }

  return {
    saveResult,
    closedRecord,
    nextClosedMonths,
  };
};

// --- Independent Company Directory Store (/company_directories/{scope}) ---
export interface SavedCompanyDirectoryDoc {
  scope: ReconciliationScope;
  entities: EntityMapping[];
  entitiesCount: number;
  updatedBy: string;
  updatedByName?: string;
  updatedAtIso?: string;
}

const fetchCompanyDirectoryViaRest = async (
  scope: ReconciliationScope
): Promise<SavedCompanyDirectoryDoc | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const safeScope = normalizeReconciliationScope(scope);
  const url = `${getRestBaseUrl()}/documents/company_directories/${encodeURIComponent(
    safeScope
  )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      errBody?.error?.message || `Error HTTP ${res.status} al leer directorio de empresas`
    );
  }
  const raw = await res.json();
  const fields = raw.fields || {};
  const parsed: Record<string, any> = {};
  Object.entries(fields).forEach(([k, v]) => {
    parsed[k] = fromFirestoreValue(v);
  });

  return {
    scope: safeScope,
    entities: Array.isArray(parsed.entities) ? parsed.entities : [],
    entitiesCount: Number(parsed.entitiesCount || 0),
    updatedBy: String(parsed.updatedBy || ''),
    updatedByName: parsed.updatedByName ? String(parsed.updatedByName) : undefined,
    updatedAtIso: parsed.updatedAt ? String(parsed.updatedAt) : undefined,
  };
};

const saveCompanyDirectoryViaRest = async (params: {
  scope: ReconciliationScope;
  uid: string;
  idToken: string;
  updatedByName: string;
  entities: EntityMapping[];
}): Promise<{ updatedAtIso: string }> => {
  const safeScope = normalizeReconciliationScope(params.scope);
  const existingDoc = await fetchCompanyDirectoryViaRest(safeScope);
  const isUpdate = Boolean(existingDoc);

  const docName = getRestDocumentPath('company_directories', safeScope);
  const fieldsMap: Record<string, any> = {
    entities: params.entities,
    entitiesCount: params.entities.length,
    updatedBy: params.uid,
    updatedByName: params.updatedByName,
  };
  if (!isUpdate) {
    fieldsMap.scope = safeScope;
  }

  const firestoreFields: Record<string, any> = {};
  Object.entries(fieldsMap).forEach(([k, v]) => {
    firestoreFields[k] = toFirestoreValue(v);
  });

  const writeOp: Record<string, any> = {
    update: {
      name: docName,
      fields: firestoreFields,
    },
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
      fieldPaths: ['entities', 'entitiesCount', 'updatedBy', 'updatedByName'],
    };
  }

  const commitUrl = `${getRestBaseUrl()}/documents:commit?key=${encodeURIComponent(
    activeFirebaseInfo.apiKey
  )}`;
  const res = await fetchWithTimeout(commitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ writes: [writeOp] }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      `Firestore (company_directories/${safeScope}): ${
        errBody?.error?.message || `Error HTTP ${res.status}`
      }`
    );
  }

  return {
    updatedAtIso: new Date().toISOString(),
  };
};

export const subscribeToCompanyDirectory = (
  scope: ReconciliationScope,
  onData: (saved: SavedCompanyDirectoryDoc | null) => void,
  onError?: (err: Error) => void
) => {
  const safeScope = normalizeReconciliationScope(scope);
  const path = `company_directories/${safeScope}`;
  const ref = doc(db, 'company_directories', safeScope);
  let isActive = true;

  fetchCompanyDirectoryViaRest(safeScope)
    .then((restDoc) => {
      if (isActive && restDoc) onData(restDoc);
    })
    .catch((err) => {
      if (isActive) console.warn(`REST initial read fallback failed (${path}):`, err);
    });

  const rawUnsub = onSnapshot(
    ref,
    (snapshot) => {
      if (!isActive) return;
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const data = snapshot.data();
      let updatedAtIso: string | undefined;
      if (data.updatedAt instanceof Timestamp) {
        updatedAtIso = data.updatedAt.toDate().toISOString();
      }
      onData({
        scope: safeScope,
        entities: Array.isArray(data.entities) ? data.entities : [],
        entitiesCount: Number(data.entitiesCount || 0),
        updatedBy: String(data.updatedBy || ''),
        updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
        updatedAtIso,
      });
    },
    (error) => {
      if (!isActive || isOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrappedErr: any) {
        if (onError) onError(wrappedErr);
      }
    }
  );

  return registerFirestoreListener(() => {
    isActive = false;
    rawUnsub();
  });
};

export const saveCompanyDirectoryToCloud = async (
  scope: ReconciliationScope,
  entities: EntityMapping[]
): Promise<{ updatedAtIso: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Debes iniciar sesión con Google para guardar los cambios de empresas en la nube.');
  }

  const safeScope = normalizeReconciliationScope(scope);
  const cleanEntities = sanitizeEntities(entities);
  const cleanUpdaterName = (user.displayName || user.email || 'Usuario').slice(0, 120);
  const path = `company_directories/${safeScope}`;

  await withFirestoreTimeout(user.getIdToken(), 8000, 'token de autenticación').catch(() => {});

  let existingSnap;
  try {
    existingSnap = await withFirestoreTimeout(
      getDoc(doc(db, 'company_directories', safeScope)),
      8500,
      `leer ${path}`
    );
  } catch (error) {
    if (isOfflineError(error)) {
      const idToken = await user.getIdToken();
      return saveCompanyDirectoryViaRest({
        scope: safeScope,
        uid: user.uid,
        idToken,
        updatedByName: cleanUpdaterName,
        entities: cleanEntities,
      });
    }
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (existingSnap && existingSnap.exists()) {
    try {
      await withFirestoreTimeout(
        updateDoc(doc(db, 'company_directories', safeScope), {
          entities: cleanEntities,
          entitiesCount: cleanEntities.length,
          updatedBy: user.uid,
          updatedByName: cleanUpdaterName,
          updatedAt: serverTimestamp(),
        }),
        8500,
        `actualizar ${path}`
      );
      return { updatedAtIso: new Date().toISOString() };
    } catch (error) {
      if (isOfflineError(error)) {
        const idToken = await user.getIdToken();
        return saveCompanyDirectoryViaRest({
          scope: safeScope,
          uid: user.uid,
          idToken,
          updatedByName: cleanUpdaterName,
          entities: cleanEntities,
        });
      }
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'company_directories', safeScope), {
        scope: safeScope,
        entities: cleanEntities,
        entitiesCount: cleanEntities.length,
        updatedBy: user.uid,
        updatedByName: cleanUpdaterName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      8500,
      `crear ${path}`
    );
    return { updatedAtIso: new Date().toISOString() };
  } catch (error) {
    if (isOfflineError(error)) {
      const idToken = await user.getIdToken();
      return saveCompanyDirectoryViaRest({
        scope: safeScope,
        uid: user.uid,
        idToken,
        updatedByName: cleanUpdaterName,
        entities: cleanEntities,
      });
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

