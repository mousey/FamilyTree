import { useMemo } from 'react';
import {
  formatLifespan,
  type FamilyGraph,
  type Person,
  type PersonId,
} from '../../core/index.js';
import type { ScrapbookPersonEntry } from '../../scrapbook/index.js';
import { getInitials } from '../PersonCard.js';

export interface CoverTreePageProps {
  graph: FamilyGraph;
  title: string;
  subtitle?: string;
  focusPersonId: PersonId;
  entries: ScrapbookPersonEntry[];
  assetUrls: ReadonlyMap<string, string>;
  personPortraitAssetIds?: Record<PersonId, string>;
  mode: 'edit' | 'preview' | 'print';
  onChangeTitle?: (title: string, subtitle?: string) => void;
  onJumpToPerson?: (personId: PersonId) => void;
}

interface TreeNodePos {
  person: Person;
  role: ScrapbookPersonEntry['role'];
  x: number;
  y: number;
  r: number;
}

const SVG_W = 540;
const SVG_H = 540;

function sexColors(sex: Person['sex']): { fill: string; ink: string } {
  if (sex === 'male') return { fill: '#e6ecf2', ink: '#354e68' };
  if (sex === 'female') return { fill: '#f3e6e6', ink: '#88494b' };
  return { fill: '#ece8f2', ink: '#5a4f70' };
}

function truncateName(name: string, max = 18): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1).trimEnd()}…`;
}

export function CoverTreePage({
  graph,
  title,
  subtitle,
  focusPersonId,
  entries,
  assetUrls,
  personPortraitAssetIds,
  mode,
  onChangeTitle,
  onJumpToPerson,
}: CoverTreePageProps) {
  const isEdit = mode === 'edit';

  const { nodes, edges } = useMemo(() => {
    const included = entries.filter((e) => e.included && graph.getPerson(e.personId));
    const grandparents = included.filter((e) => e.role === 'grandparent');
    const parents = included.filter((e) => e.role === 'parent');
    const focusEntry = included.find((e) => e.personId === focusPersonId) ?? included[0];
    const spouses = included.filter((e) => e.role === 'spouse');
    const siblings = included.filter((e) => e.role === 'sibling');
    const children = included.filter((e) => e.role === 'child');
    const customs = included.filter((e) => e.role === 'custom');

    const tiers: Array<{
      items: ScrapbookPersonEntry[];
      y: number;
      r: number;
    }> = [];

    const activeRowSpecs: Array<{ items: ScrapbookPersonEntry[]; r: number }> = [];
    if (grandparents.length > 0) activeRowSpecs.push({ items: grandparents, r: 22 });
    if (parents.length > 0) activeRowSpecs.push({ items: parents, r: 25 });

    // Center tier: siblings on left/right around Focus + Spouse(s)
    const midItems: ScrapbookPersonEntry[] = [];
    const halfSib = Math.floor(siblings.length / 2);
    midItems.push(...siblings.slice(0, halfSib));
    if (focusEntry) midItems.push(focusEntry);
    midItems.push(...spouses);
    midItems.push(...siblings.slice(halfSib));
    if (midItems.length > 0) activeRowSpecs.push({ items: midItems, r: 26 });

    if (children.length > 0) activeRowSpecs.push({ items: children, r: 23 });
    if (customs.length > 0) activeRowSpecs.push({ items: customs, r: 20 });

    const count = activeRowSpecs.length;
    const topY = 46;
    const bottomY = SVG_H - 54;
    const stepY = count > 1 ? (bottomY - topY) / (count - 1) : 0;

    activeRowSpecs.forEach((spec, idx) => {
      tiers.push({
        items: spec.items,
        y: count === 1 ? SVG_H / 2 : topY + idx * stepY,
        r: spec.r,
      });
    });

    const nodeList: TreeNodePos[] = [];
    const byId = new Map<PersonId, TreeNodePos>();

    for (const tier of tiers) {
      const n = tier.items.length;
      const padX = Math.max(46, Math.min(82, SVG_W / (n + 1.4)));
      const usableW = SVG_W - padX * 2;
      const effectiveR = n > 6 ? Math.max(17, tier.r - 4) : tier.r;

      tier.items.forEach((entry, idx) => {
        const person = graph.getPerson(entry.personId);
        if (!person) return;
        const x =
          n === 1
            ? SVG_W / 2
            : padX + (usableW * idx) / Math.max(1, n - 1);
        const pos: TreeNodePos = {
          person,
          role: entry.role,
          x,
          y: tier.y,
          r: entry.personId === focusPersonId ? effectiveR + 4 : effectiveR,
        };
        nodeList.push(pos);
        byId.set(entry.personId, pos);
      });
    }

    const edgeList: Array<{
      id: string;
      d: string;
      kind: 'lineage' | 'marriage';
    }> = [];
    const edgeKeys = new Set<string>();

    const addCurvedLineage = (from: TreeNodePos, to: TreeNodePos) => {
      const key = `L:${from.person.id}->${to.person.id}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      // Start cleanly below the parent's name & lifespan labels so lines never cross text
      const y1 = from.y + from.r + 34;
      const y2 = to.y - to.r - 4;
      const midY = (y1 + y2) / 2;
      edgeList.push({
        id: key,
        d: `M ${from.x} ${y1} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${y2}`,
        kind: 'lineage',
      });
    };

    const addMarriage = (a: TreeNodePos, b: TreeNodePos) => {
      const [lo, hi] = a.x <= b.x ? [a, b] : [b, a];
      const key = `M:${lo.person.id}<->${hi.person.id}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edgeList.push({
        id: key,
        d: `M ${lo.x + lo.r} ${lo.y} L ${hi.x - hi.r} ${hi.y}`,
        kind: 'marriage',
      });
    };

    // Connect parent -> child and partner <-> partner for everyone placed in the constellation
    for (const node of nodeList) {
      for (const parent of graph.getParents(node.person.id)) {
        const parentPos = byId.get(parent.id);
        if (parentPos && parentPos.y < node.y) {
          addCurvedLineage(parentPos, node);
        }
      }
      for (const partner of graph.getPartners(node.person.id)) {
        const partnerPos = byId.get(partner.id);
        if (partnerPos && Math.abs(partnerPos.y - node.y) < 4) {
          addMarriage(node, partnerPos);
        }
      }
    }

    return { nodes: nodeList, edges: edgeList };
  }, [entries, focusPersonId, graph]);

  const portraitUrlFor = (personId: PersonId): string | undefined => {
    const entry = entries.find((e) => e.personId === personId);
    const aid = entry?.portraitAssetId ?? personPortraitAssetIds?.[personId];
    return aid ? assetUrls.get(aid) : undefined;
  };

  return (
    <div className="sb-page-content">
      <div className="sb-cover-header">
        <span className="sb-cover-kicker">Heirloom Family Scrapbook</span>

        {isEdit && onChangeTitle ? (
          <input
            type="text"
            className="sb-cover-title-input"
            value={title}
            aria-label="Album title"
            onChange={(e) => onChangeTitle(e.target.value, subtitle)}
          />
        ) : (
          <h1 className="sb-cover-title">{title}</h1>
        )}

        {isEdit && onChangeTitle ? (
          <input
            type="text"
            className="sb-cover-subtitle-input"
            value={subtitle ?? ''}
            placeholder="Add album subtitle or date span…"
            aria-label="Album subtitle"
            onChange={(e) => onChangeTitle(title, e.target.value)}
          />
        ) : (
          subtitle && <div className="sb-cover-subtitle">{subtitle}</div>
        )}

        <svg className="sb-gold-flourish" viewBox="0 0 180 12" aria-hidden="true">
          <line x1="6" y1="6" x2="76" y2="6" stroke="#b48a42" strokeWidth="1" />
          <polygon points="90,1 96,6 90,11 84,6" fill="#b48a42" />
          <line x1="104" y1="6" x2="174" y2="6" stroke="#b48a42" strokeWidth="1" />
        </svg>
      </div>

      <div className="sb-cover-tree-wrap">
        <svg
          className="sb-cover-tree-svg"
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          role="img"
          aria-label={`Immediate family tree for ${title}`}
        >
          <defs>
            {nodes.map((n) => (
              <clipPath key={`clip-${n.person.id}`} id={`sb-clip-${n.person.id}`}>
                <circle cx={n.x} cy={n.y} r={n.r - 2} />
              </clipPath>
            ))}
          </defs>

          {/* Lineage & Marriage Edges */}
          <g>
            {edges.map((edge) =>
              edge.kind === 'marriage' ? (
                <path
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  stroke="#b48a42"
                  strokeWidth="2.2"
                  strokeDasharray="4 2"
                />
              ) : (
                <path
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  stroke="#9c8d7b"
                  strokeWidth="1.4"
                  opacity="0.82"
                />
              ),
            )}
          </g>

          {/* Medallion Nodes */}
          <g>
            {nodes.map((n) => {
              const isFocus = n.person.id === focusPersonId;
              const colors = sexColors(n.person.sex);
              const photo = portraitUrlFor(n.person.id);
              const lifespan = formatLifespan(n.person.birth, n.person.death);

              return (
                <g
                  key={n.person.id}
                  className={onJumpToPerson && mode !== 'print' ? 'sb-tree-node-btn' : undefined}
                  onClick={() => {
                    if (mode !== 'print' && onJumpToPerson) {
                      onJumpToPerson(n.person.id);
                    }
                  }}
                >
                  {isFocus && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r + 4}
                      fill="none"
                      stroke="#b48a42"
                      strokeWidth="1.4"
                      strokeDasharray="2 2"
                    />
                  )}
                  <circle
                    className="sb-tree-ring"
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={colors.fill}
                    stroke={isFocus ? '#2b5240' : '#a67b35'}
                    strokeWidth={isFocus ? 2.4 : 1.4}
                  />
                  {photo ? (
                    <image
                      href={photo}
                      x={n.x - (n.r - 2)}
                      y={n.y - (n.r - 2)}
                      width={(n.r - 2) * 2}
                      height={(n.r - 2) * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#sb-clip-${n.person.id})`}
                    />
                  ) : (
                    <text
                      x={n.x}
                      y={n.y + 4}
                      textAnchor="middle"
                      fontFamily="Cormorant Garamond, Georgia, serif"
                      fontSize={n.r * 0.72}
                      fontWeight="700"
                      fill={colors.ink}
                    >
                      {getInitials(n.person)}
                    </text>
                  )}

                  <text
                    x={n.x}
                    y={n.y + n.r + 12}
                    textAnchor="middle"
                    fontFamily="Cormorant Garamond, Georgia, serif"
                    fontSize={isFocus ? 11.5 : 10.5}
                    fontWeight="700"
                    fill="#25201a"
                  >
                    {truncateName(n.person.name.given || n.person.name.display, 14)}
                  </text>
                  {n.person.name.surname && (
                    <text
                      x={n.x}
                      y={n.y + n.r + 22}
                      textAnchor="middle"
                      fontFamily="Cormorant Garamond, Georgia, serif"
                      fontSize={isFocus ? 10.5 : 9.8}
                      fontWeight="600"
                      fill="#4a4035"
                    >
                      {truncateName(n.person.name.surname, 14)}
                    </text>
                  )}
                  {lifespan && (
                    <text
                      x={n.x}
                      y={n.y + n.r + (n.person.name.surname ? 31 : 23)}
                      textAnchor="middle"
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      fontSize="8"
                      fill="#7a6f62"
                    >
                      {lifespan}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {mode !== 'print' && (
          <div className="sb-cover-hint">
            Click any family medallion to jump directly to their chapter
          </div>
        )}
      </div>
    </div>
  );
}
