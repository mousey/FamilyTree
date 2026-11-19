import type { FamilyTree, PersonId } from '../core/types.js';
import {
  collectReferencedAssetIds,
  type ScrapbookDocument,
} from './types.js';

export const LOCAL_DRAFT_DB_NAME = 'heirloom-family-studio-v1';
export const LOCAL_DRAFT_DB_VERSION = 1;
export const SESSION_STORE_NAME = 'session';
export const ASSETS_STORE_NAME = 'assets';
export const CURRENT_SESSION_KEY = 'current';

export interface StoredDraftSession {
  savedAt: number;
  tree: FamilyTree;
  rawGedcom?: string | null;
  scrapbook: ScrapbookDocument;
  focusPersonId: PersonId;
}

export interface StoredAssetRecord {
  assetId: string;
  blob: Blob;
  mimeType: string;
  filename: string;
}

export interface DraftStorageAdapter {
  loadSession: () => Promise<StoredDraftSession | null>;
  loadAssets: (assetIds: string[]) => Promise<Map<string, Blob>>;
  saveSessionAndAssets: (
    session: StoredDraftSession,
    blobsToPut: Map<string, { blob: Blob; mimeType: string; filename: string }>,
    keepAssetIds: Set<string>,
  ) => Promise<void>;
  clearAll: () => Promise<void>;
}

export class DraftQuotaExceededError extends Error {
  constructor(message = 'Browser storage quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

export class DraftStorageUnavailableError extends Error {
  constructor(message = 'IndexedDB storage is unavailable') {
    super(message);
    this.name = 'DraftStorageUnavailableError';
  }
}

function isQuotaError(err: unknown): boolean {
  if (err instanceof DraftQuotaExceededError) return true;
  if (typeof err === 'object' && err !== null && 'name' in err) {
    const name = String((err as { name: unknown }).name);
    return (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED'
    );
  }
  return false;
}

function openDraftDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
    return Promise.reject(new DraftStorageUnavailableError());
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(
        LOCAL_DRAFT_DB_NAME,
        LOCAL_DRAFT_DB_VERSION,
      );
    } catch (err) {
      reject(
        err instanceof Error ? err : new DraftStorageUnavailableError(String(err)),
      );
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE_NAME)) {
        db.createObjectStore(SESSION_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(ASSETS_STORE_NAME)) {
        db.createObjectStore(ASSETS_STORE_NAME, { keyPath: 'assetId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new DraftStorageUnavailableError('Failed to open IndexedDB'),
      );
    request.onblocked = () =>
      reject(new DraftStorageUnavailableError('IndexedDB open request blocked'));
  });
}

function idbRequestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Native browser IndexedDB adapter storing session JSON metadata in `session`
 * and raw binary image/PDF Blobs in `assets` (avoiding base64 overhead).
 */
export function createIndexedDbAdapter(): DraftStorageAdapter {
  return {
    async loadSession() {
      const db = await openDraftDatabase();
      try {
        const tx = db.transaction(SESSION_STORE_NAME, 'readonly');
        const store = tx.objectStore(SESSION_STORE_NAME);
        const result = await idbRequestToPromise<StoredDraftSession | undefined>(
          store.get(CURRENT_SESSION_KEY),
        );
        return result ?? null;
      } finally {
        db.close();
      }
    },

    async loadAssets(assetIds: string[]) {
      const result = new Map<string, Blob>();
      if (assetIds.length === 0) return result;
      const db = await openDraftDatabase();
      try {
        const tx = db.transaction(ASSETS_STORE_NAME, 'readonly');
        const store = tx.objectStore(ASSETS_STORE_NAME);
        await Promise.all(
          assetIds.map(async (assetId) => {
            const rec = await idbRequestToPromise<StoredAssetRecord | undefined>(
              store.get(assetId),
            );
            if (rec?.blob) {
              result.set(assetId, rec.blob);
            }
          }),
        );
        return result;
      } finally {
        db.close();
      }
    },

    async saveSessionAndAssets(session, blobsToPut, keepAssetIds) {
      const db = await openDraftDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            [SESSION_STORE_NAME, ASSETS_STORE_NAME],
            'readwrite',
          );
          const sessionStore = tx.objectStore(SESSION_STORE_NAME);
          const assetsStore = tx.objectStore(ASSETS_STORE_NAME);

          sessionStore.put(session, CURRENT_SESSION_KEY);

          for (const [assetId, item] of blobsToPut.entries()) {
            const rec: StoredAssetRecord = {
              assetId,
              blob: item.blob,
              mimeType: item.mimeType,
              filename: item.filename,
            };
            assetsStore.put(rec);
          }

          // Garbage-collect orphaned asset keys in the assets store
          const keysReq = assetsStore.getAllKeys();
          keysReq.onsuccess = () => {
            for (const key of keysReq.result) {
              const id = String(key);
              if (!keepAssetIds.has(id)) {
                assetsStore.delete(key);
              }
            }
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () =>
            reject(tx.error ?? new Error('IndexedDB transaction failed'));
          tx.onabort = () =>
            reject(tx.error ?? new Error('IndexedDB transaction aborted'));
        });
      } finally {
        db.close();
      }
    },

    async clearAll() {
      const db = await openDraftDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(
            [SESSION_STORE_NAME, ASSETS_STORE_NAME],
            'readwrite',
          );
          tx.objectStore(SESSION_STORE_NAME).clear();
          tx.objectStore(ASSETS_STORE_NAME).clear();
          tx.oncomplete = () => resolve();
          tx.onerror = () =>
            reject(tx.error ?? new Error('Failed to clear IndexedDB'));
          tx.onabort = () =>
            reject(tx.error ?? new Error('IndexedDB clear aborted'));
        });
      } finally {
        db.close();
      }
    },
  };
}

/**
 * Deterministic in-memory DraftStorageAdapter for Vitest / Node unit testing.
 */
export function createMemoryDraftAdapter(options?: {
  simulateQuotaError?: boolean;
  simulateUnavailable?: boolean;
}): DraftStorageAdapter & {
  getStoredAssetKeys: () => string[];
} {
  let storedSession: StoredDraftSession | null = null;
  const storedAssets = new Map<string, StoredAssetRecord>();

  const checkGuards = () => {
    if (options?.simulateUnavailable) {
      throw new DraftStorageUnavailableError();
    }
    if (options?.simulateQuotaError) {
      throw new DraftQuotaExceededError();
    }
  };

  return {
    getStoredAssetKeys() {
      return [...storedAssets.keys()];
    },

    async loadSession() {
      if (options?.simulateUnavailable) {
        throw new DraftStorageUnavailableError();
      }
      return storedSession ? structuredClone(storedSession) : null;
    },

    async loadAssets(assetIds: string[]) {
      if (options?.simulateUnavailable) {
        throw new DraftStorageUnavailableError();
      }
      const out = new Map<string, Blob>();
      for (const id of assetIds) {
        const rec = storedAssets.get(id);
        if (rec) out.set(id, rec.blob);
      }
      return out;
    },

    async saveSessionAndAssets(session, blobsToPut, keepAssetIds) {
      checkGuards();
      storedSession = structuredClone(session);
      for (const [assetId, item] of blobsToPut.entries()) {
        storedAssets.set(assetId, {
          assetId,
          blob: item.blob,
          mimeType: item.mimeType,
          filename: item.filename,
        });
      }
      for (const existingKey of [...storedAssets.keys()]) {
        if (!keepAssetIds.has(existingKey)) {
          storedAssets.delete(existingKey);
        }
      }
    },

    async clearAll() {
      if (options?.simulateUnavailable) {
        throw new DraftStorageUnavailableError();
      }
      storedSession = null;
      storedAssets.clear();
    },
  };
}

let defaultAdapter: DraftStorageAdapter | null = null;
function getDefaultAdapter(): DraftStorageAdapter {
  if (!defaultAdapter) {
    defaultAdapter = createIndexedDbAdapter();
  }
  return defaultAdapter;
}

export async function loadLocalDraft(
  adapter: DraftStorageAdapter = getDefaultAdapter(),
): Promise<{
  session: StoredDraftSession;
  assetBlobs: Map<string, Blob>;
} | null> {
  try {
    const session = await adapter.loadSession();
    if (!session || !session.tree || !session.scrapbook) {
      return null;
    }
    const referencedIds = [...collectReferencedAssetIds(session.scrapbook)];
    const assetBlobs = await adapter.loadAssets(referencedIds);
    return { session, assetBlobs };
  } catch {
    return null;
  }
}

export async function saveLocalDraft(
  params: {
    tree: FamilyTree;
    rawGedcom?: string | null;
    scrapbook: ScrapbookDocument;
    focusPersonId: PersonId;
    assetBlobs: ReadonlyMap<string, Blob>;
  },
  adapter: DraftStorageAdapter = getDefaultAdapter(),
): Promise<
  { ok: true; savedAt: number } | { ok: false; reason: 'unavailable' | 'quota_exceeded' }
> {
  const keepAssetIds = collectReferencedAssetIds(params.scrapbook);
  const cleanedAssets: ScrapbookDocument['assets'] = {};
  const blobsToPut = new Map<
    string,
    { blob: Blob; mimeType: string; filename: string }
  >();

  for (const id of keepAssetIds) {
    const meta = params.scrapbook.assets[id];
    const blob = params.assetBlobs.get(id);
    if (meta) {
      cleanedAssets[id] = meta;
      if (blob) {
        blobsToPut.set(id, {
          blob,
          mimeType: meta.mimeType,
          filename: meta.filename,
        });
      }
    }
  }

  const savedAt = Date.now();
  const session: StoredDraftSession = {
    savedAt,
    tree: params.tree,
    rawGedcom: params.rawGedcom ?? null,
    scrapbook: {
      ...params.scrapbook,
      assets: cleanedAssets,
    },
    focusPersonId: params.focusPersonId,
  };

  try {
    await adapter.saveSessionAndAssets(session, blobsToPut, keepAssetIds);
    return { ok: true, savedAt };
  } catch (err) {
    if (isQuotaError(err)) {
      return { ok: false, reason: 'quota_exceeded' };
    }
    return { ok: false, reason: 'unavailable' };
  }
}

export async function clearLocalDraftStorage(
  adapter: DraftStorageAdapter = getDefaultAdapter(),
): Promise<void> {
  try {
    await adapter.clearAll();
  } catch {
    // Graceful no-op when browser IndexedDB is unavailable
  }
}
