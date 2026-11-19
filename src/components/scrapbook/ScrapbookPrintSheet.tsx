import { useMemo } from 'react';
import type { FamilyGraph } from '../../core/index.js';
import {
  buildBookletPages,
  type ScrapbookStoreApi,
} from '../../scrapbook/index.js';
import { ScrapbookPageRenderer } from './ScrapbookPageRenderer.js';

export interface ScrapbookPrintSheetProps {
  graph: FamilyGraph;
  store: ScrapbookStoreApi;
}

/**
 * Hidden on screen; rendered cleanly inside .scrapbook-print-only during window.print()
 * with alternating odd/even binding gutters and zero interactive chrome.
 */
export function ScrapbookPrintSheet({ graph, store }: ScrapbookPrintSheetProps) {
  const pages = useMemo(
    () => buildBookletPages(store.doc, { mode: 'print' }),
    [store.doc],
  );
  const isLetter = store.doc.paperSize === 'letter';

  return (
    <div className="scrapbook-print-only">
      {pages.map((page) => {
        const isOdd = page.pageNumber % 2 === 1;
        return (
          <div
            key={page.id}
            className={`sb-print-page-sheet ${isOdd ? 'is-odd' : 'is-even'} ${
              isLetter ? 'is-letter' : ''
            }`}
          >
            <ScrapbookPageRenderer
              graph={graph}
              store={store}
              page={page}
              side={isOdd ? 'right' : 'left'}
              mode="print"
            />
          </div>
        );
      })}
    </div>
  );
}
