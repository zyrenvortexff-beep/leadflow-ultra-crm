// IndexedDB cache for WhatsApp messages.
// Goal: keep a long local history in the browser so the cloud can purge old
// messages without losing the user's view. Only NEW rows are fetched from the
// cloud on each load (delta sync by timestamp).

export interface CachedMsg {
  id: string;
  org_id: string;
  content: string | null;
  direction: "inbound" | "outbound";
  timestamp: string;
  recipient: string | null;
  status: string | null;
  error_message: string | null;
  keyword_matched: string | null;
  automation_id: string | null;
}

const DB_NAME = "leadflow-cache";
const DB_VERSION = 1;
const STORE = "messages";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("org_ts", ["org_id", "timestamp"]);
        store.createIndex("org_id", "org_id");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    Promise.resolve(fn(store)).then((value) => {
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }, reject);
  });
}

export async function loadCachedMessages(orgId: string): Promise<CachedMsg[]> {
  try {
    return await withStore("readonly", (store) => {
      return new Promise<CachedMsg[]>((resolve, reject) => {
        const idx = store.index("org_id");
        const req = idx.getAll(orgId);
        req.onsuccess = () => resolve((req.result as CachedMsg[]) ?? []);
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    return [];
  }
}

export async function saveCachedMessages(rows: CachedMsg[]): Promise<void> {
  if (!rows.length) return;
  try {
    await withStore("readwrite", (store) => {
      for (const r of rows) store.put(r);
    });
  } catch {
    /* ignore */
  }
}

export async function getLastCachedTimestamp(orgId: string): Promise<string | null> {
  const rows = await loadCachedMessages(orgId);
  if (!rows.length) return null;
  let max = rows[0].timestamp;
  for (const r of rows) if (r.timestamp > max) max = r.timestamp;
  return max;
}

// Delete all cached messages for a given org + recipient phone (digits-only).
export async function deleteCachedMessagesByRecipient(
  orgId: string,
  recipient: string,
): Promise<void> {
  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const idx = store.index("org_id");
        const req = idx.openCursor(IDBKeyRange.only(orgId));
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) { resolve(); return; }
          const v = cur.value as CachedMsg;
          const rec = String(v.recipient || "").replace(/\D/g, "");
          if (rec === recipient) cur.delete();
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    /* ignore */
  }
}

// Optional: trim local cache to N days to keep IndexedDB lean.
export async function pruneCacheOlderThanDays(orgId: string, days: number): Promise<void> {
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  try {
    await withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const idx = store.index("org_id");
        const req = idx.openCursor(IDBKeyRange.only(orgId));
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) { resolve(); return; }
          const v = cur.value as CachedMsg;
          if (v.timestamp < cutoff) cur.delete();
          cur.continue();
        };
        req.onerror = () => reject(req.error);
      });
    });
  } catch {
    /* ignore */
  }
}
