import { memo } from 'react';
import { formatLifespan, type Person } from '../core/index.js';
import type { PositionedPersonNode } from '../layout/types.js';

export function getInitials(person: Person): string {
  const given = person.name.given?.trim();
  const surname = person.name.surname?.trim();
  if (given && surname) {
    return `${given[0] ?? ''}${surname[0] ?? ''}`.toUpperCase();
  }
  const parts = person.name.display.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}

export interface PersonCardProps {
  node: PositionedPersonNode;
  photoUrl?: string;
  relationshipLabel?: string;
  isSelected: boolean;
  isPathHighlighted: boolean;
  isDimmed: boolean;
  onSelect: (personId: string, instanceId: string) => void;
  onFocus: (personId: string) => void;
  onHoverPerson: (personId: string | null) => void;
  onToggleAncestors: (instanceId: string) => void;
}

export const PersonCard = memo(function PersonCard({
  node,
  photoUrl,
  relationshipLabel,
  isSelected,
  isPathHighlighted,
  isDimmed,
  onSelect,
  onFocus,
  onHoverPerson,
  onToggleAncestors,
}: PersonCardProps) {
  const { person } = node;
  const lifespan = formatLifespan(person.birth, person.death);
  const birthPlace = person.birth?.place?.split(',')[0]?.trim();
  const dateLine = [lifespan || 'Dates unknown', birthPlace].filter(Boolean).join(' · ');

  const cardClasses = [
    'person-card',
    node.isFocus ? 'is-focus' : '',
    isSelected ? 'is-selected' : '',
    isPathHighlighted ? 'is-path-highlighted' : '',
    isDimmed ? 'is-dimmed' : '',
    node.isDuplicate ? 'is-duplicate' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const left = node.x - node.width / 2;
  const top = node.y - node.height / 2;

  const badgeText = node.isFocus ? 'Focus' : relationshipLabel;
  const isSpecialBadge =
    badgeText !== undefined &&
    (badgeText.includes('Double') || badgeText === 'Spouse / Partner');

  const showAncestorControl =
    node.hasAncestors &&
    !node.isDuplicate &&
    (node.hiddenAncestorCount > 0 || node.side === 'ancestor' || node.isFocus);

  return (
    <>
      <div
        className={cardClasses}
        data-person-id={node.personId}
        data-instance-id={node.instanceId}
        style={{
          width: node.width,
          height: node.height,
          transform: `translate3d(${left}px, ${top}px, 0)`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.personId, node.instanceId);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onFocus(node.personId);
        }}
        onMouseEnter={() => onHoverPerson(node.personId)}
        onMouseLeave={() => onHoverPerson(null)}
        title={`${person.name.display}${lifespan ? ` (${lifespan})` : ''} — Click to inspect, double-click to focus`}
      >
        <div className={`person-avatar sex-${person.sex}`}>
          {photoUrl ? (
            <img src={photoUrl} alt={person.name.display} draggable={false} />
          ) : (
            <span>{getInitials(person)}</span>
          )}
        </div>

        <div className="person-body">
          <div className="person-name-row">
            <span className="person-name">{person.name.display}</span>
            {node.isDuplicate && (
              <span
                className="dup-badge"
                title="Pedigree collapse: this ancestor appears in multiple branches"
              >
                ∞
              </span>
            )}
          </div>

          <div className="person-dates">{dateLine}</div>

          <div className="person-badges-row">
            {badgeText && (
              <span
                className={`rel-pill ${
                  node.isFocus
                    ? 'is-focus-pill'
                    : isSpecialBadge
                      ? 'is-gold-pill'
                      : ''
                }`}
              >
                {badgeText}
              </span>
            )}
          </div>
        </div>
      </div>

      {showAncestorControl && (
        <button
          type="button"
          className={`branch-toggle-btn ${node.hiddenAncestorCount > 0 ? 'is-collapsed' : 'is-subtle-collapse'}`}
          style={
            node.hiddenAncestorCount > 0
              ? { left: node.x, top: top - 14 }
              : { left: node.x + node.width / 2 - 18, top: top }
          }
          title={
            node.hiddenAncestorCount > 0
              ? `Expand ${node.hiddenAncestorCount} hidden ancestor(s)`
              : 'Collapse ancestors above this person'
          }
          onClick={(e) => {
            e.stopPropagation();
            onToggleAncestors(node.instanceId);
          }}
        >
          {node.hiddenAncestorCount > 0 ? `+${node.hiddenAncestorCount} ↑` : '−'}
        </button>
      )}
    </>
  );
});
