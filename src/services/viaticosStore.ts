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
  OdooCostCenterEntry,
  OdooDocTypeEntry,
  OdooEmployeeEntry,
  OdooExpenseCodeEntry,
  OdooExpenseDistributionEntry,
  OdooTaxIndicatorEntry,
  ViaticoConsultor,
  ViaticoEmailGroup,
  ViaticoEmailMember,
  ViaticoExpenseItem,
  ViaticoLiquidation,
  ViaticoOdooCatalogs,
} from '../types';
import {
  recalculateLiquidationTotals,
  roundExchangeRate,
  roundMoney,
} from '../utils/viaticos';
import {
  formatAnalyticDistributionJson,
  mergeOdooCatalogsWithDefaults,
} from '../utils/viaticosOdooCatalogs';

export const DEFAULT_VIATICOS_DOC_ID = 'premex-viaticos-principal';

export interface SavedViaticosWorkspaceDoc {
  id: string;
  ownerId: string;
  ownerName?: string;
  title: string;
  activeLiquidationId?: string;
  consultores: ViaticoConsultor[];
  liquidaciones: ViaticoLiquidation[];
  emailGroups?: ViaticoEmailGroup[];
  odooCatalogs?: ViaticoOdooCatalogs;
  updatedAtIso?: string;
}

const sanitizeEmailMember = (m: ViaticoEmailMember, idx: number): ViaticoEmailMember => {
  const tokens = Array.from(
    new Set(
      String(m?.email || '')
        .replace(/[<>]/g, ' ')
        .split(/[,;/|\n\r\s]+/)
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.includes('@'))
    )
  );
  return {
    id: String(m?.id || `member-${Date.now()}-${idx}`).slice(0, 120),
    nombre: String(m?.nombre || '').trim().slice(0, 140),
    email: tokens.join(', ').slice(0, 2500),
  };
};

const sanitizeEmailGroup = (g: ViaticoEmailGroup, idx: number): ViaticoEmailGroup => {
  const cleanMembers = (Array.isArray(g?.miembros) ? g.miembros : [])
    .slice(0, 80)
    .map((m, mIdx) => sanitizeEmailMember(m, mIdx))
    .filter((m) => m.email.includes('@'));

  const clean: ViaticoEmailGroup = {
    id: String(g?.id || `mailgrp-${Date.now()}-${idx}`).slice(0, 120),
    nombre: String(g?.nombre || 'Lista de Correos').trim().slice(0, 140),
    tipo: g?.tipo === 'copia' ? 'copia' : 'dirigido',
    porDefecto: Boolean(g?.porDefecto),
    activo: g?.activo !== false,
    miembros: cleanMembers,
  };
  if (g?.descripcion && String(g.descripcion).trim()) {
    clean.descripcion = String(g.descripcion).trim().slice(0, 240);
  }
  return clean;
};

const sanitizeConsultor = (c: ViaticoConsultor): ViaticoConsultor => {
  const clean: ViaticoConsultor = {
    id: String(c.id || `cons-${Date.now()}`).slice(0, 120),
    nombreCompleto: String(c.nombreCompleto || 'Consultor').trim().slice(0, 140),
    email: String(c.email || '').trim().toLowerCase().slice(0, 160),
    empresa: String(c.empresa || 'Premex Corp').trim().slice(0, 140),
    cargo: c.cargo ? String(c.cargo).trim().slice(0, 120) : '',
    centroCosto: c.centroCosto ? String(c.centroCosto).trim().slice(0, 120) : '',
    monedaBase: c.monedaBase || 'Quetzales',
    activo: c.activo !== false,
  };
  if (c.odooEmployeeName) clean.odooEmployeeName = String(c.odooEmployeeName).trim().toUpperCase().slice(0, 140);
  if (c.odooAnalyticDistribution) {
    clean.odooAnalyticDistribution = formatAnalyticDistributionJson(String(c.odooAnalyticDistribution)).slice(0, 120);
  }
  if (c.permissionId) clean.permissionId = String(c.permissionId).trim().slice(0, 120);
  return clean;
};

const sanitizeExpenseItem = (i: ViaticoExpenseItem): ViaticoExpenseItem => {
  const clean: ViaticoExpenseItem = {
    id: String(i.id || `item-${Date.now()}`).slice(0, 120),
    fechaDoc: String(i.fechaDoc || '').trim().slice(0, 30),
    serieDoc: String(i.serieDoc || '').trim().slice(0, 60),
    noDoc: String(i.noDoc || '').trim().slice(0, 80),
    nit: String(i.nit || '').trim().slice(0, 40),
    proveedor: String(i.proveedor || '').trim().slice(0, 160),
    moneda: i.moneda || 'Quetzales',
    valorFactura: roundMoney(Number(i.valorFactura) || 0),
    tipoCambio: Number.isFinite(Number(i.tipoCambio)) && Number(i.tipoCambio) > 0
      ? roundExchangeRate(Number(i.tipoCambio))
      : 1,
    valorReintegrar: roundMoney(Number(i.valorReintegrar) || 0),
    categoria: i.categoria || 'Otros Gastos',
    clienteContacto: String(i.clienteContacto || '').trim().slice(0, 180),
    objetivoComercial: String(i.objetivoComercial || '').trim().slice(0, 220),
    descripcionGasto: String(i.descripcionGasto || '').trim().slice(0, 350),
    kilometraje: String(i.kilometraje || '').trim().slice(0, 60),
    aplicaImpuestos: Boolean(i.aplicaImpuestos),
    porcentajeImpuesto: roundMoney(Number(i.porcentajeImpuesto) || 0),
    montoImpuesto: roundMoney(Number(i.montoImpuesto) || 0),
    valorSinImpuesto: roundMoney(Number(i.valorSinImpuesto) || 0),
  };

  if (i.odooProductId) clean.odooProductId = String(i.odooProductId).trim().slice(0, 160);
  if (i.odooDocType) clean.odooDocType = String(i.odooDocType).trim().slice(0, 160);
  if (i.odooTaxIndicator) clean.odooTaxIndicator = String(i.odooTaxIndicator).trim().slice(0, 180);
  if (i.odooCostCenterCode) clean.odooCostCenterCode = String(i.odooCostCenterCode).trim().slice(0, 140);
  if (i.odooAnalyticDistribution) {
    clean.odooAnalyticDistribution = formatAnalyticDistributionJson(String(i.odooAnalyticDistribution)).slice(0, 120);
  }
  if (i.odooExpenseType === 'Gasto' || i.odooExpenseType === 'Tarjeta') {
    clean.odooExpenseType = i.odooExpenseType;
  }
  if (i.odooJournal) clean.odooJournal = String(i.odooJournal).trim().slice(0, 120);
  if (i.odooPaymentReference) clean.odooPaymentReference = String(i.odooPaymentReference).trim().slice(0, 180);
  if (i.odooDistributionOptionId && String(i.odooDistributionOptionId).trim()) {
    clean.odooDistributionOptionId = String(i.odooDistributionOptionId).trim().slice(0, 120);
  }
  if (typeof i.odooDistributionValue === 'number' && Number.isFinite(i.odooDistributionValue) && i.odooDistributionValue > 0) {
    clean.odooDistributionValue = roundMoney(i.odooDistributionValue);
  }
  if (typeof i.odooSplitCount === 'number' && Number.isFinite(i.odooSplitCount) && i.odooSplitCount >= 2) {
    clean.odooSplitCount = Math.max(2, Math.min(30, Math.floor(i.odooSplitCount)));
  }
  if (i.odooSplitCostCentersText && String(i.odooSplitCostCentersText).trim()) {
    clean.odooSplitCostCentersText = String(i.odooSplitCostCentersText).trim().slice(0, 600);
  }
  if (Array.isArray(i.odooSplitCostCenters) && i.odooSplitCostCenters.length > 0) {
    clean.odooSplitCostCenters = i.odooSplitCostCenters
      .map((c) => String(c || '').trim().slice(0, 120))
      .filter(Boolean)
      .slice(0, 30);
  }
  if (typeof i.splitByEmployeesCount === 'number' && Number.isFinite(i.splitByEmployeesCount) && i.splitByEmployeesCount >= 2) {
    clean.splitByEmployeesCount = Math.max(2, Math.min(30, Math.floor(i.splitByEmployeesCount)));
  }
  if (Array.isArray(i.splitEmployeeNames) && i.splitEmployeeNames.length > 0) {
    clean.splitEmployeeNames = i.splitEmployeeNames
      .map((n) => String(n || '').trim().toUpperCase().slice(0, 160))
      .filter(Boolean)
      .slice(0, 30);
  }
  if (i.registeredByEmail) clean.registeredByEmail = String(i.registeredByEmail).trim().toLowerCase().slice(0, 160);
  if (i.registeredByName) clean.registeredByName = String(i.registeredByName).trim().slice(0, 140);
  if (i.updatedAtIso) clean.updatedAtIso = String(i.updatedAtIso).trim().slice(0, 60);

  if (i.attachmentId) clean.attachmentId = String(i.attachmentId).slice(0, 120);
  if (i.attachmentName) clean.attachmentName = String(i.attachmentName).slice(0, 160);
  if (i.attachmentMimeType) clean.attachmentMimeType = String(i.attachmentMimeType).slice(0, 80);
  if (typeof i.attachmentSize === 'number') clean.attachmentSize = Math.max(0, Math.round(i.attachmentSize));
  if (i.extractedByAi) clean.extractedByAi = true;
  if (i.extractionConfidence) clean.extractionConfidence = i.extractionConfidence;
  if (i.extractionNotes) clean.extractionNotes = String(i.extractionNotes).slice(0, 250);
  return clean;
};

const sanitizeOdooCatalogs = (raw: unknown): ViaticoOdooCatalogs | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const src = raw as Partial<ViaticoOdooCatalogs>;
  const merged = mergeOdooCatalogsWithDefaults({
    defaultJournalName: src.defaultJournalName
      ? String(src.defaultJournalName).trim().slice(0, 120)
      : undefined,
    defaultExpenseType: src.defaultExpenseType === 'Tarjeta' ? 'Tarjeta' : 'Gasto',
    docTypes: Array.isArray(src.docTypes)
      ? src.docTypes.slice(0, 150).map((d: OdooDocTypeEntry, idx) => ({
          id: String(d?.id || `doct-${idx}`).slice(0, 100),
          codigo: String(d?.codigo || '').trim().toUpperCase().slice(0, 30),
          nombre: String(d?.nombre || '').trim().slice(0, 140),
          labelOdoo: String(d?.labelOdoo || '').trim().slice(0, 160),
          activo: d?.activo !== false,
          ...(d?.isCustom ? { isCustom: true } : {}),
          ...(d?.updatedByEmail ? { updatedByEmail: String(d.updatedByEmail).trim().toLowerCase().slice(0, 160) } : {}),
          ...(d?.updatedByName ? { updatedByName: String(d.updatedByName).trim().slice(0, 140) } : {}),
          ...(d?.updatedAtIso ? { updatedAtIso: String(d.updatedAtIso).slice(0, 60) } : {}),
        }))
      : undefined,
    employees: Array.isArray(src.employees)
      ? src.employees.slice(0, 300).map((e: OdooEmployeeEntry, idx) => ({
          id: String(e?.id || `emp-${idx}`).slice(0, 100),
          nombreCompleto: String(e?.nombreCompleto || '').trim().toUpperCase().slice(0, 160),
          ...(e?.email ? { email: String(e.email).trim().toLowerCase().slice(0, 160) } : {}),
          ...(e?.permissionDocId ? { permissionDocId: String(e.permissionDocId).slice(0, 140) } : {}),
          ...(e?.centroCosto ? { centroCosto: String(e.centroCosto).trim().slice(0, 140) } : {}),
          ...(e?.analyticDistribution ? { analyticDistribution: formatAnalyticDistributionJson(String(e.analyticDistribution)).slice(0, 120) } : {}),
          ...(e?.empresa ? { empresa: String(e.empresa).trim().slice(0, 140) } : {}),
          activo: e?.activo !== false,
          ...(e?.isCustom ? { isCustom: true } : {}),
          ...(e?.updatedByEmail ? { updatedByEmail: String(e.updatedByEmail).trim().toLowerCase().slice(0, 160) } : {}),
          ...(e?.updatedByName ? { updatedByName: String(e.updatedByName).trim().slice(0, 140) } : {}),
          ...(e?.updatedAtIso ? { updatedAtIso: String(e.updatedAtIso).slice(0, 60) } : {}),
        }))
      : undefined,
    expenseCodes: Array.isArray(src.expenseCodes)
      ? src.expenseCodes.slice(0, 250).map((c: OdooExpenseCodeEntry, idx) => ({
          id: String(c?.id || `exp-${idx}`).slice(0, 100),
          codigo: String(c?.codigo || '').trim().slice(0, 40),
          nombre: String(c?.nombre || '').trim().toUpperCase().slice(0, 140),
          labelOdoo: String(c?.labelOdoo || '').trim().slice(0, 180),
          ...(c?.categoriaVinculada ? { categoriaVinculada: c.categoriaVinculada } : {}),
          activo: c?.activo !== false,
          ...(c?.isCustom ? { isCustom: true } : {}),
          ...(c?.updatedByEmail ? { updatedByEmail: String(c.updatedByEmail).trim().toLowerCase().slice(0, 160) } : {}),
          ...(c?.updatedByName ? { updatedByName: String(c.updatedByName).trim().slice(0, 140) } : {}),
          ...(c?.updatedAtIso ? { updatedAtIso: String(c.updatedAtIso).slice(0, 60) } : {}),
        }))
      : undefined,
    costCenters: Array.isArray(src.costCenters)
      ? src.costCenters.slice(0, 300).map((cc: OdooCostCenterEntry, idx) => ({
          id: String(cc?.id || `cc-${idx}`).slice(0, 100),
          codigo: String(cc?.codigo || '').trim().toUpperCase().slice(0, 60),
          cuentaAnalitica: String(cc?.cuentaAnalitica || '').trim().toUpperCase().slice(0, 160),
          odooAnalyticId: String(cc?.odooAnalyticId || '').trim().slice(0, 40),
          analyticDistribution: formatAnalyticDistributionJson(String(cc?.analyticDistribution || cc?.odooAnalyticId || '')).slice(0, 120),
          activo: cc?.activo !== false,
          ...(cc?.isCustom ? { isCustom: true } : {}),
          ...(cc?.updatedByEmail ? { updatedByEmail: String(cc.updatedByEmail).trim().toLowerCase().slice(0, 160) } : {}),
          ...(cc?.updatedByName ? { updatedByName: String(cc.updatedByName).trim().slice(0, 140) } : {}),
          ...(cc?.updatedAtIso ? { updatedAtIso: String(cc.updatedAtIso).slice(0, 60) } : {}),
        }))
      : undefined,
    taxIndicators: Array.isArray(src.taxIndicators)
      ? src.taxIndicators.slice(0, 80).map((t: OdooTaxIndicatorEntry, idx) => ({
          id: String(t?.id || `tax-${idx}`).slice(0, 100),
          codigo: String(t?.codigo || '').trim().toUpperCase().slice(0, 30),
          nombreImpuesto: String(t?.nombreImpuesto || '').trim().slice(0, 180),
          validezFiscal: String(t?.validezFiscal || '').trim().slice(0, 80),
          etiquetaFactura: String(t?.etiquetaFactura || '').trim().slice(0, 60),
          tipoImpuesto: String(t?.tipoImpuesto || 'Compras').trim().slice(0, 60),
          porcentaje: roundMoney(Number(t?.porcentaje) || 0),
          activo: t?.activo !== false,
          ...(t?.isCustom ? { isCustom: true } : {}),
          ...(t?.updatedByEmail ? { updatedByEmail: String(t.updatedByEmail).trim().toLowerCase().slice(0, 160) } : {}),
          ...(t?.updatedByName ? { updatedByName: String(t.updatedByName).trim().slice(0, 140) } : {}),
          ...(t?.updatedAtIso ? { updatedAtIso: String(t.updatedAtIso).slice(0, 60) } : {}),
        }))
      : undefined,
    expenseDistributions: Array.isArray(src.expenseDistributions)
      ? src.expenseDistributions.slice(0, 100).map((d: OdooExpenseDistributionEntry, idx) => ({
          id: String(d?.id || `dist-${idx}`).slice(0, 100),
          codigo: String(d?.codigo || '').trim().toUpperCase().slice(0, 40),
          nombre: String(d?.nombre || '').trim().slice(0, 140),
          mode: d?.mode === 'multi_ceco' ? 'multi_ceco' : 'extra_charge',
          naturaleza: d?.naturaleza === 'bien' ? 'bien' : 'servicio',
          expenseCodeLabel: String(d?.expenseCodeLabel || '').trim().slice(0, 180),
          taxIndicatorName: String(d?.taxIndicatorName || '').trim().slice(0, 180),
          activo: d?.activo !== false,
          ...(d?.isCustom ? { isCustom: true } : {}),
          ...(d?.updatedByEmail ? { updatedByEmail: String(d.updatedByEmail).trim().toLowerCase().slice(0, 160) } : {}),
          ...(d?.updatedByName ? { updatedByName: String(d.updatedByName).trim().slice(0, 140) } : {}),
          ...(d?.updatedAtIso ? { updatedAtIso: String(d.updatedAtIso).slice(0, 60) } : {}),
        }))
      : undefined,
    updatedByEmail: src.updatedByEmail ? String(src.updatedByEmail).trim().toLowerCase().slice(0, 160) : undefined,
    updatedByName: src.updatedByName ? String(src.updatedByName).trim().slice(0, 140) : undefined,
    updatedAtIso: src.updatedAtIso ? String(src.updatedAtIso).slice(0, 60) : undefined,
  });
  return merged;
};

const sanitizeLiquidation = (l: ViaticoLiquidation): ViaticoLiquidation => {
  const cleanItems = (Array.isArray(l.items) ? l.items : [])
    .slice(0, 300)
    .map(sanitizeExpenseItem);

  const base: ViaticoLiquidation = {
    id: String(l.id || `liq-${Date.now()}`).slice(0, 120),
    lineaLiquidacion: String(l.lineaLiquidacion || 'Liquidación de Viáticos')
      .trim()
      .slice(0, 180),
    semana: String(l.semana || '').trim().slice(0, 30),
    consultorId: String(l.consultorId || '').slice(0, 120),
    consultorNombre: String(l.consultorNombre || 'Consultor').trim().slice(0, 140),
    consultorEmail: String(l.consultorEmail || '').trim().toLowerCase().slice(0, 160),
    empresa: String(l.empresa || 'Premex Corp').trim().slice(0, 140),
    monedaBase: l.monedaBase || 'Quetzales',
    estado:
      l.estado === 'cerrada' || l.estado === 'enviada' ? l.estado : 'borrador',
    items: cleanItems,
    totalLiquidacion: 0,
    totalConImpuestos: 0,
    totalSinImpuestos: 0,
    totalImpuestos: 0,
    createdAtIso: String(l.createdAtIso || new Date().toISOString()).slice(0, 60),
    updatedAtIso: String(l.updatedAtIso || new Date().toISOString()).slice(0, 60),
  };

  if (
    l.monedaBase === 'Dólares' &&
    Number.isFinite(Number(l.tipoCambioLiquidacion)) &&
    Number(l.tipoCambioLiquidacion) > 0
  ) {
    base.tipoCambioLiquidacion = roundExchangeRate(Number(l.tipoCambioLiquidacion));
  }
  if (l.centroCosto) base.centroCosto = String(l.centroCosto).trim().slice(0, 120);
  if (l.odooEmployeeName) base.odooEmployeeName = String(l.odooEmployeeName).trim().toUpperCase().slice(0, 140);
  if (l.odooAnalyticDistribution) {
    base.odooAnalyticDistribution = formatAnalyticDistributionJson(String(l.odooAnalyticDistribution)).slice(0, 120);
  }
  if (l.closedAtIso) base.closedAtIso = String(l.closedAtIso).slice(0, 60);
  if (l.closedBy) base.closedBy = String(l.closedBy).slice(0, 160);
  if (l.sentAtIso) base.sentAtIso = String(l.sentAtIso).slice(0, 60);
  if (l.sentToEmail) base.sentToEmail = String(l.sentToEmail).slice(0, 200);
  if (l.notas) base.notas = String(l.notas).slice(0, 400);
  if (typeof l.contabilizada === 'boolean') base.contabilizada = l.contabilizada;
  if (l.contabilizadaAtIso) base.contabilizadaAtIso = String(l.contabilizadaAtIso).slice(0, 60);
  if (l.contabilizadaPorEmail) {
    base.contabilizadaPorEmail = String(l.contabilizadaPorEmail).trim().toLowerCase().slice(0, 160);
  }
  if (l.contabilizadaPorNombre) {
    base.contabilizadaPorNombre = String(l.contabilizadaPorNombre).trim().slice(0, 140);
  }
  if (
    Number.isFinite(Number(l.contabilizadaDescargasCount)) &&
    Number(l.contabilizadaDescargasCount) >= 0
  ) {
    base.contabilizadaDescargasCount = Math.min(
      9999,
      Math.floor(Number(l.contabilizadaDescargasCount))
    );
  }
  if (
    l.odooSyncStatus === 'pendiente' ||
    l.odooSyncStatus === 'preparado' ||
    l.odooSyncStatus === 'contabilizado_api' ||
    l.odooSyncStatus === 'error'
  ) {
    base.odooSyncStatus = l.odooSyncStatus;
  }
  if (Array.isArray(l.odooExpenseIds) && l.odooExpenseIds.length > 0) {
    const cleanIds = l.odooExpenseIds
      .map((id) => Math.floor(Number(id)))
      .filter((id) => Number.isFinite(id) && id > 0)
      .slice(0, 500);
    if (cleanIds.length > 0) base.odooExpenseIds = cleanIds;
  }
  if (Number.isFinite(Number(l.odooExpenseSheetId)) && Number(l.odooExpenseSheetId) > 0) {
    base.odooExpenseSheetId = Math.floor(Number(l.odooExpenseSheetId));
  }
  if (l.odooLastSyncAtIso) {
    base.odooLastSyncAtIso = String(l.odooLastSyncAtIso).slice(0, 60);
  }
  if (l.odooLastSyncMessage) {
    base.odooLastSyncMessage = String(l.odooLastSyncMessage).trim().slice(0, 320);
  }

  return recalculateLiquidationTotals(base);
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

const fetchAuthViaticosViaRest = async (
  docId: string
): Promise<SavedViaticosWorkspaceDoc | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/viaticos_workspaces/${encodeURIComponent(
    docId
  )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetchWithTimeout(
    url,
    {
      headers: { Authorization: `Bearer ${idToken}` },
    },
    10000
  );
  if (!res.ok) return null;
  const raw = await res.json();
  const fields: Record<string, any> = {};
  Object.entries(raw.fields || {}).forEach(([k, v]) => {
    fields[k] = fromFirestoreValue(v as Record<string, any>);
  });
  return {
    id: docId,
    ownerId: String(fields.ownerId || ''),
    ownerName: fields.ownerName ? String(fields.ownerName) : undefined,
    title: String(fields.title || 'Liquidación de Viáticos Premex'),
    activeLiquidationId: fields.activeLiquidationId
      ? String(fields.activeLiquidationId)
      : undefined,
    consultores: Array.isArray(fields.consultores)
      ? fields.consultores.map(sanitizeConsultor)
      : [],
    liquidaciones: Array.isArray(fields.liquidaciones)
      ? fields.liquidaciones.map(sanitizeLiquidation)
      : [],
    emailGroups: Array.isArray(fields.emailGroups)
      ? fields.emailGroups.map((g: ViaticoEmailGroup, idx: number) =>
          sanitizeEmailGroup(g, idx)
        )
      : undefined,
    odooCatalogs: sanitizeOdooCatalogs(fields.odooCatalogs),
    updatedAtIso: fields.updatedAt ? String(fields.updatedAt) : undefined,
  };
};

export const subscribeToViaticosWorkspace = (
  docId: string,
  onData: (saved: SavedViaticosWorkspaceDoc | null) => void,
  onError?: (err: unknown) => void
) => {
  const safeId = /^[a-zA-Z0-9_-]{1,128}$/.test(docId) ? docId : DEFAULT_VIATICOS_DOC_ID;
  const path = `viaticos_workspaces/${safeId}`;
  const ref = doc(db, 'viaticos_workspaces', safeId);
  let isActive = true;

  fetchAuthViaticosViaRest(safeId)
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
      const data = snapshot.data();
      onData({
        id: snapshot.id,
        ownerId: String(data.ownerId || ''),
        ownerName: data.ownerName ? String(data.ownerName) : undefined,
        title: String(data.title || 'Liquidación de Viáticos Premex'),
        activeLiquidationId: data.activeLiquidationId
          ? String(data.activeLiquidationId)
          : undefined,
        consultores: Array.isArray(data.consultores)
          ? data.consultores.map(sanitizeConsultor)
          : [],
        liquidaciones: Array.isArray(data.liquidaciones)
          ? data.liquidaciones.map(sanitizeLiquidation)
          : [],
        emailGroups: Array.isArray(data.emailGroups)
          ? data.emailGroups.map((g: ViaticoEmailGroup, idx: number) =>
              sanitizeEmailGroup(g, idx)
            )
          : undefined,
        odooCatalogs: sanitizeOdooCatalogs(data.odooCatalogs),
        updatedAtIso:
          data.updatedAt instanceof Timestamp
            ? data.updatedAt.toDate().toISOString()
            : undefined,
      });
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

export const saveViaticosWorkspaceToCloud = async (params: {
  targetId?: string;
  title: string;
  activeLiquidationId?: string;
  consultores: ViaticoConsultor[];
  liquidaciones: ViaticoLiquidation[];
  emailGroups?: ViaticoEmailGroup[];
  odooCatalogs?: ViaticoOdooCatalogs;
}): Promise<{ id: string; updatedAtIso: string }> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Inicia sesión con tu cuenta de Google para guardar la liquidación en la nube.');
  }

  await user.getIdToken().catch(() => {});

  const docId =
    params.targetId && /^[a-zA-Z0-9_-]{1,128}$/.test(params.targetId)
      ? params.targetId
      : DEFAULT_VIATICOS_DOC_ID;
  const path = `viaticos_workspaces/${docId}`;
  const cleanConsultores = params.consultores.slice(0, 200).map(sanitizeConsultor);
  const cleanLiquidaciones = params.liquidaciones.slice(0, 500).map(sanitizeLiquidation);
  const cleanEmailGroups = (params.emailGroups || [])
    .slice(0, 100)
    .map((g, idx) => sanitizeEmailGroup(g, idx));
  const cleanOdooCatalogs = sanitizeOdooCatalogs(params.odooCatalogs);
  const safeTitle = String(params.title || 'Liquidación de Viáticos Premex')
    .trim()
    .slice(0, 150);
  const ownerName = String(user.displayName || user.email || 'Usuario').slice(0, 120);
  const activeLiqId = String(params.activeLiquidationId || '').slice(0, 128);

  const updateFields: Record<string, unknown> = {
    ownerName,
    title: safeTitle,
    activeLiquidationId: activeLiqId,
    consultores: cleanConsultores,
    liquidaciones: cleanLiquidaciones,
    emailGroups: cleanEmailGroups,
    consultoresCount: cleanConsultores.length,
    liquidacionesCount: cleanLiquidaciones.length,
  };
  if (cleanOdooCatalogs) {
    updateFields.odooCatalogs = cleanOdooCatalogs;
  }

  try {
    const ref = doc(db, 'viaticos_workspaces', docId);
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
      const existing = await fetchAuthViaticosViaRest(docId);
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
      const docName = `projects/${projectId}/databases/${databaseId}/documents/viaticos_workspaces/${docId}`;

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
            'activeLiquidationId',
            'consultores',
            'liquidaciones',
            'emailGroups',
            ...(cleanOdooCatalogs ? ['odooCatalogs'] : []),
            'consultoresCount',
            'liquidacionesCount',
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
            `Error HTTP ${res.status} al guardar viáticos en la nube (${path}).`
        );
      }
    } else {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }

  return { id: docId, updatedAtIso: new Date().toISOString() };
};
