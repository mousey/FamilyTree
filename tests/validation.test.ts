import { describe, expect, it } from 'vitest';
import {
  FAMILY_TREE_SCHEMA_VERSION,
  createMockFamilyTree,
  validateFamilyTree,
  type FamilyTree,
} from '../src/index.js';

function createMinimalValidTree(): FamilyTree {
  return {
    schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
    metadata: {},
    persons: {
      P1: {
        id: 'P1',
        name: { display: 'Alice Vance' },
        sex: 'female',
        events: [],
        media: [],
        notes: [],
        citations: [],
      },
      P2: {
        id: 'P2',
        name: { display: 'Bob Vance' },
        sex: 'male',
        events: [],
        media: [],
        notes: [],
        citations: [],
      },
    },
    unions: {
      U1: {
        id: 'U1',
        partners: [{ personId: 'P1', role: 'wife' }],
        children: [{ personId: 'P2', pedigree: 'biological' }],
        type: 'marriage',
        status: 'active',
        events: [],
        notes: [],
        citations: [],
      },
    },
    media: {},
    sources: {},
    repositories: {},
    notes: {},
  };
}

describe('validateFamilyTree', () => {
  it('validates the complex mock tree with no errors', () => {
    const result = validateFamilyTree(createMockFamilyTree());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // Mock tree contains adoption (multi-parent union) -> MULTIPLE_PARENT_UNIONS warning is expected
    expect(result.warnings.some((w) => w.code === 'MULTIPLE_PARENT_UNIONS')).toBe(true);
  });

  it('detects structural errors: non-object root, bad schemaVersion, and map key mismatch', () => {
    expect(validateFamilyTree(null).valid).toBe(false);

    const tree = createMinimalValidTree();
    (tree as unknown as Record<string, unknown>).schemaVersion = '0.9.0';
    const badVer = validateFamilyTree(tree);
    expect(badVer.valid).toBe(false);
    expect(badVer.errors.some((e) => e.code === 'INVALID_SCHEMA_VERSION')).toBe(true);

    const mismatch = createMinimalValidTree();
    mismatch.persons.P1!.id = 'WRONG_ID';
    const mismatchRes = validateFamilyTree(mismatch);
    expect(mismatchRes.valid).toBe(false);
    expect(mismatchRes.errors.some((e) => e.code === 'ID_MISMATCH')).toBe(true);
  });

  it('detects all dangling reference errors', () => {
    const tree = createMinimalValidTree();
    tree.metadata.defaultRootPersonId = 'MISSING_ROOT';
    tree.unions.U1!.partners.push({ personId: 'MISSING_PARTNER' });
    tree.unions.U1!.children.push({
      personId: 'MISSING_CHILD',
    });
    tree.persons.P1!.media.push({ mediaId: 'MISSING_MEDIA' });
    tree.persons.P1!.citations.push({ sourceId: 'MISSING_SOURCE' });
    tree.persons.P1!.noteIds = ['MISSING_NOTE'];
    tree.sources.S1 = {
      id: 'S1',
      title: 'Test',
      repositoryId: 'MISSING_REPO',
    };

    const result = validateFamilyTree(tree);
    expect(result.valid).toBe(false);
    const codes = new Set(result.errors.map((e) => e.code));
    expect(codes.has('DANGLING_ROOT_PERSON')).toBe(true);
    expect(codes.has('DANGLING_PARTNER_REF')).toBe(true);
    expect(codes.has('DANGLING_CHILD_REF')).toBe(true);
    expect(codes.has('DANGLING_MEDIA_REF')).toBe(true);
    expect(codes.has('DANGLING_SOURCE_REF')).toBe(true);
    expect(codes.has('DANGLING_NOTE_REF')).toBe(true);
    expect(codes.has('DANGLING_REPOSITORY_REF')).toBe(true);
  });

  it('detects DUPLICATE_PARTNER, DUPLICATE_CHILD, SELF_PARENT_IN_UNION, and invalid parentRelations keys', () => {
    const tree = createMinimalValidTree();
    tree.unions.U1!.partners.push({ personId: 'P1', role: 'wife' });
    tree.unions.U1!.children.push({ personId: 'P2', pedigree: 'biological' });
    tree.unions.U1!.children.push({
      personId: 'P1',
      parentRelations: { NON_PARTNER: 'biological' },
    });

    const result = validateFamilyTree(tree);
    expect(result.valid).toBe(false);
    const codes = new Set(result.errors.map((e) => e.code));
    expect(codes.has('DUPLICATE_PARTNER')).toBe(true);
    expect(codes.has('DUPLICATE_CHILD')).toBe(true);
    expect(codes.has('SELF_PARENT_IN_UNION')).toBe(true);
    expect(codes.has('INVALID_PARENT_RELATION_KEY')).toBe(true);
  });

  it('detects 2-node and 3-node ANCESTRY_CYCLE errors', () => {
    // 2-node cycle: P1 -> P2 -> P1
    const cycle2 = createMinimalValidTree();
    cycle2.unions.U2 = {
      id: 'U2',
      partners: [{ personId: 'P2', role: 'husband' }],
      children: [{ personId: 'P1', pedigree: 'biological' }],
      type: 'marriage',
      status: 'active',
      events: [],
      notes: [],
      citations: [],
    };
    const res2 = validateFamilyTree(cycle2);
    expect(res2.valid).toBe(false);
    expect(res2.errors.some((e) => e.code === 'ANCESTRY_CYCLE')).toBe(true);

    // 3-node cycle: P1 -> P2 -> P3 -> P1
    const cycle3 = createMinimalValidTree();
    cycle3.persons.P3 = {
      id: 'P3',
      name: { display: 'Carol Vance' },
      sex: 'female',
      events: [],
      media: [],
      notes: [],
      citations: [],
    };
    cycle3.unions.U2 = {
      id: 'U2',
      partners: [{ personId: 'P2', role: 'husband' }],
      children: [{ personId: 'P3', pedigree: 'biological' }],
      type: 'marriage',
      status: 'active',
      events: [],
      notes: [],
      citations: [],
    };
    cycle3.unions.U3 = {
      id: 'U3',
      partners: [{ personId: 'P3', role: 'wife' }],
      children: [{ personId: 'P1', pedigree: 'biological' }],
      type: 'marriage',
      status: 'active',
      events: [],
      notes: [],
      citations: [],
    };
    const res3 = validateFamilyTree(cycle3);
    expect(res3.valid).toBe(false);
    expect(res3.errors.some((e) => e.code === 'ANCESTRY_CYCLE')).toBe(true);
  });

  it('reports non-fatal genealogical warnings while remaining valid', () => {
    const tree = createMinimalValidTree();
    tree.persons.P1!.birth = {
      type: 'birth',
      date: { raw: '1980', qualifier: 'exact', start: { year: 1980 }, sortKey: 19800101 },
    };
    tree.persons.P1!.death = {
      type: 'death',
      date: { raw: '1990', qualifier: 'exact', start: { year: 1990 }, sortKey: 19900101 },
    };
    // Child born before parent (1975 < 1980) -> CHRONOLOGY_ANOMALY
    tree.persons.P2!.birth = {
      type: 'birth',
      date: { raw: '1975', qualifier: 'exact', start: { year: 1975 }, sortKey: 19750101 },
    };
    // Disconnected person
    tree.persons.P_ORPHAN = {
      id: 'P_ORPHAN',
      name: { display: 'Orphan Person' },
      sex: 'unknown',
      events: [],
      media: [],
      notes: [],
      citations: [],
    };
    // Orphan union
    tree.unions.U_EMPTY = {
      id: 'U_EMPTY',
      partners: [],
      children: [],
      type: 'unknown',
      status: 'unknown',
      events: [],
      notes: [],
      citations: [],
    };
    // Second parent union for P2 -> MULTIPLE_PARENT_UNIONS
    tree.persons.P3 = {
      id: 'P3',
      name: { display: 'Adoptive Parent' },
      sex: 'female',
      events: [],
      media: [],
      notes: [],
      citations: [],
    };
    tree.unions.U2 = {
      id: 'U2',
      partners: [{ personId: 'P3', role: 'wife' }],
      children: [{ personId: 'P2', pedigree: 'adopted' }],
      type: 'unknown',
      status: 'active',
      events: [],
      notes: [],
      citations: [],
    };

    const result = validateFamilyTree(tree);
    expect(result.valid).toBe(true);
    const warnCodes = new Set(result.warnings.map((w) => w.code));
    expect(warnCodes.has('CHRONOLOGY_ANOMALY')).toBe(true);
    expect(warnCodes.has('DISCONNECTED_PERSON')).toBe(true);
    expect(warnCodes.has('ORPHAN_UNION')).toBe(true);
    expect(warnCodes.has('MULTIPLE_PARENT_UNIONS')).toBe(true);
  });
});
