import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createFamilyGraph,
  createMockFamilyTree,
  describeRelationship,
  getTreeStats,
  parseFamilyTreeJson,
  parseGedcom,
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
import { DetailDrawer } from './components/DetailDrawer.js';
import { PrintModal } from './components/PrintModal.js';
import { RelationshipModal } from './components/RelationshipModal.js';
import { Toolbar } from './components/Toolbar.js';
import { TreeCanvas, type TreeCanvasHandle } from './components/TreeCanvas.js';

export function App() {
  const [tree, setTree] = useState<FamilyTree>(() => createMockFamilyTree());
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

  // Resolve primary portrait photo URLs (user-attached overrides OR valid image URLs)
  const photoUrlsByPersonId = useMemo(() => {
    const map = new Map<PersonId, string>();
    for (const person of graph.getAllPersons()) {
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
  }, [graph, mediaFileOverrides, personPhotoOverrides, tree.media]);

  // Global keyboard shortcuts for canvas navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        canvasRef.current?.zoomBy(1.18);
      } else if (e.key === '-') {
        e.preventDefault();
        canvasRef.current?.zoomBy(0.84);
      } else if (e.key === '0') {
        e.preventDefault();
        canvasRef.current?.fitToScreen(true);
      } else if (e.key === 'Escape') {
        setPrintModalOpen(false);
        setRelationshipModalTarget(null);
        setSelectedPersonId(null);
        setHighlightedPersonIds(new Set());
        setHighlightBannerText(undefined);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleFocusPerson = useCallback(
    (personId: PersonId) => {
      if (!graph.getPerson(personId)) return;
      setFocusPersonId(personId);
      setCollapsedUnionIds(new Set());
      setCollapsedAncestorIds(new Set());
      window.setTimeout(() => {
        canvasRef.current?.fitToScreen(true);
      }, 40);
    },
    [graph],
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

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        let importedTree: FamilyTree;
        let warningCount = 0;

        if (file.name.toLowerCase().endsWith('.json')) {
          const parsed = parseFamilyTreeJson(text, { strict: false });
          importedTree = parsed.tree;
          warningCount = parsed.validation.warnings.length;
          if (!parsed.validation.valid) {
            showToast(
              `Import failed: ${parsed.validation.errors[0]?.message ?? 'Invalid JSON tree'}`,
            );
            return;
          }
        } else {
          const parsed = parseGedcom(text);
          importedTree = parsed.tree;
          warningCount = parsed.warnings.length;
        }

        const personIds = Object.keys(importedTree.persons);
        if (personIds.length === 0) {
          showToast('No individuals found in imported file.');
          return;
        }

        const nextFocus = importedTree.metadata.defaultRootPersonId ?? personIds[0]!;
        setTree(importedTree);
        setFocusPersonId(nextFocus);
        setSelectedPersonId(null);
        setCollapsedUnionIds(new Set());
        setCollapsedAncestorIds(new Set());
        setHighlightedPersonIds(new Set());
        setHighlightBannerText(undefined);
        setPersonPhotoOverrides(new Map());
        setMediaFileOverrides(new Map());

        showToast(
          `Loaded "${importedTree.metadata.title ?? file.name}" (${personIds.length} people${
            warningCount > 0 ? `, ${warningCount} notes` : ''
          })`,
        );

        window.setTimeout(() => {
          canvasRef.current?.fitToScreen(true);
        }, 60);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`Could not import file: ${msg}`);
      }
    },
    [showToast],
  );

  const triggerDownload = (content: string, filename: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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

  const handleResetDemo = useCallback(() => {
    const demo = createMockFamilyTree();
    setTree(demo);
    setFocusPersonId(demo.metadata.defaultRootPersonId ?? 'P1');
    setSelectedPersonId(null);
    setMode('hourglass');
    setAncestorLevels(3);
    setDescendantLevels(3);
    setCollapsedUnionIds(new Set());
    setCollapsedAncestorIds(new Set());
    setHighlightedPersonIds(new Set());
    setHighlightBannerText(undefined);
    showToast('Loaded Hawthorne–Vance showcase tree');
    window.setTimeout(() => canvasRef.current?.fitToScreen(true), 60);
  }, [showToast]);

  const handleAttachPersonPhoto = useCallback(
    (personId: PersonId, file: File) => {
      const url = URL.createObjectURL(file);
      setPersonPhotoOverrides((prev) => {
        const next = new Map(prev);
        next.set(personId, url);
        return next;
      });
      showToast(`Attached portrait photo for ${graph.getPerson(personId)?.name.display ?? personId}`);
    },
    [graph, showToast],
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
          if (dropped) {
            void handleImportFile(dropped);
          }
        }}
      >
        <Toolbar
          graph={graph}
          stats={stats}
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
          onImportFile={(f) => void handleImportFile(f)}
          onExportGedcom={handleExportGedcom}
          onExportJson={handleExportJson}
          onResetDemo={handleResetDemo}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        />

        <main className="workspace">
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
              onCompareRelationship={(pid) => setRelationshipModalTarget(pid)}
              onAttachPersonPhoto={handleAttachPersonPhoto}
              onAttachMediaFile={handleAttachMediaFile}
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

      {toastMessage && <div className="toast-banner">{toastMessage}</div>}

      {/* Hidden on screen; renders full-bleed vector A3 sheet during window.print() */}
      {printPayload && (
        <div
          className="a3-print-only"
          dangerouslySetInnerHTML={{ __html: printPayload.svg }}
        />
      )}
    </>
  );
}
