import { useMemo, useRef, useState } from 'react';
import {
  formatGenealogicalDate,
  formatLifespan,
  getEffectiveParentRelation,
  type FamilyGraph,
  type MediaId,
  type PersonId,
} from '../core/index.js';
import { buildPersonTimeline } from '../scrapbook/biography.js';
import {
  BookOpenIcon,
  CameraIcon,
  CloseIcon,
  CrosshairIcon,
  LinkUsersIcon,
} from './Icons.js';
import { getInitials } from './PersonCard.js';

export interface DetailDrawerProps {
  graph: FamilyGraph;
  personId: PersonId;
  focusPersonId: PersonId;
  relationshipLabel?: string;
  photoUrlsByPersonId: ReadonlyMap<PersonId, string>;
  mediaUrlsByMediaId: ReadonlyMap<MediaId, string>;
  onClose: () => void;
  onSelectPerson: (personId: PersonId) => void;
  onSetFocus: (personId: PersonId) => void;
  onOpenInScrapbook: (personId: PersonId) => void;
  onCompareRelationship: (personId: PersonId) => void;
  onAttachPersonPhoto: (personId: PersonId, file: File) => void;
  onAttachMediaFile: (mediaId: MediaId, file: File) => void;
}

export function DetailDrawer({
  graph,
  personId,
  focusPersonId,
  relationshipLabel,
  photoUrlsByPersonId,
  mediaUrlsByMediaId,
  onClose,
  onSelectPerson,
  onSetFocus,
  onOpenInScrapbook,
  onCompareRelationship,
  onAttachPersonPhoto,
  onAttachMediaFile,
}: DetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<'family' | 'timeline' | 'media'>('family');
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const person = graph.getPerson(personId);
  if (!person) return null;

  const lifespan = formatLifespan(person.birth, person.death);
  const photoUrl = photoUrlsByPersonId.get(personId);
  const parentUnions = graph.getUnionsAsChild(personId);
  const partnerUnions = graph.getUnionsAsPartner(personId);
  const siblings = graph.getSiblings(personId, { includeHalf: true, includeStep: true });

  const timeline = useMemo(
    () => buildPersonTimeline(graph, personId),
    [graph, personId],
  );

  const linkedNotes = [
    ...person.notes,
    ...(person.noteIds ?? [])
      .map((nid) => graph.tree.notes[nid]?.text)
      .filter((t): t is string => Boolean(t)),
  ];

  const allCitations = [
    ...person.citations,
    ...(person.birth?.citations ?? []),
    ...(person.death?.citations ?? []),
    ...person.events.flatMap((e) => e.citations ?? []),
  ];
  const uniqueSources = new Map<string, { title: string; pages: Set<string>; repo?: string }>();
  for (const cit of allCitations) {
    const src = graph.tree.sources[cit.sourceId];
    const title = src?.title ?? cit.sourceId;
    const repo = src?.repositoryId ? graph.tree.repositories[src.repositoryId]?.name : undefined;
    const existing = uniqueSources.get(cit.sourceId);
    if (existing) {
      if (cit.page) existing.pages.add(cit.page);
    } else {
      const pages = new Set<string>();
      if (cit.page) pages.add(cit.page);
      uniqueSources.set(cit.sourceId, { title, pages, repo });
    }
  }

  return (
    <aside className="detail-drawer" aria-label={`Details for ${person.name.display}`}>
      <div className="drawer-header">
        <div className="drawer-header-top">
          <div className="drawer-avatar-wrap">
            <div className={`drawer-avatar sex-${person.sex}`}>
              {photoUrl ? (
                <img src={photoUrl} alt={person.name.display} />
              ) : (
                <span>{getInitials(person)}</span>
              )}
            </div>
            <button
              type="button"
              className="drawer-photo-btn"
              title="Attach local portrait photo"
              onClick={() => avatarInputRef.current?.click()}
            >
              <CameraIcon size={12} />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onAttachPersonPhoto(personId, file);
                  e.target.value = '';
                }
              }}
            />
          </div>

          <div className="drawer-title-block">
            <h2 className="drawer-name">{person.name.display}</h2>
            {person.alternateNames && person.alternateNames.length > 0 && (
              <div className="drawer-alt-name">
                Also: {person.alternateNames.map((n) => n.display).join(', ')}
              </div>
            )}
            <div className="drawer-meta-row">
              {lifespan && <span className="rel-pill">{lifespan}</span>}
              {personId === focusPersonId ? (
                <span className="rel-pill is-focus-pill">Tree Focus</span>
              ) : (
                relationshipLabel && (
                  <span className="rel-pill is-gold-pill">{relationshipLabel}</span>
                )
              )}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 30, height: 30 }}
            onClick={onClose}
            aria-label="Close detail drawer"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="drawer-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={personId === focusPersonId}
            style={personId === focusPersonId ? { opacity: 0.5, cursor: 'default' } : undefined}
            onClick={() => onSetFocus(personId)}
          >
            <CrosshairIcon size={14} />
            Set as Tree Focus
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onOpenInScrapbook(personId)}
            title="Curate immediate family Scrapbook booklet around this person"
          >
            <BookOpenIcon size={14} />
            Scrapbook
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onCompareRelationship(personId)}
          >
            <LinkUsersIcon size={14} />
            Relationship
          </button>
        </div>
      </div>

      <div className="drawer-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'family'}
          className={`drawer-tab ${activeTab === 'family' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('family')}
        >
          Family
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timeline'}
          className={`drawer-tab ${activeTab === 'timeline' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          Timeline ({timeline.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'media'}
          className={`drawer-tab ${activeTab === 'media' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('media')}
        >
          Media &amp; Sources ({person.media.length + uniqueSources.size})
        </button>
      </div>

      <div className="drawer-body">
        {activeTab === 'family' && (
          <>
            {/* Parents */}
            <div className="drawer-section">
              <div className="drawer-section-title">
                Parents {parentUnions.length > 1 ? `(${parentUnions.length} family units)` : ''}
              </div>
              {parentUnions.length === 0 ? (
                <div className="relative-sub">No parents recorded</div>
              ) : (
                parentUnions.map((u) => {
                  const childLink = u.children.find((c) => c.personId === personId);
                  return (
                    <div key={u.id} className="union-block">
                      {parentUnions.length > 1 && (
                        <div className="union-block-header">
                          <span>
                            {childLink?.pedigree === 'adopted'
                              ? 'Adoptive Parents'
                              : childLink?.pedigree === 'biological'
                                ? 'Biological Parents'
                                : 'Parent Family'}
                          </span>
                        </div>
                      )}
                      {u.partners.map((partner) => {
                        const p = graph.getPerson(partner.personId);
                        if (!p) return null;
                        const rel = childLink
                          ? getEffectiveParentRelation(childLink, partner.personId)
                          : 'biological';
                        return (
                          <button
                            key={p.id}
                            type="button"
                            className="relative-card"
                            onClick={() => onSelectPerson(p.id)}
                          >
                            <div>
                              <div className="relative-name">{p.name.display}</div>
                              <div className="relative-sub">
                                {formatLifespan(p.birth, p.death) || 'Dates unknown'}
                              </div>
                            </div>
                            <span className="rel-pill" style={{ textTransform: 'capitalize' }}>
                              {rel}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>

            {/* Partners & Children */}
            <div className="drawer-section">
              <div className="drawer-section-title">
                Partners &amp; Children ({partnerUnions.length})
              </div>
              {partnerUnions.length === 0 ? (
                <div className="relative-sub">No partnerships recorded</div>
              ) : (
                partnerUnions.map((u, idx) => {
                  const coPartner = u.partners.find((p) => p.personId !== personId);
                  const coPerson = coPartner ? graph.getPerson(coPartner.personId) : undefined;
                  const marrStr = u.marriage?.date
                    ? `m. ${formatGenealogicalDate(u.marriage.date, 'short')}`
                    : u.type.replace('_', ' ');
                  const divStr = u.divorce?.date
                    ? `div. ${formatGenealogicalDate(u.divorce.date, 'short')}`
                    : u.status === 'divorced'
                      ? 'Divorced'
                      : null;

                  return (
                    <div key={u.id} className="union-block">
                      <div className="union-block-header">
                        <span>
                          {partnerUnions.length > 1 ? `Union #${idx + 1} · ` : ''}
                          {[marrStr, divStr].filter(Boolean).join(' · ')}
                        </span>
                        <span className="rel-pill" style={{ textTransform: 'capitalize' }}>
                          {u.status}
                        </span>
                      </div>

                      {coPerson ? (
                        <button
                          type="button"
                          className="relative-card"
                          onClick={() => onSelectPerson(coPerson.id)}
                        >
                          <div>
                            <div className="relative-name">{coPerson.name.display}</div>
                            <div className="relative-sub">
                              {formatLifespan(coPerson.birth, coPerson.death) || 'Dates unknown'}
                            </div>
                          </div>
                          <span className="rel-pill is-gold-pill">Partner</span>
                        </button>
                      ) : (
                        <div className="relative-sub">Single-parent family (partner unknown)</div>
                      )}

                      {u.children.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 10 }}>
                          {u.children.map((childLink) => {
                            const child = graph.getPerson(childLink.personId);
                            if (!child) return null;
                            const rel = getEffectiveParentRelation(childLink, personId);
                            return (
                              <button
                                key={child.id}
                                type="button"
                                className="relative-card"
                                onClick={() => onSelectPerson(child.id)}
                              >
                                <div>
                                  <div className="relative-name">{child.name.display}</div>
                                  <div className="relative-sub">
                                    {formatLifespan(child.birth, child.death) || 'Dates unknown'}
                                  </div>
                                </div>
                                <span className="rel-pill" style={{ textTransform: 'capitalize' }}>
                                  {rel === 'biological' ? 'Child' : rel}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Siblings */}
            <div className="drawer-section">
              <div className="drawer-section-title">Siblings ({siblings.length})</div>
              {siblings.length === 0 ? (
                <div className="relative-sub">No siblings recorded</div>
              ) : (
                siblings.map((sib) => (
                  <button
                    key={sib.person.id}
                    type="button"
                    className="relative-card"
                    onClick={() => onSelectPerson(sib.person.id)}
                  >
                    <div>
                      <div className="relative-name">{sib.person.name.display}</div>
                      <div className="relative-sub">
                        {formatLifespan(sib.person.birth, sib.person.death) || 'Dates unknown'}
                      </div>
                    </div>
                    <span className="rel-pill" style={{ textTransform: 'capitalize' }}>
                      {sib.kind}
                    </span>
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'timeline' && (
          <div className="drawer-section">
            {timeline.length === 0 ? (
              <div className="relative-sub">No life events recorded yet.</div>
            ) : (
              <div className="timeline-list">
                {timeline.map((item) => (
                  <div key={item.id} className="timeline-item">
                    <div className="timeline-type">{item.label}</div>
                    <div className="timeline-meta">
                      {[
                        item.date ? formatGenealogicalDate(item.date, 'short') : null,
                        item.place,
                      ]
                        .filter(Boolean)
                        .join(' · ') || 'Date & place unknown'}
                    </div>
                    {item.description && (
                      <div className="timeline-meta">{item.description}</div>
                    )}
                    {item.notes?.map((note, idx) => (
                      <div key={idx} className="timeline-note">
                        “{note}”
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'media' && (
          <>
            <div className="drawer-section">
              <div className="drawer-section-title">Media &amp; Documents ({person.media.length})</div>
              {person.media.length === 0 ? (
                <div className="relative-sub">
                  No media attached. Use the camera icon above to attach a local portrait photo.
                </div>
              ) : (
                person.media.map((ref) => {
                  const mediaObj = graph.tree.media[ref.mediaId];
                  if (!mediaObj) return null;
                  const resolvedUrl =
                    mediaUrlsByMediaId.get(mediaObj.id) ??
                    (mediaObj.file && /^(https?:|data:|blob:|\/)/.test(mediaObj.file)
                      ? mediaObj.file
                      : undefined);

                  return (
                    <div key={ref.mediaId} className="media-item-card">
                      <div className="media-preview-box">
                        {resolvedUrl ? (
                          <img src={resolvedUrl} alt={mediaObj.title ?? mediaObj.id} />
                        ) : (
                          <>
                            <CameraIcon size={20} />
                            <span>
                              {mediaObj.file
                                ? `Local path: ${mediaObj.file}`
                                : 'Image not included in GEDCOM export'}
                            </span>
                            <label
                              className="btn"
                              style={{ height: 26, fontSize: 11, padding: '0 10px' }}
                            >
                              Attach Local Image
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) {
                                    onAttachMediaFile(mediaObj.id, f);
                                    e.target.value = '';
                                  }
                                }}
                              />
                            </label>
                          </>
                        )}
                      </div>
                      <div className="media-info">
                        <div style={{ fontWeight: 600, fontSize: 12.5 }}>
                          {mediaObj.title ?? mediaObj.id}
                          {ref.isPrimary ? ' · Primary Portrait' : ''}
                        </div>
                        {mediaObj.description && (
                          <div className="relative-sub">{mediaObj.description}</div>
                        )}
                        {mediaObj.transcription && (
                          <div className="media-transcription">{mediaObj.transcription}</div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {linkedNotes.length > 0 && (
              <div className="drawer-section">
                <div className="drawer-section-title">Notes ({linkedNotes.length})</div>
                {linkedNotes.map((n, i) => (
                  <div key={i} className="media-transcription" style={{ marginTop: 0 }}>
                    {n}
                  </div>
                ))}
              </div>
            )}

            <div className="drawer-section">
              <div className="drawer-section-title">Sources ({uniqueSources.size})</div>
              {uniqueSources.size === 0 ? (
                <div className="relative-sub">No source citations recorded.</div>
              ) : (
                [...uniqueSources.entries()].map(([sid, info]) => (
                  <div key={sid} className="union-block">
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{info.title}</div>
                    {info.repo && <div className="relative-sub">Repository: {info.repo}</div>}
                    {info.pages.size > 0 && (
                      <div className="relative-sub">Ref: {[...info.pages].join('; ')}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
