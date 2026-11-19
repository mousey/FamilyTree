import { useMemo, useState } from 'react';
import type { FamilyGraph, LineageMode, PersonId } from '../core/index.js';
import { computeTreeLayout } from '../layout/treeLayout.js';
import type { LayoutMode } from '../layout/types.js';
import {
  buildBotanicalTreeA3Svg,
  buildClassicA3Svg,
  buildPedigreeSlots,
  buildRadialCircleA3Svg,
  buildSidewaysPedigreeA3Svg,
  type PrintOrientation,
} from '../print/index.js';
import { CloseIcon, DownloadIcon, PrinterIcon } from './Icons.js';

export type PrintStyle = 'classic' | 'botanical' | 'radial' | 'sideways';

export interface PrintModalProps {
  graph: FamilyGraph;
  defaultFocusPersonId: PersonId;
  defaultMode: LayoutMode;
  defaultAncestorLevels: number;
  defaultDescendantLevels: number;
  defaultIncludeSpouses: boolean;
  defaultIncludeFocusSiblings: boolean;
  defaultIncludeSpouseAncestors: boolean;
  lineageMode: LineageMode;
  onClose: () => void;
  onPrintSvg: (svgMarkup: string, orientation: PrintOrientation) => void;
}

function StyleThumb({ style }: { style: PrintStyle }) {
  if (style === 'classic') {
    return (
      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
        <rect x="13" y="2" width="10" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <rect x="3" y="16" width="9" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <rect x="24" y="16" width="9" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M18 7v4M7.5 16v-3a2 2 0 0 1 2-2h17a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    );
  }
  if (style === 'botanical') {
    return (
      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
        <path d="M18 22V11M18 14c-4-3-8-3-11-6M18 14c4-3 8-3 11-6M18 11c-2-3-4-6-5-8M18 11c2-3 4-6 5-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="7" cy="7.5" r="2.2" fill="currentColor" opacity="0.28" />
        <circle cx="29" cy="7.5" r="2.2" fill="currentColor" opacity="0.28" />
        <circle cx="13" cy="3.5" r="2" fill="currentColor" opacity="0.28" />
        <circle cx="23" cy="3.5" r="2" fill="currentColor" opacity="0.28" />
        <rect x="13" y="16" width="10" height="4" rx="2" fill="currentColor" opacity="0.85" />
      </svg>
    );
  }
  if (style === 'radial') {
    return (
      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
        <circle cx="18" cy="12" r="10" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="18" cy="12" r="6.4" stroke="currentColor" strokeWidth="1" opacity="0.7" />
        <circle cx="18" cy="12" r="3" fill="currentColor" />
        <path d="M8 12h7M21 12h7M18 2v7M18 15v7" stroke="currentColor" strokeWidth="1" opacity="0.65" />
      </svg>
    );
  }
  return (
    <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
      <rect x="2" y="9" width="7" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <rect x="14" y="3" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="14" y="16" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.2" />
      <rect x="26" y="2" width="8" height="3.2" rx="0.8" stroke="currentColor" strokeWidth="1" />
      <rect x="26" y="7.5" width="8" height="3.2" rx="0.8" stroke="currentColor" strokeWidth="1" />
      <rect x="26" y="13.5" width="8" height="3.2" rx="0.8" stroke="currentColor" strokeWidth="1" />
      <rect x="26" y="19" width="8" height="3.2" rx="0.8" stroke="currentColor" strokeWidth="1" />
      <path d="M9 12c2.5 0 2.5-6.5 5-6.5M9 12c2.5 0 2.5 6.5 5 6.5M21 5.5h2.5v-2H26M23.5 5.5v3.5H26M21 18.5h2.5v-3.5H26M23.5 18.5v2H26" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

const STYLE_OPTIONS: ReadonlyArray<{
  id: PrintStyle;
  label: string;
  sub: string;
  defaultOrientation: PrintOrientation;
}> = [
  { id: 'classic', label: 'Classic Tree', sub: 'Orthogonal grid', defaultOrientation: 'landscape' },
  { id: 'botanical', label: 'Heritage Oak', sub: 'Branching canopy', defaultOrientation: 'landscape' },
  { id: 'radial', label: '360° Circle', sub: 'Radial rings', defaultOrientation: 'landscape' },
  { id: 'sideways', label: 'Sideways Chart', sub: 'Left-to-right', defaultOrientation: 'portrait' },
];

export function PrintModal({
  graph,
  defaultFocusPersonId,
  defaultMode,
  defaultAncestorLevels,
  defaultDescendantLevels,
  defaultIncludeSpouses,
  defaultIncludeFocusSiblings,
  defaultIncludeSpouseAncestors,
  lineageMode,
  onClose,
  onPrintSvg,
}: PrintModalProps) {
  const allPersons = useMemo(
    () =>
      graph
        .getAllPersons()
        .slice()
        .sort((a, b) => a.name.display.localeCompare(b.name.display)),
    [graph],
  );

  const [printStyle, setPrintStyle] = useState<PrintStyle>('classic');
  const [focusId, setFocusId] = useState(defaultFocusPersonId);
  const [mode, setMode] = useState<LayoutMode>(defaultMode);
  const [ancestorLevels, setAncestorLevels] = useState(Math.max(1, defaultAncestorLevels));
  const [descendantLevels, setDescendantLevels] = useState(defaultDescendantLevels);
  const [orientation, setOrientation] = useState<PrintOrientation>('landscape');
  const [includeSpouses, setIncludeSpouses] = useState(defaultIncludeSpouses);
  const [includeFocusSiblings, setIncludeFocusSiblings] = useState(defaultIncludeFocusSiblings);
  const [includeSpouseAncestors, setIncludeSpouseAncestors] = useState(
    defaultIncludeSpouseAncestors,
  );
  const [showEmptySlots, setShowEmptySlots] = useState(true);
  const [includeChildrenRoots, setIncludeChildrenRoots] = useState(true);
  const [title, setTitle] = useState(graph.tree.metadata.title ?? 'Family Tree Chart');

  const focusPerson = graph.getPerson(focusId);

  const handleSelectStyle = (nextStyle: PrintStyle) => {
    setPrintStyle(nextStyle);
    const meta = STYLE_OPTIONS.find((o) => o.id === nextStyle);
    if (meta) {
      setOrientation(meta.defaultOrientation);
    }
    if (nextStyle === 'botanical' && ancestorLevels > 5) {
      setAncestorLevels(4);
    } else if (nextStyle === 'sideways' && ancestorLevels > 6) {
      setAncestorLevels(5);
    } else if (nextStyle !== 'classic' && ancestorLevels < 2) {
      setAncestorLevels(4);
    }
  };

  const hasFocusSpouse = useMemo(() => {
    const firstUnion = graph.getUnionsAsPartner(focusId)[0];
    return Boolean(firstUnion?.partners.some((p) => p.personId !== focusId));
  }, [focusId, graph]);

  const maxLevelsForStyle =
    printStyle === 'botanical'
      ? includeSpouses && hasFocusSpouse
        ? 4
        : 5
      : printStyle === 'sideways'
        ? 6
        : 7;

  const { svgMarkup, summaryText } = useMemo(() => {
    const focusName = focusPerson?.name.display ?? focusId;

    if (printStyle === 'classic') {
      const printLayout = computeTreeLayout(graph, {
        mode,
        focusPersonId: focusId,
        ancestorLevels,
        descendantLevels,
        includeSpouses,
        includeFocusSiblings,
        includeSpouseAncestors,
        lineageMode,
      });
      const modeName =
        mode === 'hourglass'
          ? `Hourglass Chart (${ancestorLevels} up · ${descendantLevels} down)`
          : mode === 'ancestors'
            ? `Ancestor Pedigree (${ancestorLevels} generations)`
            : `Descendant Tree (${descendantLevels} generations)`;
      const subtitle = `${focusName} · ${modeName}`;
      return {
        svgMarkup: buildClassicA3Svg(printLayout, { title, subtitle, orientation }),
        summaryText: `${printLayout.nodes.length} cards across ${printLayout.generations.length} generation${printLayout.generations.length === 1 ? '' : 's'}`,
      };
    }

    const clampedLevels = Math.max(1, Math.min(maxLevelsForStyle, ancestorLevels));
    const pedigree = buildPedigreeSlots(graph, focusId, clampedLevels, {
      lineageMode,
      includeSpouses,
    });

    if (printStyle === 'botanical') {
      const spousePedigree =
        includeSpouses && pedigree.focusSpouse
          ? buildPedigreeSlots(graph, pedigree.focusSpouse.id, clampedLevels, {
              lineageMode,
              includeSpouses: false,
            })
          : undefined;
      const subtitle = spousePedigree
        ? `${focusName} & ${pedigree.focusSpouse!.name.display} · ${clampedLevels} Ancestor Rings`
        : `${focusName} · ${clampedLevels} Ancestor Rings`;
      const recordedTotal =
        pedigree.populatedCount + (spousePedigree ? spousePedigree.populatedCount : 0);
      return {
        svgMarkup: buildBotanicalTreeA3Svg(pedigree, {
          title,
          subtitle,
          orientation,
          showEmptySlots,
          includeChildrenRoots,
          spousePedigree,
        }),
        summaryText: `${recordedTotal} recorded · ${clampedLevels} botanical wreath rings`,
      };
    }

    if (printStyle === 'radial') {
      const subtitle = `${focusName} · ${clampedLevels} Concentric Generations`;
      return {
        svgMarkup: buildRadialCircleA3Svg(pedigree, {
          title,
          subtitle,
          orientation,
          showEmptySlots,
        }),
        summaryText: `${pedigree.populatedCount} recorded of ${(1 << (clampedLevels + 1)) - 1} radial slots`,
      };
    }

    const subtitle = `Focus: ${focusName}`;
    return {
      svgMarkup: buildSidewaysPedigreeA3Svg(pedigree, {
        title,
        subtitle,
        orientation,
        showEmptySlots,
      }),
      summaryText: `${pedigree.populatedCount} recorded across ${clampedLevels + 1} horizontal columns`,
    };
  }, [
    ancestorLevels,
    descendantLevels,
    focusId,
    focusPerson?.name.display,
    graph,
    includeChildrenRoots,
    includeFocusSiblings,
    includeSpouseAncestors,
    includeSpouses,
    lineageMode,
    maxLevelsForStyle,
    mode,
    orientation,
    printStyle,
    showEmptySlots,
    title,
  ]);

  const handleDownloadSvg = () => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${printStyle}-a3-${orientation}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="A3 Print and Vector Export Studio"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">A3 Print &amp; Vector Export Studio</h2>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Choose a print style, focal person, and generation depth for crisp A3 PDF or SVG export
            </div>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 30, height: 30 }}
            onClick={onClose}
            aria-label="Close A3 print studio"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="print-studio-grid">
            <div className="print-controls">
              <div className="field-label">
                <span>Print Style</span>
                <div className="print-style-grid" role="radiogroup" aria-label="Print chart style">
                  {STYLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={printStyle === opt.id}
                      className={`print-style-card ${printStyle === opt.id ? 'is-active' : ''}`}
                      onClick={() => handleSelectStyle(opt.id)}
                    >
                      <span style={{ color: printStyle === opt.id ? 'var(--accent-sage)' : 'var(--ink-secondary)' }}>
                        <StyleThumb style={opt.id} />
                      </span>
                      <span className="print-style-label">{opt.label}</span>
                      <span className="print-style-sub">{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="field-label">
                <span>Chart Title</span>
                <input
                  type="text"
                  className="field-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>

              <label className="field-label">
                <span>Focal Person</span>
                <select
                  className="field-select"
                  value={focusId}
                  onChange={(e) => setFocusId(e.target.value)}
                >
                  {allPersons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name.display}
                    </option>
                  ))}
                </select>
              </label>

              {printStyle === 'classic' && (
                <label className="field-label">
                  <span>Tree Direction</span>
                  <select
                    className="field-select"
                    value={mode}
                    onChange={(e) => setMode(e.target.value as LayoutMode)}
                  >
                    <option value="hourglass">Hourglass (Ancestors + Descendants)</option>
                    <option value="ancestors">Ancestors Pedigree Only</option>
                    <option value="descendants">Descendants Tree Only</option>
                  </select>
                </label>
              )}

              <div className={printStyle === 'classic' && mode === 'hourglass' ? 'field-grid' : undefined}>
                {(printStyle !== 'classic' || mode !== 'descendants') && (
                  <label className="field-label">
                    <span>
                      {printStyle === 'radial'
                        ? `Outer Rings (${Math.min(maxLevelsForStyle, ancestorLevels)})`
                        : printStyle === 'sideways'
                          ? `Ancestor Depth (${Math.min(maxLevelsForStyle, ancestorLevels)} · ${Math.min(maxLevelsForStyle, ancestorLevels) + 1} gen)`
                          : `Ancestors ↑ (${Math.min(maxLevelsForStyle, ancestorLevels)})`}
                    </span>
                    <input
                      type="range"
                      min={printStyle === 'classic' ? 0 : 1}
                      max={maxLevelsForStyle}
                      value={Math.min(maxLevelsForStyle, ancestorLevels)}
                      onChange={(e) => setAncestorLevels(Number(e.target.value))}
                    />
                  </label>
                )}

                {printStyle === 'classic' && mode !== 'ancestors' && (
                  <label className="field-label">
                    <span>Descendants ↓ ({descendantLevels})</span>
                    <input
                      type="range"
                      min={0}
                      max={7}
                      value={descendantLevels}
                      onChange={(e) => setDescendantLevels(Number(e.target.value))}
                    />
                  </label>
                )}
              </div>

              <label className="field-label">
                <span>A3 Paper Orientation</span>
                <select
                  className="field-select"
                  value={orientation}
                  onChange={(e) => setOrientation(e.target.value as PrintOrientation)}
                >
                  <option value="landscape">A3 Landscape (420 × 297 mm)</option>
                  <option value="portrait">A3 Portrait (297 × 420 mm)</option>
                </select>
              </label>

              {printStyle === 'classic' ? (
                <>
                  <label className="toggle-row">
                    <span>Include spouses</span>
                    <input
                      type="checkbox"
                      checked={includeSpouses}
                      onChange={(e) => setIncludeSpouses(e.target.checked)}
                    />
                  </label>
                  {mode === 'hourglass' && (
                    <>
                      <label className="toggle-row">
                        <span>Include focus siblings</span>
                        <input
                          type="checkbox"
                          checked={includeFocusSiblings}
                          onChange={(e) => setIncludeFocusSiblings(e.target.checked)}
                        />
                      </label>
                      <label className="toggle-row">
                        <span>Include spouse&apos;s ancestors</span>
                        <input
                          type="checkbox"
                          checked={includeSpouseAncestors}
                          disabled={!includeSpouses}
                          onChange={(e) => setIncludeSpouseAncestors(e.target.checked)}
                        />
                      </label>
                    </>
                  )}
                </>
              ) : (
                <>
                  <label className="toggle-row">
                    <span>Show empty ancestor slots</span>
                    <input
                      type="checkbox"
                      checked={showEmptySlots}
                      onChange={(e) => setShowEmptySlots(e.target.checked)}
                    />
                  </label>
                  {printStyle === 'botanical' && (
                    <>
                      <label className="toggle-row">
                        <span>Include spouse on trunk</span>
                        <input
                          type="checkbox"
                          checked={includeSpouses}
                          onChange={(e) => setIncludeSpouses(e.target.checked)}
                        />
                      </label>
                      <label className="toggle-row">
                        <span>Show children in roots</span>
                        <input
                          type="checkbox"
                          checked={includeChildrenRoots}
                          onChange={(e) => setIncludeChildrenRoots(e.target.checked)}
                        />
                      </label>
                    </>
                  )}
                </>
              )}

              <div
                style={{
                  marginTop: 'auto',
                  padding: '9px 11px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  fontSize: 11.5,
                  color: 'var(--ink-secondary)',
                }}
              >
                <strong>{summaryText}</strong> · Vector A3 ready
              </div>
            </div>

            <div className="print-preview-stage">
              <div
                className="print-sheet-frame"
                style={{
                  maxWidth: orientation === 'landscape' ? '100%' : 378,
                }}
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={handleDownloadSvg}>
            <DownloadIcon size={14} />
            Download A3 SVG
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onPrintSvg(svgMarkup, orientation)}
          >
            <PrinterIcon size={14} />
            Print / Save A3 PDF
          </button>
        </div>
      </div>
    </div>
  );
}
