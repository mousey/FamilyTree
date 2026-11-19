import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createFamilyGraph,
  createMockFamilyTree,
  describeRelationship,
  getTreeStats,
  serializeFamilyTreeJson,
  serializeGedcom,
  type FamilyTree,
  type LineageMode,
  type MediaId,
  type PersonId,
  type UnionId,
} from './core/index.js';
import { computeTreeLayout } from './layout/treeLayout.js';
import type { LayoutMode } from './layout/types.js';
import {
  buildBookletPages,
  detectAndLoadFile,
  groupIntoSpreads,
  isSupportedImportFilename,
  useScrapbookStore,
  type HydratedDraftPayload,
  type LoadedBundleResult,
} from './scrapbook/index.js';
import { DetailDrawer } from './components/DetailDrawer.js';
import { PrintModal } from './components/PrintModal.js';
import { RelationshipModal } from './components/RelationshipModal.js';
import { Toolbar } from './components/Toolbar.js';
import { TreeCanvas, type TreeCanvasHandle } from './components/TreeCanvas.js';
import { ScrapbookPrintModal } from './components/scrapbook/ScrapbookPrintModal.js';
import { ScrapbookPrintSheet } from './components/scrapbook/ScrapbookPrintSheet.js';
import { ScrapbookWorkspace } from './components/scrapbook/ScrapbookWorkspace.js';

export function App() {
  const [tree, setTree] = useState<FamilyTree>(() => createMockFamilyTree());
  const [rawGedcom, setRawGedcom] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<'tree' | 'scrapbook'>('tree');
  const [scrapbookViewMode, setScrapbookViewMode] = useState<'edit' | 'preview'>('edit');
  const [scrapbookSpreadIndex, setScrapbookSpreadIndex] = useState<number>(0);
  const [scrapbookPrintModalOpen, setScrapbookPrintModalOpen] = useState(false);
  const [scrapbookPrintActive, setScrapbookPrintActive] = useState(false);
  const [focusPersonId, setFocusPersonId] = useState<PersonId>(
    () => tree.metadata.defaultRootPersonId ?? Object.keys(tree.persons)[0] ?? '',
  );
  const [selectedPersonId, setSelectedPersonId] = useState<PersonId | null>(null);

  const [mode, setMode] = useState<LayoutMode>('hourglass');
  const [ancestorLevels, setAncestorLevels] = useState<number>(3);
  const [descendantLevels, setDescendantLevels] = useState<number>(3);
  const [includeSpouses, setIncludeSpouses] = useState<boolean>(true);
  const [includeFocusSiblings, setIncludeFocusSiblings] = useState<boolean>(true);
  const [includeSpouseAncestors, setIncludeSpouseAncestors] = useState<boolean>(false);
  const [lineageMode, setLineageMode] = useState<LineageMode>('all');

  const [collapsedUnionIds, setCollapsedUnionIds] = useState<Set<UnionId>>(() => new Set());
  const [collapsedAncestorIds, setCollapsedAncestorIds] = useState<Set<string>>(() => new Set());

  const [highlightedPersonIds, setHighlightedPersonIds] = useState<Set<PersonId>>(
    () => new Set(),
  );
  const [highlightBannerText, setHighlightBannerText] = useState<string | undefined>(undefined);

  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [relationshipModalTarget, setRelationshipModalTarget] = useState<PersonId | null>(null);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printPayload, setPrintPayload] = useState<{
    svg: string;
    orientation: 'landscape' | 'portrait';
  } | null>(null);

  const [personPhotoOverrides, setPersonPhotoOverrides] = useState<Map<PersonId, string>>(
    () => new Map(),
  );
  const [mediaFileOverrides, setMediaFileOverrides] = useState<Map<MediaId, string>>(
    () => new Map(),
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const canvasRef = useRef<TreeCanvasHandle>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
    }, 3400);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const graph = useMemo(() => createFamilyGraph(tree), [tree]);

  const effectiveFocusId = useMemo(() => {
    if (graph.getPerson(focusPersonId)) return focusPersonId;
    return tree.metadata.defaultRootPersonId ?? Object.keys(tree.persons)[0] ?? '';
  }, [focusPersonId, graph, tree.metadata.defaultRootPersonId, tree.persons]);

  const stats = useMemo(
    () => getTreeStats(graph, effectiveFocusId || undefined),
    [effectiveFocusId, graph],
  );

  const layout = useMemo(() => {
    if (!effectiveFocusId) {
      throw new Error('Tree contains no individuals.');
    }
    return computeTreeLayout(graph, {
      mode,
      focusPersonId: effectiveFocusId,
      ancestorLevels,
      descendantLevels,
      includeSpouses,
      includeFocusSiblings,
      includeSpouseAncestors,
      lineageMode,
      collapsedUnionIds,
      collapsedAncestorIds,
    });
  }, [
    ancestorLevels,
    collapsedAncestorIds,
    collapsedUnionIds,
    descendantLevels,
    effectiveFocusId,
    graph,
    includeFocusSiblings,
    includeSpouseAncestors,
    includeSpouses,
    lineageMode,
    mode,
  ]);

  // Compute relationship badge labels relative to the active focal person
  const relationshipLabels = useMemo(() => {
    const map = new Map<PersonId, string>();
    if (!effectiveFocusId) return map;
    for (const person of graph.getAllPersons()) {
      if (person.id === effectiveFocusId) {
        map.set(person.id, 'Focus');
      } else {
        const rel = describeRelationship(graph, effectiveFocusId, person.id, {
          lineageMode,
        });
        if (rel.kind !== 'unrelated') {
          map.set(person.id, rel.label);
        }
      }
    }
    return map;
  }, [effectiveFocusId, graph, lineageMode]);

  const handleHydratedSession = useCallback(
    (payload: HydratedDraftPayload) => {
      setTree(payload.tree);
      setRawGedcom(payload.rawGedcom ?? null);
      setFocusPersonId(payload.focusPersonId);
      setSelectedPersonId(null);
      setCollapsedUnionIds(new Set());
      setCollapsedAncestorIds(new Set());
      setHighlightedPersonIds(new Set());
      setHighlightBannerText(undefined);
      setPersonPhotoOverrides(new Map());
      setMediaFileOverrides(new Map());
      showToast('Restored local draft from this browser');
      window.setTimeout(() => {
        canvasRef.current?.fitToScreen(true);
      }, 60);
    },
    [showToast],
  );

  const applyLoadedBundleRef = useRef<
    (loaded: LoadedBundleResult, sourceFilename: string) => void
  >(() => {});

  const scrapbookStore = useScrapbookStore({
    tree,
    graph,
    rawGedcom,
    focusPersonId: effectiveFocusId,
    lineageMode,
    onHydratedSession: handleHydratedSession,
    onImportedBundle: (loaded, filename) =>
      applyLoadedBundleRef.current(loaded, filename),
    onNotify: showToast,
  });

  // Resolve primary portrait photo URLs (shared Scrapbook asset, user override, or GEDCOM URL)
  const photoUrlsByPersonId = useMemo(() => {
    const map = new Map<PersonId, string>();
    const portraitAssets = scrapbookStore.doc.personPortraitAssetIds;
    for (const person of graph.getAllPersons()) {
      const portraitAssetId = portraitAssets?.[person.id];
      const portraitUrl = portraitAssetId
        ? scrapbookStore.assetUrls.get(portraitAssetId)
        : undefined;
      if (portraitUrl) {
        map.set(person.id, portraitUrl);
        continue;
      }
      const override = personPhotoOverrides.get(person.id);
      if (override) {
        map.set(person.id, override);
        continue;
      }
      const primaryRef = person.media.find((m) => m.isPrimary) ?? person.media[0];
      if (!primaryRef) continue;
      const mediaOverride = mediaFileOverrides.get(primaryRef.mediaId);
      if (mediaOverride) {
        map.set(person.id, mediaOverride);
        continue;
      }
      const mediaObj = tree.media[primaryRef.mediaId];
      if (mediaObj?.file && /^(https?:|data:|blob:)/.test(mediaObj.file)) {
        map.set(person.id, mediaObj.file);
      }
    }
    return map;
  }, [
    graph,
    mediaFileOverrides,
    personPhotoOverrides,
    scrapbookStore.assetUrls,
    scrapbookStore.doc.personPortraitAssetIds,
    tree.media,
  ]);

  // Global keyboard shortcuts for canvas navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (activeWorkspace === 'tree') {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          canvasRef.current?.zoomBy(1.18);
          return;
        } else if (e.key === '-') {
          e.preventDefault();
          canvasRef.current?.zoomBy(0.84);
          return;
        } else if (e.key === '0') {
          e.preventDefault();
          canvasRef.current?.fitToScreen(true);
          return;
        }
      }
      if (e.key === 'Escape') {
        setPrintModalOpen(false);
        setRelationshipModalTarget(null);
        setSelectedPersonId(null);
        setHighlightedPersonIds(new Set());
        setHighlightBannerText(undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeWorkspace]);

  const handleFocusPerson = useCallback(
    (personId: PersonId) => {
      if (!graph.getPerson(personId)) return;
      setFocusPersonId(personId);
      setCollapsedUnionIds(new Set());
      setCollapsedAncestorIds(new Set());
      scrapbookStore.notifyTreeChanged();
      window.setTimeout(() => {
        canvasRef.current?.fitToScreen(true);
      }, 40);
    },
    [graph, scrapbookStore],
  );

  const handleSelectAndPan = useCallback(
    (personId: PersonId) => {
      setSelectedPersonId(personId);
      const instances = layout.instanceIdsByPersonId.get(personId);
      const firstNode = instances?.[0]
        ? layout.nodesByInstanceId.get(instances[0])
        : undefined;
      if (firstNode) {
        canvasRef.current?.panToWorld(firstNode.x, firstNode.y);
      } else {
        // Person is outside current depth/branch -> smoothly re-focus on them!
        handleFocusPerson(personId);
        showToast(`Centered tree on ${graph.getPerson(personId)?.name.display ?? personId}`);
      }
    },
    [graph, handleFocusPerson, layout.instanceIdsByPersonId, layout.nodesByInstanceId, showToast],
  );

  const handleToggleUnionBranch = useCallback(
    (unionId: UnionId) => {
      const branch = layout.branchConnectors.find((b) => b.unionId === unionId);
      if (branch && !branch.isCollapsed && branch.hiddenDescendantCount > 0) {
        // Hidden due to descendantLevels cap -> expand depth smoothly!
        setDescendantLevels((prev) => Math.min(8, prev + 1));
        return;
      }
      setCollapsedUnionIds((prev) => {
        const next = new Set(prev);
        if (next.has(unionId)) next.delete(unionId);
        else next.add(unionId);
        return next;
      });
    },
    [layout.branchConnectors],
  );

  const handleToggleAncestors = useCallback(
    (instanceId: string) => {
      const node = layout.nodesByInstanceId.get(instanceId);
      if (node && !node.isAncestorsCollapsed && node.hiddenAncestorCount > 0) {
        // Hidden due to ancestorLevels cap -> expand depth smoothly!
        setAncestorLevels((prev) => Math.min(8, prev + 1));
        return;
      }
      setCollapsedAncestorIds((prev) => {
        const next = new Set(prev);
        if (next.has(instanceId)) next.delete(instanceId);
        else next.add(instanceId);
        return next;
      });
    },
    [layout.nodesByInstanceId],
  );

  const applyLoadedBundle = useCallback(
    (loaded: LoadedBundleResult, sourceFilename: string) => {
      const importedTree = loaded.tree;
      const personIds = Object.keys(importedTree.persons);
      if (personIds.length === 0) {
        showToast('No individuals found in imported file.');
        return;
      }

      const nextFocus =
        loaded.scrapbookDoc?.focusPersonId ??
        importedTree.metadata.defaultRootPersonId ??
        personIds[0]!;
      const nextGraph = createFamilyGraph(importedTree);

      // Revoke previous object URLs for standalone media overrides before replacing
      for (const oldUrl of mediaFileOverrides.values()) {
        if (oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
      }
      const nextMediaOverrides = new Map<MediaId, string>();
      for (const [mediaId, item] of loaded.gedcomMediaBlobs.entries()) {
        nextMediaOverrides.set(mediaId, URL.createObjectURL(item.blob));
      }

      setTree(importedTree);
      setRawGedcom(loaded.rawGedcom ?? null);
      setFocusPersonId(nextFocus);
      setSelectedPersonId(null);
      setCollapsedUnionIds(new Set());
      setCollapsedAncestorIds(new Set());
      setHighlightedPersonIds(new Set());
      setHighlightBannerText(undefined);
      setPersonPhotoOverrides(new Map());
      setMediaFileOverrides(nextMediaOverrides);

      scrapbookStore.hydrateFromBundle(loaded, nextGraph, nextFocus);

      const warningCount = loaded.warnings.length;
      const kindLabel =
        loaded.kind === 'heirloom_zip'
          ? 'Heirloom Scrapbook'
          : loaded.kind === 'gdz'
            ? `GEDZIP (${loaded.gedcomMediaBlobs.size} media)`
            : importedTree.metadata.title ?? sourceFilename;

      showToast(
        `Loaded "${kindLabel}" (${personIds.length} people${
          warningCount > 0 ? `, ${warningCount} notes` : ''
        })`,
      );

      window.setTimeout(() => {
        canvasRef.current?.fitToScreen(true);
      }, 60);
    },
    [mediaFileOverrides, scrapbookStore, showToast],
  );
  applyLoadedBundleRef.current = applyLoadedBundle;

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const loaded = await detectAndLoadFile(file);
        applyLoadedBundle(loaded, file.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Could not import file: ${msg}`);
      }
    },
    [applyLoadedBundle, showToast],
  );

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const triggerDownload = (content: string, filename: string, mime: string) => {
    triggerBlobDownload(new Blob([content], { type: mime }), filename);
  };

  const handleExportGedcom = useCallback(() => {
    const ged = serializeGedcom(tree);
    const slug = (tree.metadata.title ?? 'family-tree')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    triggerDownload(ged, `${slug}.ged`, 'text/plain;charset=utf-8');
    showToast('Exported GEDCOM 5.5.1 (.ged)');
  }, [showToast, tree]);

  const handleExportJson = useCallback(() => {
    const json = serializeFamilyTreeJson(tree, { pretty: true });
    const slug = (tree.metadata.title ?? 'family-tree')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    triggerDownload(json, `${slug}.json`, 'application/json;charset=utf-8');
    showToast('Exported FamilyTree JSON (.json)');
  }, [showToast, tree]);

  const handleExportHeirloomZip = useCallback(async () => {
    try {
      const zipBlob = await scrapbookStore.exportHeirloomZip();
      const slug = (scrapbookStore.doc.title || tree.metadata.title || 'heirloom-scrapbook')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      triggerBlobDownload(zipBlob, `${slug}.heirloom.zip`);
      showToast('Saved Heirloom Scrapbook (.heirloom.zip)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Export failed: ${msg}`);
    }
  }, [scrapbookStore, showToast, tree.metadata.title]);

  const handleResetDemo = useCallback(() => {
    const demo = createMockFamilyTree();
    const demoFocus = demo.metadata.defaultRootPersonId ?? 'P1';
    const demoGraph = createFamilyGraph(demo);
    setTree(demo);
    setRawGedcom(null);
    setFocusPersonId(demoFocus);
    setSelectedPersonId(null);
    setMode('hourglass');
    setAncestorLevels(3);
    setDescendantLevels(3);
    setCollapsedUnionIds(new Set());
    setCollapsedAncestorIds(new Set());
    setHighlightedPersonIds(new Set());
    setHighlightBannerText(undefined);
    setPersonPhotoOverrides(new Map());
    setMediaFileOverrides(new Map());
    scrapbookStore.resetForNewTree(demoGraph, demoFocus);
    showToast('Loaded Hawthorne–Vance showcase tree');
    window.setTimeout(() => canvasRef.current?.fitToScreen(true), 60);
  }, [scrapbookStore, showToast]);

  const handleAttachPersonPhoto = useCallback(
    (personId: PersonId, file: File) => {
      void scrapbookStore
        .attachPortrait(personId, file)
        .then(() => {
          showToast(
            `Attached portrait photo for ${graph.getPerson(personId)?.name.display ?? personId}`,
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          showToast(`Could not attach portrait: ${msg}`);
        });
    },
    [graph, scrapbookStore, showToast],
  );

  const handleOpenInScrapbook = useCallback(
    (personId: PersonId) => {
      if (!graph.getPerson(personId)) return;
      setFocusPersonId(personId);
      setSelectedPersonId(null);
      scrapbookStore.rebuildForFocusPerson(personId);
      setActiveWorkspace('scrapbook');
    },
    [graph, scrapbookStore],
  );

  const handleChangeWorkspace = useCallback(
    (next: 'tree' | 'scrapbook') => {
      if (
        next === 'scrapbook' &&
        !scrapbookStore.isDirty &&
        scrapbookStore.doc.focusPersonId !== effectiveFocusId
      ) {
        scrapbookStore.rebuildForFocusPerson(effectiveFocusId);
      }
      setActiveWorkspace(next);
      if (next === 'tree') {
        window.setTimeout(() => canvasRef.current?.fitToScreen(true), 40);
      }
    },
    [effectiveFocusId, scrapbookStore],
  );

  const handleAttachMediaFile = useCallback(
    (mediaId: MediaId, file: File) => {
      const url = URL.createObjectURL(file);
      setMediaFileOverrides((prev) => {
        const next = new Map(prev);
        next.set(mediaId, url);
        return next;
      });
      showToast(`Attached local image for ${tree.media[mediaId]?.title ?? mediaId}`);
    },
    [showToast, tree.media],
  );

  const handlePrintSvg = useCallback(
    (svgMarkup: string, orientation: 'landscape' | 'portrait') => {
      setScrapbookPrintActive(false);
      setPrintPayload({ svg: svgMarkup, orientation });
      setPrintModalOpen(false);

      // Update dynamic @page orientation rule cleanly before invoking window.print()
      let styleEl = document.getElementById('a3-page-orientation-style') as HTMLStyleElement | null;
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'a3-page-orientation-style';
        document.head.appendChild(styleEl);
      }
      styleEl.textContent = `@media print { @page { size: A3 ${orientation}; margin: 0; } }`;

      window.setTimeout(() => {
        window.print();
      }, 120);
    },
    [],
  );

  const handlePrintScrapbookBooklet = useCallback(() => {
    setPrintPayload(null);
    setScrapbookPrintActive(true);
    setScrapbookPrintModalOpen(false);

    const paperCss = scrapbookStore.doc.paperSize === 'letter' ? 'letter portrait' : 'A4 portrait';
    let styleEl = document.getElementById('a3-page-orientation-style') as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'a3-page-orientation-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@media print { @page { size: ${paperCss}; margin: 0; } }`;

    window.setTimeout(() => {
      window.print();
    }, 150);
  }, [scrapbookStore.doc.paperSize]);

  const scrapbookActivePages = useMemo(
    () => buildBookletPages(scrapbookStore.doc, { mode: scrapbookViewMode }),
    [scrapbookStore.doc, scrapbookViewMode],
  );
  const scrapbookSpreads = useMemo(
    () => groupIntoSpreads(scrapbookActivePages),
    [scrapbookActivePages],
  );
  const clampedSpreadIdx = Math.min(
    Math.max(0, scrapbookSpreadIndex),
    Math.max(0, scrapbookSpreads.length - 1),
  );
  const activeSpread = scrapbookSpreads[clampedSpreadIdx];
  const spreadNavLabel = !activeSpread
    ? 'Empty'
    : activeSpread.spreadIndex === 0
      ? `Cover · 1 / ${scrapbookActivePages.length}`
      : activeSpread.left && activeSpread.right
        ? `Pages ${activeSpread.left.pageNumber}–${activeSpread.right.pageNumber} of ${scrapbookActivePages.length}`
        : `Page ${activeSpread.left?.pageNumber ?? activeSpread.right?.pageNumber ?? 1} of ${scrapbookActivePages.length}`;

  const scrapbookFocusName =
    graph.getPerson(scrapbookStore.doc.focusPersonId)?.name.display ??
    scrapbookStore.doc.focusPersonId;

  const scrapbookControlsSlot = (
    <div className="sb-toolbar-controls">
      <div className="toolbar-divider" />
      <div className="sb-focus-badge" title={`Focused family album around ${scrapbookFocusName}`}>
        <span>Album:</span>
        <strong>{scrapbookFocusName}</strong>
      </div>

      <div className="sb-nav-pill" aria-label="Spread pagination">
        <button
          type="button"
          className="sb-nav-btn"
          disabled={clampedSpreadIdx <= 0}
          onClick={() => setScrapbookSpreadIndex(Math.max(0, clampedSpreadIdx - 1))}
          title="Previous spread"
        >
          ‹
        </button>
        <span className="sb-nav-label">{spreadNavLabel}</span>
        <button
          type="button"
          className="sb-nav-btn"
          disabled={clampedSpreadIdx >= scrapbookSpreads.length - 1}
          onClick={() =>
            setScrapbookSpreadIndex(
              Math.min(scrapbookSpreads.length - 1, clampedSpreadIdx + 1),
            )
          }
          title="Next spread"
        >
          ›
        </button>
      </div>

      <div className="segmented" role="group" aria-label="Scrapbook editing mode">
        <button
          type="button"
          className={`segmented-btn ${scrapbookViewMode === 'edit' ? 'is-active' : ''}`}
          onClick={() => setScrapbookViewMode('edit')}
        >
          Edit
        </button>
        <button
          type="button"
          className={`segmented-btn ${scrapbookViewMode === 'preview' ? 'is-active' : ''}`}
          onClick={() => setScrapbookViewMode('preview')}
        >
          Preview
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div
        className="app-shell"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          const dropped = e.dataTransfer.files[0];
          if (dropped && isSupportedImportFilename(dropped.name)) {
            void handleImportFile(dropped);
          }
        }}
      >
        <Toolbar
          graph={graph}
          stats={stats}
          activeWorkspace={activeWorkspace}
          onChangeWorkspace={handleChangeWorkspace}
          scrapbookControlsSlot={scrapbookControlsSlot}
          mode={mode}
          ancestorLevels={ancestorLevels}
          descendantLevels={descendantLevels}
          includeSpouses={includeSpouses}
          includeFocusSiblings={includeFocusSiblings}
          includeSpouseAncestors={includeSpouseAncestors}
          lineageMode={lineageMode}
          theme={theme}
          relationshipLabels={relationshipLabels}
          onChangeMode={(nextMode) => {
            setMode(nextMode);
            window.setTimeout(() => canvasRef.current?.fitToScreen(true), 40);
          }}
          onChangeAncestorLevels={setAncestorLevels}
          onChangeDescendantLevels={setDescendantLevels}
          onToggleSpouses={setIncludeSpouses}
          onToggleFocusSiblings={setIncludeFocusSiblings}
          onToggleSpouseAncestors={setIncludeSpouseAncestors}
          onChangeLineageMode={setLineageMode}
          onSelectSearchResult={handleSelectAndPan}
          onOpenRelationshipFinder={() =>
            setRelationshipModalTarget(selectedPersonId ?? effectiveFocusId)
          }
          onOpenPrintStudio={() => setPrintModalOpen(true)}
          onOpenScrapbookPrint={() => setScrapbookPrintModalOpen(true)}
          onImportFile={(f) => void handleImportFile(f)}
          onExportGedcom={handleExportGedcom}
          onExportJson={handleExportJson}
          onExportHeirloomZip={() => void handleExportHeirloomZip()}
          onClearLocalDraft={() => void scrapbookStore.clearLocalDraft()}
          onResetDemo={handleResetDemo}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        />

        <main className="workspace">
          {activeWorkspace === 'tree' ? (
            <>
              <TreeCanvas
                ref={canvasRef}
                layout={layout}
                selectedPersonId={selectedPersonId}
                highlightedPersonIds={highlightedPersonIds}
                highlightBannerText={highlightBannerText}
                relationshipLabels={relationshipLabels}
                photoUrlsByPersonId={photoUrlsByPersonId}
                drawerOpen={selectedPersonId !== null}
                onSelectPerson={(pid) => setSelectedPersonId(pid)}
                onFocusPerson={handleFocusPerson}
                onToggleUnionBranch={handleToggleUnionBranch}
                onToggleAncestors={handleToggleAncestors}
                onClearBackground={() => setSelectedPersonId(null)}
                onClearHighlight={() => {
                  setHighlightedPersonIds(new Set());
                  setHighlightBannerText(undefined);
                }}
              />

              {selectedPersonId && graph.getPerson(selectedPersonId) && (
                <DetailDrawer
                  graph={graph}
                  personId={selectedPersonId}
                  focusPersonId={effectiveFocusId}
                  relationshipLabel={relationshipLabels.get(selectedPersonId)}
                  photoUrlsByPersonId={photoUrlsByPersonId}
                  mediaUrlsByMediaId={mediaFileOverrides}
                  onClose={() => setSelectedPersonId(null)}
                  onSelectPerson={handleSelectAndPan}
                  onSetFocus={handleFocusPerson}
                  onOpenInScrapbook={(pid) => {
                    setScrapbookSpreadIndex(0);
                    handleOpenInScrapbook(pid);
                  }}
                  onCompareRelationship={(pid) => setRelationshipModalTarget(pid)}
                  onAttachPersonPhoto={handleAttachPersonPhoto}
                  onAttachMediaFile={handleAttachMediaFile}
                />
              )}
            </>
          ) : (
            <ScrapbookWorkspace
              graph={graph}
              store={scrapbookStore}
              viewMode={scrapbookViewMode}
              spreadIndex={clampedSpreadIdx}
              onChangeSpreadIndex={setScrapbookSpreadIndex}
              onExportHeirloomZip={() => void handleExportHeirloomZip()}
            />
          )}
        </main>
      </div>

      {relationshipModalTarget && (
        <RelationshipModal
          graph={graph}
          initialPersonAId={effectiveFocusId}
          initialPersonBId={
            relationshipModalTarget === effectiveFocusId
              ? (graph.getAllPersons().find((p) => p.id !== effectiveFocusId)?.id ??
                effectiveFocusId)
              : relationshipModalTarget
          }
          lineageMode={lineageMode}
          onClose={() => setRelationshipModalTarget(null)}
          onHighlightPath={(payload) => {
            setHighlightedPersonIds(new Set(payload.personIds));
            setHighlightBannerText(payload.label);

            const allVisible = payload.personIds.every((id) =>
              layout.instanceIdsByPersonId.has(id),
            );
            if (!allVisible) {
              setCollapsedUnionIds(new Set());
              setCollapsedAncestorIds(new Set());
              if (payload.primaryLcaId) {
                setMode('descendants');
                setFocusPersonId(payload.primaryLcaId);
                setDescendantLevels(Math.max(3, payload.maxLcaDepth));
                setIncludeSpouses(true);
              } else {
                setMode('hourglass');
                setFocusPersonId(payload.personAId);
                setAncestorLevels((prev) => Math.max(prev, 4));
                setDescendantLevels((prev) => Math.max(prev, 4));
                setIncludeSpouses(true);
              }
            }
            window.setTimeout(() => canvasRef.current?.fitToScreen(true), 60);
          }}
        />
      )}

      {printModalOpen && (
        <PrintModal
          graph={graph}
          defaultFocusPersonId={effectiveFocusId}
          defaultMode={mode}
          defaultAncestorLevels={ancestorLevels}
          defaultDescendantLevels={descendantLevels}
          defaultIncludeSpouses={includeSpouses}
          defaultIncludeFocusSiblings={includeFocusSiblings}
          defaultIncludeSpouseAncestors={includeSpouseAncestors}
          lineageMode={lineageMode}
          onClose={() => setPrintModalOpen(false)}
          onPrintSvg={handlePrintSvg}
        />
      )}

      {scrapbookPrintModalOpen && (
        <ScrapbookPrintModal
          graph={graph}
          store={scrapbookStore}
          onClose={() => setScrapbookPrintModalOpen(false)}
          onPrintBooklet={handlePrintScrapbookBooklet}
          onExportHeirloomZip={() => void handleExportHeirloomZip()}
        />
      )}

      {toastMessage && <div className="toast-banner">{toastMessage}</div>}

      {/* Hidden on screen; renders full-bleed vector chart sheet during window.print() */}
      {printPayload && !scrapbookPrintActive && (
        <div
          className="a3-print-only"
          dangerouslySetInnerHTML={{ __html: printPayload.svg }}
        />
      )}

      {/* Hidden on screen; renders multi-page portrait scrapbook booklet during window.print() */}
      {scrapbookPrintActive && (
        <ScrapbookPrintSheet graph={graph} store={scrapbookStore} />
      )}
    </>
  );
}
