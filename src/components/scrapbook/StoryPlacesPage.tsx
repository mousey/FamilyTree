import { useMemo, useRef, useState } from 'react';
import type { FamilyGraph } from '../../core/index.js';
import {
  buildGoogleMapsSearchUrl,
  extractImageFromClipboard,
  generateStarterBiography,
  type PlaceSnapshot,
  type ScrapbookPersonEntry,
} from '../../scrapbook/index.js';
import { CameraIcon, TrashIcon } from '../Icons.js';
import { PolaroidCard } from './PolaroidCard.js';

export interface StoryPlacesPageProps {
  graph: FamilyGraph;
  entry: ScrapbookPersonEntry;
  assetUrls: ReadonlyMap<string, string>;
  mode: 'edit' | 'preview' | 'print';
  onSetBiography?: (text: string) => void;
  onAttachExtraPhoto?: (file: File) => void;
  onUpdatePolaroidCaption?: (slotId: string, caption: string, dateLabel?: string) => void;
  onRemoveExtraPhoto?: (slotId: string) => void;
  onAttachPlaceSnapshot?: (placeId: string, file: File) => void;
  onAddPlace?: (address: string, yearLabel?: string) => void;
  onUpdatePlaceCaption?: (placeId: string, caption: string) => void;
  onRemovePlace?: (placeId: string) => void;
}

function PlacePostcard({
  place,
  imageUrl,
  mode,
  onAttachSnapshot,
  onUpdateCaption,
  onRemove,
}: {
  place: PlaceSnapshot;
  imageUrl?: string;
  mode: 'edit' | 'preview' | 'print';
  onAttachSnapshot?: (file: File) => void;
  onUpdateCaption?: (caption: string) => void;
  onRemove?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const isEdit = mode === 'edit';

  const handleFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/') || !onAttachSnapshot) return;
    onAttachSnapshot(file);
  };

  return (
    <div
      className="sb-postcard sb-has-hover"
      tabIndex={isEdit ? 0 : undefined}
      onPaste={(e) => {
        if (!isEdit) return;
        const pasted = extractImageFromClipboard(e.nativeEvent);
        if (pasted) {
          e.preventDefault();
          handleFile(pasted);
        }
      }}
      onDragOver={(e) => {
        if (!isEdit) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!isEdit) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
      }}
    >
      <div className="sb-postcard-media">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={place.address} />
            {isEdit && (
              <div className="sb-hover-actions sb-edit-only">
                <button
                  type="button"
                  className="sb-float-btn"
                  onClick={() => inputRef.current?.click()}
                >
                  <CameraIcon size={10} />
                  Replace
                </button>
                {onRemove && (
                  <button
                    type="button"
                    className="sb-float-btn is-danger"
                    onClick={onRemove}
                    title="Remove place"
                  >
                    <TrashIcon size={10} />
                  </button>
                )}
              </div>
            )}
          </>
        ) : isEdit ? (
          <div
            className={`sb-dropzone sb-edit-only ${dragOver ? 'is-drag-over' : ''}`}
            onClick={() => inputRef.current?.click()}
          >
            <CameraIcon size={15} />
            <span style={{ fontSize: 10 }}>
              Click &amp; press ⌘V to paste Street View, or drop image
            </span>
          </div>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: 11,
              color: '#8a7f71',
              padding: 8,
              textAlign: 'center',
            }}
          >
            {place.address}
          </div>
        )}

        {isEdit && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        )}
      </div>

      <div className="sb-postcard-footer">
        <span className="sb-postcard-address" title={place.address}>
          {place.address}
        </span>
        {place.yearLabel && (
          <span className="sb-postcard-year">{place.yearLabel}</span>
        )}
      </div>

      {isEdit ? (
        <div className="sb-postcard-actions sb-edit-only">
          <a
            className="sb-maps-link"
            href={buildGoogleMapsSearchUrl(place.address)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Google Maps ↗
          </a>
          <input
            type="text"
            value={place.caption ?? ''}
            placeholder="Note…"
            onChange={(e) => onUpdateCaption?.(e.target.value)}
            style={{
              border: 'none',
              borderBottom: '1px dashed rgba(138, 128, 116, 0.4)',
              background: 'transparent',
              fontSize: 10.5,
              width: 90,
              outline: 'none',
              color: '#5c5246',
            }}
          />
        </div>
      ) : (
        place.caption && (
          <div
            style={{
              fontSize: 10.5,
              color: '#6e6357',
              fontStyle: 'italic',
            }}
          >
            {place.caption}
          </div>
        )
      )}
    </div>
  );
}

export function StoryPlacesPage({
  graph,
  entry,
  assetUrls,
  mode,
  onSetBiography,
  onAttachExtraPhoto,
  onUpdatePolaroidCaption,
  onRemoveExtraPhoto,
  onAttachPlaceSnapshot,
  onAddPlace,
  onUpdatePlaceCaption,
  onRemovePlace,
}: StoryPlacesPageProps) {
  const extraInputRef = useRef<HTMLInputElement>(null);
  const [addingPlace, setAddingPlace] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newYear, setNewYear] = useState('');

  const isEdit = mode === 'edit';
  const person = graph.getPerson(entry.personId);
  const starterBio = useMemo(
    () => generateStarterBiography(graph, entry.personId),
    [entry.personId, graph],
  );

  if (!person) return null;

  const displayedBio =
    entry.biographyText !== undefined ? entry.biographyText : starterBio;
  const visiblePlaces = isEdit
    ? entry.places.slice(0, 4)
    : entry.places.filter((p) => Boolean(p.assetId)).slice(0, 4);
  const fallbackPlaces =
    !isEdit && visiblePlaces.length === 0 ? entry.places.slice(0, 2) : visiblePlaces;

  return (
    <div className="sb-page-content">
      <header className="sb-person-header">
        <div>
          <h2 className="sb-person-name" style={{ fontSize: 25 }}>
            {person.name.display}
          </h2>
          <div className="sb-person-dates">
            Story, Memories &amp; Places Lived
          </div>
        </div>
        <span className="sb-role-tag">Story &amp; Places</span>
      </header>

      {/* Biography Notebook */}
      <section className="sb-ruled-card" aria-label="Biography">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div className="sb-ruled-heading">Biographical Notes</div>
          {isEdit && entry.biographyText !== undefined && onSetBiography && (
            <button
              type="button"
              className="sb-mini-icon-btn sb-edit-only"
              style={{ width: 'auto', padding: '0 6px', fontSize: 10 }}
              onClick={() => onSetBiography(starterBio)}
              title="Reset to GEDCOM starter draft"
            >
              Reset draft
            </button>
          )}
        </div>

        {isEdit && onSetBiography ? (
          <textarea
            className="sb-bio-textarea"
            rows={6}
            value={displayedBio}
            placeholder="Write memories, anecdotes, or family stories…"
            onChange={(e) => onSetBiography(e.target.value)}
          />
        ) : (
          <div className="sb-bio-prose">{displayedBio}</div>
        )}
      </section>

      {/* Extra Photos Row */}
      {(entry.extraPhotos.length > 0 || isEdit) && (
        <div>
          <div className="sb-section-bar" style={{ marginBottom: 6 }}>
            <span className="sb-section-kicker">Additional Photographs</span>
            {isEdit && onAttachExtraPhoto && entry.extraPhotos.length < 2 && (
              <>
                <button
                  type="button"
                  className="btn sb-edit-only"
                  style={{ height: 24, fontSize: 11, padding: '0 9px' }}
                  onClick={() => extraInputRef.current?.click()}
                >
                  + Add Photo
                </button>
                <input
                  ref={extraInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onAttachExtraPhoto(f);
                    e.target.value = '';
                  }}
                />
              </>
            )}
          </div>

          {entry.extraPhotos.length > 0 && (
            <div className="sb-extra-photos-row">
              {entry.extraPhotos.slice(0, 2).map((slot) => (
                <PolaroidCard
                  key={slot.id}
                  imageUrl={assetUrls.get(slot.assetId)}
                  caption={slot.caption}
                  dateLabel={slot.dateLabel}
                  rotationDeg={slot.rotationDeg}
                  size="small"
                  mode={mode}
                  onChangeCaption={
                    onUpdatePolaroidCaption
                      ? (cap, dt) => onUpdatePolaroidCaption(slot.id, cap, dt)
                      : undefined
                  }
                  onRemove={
                    onRemoveExtraPhoto
                      ? () => onRemoveExtraPhoto(slot.id)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Places Lived */}
      <section className="sb-places-section">
        <div className="sb-section-bar">
          <span className="sb-section-kicker">Places Lived &amp; Historic Homes</span>
          {isEdit && onAddPlace && (
            <button
              type="button"
              className="btn sb-edit-only"
              style={{ height: 24, fontSize: 11, padding: '0 9px' }}
              onClick={() => setAddingPlace((v) => !v)}
            >
              + Add Place
            </button>
          )}
        </div>

        {isEdit && addingPlace && onAddPlace && (
          <form
            className="sb-edit-only"
            style={{ display: 'flex', gap: 6, alignItems: 'center' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!newAddress.trim()) return;
              onAddPlace(newAddress.trim(), newYear.trim() || undefined);
              setNewAddress('');
              setNewYear('');
              setAddingPlace(false);
            }}
          >
            <input
              type="text"
              className="field-input"
              style={{ flex: 1, height: 28, fontSize: 12 }}
              placeholder="Address (e.g. 14 High Street, Paisley)"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
            />
            <input
              type="text"
              className="field-input"
              style={{ width: 80, height: 28, fontSize: 12 }}
              placeholder="Year"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
            >
              Add
            </button>
          </form>
        )}

        {fallbackPlaces.length > 0 ? (
          <div className="sb-places-grid">
            {fallbackPlaces.map((place) => (
              <PlacePostcard
                key={place.id}
                place={place}
                imageUrl={place.assetId ? assetUrls.get(place.assetId) : undefined}
                mode={mode}
                onAttachSnapshot={
                  onAttachPlaceSnapshot
                    ? (file) => onAttachPlaceSnapshot(place.id, file)
                    : undefined
                }
                onUpdateCaption={
                  onUpdatePlaceCaption
                    ? (cap) => onUpdatePlaceCaption(place.id, cap)
                    : undefined
                }
                onRemove={
                  onRemovePlace ? () => onRemovePlace(place.id) : undefined
                }
              />
            ))}
          </div>
        ) : (
          isEdit && (
            <div
              className="sb-edit-only"
              style={{
                fontSize: 11.5,
                color: '#8a7f71',
                fontStyle: 'italic',
              }}
            >
              No addresses found in GEDCOM — click &ldquo;+ Add Place&rdquo; to pin a Street View or historic house photo.
            </div>
          )
        )}
      </section>
    </div>
  );
}
