import type { CertificateAttachment, DocumentHighlight } from '../../scrapbook/index.js';
import { SparklesIcon, TrashIcon, ZoomInIcon } from '../Icons.js';

export interface CertificateCardProps {
  certificate: CertificateAttachment;
  imageUrl?: string;
  mode: 'edit' | 'preview' | 'print';
  positionedStyle?: React.CSSProperties;
  isPositioned?: boolean;
  onBringToFront?: () => void;
  onOpenHighlighter?: () => void;
  onInspect?: () => void;
  onRemove?: () => void;
}

function ZoomCalloutStrip({
  imageUrl,
  highlight,
}: {
  imageUrl: string;
  highlight: DocumentHighlight;
}) {
  const safeW = Math.max(0.08, highlight.width);
  return (
    <div className="sb-zoom-callout">
      <div className="sb-zoom-callout-tag">
        <span>{highlight.label || 'Pertinent Record Entry'}</span>
        <span>Magnified</span>
      </div>
      <div className="sb-zoom-callout-viewport">
        <img
          src={imageUrl}
          alt={highlight.label || 'Magnified certificate entry'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${(1 / safeW) * 100}%`,
            height: 'auto',
            transform: `translate(${-highlight.x * 100}%, ${-highlight.y * 100}%)`,
            transformOrigin: '0 0',
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
}

export function CertificateCard({
  certificate,
  imageUrl,
  mode,
  positionedStyle,
  isPositioned = false,
  onBringToFront,
  onOpenHighlighter,
  onInspect,
  onRemove,
}: CertificateCardProps) {
  const isEdit = mode === 'edit';
  const spotlightBoxes = certificate.highlights.filter(
    (h) => h.style === 'spotlight',
  );
  const calloutHighlight = certificate.highlights.find(
    (h) => h.showZoomCallout,
  );

  return (
    <article
      className={`sb-cert-card sb-has-hover ${isPositioned ? 'is-positioned' : ''}`}
      style={{
        ...positionedStyle,
        transform: `rotate(${mode === 'print' ? 0 : certificate.rotationDeg}deg)`,
      }}
      onClick={() => {
        if (mode !== 'print' && onBringToFront) {
          onBringToFront();
        }
      }}
    >
      {/* Decorative Archival Paperclip */}
      <svg
        className="sb-paperclip"
        viewBox="0 0 20 42"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M14 9v21a5 5 0 0 1-10 0V8a3.5 3.5 0 0 1 7 0v19a2 2 0 0 1-4 0V11"
          stroke="#7b7166"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {imageUrl && calloutHighlight && (
        <ZoomCalloutStrip imageUrl={imageUrl} highlight={calloutHighlight} />
      )}

      <div className="sb-cert-meta">
        <span className="sb-cert-title" title={certificate.title}>
          {certificate.title}
        </span>
        <span className="sb-cert-role">{certificate.role}</span>
      </div>

      <div className="sb-cert-img-wrap">
        {imageUrl ? (
          <>
            <img src={imageUrl} alt={certificate.title} />

            {/* Highlight Overlays */}
            <div className="sb-hl-layer">
              {spotlightBoxes.length > 0 && (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                  }}
                >
                  <path
                    fill="rgba(34, 29, 24, 0.36)"
                    fillRule="evenodd"
                    d={`M 0 0 H 100 V 100 H 0 Z ${spotlightBoxes
                      .map(
                        (b) =>
                          `M ${b.x * 100} ${b.y * 100} H ${(b.x + b.width) * 100} V ${(b.y + b.height) * 100} H ${b.x * 100} Z`,
                      )
                      .join(' ')}`}
                  />
                </svg>
              )}

              {certificate.highlights.map((h) => {
                if (h.style === 'red_circle') {
                  return (
                    <div
                      key={h.id}
                      style={{
                        position: 'absolute',
                        left: `${h.x * 100}%`,
                        top: `${h.y * 100}%`,
                        width: `${h.width * 100}%`,
                        height: `${h.height * 100}%`,
                      }}
                    >
                      <svg
                        viewBox="0 0 100 40"
                        preserveAspectRatio="none"
                        style={{
                          width: '100%',
                          height: '100%',
                          overflow: 'visible',
                        }}
                      >
                        <ellipse
                          cx="50"
                          cy="20"
                          rx="49"
                          ry="18"
                          fill="none"
                          stroke="#b23237"
                          strokeWidth="2.8"
                        />
                      </svg>
                    </div>
                  );
                }

                return (
                  <div
                    key={h.id}
                    className={
                      h.style === 'amber_highlighter' ? 'sb-hl-amber' : undefined
                    }
                    style={{
                      position: 'absolute',
                      left: `${h.x * 100}%`,
                      top: `${h.y * 100}%`,
                      width: `${h.width * 100}%`,
                      height: `${h.height * 100}%`,
                      border:
                        h.style === 'spotlight'
                          ? '1.5px solid #d5a856'
                          : undefined,
                    }}
                  >
                    {h.label && <span className="sb-hl-label">{h.label}</span>}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div
            style={{
              height: 150,
              display: 'grid',
              placeItems: 'center',
              fontSize: 12,
              color: '#8a7f71',
            }}
          >
            Document image unavailable
          </div>
        )}

        {mode !== 'print' && (
          <div className="sb-hover-actions">
            {imageUrl && onInspect && (
              <button
                type="button"
                className="sb-float-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onInspect();
                }}
              >
                <ZoomInIcon size={11} />
                Inspect
              </button>
            )}
            {isEdit && imageUrl && onOpenHighlighter && (
              <button
                type="button"
                className="sb-float-btn sb-edit-only"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenHighlighter();
                }}
              >
                <SparklesIcon size={11} />
                Highlight
              </button>
            )}
            {isEdit && onRemove && (
              <button
                type="button"
                className="sb-float-btn is-danger sb-edit-only"
                title="Remove certificate"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
              >
                <TrashIcon size={11} />
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
