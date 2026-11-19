import { describe, expect, it } from 'vitest';
import { MOCK_IDS, createFamilyGraph, createMockFamilyTree } from '../src/core/index.js';
import { auditLayoutGeometry } from '../src/layout/geometryCheck.js';
import { computeTreeLayout } from '../src/layout/treeLayout.js';

describe('Contour-based TreeLayout geometric invariants', () => {
  const mockTree = createMockFamilyTree();
  const graph = createFamilyGraph(mockTree);

  it('produces zero card overlaps, zero connector-card collisions, and zero bus overlaps in hourglass mode from every key focal person', () => {
    const focalTargets = [
      MOCK_IDS.focus, // Oliver (pedigree collapse spouse, remarried father, twins, grandchild)
      MOCK_IDS.tripleMarriedAncestor, // Henry (3 marriages: widowed, divorced, active)
      MOCK_IDS.grandfather, // Arthur (pedigree collapse descendants + double cousins)
      MOCK_IDS.twinDaughterMaya, // Maya (pedigree collapse ancestors!)
      MOCK_IDS.adoptedChild, // Lucas (2 FAMC unions: biological + same-sex adoptive)
      MOCK_IDS.grandchildZara, // Zara (7 generations upward!)
      MOCK_IDS.singleParentAunt, // Margaret (single-parent union)
    ];

    for (const focusPersonId of focalTargets) {
      const layout = computeTreeLayout(graph, {
        mode: 'hourglass',
        focusPersonId,
        ancestorLevels: 6,
        descendantLevels: 6,
        includeSpouses: true,
        includeFocusSiblings: true,
        includeSpouseAncestors: true,
      });

      const audit = auditLayoutGeometry(layout);
      expect(audit.cardOverlaps, `card overlaps for focus ${focusPersonId}`).toEqual([]);
      expect(
        audit.connectorCardCollisions,
        `connector-card collisions for focus ${focusPersonId}`,
      ).toEqual([]);
      expect(
        audit.horizontalBusOverlaps,
        `horizontal bus overlaps for focus ${focusPersonId}`,
      ).toEqual([]);
      expect(layout.nodes.length).toBeGreaterThan(0);
    }
  });

  it('keeps pure ancestors and pure descendants modes geometrically clean across all levels', () => {
    for (const levels of [1, 2, 3, 5]) {
      const ancLayout = computeTreeLayout(graph, {
        mode: 'ancestors',
        focusPersonId: MOCK_IDS.grandchildZara,
        ancestorLevels: levels,
      });
      expect(auditLayoutGeometry(ancLayout).clean).toBe(true);

      const descLayout = computeTreeLayout(graph, {
        mode: 'descendants',
        focusPersonId: MOCK_IDS.greatGreatGrandfather,
        descendantLevels: levels,
        includeSpouses: true,
      });
      expect(auditLayoutGeometry(descLayout).clean).toBe(true);
    }
  });

  it('routes 3rd marriage via a top arch above intermediate spouses without colliding with any card', () => {
    const layout = computeTreeLayout(graph, {
      mode: 'descendants',
      focusPersonId: MOCK_IDS.tripleMarriedAncestor,
      descendantLevels: 3,
      includeSpouses: true,
    });

    const arches = layout.marriageConnectors.filter((m) => m.isArch);
    expect(arches.length).toBe(1);

    const audit = auditLayoutGeometry(layout);
    expect(audit.clean).toBe(true);
  });

  it('marks pedigree-collapse duplicates and supports smooth branch collapse/expand counts', () => {
    // Maya (P30) has Arthur (P8) & Clara (P13) as both paternal and maternal grandparents
    const mayaAnc = computeTreeLayout(graph, {
      mode: 'ancestors',
      focusPersonId: MOCK_IDS.twinDaughterMaya,
      ancestorLevels: 5,
    });
    expect(mayaAnc.duplicateLinks.some((d) => d.personId === MOCK_IDS.grandfather)).toBe(true);
    expect(auditLayoutGeometry(mayaAnc).clean).toBe(true);

    // Collapsing focus's union U13 hides Maya, Leo, and Zara (3 descendants)
    const collapsed = computeTreeLayout(graph, {
      mode: 'hourglass',
      focusPersonId: MOCK_IDS.focus,
      ancestorLevels: 3,
      descendantLevels: 3,
      collapsedUnionIds: new Set([MOCK_IDS.unions.pedigreeCollapseUnion]),
    });

    const u13Branch = collapsed.branchConnectors.find(
      (b) => b.unionId === MOCK_IDS.unions.pedigreeCollapseUnion,
    );
    expect(u13Branch?.isCollapsed).toBe(true);
    expect(u13Branch?.hiddenDescendantCount).toBe(3);
    expect(collapsed.nodes.some((n) => n.personId === MOCK_IDS.twinDaughterMaya)).toBe(false);
    expect(auditLayoutGeometry(collapsed).clean).toBe(true);
  });

  it('handles adoption (multiple parent unions) cleanly side-by-side without overlaps', () => {
    const lucasLayout = computeTreeLayout(graph, {
      mode: 'ancestors',
      focusPersonId: MOCK_IDS.adoptedChild,
      ancestorLevels: 3,
      lineageMode: 'all',
    });

    // Lucas (P27) should show all 4 parents (biological + same-sex adoptive) at gen -1
    const genMinus1 = lucasLayout.nodes.filter((n) => n.generation === -1);
    expect(genMinus1.map((n) => n.personId).sort()).toEqual([
      MOCK_IDS.fullSister,
      MOCK_IDS.halfSister,
      MOCK_IDS.birthFatherDaniel,
      MOCK_IDS.sameSexPartnerNadia,
    ].sort());

    const audit = auditLayoutGeometry(lucasLayout);
    expect(audit.clean).toBe(true);
  });

  it('passes zero-overlap, zero-crossing, zero-badge-collision geometry audit from EVERY person in the 41-person tree across all 3 modes', () => {
    for (const person of graph.getAllPersons()) {
      for (const mode of ['hourglass', 'ancestors', 'descendants'] as const) {
        const layout = computeTreeLayout(graph, {
          mode,
          focusPersonId: person.id,
          ancestorLevels: 5,
          descendantLevels: 5,
          includeSpouses: true,
          includeFocusSiblings: mode === 'hourglass',
          includeSpouseAncestors: mode === 'hourglass',
        });
        const audit = auditLayoutGeometry(layout);
        expect(audit.cardOverlaps, `${person.id} (${mode}) card overlaps`).toEqual([]);
        expect(
          audit.connectorCardCollisions,
          `${person.id} (${mode}) connector-card collisions`,
        ).toEqual([]);
        expect(
          audit.horizontalBusOverlaps,
          `${person.id} (${mode}) bus overlaps`,
        ).toEqual([]);
        expect(
          audit.segmentCrossings,
          `${person.id} (${mode}) segment crossings`,
        ).toEqual([]);
        expect(
          audit.badgeCollisions,
          `${person.id} (${mode}) badge collisions`,
        ).toEqual([]);
      }
    }
  });
});
