import { useRef, useState } from 'react';
import type { FamilyGraph } from '../../core/index.js';
import type {
  CertificateAttachment,
  CertificateRole,
  DocumentHighlight,
  ScrapbookAsset,
  ScrapbookPersonEntry,
} from '../../scrapbook/index.js';
import { CloseIcon, UploadIcon } from '../Icons.js';
import { CertificateCard } from './CertificateCard.js';
import { HighlightEditorModal } from './HighlightEditorModal.js';

export interface PaperworkPageProps {
  graph: FamilyGraph;
  entry: ScrapbookPersonEntry;
  allAssets: Record<string, ScrapbookAsset>;
  assetUrls: ReadonlyMap<string, string>;
  mode: 'edit' | 'preview' | 'print';
  onAttachCertificate?: (file: File, role: CertificateRole) => Promise<void> | void;
  onReuseAsset?: (assetId: string, role: CertificateRole, title: string) => void;
  onUpdateHighlights?: (certificateId: string, highlights: DocumentHighlight[]) => void;
  onBringToFront?: (certificateId: string) => void;
  onRemoveCertificate?: (certificateId: string) => void;
}

const INTERLEAVED_SLOTS: Array<{ top: string; left: string }> = [
  { top: '0%', left: '3%' },
  { top: '26%', left: '19%' },
  { top: '50%', left: '6%' },
  { top: '14%', left: '16%' },
];

export function PaperworkPage({
  graph,
  entry,
  allAssets,
  assetUrls,
  mode,
  onAttachCertificate,
  onReuseAsset,
  onUpdateHighlights,
  onBringToFront,
  onRemoveCertificate,
}: PaperworkPageProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedRole, setSelectedRole] = useState<CertificateRole>('birth');
  const [reuseOpen, setReuseOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingCert, setEditingCert] = useState<CertificateAttachment | null>(null);
  const [inspectCert, setInspectCert] = useState<CertificateAttachment | null>(null);

  const isEdit = mode === 'edit';
  const person = graph.getPerson(entry.personId);
  if (!person) return null;

  const existingIdsOnEntry = new Set(entry.certificates.map((c) => c.assetId));
  const reusableAssets = Object.values(allAssets).filter(
    (a) => !existingIdsOnEntry.has(a.id) && assetUrls.has(a.id),
  );

  const certs = entry.certificates;
  const useInterleaved = mode !== 'print' && certs.length >= 2 && certs.length <= 4;

  const handleFile = (file: File | undefined) => {
    if (!file || !onAttachCertificate) return;
    if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.pdf')) {
      return;
    }
    void onAttachCertificate(file, selectedRole);
  };

  return (
    <div
      className="sb-page-content"
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
      <header className="sb-person-header">
        <div>
          <h2 className="sb-person-name" style={{ fontSize: 25 }}>
            {person.name.display}
          </h2>
          <div className="sb-person-dates">
            Vital Records, Certificates &amp; Archival Paperwork
          </div>
        </div>
        <span className="sb-role-tag">Paperwork</span>
      </header>

      {isEdit && (
        <div className="sb-paperwork-toolbar sb-edit-only">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select
              className="field-select"
              style={{ height: 28, fontSize: 11.5, padding: '0 8px' }}
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as CertificateRole)}
              aria-label="Certificate type"
            >
              <option value="birth">Birth Certificate</option>
              <option value="marriage">Marriage Certificate</option>
              <option value="death">Death Certificate</option>
              <option value="census">Census Register</option>
              <option value="other">Other Record</option>
            </select>

            <button
              type="button"
              className="btn btn-primary"
              style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon size={12} />
              Add Image / PDF
            </button>

            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              style={{ display: 'none' }}
              onChange={(e) => {
                handleFile(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>

          {reusableAssets.length > 0 && onReuseAsset && (
            <div className="popover-anchor">
              <button
                type="button"
                className="btn"
                style={{ height: 28, fontSize: 11.5, padding: '0 10px' }}
                onClick={() => setReuseOpen((o) => !o)}
              >
                Reuse Family Doc ({reusableAssets.length})
              </button>
              {reuseOpen && (
                <div className="popover-menu" style={{ width: 240 }}>
                  <div className="popover-title">Shared Album Assets</div>
                  <div
                    style={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    {reusableAssets.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        className="menu-action"
                        onClick={() => {
                          onReuseAsset(
                            asset.id,
                            selectedRole,
                            asset.originalTitle || asset.filename.split('/').pop() || 'Shared Record',
                          );
                          setReuseOpen(false);
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {asset.originalTitle || asset.filename}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {certs.length === 0 ? (
        isEdit ? (
          <button
            type="button"
            className={`sb-dropzone sb-edit-only ${dragOver ? 'is-drag-over' : ''}`}
            style={{ flex: 1, borderRadius: 6 }}
            onClick={() => inputRef.current?.click()}
          >
            <UploadIcon size={24} />
            <strong style={{ fontSize: 13 }}>
              Drop Birth, Marriage, or Death Certificates here
            </strong>
            <span>
              Accepts JPG, PNG, WebP, or PDF scans. Once pinned, highlight the exact ledger row!
            </span>
          </button>
        ) : (
          <div className="sb-page-blank-end" style={{ flex: 1 }}>
            No certificates attached for this relative.
          </div>
        )
      ) : (
        <div
          className={`sb-cert-stage ${
            mode === 'print'
              ? `is-print-grid ${certs.length >= 3 ? 'has-many' : ''}`
              : useInterleaved
                ? 'is-interleaved'
                : ''
          }`}
        >
          {certs.map((cert, idx) => {
            const slot = INTERLEAVED_SLOTS[idx % INTERLEAVED_SLOTS.length]!;
            const positionedStyle: React.CSSProperties | undefined = useInterleaved
              ? {
                  top: slot.top,
                  left: slot.left,
                  zIndex: cert.zOrder,
                }
              : undefined;

            return (
              <CertificateCard
                key={cert.id}
                certificate={cert}
                imageUrl={assetUrls.get(cert.assetId)}
                mode={mode}
                isPositioned={useInterleaved}
                positionedStyle={positionedStyle}
                onBringToFront={() => onBringToFront?.(cert.id)}
                onOpenHighlighter={() => setEditingCert(cert)}
                onInspect={() => setInspectCert(cert)}
                onRemove={() => onRemoveCertificate?.(cert.id)}
              />
            );
          })}
        </div>
      )}

      {/* Interactive Record Highlighter Modal */}
      {editingCert && assetUrls.get(editingCert.assetId) && (
        <HighlightEditorModal
          certificate={editingCert}
          imageUrl={assetUrls.get(editingCert.assetId)!}
          onSave={(nextHighlights) => {
            onUpdateHighlights?.(editingCert.id, nextHighlights);
          }}
          onClose={() => setEditingCert(null)}
        />
      )}

      {/* Lightbox Inspector */}
      {inspectCert && assetUrls.get(inspectCert.assetId) && (
        <div className="modal-backdrop" onClick={() => setInspectCert(null)}>
          <div
            className="modal-dialog modal-wide"
            role="dialog"
            aria-modal="true"
            aria-label={`Inspect ${inspectCert.title}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">{inspectCert.title}</h2>
              <button
                type="button"
                className="btn btn-icon"
                style={{ width: 30, height: 30 }}
                onClick={() => setInspectCert(null)}
                aria-label="Close document preview"
              >
                <CloseIcon size={15} />
              </button>
            </div>
            <div
              className="modal-body"
              style={{ alignItems: 'center', background: 'var(--bg-subtle)' }}
            >
              <div style={{ maxWidth: '100%', width: 760 }}>
                <CertificateCard
                  certificate={{ ...inspectCert, rotationDeg: 0 }}
                  imageUrl={assetUrls.get(inspectCert.assetId)}
                  mode="preview"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
