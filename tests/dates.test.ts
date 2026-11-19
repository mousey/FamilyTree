import { describe, expect, it } from 'vitest';
import {
  compareGenealogicalDates,
  formatGenealogicalDate,
  formatLifespan,
  parseGenealogicalDate,
} from '../src/index.js';

describe('Genealogical Date Utilities', () => {
  it('parses standard GEDCOM and Ancestry.co.uk date formats', () => {
    expect(parseGenealogicalDate('24/01/1923')).toMatchObject({
      qualifier: 'exact',
      start: { year: 1923, month: 1, day: 24 },
      sortKey: 19230124,
    });

    // DMY default vs MDY option
    expect(parseGenealogicalDate('4/8/1973')).toMatchObject({
      qualifier: 'exact',
      start: { year: 1973, month: 8, day: 4 },
    });
    expect(parseGenealogicalDate('4/8/1973', { dateOrder: 'MDY' })).toMatchObject({
      qualifier: 'exact',
      start: { year: 1973, month: 4, day: 8 },
    });

    // Auto-disambiguate when day > 12 in MDY mode or space-separated US style
    expect(parseGenealogicalDate('02 23 1735')).toMatchObject({
      qualifier: 'exact',
      start: { year: 1735, month: 2, day: 23 },
    });

    // Slash month/year
    expect(parseGenealogicalDate('12/1909')).toMatchObject({
      qualifier: 'exact',
      start: { year: 1909, month: 12 },
      sortKey: 19091201,
    });

    // Full and abbreviated month names with mixed case
    expect(parseGenealogicalDate('20 June 2022')).toMatchObject({
      qualifier: 'exact',
      start: { year: 2022, month: 6, day: 20 },
    });
    expect(parseGenealogicalDate('05 jun 1919')).toMatchObject({
      qualifier: 'exact',
      start: { year: 1919, month: 6, day: 5 },
    });
    expect(parseGenealogicalDate('Feb 2003')).toMatchObject({
      qualifier: 'exact',
      start: { year: 2003, month: 2 },
    });

    // Year only and ISO formats
    expect(parseGenealogicalDate('1986')).toMatchObject({
      qualifier: 'exact',
      start: { year: 1986 },
      sortKey: 19860101,
    });
    expect(parseGenealogicalDate('1990-04-14')).toMatchObject({
      qualifier: 'exact',
      start: { year: 1990, month: 4, day: 14 },
    });
  });

  it('parses qualifiers and ranges cleanly', () => {
    expect(parseGenealogicalDate('ABT 1824')).toMatchObject({
      qualifier: 'about',
      start: { year: 1824 },
    });
    expect(parseGenealogicalDate('about 1835')).toMatchObject({
      qualifier: 'about',
      start: { year: 1835 },
    });
    expect(parseGenealogicalDate('BEF 1811')).toMatchObject({
      qualifier: 'before',
      start: { year: 1811 },
    });
    expect(parseGenealogicalDate('AFT 1901')).toMatchObject({
      qualifier: 'after',
      start: { year: 1901 },
    });
    expect(parseGenealogicalDate('BET 1850 AND 1860')).toMatchObject({
      qualifier: 'between',
      start: { year: 1850 },
      end: { year: 1860 },
    });
    expect(parseGenealogicalDate('FROM 1914 TO 1920')).toMatchObject({
      qualifier: 'from_to',
      start: { year: 1914 },
      end: { year: 1920 },
    });
    expect(parseGenealogicalDate('1914-1920')).toMatchObject({
      qualifier: 'from_to',
      start: { year: 1914 },
      end: { year: 1920 },
    });
  });

  it('preserves unparseable strings safely without throwing', () => {
    const parsed = parseGenealogicalDate('Spring before the great frost');
    expect(parsed.raw).toBe('Spring before the great frost');
    expect(parsed.start).toBeUndefined();
    expect(parsed.sortKey).toBeUndefined();
    expect(formatGenealogicalDate(parsed, 'short')).toBe('Spring before the great frost');
  });

  it('formats dates in short, gedcom, and iso styles and sorts deterministically', () => {
    const d1 = parseGenealogicalDate('24/01/1923');
    const d2 = parseGenealogicalDate('about 1890');
    const d3 = parseGenealogicalDate('BET 1850 AND 1860');
    const d4 = parseGenealogicalDate('Feb 2003');

    expect(formatGenealogicalDate(d1, 'gedcom')).toBe('24 JAN 1923');
    expect(formatGenealogicalDate(d1, 'short')).toBe('24 Jan 1923');
    expect(formatGenealogicalDate(d1, 'iso')).toBe('1923-01-24');
    expect(formatGenealogicalDate(d2, 'gedcom')).toBe('ABT 1890');
    expect(formatGenealogicalDate(d2, 'short')).toBe('c. 1890');
    expect(formatGenealogicalDate(d3, 'gedcom')).toBe('BET 1850 AND 1860');
    expect(formatGenealogicalDate(d4, 'gedcom')).toBe('FEB 2003');

    const sorted = [d4, undefined, d1, d3, d2].sort(compareGenealogicalDates);
    expect(sorted.map((d) => d?.start?.year)).toEqual([1850, 1890, 1923, 2003, undefined]);
  });

  it('formats lifespans concisely', () => {
    expect(
      formatLifespan(
        { type: 'birth', date: parseGenealogicalDate('ABT 1848') },
        { type: 'death', date: parseGenealogicalDate('1924') },
      ),
    ).toBe('c. 1848–1924');

    expect(
      formatLifespan({ type: 'birth', date: parseGenealogicalDate('15 Mar 1962') }),
    ).toBe('b. 1962');

    expect(
      formatLifespan(undefined, { type: 'death', date: parseGenealogicalDate('1903') }),
    ).toBe('d. 1903');

    expect(formatLifespan()).toBe('');
  });
});
