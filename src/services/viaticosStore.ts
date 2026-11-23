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
  ViaticoConsultor,
  ViaticoEmailGroup,
  ViaticoEmailMember,
  ViaticoExpenseItem,
  ViaticoLiquidation,
} from '../types';
import { recalculateLiquidationTotals, roundMoney } from '../utils/viaticos';

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
  updatedAtIso?: string;
}

const sanitizeEmailMember = (m: ViaticoEmailMember, idx: number): ViaticoEmailMember => ({
  id: String(m?.id || `member-${Date.now()}-${idx}`).slice(0, 120),
  nombre: String(m?.nombre || '').trim().slice(0, 140),
  email: String(m?.email || '').trim().toLowerCase().slice(0, 160),
});

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

const sanitizeConsultor = (c: ViaticoConsultor): ViaticoConsultor => ({
  id: String(c.id || `cons-${Date.now()}`).slice(0, 120),
  nombreCompleto: String(c.nombreCompleto || 'Consultor').trim().slice(0, 140),
  email: String(c.email || '').trim().toLowerCase().slice(0, 160),
  empresa: String(c.empresa || 'Premex Corp').trim().slice(0, 140),
  cargo: c.cargo ? String(c.cargo).trim().slice(0, 120) : '',
  centroCosto: c.centroCosto ? String(c.centroCosto).trim().slice(0, 120) : '',
  monedaBase: c.monedaBase || 'Quetzales',
  activo: c.activo !== false,
});

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
      ? roundMoney(Number(i.tipoCambio))
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

  if (i.attachmentId) clean.attachmentId = String(i.attachmentId).slice(0, 120);
  if (i.attachmentName) clean.attachmentName = String(i.attachmentName).slice(0, 160);
  if (i.attachmentMimeType) clean.attachmentMimeType = String(i.attachmentMimeType).slice(0, 80);
  if (typeof i.attachmentSize === 'number') clean.attachmentSize = Math.max(0, Math.round(i.attachmentSize));
  if (i.extractedByAi) clean.extractedByAi = true;
  if (i.extractionConfidence) clean.extractionConfidence = i.extractionConfidence;
  if (i.extractionNotes) clean.extractionNotes = String(i.extractionNotes).slice(0, 250);
  return clean;
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

  if (l.centroCosto) base.centroCosto = String(l.centroCosto).trim().slice(0, 120);
  if (l.closedAtIso) base.closedAtIso = String(l.closedAtIso).slice(0, 60);
  if (l.closedBy) base.closedBy = String(l.closedBy).slice(0, 160);
  if (l.sentAtIso) base.sentAtIso = String(l.sentAtIso).slice(0, 60);
  if (l.sentToEmail) base.sentToEmail = String(l.sentToEmail).slice(0, 200);
  if (l.notas) base.notas = String(l.notas).slice(0, 400);

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
  const safeTitle = String(params.title || 'Liquidación de Viáticos Premex')
    .trim()
    .slice(0, 150);
  const ownerName = String(user.displayName || user.email || 'Usuario').slice(0, 120);
  const activeLiqId = String(params.activeLiquidationId || '').slice(0, 128);

  const updateFields = {
    ownerName,
    title: safeTitle,
    activeLiquidationId: activeLiqId,
    consultores: cleanConsultores,
    liquidaciones: cleanLiquidaciones,
    emailGroups: cleanEmailGroups,
    consultoresCount: cleanConsultores.length,
    liquidacionesCount: cleanLiquidaciones.length,
  };

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
