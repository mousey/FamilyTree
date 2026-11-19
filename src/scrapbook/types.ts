import type { GenealogicalDate, MediaId, PersonId } from '../core/types.js';

export const SCRAPBOOK_SCHEMA_VERSION = '1.0.0' as const;

export type ScrapbookAssetKind = 'portrait' | 'photo' | 'certificate' | 'place';

export type CertificateRole = 'birth' | 'marriage' | 'death' | 'census' | 'other';

export type HighlightStyle = 'amber_highlighter' | 'red_circle' | 'spotlight';

export type LocalSaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'unavailable'
  | 'quota_exceeded';

export interface TimelineRow {
  id: string;
  label: string;
  date?: GenealogicalDate;
  place?: string;
  description?: string;
  notes?: string[];
}

/** Normalized 0..1 coordinates relative to the rendered image dimensions */
export interface DocumentHighlight {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style: HighlightStyle;
  label?: string;
  showZoomCallout?: boolean;
}

/** Deduplicated binary asset stored once in media/ inside .heirloom.zip */
export interface ScrapbookAsset {
  id: string;
  filename: string;
  mimeType: string;
  sourceGedcomMediaId?: MediaId;
  width?: number;
  height?: number;
  /** If uploaded as PDF, page number rasterized for display (1-indexed) */
  pdfPageNumber?: number;
  pdfPageCount?: number;
  originalTitle?: string;
}

export interface PolaroidSlot {
  id: string;
  assetId: string;
  caption: string;
  dateLabel?: string;
  rotationDeg: number;
}

export interface CertificateAttachment {
  id: string;
  assetId: string;
  role: CertificateRole;
  title: string;
  dateLabel?: string;
  highlights: DocumentHighlight[];
  rotationDeg: number;
  zOrder: number;
}

export interface PlaceSnapshot {
  id: string;
  address: string;
  yearLabel?: string;
  eventLabel?: string;
  assetId?: string;
  caption?: string;
}

export type PersonPageToggle = {
  profile: boolean;
  paperwork: boolean;
  storyPlaces: boolean;
};

export type ConstellationRole =
  | 'focus'
  | 'spouse'
  | 'child'
  | 'sibling'
  | 'parent'
  | 'grandparent'
  | 'custom';

export interface ScrapbookPersonEntry {
  personId: PersonId;
  role: ConstellationRole;
  included: boolean;
  compactMode: boolean;
  pages: PersonPageToggle;
  portraitAssetId?: string;
  groupPolaroid?: PolaroidSlot;
  certificates: CertificateAttachment[];
  biographyText?: string;
  extraPhotos: PolaroidSlot[];
  places: PlaceSnapshot[];
}

export interface ScrapbookDocument {
  schemaVersion: typeof SCRAPBOOK_SCHEMA_VERSION;
  title: string;
  subtitle?: string;
  focusPersonId: PersonId;
  paperSize: 'a4' | 'letter';
  inkSaverPrint: boolean;
  autoSkipEmptyPages: boolean;
  /** Ordered list of chapters (supports user reordering in the Outline rail) */
  entries: ScrapbookPersonEntry[];
  assets: Record<string, ScrapbookAsset>;
  /**
   * Maps any person in the tree to a portrait asset ID so portraits attached via
   * DetailDrawer persist and sync cleanly even outside the current constellation.
   */
  personPortraitAssetIds?: Record<PersonId, string>;
}

/** Computed pagination output consumed by Workstream B */
export type BookletPage =
  | {
      id: string;
      pageNumber: number;
      kind: 'cover_tree';
      title: string;
      subtitle?: string;
      focusPersonId: PersonId;
      includedPersonIds: PersonId[];
    }
  | {
      id: string;
      pageNumber: number;
      kind: 'profile' | 'paperwork' | 'story_places' | 'compact_profile';
      personId: PersonId;
      entry: ScrapbookPersonEntry;
      isEmpty: boolean;
    };

export interface BookSpread {
  spreadIndex: number;
  /** Spread 0 is a single right-hand cover page (left: null, right: CoverPage) */
  left: BookletPage | null;
  right: BookletPage | null;
}

/** Mutation & lookup API exposed by useScrapbookStore() to Workstream B */
export interface ScrapbookStoreApi {
  doc: ScrapbookDocument;
  pages: BookletPage[];
  spreads: BookSpread[];
  /** Runtime object URLs for rendering <img src={...}> (keyed by assetId) */
  assetUrls: ReadonlyMap<string, string>;
  /** True if unsaved edits exist since last .heirloom.zip export */
  isDirty: boolean;
  /** IndexedDB local persistence status for subtle UI indicator */
  localSaveStatus: LocalSaveStatus;
  /** Timestamp (ms) of last successful IndexedDB local auto-save */
  lastLocalSavedAt: number | null;

  // Document settings
  setTitle: (title: string, subtitle?: string) => void;
  setPaperSize: (size: 'a4' | 'letter') => void;
  setInkSaverPrint: (enabled: boolean) => void;
  setAutoSkipEmptyPages: (enabled: boolean) => void;

  // Outline & constellation curation
  rebuildForFocusPerson: (focusPersonId: PersonId) => void;
  togglePersonIncluded: (personId: PersonId, included: boolean) => void;
  togglePersonCompactMode: (personId: PersonId, compact: boolean) => void;
  togglePersonPage: (
    personId: PersonId,
    page: keyof PersonPageToggle,
    enabled: boolean,
  ) => void;
  reorderEntries: (fromIndex: number, toIndex: number) => void;
  addCustomPerson: (personId: PersonId) => void;

  // Asset ingestion (handles image compression + PDF rasterization automatically)
  attachPortrait: (personId: PersonId, file: File | Blob) => Promise<void>;
  attachGroupPolaroid: (
    personId: PersonId,
    file: File | Blob,
    caption?: string,
  ) => Promise<void>;
  updatePolaroidCaption: (
    personId: PersonId,
    slotId: string,
    caption: string,
    dateLabel?: string,
  ) => void;
  attachExtraPhoto: (
    personId: PersonId,
    file: File | Blob,
    caption?: string,
  ) => Promise<void>;
  removeExtraPhoto: (personId: PersonId, slotId: string) => void;

  // Certificates & record highlights
  attachCertificate: (
    personId: PersonId,
    file: File | Blob,
    role: CertificateRole,
    title?: string,
    pdfPageNumber?: number,
  ) => Promise<void>;
  reuseExistingAssetAsCertificate: (
    personId: PersonId,
    assetId: string,
    role: CertificateRole,
    title: string,
  ) => void;
  updateCertificateHighlights: (
    personId: PersonId,
    certificateId: string,
    highlights: DocumentHighlight[],
  ) => void;
  bringCertificateToFront: (personId: PersonId, certificateId: string) => void;
  removeCertificate: (personId: PersonId, certificateId: string) => void;

  // Biography & places
  setBiographyText: (personId: PersonId, text: string) => void;
  attachPlaceSnapshot: (
    personId: PersonId,
    placeId: string,
    file: File | Blob,
  ) => Promise<void>;
  addPlace: (personId: PersonId, address: string, yearLabel?: string) => void;
  updatePlaceCaption: (personId: PersonId, placeId: string, caption: string) => void;
  removePlace: (personId: PersonId, placeId: string) => void;

  // Bundle IO
  exportHeirloomZip: () => Promise<Blob>;
  importBundleFile: (
    file: File,
  ) => Promise<{ treeGedcom: string; loadedScrapbook: boolean }>;
  clearLocalDraft: () => Promise<void>;
}

/** Clamps highlight normalized coordinates strictly within [0, 1] and x+w <= 1, y+h <= 1. */
export function clampHighlight(h: DocumentHighlight): DocumentHighlight {
  const rawX = Number.isFinite(h.x) ? h.x : 0;
  const rawY = Number.isFinite(h.y) ? h.y : 0;
  const rawW = Number.isFinite(h.width) ? h.width : 0.01;
  const rawH = Number.isFinite(h.height) ? h.height : 0.01;

  const x = Math.min(0.99, Math.max(0, rawX));
  const y = Math.min(0.99, Math.max(0, rawY));
  const width = Math.min(1 - x, Math.max(0.01, rawW));
  const height = Math.min(1 - y, Math.max(0.01, rawH));

  return {
    ...h,
    x,
    y,
    width,
    height,
  };
}

/** Collects every assetId referenced by entries or personPortraitAssetIds for GC. */
export function collectReferencedAssetIds(doc: ScrapbookDocument): Set<string> {
  const referenced = new Set<string>();

  if (doc.personPortraitAssetIds) {
    for (const assetId of Object.values(doc.personPortraitAssetIds)) {
      if (assetId) referenced.add(assetId);
    }
  }

  for (const entry of doc.entries) {
    if (entry.portraitAssetId) referenced.add(entry.portraitAssetId);
    if (entry.groupPolaroid?.assetId) referenced.add(entry.groupPolaroid.assetId);
    for (const cert of entry.certificates) {
      if (cert.assetId) referenced.add(cert.assetId);
    }
    for (const photo of entry.extraPhotos) {
      if (photo.assetId) referenced.add(photo.assetId);
    }
    for (const place of entry.places) {
      if (place.assetId) referenced.add(place.assetId);
    }
  }

  return referenced;
}

/** Produces a stable deterministic tilt in [-maxDeg, +maxDeg] from any string seed. */
export function deterministicTilt(seed: string, maxDeg = 2.8): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unit = ((hash >>> 0) % 10001) / 10000; // 0..1
  const scaled = (unit * 2 - 1) * maxDeg;
  return Math.round(scaled * 10) / 10;
}
