import type {
  BookletPage,
  BookSpread,
  ScrapbookDocument,
  ScrapbookPersonEntry,
} from './types.js';

export function isEntryPageEmpty(
  entry: ScrapbookPersonEntry,
  pageKind: 'profile' | 'paperwork' | 'story_places' | 'compact_profile',
): boolean {
  switch (pageKind) {
    case 'profile':
    case 'compact_profile':
      return false;
    case 'paperwork':
      return entry.certificates.length === 0;
    case 'story_places': {
      const hasCustomBio = Boolean(entry.biographyText?.trim());
      const hasExtraPhotos = entry.extraPhotos.length > 0;
      const hasPlaceImage = entry.places.some((p) => Boolean(p.assetId));
      return !hasCustomBio && !hasExtraPhotos && !hasPlaceImage;
    }
  }
}

/**
 * Builds the ordered flat list of booklet pages with 1-based page numbers.
 * In 'preview' or 'print' mode, empty optional pages are omitted when autoSkipEmptyPages is true.
 */
export function buildBookletPages(
  doc: ScrapbookDocument,
  options: { mode: 'edit' | 'preview' | 'print' },
): BookletPage[] {
  const includedEntries = doc.entries.filter((e) => e.included);
  const includedPersonIds = includedEntries.map((e) => e.personId);
  const skipEmpty =
    (options.mode === 'preview' || options.mode === 'print') &&
    doc.autoSkipEmptyPages;

  const rawPages: BookletPage[] = [
    {
      id: 'cover_tree',
      pageNumber: 1,
      kind: 'cover_tree',
      title: doc.title,
      ...(doc.subtitle !== undefined ? { subtitle: doc.subtitle } : {}),
      focusPersonId: doc.focusPersonId,
      includedPersonIds,
    },
  ];

  for (const entry of includedEntries) {
    if (entry.compactMode) {
      rawPages.push({
        id: `${entry.personId}:compact`,
        pageNumber: 0,
        kind: 'compact_profile',
        personId: entry.personId,
        entry,
        isEmpty: false,
      });
      continue;
    }

    const candidates: Array<{
      enabled: boolean;
      kind: 'profile' | 'paperwork' | 'story_places';
    }> = [
      { enabled: entry.pages.profile, kind: 'profile' },
      { enabled: entry.pages.paperwork, kind: 'paperwork' },
      { enabled: entry.pages.storyPlaces, kind: 'story_places' },
    ];

    for (const c of candidates) {
      if (!c.enabled) continue;
      const isEmpty = isEntryPageEmpty(entry, c.kind);
      if (skipEmpty && isEmpty) continue;
      rawPages.push({
        id: `${entry.personId}:${c.kind}`,
        pageNumber: 0,
        kind: c.kind,
        personId: entry.personId,
        entry,
        isEmpty,
      });
    }
  }

  return rawPages.map((page, idx) => ({
    ...page,
    pageNumber: idx + 1,
  }));
}

/**
 * Groups sequential pages into 2-up book spreads:
 * Spread 0 = { left: null, right: CoverPage }, followed by pairs (2,3), (4,5), ...
 */
export function groupIntoSpreads(pages: BookletPage[]): BookSpread[] {
  if (pages.length === 0) return [];

  const spreads: BookSpread[] = [
    {
      spreadIndex: 0,
      left: null,
      right: pages[0]!,
    },
  ];

  let idx = 1;
  let spreadIndex = 1;
  while (idx < pages.length) {
    spreads.push({
      spreadIndex: spreadIndex++,
      left: pages[idx] ?? null,
      right: pages[idx + 1] ?? null,
    });
    idx += 2;
  }

  return spreads;
}
