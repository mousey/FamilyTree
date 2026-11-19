import type { LineSegment, PositionedPersonNode, TreeLayoutResult } from './types.js';

export interface CardOverlapViolation {
  nodeA: string;
  nodeB: string;
  overlapX: number;
  overlapY: number;
}

export interface ConnectorCardCollision {
  segment: LineSegment;
  cardInstanceId: string;
}

export interface HorizontalBusOverlap {
  busA: LineSegment;
  busB: LineSegment;
  y: number;
  overlapX: number;
}

export interface SegmentCrossing {
  segA: LineSegment;
  segB: LineSegment;
  x: number;
  y: number;
}

export interface BadgeCollision {
  badgeId: string;
  targetId: string;
}

export interface GeometryAuditReport {
  clean: boolean;
  cardOverlaps: CardOverlapViolation[];
  connectorCardCollisions: ConnectorCardCollision[];
  horizontalBusOverlaps: HorizontalBusOverlap[];
  segmentCrossings: SegmentCrossing[];
  badgeCollisions: BadgeCollision[];
}

/**
 * Checks whether any two person cards overlap (with optional minimum gap).
 */
export function findCardOverlaps(
  layout: TreeLayoutResult,
  minGap = 0,
): CardOverlapViolation[] {
  const violations: CardOverlapViolation[] = [];
  const { nodes } = layout;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    const aLeft = a.x - a.width / 2 - minGap / 2;
    const aRight = a.x + a.width / 2 + minGap / 2;
    const aTop = a.y - a.height / 2 - minGap / 2;
    const aBottom = a.y + a.height / 2 + minGap / 2;

    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      const bLeft = b.x - b.width / 2 - minGap / 2;
      const bRight = b.x + b.width / 2 + minGap / 2;
      const bTop = b.y - b.height / 2 - minGap / 2;
      const bBottom = b.y + b.height / 2 + minGap / 2;

      const overlapX = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
      const overlapY = Math.min(aBottom, bBottom) - Math.max(aTop, bTop);

      if (overlapX > 0.5 && overlapY > 0.5) {
        violations.push({
          nodeA: a.instanceId,
          nodeB: b.instanceId,
          overlapX,
          overlapY,
        });
      }
    }
  }

  return violations;
}

function segmentIntersectsCardInterior(
  seg: LineSegment,
  card: PositionedPersonNode,
  inset = 1.5,
): boolean {
  const left = card.x - card.width / 2 + inset;
  const right = card.x + card.width / 2 - inset;
  const top = card.y - card.height / 2 + inset;
  const bottom = card.y + card.height / 2 - inset;

  const isHorizontal = Math.abs(seg.y1 - seg.y2) < 0.5;
  const isVertical = Math.abs(seg.x1 - seg.x2) < 0.5;

  if (isHorizontal) {
    const y = seg.y1;
    if (y <= top || y >= bottom) return false;
    const segMinX = Math.min(seg.x1, seg.x2);
    const segMaxX = Math.max(seg.x1, seg.x2);
    return segMaxX > left && segMinX < right;
  }

  if (isVertical) {
    const x = seg.x1;
    if (x <= left || x >= right) return false;
    const segMinY = Math.min(seg.y1, seg.y2);
    const segMaxY = Math.max(seg.y1, seg.y2);
    return segMaxY > top && segMinY < bottom;
  }

  return false;
}

/**
 * Checks whether any connector segment passes through the interior of any person card.
 */
export function findConnectorCardCollisions(
  layout: TreeLayoutResult,
): ConnectorCardCollision[] {
  const collisions: ConnectorCardCollision[] = [];
  const allSegments: LineSegment[] = [
    ...layout.marriageConnectors.flatMap((m) => m.segments),
    ...layout.branchConnectors.flatMap((b) => b.segments),
  ];

  for (const seg of allSegments) {
    for (const card of layout.nodes) {
      if (segmentIntersectsCardInterior(seg, card)) {
        collisions.push({
          segment: seg,
          cardInstanceId: card.instanceId,
        });
      }
    }
  }

  return collisions;
}

/**
 * Checks whether two horizontal sibling bus lines from different unions overlap at the same Y track.
 */
export function findHorizontalBusOverlaps(
  layout: TreeLayoutResult,
): HorizontalBusOverlap[] {
  const overlaps: HorizontalBusOverlap[] = [];
  const buses: LineSegment[] = layout.branchConnectors
    .flatMap((b) => b.segments)
    .filter((s) => s.kind === 'bus');

  for (let i = 0; i < buses.length; i++) {
    const a = buses[i]!;
    const aMin = Math.min(a.x1, a.x2);
    const aMax = Math.max(a.x1, a.x2);

    for (let j = i + 1; j < buses.length; j++) {
      const b = buses[j]!;
      if (Math.abs(a.y1 - b.y1) > 2) continue;
      const bMin = Math.min(b.x1, b.x2);
      const bMax = Math.max(b.x1, b.x2);
      const overlapX = Math.min(aMax, bMax) - Math.max(aMin, bMin);
      if (overlapX > 0.5) {
        overlaps.push({
          busA: a,
          busB: b,
          y: a.y1,
          overlapX,
        });
      }
    }
  }

  return overlaps;
}

/**
 * Checks whether any horizontal segment strictly crosses a vertical segment from a DIFFERENT connector.
 */
export function findSegmentCrossings(layout: TreeLayoutResult): SegmentCrossing[] {
  const crossings: SegmentCrossing[] = [];
  const allSegments: LineSegment[] = [
    ...layout.marriageConnectors.flatMap((m) => m.segments),
    ...layout.branchConnectors.flatMap((b) => b.segments),
  ];

  const horizontals = allSegments.filter((s) => Math.abs(s.y1 - s.y2) < 0.5);
  const verticals = allSegments.filter((s) => Math.abs(s.x1 - s.x2) < 0.5);

  const eps = 1.0;
  for (const h of horizontals) {
    const hMinX = Math.min(h.x1, h.x2);
    const hMaxX = Math.max(h.x1, h.x2);
    const hy = h.y1;

    for (const v of verticals) {
      // Ignore segments owned by the same connector branch/marriage
      if (h.ownerIds.some((id) => v.ownerIds.includes(id))) continue;
      const vx = v.x1;
      const vMinY = Math.min(v.y1, v.y2);
      const vMaxY = Math.max(v.y1, v.y2);

      if (vx > hMinX + eps && vx < hMaxX - eps && hy > vMinY + eps && hy < vMaxY - eps) {
        crossings.push({ segA: h, segB: v, x: vx, y: hy });
      }
    }
  }

  return crossings;
}

/**
 * Checks whether any marriage badge pill overlaps any person card bounding box.
 */
export function findBadgeCollisions(
  layout: TreeLayoutResult,
  pillWidth = 54,
  pillHeight = 20,
): BadgeCollision[] {
  const collisions: BadgeCollision[] = [];

  for (const mc of layout.marriageConnectors) {
    const pLeft = mc.badgeX - pillWidth / 2;
    const pRight = mc.badgeX + pillWidth / 2;
    const pTop = mc.badgeY - pillHeight / 2;
    const pBottom = mc.badgeY + pillHeight / 2;

    for (const card of layout.nodes) {
      const cLeft = card.x - card.width / 2;
      const cRight = card.x + card.width / 2;
      const cTop = card.y - card.height / 2;
      const cBottom = card.y + card.height / 2;

      const ox = Math.min(pRight, cRight) - Math.max(pLeft, cLeft);
      const oy = Math.min(pBottom, cBottom) - Math.max(pTop, cTop);
      if (ox > 0.5 && oy > 0.5) {
        collisions.push({
          badgeId: mc.id,
          targetId: card.instanceId,
        });
      }
    }
  }

  return collisions;
}

export function auditLayoutGeometry(
  layout: TreeLayoutResult,
  minCardGap = 8,
): GeometryAuditReport {
  const cardOverlaps = findCardOverlaps(layout, minCardGap);
  const connectorCardCollisions = findConnectorCardCollisions(layout);
  const horizontalBusOverlaps = findHorizontalBusOverlaps(layout);
  const segmentCrossings = findSegmentCrossings(layout);
  const badgeCollisions = findBadgeCollisions(layout);

  return {
    clean:
      cardOverlaps.length === 0 &&
      connectorCardCollisions.length === 0 &&
      horizontalBusOverlaps.length === 0 &&
      segmentCrossings.length === 0 &&
      badgeCollisions.length === 0,
    cardOverlaps,
    connectorCardCollisions,
    horizontalBusOverlaps,
    segmentCrossings,
    badgeCollisions,
  };
}
