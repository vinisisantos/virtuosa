/**
 * IndexedDB Storage — drop-in replacement for localStorage with much higher capacity.
 * localStorage limit: ~5MB → IndexedDB: effectively unlimited (typically 50%+ of disk).
 *
 * API: getItem(key) → Promise<string|null>, setItem(key, value) → Promise<void>
 */

const DB_NAME = 'virtuosa_financeiro';
const DB_VERSION = 1;
const STORE_NAME = 'kv_store';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export async function idbGetItem(key: string): Promise<string | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback to localStorage
    return localStorage.getItem(key);
  }
}

export async function idbSetItem(key: string, value: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Fallback to localStorage (may throw QuotaExceededError)
    localStorage.setItem(key, value);
  }
}

export async function idbRemoveItem(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    localStorage.removeItem(key);
  }
}

/**
 * Migrate a key from localStorage to IndexedDB.
 * After successful migration, removes the key from localStorage to free space.
 */
export async function migrateFromLocalStorage(key: string): Promise<string | null> {
  const lsValue = localStorage.getItem(key);
  if (lsValue) {
    try {
      await idbSetItem(key, lsValue);
      localStorage.removeItem(key); // Free localStorage space
      console.log(`[IDB] Migrated "${key}" from localStorage to IndexedDB (${(lsValue.length / 1024).toFixed(1)}KB)`);
    } catch (err) {
      console.warn(`[IDB] Failed to migrate "${key}":`, err);
    }
    return lsValue;
  }
  // If not in localStorage, try IndexedDB directly
  return idbGetItem(key);
}

/**
 * Load logs: first try IndexedDB, then fall back to localStorage, migrate if needed.
 */
export async function loadLogs(key: string): Promise<string | null> {
  // Try IndexedDB first
  const idbValue = await idbGetItem(key);
  if (idbValue) {
    // Also check if localStorage still has data (migration cleanup)
    const lsValue = localStorage.getItem(key);
    if (lsValue) {
      localStorage.removeItem(key);
      console.log(`[IDB] Cleaned up localStorage for "${key}"`);
    }
    return idbValue;
  }
  // Fall back to localStorage and migrate
  return migrateFromLocalStorage(key);
}

/**
 * Save logs: save to IndexedDB, and clear from localStorage if present.
 */
export async function saveLogs(key: string, value: string): Promise<void> {
  await idbSetItem(key, value);
  // If localStorage still has this key, remove it to free space
  try {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
    }
  } catch {}
}
