import { memo } from 'react';
import type { ParentChildType, PersonId, Union, UnionId } from '../core/index.js';
import type { TreeLayoutResult } from '../layout/types.js';

export interface UnionConnectorsProps {
  layout: TreeLayoutResult;
  highlightedPersonIds: ReadonlySet<PersonId>;
  hoveredPersonId: PersonId | null;
  onToggleUnionBranch: (unionId: UnionId) => void;
}

function relationClass(relation: ParentChildType): string {
  if (relation === 'adopted' || relation === 'sealed') return 'connector-adopted';
  if (relation === 'step' || relation === 'foster') return 'connector-step';
  return 'connector-bio';
}

function unionBadgeLabel(union: Union): string {
  const year = union.marriage?.date?.start?.year;
  if (union.status === 'divorced') {
    const divYear = union.divorce?.date?.start?.year;
    if (year) return `${year} //`;
    if (divYear) return `// ${divYear}`;
    return '//';
  }
  if (union.type === 'civil_union') {
    return year ? `✦ ${year}` : '✦';
  }
  if (union.type === 'partnership') {
    return year ? `◇ ${year}` : '◇';
  }
  if (union.status === 'widowed') {
    return year ? `${year} †` : '†';
  }
  if (year) return `${year}`;
  return '○';
}

export const UnionConnectors = memo(function UnionConnectors({
  layout,
  highlightedPersonIds,
  hoveredPersonId,
  onToggleUnionBranch,
}: UnionConnectorsProps) {
  const hasHighlight = highlightedPersonIds.size > 0;
  const { bounds } = layout;

  // Build duplicate pedigree-collapse arcs only for the currently hovered or highlighted duplicate person
  const activeDuplicateArcs: Array<{ id: string; d: string }> = [];
  for (const link of layout.duplicateLinks) {
    const shouldShow =
      hoveredPersonId === link.personId || highlightedPersonIds.has(link.personId);
    if (!shouldShow || link.instanceIds.length < 2) continue;

    const first = layout.nodesByInstanceId.get(link.instanceIds[0]!);
    if (!first) continue;
    for (let i = 1; i < link.instanceIds.length; i++) {
      const other = layout.nodesByInstanceId.get(link.instanceIds[i]!);
      if (!other) continue;
      const midX = (first.x + other.x) / 2;
      const arcLift = Math.min(120, Math.abs(other.x - first.x) * 0.22 + 36);
      const ctrlY = Math.min(first.y, other.y) - first.height / 2 - arcLift;
      activeDuplicateArcs.push({
        id: `dup_${link.personId}_${i}`,
        d: `M ${first.x.toFixed(1)} ${(first.y - first.height / 2).toFixed(1)} Q ${midX.toFixed(1)} ${ctrlY.toFixed(1)} ${other.x.toFixed(1)} ${(other.y - other.height / 2).toFixed(1)}`,
      });
    }
  }

  return (
    <>
      <svg
        className="connectors-svg"
        style={{
          left: bounds.minX,
          top: bounds.minY,
          width: bounds.width,
          height: bounds.height,
        }}
        viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      >
        {/* 1. Family Branch Stems & Child Drops */}
        {layout.branchConnectors.map((branch) => {
          const unionPartnerHighlighted = branch.union.partners.some((p) =>
            highlightedPersonIds.has(p.personId),
          );
          const anyChildHighlighted = branch.children.some((c) =>
            highlightedPersonIds.has(c.childPersonId),
          );
          const stemHighlighted = unionPartnerHighlighted && anyChildHighlighted;

          return (
            <g key={branch.id}>
              <path
                d={branch.busSvgPath}
                className={[
                  'connector-path',
                  'connector-bio',
                  stemHighlighted ? 'connector-highlighted' : '',
                  hasHighlight && !stemHighlighted ? 'connector-dimmed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
              {branch.childPaths.map((cp) => {
                const isEdgeHighlighted =
                  unionPartnerHighlighted && highlightedPersonIds.has(cp.childPersonId);
                return (
                  <path
                    key={`${branch.id}_${cp.childInstanceId}`}
                    d={cp.svgPath}
                    className={[
                      'connector-path',
                      relationClass(cp.relation),
                      isEdgeHighlighted ? 'connector-highlighted' : '',
                      hasHighlight && !isEdgeHighlighted ? 'connector-dimmed' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                );
              })}
            </g>
          );
        })}

        {/* 2. Marriage & Partnership Bars / Top Arches */}
        {layout.marriageConnectors.map((mc) => {
          const leftNode = layout.nodesByInstanceId.get(mc.leftInstanceId);
          const rightNode = layout.nodesByInstanceId.get(mc.rightInstanceId);
          const bothHighlighted =
            leftNode !== undefined &&
            rightNode !== undefined &&
            highlightedPersonIds.has(leftNode.personId) &&
            highlightedPersonIds.has(rightNode.personId);

          const isDivorced = mc.union.status === 'divorced';
          return (
            <path
              key={mc.id}
              d={mc.svgPath}
              className={[
                'connector-path',
                isDivorced ? 'connector-marriage-divorced' : 'connector-marriage',
                bothHighlighted ? 'connector-highlighted' : '',
                hasHighlight && !bothHighlighted ? 'connector-dimmed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
          );
        })}

        {/* 3. Pedigree Collapse Hover Arcs */}
        {activeDuplicateArcs.map((arc) => (
          <path key={arc.id} d={arc.d} className="connector-duplicate-arc" />
        ))}
      </svg>

      {/* Union Marriage Year / Status Pills */}
      {layout.marriageConnectors.map((mc) => {
        const label = unionBadgeLabel(mc.union);
        const isDivorced = mc.union.status === 'divorced';
        const isPartnership =
          mc.union.type === 'partnership' || mc.union.type === 'civil_union';
        const tooltip = [
          mc.union.type.replace('_', ' '),
          mc.union.marriage?.date ? `m. ${mc.union.marriage.date.raw}` : null,
          mc.union.marriage?.place ?? null,
          mc.union.divorce?.date ? `div. ${mc.union.divorce.date.raw}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        return (
          <div
            key={`pill_${mc.id}`}
            className={[
              'union-badge-pill',
              isDivorced ? 'is-divorced' : '',
              isPartnership ? 'is-partnership' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              left: mc.badgeX,
              top: mc.badgeY,
            }}
            title={tooltip}
          >
            {label}
          </div>
        );
      })}

      {/* Downward Branch Expand / Collapse Pills (only for descendant-side branches) */}
      {layout.branchConnectors
        .filter((b) => b.parentGeneration >= 0)
        .map((branch) => {
          const isHidden = branch.hiddenDescendantCount > 0;
          const toggleY = isHidden ? branch.railY + 8 : branch.railY;
          return (
            <button
              key={`toggle_${branch.id}`}
              type="button"
              className={`branch-toggle-btn ${isHidden ? 'is-collapsed' : 'is-subtle-collapse'}`}
              style={{
                left: branch.originX,
                top: toggleY,
              }}
              title={
                isHidden
                  ? `Expand ${branch.hiddenDescendantCount} hidden descendant(s)`
                  : 'Collapse descendants of this union'
              }
              onClick={(e) => {
                e.stopPropagation();
                onToggleUnionBranch(branch.unionId);
              }}
            >
              {isHidden ? `+${branch.hiddenDescendantCount} ↓` : '−'}
            </button>
          );
        })}
    </>
  );
});
