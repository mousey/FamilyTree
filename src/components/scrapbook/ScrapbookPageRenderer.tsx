import type { FamilyGraph, PersonId } from '../../core/index.js';
import type { BookletPage, ScrapbookStoreApi } from '../../scrapbook/index.js';
import { CoverTreePage } from './CoverTreePage.js';
import { PaperworkPage } from './PaperworkPage.js';
import { PersonProfilePage } from './PersonProfilePage.js';
import { StoryPlacesPage } from './StoryPlacesPage.js';

export interface ScrapbookPageRendererProps {
  graph: FamilyGraph;
  store: ScrapbookStoreApi;
  page: BookletPage;
  side: 'left' | 'right';
  mode: 'edit' | 'preview' | 'print';
  onJumpToPerson?: (personId: PersonId) => void;
}

export function ScrapbookPageRenderer({
  graph,
  store,
  page,
  side,
  mode,
  onJumpToPerson,
}: ScrapbookPageRendererProps) {
  const { doc, assetUrls } = store;
  const isLetter = doc.paperSize === 'letter';
  const inkSaver = mode === 'print' && doc.inkSaverPrint;

  return (
    <div
      className={`sb-page ${side === 'left' ? 'is-left-page' : 'is-right-page'} ${
        isLetter ? 'is-letter' : ''
      }`}
      data-ink-saver={inkSaver ? 'true' : 'false'}
    >
      <div className="sb-page-frame-border" aria-hidden="true" />

      {page.kind === 'cover_tree' && (
        <CoverTreePage
          graph={graph}
          title={page.title}
          subtitle={page.subtitle}
          focusPersonId={page.focusPersonId}
          entries={doc.entries}
          assetUrls={assetUrls}
          personPortraitAssetIds={doc.personPortraitAssetIds}
          mode={mode}
          onChangeTitle={mode === 'edit' ? store.setTitle : undefined}
          onJumpToPerson={onJumpToPerson}
        />
      )}

      {(page.kind === 'profile' || page.kind === 'compact_profile') && (
        <PersonProfilePage
          graph={graph}
          entry={page.entry}
          compact={page.kind === 'compact_profile'}
          assetUrls={assetUrls}
          personPortraitAssetIds={doc.personPortraitAssetIds}
          mode={mode}
          onAttachPortrait={
            mode === 'edit'
              ? (file) => void store.attachPortrait(page.personId, file)
              : undefined
          }
          onAttachGroupPolaroid={
            mode === 'edit'
              ? (file) => void store.attachGroupPolaroid(page.personId, file)
              : undefined
          }
          onUpdatePolaroidCaption={
            mode === 'edit'
              ? (slotId, caption, dt) =>
                  store.updatePolaroidCaption(page.personId, slotId, caption, dt)
              : undefined
          }
        />
      )}

      {page.kind === 'paperwork' && (
        <PaperworkPage
          graph={graph}
          entry={page.entry}
          allAssets={doc.assets}
          assetUrls={assetUrls}
          mode={mode}
          onAttachCertificate={
            mode === 'edit'
              ? (file, role) => store.attachCertificate(page.personId, file, role)
              : undefined
          }
          onReuseAsset={
            mode === 'edit'
              ? (assetId, role, title) =>
                  store.reuseExistingAssetAsCertificate(
                    page.personId,
                    assetId,
                    role,
                    title,
                  )
              : undefined
          }
          onUpdateHighlights={
            mode === 'edit'
              ? (certId, highlights) =>
                  store.updateCertificateHighlights(
                    page.personId,
                    certId,
                    highlights,
                  )
              : undefined
          }
          onBringToFront={
            mode !== 'print'
              ? (certId) => store.bringCertificateToFront(page.personId, certId)
              : undefined
          }
          onRemoveCertificate={
            mode === 'edit'
              ? (certId) => store.removeCertificate(page.personId, certId)
              : undefined
          }
        />
      )}

      {page.kind === 'story_places' && (
        <StoryPlacesPage
          graph={graph}
          entry={page.entry}
          assetUrls={assetUrls}
          mode={mode}
          onSetBiography={
            mode === 'edit'
              ? (text) => store.setBiographyText(page.personId, text)
              : undefined
          }
          onAttachExtraPhoto={
            mode === 'edit'
              ? (file) => void store.attachExtraPhoto(page.personId, file)
              : undefined
          }
          onUpdatePolaroidCaption={
            mode === 'edit'
              ? (slotId, caption, dt) =>
                  store.updatePolaroidCaption(page.personId, slotId, caption, dt)
              : undefined
          }
          onRemoveExtraPhoto={
            mode === 'edit'
              ? (slotId) => store.removeExtraPhoto(page.personId, slotId)
              : undefined
          }
          onAttachPlaceSnapshot={
            mode === 'edit'
              ? (placeId, file) =>
                  void store.attachPlaceSnapshot(page.personId, placeId, file)
              : undefined
          }
          onAddPlace={
            mode === 'edit'
              ? (address, year) => store.addPlace(page.personId, address, year)
              : undefined
          }
          onUpdatePlaceCaption={
            mode === 'edit'
              ? (placeId, caption) =>
                  store.updatePlaceCaption(page.personId, placeId, caption)
              : undefined
          }
          onRemovePlace={
            mode === 'edit'
              ? (placeId) => store.removePlace(page.personId, placeId)
              : undefined
          }
        />
      )}

      <footer className="sb-page-footer">
        <span>{doc.title}</span>
        <span>Page {page.pageNumber}</span>
      </footer>
    </div>
  );
}
