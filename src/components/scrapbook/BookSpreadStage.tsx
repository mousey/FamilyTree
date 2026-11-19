import { useEffect, useRef, useState } from 'react';
import type { FamilyGraph, PersonId } from '../../core/index.js';
import type { BookSpread, ScrapbookStoreApi } from '../../scrapbook/index.js';
import { ScrapbookPageRenderer } from './ScrapbookPageRenderer.js';

export interface BookSpreadStageProps {
  graph: FamilyGraph;
  store: ScrapbookStoreApi;
  spreads: BookSpread[];
  spreadIndex: number;
  mode: 'edit' | 'preview';
  onChangeSpreadIndex: (nextIndex: number) => void;
  onJumpToPerson: (personId: PersonId) => void;
}

export function BookSpreadStage({
  graph,
  store,
  spreads,
  spreadIndex,
  mode,
  onChangeSpreadIndex,
  onJumpToPerson,
}: BookSpreadStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.75);

  const clampedIdx = Math.min(Math.max(0, spreadIndex), Math.max(0, spreads.length - 1));
  const spread = spreads[clampedIdx];
  const isSingleCover = spread?.left === null && spread?.right !== null;
  const pageH = store.doc.paperSize === 'letter' ? 802 : 876;
  const naturalW = (isSingleCover ? 620 : 1240) + 16;
  const naturalH = pageH + 16;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const recompute = () => {
      const rect = el.getBoundingClientRect();
      const availW = Math.max(320, rect.width - 116);
      const availH = Math.max(280, rect.height - 76);
      const nextScale = Math.min(1, availW / naturalW, availH / naturalH);
      setScale(Math.max(0.32, Math.round(nextScale * 1000) / 1000));
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalH, naturalW]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft' && clampedIdx > 0) {
        e.preventDefault();
        onChangeSpreadIndex(clampedIdx - 1);
      } else if (e.key === 'ArrowRight' && clampedIdx < spreads.length - 1) {
        e.preventDefault();
        onChangeSpreadIndex(clampedIdx + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clampedIdx, onChangeSpreadIndex, spreads.length]);

  if (!spread) return null;

  return (
    <div ref={stageRef} className="sb-stage">
      <button
        type="button"
        className="sb-stage-chevron is-prev"
        disabled={clampedIdx <= 0}
        onClick={() => onChangeSpreadIndex(clampedIdx - 1)}
        aria-label="Previous spread"
        title="Previous spread (←)"
      >
        ‹
      </button>

      <div
        className="sb-book-scaler"
        style={{
          width: naturalW * scale,
          height: naturalH * scale,
        }}
      >
        <div
          className={`sb-book-spread ${isSingleCover ? 'is-single-cover' : ''}`}
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        >
          {!isSingleCover &&
            (spread.left ? (
              <ScrapbookPageRenderer
                graph={graph}
                store={store}
                page={spread.left}
                side="left"
                mode={mode}
                onJumpToPerson={onJumpToPerson}
              />
            ) : (
              <div
                className={`sb-page is-left-page sb-page-blank-end ${
                  store.doc.paperSize === 'letter' ? 'is-letter' : ''
                }`}
              >
                — Notes —
              </div>
            ))}

          {spread.right ? (
            <ScrapbookPageRenderer
              graph={graph}
              store={store}
              page={spread.right}
              side="right"
              mode={mode}
              onJumpToPerson={onJumpToPerson}
            />
          ) : (
            <div
              className={`sb-page is-right-page sb-page-blank-end ${
                store.doc.paperSize === 'letter' ? 'is-letter' : ''
              }`}
            >
              — End of Album —
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        className="sb-stage-chevron is-next"
        disabled={clampedIdx >= spreads.length - 1}
        onClick={() => onChangeSpreadIndex(clampedIdx + 1)}
        aria-label="Next spread"
        title="Next spread (→)"
      >
        ›
      </button>

      {/* Bottom Windowed Scrubber */}
      <nav className="sb-scrubber" aria-label="Booklet spread navigation">
        {spreads.map((sp, idx) => {
          const isEdge = idx === 0 || idx === spreads.length - 1;
          const isNearActive = Math.abs(idx - clampedIdx) <= 2;
          const showEllipsisBefore =
            spreads.length > 9 && idx === 1 && clampedIdx > 3;
          const showEllipsisAfter =
            spreads.length > 9 &&
            idx === spreads.length - 2 &&
            clampedIdx < spreads.length - 4;

          if (spreads.length > 9 && !isEdge && !isNearActive) {
            if (showEllipsisBefore || showEllipsisAfter) {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  style={{ fontSize: 11, color: 'var(--ink-muted)', padding: '0 2px' }}
                >
                  …
                </span>
              );
            }
            return null;
          }

          const label =
            sp.spreadIndex === 0
              ? 'Cover'
              : sp.left && sp.right
                ? `${sp.left.pageNumber}–${sp.right.pageNumber}`
                : `${sp.left?.pageNumber ?? sp.right?.pageNumber ?? ''}`;
          return (
            <button
              key={sp.spreadIndex}
              type="button"
              className={`sb-scrubber-dot ${
                sp.spreadIndex === clampedIdx ? 'is-active' : ''
              }`}
              onClick={() => onChangeSpreadIndex(sp.spreadIndex)}
            >
              {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
