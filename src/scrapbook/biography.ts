import {
  compareGenealogicalDates,
  formatGenealogicalDate,
} from '../core/dates.js';
import type { FamilyGraph } from '../core/graph.js';
import type { LifeEvent, PersonId } from '../core/types.js';
import type { PlaceSnapshot, TimelineRow } from './types.js';

function formatEventTypeLabel(event: LifeEvent): string {
  if (event.customType) return event.customType;
  const spaced = event.type.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Builds a chronological life-event timeline for a person, including birth,
 * life events, partner marriages/divorces, and death.
 */
export function buildPersonTimeline(
  graph: FamilyGraph,
  personId: PersonId,
): TimelineRow[] {
  const person = graph.getPerson(personId);
  if (!person) return [];

  const partnerUnions = graph.getUnionsAsPartner(personId);
  const items: TimelineRow[] = [];

  if (person.birth) {
    items.push({
      id: 'birth',
      label: 'Birth',
      date: person.birth.date,
      place: person.birth.place,
      description: person.birth.description,
      notes: person.birth.notes,
    });
  }

  person.events.forEach((ev, idx) => {
    items.push({
      id: `ev_${idx}`,
      label: formatEventTypeLabel(ev),
      date: ev.date,
      place: ev.place,
      description: ev.description,
      notes: ev.notes,
    });
  });

  for (const union of partnerUnions) {
    const coPartner = union.partners.find((p) => p.personId !== personId);
    const coName = coPartner
      ? graph.getPerson(coPartner.personId)?.name.display
      : undefined;
    if (union.marriage) {
      items.push({
        id: `marr_${union.id}`,
        label: coName ? `Marriage to ${coName}` : 'Marriage',
        date: union.marriage.date,
        place: union.marriage.place,
        notes: union.marriage.notes,
      });
    }
    if (union.divorce) {
      items.push({
        id: `div_${union.id}`,
        label: coName ? `Divorce from ${coName}` : 'Divorce',
        date: union.divorce.date,
        place: union.divorce.place,
        notes: union.divorce.notes,
      });
    }
  }

  if (person.death) {
    items.push({
      id: 'death',
      label: 'Death',
      date: person.death.date,
      place: person.death.place,
      description: person.death.description,
      notes: person.death.notes,
    });
  }

  return items.sort((a, b) => compareGenealogicalDates(a.date, b.date));
}

function normalizePlaceKey(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Extracts deduplicated Places Lived / historical locations from a person's
 * vital events, residences, censuses, and marriages in chronological order.
 */
export function extractPersonPlaces(
  graph: FamilyGraph,
  personId: PersonId,
): PlaceSnapshot[] {
  const timeline = buildPersonTimeline(graph, personId);
  const byKey = new Map<string, PlaceSnapshot>();
  let idx = 0;

  for (const row of timeline) {
    const rawPlace = row.place?.trim();
    if (!rawPlace) continue;

    const key = normalizePlaceKey(rawPlace);
    const yearStr = row.date?.start?.year
      ? String(row.date.start.year)
      : row.date
        ? formatGenealogicalDate(row.date)
        : undefined;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        id: `place_${personId}_${idx++}`,
        address: rawPlace,
        ...(yearStr ? { yearLabel: yearStr } : {}),
        eventLabel: row.label,
      });
    } else if (!existing.yearLabel && yearStr) {
      existing.yearLabel = yearStr;
    }
  }

  return [...byKey.values()];
}

function joinNaturalList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Deterministically drafts a warm 1–2 paragraph biography strictly from
 * recorded GEDCOM facts without inventing missing details.
 */
export function generateStarterBiography(
  graph: FamilyGraph,
  personId: PersonId,
): string {
  const person = graph.getPerson(personId);
  if (!person) return '';

  const name = person.name.display || 'This individual';
  const pronounSubject =
    person.sex === 'female' ? 'She' : person.sex === 'male' ? 'He' : 'They';
  const pronounObject =
    person.sex === 'female' ? 'her' : person.sex === 'male' ? 'him' : 'them';
  const pronounPossessive =
    person.sex === 'female' ? 'her' : person.sex === 'male' ? 'his' : 'their';
  const verbToBe = person.sex === 'other' || person.sex === 'unknown' ? 'were' : 'was';

  const sentences: string[] = [];

  // Birth & parentage sentence
  const parents = graph.getParents(personId);
  const parentNames = parents.map((p) => p.name.display).filter(Boolean);
  const birthDate = person.birth?.date
    ? formatGenealogicalDate(person.birth.date)
    : '';
  const birthPlace = person.birth?.place?.trim();

  if (birthDate || birthPlace || parentNames.length > 0) {
    let intro = `${name} ${verbToBe} born`;
    if (birthDate) intro += ` on ${birthDate}`;
    if (birthPlace) intro += ` in ${birthPlace}`;
    if (parentNames.length > 0) {
      intro += `, the child of ${joinNaturalList(parentNames)}`;
    }
    sentences.push(`${intro}.`);
  } else {
    sentences.push(`${name} is recorded in the family archive.`);
  }

  // Siblings
  const siblings = graph.getSiblings(personId, { includeHalf: true });
  if (siblings.length > 0) {
    const sibWord = siblings.length === 1 ? 'sibling' : 'siblings';
    const sibNames = siblings.slice(0, 4).map((s) => s.person.name.display);
    const tail =
      siblings.length > 4 ? `, alongside ${siblings.length - 4} more` : '';
    sentences.push(
      `${pronounSubject} grew up with ${siblings.length} ${sibWord} (${joinNaturalList(sibNames)}${tail}).`,
    );
  }

  // Occupations & residences
  const occupations = person.events
    .filter((e) => e.type === 'occupation' && (e.description || e.place))
    .map((e) => e.description?.trim())
    .filter((d): d is string => Boolean(d));
  if (occupations.length > 0) {
    const uniqOcc = [...new Set(occupations)];
    sentences.push(
      `Known occupations during ${pronounPossessive} life included ${joinNaturalList(uniqOcc)}.`,
    );
  }

  const residences = extractPersonPlaces(graph, personId);
  const resPlaces = residences
    .filter((r) => r.eventLabel === 'Residence' || r.eventLabel === 'Census')
    .map((r) => (r.yearLabel ? `${r.address} (${r.yearLabel})` : r.address));
  if (resPlaces.length > 0) {
    sentences.push(
      `Records place ${pronounObject} living at ${joinNaturalList(resPlaces.slice(0, 4))}.`,
    );
  }

  // Second paragraph: marriages, children, death
  const paragraph2: string[] = [];
  const partnerUnions = graph.getUnionsAsPartner(personId);
  if (partnerUnions.length > 0) {
    const unionDescriptions: string[] = [];
    for (const u of partnerUnions) {
      const coPartner = u.partners.find((p) => p.personId !== personId);
      const partnerName = coPartner
        ? graph.getPerson(coPartner.personId)?.name.display
        : undefined;
      const mDate = u.marriage?.date
        ? formatGenealogicalDate(u.marriage.date)
        : '';
      const mPlace = u.marriage?.place?.trim();
      let desc = partnerName ? `married ${partnerName}` : 'entered a union';
      if (mDate) desc += ` on ${mDate}`;
      if (mPlace) desc += ` in ${mPlace}`;
      unionDescriptions.push(desc);
    }
    if (unionDescriptions.length > 0) {
      paragraph2.push(
        `${pronounSubject} ${joinNaturalList(unionDescriptions)}.`,
      );
    }
  }

  const children = graph.getChildren(personId);
  if (children.length > 0) {
    const childNames = children.map((c) => c.name.display);
    const childWord = children.length === 1 ? 'child' : 'children';
    paragraph2.push(
      `Together with family, ${name} raised ${children.length} ${childWord}: ${joinNaturalList(childNames)}.`,
    );
  }

  const deathDate = person.death?.date
    ? formatGenealogicalDate(person.death.date)
    : '';
  const deathPlace = person.death?.place?.trim();
  if (person.death && (deathDate || deathPlace)) {
    let deathSentence = `${pronounSubject} passed away`;
    if (deathDate) deathSentence += ` on ${deathDate}`;
    if (deathPlace) deathSentence += ` in ${deathPlace}`;
    paragraph2.push(`${deathSentence}.`);
  }

  const p1 = sentences.join(' ');
  const p2 = paragraph2.join(' ');
  return p2 ? `${p1}\n\n${p2}` : p1;
}
