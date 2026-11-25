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
  ClaraBatchExportLog,
  ClaraConnectorConfig,
  ClaraCostCenterRule,
  ClaraErpTarget,
  ClaraTransaction,
  ClaraVendor,
  ClaraVendorSyncStatus,
  ClaraWorkManagerInvoice,
  ClaraWorkManagerStatus,
} from '../types';
import { INITIAL_CLARA_CONNECTOR_CONFIG } from '../utils/clara';

export interface SavedClaraWorkspaceDoc {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  selectedPeriod: string;
  transactions: ClaraTransaction[];
  workManagerInvoices: ClaraWorkManagerInvoice[];
  vendors: ClaraVendor[];
  costCenterRules: ClaraCostCenterRule[];
  connectorConfig: ClaraConnectorConfig;
  batchLogs: ClaraBatchExportLog[];
  updatedAtIso?: string;
}

const VALID_ERP_TARGETS = new Set<ClaraErpTarget>(['SAP', 'Odoo', 'Por definir']);
const VALID_WM_STATUSES = new Set<ClaraWorkManagerStatus>([
  'pendiente_factura',
  'validada',
  'exenta_exterior',
  'diferencia_valor',
]);
const VALID_WM_RADICACION_STATUSES = new Set([
  'radicada',
  'no_radicada',
  'inconsistencia',
  'pendiente',
  'exenta_exterior',
]);
const VALID_CUADRE_STATUSES = new Set([
  'cuadra_ok',
  'diferencia_monto',
  'error_aritmetico',
  'sin_soporte',
]);
const VALID_SAP_DISPATCH_STATUSES = new Set([
  'pendiente',
  'en_paquete',
  'enviado_agente',
  'contabilizado',
  'error',
]);
const VALID_VENDOR_STATUSES = new Set<ClaraVendorSyncStatus>([
  'pendiente_crear',
  'creado_sap',
  'creado_odoo',
  'sincronizado_ambos',
]);

const isOfflineError = (err: unknown): boolean => isRecoverableFirestoreSdkError(err);

const sanitizeOptionalMoney = (val: unknown): number | undefined => {
  if (val === undefined || val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
};

const sanitizeTransaction = (raw: ClaraTransaction, idx = 0): ClaraTransaction => ({
  id: String(raw.id || `clara-tx-${idx}`).slice(0, 120),
  claraTxId: raw.claraTxId ? String(raw.claraTxId).slice(0, 120) : '',
  fecha: String(raw.fecha || new Date().toISOString().slice(0, 10)).slice(0, 20),
  sociedad: String(raw.sociedad || 'PREMEX').trim().slice(0, 100),
  tarjetahabiente: String(raw.tarjetahabiente || '').trim().slice(0, 120),
  tarjetaUltimos4: raw.tarjetaUltimos4 ? String(raw.tarjetaUltimos4).slice(0, 8) : '',
  comercio: String(raw.comercio || '').trim().slice(0, 160),
  nitComercio: raw.nitComercio ? String(raw.nitComercio).trim().slice(0, 60) : '',
  pais: raw.pais ? String(raw.pais).trim().slice(0, 80) : '',
  moneda: String(raw.moneda || 'COP').trim().slice(0, 12),
  valor: Number.isFinite(Number(raw.valor)) ? Math.round(Number(raw.valor) * 100) / 100 : 0,
  centroCosto: String(raw.centroCosto || '').trim().slice(0, 120),
  observacion: String(raw.observacion || '').trim().slice(0, 400),
  categoria: raw.categoria ? String(raw.categoria).trim().slice(0, 100) : '',
  estadoClara:
    raw.estadoClara === 'Pendiente' ||
    raw.estadoClara === 'Reembolso' ||
    raw.estadoClara === 'Rechazada'
      ? raw.estadoClara
      : 'Autorizada',
  origenGasto: raw.origenGasto === 'exterior' ? 'exterior' : 'nacional',
  motivoExterior: raw.motivoExterior ? String(raw.motivoExterior).slice(0, 200) : undefined,
  workManagerStatus: VALID_WM_STATUSES.has(raw.workManagerStatus)
    ? raw.workManagerStatus
    : 'pendiente_factura',
  workManagerInvoiceId: raw.workManagerInvoiceId
    ? String(raw.workManagerInvoiceId).slice(0, 120)
    : undefined,
  workManagerNumeroFactura: raw.workManagerNumeroFactura
    ? String(raw.workManagerNumeroFactura).slice(0, 100)
    : undefined,
  wmRadicacionStatus:
    raw.wmRadicacionStatus && VALID_WM_RADICACION_STATUSES.has(raw.wmRadicacionStatus)
      ? raw.wmRadicacionStatus
      : undefined,
  wmRadicacionNumero: raw.wmRadicacionNumero
    ? String(raw.wmRadicacionNumero).slice(0, 100)
    : undefined,
  wmRadicacionFecha: raw.wmRadicacionFecha
    ? String(raw.wmRadicacionFecha).slice(0, 30)
    : undefined,
  wmMensajeValidacion: raw.wmMensajeValidacion
    ? String(raw.wmMensajeValidacion).slice(0, 240)
    : undefined,
  facturaNumero: raw.facturaNumero ? String(raw.facturaNumero).slice(0, 100) : undefined,
  facturaSerie: raw.facturaSerie ? String(raw.facturaSerie).slice(0, 40) : undefined,
  facturaCufe: raw.facturaCufe ? String(raw.facturaCufe).slice(0, 180) : undefined,
  facturaFecha: raw.facturaFecha ? String(raw.facturaFecha).slice(0, 20) : undefined,
  facturaNit: raw.facturaNit ? String(raw.facturaNit).slice(0, 60) : undefined,
  facturaProveedor: raw.facturaProveedor
    ? String(raw.facturaProveedor).slice(0, 160)
    : undefined,
  facturaMoneda: raw.facturaMoneda ? String(raw.facturaMoneda).slice(0, 12) : undefined,
  facturaSubtotal: sanitizeOptionalMoney(raw.facturaSubtotal),
  facturaImpuesto: sanitizeOptionalMoney(raw.facturaImpuesto),
  facturaPorcentajeImpuesto: sanitizeOptionalMoney(raw.facturaPorcentajeImpuesto),
  facturaTotal: sanitizeOptionalMoney(raw.facturaTotal),
  facturaConfianzaIa:
    raw.facturaConfianzaIa === 'alta' ||
    raw.facturaConfianzaIa === 'media' ||
    raw.facturaConfianzaIa === 'baja'
      ? raw.facturaConfianzaIa
      : undefined,
  facturaArchivoNombre: raw.facturaArchivoNombre
    ? String(raw.facturaArchivoNombre).slice(0, 160)
    : undefined,
  facturaCuadreEstado:
    raw.facturaCuadreEstado && VALID_CUADRE_STATUSES.has(raw.facturaCuadreEstado)
      ? raw.facturaCuadreEstado
      : undefined,
  facturaCuadreNota: raw.facturaCuadreNota
    ? String(raw.facturaCuadreNota).slice(0, 240)
    : undefined,
  terceroId: raw.terceroId ? String(raw.terceroId).slice(0, 120) : undefined,
  terceroNit: raw.terceroNit ? String(raw.terceroNit).slice(0, 60) : undefined,
  terceroNombre: raw.terceroNombre ? String(raw.terceroNombre).slice(0, 160) : undefined,
  erpDestino: VALID_ERP_TARGETS.has(raw.erpDestino) ? raw.erpDestino : 'Por definir',
  cuentaContable: raw.cuentaContable ? String(raw.cuentaContable).slice(0, 60) : '',
  indicadorImpuesto: raw.indicadorImpuesto ? String(raw.indicadorImpuesto).slice(0, 60) : '',
  sapSociedad: raw.sapSociedad ? String(raw.sapSociedad).slice(0, 30) : undefined,
  sapClaseDoc: raw.sapClaseDoc ? String(raw.sapClaseDoc).slice(0, 12) : undefined,
  sapCentroCosto: raw.sapCentroCosto ? String(raw.sapCentroCosto).slice(0, 80) : undefined,
  sapDocContable: raw.sapDocContable ? String(raw.sapDocContable).slice(0, 80) : undefined,
  sapDespachoEstado:
    raw.sapDespachoEstado && VALID_SAP_DISPATCH_STATUSES.has(raw.sapDespachoEstado)
      ? raw.sapDespachoEstado
      : undefined,
  sapMensaje: raw.sapMensaje ? String(raw.sapMensaje).slice(0, 240) : undefined,
  estadoContable:
    raw.estadoContable === 'listo_erp' ||
    raw.estadoContable === 'exportado' ||
    raw.estadoContable === 'contabilizado'
      ? raw.estadoContable
      : 'borrador',
  loteExportacionId: raw.loteExportacionId
    ? String(raw.loteExportacionId).slice(0, 120)
    : undefined,
  origenRegistro:
    raw.origenRegistro === 'archivo_clara' ||
    raw.origenRegistro === 'manual' ||
    raw.origenRegistro === 'api_clara'
      ? raw.origenRegistro
      : 'demo',
  notasRevision: raw.notasRevision ? String(raw.notasRevision).slice(0, 300) : undefined,
});

const sanitizeInvoice = (
  raw: ClaraWorkManagerInvoice,
  idx = 0
): ClaraWorkManagerInvoice => ({
  id: String(raw.id || `wm-inv-${idx}`).slice(0, 120),
  numeroFactura: String(raw.numeroFactura || '').trim().slice(0, 80),
  cufe: raw.cufe ? String(raw.cufe).trim().slice(0, 160) : '',
  fechaEmision: String(raw.fechaEmision || new Date().toISOString().slice(0, 10)).slice(0, 20),
  nitEmisor: String(raw.nitEmisor || '').trim().slice(0, 60),
  razonSocialEmisor: String(raw.razonSocialEmisor || '').trim().slice(0, 160),
  sociedadReceptora: String(raw.sociedadReceptora || '').trim().slice(0, 100),
  moneda: String(raw.moneda || 'COP').trim().slice(0, 12),
  subtotal: Number.isFinite(Number(raw.subtotal)) ? Number(raw.subtotal) : 0,
  impuesto: Number.isFinite(Number(raw.impuesto)) ? Number(raw.impuesto) : 0,
  total: Number.isFinite(Number(raw.total)) ? Number(raw.total) : 0,
  estadoDian:
    raw.estadoDian === 'Aprobada' ||
    raw.estadoDian === 'Con Reclamo' ||
    raw.estadoDian === 'Pendiente'
      ? raw.estadoDian
      : 'Recibida',
  vinculadaClaraTxId: raw.vinculadaClaraTxId
    ? String(raw.vinculadaClaraTxId).slice(0, 120)
    : undefined,
  origenCarga:
    raw.origenCarga === 'archivo_wm' ||
    raw.origenCarga === 'manual' ||
    raw.origenCarga === 'api_wm'
      ? raw.origenCarga
      : 'demo',
});

const sanitizeVendor = (raw: ClaraVendor, idx = 0): ClaraVendor => ({
  id: String(raw.id || `vnd-${idx}`).slice(0, 120),
  nitTaxId: String(raw.nitTaxId || '').trim().slice(0, 60),
  razonSocial: String(raw.razonSocial || '').trim().slice(0, 160),
  aliasComerciosClara: Array.isArray(raw.aliasComerciosClara)
    ? raw.aliasComerciosClara
        .map((a) => String(a || '').trim().slice(0, 120))
        .filter(Boolean)
        .slice(0, 25)
    : [],
  pais: String(raw.pais || 'Colombia').trim().slice(0, 80),
  esExterior: Boolean(raw.esExterior),
  tipoPersona:
    raw.tipoPersona === 'Natural' || raw.tipoPersona === 'Extranjero'
      ? raw.tipoPersona
      : 'Jurídica',
  regimenFiscal: String(raw.regimenFiscal || '').trim().slice(0, 140),
  emailContacto: raw.emailContacto ? String(raw.emailContacto).trim().slice(0, 160) : '',
  erpObjetivo:
    raw.erpObjetivo === 'SAP' || raw.erpObjetivo === 'Odoo' ? raw.erpObjetivo : 'Ambos',
  codigoTerceroSap: raw.codigoTerceroSap
    ? String(raw.codigoTerceroSap).trim().slice(0, 60)
    : '',
  partnerIdOdoo: raw.partnerIdOdoo ? String(raw.partnerIdOdoo).trim().slice(0, 60) : '',
  cuentaGastoDefault: raw.cuentaGastoDefault
    ? String(raw.cuentaGastoDefault).trim().slice(0, 60)
    : '',
  estadoCreacion: VALID_VENDOR_STATUSES.has(raw.estadoCreacion)
    ? raw.estadoCreacion
    : 'pendiente_crear',
  notas: raw.notas ? String(raw.notas).trim().slice(0, 300) : '',
});

const sanitizeCostCenterRule = (
  raw: ClaraCostCenterRule,
  idx = 0
): ClaraCostCenterRule => ({
  id: String(raw.id || `cc-rule-${idx}`).slice(0, 120),
  sociedad: String(raw.sociedad || '').trim().slice(0, 100),
  centroCostoClara: String(raw.centroCostoClara || '').trim().slice(0, 120),
  erpDestino: raw.erpDestino === 'Odoo' ? 'Odoo' : 'SAP',
  codigoCentroCostoErp: String(raw.codigoCentroCostoErp || '').trim().slice(0, 80),
  cuentaAnaliticaOdoo: raw.cuentaAnaliticaOdoo
    ? String(raw.cuentaAnaliticaOdoo).trim().slice(0, 120)
    : '',
  cuentaContableDefault: raw.cuentaContableDefault
    ? String(raw.cuentaContableDefault).trim().slice(0, 60)
    : '',
  diarioOdoo: raw.diarioOdoo ? String(raw.diarioOdoo).trim().slice(0, 100) : '',
  sociedadSap: raw.sociedadSap ? String(raw.sociedadSap).trim().slice(0, 40) : '',
  activa: raw.activa !== false,
});

const sanitizeConnectorConfig = (
  raw: Partial<ClaraConnectorConfig> | undefined
): ClaraConnectorConfig => ({
  claraMode: raw?.claraMode === 'api_pendiente' ? 'api_pendiente' : 'archivo',
  workManagerMode: raw?.workManagerMode === 'api_pendiente' ? 'api_pendiente' : 'archivo',
  sapMode: raw?.sapMode === 'odata_rfc_pendiente' ? 'odata_rfc_pendiente' : 'archivo_lote',
  odooMode: raw?.odooMode === 'jsonrpc_pendiente' ? 'jsonrpc_pendiente' : 'archivo_lote',
  toleranciaCruceMonto: Math.max(
    0,
    Math.min(100000, Number(raw?.toleranciaCruceMonto ?? 5) || 0)
  ),
  diasVentanaCruce: Math.max(1, Math.min(90, Number(raw?.diasVentanaCruce ?? 20) || 20)),
  detectarExteriorAutomatico: raw?.detectarExteriorAutomatico !== false,
  notaViaticosFutura: String(
    raw?.notaViaticosFutura || INITIAL_CLARA_CONNECTOR_CONFIG.notaViaticosFutura || ''
  ).slice(0, 400),
  claraUrl: String(raw?.claraUrl || 'https://colombia.clara.com/auth/login').slice(0, 200),
  workManagerUrl: String(
    raw?.workManagerUrl || 'https://pan.iluma.bio:8037/Account/Login'
  ).slice(0, 200),
  agentUrl: String(raw?.agentUrl || 'http://127.0.0.1:4780').slice(0, 160),
  executionMode:
    raw?.executionMode === 'agente_local' || raw?.executionMode === 'sap_bot'
      ? raw.executionMode
      : 'hibrido_web',
  sapSociedadDefault: String(raw?.sapSociedadDefault || '1000').slice(0, 20),
  sapClaseDocDefault: String(raw?.sapClaseDocDefault || 'KR').slice(0, 12),
  lastServerProbeIso: raw?.lastServerProbeIso ? String(raw.lastServerProbeIso).slice(0, 60) : '',
  lastServerProbeSummary: raw?.lastServerProbeSummary
    ? String(raw.lastServerProbeSummary).slice(0, 260)
    : '',
});

const sanitizeBatchLog = (raw: ClaraBatchExportLog, idx = 0): ClaraBatchExportLog => ({
  id: String(raw.id || `batch-${idx}`).slice(0, 120),
  createdAtIso: String(raw.createdAtIso || new Date().toISOString()).slice(0, 60),
  createdBy: String(raw.createdBy || 'Usuario').slice(0, 120),
  erp:
    raw.erp === 'Odoo' || raw.erp === 'Clara' || raw.erp === 'WorkManager'
      ? raw.erp
      : 'SAP',
  tipo:
    raw.tipo === 'terceros' ||
    raw.tipo === 'rpa_clara' ||
    raw.tipo === 'rpa_wm' ||
    raw.tipo === 'sap_bot'
      ? raw.tipo
      : 'gastos',
  cantidadRegistros: Math.max(0, Math.round(Number(raw.cantidadRegistros) || 0)),
  totalMonto: Number.isFinite(Number(raw.totalMonto)) ? Number(raw.totalMonto) : 0,
  moneda: String(raw.moneda || 'COP').slice(0, 12),
  archivoNombre: String(raw.archivoNombre || '').slice(0, 180),
  estado: raw.estado === 'alerta' || raw.estado === 'error' ? raw.estado : 'ok',
  detalle: raw.detalle ? String(raw.detalle).slice(0, 300) : '',
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

const getRestDocName = (docId: string) => {
  const { projectId, databaseId } = activeFirebaseInfo;
  return `projects/${projectId}/databases/${databaseId}/documents/clara_workspaces/${docId}`;
};

const fetchAuthClaraViaRest = async (
  docId: string
): Promise<SavedClaraWorkspaceDoc | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/clara_workspaces/${encodeURIComponent(
    docId
  )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  const data: Record<string, any> = {};
  Object.entries(raw.fields || {}).forEach(([k, v]) => {
    data[k] = fromFirestoreValue(v as Record<string, any>);
  });
  return {
    id: docId,
    ownerId: String(data.ownerId || ''),
    ownerName: data.ownerName ? String(data.ownerName) : undefined,
    title: String(data.title || 'Gestión TC Clara'),
    selectedPeriod: String(data.selectedPeriod || 'ALL'),
    transactions: Array.isArray(data.transactions)
      ? data.transactions.map((t: ClaraTransaction, i: number) => sanitizeTransaction(t, i))
      : [],
    workManagerInvoices: Array.isArray(data.workManagerInvoices)
      ? data.workManagerInvoices.map((inv: ClaraWorkManagerInvoice, i: number) =>
          sanitizeInvoice(inv, i)
        )
      : [],
    vendors: Array.isArray(data.vendors)
      ? data.vendors.map((v: ClaraVendor, i: number) => sanitizeVendor(v, i))
      : [],
    costCenterRules: Array.isArray(data.costCenterRules)
      ? data.costCenterRules.map((r: ClaraCostCenterRule, i: number) =>
          sanitizeCostCenterRule(r, i)
        )
      : [],
    connectorConfig: sanitizeConnectorConfig(data.connectorConfig),
    batchLogs: Array.isArray(data.batchLogs)
      ? data.batchLogs.map((b: ClaraBatchExportLog, i: number) => sanitizeBatchLog(b, i))
      : [],
    updatedAtIso: data.updatedAt ? String(data.updatedAt) : undefined,
  };
};

export const subscribeToClaraWorkspace = (
  docId: string,
  onData: (saved: SavedClaraWorkspaceDoc | null) => void,
  onError?: (err: unknown) => void
) => {
  const path = `clara_workspaces/${docId}`;
  const docRef = doc(db, 'clara_workspaces', docId);
  let isActive = true;

  fetchAuthClaraViaRest(docId)
    .then((parsed) => {
      if (isActive && parsed) onData(parsed);
    })
    .catch(() => {});

  const rawUnsub = onSnapshot(
    docRef,
    (snapshot) => {
      if (!isActive) return;
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      const data = snapshot.data();
      onData({
        id: snapshot.id,
        ownerId: String(data.ownerId || ''),
        ownerName: data.ownerName ? String(data.ownerName) : undefined,
        title: String(data.title || 'Gestión TC Clara'),
        selectedPeriod: String(data.selectedPeriod || 'ALL'),
        transactions: Array.isArray(data.transactions)
          ? data.transactions.map((t: ClaraTransaction, i: number) =>
              sanitizeTransaction(t, i)
            )
          : [],
        workManagerInvoices: Array.isArray(data.workManagerInvoices)
          ? data.workManagerInvoices.map((inv: ClaraWorkManagerInvoice, i: number) =>
              sanitizeInvoice(inv, i)
            )
          : [],
        vendors: Array.isArray(data.vendors)
          ? data.vendors.map((v: ClaraVendor, i: number) => sanitizeVendor(v, i))
          : [],
        costCenterRules: Array.isArray(data.costCenterRules)
          ? data.costCenterRules.map((r: ClaraCostCenterRule, i: number) =>
              sanitizeCostCenterRule(r, i)
            )
          : [],
        connectorConfig: sanitizeConnectorConfig(data.connectorConfig),
        batchLogs: Array.isArray(data.batchLogs)
          ? data.batchLogs.map((b: ClaraBatchExportLog, i: number) =>
              sanitizeBatchLog(b, i)
            )
          : [],
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

export const saveClaraWorkspaceToCloud = async (params: {
  docId: string;
  selectedPeriod: string;
  transactions: ClaraTransaction[];
  workManagerInvoices: ClaraWorkManagerInvoice[];
  vendors: ClaraVendor[];
  costCenterRules: ClaraCostCenterRule[];
  connectorConfig: ClaraConnectorConfig;
  batchLogs: ClaraBatchExportLog[];
}): Promise<{ updatedAtIso: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error(
      'Inicia sesión con tu cuenta Google de Premex para guardar el borrador de Gestión TC Clara en la nube.'
    );
  }

  await withFirestoreTimeout(user.getIdToken(), 8000, 'token de autenticación').catch(() => {});

  const cleanTransactions = params.transactions
    .slice(0, 2500)
    .map((t, i) => sanitizeTransaction(t, i));
  const cleanInvoices = params.workManagerInvoices
    .slice(0, 2500)
    .map((inv, i) => sanitizeInvoice(inv, i));
  const cleanVendors = params.vendors.slice(0, 1000).map((v, i) => sanitizeVendor(v, i));
  const cleanRules = params.costCenterRules
    .slice(0, 500)
    .map((r, i) => sanitizeCostCenterRule(r, i));
  const cleanConnector = sanitizeConnectorConfig(params.connectorConfig);
  const cleanLogs = params.batchLogs.slice(0, 200).map((b, i) => sanitizeBatchLog(b, i));

  const ownerName = String(user.displayName || user.email || 'Usuario Premex').slice(0, 120);
  const selectedPeriod = String(params.selectedPeriod || 'ALL').slice(0, 20);
  const path = `clara_workspaces/${params.docId}`;

  const saveViaRest = async (isUpdate: boolean) => {
    const idToken = await user.getIdToken();
    const fieldsMap: Record<string, unknown> = isUpdate
      ? {
          ownerName,
          title: 'Gestión TC Clara · SAP & Odoo',
          selectedPeriod,
          transactions: cleanTransactions,
          workManagerInvoices: cleanInvoices,
          vendors: cleanVendors,
          costCenterRules: cleanRules,
          connectorConfig: cleanConnector,
          batchLogs: cleanLogs,
          transactionsCount: cleanTransactions.length,
          invoicesCount: cleanInvoices.length,
          vendorsCount: cleanVendors.length,
        }
      : {
          ownerId: user.uid,
          ownerName,
          title: 'Gestión TC Clara · SAP & Odoo',
          selectedPeriod,
          transactions: cleanTransactions,
          workManagerInvoices: cleanInvoices,
          vendors: cleanVendors,
          costCenterRules: cleanRules,
          connectorConfig: cleanConnector,
          batchLogs: cleanLogs,
          transactionsCount: cleanTransactions.length,
          invoicesCount: cleanInvoices.length,
          vendorsCount: cleanVendors.length,
        };

    const firestoreFields: Record<string, unknown> = {};
    Object.entries(fieldsMap).forEach(([k, v]) => {
      firestoreFields[k] = toFirestoreValue(v);
    });

    const writeOp: Record<string, unknown> = {
      update: { name: getRestDocName(params.docId), fields: firestoreFields },
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
          'transactions',
          'workManagerInvoices',
          'vendors',
          'costCenterRules',
          'connectorConfig',
          'batchLogs',
          'transactionsCount',
          'invoicesCount',
          'vendorsCount',
        ],
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
        `Firestore (${path}): ${errBody?.error?.message || `Error HTTP ${res.status}`}`
      );
    }
    return { updatedAtIso: new Date().toISOString() };
  };

  try {
    const docRef = doc(db, 'clara_workspaces', params.docId);
    const snap = await withFirestoreTimeout(getDoc(docRef), 8500, `leer ${path}`);
    if (snap.exists()) {
      await withFirestoreTimeout(
        updateDoc(docRef, {
          ownerName,
          title: 'Gestión TC Clara · SAP & Odoo',
          selectedPeriod,
          transactions: cleanTransactions,
          workManagerInvoices: cleanInvoices,
          vendors: cleanVendors,
          costCenterRules: cleanRules,
          connectorConfig: cleanConnector,
          batchLogs: cleanLogs,
          transactionsCount: cleanTransactions.length,
          invoicesCount: cleanInvoices.length,
          vendorsCount: cleanVendors.length,
          updatedAt: serverTimestamp(),
        }),
        8500,
        `actualizar ${path}`
      );
    } else {
      await withFirestoreTimeout(
        setDoc(docRef, {
          ownerId: user.uid,
          ownerName,
          title: 'Gestión TC Clara · SAP & Odoo',
          selectedPeriod,
          transactions: cleanTransactions,
          workManagerInvoices: cleanInvoices,
          vendors: cleanVendors,
          costCenterRules: cleanRules,
          connectorConfig: cleanConnector,
          batchLogs: cleanLogs,
          transactionsCount: cleanTransactions.length,
          invoicesCount: cleanInvoices.length,
          vendorsCount: cleanVendors.length,
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
      const existing = await fetchAuthClaraViaRest(params.docId);
      return saveViaRest(Boolean(existing));
    }
    handleFirestoreError(error, OperationType.WRITE, path);
    throw error;
  }
};
