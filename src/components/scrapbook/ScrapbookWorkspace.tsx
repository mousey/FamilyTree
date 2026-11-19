import { useMemo } from 'react';
import type { FamilyGraph, PersonId } from '../../core/index.js';
import {
  buildBookletPages,
  groupIntoSpreads,
  type ScrapbookStoreApi,
} from '../../scrapbook/index.js';
import { BookletOutlineRail } from './BookletOutlineRail.js';
import { BookSpreadStage } from './BookSpreadStage.js';

export interface ScrapbookWorkspaceProps {
  graph: FamilyGraph;
  store: ScrapbookStoreApi;
  viewMode: 'edit' | 'preview';
  spreadIndex: number;
  onChangeSpreadIndex: (nextIndex: number) => void;
  onExportHeirloomZip: () => void;
}

export function ScrapbookWorkspace({
  graph,
  store,
  viewMode,
  spreadIndex,
  onChangeSpreadIndex,
  onExportHeirloomZip,
}: ScrapbookWorkspaceProps) {
  const activePages = useMemo(
    () => buildBookletPages(store.doc, { mode: viewMode }),
    [store.doc, viewMode],
  );
  const spreads = useMemo(() => groupIntoSpreads(activePages), [activePages]);

  const clampedSpreadIdx = Math.min(
    Math.max(0, spreadIndex),
    Math.max(0, spreads.length - 1),
  );
  const activeSpread = spreads[clampedSpreadIdx];

  const activeSpreadPersonIds = useMemo(() => {
    const ids = new Set<PersonId>();
    if (activeSpread?.left && activeSpread.left.kind !== 'cover_tree') {
      ids.add(activeSpread.left.personId);
    }
    if (activeSpread?.right && activeSpread.right.kind !== 'cover_tree') {
      ids.add(activeSpread.right.personId);
    }
    return ids;
  }, [activeSpread]);

  const isCoverActive = activeSpread?.right?.kind === 'cover_tree';

  const handleJumpToPerson = (personId: PersonId) => {
    const targetSpread = spreads.find(
      (sp) =>
        (sp.left && sp.left.kind !== 'cover_tree' && sp.left.personId === personId) ||
        (sp.right && sp.right.kind !== 'cover_tree' && sp.right.personId === personId),
    );
    if (targetSpread) {
      onChangeSpreadIndex(targetSpread.spreadIndex);
    }
  };

  return (
    <div className="scrapbook-workspace">
      <BookletOutlineRail
        graph={graph}
        store={store}
        activePages={activePages}
        activeSpreadPersonIds={activeSpreadPersonIds}
        isCoverActive={isCoverActive}
        onJumpToCover={() => onChangeSpreadIndex(0)}
        onJumpToPerson={handleJumpToPerson}
        onExportHeirloomZip={onExportHeirloomZip}
      />

      <BookSpreadStage
        graph={graph}
        store={store}
        spreads={spreads}
        spreadIndex={clampedSpreadIdx}
        mode={viewMode}
        onChangeSpreadIndex={onChangeSpreadIndex}
        onJumpToPerson={handleJumpToPerson}
      />
    </div>
  );
}
