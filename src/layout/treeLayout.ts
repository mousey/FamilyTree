import {
  getEffectiveParentRelation,
  matchesLineageMode,
  type FamilyGraph,
  type LineageMode,
  type ParentChildType,
  type PersonId,
  type Union,
  type UnionId,
} from '../core/index.js';
import {
  DEFAULT_LAYOUT_METRICS,
  type ChildConnectorEdge,
  type DuplicateLink,
  type FamilyBranchConnector,
  type LayoutMetrics,
  type LayoutOptions,
  type LineSegment,
  type MarriageConnector,
  type PositionedPersonNode,
  type TreeLayoutResult,
} from './types.js';

interface Contour {
  left: Map<number, number>;
  right: Map<number, number>;
}

function emptyContour(): Contour {
  return { left: new Map(), right: new Map() };
}

function shiftContour(c: Contour, dx: number): Contour {
  const left = new Map<number, number>();
  const right = new Map<number, number>();
  for (const [d, v] of c.left.entries()) left.set(d, v + dx);
  for (const [d, v] of c.right.entries()) right.set(d, v + dx);
  return { left, right };
}

function mergeContours(a: Contour, b: Contour): Contour {
  const left = new Map<number, number>(a.left);
  const right = new Map<number, number>(a.right);
  for (const [d, v] of b.left.entries()) {
    const prev = left.get(d);
    left.set(d, prev === undefined ? v : Math.min(prev, v));
  }
  for (const [d, v] of b.right.entries()) {
    const prev = right.get(d);
    right.set(d, prev === undefined ? v : Math.max(prev, v));
  }
  return { left, right };
}

function computeRequiredShift(
  accum: Contour,
  next: Contour,
  gapAtDepth0: number,
  gapAtDeeper: number,
): number {
  let maxShift = Number.NEGATIVE_INFINITY;
  for (const [d, nextLeft] of next.left.entries()) {
    const accumRight = accum.right.get(d);
    if (accumRight !== undefined) {
      const gap = d === 0 ? gapAtDepth0 : gapAtDeeper;
      const needed = accumRight + gap - nextLeft;
      if (needed > maxShift) {
        maxShift = needed;
      }
    }
  }
  return maxShift === Number.NEGATIVE_INFINITY ? 0 : maxShift;
}

function unionChildRelation(
  union: Union,
  childPersonId: PersonId,
): ParentChildType {
  const link = union.children.find((c) => c.personId === childPersonId);
  if (!link) return 'biological';
  if (link.pedigree) return link.pedigree;
  if (link.parentRelations) {
    const values = Object.values(link.parentRelations);
    if (values.includes('biological')) return 'biological';
    if (values.includes('adopted')) return 'adopted';
    if (values[0]) return values[0];
  }
  return 'biological';
}

function unionMatchesChildLineage(
  union: Union,
  childPersonId: PersonId,
  lineageMode: LineageMode,
): boolean {
  const link = union.children.find((c) => c.personId === childPersonId);
  if (!link) return false;
  if (union.partners.length === 0) {
    return matchesLineageMode(link.pedigree ?? 'biological', lineageMode);
  }
  return union.partners.some((p) =>
    matchesLineageMode(getEffectiveParentRelation(link, p.personId), lineageMode),
  );
}

// ============================================================================
// Downward Descendant Tree Structures
// ============================================================================

interface DescSpouseSlot {
  union: Union;
  spousePersonId?: PersonId;
  spouseInstanceId?: string;
  /** Local X of spouse card center relative to primary person (0) */
  spouseLocalX?: number;
  /** Local X of marriage badge / child-drop anchor */
  anchorLocalX: number;
  /** Local Y offset for badge (0 for horizontal bar, negative for top arch) */
  isArch: boolean;
  archLevel: number;
  children: DescUnit[];
  hiddenDescendantCount: number;
  isCollapsed: boolean;
}

interface DescUnit {
  primaryInstanceId: string;
  primaryPersonId: PersonId;
  depth: number;
  isDuplicate: boolean;
  isFocus: boolean;
  /** Local X offset of this unit's primaryPerson relative to its parent container */
  offsetX: number;
  /** Local horizontal bounds of all cards in this unit at depth 0 */
  cardsMinX: number;
  cardsMaxX: number;
  unionSlots: DescSpouseSlot[];
  contour: Contour;
}

// ============================================================================
// Upward Ancestor Tree Structures
// ============================================================================

interface AncParentUnionBlock {
  union: Union;
  parentUnits: AncUnit[];
  /** Local X offsets of each parentUnit inside this block */
  parentOffsets: number[];
  /** Center X of the union anchor in block coordinates */
  anchorLocalX: number;
  /** Offset of this block relative to the child AncUnit */
  blockOffsetX: number;
  contour: Contour;
}

interface AncUnit {
  instanceId: string;
  personId: PersonId;
  /** Depth upward from focus (0 = focus, 1 = parents, 2 = grandparents, ...) */
  upDepth: number;
  isDuplicate: boolean;
  offsetX: number;
  parentBlocks: AncParentUnionBlock[];
  hasAncestors: boolean;
  hiddenAncestorCount: number;
  isCollapsed: boolean;
  contour: Contour;
}

// ============================================================================
// Orthogonal Rounded SVG Path Helpers
// ============================================================================

function buildOrthogonalPath(points: Array<{ x: number; y: number }>, radius = 10): string {
  if (points.length < 2) return '';
  // Deduplicate consecutive identical points
  const pts: Array<{ x: number; y: number }> = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    const prev = pts[pts.length - 1]!;
    const curr = points[i]!;
    if (Math.hypot(curr.x - prev.x, curr.y - prev.y) > 0.25) {
      pts.push(curr);
    }
  }
  if (pts.length < 2) return '';

  let d = `M ${pts[0]!.x.toFixed(1)} ${pts[0]!.y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!;
    const curr = pts[i]!;
    const next = pts[i + 1]!;

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1);
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    // Collinear check
    const cross = Math.abs(dx1 * dy2 - dy1 * dx2);
    if (cross < 0.01 || len1 < 0.5 || len2 < 0.5) {
      d += ` L ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
      continue;
    }

    const r = Math.min(radius, len1 / 2, len2 / 2);
    const startX = curr.x - (dx1 / len1) * r;
    const startY = curr.y - (dy1 / len1) * r;
    const endX = curr.x + (dx2 / len2) * r;
    const endY = curr.y + (dy2 / len2) * r;

    d += ` L ${startX.toFixed(1)} ${startY.toFixed(1)} Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${endX.toFixed(1)} ${endY.toFixed(1)}`;
  }

  const last = pts[pts.length - 1]!;
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

interface GutterBusItem {
  id: string;
  originX: number;
  childXs: number[];
  xMin: number;
  xMax: number;
}

/**
 * Assigns non-overlapping, crossing-free vertical rail tracks within a generation gutter.
 *
 * Uses planar dominance constraints:
 * - If branch A's horizontal bus spans over branch B's stem (originX), B must sit ABOVE A
 *   so B's stem terminates before reaching A's bus.
 * - If branch B's horizontal bus spans over any of branch A's child drops, A must sit BELOW B
 *   so A's drops start below B's bus.
 * - Any remaining overlapping horizontal buses without strict dominance get separate tracks.
 */
function allocateBusTracks(
  items: GutterBusItem[],
): Map<string, { trackIndex: number; trackCount: number }> {
  const n = items.length;
  if (n === 0) return new Map();

  // above[i] contains j if item i MUST be strictly above item j (trackIndex[i] < trackIndex[j])
  const above: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  const inDegree = new Array<number>(n).fill(0);
  const eps = 1.0;

  const addConstraint = (upper: number, lower: number): void => {
    if (upper === lower) return;
    // Prevent direct 2-cycles in degenerate non-monotone cases
    if (above[lower]!.has(upper)) return;
    if (!above[upper]!.has(lower)) {
      above[upper]!.add(lower);
      inDegree[lower] = (inDegree[lower] ?? 0) + 1;
    }
  };

  for (let i = 0; i < n; i++) {
    const a = items[i]!;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const b = items[j]!;

      // If A's horizontal bus spans strictly across B's stem originX -> B must be ABOVE A
      if (b.originX > a.xMin + eps && b.originX < a.xMax - eps) {
        addConstraint(j, i);
      }

      // If B's horizontal bus spans strictly across any of A's child drops -> B must be ABOVE A
      for (const cx of a.childXs) {
        if (cx > b.xMin + eps && cx < b.xMax - eps) {
          addConstraint(j, i);
          break;
        }
      }
    }
  }

  // Compute minimum track layer via Kahn's topological longest path
  const minTrack = new Array<number>(n).fill(0);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) {
    if (inDegree[i] === 0) queue.push(i);
  }

  let head = 0;
  while (head < queue.length) {
    const u = queue[head++]!;
    for (const v of above[u]!) {
      minTrack[v] = Math.max(minTrack[v]!, minTrack[u]! + 1);
      inDegree[v] = (inDegree[v] ?? 1) - 1;
      if (inDegree[v] === 0) {
        queue.push(v);
      }
    }
  }

  // Resolve any remaining horizontal-interval overlaps on the same track level
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => {
    const tDiff = minTrack[a]! - minTrack[b]!;
    if (tDiff !== 0) return tDiff;
    return items[a]!.xMin - items[b]!.xMin;
  });

  const trackIntervals: Array<Array<{ xMin: number; xMax: number }>> = [];
  const finalTrack = new Array<number>(n).fill(0);
  const pad = 12;

  for (const idx of order) {
    const item = items[idx]!;
    // Respect all already-placed upper predecessors
    let startTrack = minTrack[idx]!;
    for (let u = 0; u < n; u++) {
      if (above[u]!.has(idx)) {
        startTrack = Math.max(startTrack, finalTrack[u]! + 1);
      }
    }

    let t = startTrack;
    while (true) {
      const existing = trackIntervals[t] ?? [];
      const collides = existing.some(
        (iv) => item.xMin < iv.xMax + pad && item.xMax + pad > iv.xMin,
      );
      if (!collides) {
        if (!trackIntervals[t]) trackIntervals[t] = [];
        trackIntervals[t]!.push({ xMin: item.xMin, xMax: item.xMax });
        finalTrack[idx] = t;
        break;
      }
      t++;
    }
  }

  const trackCount = Math.max(1, trackIntervals.length);
  const result = new Map<string, { trackIndex: number; trackCount: number }>();
  for (let i = 0; i < n; i++) {
    result.set(items[i]!.id, { trackIndex: finalTrack[i]!, trackCount });
  }
  return result;
}

// ============================================================================
// Main Layout Builder
// ============================================================================

export function computeTreeLayout(
  graph: FamilyGraph,
  options: LayoutOptions,
  metrics: LayoutMetrics = DEFAULT_LAYOUT_METRICS,
): TreeLayoutResult {
  const focusPerson = graph.getPerson(options.focusPersonId);
  if (!focusPerson) {
    throw new Error(`Focus person "${options.focusPersonId}" not found in graph.`);
  }

  const mode = options.mode;
  const ancestorLevels =
    mode === 'descendants' ? 0 : (options.ancestorLevels ?? 4);
  const descendantLevels =
    mode === 'ancestors' ? 0 : (options.descendantLevels ?? 4);
  const includeSpouses = options.includeSpouses ?? true;
  const includeFocusSiblings =
    mode === 'hourglass' && (options.includeFocusSiblings ?? false);
  const includeSpouseAncestors =
    mode === 'hourglass' && includeSpouses && (options.includeSpouseAncestors ?? false);
  const lineageMode: LineageMode = options.lineageMode ?? 'all';
  const collapsedUnionIds = options.collapsedUnionIds ?? new Set<UnionId>();
  const collapsedAncestorIds = options.collapsedAncestorIds ?? new Set<string>();

  const W = metrics.cardWidth;
  const H = metrics.cardHeight;
  const SG = metrics.spouseGap;
  const SIB_GAP = metrics.siblingGap;
  const SUB_GAP = metrics.subtreeGap;
  const ROW = metrics.rowStep;
  const GEN_GAP = metrics.generationGap;

  let seq = 0;
  const nextId = (prefix: string): string => `${prefix}_${++seq}`;

  // --------------------------------------------------------------------------
  // 1. Build Downward Descendant Tree (anchored at focusPerson at depth 0)
  // --------------------------------------------------------------------------
  const seenDescendantPeople = new Set<PersonId>();
  const expandedDescUnions = new Set<UnionId>();

  const buildDescUnit = (
    personId: PersonId,
    depth: number,
    isFocus: boolean,
  ): DescUnit => {
    const instanceId = isFocus ? `focus_${personId}` : `desc_${personId}_${nextId('n')}`;
    const alreadySeen = seenDescendantPeople.has(personId);
    seenDescendantPeople.add(personId);

    const partnerUnions = graph.getUnionsAsPartner(personId);
    const unionSlots: DescSpouseSlot[] = [];

    // Do not re-expand unions if this person is a pedigree-collapse duplicate in the descendant tree
    if (!alreadySeen) {
      const relevantUnions = partnerUnions.filter((u) => {
        if (expandedDescUnions.has(u.id)) return false;
        const hasChildren = u.children.some((c) =>
          unionMatchesChildLineage(u, c.personId, lineageMode),
        );
        if (!includeSpouses && !hasChildren) return false;
        return true;
      });

      // Determine spouse placement around primaryPerson (at local x = 0):
      // - 1 union: spouse on right (+(W+SG))
      // - 2 unions: union 0 spouse on LEFT (-(W+SG)), union 1 spouse on RIGHT (+(W+SG))
      // - 3+ unions: union 0 on LEFT, union 1 on RIGHT, union 2+ further RIGHT with top arch!
      const spouseCount = relevantUnions.filter((u) =>
        includeSpouses && u.partners.some((p) => p.personId !== personId),
      ).length;

      let rightSlotIdx = 0;
      let leftUsed = false;

      for (let idx = 0; idx < relevantUnions.length; idx++) {
        const union = relevantUnions[idx]!;
        expandedDescUnions.add(union.id);

        const coPartner = includeSpouses
          ? union.partners.find((p) => p.personId !== personId)
          : undefined;
        const coPartnerId = coPartner?.personId;

        let spouseLocalX: number | undefined;
        let anchorLocalX = 0;
        let isArch = false;
        let archLevel = 0;

        if (coPartnerId) {
          if (spouseCount >= 2 && !leftUsed) {
            leftUsed = true;
            spouseLocalX = -(W + SG);
            anchorLocalX = -(W + SG) / 2;
          } else {
            rightSlotIdx++;
            spouseLocalX = rightSlotIdx * (W + SG);
            if (rightSlotIdx === 1) {
              anchorLocalX = (W + SG) / 2;
            } else {
              // 3rd+ spouse: connect via top arch over intermediate spouse(s)
              isArch = true;
              archLevel = rightSlotIdx - 1;
              anchorLocalX = spouseLocalX;
            }
          }
        }

        const eligibleChildren = union.children
          .filter((c) => {
            if (!graph.getPerson(c.personId)) return false;
            const rel = getEffectiveParentRelation(c, personId);
            return matchesLineageMode(rel, lineageMode);
          })
          .map((c) => c.personId);

        const isCollapsed = collapsedUnionIds.has(union.id);
        let childUnits: DescUnit[] = [];
        let hiddenDescendantCount = 0;

        if (eligibleChildren.length > 0) {
          if (isCollapsed || depth >= descendantLevels) {
            // Count unique descendants hidden behind this union
            const hiddenSet = new Set<PersonId>();
            for (const cid of eligibleChildren) {
              hiddenSet.add(cid);
              for (const dId of graph.getDescendants(cid, { lineageMode }).keys()) {
                hiddenSet.add(dId);
              }
            }
            hiddenDescendantCount = hiddenSet.size;
          } else {
            childUnits = eligibleChildren.map((cid) =>
              buildDescUnit(cid, depth + 1, false),
            );
          }
        }

        const spouseInstanceId = coPartnerId
          ? `spouse_${coPartnerId}_${union.id}`
          : undefined;
        if (coPartnerId) {
          seenDescendantPeople.add(coPartnerId);
        }

        unionSlots.push({
          union,
          spousePersonId: coPartnerId,
          spouseInstanceId,
          spouseLocalX,
          anchorLocalX,
          isArch,
          archLevel,
          children: childUnits,
          hiddenDescendantCount,
          isCollapsed,
        });
      }
    }

    // Order unionSlots left-to-right by anchorLocalX so child subtrees match spouse order (zero crossings!)
    unionSlots.sort((a, b) => a.anchorLocalX - b.anchorLocalX);

    // Compute local horizontal card span of this unit at depth 0
    let cardsMinX = -W / 2;
    let cardsMaxX = W / 2;
    for (const slot of unionSlots) {
      if (slot.spouseLocalX !== undefined) {
        cardsMinX = Math.min(cardsMinX, slot.spouseLocalX - W / 2);
        cardsMaxX = Math.max(cardsMaxX, slot.spouseLocalX + W / 2);
      }
    }

    // Pack all child subtrees left-to-right across all unionSlots using contours
    const allChildrenWithGroup: Array<{ child: DescUnit; slotIdx: number }> = [];
    unionSlots.forEach((slot, slotIdx) => {
      for (const child of slot.children) {
        allChildrenWithGroup.push({ child, slotIdx });
      }
    });

    let childrenContour = emptyContour();
    if (allChildrenWithGroup.length > 0) {
      let prevSlotIdx = -1;
      for (let i = 0; i < allChildrenWithGroup.length; i++) {
        const entry = allChildrenWithGroup[i]!;
        if (i === 0) {
          entry.child.offsetX = 0;
          childrenContour = entry.child.contour;
        } else {
          const isNewUnion = entry.slotIdx !== prevSlotIdx;
          const gap0 = isNewUnion ? SUB_GAP : SIB_GAP;
          const shift = computeRequiredShift(
            childrenContour,
            entry.child.contour,
            gap0,
            SUB_GAP,
          );
          entry.child.offsetX = shift;
          childrenContour = mergeContours(
            childrenContour,
            shiftContour(entry.child.contour, shift),
          );
        }
        prevSlotIdx = entry.slotIdx;
      }

      // Align children cluster relative to the parent union anchor(s)
      const firstChild = allChildrenWithGroup[0]!.child;
      const lastChild = allChildrenWithGroup[allChildrenWithGroup.length - 1]!.child;
      const childrenMidX = (firstChild.offsetX + lastChild.offsetX) / 2;

      const activeSlots = unionSlots.filter((s) => s.children.length > 0);
      const targetMidX =
        activeSlots.length === 1
          ? activeSlots[0]!.anchorLocalX
          : (activeSlots[0]!.anchorLocalX +
              activeSlots[activeSlots.length - 1]!.anchorLocalX) /
            2;

      const delta = targetMidX - childrenMidX;
      for (const entry of allChildrenWithGroup) {
        entry.child.offsetX += delta;
      }
      childrenContour = shiftContour(childrenContour, delta);
    }

    // Build combined contour (depth 0 = cards of this unit; depth d+1 = childrenContour[d])
    const contour: Contour = {
      left: new Map([[0, cardsMinX]]),
      right: new Map([[0, cardsMaxX]]),
    };
    for (const [d, v] of childrenContour.left.entries()) {
      contour.left.set(d + 1, v);
    }
    for (const [d, v] of childrenContour.right.entries()) {
      contour.right.set(d + 1, v);
    }

    return {
      primaryInstanceId: instanceId,
      primaryPersonId: personId,
      depth,
      isDuplicate: alreadySeen,
      isFocus,
      offsetX: 0,
      cardsMinX,
      cardsMaxX,
      unionSlots,
      contour,
    };
  };

  const descRoot = buildDescUnit(options.focusPersonId, 0, true);

  // --------------------------------------------------------------------------
  // 2. Build Upward Ancestor Tree(s)
  // --------------------------------------------------------------------------
  const seenAncestorPeople = new Set<PersonId>([options.focusPersonId]);

  const buildAncUnit = (
    personId: PersonId,
    upDepth: number,
    existingInstanceId?: string,
  ): AncUnit => {
    const instanceId = existingInstanceId ?? `anc_${personId}_${nextId('a')}`;
    const isDuplicate = upDepth > 0 && seenAncestorPeople.has(personId);
    seenAncestorPeople.add(personId);

    const parentUnions = graph
      .getUnionsAsChild(personId)
      .filter((u) => {
        const hasEligibleParent = u.partners.some((p) => {
          const link = u.children.find((c) => c.personId === personId);
          if (!link) return false;
          return matchesLineageMode(
            getEffectiveParentRelation(link, p.personId),
            lineageMode,
          );
        });
        return hasEligibleParent;
      });

    const hasAncestors = parentUnions.length > 0;
    const isCollapsed = collapsedAncestorIds.has(instanceId);
    let hiddenAncestorCount = 0;
    const parentBlocks: AncParentUnionBlock[] = [];

    if (hasAncestors) {
      if (isDuplicate) {
        // Pedigree collapse duplicate: stop re-expanding upward to prevent exponential blowup
        hiddenAncestorCount = 0;
      } else if (isCollapsed || upDepth >= ancestorLevels) {
        hiddenAncestorCount = graph.getAncestors(personId, { lineageMode }).size;
      } else {
        for (const union of parentUnions) {
          const link = union.children.find((c) => c.personId === personId);
          const eligiblePartners = union.partners.filter((p) => {
            if (!link || !graph.getPerson(p.personId)) return false;
            return matchesLineageMode(
              getEffectiveParentRelation(link, p.personId),
              lineageMode,
            );
          });

          // Order partners cleanly: husband/male left, wife/female right (deterministic)
          const orderedPartners = [...eligiblePartners].sort((a, b) => {
            const rank = (p: (typeof eligiblePartners)[number]): number => {
              if (p.role === 'husband') return 0;
              if (p.role === 'wife') return 1;
              const sex = graph.getPerson(p.personId)?.sex;
              if (sex === 'male') return 0;
              if (sex === 'female') return 1;
              return 2;
            };
            const rDiff = rank(a) - rank(b);
            if (rDiff !== 0) return rDiff;
            return a.personId.localeCompare(b.personId);
          });

          const parentUnits = orderedPartners.map((p) =>
            buildAncUnit(p.personId, upDepth + 1),
          );

          // Pack parentUnits side-by-side inside this parent union block
          const parentOffsets: number[] = [];
          let blockContour = emptyContour();
          for (let i = 0; i < parentUnits.length; i++) {
            const pu = parentUnits[i]!;
            if (i === 0) {
              parentOffsets.push(0);
              blockContour = pu.contour;
            } else {
              const shift = computeRequiredShift(
                blockContour,
                pu.contour,
                SG,
                SUB_GAP,
              );
              parentOffsets.push(shift);
              blockContour = mergeContours(
                blockContour,
                shiftContour(pu.contour, shift),
              );
            }
          }

          const firstOffset = parentOffsets[0] ?? 0;
          const lastOffset = parentOffsets[parentOffsets.length - 1] ?? 0;
          const anchorLocalX = (firstOffset + lastOffset) / 2;

          parentBlocks.push({
            union,
            parentUnits,
            parentOffsets,
            anchorLocalX,
            blockOffsetX: 0,
            contour: blockContour,
          });
        }
      }
    }

    // Pack multiple parentBlocks (e.g. biological + adoptive unions) side by side
    let parentsMergedContour = emptyContour();
    if (parentBlocks.length > 0) {
      for (let i = 0; i < parentBlocks.length; i++) {
        const block = parentBlocks[i]!;
        if (i === 0) {
          block.blockOffsetX = 0;
          parentsMergedContour = block.contour;
        } else {
          const shift = computeRequiredShift(
            parentsMergedContour,
            block.contour,
            SUB_GAP,
            SUB_GAP,
          );
          block.blockOffsetX = shift;
          parentsMergedContour = mergeContours(
            parentsMergedContour,
            shiftContour(block.contour, shift),
          );
        }
      }

      const firstAnchor =
        parentBlocks[0]!.blockOffsetX + parentBlocks[0]!.anchorLocalX;
      const lastAnchor =
        parentBlocks[parentBlocks.length - 1]!.blockOffsetX +
        parentBlocks[parentBlocks.length - 1]!.anchorLocalX;
      const midAnchor = (firstAnchor + lastAnchor) / 2;

      // Center parents cleanly over this child (local x = 0)
      for (const block of parentBlocks) {
        block.blockOffsetX -= midAnchor;
      }
      parentsMergedContour = shiftContour(parentsMergedContour, -midAnchor);
    }

    const contour: Contour = {
      left: new Map([[0, -W / 2]]),
      right: new Map([[0, W / 2]]),
    };
    for (const [d, v] of parentsMergedContour.left.entries()) {
      contour.left.set(d + 1, v);
    }
    for (const [d, v] of parentsMergedContour.right.entries()) {
      contour.right.set(d + 1, v);
    }

    return {
      instanceId,
      personId,
      upDepth,
      isDuplicate,
      offsetX: 0,
      parentBlocks,
      hasAncestors,
      hiddenAncestorCount,
      isCollapsed,
      contour,
    };
  };

  const focusAncRoot = buildAncUnit(
    options.focusPersonId,
    0,
    descRoot.primaryInstanceId,
  );

  // Optional: Spouse's ancestor tree (for combined couple trees in hourglass mode)
  let spouseAncRoot: AncUnit | undefined;
  let spouseAncSlot: DescSpouseSlot | undefined;
  let spouseAncShiftX = 0;

  if (includeSpouseAncestors && ancestorLevels > 0) {
    // Pick the primary right-side spouse slot (or first spouse slot)
    const primarySpouseSlot =
      descRoot.unionSlots.find(
        (s) => s.spousePersonId !== undefined && (s.spouseLocalX ?? 0) > 0,
      ) ?? descRoot.unionSlots.find((s) => s.spousePersonId !== undefined);

    if (
      primarySpouseSlot?.spousePersonId &&
      primarySpouseSlot.spouseInstanceId &&
      primarySpouseSlot.spouseLocalX !== undefined
    ) {
      spouseAncSlot = primarySpouseSlot;
      seenAncestorPeople.add(primarySpouseSlot.spousePersonId);
      spouseAncRoot = buildAncUnit(
        primarySpouseSlot.spousePersonId,
        0,
        primarySpouseSlot.spouseInstanceId,
      );

      if (spouseAncRoot.parentBlocks.length > 0) {
        // Pack spouse's upward contour (depth >= 1) strictly to the right of focus's upward contour!
        const focusUpper: Contour = { left: new Map(), right: new Map() };
        const spouseUpper: Contour = { left: new Map(), right: new Map() };
        for (const [d, v] of focusAncRoot.contour.left.entries()) {
          if (d >= 1) focusUpper.left.set(d, v);
        }
        for (const [d, v] of focusAncRoot.contour.right.entries()) {
          if (d >= 1) focusUpper.right.set(d, v);
        }
        for (const [d, v] of spouseAncRoot.contour.left.entries()) {
          if (d >= 1) spouseUpper.left.set(d, v);
        }
        for (const [d, v] of spouseAncRoot.contour.right.entries()) {
          if (d >= 1) spouseUpper.right.set(d, v);
        }

        const desiredX = primarySpouseSlot.spouseLocalX;
        if (desiredX >= 0) {
          const minRightShift = computeRequiredShift(
            focusUpper,
            spouseUpper,
            SUB_GAP,
            SUB_GAP,
          );
          spouseAncShiftX = Math.max(desiredX, minRightShift);
        } else {
          // Spouse is on left: pack spouseUpper strictly to the left of focusUpper
          const minFocusShift = computeRequiredShift(
            spouseUpper,
            focusUpper,
            SUB_GAP,
            SUB_GAP,
          );
          spouseAncShiftX = Math.min(desiredX, -minFocusShift);
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. Emit Positioned Person Nodes & Collect Raw Connectors
  // --------------------------------------------------------------------------
  const nodes: PositionedPersonNode[] = [];
  const nodesByInstanceId = new Map<string, PositionedPersonNode>();

  const addNode = (node: PositionedPersonNode): void => {
    nodes.push(node);
    nodesByInstanceId.set(node.instanceId, node);
  };

  interface RawMarriage {
    id: string;
    union: Union;
    leftInstanceId: string;
    rightInstanceId: string;
    isArch: boolean;
    archLevel: number;
  }

  interface RawBranch {
    id: string;
    union: Union;
    originX: number;
    originY: number;
    parentGeneration: number;
    children: ChildConnectorEdge[];
    hiddenDescendantCount: number;
    isCollapsed: boolean;
  }

  const rawMarriages: RawMarriage[] = [];
  const rawBranches: RawBranch[] = [];

  // Emit Downward Tree Nodes + Connectors
  const emitDescUnit = (unit: DescUnit, worldX: number): void => {
    const person = graph.getPerson(unit.primaryPersonId)!;
    const worldY = unit.depth * ROW;

    addNode({
      instanceId: unit.primaryInstanceId,
      personId: unit.primaryPersonId,
      person,
      x: worldX,
      y: worldY,
      width: W,
      height: H,
      generation: unit.depth,
      isFocus: unit.isFocus,
      isSpouseOfFocus: false,
      isFocusSibling: false,
      isDuplicate: unit.isDuplicate,
      side: unit.isFocus ? 'focus' : 'descendant',
      hiddenAncestorCount: unit.isFocus ? focusAncRoot.hiddenAncestorCount : 0,
      hasAncestors: unit.isFocus ? focusAncRoot.hasAncestors : false,
      isAncestorsCollapsed: unit.isFocus ? focusAncRoot.isCollapsed : false,
    });

    for (const slot of unit.unionSlots) {
      if (
        slot.spousePersonId &&
        slot.spouseInstanceId &&
        slot.spouseLocalX !== undefined
      ) {
        const spousePerson = graph.getPerson(slot.spousePersonId)!;
        const spouseWorldX = worldX + slot.spouseLocalX;
        const isSpouseRootWithAnc =
          spouseAncSlot?.spouseInstanceId === slot.spouseInstanceId &&
          spouseAncRoot !== undefined;

        addNode({
          instanceId: slot.spouseInstanceId,
          personId: slot.spousePersonId,
          person: spousePerson,
          x: spouseWorldX,
          y: worldY,
          width: W,
          height: H,
          generation: unit.depth,
          isFocus: false,
          isSpouseOfFocus: unit.isFocus,
          isFocusSibling: false,
          isDuplicate: false,
          side: unit.isFocus ? 'focus' : 'descendant',
          hiddenAncestorCount:
            isSpouseRootWithAnc && spouseAncRoot
              ? spouseAncRoot.hiddenAncestorCount
              : 0,
          hasAncestors:
            isSpouseRootWithAnc && spouseAncRoot
              ? spouseAncRoot.hasAncestors
              : false,
          isAncestorsCollapsed:
            isSpouseRootWithAnc && spouseAncRoot
              ? spouseAncRoot.isCollapsed
              : false,
        });

        const leftId =
          slot.spouseLocalX < 0 ? slot.spouseInstanceId : unit.primaryInstanceId;
        const rightId =
          slot.spouseLocalX < 0 ? unit.primaryInstanceId : slot.spouseInstanceId;

        rawMarriages.push({
          id: `m_desc_${slot.union.id}_${unit.primaryInstanceId}`,
          union: slot.union,
          leftInstanceId: leftId,
          rightInstanceId: rightId,
          isArch: slot.isArch,
          archLevel: slot.archLevel,
        });
      }

      // Emit children & collect branch connector
      const childEdges: ChildConnectorEdge[] = [];
      for (const childUnit of slot.children) {
        const childWorldX = worldX + childUnit.offsetX;
        emitDescUnit(childUnit, childWorldX);
        childEdges.push({
          childInstanceId: childUnit.primaryInstanceId,
          childPersonId: childUnit.primaryPersonId,
          relation: unionChildRelation(slot.union, childUnit.primaryPersonId),
          targetX: childWorldX,
          targetTopY: (unit.depth + 1) * ROW - H / 2,
        });
      }

      if (childEdges.length > 0 || slot.hiddenDescendantCount > 0) {
        // Origin for stem:
        // - If direct horizontal marriage bar: (worldX + slot.anchorLocalX, worldY)
        // - If arch marriage (3rd+ spouse) or single parent: bottom center of the spouse/primary card!
        const originX = worldX + slot.anchorLocalX;
        const originY =
          slot.spouseLocalX !== undefined && !slot.isArch
            ? worldY
            : worldY + H / 2;

        rawBranches.push({
          id: `b_desc_${slot.union.id}_${unit.primaryInstanceId}`,
          union: slot.union,
          originX,
          originY,
          parentGeneration: unit.depth,
          children: childEdges,
          hiddenDescendantCount: slot.hiddenDescendantCount,
          isCollapsed: slot.isCollapsed,
        });
      }
    }
  };

  emitDescUnit(descRoot, 0);

  // Optional: Emit Focus Siblings at Gen 0 (strictly left of focus couple cluster!)
  // Only include siblings who belong to at least one displayed parent union of focus so every card is connected.
  const focusSiblingNodes: PositionedPersonNode[] = [];
  if (includeFocusSiblings && focusAncRoot.parentBlocks.length > 0) {
    const displayedParentUnions = focusAncRoot.parentBlocks.map((b) => b.union);
    const siblings = graph
      .getSiblings(options.focusPersonId, {
        includeHalf: true,
        includeStep: false,
        lineageMode,
      })
      .filter((sib) =>
        displayedParentUnions.some((u) =>
          u.children.some((c) => c.personId === sib.person.id),
        ),
      );
    // Place siblings left of descRoot.cardsMinX so they never overlap focus or focus's left spouse
    let cursorRightX = descRoot.cardsMinX - SUB_GAP;
    // Reverse so oldest sibling is leftmost
    for (let i = siblings.length - 1; i >= 0; i--) {
      const sib = siblings[i]!;
      const sibCenterX = cursorRightX - W / 2;
      const sibNode: PositionedPersonNode = {
        instanceId: `sib_${sib.person.id}`,
        personId: sib.person.id,
        person: sib.person,
        x: sibCenterX,
        y: 0,
        width: W,
        height: H,
        generation: 0,
        isFocus: false,
        isSpouseOfFocus: false,
        isFocusSibling: true,
        isDuplicate: false,
        side: 'sibling',
        hiddenAncestorCount: 0,
        hasAncestors: false,
        isAncestorsCollapsed: false,
      };
      addNode(sibNode);
      focusSiblingNodes.push(sibNode);
      cursorRightX = sibCenterX - W / 2 - SIB_GAP;
    }
  }

  // Emit Upward Ancestor Tree Nodes + Connectors
  const emitAncParents = (
    unit: AncUnit,
    childWorldX: number,
    childCardInstanceId: string,
    upperShiftX = 0,
  ): void => {
    const childNode = nodesByInstanceId.get(childCardInstanceId)!;

    for (const block of unit.parentBlocks) {
      const blockWorldOriginX = childWorldX + upperShiftX + block.blockOffsetX;
      const parentGen = -(unit.upDepth + 1);
      const parentWorldY = parentGen * ROW;

      const emittedParentIds: string[] = [];
      const emittedParentXs: number[] = [];

      for (let i = 0; i < block.parentUnits.length; i++) {
        const pu = block.parentUnits[i]!;
        const puWorldX = blockWorldOriginX + block.parentOffsets[i]!;
        const person = graph.getPerson(pu.personId)!;

        addNode({
          instanceId: pu.instanceId,
          personId: pu.personId,
          person,
          x: puWorldX,
          y: parentWorldY,
          width: W,
          height: H,
          generation: parentGen,
          isFocus: false,
          isSpouseOfFocus: false,
          isFocusSibling: false,
          isDuplicate: pu.isDuplicate,
          side: 'ancestor',
          hiddenAncestorCount: pu.hiddenAncestorCount,
          hasAncestors: pu.hasAncestors,
          isAncestorsCollapsed: pu.isCollapsed,
        });

        emittedParentIds.push(pu.instanceId);
        emittedParentXs.push(puWorldX);

        // Recurse upward for this parent's own parents
        emitAncParents(pu, puWorldX, pu.instanceId, 0);
      }

      // Connect the two parents with a marriage bar if 2+ parents in this union
      if (emittedParentIds.length >= 2) {
        rawMarriages.push({
          id: `m_anc_${block.union.id}_${childCardInstanceId}`,
          union: block.union,
          leftInstanceId: emittedParentIds[0]!,
          rightInstanceId: emittedParentIds[1]!,
          isArch: false,
          archLevel: 0,
        });
      }

      const originX =
        emittedParentXs.length >= 2
          ? (emittedParentXs[0]! + emittedParentXs[1]!) / 2
          : (emittedParentXs[0] ?? childWorldX);
      const originY =
        emittedParentXs.length >= 2 ? parentWorldY : parentWorldY + H / 2;

      const branchChildren: ChildConnectorEdge[] = [
        {
          childInstanceId: childNode.instanceId,
          childPersonId: childNode.personId,
          relation: unionChildRelation(block.union, childNode.personId),
          targetX: childNode.x,
          targetTopY: childNode.y - H / 2,
        },
      ];

      // If focus siblings belong to this same parent union (depth 0 -> -1), attach them to the same sibling bus!
      if (unit.upDepth === 0 && childCardInstanceId === descRoot.primaryInstanceId) {
        for (const sibNode of focusSiblingNodes) {
          if (block.union.children.some((c) => c.personId === sibNode.personId)) {
            branchChildren.push({
              childInstanceId: sibNode.instanceId,
              childPersonId: sibNode.personId,
              relation: unionChildRelation(block.union, sibNode.personId),
              targetX: sibNode.x,
              targetTopY: sibNode.y - H / 2,
            });
          }
        }
      }

      branchChildren.sort((a, b) => a.targetX - b.targetX);

      rawBranches.push({
        id: `b_anc_${block.union.id}_${childCardInstanceId}`,
        union: block.union,
        originX,
        originY,
        parentGeneration: parentGen,
        children: branchChildren,
        hiddenDescendantCount: 0,
        isCollapsed: false,
      });
    }
  };

  emitAncParents(focusAncRoot, 0, descRoot.primaryInstanceId, 0);

  if (spouseAncRoot && spouseAncSlot?.spouseInstanceId && spouseAncSlot.spouseLocalX !== undefined) {
    const spouseCard = nodesByInstanceId.get(spouseAncSlot.spouseInstanceId);
    if (spouseCard) {
      const upperDelta = spouseAncShiftX - spouseCard.x;
      emitAncParents(spouseAncRoot, spouseCard.x, spouseCard.instanceId, upperDelta);
    }
  }

  // --------------------------------------------------------------------------
  // 4. Mark Any Person Appearing More Than Once (Pedigree Collapse / Cross-side)
  // --------------------------------------------------------------------------
  const instanceIdsByPersonId = new Map<PersonId, string[]>();
  for (const node of nodes) {
    const list = instanceIdsByPersonId.get(node.personId);
    if (list) list.push(node.instanceId);
    else instanceIdsByPersonId.set(node.personId, [node.instanceId]);
  }

  const duplicateLinks: DuplicateLink[] = [];
  for (const [personId, instanceIds] of instanceIdsByPersonId.entries()) {
    if (instanceIds.length > 1) {
      duplicateLinks.push({ personId, instanceIds });
      // Mark secondary instances as duplicate
      for (let i = 1; i < instanceIds.length; i++) {
        const n = nodesByInstanceId.get(instanceIds[i]!);
        if (n) n.isDuplicate = true;
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. Build Marriage Connectors (Direct Horizontal Bars & Top Arches)
  // --------------------------------------------------------------------------
  const marriageConnectors: MarriageConnector[] = [];

  for (const rm of rawMarriages) {
    const leftNode = nodesByInstanceId.get(rm.leftInstanceId);
    const rightNode = nodesByInstanceId.get(rm.rightInstanceId);
    if (!leftNode || !rightNode) continue;

    if (!rm.isArch) {
      const x1 = leftNode.x + W / 2;
      const x2 = rightNode.x - W / 2;
      const y = leftNode.y;
      const badgeX = (x1 + x2) / 2;
      const badgeY = y;

      marriageConnectors.push({
        id: rm.id,
        unionId: rm.union.id,
        union: rm.union,
        leftInstanceId: rm.leftInstanceId,
        rightInstanceId: rm.rightInstanceId,
        badgeX,
        badgeY,
        isArch: false,
        svgPath: `M ${x1.toFixed(1)} ${y.toFixed(1)} L ${x2.toFixed(1)} ${y.toFixed(1)}`,
        segments: [
          {
            x1,
            y1: y,
            x2,
            y2: y,
            kind: 'marriage',
            ownerIds: [rm.leftInstanceId, rm.rightInstanceId],
          },
        ],
      });
    } else {
      // 3rd+ spouse: clean top arch in the upper gutter margin, strictly above intermediate cards
      const startX = leftNode.x + W / 3;
      const startY = leftNode.y - H / 2;
      const endX = rightNode.x - W / 4;
      const endY = rightNode.y - H / 2;
      const archY = startY - (18 + (rm.archLevel - 1) * 12);

      const pts = [
        { x: startX, y: startY },
        { x: startX, y: archY },
        { x: endX, y: archY },
        { x: endX, y: endY },
      ];

      marriageConnectors.push({
        id: rm.id,
        unionId: rm.union.id,
        union: rm.union,
        leftInstanceId: rm.leftInstanceId,
        rightInstanceId: rm.rightInstanceId,
        badgeX: (startX + endX) / 2,
        badgeY: archY,
        isArch: true,
        svgPath: buildOrthogonalPath(pts, 9),
        segments: [
          {
            x1: startX,
            y1: startY,
            x2: startX,
            y2: archY,
            kind: 'marriage_arch',
            ownerIds: [rm.leftInstanceId, rm.rightInstanceId],
          },
          {
            x1: startX,
            y1: archY,
            x2: endX,
            y2: archY,
            kind: 'marriage_arch',
            ownerIds: [rm.leftInstanceId, rm.rightInstanceId],
          },
          {
            x1: endX,
            y1: archY,
            x2: endX,
            y2: endY,
            kind: 'marriage_arch',
            ownerIds: [rm.leftInstanceId, rm.rightInstanceId],
          },
        ],
      });
    }
  }

  // --------------------------------------------------------------------------
  // 6. Allocate Non-Overlapping Bus Tracks per Generation Gutter & Route Branches
  // --------------------------------------------------------------------------
  const branchesByGutter = new Map<number, RawBranch[]>();
  for (const rb of rawBranches) {
    const list = branchesByGutter.get(rb.parentGeneration);
    if (list) list.push(rb);
    else branchesByGutter.set(rb.parentGeneration, [rb]);
  }

  const branchConnectors: FamilyBranchConnector[] = [];

  for (const [parentGen, gutterBranches] of branchesByGutter.entries()) {
    const gutterTopY = parentGen * ROW + H / 2;
    const gutterBottomY = (parentGen + 1) * ROW - H / 2;
    const usableTop = gutterTopY + 24;
    const usableBottom = gutterBottomY - 30; // Leave headroom for any 3rd-spouse top arch below

    const intervals: GutterBusItem[] = gutterBranches.map((rb) => {
      const childXs = rb.children.map((c) => c.targetX);
      const xs = [rb.originX, ...childXs];
      return {
        id: rb.id,
        originX: rb.originX,
        childXs,
        xMin: Math.min(...xs),
        xMax: Math.max(...xs),
      };
    });

    const tracks = allocateBusTracks(intervals);

    for (const rb of gutterBranches) {
      const trackInfo = tracks.get(rb.id) ?? { trackIndex: 0, trackCount: 1 };
      const railY =
        trackInfo.trackCount === 1
          ? (usableTop + usableBottom) / 2
          : usableTop +
            (trackInfo.trackIndex / (trackInfo.trackCount - 1)) *
              Math.max(12, usableBottom - usableTop);

      const segments: LineSegment[] = [];
      const childPaths: FamilyBranchConnector['childPaths'] = [];

      if (rb.children.length === 0) {
        // Collapsed / depth-limited stub with +N button
        const stubY = gutterTopY + 28;
        const busSvgPath = `M ${rb.originX.toFixed(1)} ${rb.originY.toFixed(1)} L ${rb.originX.toFixed(1)} ${stubY.toFixed(1)}`;
        segments.push({
          x1: rb.originX,
          y1: rb.originY,
          x2: rb.originX,
          y2: stubY,
          kind: 'stem',
          ownerIds: [rb.id],
        });
        branchConnectors.push({
          id: rb.id,
          unionId: rb.union.id,
          union: rb.union,
          originX: rb.originX,
          originY: rb.originY,
          railY: stubY,
          parentGeneration: rb.parentGeneration,
          children: [],
          hiddenDescendantCount: rb.hiddenDescendantCount,
          isCollapsed: rb.isCollapsed,
          busSvgPath,
          childPaths,
          segments,
        });
        continue;
      }

      // Vertical stem from union origin down to railY
      segments.push({
        x1: rb.originX,
        y1: rb.originY,
        x2: rb.originX,
        y2: railY,
        kind: 'stem',
        ownerIds: [rb.id],
      });

      const minChildX = Math.min(...rb.children.map((c) => c.targetX));
      const maxChildX = Math.max(...rb.children.map((c) => c.targetX));
      const busMinX = Math.min(rb.originX, minChildX);
      const busMaxX = Math.max(rb.originX, maxChildX);

      // Single-child direct or elbow path vs multi-child horizontal bus + drops
      let busSvgPath = `M ${rb.originX.toFixed(1)} ${rb.originY.toFixed(1)} L ${rb.originX.toFixed(1)} ${railY.toFixed(1)}`;
      if (busMaxX - busMinX > 0.5) {
        segments.push({
          x1: busMinX,
          y1: railY,
          x2: busMaxX,
          y2: railY,
          kind: 'bus',
          ownerIds: [rb.id],
        });
      }

      for (const child of rb.children) {
        const pts =
          Math.abs(child.targetX - rb.originX) < 0.5
            ? [
                { x: rb.originX, y: railY },
                { x: child.targetX, y: child.targetTopY },
              ]
            : [
                { x: rb.originX, y: railY },
                { x: child.targetX, y: railY },
                { x: child.targetX, y: child.targetTopY },
              ];

        childPaths.push({
          childInstanceId: child.childInstanceId,
          childPersonId: child.childPersonId,
          relation: child.relation,
          svgPath: buildOrthogonalPath(pts, 10),
        });

        segments.push({
          x1: child.targetX,
          y1: railY,
          x2: child.targetX,
          y2: child.targetTopY,
          kind: 'drop',
          ownerIds: [rb.id, child.childInstanceId],
        });
      }

      // If single child aligned cleanly, let childPath draw from railY cleanly while busSvgPath draws the stem
      if (rb.children.length === 1 && Math.abs(rb.children[0]!.targetX - rb.originX) < 0.5) {
        busSvgPath = `M ${rb.originX.toFixed(1)} ${rb.originY.toFixed(1)} L ${rb.originX.toFixed(1)} ${railY.toFixed(1)}`;
      }

      branchConnectors.push({
        id: rb.id,
        unionId: rb.union.id,
        union: rb.union,
        originX: rb.originX,
        originY: rb.originY,
        railY,
        parentGeneration: rb.parentGeneration,
        children: rb.children,
        hiddenDescendantCount: rb.hiddenDescendantCount,
        isCollapsed: rb.isCollapsed,
        busSvgPath,
        childPaths,
        segments,
      });
    }
  }

  // --------------------------------------------------------------------------
  // 7. Compute Overall Bounding Box & Generation List
  // --------------------------------------------------------------------------
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const genSet = new Set<number>();

  for (const node of nodes) {
    genSet.add(node.generation);
    minX = Math.min(minX, node.x - node.width / 2);
    maxX = Math.max(maxX, node.x + node.width / 2);
    minY = Math.min(minY, node.y - node.height / 2);
    maxY = Math.max(maxY, node.y + node.height / 2);
  }

  for (const mc of marriageConnectors) {
    if (mc.isArch) {
      minY = Math.min(minY, mc.badgeY - 16);
    }
  }

  if (!Number.isFinite(minX)) {
    minX = -W / 2;
    maxX = W / 2;
    minY = -H / 2;
    maxY = H / 2;
  }

  const padding = Math.max(64, GEN_GAP / 2);
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  return {
    metrics,
    nodes,
    nodesByInstanceId,
    instanceIdsByPersonId,
    marriageConnectors,
    branchConnectors,
    duplicateLinks,
    generations: [...genSet].sort((a, b) => a - b),
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    },
  };
}
