export interface StoredReceiptMedia {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAtIso: string;
}

const DB_NAME = 'premex_viaticos_media_v1';
const STORE_NAME = 'receipts';
const DB_VERSION = 1;

// Graceful in-memory fallback if IndexedDB is blocked in a restricted context
const memoryFallback = new Map<string, StoredReceiptMedia>();

function openMediaDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveReceiptMedia(media: StoredReceiptMedia): Promise<void> {
  memoryFallback.set(media.id, media);
  const db = await openMediaDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(media);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getReceiptMedia(id: string): Promise<StoredReceiptMedia | null> {
  if (!id) return null;
  const cached = memoryFallback.get(id);
  if (cached) return cached;

  const db = await openMediaDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
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

export async function getReceiptMediaBatch(
  ids: string[]
): Promise<Record<string, StoredReceiptMedia>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const out: Record<string, StoredReceiptMedia> = {};
  await Promise.all(
    uniqueIds.map(async (id) => {
      const item = await getReceiptMedia(id);
      if (item) out[id] = item;
    })
  );
  return out;
}

export async function deleteReceiptMedia(id: string): Promise<void> {
  if (!id) return;
  memoryFallback.delete(id);
  const db = await openMediaDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
