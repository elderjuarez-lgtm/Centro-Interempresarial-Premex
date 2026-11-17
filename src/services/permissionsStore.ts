import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  enableNetwork,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, activeFirebaseInfo } from './auth';
import { handleFirestoreError, OperationType } from './reconciliationStore';
import {
  AccessControlPolicy,
  SuiteModuleId,
  UserPermissionRecord,
  UserRole,
} from '../types';
import {
  ALL_SUITE_MODULES,
  deriveLegacyCompanyFields,
  emailToPermissionDocId,
  normalizeEmail,
  sanitizeModuleCompanyAccess,
  SUPER_ADMIN_EMAIL,
} from '../utils/permissions';

const isOfflineError = (err: unknown): boolean => {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('failed to get document')
  );
};

const VALID_MODULES = new Set<SuiteModuleId>(ALL_SUITE_MODULES);

const sanitizeRecord = (rec: UserPermissionRecord): UserPermissionRecord => {
  const email = normalizeEmail(rec.email).slice(0, 160);
  const isSuper = email === SUPER_ADMIN_EMAIL;
  const role: UserRole = isSuper
    ? 'admin'
    : rec.role === 'admin' || rec.role === 'operador'
    ? rec.role
    : 'consulta';

  const allowedModules: SuiteModuleId[] =
    role === 'admin'
      ? [...ALL_SUITE_MODULES]
      : Array.from(
          new Set(
            (Array.isArray(rec.allowedModules) ? rec.allowedModules : []).filter(
              (m): m is SuiteModuleId => VALID_MODULES.has(m) && m !== 'ajustes'
            )
          )
        ).slice(0, 10);

  const fallbackScope =
    role === 'admin' || rec.companyScope === 'all' ? 'all' : 'selected';
  const fallbackCompanies =
    fallbackScope === 'all'
      ? []
      : Array.from(
          new Set(
            (Array.isArray(rec.allowedCompanies) ? rec.allowedCompanies : [])
              .map((c) => String(c || '').trim().slice(0, 140))
              .filter(Boolean)
          )
        ).slice(0, 250);

  const moduleCompanyAccess =
    role === 'admin'
      ? {}
      : sanitizeModuleCompanyAccess(
          rec.moduleCompanyAccess,
          allowedModules,
          fallbackScope,
          fallbackCompanies
        );

  const legacy = deriveLegacyCompanyFields(moduleCompanyAccess, allowedModules, role);

  const clean: UserPermissionRecord = {
    id: emailToPermissionDocId(email),
    email,
    displayName: (String(rec.displayName || '').trim() || email.split('@')[0] || 'Usuario').slice(
      0,
      120
    ),
    role,
    allowedModules,
    companyScope: legacy.companyScope,
    allowedCompanies: legacy.allowedCompanies,
    moduleCompanyAccess,
    active: isSuper ? true : Boolean(rec.active),
  };

  if (rec.notes && String(rec.notes).trim()) {
    clean.notes = String(rec.notes).trim().slice(0, 300);
  }
  return clean;
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

const getRestDocName = (collectionName: string, docId: string) => {
  const { projectId, databaseId } = activeFirebaseInfo;
  return `projects/${projectId}/databases/${databaseId}/documents/${collectionName}/${docId}`;
};

const fetchAuthDocViaRest = async (
  collectionName: string,
  docId: string
): Promise<Record<string, any> | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/${encodeURIComponent(
    collectionName
  )}/${encodeURIComponent(docId)}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) return null;
  const raw = await res.json();
  const parsed: Record<string, any> = {};
  Object.entries(raw.fields || {}).forEach(([k, v]) => {
    parsed[k] = fromFirestoreValue(v as Record<string, any>);
  });
  return parsed;
};

const parsePermissionDocData = (
  docId: string,
  data: Record<string, any>
): UserPermissionRecord => {
  const email = normalizeEmail(data.email || '');
  return sanitizeRecord({
    id: docId,
    email,
    displayName: String(data.displayName || email),
    role: data.role as UserRole,
    allowedModules: Array.isArray(data.allowedModules) ? data.allowedModules : [],
    companyScope: data.companyScope === 'selected' ? 'selected' : 'all',
    allowedCompanies: Array.isArray(data.allowedCompanies) ? data.allowedCompanies : [],
    moduleCompanyAccess:
      data.moduleCompanyAccess && typeof data.moduleCompanyAccess === 'object'
        ? data.moduleCompanyAccess
        : undefined,
    active: data.active !== false,
    notes: data.notes ? String(data.notes) : undefined,
    updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
    updatedAtIso:
      data.updatedAt instanceof Timestamp
        ? data.updatedAt.toDate().toISOString()
        : data.updatedAt
        ? String(data.updatedAt)
        : undefined,
  });
};

/**
 * Subscribes to the currently signed-in verified user's own permission document
 * at /user_permissions/{myEmailDocId}. Strictly PII-isolated.
 */
export const subscribeToOwnUserPermission = (
  email: string,
  onData: (record: UserPermissionRecord | null) => void
) => {
  const docId = emailToPermissionDocId(email);
  const path = `user_permissions/${docId}`;
  const ref = doc(db, 'user_permissions', docId);

  fetchAuthDocViaRest('user_permissions', docId)
    .then((parsed) => {
      if (parsed && parsed.email) {
        onData(parsePermissionDocData(docId, parsed));
      }
    })
    .catch(() => {});

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(parsePermissionDocData(snapshot.id, snapshot.data()));
    },
    (error) => {
      if (isOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Non-fatal fallback
      }
    }
  );
};

/**
 * Subscribes to the non-PII global access policy (/app_settings/policy).
 */
export const subscribeToAccessPolicy = (
  onData: (policy: AccessControlPolicy) => void
) => {
  const path = 'app_settings/policy';
  const ref = doc(db, 'app_settings', 'policy');

  fetchAuthDocViaRest('app_settings', 'policy')
    .then((parsed) => {
      if (parsed && typeof parsed.strictMode === 'boolean') {
        onData({
          strictMode: parsed.strictMode,
          updatedBy: parsed.updatedBy ? String(parsed.updatedBy) : undefined,
          updatedAtIso: parsed.updatedAt ? String(parsed.updatedAt) : undefined,
        });
      }
    })
    .catch(() => {});

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      onData({
        strictMode: Boolean(data.strictMode),
        updatedBy: data.updatedBy ? String(data.updatedBy) : undefined,
        updatedAtIso:
          data.updatedAt instanceof Timestamp
            ? data.updatedAt.toDate().toISOString()
            : undefined,
      });
    },
    (error) => {
      if (isOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // ignore if user unauthenticated
      }
    }
  );
};

/**
 * Subscribes to the admin-only consolidated user directory (/app_settings/access_control).
 * Should ONLY be attached when the verified user is an Administrator.
 */
export const subscribeToAdminAccessRegistry = (
  onData: (records: UserPermissionRecord[]) => void
) => {
  const path = 'app_settings/access_control';
  const ref = doc(db, 'app_settings', 'access_control');

  fetchAuthDocViaRest('app_settings', 'access_control')
    .then((parsed) => {
      if (parsed && Array.isArray(parsed.records)) {
        const mapped = parsed.records
          .filter((r: any) => r && r.email)
          .map((r: any) => parsePermissionDocData(emailToPermissionDocId(r.email), r));
        onData(mapped);
      }
    })
    .catch(() => {});

  return onSnapshot(
    ref,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const data = snapshot.data();
      if (!Array.isArray(data.records)) return;
      const mapped = data.records
        .filter((r: any) => r && r.email)
        .map((r: any) => parsePermissionDocData(emailToPermissionDocId(r.email), r));
      onData(mapped);
    },
    (error) => {
      if (isOfflineError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Non-admins will cleanly be denied by Firestore rules
      }
    }
  );
};

const commitRestWrite = async (
  collectionName: string,
  docId: string,
  fieldsMap: Record<string, unknown>,
  isUpdate: boolean,
  updateMaskFields: string[]
) => {
  const user = auth.currentUser;
  if (!user) throw new Error('Sesión no iniciada.');
  const idToken = await user.getIdToken();
  const firestoreFields: Record<string, unknown> = {};
  Object.entries(fieldsMap).forEach(([k, v]) => {
    if (v !== undefined) firestoreFields[k] = toFirestoreValue(v);
  });

  const writeOp: Record<string, unknown> = {
    update: {
      name: getRestDocName(collectionName, docId),
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
    writeOp.updateMask = { fieldPaths: updateMaskFields };
  }

  const res = await fetch(
    `${getRestBaseUrl()}/documents:commit?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`,
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
      errBody?.error?.message || `Error HTTP ${res.status} al sincronizar permisos`
    );
  }
};

/**
 * Saves an individual user's RBAC permission doc AND syncs the consolidated admin registry.
 */
export const saveUserPermissionAndRegistryToCloud = async (params: {
  changedRecord?: UserPermissionRecord;
  deletedEmail?: string;
  allRecords: UserPermissionRecord[];
  policy: AccessControlPolicy;
}): Promise<{ updatedAtIso: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Inicia sesión con tu cuenta de Google administradora para sincronizar permisos en la nube.');
  }

  await user.getIdToken().catch(() => {});
  await enableNetwork(db).catch(() => {});

  const cleanAll = params.allRecords.slice(0, 200).map(sanitizeRecord);

  // 1. Upsert or delete individual /user_permissions/{emailDocId}
  if (params.changedRecord) {
    const cleanRec = sanitizeRecord(params.changedRecord);
    const docId = cleanRec.id;
    const path = `user_permissions/${docId}`;
    const payloadBase: Record<string, unknown> = {
      email: cleanRec.email,
      displayName: cleanRec.displayName,
      role: cleanRec.role,
      allowedModules: cleanRec.allowedModules,
      companyScope: cleanRec.companyScope,
      allowedCompanies: cleanRec.allowedCompanies,
      moduleCompanyAccess: cleanRec.moduleCompanyAccess || {},
      active: cleanRec.active,
      updatedBy: user.uid,
    };
    if (cleanRec.notes) payloadBase.notes = cleanRec.notes;

    try {
      const snap = await getDoc(doc(db, 'user_permissions', docId));
      if (snap.exists()) {
        const updatePayload: Record<string, unknown> = {
          displayName: cleanRec.displayName,
          role: cleanRec.role,
          allowedModules: cleanRec.allowedModules,
          companyScope: cleanRec.companyScope,
          allowedCompanies: cleanRec.allowedCompanies,
          moduleCompanyAccess: cleanRec.moduleCompanyAccess || {},
          active: cleanRec.active,
          notes: cleanRec.notes || '',
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        };
        await updateDoc(doc(db, 'user_permissions', docId), updatePayload);
      } else {
        await setDoc(doc(db, 'user_permissions', docId), {
          ...payloadBase,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      if (isOfflineError(error)) {
        const existing = await fetchAuthDocViaRest('user_permissions', docId);
        const isUpdate = Boolean(existing);
        const restFields: Record<string, unknown> = isUpdate
          ? {
              displayName: cleanRec.displayName,
              role: cleanRec.role,
              allowedModules: cleanRec.allowedModules,
              companyScope: cleanRec.companyScope,
              allowedCompanies: cleanRec.allowedCompanies,
              moduleCompanyAccess: cleanRec.moduleCompanyAccess || {},
              active: cleanRec.active,
              notes: cleanRec.notes || '',
              updatedBy: user.uid,
            }
          : payloadBase;
        await commitRestWrite('user_permissions', docId, restFields, isUpdate, [
          'displayName',
          'role',
          'allowedModules',
          'companyScope',
          'allowedCompanies',
          'moduleCompanyAccess',
          'active',
          'notes',
          'updatedBy',
        ]);
      } else {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    }
  } else if (params.deletedEmail) {
    const delEmail = normalizeEmail(params.deletedEmail);
    if (delEmail !== SUPER_ADMIN_EMAIL) {
      const docId = emailToPermissionDocId(delEmail);
      const path = `user_permissions/${docId}`;
      try {
        await deleteDoc(doc(db, 'user_permissions', docId));
      } catch (error) {
        if (isOfflineError(error)) {
          const idToken = await user.getIdToken();
          await fetch(
            `${getRestBaseUrl()}/documents/user_permissions/${encodeURIComponent(
              docId
            )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`,
            {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${idToken}` },
            }
          );
        } else {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
      }
    }
  }

  // 2. Sync all individual docs if this is a bulk sync (no specific changedRecord/deletedEmail)
  if (!params.changedRecord && !params.deletedEmail) {
    for (const rec of cleanAll) {
      const docId = rec.id;
      const payload: Record<string, unknown> = {
        email: rec.email,
        displayName: rec.displayName,
        role: rec.role,
        allowedModules: rec.allowedModules,
        companyScope: rec.companyScope,
        allowedCompanies: rec.allowedCompanies,
        moduleCompanyAccess: rec.moduleCompanyAccess || {},
        active: rec.active,
        notes: rec.notes || '',
        updatedBy: user.uid,
      };
      try {
        const snap = await getDoc(doc(db, 'user_permissions', docId));
        if (snap.exists()) {
          const { email: _ignored, ...updateOnly } = payload;
          await updateDoc(doc(db, 'user_permissions', docId), {
            ...updateOnly,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(doc(db, 'user_permissions', docId), {
            ...payload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        if (isOfflineError(error)) {
          const existing = await fetchAuthDocViaRest('user_permissions', docId);
          const isUpdate = Boolean(existing);
          const { email: _ignored, ...updateOnly } = payload;
          await commitRestWrite(
            'user_permissions',
            docId,
            isUpdate ? updateOnly : payload,
            isUpdate,
            [
              'displayName',
              'role',
              'allowedModules',
              'companyScope',
              'allowedCompanies',
              'moduleCompanyAccess',
              'active',
              'notes',
              'updatedBy',
            ]
          );
        } else {
          handleFirestoreError(error, OperationType.WRITE, `user_permissions/${docId}`);
        }
      }
    }
  }

  // 3. Upsert admin consolidated registry at /app_settings/access_control
  const registryPath = 'app_settings/access_control';
  try {
    const snap = await getDoc(doc(db, 'app_settings', 'access_control'));
    if (snap.exists()) {
      await updateDoc(doc(db, 'app_settings', 'access_control'), {
        records: cleanAll,
        recordsCount: cleanAll.length,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'app_settings', 'access_control'), {
        records: cleanAll,
        recordsCount: cleanAll.length,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (isOfflineError(error)) {
      const existing = await fetchAuthDocViaRest('app_settings', 'access_control');
      await commitRestWrite(
        'app_settings',
        'access_control',
        {
          records: cleanAll,
          recordsCount: cleanAll.length,
          updatedBy: user.uid,
        },
        Boolean(existing),
        ['records', 'recordsCount', 'updatedBy']
      );
    } else {
      handleFirestoreError(error, OperationType.WRITE, registryPath);
    }
  }

  // 4. Upsert non-PII policy flag at /app_settings/policy
  const policyPath = 'app_settings/policy';
  try {
    const snap = await getDoc(doc(db, 'app_settings', 'policy'));
    if (snap.exists()) {
      await updateDoc(doc(db, 'app_settings', 'policy'), {
        strictMode: Boolean(params.policy.strictMode),
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'app_settings', 'policy'), {
        strictMode: Boolean(params.policy.strictMode),
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (isOfflineError(error)) {
      const existing = await fetchAuthDocViaRest('app_settings', 'policy');
      await commitRestWrite(
        'app_settings',
        'policy',
        {
          strictMode: Boolean(params.policy.strictMode),
          updatedBy: user.uid,
        },
        Boolean(existing),
        ['strictMode', 'updatedBy']
      );
    } else {
      handleFirestoreError(error, OperationType.WRITE, policyPath);
    }
  }

  return { updatedAtIso: new Date().toISOString() };
};
