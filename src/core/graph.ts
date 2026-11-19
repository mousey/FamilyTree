import { compareGenealogicalDates } from './dates.js';
import {
  FAMILY_TREE_SCHEMA_VERSION,
  type ChildLink,
  type FamilyTree,
  type MediaObject,
  type NoteRecord,
  type ParentChildType,
  type Person,
  type PersonId,
  type RepositoryRecord,
  type SourceCitation,
  type SourceRecord,
  type Union,
  type UnionId,
} from './types.js';

export type LineageMode = 'all' | 'biological' | 'legal';

export interface SiblingOptions {
  includeHalf?: boolean;
  includeStep?: boolean;
  lineageMode?: LineageMode;
}

export interface SiblingRelation {
  person: Person;
  kind: 'full' | 'half' | 'step';
  sharedParentIds: PersonId[];
  unionIds: UnionId[];
}

export interface GenerationOptions {
  lineageMode?: LineageMode;
  includePartners?: boolean;
}

export interface GenerationConflict {
  personId: PersonId;
  assignedGeneration: number;
  conflictingGeneration: number;
  viaEdgeType: 'parent' | 'child' | 'partner';
  fromPersonId: PersonId;
}

export interface GenerationResult {
  rootPersonId: PersonId;
  generations: Map<PersonId, number>;
  byGeneration: Map<number, Person[]>;
  minGeneration: number;
  maxGeneration: number;
  conflicts: GenerationConflict[];
  unreachablePersonIds: PersonId[];
}

export interface AncestorOptions {
  maxDepth?: number;
  lineageMode?: LineageMode;
}

export interface AncestorEntry {
  personId: PersonId;
  minDepth: number;
  maxDepth: number;
  pathCount: number;
}

export interface DescendantOptions {
  maxDepth?: number;
  lineageMode?: LineageMode;
  includeSpouses?: boolean;
}

export interface DescendantEntry {
  personId: PersonId;
  minDepth: number;
  maxDepth: number;
  pathCount: number;
  isSpouseOnly: boolean;
}

export interface SharedAncestor {
  ancestor: Person;
  ancestorId: PersonId;
  depthA: number;
  depthB: number;
  maxDepthA: number;
  maxDepthB: number;
  totalDistance: number;
  isLowestCommonAncestor: boolean;
}

export interface RelationshipStep {
  fromPersonId: PersonId;
  toPersonId: PersonId;
  edgeType: 'parent' | 'child' | 'partner';
  unionId: UnionId;
}

export type RelationshipKind =
  | 'self'
  | 'ancestor'
  | 'descendant'
  | 'full_sibling'
  | 'half_sibling'
  | 'aunt_uncle'
  | 'niece_nephew'
  | 'cousin'
  | 'spouse'
  | 'in_law'
  | 'unrelated';

export interface RelationshipSummary {
  kind: RelationshipKind;
  label: string;
  degree?: number;
  removal?: number;
  isDoubleCousin?: boolean;
  lcas: SharedAncestor[];
  shortestPath: RelationshipStep[] | null;
}

export type BranchFilterMode =
  | 'ancestors'
  | 'descendants'
  | 'hourglass'
  | 'connected'
  | 'lineage_pair';

export interface BranchFilterOptions {
  mode: BranchFilterMode;
  focusPersonId: PersonId;
  targetPersonId?: PersonId;
  ancestorLevels?: number;
  descendantLevels?: number;
  includeSpouses?: boolean;
  includeFocusSiblings?: boolean;
  lineageMode?: LineageMode;
  livingFilter?: 'all' | 'living_only' | 'deceased_only';
  predicate?: (person: Person) => boolean;
}

export interface TreeStats {
  personCount: number;
  unionCount: number;
  mediaCount: number;
  missingMediaFileCount: number;
  sourceCount: number;
  repositoryCount: number;
  noteCount: number;
  remarriedPersonCount: number;
  multiParentUnionPersonCount: number;
  singleParentUnionCount: number;
  disconnectedComponentCount: number;
  earliestBirthYear?: number;
  latestBirthYear?: number;
  minGenerationFromRoot?: number;
  maxGenerationFromRoot?: number;
}

export function getEffectiveParentRelation(
  childLink: ChildLink,
  parentId: PersonId,
): ParentChildType {
  return childLink.parentRelations?.[parentId] ?? childLink.pedigree ?? 'biological';
}

export function matchesLineageMode(
  relation: ParentChildType,
  mode: LineageMode,
): boolean {
  if (mode === 'all') {
    return true;
  }
  if (mode === 'biological') {
    return relation === 'biological';
  }
  return relation === 'biological' || relation === 'adopted' || relation === 'sealed';
}

function comparePersonsDeterministically(a: Person, b: Person): number {
  const dateCmp = compareGenealogicalDates(a.birth?.date, b.birth?.date);
  if (dateCmp !== 0) {
    return dateCmp;
  }
  return a.id.localeCompare(b.id);
}

function compareUnionsDeterministically(a: Union, b: Union): number {
  const dateCmp = compareGenealogicalDates(a.marriage?.date, b.marriage?.date);
  if (dateCmp !== 0) {
    return dateCmp;
  }
  return a.id.localeCompare(b.id);
}

function formatOrdinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${n}th`;
  }
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function isLikelyLiving(
  person: Person,
  referenceYear = new Date().getUTCFullYear(),
): boolean {
  if (person.isLiving !== undefined) {
    return person.isLiving;
  }
  if (person.death !== undefined) {
    return false;
  }
  const birthYear = person.birth?.date?.start?.year;
  if (birthYear !== undefined && referenceYear - birthYear > 110) {
    return false;
  }
  return true;
}

export class FamilyGraph {
  readonly tree: FamilyTree;
  private readonly unionsByPartner = new Map<PersonId, UnionId[]>();
  private readonly unionsByChild = new Map<PersonId, UnionId[]>();

  constructor(tree: FamilyTree) {
    this.tree = tree;

    const sortedUnions = Object.values(tree.unions).sort(compareUnionsDeterministically);
    for (const union of sortedUnions) {
      for (const partner of union.partners) {
        if (!tree.persons[partner.personId]) {
          continue;
        }
        const list = this.unionsByPartner.get(partner.personId);
        if (list) {
          if (!list.includes(union.id)) {
            list.push(union.id);
          }
        } else {
          this.unionsByPartner.set(partner.personId, [union.id]);
        }
      }

      for (const child of union.children) {
        if (!tree.persons[child.personId]) {
          continue;
        }
        const list = this.unionsByChild.get(child.personId);
        if (list) {
          if (!list.includes(union.id)) {
            list.push(union.id);
          }
        } else {
          this.unionsByChild.set(child.personId, [union.id]);
        }
      }
    }
  }

  private assertPerson(personId: PersonId): Person {
    const person = this.tree.persons[personId];
    if (!person) {
      throw new Error(`Person "${personId}" does not exist in tree.`);
    }
    return person;
  }

  getPerson(personId: PersonId): Person | undefined {
    return this.tree.persons[personId];
  }

  getUnion(unionId: UnionId): Union | undefined {
    return this.tree.unions[unionId];
  }

  getAllPersons(): Person[] {
    return Object.values(this.tree.persons).sort((a, b) => a.id.localeCompare(b.id));
  }

  getAllUnions(): Union[] {
    return Object.values(this.tree.unions).sort(compareUnionsDeterministically);
  }

  getUnionsAsPartner(personId: PersonId): Union[] {
    const ids = this.unionsByPartner.get(personId) ?? [];
    const result: Union[] = [];
    for (const id of ids) {
      const union = this.tree.unions[id];
      if (union) {
        result.push(union);
      }
    }
    return result;
  }

  getUnionsAsChild(personId: PersonId): Union[] {
    const ids = this.unionsByChild.get(personId) ?? [];
    const result: Union[] = [];
    for (const id of ids) {
      const union = this.tree.unions[id];
      if (union) {
        result.push(union);
      }
    }
    return result;
  }

  getParents(
    personId: PersonId,
    options: { lineageMode?: LineageMode } = {},
  ): Person[] {
    const mode = options.lineageMode ?? 'all';
    const seen = new Set<PersonId>();
    const parents: Person[] = [];

    for (const union of this.getUnionsAsChild(personId)) {
      const childLink = union.children.find((c) => c.personId === personId);
      if (!childLink) {
        continue;
      }
      for (const partner of union.partners) {
        if (partner.personId === personId || seen.has(partner.personId)) {
          continue;
        }
        const rel = getEffectiveParentRelation(childLink, partner.personId);
        if (!matchesLineageMode(rel, mode)) {
          continue;
        }
        const parentPerson = this.tree.persons[partner.personId];
        if (parentPerson) {
          seen.add(parentPerson.id);
          parents.push(parentPerson);
        }
      }
    }

    return parents.sort(comparePersonsDeterministically);
  }

  getChildren(
    personId: PersonId,
    options: { lineageMode?: LineageMode } = {},
  ): Person[] {
    const mode = options.lineageMode ?? 'all';
    const seen = new Set<PersonId>();
    const children: Person[] = [];

    for (const union of this.getUnionsAsPartner(personId)) {
      for (const childLink of union.children) {
        if (childLink.personId === personId || seen.has(childLink.personId)) {
          continue;
        }
        const rel = getEffectiveParentRelation(childLink, personId);
        if (!matchesLineageMode(rel, mode)) {
          continue;
        }
        const childPerson = this.tree.persons[childLink.personId];
        if (childPerson) {
          seen.add(childPerson.id);
          children.push(childPerson);
        }
      }
    }

    return children.sort(comparePersonsDeterministically);
  }

  getPartners(personId: PersonId): Person[] {
    const seen = new Set<PersonId>();
    const partners: Person[] = [];

    for (const union of this.getUnionsAsPartner(personId)) {
      for (const partner of union.partners) {
        if (partner.personId === personId || seen.has(partner.personId)) {
          continue;
        }
        const partnerPerson = this.tree.persons[partner.personId];
        if (partnerPerson) {
          seen.add(partnerPerson.id);
          partners.push(partnerPerson);
        }
      }
    }

    return partners;
  }

  getSiblings(
    personId: PersonId,
    options: SiblingOptions = {},
  ): SiblingRelation[] {
    this.assertPerson(personId);
    const includeHalf = options.includeHalf ?? true;
    const includeStep = options.includeStep ?? false;
    const mode = options.lineageMode ?? 'all';

    const parentsA = new Set(this.getParents(personId, { lineageMode: mode }).map((p) => p.id));
    const unionsAsChildA = this.getUnionsAsChild(personId);
    const childUnionsMatchingA = new Map<UnionId, boolean>();

    for (const union of unionsAsChildA) {
      const link = union.children.find((c) => c.personId === personId);
      if (!link) {
        continue;
      }
      if (union.partners.length === 0) {
        const rel = link.pedigree ?? 'biological';
        childUnionsMatchingA.set(union.id, matchesLineageMode(rel, mode));
      } else {
        const hasMatchingParent = union.partners.some((p) =>
          matchesLineageMode(getEffectiveParentRelation(link, p.personId), mode),
        );
        childUnionsMatchingA.set(union.id, hasMatchingParent);
      }
    }

    // Collect partner unions connecting A's parents to step-parents
    const stepParentUnionByOtherParent = new Map<PersonId, UnionId[]>();
    if (includeStep) {
      for (const parentId of parentsA) {
        for (const union of this.getUnionsAsPartner(parentId)) {
          for (const partner of union.partners) {
            if (partner.personId === parentId || parentsA.has(partner.personId)) {
              continue;
            }
            const list = stepParentUnionByOtherParent.get(partner.personId);
            if (list) {
              if (!list.includes(union.id)) {
                list.push(union.id);
              }
            } else {
              stepParentUnionByOtherParent.set(partner.personId, [union.id]);
            }
          }
        }
      }
    }

    const relations: SiblingRelation[] = [];

    for (const candidate of Object.values(this.tree.persons)) {
      if (candidate.id === personId) {
        continue;
      }

      const parentsB = new Set(this.getParents(candidate.id, { lineageMode: mode }).map((p) => p.id));
      const sharedParentIds: PersonId[] = [];
      for (const pid of parentsA) {
        if (parentsB.has(pid)) {
          sharedParentIds.push(pid);
        }
      }
      sharedParentIds.sort();

      const sharedMatchingUnions: UnionId[] = [];
      for (const union of this.getUnionsAsChild(candidate.id)) {
        if (!childUnionsMatchingA.get(union.id)) {
          continue;
        }
        const linkB = union.children.find((c) => c.personId === candidate.id);
        if (!linkB) {
          continue;
        }
        if (union.partners.length === 0) {
          const relB = linkB.pedigree ?? 'biological';
          if (matchesLineageMode(relB, mode)) {
            sharedMatchingUnions.push(union.id);
          }
        } else {
          const hasMatchingSharedParent = union.partners.some(
            (p) =>
              sharedParentIds.includes(p.personId) &&
              matchesLineageMode(getEffectiveParentRelation(linkB, p.personId), mode),
          );
          if (hasMatchingSharedParent) {
            sharedMatchingUnions.push(union.id);
          }
        }
      }

      if (sharedParentIds.length >= 2) {
        relations.push({
          person: candidate,
          kind: 'full',
          sharedParentIds,
          unionIds: sharedMatchingUnions,
        });
        continue;
      }

      if (sharedParentIds.length === 1) {
        const isSinglePartnerFullSibling =
          parentsA.size === 1 &&
          parentsB.size === 1 &&
          sharedMatchingUnions.some((uid) => {
            const u = this.tree.unions[uid];
            return u !== undefined && u.partners.length === 1;
          });

        if (isSinglePartnerFullSibling) {
          relations.push({
            person: candidate,
            kind: 'full',
            sharedParentIds,
            unionIds: sharedMatchingUnions,
          });
        } else if (includeHalf) {
          relations.push({
            person: candidate,
            kind: 'half',
            sharedParentIds,
            unionIds: sharedMatchingUnions,
          });
        }
        continue;
      }

      // 0 shared parents
      if (sharedMatchingUnions.length > 0) {
        relations.push({
          person: candidate,
          kind: 'full',
          sharedParentIds: [],
          unionIds: sharedMatchingUnions,
        });
        continue;
      }

      if (includeStep) {
        const stepConnectingUnions = new Set<UnionId>();
        for (const parentBId of parentsB) {
          const uIds = stepParentUnionByOtherParent.get(parentBId);
          if (uIds) {
            for (const uid of uIds) {
              stepConnectingUnions.add(uid);
            }
          }
        }
        if (stepConnectingUnions.size > 0) {
          relations.push({
            person: candidate,
            kind: 'step',
            sharedParentIds: [],
            unionIds: [...stepConnectingUnions].sort(),
          });
        }
      }
    }

    return relations.sort((a, b) => comparePersonsDeterministically(a.person, b.person));
  }

  calculateGenerations(
    rootPersonId: PersonId,
    options: GenerationOptions = {},
  ): GenerationResult {
    this.assertPerson(rootPersonId);
    const lineageMode = options.lineageMode ?? 'all';
    const includePartners = options.includePartners ?? true;

    const generations = new Map<PersonId, number>();
    const conflicts: GenerationConflict[] = [];
    const seenConflicts = new Set<string>();
    const queue: PersonId[] = [rootPersonId];
    generations.set(rootPersonId, 0);

    let head = 0;
    while (head < queue.length) {
      const currentId = queue[head++]!;
      const currentGen = generations.get(currentId)!;

      const neighbors: Array<{
        personId: PersonId;
        delta: -1 | 0 | 1;
        edgeType: 'parent' | 'child' | 'partner';
      }> = [];

      if (includePartners) {
        for (const partner of this.getPartners(currentId)) {
          neighbors.push({ personId: partner.id, delta: 0, edgeType: 'partner' });
        }
      }
      for (const parent of this.getParents(currentId, { lineageMode })) {
        neighbors.push({ personId: parent.id, delta: -1, edgeType: 'parent' });
      }
      for (const child of this.getChildren(currentId, { lineageMode })) {
        neighbors.push({ personId: child.id, delta: 1, edgeType: 'child' });
      }

      for (const neighbor of neighbors) {
        const candidateGen = currentGen + neighbor.delta;
        const existing = generations.get(neighbor.personId);
        if (existing === undefined) {
          generations.set(neighbor.personId, candidateGen);
          queue.push(neighbor.personId);
        } else if (existing !== candidateGen) {
          const conflictKey = `${neighbor.personId}|${existing}|${candidateGen}|${neighbor.edgeType}|${currentId}`;
          if (!seenConflicts.has(conflictKey)) {
            seenConflicts.add(conflictKey);
            conflicts.push({
              personId: neighbor.personId,
              assignedGeneration: existing,
              conflictingGeneration: candidateGen,
              viaEdgeType: neighbor.edgeType,
              fromPersonId: currentId,
            });
          }
        }
      }
    }

    let minGeneration = 0;
    let maxGeneration = 0;
    const grouped = new Map<number, Person[]>();

    for (const [personId, gen] of generations.entries()) {
      if (gen < minGeneration) minGeneration = gen;
      if (gen > maxGeneration) maxGeneration = gen;
      const person = this.tree.persons[personId];
      if (!person) continue;
      const list = grouped.get(gen);
      if (list) {
        list.push(person);
      } else {
        grouped.set(gen, [person]);
      }
    }

    const byGeneration = new Map<number, Person[]>();
    const sortedGenKeys = [...grouped.keys()].sort((a, b) => a - b);
    for (const gen of sortedGenKeys) {
      const list = grouped.get(gen)!;
      list.sort(comparePersonsDeterministically);
      byGeneration.set(gen, list);
    }

    const unreachablePersonIds = Object.keys(this.tree.persons)
      .filter((id) => !generations.has(id))
      .sort();

    return {
      rootPersonId,
      generations,
      byGeneration,
      minGeneration,
      maxGeneration,
      conflicts,
      unreachablePersonIds,
    };
  }

  private traverseDag(
    startPersonId: PersonId,
    direction: 'ancestors' | 'descendants',
    maxDepth: number,
    lineageMode: LineageMode,
  ): Map<PersonId, { minDepth: number; maxDepth: number; pathCount: number }> {
    const getNeighbors = (id: PersonId): PersonId[] =>
      direction === 'ancestors'
        ? this.getParents(id, { lineageMode }).map((p) => p.id)
        : this.getChildren(id, { lineageMode }).map((c) => c.id);

    // 1. Bounded BFS to discover all reachable nodes within maxDepth
    const bfsDist = new Map<PersonId, number>();
    const adjacency = new Map<PersonId, PersonId[]>();
    const bfsQueue: PersonId[] = [startPersonId];
    bfsDist.set(startPersonId, 0);

    let head = 0;
    while (head < bfsQueue.length) {
      const u = bfsQueue[head++]!;
      const dist = bfsDist.get(u)!;
      if (dist >= maxDepth) {
        adjacency.set(u, []);
        continue;
      }
      const nextIds = getNeighbors(u);
      adjacency.set(u, nextIds);
      for (const v of nextIds) {
        if (!bfsDist.has(v)) {
          bfsDist.set(v, dist + 1);
          bfsQueue.push(v);
        }
      }
    }

    // Build subgraph edges restricted to reachable nodes within maxDepth
    const subAdj = new Map<PersonId, PersonId[]>();
    const inDegree = new Map<PersonId, number>();
    for (const u of bfsDist.keys()) {
      subAdj.set(u, []);
      inDegree.set(u, 0);
    }
    for (const [u, nextIds] of adjacency.entries()) {
      const validTargets: PersonId[] = [];
      for (const v of nextIds) {
        if (bfsDist.has(v)) {
          validTargets.push(v);
          inDegree.set(v, (inDegree.get(v) ?? 0) + 1);
        }
      }
      subAdj.set(u, validTargets);
    }

    // 2. Topological DP via Kahn's algorithm for O(V + E) minDepth, maxDepth, pathCount
    const dp = new Map<PersonId, { minDepth: number; maxDepth: number; pathCount: number }>();
    dp.set(startPersonId, { minDepth: 0, maxDepth: 0, pathCount: 1 });

    const kahnQueue: PersonId[] = [];
    for (const [node, deg] of inDegree.entries()) {
      if (deg === 0) {
        kahnQueue.push(node);
      }
    }

    let kHead = 0;
    while (kHead < kahnQueue.length) {
      const u = kahnQueue[kHead++]!;
      const uState = dp.get(u);
      for (const v of subAdj.get(u) ?? []) {
        if (uState && uState.minDepth + 1 <= maxDepth) {
          const candMin = uState.minDepth + 1;
          const candMax = Math.min(maxDepth, uState.maxDepth + 1);
          const prev = dp.get(v);
          if (!prev) {
            dp.set(v, {
              minDepth: candMin,
              maxDepth: candMax,
              pathCount: uState.pathCount,
            });
          } else {
            prev.minDepth = Math.min(prev.minDepth, candMin);
            prev.maxDepth = Math.max(prev.maxDepth, candMax);
            prev.pathCount += uState.pathCount;
          }
        }
        const nextDeg = (inDegree.get(v) ?? 0) - 1;
        inDegree.set(v, nextDeg);
        if (nextDeg === 0) {
          kahnQueue.push(v);
        }
      }
    }

    // Fallback for any nodes left unprocessed if unvalidated input contained a cycle
    for (const [node, dist] of bfsDist.entries()) {
      if (!dp.has(node)) {
        dp.set(node, { minDepth: dist, maxDepth: dist, pathCount: 1 });
      }
    }

    dp.delete(startPersonId);
    return dp;
  }

  getAncestors(
    personId: PersonId,
    options: AncestorOptions = {},
  ): Map<PersonId, AncestorEntry> {
    this.assertPerson(personId);
    const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
    const lineageMode = options.lineageMode ?? 'all';
    const dp = this.traverseDag(personId, 'ancestors', maxDepth, lineageMode);

    const result = new Map<PersonId, AncestorEntry>();
    for (const [id, entry] of dp.entries()) {
      result.set(id, {
        personId: id,
        minDepth: entry.minDepth,
        maxDepth: entry.maxDepth,
        pathCount: entry.pathCount,
      });
    }
    return result;
  }

  getDescendants(
    personId: PersonId,
    options: DescendantOptions = {},
  ): Map<PersonId, DescendantEntry> {
    this.assertPerson(personId);
    const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
    const lineageMode = options.lineageMode ?? 'all';
    const includeSpouses = options.includeSpouses ?? false;

    const dp = this.traverseDag(personId, 'descendants', maxDepth, lineageMode);
    const result = new Map<PersonId, DescendantEntry>();
    for (const [id, entry] of dp.entries()) {
      result.set(id, {
        personId: id,
        minDepth: entry.minDepth,
        maxDepth: entry.maxDepth,
        pathCount: entry.pathCount,
        isSpouseOnly: false,
      });
    }

    if (includeSpouses) {
      // Partners of blood descendants at depth d >= 1
      const bloodDescendants = [...result.values()];
      for (const desc of bloodDescendants) {
        for (const partner of this.getPartners(desc.personId)) {
          if (partner.id === personId || result.has(partner.id)) {
            continue;
          }
          result.set(partner.id, {
            personId: partner.id,
            minDepth: desc.minDepth,
            maxDepth: desc.minDepth,
            pathCount: 0,
            isSpouseOnly: true,
          });
        }
      }
    }

    return result;
  }

  findSharedAncestors(
    personAId: PersonId,
    personBId: PersonId,
    options: AncestorOptions = {},
  ): SharedAncestor[] {
    this.assertPerson(personAId);
    this.assertPerson(personBId);
    const lineageMode = options.lineageMode ?? 'all';

    const ancA = this.getAncestors(personAId, options);
    ancA.set(personAId, {
      personId: personAId,
      minDepth: 0,
      maxDepth: 0,
      pathCount: 1,
    });

    const ancB = this.getAncestors(personBId, options);
    ancB.set(personBId, {
      personId: personBId,
      minDepth: 0,
      maxDepth: 0,
      pathCount: 1,
    });

    const sharedIds = new Set<PersonId>();
    for (const id of ancA.keys()) {
      if (ancB.has(id)) {
        sharedIds.add(id);
      }
    }

    const shared: SharedAncestor[] = [];
    for (const ancestorId of sharedIds) {
      const ancestor = this.tree.persons[ancestorId];
      const entryA = ancA.get(ancestorId);
      const entryB = ancB.get(ancestorId);
      if (!ancestor || !entryA || !entryB) {
        continue;
      }

      const children = this.getChildren(ancestorId, { lineageMode });
      const isLowestCommonAncestor = !children.some((child) => sharedIds.has(child.id));

      shared.push({
        ancestor,
        ancestorId,
        depthA: entryA.minDepth,
        depthB: entryB.minDepth,
        maxDepthA: entryA.maxDepth,
        maxDepthB: entryB.maxDepth,
        totalDistance: entryA.minDepth + entryB.minDepth,
        isLowestCommonAncestor,
      });
    }

    return shared.sort((a, b) => {
      if (a.isLowestCommonAncestor !== b.isLowestCommonAncestor) {
        return a.isLowestCommonAncestor ? -1 : 1;
      }
      if (a.totalDistance !== b.totalDistance) {
        return a.totalDistance - b.totalDistance;
      }
      return a.ancestorId.localeCompare(b.ancestorId);
    });
  }

  findLowestCommonAncestors(
    personAId: PersonId,
    personBId: PersonId,
    options: AncestorOptions = {},
  ): SharedAncestor[] {
    return this.findSharedAncestors(personAId, personBId, options).filter(
      (entry) => entry.isLowestCommonAncestor,
    );
  }

  findShortestPath(
    personAId: PersonId,
    personBId: PersonId,
    options: { lineageMode?: LineageMode } = {},
  ): RelationshipStep[] | null {
    this.assertPerson(personAId);
    this.assertPerson(personBId);
    if (personAId === personBId) {
      return [];
    }

    const lineageMode = options.lineageMode ?? 'all';
    const visited = new Set<PersonId>([personAId]);
    const parentStep = new Map<PersonId, RelationshipStep>();
    const queue: PersonId[] = [personAId];

    let head = 0;
    while (head < queue.length) {
      const currentId = queue[head++]!;
      const steps: RelationshipStep[] = [];

      // Partner edges
      for (const union of this.getUnionsAsPartner(currentId)) {
        for (const partner of union.partners) {
          if (partner.personId !== currentId && this.tree.persons[partner.personId]) {
            steps.push({
              fromPersonId: currentId,
              toPersonId: partner.personId,
              edgeType: 'partner',
              unionId: union.id,
            });
          }
        }
      }

      // Parent edges
      for (const union of this.getUnionsAsChild(currentId)) {
        const childLink = union.children.find((c) => c.personId === currentId);
        if (!childLink) continue;
        for (const partner of union.partners) {
          if (
            partner.personId !== currentId &&
            this.tree.persons[partner.personId] &&
            matchesLineageMode(
              getEffectiveParentRelation(childLink, partner.personId),
              lineageMode,
            )
          ) {
            steps.push({
              fromPersonId: currentId,
              toPersonId: partner.personId,
              edgeType: 'parent',
              unionId: union.id,
            });
          }
        }
      }

      // Child edges
      for (const union of this.getUnionsAsPartner(currentId)) {
        for (const childLink of union.children) {
          if (
            childLink.personId !== currentId &&
            this.tree.persons[childLink.personId] &&
            matchesLineageMode(
              getEffectiveParentRelation(childLink, currentId),
              lineageMode,
            )
          ) {
            steps.push({
              fromPersonId: currentId,
              toPersonId: childLink.personId,
              edgeType: 'child',
              unionId: union.id,
            });
          }
        }
      }

      steps.sort((a, b) => {
        const edgeOrder = { parent: 0, child: 1, partner: 2 };
        const eDiff = edgeOrder[a.edgeType] - edgeOrder[b.edgeType];
        if (eDiff !== 0) return eDiff;
        const pDiff = a.toPersonId.localeCompare(b.toPersonId);
        if (pDiff !== 0) return pDiff;
        return a.unionId.localeCompare(b.unionId);
      });

      for (const step of steps) {
        if (visited.has(step.toPersonId)) {
          continue;
        }
        visited.add(step.toPersonId);
        parentStep.set(step.toPersonId, step);
        if (step.toPersonId === personBId) {
          const path: RelationshipStep[] = [];
          let cursor: PersonId = personBId;
          while (cursor !== personAId) {
            const s = parentStep.get(cursor)!;
            path.push(s);
            cursor = s.fromPersonId;
          }
          path.reverse();
          return path;
        }
        queue.push(step.toPersonId);
      }
    }

    return null;
  }

  describeRelationship(
    personAId: PersonId,
    personBId: PersonId,
    options: { lineageMode?: LineageMode } = {},
  ): RelationshipSummary {
    this.assertPerson(personAId);
    this.assertPerson(personBId);
    const lineageMode = options.lineageMode ?? 'all';

    if (personAId === personBId) {
      return {
        kind: 'self',
        label: 'Self',
        lcas: [],
        shortestPath: [],
      };
    }

    const lcas = this.findLowestCommonAncestors(personAId, personBId, { lineageMode });
    const shortestPath = this.findShortestPath(personAId, personBId, { lineageMode });

    const primaryLca = lcas[0];
    if (primaryLca) {
      const { depthA, depthB } = primaryLca;

      // B is an ancestor of A
      if (depthA > 0 && depthB === 0) {
        let label: string;
        if (depthA === 1) label = 'Parent';
        else if (depthA === 2) label = 'Grandparent';
        else if (depthA === 3) label = 'Great-grandparent';
        else label = `${formatOrdinal(depthA - 2)} great-grandparent`;
        return {
          kind: 'ancestor',
          label,
          degree: depthA,
          lcas,
          shortestPath,
        };
      }

      // B is a descendant of A
      if (depthA === 0 && depthB > 0) {
        let label: string;
        if (depthB === 1) label = 'Child';
        else if (depthB === 2) label = 'Grandchild';
        else if (depthB === 3) label = 'Great-grandchild';
        else label = `${formatOrdinal(depthB - 2)} great-grandchild`;
        return {
          kind: 'descendant',
          label,
          degree: depthB,
          lcas,
          shortestPath,
        };
      }

      // Siblings
      if (depthA === 1 && depthB === 1) {
        const siblingMatch = this.getSiblings(personAId, {
          includeHalf: true,
          includeStep: false,
          lineageMode,
        }).find((s) => s.person.id === personBId);

        if (siblingMatch?.kind === 'full') {
          return {
            kind: 'full_sibling',
            label: 'Full sibling',
            lcas,
            shortestPath,
          };
        }
        return {
          kind: 'half_sibling',
          label: 'Half-sibling',
          lcas,
          shortestPath,
        };
      }

      // Aunt / Uncle
      if (depthA > 1 && depthB === 1) {
        let label: string;
        if (depthA === 2) label = 'Aunt / Uncle';
        else if (depthA === 3) label = 'Great-aunt / Great-uncle';
        else label = `${formatOrdinal(depthA - 2)} great-aunt / great-uncle`;
        return {
          kind: 'aunt_uncle',
          label,
          degree: depthA - 1,
          lcas,
          shortestPath,
        };
      }

      // Niece / Nephew
      if (depthA === 1 && depthB > 1) {
        let label: string;
        if (depthB === 2) label = 'Niece / Nephew';
        else if (depthB === 3) label = 'Great-niece / Great-nephew';
        else label = `${formatOrdinal(depthB - 2)} great-niece / great-nephew`;
        return {
          kind: 'niece_nephew',
          label,
          degree: depthB - 1,
          lcas,
          shortestPath,
        };
      }

      // Cousins
      const degree = Math.min(depthA, depthB) - 1;
      const removal = Math.abs(depthA - depthB);

      let isDoubleCousin = false;
      if (degree === 1 && removal === 0) {
        const grandparentLcas = lcas.filter((l) => l.depthA === 2 && l.depthB === 2);
        const grandparentUnionIds = new Set<UnionId>();
        for (const gp of grandparentLcas) {
          for (const union of this.getUnionsAsPartner(gp.ancestorId)) {
            const hasSharedGrandchildLine = union.children.some((c) => {
              const parent = c.personId;
              const isParentOfA = this.getParents(personAId, { lineageMode }).some(
                (p) => p.id === parent,
              );
              const isParentOfB = this.getParents(personBId, { lineageMode }).some(
                (p) => p.id === parent,
              );
              return isParentOfA || isParentOfB;
            });
            if (hasSharedGrandchildLine) {
              grandparentUnionIds.add(union.id);
            }
          }
        }
        if (grandparentUnionIds.size >= 2) {
          isDoubleCousin = true;
        }
      }

      let label: string;
      if (isDoubleCousin) {
        label = 'Double 1st cousin';
      } else {
        const base = `${formatOrdinal(degree)} cousin`;
        if (removal === 0) {
          label = base;
        } else if (removal === 1) {
          label = `${base} once removed`;
        } else if (removal === 2) {
          label = `${base} twice removed`;
        } else {
          label = `${base} ${removal} times removed`;
        }
      }

      return {
        kind: 'cousin',
        label,
        degree,
        removal,
        isDoubleCousin,
        lcas,
        shortestPath,
      };
    }

    if (shortestPath && shortestPath.length === 1 && shortestPath[0]?.edgeType === 'partner') {
      return {
        kind: 'spouse',
        label: 'Spouse / Partner',
        lcas: [],
        shortestPath,
      };
    }

    if (shortestPath !== null) {
      return {
        kind: 'in_law',
        label: 'In-law / Relative by marriage',
        lcas: [],
        shortestPath,
      };
    }

    return {
      kind: 'unrelated',
      label: 'Unrelated',
      lcas: [],
      shortestPath: null,
    };
  }

  getConnectedComponents(): PersonId[][] {
    const visited = new Set<PersonId>();
    const components: PersonId[][] = [];
    const allIds = Object.keys(this.tree.persons).sort();

    for (const startId of allIds) {
      if (visited.has(startId)) {
        continue;
      }
      const component: PersonId[] = [];
      const queue: PersonId[] = [startId];
      visited.add(startId);

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++]!;
        component.push(curr);

        const neighbors = new Set<PersonId>();
        for (const p of this.getPartners(curr)) neighbors.add(p.id);
        for (const p of this.getParents(curr, { lineageMode: 'all' })) neighbors.add(p.id);
        for (const c of this.getChildren(curr, { lineageMode: 'all' })) neighbors.add(c.id);

        for (const nextId of [...neighbors].sort()) {
          if (!visited.has(nextId)) {
            visited.add(nextId);
            queue.push(nextId);
          }
        }
      }

      component.sort();
      components.push(component);
    }

    components.sort((a, b) => {
      if (b.length !== a.length) {
        return b.length - a.length;
      }
      return (a[0] ?? '').localeCompare(b[0] ?? '');
    });

    return components;
  }

  filterBranch(options: BranchFilterOptions): FamilyTree {
    this.assertPerson(options.focusPersonId);
    const lineageMode = options.lineageMode ?? 'all';
    const ancestorLevels = options.ancestorLevels ?? Number.POSITIVE_INFINITY;
    const descendantLevels = options.descendantLevels ?? Number.POSITIVE_INFINITY;

    const kept = new Set<PersonId>();

    switch (options.mode) {
      case 'ancestors': {
        kept.add(options.focusPersonId);
        const anc = this.getAncestors(options.focusPersonId, {
          maxDepth: ancestorLevels,
          lineageMode,
        });
        for (const id of anc.keys()) kept.add(id);
        break;
      }
      case 'descendants': {
        kept.add(options.focusPersonId);
        const desc = this.getDescendants(options.focusPersonId, {
          maxDepth: descendantLevels,
          lineageMode,
          includeSpouses: false,
        });
        for (const id of desc.keys()) kept.add(id);
        break;
      }
      case 'hourglass': {
        kept.add(options.focusPersonId);
        const anc = this.getAncestors(options.focusPersonId, {
          maxDepth: ancestorLevels,
          lineageMode,
        });
        for (const id of anc.keys()) kept.add(id);
        const desc = this.getDescendants(options.focusPersonId, {
          maxDepth: descendantLevels,
          lineageMode,
          includeSpouses: false,
        });
        for (const id of desc.keys()) kept.add(id);
        break;
      }
      case 'connected': {
        const comp = this.getConnectedComponents().find((c) =>
          c.includes(options.focusPersonId),
        );
        if (comp) {
          for (const id of comp) kept.add(id);
        } else {
          kept.add(options.focusPersonId);
        }
        break;
      }
      case 'lineage_pair': {
        if (!options.targetPersonId) {
          throw new Error('targetPersonId is required when mode is "lineage_pair".');
        }
        this.assertPerson(options.targetPersonId);
        kept.add(options.focusPersonId);
        kept.add(options.targetPersonId);

        const lcas = this.findLowestCommonAncestors(
          options.focusPersonId,
          options.targetPersonId,
          { lineageMode },
        );

        if (lcas.length > 0) {
          const ancFocus = new Set(
            this.getAncestors(options.focusPersonId, { lineageMode }).keys(),
          );
          ancFocus.add(options.focusPersonId);
          const ancTarget = new Set(
            this.getAncestors(options.targetPersonId, { lineageMode }).keys(),
          );
          ancTarget.add(options.targetPersonId);

          for (const lca of lcas) {
            kept.add(lca.ancestorId);
            const descLca = new Set(
              this.getDescendants(lca.ancestorId, { lineageMode }).keys(),
            );
            descLca.add(lca.ancestorId);

            for (const id of ancFocus) {
              if (descLca.has(id)) kept.add(id);
            }
            for (const id of ancTarget) {
              if (descLca.has(id)) kept.add(id);
            }
          }
        } else {
          const path = this.findShortestPath(
            options.focusPersonId,
            options.targetPersonId,
            { lineageMode },
          );
          if (path) {
            for (const step of path) {
              kept.add(step.fromPersonId);
              kept.add(step.toPersonId);
            }
          }
        }
        break;
      }
    }

    if (options.includeFocusSiblings) {
      for (const sib of this.getSiblings(options.focusPersonId, {
        includeHalf: true,
        includeStep: false,
        lineageMode,
      })) {
        kept.add(sib.person.id);
      }
    }

    if (options.includeSpouses) {
      const baseIds = [...kept];
      for (const id of baseIds) {
        for (const partner of this.getPartners(id)) {
          kept.add(partner.id);
        }
      }
    }

    if (options.livingFilter && options.livingFilter !== 'all') {
      for (const id of [...kept]) {
        const person = this.tree.persons[id];
        if (!person) continue;
        const living = isLikelyLiving(person);
        if (options.livingFilter === 'living_only' && !living) {
          kept.delete(id);
        } else if (options.livingFilter === 'deceased_only' && living) {
          kept.delete(id);
        }
      }
    }

    if (options.predicate) {
      for (const id of [...kept]) {
        const person = this.tree.persons[id];
        if (person && !options.predicate(person)) {
          kept.delete(id);
        }
      }
    }

    // Build filtered persons and unions
    const persons: Record<PersonId, Person> = {};
    for (const id of [...kept].sort()) {
      const person = this.tree.persons[id];
      if (person) {
        persons[id] = structuredClone(person);
      }
    }

    const unions: Record<UnionId, Union> = {};
    for (const union of this.getAllUnions()) {
      const trimmedPartners = union.partners.filter((p) => kept.has(p.personId));
      const trimmedPartnerSet = new Set(trimmedPartners.map((p) => p.personId));

      const trimmedChildren: ChildLink[] = [];
      for (const child of union.children) {
        if (!kept.has(child.personId)) {
          continue;
        }
        const clonedChild: ChildLink = structuredClone(child);
        if (clonedChild.parentRelations) {
          const filteredRelations: Record<PersonId, ParentChildType> = {};
          for (const [parentId, relType] of Object.entries(clonedChild.parentRelations)) {
            if (trimmedPartnerSet.has(parentId)) {
              filteredRelations[parentId] = relType;
            }
          }
          if (Object.keys(filteredRelations).length > 0) {
            clonedChild.parentRelations = filteredRelations;
          } else {
            delete clonedChild.parentRelations;
          }
        }
        trimmedChildren.push(clonedChild);
      }

      const shouldKeepUnion =
        trimmedPartners.length >= 2 ||
        (trimmedChildren.length >= 1 &&
          (trimmedPartners.length >= 1 || trimmedChildren.length >= 2));

      if (shouldKeepUnion) {
        const clonedUnion = structuredClone(union);
        clonedUnion.partners = trimmedPartners.map((p) => ({ ...p }));
        clonedUnion.children = trimmedChildren;
        unions[union.id] = clonedUnion;
      }
    }

    // Collect referenced media, sources, notes, repositories
    const keptMediaIds = new Set<string>();
    const keptSourceIds = new Set<string>();
    const keptNoteIds = new Set<string>();
    const keptRepoIds = new Set<string>();

    const collectCitations = (citations: SourceCitation[] | undefined): void => {
      if (!citations) return;
      for (const cit of citations) {
        keptSourceIds.add(cit.sourceId);
      }
    };

    for (const person of Object.values(persons)) {
      for (const m of person.media) keptMediaIds.add(m.mediaId);
      for (const nid of person.noteIds ?? []) keptNoteIds.add(nid);
      collectCitations(person.citations);
      collectCitations(person.birth?.citations);
      collectCitations(person.death?.citations);
      for (const ev of person.events) collectCitations(ev.citations);
    }

    for (const union of Object.values(unions)) {
      for (const m of union.media ?? []) keptMediaIds.add(m.mediaId);
      for (const nid of union.noteIds ?? []) keptNoteIds.add(nid);
      collectCitations(union.citations);
      collectCitations(union.marriage?.citations);
      collectCitations(union.divorce?.citations);
      for (const ev of union.events) collectCitations(ev.citations);
    }

    const media: Record<string, MediaObject> = {};
    for (const mid of [...keptMediaIds].sort()) {
      const m = this.tree.media[mid];
      if (m) media[mid] = structuredClone(m);
    }

    const sources: Record<string, SourceRecord> = {};
    for (const sid of [...keptSourceIds].sort()) {
      const s = this.tree.sources[sid];
      if (s) {
        sources[sid] = structuredClone(s);
        if (s.repositoryId) {
          keptRepoIds.add(s.repositoryId);
        }
      }
    }

    const repositories: Record<string, RepositoryRecord> = {};
    for (const rid of [...keptRepoIds].sort()) {
      const r = this.tree.repositories[rid];
      if (r) repositories[rid] = structuredClone(r);
    }

    const notes: Record<string, NoteRecord> = {};
    for (const nid of [...keptNoteIds].sort()) {
      const n = this.tree.notes[nid];
      if (n) notes[nid] = structuredClone(n);
    }

    const metadata = structuredClone(this.tree.metadata);
    if (kept.has(options.focusPersonId)) {
      metadata.defaultRootPersonId = options.focusPersonId;
    } else {
      delete metadata.defaultRootPersonId;
    }

    return {
      schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
      metadata,
      persons,
      unions,
      media,
      sources,
      repositories,
      notes,
    };
  }

  getStats(rootPersonId?: PersonId): TreeStats {
    const persons = Object.values(this.tree.persons);
    const unions = Object.values(this.tree.unions);
    const mediaItems = Object.values(this.tree.media);

    let missingMediaFileCount = 0;
    for (const m of mediaItems) {
      if (!m.file || m.file.trim().length === 0) {
        missingMediaFileCount++;
      }
    }

    let remarriedPersonCount = 0;
    let multiParentUnionPersonCount = 0;
    let earliestBirthYear: number | undefined;
    let latestBirthYear: number | undefined;

    for (const p of persons) {
      if ((this.unionsByPartner.get(p.id)?.length ?? 0) > 1) {
        remarriedPersonCount++;
      }
      if ((this.unionsByChild.get(p.id)?.length ?? 0) > 1) {
        multiParentUnionPersonCount++;
      }
      const birthYear = p.birth?.date?.start?.year;
      if (birthYear !== undefined) {
        if (earliestBirthYear === undefined || birthYear < earliestBirthYear) {
          earliestBirthYear = birthYear;
        }
        if (latestBirthYear === undefined || birthYear > latestBirthYear) {
          latestBirthYear = birthYear;
        }
      }
    }

    let singleParentUnionCount = 0;
    for (const u of unions) {
      if (u.partners.length === 1) {
        singleParentUnionCount++;
      }
    }

    const effectiveRoot =
      rootPersonId ??
      (this.tree.metadata.defaultRootPersonId &&
      this.tree.persons[this.tree.metadata.defaultRootPersonId]
        ? this.tree.metadata.defaultRootPersonId
        : undefined);

    let minGenerationFromRoot: number | undefined;
    let maxGenerationFromRoot: number | undefined;
    if (effectiveRoot && this.tree.persons[effectiveRoot]) {
      const genResult = this.calculateGenerations(effectiveRoot);
      minGenerationFromRoot = genResult.minGeneration;
      maxGenerationFromRoot = genResult.maxGeneration;
    }

    const stats: TreeStats = {
      personCount: persons.length,
      unionCount: unions.length,
      mediaCount: mediaItems.length,
      missingMediaFileCount,
      sourceCount: Object.keys(this.tree.sources).length,
      repositoryCount: Object.keys(this.tree.repositories).length,
      noteCount: Object.keys(this.tree.notes).length,
      remarriedPersonCount,
      multiParentUnionPersonCount,
      singleParentUnionCount,
      disconnectedComponentCount: this.getConnectedComponents().length,
    };

    if (earliestBirthYear !== undefined) stats.earliestBirthYear = earliestBirthYear;
    if (latestBirthYear !== undefined) stats.latestBirthYear = latestBirthYear;
    if (minGenerationFromRoot !== undefined) {
      stats.minGenerationFromRoot = minGenerationFromRoot;
    }
    if (maxGenerationFromRoot !== undefined) {
      stats.maxGenerationFromRoot = maxGenerationFromRoot;
    }

    return stats;
  }
}

export type GraphInput = FamilyGraph | FamilyTree;

export function createFamilyGraph(tree: FamilyTree): FamilyGraph {
  return new FamilyGraph(tree);
}

function asGraph(input: GraphInput): FamilyGraph {
  return input instanceof FamilyGraph ? input : new FamilyGraph(input);
}

export function getParents(
  input: GraphInput,
  personId: PersonId,
  options?: { lineageMode?: LineageMode },
): Person[] {
  return asGraph(input).getParents(personId, options);
}

export function getChildren(
  input: GraphInput,
  personId: PersonId,
  options?: { lineageMode?: LineageMode },
): Person[] {
  return asGraph(input).getChildren(personId, options);
}

export function getPartners(input: GraphInput, personId: PersonId): Person[] {
  return asGraph(input).getPartners(personId);
}

export function getSiblings(
  input: GraphInput,
  personId: PersonId,
  options?: SiblingOptions,
): SiblingRelation[] {
  return asGraph(input).getSiblings(personId, options);
}

export function calculateGenerations(
  input: GraphInput,
  rootPersonId: PersonId,
  options?: GenerationOptions,
): GenerationResult {
  return asGraph(input).calculateGenerations(rootPersonId, options);
}

export function getAncestors(
  input: GraphInput,
  personId: PersonId,
  options?: AncestorOptions,
): Map<PersonId, AncestorEntry> {
  return asGraph(input).getAncestors(personId, options);
}

export function getDescendants(
  input: GraphInput,
  personId: PersonId,
  options?: DescendantOptions,
): Map<PersonId, DescendantEntry> {
  return asGraph(input).getDescendants(personId, options);
}

export function findSharedAncestors(
  input: GraphInput,
  personAId: PersonId,
  personBId: PersonId,
  options?: AncestorOptions,
): SharedAncestor[] {
  return asGraph(input).findSharedAncestors(personAId, personBId, options);
}

export function findLowestCommonAncestors(
  input: GraphInput,
  personAId: PersonId,
  personBId: PersonId,
  options?: AncestorOptions,
): SharedAncestor[] {
  return asGraph(input).findLowestCommonAncestors(personAId, personBId, options);
}

export function findShortestPath(
  input: GraphInput,
  personAId: PersonId,
  personBId: PersonId,
  options?: { lineageMode?: LineageMode },
): RelationshipStep[] | null {
  return asGraph(input).findShortestPath(personAId, personBId, options);
}

export function describeRelationship(
  input: GraphInput,
  personAId: PersonId,
  personBId: PersonId,
  options?: { lineageMode?: LineageMode },
): RelationshipSummary {
  return asGraph(input).describeRelationship(personAId, personBId, options);
}

export function filterBranch(
  input: GraphInput,
  options: BranchFilterOptions,
): FamilyTree {
  return asGraph(input).filterBranch(options);
}

export function getConnectedComponents(input: GraphInput): PersonId[][] {
  return asGraph(input).getConnectedComponents();
}

export function getTreeStats(
  input: GraphInput,
  rootPersonId?: PersonId,
): TreeStats {
  return asGraph(input).getStats(rootPersonId);
}
