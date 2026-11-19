# Heirloom · Family Tree Studio

A modern, privacy-first web application for visualizing, exploring, curating family scrapbooks, and printing family trees from GEDCOM (`.ged`, `.gdz`) and portable Heirloom Scrapbook (`.heirloom.zip`) files.

Runs entirely client-side in your browser — your family data, photos, and certificates stay on your device (with optional local browser `IndexedDB` draft auto-save) and are never uploaded to any remote server or third-party service.

---

## Features

- **Flexible File Ingestion & Portable Bundles**:
  - Drag-and-drop or import standard GEDCOM 5.5 / 5.5.1 (`.ged`), GEDCOM 7.0 GEDZIP (`.gdz` with embedded media), FamilyTree JSON (`.json`), and portable Heirloom Scrapbook bundles (`.heirloom.zip`).
  - Auto-saves working sessions locally in browser `IndexedDB` with a one-click **Clear Local Browser Draft** wipe for shared devices.
- **Interactive Tree Canvas**:
  - Pan, zoom, and minimap navigation with smooth focus centering.
  - Multi-parent, remarriage, step-family, and adoption relationship support without tangled connector lines.
  - Quick search by name with instant branch highlighting.
  - Side-panel drawer with biographical timelines, vital statistics, union details, portrait upload, and one-click **Scrapbook** jump.
  - Relationship calculator to find shared ancestors and shortest paths between any two relatives.
- **Multiple Color Themes**: Seamlessly switch between *Warm Parchment* and *Dark Atelier*.

---

## Family Scrapbook Booklet Mode

Switch seamlessly from **Tree** to **Scrapbook** in the top toolbar to curate a printable, 2-up open-book album around any focal person and their immediate family constellation (spouse, children, siblings, parents, and grandparents):

- **Booklet Outline Rail**: Include/exclude relatives, add extended family members, reorder chapters, switch sparse relatives to a condensed **Compact 1-Page** card, and toggle individual pages per person.
- **4 Heirloom Page Templates**:
  1. **Cover & Constellation Tree**: Editable album title and clickable SVG family tree medallion chart acting as a visual table of contents.
  2. **Person Profile**: Photo-cornered portrait frame (synced with Tree avatars), ruled-paper handwritten life timeline, and a tilted Polaroid group photo with masking tape and handwritten caption.
  3. **Archival Paperwork & Record Highlighter**: Interleaved birth, marriage, death, and census scans (images or client-side rasterized PDFs), shared family document reuse, and an interactive **Record Highlighter** (`Amber Highlighter`, `Red Ink Circle`, `Spotlight Dim`) with optional pinned magnified row callout strips.
  4. **Story, Extra Photos & Places Lived**: Pre-seeded editable biographical notebook, extra Polaroids, and **Places Lived** address postcards with one-click *Open in Google Maps ↗* links and `⌘V` / `Ctrl+V` screenshot pasting.
- **Multi-Page Booklet Printing & Portable Export**:
  - Print or save crisp **A4 Portrait** or **US Letter Portrait** multi-page PDFs with alternating inner binding gutters, an **Ink-Saver White Paper** option, and automatic skipping of empty optional pages.
  - Export your entire curated album (`tree.ged` + `scrapbook.json` + deduplicated `media/*`) as a single **`.heirloom.zip`** archive to back up or share.

---

## 4 Heirloom Print & Vector Export Formats

Configure generation depths and focal ancestors to generate print-ready vector documents (SVG download or PDF print):

1. **Classic Orthogonal Tree**:
   - Clean, structured pedigree and descendant layout with distinct connector line styles for biological, adopted, step, and marriage relationships.
2. **Heritage Oak (Botanical Tree)**:
   - Botanical heirloom illustration featuring custom gnarled oak trunk geometry, hand-drawn leaf clusters, blooming floral accents, and descendant roots.
3. **360° Complete Circle Radial Pedigree**:
   - Concentric circular pedigree placing a chosen focal ancestor at the center medallion and expanding outward through successive generational rings.
4. **Sideways Archival Pedigree**:
   - Traditional horizontal (left-to-right) pedigree chart with vintage bracket styling and generational alignment.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or newer)
- npm or bun

### Local Development

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser at `http://localhost:5173`.

### Testing & Validation

```bash
# Run unit test suite (GEDCOM parser, date math, graph traversal, print SVG generators, scrapbook engine)
npm test

# Run TypeScript typecheck
npm run typecheck
```

### Production Build

```bash
npm run build
```

The compiled static site will be written to `dist/`, ready to be hosted on GitHub Pages or any static web host.

---

## License

MIT
