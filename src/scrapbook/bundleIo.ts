import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import type { FamilyGraph } from '../core/graph.js';
import {
  parseFamilyTreeJson,
  parseGedcom,
  serializeGedcom,
} from '../core/parsers/index.js';
import type { FamilyTree, MediaId, PersonId } from '../core/types.js';
import {
  extensionForMimeType,
  inferMimeTypeFromFilename,
  sanitizeAssetFilename,
} from './mediaPipeline.js';
import {
  SCRAPBOOK_SCHEMA_VERSION,
  clampHighlight,
  collectReferencedAssetIds,
  deterministicTilt,
  type CertificateAttachment,
  type CertificateRole,
  type ScrapbookAsset,
  type ScrapbookDocument,
} from './types.js';

export interface LoadedBundleResult {
  kind: 'gedcom' | 'json' | 'gdz' | 'heirloom_zip';
  tree: FamilyTree;
  rawGedcom?: string;
  warnings: string[];
  gedcomMediaBlobs: Map<
    MediaId,
    { blob: Blob; filename: string; mimeType: string }
  >;
  scrapbookDoc?: ScrapbookDocument;
  scrapbookAssetBlobs: Map<string, Blob>;
}

export function isSupportedImportFilename(filename: string): boolean {
  const lower = filename.toLowerCase().trim();
  return (
    lower.endsWith('.ged') ||
    lower.endsWith('.gedcom') ||
    lower.endsWith('.json') ||
    lower.endsWith('.gdz') ||
    lower.endsWith('.zip')
  );
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function normalizeZipPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '');
}

function toBlobPartBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

function findZipEntry(
  entries: Record<string, Uint8Array>,
  targetPath: string,
): { key: string; bytes: Uint8Array } | undefined {
  const normalizedTarget = normalizeZipPath(targetPath);
  const direct = entries[targetPath] ?? entries[normalizedTarget];
  if (direct) return { key: normalizedTarget, bytes: direct };

  const lowerTarget = normalizedTarget.toLowerCase();
  for (const [k, v] of Object.entries(entries)) {
    if (normalizeZipPath(k).toLowerCase() === lowerTarget) {
      return { key: k, bytes: v };
    }
  }
  return undefined;
}

function findFirstZipEntryByExtension(
  entries: Record<string, Uint8Array>,
  extWithDot: string,
): { key: string; bytes: Uint8Array } | undefined {
  const target = extWithDot.toLowerCase();
  for (const [k, v] of Object.entries(entries)) {
    const norm = normalizeZipPath(k).toLowerCase();
    if (!norm.endsWith('/') && norm.endsWith(target)) {
      return { key: k, bytes: v };
    }
  }
  return undefined;
}

function ensureUniqueMediaPath(
  proposed: string,
  usedPaths: Set<string>,
  assetId: string,
  mimeType: string,
): string {
  const ext = extensionForMimeType(mimeType, 'bin');
  let clean = sanitizeAssetFilename(proposed || `${assetId}.${ext}`, ext);
  if (!usedPaths.has(clean.toLowerCase())) {
    usedPaths.add(clean.toLowerCase());
    return clean;
  }

  const dotIdx = clean.lastIndexOf('.');
  const stem = dotIdx > 0 ? clean.slice(0, dotIdx) : clean;
  const suffix = assetId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 10) || 'copy';
  clean = `${stem}-${suffix}.${dotIdx > 0 ? clean.slice(dotIdx + 1) : ext}`;
  let counter = 2;
  while (usedPaths.has(clean.toLowerCase())) {
    clean = `${stem}-${suffix}-${counter++}.${dotIdx > 0 ? clean.slice(dotIdx + 1) : ext}`;
  }
  usedPaths.add(clean.toLowerCase());
  return clean;
}

/**
 * Packages the active FamilyTree (tree.ged), curated ScrapbookDocument (scrapbook.json),
 * and only referenced binary assets (media/*) into a portable .heirloom.zip Blob.
 */
export async function exportHeirloomZip(params: {
  tree: FamilyTree;
  rawGedcom?: string | null;
  scrapbookDoc: ScrapbookDocument;
  assetBlobs: ReadonlyMap<string, Blob>;
}): Promise<Blob> {
  const gedText =
    params.rawGedcom && params.rawGedcom.trim().length > 0
      ? params.rawGedcom
      : serializeGedcom(params.tree);

  const referencedIds = collectReferencedAssetIds(params.scrapbookDoc);
  const usedPaths = new Set<string>();
  const cleanedAssets: Record<string, ScrapbookAsset> = {};
  const zipInput: Zippable = {
    'tree.ged': [strToU8(gedText), { level: 6 }],
  };

  for (const assetId of referencedIds) {
    const asset = params.scrapbookDoc.assets[assetId];
    if (!asset) continue;

    const blob = params.assetBlobs.get(assetId);
    const filename = ensureUniqueMediaPath(
      asset.filename,
      usedPaths,
      assetId,
      asset.mimeType,
    );

    cleanedAssets[assetId] = {
      ...asset,
      filename,
    };

    if (blob) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      zipInput[filename] = [buf, { level: 0 }];
    }
  }

  const cleanedDoc: ScrapbookDocument = {
    ...params.scrapbookDoc,
    schemaVersion: SCRAPBOOK_SCHEMA_VERSION,
    entries: params.scrapbookDoc.entries.map((entry) => ({
      ...entry,
      certificates: entry.certificates.map((cert) => ({
        ...cert,
        highlights: cert.highlights.map(clampHighlight),
      })),
    })),
    assets: cleanedAssets,
  };

  zipInput['scrapbook.json'] = [
    strToU8(JSON.stringify(cleanedDoc, null, 2)),
    { level: 6 },
  ];

  const zipped = zipSync(zipInput);
  return new Blob([toBlobPartBytes(zipped)], { type: 'application/zip' });
}

function parseScrapbookJson(
  rawJson: string,
  validPersonIds: Set<string>,
  zipEntries: Record<string, Uint8Array>,
): {
  doc: ScrapbookDocument;
  assetBlobs: Map<string, Blob>;
  warnings: string[];
} {
  const warnings: string[] = [];
  const parsed = JSON.parse(stripBom(rawJson)) as Partial<ScrapbookDocument>;
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid scrapbook.json structure.');
  }
  if (parsed.schemaVersion !== SCRAPBOOK_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported scrapbook schemaVersion "${String(parsed.schemaVersion)}".`,
    );
  }
  if (!Array.isArray(parsed.entries) || typeof parsed.focusPersonId !== 'string') {
    throw new Error('Malformed scrapbook.json entries or focusPersonId.');
  }

  const rawAssets =
    parsed.assets && typeof parsed.assets === 'object' ? parsed.assets : {};
  const hydratedBlobs = new Map<string, Blob>();
  const validAssets: Record<string, ScrapbookAsset> = {};

  for (const [assetId, asset] of Object.entries(rawAssets)) {
    if (!asset || typeof asset !== 'object') continue;
    const match = findZipEntry(zipEntries, asset.filename);
    if (!match) {
      warnings.push(`Missing media file in bundle: ${asset.filename}`);
      continue;
    }
    const mimeType =
      asset.mimeType || inferMimeTypeFromFilename(asset.filename);
    hydratedBlobs.set(
      assetId,
      new Blob([toBlobPartBytes(match.bytes)], { type: mimeType }),
    );
    validAssets[assetId] = {
      ...asset,
      id: asset.id || assetId,
      mimeType,
    };
  }

  const prunedEntries = parsed.entries
    .filter((e) => e && validPersonIds.has(e.personId))
    .map((e) => ({
      ...e,
      portraitAssetId:
        e.portraitAssetId && validAssets[e.portraitAssetId]
          ? e.portraitAssetId
          : undefined,
      groupPolaroid:
        e.groupPolaroid && validAssets[e.groupPolaroid.assetId]
          ? e.groupPolaroid
          : undefined,
      certificates: (e.certificates ?? [])
        .filter((c) => validAssets[c.assetId])
        .map((c) => ({
          ...c,
          highlights: (c.highlights ?? []).map(clampHighlight),
        })),
      extraPhotos: (e.extraPhotos ?? []).filter((p) => validAssets[p.assetId]),
      places: (e.places ?? []).map((pl) => ({
        ...pl,
        assetId: pl.assetId && validAssets[pl.assetId] ? pl.assetId : undefined,
      })),
    }));

  const portraitMap: Record<PersonId, string> = {};
  if (parsed.personPortraitAssetIds) {
    for (const [pid, aid] of Object.entries(parsed.personPortraitAssetIds)) {
      if (validPersonIds.has(pid) && aid && validAssets[aid]) {
        portraitMap[pid] = aid;
      }
    }
  }
  for (const entry of prunedEntries) {
    if (entry.portraitAssetId && !portraitMap[entry.personId]) {
      portraitMap[entry.personId] = entry.portraitAssetId;
    }
  }

  const fallbackFocus =
    validPersonIds.has(parsed.focusPersonId)
      ? parsed.focusPersonId
      : ([...validPersonIds][0] ?? parsed.focusPersonId);

  const doc: ScrapbookDocument = {
    schemaVersion: SCRAPBOOK_SCHEMA_VERSION,
    title: parsed.title || 'Heirloom Family Album',
    ...(parsed.subtitle ? { subtitle: parsed.subtitle } : {}),
    focusPersonId: fallbackFocus,
    paperSize: parsed.paperSize === 'letter' ? 'letter' : 'a4',
    inkSaverPrint: Boolean(parsed.inkSaverPrint),
    autoSkipEmptyPages:
      parsed.autoSkipEmptyPages === undefined
        ? true
        : Boolean(parsed.autoSkipEmptyPages),
    entries: prunedEntries,
    assets: validAssets,
    personPortraitAssetIds: portraitMap,
  };

  return { doc, assetBlobs: hydratedBlobs, warnings };
}

/**
 * Unpacks and parses a portable .heirloom.zip bundle.
 */
export function importHeirloomZipBytes(bytes: Uint8Array): LoadedBundleResult {
  const entries = unzipSync(bytes);
  const warnings: string[] = [];

  const gedEntry =
    findZipEntry(entries, 'tree.ged') ??
    findFirstZipEntryByExtension(entries, '.ged');
  const jsonEntry = findZipEntry(entries, 'tree.json');

  let tree: FamilyTree;
  let rawGedcom: string | undefined;

  if (gedEntry) {
    rawGedcom = stripBom(strFromU8(gedEntry.bytes));
    const parsedGed = parseGedcom(rawGedcom);
    tree = parsedGed.tree;
    warnings.push(...parsedGed.warnings.map((w) => w.message));
  } else if (jsonEntry) {
    const parsedJson = parseFamilyTreeJson(stripBom(strFromU8(jsonEntry.bytes)), {
      strict: false,
    });
    if (!parsedJson.validation.valid) {
      throw new Error(
        parsedJson.validation.errors[0]?.message ?? 'Invalid tree.json in bundle.',
      );
    }
    tree = parsedJson.tree;
    warnings.push(...parsedJson.validation.warnings.map((w) => w.message));
  } else {
    throw new Error('Bundle is missing tree.ged or tree.json.');
  }

  const scrapbookEntry = findZipEntry(entries, 'scrapbook.json');
  if (!scrapbookEntry) {
    throw new Error('Bundle is missing scrapbook.json.');
  }

  const validPersonIds = new Set(Object.keys(tree.persons));
  const parsedScrapbook = parseScrapbookJson(
    strFromU8(scrapbookEntry.bytes),
    validPersonIds,
    entries,
  );
  warnings.push(...parsedScrapbook.warnings);

  return {
    kind: 'heirloom_zip',
    tree,
    ...(rawGedcom !== undefined ? { rawGedcom } : {}),
    warnings,
    gedcomMediaBlobs: new Map(),
    scrapbookDoc: parsedScrapbook.doc,
    scrapbookAssetBlobs: parsedScrapbook.assetBlobs,
  };
}

/**
 * Unpacks a GEDCOM 7.0 GEDZIP (.gdz) archive containing gedcom.ged and media/.
 */
export function importGdzBytes(bytes: Uint8Array): LoadedBundleResult {
  const entries = unzipSync(bytes);
  const warnings: string[] = [];

  const gedEntry =
    findZipEntry(entries, 'gedcom.ged') ??
    findFirstZipEntryByExtension(entries, '.ged');
  if (!gedEntry) {
    throw new Error('GEDZIP (.gdz) archive does not contain a .ged file.');
  }

  const rawGedcom = stripBom(strFromU8(gedEntry.bytes));
  const parsedGed = parseGedcom(rawGedcom);
  warnings.push(...parsedGed.warnings.map((w) => w.message));

  // Build normalized path lookup plus basename fallback map
  const byNormPath = new Map<string, { key: string; bytes: Uint8Array }>();
  const byBasename = new Map<string, Array<{ key: string; bytes: Uint8Array }>>();

  for (const [rawKey, entryBytes] of Object.entries(entries)) {
    const norm = normalizeZipPath(rawKey).toLowerCase();
    if (!norm || norm.endsWith('/')) continue;
    byNormPath.set(norm, { key: rawKey, bytes: entryBytes });
    const base = norm.split('/').pop();
    if (base) {
      const list = byBasename.get(base) ?? [];
      list.push({ key: rawKey, bytes: entryBytes });
      byBasename.set(base, list);
    }
  }

  const gedcomMediaBlobs = new Map<
    MediaId,
    { blob: Blob; filename: string; mimeType: string }
  >();

  for (const [mediaId, mediaObj] of Object.entries(parsedGed.tree.media)) {
    const fileRef = mediaObj.file?.trim();
    if (!fileRef || /^(https?:|data:|blob:)/i.test(fileRef)) continue;

    const normRef = normalizeZipPath(fileRef).toLowerCase();
    let matched =
      byNormPath.get(normRef) ?? byNormPath.get(`media/${normRef}`);

    if (!matched) {
      const base = normRef.split('/').pop();
      const candidates = base ? byBasename.get(base) : undefined;
      if (candidates && candidates.length === 1) {
        matched = candidates[0];
      }
    }

    if (!matched) {
      warnings.push(`Embedded media file not found in .gdz: ${fileRef}`);
      continue;
    }

    const mimeType =
      mediaObj.mimeType || inferMimeTypeFromFilename(fileRef) || 'image/jpeg';
    gedcomMediaBlobs.set(mediaId, {
      blob: new Blob([toBlobPartBytes(matched.bytes)], { type: mimeType }),
      filename: fileRef,
      mimeType,
    });
  }

  return {
    kind: 'gdz',
    tree: parsedGed.tree,
    rawGedcom,
    warnings,
    gedcomMediaBlobs,
    scrapbookAssetBlobs: new Map(),
  };
}

/**
 * Inspects a user-selected/dropped file and parses .ged, .json, .gdz, or .heirloom.zip.
 */
export async function detectAndLoadFile(
  file: File,
): Promise<LoadedBundleResult> {
  const lower = file.name.toLowerCase().trim();

  if (lower.endsWith('.json')) {
    const text = stripBom(await file.text());
    const parsed = parseFamilyTreeJson(text, { strict: false });
    if (!parsed.validation.valid) {
      throw new Error(
        parsed.validation.errors[0]?.message ?? 'Invalid JSON family tree file.',
      );
    }
    return {
      kind: 'json',
      tree: parsed.tree,
      warnings: parsed.validation.warnings.map((w) => w.message),
      gedcomMediaBlobs: new Map(),
      scrapbookAssetBlobs: new Map(),
    };
  }

  if (lower.endsWith('.gdz') || lower.endsWith('.zip')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const zipEntries = unzipSync(bytes);
    if (findZipEntry(zipEntries, 'scrapbook.json')) {
      return importHeirloomZipBytes(bytes);
    }
    if (
      findZipEntry(zipEntries, 'gedcom.ged') ||
      findFirstZipEntryByExtension(zipEntries, '.ged')
    ) {
      return importGdzBytes(bytes);
    }
    throw new Error(
      'ZIP archive does not contain scrapbook.json or a .ged family tree file.',
    );
  }

  const text = stripBom(await file.text());
  const parsed = parseGedcom(text);
  return {
    kind: 'gedcom',
    tree: parsed.tree,
    rawGedcom: text,
    warnings: parsed.warnings.map((w) => w.message),
    gedcomMediaBlobs: new Map(),
    scrapbookAssetBlobs: new Map(),
  };
}

function inferCertificateRoleFromTitle(title: string): CertificateRole | null {
  const lower = title.toLowerCase();
  if (/(birth|baptism|christen)/.test(lower)) return 'birth';
  if (/(marr|wedding|license|certificate of marriage)/.test(lower)) {
    return 'marriage';
  }
  if (/(death|burial|obituary|probate|will)/.test(lower)) return 'death';
  if (/census/.test(lower)) return 'census';
  if (/(certificate|record|register|deed|discharge|naturalization)/.test(lower)) {
    return 'other';
  }
  return null;
}

/**
 * Seeds Scrapbook portraits and archival image attachments from parsed .gdz media blobs,
 * deduplicating shared OBJE references so one marriage/census file is stored once.
 */
export function seedScrapbookFromGdzMedia(
  graph: FamilyGraph,
  baseDoc: ScrapbookDocument,
  gedcomMediaBlobs: ReadonlyMap<
    MediaId,
    { blob: Blob; filename: string; mimeType: string }
  >,
): { doc: ScrapbookDocument; assetBlobs: Map<string, Blob> } {
  const nextAssets: Record<string, ScrapbookAsset> = { ...baseDoc.assets };
  const assetBlobs = new Map<string, Blob>();
  const assetIdByMediaId = new Map<MediaId, string>();
  const usedPaths = new Set<string>(
    Object.values(nextAssets).map((a) => a.filename.toLowerCase()),
  );

  for (const [id, asset] of Object.entries(nextAssets)) {
    if (asset.sourceGedcomMediaId) {
      assetIdByMediaId.set(asset.sourceGedcomMediaId, id);
    }
  }

  const ensureAssetForMedia = (
    mediaId: MediaId,
  ): { assetId: string; mimeType: string; title: string } | null => {
    const item = gedcomMediaBlobs.get(mediaId);
    if (!item) return null;

    const mediaObj = graph.tree.media[mediaId];
    const title = mediaObj?.title || item.filename.split('/').pop() || mediaId;

    const existingId = assetIdByMediaId.get(mediaId);
    if (existingId && nextAssets[existingId]) {
      return {
        assetId: existingId,
        mimeType: nextAssets[existingId]!.mimeType,
        title,
      };
    }

    const assetId = `gdz_${mediaId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const filename = ensureUniqueMediaPath(
      item.filename,
      usedPaths,
      assetId,
      item.mimeType,
    );

    nextAssets[assetId] = {
      id: assetId,
      filename,
      mimeType: item.mimeType,
      sourceGedcomMediaId: mediaId,
      originalTitle: title,
      ...(mediaObj?.width !== undefined ? { width: mediaObj.width } : {}),
      ...(mediaObj?.height !== undefined ? { height: mediaObj.height } : {}),
    };
    assetBlobs.set(assetId, item.blob);
    assetIdByMediaId.set(mediaId, assetId);
    return { assetId, mimeType: item.mimeType, title };
  };

  const portraitMap: Record<PersonId, string> = {
    ...(baseDoc.personPortraitAssetIds ?? {}),
  };
  const primaryImageAssetByPerson = new Map<PersonId, string>();

  for (const person of graph.getAllPersons()) {
    if (person.media.length === 0) continue;
    const orderedRefs = [
      ...person.media.filter((m) => m.isPrimary),
      ...person.media.filter((m) => !m.isPrimary),
    ];

    for (const ref of orderedRefs) {
      const seeded = ensureAssetForMedia(ref.mediaId);
      if (seeded && seeded.mimeType.startsWith('image/')) {
        primaryImageAssetByPerson.set(person.id, seeded.assetId);
        if (!portraitMap[person.id]) {
          portraitMap[person.id] = seeded.assetId;
        }
        break;
      }
    }
  }

  const nextEntries = baseDoc.entries.map((entry) => {
    const person = graph.getPerson(entry.personId);
    if (!person) return entry;

    const portraitAssetId =
      entry.portraitAssetId ??
      portraitMap[entry.personId] ??
      primaryImageAssetByPerson.get(entry.personId);

    const certificates: CertificateAttachment[] = [...entry.certificates];
    const extraPhotos = [...entry.extraPhotos];
    const usedInEntry = new Set<string>([
      ...(portraitAssetId ? [portraitAssetId] : []),
      ...certificates.map((c) => c.assetId),
      ...extraPhotos.map((p) => p.assetId),
    ]);

    for (const ref of person.media) {
      const seeded = ensureAssetForMedia(ref.mediaId);
      if (!seeded || usedInEntry.has(seeded.assetId)) continue;

      if (!seeded.mimeType.startsWith('image/')) continue;

      usedInEntry.add(seeded.assetId);
      const inferredRole = inferCertificateRoleFromTitle(seeded.title);
      if (inferredRole) {
        certificates.push({
          id: `cert_${entry.personId}_${seeded.assetId}`,
          assetId: seeded.assetId,
          role: inferredRole,
          title: seeded.title,
          highlights: [],
          rotationDeg: deterministicTilt(
            `cert:${entry.personId}:${seeded.assetId}`,
            2.2,
          ),
          zOrder: certificates.length + 1,
        });
      } else {
        extraPhotos.push({
          id: `photo_${entry.personId}_${seeded.assetId}`,
          assetId: seeded.assetId,
          caption: seeded.title,
          rotationDeg: deterministicTilt(
            `photo:${entry.personId}:${seeded.assetId}`,
            2.8,
          ),
        });
      }
    }

    return {
      ...entry,
      ...(portraitAssetId ? { portraitAssetId } : {}),
      certificates,
      extraPhotos,
    };
  });

  return {
    doc: {
      ...baseDoc,
      entries: nextEntries,
      assets: nextAssets,
      personPortraitAssetIds: portraitMap,
    },
    assetBlobs,
  };
}
