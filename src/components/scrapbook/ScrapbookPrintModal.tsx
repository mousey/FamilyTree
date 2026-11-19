import { useMemo } from 'react';
import type { FamilyGraph } from '../../core/index.js';
import {
  buildBookletPages,
  type ScrapbookStoreApi,
} from '../../scrapbook/index.js';
import { CloseIcon, DownloadIcon, PrinterIcon } from '../Icons.js';
import { ScrapbookPageRenderer } from './ScrapbookPageRenderer.js';

export interface ScrapbookPrintModalProps {
  graph: FamilyGraph;
  store: ScrapbookStoreApi;
  onClose: () => void;
  onPrintBooklet: () => void;
  onExportHeirloomZip: () => void;
}

export function ScrapbookPrintModal({
  graph,
  store,
  onClose,
  onPrintBooklet,
  onExportHeirloomZip,
}: ScrapbookPrintModalProps) {
  const { doc } = store;

  const printPages = useMemo(
    () => buildBookletPages(doc, { mode: 'print' }),
    [doc],
  );
  const doubleSidedSheets = Math.ceil(printPages.length / 2);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Print Family Scrapbook Booklet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Print Scrapbook Booklet &amp; Save PDF</h2>
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              Prints crisp multi-page portrait sheets with alternating binding gutters and zero edit chrome
            </div>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            style={{ width: 30, height: 30 }}
            onClick={onClose}
            aria-label="Close scrapbook print dialog"
          >
            <CloseIcon size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="print-studio-grid">
            <div className="print-controls">
              <label className="field-label">
                <span>Paper Size</span>
                <select
                  className="field-select"
                  value={doc.paperSize}
                  onChange={(e) =>
                    store.setPaperSize(e.target.value as 'a4' | 'letter')
                  }
                >
                  <option value="a4">A4 Portrait (210 × 297 mm)</option>
                  <option value="letter">US Letter Portrait (8.5 × 11 in)</option>
                </select>
              </label>

              <label className="toggle-row">
                <span>Ink-Saver White Paper</span>
                <input
                  type="checkbox"
                  checked={doc.inkSaverPrint}
                  onChange={(e) => store.setInkSaverPrint(e.target.checked)}
                />
              </label>

              <label className="toggle-row">
                <span>Skip Empty Paperwork / Story Pages</span>
                <input
                  type="checkbox"
                  checked={doc.autoSkipEmptyPages}
                  onChange={(e) => store.setAutoSkipEmptyPages(e.target.checked)}
                />
              </label>

              <div
                style={{
                  marginTop: 'auto',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-subtle)',
                  fontSize: 12,
                  color: 'var(--ink-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <strong>
                  {printPages.length} pages · {doubleSidedSheets} double-sided{' '}
                  {doubleSidedSheets === 1 ? 'sheet' : 'sheets'}
                </strong>
                <span>
                  Tip: Choose &ldquo;Save as PDF&rdquo; and enable background graphics in your browser print dialog to preserve highlighter marks.
                </span>
              </div>
            </div>

            <div
              className="print-preview-stage"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: 420,
                overflow: 'hidden',
              }}
            >
              {printPages[0] && (
                <div
                  style={{
                    width: 310,
                    height: doc.paperSize === 'letter' ? 401 : 438,
                    position: 'relative',
                    boxShadow: 'var(--shadow-panel)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      transform: 'scale(0.5)',
                      transformOrigin: 'top left',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                    }}
                  >
                    <ScrapbookPageRenderer
                      graph={graph}
                      store={store}
                      page={printPages[0]}
                      side="right"
                      mode="print"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={onExportHeirloomZip}>
            <DownloadIcon size={14} />
            Save .heirloom.zip
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onPrintBooklet}
          >
            <PrinterIcon size={14} />
            Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
