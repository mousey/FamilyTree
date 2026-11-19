import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import type { PersonId, UnionId } from '../core/index.js';
import type { TreeLayoutResult } from '../layout/types.js';
import {
  CrosshairIcon,
  FitIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from './Icons.js';
import { Minimap, type CameraState } from './Minimap.js';
import { PersonCard } from './PersonCard.js';
import { UnionConnectors } from './UnionConnectors.js';

export interface TreeCanvasHandle {
  fitToScreen: (animate?: boolean) => void;
  panToWorld: (worldX: number, worldY: number, targetScale?: number) => void;
  zoomBy: (factor: number) => void;
}

export interface TreeCanvasProps {
  layout: TreeLayoutResult;
  selectedPersonId: PersonId | null;
  highlightedPersonIds: ReadonlySet<PersonId>;
  highlightBannerText?: string;
  relationshipLabels: ReadonlyMap<PersonId, string>;
  photoUrlsByPersonId: ReadonlyMap<PersonId, string>;
  drawerOpen: boolean;
  onSelectPerson: (personId: PersonId, instanceId: string) => void;
  onFocusPerson: (personId: PersonId) => void;
  onToggleUnionBranch: (unionId: UnionId) => void;
  onToggleAncestors: (instanceId: string) => void;
  onClearBackground: () => void;
  onClearHighlight: () => void;
}

function generationLabel(gen: number): string {
  if (gen === 0) return 'Focus Generation';
  if (gen === -1) return 'Parents';
  if (gen === -2) return 'Grandparents';
  if (gen === -3) return 'Great-Grandparents';
  if (gen < -3) return `${Math.abs(gen) - 2}× Great-Grandparents`;
  if (gen === 1) return 'Children';
  if (gen === 2) return 'Grandchildren';
  if (gen === 3) return 'Great-Grandchildren';
  return `${gen - 2}× Great-Grandchildren`;
}

const MIN_SCALE = 0.16;
const MAX_SCALE = 2.2;

export const TreeCanvas = forwardRef<TreeCanvasHandle, TreeCanvasProps>(
  function TreeCanvas(
    {
      layout,
      selectedPersonId,
      highlightedPersonIds,
      highlightBannerText,
      relationshipLabels,
      photoUrlsByPersonId,
      drawerOpen,
      onSelectPerson,
      onFocusPerson,
      onToggleUnionBranch,
      onToggleAncestors,
      onClearBackground,
      onClearHighlight,
    },
    ref,
  ) {
    const viewportRef = useRef<HTMLDivElement>(null);
    const [viewportSize, setViewportSize] = useState({ width: 1200, height: 760 });
    const [camera, setCamera] = useState<CameraState>({ x: 600, y: 380, scale: 0.88 });
    const [isDragging, setIsDragging] = useState(false);
    const [isAnimatingCamera, setIsAnimatingCamera] = useState(false);
    const [hoveredPersonId, setHoveredPersonId] = useState<PersonId | null>(null);

    const dragOriginRef = useRef<{
      pointerX: number;
      pointerY: number;
      camX: number;
      camY: number;
      moved: boolean;
    } | null>(null);
    const animTimerRef = useRef<number | null>(null);

    const triggerCameraAnimation = useCallback(() => {
      setIsAnimatingCamera(true);
      if (animTimerRef.current !== null) {
        window.clearTimeout(animTimerRef.current);
      }
      animTimerRef.current = window.setTimeout(() => {
        setIsAnimatingCamera(false);
      }, 400);
    }, []);

    useEffect(() => {
      const el = viewportRef.current;
      if (!el) return;
      const update = () => {
        setViewportSize({
          width: el.clientWidth || 1200,
          height: el.clientHeight || 760,
        });
      };
      update();
      const observer = new ResizeObserver(update);
      observer.observe(el);
      return () => observer.disconnect();
    }, []);

    const fitToScreen = useCallback(
      (animate = true) => {
        const el = viewportRef.current;
        const vw = el?.clientWidth || viewportSize.width;
        const vh = el?.clientHeight || viewportSize.height;
        const { bounds } = layout;

        // Reserve safe-area margins for left generation ruler, bottom HUD/minimap, and open detail drawer
        const padLeft = vw > 960 ? 184 : 44;
        const padRight = drawerOpen && vw > 900 ? 430 : 64;
        const padTop = 64;
        const padBottom = 112;

        const usableW = Math.max(200, vw - padLeft - padRight);
        const usableH = Math.max(200, vh - padTop - padBottom);

        const fitScale = Math.min(
          1.05,
          Math.max(
            MIN_SCALE,
            Math.min(usableW / Math.max(1, bounds.width), usableH / Math.max(1, bounds.height)),
          ),
        );

        const centerX = (bounds.minX + bounds.maxX) / 2;
        const centerY = (bounds.minY + bounds.maxY) / 2;
        const visibleCenterX = padLeft + usableW / 2;
        const visibleCenterY = padTop + usableH / 2;

        if (animate) triggerCameraAnimation();
        setCamera({
          x: visibleCenterX - centerX * fitScale,
          y: visibleCenterY - centerY * fitScale,
          scale: fitScale,
        });
      },
      [drawerOpen, layout, triggerCameraAnimation, viewportSize.height, viewportSize.width],
    );

    const panToWorld = useCallback(
      (worldX: number, worldY: number, targetScale?: number) => {
        const el = viewportRef.current;
        const vw = el?.clientWidth || viewportSize.width;
        const vh = el?.clientHeight || viewportSize.height;
        const visibleCenterX = drawerOpen && vw > 900 ? (vw - 400) / 2 : vw / 2;
        triggerCameraAnimation();
        setCamera((prev) => {
          const nextScale = targetScale ?? prev.scale;
          return {
            x: visibleCenterX - worldX * nextScale,
            y: vh / 2 - worldY * nextScale,
            scale: nextScale,
          };
        });
      },
      [drawerOpen, triggerCameraAnimation, viewportSize.height, viewportSize.width],
    );

    const zoomBy = useCallback(
      (factor: number) => {
        const el = viewportRef.current;
        const vw = el?.clientWidth || viewportSize.width;
        const vh = el?.clientHeight || viewportSize.height;
        triggerCameraAnimation();
        setCamera((prev) => {
          const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * factor));
          const ratio = nextScale / prev.scale;
          const cx = vw / 2;
          const cy = vh / 2;
          return {
            scale: nextScale,
            x: cx - (cx - prev.x) * ratio,
            y: cy - (cy - prev.y) * ratio,
          };
        });
      },
      [triggerCameraAnimation, viewportSize.height, viewportSize.width],
    );

    useImperativeHandle(
      ref,
      () => ({
        fitToScreen,
        panToWorld,
        zoomBy,
      }),
      [fitToScreen, panToWorld, zoomBy],
    );

    // Initial fit on mount
    const didInitialFitRef = useRef(false);
    useEffect(() => {
      if (!didInitialFitRef.current && viewportSize.width > 0 && viewportSize.height > 0) {
        didInitialFitRef.current = true;
        fitToScreen(false);
      }
    }, [fitToScreen, viewportSize.height, viewportSize.width]);

    // Gently nudge camera left if the selected card would be hidden behind an open Detail Drawer
    useEffect(() => {
      if (!drawerOpen || !selectedPersonId || viewportSize.width <= 900) return;
      const instances = layout.instanceIdsByPersonId.get(selectedPersonId);
      const node = instances?.[0] ? layout.nodesByInstanceId.get(instances[0]) : undefined;
      if (!node) return;

      const drawerLeftX = viewportSize.width - 420;
      const rulerRightX = viewportSize.width > 960 ? 184 : 32;

      setCamera((prev) => {
        const cardScreenRight = (node.x + node.width / 2) * prev.scale + prev.x;
        const cardScreenLeft = (node.x - node.width / 2) * prev.scale + prev.x;
        if (cardScreenRight > drawerLeftX) {
          triggerCameraAnimation();
          return { ...prev, x: prev.x - (cardScreenRight - drawerLeftX) - 24 };
        }
        if (cardScreenLeft < rulerRightX) {
          triggerCameraAnimation();
          return { ...prev, x: prev.x + (rulerRightX - cardScreenLeft) + 24 };
        }
        return prev;
      });
    }, [
      drawerOpen,
      layout.instanceIdsByPersonId,
      layout.nodesByInstanceId,
      selectedPersonId,
      triggerCameraAnimation,
      viewportSize.width,
    ]);

    const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const el = viewportRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pointerX = e.clientX - rect.left;
      const pointerY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.11 : 0.9;
      setIsAnimatingCamera(false);
      setCamera((prev) => {
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale * zoomFactor));
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          x: pointerX - (pointerX - prev.x) * ratio,
          y: pointerY - (pointerY - prev.y) * ratio,
        };
      });
    }, []);

    const handlePointerDown = useCallback(
      (e: PointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('.person-card') || target.closest('.minimap-card')) {
          return;
        }
        setIsAnimatingCamera(false);
        setIsDragging(true);
        dragOriginRef.current = {
          pointerX: e.clientX,
          pointerY: e.clientY,
          camX: camera.x,
          camY: camera.y,
          moved: false,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      [camera.x, camera.y],
    );

    const handlePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const dx = e.clientX - origin.pointerX;
      const dy = e.clientY - origin.pointerY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        origin.moved = true;
      }
      setCamera((prev) => ({
        ...prev,
        x: origin.camX + dx,
        y: origin.camY + dy,
      }));
    }, []);

    const handlePointerUp = useCallback(
      (e: PointerEvent<HTMLDivElement>) => {
        const origin = dragOriginRef.current;
        if (!origin) return;
        dragOriginRef.current = null;
        setIsDragging(false);
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
        if (!origin.moved) {
          onClearBackground();
        }
      },
      [onClearBackground],
    );

    const hasHighlight = highlightedPersonIds.size > 0;
    const focusNode = layout.nodes.find((n) => n.isFocus);

    return (
      <div
        ref={viewportRef}
        className={[
          'canvas-viewport',
          isDragging ? 'is-dragging' : '',
          isAnimatingCamera ? 'is-animating-camera' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Active Relationship Highlight Banner */}
        {highlightBannerText && (
          <div className="highlight-banner">
            <span>{highlightBannerText}</span>
            <button
              type="button"
              className="btn"
              style={{ height: 24, padding: '0 9px', fontSize: 11 }}
              onClick={onClearHighlight}
            >
              Clear
            </button>
          </div>
        )}

        {/* Synchronized Left Generation Ruler */}
        <div className="gen-ruler" aria-hidden="true">
          {layout.generations.map((gen) => {
            const screenY = gen * layout.metrics.rowStep * camera.scale + camera.y;
            if (screenY < 26 || screenY > viewportSize.height - 86) return null;
            return (
              <div
                key={gen}
                className={`gen-ruler-label ${gen === 0 ? 'is-gen-zero' : ''}`}
                style={{ top: screenY }}
              >
                {generationLabel(gen)}
              </div>
            );
          })}
        </div>

        {/* Transformed World Space (SVG Connectors + Crisp Person Cards) */}
        <div
          className="canvas-world"
          style={{
            transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`,
          }}
        >
          <UnionConnectors
            layout={layout}
            highlightedPersonIds={highlightedPersonIds}
            hoveredPersonId={hoveredPersonId}
            onToggleUnionBranch={onToggleUnionBranch}
          />

          <div className="person-card-layer">
            {layout.nodes.map((node) => {
              const isPathHighlighted =
                highlightedPersonIds.has(node.personId) ||
                (hoveredPersonId !== null &&
                  hoveredPersonId === node.personId &&
                  (layout.instanceIdsByPersonId.get(node.personId)?.length ?? 0) > 1);
              return (
                <PersonCard
                  key={node.instanceId}
                  node={node}
                  photoUrl={photoUrlsByPersonId.get(node.personId)}
                  relationshipLabel={relationshipLabels.get(node.personId)}
                  isSelected={selectedPersonId === node.personId}
                  isPathHighlighted={isPathHighlighted}
                  isDimmed={hasHighlight && !highlightedPersonIds.has(node.personId)}
                  onSelect={onSelectPerson}
                  onFocus={onFocusPerson}
                  onHoverPerson={setHoveredPersonId}
                  onToggleAncestors={onToggleAncestors}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom-Left Zoom Controls & Line Legend */}
        <div className="canvas-hud-left">
          <div className="zoom-bar">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => zoomBy(0.84)}
              title="Zoom out (-)"
              aria-label="Zoom out"
            >
              <ZoomOutIcon />
            </button>
            <span className="zoom-pct">{Math.round(camera.scale * 100)}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => zoomBy(1.19)}
              title="Zoom in (+)"
              aria-label="Zoom in"
            >
              <ZoomInIcon />
            </button>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => fitToScreen(true)}
              title="Fit tree to screen (0)"
              aria-label="Fit tree to screen"
            >
              <FitIcon />
            </button>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => {
                if (focusNode) panToWorld(focusNode.x, focusNode.y, 0.95);
              }}
              title="Center on focus person"
              aria-label="Center on focus person"
            >
              <CrosshairIcon />
            </button>
          </div>

          <div className="legend-pill">
            <span className="legend-item">
              <span className="legend-swatch legend-swatch-marriage" />
              Marriage
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch-divorced" />
              Divorced
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch-bio" />
              Biological
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch-adopted" />
              Adopted
            </span>
            <span className="legend-item">
              <span className="legend-swatch legend-swatch-step" />
              Step
            </span>
          </div>
        </div>

        {/* Bottom-Right Live Interactive Minimap */}
        <Minimap
          layout={layout}
          camera={camera}
          viewportWidth={viewportSize.width}
          viewportHeight={viewportSize.height}
          highlightedPersonIds={highlightedPersonIds}
          drawerOpen={drawerOpen}
          onPanToWorld={(wx, wy) => panToWorld(wx, wy)}
        />
      </div>
    );
  },
);
