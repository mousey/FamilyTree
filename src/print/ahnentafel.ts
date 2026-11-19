import {
  formatGenealogicalDate,
  formatLifespan,
  getEffectiveParentRelation,
  matchesLineageMode,
  type FamilyGraph,
  type LineageMode,
  type Person,
  type PersonId,
  type Union,
} from '../core/index.js';

export interface PedigreeSlot {
  /** 1-based Ahnentafel index (1 = focus, 2k = paternal/partner1, 2k+1 = maternal/partner2) */
  ahnentafel: number;
  /** Generation index (0 = focus, 1 = parents, 2 = grandparents, ...) */
  generation: number;
  /** 0-based slot within this generation (0 .. 2^generation - 1) */
  slotIndex: number;
  person?: Person;
  /** True when this person already appeared at a smaller Ahnentafel index (pedigree collapse) */
  isDuplicate: boolean;
  /** Union connecting this slot's two parents (2*ahnentafel and 2*ahnentafel + 1), if any */
  parentUnion?: Union;
}

export interface PedigreeTreeData {
  focusPerson: Person;
  focusSpouse?: Person;
  focusChildren: Person[];
  maxGenerations: number;
  /** Map from Ahnentafel index -> PedigreeSlot (includes empty slots up to maxGenerations) */
  slots: Map<number, PedigreeSlot>;
  /** Slots grouped by generation 0..maxGenerations */
  byGeneration: PedigreeSlot[][];
  populatedCount: number;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function truncateText(text: string, maxChars: number): string {
  if (maxChars <= 1) return text.slice(0, 1);
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export function getPersonInitials(person: Person): string {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (given && surname) {
    return `${given[0] ?? ''}${surname[0] ?? ''}`.toUpperCase();
  }
  const parts = person.name.display.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

export function formatCompactBirth(person: Person): string {
  const d = person.birth?.date ? formatGenealogicalDate(person.birth.date, 'short') : '';
  const p = person.birth?.place?.split(',')[0]?.trim() ?? '';
  return [d, p].filter(Boolean).join(' · ');
}

export function formatCompactDeath(person: Person): string {
  const d = person.death?.date ? formatGenealogicalDate(person.death.date, 'short') : '';
  const p = person.death?.place?.split(',')[0]?.trim() ?? '';
  return [d, p].filter(Boolean).join(' · ');
}

export function formatCompactMarriage(union: Union | undefined): string {
  if (!union?.marriage) return '';
  const d = union.marriage.date ? formatGenealogicalDate(union.marriage.date, 'short') : '';
  const p = union.marriage.place?.split(',')[0]?.trim() ?? '';
  return [d, p].filter(Boolean).join(' · ');
}

export function formatCompactLifespan(person: Person): string {
  return formatLifespan(person.birth, person.death);
}

/**
 * Selects the primary parent union for a person given a lineageMode, preferring
 * biological unions first (or legal/first union if none are biological).
 */
function pickPrimaryParentUnion(
  graph: FamilyGraph,
  personId: PersonId,
  lineageMode: LineageMode,
): { union: Union; father?: Person; mother?: Person } | undefined {
  const candidateUnions = graph.getUnionsAsChild(personId).filter((u) => {
    const link = u.children.find((c) => c.personId === personId);
    if (!link) return false;
    return u.partners.some((p) =>
      matchesLineageMode(getEffectiveParentRelation(link, p.personId), lineageMode),
    );
  });

  if (candidateUnions.length === 0) return undefined;

  // Prefer biological union when multiple FAMC exist (e.g., biological + adoptive)
  const sorted = [...candidateUnions].sort((a, b) => {
    const aBio = a.children.find((c) => c.personId === personId)?.pedigree === 'biological' ? 0 : 1;
    const bBio = b.children.find((c) => c.personId === personId)?.pedigree === 'biological' ? 0 : 1;
    if (aBio !== bBio) return aBio - bBio;
    return a.id.localeCompare(b.id);
  });

  const union = sorted[0]!;
  const link = union.children.find((c) => c.personId === personId)!;
  const eligible = union.partners.filter((p) =>
    matchesLineageMode(getEffectiveParentRelation(link, p.personId), lineageMode),
  );

  let father: Person | undefined;
  let mother: Person | undefined;

  // Assign husband/male -> father slot (2k), wife/female -> mother slot (2k+1), handling same-sex cleanly
  const unassigned: Person[] = [];
  for (const partner of eligible) {
    const p = graph.getPerson(partner.personId);
    if (!p) continue;
    if ((partner.role === 'husband' || p.sex === 'male') && !father) {
      father = p;
    } else if ((partner.role === 'wife' || p.sex === 'female') && !mother) {
      mother = p;
    } else {
      unassigned.push(p);
    }
  }

  for (const p of unassigned) {
    if (!father) father = p;
    else if (!mother) mother = p;
  }

  return { union, father, mother };
}

/**
 * Builds a complete binary Ahnentafel pedigree structure from generation 0 up to maxGenerations.
 */
export function buildPedigreeSlots(
  graph: FamilyGraph,
  focusPersonId: PersonId,
  maxGenerations: number,
  options: { lineageMode?: LineageMode; includeSpouses?: boolean } = {},
): PedigreeTreeData {
  const focusPerson = graph.getPerson(focusPersonId);
  if (!focusPerson) {
    throw new Error(`Focus person "${focusPersonId}" not found in graph.`);
  }

  const lineageMode = options.lineageMode ?? 'all';
  const clampedGen = Math.max(0, Math.min(7, maxGenerations));
  const slots = new Map<number, PedigreeSlot>();
  const byGeneration: PedigreeSlot[][] = [];
  const seenPersons = new Set<PersonId>([focusPerson.id]);

  // Focus spouse & children (optional embellishments for Botanical Oak Tree)
  const partnerUnions = graph.getUnionsAsPartner(focusPersonId);
  const firstUnion = partnerUnions[0];
  const focusSpouseId =
    options.includeSpouses !== false
      ? firstUnion?.partners.find((p) => p.personId !== focusPersonId)?.personId
      : undefined;
  const focusSpouse = focusSpouseId ? graph.getPerson(focusSpouseId) : undefined;
  const focusChildren = graph.getChildren(focusPersonId, { lineageMode });

  let populatedCount = 1;

  // Generation 0: Focus person at index 1
  const rootSlot: PedigreeSlot = {
    ahnentafel: 1,
    generation: 0,
    slotIndex: 0,
    person: focusPerson,
    isDuplicate: false,
  };
  slots.set(1, rootSlot);
  byGeneration.push([rootSlot]);

  for (let g = 1; g <= clampedGen; g++) {
    const count = 1 << g;
    const genArr: PedigreeSlot[] = [];
    const baseIndex = count; // 2^g

    for (let s = 0; s < count; s++) {
      const ahn = baseIndex + s;
      const childAhn = ahn >> 1;
      const isMotherSlot = (ahn & 1) === 1;
      const childSlot = slots.get(childAhn);

      let person: Person | undefined;
      if (childSlot?.person) {
        const parents = pickPrimaryParentUnion(graph, childSlot.person.id, lineageMode);
        if (parents) {
          childSlot.parentUnion = parents.union;
          person = isMotherSlot ? parents.mother : parents.father;
        }
      }

      let isDuplicate = false;
      if (person) {
        populatedCount++;
        if (seenPersons.has(person.id)) {
          isDuplicate = true;
        } else {
          seenPersons.add(person.id);
        }
      }

      const slot: PedigreeSlot = {
        ahnentafel: ahn,
        generation: g,
        slotIndex: s,
        person,
        isDuplicate,
      };
      slots.set(ahn, slot);
      genArr.push(slot);
    }

    byGeneration.push(genArr);
  }

  return {
    focusPerson,
    focusSpouse,
    focusChildren,
    maxGenerations: clampedGen,
    slots,
    byGeneration,
    populatedCount,
  };
}
