import {
  clear,
  createStore,
  del,
  get,
  keys,
  promisifyRequest,
  set,
  type UseStore,
} from "idb-keyval";

// IndexedDB is per origin, and every app on <workspace>.bitbucket.io shares
// one, so the database has the app's own name.
const DATABASE = "screenshot-editor";
const STORE = "autosave";

let store: UseStore | null | undefined;

/** The autosave store, or null where IndexedDB can't be used. */
function getStore(): UseStore | null {
  if (store !== undefined) return store;
  try {
    store =
      typeof indexedDB === "undefined" ? null : createStore(DATABASE, STORE);
  } catch {
    store = null;
  }
  return store;
}

// Every call resolves (never rejects): storage that fails (private windows,
// a full disk, blocked storage) simply turns autosave off.

export async function readValue<T>(key: string): Promise<T | undefined> {
  const db = getStore();
  if (!db) return undefined;
  try {
    return await get<T>(key, db);
  } catch {
    return undefined;
  }
}

export async function writeValue(
  key: string,
  value: unknown,
): Promise<boolean> {
  const db = getStore();
  if (!db) return false;
  try {
    await set(key, value, db);
    return true;
  } catch {
    return false;
  }
}

export async function deleteValue(key: string): Promise<boolean> {
  const db = getStore();
  if (!db) return false;
  try {
    await del(key, db);
    return true;
  } catch {
    return false;
  }
}

/** Deletes everything in the autosave store. True when there is no store: nothing is kept. */
export async function clearValues(): Promise<boolean> {
  const db = getStore();
  if (!db) return true;
  try {
    await clear(db);
    return true;
  } catch {
    return false;
  }
}

export async function listKeys(): Promise<string[] | null> {
  const db = getStore();
  if (!db) return null;
  try {
    return (await keys(db)).map(String);
  } catch {
    return null;
  }
}

/**
 * Writes every entry in one transaction and commits it straight away, for a
 * page that is being hidden or closed: started from that event, it still
 * lands when the page is gone before any reply could arrive (an ordinary
 * write waits for the page's next task, which an unload never runs). Best
 * effort: false only when there is no storage to write to.
 */
export function writeNow(entries: [string, unknown][]): boolean {
  const db = getStore();
  if (!db) return false;
  try {
    db("readwrite", (objectStore) => {
      for (const [key, value] of entries) objectStore.put(value, key);
      const { transaction } = objectStore;
      // Older browsers lack commit(); their transaction commits on its own.
      transaction.commit?.();
      return promisifyRequest(transaction);
    }).catch(() => {});
    return true;
  } catch {
    return false;
  }
}
