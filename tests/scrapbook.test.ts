import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  createFamilyGraph,
  createMockFamilyTree,
  MOCK_IDS,
} from '../src/core/index.js';
import {
  buildBookletPages,
  buildPersonTimeline,
  clampHighlight,
  clearLocalDraftStorage,
  createDefaultScrapbookDocument,
  createMemoryDraftAdapter,
  detectAndLoadFile,
  exportHeirloomZip,
  extractImmediateConstellation,
  extractPersonPlaces,
  generateStarterBiography,
  groupIntoSpreads,
  loadLocalDraft,
  saveLocalDraft,
  SCRAPBOOK_SCHEMA_VERSION,
  seedScrapbookFromGdzMedia,
  type ScrapbookDocument,
} from '../src/scrapbook/index.js';

describe('Heirloom Scrapbook Workstream A engine', () => {
  it('extracts immediate family constellation without duplicates under remarriages and pedigree collapse', () => {
    const tree = createMockFamilyTree();
    const graph = createFamilyGraph(tree);

    const members = extractImmediateConstellation(graph, MOCK_IDS.focus, 'all');
    const ids = members.map((m) => m.personId);
    const uniqueIds = new Set(ids);

    // Every person in constellation must appear at most once
    expect(uniqueIds.size).toBe(ids.length);

    const roleById = new Map(members.map((m) => [m.personId, m.role]));
    expect(roleById.get(MOCK_IDS.focus)).toBe('focus');
    expect(roleById.get(MOCK_IDS.cousinSpouseChloe)).toBe('spouse');
    expect(roleById.get(MOCK_IDS.twinDaughterMaya)).toBe('child');
    expect(roleById.get(MOCK_IDS.twinSonLeo)).toBe('child');
    expect(roleById.get(MOCK_IDS.fullSister)).toBe('sibling');
    expect(roleById.get(MOCK_IDS.halfSister)).toBe('sibling');
    expect(roleById.get(MOCK_IDS.father)).toBe('parent');
    expect(roleById.get(MOCK_IDS.mother)).toBe('parent');
    expect(roleById.get(MOCK_IDS.grandfather)).toBe('grandparent');
    expect(roleById.get(MOCK_IDS.grandmother)).toBe('grandparent');
  });

  it('preserves existing curated entries and assets when rebuilding constellation for a new focus person', () => {
    const tree = createMockFamilyTree();
    const graph = createFamilyGraph(tree);

    const initial = createDefaultScrapbookDocument(graph, MOCK_IDS.focus);
    const updated: ScrapbookDocument = {
      ...initial,
      entries: initial.entries.map((e) =>
        e.personId === MOCK_IDS.father
          ? { ...e, biographyText: 'Custom biography for Arthur.' }
          : e,
      ),
      assets: {
        asset_1: {
          id: 'asset_1',
          filename: 'media/arthur.jpg',
          mimeType: 'image/jpeg',
        },
      },
      personPortraitAssetIds: {
        [MOCK_IDS.father]: 'asset_1',
      },
    };

    const rebuilt = createDefaultScrapbookDocument(graph, MOCK_IDS.father, {
      existingDoc: updated,
    });
    const fatherEntry = rebuilt.entries.find(
      (e) => e.personId === MOCK_IDS.father,
    );

    expect(rebuilt.focusPersonId).toBe(MOCK_IDS.father);
    expect(fatherEntry?.role).toBe('focus');
    expect(fatherEntry?.biographyText).toBe('Custom biography for Arthur.');
    expect(fatherEntry?.portraitAssetId).toBe('asset_1');
    expect(rebuilt.assets['asset_1']).toBeDefined();
  });

  it('builds chronological timelines, deduplicated places, and readable starter biographies', () => {
    const tree = createMockFamilyTree();
    const graph = createFamilyGraph(tree);

    const timeline = buildPersonTimeline(graph, MOCK_IDS.tripleMarriedAncestor);
    expect(timeline.length).toBeGreaterThanOrEqual(4);
    expect(timeline[0]?.label).toBe('Birth');
    expect(timeline[timeline.length - 1]?.label).toBe('Death');

    const places = extractPersonPlaces(graph, MOCK_IDS.focus);
    expect(Array.isArray(places)).toBe(true);

    const bio = generateStarterBiography(graph, MOCK_IDS.focus);
    expect(bio.length).toBeGreaterThan(30);
    expect(bio).not.toContain('undefined');
    expect(bio).not.toContain('null');
  });

  it('paginates edit vs preview/print modes accurately and pairs 2-up book spreads cleanly', () => {
    const tree = createMockFamilyTree();
    const graph = createFamilyGraph(tree);
    let doc = createDefaultScrapbookDocument(graph, MOCK_IDS.focus);

    // Give focus person a certificate and custom bio; leave spouse empty; set first child compact
    doc = {
      ...doc,
      autoSkipEmptyPages: true,
      entries: doc.entries.map((e, idx) => {
        if (e.personId === MOCK_IDS.focus) {
          return {
            ...e,
            biographyText: 'Written family story.',
            certificates: [
              {
                id: 'cert_1',
                assetId: 'asset_cert',
                role: 'birth',
                title: 'Birth Record',
                highlights: [],
                rotationDeg: 1.2,
                zOrder: 1,
              },
            ],
          };
        }
        if (idx === 2) {
          return { ...e, compactMode: true };
        }
        return e;
      }),
    };

    const editPages = buildBookletPages(doc, { mode: 'edit' });
    const previewPages = buildBookletPages(doc, { mode: 'preview' });
    const printPages = buildBookletPages(doc, { mode: 'print' });

    // Edit mode keeps empty optional paperwork/story pages visible with isEmpty: true
    expect(editPages.some((p) => p.kind !== 'cover_tree' && p.isEmpty)).toBe(
      true,
    );

    // Preview/Print omits empty paperwork & story pages and re-numbers sequentially
    expect(previewPages).toEqual(printPages);
    expect(previewPages.every((p) => p.kind === 'cover_tree' || !p.isEmpty)).toBe(
      true,
    );
    expect(previewPages.map((p) => p.pageNumber)).toEqual(
      previewPages.map((_, i) => i + 1),
    );
    expect(
      previewPages.some((p) => p.kind === 'compact_profile'),
    ).toBe(true);

    // Cover page on Spread 0 right-hand side, then paired 2-up
    const spreads = groupIntoSpreads(previewPages);
    expect(spreads[0]?.spreadIndex).toBe(0);
    expect(spreads[0]?.left).toBeNull();
    expect(spreads[0]?.right?.kind).toBe('cover_tree');
    if (spreads[1]) {
      expect(spreads[1].left?.pageNumber).toBe(2);
      expect(spreads[1].right?.pageNumber).toBe(3);
    }
  });

  it('clamps normalized highlight coordinates strictly within [0, 1]', () => {
    const clamped = clampHighlight({
      id: 'h1',
      x: -0.2,
      y: 0.95,
      width: 1.5,
      height: 0.4,
      style: 'amber_highlighter',
    });

    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0.95);
    expect(clamped.width).toBe(1);
    expect(clamped.height).toBeCloseTo(0.05, 5);
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1);
  });

  it('round-trips .heirloom.zip losslessly and garbage-collects unreferenced orphan assets', async () => {
    const tree = createMockFamilyTree();
    const graph = createFamilyGraph(tree);
    let doc = createDefaultScrapbookDocument(graph, MOCK_IDS.focus);

    const portraitBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
    const certBytes = new Uint8Array([255, 216, 255, 224, 9, 8, 7, 6]);
    const orphanBytes = new Uint8Array([1, 2, 3]);

    const assetBlobs = new Map<string, Blob>([
      ['asset_portrait', new Blob([portraitBytes], { type: 'image/png' })],
      ['asset_cert', new Blob([certBytes], { type: 'image/jpeg' })],
      ['asset_orphan', new Blob([orphanBytes], { type: 'image/png' })],
    ]);

    doc = {
      ...doc,
      title: 'McGhee Family Test Album',
      assets: {
        asset_portrait: {
          id: 'asset_portrait',
          filename: 'media/focus_portrait.png',
          mimeType: 'image/png',
        },
        asset_cert: {
          id: 'asset_cert',
          filename: 'media/birth_cert.jpg',
          mimeType: 'image/jpeg',
        },
        asset_orphan: {
          id: 'asset_orphan',
          filename: 'media/orphan.png',
          mimeType: 'image/png',
        },
      },
      personPortraitAssetIds: {
        [MOCK_IDS.focus]: 'asset_portrait',
      },
      entries: doc.entries.map((e) =>
        e.personId === MOCK_IDS.focus
          ? {
              ...e,
              portraitAssetId: 'asset_portrait',
              biographyText: 'Lived happily in Paisley.',
              groupPolaroid: {
                id: 'pol_1',
                assetId: 'asset_portrait',
                caption: 'Summer 1978 Picnic',
                rotationDeg: -1.5,
              },
              certificates: [
                {
                  id: 'cert_1',
                  assetId: 'asset_cert',
                  role: 'birth',
                  title: 'GRO Birth Register',
                  highlights: [
                    {
                      id: 'hl_1',
                      x: 0.1,
                      y: 0.42,
                      width: 0.78,
                      height: 0.08,
                      style: 'amber_highlighter',
                      label: 'Row #14',
                      showZoomCallout: true,
                    },
                  ],
                  rotationDeg: 1.4,
                  zOrder: 1,
                },
              ],
            }
          : e,
      ),
    };

    const zipBlob = await exportHeirloomZip({
      tree,
      scrapbookDoc: doc,
      assetBlobs,
    });

    const bundleFile = new File(
      [new Uint8Array(await zipBlob.arrayBuffer())],
      'mcghee-album.heirloom.zip',
      { type: 'application/zip' },
    );

    const loaded = await detectAndLoadFile(bundleFile);
    expect(loaded.kind).toBe('heirloom_zip');
    expect(Object.keys(loaded.tree.persons).length).toBe(
      Object.keys(tree.persons).length,
    );
    expect(loaded.scrapbookDoc?.schemaVersion).toBe(SCRAPBOOK_SCHEMA_VERSION);
    expect(loaded.scrapbookDoc?.title).toBe('McGhee Family Test Album');

    // Orphan asset must be garbage-collected on export
    expect(loaded.scrapbookDoc?.assets['asset_orphan']).toBeUndefined();
    expect(loaded.scrapbookAssetBlobs.has('asset_orphan')).toBe(false);

    // Binary bytes round-trip identically
    const restoredPortrait = new Uint8Array(
      await loaded.scrapbookAssetBlobs.get('asset_portrait')!.arrayBuffer(),
    );
    const restoredCert = new Uint8Array(
      await loaded.scrapbookAssetBlobs.get('asset_cert')!.arrayBuffer(),
    );
    expect(restoredPortrait).toEqual(portraitBytes);
    expect(restoredCert).toEqual(certBytes);

    // Curated highlights & Polaroid captions preserved
    const focusEntry = loaded.scrapbookDoc?.entries.find(
      (e) => e.personId === MOCK_IDS.focus,
    );
    expect(focusEntry?.groupPolaroid?.caption).toBe('Summer 1978 Picnic');
    expect(focusEntry?.certificates[0]?.highlights[0]?.showZoomCallout).toBe(
      true,
    );
  });

  it('imports a GEDCOM 7.0 .gdz archive, sets MIME types, and seeds scrapbook portraits & certificates', async () => {
    const ged7 = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 7.0',
      '0 @I1@ INDI',
      '1 NAME Robert /McGhee/',
      '1 SEX M',
      '1 OBJE @M1@',
      '1 OBJE @M2@',
      '0 @M1@ OBJE',
      '1 FILE media/robert.jpg',
      '2 FORM image/jpeg',
      '2 TITL Portrait of Robert',
      '0 @M2@ OBJE',
      '1 FILE media/birth_register.png',
      '2 FORM image/png',
      '2 TITL Birth Certificate 1924',
      '0 TRLR',
    ].join('\n');

    const img1 = new Uint8Array([255, 216, 255, 225, 42]);
    const img2 = new Uint8Array([137, 80, 78, 71, 99]);

    const gdzBytes = zipSync({
      'gedcom.ged': strToU8(ged7),
      'media/robert.jpg': img1,
      'media/birth_register.png': img2,
    });

    const gdzFile = new File(
      [new Uint8Array(gdzBytes)],
      'mcghee-tree.gdz',
      { type: 'application/zip' },
    );

    const loaded = await detectAndLoadFile(gdzFile);
    expect(loaded.kind).toBe('gdz');
    expect(loaded.tree.media['M1']?.mimeType).toBe('image/jpeg');
    expect(loaded.tree.media['M2']?.mimeType).toBe('image/png');
    expect(loaded.gedcomMediaBlobs.size).toBe(2);

    const graph = createFamilyGraph(loaded.tree);
    const baseDoc = createDefaultScrapbookDocument(graph, 'I1');
    const seeded = seedScrapbookFromGdzMedia(
      graph,
      baseDoc,
      loaded.gedcomMediaBlobs,
    );

    const entry = seeded.doc.entries.find((e) => e.personId === 'I1');
    expect(entry?.portraitAssetId).toBeDefined();
    expect(seeded.doc.personPortraitAssetIds?.['I1']).toBe(
      entry?.portraitAssetId,
    );
    expect(entry?.certificates.length).toBe(1);
    expect(entry?.certificates[0]?.role).toBe('birth');
    expect(seeded.assetBlobs.size).toBe(2);
  });

  it('persists, garbage-collects orphans, handles quota errors, and wipes local drafts via adapter', async () => {
    const tree = createMockFamilyTree();
    const graph = createFamilyGraph(tree);
    const baseDoc = createDefaultScrapbookDocument(graph, MOCK_IDS.focus);
    const adapter = createMemoryDraftAdapter();

    const docWithTwoAssets: ScrapbookDocument = {
      ...baseDoc,
      assets: {
        a1: { id: 'a1', filename: 'media/a1.jpg', mimeType: 'image/jpeg' },
        a2: { id: 'a2', filename: 'media/a2.jpg', mimeType: 'image/jpeg' },
      },
      personPortraitAssetIds: {
        [MOCK_IDS.focus]: 'a1',
        [MOCK_IDS.father]: 'a2',
      },
    };

    const blobs = new Map<string, Blob>([
      ['a1', new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' })],
      ['a2', new Blob([new Uint8Array([3, 4])], { type: 'image/jpeg' })],
    ]);

    const save1 = await saveLocalDraft(
      {
        tree,
        scrapbook: docWithTwoAssets,
        focusPersonId: MOCK_IDS.focus,
        assetBlobs: blobs,
      },
      adapter,
    );
    expect(save1.ok).toBe(true);
    expect(adapter.getStoredAssetKeys().sort()).toEqual(['a1', 'a2']);

    const restored = await loadLocalDraft(adapter);
    expect(restored?.session.focusPersonId).toBe(MOCK_IDS.focus);
    expect(restored?.assetBlobs.size).toBe(2);

    // Update removing reference to a2 -> orphan blob must be garbage-collected
    const docWithOneAsset: ScrapbookDocument = {
      ...docWithTwoAssets,
      personPortraitAssetIds: {
        [MOCK_IDS.focus]: 'a1',
      },
    };
    const save2 = await saveLocalDraft(
      {
        tree,
        scrapbook: docWithOneAsset,
        focusPersonId: MOCK_IDS.focus,
        assetBlobs: blobs,
      },
      adapter,
    );
    expect(save2.ok).toBe(true);
    expect(adapter.getStoredAssetKeys()).toEqual(['a1']);

    // Wipe cleanly
    await clearLocalDraftStorage(adapter);
    expect(await loadLocalDraft(adapter)).toBeNull();
    expect(adapter.getStoredAssetKeys()).toEqual([]);

    // Simulated QuotaExceededError returns clean status without throwing
    const quotaAdapter = createMemoryDraftAdapter({ simulateQuotaError: true });
    const quotaRes = await saveLocalDraft(
      {
        tree,
        scrapbook: docWithTwoAssets,
        focusPersonId: MOCK_IDS.focus,
        assetBlobs: blobs,
      },
      quotaAdapter,
    );
    expect(quotaRes).toEqual({ ok: false, reason: 'quota_exceeded' });
  });
});
