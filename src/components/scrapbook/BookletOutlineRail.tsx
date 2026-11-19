import { useMemo, useState } from 'react';
import type { FamilyGraph, PersonId } from '../../core/index.js';
import type {
  BookletPage,
  ScrapbookPersonEntry,
  ScrapbookStoreApi,
} from '../../scrapbook/index.js';
import { DownloadIcon, TrashIcon, TreeIcon } from '../Icons.js';
import { getInitials } from '../PersonCard.js';

export interface BookletOutlineRailProps {
  graph: FamilyGraph;
  store: ScrapbookStoreApi;
  activePages: BookletPage[];
  activeSpreadPersonIds: Set<PersonId>;
  isCoverActive: boolean;
  onJumpToCover: () => void;
  onJumpToPerson: (personId: PersonId) => void;
  onExportHeirloomZip: () => void;
}

const ROLE_SHORT: Record<ScrapbookPersonEntry['role'], string> = {
  focus: 'Focus',
  spouse: 'Spouse',
  child: 'Child',
  sibling: 'Sibling',
  parent: 'Parent',
  grandparent: 'Grandparent',
  custom: 'Added',
};

export function BookletOutlineRail({
  graph,
  store,
  activePages,
  activeSpreadPersonIds,
  isCoverActive,
  onJumpToCover,
  onJumpToPerson,
  onExportHeirloomZip,
}: BookletOutlineRailProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState<PersonId | null>(null);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');

  const { doc, assetUrls, localSaveStatus } = store;

  const existingIds = useMemo(
    () => new Set(doc.entries.map((e) => e.personId)),
    [doc.entries],
  );

  const addableRelatives = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    return graph
      .getAllPersons()
      .filter((p) => !existingIds.has(p.id))
      .filter((p) => !q || p.name.display.toLowerCase().includes(q))
      .slice(0, 12);
  }, [addQuery, existingIds, graph]);

  const includedCount = doc.entries.filter((e) => e.included).length;

  const saveLabel =
    localSaveStatus === 'saving'
      ? 'Saving draft locally…'
      : localSaveStatus === 'saved'
        ? 'Saved locally in browser'
        : localSaveStatus === 'quota_exceeded'
          ? 'Browser storage full — export .zip'
          : localSaveStatus === 'unavailable'
            ? 'Local auto-save unavailable'
            : 'Ready (local IndexedDB)';

  if (collapsed) {
    return (
      <aside className="sb-rail is-collapsed" aria-label="Booklet outline collapsed">
        <div className="sb-rail-header">
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 30, height: 30 }}
            onClick={() => setCollapsed(false)}
            title="Expand Booklet Outline"
            aria-label="Expand Booklet Outline"
          >
            »
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="sb-rail" aria-label="Booklet outline">
      <div className="sb-rail-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <input
            type="text"
            className="sb-rail-title-input"
            value={doc.title}
            aria-label="Scrapbook album title"
            onChange={(e) => store.setTitle(e.target.value, doc.subtitle)}
          />
          <div className="sb-rail-meta">
            {includedCount} relatives · {activePages.length} pages
          </div>
        </div>
        <button
          type="button"
          className="btn btn-icon"
          style={{ width: 28, height: 28, flexShrink: 0 }}
          onClick={() => setCollapsed(true)}
          title="Collapse outline"
          aria-label="Collapse Booklet Outline"
        >
          «
        </button>
      </div>

      <div className="sb-rail-body">
        <div className="sb-outline-group-title">Opening</div>
        <div className={`sb-outline-item ${isCoverActive ? 'is-active' : ''}`}>
          <div className="sb-outline-row">
            <div
              className="sb-outline-avatar"
              style={{
                background: 'var(--accent-sage-soft)',
                color: 'var(--accent-sage)',
              }}
            >
              <TreeIcon size={13} />
            </div>
            <button
              type="button"
              className="sb-outline-main"
              onClick={onJumpToCover}
            >
              <span className="sb-outline-name">Cover &amp; Family Tree</span>
              <span className="sb-outline-sub">Page 1 · Table of contents</span>
            </button>
          </div>
        </div>

        <div className="sb-outline-group-title">
          Family Chapters ({doc.entries.length})
        </div>

        {doc.entries.map((entry, idx) => {
          const person = graph.getPerson(entry.personId);
          if (!person) return null;
          const isActive = activeSpreadPersonIds.has(entry.personId);
          const isExpanded = expandedPersonId === entry.personId;
          const portraitId =
            entry.portraitAssetId ?? doc.personPortraitAssetIds?.[entry.personId];
          const portraitUrl = portraitId ? assetUrls.get(portraitId) : undefined;
          const photoCount =
            (portraitId ? 1 : 0) +
            (entry.groupPolaroid ? 1 : 0) +
            entry.extraPhotos.length +
            entry.places.filter((p) => p.assetId).length;
          const docCount = entry.certificates.length;
          const hasCustomBio = Boolean(entry.biographyText?.trim());

          return (
            <div
              key={entry.personId}
              className={`sb-outline-item ${isActive ? 'is-active' : ''} ${
                !entry.included ? 'is-excluded' : ''
              }`}
            >
              <div className="sb-outline-row">
                <input
                  type="checkbox"
                  className="sb-outline-check"
                  checked={entry.included}
                  aria-label={`Include ${person.name.display}`}
                  onChange={(e) =>
                    store.togglePersonIncluded(entry.personId, e.target.checked)
                  }
                />

                <div className={`sb-outline-avatar sex-${person.sex}`}>
                  {portraitUrl ? (
                    <img src={portraitUrl} alt={person.name.display} />
                  ) : (
                    <span>{getInitials(person)}</span>
                  )}
                </div>

                <button
                  type="button"
                  className="sb-outline-main"
                  onClick={() => onJumpToPerson(entry.personId)}
                >
                  <span className="sb-outline-name">{person.name.display}</span>
                  <span className="sb-outline-sub">
                    <span>{ROLE_SHORT[entry.role]}</span>
                    {photoCount > 0 && (
                      <span className="sb-stat-dot" title="Photos">
                        📷 {photoCount}
                      </span>
                    )}
                    {docCount > 0 && (
                      <span className="sb-stat-dot" title="Certificates">
                        📄 {docCount}
                      </span>
                    )}
                    {hasCustomBio && (
                      <span className="sb-stat-dot" title="Custom story">
                        ✎
                      </span>
                    )}
                  </span>
                </button>

                <div className="sb-outline-mini-actions">
                  <button
                    type="button"
                    className="sb-mini-icon-btn"
                    disabled={idx === 0}
                    title="Move chapter up"
                    onClick={() => store.reorderEntries(idx, idx - 1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="sb-mini-icon-btn"
                    disabled={idx === doc.entries.length - 1}
                    title="Move chapter down"
                    onClick={() => store.reorderEntries(idx, idx + 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="sb-mini-icon-btn"
                    title="Page options"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedPersonId(isExpanded ? null : entry.personId)
                    }
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="sb-outline-drawer">
                  <div className="sb-page-toggle-grid">
                    <button
                      type="button"
                      className={`sb-chip-toggle is-gold ${
                        entry.compactMode ? 'is-on' : ''
                      }`}
                      onClick={() =>
                        store.togglePersonCompactMode(
                          entry.personId,
                          !entry.compactMode,
                        )
                      }
                    >
                      Compact 1-Page
                    </button>
                    {!entry.compactMode && (
                      <>
                        <button
                          type="button"
                          className={`sb-chip-toggle ${
                            entry.pages.profile ? 'is-on' : ''
                          }`}
                          onClick={() =>
                            store.togglePersonPage(
                              entry.personId,
                              'profile',
                              !entry.pages.profile,
                            )
                          }
                        >
                          Profile
                        </button>
                        <button
                          type="button"
                          className={`sb-chip-toggle ${
                            entry.pages.paperwork ? 'is-on' : ''
                          }`}
                          onClick={() =>
                            store.togglePersonPage(
                              entry.personId,
                              'paperwork',
                              !entry.pages.paperwork,
                            )
                          }
                        >
                          Paperwork
                        </button>
                        <button
                          type="button"
                          className={`sb-chip-toggle ${
                            entry.pages.storyPlaces ? 'is-on' : ''
                          }`}
                          onClick={() =>
                            store.togglePersonPage(
                              entry.personId,
                              'storyPlaces',
                              !entry.pages.storyPlaces,
                            )
                          }
                        >
                          Story &amp; Places
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sb-rail-footer">
        {addPickerOpen ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              type="text"
              className="field-input"
              style={{ height: 30, fontSize: 12 }}
              placeholder="Search relative to add…"
              value={addQuery}
              autoFocus
              onChange={(e) => setAddQuery(e.target.value)}
            />
            <div
              style={{
                maxHeight: 130,
                overflowY: 'auto',
                border: '1px solid var(--border-hairline)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
              }}
            >
              {addableRelatives.length === 0 ? (
                <div style={{ padding: 8, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  No additional relatives found
                </div>
              ) : (
                addableRelatives.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="menu-action"
                    style={{ fontSize: 12, padding: '6px 8px' }}
                    onClick={() => {
                      store.addCustomPerson(p.id);
                      setAddQuery('');
                      setAddPickerOpen(false);
                    }}
                  >
                    + {p.name.display}
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              className="btn"
              style={{ height: 28, fontSize: 11.5 }}
              onClick={() => setAddPickerOpen(false)}
            >
              Done
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn"
            style={{ width: '100%', height: 30, fontSize: 12 }}
            onClick={() => setAddPickerOpen(true)}
          >
            + Include another relative
          </button>
        )}

        <div
          className={`sb-save-status ${
            localSaveStatus === 'saving'
              ? 'is-saving'
              : localSaveStatus === 'quota_exceeded' ||
                  localSaveStatus === 'unavailable'
                ? 'is-warn'
                : ''
          }`}
        >
          <span>
            <span className="sb-save-dot" />
            {saveLabel}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, height: 30, fontSize: 11.5 }}
            onClick={onExportHeirloomZip}
          >
            <DownloadIcon size={12} />
            Export .zip
          </button>
          <button
            type="button"
            className="btn"
            style={{ height: 30, fontSize: 11.5, padding: '0 10px' }}
            title="Clear local browser IndexedDB draft"
            onClick={() => void store.clearLocalDraft()}
          >
            <TrashIcon size={12} />
            Clear
          </button>
        </div>
      </div>
    </aside>
  );
}
