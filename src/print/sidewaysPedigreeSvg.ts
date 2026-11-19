import {
  escapeXml,
  formatCompactBirth,
  formatCompactDeath,
  formatCompactLifespan,
  formatCompactMarriage,
  truncateText,
  type PedigreeTreeData,
} from './ahnentafel.js';
import type { PrintOrientation } from './classicPrintSvg.js';

export interface SidewaysPedigreeSvgOptions {
  title: string;
  subtitle: string;
  orientation: PrintOrientation;
  showEmptySlots: boolean;
}

/**
 * Generates a classic horizontal (left-to-right) archival pedigree chart on A3 paper,
 * inspired by traditional British multi-generation pedigree charts:
 * - Vintage serif title block nestled in the open top-left margin above Column 0
 * - Sweeping S-curves from Focus (Col 0) to Father & Mother (Col 1)
 * - Graceful curly-brace connectors linking every child to its parent pair
 * - Dedicated MARRIAGE boxes between Father & Mother pairs where vertical space permits
 * - Progressive column card compactness so 1..6 generations fit cleanly with zero overlap.
 */
export function buildSidewaysPedigreeA3Svg(
  pedigree: PedigreeTreeData,
  options: SidewaysPedigreeSvgOptions,
): string {
  const isLandscape = options.orientation === 'landscape';
  const pageW = isLandscape ? 4200 : 2970;
  const pageH = isLandscape ? 2970 : 4200;
  const mmW = isLandscape ? 420 : 297;
  const mmH = isLandscape ? 297 : 420;

  const levels = Math.max(1, Math.min(6, pedigree.maxGenerations));
  const numCols = levels + 1;

  const marginX = 110;
  const contentTop = 128;
  const contentBottom = pageH - 135;
  const contentH = contentBottom - contentTop;
  const totalContentW = pageW - marginX * 2;

  // Allocate column widths & connector gutters left-to-right
  const gutterWidths = Array.from({ length: levels }, (_, g) => {
    if (g === 0) return isLandscape ? 92 : 68;
    if (g === 1) return isLandscape ? 58 : 44;
    if (g <= 3) return isLandscape ? 46 : 36;
    return isLandscape ? 34 : 28;
  });
  const totalGutterW = gutterWidths.reduce((a, b) => a + b, 0);
  const availCardW = totalContentW - totalGutterW;

  // Outer columns get slightly wider space when deeper so single-line names stay readable
  const colWeights = Array.from({ length: numCols }, (_, g) => {
    if (g === 0) return 0.96;
    if (g <= 2) return 1.0;
    if (g === 3) return 1.04;
    return 1.12;
  });
  const totalColWeight = colWeights.reduce((a, b) => a + b, 0);
  const colWidths = colWeights.map((w) => (w / totalColWeight) * availCardW);

  const colLeftX: number[] = [];
  let cursorX = marginX;
  for (let g = 0; g < numCols; g++) {
    colLeftX.push(cursorX);
    cursorX += colWidths[g]! + (gutterWidths[g] ?? 0);
  }

  // Helper: compute vertical geometry for any slot (g, s)
  const slotCenterY = (g: number, s: number): number => {
    const count = 1 << g;
    return contentTop + ((s + 0.5) / count) * contentH;
  };

  const slotBoxHeight = (g: number): number => {
    const count = 1 << g;
    const pitch = contentH / count;
    if (g === 0) return Math.min(340, pitch * 0.24);
    if (g === 1) return Math.min(340, pitch * 0.36);
    if (g === 2) return Math.min(280, pitch * 0.56);
    if (g === 3) return Math.min(210, pitch * 0.72);
    return Math.max(20, pitch - Math.max(4, Math.min(14, pitch * 0.14)));
  };

  // Determine which slots should be rendered (when showEmptySlots=false, keep any slot with a person or populated descendant/ancestor)
  const visibleAhns = new Set<number>([1]);
  if (options.showEmptySlots) {
    for (const ahn of pedigree.slots.keys()) {
      visibleAhns.add(ahn);
    }
  } else {
    for (const slot of pedigree.slots.values()) {
      if (slot.person) {
        let cur = slot.ahnentafel;
        while (cur >= 1) {
          visibleAhns.add(cur);
          cur >>= 1;
        }
      }
    }
  }

  const connectorSvgs: string[] = [];
  const marriageBoxSvgs: string[] = [];
  const cardSvgs: string[] = [];

  // --------------------------------------------------------------------------
  // 1. Calligraphic S-Curves & Curly-Brace Connectors + Marriage Boxes
  // --------------------------------------------------------------------------
  for (let g = 0; g < levels; g++) {
    const genSlots = pedigree.byGeneration[g] ?? [];
    const childRightX = colLeftX[g]! + colWidths[g]!;
    const parentLeftX = colLeftX[g + 1]!;
    const gutterW = parentLeftX - childRightX;
    const midX = childRightX + gutterW * 0.5;
    const parentBoxH = slotBoxHeight(g + 1);

    for (const childSlot of genSlots) {
      if (!visibleAhns.has(childSlot.ahnentafel)) continue;
      const fatherAhn = childSlot.ahnentafel * 2;
      const motherAhn = fatherAhn + 1;
      const hasFather = visibleAhns.has(fatherAhn);
      const hasMother = visibleAhns.has(motherAhn);
      if (!hasFather && !hasMother) continue;

      const cy = slotCenterY(g, childSlot.slotIndex);
      const fy = slotCenterY(g + 1, childSlot.slotIndex * 2);
      const my = slotCenterY(g + 1, childSlot.slotIndex * 2 + 1);

      const strokeColor =
        childSlot.person && (pedigree.slots.get(fatherAhn)?.person || pedigree.slots.get(motherAhn)?.person)
          ? '#6E5E4E'
          : '#C4B8A7';
      const strokeW = g === 0 ? 2.6 : g <= 2 ? 2.0 : 1.4;

      if (g === 0) {
        // Classic graceful sweeping S-curves from Focus (Col 0) to Father & Mother (Col 1)
        if (hasFather) {
          connectorSvgs.push(
            `<path d="M ${childRightX.toFixed(1)} ${cy.toFixed(1)} C ${(childRightX + gutterW * 0.72).toFixed(1)} ${cy.toFixed(1)}, ${(parentLeftX - gutterW * 0.72).toFixed(1)} ${fy.toFixed(1)}, ${parentLeftX.toFixed(1)} ${fy.toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="round"/>`,
          );
        }
        if (hasMother) {
          connectorSvgs.push(
            `<path d="M ${childRightX.toFixed(1)} ${cy.toFixed(1)} C ${(childRightX + gutterW * 0.72).toFixed(1)} ${cy.toFixed(1)}, ${(parentLeftX - gutterW * 0.72).toFixed(1)} ${my.toFixed(1)}, ${parentLeftX.toFixed(1)} ${my.toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="round"/>`,
          );
        }
      } else {
        // Refined calligraphic curly-brace connector `{` linking child to father & mother
        const r = Math.min(14, gutterW * 0.34, Math.abs(my - fy) * 0.22);
        if (hasFather) {
          connectorSvgs.push(
            `<path d="M ${childRightX.toFixed(1)} ${cy.toFixed(1)} Q ${midX.toFixed(1)} ${cy.toFixed(1)} ${midX.toFixed(1)} ${(cy - r).toFixed(1)} L ${midX.toFixed(1)} ${(fy + r).toFixed(1)} Q ${midX.toFixed(1)} ${fy.toFixed(1)} ${parentLeftX.toFixed(1)} ${fy.toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="round"/>`,
          );
        }
        if (hasMother) {
          connectorSvgs.push(
            `<path d="M ${childRightX.toFixed(1)} ${cy.toFixed(1)} Q ${midX.toFixed(1)} ${cy.toFixed(1)} ${midX.toFixed(1)} ${(cy + r).toFixed(1)} L ${midX.toFixed(1)} ${(my - r).toFixed(1)} Q ${midX.toFixed(1)} ${my.toFixed(1)} ${parentLeftX.toFixed(1)} ${my.toFixed(1)}" fill="none" stroke="${strokeColor}" stroke-width="${strokeW}" stroke-linecap="round"/>`,
          );
        }
      }

      // Dedicated MARRIAGE box nestled cleanly between Father & Mother when vertical gap permits
      const verticalGapBetweenParents = my - fy - parentBoxH;
      const showMarriageBox =
        hasFather &&
        hasMother &&
        verticalGapBetweenParents >= 96 &&
        (options.showEmptySlots || childSlot.parentUnion?.marriage !== undefined);

      if (showMarriageBox) {
        const mBoxW = colWidths[g + 1]! * 0.86;
        const mBoxH = Math.min(82, verticalGapBetweenParents * 0.44);
        const mBoxX = parentLeftX + (colWidths[g + 1]! - mBoxW) / 2;
        const mBoxY = cy - mBoxH / 2;
        const marrInfo = formatCompactMarriage(childSlot.parentUnion);

        marriageBoxSvgs.push(
          [
            `<g transform="translate(${mBoxX.toFixed(1)}, ${mBoxY.toFixed(1)})">`,
            `<text x="${(mBoxW / 2).toFixed(1)}" y="-6" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="11.5" font-weight="700" letter-spacing="1.4" fill="#8A7E6E">MARRIAGE</text>`,
            `<rect width="${mBoxW.toFixed(1)}" height="${mBoxH.toFixed(1)}" rx="5" fill="#FAF6EE" stroke="#C5B8A5" stroke-width="1.3"/>`,
            marrInfo
              ? `<text x="12" y="${(mBoxH / 2 + 5).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="13.5" font-weight="600" fill="#4E453B">${escapeXml(truncateText(marrInfo, Math.floor(mBoxW / 8.5)))}</text>`
              : `<line x1="12" y1="${(mBoxH * 0.42).toFixed(1)}" x2="${(mBoxW - 12).toFixed(1)}" y2="${(mBoxH * 0.42).toFixed(1)}" stroke="#DED5C6" stroke-width="1"/><text x="12" y="${(mBoxH * 0.37).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" fill="#A59B8E">D.</text><line x1="12" y1="${(mBoxH * 0.78).toFixed(1)}" x2="${(mBoxW - 12).toFixed(1)}" y2="${(mBoxH * 0.78).toFixed(1)}" stroke="#DED5C6" stroke-width="1"/><text x="12" y="${(mBoxH * 0.73).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" fill="#A59B8E">P.</text>`,
            `</g>`,
          ].join(''),
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // 2. Render Adaptive Pedigree Boxes Across All Columns
  // --------------------------------------------------------------------------
  for (let g = 0; g <= levels; g++) {
    const genSlots = pedigree.byGeneration[g] ?? [];
    const boxW = colWidths[g]!;
    const boxH = slotBoxHeight(g);
    const pitch = contentH / (1 << g);
    const showExternalRoleHeader = g === 0 || pitch - boxH >= 36;
    const x = colLeftX[g]!;

    for (const slot of genSlots) {
      if (!visibleAhns.has(slot.ahnentafel)) continue;

      const cy = slotCenterY(g, slot.slotIndex);
      const y = cy - boxH / 2;
      const person = slot.person;
      const isRoot = g === 0;
      const roleHeader = isRoot
        ? 'FOCUS'
        : slot.ahnentafel % 2 === 0
          ? 'FATHER'
          : 'MOTHER';

      const fill = isRoot ? '#F4F8F5' : person ? '#FFFFFF' : '#FDFBF7';
      const stroke = isRoot
        ? '#2B5240'
        : slot.isDuplicate
          ? '#A67B35'
          : person
            ? '#B5A894'
            : '#D8CFC0';
      const strokeW = isRoot ? 2.4 : g <= 2 ? 1.6 : 1.1;
      const dash = slot.isDuplicate ? ' stroke-dasharray="5 3"' : '';

      if (boxH >= 150) {
        // Full vintage structured pedigree card (Name + B. + D. + Place/Other Info)
        const nameFont = Math.min(27, Math.max(19, boxW * 0.056));
        const subFont = Math.min(15, Math.max(12, boxW * 0.032));
        const maxChars = Math.max(14, Math.floor((boxW - 28) / (nameFont * 0.5)));
        const maxSubChars = Math.max(18, Math.floor((boxW - 44) / (subFont * 0.54)));

        const birthText = person ? formatCompactBirth(person) : '';
        const deathText = person ? formatCompactDeath(person) : '';
        const noteSnippet =
          person?.events.find((e) => e.type === 'occupation')?.description ??
          person?.birth?.place?.split(',').slice(1).join(',').trim() ??
          '';

        const line1Y = boxH * 0.34;
        const line2Y = boxH * 0.56;
        const line3Y = boxH * 0.78;

        cardSvgs.push(
          [
            `<g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">`,
            showExternalRoleHeader
              ? `<text x="${(boxW / 2).toFixed(1)}" y="-8" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="12" font-weight="700" letter-spacing="1.6" fill="${isRoot ? '#2B5240' : '#8A7E6E'}">${roleHeader}</text>`
              : '',
            `<rect width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"${dash}/>`,
            person
              ? `<text x="14" y="${(line1Y - 12).toFixed(1)}" font-family="Cormorant Garamond, Georgia, serif" font-size="${nameFont.toFixed(1)}" font-weight="700" fill="#221D18">${escapeXml(truncateText(person.name.display, maxChars))}${slot.isDuplicate ? ' ∞' : ''}</text>`
              : '',
            `<line x1="12" y1="${line1Y.toFixed(1)}" x2="${(boxW - 12).toFixed(1)}" y2="${line1Y.toFixed(1)}" stroke="#DED5C6" stroke-width="1.1"/>`,
            `<text x="14" y="${(line2Y - 8).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="${subFont.toFixed(1)}" fill="#7B7165"><tspan font-weight="700">B. </tspan><tspan fill="#3E3730">${escapeXml(truncateText(birthText, maxSubChars))}</tspan></text>`,
            `<line x1="12" y1="${line2Y.toFixed(1)}" x2="${(boxW - 12).toFixed(1)}" y2="${line2Y.toFixed(1)}" stroke="#E6DFD3" stroke-width="1"/>`,
            `<text x="14" y="${(line3Y - 8).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="${subFont.toFixed(1)}" fill="#7B7165"><tspan font-weight="700">D. </tspan><tspan fill="#3E3730">${escapeXml(truncateText(deathText, maxSubChars))}</tspan></text>`,
            `<line x1="12" y1="${line3Y.toFixed(1)}" x2="${(boxW - 12).toFixed(1)}" y2="${line3Y.toFixed(1)}" stroke="#E6DFD3" stroke-width="1"/>`,
            noteSnippet
              ? `<text x="14" y="${(boxH - 12).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="${(subFont - 1).toFixed(1)}" fill="#8A8074">${escapeXml(truncateText(noteSnippet, maxSubChars + 4))}</text>`
              : `<text x="14" y="${(boxH - 12).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="11" fill="#B6AC9F">OTHER INFO</text>`,
            `</g>`,
          ].join(''),
        );
      } else if (boxH >= 64) {
        // Medium 2-line pedigree box
        const nameFont = Math.min(20, Math.max(13, boxH * 0.25));
        const dateFont = Math.min(13, Math.max(10, boxH * 0.16));
        const maxChars = Math.max(14, Math.floor((boxW - 20) / (nameFont * 0.5)));
        const lifespan = person ? formatCompactLifespan(person) : '';

        cardSvgs.push(
          [
            `<g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">`,
            `<rect width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="5" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"${dash}/>`,
            person
              ? `<text x="11" y="${(boxH * 0.44).toFixed(1)}" font-family="Cormorant Garamond, Georgia, serif" font-size="${nameFont.toFixed(1)}" font-weight="700" fill="#221D18">${escapeXml(truncateText(person.name.display, maxChars))}${slot.isDuplicate ? ' ∞' : ''}</text>`
              : `<text x="11" y="${(boxH * 0.42).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="10.5" fill="#B5AB9E">${slot.ahnentafel % 2 === 0 ? 'F.' : 'M.'}</text>`,
            `<line x1="10" y1="${(boxH * 0.55).toFixed(1)}" x2="${(boxW - 10).toFixed(1)}" y2="${(boxH * 0.55).toFixed(1)}" stroke="#E6DFD3" stroke-width="0.9"/>`,
            lifespan
              ? `<text x="11" y="${(boxH * 0.84).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="${dateFont.toFixed(1)}" fill="#5C5349">${escapeXml(truncateText(lifespan, maxChars + 4))}</text>`
              : `<text x="11" y="${(boxH * 0.83).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="10" fill="#B5AB9E">B. / D.</text>`,
            `</g>`,
          ].join(''),
        );
      } else {
        // Sleek compact single-line horizontal ledger strip (supports 32..64 outer ancestors crisply!)
        const nameFont = Math.min(16, Math.max(9.5, boxH * 0.52));
        const dateFont = Math.max(8.5, nameFont * 0.78);
        const lifespan = person ? formatCompactLifespan(person) : '';
        const reservedDateW = lifespan ? lifespan.length * dateFont * 0.58 + 14 : 0;
        const maxChars = Math.max(10, Math.floor((boxW - 18 - reservedDateW) / (nameFont * 0.48)));

        cardSvgs.push(
          [
            `<g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">`,
            `<rect width="${boxW.toFixed(1)}" height="${boxH.toFixed(1)}" rx="3.5" fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"${dash}/>`,
            person
              ? `<text x="9" y="${(boxH * 0.68).toFixed(1)}" font-family="Cormorant Garamond, Georgia, serif" font-size="${nameFont.toFixed(1)}" font-weight="700" fill="#221D18">${escapeXml(truncateText(person.name.display, maxChars))}${slot.isDuplicate ? ' ∞' : ''}</text>`
              : `<text x="9" y="${(boxH * 0.68).toFixed(1)}" font-family="Plus Jakarta Sans, sans-serif" font-size="${Math.max(8, nameFont * 0.72).toFixed(1)}" fill="#B5AB9E">${slot.ahnentafel % 2 === 0 ? 'F.' : 'M.'}</text>`,
            lifespan
              ? `<text x="${(boxW - 9).toFixed(1)}" y="${(boxH * 0.68).toFixed(1)}" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="${dateFont.toFixed(1)}" fill="#685F56">${escapeXml(lifespan)}</text>`
              : '',
            `</g>`,
          ].join(''),
        );
      }
    }
  }

  // Ornate Victorian-style corner flourishes echoing the reference print
  const cornerFlourish = (tx: number, ty: number, sx: number, sy: number) =>
    `<path d="M 0 56 C 0 18 18 0 56 0 C 32 10 18 22 14 40 C 26 26 42 20 58 22" transform="translate(${tx}, ${ty}) scale(${sx}, ${sy})" fill="none" stroke="#8F8271" stroke-width="2.2" stroke-linecap="round"/>`;

  // Top-left vintage title cartouche nestled cleanly in the open space above Columns 0 and 1
  const maxTitleW = Math.max(
    420,
    (colLeftX[2] ?? pageW - marginX) - marginX - 24,
  );
  const titleFontSize = Math.min(62, Math.max(38, maxTitleW * 0.068));
  const titleMaxChars = Math.max(18, Math.floor(maxTitleW / (titleFontSize * 0.43)));
  const subMaxChars = Math.max(22, Math.floor(maxTitleW / 9.5));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mmW}mm" height="${mmH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect width="${pageW}" height="${pageH}" fill="#FCF9F3"/>
  <rect x="44" y="44" width="${pageW - 88}" height="${pageH - 88}" fill="none" stroke="#B9AC98" stroke-width="3"/>
  <rect x="60" y="60" width="${pageW - 120}" height="${pageH - 120}" fill="none" stroke="#2B5240" stroke-width="1.4"/>

  ${cornerFlourish(72, 72, 1, 1)}
  ${cornerFlourish(pageW - 72, 72, -1, 1)}
  ${cornerFlourish(72, pageH - 72, 1, -1)}
  ${cornerFlourish(pageW - 72, pageH - 72, -1, -1)}

  <g id="vintage-title" transform="translate(${marginX}, 152)">
    <text x="0" y="0" font-family="Cormorant Garamond, Georgia, serif" font-size="${titleFontSize.toFixed(1)}" font-style="italic" font-weight="700" fill="#221D18">${escapeXml(truncateText(options.title, titleMaxChars))}</text>
    <text x="2" y="38" font-family="Plus Jakarta Sans, sans-serif" font-size="20" font-weight="700" letter-spacing="1.8" fill="#2B5240">${levels + 1} GENERATION PEDIGREE CHART</text>
    <text x="2" y="68" font-family="Plus Jakarta Sans, sans-serif" font-size="17" fill="#685F56">${escapeXml(truncateText(options.subtitle, subMaxChars))}</text>
    <line x1="0" y1="88" x2="${Math.min(480, maxTitleW * 0.72).toFixed(1)}" y2="88" stroke="#A67B35" stroke-width="2"/>
  </g>

  <g id="sideways-connectors">
    ${connectorSvgs.join('\n    ')}
  </g>

  <g id="sideways-marriages">
    ${marriageBoxSvgs.join('\n    ')}
  </g>

  <g id="sideways-cards">
    ${cardSvgs.join('\n    ')}
  </g>

  <text x="${marginX}" y="${pageH - 82}" font-family="Plus Jakarta Sans, sans-serif" font-size="19" fill="#8A8074">Sideways Archival Pedigree · A3 ${isLandscape ? 'Landscape (420 × 297 mm)' : 'Portrait (297 × 420 mm)'}</text>
  <text x="${pageW - marginX}" y="${pageH - 82}" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="19" fill="#8A8074">${pedigree.populatedCount} recorded · ${levels + 1} generations</text>
</svg>`;
}
