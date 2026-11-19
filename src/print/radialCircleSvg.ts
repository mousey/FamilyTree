import {
  escapeXml,
  formatCompactLifespan,
  truncateText,
  type PedigreeTreeData,
} from './ahnentafel.js';
import type { PrintOrientation } from './classicPrintSvg.js';

export interface RadialCircleSvgOptions {
  title: string;
  subtitle: string;
  orientation: PrintOrientation;
  showEmptySlots: boolean;
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeAnnularSector(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startDeg: number,
  endDeg: number,
): string {
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  const p1 = polarToCartesian(cx, cy, rOuter, startDeg);
  const p2 = polarToCartesian(cx, cy, rOuter, endDeg);
  const p3 = polarToCartesian(cx, cy, rInner, endDeg);
  const p4 = polarToCartesian(cx, cy, rInner, startDeg);

  return [
    `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`,
    `A ${rOuter.toFixed(1)} ${rOuter.toFixed(1)} 0 ${largeArc} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`,
    `L ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`,
    `A ${rInner.toFixed(1)} ${rInner.toFixed(1)} 0 ${largeArc} 0 ${p4.x.toFixed(1)} ${p4.y.toFixed(1)}`,
    'Z',
  ].join(' ');
}

/**
 * Heritage archival watercolor tints for the 4 grandparent quadrants:
 * 0 = Paternal Grandfather (slate), 1 = Paternal Grandmother (sage),
 * 2 = Maternal Grandfather (ochre), 3 = Maternal Grandmother (rose).
 */
const QUADRANT_PALETTES: readonly (readonly string[])[] = [
  ['#E3EBF1', '#EAF0F5', '#EFF4F8', '#F4F8FA', '#F7FAFC'], // Paternal Grandfather
  ['#E2EDE6', '#E9F2EC', '#EFF6F1', '#F4F9F6', '#F8FBF9'], // Paternal Grandmother
  ['#F4EBDA', '#F7F0E3', '#FAF4EA', '#FCF8F1', '#FDFBF7'], // Maternal Grandfather
  ['#F3E4E3', '#F6EAE9', '#F9F0EF', '#FBF5F4', '#FDF9F9'], // Maternal Grandmother
];

function sectorFillColor(
  generation: number,
  slotIndex: number,
  hasPerson: boolean,
): string {
  if (!hasPerson) return '#FAF7F0';
  if (generation === 1) {
    return slotIndex === 0 ? '#E6EDF0' : '#F4ECE5';
  }
  const shift = Math.max(0, generation - 2);
  const quadrant = Math.min(3, slotIndex >> shift);
  const palette = QUADRANT_PALETTES[quadrant] ?? QUADRANT_PALETTES[0]!;
  const depthIdx = Math.min(palette.length - 1, Math.max(0, generation - 2));
  return palette[depthIdx]!;
}

/**
 * Generates a museum-grade 360-degree Complete Circle Radial Pedigree Chart on A3 paper.
 * Focus person sits in the central medallion; generations 1..N radiate outward in concentric rings.
 */
export function buildRadialCircleA3Svg(
  pedigree: PedigreeTreeData,
  options: RadialCircleSvgOptions,
): string {
  const isLandscape = options.orientation === 'landscape';
  const pageW = isLandscape ? 4200 : 2970;
  const pageH = isLandscape ? 2970 : 4200;
  const mmW = isLandscape ? 420 : 297;
  const mmH = isLandscape ? 297 : 420;

  const levels = Math.max(1, Math.min(7, pedigree.maxGenerations));
  const cx = pageW / 2;
  const cy = isLandscape ? 1585 : 2160;
  const maxR = isLandscape ? 1195 : 1315;
  const r0 = levels <= 3 ? 250 : levels === 4 ? 225 : levels === 5 ? 195 : 165;

  // Allocate ring thicknesses with extra radial room for outer spoke-text rings
  const weights = Array.from({ length: levels }, (_, i) => {
    const g = i + 1;
    if (g <= 2) return 1.05;
    if (g === 3) return levels <= 4 ? 1.15 : 1.05;
    return 1.32;
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const usableSpan = maxR - r0;

  const radii: number[] = [r0];
  let acc = r0;
  for (let i = 0; i < levels; i++) {
    acc += (weights[i]! / totalWeight) * usableSpan;
    radii.push(acc);
  }

  const sectorPaths: string[] = [];
  const labelNodes: string[] = [];

  // Render concentric rings 1 .. levels
  for (let g = 1; g <= levels; g++) {
    const rInner = radii[g - 1]!;
    const rOuter = radii[g]!;
    const rMid = (rInner + rOuter) / 2;
    const ringThickness = rOuter - rInner;
    const genSlots = pedigree.byGeneration[g] ?? [];
    const totalSlots = genSlots.length;
    const stepDeg = 360 / totalSlots;

    // Use tangential (circumferential) text for inner wide wedges, radial spoke text for outer wedges
    const useRadialText = g >= 4 || (g === 3 && levels >= 5);

    for (let s = 0; s < totalSlots; s++) {
      const slot = genSlots[s]!;
      const hasPerson = slot.person !== undefined;
      if (!options.showEmptySlots && !hasPerson) continue;

      // Start at -180° (9 o'clock): top half = Father (-180..0), bottom half = Mother (0..180)
      const startDeg = -180 + s * stepDeg;
      const endDeg = startDeg + stepDeg;
      const midDeg = (startDeg + endDeg) / 2;

      const fill = sectorFillColor(g, s, hasPerson);
      const stroke = hasPerson ? '#B4A690' : '#DED5C6';
      const strokeW = g <= 2 ? 2.2 : g <= 4 ? 1.5 : 1.0;

      sectorPaths.push(
        `<path d="${describeAnnularSector(cx, cy, rInner, rOuter, startDeg, endDeg)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`,
      );

      if (!slot.person) continue;

      const p = polarToCartesian(cx, cy, rMid, midDeg);
      const arcLength = (stepDeg * Math.PI * rMid) / 180;
      const lifespan = formatCompactLifespan(slot.person);

      if (!useRadialText) {
        // Tangential text: keep upright on BOTH top semicircle (-180..0) and bottom semicircle (0..180)!
        const isBottomHalf = midDeg > 0 && midDeg < 180;
        const rotDeg = isBottomHalf ? midDeg - 90 : midDeg + 90;

        const baseNameSize = g === 1 ? 36 : g === 2 ? 28 : 22;
        const nameSize = Math.min(baseNameSize, Math.max(13, ringThickness * 0.2));
        const dateSize = Math.max(10.5, nameSize * 0.64);
        const maxChars = Math.max(10, Math.floor((arcLength * 0.78) / (nameSize * 0.52)));
        const nameText = truncateText(slot.person.name.display, maxChars);

        labelNodes.push(
          [
            `<g transform="translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) rotate(${rotDeg.toFixed(1)})">`,
            `<text x="0" y="${lifespan ? (-dateSize * 0.45).toFixed(1) : (nameSize * 0.34).toFixed(1)}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${nameSize.toFixed(1)}" font-weight="700" fill="#221D18">${escapeXml(nameText)}${slot.isDuplicate ? ' ∞' : ''}</text>`,
            lifespan
              ? `<text x="0" y="${(dateSize * 0.95).toFixed(1)}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${dateSize.toFixed(1)}" font-weight="500" fill="#5C5349">${escapeXml(lifespan)}</text>`
              : '',
            `</g>`,
          ].join(''),
        );
      } else {
        // Radial spoke text: flip 180° on left semicircle so every single name reads upright left-to-right!
        const normDeg = ((midDeg % 360) + 360) % 360;
        const isLeftHalf = normDeg > 90 && normDeg < 270;
        const rotDeg = isLeftHalf ? midDeg + 180 : midDeg;

        // Constrain font size by available arc chord height at inner edge of this wedge
        const innerArcH = (stepDeg * Math.PI * (rInner + ringThickness * 0.18)) / 180;
        const maxFontByArc = innerArcH * 0.54;
        const nameSize = Math.min(
          g === 3 ? 18 : g === 4 ? 17 : g === 5 ? 14 : g === 6 ? 10.5 : 8,
          Math.max(6.5, maxFontByArc),
        );
        const showLifespan = innerArcH >= 28 && lifespan.length > 0;
        const dateSize = Math.max(6.5, nameSize * 0.72);
        const maxChars = Math.max(10, Math.floor((ringThickness * 0.88) / (nameSize * 0.44)));
        const nameText = truncateText(slot.person.name.display, maxChars);

        labelNodes.push(
          [
            `<g transform="translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)}) rotate(${rotDeg.toFixed(1)})">`,
            `<text x="0" y="${showLifespan ? (-dateSize * 0.25).toFixed(1) : (nameSize * 0.34).toFixed(1)}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${nameSize.toFixed(1)}" font-weight="700" fill="#221D18">${escapeXml(nameText)}${slot.isDuplicate ? ' ∞' : ''}</text>`,
            showLifespan
              ? `<text x="0" y="${(dateSize * 1.05).toFixed(1)}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${dateSize.toFixed(1)}" font-weight="500" fill="#5C5349">${escapeXml(lifespan)}</text>`
              : '',
            `</g>`,
          ].join(''),
        );
      }
    }
  }

  // Outer decorative gold border ring around the entire circle
  const outerRingSvg = [
    `<circle cx="${cx}" cy="${cy}" r="${(maxR + 12).toFixed(1)}" fill="none" stroke="#A67B35" stroke-width="2.5"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${maxR.toFixed(1)}" fill="none" stroke="#2B5240" stroke-width="2"/>`,
  ].join('\n');

  // Center Focus Medallion
  const focus = pedigree.focusPerson;
  const focusNameParts = focus.name.display.trim().split(/\s+/);
  const focusLine1 =
    focusNameParts.length > 1
      ? focusNameParts.slice(0, -1).join(' ')
      : focus.name.display;
  const focusLine2 =
    focusNameParts.length > 1 ? focusNameParts[focusNameParts.length - 1]! : '';
  const focusLifespan = formatCompactLifespan(focus);
  const focusFont = r0 >= 210 ? 36 : r0 >= 180 ? 30 : 25;

  const centerMedallionSvg = [
    `<circle cx="${cx}" cy="${cy}" r="${r0.toFixed(1)}" fill="#2B5240" stroke="#A67B35" stroke-width="4"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${(r0 - 11).toFixed(1)}" fill="none" stroke="#D5B87A" stroke-width="1.3" opacity="0.75"/>`,
    `<text x="${cx}" y="${(cy - (focusLine2 ? 18 : 4)).toFixed(1)}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${focusFont}" font-weight="700" fill="#FFFDF8">${escapeXml(truncateText(focusLine1, 16))}</text>`,
    focusLine2
      ? `<text x="${cx}" y="${(cy + focusFont * 0.62).toFixed(1)}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${focusFont}" font-weight="700" fill="#FFFDF8">${escapeXml(truncateText(focusLine2, 16))}</text>`
      : '',
    focusLifespan
      ? `<text x="${cx}" y="${(cy + focusFont * 1.48).toFixed(1)}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${Math.round(focusFont * 0.52)}" font-weight="500" fill="#D7E5DC">${escapeXml(focusLifespan)}</text>`
      : '',
  ].join('\n');

  // Subtle 4-quadrant lineage key along bottom
  const legendItems = [
    { label: 'Paternal Grandfather', color: '#E3EBF1' },
    { label: 'Paternal Grandmother', color: '#E2EDE6' },
    { label: 'Maternal Grandfather', color: '#F4EBDA' },
    { label: 'Maternal Grandmother', color: '#F3E4E3' },
  ];
  const legendStartX = cx - 540;
  const legendY = pageH - 88;
  const legendSvg = legendItems
    .map((item, idx) => {
      const lx = legendStartX + idx * 285;
      return `<rect x="${lx}" y="${legendY - 14}" width="22" height="16" rx="4" fill="${item.color}" stroke="#B4A690" stroke-width="1.2"/><text x="${lx + 30}" y="${legendY}" font-family="Plus Jakarta Sans, sans-serif" font-size="18" fill="#685F56">${item.label}</text>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mmW}mm" height="${mmH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect width="${pageW}" height="${pageH}" fill="#FCF9F3"/>
  <rect x="46" y="46" width="${pageW - 92}" height="${pageH - 92}" fill="none" stroke="#C9BCA7" stroke-width="3"/>
  <rect x="64" y="64" width="${pageW - 128}" height="${pageH - 128}" fill="none" stroke="#2B5240" stroke-width="1.5"/>

  <text x="${cx}" y="156" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="78" font-weight="700" fill="#221D18">${escapeXml(options.title)}</text>
  <text x="${cx}" y="210" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="25" font-weight="500" fill="#685F56">${escapeXml(options.subtitle)}</text>
  <line x1="${cx - 210}" y1="238" x2="${cx + 210}" y2="238" stroke="#A67B35" stroke-width="2"/>

  <g id="radial-sectors">
    ${sectorPaths.join('\n    ')}
    ${outerRingSvg}
  </g>

  <g id="radial-labels">
    ${labelNodes.join('\n    ')}
  </g>

  <g id="center-medallion">
    ${centerMedallionSvg}
  </g>

  <text x="110" y="${pageH - 84}" font-family="Plus Jakarta Sans, sans-serif" font-size="19" fill="#8A8074">360° Radial Pedigree · ${isLandscape ? 'Landscape' : 'Portrait'}</text>
  ${legendSvg}
  <text x="${pageW - 110}" y="${pageH - 84}" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="19" fill="#8A8074">${pedigree.populatedCount} recorded · ${levels} rings</text>
</svg>`;
}
