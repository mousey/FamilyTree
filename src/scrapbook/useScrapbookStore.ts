import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FamilyGraph, LineageMode } from '../core/graph.js';
import type { FamilyTree, PersonId } from '../core/types.js';
import {
  detectAndLoadFile,
  exportHeirloomZip,
  seedScrapbookFromGdzMedia,
  type LoadedBundleResult,
} from './bundleIo.js';
import {
  createDefaultScrapbookDocument,
  createScrapbookPersonEntry,
} from './constellation.js';
import {
  clearLocalDraftStorage,
  loadLocalDraft,
  saveLocalDraft,
} from './localDraft.js';
import {
  extensionForMimeType,
  isPdfFile,
  normalizeImageBlob,
  rasterizePdfPage,
  sanitizeAssetFilename,
} from './mediaPipeline.js';
import { buildBookletPages, groupIntoSpreads } from './paginator.js';
import {
  clampHighlight,
  collectReferencedAssetIds,
  deterministicTilt,
  type CertificateRole,
  type DocumentHighlight,
  type LocalSaveStatus,
  type PersonPageToggle,
  type ScrapbookAsset,
  type ScrapbookDocument,
  type ScrapbookPersonEntry,
  type ScrapbookStoreApi,
} from './types.js';

export interface HydratedDraftPayload {
  tree: FamilyTree;
  rawGedcom?: string | null;
  scrapbook: ScrapbookDocument;
  focusPersonId: PersonId;
  savedAt: number;
}

export interface UseScrapbookStoreOptions {
  tree: FamilyTree;
  graph: FamilyGraph;
  rawGedcom: string | null;
  focusPersonId: PersonId;
  lineageMode: LineageMode;
  onHydratedSession: (payload: HydratedDraftPayload) => void;
  onImportedBundle?: (result: LoadedBundleResult, filename: string) => void;
  onNotify?: (message: string) => void;
}

export interface ScrapbookStoreController extends ScrapbookStoreApi {
  hydrateFromBundle: (
    result: LoadedBundleResult,
    nextGraph: FamilyGraph,
    nextFocusId: PersonId,
  ) => void;
  resetForNewTree: (nextGraph: FamilyGraph, nextFocusId: PersonId) => void;
  notifyTreeChanged: () => void;
}

function makeUid(prefix: string): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function defaultCertificateTitle(role: CertificateRole, rawName?: string): string {
  if (rawName) {
    const stem = rawName
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    if (stem) return stem;
  }
  switch (role) {
    case 'birth':
      return 'Birth Certificate';
    case 'marriage':
      return 'Marriage Certificate';
    case 'death':
      return 'Death Certificate';
    case 'census':
      return 'Census Record';
    case 'other':
      return 'Archival Record';
  }
}

export function useScrapbookStore({
  tree,
  graph,
  rawGedcom,
  focusPersonId,
  lineageMode,
  onHydratedSession,
  onImportedBundle,
  onNotify,
}: UseScrapbookStoreOptions): ScrapbookStoreController {
  const [doc, setDoc] = useState<ScrapbookDocument>(() =>
    createDefaultScrapbookDocument(graph, focusPersonId, { lineageMode }),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>('idle');
  const [lastLocalSavedAt, setLastLocalSavedAt] = useState<number | null>(null);
  const [mutationRevision, setMutationRevision] = useState(0);

  const assetBlobsRef = useRef<Map<string, Blob>>(new Map());
  const assetUrlsRef = useRef<Map<string, string>>(new Map());
  const [assetUrls, setAssetUrls] = useState<Map<string, string>>(() => new Map());

  const hydratedRef = useRef(false);
  const lastSavedRevisionRef = useRef(0);
  const onHydratedRef = useRef(onHydratedSession);
  onHydratedRef.current = onHydratedSession;
  const onImportedBundleRef = useRef(onImportedBundle);
  onImportedBundleRef.current = onImportedBundle;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const syncAssetUrls = useCallback((nextBlobs: Map<string, Blob>) => {
    const prevUrls = assetUrlsRef.current;
    const prevBlobs = assetBlobsRef.current;
    const nextUrls = new Map<string, string>();

    for (const [id, oldUrl] of prevUrls.entries()) {
      const nextBlob = nextBlobs.get(id);
      if (nextBlob && nextBlob === prevBlobs.get(id)) {
        nextUrls.set(id, oldUrl);
      } else {
        URL.revokeObjectURL(oldUrl);
      }
    }

    for (const [id, blob] of nextBlobs.entries()) {
      if (!nextUrls.has(id)) {
        nextUrls.set(id, URL.createObjectURL(blob));
      }
    }

    assetBlobsRef.current = nextBlobs;
    assetUrlsRef.current = nextUrls;
    setAssetUrls(nextUrls);
  }, []);

  // Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of assetUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
      assetUrlsRef.current.clear();
    };
  }, []);

  // Hydrate working session from IndexedDB on initial mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await loadLocalDraft();
      if (cancelled) return;
      if (restored) {
        const nextBlobs = new Map(restored.assetBlobs);
        syncAssetUrls(nextBlobs);
        setDoc(restored.session.scrapbook);
        setLastLocalSavedAt(restored.session.savedAt);
        setLocalSaveStatus('saved');
        setIsDirty(true);
        onHydratedRef.current({
          tree: restored.session.tree,
          rawGedcom: restored.session.rawGedcom,
          scrapbook: restored.session.scrapbook,
          focusPersonId: restored.session.focusPersonId,
          savedAt: restored.session.savedAt,
        });
      }
      hydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [syncAssetUrls]);

  // Debounced auto-save to IndexedDB after user mutations
  useEffect(() => {
    if (
      !hydratedRef.current ||
      mutationRevision === 0 ||
      mutationRevision === lastSavedRevisionRef.current
    ) {
      return;
    }

    const targetRevision = mutationRevision;
    setLocalSaveStatus('saving');
    const timer = window.setTimeout(async () => {
      // Garbage-collect unreferenced blobs from memory map cleanly as well
      const referenced = collectReferencedAssetIds(doc);
      let removedAny = false;
      const compactedBlobs = new Map<string, Blob>();
      for (const [id, blob] of assetBlobsRef.current.entries()) {
        if (referenced.has(id)) {
          compactedBlobs.set(id, blob);
        } else {
          removedAny = true;
        }
      }
      if (removedAny) {
        syncAssetUrls(compactedBlobs);
      }

      const res = await saveLocalDraft({
        tree,
        rawGedcom,
        scrapbook: doc,
        focusPersonId,
        assetBlobs: compactedBlobs,
      });

      if (res.ok) {
        lastSavedRevisionRef.current = targetRevision;
        setLocalSaveStatus('saved');
        setLastLocalSavedAt(res.savedAt);
      } else {
        setLocalSaveStatus(res.reason);
        if (res.reason === 'quota_exceeded') {
          onNotifyRef.current?.(
            'Browser local storage is full — export .heirloom.zip to back up your album.',
          );
        }
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [doc, focusPersonId, mutationRevision, rawGedcom, syncAssetUrls, tree]);

  const commitDocUpdate = useCallback(
    (updater: (prev: ScrapbookDocument) => ScrapbookDocument, markDirty = true) => {
      setDoc((prev) => updater(prev));
      if (markDirty) setIsDirty(true);
      setMutationRevision((r) => r + 1);
    },
    [],
  );

  const registerBlobAsset = useCallback(
    async (
      file: File | Blob,
      preferredName: string,
      options?: { pdfPageNumber?: number; originalTitle?: string },
    ): Promise<ScrapbookAsset> => {
      const rawName =
        typeof File !== 'undefined' && file instanceof File
          ? file.name
          : preferredName;

      let finalBlob: Blob;
      let mimeType: string;
      let width: number | undefined;
      let height: number | undefined;
      let pdfPageNumber: number | undefined;
      let pdfPageCount: number | undefined;

      if (isPdfFile(file, rawName)) {
        const rendered = await rasterizePdfPage(
          file,
          options?.pdfPageNumber ?? 1,
        );
        finalBlob = rendered.blob;
        mimeType = rendered.mimeType;
        width = rendered.width;
        height = rendered.height;
        pdfPageNumber = Math.min(
          rendered.pageCount,
          Math.max(1, options?.pdfPageNumber ?? 1),
        );
        pdfPageCount = rendered.pageCount;
      } else {
        const normalized = await normalizeImageBlob(file);
        finalBlob = normalized.blob;
        mimeType = normalized.mimeType;
        width = normalized.width;
        height = normalized.height;
      }

      const assetId = makeUid('asset');
      const ext = extensionForMimeType(mimeType, 'jpg');
      const filename = sanitizeAssetFilename(
        `${rawName.replace(/\.pdf$/i, '')}_${assetId}.${ext}`,
        ext,
      );

      const nextBlobs = new Map(assetBlobsRef.current);
      nextBlobs.set(assetId, finalBlob);
      syncAssetUrls(nextBlobs);

      return {
        id: assetId,
        filename,
        mimeType,
        ...(width !== undefined ? { width } : {}),
        ...(height !== undefined ? { height } : {}),
        ...(pdfPageNumber !== undefined ? { pdfPageNumber } : {}),
        ...(pdfPageCount !== undefined ? { pdfPageCount } : {}),
        originalTitle: options?.originalTitle ?? rawName,
      };
    },
    [syncAssetUrls],
  );

  const updatePersonEntry = useCallback(
    (
      personId: PersonId,
      transform: (entry: ScrapbookPersonEntry) => ScrapbookPersonEntry,
    ) => {
      commitDocUpdate((prev) => {
        const idx = prev.entries.findIndex((e) => e.personId === personId);
        if (idx === -1) return prev;
        const nextEntries = [...prev.entries];
        nextEntries[idx] = transform(nextEntries[idx]!);
        return { ...prev, entries: nextEntries };
      });
    },
    [commitDocUpdate],
  );

  // Document settings
  const setTitle = useCallback(
    (title: string, subtitle?: string) => {
      commitDocUpdate((prev) => ({
        ...prev,
        title,
        ...(subtitle !== undefined ? { subtitle } : {}),
      }));
    },
    [commitDocUpdate],
  );

  const setPaperSize = useCallback(
    (paperSize: 'a4' | 'letter') => {
      commitDocUpdate((prev) => ({ ...prev, paperSize }));
    },
    [commitDocUpdate],
  );

  const setInkSaverPrint = useCallback(
    (inkSaverPrint: boolean) => {
      commitDocUpdate((prev) => ({ ...prev, inkSaverPrint }));
    },
    [commitDocUpdate],
  );

  const setAutoSkipEmptyPages = useCallback(
    (autoSkipEmptyPages: boolean) => {
      commitDocUpdate((prev) => ({ ...prev, autoSkipEmptyPages }));
    },
    [commitDocUpdate],
  );

  // Outline & constellation curation
  const rebuildForFocusPerson = useCallback(
    (nextFocusId: PersonId) => {
      if (!graph.getPerson(nextFocusId)) return;
      commitDocUpdate(
        (prev) =>
          createDefaultScrapbookDocument(graph, nextFocusId, {
            existingDoc: prev,
            lineageMode,
          }),
        false,
      );
    },
    [commitDocUpdate, graph, lineageMode],
  );

  const togglePersonIncluded = useCallback(
    (personId: PersonId, included: boolean) => {
      updatePersonEntry(personId, (e) => ({ ...e, included }));
    },
    [updatePersonEntry],
  );

  const togglePersonCompactMode = useCallback(
    (personId: PersonId, compactMode: boolean) => {
      updatePersonEntry(personId, (e) => ({ ...e, compactMode }));
    },
    [updatePersonEntry],
  );

  const togglePersonPage = useCallback(
    (personId: PersonId, page: keyof PersonPageToggle, enabled: boolean) => {
      updatePersonEntry(personId, (e) => ({
        ...e,
        pages: { ...e.pages, [page]: enabled },
      }));
    },
    [updatePersonEntry],
  );

  const reorderEntries = useCallback(
    (fromIndex: number, toIndex: number) => {
      commitDocUpdate((prev) => {
        if (
          fromIndex < 0 ||
          toIndex < 0 ||
          fromIndex >= prev.entries.length ||
          toIndex >= prev.entries.length ||
          fromIndex === toIndex
        ) {
          return prev;
        }
        const next = [...prev.entries];
        const [moved] = next.splice(fromIndex, 1);
        if (!moved) return prev;
        next.splice(toIndex, 0, moved);
        return { ...prev, entries: next };
      });
    },
    [commitDocUpdate],
  );

  const addCustomPerson = useCallback(
    (personId: PersonId) => {
      if (!graph.getPerson(personId)) return;
      commitDocUpdate((prev) => {
        const existingIdx = prev.entries.findIndex((e) => e.personId === personId);
        if (existingIdx !== -1) {
          const next = [...prev.entries];
          next[existingIdx] = { ...next[existingIdx]!, included: true };
          return { ...prev, entries: next };
        }
        const entry = createScrapbookPersonEntry(
          graph,
          personId,
          'custom',
          undefined,
          prev.personPortraitAssetIds?.[personId],
        );
        return { ...prev, entries: [...prev.entries, entry] };
      });
    },
    [commitDocUpdate, graph],
  );

  // Asset ingestion
  const attachPortrait = useCallback(
    async (personId: PersonId, file: File | Blob) => {
      const asset = await registerBlobAsset(file, `portrait_${personId}`);
      commitDocUpdate((prev) => {
        const nextPortraitMap = {
          ...(prev.personPortraitAssetIds ?? {}),
          [personId]: asset.id,
        };
        const nextEntries = prev.entries.map((entry) =>
          entry.personId === personId
            ? { ...entry, portraitAssetId: asset.id }
            : entry,
        );
        return {
          ...prev,
          entries: nextEntries,
          assets: { ...prev.assets, [asset.id]: asset },
          personPortraitAssetIds: nextPortraitMap,
        };
      });
    },
    [commitDocUpdate, registerBlobAsset],
  );

  const attachGroupPolaroid = useCallback(
    async (personId: PersonId, file: File | Blob, caption = '') => {
      const asset = await registerBlobAsset(file, `polaroid_${personId}`);
      commitDocUpdate((prev) => ({
        ...prev,
        assets: { ...prev.assets, [asset.id]: asset },
        entries: prev.entries.map((entry) =>
          entry.personId === personId
            ? {
                ...entry,
                groupPolaroid: {
                  id: makeUid('pol'),
                  assetId: asset.id,
                  caption,
                  rotationDeg: deterministicTilt(`pol:${personId}:${asset.id}`, 2.6),
                },
              }
            : entry,
        ),
      }));
    },
    [commitDocUpdate, registerBlobAsset],
  );

  const updatePolaroidCaption = useCallback(
    (personId: PersonId, slotId: string, caption: string, dateLabel?: string) => {
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        groupPolaroid:
          entry.groupPolaroid?.id === slotId
            ? {
                ...entry.groupPolaroid,
                caption,
                ...(dateLabel !== undefined ? { dateLabel } : {}),
              }
            : entry.groupPolaroid,
        extraPhotos: entry.extraPhotos.map((p) =>
          p.id === slotId
            ? {
                ...p,
                caption,
                ...(dateLabel !== undefined ? { dateLabel } : {}),
              }
            : p,
        ),
      }));
    },
    [updatePersonEntry],
  );

  const attachExtraPhoto = useCallback(
    async (personId: PersonId, file: File | Blob, caption = '') => {
      const asset = await registerBlobAsset(file, `photo_${personId}`);
      commitDocUpdate((prev) => ({
        ...prev,
        assets: { ...prev.assets, [asset.id]: asset },
        entries: prev.entries.map((entry) =>
          entry.personId === personId
            ? {
                ...entry,
                extraPhotos: [
                  ...entry.extraPhotos,
                  {
                    id: makeUid('photo'),
                    assetId: asset.id,
                    caption,
                    rotationDeg: deterministicTilt(
                      `photo:${personId}:${asset.id}`,
                      2.8,
                    ),
                  },
                ],
              }
            : entry,
        ),
      }));
    },
    [commitDocUpdate, registerBlobAsset],
  );

  const removeExtraPhoto = useCallback(
    (personId: PersonId, slotId: string) => {
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        extraPhotos: entry.extraPhotos.filter((p) => p.id !== slotId),
      }));
    },
    [updatePersonEntry],
  );

  // Certificates & record highlights
  const attachCertificate = useCallback(
    async (
      personId: PersonId,
      file: File | Blob,
      role: CertificateRole,
      title?: string,
      pdfPageNumber?: number,
    ) => {
      const rawName =
        typeof File !== 'undefined' && file instanceof File ? file.name : undefined;
      const resolvedTitle = title?.trim() || defaultCertificateTitle(role, rawName);
      const asset = await registerBlobAsset(file, `cert_${personId}`, {
        pdfPageNumber,
        originalTitle: resolvedTitle,
      });

      commitDocUpdate((prev) => ({
        ...prev,
        assets: { ...prev.assets, [asset.id]: asset },
        entries: prev.entries.map((entry) => {
          if (entry.personId !== personId) return entry;
          const maxZ = entry.certificates.reduce(
            (m, c) => Math.max(m, c.zOrder),
            0,
          );
          const certId = makeUid('cert');
          return {
            ...entry,
            certificates: [
              ...entry.certificates,
              {
                id: certId,
                assetId: asset.id,
                role,
                title: resolvedTitle,
                highlights: [],
                rotationDeg: deterministicTilt(`cert:${personId}:${certId}`, 2.4),
                zOrder: maxZ + 1,
              },
            ],
          };
        }),
      }));
    },
    [commitDocUpdate, registerBlobAsset],
  );

  const reuseExistingAssetAsCertificate = useCallback(
    (
      personId: PersonId,
      assetId: string,
      role: CertificateRole,
      title: string,
    ) => {
      commitDocUpdate((prev) => {
        if (!prev.assets[assetId]) return prev;
        return {
          ...prev,
          entries: prev.entries.map((entry) => {
            if (entry.personId !== personId) return entry;
            const maxZ = entry.certificates.reduce(
              (m, c) => Math.max(m, c.zOrder),
              0,
            );
            const certId = makeUid('cert');
            return {
              ...entry,
              certificates: [
                ...entry.certificates,
                {
                  id: certId,
                  assetId,
                  role,
                  title: title.trim() || defaultCertificateTitle(role),
                  highlights: [],
                  rotationDeg: deterministicTilt(
                    `cert:${personId}:${certId}`,
                    2.4,
                  ),
                  zOrder: maxZ + 1,
                },
              ],
            };
          }),
        };
      });
    },
    [commitDocUpdate],
  );

  const updateCertificateHighlights = useCallback(
    (
      personId: PersonId,
      certificateId: string,
      highlights: DocumentHighlight[],
    ) => {
      const clamped = highlights.map(clampHighlight);
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        certificates: entry.certificates.map((cert) =>
          cert.id === certificateId ? { ...cert, highlights: clamped } : cert,
        ),
      }));
    },
    [updatePersonEntry],
  );

  const bringCertificateToFront = useCallback(
    (personId: PersonId, certificateId: string) => {
      updatePersonEntry(personId, (entry) => {
        const maxZ = entry.certificates.reduce(
          (m, c) => Math.max(m, c.zOrder),
          0,
        );
        return {
          ...entry,
          certificates: entry.certificates.map((cert) =>
            cert.id === certificateId ? { ...cert, zOrder: maxZ + 1 } : cert,
          ),
        };
      });
    },
    [updatePersonEntry],
  );

  const removeCertificate = useCallback(
    (personId: PersonId, certificateId: string) => {
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        certificates: entry.certificates.filter((c) => c.id !== certificateId),
      }));
    },
    [updatePersonEntry],
  );

  // Biography & places
  const setBiographyText = useCallback(
    (personId: PersonId, text: string) => {
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        biographyText: text,
      }));
    },
    [updatePersonEntry],
  );

  const attachPlaceSnapshot = useCallback(
    async (personId: PersonId, placeId: string, file: File | Blob) => {
      const asset = await registerBlobAsset(file, `place_${personId}`);
      commitDocUpdate((prev) => ({
        ...prev,
        assets: { ...prev.assets, [asset.id]: asset },
        entries: prev.entries.map((entry) =>
          entry.personId === personId
            ? {
                ...entry,
                places: entry.places.map((p) =>
                  p.id === placeId ? { ...p, assetId: asset.id } : p,
                ),
              }
            : entry,
        ),
      }));
    },
    [commitDocUpdate, registerBlobAsset],
  );

  const addPlace = useCallback(
    (personId: PersonId, address: string, yearLabel?: string) => {
      const trimmed = address.trim();
      if (!trimmed) return;
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        places: [
          ...entry.places,
          {
            id: makeUid('place'),
            address: trimmed,
            ...(yearLabel ? { yearLabel } : {}),
            eventLabel: 'Residence',
          },
        ],
      }));
    },
    [updatePersonEntry],
  );

  const updatePlaceCaption = useCallback(
    (personId: PersonId, placeId: string, caption: string) => {
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        places: entry.places.map((p) =>
          p.id === placeId ? { ...p, caption } : p,
        ),
      }));
    },
    [updatePersonEntry],
  );

  const removePlace = useCallback(
    (personId: PersonId, placeId: string) => {
      updatePersonEntry(personId, (entry) => ({
        ...entry,
        places: entry.places.filter((p) => p.id !== placeId),
      }));
    },
    [updatePersonEntry],
  );

  // Bundle IO & tree lifecycle helpers
  const hydrateFromBundle = useCallback(
    (
      result: LoadedBundleResult,
      nextGraph: FamilyGraph,
      nextFocusId: PersonId,
    ) => {
      if (result.kind === 'heirloom_zip' && result.scrapbookDoc) {
        const nextBlobs = new Map(result.scrapbookAssetBlobs);
        syncAssetUrls(nextBlobs);
        setDoc(result.scrapbookDoc);
        setIsDirty(false);
        setMutationRevision((r) => r + 1);
        return;
      }

      if (result.kind === 'gdz') {
        const baseDoc = createDefaultScrapbookDocument(nextGraph, nextFocusId, {
          lineageMode,
        });
        const seeded = seedScrapbookFromGdzMedia(
          nextGraph,
          baseDoc,
          result.gedcomMediaBlobs,
        );
        syncAssetUrls(seeded.assetBlobs);
        setDoc(seeded.doc);
        setIsDirty(true);
        setMutationRevision((r) => r + 1);
        return;
      }

      // Plain .ged or .json
      syncAssetUrls(new Map());
      setDoc(
        createDefaultScrapbookDocument(nextGraph, nextFocusId, { lineageMode }),
      );
      setIsDirty(false);
      setMutationRevision((r) => r + 1);
    },
    [lineageMode, syncAssetUrls],
  );

  const resetForNewTree = useCallback(
    (nextGraph: FamilyGraph, nextFocusId: PersonId) => {
      syncAssetUrls(new Map());
      setDoc(
        createDefaultScrapbookDocument(nextGraph, nextFocusId, { lineageMode }),
      );
      setIsDirty(false);
      setMutationRevision((r) => r + 1);
    },
    [lineageMode, syncAssetUrls],
  );

  const notifyTreeChanged = useCallback(() => {
    setMutationRevision((r) => r + 1);
  }, []);

  const exportHeirloomZipFn = useCallback(async (): Promise<Blob> => {
    const blob = await exportHeirloomZip({
      tree,
      rawGedcom,
      scrapbookDoc: doc,
      assetBlobs: assetBlobsRef.current,
    });
    setIsDirty(false);
    return blob;
  }, [doc, rawGedcom, tree]);

  const importBundleFileFn = useCallback(
    async (
      file: File,
    ): Promise<{ treeGedcom: string; loadedScrapbook: boolean }> => {
      const result = await detectAndLoadFile(file);
      onImportedBundleRef.current?.(result, file.name);
      return {
        treeGedcom: result.rawGedcom ?? '',
        loadedScrapbook:
          result.kind === 'heirloom_zip' ||
          (result.kind === 'gdz' && result.gedcomMediaBlobs.size > 0),
      };
    },
    [],
  );

  const clearLocalDraftFn = useCallback(async () => {
    lastSavedRevisionRef.current = 0;
    setMutationRevision(0);
    await clearLocalDraftStorage();
    syncAssetUrls(new Map());
    setDoc(createDefaultScrapbookDocument(graph, focusPersonId, { lineageMode }));
    setIsDirty(false);
    setLastLocalSavedAt(null);
    setLocalSaveStatus('idle');
    onNotifyRef.current?.('Cleared local browser scrapbook draft.');
  }, [focusPersonId, graph, lineageMode, syncAssetUrls]);

  const pages = useMemo(
    () => buildBookletPages(doc, { mode: 'edit' }),
    [doc],
  );
  const spreads = useMemo(() => groupIntoSpreads(pages), [pages]);

  return {
    doc,
    pages,
    spreads,
    assetUrls,
    isDirty,
    localSaveStatus,
    lastLocalSavedAt,
    setTitle,
    setPaperSize,
    setInkSaverPrint,
    setAutoSkipEmptyPages,
    rebuildForFocusPerson,
    togglePersonIncluded,
    togglePersonCompactMode,
    togglePersonPage,
    reorderEntries,
    addCustomPerson,
    attachPortrait,
    attachGroupPolaroid,
    updatePolaroidCaption,
    attachExtraPhoto,
    removeExtraPhoto,
    attachCertificate,
    reuseExistingAssetAsCertificate,
    updateCertificateHighlights,
    bringCertificateToFront,
    removeCertificate,
    setBiographyText,
    attachPlaceSnapshot,
    addPlace,
    updatePlaceCaption,
    removePlace,
    exportHeirloomZip: exportHeirloomZipFn,
    importBundleFile: importBundleFileFn,
    clearLocalDraft: clearLocalDraftFn,
    hydrateFromBundle,
    resetForNewTree,
    notifyTreeChanged,
  };
}
