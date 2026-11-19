import { describe, expect, it } from 'vitest';
import {
  FAMILY_TREE_SCHEMA_VERSION,
  MOCK_IDS,
  calculateGenerations,
  createFamilyGraph,
  createMockFamilyTree,
  describeRelationship,
  filterBranch,
  findLowestCommonAncestors,
  findSharedAncestors,
  findShortestPath,
  getAncestors,
  getConnectedComponents,
  getDescendants,
  getParents,
  getPartners,
  getSiblings,
  getTreeStats,
  validateFamilyTree,
  type FamilyTree,
} from '../src/index.js';

describe('FamilyGraph traversal and query utilities', () => {
  const mockTree = createMockFamilyTree();
  const graph = createFamilyGraph(mockTree);

  it('sorts remarriages chronologically and resolves partners across multiple unions', () => {
    const henryUnions = graph.getUnionsAsPartner(MOCK_IDS.tripleMarriedAncestor);
    expect(henryUnions.map((u) => u.id)).toEqual([
      MOCK_IDS.unions.tripleMarriage1Widowed,
      MOCK_IDS.unions.tripleMarriage2Divorced,
      MOCK_IDS.unions.tripleMarriage3Active,
    ]);
    expect(henryUnions.map((u) => u.status)).toEqual(['widowed', 'divorced', 'active']);

    const henryPartners = getPartners(graph, MOCK_IDS.tripleMarriedAncestor);
    expect(henryPartners.map((p) => p.id)).toEqual([
      MOCK_IDS.firstWife,
      MOCK_IDS.secondWifeDivorced,
      MOCK_IDS.thirdWife,
    ]);

    const martinUnions = graph.getUnionsAsPartner(MOCK_IDS.father);
    expect(martinUnions.map((u) => u.id)).toEqual([
      MOCK_IDS.unions.focusParentsDivorced,
      MOCK_IDS.unions.blendedRemarriage,
    ]);
  });

  it('classifies full, half, step, single-parent, and twin siblings accurately', () => {
    const oliverSibs = getSiblings(graph, MOCK_IDS.focus, {
      includeHalf: true,
      includeStep: true,
    });
    const byId = new Map(oliverSibs.map((s) => [s.person.id, s]));

    expect(byId.get(MOCK_IDS.fullSister)?.kind).toBe('full');
    expect(byId.get(MOCK_IDS.halfSister)?.kind).toBe('half');
    expect(byId.get(MOCK_IDS.halfSister)?.sharedParentIds).toEqual([MOCK_IDS.father]);
    expect(byId.get(MOCK_IDS.stepBrother)?.kind).toBe('step');
    expect(byId.get(MOCK_IDS.stepBrother)?.sharedParentIds).toEqual([]);

    // Without step or half siblings
    const fullOnly = getSiblings(graph, MOCK_IDS.focus, {
      includeHalf: false,
      includeStep: false,
    });
    expect(fullOnly.map((s) => s.person.id)).toEqual([MOCK_IDS.fullSister]);

    // Single-parent union children are full siblings to each other
    const singleParentSibs = getSiblings(graph, MOCK_IDS.singleParentChildA);
    expect(singleParentSibs).toHaveLength(1);
    expect(singleParentSibs[0]?.person.id).toBe(MOCK_IDS.singleParentChildB);
    expect(singleParentSibs[0]?.kind).toBe('full');

    // Twins share identical birth dates
    const mayaSibs = getSiblings(graph, MOCK_IDS.twinDaughterMaya);
    expect(mayaSibs.map((s) => s.person.id)).toEqual([MOCK_IDS.twinSonLeo]);
    expect(graph.getPerson(MOCK_IDS.twinDaughterMaya)?.birth?.date?.raw).toBe('18 Aug 1990');
    expect(graph.getPerson(MOCK_IDS.twinSonLeo)?.birth?.date?.raw).toBe('18 Aug 1990');
  });

  it('respects lineageMode (all vs biological vs legal) for adoption and per-parent relations', () => {
    const lucasAll = getParents(graph, MOCK_IDS.adoptedChild, { lineageMode: 'all' });
    expect(lucasAll.map((p) => p.id).sort()).toEqual([
      MOCK_IDS.fullSister,
      MOCK_IDS.halfSister,
      MOCK_IDS.birthFatherDaniel,
      MOCK_IDS.sameSexPartnerNadia,
    ].sort());

    const lucasBio = getParents(graph, MOCK_IDS.adoptedChild, { lineageMode: 'biological' });
    expect(lucasBio.map((p) => p.id).sort()).toEqual([
      MOCK_IDS.halfSister,
      MOCK_IDS.birthFatherDaniel,
    ].sort());

    const lucasLegal = getParents(graph, MOCK_IDS.adoptedChild, { lineageMode: 'legal' });
    expect(lucasLegal.map((p) => p.id).sort()).toEqual([
      MOCK_IDS.fullSister,
      MOCK_IDS.halfSister,
      MOCK_IDS.birthFatherDaniel,
      MOCK_IDS.sameSexPartnerNadia,
    ].sort());

    // Per-parent parentRelations in blended union U9: Hannah (P24) is biological to P20, step to P15
    const hannahAll = getParents(graph, MOCK_IDS.stepSisterInBlendedUnion, { lineageMode: 'all' });
    expect(hannahAll.map((p) => p.id).sort()).toEqual([MOCK_IDS.father, MOCK_IDS.stepMother].sort());

    const hannahBio = getParents(graph, MOCK_IDS.stepSisterInBlendedUnion, {
      lineageMode: 'biological',
    });
    expect(hannahBio.map((p) => p.id)).toEqual([MOCK_IDS.stepMother]);
  });

  it('calculates generations across 7 levels, handles pedigree collapse without conflict, and tracks unreachable nodes', () => {
    const gens = calculateGenerations(graph, MOCK_IDS.focus);
    expect(gens.minGeneration).toBe(-4);
    expect(gens.maxGeneration).toBe(2);
    expect(gens.conflicts).toEqual([]);
    expect(gens.generations.get(MOCK_IDS.focus)).toBe(0);
    expect(gens.generations.get(MOCK_IDS.cousinSpouseChloe)).toBe(0);
    expect(gens.generations.get(MOCK_IDS.father)).toBe(-1);
    expect(gens.generations.get(MOCK_IDS.grandfather)).toBe(-2);
    expect(gens.generations.get(MOCK_IDS.tripleMarriedAncestor)).toBe(-3);
    expect(gens.generations.get(MOCK_IDS.greatGreatGrandfather)).toBe(-4);
    expect(gens.generations.get(MOCK_IDS.twinDaughterMaya)).toBe(1);
    expect(gens.generations.get(MOCK_IDS.grandchildZara)).toBe(2);
    expect(gens.unreachablePersonIds).toEqual([
      MOCK_IDS.disconnectedHusband,
      MOCK_IDS.disconnectedWife,
    ]);

    // Map keys in byGeneration must iterate in ascending numerical order (-4 .. +2)
    expect([...gens.byGeneration.keys()]).toEqual([-4, -3, -2, -1, 0, 1, 2]);

    // Re-centering on grandchild shifts generations cleanly
    const fromZara = calculateGenerations(graph, MOCK_IDS.grandchildZara);
    expect(fromZara.minGeneration).toBe(-6);
    expect(fromZara.maxGeneration).toBe(0);
    expect(fromZara.generations.get(MOCK_IDS.focus)).toBe(-2);
  });

  it('detects and reports GenerationConflict on inter-generational marriage without looping', () => {
    // Inter-generational marriage: uncle marries niece
    const tree: FamilyTree = {
      schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
      metadata: {},
      persons: {
        G: { id: 'G', name: { display: 'Grandpa' }, sex: 'male', events: [], media: [], notes: [], citations: [] },
        U: { id: 'U', name: { display: 'Uncle' }, sex: 'male', events: [], media: [], notes: [], citations: [] },
        M: { id: 'M', name: { display: 'Mother' }, sex: 'female', events: [], media: [], notes: [], citations: [] },
        N: { id: 'N', name: { display: 'Niece' }, sex: 'female', events: [], media: [], notes: [], citations: [] },
      },
      unions: {
        U_ROOT: {
          id: 'U_ROOT',
          partners: [{ personId: 'G', role: 'husband' }],
          children: [
            { personId: 'U', pedigree: 'biological' },
            { personId: 'M', pedigree: 'biological' },
          ],
          type: 'marriage',
          status: 'active',
          events: [],
          notes: [],
          citations: [],
        },
        U_MOTHER: {
          id: 'U_MOTHER',
          partners: [{ personId: 'M', role: 'wife' }],
          children: [{ personId: 'N', pedigree: 'biological' }],
          type: 'marriage',
          status: 'active',
          events: [],
          notes: [],
          citations: [],
        },
        U_INTERGEN: {
          id: 'U_INTERGEN',
          partners: [
            { personId: 'U', role: 'husband' },
            { personId: 'N', role: 'wife' },
          ],
          children: [],
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

    const res = calculateGenerations(tree, 'U');
    expect(res.generations.get('U')).toBe(0);
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.conflicts.some((c) => c.personId === 'N' || c.personId === 'M')).toBe(true);
  });

  it('computes ancestors and descendants with depth bounds, spouse inclusion, and exact path counts', () => {
    // Maya (P30) has pedigree collapse through first-cousin parents Oliver (P1) and Chloe (P26)
    const mayaAnc = getAncestors(graph, MOCK_IDS.twinDaughterMaya);
    expect(mayaAnc.get(MOCK_IDS.focus)).toEqual({
      personId: MOCK_IDS.focus,
      minDepth: 1,
      maxDepth: 1,
      pathCount: 1,
    });
    expect(mayaAnc.get(MOCK_IDS.grandfather)).toEqual({
      personId: MOCK_IDS.grandfather,
      minDepth: 3,
      maxDepth: 3,
      pathCount: 2,
    });
    expect(mayaAnc.get(MOCK_IDS.grandmother)?.pathCount).toBe(2);
    expect(mayaAnc.get(MOCK_IDS.greatGreatGrandfather)).toEqual({
      personId: MOCK_IDS.greatGreatGrandfather,
      minDepth: 5,
      maxDepth: 5,
      pathCount: 2,
    });

    // Bounded depth
    const mayaDepth2 = getAncestors(graph, MOCK_IDS.twinDaughterMaya, { maxDepth: 2 });
    expect(mayaDepth2.has(MOCK_IDS.father)).toBe(true);
    expect(mayaDepth2.has(MOCK_IDS.grandfather)).toBe(false);

    // Descendants with spouses
    const arthurDescNoSpouses = getDescendants(graph, MOCK_IDS.grandfather, {
      maxDepth: 2,
      includeSpouses: false,
    });
    expect(arthurDescNoSpouses.has(MOCK_IDS.mother)).toBe(false);
    expect(arthurDescNoSpouses.has(MOCK_IDS.focus)).toBe(true);

    const arthurDescWithSpouses = getDescendants(graph, MOCK_IDS.grandfather, {
      maxDepth: 2,
      includeSpouses: true,
    });
    expect(arthurDescWithSpouses.get(MOCK_IDS.mother)).toEqual({
      personId: MOCK_IDS.mother,
      minDepth: 1,
      maxDepth: 1,
      pathCount: 0,
      isSpouseOnly: true,
    });
  });

  it('computes pathCount in O(V + E) on a 12-level stacked diamond pedigree without exponential blowup', () => {
    const persons: FamilyTree['persons'] = {};
    const unions: FamilyTree['unions'] = {};

    const makeP = (id: string) => {
      persons[id] = {
        id,
        name: { display: id },
        sex: 'unknown',
        events: [],
        media: [],
        notes: [],
        citations: [],
      };
    };

    // 12 stacked diamond levels: A_0 -> (L_1, R_1) -> A_1 -> ... -> A_12 (2^12 = 4096 paths)
    makeP('A_0');
    for (let i = 1; i <= 12; i++) {
      const prevA = `A_${i - 1}`;
      const left = `L_${i}`;
      const right = `R_${i}`;
      const nextA = `A_${i}`;
      makeP(left);
      makeP(right);
      makeP(nextA);

      unions[`U_TOP_${i}`] = {
        id: `U_TOP_${i}`,
        partners: [{ personId: left }, { personId: right }],
        children: [{ personId: prevA, pedigree: 'biological' }],
        type: 'marriage',
        status: 'active',
        events: [],
        notes: [],
        citations: [],
      };
      unions[`U_L_${i}`] = {
        id: `U_L_${i}`,
        partners: [{ personId: nextA }],
        children: [{ personId: left, pedigree: 'biological' }],
        type: 'marriage',
        status: 'active',
        events: [],
        notes: [],
        citations: [],
      };
      unions[`U_R_${i}`] = {
        id: `U_R_${i}`,
        partners: [{ personId: nextA }],
        children: [{ personId: right, pedigree: 'biological' }],
        type: 'marriage',
        status: 'active',
        events: [],
        notes: [],
        citations: [],
      };
    }

    const diamondTree: FamilyTree = {
      schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
      metadata: {},
      persons,
      unions,
      media: {},
      sources: {},
      repositories: {},
      notes: {},
    };

    const start = performance.now();
    const anc = getAncestors(diamondTree, 'A_0');
    const elapsedMs = performance.now() - start;

    expect(anc.get('A_12')).toEqual({
      personId: 'A_12',
      minDepth: 24,
      maxDepth: 24,
      pathCount: 4096,
    });
    expect(elapsedMs).toBeLessThan(100);
  });

  it('finds shared ancestors, LCAs, shortest paths, and describes relationships including double first cousins', () => {
    // Chloe (P26) and Julian (P37) are double first cousins (share 4 grandparent LCAs across U6 and U15)
    const lcas = findLowestCommonAncestors(
      graph,
      MOCK_IDS.cousinSpouseChloe,
      MOCK_IDS.doubleCousinJulian,
    );
    expect(lcas.map((l) => l.ancestorId).sort()).toEqual([
      MOCK_IDS.grandfather,
      MOCK_IDS.grandmother,
      MOCK_IDS.ellisGrandfather,
      MOCK_IDS.ellisGrandmother,
    ].sort());

    const sharedAll = findSharedAncestors(
      graph,
      MOCK_IDS.cousinSpouseChloe,
      MOCK_IDS.doubleCousinJulian,
    );
    expect(sharedAll.length).toBeGreaterThan(lcas.length);

    expect(
      describeRelationship(graph, MOCK_IDS.cousinSpouseChloe, MOCK_IDS.doubleCousinJulian),
    ).toMatchObject({
      kind: 'cousin',
      label: 'Double 1st cousin',
      degree: 1,
      removal: 0,
      isDoubleCousin: true,
    });

    // Standard relationships from Oliver (P1)
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.focus).kind).toBe('self');
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.father)).toMatchObject({
      kind: 'ancestor',
      label: 'Parent',
    });
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.grandchildZara)).toMatchObject({
      kind: 'descendant',
      label: 'Grandchild',
    });
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.greatGreatGrandfather)).toMatchObject({
      kind: 'ancestor',
      label: '2nd great-grandparent',
    });
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.fullSister).kind).toBe('full_sibling');
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.halfSister).kind).toBe('half_sibling');
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.auntHelen)).toMatchObject({
      kind: 'aunt_uncle',
      label: 'Aunt / Uncle',
    });
    expect(describeRelationship(graph, MOCK_IDS.auntHelen, MOCK_IDS.focus)).toMatchObject({
      kind: 'niece_nephew',
      label: 'Niece / Nephew',
    });
    expect(describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.cousinSpouseChloe)).toMatchObject({
      kind: 'cousin',
      label: '1st cousin',
      degree: 1,
      removal: 0,
      isDoubleCousin: false,
    });

    // 1st cousin once removed: Julian (P37, Gen 0) and Maya (P30, Gen +1)
    expect(
      describeRelationship(graph, MOCK_IDS.doubleCousinJulian, MOCK_IDS.twinDaughterMaya),
    ).toMatchObject({
      kind: 'cousin',
      label: '1st cousin once removed',
      degree: 1,
      removal: 1,
    });

    // Spouse & In-law & Unrelated
    expect(describeRelationship(graph, MOCK_IDS.mother, MOCK_IDS.stepMother)).toMatchObject({
      kind: 'in_law',
    });
    expect(
      describeRelationship(graph, MOCK_IDS.focus, MOCK_IDS.disconnectedHusband),
    ).toMatchObject({
      kind: 'unrelated',
      shortestPath: null,
    });

    const spouseOnlyTree: FamilyTree = {
      schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
      metadata: {},
      persons: {
        A: { id: 'A', name: { display: 'A' }, sex: 'male', events: [], media: [], notes: [], citations: [] },
        B: { id: 'B', name: { display: 'B' }, sex: 'female', events: [], media: [], notes: [], citations: [] },
      },
      unions: {
        U: {
          id: 'U',
          partners: [{ personId: 'A' }, { personId: 'B' }],
          children: [],
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
    expect(describeRelationship(spouseOnlyTree, 'A', 'B').kind).toBe('spouse');
    expect(findShortestPath(graph, MOCK_IDS.focus, MOCK_IDS.grandchildZara)?.length).toBe(2);
  });

  it('filters branches across all 5 modes while maintaining strict validity and pruning orphaned assets', () => {
    const ancestors2 = filterBranch(graph, {
      mode: 'ancestors',
      focusPersonId: MOCK_IDS.focus,
      ancestorLevels: 2,
    });
    expect(validateFamilyTree(ancestors2).valid).toBe(true);
    expect(Object.keys(ancestors2.persons).sort()).toEqual([
      MOCK_IDS.focus,
      MOCK_IDS.grandfather,
      MOCK_IDS.grandmother,
      MOCK_IDS.father,
      MOCK_IDS.mother,
    ].sort());
    // M4 belongs to P2 (gen -4), so it must be pruned
    expect(ancestors2.media.M4).toBeUndefined();
    expect(ancestors2.media.M1).toBeDefined();

    const descendants1 = filterBranch(graph, {
      mode: 'descendants',
      focusPersonId: MOCK_IDS.focus,
      descendantLevels: 1,
      includeSpouses: true,
    });
    expect(validateFamilyTree(descendants1).valid).toBe(true);
    expect(Object.keys(descendants1.persons).sort()).toEqual([
      MOCK_IDS.focus,
      MOCK_IDS.cousinSpouseChloe,
      MOCK_IDS.twinDaughterMaya,
      MOCK_IDS.twinSonLeo,
      MOCK_IDS.grandchildPartnerSamir,
    ].sort());

    const hourglass = filterBranch(graph, {
      mode: 'hourglass',
      focusPersonId: MOCK_IDS.focus,
      ancestorLevels: 1,
      descendantLevels: 1,
      includeFocusSiblings: true,
    });
    expect(validateFamilyTree(hourglass).valid).toBe(true);
    expect(hourglass.persons[MOCK_IDS.halfSister]).toBeDefined();
    expect(hourglass.persons[MOCK_IDS.fullSister]).toBeDefined();
    expect(hourglass.persons[MOCK_IDS.grandfather]).toBeUndefined();

    const connectedBlackwood = filterBranch(graph, {
      mode: 'connected',
      focusPersonId: MOCK_IDS.disconnectedHusband,
    });
    expect(validateFamilyTree(connectedBlackwood).valid).toBe(true);
    expect(Object.keys(connectedBlackwood.persons).sort()).toEqual([
      MOCK_IDS.disconnectedHusband,
      MOCK_IDS.disconnectedWife,
    ]);

    const pairLineage = filterBranch(graph, {
      mode: 'lineage_pair',
      focusPersonId: MOCK_IDS.focus,
      targetPersonId: MOCK_IDS.doubleCousinJulian,
    });
    expect(validateFamilyTree(pairLineage).valid).toBe(true);
    expect(Object.keys(pairLineage.persons).sort()).toEqual([
      MOCK_IDS.focus,
      MOCK_IDS.grandfather,
      MOCK_IDS.grandmother,
      MOCK_IDS.father,
      MOCK_IDS.uncleDavid,
      MOCK_IDS.doubleCousinJulian,
    ].sort());

    const livingOnly = filterBranch(graph, {
      mode: 'connected',
      focusPersonId: MOCK_IDS.focus,
      livingFilter: 'living_only',
    });
    expect(validateFamilyTree(livingOnly).valid).toBe(true);
    expect(livingOnly.persons[MOCK_IDS.focus]).toBeDefined();
    expect(livingOnly.persons[MOCK_IDS.father]).toBeUndefined();

    const surnameFiltered = filterBranch(graph, {
      mode: 'connected',
      focusPersonId: MOCK_IDS.focus,
      predicate: (p) => p.name.surname === 'Hawthorne',
    });
    expect(validateFamilyTree(surnameFiltered).valid).toBe(true);
    expect(surnameFiltered.persons[MOCK_IDS.mother]).toBeUndefined();
    expect(surnameFiltered.metadata.defaultRootPersonId).toBe(MOCK_IDS.focus);
  });

  it('computes connected components and tree statistics accurately', () => {
    const components = getConnectedComponents(graph);
    expect(components).toHaveLength(2);
    expect(components[0]?.length).toBe(39);
    expect(components[1]).toEqual([
      MOCK_IDS.disconnectedHusband,
      MOCK_IDS.disconnectedWife,
    ]);

    const stats = getTreeStats(graph);
    expect(stats.personCount).toBe(41);
    expect(stats.unionCount).toBe(18);
    expect(stats.mediaCount).toBe(4);
    expect(stats.missingMediaFileCount).toBe(2);
    expect(stats.remarriedPersonCount).toBe(3); // P4, P15, P20
    expect(stats.multiParentUnionPersonCount).toBe(1); // P27
    expect(stats.singleParentUnionCount).toBe(1); // U17
    expect(stats.disconnectedComponentCount).toBe(2);
    expect(stats.earliestBirthYear).toBe(1848);
    expect(stats.latestBirthYear).toBe(2021);
    expect(stats.minGenerationFromRoot).toBe(-4);
    expect(stats.maxGenerationFromRoot).toBe(2);
  });
});
