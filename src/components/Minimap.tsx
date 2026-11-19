import { useRef, type PointerEvent } from 'react';
import type { PersonId } from '../core/index.js';
import type { TreeLayoutResult } from '../layout/types.js';

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface MinimapProps {
  layout: TreeLayoutResult;
  camera: CameraState;
  viewportWidth: number;
  viewportHeight: number;
  highlightedPersonIds: ReadonlySet<PersonId>;
  drawerOpen: boolean;
  onPanToWorld: (worldX: number, worldY: number) => void;
}

export function Minimap({
  layout,
  camera,
  viewportWidth,
  viewportHeight,
  highlightedPersonIds,
  drawerOpen,
  onPanToWorld,
}: MinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const { bounds } = layout;
  const mapW = 212;
  const mapH = 140;
  const pad = 12;

  const scaleX = (mapW - pad * 2) / Math.max(1, bounds.width);
  const scaleY = (mapH - pad * 2) / Math.max(1, bounds.height);
  const mapScale = Math.min(scaleX, scaleY);

  const offsetX = (mapW - bounds.width * mapScale) / 2 - bounds.minX * mapScale;
  const offsetY = (mapH - bounds.height * mapScale) / 2 - bounds.minY * mapScale;

  // Viewport rectangle in world coordinates
  const viewWorldLeft = -camera.x / camera.scale;
  const viewWorldTop = -camera.y / camera.scale;
  const viewWorldW = viewportWidth / camera.scale;
  const viewWorldH = viewportHeight / camera.scale;

  const rectX = viewWorldLeft * mapScale + offsetX;
  const rectY = viewWorldTop * mapScale + offsetY;
  const rectW = Math.max(12, viewWorldW * mapScale);
  const rectH = Math.max(10, viewWorldH * mapScale);

  const navigateFromEvent = (e: PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = (px - offsetX) / mapScale;
    const worldY = (py - offsetY) / mapScale;
    onPanToWorld(worldX, worldY);
  };

  return (
    <div
      ref={containerRef}
      className={`minimap-card ${drawerOpen ? 'drawer-open' : ''}`}
      onPointerDown={(e) => {
        e.stopPropagation();
        draggingRef.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        navigateFromEvent(e);
      }}
      onPointerMove={(e) => {
        if (!draggingRef.current) return;
        e.stopPropagation();
        navigateFromEvent(e);
      }}
      onPointerUp={(e) => {
        draggingRef.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      title="Click or drag to navigate"
    >
      <div className="minimap-header">Overview</div>
      <svg width={mapW} height={mapH} viewBox={`0 0 ${mapW} ${mapH}`}>
        <g transform={`translate(${offsetX}, ${offsetY}) scale(${mapScale})`}>
          {layout.branchConnectors.map((b) => (
            <g key={b.id} opacity={0.45}>
              <path
                d={b.busSvgPath}
                fill="none"
                stroke="var(--line-bio)"
                strokeWidth={Math.max(4, 1.5 / mapScale)}
              />
              {b.childPaths.map((cp) => (
                <path
                  key={cp.childInstanceId}
                  d={cp.svgPath}
                  fill="none"
                  stroke="var(--line-bio)"
                  strokeWidth={Math.max(4, 1.5 / mapScale)}
                />
              ))}
            </g>
          ))}

          {layout.nodes.map((node) => {
            let fill = 'var(--ink-muted)';
            if (node.isFocus) fill = 'var(--accent-sage)';
            else if (highlightedPersonIds.has(node.personId)) fill = 'var(--accent-gold)';
            return (
              <rect
                key={node.instanceId}
                x={node.x - node.width / 2}
                y={node.y - node.height / 2}
                width={node.width}
                height={node.height}
                rx={16}
                fill={fill}
                opacity={node.isFocus ? 1 : 0.72}
              />
            );
          })}
        </g>

        <rect
          x={rectX}
          y={rectY}
          width={rectW}
          height={rectH}
          rx={4}
          fill="var(--accent-sage-soft)"
          stroke="var(--accent-sage)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  );
}
