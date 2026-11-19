import { useMemo, useState } from 'react';
import {
  describeRelationship,
  type FamilyGraph,
  type LineageMode,
  type PersonId,
} from '../core/index.js';
import { CloseIcon, SparklesIcon } from './Icons.js';

export interface HighlightPathPayload {
  personIds: PersonId[];
  label: string;
  primaryLcaId?: PersonId;
  personAId: PersonId;
  personBId: PersonId;
  maxLcaDepth: number;
}

export interface RelationshipModalProps {
  graph: FamilyGraph;
  initialPersonAId: PersonId;
  initialPersonBId: PersonId;
  lineageMode: LineageMode;
  onClose: () => void;
  onHighlightPath: (payload: HighlightPathPayload) => void;
}

export function RelationshipModal({
  graph,
  initialPersonAId,
  initialPersonBId,
  lineageMode,
  onClose,
  onHighlightPath,
}: RelationshipModalProps) {
  const allPersons = useMemo(
    () =>
      graph
        .getAllPersons()
        .slice()
        .sort((a, b) => a.name.display.localeCompare(b.name.display)),
    [graph],
  );

  const [personAId, setPersonAId] = useState<PersonId>(initialPersonAId);
  const [personBId, setPersonBId] = useState<PersonId>(initialPersonBId);

  const summary = useMemo(() => {
    if (!graph.getPerson(personAId) || !graph.getPerson(personBId)) return null;
    return describeRelationship(graph, personAId, personBId, { lineageMode });
  }, [graph, lineageMode, personAId, personBId]);

  const personA = graph.getPerson(personAId);
  const personB = graph.getPerson(personBId);

  const pathPersonIds = useMemo(() => {
    if (!summary?.shortestPath) return [];
    const ids: PersonId[] = [personAId];
    for (const step of summary.shortestPath) {
      ids.push(step.toPersonId);
    }
    for (const lca of summary.lcas) {
      if (!ids.includes(lca.ancestorId)) ids.push(lca.ancestorId);
    }
    return ids;
  }, [personAId, summary]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Relationship Finder"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">Relationship Finder</h2>
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 30, height: 30 }}
            onClick={onClose}
            aria-label="Close relationship finder"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field-grid">
            <label className="field-label">
              <span>Person A (From)</span>
              <select
                className="field-select"
                value={personAId}
                onChange={(e) => setPersonAId(e.target.value)}
              >
                {allPersons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.display}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-label">
              <span>Person B (Relative)</span>
              <select
                className="field-select"
                value={personBId}
                onChange={(e) => setPersonBId(e.target.value)}
              >
                {allPersons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name.display}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {summary && personA && personB && (
            <div className="relationship-result-card">
              <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
                <strong>{personB.name.display}</strong> is <strong>{personA.name.display}</strong>&apos;s
              </div>
              <div className="relationship-headline">{summary.label}</div>

              {summary.lcas.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  <strong>Lowest Common Ancestor{summary.lcas.length > 1 ? 's' : ''}:</strong>{' '}
                  {summary.lcas.map((l) => l.ancestor.name.display).join(', ')}
                </div>
              )}

              {summary.shortestPath && summary.shortestPath.length > 0 && (
                <div>
                  <div className="drawer-section-title" style={{ marginBottom: 6 }}>
                    Shortest Path ({summary.shortestPath.length} step
                    {summary.shortestPath.length === 1 ? '' : 's'})
                  </div>
                  <div className="path-chips">
                    <span className="path-chip">{personA.name.display}</span>
                    {summary.shortestPath.map((step, idx) => {
                      const target = graph.getPerson(step.toPersonId);
                      return (
                        <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ color: 'var(--ink-muted)', fontSize: 11 }}>
                            —{step.edgeType}→
                          </span>
                          <span className="path-chip">{target?.name.display ?? step.toPersonId}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!summary || pathPersonIds.length < 2}
            onClick={() => {
              if (!summary || !personA || !personB) return;
              const primaryLca = summary.lcas[0];
              const maxLcaDepth = primaryLca
                ? Math.max(primaryLca.depthA, primaryLca.depthB)
                : 3;
              onHighlightPath({
                personIds: pathPersonIds,
                label: `${personB.name.display} → ${summary.label} of ${personA.name.display}`,
                primaryLcaId: primaryLca?.ancestorId,
                personAId,
                personBId,
                maxLcaDepth,
              });
              onClose();
            }}
          >
            <SparklesIcon size={14} />
            Highlight Path on Tree
          </button>
        </div>
      </div>
    </div>
  );
}
