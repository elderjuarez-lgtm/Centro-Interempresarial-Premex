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
  BankClosedReconciliation,
  BankMatchGroup,
  BankSociety,
  BankStatementItem,
  BookLedgerItem,
  SapBalanceRow,
  SapOpenItem,
} from '../types';
import { classifySapOpenItem, extractSapAccountRoot } from '../utils/bankReconciliation';

export const DEFAULT_BANK_REC_ID = 'principal-bancos';

export interface SavedBankReconciliationDoc {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  selectedMonth: string;
  selectedAccountId?: string;
  /** undefined = legacy doc without field; null = explicitly closed/no open period; string = active open period */
  openPeriod?: string | null;
  closedReconciliations: BankClosedReconciliation[];
  societies: BankSociety[];
  accounts: BankAccount[];
  sapOpenItems: SapOpenItem[];
  sapBalanceRows: SapBalanceRow[];
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
  accountsCount: number;
  statementCount: number;
  ledgerCount: number;
  updatedAtIso?: string;
}

const sanitizeSaldosPorMes = (
  raw: BankAccount['saldosPorMes']
): BankAccount['saldosPorMes'] => {
  if (!raw || typeof raw !== 'object') return undefined;
  const entries = Object.entries(raw).slice(0, 48);
  if (entries.length === 0) return undefined;
  const clean: NonNullable<BankAccount['saldosPorMes']> = {};
  entries.forEach(([monthKey, val]) => {
    const safeKey = String(monthKey || '').trim().slice(0, 60);
    if (!safeKey || !val || typeof val !== 'object') return;
    const rec: NonNullable<BankAccount['saldosPorMes']>[string] = {
      saldoLibros: Number.isFinite(Number(val.saldoLibros)) ? Number(val.saldoLibros) : 0,
      saldoExtracto: Number.isFinite(Number(val.saldoExtracto)) ? Number(val.saldoExtracto) : 0,
    };
    if (val.saldoCuenta00 !== undefined && Number.isFinite(Number(val.saldoCuenta00))) {
      rec.saldoCuenta00 = Number(val.saldoCuenta00);
    }
    if (val.saldoCuenta01 !== undefined && Number.isFinite(Number(val.saldoCuenta01))) {
      rec.saldoCuenta01 = Number(val.saldoCuenta01);
    }
    if (val.saldoCuenta02 !== undefined && Number.isFinite(Number(val.saldoCuenta02))) {
      rec.saldoCuenta02 = Number(val.saldoCuenta02);
    }
    if (val.saldoExtractoManual !== undefined) {
      rec.saldoExtractoManual = Boolean(val.saldoExtractoManual);
    }
    if (val.fechaCorte) rec.fechaCorte = String(val.fechaCorte).slice(0, 30);
    if (val.fuenteLibros) rec.fuenteLibros = String(val.fuenteLibros).slice(0, 120);
    if (val.fuenteExtracto) rec.fuenteExtracto = String(val.fuenteExtracto).slice(0, 120);
    if (val.updatedAtIso) rec.updatedAtIso = String(val.updatedAtIso).slice(0, 40);
    clean[safeKey] = rec;
  });
  return Object.keys(clean).length > 0 ? clean : undefined;
};

const sanitizeSocieties = (societies: BankSociety[]): BankSociety[] =>
  (Array.isArray(societies) ? societies : []).slice(0, 100).map((s, idx) => {
    const clean: BankSociety = {
      id: String(s.id || `soc-${idx + 1}`).slice(0, 128),
      codigoSociedad: String(s.codigoSociedad || `${(idx + 1) * 1000}`).trim().slice(0, 30),
      nombre: String(s.nombre || 'Sociedad').trim().slice(0, 120),
      pais: String(s.pais || 'Colombia').trim().slice(0, 80),
      moneda: s.moneda || 'COP',
      activa: s.activa !== false,
    };
    if (s.nit && String(s.nit).trim()) clean.nit = String(s.nit).trim().slice(0, 60);
    return clean;
  });

const sanitizeAccounts = (accounts: BankAccount[]): BankAccount[] =>
  (Array.isArray(accounts) ? accounts : []).slice(0, 300).map((a, idx) => {
    const clean: BankAccount = {
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
    };
    if (a.codigoSociedad && String(a.codigoSociedad).trim()) {
      clean.codigoSociedad = String(a.codigoSociedad).trim().slice(0, 30);
    }
    if (a.productoCuenta && a.productoCuenta.trim()) {
      clean.productoCuenta = String(a.productoCuenta).trim().slice(0, 140);
    }
    if (a.codigoContable && a.codigoContable.trim()) {
      clean.codigoContable = String(a.codigoContable).trim().slice(0, 60);
    }
    if (a.raizContable && a.raizContable.trim()) {
      clean.raizContable = String(a.raizContable).trim().slice(0, 60);
    }
    if (a.cuentaMayor00 && a.cuentaMayor00.trim()) {
      clean.cuentaMayor00 = String(a.cuentaMayor00).trim().slice(0, 60);
    }
    if (a.cuentaMayor01 && a.cuentaMayor01.trim()) {
      clean.cuentaMayor01 = String(a.cuentaMayor01).trim().slice(0, 60);
    }
    if (a.cuentaMayor02 && a.cuentaMayor02.trim()) {
      clean.cuentaMayor02 = String(a.cuentaMayor02).trim().slice(0, 60);
    }
    if (a.saldoCuenta00 !== undefined && Number.isFinite(Number(a.saldoCuenta00))) {
      clean.saldoCuenta00 = Number(a.saldoCuenta00);
    }
    if (a.saldoCuenta01 !== undefined && Number.isFinite(Number(a.saldoCuenta01))) {
      clean.saldoCuenta01 = Number(a.saldoCuenta01);
    }
    if (a.saldoCuenta02 !== undefined && Number.isFinite(Number(a.saldoCuenta02))) {
      clean.saldoCuenta02 = Number(a.saldoCuenta02);
    }
    if (a.saldoExtractoManual !== undefined) {
      clean.saldoExtractoManual = Boolean(a.saldoExtractoManual);
    }
    if (a.fechaCorte && a.fechaCorte.trim()) {
      clean.fechaCorte = String(a.fechaCorte).trim().slice(0, 30);
    }
    const cleanMonthly = sanitizeSaldosPorMes(a.saldosPorMes);
    if (cleanMonthly) clean.saldosPorMes = cleanMonthly;
    return clean;
  });

const sanitizeSapOpenItems = (items: SapOpenItem[]): SapOpenItem[] =>
  (Array.isArray(items) ? items : []).slice(0, 5000).map((item, idx) => {
    const parsedGl = extractSapAccountRoot(item.cuentaMayor || '');
    const importe = Number.isFinite(Number(item.importeMonedaLocal))
      ? Math.round(Number(item.importeMonedaLocal) * 100) / 100
      : 0;
    const clase = String(item.claseDocumento || 'AB').trim().toUpperCase().slice(0, 12);
    const clean: SapOpenItem = {
      id: String(item.id || `sap-${idx + 1}`).slice(0, 128),
      cuentaId: String(item.cuentaId || '').slice(0, 128),
      sociedadCodigo: String(item.sociedadCodigo || '').trim().slice(0, 30),
      sociedadNombre: String(item.sociedadNombre || '').trim().slice(0, 120),
      cuentaMayor: String(item.cuentaMayor || '').trim().slice(0, 40),
      raizContable: String(item.raizContable || parsedGl.raiz).trim().slice(0, 40),
      subcuentaTipo:
        item.subcuentaTipo === '00' || item.subcuentaTipo === '01' || item.subcuentaTipo === '02'
          ? item.subcuentaTipo
          : parsedGl.subcuenta,
      claveRef1: String(item.claveRef1 || '').slice(0, 80),
      claveRef3: String(item.claveRef3 || '').slice(0, 120),
      referencia: String(item.referencia || '').slice(0, 80),
      numeroDocumento: String(item.numeroDocumento || '').slice(0, 80),
      claseDocumento: clase,
      fechaDocumento: String(item.fechaDocumento || '').slice(0, 30),
      fechaContabilizacion: String(item.fechaContabilizacion || '').slice(0, 30),
      importeMonedaLocal: importe,
      monedaLocal: item.monedaLocal || 'COP',
      texto: String(item.texto || '').slice(0, 220),
      mes: String(item.mes || 'Octubre 2026').slice(0, 60),
      seccionAuto: item.seccionAuto || classifySapOpenItem(clase, importe),
    };
    if (item.seccionManual) clean.seccionManual = item.seccionManual;
    if (item.comentario && String(item.comentario).trim()) {
      clean.comentario = String(item.comentario).trim().slice(0, 300);
    }
    if (item.origen === 'sap_fbl3n' || item.origen === 'manual') {
      clean.origen = item.origen;
    }
    return clean;
  });

const sanitizeSapBalanceRows = (rows: SapBalanceRow[]): SapBalanceRow[] =>
  (Array.isArray(rows) ? rows : []).slice(0, 5000).map((row, idx) => {
    const parsedGl = extractSapAccountRoot(row.cuentaMayor || '');
    const clean: SapBalanceRow = {
      id: String(row.id || `sbal-${idx + 1}`).slice(0, 128),
      sociedadCodigo: String(row.sociedadCodigo || '').trim().slice(0, 30),
      sociedadNombre: String(row.sociedadNombre || '').trim().slice(0, 120),
      cuentaMayor: String(row.cuentaMayor || '').trim().slice(0, 40),
      raizContable: String(row.raizContable || parsedGl.raiz).trim().slice(0, 40),
      subcuentaTipo:
        row.subcuentaTipo === '00' || row.subcuentaTipo === '01' || row.subcuentaTipo === '02'
          ? row.subcuentaTipo
          : parsedGl.subcuenta,
      denominacion: String(row.denominacion || '').slice(0, 180),
      nuevoSaldo: Number.isFinite(Number(row.nuevoSaldo))
        ? Math.round(Number(row.nuevoSaldo) * 100) / 100
        : 0,
      moneda: row.moneda || 'COP',
      mes: String(row.mes || 'Octubre 2026').slice(0, 60),
    };
    if (row.fechaCorte) clean.fechaCorte = String(row.fechaCorte).slice(0, 30);
    return clean;
  });

const sanitizeStatements = (items: BankStatementItem[]): BankStatementItem[] =>
  (Array.isArray(items) ? items : []).slice(0, 5000).map((i, idx) => {
    const clean: BankStatementItem = {
      id: String(i.id || `bs-${idx + 1}`).slice(0, 128),
      cuentaId: String(i.cuentaId || '').slice(0, 128),
      fecha: String(i.fecha || '').slice(0, 30),
      referencia: String(i.referencia || '').slice(0, 80),
      descripcion: String(i.descripcion || '').slice(0, 200),
      tipo: i.tipo === 'CREDITO' ? 'CREDITO' : 'DEBITO',
      valor: Number.isFinite(Number(i.valor)) ? Math.abs(Number(i.valor)) : 0,
      mes: String(i.mes || 'Octubre 2026').slice(0, 60),
    };
    if (i.categoriaPendiente) clean.categoriaPendiente = i.categoriaPendiente;
    if (i.comentario && i.comentario.trim()) clean.comentario = i.comentario.slice(0, 300);
    if (i.origenCarga === 'conciliacion_directa' || i.origenCarga === 'extracto_completo') {
      clean.origenCarga = i.origenCarga;
    }
    return clean;
  });

const sanitizeLedgers = (items: BookLedgerItem[]): BookLedgerItem[] =>
  (Array.isArray(items) ? items : []).slice(0, 5000).map((i, idx) => {
    const clean: BookLedgerItem = {
      id: String(i.id || `bl-${idx + 1}`).slice(0, 128),
      cuentaId: String(i.cuentaId || '').slice(0, 128),
      fecha: String(i.fecha || '').slice(0, 30),
      comprobante: String(i.comprobante || '').slice(0, 80),
      tercero: String(i.tercero || '').slice(0, 120),
      descripcion: String(i.descripcion || '').slice(0, 200),
      tipo: i.tipo === 'DEBITO' ? 'DEBITO' : 'CREDITO',
      valor: Number.isFinite(Number(i.valor)) ? Math.abs(Number(i.valor)) : 0,
      mes: String(i.mes || 'Octubre 2026').slice(0, 60),
    };
    if (i.categoriaPendiente) clean.categoriaPendiente = i.categoriaPendiente;
    if (i.comentario && i.comentario.trim()) clean.comentario = i.comentario.slice(0, 300);
    if (i.origenCarga === 'conciliacion_directa' || i.origenCarga === 'extracto_completo') {
      clean.origenCarga = i.origenCarga;
    }
    return clean;
  });

const sanitizeMatches = (matches: BankMatchGroup[]): BankMatchGroup[] =>
  (Array.isArray(matches) ? matches : []).slice(0, 5000).map((m, idx) => {
    const clean: BankMatchGroup = {
      id: String(m.id || `bm-${idx + 1}`).slice(0, 128),
      cuentaId: String(m.cuentaId || '').slice(0, 128),
      mes: String(m.mes || 'Octubre 2026').slice(0, 60),
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

const sanitizeClosedReconciliations = (
  list: BankClosedReconciliation[]
): BankClosedReconciliation[] =>
  (Array.isArray(list) ? list : []).slice(0, 60).map((item, idx) => {
    const period = String(item.period || 'Periodo').trim().slice(0, 60);
    const compactAccounts = sanitizeAccounts(item.accounts || []).map((acc) => {
      const monthOnly =
        acc.saldosPorMes && acc.saldosPorMes[period]
          ? { [period]: acc.saldosPorMes[period] }
          : undefined;
      const copy: BankAccount = { ...acc };
      if (monthOnly) copy.saldosPorMes = monthOnly;
      else delete copy.saldosPorMes;
      return copy;
    });
    const clean: BankClosedReconciliation = {
      id: String(item.id || `bclose-${idx + 1}`).slice(0, 128),
      period,
      closedAtIso: String(item.closedAtIso || new Date().toISOString()).slice(0, 60),
      closedByName: String(item.closedByName || 'Usuario').slice(0, 120),
      societiesCount: Number.isFinite(Number(item.societiesCount))
        ? Math.max(0, Math.round(Number(item.societiesCount)))
        : (item.societies || []).length,
      accountsCount: Number.isFinite(Number(item.accountsCount))
        ? Math.max(0, Math.round(Number(item.accountsCount)))
        : compactAccounts.length,
      squaredAccountsCount: Number.isFinite(Number(item.squaredAccountsCount))
        ? Math.max(0, Math.round(Number(item.squaredAccountsCount)))
        : 0,
      diffAccountsCount: Number.isFinite(Number(item.diffAccountsCount))
        ? Math.max(0, Math.round(Number(item.diffAccountsCount)))
        : 0,
      openItemsCount: Number.isFinite(Number(item.openItemsCount))
        ? Math.max(0, Math.round(Number(item.openItemsCount)))
        : (item.sapOpenItems || []).length,
      societies: sanitizeSocieties(item.societies || []),
      accounts: compactAccounts,
      sapOpenItems: sanitizeSapOpenItems((item.sapOpenItems || []).slice(0, 1500)),
      sapBalanceRows: sanitizeSapBalanceRows((item.sapBalanceRows || []).slice(0, 1000)),
    };
    if (item.closedByEmail && String(item.closedByEmail).trim()) {
      clean.closedByEmail = String(item.closedByEmail).trim().slice(0, 160);
    }
    if (item.notes && String(item.notes).trim()) {
      clean.notes = String(item.notes).trim().slice(0, 500);
    }
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
    selectedMonth: String(parsed.selectedMonth || 'Octubre 2026'),
    selectedAccountId: parsed.selectedAccountId ? String(parsed.selectedAccountId) : undefined,
    openPeriod:
      'openPeriod' in parsed
        ? String(parsed.openPeriod || '').trim() || null
        : undefined,
    closedReconciliations: Array.isArray(parsed.closedReconciliations)
      ? parsed.closedReconciliations
      : [],
    societies: Array.isArray(parsed.societies) ? parsed.societies : [],
    accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
    sapOpenItems: Array.isArray(parsed.sapOpenItems) ? parsed.sapOpenItems : [],
    sapBalanceRows: Array.isArray(parsed.sapBalanceRows) ? parsed.sapBalanceRows : [],
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
        selectedMonth: String(data.selectedMonth || 'Octubre 2026'),
        selectedAccountId: data.selectedAccountId ? String(data.selectedAccountId) : undefined,
        openPeriod:
          'openPeriod' in data
            ? String(data.openPeriod || '').trim() || null
            : undefined,
        closedReconciliations: Array.isArray(data.closedReconciliations)
          ? data.closedReconciliations
          : [],
        societies: Array.isArray(data.societies) ? data.societies : [],
        accounts: Array.isArray(data.accounts) ? data.accounts : [],
        sapOpenItems: Array.isArray(data.sapOpenItems) ? data.sapOpenItems : [],
        sapBalanceRows: Array.isArray(data.sapBalanceRows) ? data.sapBalanceRows : [],
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
  openPeriod: string | null;
  closedReconciliations: BankClosedReconciliation[];
  societies: BankSociety[];
  accounts: BankAccount[];
  sapOpenItems: SapOpenItem[];
  sapBalanceRows: SapBalanceRow[];
  statementItems: BankStatementItem[];
  ledgerItems: BookLedgerItem[];
  matches: BankMatchGroup[];
}): Promise<{ id: string; updatedAtIso: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Inicia sesión con Google para guardar la conciliación bancaria en la nube.');
  }

  const docId = /^[a-zA-Z0-9_-]{1,128}$/.test(params.targetId)
    ? params.targetId
    : DEFAULT_BANK_REC_ID;

  const cleanOpenPeriod = params.openPeriod ? String(params.openPeriod).trim().slice(0, 60) : '';
  const cleanClosedReconciliations = sanitizeClosedReconciliations(params.closedReconciliations);
  const cleanSocieties = sanitizeSocieties(params.societies);
  const cleanAccounts = sanitizeAccounts(params.accounts);
  const cleanSapOpenItems = sanitizeSapOpenItems(params.sapOpenItems);
  const cleanSapBalanceRows = sanitizeSapBalanceRows(params.sapBalanceRows);
  const cleanStatements = sanitizeStatements(params.statementItems);
  const cleanLedgers = sanitizeLedgers(params.ledgerItems);
  const cleanMatches = sanitizeMatches(params.matches);
  const cleanTitle = (params.title.trim() || 'Conciliación Bancaria Premex').slice(0, 150);
  const cleanMonth = (params.selectedMonth.trim() || 'Octubre 2026').slice(0, 60);
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
      openPeriod: cleanOpenPeriod,
      closedReconciliations: cleanClosedReconciliations,
      societies: cleanSocieties,
      accounts: cleanAccounts,
      sapOpenItems: cleanSapOpenItems,
      sapBalanceRows: cleanSapBalanceRows,
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
          'openPeriod',
          'closedReconciliations',
          'societies',
          'accounts',
          'sapOpenItems',
          'sapBalanceRows',
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
          openPeriod: cleanOpenPeriod,
          closedReconciliations: cleanClosedReconciliations,
          societies: cleanSocieties,
          accounts: cleanAccounts,
          sapOpenItems: cleanSapOpenItems,
          sapBalanceRows: cleanSapBalanceRows,
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
        openPeriod: cleanOpenPeriod,
        closedReconciliations: cleanClosedReconciliations,
        societies: cleanSocieties,
        accounts: cleanAccounts,
        sapOpenItems: cleanSapOpenItems,
        sapBalanceRows: cleanSapBalanceRows,
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
