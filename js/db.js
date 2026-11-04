// Acceso a IndexedDB. Todo el estado de la app se guarda como un único
// documento JSON: es pequeño, rápido y hace trivial exportar/importar.

const DB_NAME = "panel-de-vida";
const DB_VERSION = 1;
const STORE = "kv";

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req && req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export const dbGet = key => tx("readonly", s => s.get(key));
export const dbSet = (key, value) => tx("readwrite", s => s.put(value, key));
export const dbDelete = key => tx("readwrite", s => s.delete(key));

// Pide al navegador que no borre los datos automáticamente.
// En iPhone ayuda, pero no sustituye a las copias de seguridad.
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* sin soporte */ }
  return false;
}
