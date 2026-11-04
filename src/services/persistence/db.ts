/**
 * Persistence abstraction. The application talks only to `PersistenceAdapter`;
 * the default implementation is IndexedDB (offline). A future backend can
 * implement the same interface (e.g. a REST adapter) without UI changes.
 */
export type StoreName = 'records' | 'profiles' | 'experiments' | 'documents' | 'progress' | 'files';

export interface PersistenceAdapter {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  list<T>(store: StoreName): Promise<T[]>;
  clear(store: StoreName): Promise<void>;
}

const DB_NAME = 'hydraulic-academy';
const DB_VERSION = 1;
const STORES: StoreName[] = ['records', 'profiles', 'experiments', 'documents', 'progress', 'files'];

class IndexedDbAdapter implements PersistenceAdapter {
  private dbp: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.dbp;
  }

  private async tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }

  get<T>(store: StoreName, key: string) {
    return this.tx<T | undefined>(store, 'readonly', (s) => s.get(key));
  }
  async put<T>(store: StoreName, key: string, value: T) {
    await this.tx(store, 'readwrite', (s) => s.put(value, key));
  }
  async delete(store: StoreName, key: string) {
    await this.tx(store, 'readwrite', (s) => s.delete(key));
  }
  list<T>(store: StoreName) {
    return this.tx<T[]>(store, 'readonly', (s) => s.getAll());
  }
  async clear(store: StoreName) {
    await this.tx(store, 'readwrite', (s) => s.clear());
  }
}

/** In-memory fallback (private browsing / IndexedDB unavailable). */
class MemoryAdapter implements PersistenceAdapter {
  private data = new Map<string, Map<string, unknown>>();
  private s(store: StoreName) {
    if (!this.data.has(store)) this.data.set(store, new Map());
    return this.data.get(store)!;
  }
  async get<T>(store: StoreName, key: string) {
    return this.s(store).get(key) as T | undefined;
  }
  async put<T>(store: StoreName, key: string, value: T) {
    this.s(store).set(key, structuredClone(value));
  }
  async delete(store: StoreName, key: string) {
    this.s(store).delete(key);
  }
  async list<T>(store: StoreName) {
    return [...this.s(store).values()] as T[];
  }
  async clear(store: StoreName) {
    this.s(store).clear();
  }
}

function createAdapter(): PersistenceAdapter {
  try {
    if (typeof indexedDB !== 'undefined') return new IndexedDbAdapter();
  } catch {
    /* fall through */
  }
  return new MemoryAdapter();
}

export const db: PersistenceAdapter = createAdapter();

/** Lightweight preferences only. */
export const prefsStorage = {
  read<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(`ha:${key}`);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write<T>(key: string, value: T) {
    try {
      localStorage.setItem(`ha:${key}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  },
};
