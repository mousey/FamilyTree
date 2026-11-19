import { formatGenealogicalDate, parseGenealogicalDate } from '../dates.js';
import {
  FAMILY_TREE_SCHEMA_VERSION,
  type BiologicalSex,
  type ChildLink,
  type FamilyTree,
  type LifeEvent,
  type MediaId,
  type MediaObject,
  type MediaReference,
  type NoteId,
  type NoteRecord,
  type ParentChildType,
  type Person,
  type PersonEventType,
  type PersonId,
  type PersonName,
  type RepositoryId,
  type RepositoryRecord,
  type SourceCitation,
  type SourceId,
  type SourceRecord,
  type TreeMetadata,
  type Union,
  type UnionEvent,
  type UnionEventType,
  type UnionId,
  type UnionPartner,
  type UnionStatus,
  type UnionType,
} from '../types.js';

export interface GedcomWarning {
  line?: number;
  code: string;
  message: string;
}

export interface GedcomParseOptions {
  dateOrder?: 'DMY' | 'MDY';
}

export interface GedcomParseResult {
  tree: FamilyTree;
  warnings: GedcomWarning[];
}

export interface GedcomSerializeOptions {
  lineEnding?: '\n' | '\r\n';
}

interface GedcomNode {
  level: number;
  lineNumber: number;
  xref?: string;
  tag: string;
  value?: string;
  children: GedcomNode[];
}

const GEDCOM_LINE_RE = /^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?: (.*))?$/;
const XREF_RE = /^@([^@]+)@$/;

function stripXref(raw: string): string {
  const match = XREF_RE.exec(raw.trim());
  return match ? match[1]! : raw.trim();
}

function isXref(raw: string | undefined): boolean {
  return raw !== undefined && XREF_RE.test(raw.trim());
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function getNodeText(node: GedcomNode): string {
  let result = node.value ?? '';
  for (const child of node.children) {
    if (child.tag === 'CONT') {
      result += '\n' + getNodeText(child);
    } else if (child.tag === 'CONC') {
      result += getNodeText(child);
    }
  }
  return result;
}

function findChild(node: GedcomNode, tag: string): GedcomNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

function findChildren(node: GedcomNode, tag: string): GedcomNode[] {
  return node.children.filter((c) => c.tag === tag);
}

function parseNonNegativeInt(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return undefined;
  const num = Number(trimmed);
  return Number.isSafeInteger(num) && num >= 0 ? num : undefined;
}

function mapGedcomSex(raw: string | undefined): BiologicalSex {
  const normalized = raw?.trim().toUpperCase();
  if (normalized === 'M') return 'male';
  if (normalized === 'F') return 'female';
  if (normalized === 'X' || normalized === 'O' || normalized === 'OTHER') return 'other';
  return 'unknown';
}

function mapGedcomParentChildType(raw: string | undefined): ParentChildType | undefined {
  if (!raw) return undefined;
  const norm = raw.trim().toLowerCase();
  switch (norm) {
    case 'birth':
    case 'natural':
    case 'biological':
      return 'biological';
    case 'adopted':
    case 'adop':
      return 'adopted';
    case 'foster':
      return 'foster';
    case 'step':
      return 'step';
    case 'sealing':
    case 'sealed':
      return 'sealed';
    case 'unknown':
    case 'private':
      return 'unknown';
    default:
      return 'unknown';
  }
}

function parseGedcomName(node: GedcomNode): PersonName {
  const rawName = getNodeText(node).trim();

  let givenFromSlash: string | undefined;
  let surnameFromSlash: string | undefined;
  let suffixFromSlash: string | undefined;

  const slashMatch = /^([^/]*)\/([^/]*)\/(.*)$/.exec(rawName);
  if (slashMatch) {
    const g = slashMatch[1]!.trim();
    const s = slashMatch[2]!.trim();
    const sf = slashMatch[3]!.trim();
    if (g) givenFromSlash = g;
    if (s) surnameFromSlash = s;
    if (sf) suffixFromSlash = sf;
  } else if (rawName) {
    givenFromSlash = rawName;
  }

  const givn = findChild(node, 'GIVN') ? getNodeText(findChild(node, 'GIVN')!).trim() : undefined;
  const surn = findChild(node, 'SURN') ? getNodeText(findChild(node, 'SURN')!).trim() : undefined;
  const npfx = findChild(node, 'NPFX') ? getNodeText(findChild(node, 'NPFX')!).trim() : undefined;
  const nsfx = findChild(node, 'NSFX') ? getNodeText(findChild(node, 'NSFX')!).trim() : undefined;
  const nick = findChild(node, 'NICK') ? getNodeText(findChild(node, 'NICK')!).trim() : undefined;
  const typeRaw = findChild(node, 'TYPE')
    ? getNodeText(findChild(node, 'TYPE')!).trim().toLowerCase()
    : undefined;

  const given = givn || givenFromSlash;
  const surname = surn || surnameFromSlash;
  const prefix = npfx || undefined;
  const suffix = nsfx || suffixFromSlash;
  const nickname = nick || undefined;

  const displayParts = [prefix, given, surname, suffix].filter(
    (part): part is string => Boolean(part && part.length > 0),
  );
  const display =
    displayParts.length > 0
      ? displayParts.join(' ')
      : nickname || rawName.replace(/\//g, '').trim() || 'Unknown';

  const result: PersonName = { display };
  if (given) result.given = given;
  if (surname) result.surname = surname;
  if (prefix) result.prefix = prefix;
  if (suffix) result.suffix = suffix;
  if (nickname) result.nickname = nickname;

  if (typeRaw) {
    if (
      typeRaw === 'birth' ||
      typeRaw === 'married' ||
      typeRaw === 'maiden' ||
      typeRaw === 'aka'
    ) {
      result.type = typeRaw;
    } else {
      result.type = 'other';
    }
  }

  return result;
}

function parseCitationsFromNode(
  parentNode: GedcomNode,
  sources: Record<SourceId, SourceRecord>,
  warnings: GedcomWarning[],
  nextSyntheticSourceId: () => SourceId,
): SourceCitation[] {
  const citations: SourceCitation[] = [];

  for (const sourNode of findChildren(parentNode, 'SOUR')) {
    const rawVal = sourNode.value?.trim() ?? '';
    let sourceId: SourceId;

    if (isXref(rawVal)) {
      sourceId = stripXref(rawVal);
    } else if (rawVal.length > 0) {
      sourceId = nextSyntheticSourceId();
      sources[sourceId] = {
        id: sourceId,
        title: getNodeText(sourNode).trim(),
      };
      warnings.push({
        line: sourNode.lineNumber,
        code: 'INLINE_SOURCE_SYNTHESIZED',
        message: `Inline SOUR text was converted to synthetic source "${sourceId}".`,
      });
    } else {
      warnings.push({
        line: sourNode.lineNumber,
        code: 'EMPTY_SOURCE_CITATION',
        message: 'Skipped empty SOUR citation without reference or text.',
      });
      continue;
    }

    const pageNode = findChild(sourNode, 'PAGE');
    const page = pageNode ? getNodeText(pageNode).trim() : undefined;

    const externalIds: string[] = [];
    for (const extTag of ['_APID', '_HPID', '_WPID'] as const) {
      for (const extNode of findChildren(sourNode, extTag)) {
        const val = getNodeText(extNode).trim();
        if (val) {
          externalIds.push(extTag === '_APID' ? val : `${extTag}:${val}`);
        }
      }
    }

    const noteTexts: string[] = [];
    for (const noteNode of findChildren(sourNode, 'NOTE')) {
      const txt = getNodeText(noteNode).trim();
      if (txt) noteTexts.push(txt);
    }

    const citation: SourceCitation = { sourceId };
    if (page) citation.page = page;
    if (externalIds.length > 0) citation.externalIds = externalIds;
    if (noteTexts.length > 0) citation.note = noteTexts.join('\n');
    citations.push(citation);
  }

  return citations;
}

function parseMediaDetailsFromNode(
  id: MediaId,
  node: GedcomNode,
  dateOrder: 'DMY' | 'MDY',
): MediaObject {
  const mediaObj: MediaObject = { id };

  const fileNode = findChild(node, 'FILE');
  const fileVal = fileNode ? getNodeText(fileNode).trim() : undefined;
  if (fileVal) {
    mediaObj.file = fileVal;
  }

  const formNode =
    (fileNode ? findChild(fileNode, 'FORM') : undefined) ?? findChild(node, 'FORM');
  const formVal = formNode ? getNodeText(formNode).trim() : undefined;
  if (formVal) {
    mediaObj.format = formVal;
  }

  const titlNode =
    (fileNode ? findChild(fileNode, 'TITL') : undefined) ?? findChild(node, 'TITL');
  const titlVal = titlNode ? getNodeText(titlNode).trim() : undefined;
  if (titlVal) {
    mediaObj.title = titlVal;
  }

  const typeFromForm = formNode ? findChild(formNode, 'TYPE') : undefined;
  const mtypeFromForm = formNode ? findChild(formNode, '_MTYPE') : undefined;
  const stypeFromForm = formNode ? findChild(formNode, '_STYPE') : undefined;
  const sizeFromForm = formNode ? findChild(formNode, '_SIZE') : undefined;
  const wdthFromForm = formNode ? findChild(formNode, '_WDTH') : undefined;
  const hghtFromForm = formNode ? findChild(formNode, '_HGHT') : undefined;

  const topType = findChild(node, 'TYPE');
  const mediaType =
    (mtypeFromForm ? getNodeText(mtypeFromForm).trim() : undefined) ||
    (typeFromForm ? getNodeText(typeFromForm).trim() : undefined) ||
    (topType ? getNodeText(topType).trim() : undefined);
  if (mediaType) {
    mediaObj.mediaType = mediaType;
  }

  const stype = stypeFromForm ? getNodeText(stypeFromForm).trim().toLowerCase() : undefined;
  const typeBase = (typeFromForm ? getNodeText(typeFromForm).trim().toLowerCase() : undefined) ||
    (formVal && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff'].includes(formVal.toLowerCase())
      ? 'image'
      : undefined);

  if (stype) {
    if (stype.includes('/')) {
      mediaObj.mimeType = stype;
    } else if (typeBase) {
      mediaObj.mimeType = `${typeBase}/${stype}`;
    } else {
      mediaObj.mimeType = `image/${stype}`;
    }
  } else if (typeBase && formVal) {
    const ext = formVal.toLowerCase() === 'jpg' ? 'jpeg' : formVal.toLowerCase();
    mediaObj.mimeType = `${typeBase}/${ext}`;
  } else if (formVal && formVal.includes('/')) {
    mediaObj.mimeType = formVal.toLowerCase();
  } else if (formVal && formVal.toLowerCase() === 'pdf') {
    mediaObj.mimeType = 'application/pdf';
  }

  const width = parseNonNegativeInt(wdthFromForm ? getNodeText(wdthFromForm) : undefined);
  const height = parseNonNegativeInt(hghtFromForm ? getNodeText(hghtFromForm) : undefined);
  const fileSize = parseNonNegativeInt(sizeFromForm ? getNodeText(sizeFromForm) : undefined);
  if (width !== undefined) mediaObj.width = width;
  if (height !== undefined) mediaObj.height = height;
  if (fileSize !== undefined) mediaObj.fileSize = fileSize;

  const oidNode = findChild(node, '_OID');
  const oidVal = oidNode ? getNodeText(oidNode).trim() : undefined;
  if (oidVal) {
    mediaObj.externalId = oidVal;
  }

  const dateNode = findChild(node, 'DATE');
  if (dateNode) {
    const rawDate = getNodeText(dateNode).trim();
    if (rawDate) {
      mediaObj.date = parseGenealogicalDate(rawDate, { dateOrder });
    }
  }

  const placNode = findChild(node, 'PLAC');
  const placVal = placNode ? getNodeText(placNode).trim() : undefined;
  if (placVal) {
    mediaObj.place = placVal;
  }

  const dscrNode = findChild(node, '_DSCR');
  if (dscrNode) {
    const decoded = decodeBasicHtmlEntities(getNodeText(dscrNode)).trim();
    if (decoded) {
      mediaObj.description = decoded;
    }
  }

  const metaNode = findChild(node, '_META');
  if (metaNode) {
    const metaXml = getNodeText(metaNode);
    const transMatch = /<transcription>([\s\S]*?)<\/transcription>/i.exec(metaXml);
    if (transMatch) {
      const cleaned = decodeBasicHtmlEntities(transMatch[1]!).trim();
      if (cleaned) {
        mediaObj.transcription = cleaned;
      }
    }
  }

  return mediaObj;
}

const PERSON_EVENT_TAG_MAP: Record<string, PersonEventType> = {
  BIRT: 'birth',
  BAPM: 'baptism',
  CHR: 'christening',
  DEAT: 'death',
  BURI: 'burial',
  CREM: 'cremation',
  RESI: 'residence',
  OCCU: 'occupation',
  IMMI: 'immigration',
  EMIG: 'emigration',
  CENS: 'census',
  ADOP: 'adoption',
  _MILT: 'military',
};

function parsePersonEventNode(
  node: GedcomNode,
  dateOrder: 'DMY' | 'MDY',
  sources: Record<SourceId, SourceRecord>,
  warnings: GedcomWarning[],
  nextSyntheticSourceId: () => SourceId,
): LifeEvent | undefined {
  let type: PersonEventType | undefined = PERSON_EVENT_TAG_MAP[node.tag];
  let customType: string | undefined;

  if (node.tag === 'EVEN') {
    const typeNode = findChild(node, 'TYPE');
    const rawType = typeNode ? getNodeText(typeNode).trim() : '';
    const lower = rawType.toLowerCase();
    if (lower === 'arrival') {
      type = 'arrival';
    } else if (lower === 'departure') {
      type = 'departure';
    } else {
      type = 'custom';
      if (rawType) {
        customType = rawType;
      }
    }
  }

  if (!type) {
    return undefined;
  }

  const event: LifeEvent = { type };
  if (customType) {
    event.customType = customType;
  }

  const rawVal = getNodeText(node).trim();
  if (rawVal && !(node.tag === 'DEAT' && rawVal.toUpperCase() === 'Y')) {
    event.description = rawVal;
  }

  const dateNode = findChild(node, 'DATE');
  if (dateNode) {
    const rawDate = getNodeText(dateNode).trim();
    if (rawDate) {
      event.date = parseGenealogicalDate(rawDate, { dateOrder });
    }
  }

  const placNode = findChild(node, 'PLAC');
  if (placNode) {
    const plac = getNodeText(placNode).trim();
    if (plac) {
      event.place = plac;
    }
  }

  const notes: string[] = [];
  for (const noteNode of findChildren(node, 'NOTE')) {
    const txt = getNodeText(noteNode).trim();
    if (txt) notes.push(txt);
  }
  if (notes.length > 0) {
    event.notes = notes;
  }

  const citations = parseCitationsFromNode(
    node,
    sources,
    warnings,
    nextSyntheticSourceId,
  );
  if (citations.length > 0) {
    event.citations = citations;
  }

  return event;
}

const UNION_EVENT_TAG_MAP: Record<string, UnionEventType> = {
  MARR: 'marriage',
  ENGA: 'engagement',
  DIV: 'divorce',
  DIVF: 'divorce_filed',
  ANUL: 'annulment',
};

function parseUnionEventNode(
  node: GedcomNode,
  dateOrder: 'DMY' | 'MDY',
  sources: Record<SourceId, SourceRecord>,
  warnings: GedcomWarning[],
  nextSyntheticSourceId: () => SourceId,
): UnionEvent | undefined {
  let type: UnionEventType | undefined = UNION_EVENT_TAG_MAP[node.tag];
  let customType: string | undefined;

  if (node.tag === 'EVEN') {
    const typeNode = findChild(node, 'TYPE');
    const rawType = typeNode ? getNodeText(typeNode).trim() : '';
    const lower = rawType.toLowerCase();
    if (lower === 'separation') {
      type = 'separation';
    } else {
      type = 'custom';
      if (rawType) {
        customType = rawType;
      }
    }
  }

  if (!type) {
    return undefined;
  }

  const event: UnionEvent = { type };
  if (customType) {
    event.customType = customType;
  }

  const rawVal = getNodeText(node).trim();
  if (rawVal && rawVal.toUpperCase() !== 'Y') {
    event.description = rawVal;
  }

  const dateNode = findChild(node, 'DATE');
  if (dateNode) {
    const rawDate = getNodeText(dateNode).trim();
    if (rawDate) {
      event.date = parseGenealogicalDate(rawDate, { dateOrder });
    }
  }

  const placNode = findChild(node, 'PLAC');
  if (placNode) {
    const plac = getNodeText(placNode).trim();
    if (plac) {
      event.place = plac;
    }
  }

  const notes: string[] = [];
  for (const noteNode of findChildren(node, 'NOTE')) {
    const txt = getNodeText(noteNode).trim();
    if (txt) notes.push(txt);
  }
  if (notes.length > 0) {
    event.notes = notes;
  }

  const citations = parseCitationsFromNode(
    node,
    sources,
    warnings,
    nextSyntheticSourceId,
  );
  if (citations.length > 0) {
    event.citations = citations;
  }

  return event;
}

export function parseGedcom(
  input: string,
  options: GedcomParseOptions = {},
): GedcomParseResult {
  const dateOrder = options.dateOrder ?? 'DMY';
  const warnings: GedcomWarning[] = [];

  const cleanedInput = input.replace(/^\uFEFF/, '');
  const rawLines = cleanedInput.split(/\r\n|\n|\r/);

  const roots: GedcomNode[] = [];
  const stack: GedcomNode[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const lineNumber = i + 1;
    const rawLine = rawLines[i]!;
    if (rawLine.trim().length === 0) {
      continue;
    }

    const match = GEDCOM_LINE_RE.exec(rawLine);
    if (!match) {
      warnings.push({
        line: lineNumber,
        code: 'MALFORMED_LINE',
        message: `Skipping malformed GEDCOM line: "${rawLine}".`,
      });
      continue;
    }

    const level = Number(match[1]);
    const rawXref = match[2];
    const tag = match[3]!.toUpperCase();
    const value = match[4];

    const node: GedcomNode = {
      level,
      lineNumber,
      tag,
      children: [],
    };
    if (rawXref) {
      node.xref = stripXref(rawXref);
    }
    if (value !== undefined) {
      node.value = value;
    }

    if (level === 0) {
      stack.length = 0;
      roots.push(node);
      stack.push(node);
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (!parent) {
      warnings.push({
        line: lineNumber,
        code: 'ORPHAN_LINE_LEVEL',
        message: `Line ${lineNumber} has level ${level} with no level 0 parent.`,
      });
      continue;
    }

    if (level > parent.level + 1) {
      warnings.push({
        line: lineNumber,
        code: 'LEVEL_JUMP',
        message: `Line ${lineNumber} jumped from level ${parent.level} to ${level}.`,
      });
    }

    parent.children.push(node);
    stack.push(node);
  }

  const metadata: TreeMetadata = {};
  const persons: Record<PersonId, Person> = {};
  const unions: Record<UnionId, Union> = {};
  const media: Record<MediaId, MediaObject> = {};
  const sources: Record<SourceId, SourceRecord> = {};
  const repositories: Record<RepositoryId, RepositoryRecord> = {};
  const notes: Record<NoteId, NoteRecord> = {};
  const submitters = new Map<string, string>();

  let syntheticSourceSeq = 0;
  let syntheticMediaSeq = 0;
  const nextSyntheticSourceId = (): SourceId => `S_INLINE_${++syntheticSourceSeq}`;
  const nextSyntheticMediaId = (): MediaId => `O_INLINE_${++syntheticMediaSeq}`;

  const indiNodes: GedcomNode[] = [];
  const famNodes: GedcomNode[] = [];
  let headNode: GedcomNode | undefined;

  // Pass 1: collect HEAD, SUBM, REPO, SOUR, NOTE, OBJE, and record INDI/FAM order
  for (const root of roots) {
    switch (root.tag) {
      case 'HEAD':
        headNode = root;
        break;
      case 'SUBM': {
        if (root.xref) {
          const nameNode = findChild(root, 'NAME');
          if (nameNode) {
            submitters.set(root.xref, getNodeText(nameNode).trim());
          }
        }
        break;
      }
      case 'REPO': {
        if (!root.xref) break;
        const nameNode = findChild(root, 'NAME');
        const addrNode = findChild(root, 'ADDR');
        const wwwNode = findChild(root, 'WWW');
        const phonNode = findChild(root, 'PHON');
        const noteNode = findChild(root, 'NOTE');

        const repo: RepositoryRecord = {
          id: root.xref,
          name: (nameNode ? getNodeText(nameNode).trim() : '') || root.xref,
        };
        if (addrNode) {
          const addr = getNodeText(addrNode).trim();
          if (addr) repo.address = addr;
        }
        if (wwwNode) {
          const url = getNodeText(wwwNode).trim();
          if (url) repo.url = url;
        }
        if (phonNode) {
          const phone = getNodeText(phonNode).trim();
          if (phone) repo.phone = phone;
        }
        if (noteNode) {
          const note = getNodeText(noteNode).trim();
          if (note) repo.note = note;
        }
        repositories[repo.id] = repo;
        break;
      }
      case 'SOUR': {
        if (!root.xref) break;
        const titlNode = findChild(root, 'TITL') ?? findChild(root, 'ABBR');
        const authNode = findChild(root, 'AUTH');
        const publNode = findChild(root, 'PUBL');
        const repoNode = findChild(root, 'REPO');
        const apidNode = findChild(root, '_APID');
        const noteNode = findChild(root, 'NOTE');

        const source: SourceRecord = { id: root.xref };
        if (titlNode) {
          const title = getNodeText(titlNode).trim();
          if (title) source.title = title;
        }
        if (authNode) {
          const author = getNodeText(authNode).trim();
          if (author) source.author = author;
        }
        if (publNode) {
          const pubParts = [getNodeText(publNode).trim()];
          const pubDate = findChild(publNode, 'DATE');
          const pubPlac = findChild(publNode, 'PLAC');
          if (pubDate) pubParts.push(getNodeText(pubDate).trim());
          if (pubPlac) pubParts.push(getNodeText(pubPlac).trim());
          const pub = pubParts.filter(Boolean).join(', ');
          if (pub) source.publisher = pub;
        }
        if (repoNode?.value && isXref(repoNode.value)) {
          source.repositoryId = stripXref(repoNode.value);
        }
        if (apidNode) {
          const apid = getNodeText(apidNode).trim();
          if (apid) source.externalId = apid;
        }
        if (noteNode) {
          const note = getNodeText(noteNode).trim();
          if (note) source.note = note;
        }
        sources[source.id] = source;
        break;
      }
      case 'NOTE': {
        if (!root.xref) break;
        notes[root.xref] = {
          id: root.xref,
          text: getNodeText(root),
        };
        break;
      }
      case 'OBJE': {
        if (!root.xref) break;
        media[root.xref] = parseMediaDetailsFromNode(root.xref, root, dateOrder);
        break;
      }
      case 'INDI':
        indiNodes.push(root);
        break;
      case 'FAM':
        famNodes.push(root);
        break;
      default:
        break;
    }
  }

  // Extract HEAD metadata
  if (headNode) {
    const sourNode = findChild(headNode, 'SOUR');
    if (sourNode) {
      const nameNode = findChild(sourNode, 'NAME');
      const versNode = findChild(sourNode, 'VERS');
      const treeNode = findChild(sourNode, '_TREE');

      const sysName =
        (nameNode ? getNodeText(nameNode).trim() : '') ||
        getNodeText(sourNode).trim();
      if (sysName) metadata.sourceSystem = sysName;

      if (versNode) {
        const vers = getNodeText(versNode).trim();
        if (vers) metadata.sourceVersion = vers;
      }

      if (treeNode) {
        const title = getNodeText(treeNode).trim();
        if (title) metadata.title = title;

        const treeNote = findChild(treeNode, 'NOTE');
        if (treeNote) {
          const desc = getNodeText(treeNote).trim();
          if (desc) metadata.description = desc;
        }

        const rinNode = findChild(treeNode, 'RIN');
        if (rinNode) {
          const rin = getNodeText(rinNode).trim();
          if (rin) {
            metadata.custom = { ...(metadata.custom ?? {}), ancestryTreeId: rin };
          }
        }
      }
    }

    const dateNode = findChild(headNode, 'DATE');
    if (dateNode) {
      const dateText = getNodeText(dateNode).trim();
      const timeNode = findChild(dateNode, 'TIME');
      const timeText = timeNode ? getNodeText(timeNode).trim() : '';
      const combined = [dateText, timeText].filter(Boolean).join(' ');
      if (combined) metadata.exportedAt = combined;
    }

    const submNode = findChild(headNode, 'SUBM');
    if (submNode?.value && isXref(submNode.value)) {
      const submId = stripXref(submNode.value);
      const submName = submitters.get(submId);
      if (submName) {
        metadata.submitterName = submName;
      }
    }
  }

  // Track INDI's declared FAMC/FAMS for reconciliation
  const indiFamcLinks: Array<{
    personId: PersonId;
    unionId: UnionId;
    pedigree?: ParentChildType;
    lineNumber: number;
  }> = [];
  const indiFamsLinks: Array<{
    personId: PersonId;
    unionId: UnionId;
    lineNumber: number;
  }> = [];

  let firstPersonId: PersonId | undefined;

  const parseMediaRefsOnNode = (parentNode: GedcomNode): MediaReference[] => {
    const refs: MediaReference[] = [];
    for (const objeNode of findChildren(parentNode, 'OBJE')) {
      const primNode = findChild(objeNode, '_PRIM');
      const isPrimary =
        primNode !== undefined &&
        getNodeText(primNode).trim().toUpperCase() === 'Y';

      if (objeNode.value && isXref(objeNode.value)) {
        const mediaId = stripXref(objeNode.value);
        const ref: MediaReference = { mediaId };
        if (isPrimary) ref.isPrimary = true;
        refs.push(ref);
      } else {
        const mediaId = nextSyntheticMediaId();
        media[mediaId] = parseMediaDetailsFromNode(mediaId, objeNode, dateOrder);
        const ref: MediaReference = { mediaId };
        if (isPrimary) ref.isPrimary = true;
        refs.push(ref);
      }
    }
    return refs;
  };

  const parseNotesOnNode = (
    parentNode: GedcomNode,
  ): { inlineNotes: string[]; noteIds: NoteId[] } => {
    const inlineNotes: string[] = [];
    const noteIds: NoteId[] = [];
    for (const noteNode of findChildren(parentNode, 'NOTE')) {
      const raw = noteNode.value?.trim() ?? '';
      if (isXref(raw)) {
        noteIds.push(stripXref(raw));
      } else {
        const txt = getNodeText(noteNode).trim();
        if (txt) inlineNotes.push(txt);
      }
    }
    return { inlineNotes, noteIds };
  };

  // Pass 2: Parse INDI records
  for (const node of indiNodes) {
    if (!node.xref) {
      warnings.push({
        line: node.lineNumber,
        code: 'INDI_MISSING_XREF',
        message: `INDI at line ${node.lineNumber} has no @xref@ ID and was skipped.`,
      });
      continue;
    }

    const id = node.xref;
    if (!firstPersonId) {
      firstPersonId = id;
    }

    const nameNodes = findChildren(node, 'NAME');
    const primaryName: PersonName =
      nameNodes[0] !== undefined ? parseGedcomName(nameNodes[0]) : { display: 'Unknown' };
    const alternateNames = nameNodes.slice(1).map(parseGedcomName);

    const sexNode = findChild(node, 'SEX');
    const sex = mapGedcomSex(sexNode ? getNodeText(sexNode) : undefined);

    let birth: LifeEvent | undefined;
    let death: LifeEvent | undefined;
    const events: LifeEvent[] = [];

    for (const child of node.children) {
      if (child.tag === 'BIRT') {
        const ev = parsePersonEventNode(
          child,
          dateOrder,
          sources,
          warnings,
          nextSyntheticSourceId,
        );
        if (ev) {
          if (!birth) {
            birth = ev;
          } else {
            events.push(ev);
          }
        }
      } else if (child.tag === 'DEAT') {
        const ev = parsePersonEventNode(
          child,
          dateOrder,
          sources,
          warnings,
          nextSyntheticSourceId,
        );
        if (ev) {
          if (!death) {
            death = ev;
          } else {
            events.push(ev);
          }
        }
      } else if (PERSON_EVENT_TAG_MAP[child.tag] || child.tag === 'EVEN') {
        const ev = parsePersonEventNode(
          child,
          dateOrder,
          sources,
          warnings,
          nextSyntheticSourceId,
        );
        if (ev) {
          events.push(ev);
        }
      }
    }

    for (const famcNode of findChildren(node, 'FAMC')) {
      if (famcNode.value && isXref(famcNode.value)) {
        const unionId = stripXref(famcNode.value);
        const pediNode = findChild(famcNode, 'PEDI');
        const pedigree = pediNode
          ? mapGedcomParentChildType(getNodeText(pediNode))
          : undefined;
        indiFamcLinks.push({
          personId: id,
          unionId,
          pedigree,
          lineNumber: famcNode.lineNumber,
        });
      }
    }

    for (const famsNode of findChildren(node, 'FAMS')) {
      if (famsNode.value && isXref(famsNode.value)) {
        indiFamsLinks.push({
          personId: id,
          unionId: stripXref(famsNode.value),
          lineNumber: famsNode.lineNumber,
        });
      }
    }

    const mediaRefs = parseMediaRefsOnNode(node);
    const { inlineNotes, noteIds } = parseNotesOnNode(node);
    const citations = parseCitationsFromNode(
      node,
      sources,
      warnings,
      nextSyntheticSourceId,
    );

    const person: Person = {
      id,
      name: primaryName,
      sex,
      events,
      media: mediaRefs,
      notes: inlineNotes,
      citations,
    };

    if (alternateNames.length > 0) person.alternateNames = alternateNames;
    if (birth) person.birth = birth;
    if (death) {
      person.death = death;
      person.isLiving = false;
    }
    if (noteIds.length > 0) person.noteIds = noteIds;

    persons[id] = person;
  }

  // Pass 3: Parse FAM records
  for (const node of famNodes) {
    if (!node.xref) {
      warnings.push({
        line: node.lineNumber,
        code: 'FAM_MISSING_XREF',
        message: `FAM at line ${node.lineNumber} has no @xref@ ID and was skipped.`,
      });
      continue;
    }

    const id = node.xref;
    const partners: UnionPartner[] = [];
    const seenPartnerIds = new Set<PersonId>();
    let firstHusbId: PersonId | undefined;
    let firstWifeId: PersonId | undefined;

    for (const child of node.children) {
      if (child.tag !== 'HUSB' && child.tag !== 'WIFE') {
        continue;
      }
      if (!child.value || !isXref(child.value)) {
        continue;
      }
      const partnerId = stripXref(child.value);
      if (!persons[partnerId]) {
        warnings.push({
          line: child.lineNumber,
          code: 'DANGLING_PARTNER_REF',
          message: `FAM "${id}" references missing person "${partnerId}" in ${child.tag}.`,
        });
        continue;
      }
      if (seenPartnerIds.has(partnerId)) {
        warnings.push({
          line: child.lineNumber,
          code: 'DUPLICATE_PARTNER',
          message: `FAM "${id}" lists person "${partnerId}" multiple times as partner; deduplicated.`,
        });
        continue;
      }
      seenPartnerIds.add(partnerId);

      const role = child.tag === 'HUSB' ? 'husband' : 'wife';
      if (role === 'husband' && !firstHusbId) firstHusbId = partnerId;
      if (role === 'wife' && !firstWifeId) firstWifeId = partnerId;
      partners.push({ personId: partnerId, role });
    }

    const children: ChildLink[] = [];
    const seenChildIds = new Set<PersonId>();

    for (const chilNode of findChildren(node, 'CHIL')) {
      if (!chilNode.value || !isXref(chilNode.value)) {
        continue;
      }
      const childId = stripXref(chilNode.value);
      if (!persons[childId]) {
        warnings.push({
          line: chilNode.lineNumber,
          code: 'DANGLING_CHILD_REF',
          message: `FAM "${id}" references missing child "${childId}".`,
        });
        continue;
      }
      if (seenChildIds.has(childId)) {
        warnings.push({
          line: chilNode.lineNumber,
          code: 'DUPLICATE_CHILD',
          message: `FAM "${id}" lists child "${childId}" multiple times; deduplicated.`,
        });
        continue;
      }
      seenChildIds.add(childId);

      const childLink: ChildLink = { personId: childId };
      const frelNode = findChild(chilNode, '_FREL');
      const mrelNode = findChild(chilNode, '_MREL');
      const pediNode = findChild(chilNode, 'PEDI');

      const frel = frelNode
        ? mapGedcomParentChildType(getNodeText(frelNode))
        : undefined;
      const mrel = mrelNode
        ? mapGedcomParentChildType(getNodeText(mrelNode))
        : undefined;
      const pedi = pediNode
        ? mapGedcomParentChildType(getNodeText(pediNode))
        : undefined;

      const parentRelations: Record<PersonId, ParentChildType> = {};
      if (frel && firstHusbId) {
        parentRelations[firstHusbId] = frel;
      }
      if (mrel && firstWifeId) {
        parentRelations[firstWifeId] = mrel;
      }

      if (Object.keys(parentRelations).length > 0) {
        childLink.parentRelations = parentRelations;
      }

      if (pedi) {
        childLink.pedigree = pedi;
      } else if (frel && mrel && frel === mrel) {
        childLink.pedigree = frel;
      } else if (frel && !firstWifeId) {
        childLink.pedigree = frel;
      } else if (mrel && !firstHusbId) {
        childLink.pedigree = mrel;
      }

      const childNotes: string[] = [];
      for (const noteNode of findChildren(chilNode, 'NOTE')) {
        const txt = getNodeText(noteNode).trim();
        if (txt) childNotes.push(txt);
      }
      if (childNotes.length > 0) {
        childLink.notes = childNotes;
      }

      children.push(childLink);
    }

    const srelNode = findChild(node, '_SREL');
    const srelVal = srelNode ? getNodeText(srelNode).trim().toLowerCase() : undefined;

    let marriage: UnionEvent | undefined;
    let divorce: UnionEvent | undefined;
    const events: UnionEvent[] = [];

    for (const child of node.children) {
      if (child.tag === 'MARR') {
        const ev = parseUnionEventNode(
          child,
          dateOrder,
          sources,
          warnings,
          nextSyntheticSourceId,
        );
        if (ev) {
          if (!marriage) {
            marriage = ev;
          } else {
            events.push(ev);
          }
        }
      } else if (child.tag === 'DIV') {
        const ev = parseUnionEventNode(
          child,
          dateOrder,
          sources,
          warnings,
          nextSyntheticSourceId,
        );
        if (ev) {
          if (!divorce) {
            divorce = ev;
          } else {
            events.push(ev);
          }
        }
      } else if (UNION_EVENT_TAG_MAP[child.tag] || child.tag === 'EVEN') {
        const ev = parseUnionEventNode(
          child,
          dateOrder,
          sources,
          warnings,
          nextSyntheticSourceId,
        );
        if (ev) {
          events.push(ev);
        }
      }
    }

    let type: UnionType = 'marriage';
    if (srelVal === 'partner') {
      type = 'partnership';
    } else if (srelVal === 'civil_union') {
      type = 'civil_union';
    } else if (srelVal === 'common_law') {
      type = 'common_law';
    } else if (srelVal === 'unknown') {
      type = 'unknown';
    } else if (srelVal === 'married') {
      type = 'marriage';
    } else if (!marriage && events.some((e) => e.type === 'engagement')) {
      type = 'engaged';
    }

    let status: UnionStatus = 'active';
    if (divorce) {
      status = 'divorced';
    } else if (events.some((e) => e.type === 'annulment')) {
      status = 'annulled';
    } else if (events.some((e) => e.type === 'separation')) {
      status = 'separated';
    }

    const mediaRefs = parseMediaRefsOnNode(node);
    const { inlineNotes, noteIds } = parseNotesOnNode(node);
    const citations = parseCitationsFromNode(
      node,
      sources,
      warnings,
      nextSyntheticSourceId,
    );

    const union: Union = {
      id,
      partners,
      children,
      type,
      status,
      events,
      notes: inlineNotes,
      citations,
    };
    if (marriage) union.marriage = marriage;
    if (divorce) union.divorce = divorce;
    if (noteIds.length > 0) union.noteIds = noteIds;
    if (mediaRefs.length > 0) union.media = mediaRefs;

    unions[id] = union;
  }

  // Pass 4: Reconcile INDI.FAMC / INDI.FAMS and drop any dangling references
  for (const link of indiFamcLinks) {
    const union = unions[link.unionId];
    if (!union) {
      warnings.push({
        line: link.lineNumber,
        code: 'DANGLING_FAMILY_REF',
        message: `INDI "${link.personId}" FAMC references missing FAM "${link.unionId}".`,
      });
      continue;
    }
    let childLink = union.children.find((c) => c.personId === link.personId);
    if (!childLink) {
      childLink = { personId: link.personId };
      union.children.push(childLink);
      warnings.push({
        line: link.lineNumber,
        code: 'RECONCILED_FAMILY_LINK',
        message: `Added missing CHIL "${link.personId}" to FAM "${link.unionId}" from INDI FAMC.`,
      });
    }
    if (link.pedigree && !childLink.pedigree) {
      childLink.pedigree = link.pedigree;
    }
  }

  for (const link of indiFamsLinks) {
    const union = unions[link.unionId];
    if (!union) {
      warnings.push({
        line: link.lineNumber,
        code: 'DANGLING_FAMILY_REF',
        message: `INDI "${link.personId}" FAMS references missing FAM "${link.unionId}".`,
      });
      continue;
    }
    if (!union.partners.some((p) => p.personId === link.personId)) {
      const person = persons[link.personId];
      const role =
        person?.sex === 'male'
          ? 'husband'
          : person?.sex === 'female'
            ? 'wife'
            : 'partner';
      union.partners.push({ personId: link.personId, role });
      warnings.push({
        line: link.lineNumber,
        code: 'RECONCILED_FAMILY_LINK',
        message: `Added missing partner "${link.personId}" to FAM "${link.unionId}" from INDI FAMS.`,
      });
    }
  }

  // Prune dangling media, source, note, and repository pointers
  for (const source of Object.values(sources)) {
    if (source.repositoryId && !repositories[source.repositoryId]) {
      warnings.push({
        code: 'DANGLING_REPOSITORY_REF',
        message: `Removed missing repository reference "${source.repositoryId}" from source "${source.id}".`,
      });
      delete source.repositoryId;
    }
  }

  const filterCitations = (
    citations: SourceCitation[] | undefined,
    ownerId: string,
  ): SourceCitation[] | undefined => {
    if (!citations) return undefined;
    return citations.filter((cit) => {
      if (!sources[cit.sourceId]) {
        warnings.push({
          code: 'DANGLING_SOURCE_REF',
          message: `Removed missing source reference "${cit.sourceId}" from "${ownerId}".`,
        });
        return false;
      }
      return true;
    });
  };

  const filterMediaRefs = (
    refs: MediaReference[] | undefined,
    ownerId: string,
  ): MediaReference[] | undefined => {
    if (!refs) return undefined;
    return refs.filter((ref) => {
      if (!media[ref.mediaId]) {
        warnings.push({
          code: 'DANGLING_MEDIA_REF',
          message: `Removed missing media reference "${ref.mediaId}" from "${ownerId}".`,
        });
        return false;
      }
      return true;
    });
  };

  const filterNoteIds = (
    ids: NoteId[] | undefined,
    ownerId: string,
  ): NoteId[] | undefined => {
    if (!ids) return undefined;
    return ids.filter((nid) => {
      if (!notes[nid]) {
        warnings.push({
          code: 'DANGLING_NOTE_REF',
          message: `Removed missing note reference "${nid}" from "${ownerId}".`,
        });
        return false;
      }
      return true;
    });
  };

  for (const person of Object.values(persons)) {
    person.media = filterMediaRefs(person.media, person.id) ?? [];
    person.citations = filterCitations(person.citations, person.id) ?? [];
    if (person.birth?.citations) {
      const filtered = filterCitations(person.birth.citations, person.id) ?? [];
      if (filtered.length > 0) person.birth.citations = filtered;
      else delete person.birth.citations;
    }
    if (person.death?.citations) {
      const filtered = filterCitations(person.death.citations, person.id) ?? [];
      if (filtered.length > 0) person.death.citations = filtered;
      else delete person.death.citations;
    }
    for (const ev of person.events) {
      if (ev.citations) {
        const filtered = filterCitations(ev.citations, person.id) ?? [];
        if (filtered.length > 0) ev.citations = filtered;
        else delete ev.citations;
      }
    }
    if (person.noteIds) {
      const filtered = filterNoteIds(person.noteIds, person.id) ?? [];
      if (filtered.length > 0) person.noteIds = filtered;
      else delete person.noteIds;
    }
  }

  for (const union of Object.values(unions)) {
    union.citations = filterCitations(union.citations, union.id) ?? [];
    if (union.marriage?.citations) {
      const filtered = filterCitations(union.marriage.citations, union.id) ?? [];
      if (filtered.length > 0) union.marriage.citations = filtered;
      else delete union.marriage.citations;
    }
    if (union.divorce?.citations) {
      const filtered = filterCitations(union.divorce.citations, union.id) ?? [];
      if (filtered.length > 0) union.divorce.citations = filtered;
      else delete union.divorce.citations;
    }
    for (const ev of union.events) {
      if (ev.citations) {
        const filtered = filterCitations(ev.citations, union.id) ?? [];
        if (filtered.length > 0) ev.citations = filtered;
        else delete ev.citations;
      }
    }
    if (union.media) {
      const filtered = filterMediaRefs(union.media, union.id) ?? [];
      if (filtered.length > 0) union.media = filtered;
      else delete union.media;
    }
    if (union.noteIds) {
      const filtered = filterNoteIds(union.noteIds, union.id) ?? [];
      if (filtered.length > 0) union.noteIds = filtered;
      else delete union.noteIds;
    }
  }

  if (firstPersonId) {
    metadata.defaultRootPersonId = firstPersonId;
  }

  return {
    tree: {
      schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
      metadata,
      persons,
      unions,
      media,
      sources,
      repositories,
      notes,
    },
    warnings,
  };
}

// ============================================================================
// GEDCOM 5.5.1 Serializer
// ============================================================================

const REVERSE_PERSON_EVENT_TAG_MAP: Record<PersonEventType, string> = {
  birth: 'BIRT',
  baptism: 'BAPM',
  christening: 'CHR',
  death: 'DEAT',
  burial: 'BURI',
  cremation: 'CREM',
  residence: 'RESI',
  occupation: 'OCCU',
  immigration: 'IMMI',
  emigration: 'EMIG',
  arrival: 'EVEN',
  departure: 'EVEN',
  military: '_MILT',
  census: 'CENS',
  adoption: 'ADOP',
  custom: 'EVEN',
};

const REVERSE_UNION_EVENT_TAG_MAP: Record<UnionEventType, string> = {
  marriage: 'MARR',
  engagement: 'ENGA',
  divorce: 'DIV',
  divorce_filed: 'DIVF',
  annulment: 'ANUL',
  separation: 'EVEN',
  custom: 'EVEN',
};

function mapRelationToGedcomRel(rel: ParentChildType): string {
  switch (rel) {
    case 'biological':
      return 'natural';
    case 'adopted':
      return 'adopted';
    case 'step':
      return 'step';
    case 'foster':
      return 'foster';
    case 'sealed':
      return 'sealing';
    case 'unknown':
      return 'unknown';
  }
}

function mapRelationToGedcomPedi(rel: ParentChildType): string {
  switch (rel) {
    case 'biological':
      return 'birth';
    case 'adopted':
      return 'adopted';
    case 'foster':
      return 'foster';
    case 'sealed':
      return 'sealing';
    case 'step':
      return 'step';
    case 'unknown':
      return 'unknown';
  }
}

function pushTextLines(
  lines: string[],
  level: number,
  tag: string,
  text: string,
  xref?: string,
): void {
  const maxChunk = 200;
  const paragraphs = text.split(/\r\n|\n|\r/);
  const firstPara = paragraphs[0] ?? '';

  const splitLongLine = (
    lineLevel: number,
    lineTag: string,
    content: string,
    lineXref?: string,
  ): void => {
    const prefix = lineXref ? `${lineLevel} @${lineXref}@ ${lineTag}` : `${lineLevel} ${lineTag}`;
    if (content.length === 0) {
      lines.push(prefix);
      return;
    }
    const firstChunk = content.slice(0, maxChunk);
    lines.push(`${prefix} ${firstChunk}`);
    let offset = maxChunk;
    while (offset < content.length) {
      const chunk = content.slice(offset, offset + maxChunk);
      lines.push(`${lineLevel + 1} CONC ${chunk}`);
      offset += maxChunk;
    }
  };

  splitLongLine(level, tag, firstPara, xref);

  for (let i = 1; i < paragraphs.length; i++) {
    splitLongLine(level + 1, 'CONT', paragraphs[i]!);
  }
}

function emitCitations(
  lines: string[],
  level: number,
  citations: SourceCitation[] | undefined,
): void {
  if (!citations) return;
  for (const cit of citations) {
    lines.push(`${level} SOUR @${cit.sourceId}@`);
    if (cit.page) {
      pushTextLines(lines, level + 1, 'PAGE', cit.page);
    }
    if (cit.externalIds) {
      for (const extId of cit.externalIds) {
        if (extId.startsWith('_HPID:')) {
          lines.push(`${level + 1} _HPID ${extId.slice('_HPID:'.length)}`);
        } else if (extId.startsWith('_WPID:')) {
          lines.push(`${level + 1} _WPID ${extId.slice('_WPID:'.length)}`);
        } else {
          lines.push(`${level + 1} _APID ${extId}`);
        }
      }
    }
    if (cit.note) {
      pushTextLines(lines, level + 1, 'NOTE', cit.note);
    }
  }
}

function emitMediaRefs(
  lines: string[],
  level: number,
  refs: MediaReference[] | undefined,
): void {
  if (!refs) return;
  for (const ref of refs) {
    lines.push(`${level} OBJE @${ref.mediaId}@`);
    if (ref.isPrimary) {
      lines.push(`${level + 1} _PRIM Y`);
    }
  }
}

function emitPersonName(lines: string[], name: PersonName): void {
  const givenPart = [name.prefix, name.given].filter(Boolean).join(' ');
  const surnamePart = name.surname ?? '';
  const suffixPart = name.suffix ?? '';
  const gedcomName = `${givenPart ? `${givenPart} ` : ''}/${surnamePart}/${suffixPart ? ` ${suffixPart}` : ''}`.trim();
  lines.push(`1 NAME ${gedcomName || '//'}`);
  if (name.prefix) lines.push(`2 NPFX ${name.prefix}`);
  if (name.given) lines.push(`2 GIVN ${name.given}`);
  if (name.surname) lines.push(`2 SURN ${name.surname}`);
  if (name.suffix) lines.push(`2 NSFX ${name.suffix}`);
  if (name.nickname) lines.push(`2 NICK ${name.nickname}`);
  if (name.type) lines.push(`2 TYPE ${name.type}`);
}

function emitLifeEvent(lines: string[], event: LifeEvent): void {
  const tag = REVERSE_PERSON_EVENT_TAG_MAP[event.type];
  if (
    event.type === 'death' &&
    !event.date &&
    !event.place &&
    !event.description &&
    (!event.notes || event.notes.length === 0) &&
    (!event.citations || event.citations.length === 0)
  ) {
    lines.push('1 DEAT Y');
    return;
  }

  if (event.description) {
    pushTextLines(lines, 1, tag, event.description);
  } else {
    lines.push(`1 ${tag}`);
  }

  if (event.type === 'arrival') {
    lines.push('2 TYPE Arrival');
  } else if (event.type === 'departure') {
    lines.push('2 TYPE Departure');
  } else if (event.type === 'custom' && event.customType) {
    lines.push(`2 TYPE ${event.customType}`);
  }

  if (event.date) {
    const formatted = formatGenealogicalDate(event.date, 'gedcom');
    if (formatted) lines.push(`2 DATE ${formatted}`);
  }
  if (event.place) {
    pushTextLines(lines, 2, 'PLAC', event.place);
  }
  if (event.notes) {
    for (const note of event.notes) {
      pushTextLines(lines, 2, 'NOTE', note);
    }
  }
  emitCitations(lines, 2, event.citations);
}

function emitUnionEvent(lines: string[], event: UnionEvent): void {
  const tag = REVERSE_UNION_EVENT_TAG_MAP[event.type];
  if (event.description) {
    pushTextLines(lines, 1, tag, event.description);
  } else {
    lines.push(`1 ${tag}`);
  }

  if (event.type === 'separation') {
    lines.push('2 TYPE Separation');
  } else if (event.type === 'custom' && event.customType) {
    lines.push(`2 TYPE ${event.customType}`);
  }

  if (event.date) {
    const formatted = formatGenealogicalDate(event.date, 'gedcom');
    if (formatted) lines.push(`2 DATE ${formatted}`);
  }
  if (event.place) {
    pushTextLines(lines, 2, 'PLAC', event.place);
  }
  if (event.notes) {
    for (const note of event.notes) {
      pushTextLines(lines, 2, 'NOTE', note);
    }
  }
  emitCitations(lines, 2, event.citations);
}

export function serializeGedcom(
  tree: FamilyTree,
  options: GedcomSerializeOptions = {},
): string {
  const lineEnding = options.lineEnding ?? '\n';
  const lines: string[] = [];

  // HEAD
  lines.push('0 HEAD');
  lines.push('1 SOUR FamilyTree');
  lines.push(`2 NAME ${tree.metadata.sourceSystem ?? 'FamilyTree'}`);
  if (tree.metadata.sourceVersion) {
    lines.push(`2 VERS ${tree.metadata.sourceVersion}`);
  }
  if (tree.metadata.title) {
    lines.push(`2 _TREE ${tree.metadata.title}`);
    if (tree.metadata.description) {
      pushTextLines(lines, 3, 'NOTE', tree.metadata.description);
    }
  }
  if (tree.metadata.submitterName) {
    lines.push('1 SUBM @SUBM1@');
  }
  lines.push('1 GEDC');
  lines.push('2 VERS 5.5.1');
  lines.push('2 FORM LINEAGE-LINKED');
  lines.push('1 CHAR UTF-8');

  if (tree.metadata.submitterName) {
    lines.push('0 @SUBM1@ SUBM');
    lines.push(`1 NAME ${tree.metadata.submitterName}`);
  }

  // Derive FAMC & FAMS per person directly from tree.unions (single source of truth)
  const famcByPerson = new Map<
    PersonId,
    Array<{ unionId: UnionId; pedigree?: ParentChildType }>
  >();
  const famsByPerson = new Map<PersonId, UnionId[]>();

  for (const union of Object.values(tree.unions)) {
    for (const partner of union.partners) {
      const list = famsByPerson.get(partner.personId);
      if (list) list.push(union.id);
      else famsByPerson.set(partner.personId, [union.id]);
    }
    for (const child of union.children) {
      const list = famcByPerson.get(child.personId);
      const entry = { unionId: union.id, pedigree: child.pedigree };
      if (list) list.push(entry);
      else famcByPerson.set(child.personId, [entry]);
    }
  }

  // INDI records
  for (const person of Object.values(tree.persons)) {
    lines.push(`0 @${person.id}@ INDI`);
    emitPersonName(lines, person.name);
    if (person.alternateNames) {
      for (const alt of person.alternateNames) {
        emitPersonName(lines, alt);
      }
    }

    if (person.sex === 'male') lines.push('1 SEX M');
    else if (person.sex === 'female') lines.push('1 SEX F');
    else if (person.sex === 'other') lines.push('1 SEX X');
    else lines.push('1 SEX U');

    for (const famc of famcByPerson.get(person.id) ?? []) {
      lines.push(`1 FAMC @${famc.unionId}@`);
      if (famc.pedigree && famc.pedigree !== 'biological') {
        lines.push(`2 PEDI ${mapRelationToGedcomPedi(famc.pedigree)}`);
      }
    }
    for (const famsId of famsByPerson.get(person.id) ?? []) {
      lines.push(`1 FAMS @${famsId}@`);
    }

    if (person.birth) emitLifeEvent(lines, person.birth);
    for (const ev of person.events) emitLifeEvent(lines, ev);
    if (person.death) emitLifeEvent(lines, person.death);

    for (const note of person.notes) {
      pushTextLines(lines, 1, 'NOTE', note);
    }
    for (const noteId of person.noteIds ?? []) {
      lines.push(`1 NOTE @${noteId}@`);
    }

    emitCitations(lines, 1, person.citations);
    emitMediaRefs(lines, 1, person.media);
  }

  // FAM records
  for (const union of Object.values(tree.unions)) {
    lines.push(`0 @${union.id}@ FAM`);
    if (union.type === 'partnership') {
      lines.push('1 _SREL partner');
    } else if (union.type === 'civil_union') {
      lines.push('1 _SREL civil_union');
    } else if (union.type === 'common_law') {
      lines.push('1 _SREL common_law');
    } else if (union.type === 'unknown') {
      lines.push('1 _SREL unknown');
    }

    let firstHusbId: PersonId | undefined;
    let firstWifeId: PersonId | undefined;

    for (const partner of union.partners) {
      let tag: 'HUSB' | 'WIFE';
      if (partner.role === 'husband') {
        tag = 'HUSB';
      } else if (partner.role === 'wife') {
        tag = 'WIFE';
      } else {
        const pSex = tree.persons[partner.personId]?.sex;
        tag = pSex === 'female' ? 'WIFE' : 'HUSB';
      }
      if (tag === 'HUSB' && !firstHusbId) firstHusbId = partner.personId;
      if (tag === 'WIFE' && !firstWifeId) firstWifeId = partner.personId;
      lines.push(`1 ${tag} @${partner.personId}@`);
    }

    for (const child of union.children) {
      lines.push(`1 CHIL @${child.personId}@`);
      const frel =
        (firstHusbId ? child.parentRelations?.[firstHusbId] : undefined) ??
        (firstHusbId ? child.pedigree : undefined);
      const mrel =
        (firstWifeId ? child.parentRelations?.[firstWifeId] : undefined) ??
        (firstWifeId ? child.pedigree : undefined);

      if (frel) {
        lines.push(`2 _FREL ${mapRelationToGedcomRel(frel)}`);
      }
      if (mrel) {
        lines.push(`2 _MREL ${mapRelationToGedcomRel(mrel)}`);
      }
      if (child.pedigree && child.pedigree !== 'biological') {
        lines.push(`2 PEDI ${mapRelationToGedcomPedi(child.pedigree)}`);
      }
      if (child.notes) {
        for (const n of child.notes) {
          pushTextLines(lines, 2, 'NOTE', n);
        }
      }
    }

    if (union.marriage) emitUnionEvent(lines, union.marriage);
    if (union.divorce) emitUnionEvent(lines, union.divorce);
    for (const ev of union.events) emitUnionEvent(lines, ev);

    for (const note of union.notes) {
      pushTextLines(lines, 1, 'NOTE', note);
    }
    for (const noteId of union.noteIds ?? []) {
      lines.push(`1 NOTE @${noteId}@`);
    }
    emitCitations(lines, 1, union.citations);
    emitMediaRefs(lines, 1, union.media);
  }

  // OBJE records
  for (const mediaObj of Object.values(tree.media)) {
    lines.push(`0 @${mediaObj.id}@ OBJE`);
    if (mediaObj.file) {
      pushTextLines(lines, 1, 'FILE', mediaObj.file);
    } else {
      lines.push('1 FILE');
    }
    if (mediaObj.format) {
      lines.push(`2 FORM ${mediaObj.format}`);
      if (mediaObj.mediaType) {
        lines.push(`3 TYPE ${mediaObj.mediaType}`);
      }
      if (mediaObj.mimeType) {
        const sub = mediaObj.mimeType.includes('/')
          ? mediaObj.mimeType.split('/')[1]!
          : mediaObj.mimeType;
        lines.push(`3 _STYPE ${sub}`);
      }
      if (mediaObj.fileSize !== undefined) {
        lines.push(`3 _SIZE ${mediaObj.fileSize}`);
      }
      if (mediaObj.width !== undefined) {
        lines.push(`3 _WDTH ${mediaObj.width}`);
      }
      if (mediaObj.height !== undefined) {
        lines.push(`3 _HGHT ${mediaObj.height}`);
      }
    }
    if (mediaObj.title) {
      pushTextLines(lines, 2, 'TITL', mediaObj.title);
    }
    if (mediaObj.externalId) {
      lines.push(`1 _OID ${mediaObj.externalId}`);
    }
    if (mediaObj.date) {
      const formatted = formatGenealogicalDate(mediaObj.date, 'gedcom');
      if (formatted) lines.push(`1 DATE ${formatted}`);
    }
    if (mediaObj.place) {
      pushTextLines(lines, 1, 'PLAC', mediaObj.place);
    }
    if (mediaObj.description) {
      pushTextLines(lines, 1, '_DSCR', mediaObj.description);
    }
    if (mediaObj.transcription) {
      pushTextLines(
        lines,
        1,
        '_META',
        `<metadataxml><transcription>${mediaObj.transcription}</transcription></metadataxml>`,
      );
    }
  }

  // SOUR records
  for (const source of Object.values(tree.sources)) {
    lines.push(`0 @${source.id}@ SOUR`);
    if (source.title) pushTextLines(lines, 1, 'TITL', source.title);
    if (source.author) pushTextLines(lines, 1, 'AUTH', source.author);
    if (source.publisher) pushTextLines(lines, 1, 'PUBL', source.publisher);
    if (source.externalId) lines.push(`1 _APID ${source.externalId}`);
    if (source.repositoryId) lines.push(`1 REPO @${source.repositoryId}@`);
    if (source.note) pushTextLines(lines, 1, 'NOTE', source.note);
  }

  // REPO records
  for (const repo of Object.values(tree.repositories)) {
    lines.push(`0 @${repo.id}@ REPO`);
    pushTextLines(lines, 1, 'NAME', repo.name);
    if (repo.address) pushTextLines(lines, 1, 'ADDR', repo.address);
    if (repo.phone) lines.push(`1 PHON ${repo.phone}`);
    if (repo.url) lines.push(`1 WWW ${repo.url}`);
    if (repo.note) pushTextLines(lines, 1, 'NOTE', repo.note);
  }

  // NOTE records
  for (const note of Object.values(tree.notes)) {
    pushTextLines(lines, 0, 'NOTE', note.text, note.id);
  }

  lines.push('0 TRLR');
  return lines.join(lineEnding) + lineEnding;
}
