import { describe, expect, it } from 'vitest';
import { MOCK_IDS, createFamilyGraph, createMockFamilyTree } from '../src/core/index.js';
import { computeTreeLayout } from '../src/layout/treeLayout.js';
import {
  buildBotanicalTreeA3Svg,
  buildClassicA3Svg,
  buildPedigreeSlots,
  buildRadialCircleA3Svg,
  buildSidewaysPedigreeA3Svg,
} from '../src/print/index.js';

describe('A3 Print Studio SVG generators', () => {
  const graph = createFamilyGraph(createMockFamilyTree());

  it('builds binary Ahnentafel pedigree slots with pedigree collapse detection and same-sex/adopted support', () => {
    const mayaPedigree = buildPedigreeSlots(graph, MOCK_IDS.twinDaughterMaya, 5);
    expect(mayaPedigree.slots.get(1)?.person?.id).toBe(MOCK_IDS.twinDaughterMaya);
    expect(mayaPedigree.slots.get(2)?.person?.id).toBe(MOCK_IDS.focus);
    expect(mayaPedigree.slots.get(3)?.person?.id).toBe(MOCK_IDS.cousinSpouseChloe);

    const arthurSlots = [...mayaPedigree.slots.values()].filter(
      (s) => s.person?.id === MOCK_IDS.grandfather,
    );
    expect(arthurSlots.length).toBe(2);
    expect(arthurSlots.some((s) => s.isDuplicate)).toBe(true);

    const zaraPedigree = buildPedigreeSlots(graph, MOCK_IDS.grandchildZara, 6);
    expect(zaraPedigree.populatedCount).toBeGreaterThanOrEqual(14);
  });

  it('generates valid, NaN-free A3 SVGs across all 4 print styles and both orientations', () => {
    const pedigree4 = buildPedigreeSlots(graph, MOCK_IDS.grandchildZara, 4);
    const pedigree6 = buildPedigreeSlots(graph, MOCK_IDS.grandchildZara, 6);
    const layout = computeTreeLayout(graph, {
      mode: 'hourglass',
      focusPersonId: MOCK_IDS.focus,
      ancestorLevels: 3,
      descendantLevels: 2,
    });

    for (const orientation of ['landscape', 'portrait'] as const) {
      const expectedDims =
        orientation === 'landscape'
          ? 'width="420mm" height="297mm"'
          : 'width="297mm" height="420mm"';

      const svgs = [
        buildClassicA3Svg(layout, {
          title: 'Hawthorne & Vance',
          subtitle: 'Classic',
          orientation,
        }),
        buildBotanicalTreeA3Svg(pedigree4, {
          title: 'Hawthorne & Vance',
          subtitle: 'Heritage Oak',
          orientation,
          showEmptySlots: true,
          includeChildrenRoots: true,
        }),
        buildRadialCircleA3Svg(pedigree6, {
          title: 'Hawthorne & Vance',
          subtitle: '360 Radial',
          orientation,
          showEmptySlots: true,
        }),
        buildSidewaysPedigreeA3Svg(pedigree6, {
          title: 'Hawthorne & Vance',
          subtitle: 'Sideways Pedigree',
          orientation,
          showEmptySlots: true,
        }),
      ];

      for (const svg of svgs) {
        expect(svg.startsWith('<svg ')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain(expectedDims);
        expect(svg).toContain('Hawthorne &amp; Vance');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('undefined');
      }
    }
  });

  it('supports populated-only mode (showEmptySlots: false) cleanly on Botanical, Radial, and Sideways views', () => {
    const ped = buildPedigreeSlots(graph, MOCK_IDS.focus, 4);

    const botTrim = buildBotanicalTreeA3Svg(ped, {
      title: 'Trimmed Oak',
      subtitle: 'Oliver Hawthorne',
      orientation: 'landscape',
      showEmptySlots: false,
    });
    const radTrim = buildRadialCircleA3Svg(ped, {
      title: 'Trimmed Circle',
      subtitle: 'Oliver Hawthorne',
      orientation: 'landscape',
      showEmptySlots: false,
    });
    const sideTrim = buildSidewaysPedigreeA3Svg(ped, {
      title: 'Trimmed Sideways',
      subtitle: 'Oliver Hawthorne',
      orientation: 'portrait',
      showEmptySlots: false,
    });

    for (const svg of [botTrim, radTrim, sideTrim]) {
      expect(svg).toContain('Oliver Hawthorne');
      expect(svg).toContain('Thomas Hawthorne');
      expect(svg).not.toContain('NaN');
    }
  });

  it('supports couple-mode botanical horseshoe wreath with spouse pedigree and children roots', () => {
    const focusPed = buildPedigreeSlots(graph, MOCK_IDS.focus, 4, { includeSpouses: true });
    const spousePed = buildPedigreeSlots(graph, MOCK_IDS.cousinSpouseChloe, 4, {
      includeSpouses: false,
    });

    const svg = buildBotanicalTreeA3Svg(focusPed, {
      title: 'The Hawthorne–Vance Family',
      subtitle: 'Oliver Hawthorne & Chloe Ellis',
      orientation: 'landscape',
      showEmptySlots: true,
      includeChildrenRoots: true,
      spousePedigree: spousePed,
    });

    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).toContain('Oliver Hawthorne');
    expect(svg).toContain('Chloe Ellis');
    expect(svg).toContain('Maya Hawthorne');
    expect(svg).toContain('Leo Hawthorne');
    expect(svg).toContain('textPath');
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('undefined');
  });
});
