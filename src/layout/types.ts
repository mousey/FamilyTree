import type {
  LineageMode,
  ParentChildType,
  Person,
  PersonId,
  Union,
  UnionId,
} from '../core/index.js';

export type LayoutMode = 'hourglass' | 'ancestors' | 'descendants';

export interface LayoutOptions {
  mode: LayoutMode;
  focusPersonId: PersonId;
  /** Maximum ancestor generations above focus (0..N, default 4) */
  ancestorLevels?: number;
  /** Maximum descendant generations below focus (0..N, default 4) */
  descendantLevels?: number;
  includeSpouses?: boolean;
  includeFocusSiblings?: boolean;
  includeSpouseAncestors?: boolean;
  lineageMode?: LineageMode;
  /** Union IDs whose downward descendants are collapsed by the user */
  collapsedUnionIds?: ReadonlySet<UnionId>;
  /** Instance IDs whose upward ancestors are collapsed by the user */
  collapsedAncestorIds?: ReadonlySet<string>;
}

export interface LayoutMetrics {
  cardWidth: number;
  cardHeight: number;
  spouseGap: number;
  siblingGap: number;
  subtreeGap: number;
  generationGap: number;
  rowStep: number;
}

export const DEFAULT_LAYOUT_METRICS: LayoutMetrics = {
  cardWidth: 240,
  cardHeight: 96,
  spouseGap: 86,
  siblingGap: 30,
  subtreeGap: 52,
  generationGap: 118,
  rowStep: 96 + 118,
};

export interface PositionedPersonNode {
  /** Stable unique ID for this rendered card instance (handles pedigree collapse duplicates) */
  instanceId: string;
  personId: PersonId;
  person: Person;
  /** Center X coordinate */
  x: number;
  /** Center Y coordinate */
  y: number;
  width: number;
  height: number;
  /** Generation relative to focus person (0 = focus, -1 = parents, +1 = children) */
  generation: number;
  isFocus: boolean;
  isSpouseOfFocus: boolean;
  isFocusSibling: boolean;
  /** True when this person already appears elsewhere in the laid-out tree (pedigree collapse) */
  isDuplicate: boolean;
  /** Branch direction in which this node was placed */
  side: 'focus' | 'ancestor' | 'descendant' | 'sibling';
  /** Number of hidden ancestors above this card when collapsed or depth-limited */
  hiddenAncestorCount: number;
  /** Whether this card has expandable/collapsible ancestors */
  hasAncestors: boolean;
  /** Whether ancestors above this card are currently collapsed */
  isAncestorsCollapsed: boolean;
}

export interface LineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: 'marriage' | 'marriage_arch' | 'stem' | 'bus' | 'drop';
  ownerIds: string[];
}

export interface MarriageConnector {
  id: string;
  unionId: UnionId;
  union: Union;
  leftInstanceId: string;
  rightInstanceId: string;
  /** Center point for union badge pill */
  badgeX: number;
  badgeY: number;
  /** Whether routed as an arch over an intermediate spouse (for 3+ marriages) */
  isArch: boolean;
  svgPath: string;
  segments: LineSegment[];
}

export interface ChildConnectorEdge {
  childInstanceId: string;
  childPersonId: PersonId;
  relation: ParentChildType;
  targetX: number;
  targetTopY: number;
}

export interface FamilyBranchConnector {
  id: string;
  unionId: UnionId;
  union: Union;
  /** Origin point of the vertical stem (marriage badge or single parent edge) */
  originX: number;
  originY: number;
  /** Y coordinate of the shared horizontal sibling rail */
  railY: number;
  /** Generation index of the parent side */
  parentGeneration: number;
  /** Child drops connected to this union */
  children: ChildConnectorEdge[];
  /** Hidden descendant count if collapsed or depth-limited */
  hiddenDescendantCount: number;
  isCollapsed: boolean;
  /** SVG path for the stem + sibling bus */
  busSvgPath: string;
  /** Individual child drop SVG paths (styled per biological/adopted/step) */
  childPaths: Array<{
    childInstanceId: string;
    childPersonId: PersonId;
    relation: ParentChildType;
    svgPath: string;
  }>;
  segments: LineSegment[];
}

export interface DuplicateLink {
  personId: PersonId;
  instanceIds: string[];
}

export interface LayoutBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface TreeLayoutResult {
  metrics: LayoutMetrics;
  nodes: PositionedPersonNode[];
  nodesByInstanceId: Map<string, PositionedPersonNode>;
  instanceIdsByPersonId: Map<PersonId, string[]>;
  marriageConnectors: MarriageConnector[];
  branchConnectors: FamilyBranchConnector[];
  duplicateLinks: DuplicateLink[];
  generations: number[];
  bounds: LayoutBounds;
}
