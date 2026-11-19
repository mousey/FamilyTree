import { formatLifespan } from '../core/index.js';
import type { TreeLayoutResult } from '../layout/types.js';
import { escapeXml, getPersonInitials, truncateText } from './ahnentafel.js';

export type PrintOrientation = 'landscape' | 'portrait';

export function buildClassicA3Svg(
  layout: TreeLayoutResult,
  options: {
    title: string;
    subtitle: string;
    orientation: PrintOrientation;
  },
): string {
  const pageW = options.orientation === 'landscape' ? 4200 : 2970;
  const pageH = options.orientation === 'landscape' ? 2970 : 4200;
  const mmW = options.orientation === 'landscape' ? 420 : 297;
  const mmH = options.orientation === 'landscape' ? 297 : 420;

  const margin = 110;
  const headerH = 210;
  const footerH = 70;

  const contentX = margin + 35;
  const contentY = margin + headerH;
  const contentW = pageW - (margin + 35) * 2;
  const contentH = pageH - margin - headerH - footerH - 30;

  const { bounds } = layout;
  const scale = Math.min(
    2.1,
    contentW / Math.max(1, bounds.width),
    contentH / Math.max(1, bounds.height),
  );
  const tx = contentX + (contentW - bounds.width * scale) / 2 - bounds.minX * scale;
  const ty = contentY + (contentH - bounds.height * scale) / 2 - bounds.minY * scale;

  const branchPaths = layout.branchConnectors
    .map((b) => {
      const drops = b.childPaths
        .map((cp) => {
          const stroke =
            cp.relation === 'adopted'
              ? '#3E6B55'
              : cp.relation === 'step'
                ? '#A08250'
                : '#7F7568';
          const dash =
            cp.relation === 'adopted'
              ? ' stroke-dasharray="6 4"'
              : cp.relation === 'step'
                ? ' stroke-dasharray="2 4"'
                : '';
          return `<path d="${cp.svgPath}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
        })
        .join('');
      return `<path d="${b.busSvgPath}" fill="none" stroke="#7F7568" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${drops}`;
    })
    .join('');

  const marriagePaths = layout.marriageConnectors
    .map((mc) => {
      const isDiv = mc.union.status === 'divorced';
      const stroke = isDiv ? '#A43B3F' : '#A67B35';
      const dash = isDiv ? ' stroke-dasharray="5 3"' : '';
      const year = mc.union.marriage?.date?.start?.year;
      const badge = isDiv ? (year ? `${year} //` : '//') : year ? `${year}` : '';
      const pillSvg = badge
        ? `<rect x="${(mc.badgeX - 24).toFixed(1)}" y="${(mc.badgeY - 10).toFixed(1)}" width="48" height="20" rx="10" fill="#FFFDF9" stroke="${stroke}" stroke-width="1.2"/><text x="${mc.badgeX.toFixed(1)}" y="${(mc.badgeY + 3.5).toFixed(1)}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="10" font-weight="700" fill="${stroke}">${escapeXml(badge)}</text>`
        : '';
      return `<path d="${mc.svgPath}" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round"${dash}/>${pillSvg}`;
    })
    .join('');

  const cardNodes = layout.nodes
    .map((n) => {
      const x = n.x - n.width / 2;
      const y = n.y - n.height / 2;
      const fill = n.isFocus ? '#F4F8F5' : '#FFFFFF';
      const border = n.isFocus ? '#2B5240' : n.isDuplicate ? '#A67B35' : '#D4C9B8';
      const borderW = n.isFocus ? 2.2 : 1.25;
      const dash = n.isDuplicate ? ' stroke-dasharray="5 3"' : '';

      const avBg =
        n.person.sex === 'male'
          ? '#E6ECF2'
          : n.person.sex === 'female'
            ? '#F3E6E6'
            : '#ECE8F2';
      const avInk =
        n.person.sex === 'male'
          ? '#354E68'
          : n.person.sex === 'female'
            ? '#88494B'
            : '#5A4F70';

      const name = truncateText(n.person.name.display, 22);
      const lifespan = formatLifespan(n.person.birth, n.person.death) || 'Dates unknown';
      const place = n.person.birth?.place?.split(',')[0]?.trim() ?? '';
      const placeTrimmed = truncateText(place, 24);

      return [
        `<g transform="translate(${x.toFixed(1)}, ${y.toFixed(1)})">`,
        `<rect width="${n.width}" height="${n.height}" rx="12" fill="${fill}" stroke="${border}" stroke-width="${borderW}"${dash}/>`,
        `<circle cx="32" cy="${(n.height / 2).toFixed(1)}" r="20" fill="${avBg}"/>`,
        `<text x="32" y="${(n.height / 2 + 5.5).toFixed(1)}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="15" font-weight="700" fill="${avInk}">${escapeXml(getPersonInitials(n.person))}</text>`,
        `<text x="62" y="34" font-family="Cormorant Garamond, Georgia, serif" font-size="16" font-weight="700" fill="#221D18">${escapeXml(name)}</text>`,
        `<text x="62" y="54" font-family="Plus Jakarta Sans, sans-serif" font-size="11" font-weight="600" fill="#5C5349">${escapeXml(lifespan)}</text>`,
        placeTrimmed
          ? `<text x="62" y="72" font-family="Plus Jakarta Sans, sans-serif" font-size="10" fill="#8A8074">${escapeXml(placeTrimmed)}</text>`
          : '',
        `</g>`,
      ].join('');
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${mmW}mm" height="${mmH}mm" viewBox="0 0 ${pageW} ${pageH}">
  <rect width="${pageW}" height="${pageH}" fill="#FCF9F3"/>
  <rect x="46" y="46" width="${pageW - 92}" height="${pageH - 92}" fill="none" stroke="#C9BCA7" stroke-width="3"/>
  <rect x="64" y="64" width="${pageW - 128}" height="${pageH - 128}" fill="none" stroke="#2B5240" stroke-width="1.5"/>

  <text x="${pageW / 2}" y="162" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="78" font-weight="700" fill="#221D18">${escapeXml(options.title)}</text>
  <text x="${pageW / 2}" y="216" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="26" font-weight="500" fill="#685F56">${escapeXml(options.subtitle)}</text>
  <line x1="${pageW / 2 - 220}" y1="244" x2="${pageW / 2 + 220}" y2="244" stroke="#A67B35" stroke-width="2"/>

  <g transform="translate(${tx.toFixed(1)}, ${ty.toFixed(1)}) scale(${scale.toFixed(4)})">
    ${branchPaths}
    ${marriagePaths}
    ${cardNodes}
  </g>

  <text x="110" y="${pageH - 86}" font-family="Plus Jakarta Sans, sans-serif" font-size="20" fill="#8A8074">Heirloom Family Tree · ${options.orientation === 'landscape' ? 'Landscape' : 'Portrait'}</text>
  <text x="${pageW / 2}" y="${pageH - 86}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="18" fill="#8A8074">Solid: Biological · Dashed: Adopted · Dotted: Step · Gold: Marriage · Crimson //: Divorced</text>
  <text x="${pageW - 110}" y="${pageH - 86}" text-anchor="end" font-family="Plus Jakarta Sans, sans-serif" font-size="20" fill="#8A8074">${layout.nodes.length} individuals · ${layout.generations.length} generations</text>
</svg>`;
}
