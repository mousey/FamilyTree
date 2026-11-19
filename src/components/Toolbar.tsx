import { useEffect, useMemo, useRef, useState } from 'react';
import {
  formatLifespan,
  type FamilyGraph,
  type LineageMode,
  type PersonId,
  type TreeStats,
} from '../core/index.js';
import type { LayoutMode } from '../layout/types.js';
import {
  DownloadIcon,
  LinkUsersIcon,
  MoonIcon,
  PrinterIcon,
  SearchIcon,
  SlidersIcon,
  SunIcon,
  TreeIcon,
  UploadIcon,
} from './Icons.js';

export interface ToolbarProps {
  graph: FamilyGraph;
  stats: TreeStats;
  mode: LayoutMode;
  ancestorLevels: number;
  descendantLevels: number;
  includeSpouses: boolean;
  includeFocusSiblings: boolean;
  includeSpouseAncestors: boolean;
  lineageMode: LineageMode;
  theme: 'light' | 'dark';
  relationshipLabels: ReadonlyMap<PersonId, string>;
  onChangeMode: (mode: LayoutMode) => void;
  onChangeAncestorLevels: (n: number) => void;
  onChangeDescendantLevels: (n: number) => void;
  onToggleSpouses: (v: boolean) => void;
  onToggleFocusSiblings: (v: boolean) => void;
  onToggleSpouseAncestors: (v: boolean) => void;
  onChangeLineageMode: (m: LineageMode) => void;
  onSelectSearchResult: (personId: PersonId) => void;
  onOpenRelationshipFinder: () => void;
  onOpenPrintStudio: () => void;
  onImportFile: (file: File) => void;
  onExportGedcom: () => void;
  onExportJson: () => void;
  onResetDemo: () => void;
  onToggleTheme: () => void;
}

export function Toolbar({
  graph,
  stats,
  mode,
  ancestorLevels,
  descendantLevels,
  includeSpouses,
  includeFocusSiblings,
  includeSpouseAncestors,
  lineageMode,
  theme,
  relationshipLabels,
  onChangeMode,
  onChangeAncestorLevels,
  onChangeDescendantLevels,
  onToggleSpouses,
  onToggleFocusSiblings,
  onToggleSpouseAncestors,
  onChangeLineageMode,
  onSelectSearchResult,
  onOpenRelationshipFinder,
  onOpenPrintStudio,
  onImportFile,
  onExportGedcom,
  onExportJson,
  onResetDemo,
  onToggleTheme,
}: ToolbarProps) {
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [openMenu, setOpenMenu] = useState<'options' | 'io' | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setOpenMenu(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const closeMenus = () => {
      setOpenMenu(null);
      setSearchOpen(false);
    };
    window.addEventListener('click', closeMenus);
    return () => window.removeEventListener('click', closeMenus);
  }, []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = graph.getAllPersons();
    if (!q) return all.slice(0, 10);
    return all
      .filter((p) => {
        const hay = [
          p.name.display,
          p.birth?.place,
          p.birth?.date?.raw,
          p.death?.date?.raw,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 12);
  }, [graph, query]);

  const genSpan =
    stats.minGenerationFromRoot !== undefined && stats.maxGenerationFromRoot !== undefined
      ? stats.maxGenerationFromRoot - stats.minGenerationFromRoot + 1
      : null;

  return (
    <header className="toolbar" onClick={(e) => e.stopPropagation()}>
      <div className="toolbar-brand">
        <div className="brand-emblem">
          <TreeIcon size={19} />
        </div>
        <div className="brand-meta">
          <span className="brand-title" title={graph.tree.metadata.title ?? 'Heirloom Family Tree'}>
            {graph.tree.metadata.title ?? 'Heirloom'}
          </span>
          <span className="brand-subtitle">
            {stats.personCount} people · {stats.unionCount} unions
            {genSpan ? ` · ${genSpan} gen` : ''}
          </span>
        </div>
      </div>

      <div className="toolbar-divider" />

      {/* Search */}
      <div className="search-wrap">
        <div className="search-input-box">
          <SearchIcon size={14} style={{ color: 'var(--ink-muted)', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search…"
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setSearchOpen(true);
              setActiveResultIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveResultIdx((i) => Math.min(searchResults.length - 1, i + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveResultIdx((i) => Math.max(0, i - 1));
              } else if (e.key === 'Enter' && searchResults[activeResultIdx]) {
                onSelectSearchResult(searchResults[activeResultIdx]!.id);
                setSearchOpen(false);
                setQuery('');
              }
            }}
          />
          <span className="search-kbd">/</span>
        </div>

        {searchOpen && (
          <div className="search-dropdown">
            {searchResults.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--ink-muted)' }}>
                No matching relatives found
              </div>
            ) : (
              searchResults.map((p, idx) => (
                <button
                  key={p.id}
                  type="button"
                  className={`search-item ${idx === activeResultIdx ? 'is-active' : ''}`}
                  onClick={() => {
                    onSelectSearchResult(p.id);
                    setSearchOpen(false);
                    setQuery('');
                  }}
                >
                  <div>
                    <div className="search-item-name">{p.name.display}</div>
                    <div className="search-item-meta">
                      {formatLifespan(p.birth, p.death) || 'Dates unknown'}
                    </div>
                  </div>
                  {relationshipLabels.get(p.id) && (
                    <span className="search-item-rel">{relationshipLabels.get(p.id)}</span>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Mode Switcher */}
      <div className="segmented" role="group" aria-label="Layout mode">
        {(
          [
            ['hourglass', 'Hourglass'],
            ['ancestors', 'Ancestors'],
            ['descendants', 'Descendants'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            className={`segmented-btn ${mode === m ? 'is-active' : ''}`}
            onClick={() => onChangeMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Generation Level Steppers */}
      <div className="stepper-group">
        {mode !== 'descendants' && (
          <div className="stepper" title="Ancestor generations above focus">
            <span className="stepper-label">↑ Up</span>
            <button
              type="button"
              className="stepper-btn"
              disabled={ancestorLevels <= 0}
              onClick={() => onChangeAncestorLevels(Math.max(0, ancestorLevels - 1))}
            >
              −
            </button>
            <span className="stepper-val">{ancestorLevels}</span>
            <button
              type="button"
              className="stepper-btn"
              disabled={ancestorLevels >= 8}
              onClick={() => onChangeAncestorLevels(Math.min(8, ancestorLevels + 1))}
            >
              +
            </button>
          </div>
        )}

        {mode !== 'ancestors' && (
          <div className="stepper" title="Descendant generations below focus">
            <span className="stepper-label">↓ Down</span>
            <button
              type="button"
              className="stepper-btn"
              disabled={descendantLevels <= 0}
              onClick={() => onChangeDescendantLevels(Math.max(0, descendantLevels - 1))}
            >
              −
            </button>
            <span className="stepper-val">{descendantLevels}</span>
            <button
              type="button"
              className="stepper-btn"
              disabled={descendantLevels >= 8}
              onClick={() => onChangeDescendantLevels(Math.min(8, descendantLevels + 1))}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="toolbar-spacer" />

      {/* Right Actions */}
      <div className="toolbar-actions">
        {/* Display Options Popover */}
        <div className="popover-anchor">
          <button
            type="button"
            className={`btn ${openMenu === 'options' ? 'btn-active' : ''}`}
            onClick={() => setOpenMenu(openMenu === 'options' ? null : 'options')}
          >
            <SlidersIcon size={14} />
            Display
          </button>

          {openMenu === 'options' && (
            <div className="popover-menu">
              <div className="popover-title">Tree Display</div>
              <label className="toggle-row">
                <span>Show spouses &amp; remarriages</span>
                <input
                  type="checkbox"
                  checked={includeSpouses}
                  onChange={(e) => onToggleSpouses(e.target.checked)}
                />
              </label>
              {mode === 'hourglass' && (
                <>
                  <label className="toggle-row">
                    <span>Show focus siblings</span>
                    <input
                      type="checkbox"
                      checked={includeFocusSiblings}
                      onChange={(e) => onToggleFocusSiblings(e.target.checked)}
                    />
                  </label>
                  <label className="toggle-row">
                    <span>Show spouse&apos;s ancestors</span>
                    <input
                      type="checkbox"
                      checked={includeSpouseAncestors}
                      disabled={!includeSpouses}
                      onChange={(e) => onToggleSpouseAncestors(e.target.checked)}
                    />
                  </label>
                </>
              )}

              <div className="popover-title" style={{ marginTop: 4 }}>
                Lineage Filter
              </div>
              <select
                className="field-select"
                value={lineageMode}
                onChange={(e) => onChangeLineageMode(e.target.value as LineageMode)}
              >
                <option value="all">All Links (Biological, Adopted, Step)</option>
                <option value="legal">Legal Lineage (Biological &amp; Adopted)</option>
                <option value="biological">Biological Lineage Only</option>
              </select>
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn"
          onClick={onOpenRelationshipFinder}
          title="Find how any two relatives are connected"
        >
          <LinkUsersIcon size={14} />
          Relations
        </button>

        {/* Import / Export Popover */}
        <div className="popover-anchor">
          <button
            type="button"
            className={`btn ${openMenu === 'io' ? 'btn-active' : ''}`}
            onClick={() => setOpenMenu(openMenu === 'io' ? null : 'io')}
          >
            <UploadIcon size={14} />
            File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ged,.gedcom,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onImportFile(f);
                e.target.value = '';
                setOpenMenu(null);
              }
            }}
          />

          {openMenu === 'io' && (
            <div className="popover-menu" style={{ width: 236 }}>
              <div className="popover-title">Import &amp; Export</div>
              <button
                type="button"
                className="menu-action"
                onClick={() => fileInputRef.current?.click()}
              >
                <UploadIcon size={15} />
                Import .GED or .JSON…
              </button>
              <button
                type="button"
                className="menu-action"
                onClick={() => {
                  onExportGedcom();
                  setOpenMenu(null);
                }}
              >
                <DownloadIcon size={15} />
                Export GEDCOM (.ged)
              </button>
              <button
                type="button"
                className="menu-action"
                onClick={() => {
                  onExportJson();
                  setOpenMenu(null);
                }}
              >
                <DownloadIcon size={15} />
                Export JSON (.json)
              </button>
              <div style={{ height: 1, background: 'var(--border-hairline)', margin: '2px 0' }} />
              <button
                type="button"
                className="menu-action"
                onClick={() => {
                  onResetDemo();
                  setOpenMenu(null);
                }}
              >
                <TreeIcon size={15} />
                Load Hawthorne–Vance Demo
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onOpenPrintStudio}
          title="Configure generation levels and print or export as A3"
        >
          <PrinterIcon size={14} />
          A3 Print
        </button>

        <button
          type="button"
          className="btn btn-icon"
          onClick={onToggleTheme}
          title={theme === 'light' ? 'Switch to Dark Atelier theme' : 'Switch to Warm Parchment theme'}
          aria-label="Toggle color theme"
        >
          {theme === 'light' ? <MoonIcon size={15} /> : <SunIcon size={15} />}
        </button>
      </div>
    </header>
  );
}
