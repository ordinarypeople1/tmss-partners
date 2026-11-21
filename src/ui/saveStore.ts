/**
 * The one save slot on this device. A save is several megabytes of JSON, past the
 * 5 MB that localStorage allows, so it lives in IndexedDB. Every call fails soft:
 * without storage (a private window) the game still runs for this visit.
 *
 * This is the seam a packaged build replaces: a file in the app's data folder,
 * which Steam Cloud, iCloud or Play Games saved games can then sync.
 */
const DB = "deal-atlas";
const STORE = "saves";
const SLOT = "v5";
/** Where saves were kept before; read once so an old save is not lost. */
const LEGACY_KEY = "deal-atlas.save.v5";

let opening: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error: unknown) => {
    opening = null;
    throw error;
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return database().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = body(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

function legacy(): string | null {
  try {
    return window.localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
}

export async function readSave(): Promise<string | null> {
  try {
    const value = await run("readonly", (store) => store.get(SLOT));
    if (typeof value === "string") {
      return value;
    }
  } catch {
    // No IndexedDB: fall through.
  }
  return legacy();
}

export async function writeSave(save: string): Promise<void> {
  try {
    await run("readwrite", (store) => store.put(save, SLOT));
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Private windows refuse storage. The game still runs for this visit.
  }
}
