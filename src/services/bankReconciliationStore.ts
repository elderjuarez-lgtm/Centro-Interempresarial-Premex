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
  BankAccount,
  BankMatchGroup,
  BankStatementItem,
  BookLedgerItem,
} from '../types';

export const DEFAULT_BANK_REC_ID = 'principal-bancos';

export interface SavedBankReconciliationDoc {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  selectedMonth: string;
  selectedAccountId?: string;
  accounts: BankAccount[];
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
  accountsCount: number;
  statementCount: number;
  ledgerCount: number;
  updatedAtIso?: string;
}

const sanitizeAccounts = (accounts: BankAccount[]): BankAccount[] =>
  accounts.slice(0, 100).map((a, idx) => ({
    id: String(a.id || `acc-${idx + 1}`).slice(0, 128),
    banco: String(a.banco || 'Banco').slice(0, 120),
    numeroCuenta: String(a.numeroCuenta || '').slice(0, 80),
    sociedad: String(a.sociedad || 'Premex').slice(0, 120),
    pais: String(a.pais || '').slice(0, 80),
    moneda: a.moneda || 'USD',
    tipoCuenta: a.tipoCuenta || 'Corriente',
    saldoInicialLibros: Number.isFinite(Number(a.saldoInicialLibros))
      ? Number(a.saldoInicialLibros)
      : 0,
    saldoFinalExtracto: Number.isFinite(Number(a.saldoFinalExtracto))
      ? Number(a.saldoFinalExtracto)
      : 0,
    saldoFinalLibros: Number.isFinite(Number(a.saldoFinalLibros))
      ? Number(a.saldoFinalLibros)
      : 0,
  }));

const sanitizeStatements = (items: BankStatementItem[]): BankStatementItem[] =>
  items.slice(0, 5000).map((i, idx) => {
    const clean: BankStatementItem = {
      id: String(i.id || `bs-${idx + 1}`).slice(0, 128),
      cuentaId: String(i.cuentaId || '').slice(0, 128),
      fecha: String(i.fecha || '').slice(0, 30),
      referencia: String(i.referencia || '').slice(0, 80),
      descripcion: String(i.descripcion || '').slice(0, 200),
      tipo: i.tipo === 'CREDITO' ? 'CREDITO' : 'DEBITO',
      valor: Number.isFinite(Number(i.valor)) ? Math.abs(Number(i.valor)) : 0,
      mes: String(i.mes || 'Septiembre 2026').slice(0, 60),
    };
    if (i.categoriaPendiente) clean.categoriaPendiente = i.categoriaPendiente;
    if (i.comentario && i.comentario.trim()) clean.comentario = i.comentario.slice(0, 300);
    return clean;
  });

const sanitizeLedgers = (items: BookLedgerItem[]): BookLedgerItem[] =>
  items.slice(0, 5000).map((i, idx) => {
    const clean: BookLedgerItem = {
      id: String(i.id || `bl-${idx + 1}`).slice(0, 128),
      cuentaId: String(i.cuentaId || '').slice(0, 128),
      fecha: String(i.fecha || '').slice(0, 30),
      comprobante: String(i.comprobante || '').slice(0, 80),
      tercero: String(i.tercero || '').slice(0, 120),
      descripcion: String(i.descripcion || '').slice(0, 200),
      tipo: i.tipo === 'DEBITO' ? 'DEBITO' : 'CREDITO',
      valor: Number.isFinite(Number(i.valor)) ? Math.abs(Number(i.valor)) : 0,
      mes: String(i.mes || 'Septiembre 2026').slice(0, 60),
    };
    if (i.categoriaPendiente) clean.categoriaPendiente = i.categoriaPendiente;
    if (i.comentario && i.comentario.trim()) clean.comentario = i.comentario.slice(0, 300);
    return clean;
  });

const sanitizeMatches = (matches: BankMatchGroup[]): BankMatchGroup[] =>
  matches.slice(0, 5000).map((m, idx) => {
    const clean: BankMatchGroup = {
      id: String(m.id || `bm-${idx + 1}`).slice(0, 128),
      cuentaId: String(m.cuentaId || '').slice(0, 128),
      mes: String(m.mes || 'Septiembre 2026').slice(0, 60),
      bankItemIds: Array.isArray(m.bankItemIds) ? m.bankItemIds.slice(0, 50).map(String) : [],
      ledgerItemIds: Array.isArray(m.ledgerItemIds) ? m.ledgerItemIds.slice(0, 50).map(String) : [],
      method:
        m.method === 'automatico_ref' || m.method === 'automatico_valor'
          ? m.method
          : 'manual',
      matchedAt: String(m.matchedAt || new Date().toISOString()).slice(0, 40),
    };
    if (m.note && m.note.trim()) clean.note = m.note.slice(0, 250);
    return clean;
  });

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

const fetchBankDocViaRest = async (docId: string): Promise<SavedBankReconciliationDoc | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/bank_reconciliations/${encodeURIComponent(
    docId
  )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${idToken}` } },
    10000
  );
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) return null;
  const raw = await res.json();
  const parsed: Record<string, any> = {};
  Object.entries(raw.fields || {}).forEach(([k, v]) => {
    parsed[k] = fromFirestoreValue(v as Record<string, any>);
  });

  return {
    id: docId,
    ownerId: String(parsed.ownerId || ''),
    ownerName: parsed.ownerName ? String(parsed.ownerName) : undefined,
    title: String(parsed.title || 'Conciliación Bancaria Premex'),
    selectedMonth: String(parsed.selectedMonth || 'Septiembre 2026'),
    selectedAccountId: parsed.selectedAccountId ? String(parsed.selectedAccountId) : undefined,
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    statementItems: Array.isArray(parsed.statementItems) ? parsed.statementItems : [],
    ledgerItems: Array.isArray(parsed.ledgerItems) ? parsed.ledgerItems : [],
    matches: Array.isArray(parsed.matches) ? parsed.matches : [],
    accountsCount: Number(parsed.accountsCount || 0),
    statementCount: Number(parsed.statementCount || 0),
    ledgerCount: Number(parsed.ledgerCount || 0),
    updatedAtIso: parsed.updatedAt ? String(parsed.updatedAt) : undefined,
  };
};

export const subscribeToBankReconciliation = (
  bankRecId: string,
  onData: (saved: SavedBankReconciliationDoc | null) => void,
  onError?: (err: Error) => void
) => {
  const safeId = /^[a-zA-Z0-9_-]{1,128}$/.test(bankRecId) ? bankRecId : DEFAULT_BANK_REC_ID;
  const path = `bank_reconciliations/${safeId}`;
  const ref = doc(db, 'bank_reconciliations', safeId);
  let isActive = true;

  fetchBankDocViaRest(safeId)
    .then((restDoc) => {
      if (isActive && restDoc) onData(restDoc);
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
      const data = snapshot.data();
      let updatedAtIso: string | undefined;
      if (data.updatedAt instanceof Timestamp) {
        updatedAtIso = data.updatedAt.toDate().toISOString();
      }
      onData({
        id: snapshot.id,
        ownerId: String(data.ownerId || ''),
        ownerName: data.ownerName ? String(data.ownerName) : undefined,
        title: String(data.title || 'Conciliación Bancaria Premex'),
        selectedMonth: String(data.selectedMonth || 'Septiembre 2026'),
        selectedAccountId: data.selectedAccountId ? String(data.selectedAccountId) : undefined,
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        statementItems: Array.isArray(data.statementItems) ? data.statementItems : [],
        ledgerItems: Array.isArray(data.ledgerItems) ? data.ledgerItems : [],
        matches: Array.isArray(data.matches) ? data.matches : [],
        accountsCount: Number(data.accountsCount || 0),
        statementCount: Number(data.statementCount || 0),
        ledgerCount: Number(data.ledgerCount || 0),
        updatedAtIso,
      });
    },
    (error) => {
      if (!isActive || isRecoverableFirestoreSdkError(error)) return;
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch (wrappedErr: any) {
        if (onError) onError(wrappedErr);
      }
    }
  );

  return registerFirestoreListener(() => {
    isActive = false;
    unsubscribe();
  });
};

export const saveBankReconciliationToCloud = async (params: {
  targetId: string;
  title: string;
  selectedMonth: string;
  selectedAccountId: string;
  accounts: BankAccount[];
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
}): Promise<{ id: string; updatedAtIso: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Inicia sesión con Google para guardar la conciliación bancaria en la nube.');
  }

  let docId = /^[a-zA-Z0-9_-]{1,128}$/.test(params.targetId)
    ? params.targetId
    : DEFAULT_BANK_REC_ID;

  const cleanAccounts = sanitizeAccounts(params.accounts);
  const cleanStatements = sanitizeStatements(params.statementItems);
  const cleanLedgers = sanitizeLedgers(params.ledgerItems);
  const cleanMatches = sanitizeMatches(params.matches);
  const cleanTitle = (params.title.trim() || 'Conciliación Bancaria Premex').slice(0, 150);
  const cleanMonth = (params.selectedMonth.trim() || 'Septiembre 2026').slice(0, 60);
  const cleanAccountId = String(params.selectedAccountId || '').slice(0, 128);
  const cleanOwnerName = (user.displayName || user.email || 'Usuario').slice(0, 120);

  await user.getIdToken().catch(() => {});

  const saveViaRest = async (targetDocId: string, isUpdate: boolean) => {
    const idToken = await user.getIdToken();
    const { projectId, databaseId } = activeFirebaseInfo;
    const docName = `projects/${projectId}/databases/${databaseId}/documents/bank_reconciliations/${targetDocId}`;
    const fieldsMap: Record<string, unknown> = {
      ownerName: cleanOwnerName,
      title: cleanTitle,
      selectedMonth: cleanMonth,
      selectedAccountId: cleanAccountId,
      accounts: cleanAccounts,
      statementItems: cleanStatements,
      ledgerItems: cleanLedgers,
      matches: cleanMatches,
      accountsCount: cleanAccounts.length,
      statementCount: cleanStatements.length,
      ledgerCount: cleanLedgers.length,
    };
    if (!isUpdate) fieldsMap.ownerId = user.uid;

    const firestoreFields: Record<string, unknown> = {};
    Object.entries(fieldsMap).forEach(([k, v]) => {
      firestoreFields[k] = toFirestoreValue(v);
    });

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
          'selectedMonth',
          'selectedAccountId',
          'accounts',
          'statementItems',
          'ledgerItems',
          'matches',
          'accountsCount',
          'statementCount',
          'ledgerCount',
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
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        errBody?.error?.message ||
          `Error HTTP ${res.status} al guardar conciliación bancaria (bank_reconciliations/${targetDocId})`
      );
    }
    return { id: targetDocId, updatedAtIso: new Date().toISOString() };
  };

  let existingSnap;
  try {
    existingSnap = await withFirestoreTimeout(
      getDoc(doc(db, 'bank_reconciliations', docId)),
      8500,
      `bank_reconciliations/${docId}`
    );
  } catch (error) {
    if (isRecoverableFirestoreSdkError(error)) {
      const restDoc = await fetchBankDocViaRest(docId);
      return saveViaRest(docId, Boolean(restDoc));
    }
    handleFirestoreError(error, OperationType.GET, `bank_reconciliations/${docId}`);
  }

  if (existingSnap && existingSnap.exists()) {
    try {
      await withFirestoreTimeout(
        updateDoc(doc(db, 'bank_reconciliations', docId), {
          ownerName: cleanOwnerName,
          title: cleanTitle,
          selectedMonth: cleanMonth,
          selectedAccountId: cleanAccountId,
          accounts: cleanAccounts,
          statementItems: cleanStatements,
          ledgerItems: cleanLedgers,
          matches: cleanMatches,
          accountsCount: cleanAccounts.length,
          statementCount: cleanStatements.length,
          ledgerCount: cleanLedgers.length,
          updatedAt: serverTimestamp(),
        }),
        8500,
        `bank_reconciliations/${docId}`
      );
      return { id: docId, updatedAtIso: new Date().toISOString() };
    } catch (error) {
      if (isRecoverableFirestoreSdkError(error)) return saveViaRest(docId, true);
      handleFirestoreError(error, OperationType.UPDATE, `bank_reconciliations/${docId}`);
    }
  }

  try {
    await withFirestoreTimeout(
      setDoc(doc(db, 'bank_reconciliations', docId), {
        ownerId: user.uid,
        ownerName: cleanOwnerName,
        title: cleanTitle,
        selectedMonth: cleanMonth,
        selectedAccountId: cleanAccountId,
        accounts: cleanAccounts,
        statementItems: cleanStatements,
        ledgerItems: cleanLedgers,
        matches: cleanMatches,
        accountsCount: cleanAccounts.length,
        statementCount: cleanStatements.length,
        ledgerCount: cleanLedgers.length,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      8500,
      `bank_reconciliations/${docId}`
    );
    return { id: docId, updatedAtIso: new Date().toISOString() };
  } catch (error) {
    if (isRecoverableFirestoreSdkError(error)) return saveViaRest(docId, false);
    handleFirestoreError(error, OperationType.CREATE, `bank_reconciliations/${docId}`);
  }
};
