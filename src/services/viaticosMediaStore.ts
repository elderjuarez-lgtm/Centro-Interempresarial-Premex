import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  auth,
  db,
  activeFirebaseInfo,
  withFirestoreTimeout,
  fetchWithTimeout,
  isRecoverableFirestoreSdkError,
} from './auth';
import { handleFirestoreError, OperationType } from './reconciliationStore';

export interface StoredReceiptMedia {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAtIso: string;
  cloudSynced?: boolean;
}

const DB_NAME = 'premex_viaticos_media_v1';
const STORE_NAME = 'receipts';
const DB_VERSION = 1;
const RECEIPTS_COLLECTION = 'viaticos_receipts';
const DEFAULT_WORKSPACE_ID = 'premex-viaticos-principal';
const MAX_FIRESTORE_CHUNK_CHARS = 700_000;
const MAX_CHUNKS_PER_RECEIPT = 20;

// Graceful in-memory cache + deduplication of in-flight Firestore downloads
const memoryFallback = new Map<string, StoredReceiptMedia>();
const inFlightCloudReads = new Map<string, Promise<StoredReceiptMedia | null>>();
const inFlightCloudWrites = new Map<string, Promise<{ cloudSynced: boolean; cloudError?: string }>>();

const isValidReceiptDocId = (id: string): boolean =>
  typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveLocalReceiptMedia(media: StoredReceiptMedia): Promise<void> {
  memoryFallback.set(media.id, media);
  const database = await openMediaDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(media);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function getLocalReceiptMedia(id: string): Promise<StoredReceiptMedia | null> {
  if (!id) return null;
  const cached = memoryFallback.get(id);
  if (cached) return cached;

  const database = await openMediaDb();
  if (!database) return null;

  return new Promise((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        const result = (req.result as StoredReceiptMedia | undefined) || null;
        if (result) memoryFallback.set(id, result);
        resolve(result);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function deleteLocalReceiptMedia(id: string): Promise<void> {
  if (!id) return;
  memoryFallback.delete(id);
  const database = await openMediaDb();
  if (!database) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('IMAGE_DECODE_FAILED'));
    img.src = src;
  });
}

/**
 * Ensures raster receipt images fit cleanly inside a single Firestore document (<= 700 KB)
 * while staying crisp and legible for administrative audit & PDF compilation.
 */
async function ensureCloudSafeReceiptDataUrl(
  dataUrl: string,
  mimeType: string
): Promise<{ dataUrl: string; mimeType: string }> {
  const cleanMime = (mimeType || 'image/jpeg').toLowerCase();
  if (
    cleanMime === 'application/pdf' ||
    dataUrl.length <= MAX_FIRESTORE_CHUNK_CHARS ||
    typeof document === 'undefined'
  ) {
    return {
      dataUrl,
      mimeType: cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime,
    };
  }

  try {
    const img = await loadImageElement(dataUrl);
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;
    const attempts: { maxDim: number; quality: number }[] = [
      { maxDim: 1600, quality: 0.78 },
      { maxDim: 1350, quality: 0.72 },
      { maxDim: 1120, quality: 0.64 },
      { maxDim: 920, quality: 0.54 },
      { maxDim: 760, quality: 0.45 },
    ];

    for (const step of attempts) {
      let width = srcW;
      let height = srcH;
      if (width > step.maxDim || height > step.maxDim) {
        const ratio = Math.min(step.maxDim / width, step.maxDim / height);
        width = Math.max(1, Math.round(width * ratio));
        height = Math.max(1, Math.round(height * ratio));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const encoded = canvas.toDataURL('image/jpeg', step.quality);
      if (encoded.length <= MAX_FIRESTORE_CHUNK_CHARS) {
        return { dataUrl: encoded, mimeType: 'image/jpeg' };
      }
    }
  } catch {
    // Fall back to deterministic chunking if browser cannot re-encode
  }

  return {
    dataUrl,
    mimeType: cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime,
  };
}

const getRestBaseUrl = () => {
  const { projectId, databaseId } = activeFirebaseInfo;
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}`;
};

const toFirestoreValue = (val: unknown): unknown => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
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
  return undefined;
};

interface ReceiptDocData {
  id: string;
  parentReceiptId: string;
  chunkIndex: number;
  chunkCount: number;
  workspaceId: string;
  ownerId: string;
  ownerName?: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAtIso: string;
}

async function fetchReceiptDocViaRest(docId: string): Promise<ReceiptDocData | null> {
  const user = auth.currentUser;
  if (!user || !isValidReceiptDocId(docId)) return null;
  const idToken = await user.getIdToken();
  const url = `${getRestBaseUrl()}/documents/${RECEIPTS_COLLECTION}/${encodeURIComponent(
    docId
  )}?key=${encodeURIComponent(activeFirebaseInfo.apiKey)}`;
  const res = await fetchWithTimeout(
    url,
    { headers: { Authorization: `Bearer ${idToken}` } },
    12000
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `Error HTTP ${res.status}`);
  }
  const raw = await res.json();
  const fields: Record<string, any> = {};
  Object.entries(raw.fields || {}).forEach(([k, v]) => {
    fields[k] = fromFirestoreValue(v as Record<string, any>);
  });
  if (!fields.dataUrl) return null;
  return {
    id: String(fields.id || docId),
    parentReceiptId: String(fields.parentReceiptId || docId),
    chunkIndex: Number(fields.chunkIndex || 0),
    chunkCount: Math.max(1, Number(fields.chunkCount || 1)),
    workspaceId: String(fields.workspaceId || DEFAULT_WORKSPACE_ID),
    ownerId: String(fields.ownerId || ''),
    ownerName: fields.ownerName ? String(fields.ownerName) : undefined,
    fileName: String(fields.fileName || 'comprobante'),
    mimeType: String(fields.mimeType || 'image/jpeg'),
    size: Number(fields.size || 0),
    dataUrl: String(fields.dataUrl || ''),
    createdAtIso: String(fields.createdAtIso || new Date().toISOString()),
  };
}

async function fetchSingleReceiptDoc(docId: string): Promise<ReceiptDocData | null> {
  if (!isValidReceiptDocId(docId)) return null;
  const path = `${RECEIPTS_COLLECTION}/${docId}`;
  try {
    const ref = doc(db, RECEIPTS_COLLECTION, docId);
    const snap = await withFirestoreTimeout(getDoc(ref), 9000, path);
    if (!snap.exists()) return null;
    const d = snap.data();
    if (!d?.dataUrl) return null;
    return {
      id: String(d.id || docId),
      parentReceiptId: String(d.parentReceiptId || docId),
      chunkIndex: Number(d.chunkIndex || 0),
      chunkCount: Math.max(1, Number(d.chunkCount || 1)),
      workspaceId: String(d.workspaceId || DEFAULT_WORKSPACE_ID),
      ownerId: String(d.ownerId || ''),
      ownerName: d.ownerName ? String(d.ownerName) : undefined,
      fileName: String(d.fileName || 'comprobante'),
      mimeType: String(d.mimeType || 'image/jpeg'),
      size: Number(d.size || 0),
      dataUrl: String(d.dataUrl || ''),
      createdAtIso: String(d.createdAtIso || new Date().toISOString()),
    };
  } catch (error) {
    if (isRecoverableFirestoreSdkError(error)) {
      return await fetchReceiptDocViaRest(docId);
    }
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

async function writeSingleReceiptDoc(params: {
  docId: string;
  parentReceiptId: string;
  chunkIndex: number;
  chunkCount: number;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAtIso: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sesión no iniciada para sincronizar comprobante.');
  }
  if (!isValidReceiptDocId(params.docId) || !isValidReceiptDocId(params.parentReceiptId)) {
    throw new Error('Identificador de comprobante inválido.');
  }

  const path = `${RECEIPTS_COLLECTION}/${params.docId}`;
  const ownerName = String(user.displayName || user.email || 'Usuario').slice(0, 120);
  const safeFileName = String(params.fileName || 'comprobante').slice(0, 200);
  const safeMime = String(params.mimeType || 'image/jpeg').slice(0, 80);
  const safeSize = Math.max(0, Math.min(20_000_000, Math.round(Number(params.size) || 0)));
  const safeCreatedIso = String(params.createdAtIso || new Date().toISOString()).slice(0, 60);
  const safeWorkspaceId = isValidReceiptDocId(params.workspaceId)
    ? params.workspaceId
    : DEFAULT_WORKSPACE_ID;

  const mutableFields = {
    ownerName,
    fileName: safeFileName,
    mimeType: safeMime,
    size: safeSize,
    chunkIndex: params.chunkIndex,
    chunkCount: params.chunkCount,
    workspaceId: safeWorkspaceId,
    dataUrl: params.dataUrl,
  };

  try {
    const ref = doc(db, RECEIPTS_COLLECTION, params.docId);
    const snap = await withFirestoreTimeout(getDoc(ref), 8500, path);
    if (snap.exists()) {
      await withFirestoreTimeout(
        updateDoc(ref, {
          ...mutableFields,
          updatedAt: serverTimestamp(),
        }),
        12000,
        path
      );
    } else {
      await withFirestoreTimeout(
        setDoc(ref, {
          id: params.docId,
          parentReceiptId: params.parentReceiptId,
          ownerId: user.uid,
          createdAtIso: safeCreatedIso,
          ...mutableFields,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        12000,
        path
      );
    }
  } catch (error) {
    if (isRecoverableFirestoreSdkError(error)) {
      const existing = await fetchReceiptDocViaRest(params.docId).catch(() => null);
      const isUpdate = Boolean(existing);
      const idToken = await user.getIdToken();
      const rawFields: Record<string, unknown> = isUpdate
        ? mutableFields
        : {
            id: params.docId,
            parentReceiptId: params.parentReceiptId,
            ownerId: user.uid,
            createdAtIso: safeCreatedIso,
            ...mutableFields,
          };

      const firestoreFields: Record<string, unknown> = {};
      Object.entries(rawFields).forEach(([k, v]) => {
        firestoreFields[k] = toFirestoreValue(v);
      });

      const { projectId, databaseId } = activeFirebaseInfo;
      const docName = `projects/${projectId}/databases/${databaseId}/documents/${RECEIPTS_COLLECTION}/${params.docId}`;
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
            'fileName',
            'mimeType',
            'size',
            'chunkIndex',
            'chunkCount',
            'workspaceId',
            'dataUrl',
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
        15000
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Error HTTP ${res.status} en ${path}`);
      }
    } else {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }
}

export async function uploadReceiptMediaToCloud(
  media: StoredReceiptMedia,
  workspaceId = DEFAULT_WORKSPACE_ID
): Promise<{ cloudSynced: boolean; cloudError?: string; media: StoredReceiptMedia }> {
  if (!auth.currentUser || !isValidReceiptDocId(media.id)) {
    return { cloudSynced: false, media };
  }

  const existingWrite = inFlightCloudWrites.get(media.id);
  if (existingWrite) {
    const res = await existingWrite;
    return { ...res, media: memoryFallback.get(media.id) || media };
  }

  const task = (async (): Promise<{ cloudSynced: boolean; cloudError?: string }> => {
    try {
      const prepared = await ensureCloudSafeReceiptDataUrl(media.dataUrl, media.mimeType);
      const fullDataUrl = prepared.dataUrl;
      const chunks: string[] = [];
      for (let offset = 0; offset < fullDataUrl.length; offset += MAX_FIRESTORE_CHUNK_CHARS) {
        chunks.push(fullDataUrl.slice(offset, offset + MAX_FIRESTORE_CHUNK_CHARS));
      }
      if (chunks.length === 0) {
        return { cloudSynced: false, cloudError: 'El comprobante está vacío.' };
      }
      if (chunks.length > MAX_CHUNKS_PER_RECEIPT) {
        return {
          cloudSynced: false,
          cloudError:
            'El archivo PDF excede el tamaño máximo de respaldo en la nube (~10 MB). Comprímelo para compartirlo entre usuarios.',
        };
      }

      for (let i = 0; i < chunks.length; i++) {
        const chunkDocId = i === 0 ? media.id : `${media.id}__c${i}`;
        await writeSingleReceiptDoc({
          docId: chunkDocId,
          parentReceiptId: media.id,
          chunkIndex: i,
          chunkCount: chunks.length,
          workspaceId,
          fileName: media.fileName,
          mimeType: prepared.mimeType,
          size: media.size,
          dataUrl: chunks[i],
          createdAtIso: media.createdAtIso,
        });
      }

      const syncedRecord: StoredReceiptMedia = {
        ...media,
        mimeType: prepared.mimeType,
        dataUrl: fullDataUrl,
        cloudSynced: true,
      };
      await saveLocalReceiptMedia(syncedRecord);
      return { cloudSynced: true };
    } catch (err: any) {
      const message =
        err instanceof Error ? err.message : 'No se pudo respaldar la factura escaneada en la nube.';
      return { cloudSynced: false, cloudError: message };
    } finally {
      inFlightCloudWrites.delete(media.id);
    }
  })();

  inFlightCloudWrites.set(media.id, task);
  const res = await task;
  return { ...res, media: memoryFallback.get(media.id) || media };
}

export async function fetchReceiptMediaFromCloud(
  id: string
): Promise<StoredReceiptMedia | null> {
  if (!id || !isValidReceiptDocId(id) || !auth.currentUser) return null;

  const existingRead = inFlightCloudReads.get(id);
  if (existingRead) return existingRead;

  const task = (async (): Promise<StoredReceiptMedia | null> => {
    try {
      const head = await fetchSingleReceiptDoc(id);
      if (!head) return null;

      let fullDataUrl = head.dataUrl;
      if (head.chunkCount > 1) {
        const chunkPromises: Promise<ReceiptDocData | null>[] = [];
        for (let i = 1; i < head.chunkCount; i++) {
          chunkPromises.push(fetchSingleReceiptDoc(`${id}__c${i}`));
        }
        const chunkDocs = await Promise.all(chunkPromises);
        if (chunkDocs.some((c) => !c || !c.dataUrl)) {
          return null;
        }
        fullDataUrl = [head.dataUrl, ...chunkDocs.map((c) => c!.dataUrl)].join('');
      }

      const hydrated: StoredReceiptMedia = {
        id: head.parentReceiptId || id,
        fileName: head.fileName,
        mimeType: head.mimeType,
        size: head.size,
        dataUrl: fullDataUrl,
        createdAtIso: head.createdAtIso,
        cloudSynced: true,
      };
      await saveLocalReceiptMedia(hydrated);
      return hydrated;
    } catch (err) {
      console.warn('No se pudo descargar comprobante desde Firestore:', err);
      return null;
    } finally {
      inFlightCloudReads.delete(id);
    }
  })();

  inFlightCloudReads.set(id, task);
  return task;
}

export async function saveReceiptMedia(
  media: StoredReceiptMedia,
  options?: { syncToCloud?: boolean; workspaceId?: string }
): Promise<{ cloudSynced: boolean; cloudError?: string; media: StoredReceiptMedia }> {
  await saveLocalReceiptMedia(media);
  if (options?.syncToCloud === false || !auth.currentUser) {
    return { cloudSynced: Boolean(media.cloudSynced), media };
  }
  return uploadReceiptMediaToCloud(media, options?.workspaceId || DEFAULT_WORKSPACE_ID);
}

export async function getReceiptMedia(
  id: string,
  options?: { skipCloud?: boolean }
): Promise<StoredReceiptMedia | null> {
  if (!id) return null;
  const local = await getLocalReceiptMedia(id);
  if (local) return local;
  if (options?.skipCloud || !auth.currentUser) return null;
  return fetchReceiptMediaFromCloud(id);
}

export async function getReceiptMediaBatch(
  ids: string[]
): Promise<Record<string, StoredReceiptMedia>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const out: Record<string, StoredReceiptMedia> = {};
  const missingIds: string[] = [];

  await Promise.all(
    uniqueIds.map(async (id) => {
      const local = await getLocalReceiptMedia(id);
      if (local) {
        out[id] = local;
      } else {
        missingIds.push(id);
      }
    })
  );

  if (missingIds.length > 0 && auth.currentUser) {
    const CONCURRENCY = 5;
    for (let i = 0; i < missingIds.length; i += CONCURRENCY) {
      const slice = missingIds.slice(i, i + CONCURRENCY);
      const fetched = await Promise.all(slice.map((id) => fetchReceiptMediaFromCloud(id)));
      fetched.forEach((item, idx) => {
        if (item) {
          out[slice[idx]] = item;
        }
      });
    }
  }

  return out;
}

/**
 * Ensures any locally scanned receipts present in IndexedDB (including legacy ones
 * scanned before cloud receipt sync) are automatically backed up to Firestore.
 */
export async function syncLocalReceiptsToCloud(ids: string[]): Promise<number> {
  if (!auth.currentUser || ids.length === 0) return 0;
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  let uploadedCount = 0;

  for (const id of uniqueIds) {
    const local = await getLocalReceiptMedia(id);
    if (local && !local.cloudSynced) {
      const res = await uploadReceiptMediaToCloud(local);
      if (res.cloudSynced) uploadedCount += 1;
    }
  }
  return uploadedCount;
}

export async function deleteReceiptMedia(id: string): Promise<void> {
  if (!id) return;
  await deleteLocalReceiptMedia(id);

  if (!auth.currentUser || !isValidReceiptDocId(id)) return;
  const path = `${RECEIPTS_COLLECTION}/${id}`;
  try {
    const headRef = doc(db, RECEIPTS_COLLECTION, id);
    const snap = await withFirestoreTimeout(getDoc(headRef), 6000, path).catch(() => null);
    const chunkCount = snap?.exists() ? Math.max(1, Number(snap.data()?.chunkCount || 1)) : 1;
    await deleteDoc(headRef).catch(() => {});
    for (let i = 1; i < chunkCount; i++) {
      await deleteDoc(doc(db, RECEIPTS_COLLECTION, `${id}__c${i}`)).catch(() => {});
    }
  } catch {
    // Non-fatal if user is deleting an item whose receipt was already cleaned up
  }
}
