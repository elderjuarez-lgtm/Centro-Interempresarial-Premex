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
import { ModuleCompanyEntry, StandaloneCompanyDbModuleId } from '../types';
import {
  STANDALONE_COMPANY_DB_MODULES,
  sanitizeModuleCompanyList,
} from '../utils/moduleCompanies';

export interface SavedModuleCompanyDirectoryDoc {
  moduleId: StandaloneCompanyDbModuleId;
  companies: ModuleCompanyEntry[];
  companiesCount: number;
  updatedBy?: string;
  updatedByName?: string;
  updatedAtIso?: string;
}

const VALID_STANDALONE_MODULES = new Set<StandaloneCompanyDbModuleId>(
  STANDALONE_COMPANY_DB_MODULES
);

const isOfflineError = (err: unknown): boolean => isRecoverableFirestoreSdkError(err);

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

const getRestDocName = (moduleId: StandaloneCompanyDbModuleId) => {
  const { projectId, databaseId } = activeFirebaseInfo;
  return `projects/${projectId}/databases/${databaseId}/documents/module_company_directories/${moduleId}`;
};

const fetchAuthModuleCompaniesViaRest = async (
  moduleId: StandaloneCompanyDbModuleId
): Promise<SavedModuleCompanyDirectoryDoc | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/module_company_directories/${encodeURIComponent(
    moduleId
  )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  const parsed: Record<string, any> = {};
  Object.entries(raw.fields || {}).forEach(([k, v]) => {
    parsed[k] = fromFirestoreValue(v as Record<string, any>);
  });
  if (!Array.isArray(parsed.companies)) return null;
  const cleanCompanies = sanitizeModuleCompanyList(parsed.companies);
  return {
    moduleId,
    companies: cleanCompanies,
    companiesCount: cleanCompanies.length,
    updatedBy: parsed.updatedBy ? String(parsed.updatedBy) : undefined,
    updatedByName: parsed.updatedByName ? String(parsed.updatedByName) : undefined,
    updatedAtIso: parsed.updatedAt ? String(parsed.updatedAt) : undefined,
  };
};

/**
 * Subscribes to an independent module's company database at /module_company_directories/{moduleId}.
 * Should ONLY be called when the signed-in user has a verified email.
 */
export const subscribeToModuleCompanyDirectory = (
  moduleId: StandaloneCompanyDbModuleId,
  onData: (saved: SavedModuleCompanyDirectoryDoc | null) => void,
  onError?: (err: unknown) => void
) => {
  if (!VALID_STANDALONE_MODULES.has(moduleId)) {
    return () => {};
  }
  const path = `module_company_directories/${moduleId}`;
  const ref = doc(db, 'module_company_directories', moduleId);
  let isActive = true;

  fetchAuthModuleCompaniesViaRest(moduleId)
    .then((parsed) => {
      if (isActive && parsed) onData(parsed);
    })
    .catch(() => {});

  const rawUnsub = onSnapshot(
    ref,
    (snapshot) => {
      if (!isActive) return;
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const data = snapshot.data();
      const cleanCompanies = Array.isArray(data.companies)
        ? sanitizeModuleCompanyList(data.companies)
        : [];
      onData({
        moduleId,
        companies: cleanCompanies,
        companiesCount: cleanCompanies.length,
        updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
        updatedByName: data.updatedByName ? String(data.updatedByName) : undefined,
        updatedAtIso:
          data.updatedAt instanceof Timestamp
            ? data.updatedAt.toDate().toISOString()
            : undefined,
      });
    },
    (error) => {
      if (!isActive || isOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrapped) {
        if (onError) onError(wrapped);
      }
    }
  );

  return registerFirestoreListener(() => {
    isActive = false;
    rawUnsub();
  });
};

/**
 * Persists an independent module's company catalog to /module_company_directories/{moduleId}.
 * Admin-only write enforced by Firestore Security Rules.
 */
export const saveModuleCompanyDirectoryToCloud = async (
  moduleId: StandaloneCompanyDbModuleId,
  companies: ModuleCompanyEntry[]
): Promise<{ updatedAtIso: string }> => {
  if (!VALID_STANDALONE_MODULES.has(moduleId)) {
    throw new Error(`Módulo inválido para base de datos de empresas: ${moduleId}`);
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      'Inicia sesión con tu cuenta administradora de Google para guardar la base de datos de empresas en Firestore.'
    );
  }

  await withFirestoreTimeout(user.getIdToken(), 8000, 'token de autenticación').catch(() => {});

  const cleanCompanies = sanitizeModuleCompanyList(companies).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    codigo: c.codigo || '',
    nit: c.nit || '',
    pais: c.pais || '',
    moneda: c.moneda || 'USD',
    activo: c.activo !== false,
  }));
  const updatedByName = String(user.displayName || user.email || 'Administrador').slice(
    0,
    120
  );
  const path = `module_company_directories/${moduleId}`;

  const saveViaRest = async (isUpdate: boolean) => {
    const idToken = await user.getIdToken();
    const fieldsMap: Record<string, unknown> = isUpdate
      ? {
          companies: cleanCompanies,
          companiesCount: cleanCompanies.length,
          updatedBy: user.uid,
          updatedByName,
        }
      : {
          moduleId,
          companies: cleanCompanies,
          companiesCount: cleanCompanies.length,
          updatedBy: user.uid,
          updatedByName,
        };

    const firestoreFields: Record<string, unknown> = {};
    Object.entries(fieldsMap).forEach(([k, v]) => {
      firestoreFields[k] = toFirestoreValue(v);
    });

    const writeOp: Record<string, unknown> = {
      update: { name: getRestDocName(moduleId), fields: firestoreFields },
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
        fieldPaths: ['companies', 'companiesCount', 'updatedBy', 'updatedByName'],
      };
    }

    const res = await fetchWithTimeout(
      `${getRestBaseUrl()}/documents:commit?key=${encodeURIComponent(
        activeFirebaseInfo.apiKey
      )}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ writes: [writeOp] }),
      }
    );

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `Firestore (${path}): ${
          errBody?.error?.message || `Error HTTP ${res.status}`
        }`
      );
    }
    return { updatedAtIso: new Date().toISOString() };
  };

  try {
    const ref = doc(db, 'module_company_directories', moduleId);
    const snap = await withFirestoreTimeout(getDoc(ref), 8500, `leer ${path}`);
    if (snap.exists()) {
      await withFirestoreTimeout(
        updateDoc(ref, {
          companies: cleanCompanies,
          companiesCount: cleanCompanies.length,
          updatedBy: user.uid,
          updatedByName,
          updatedAt: serverTimestamp(),
        }),
        8500,
        `actualizar ${path}`
      );
    } else {
      await withFirestoreTimeout(
        setDoc(ref, {
          moduleId,
          companies: cleanCompanies,
          companiesCount: cleanCompanies.length,
          updatedBy: user.uid,
          updatedByName,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        8500,
        `crear ${path}`
      );
    }
    return { updatedAtIso: new Date().toISOString() };
  } catch (error) {
    if (isOfflineError(error)) {
      const existing = await fetchAuthModuleCompaniesViaRest(moduleId);
      return saveViaRest(Boolean(existing));
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
};
