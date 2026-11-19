import {
  escapeXml,
  formatCompactBirth,
  formatCompactLifespan,
  truncateText,
  type PedigreeSlot,
  type PedigreeTreeData,
} from './ahnentafel.js';
import type { PrintOrientation } from './classicPrintSvg.js';

export interface BotanicalTreeSvgOptions {
  title: string;
  subtitle: string;
  orientation: PrintOrientation;
  showEmptySlots: boolean;
  includeChildrenRoots?: boolean;
  /** Optional spouse pedigree: when provided, Focus's ancestors fill the left horseshoe and Spouse's fill the right! */
  spousePedigree?: PedigreeTreeData;
}

function polar(
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

/**
 * Draws a delicate botanical leafy garland vine along a circular arc (clockwise from startDeg to endDeg).
 */
function drawBotanicalVineArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  leafScale = 1,
): string {
  const p1 = polar(cx, cy, r, startDeg);
  const p2 = polar(cx, cy, r, endDeg);
  const sweep = endDeg - startDeg;
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;

  const parts: string[] = [
    `<path d="M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${largeArc} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}" fill="none" stroke="#7A9270" stroke-width="${(1.8 * leafScale).toFixed(1)}" stroke-linecap="round"/>`,
  ];

  const arcLen = (Math.abs(sweep) * Math.PI * r) / 180;
  const stepPx = 28 * leafScale;
  const count = Math.max(2, Math.floor(arcLen / stepPx));

  for (let i = 1; i < count; i++) {
    const u = i / count;
    const deg = startDeg + u * sweep;
    const pt = polar(cx, cy, r, deg);
    const tangentDeg = deg + 90;
    const side = i % 2 === 0 ? 1 : -1;
    const leafRot = tangentDeg + side * 36;
    const green = i % 3 === 0 ? '#6A875D' : i % 3 === 1 ? '#87A476' : '#56734C';
    const sc = (0.85 + (i % 3) * 0.1) * leafScale;

    parts.push(
      `<path d="M 0 0 C 4 -5.5 13 -5.5 18 0 C 13 5.5 4 5.5 0 0 Z" transform="translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) rotate(${leafRot.toFixed(1)}) scale(${sc.toFixed(2)})" fill="${green}" opacity="0.82"/>`,
    );

    // Subtle dusty-rose floral bud accents along the garland
    if (i % 5 === 2) {
      const budRot = tangentDeg - side * 42;
      const budColor = i % 10 === 2 ? '#C98EA2' : '#D9A7B8';
      parts.push(
        `<ellipse cx="6" cy="0" rx="5.5" ry="3.2" transform="translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) rotate(${budRot.toFixed(1)}) scale(${sc.toFixed(2)})" fill="${budColor}" opacity="0.88"/>`,
      );
    }
  }

  return parts.join('');
}

/**
 * Draws a delicate botanical leafy sprig along a radial spoke between r1 and r2.
 */
function drawBotanicalVineSpoke(
  cx: number,
  cy: number,
  r1: number,
  r2: number,
  angleDeg: number,
  leafScale = 1,
): string {
  const p1 = polar(cx, cy, r1, angleDeg);
  const p2 = polar(cx, cy, r2, angleDeg);
  const len = Math.abs(r2 - r1);
  const stepPx = 24 * leafScale;
  const count = Math.max(2, Math.floor(len / stepPx));

  const parts: string[] = [
    `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="#7A9270" stroke-width="${(1.7 * leafScale).toFixed(1)}" stroke-linecap="round"/>`,
  ];

  for (let i = 1; i < count; i++) {
    const r = r1 + (i / count) * (r2 - r1);
    const pt = polar(cx, cy, r, angleDeg);
    const side = i % 2 === 0 ? 1 : -1;
    const leafRot = angleDeg + side * 38;
    const green = i % 2 === 0 ? '#6E8C60' : '#8AA679';
    const sc = 0.82 * leafScale;

    parts.push(
      `<path d="M 0 0 C 4 -5 12 -5 17 0 C 12 5 4 5 0 0 Z" transform="translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) rotate(${leafRot.toFixed(1)}) scale(${sc.toFixed(2)})" fill="${green}" opacity="0.85"/>`,
    );

    if (i % 4 === 2) {
      const budRot = angleDeg - side * 42;
      parts.push(
        `<ellipse cx="5.5" cy="0" rx="5" ry="2.9" transform="translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) rotate(${budRot.toFixed(1)}) scale(${sc.toFixed(2)})" fill="#C98EA2" opacity="0.88"/>`,
      );
    }
  }

  return parts.join('');
}

/**
 * Draws a finely illustrated central botanical heritage tree with sculpted trunk,
 * spreading roots, gracefully curved branching limbs, sage leaves, and blossom buds.
 */
function drawCenterpieceBotanicalTree(
  cx: number,
  cy: number,
  scale: number,
): string {
  // Tree coordinate space centered around (0, 0), spanning roughly x: [-340..340], y: [-340..420]
  const limbs: Array<{ d: string; w: number }> = [
    // Major primary limbs splitting out of the trunk
    { d: 'M -8 65 C -48 -15 -125 -45 -225 -95', w: 17 },
    { d: 'M -4 40 C -35 -55 -85 -130 -155 -215', w: 15 },
    { d: 'M 0 25 C -8 -75 -18 -165 -35 -265', w: 13 },
    { d: 'M 4 40 C 35 -55 85 -130 155 -215', w: 15 },
    { d: 'M 8 65 C 48 -15 125 -45 225 -95', w: 17 },
    // Lower side boughs
    { d: 'M -12 85 C -95 45 -185 35 -268 18', w: 12 },
    { d: 'M 12 85 C 95 45 185 35 268 18', w: 12 },
    // Secondary branches & twigs
    { d: 'M -110 -35 C -165 -20 -225 -10 -285 -35', w: 8 },
    { d: 'M -135 -60 C -175 -110 -215 -140 -265 -155', w: 7.5 },
    { d: 'M -82 -112 C -135 -145 -180 -185 -220 -225', w: 7.5 },
    { d: 'M -62 -140 C -75 -198 -95 -245 -118 -292', w: 7 },
    { d: 'M -14 -120 C -45 -185 -55 -240 -60 -305', w: 6.5 },
    { d: 'M -6 -130 C 18 -195 32 -250 48 -305', w: 6.5 },
    { d: 'M 62 -140 C 75 -198 95 -245 118 -292', w: 7 },
    { d: 'M 82 -112 C 135 -145 180 -185 220 -225', w: 7.5 },
    { d: 'M 135 -60 C 175 -110 215 -140 265 -155', w: 7.5 },
    { d: 'M 110 -35 C 165 -20 225 -10 285 -35', w: 8 },
    { d: 'M -165 40 C -215 68 -245 92 -278 108', w: 6 },
    { d: 'M 165 40 C 215 68 245 92 278 108', w: 6 },
    { d: 'M -195 -80 C -238 -72 -268 -68 -308 -86', w: 5.5 },
    { d: 'M 195 -80 C 238 -72 268 -68 308 -86', w: 5.5 },
    { d: 'M -25 -220 C -5 -265 4 -298 10 -330', w: 5 },
  ];

  // Organic spreading root tendrils
  const roots: Array<{ d: string; w: number }> = [
    { d: 'M -22 308 C -65 326 -132 332 -215 352', w: 9 },
    { d: 'M -14 316 C -52 346 -98 370 -162 396', w: 7 },
    { d: 'M -6 322 C -26 360 -46 392 -78 422', w: 5.5 },
    { d: 'M 0 324 C 0 362 -8 395 -14 432', w: 4.5 },
    { d: 'M 6 322 C 26 360 46 392 78 422', w: 5.5 },
    { d: 'M 14 316 C 52 346 98 370 162 396', w: 7 },
    { d: 'M 22 308 C 65 326 132 332 215 352', w: 9 },
    { d: 'M -105 338 C -132 355 -158 368 -188 376', w: 4 },
    { d: 'M 105 338 C 132 355 158 368 188 376', w: 4 },
    { d: 'M -68 360 C -85 384 -98 402 -118 416', w: 3.5 },
    { d: 'M 68 360 C 85 384 98 402 118 416', w: 3.5 },
  ];

  // Blossom & leaf cluster anchor points around the illustrated canopy
  const foliagePoints: Array<[number, number, number]> = [
    [-280, 108, -145], [-265, 22, -165], [-302, -32, -172], [-306, -88, -155],
    [-268, -152, -135], [-222, -222, -122], [-162, -255, -108], [-118, -295, -98],
    [-58, -308, -88], [8, -326, -85], [52, -304, -75], [118, -295, -72],
    [162, -255, -62], [222, -222, -48], [268, -152, -35], [306, -88, -22],
    [302, -32, -8], [265, 22, 8], [280, 108, 25],
    // Inner canopy clusters
    [-215, -92, -140], [-185, -160, -125], [-145, -195, -110], [-95, -210, -95],
    [-32, -235, -88], [32, -235, -82], [95, -210, -70], [145, -195, -58],
    [185, -160, -45], [215, -92, -32],
    [-192, 42, -158], [-148, -28, -145], [-92, -82, -125], [-45, -125, -100],
    [45, -125, -75], [92, -82, -52], [148, -28, -32], [192, 42, -12],
    [-238, -28, -162], [238, -28, -18], [-115, -145, -118], [115, -145, -62],
    [0, -165, -90], [-160, 75, -150], [160, 75, -25], [-68, -42, -120], [68, -42, -55],
  ];

  const foliageSvgs: string[] = [];
  foliagePoints.forEach(([fx, fy, deg], idx) => {
    const g1 = idx % 3 === 0 ? '#6E8F5D' : idx % 3 === 1 ? '#87A870' : '#58784C';
    const g2 = idx % 2 === 0 ? '#97B37F' : '#6A8B5B';
    // Pair of botanical leaves
    foliageSvgs.push(
      `<path d="M 0 0 C 7 -9 22 -9 31 0 C 22 9 7 9 0 0 Z" transform="translate(${fx}, ${fy}) rotate(${deg - 28})" fill="${g1}" opacity="0.88"/>`,
      `<path d="M 0 0 C 6 -8 19 -8 27 0 C 19 8 6 8 0 0 Z" transform="translate(${fx}, ${fy}) rotate(${deg + 32})" fill="${g2}" opacity="0.84"/>`,
    );
    // Blossom flower bud on ~60% of clusters
    if (idx % 5 !== 1) {
      const petal1 = idx % 2 === 0 ? '#CC8EA3' : '#DCA7B9';
      const petal2 = '#EAD1DA';
      foliageSvgs.push(
        `<g transform="translate(${fx}, ${fy}) rotate(${deg})">
          <ellipse cx="14" cy="-5" rx="9" ry="5" fill="${petal1}" opacity="0.92"/>
          <ellipse cx="14" cy="5" rx="9" ry="5" fill="${petal1}" opacity="0.86"/>
          <ellipse cx="18" cy="0" rx="8" ry="4.5" fill="${petal2}" opacity="0.92"/>
          <circle cx="11" cy="0" r="2.6" fill="#B5758B"/>
        </g>`,
      );
    }
  });

  const trunkPath = `M -28 314 C -24 235 -20 155 -22 72 C -14 50 -8 32 0 18 C 8 32 14 50 22 72 C 20 155 24 235 28 314 C 14 322 -14 322 -28 314 Z`;

  return `<g transform="translate(${cx.toFixed(1)}, ${cy.toFixed(1)}) scale(${scale.toFixed(3)})">
    ${roots
      .map(
        (r) =>
          `<path d="${r.d}" fill="none" stroke="#5D4B3E" stroke-width="${r.w}" stroke-linecap="round"/>`,
      )
      .join('')}
    ${limbs
      .map(
        (l) =>
          `<path d="${l.d}" fill="none" stroke="#5D4B3E" stroke-width="${l.w}" stroke-linecap="round"/>`,
      )
      .join('')}
    <path d="${trunkPath}" fill="url(#oakTrunkGrad)" stroke="#49392E" stroke-width="2"/>
    <path d="M -8 290 Q -12 185 -6 80" fill="none" stroke="#806858" stroke-width="3" opacity="0.45" stroke-linecap="round"/>
    <path d="M 8 296 Q 11 195 7 92" fill="none" stroke="#3F3127" stroke-width="2.5" opacity="0.38" stroke-linecap="round"/>
    ${foliageSvgs.join('')}
  </g>`;
}

/**
 * Generates an heirloom Botanical Wreath / Heritage Oak Family Tree on A3 paper,
 * inspired by classic illustrated botanical horseshoe fan family trees:
 * - Finely illustrated flowering oak tree at the center with spreading roots
 * - Focus person & spouse flanking the trunk (with their children arched beneath the roots)
 * - Concentric horseshoe ancestor rings divided by delicate botanical leafy vines
 * - Curved arc typography on inner rings & open radiating botanical sunburst spokes on the outer ring
 * - Sweeping italic serif family title centered at the bottom.
 */
export function buildBotanicalTreeA3Svg(
  pedigree: PedigreeTreeData,
  options: BotanicalTreeSvgOptions,
): string {
  const isLandscape = options.orientation === 'landscape';
  const pageW = isLandscape ? 4200 : 2970;
  const pageH = isLandscape ? 2970 : 4200;
  const mmW = isLandscape ? 420 : 297;
  const mmH = isLandscape ? 297 : 420;

  const isCoupleMode = options.spousePedigree !== undefined;
  const maxAllowed = isCoupleMode ? 4 : 5;
  const levels = Math.max(1, Math.min(maxAllowed, pedigree.maxGenerations));

  const cx = pageW / 2;
  const cy = isLandscape ? 1625 : 2130;
  const maxR = isLandscape ? 1480 : 1365;
  const r0 = isLandscape ? 470 : 415;

  // Horseshoe angular sweep (clockwise from 148° bottom-left through 270° top to 392° bottom-right)
  const startDeg = 148;
  const endDeg = 392;
  const totalSweep = endDeg - startDeg; // 244°

  // Allocate ring radii: give the outermost radiating ring extra radial length for 3-line spoke entries
  const hasRadiatingOuterRing =
    (isCoupleMode && levels >= 4) || (!isCoupleMode && levels >= 5);
  const ringWeights = Array.from({ length: levels }, (_, i) => {
    const g = i + 1;
    if (hasRadiatingOuterRing && g === levels) return 1.55;
    if (g === 1) return 1.05;
    return 1.0;
  });
  const totalWeight = ringWeights.reduce((a, b) => a + b, 0);
  const usableR = maxR - r0;

  const radii: number[] = [r0];
  let accR = r0;
  for (let i = 0; i < levels; i++) {
    accR += (ringWeights[i]! / totalWeight) * usableR;
    radii.push(accR);
  }

  // Helper to collect the ordered slots for generation ring g (1..levels):
  // - In Couple Mode: left half = focus's ancestors at gen g, right half = spouse's ancestors at gen g
  // - In Single Mode: full sweep = focus's ancestors at gen g
  const getSlotsForRing = (g: number): Array<{ slot: PedigreeSlot; side: 'left' | 'right' }> => {
    if (isCoupleMode && options.spousePedigree) {
      const leftSlots = (pedigree.byGeneration[g] ?? []).map((slot) => ({
        slot,
        side: 'left' as const,
      }));
      const rightSlots = (options.spousePedigree.byGeneration[g] ?? []).map((slot) => ({
        slot,
        side: 'right' as const,
      }));
      return [...leftSlots, ...rightSlots];
    }
    const genSlots = pedigree.byGeneration[g] ?? [];
    const half = genSlots.length / 2;
    return genSlots.map((slot, idx) => ({
      slot,
      side: idx < half ? ('left' as const) : ('right' as const),
    }));
  };

  const defsArcPaths: string[] = [];
  const vineGarlands: string[] = [];
  const textLayer: string[] = [];
  let pathSeq = 0;

  // Inner botanical horseshoe arc around the central tree
  vineGarlands.push(drawBotanicalVineArc(cx, cy, r0, startDeg, endDeg, isLandscape ? 1.0 : 0.9));

  // Render concentric rings 1 .. levels
  for (let g = 1; g <= levels; g++) {
    const rInner = radii[g - 1]!;
    const rOuter = radii[g]!;
    const thickness = rOuter - rInner;
    const entries = getSlotsForRing(g);
    const totalSlots = entries.length;
    const stepDeg = totalSweep / totalSlots;
    const isOuterRadiating = hasRadiatingOuterRing && g === levels;

    // Draw outer botanical arc for every curved ring (omit on outermost radiating ring for the airy sunburst look!)
    if (!isOuterRadiating) {
      vineGarlands.push(
        drawBotanicalVineArc(
          cx,
          cy,
          rOuter,
          startDeg,
          endDeg,
          isLandscape ? 0.92 : 0.84,
        ),
      );
    }

    // Draw radial botanical dividers between wedges
    if (!isOuterRadiating) {
      for (let s = 0; s <= totalSlots; s++) {
        const dividerDeg = startDeg + s * stepDeg;
        vineGarlands.push(
          drawBotanicalVineSpoke(
            cx,
            cy,
            rInner,
            rOuter,
            dividerDeg,
            isLandscape ? 0.85 : 0.78,
          ),
        );
      }
    } else {
      // On outermost radiating ring: place botanical vine dividers between every parent pair (every 2 slots!)
      for (let s = 0; s <= totalSlots; s += 2) {
        const dividerDeg = startDeg + s * stepDeg;
        vineGarlands.push(
          drawBotanicalVineSpoke(
            cx,
            cy,
            rInner,
            rOuter - 18,
            dividerDeg,
            isLandscape ? 0.82 : 0.74,
          ),
        );
      }
    }

    // Render person text in each wedge
    for (let s = 0; s < totalSlots; s++) {
      const { slot } = entries[s]!;
      const person = slot.person;
      if (!person && !options.showEmptySlots) continue;

      const wedgeStart = startDeg + s * stepDeg;
      const wedgeEnd = wedgeStart + stepDeg;
      const midDeg = (wedgeStart + wedgeEnd) / 2;

      const displayName = person
        ? `${person.name.display}${slot.isDuplicate ? ' ∞' : ''}`
        : slot.ahnentafel % 2 === 0
          ? 'Father'
          : 'Mother';
      const lifespan = person ? formatCompactLifespan(person) : '';
      const birthPlace = person?.birth?.place?.split(',').slice(0, 2).join(', ').trim() ?? '';

      if (!isOuterRadiating) {
        // Curved <textPath> along concentric circular arcs inside this wedge!
        const rName = rInner + thickness * 0.68;
        const rDate = rInner + thickness * 0.44;
        const rPlace = rInner + thickness * 0.23;

        const arcLenName = (stepDeg * Math.PI * rName) / 180;
        const padDeg = Math.min(stepDeg * 0.08, 2.2);

        const baseNameSize =
          totalSlots <= 4
            ? isLandscape
              ? 36
              : 32
            : totalSlots <= 8
              ? isLandscape
                ? 28
                : 25
              : isLandscape
                ? 21
                : 18.5;
        const nameSize = Math.min(baseNameSize, Math.max(13, thickness * 0.22));
        const subSize = Math.max(11, nameSize * 0.6);
        const maxCharsName = Math.max(10, Math.floor((arcLenName * 0.86) / (nameSize * 0.44)));
        const maxCharsSub = Math.max(12, Math.floor((arcLenName * 0.82) / (subSize * 0.48)));

        const addArcPath = (radius: number): string => {
          const id = `b_arc_${++pathSeq}`;
          const a1 = polar(cx, cy, radius, wedgeStart + padDeg);
          const a2 = polar(cx, cy, radius, wedgeEnd - padDeg);
          const la = wedgeEnd - wedgeStart - padDeg * 2 > 180 ? 1 : 0;
          defsArcPaths.push(
            `<path id="${id}" d="M ${a1.x.toFixed(1)} ${a1.y.toFixed(1)} A ${radius.toFixed(1)} ${radius.toFixed(1)} 0 ${la} 1 ${a2.x.toFixed(1)} ${a2.y.toFixed(1)}"/>`,
          );
          return id;
        };

        const nameArcId = addArcPath(rName);
        textLayer.push(
          `<text font-family="Cormorant Garamond, Georgia, serif" font-size="${nameSize.toFixed(1)}" font-style="italic" font-weight="700" fill="${person ? '#2A241E' : '#B8AFA2'}"><textPath href="#${nameArcId}" startOffset="50%" text-anchor="middle">${escapeXml(truncateText(displayName, maxCharsName))}</textPath></text>`,
        );

        if (lifespan) {
          const dateArcId = addArcPath(rDate);
          textLayer.push(
            `<text font-family="Plus Jakarta Sans, sans-serif" font-size="${subSize.toFixed(1)}" font-weight="600" fill="#524A42"><textPath href="#${dateArcId}" startOffset="50%" text-anchor="middle">${escapeXml(truncateText(lifespan, maxCharsSub))}</textPath></text>`,
          );
        }

        if (birthPlace && thickness >= 135) {
          const placeArcId = addArcPath(rPlace);
          textLayer.push(
            `<text font-family="Plus Jakarta Sans, sans-serif" font-size="${(subSize * 0.92).toFixed(1)}" font-weight="500" fill="#766D63"><textPath href="#${placeArcId}" startOffset="50%" text-anchor="middle">${escapeXml(truncateText(birthPlace, maxCharsSub))}</textPath></text>`,
          );
        }
      } else {
        // Outermost radiating botanical sunburst spokes (16 or 32 slots around the outer wreath!)
        const rMid = rInner + thickness * 0.52;
        const pt = polar(cx, cy, rMid, midDeg);
        const normDeg = ((midDeg % 360) + 360) % 360;
        const isLeftHalf = normDeg > 90 && normDeg < 270;
        const rotDeg = isLeftHalf ? midDeg + 180 : midDeg;

        const innerChord = (stepDeg * Math.PI * (rInner + 24)) / 180;
        const nameSize = Math.min(isLandscape ? 22 : 19, Math.max(12, innerChord * 0.34));
        const subSize = Math.max(9.5, nameSize * 0.64);
        const maxChars = Math.max(12, Math.floor((thickness * 0.88) / (nameSize * 0.44)));

        const showPlace = birthPlace.length > 0 && innerChord >= 48;
        const lineGap = nameSize * 0.88;

        textLayer.push(
          [
            `<g transform="translate(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}) rotate(${rotDeg.toFixed(1)})">`,
            `<text x="0" y="${showPlace ? (-lineGap).toFixed(1) : lifespan ? (-subSize * 0.35).toFixed(1) : (nameSize * 0.32).toFixed(1)}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${nameSize.toFixed(1)}" font-style="italic" font-weight="700" fill="${person ? '#2A241E' : '#B8AFA2'}">${escapeXml(truncateText(displayName, maxChars))}</text>`,
            lifespan
              ? `<text x="0" y="${showPlace ? '2' : (subSize * 0.95).toFixed(1)}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${subSize.toFixed(1)}" font-weight="600" fill="#524A42">${escapeXml(truncateText(lifespan, maxChars + 4))}</text>`
              : '',
            showPlace
              ? `<text x="0" y="${(lineGap * 0.95 + 2).toFixed(1)}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${(subSize * 0.94).toFixed(1)}" font-weight="500" fill="#766D63">${escapeXml(truncateText(birthPlace, maxChars + 4))}</text>`
              : '',
            `</g>`,
          ].join(''),
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Centerpiece Illustrated Tree + Focus & Spouse Flanking Trunk + Root Children
  // --------------------------------------------------------------------------
  const treeScale = isLandscape ? 1.06 : 0.94;
  const treeCenterY = cy + (isLandscape ? 82 : 74);
  const centerTreeSvg = drawCenterpieceBotanicalTree(cx, treeCenterY, treeScale);

  const coupleY = treeCenterY + 258 * treeScale;
  const coupleLabels: string[] = [];

  if (isCoupleMode && options.spousePedigree) {
    const f = pedigree.focusPerson;
    const sp = options.spousePedigree.focusPerson;
    const fSub = formatCompactBirth(f) || formatCompactLifespan(f);
    const spSub = formatCompactBirth(sp) || formatCompactLifespan(sp);
    const flankOffset = isLandscape ? 285 : 245;

    coupleLabels.push(
      // Focus (left of trunk)
      `<g transform="translate(${(cx - flankOffset).toFixed(1)}, ${coupleY.toFixed(1)})">
        <text x="0" y="0" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${isLandscape ? 42 : 36}" font-style="italic" font-weight="700" fill="#2A241E">${escapeXml(truncateText(f.name.display, 22))}</text>
        ${fSub ? `<text x="0" y="34" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${isLandscape ? 21 : 18}" font-weight="600" fill="#5C5349">${escapeXml(truncateText(fSub, 28))}</text>` : ''}
      </g>`,
      // Spouse (right of trunk)
      `<g transform="translate(${(cx + flankOffset).toFixed(1)}, ${coupleY.toFixed(1)})">
        <text x="0" y="0" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${isLandscape ? 42 : 36}" font-style="italic" font-weight="700" fill="#2A241E">${escapeXml(truncateText(sp.name.display, 22))}</text>
        ${spSub ? `<text x="0" y="34" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${isLandscape ? 21 : 18}" font-weight="600" fill="#5C5349">${escapeXml(truncateText(spSub, 28))}</text>` : ''}
      </g>`,
    );
  } else {
    const f = pedigree.focusPerson;
    const fSub = formatCompactBirth(f) || formatCompactLifespan(f);
    coupleLabels.push(
      `<g transform="translate(${cx.toFixed(1)}, ${(treeCenterY + 465 * treeScale).toFixed(1)})">
        <text x="0" y="0" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${isLandscape ? 46 : 40}" font-style="italic" font-weight="700" fill="#2A241E">${escapeXml(truncateText(f.name.display, 26))}</text>
        ${fSub ? `<text x="0" y="34" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${isLandscape ? 22 : 19}" font-weight="600" fill="#5C5349">${escapeXml(truncateText(fSub, 34))}</text>` : ''}
      </g>`,
    );
  }

  // Children arched gracefully beneath the roots (just like Caroll, Matt, Sally in the reference print!)
  const rootChildrenSvg: string[] = [];
  if (options.includeChildrenRoots !== false && pedigree.focusChildren.length > 0) {
    const kids = pedigree.focusChildren.slice(0, 6);
    const baseKidsY = treeCenterY + (isCoupleMode ? 485 : 565) * treeScale;
    const totalKidsSpan = Math.min(isLandscape ? 1680 : 1400, Math.max(620, kids.length * 460));

    kids.forEach((kid, idx) => {
      const u = kids.length === 1 ? 0.5 : idx / (kids.length - 1);
      const kx = cx - totalKidsSpan / 2 + u * totalKidsSpan;
      // Gentle downward smile curve matching the bottom horseshoe curvature
      const dip = Math.sin(u * Math.PI) * 72;
      const ky = baseKidsY + dip;
      const kSub = formatCompactBirth(kid) || formatCompactLifespan(kid);

      rootChildrenSvg.push(
        `<g transform="translate(${kx.toFixed(1)}, ${ky.toFixed(1)})">
          <text x="0" y="0" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${isLandscape ? 38 : 33}" font-style="italic" font-weight="700" fill="#2A241E">${escapeXml(truncateText(kid.name.display, 24))}</text>
          ${kSub ? `<text x="0" y="30" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="${isLandscape ? 19 : 17}" font-weight="600" fill="#5C5349">${escapeXml(truncateText(kSub, 30))}</text>` : ''}
        </g>`,
      );
    });
  }

  const totalPopulated =
    pedigree.populatedCount +
    (options.spousePedigree ? options.spousePedigree.populatedCount : 0);

  // Grand calligraphic family title centered gracefully at the bottom of the poster
  const bottomTitleY = pageH - (isLandscape ? 155 : 240);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mmW}mm" height="${mmH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <defs>
    <linearGradient id="oakTrunkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4A3A30"/>
      <stop offset="45%" stop-color="#695547"/>
      <stop offset="100%" stop-color="#45362C"/>
    </linearGradient>
    ${defsArcPaths.join('\n    ')}
  </defs>

  <rect width="${pageW}" height="${pageH}" fill="#FFFDF9"/>
  <rect x="44" y="44" width="${pageW - 88}" height="${pageH - 88}" fill="none" stroke="#E2D9CB" stroke-width="2"/>

  <g id="botanical-vines">
    ${vineGarlands.join('\n    ')}
  </g>

  <g id="centerpiece-tree">
    ${centerTreeSvg}
  </g>

  <g id="pedigree-typography">
    ${textLayer.join('\n    ')}
    ${coupleLabels.join('\n    ')}
    ${rootChildrenSvg.join('\n    ')}
  </g>

  <g id="bottom-title">
    <text x="${cx}" y="${bottomTitleY}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="${isLandscape ? 128 : 112}" font-style="italic" font-weight="600" fill="#2A241E">${escapeXml(options.title)}</text>
    <text x="${cx}" y="${bottomTitleY + 46}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="21" font-weight="500" letter-spacing="1.5" fill="#7E7469">${escapeXml(options.subtitle)} · ${totalPopulated} recorded ancestors</text>
  </g>
</svg>`;
}
