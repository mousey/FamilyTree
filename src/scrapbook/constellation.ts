import { compareGenealogicalDates } from '../core/dates.js';
import type { FamilyGraph, LineageMode } from '../core/graph.js';
import type { Person, PersonId } from '../core/types.js';
import { extractPersonPlaces } from './biography.js';
import {
  SCRAPBOOK_SCHEMA_VERSION,
  type ConstellationRole,
  type ScrapbookDocument,
  type ScrapbookPersonEntry,
} from './types.js';

export interface ConstellationMember {
  personId: PersonId;
  role: ConstellationRole;
}

function sortByBirthDate(persons: Person[]): Person[] {
  return [...persons].sort((a, b) => {
    const cmp = compareGenealogicalDates(a.birth?.date, b.birth?.date);
    if (cmp !== 0) return cmp;
    return a.name.display.localeCompare(b.name.display);
  });
}

/**
 * Extracts the immediate family constellation around `focusPersonId`:
 * focus -> spouse(s) -> children -> siblings -> parents -> grandparents.
 * Guarantees each PersonId appears at most once even under remarriages or pedigree collapse.
 */
export function extractImmediateConstellation(
  graph: FamilyGraph,
  focusPersonId: PersonId,
  lineageMode: LineageMode = 'all',
): ConstellationMember[] {
  const result: ConstellationMember[] = [];
  const seen = new Set<PersonId>();

  const pushUnique = (personId: PersonId, role: ConstellationRole) => {
    if (seen.has(personId) || !graph.getPerson(personId)) return;
    seen.add(personId);
    result.push({ personId, role });
  };

  if (!graph.getPerson(focusPersonId)) {
    return result;
  }

  // 1. Focus
  pushUnique(focusPersonId, 'focus');

  // 2. Spouses / Partners
  for (const spouse of graph.getPartners(focusPersonId)) {
    pushUnique(spouse.id, 'spouse');
  }

  // 3. Children (chronological)
  const children = sortByBirthDate(
    graph.getChildren(focusPersonId, { lineageMode }),
  );
  for (const child of children) {
    pushUnique(child.id, 'child');
  }

  // 4. Siblings (full, half, step, chronological)
  const siblings = sortByBirthDate(
    graph
      .getSiblings(focusPersonId, {
        includeHalf: true,
        includeStep: true,
        lineageMode,
      })
      .map((s) => s.person),
  );
  for (const sib of siblings) {
    pushUnique(sib.id, 'sibling');
  }

  // 5. Parents
  const parents = graph.getParents(focusPersonId, { lineageMode });
  for (const parent of parents) {
    pushUnique(parent.id, 'parent');
  }

  // 6. Grandparents
  for (const parent of parents) {
    for (const gp of graph.getParents(parent.id, { lineageMode })) {
      pushUnique(gp.id, 'grandparent');
    }
  }

  return result;
}

export function createScrapbookPersonEntry(
  graph: FamilyGraph,
  personId: PersonId,
  role: ConstellationRole,
  existing?: ScrapbookPersonEntry,
  portraitAssetId?: string,
): ScrapbookPersonEntry {
  if (existing) {
    return {
      ...existing,
      role,
      portraitAssetId: existing.portraitAssetId ?? portraitAssetId,
    };
  }

  return {
    personId,
    role,
    included: true,
    compactMode: false,
    pages: {
      profile: true,
      paperwork: true,
      storyPlaces: true,
    },
    ...(portraitAssetId ? { portraitAssetId } : {}),
    certificates: [],
    extraPhotos: [],
    places: extractPersonPlaces(graph, personId),
  };
}

function buildDefaultSubtitle(
  graph: FamilyGraph,
  focusPersonId: PersonId,
  members: ConstellationMember[],
): string {
  const focus = graph.getPerson(focusPersonId);
  const years: number[] = [];
  for (const m of members) {
    const p = graph.getPerson(m.personId);
    if (p?.birth?.date?.start?.year) years.push(p.birth.date.start.year);
    if (p?.death?.date?.start?.year) years.push(p.death.date.start.year);
  }
  const focusName = focus?.name.display ?? 'Family Constellation';
  if (years.length >= 2) {
    const minY = Math.min(...years);
    const maxY = Math.max(...years);
    return `Curated around ${focusName} · ${minY}–${maxY}`;
  }
  return `Curated around ${focusName}`;
}

/**
 * Builds or rebuilds a ScrapbookDocument around `focusPersonId`, preserving any
 * previously curated entries, portraits, certificates, stories, and assets.
 */
export function createDefaultScrapbookDocument(
  graph: FamilyGraph,
  focusPersonId: PersonId,
  options?: {
    existingDoc?: ScrapbookDocument;
    lineageMode?: LineageMode;
  },
): ScrapbookDocument {
  const existingDoc = options?.existingDoc;
  const lineageMode = options?.lineageMode ?? 'all';
  const members = extractImmediateConstellation(graph, focusPersonId, lineageMode);

  const existingByPerson = new Map<PersonId, ScrapbookPersonEntry>();
  if (existingDoc) {
    for (const entry of existingDoc.entries) {
      existingByPerson.set(entry.personId, entry);
    }
  }

  const portraitMap = existingDoc?.personPortraitAssetIds ?? {};
  const entries: ScrapbookPersonEntry[] = [];
  const coveredIds = new Set<PersonId>();

  for (const member of members) {
    coveredIds.add(member.personId);
    entries.push(
      createScrapbookPersonEntry(
        graph,
        member.personId,
        member.role,
        existingByPerson.get(member.personId),
        portraitMap[member.personId],
      ),
    );
  }

  // Keep any manually-added 'custom' entries that still exist in the graph
  if (existingDoc) {
    for (const prev of existingDoc.entries) {
      if (
        prev.role === 'custom' &&
        !coveredIds.has(prev.personId) &&
        graph.getPerson(prev.personId)
      ) {
        coveredIds.add(prev.personId);
        entries.push({
          ...prev,
          portraitAssetId: prev.portraitAssetId ?? portraitMap[prev.personId],
        });
      }
    }
  }

  const focusPerson = graph.getPerson(focusPersonId);
  const surname = focusPerson?.name.surname?.trim();
  const defaultTitle = surname
    ? `The ${surname} Family Album`
    : graph.tree.metadata.title
      ? `${graph.tree.metadata.title} — Album`
      : 'Heirloom Family Album';

  const sameFocus = existingDoc?.focusPersonId === focusPersonId;

  return {
    schemaVersion: SCRAPBOOK_SCHEMA_VERSION,
    title: sameFocus && existingDoc?.title ? existingDoc.title : defaultTitle,
    subtitle:
      sameFocus && existingDoc?.subtitle
        ? existingDoc.subtitle
        : buildDefaultSubtitle(graph, focusPersonId, members),
    focusPersonId,
    paperSize: existingDoc?.paperSize ?? 'a4',
    inkSaverPrint: existingDoc?.inkSaverPrint ?? false,
    autoSkipEmptyPages: existingDoc?.autoSkipEmptyPages ?? true,
    entries,
    assets: existingDoc?.assets ? { ...existingDoc.assets } : {},
    personPortraitAssetIds: { ...portraitMap },
  };
}
