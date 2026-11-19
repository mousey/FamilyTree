# Heirloom · Family Tree Studio

A modern, privacy-first web application for visualizing, exploring, and printing family trees from standard GEDCOM (`.ged`) files.

Runs entirely client-side in your browser — your family data is parsed in memory and never uploaded to any remote server or third-party service.

---

## Features

- **GEDCOM File Ingestion**: Drag-and-drop or upload standard GEDCOM 5.5 / 5.5.1 exports from Ancestry, MyHeritage, FamilySearch, Gramps, and other genealogy software.
- **Interactive Tree Canvas**:
  - Pan, zoom, and minimap navigation with smooth focus centering.
  - Multi-parent, remarriage, step-family, and adoption relationship support without tangled connector lines.
  - Quick search by name with instant branch highlighting.
  - Side-panel drawer with biographical timelines, vital statistics, and union details.
  - Relationship calculator to find shared ancestors and shortest paths between any two relatives.
- **Multiple Color Themes**: Seamlessly switch between *Warm Parchment* and *Dark Atelier*.

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
# Run unit test suite (GEDCOM parser, date math, graph traversal, print SVG generators)
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
