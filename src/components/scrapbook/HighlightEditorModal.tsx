import { useRef, useState } from 'react';
import {
  clampHighlight,
  type CertificateAttachment,
  type DocumentHighlight,
  type HighlightStyle,
} from '../../scrapbook/index.js';
import { CloseIcon, SparklesIcon, TrashIcon } from '../Icons.js';

export interface HighlightEditorModalProps {
  certificate: CertificateAttachment;
  imageUrl: string;
  onSave: (highlights: DocumentHighlight[]) => void;
  onClose: () => void;
}

interface DraftBox {
  startX: number;
  startY: number;
  currX: number;
  currY: number;
}

const STYLE_LABELS: Record<HighlightStyle, string> = {
  amber_highlighter: 'Amber Highlighter',
  red_circle: 'Red Ink Circle',
  spotlight: 'Spotlight Dim',
};

export function HighlightEditorModal({
  certificate,
  imageUrl,
  onSave,
  onClose,
}: HighlightEditorModalProps) {
  const [highlights, setHighlights] = useState<DocumentHighlight[]>(() =>
    certificate.highlights.map((h) => ({ ...h })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    certificate.highlights[0]?.id ?? null,
  );
  const [activeStyle, setActiveStyle] =
    useState<HighlightStyle>('amber_highlighter');
  const [draftBox, setDraftBox] = useState<DraftBox | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);

  const getNormalizedPoint = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getNormalizedPoint(e.clientX, e.clientY);
    setDraftBox({ startX: pt.x, startY: pt.y, currX: pt.x, currY: pt.y });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draftBox) return;
    const pt = getNormalizedPoint(e.clientX, e.clientY);
    setDraftBox((prev) =>
      prev ? { ...prev, currX: pt.x, currY: pt.y } : null,
    );
  };

  const handlePointerUp = () => {
    if (!draftBox) return;
    const x = Math.min(draftBox.startX, draftBox.currX);
    const y = Math.min(draftBox.startY, draftBox.currY);
    const width = Math.abs(draftBox.currX - draftBox.startX);
    const height = Math.abs(draftBox.currY - draftBox.startY);
    setDraftBox(null);

    // Ignore accidental clicks smaller than 1.5% in both dimensions
    if (width < 0.015 && height < 0.015) return;

    const next = clampHighlight({
      id: `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      x,
      y,
      width: Math.max(0.02, width),
      height: Math.max(0.02, height),
      style: activeStyle,
      label: '',
      showZoomCallout: true,
    });
    setHighlights((prev) => [...prev, next]);
    setSelectedId(next.id);
  };

  const updateSelected = (patch: Partial<DocumentHighlight>) => {
    if (!selectedId) return;
    setHighlights((prev) =>
      prev.map((h) => (h.id === selectedId ? clampHighlight({ ...h, ...patch }) : h)),
    );
  };

  const deleteHighlight = (id: string) => {
    setHighlights((prev) => {
      const next = prev.filter((h) => h.id !== id);
      if (selectedId === id) {
        setSelectedId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const spotlightBoxes = highlights.filter((h) => h.style === 'spotlight');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Highlight records on ${certificate.title}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Record Highlighter — {certificate.title}</h2>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Drag across the ancestor&apos;s row on the scan to highlight it and optionally pin a magnified callout strip
            </div>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 30, height: 30 }}
            onClick={onClose}
            aria-label="Close highlight editor"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="sb-hl-editor-grid">
            <div className="sb-hl-canvas-stage">
              <div
                ref={surfaceRef}
                className="sb-hl-draw-surface"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <img src={imageUrl} alt={certificate.title} draggable={false} />

                <div className="sb-hl-layer">
                  {spotlightBoxes.length > 0 && (
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                      }}
                    >
                      <path
                        fill="rgba(34, 29, 24, 0.42)"
                        fillRule="evenodd"
                        d={`M 0 0 H 100 V 100 H 0 Z ${spotlightBoxes
                          .map(
                            (b) =>
                              `M ${b.x * 100} ${b.y * 100} H ${(b.x + b.width) * 100} V ${(b.y + b.height) * 100} H ${b.x * 100} Z`,
                          )
                          .join(' ')}`}
                      />
                    </svg>
                  )}

                  {highlights.map((h) => {
                    const isSel = h.id === selectedId;
                    if (h.style === 'red_circle') {
                      return (
                        <div
                          key={h.id}
                          style={{
                            position: 'absolute',
                            left: `${h.x * 100}%`,
                            top: `${h.y * 100}%`,
                            width: `${h.width * 100}%`,
                            height: `${h.height * 100}%`,
                            outline: isSel ? '2px dashed #2b5240' : undefined,
                          }}
                        >
                          <svg
                            viewBox="0 0 100 40"
                            preserveAspectRatio="none"
                            style={{ width: '100%', height: '100%', overflow: 'visible' }}
                          >
                            <ellipse
                              cx="50"
                              cy="20"
                              rx="49"
                              ry="18"
                              fill="none"
                              stroke="#b23237"
                              strokeWidth="2.8"
                            />
                          </svg>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={h.id}
                        className={h.style === 'amber_highlighter' ? 'sb-hl-amber' : undefined}
                        style={{
                          position: 'absolute',
                          left: `${h.x * 100}%`,
                          top: `${h.y * 100}%`,
                          width: `${h.width * 100}%`,
                          height: `${h.height * 100}%`,
                          border:
                            h.style === 'spotlight'
                              ? '2px solid #d5a856'
                              : isSel
                                ? '2px solid #2b5240'
                                : undefined,
                        }}
                      >
                        {h.label && <span className="sb-hl-label">{h.label}</span>}
                      </div>
                    );
                  })}

                  {draftBox && (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${Math.min(draftBox.startX, draftBox.currX) * 100}%`,
                        top: `${Math.min(draftBox.startY, draftBox.currY) * 100}%`,
                        width: `${Math.abs(draftBox.currX - draftBox.startX) * 100}%`,
                        height: `${Math.abs(draftBox.currY - draftBox.startY) * 100}%`,
                        border: '2px dashed #2b5240',
                        background: 'rgba(255, 214, 70, 0.28)',
                      }}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="sb-hl-sidebar">
              <div className="field-label">
                <span>New Mark Style</span>
                <select
                  className="field-select"
                  value={activeStyle}
                  onChange={(e) => {
                    const nextStyle = e.target.value as HighlightStyle;
                    setActiveStyle(nextStyle);
                    updateSelected({ style: nextStyle });
                  }}
                >
                  {(Object.keys(STYLE_LABELS) as HighlightStyle[]).map((s) => (
                    <option key={s} value={s}>
                      {STYLE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="popover-title" style={{ marginTop: 4 }}>
                Highlights ({highlights.length})
              </div>

              {highlights.length === 0 ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    fontSize: 12,
                    color: 'var(--ink-secondary)',
                    lineHeight: 1.45,
                  }}
                >
                  <SparklesIcon size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                  Click and drag anywhere on the document scan to highlight the ancestor&apos;s entry.
                </div>
              ) : (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    overflowY: 'auto',
                    maxHeight: 330,
                  }}
                >
                  {highlights.map((h, idx) => {
                    const isSel = h.id === selectedId;
                    return (
                      <div
                        key={h.id}
                        className={`sb-hl-list-item ${isSel ? 'is-selected' : ''}`}
                        onClick={() => {
                          setSelectedId(h.id);
                          setActiveStyle(h.style);
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 6,
                          }}
                        >
                          <strong style={{ fontSize: 12 }}>
                            Highlight #{idx + 1} · {STYLE_LABELS[h.style]}
                          </strong>
                          <button
                            type="button"
                            className="sb-mini-icon-btn"
                            title="Delete highlight"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteHighlight(h.id);
                            }}
                          >
                            <TrashIcon size={12} />
                          </button>
                        </div>

                        <input
                          type="text"
                          className="field-input"
                          style={{ height: 30, fontSize: 12 }}
                          placeholder="Label (e.g. Row #14 — Birth)"
                          value={h.label ?? ''}
                          onChange={(e) => {
                            setSelectedId(h.id);
                            setHighlights((prev) =>
                              prev.map((item) =>
                                item.id === h.id
                                  ? { ...item, label: e.target.value }
                                  : item,
                              ),
                            );
                          }}
                        />

                        <label className="toggle-row" style={{ fontSize: 11.5 }}>
                          <span>Pin zoomed callout strip</span>
                          <input
                            type="checkbox"
                            checked={Boolean(h.showZoomCallout)}
                            onChange={(e) => {
                              setSelectedId(h.id);
                              setHighlights((prev) =>
                                prev.map((item) =>
                                  item.id === h.id
                                    ? { ...item, showZoomCallout: e.target.checked }
                                    : item,
                                ),
                              );
                            }}
                          />
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onSave(highlights);
              onClose();
            }}
          >
            Save Highlights
          </button>
        </div>
      </div>
    </div>
  );
}
