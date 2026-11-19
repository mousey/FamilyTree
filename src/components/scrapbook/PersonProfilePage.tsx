import { useMemo, useRef, useState } from 'react';
import {
  formatGenealogicalDate,
  formatLifespan,
  type FamilyGraph,
} from '../../core/index.js';
import {
  buildPersonTimeline,
  generateStarterBiography,
  type ScrapbookPersonEntry,
} from '../../scrapbook/index.js';
import { CameraIcon } from '../Icons.js';
import { getInitials } from '../PersonCard.js';
import { PolaroidCard } from './PolaroidCard.js';

export interface PersonProfilePageProps {
  graph: FamilyGraph;
  entry: ScrapbookPersonEntry;
  compact?: boolean;
  assetUrls: ReadonlyMap<string, string>;
  personPortraitAssetIds?: Record<string, string>;
  mode: 'edit' | 'preview' | 'print';
  onAttachPortrait?: (file: File) => void;
  onAttachGroupPolaroid?: (file: File) => void;
  onUpdatePolaroidCaption?: (slotId: string, caption: string, dateLabel?: string) => void;
}

const ROLE_LABELS: Record<ScrapbookPersonEntry['role'], string> = {
  focus: 'Focus Person',
  spouse: 'Spouse / Partner',
  child: 'Child',
  sibling: 'Sibling',
  parent: 'Parent',
  grandparent: 'Grandparent',
  custom: 'Family Member',
};

export function PersonProfilePage({
  graph,
  entry,
  compact = false,
  assetUrls,
  personPortraitAssetIds,
  mode,
  onAttachPortrait,
  onAttachGroupPolaroid,
  onUpdatePolaroidCaption,
}: PersonProfilePageProps) {
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const [dragOverPortrait, setDragOverPortrait] = useState(false);
  const isEdit = mode === 'edit';

  const person = graph.getPerson(entry.personId);
  const timeline = useMemo(
    () => buildPersonTimeline(graph, entry.personId),
    [entry.personId, graph],
  );
  const bioExcerpt = useMemo(() => {
    if (!compact) return '';
    return entry.biographyText?.trim() || generateStarterBiography(graph, entry.personId);
  }, [compact, entry.biographyText, entry.personId, graph]);

  if (!person) return null;

  const lifespan = formatLifespan(person.birth, person.death);
  const portraitAssetId =
    entry.portraitAssetId ?? personPortraitAssetIds?.[entry.personId];
  const portraitUrl = portraitAssetId ? assetUrls.get(portraitAssetId) : undefined;
  const polaroidUrl = entry.groupPolaroid
    ? assetUrls.get(entry.groupPolaroid.assetId)
    : undefined;

  const maxEvents = compact ? 6 : 8;
  const visibleEvents = timeline.slice(0, maxEvents);
  const extraEventCount = Math.max(0, timeline.length - maxEvents);

  const handlePortraitFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/') || !onAttachPortrait) return;
    onAttachPortrait(file);
  };

  return (
    <div className="sb-page-content">
      {/* Header */}
      <header className="sb-person-header">
        <div>
          <h2 className="sb-person-name">{person.name.display}</h2>
          <div className="sb-person-dates">
            {lifespan || 'Dates unrecorded'}
            {person.birth?.place ? ` · ${person.birth.place}` : ''}
          </div>
        </div>
        <span className="sb-role-tag">{ROLE_LABELS[entry.role]}</span>
      </header>

      {/* Portrait + Handwritten Life Events */}
      <div className="sb-profile-top">
        <div
          className="sb-portrait-frame sb-has-hover"
          onDragOver={(e) => {
            if (!isEdit) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverPortrait(true);
          }}
          onDragLeave={() => setDragOverPortrait(false)}
          onDrop={(e) => {
            if (!isEdit) return;
            e.preventDefault();
            e.stopPropagation();
            setDragOverPortrait(false);
            handlePortraitFile(e.dataTransfer.files[0]);
          }}
        >
          <span className="sb-photo-corner tl" aria-hidden="true" />
          <span className="sb-photo-corner tr" aria-hidden="true" />
          <span className="sb-photo-corner bl" aria-hidden="true" />
          <span className="sb-photo-corner br" aria-hidden="true" />

          <div className="sb-portrait-inner">
            {portraitUrl ? (
              <>
                <img src={portraitUrl} alt={person.name.display} />
                {isEdit && onAttachPortrait && (
                  <div className="sb-hover-actions sb-edit-only">
                    <button
                      type="button"
                      className="sb-float-btn"
                      onClick={() => portraitInputRef.current?.click()}
                    >
                      <CameraIcon size={11} />
                      Change
                    </button>
                  </div>
                )}
              </>
            ) : isEdit && onAttachPortrait ? (
              <button
                type="button"
                className={`sb-dropzone sb-edit-only ${dragOverPortrait ? 'is-drag-over' : ''}`}
                onClick={() => portraitInputRef.current?.click()}
              >
                <span className="sb-portrait-initials">{getInitials(person)}</span>
                <span>Add portrait</span>
              </button>
            ) : (
              <span className="sb-portrait-initials">{getInitials(person)}</span>
            )}

            {isEdit && onAttachPortrait && (
              <input
                ref={portraitInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handlePortraitFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            )}
          </div>
        </div>

        {/* Handwritten Timeline */}
        <section className="sb-ruled-card" aria-label="Life events">
          <div className="sb-ruled-heading">Life Events &amp; Milestones</div>
          {visibleEvents.length === 0 ? (
            <div
              style={{
                fontFamily: 'var(--font-handwriting)',
                fontSize: 18,
                color: '#8a7f71',
                paddingLeft: 6,
              }}
            >
              No dated life events recorded in GEDCOM.
            </div>
          ) : (
            <ul className="sb-handwriting-list">
              {visibleEvents.map((ev) => {
                const dateText = ev.date
                  ? formatGenealogicalDate(ev.date, 'short')
                  : '—';
                const detailParts = [
                  ev.label,
                  ev.place,
                  ev.description,
                ].filter(Boolean);
                return (
                  <li key={ev.id} className="sb-handwriting-item">
                    <span className="sb-hw-date">{dateText}</span>
                    <span className="sb-hw-detail">
                      {detailParts.join(' · ')}
                    </span>
                  </li>
                );
              })}
              {extraEventCount > 0 && (
                <li
                  style={{
                    fontSize: 15,
                    color: '#8a7f71',
                    fontStyle: 'italic',
                  }}
                >
                  + {extraEventCount} additional recorded events
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      {/* Compact single-page biography snippet OR Full Polaroid Group Photo */}
      {compact ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {bioExcerpt && (
            <section className="sb-ruled-card">
              <div className="sb-ruled-heading">Family Note</div>
              <div className="sb-bio-prose" style={{ fontSize: 13.5, lineHeight: '22px' }}>
                {bioExcerpt.slice(0, 420)}
                {bioExcerpt.length > 420 ? '…' : ''}
              </div>
            </section>
          )}
          {(polaroidUrl || isEdit) && (
            <div className="sb-polaroid-stage">
              <PolaroidCard
                imageUrl={polaroidUrl}
                caption={entry.groupPolaroid?.caption ?? ''}
                dateLabel={entry.groupPolaroid?.dateLabel}
                rotationDeg={entry.groupPolaroid?.rotationDeg ?? -1.8}
                size="medium"
                mode={mode}
                placeholderLabel="Drop a favorite photo"
                onUploadFile={onAttachGroupPolaroid}
                onChangeCaption={
                  entry.groupPolaroid && onUpdatePolaroidCaption
                    ? (cap, dt) =>
                        onUpdatePolaroidCaption(entry.groupPolaroid!.id, cap, dt)
                    : undefined
                }
              />
            </div>
          )}
        </div>
      ) : (
        <div className="sb-polaroid-stage">
          {polaroidUrl || isEdit ? (
            <PolaroidCard
              imageUrl={polaroidUrl}
              caption={entry.groupPolaroid?.caption ?? ''}
              dateLabel={entry.groupPolaroid?.dateLabel}
              rotationDeg={entry.groupPolaroid?.rotationDeg ?? -2.1}
              size="large"
              mode={mode}
              placeholderLabel="Drop a group photo or click to pin Polaroid"
              onUploadFile={onAttachGroupPolaroid}
              onChangeCaption={
                entry.groupPolaroid && onUpdatePolaroidCaption
                  ? (cap, dt) =>
                      onUpdatePolaroidCaption(entry.groupPolaroid!.id, cap, dt)
                  : undefined
              }
            />
          ) : (
            <div
              style={{
                fontFamily: 'var(--font-serif)',
                fontStyle: 'italic',
                fontSize: 13,
                color: '#9b8f80',
              }}
            >
              — Heirloom Family Archive —
            </div>
          )}
        </div>
      )}
    </div>
  );
}
