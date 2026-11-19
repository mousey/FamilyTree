import type { DateQualifier, GenealogicalDate, LifeEvent, PartialDate } from './types.js';

export interface ParseDateOptions {
  dateOrder?: 'DMY' | 'MDY';
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const GEDCOM_MONTHS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function isValidPartialDate(date: PartialDate): boolean {
  if (date.month !== undefined && (date.month < 1 || date.month > 12)) {
    return false;
  }
  if (date.day !== undefined && (date.day < 1 || date.day > 31)) {
    return false;
  }
  if (date.day !== undefined && date.month === undefined) {
    return false;
  }
  return date.year !== undefined || date.month !== undefined || date.day !== undefined;
}

function computeSortKey(start: PartialDate | undefined): number | undefined {
  if (start?.year === undefined) {
    return undefined;
  }
  const month = start.month ?? 1;
  const day = start.day ?? 1;
  return start.year * 10000 + month * 100 + day;
}

function disambiguateNumericPair(
  first: number,
  second: number,
  year: number,
  dateOrder: 'DMY' | 'MDY',
): PartialDate | undefined {
  // Auto-disambiguate when one slot exceeds 12
  if (first > 12 && second >= 1 && second <= 12) {
    const candidate: PartialDate = { year, month: second, day: first };
    return isValidPartialDate(candidate) ? candidate : undefined;
  }
  if (second > 12 && first >= 1 && first <= 12) {
    const candidate: PartialDate = { year, month: first, day: second };
    return isValidPartialDate(candidate) ? candidate : undefined;
  }
  const candidate: PartialDate =
    dateOrder === 'MDY'
      ? { year, month: first, day: second }
      : { year, month: second, day: first };
  return isValidPartialDate(candidate) ? candidate : undefined;
}

function parseSingleDate(text: string, dateOrder: 'DMY' | 'MDY'): PartialDate | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  // ISO YYYY-MM-DD or YYYY-MM
  const isoFull = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (isoFull) {
    const year = Number(isoFull[1]);
    const month = Number(isoFull[2]);
    const day = Number(isoFull[3]);
    const candidate: PartialDate = { year, month, day };
    return isValidPartialDate(candidate) ? candidate : undefined;
  }

  const isoMonth = /^(\d{4})-(\d{1,2})$/.exec(trimmed);
  if (isoMonth) {
    const year = Number(isoMonth[1]);
    const month = Number(isoMonth[2]);
    const candidate: PartialDate = { year, month };
    return isValidPartialDate(candidate) ? candidate : undefined;
  }

  // Plain year YYYY (accept 1..4 digits only if 4-digit year, e.g., 1735..2099)
  const yearOnly = /^(\d{4})$/.exec(trimmed);
  if (yearOnly) {
    return { year: Number(yearOnly[1]) };
  }

  // D(D) MON YYYY (GEDCOM standard and full English month names)
  const dMonY = /^(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})$/.exec(trimmed);
  if (dMonY) {
    const day = Number(dMonY[1]);
    const monthName = dMonY[2]!.toLowerCase();
    const month = MONTH_INDEX[monthName];
    const year = Number(dMonY[3]);
    if (month !== undefined) {
      const candidate: PartialDate = { year, month, day };
      return isValidPartialDate(candidate) ? candidate : undefined;
    }
  }

  // MON D(D),? YYYY (e.g. "Jan 24, 1923" or "March 8 1881")
  const monDY = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(trimmed);
  if (monDY) {
    const month = MONTH_INDEX[monDY[1]!.toLowerCase()];
    const day = Number(monDY[2]);
    const year = Number(monDY[3]);
    if (month !== undefined) {
      const candidate: PartialDate = { year, month, day };
      return isValidPartialDate(candidate) ? candidate : undefined;
    }
  }

  // MON YYYY (e.g. "Feb 2003", "Sep 1924")
  const monY = /^([A-Za-z]+)\.?\s+(\d{4})$/.exec(trimmed);
  if (monY) {
    const month = MONTH_INDEX[monY[1]!.toLowerCase()];
    const year = Number(monY[2]);
    if (month !== undefined) {
      return { year, month };
    }
  }

  // Slash dates: D(D)/M(M)/YYYY or M(M)/D(D)/YYYY
  const slashFull = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slashFull) {
    return disambiguateNumericPair(
      Number(slashFull[1]),
      Number(slashFull[2]),
      Number(slashFull[3]),
      dateOrder,
    );
  }

  // Slash month/year: M(M)/YYYY (e.g. "12/1909", "01/1959", "07/1986")
  const slashMonthYear = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (slashMonthYear) {
    const month = Number(slashMonthYear[1]);
    const year = Number(slashMonthYear[2]);
    const candidate: PartialDate = { year, month };
    return isValidPartialDate(candidate) ? candidate : undefined;
  }

  // Space-separated numeric: MM DD YYYY / DD MM YYYY (e.g. "02 23 1735")
  const spaceFull = /^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/.exec(trimmed);
  if (spaceFull) {
    return disambiguateNumericPair(
      Number(spaceFull[1]),
      Number(spaceFull[2]),
      Number(spaceFull[3]),
      dateOrder,
    );
  }

  return undefined;
}

export function parseGenealogicalDate(
  rawInput: string,
  options: ParseDateOptions = {},
): GenealogicalDate {
  const raw = rawInput.trim();
  const dateOrder = options.dateOrder ?? 'DMY';

  if (!raw) {
    return { raw: '', qualifier: 'exact' };
  }

  // Year range like "1914-1920" (Ancestry _MILT etc.)
  const yearRange = /^(\d{4})\s*[-–]\s*(\d{4})$/.exec(raw);
  if (yearRange) {
    const start: PartialDate = { year: Number(yearRange[1]) };
    const end: PartialDate = { year: Number(yearRange[2]) };
    return {
      raw,
      qualifier: 'from_to',
      start,
      end,
      sortKey: computeSortKey(start),
    };
  }

  // BET <d1> AND <d2>
  const betMatch = /^BET\.?\s+(.+?)\s+AND\s+(.+)$/i.exec(raw);
  if (betMatch) {
    const start = parseSingleDate(betMatch[1]!, dateOrder);
    const end = parseSingleDate(betMatch[2]!, dateOrder);
    const result: GenealogicalDate = {
      raw,
      qualifier: 'between',
    };
    if (start) {
      result.start = start;
      const sortKey = computeSortKey(start);
      if (sortKey !== undefined) {
        result.sortKey = sortKey;
      }
    }
    if (end) {
      result.end = end;
    }
    return result;
  }

  // FROM <d1> TO <d2>
  const fromToMatch = /^FROM\s+(.+?)\s+TO\s+(.+)$/i.exec(raw);
  if (fromToMatch) {
    const start = parseSingleDate(fromToMatch[1]!, dateOrder);
    const end = parseSingleDate(fromToMatch[2]!, dateOrder);
    const result: GenealogicalDate = {
      raw,
      qualifier: 'from_to',
    };
    if (start) {
      result.start = start;
      const sortKey = computeSortKey(start);
      if (sortKey !== undefined) {
        result.sortKey = sortKey;
      }
    }
    if (end) {
      result.end = end;
    }
    return result;
  }

  // Single prefix qualifiers
  const prefixRules: Array<{ pattern: RegExp; qualifier: DateQualifier }> = [
    { pattern: /^(?:ABT\.?|ABOUT|CA\.?|CIRCA|C\.)\s+(.+)$/i, qualifier: 'about' },
    { pattern: /^(?:BEF\.?|BEFORE)\s+(.+)$/i, qualifier: 'before' },
    { pattern: /^(?:AFT\.?|AFTER)\s+(.+)$/i, qualifier: 'after' },
    { pattern: /^CAL\.?\s+(.+)$/i, qualifier: 'calculated' },
    { pattern: /^EST\.?\s+(.+)$/i, qualifier: 'estimated' },
    { pattern: /^FROM\s+(.+)$/i, qualifier: 'after' },
    { pattern: /^TO\s+(.+)$/i, qualifier: 'before' },
  ];

  for (const rule of prefixRules) {
    const match = rule.pattern.exec(raw);
    if (match) {
      const parsed = parseSingleDate(match[1]!, dateOrder);
      const result: GenealogicalDate = {
        raw,
        qualifier: rule.qualifier,
      };
      if (parsed) {
        result.start = parsed;
        const sortKey = computeSortKey(parsed);
        if (sortKey !== undefined) {
          result.sortKey = sortKey;
        }
      }
      return result;
    }
  }

  // Plain single date
  const single = parseSingleDate(raw, dateOrder);
  if (single) {
    const result: GenealogicalDate = {
      raw,
      qualifier: 'exact',
      start: single,
    };
    const sortKey = computeSortKey(single);
    if (sortKey !== undefined) {
      result.sortKey = sortKey;
    }
    return result;
  }

  // Unparseable phrase (preserve raw cleanly without throwing)
  return {
    raw,
    qualifier: 'exact',
  };
}

function formatPartialGedcom(date: PartialDate): string {
  const parts: string[] = [];
  if (date.day !== undefined) {
    parts.push(String(date.day).padStart(2, '0'));
  }
  if (date.month !== undefined) {
    const mon = GEDCOM_MONTHS[date.month - 1];
    if (mon) {
      parts.push(mon);
    }
  }
  if (date.year !== undefined) {
    parts.push(String(date.year));
  }
  return parts.join(' ');
}

function formatPartialShort(date: PartialDate): string {
  const parts: string[] = [];
  if (date.day !== undefined) {
    parts.push(String(date.day));
  }
  if (date.month !== undefined) {
    const mon = SHORT_MONTHS[date.month - 1];
    if (mon) {
      parts.push(mon);
    }
  }
  if (date.year !== undefined) {
    parts.push(String(date.year));
  }
  return parts.join(' ');
}

function formatPartialIso(date: PartialDate): string {
  if (date.year === undefined) {
    return '';
  }
  const yearStr = String(date.year).padStart(4, '0');
  if (date.month === undefined) {
    return yearStr;
  }
  const monthStr = String(date.month).padStart(2, '0');
  if (date.day === undefined) {
    return `${yearStr}-${monthStr}`;
  }
  const dayStr = String(date.day).padStart(2, '0');
  return `${yearStr}-${monthStr}-${dayStr}`;
}

export function formatGenealogicalDate(
  date: GenealogicalDate,
  style: 'short' | 'gedcom' | 'iso' = 'short',
): string {
  if (style === 'iso') {
    if (date.start?.year !== undefined) {
      return formatPartialIso(date.start);
    }
    return date.raw;
  }

  if (!date.start) {
    return date.raw;
  }

  if (style === 'gedcom') {
    const startStr = formatPartialGedcom(date.start);
    const endStr = date.end ? formatPartialGedcom(date.end) : '';
    switch (date.qualifier) {
      case 'exact':
        return startStr;
      case 'about':
        return `ABT ${startStr}`;
      case 'before':
        return `BEF ${startStr}`;
      case 'after':
        return `AFT ${startStr}`;
      case 'calculated':
        return `CAL ${startStr}`;
      case 'estimated':
        return `EST ${startStr}`;
      case 'between':
        return endStr ? `BET ${startStr} AND ${endStr}` : `BET ${startStr}`;
      case 'from_to':
        return endStr ? `FROM ${startStr} TO ${endStr}` : `FROM ${startStr}`;
    }
  }

  // style === 'short'
  const startStr = formatPartialShort(date.start);
  const endStr = date.end ? formatPartialShort(date.end) : '';
  switch (date.qualifier) {
    case 'exact':
      return startStr;
    case 'about':
      return `c. ${startStr}`;
    case 'before':
      return `bef. ${startStr}`;
    case 'after':
      return `aft. ${startStr}`;
    case 'calculated':
      return `cal. ${startStr}`;
    case 'estimated':
      return `est. ${startStr}`;
    case 'between':
      return endStr ? `${startStr}–${endStr}` : startStr;
    case 'from_to':
      return endStr ? `${startStr}–${endStr}` : startStr;
  }
}

export function compareGenealogicalDates(
  a?: GenealogicalDate,
  b?: GenealogicalDate,
): number {
  const ka = a?.sortKey;
  const kb = b?.sortKey;
  if (ka === undefined && kb === undefined) {
    return 0;
  }
  if (ka === undefined) {
    return 1;
  }
  if (kb === undefined) {
    return -1;
  }
  return ka - kb;
}

function formatYearForLifespan(date: GenealogicalDate | undefined): string | undefined {
  if (!date?.start?.year) {
    return undefined;
  }
  const year = String(date.start.year);
  switch (date.qualifier) {
    case 'about':
      return `c. ${year}`;
    case 'before':
      return `bef. ${year}`;
    case 'after':
      return `aft. ${year}`;
    case 'calculated':
      return `cal. ${year}`;
    case 'estimated':
      return `est. ${year}`;
    default:
      return year;
  }
}

export function formatLifespan(birth?: LifeEvent, death?: LifeEvent): string {
  const b = formatYearForLifespan(birth?.date);
  const d = formatYearForLifespan(death?.date);
  if (b && d) {
    return `${b}–${d}`;
  }
  if (b) {
    return `b. ${b}`;
  }
  if (d) {
    return `d. ${d}`;
  }
  return '';
}
