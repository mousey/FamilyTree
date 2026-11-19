import { parseGenealogicalDate } from '../dates.js';
import {
  FAMILY_TREE_SCHEMA_VERSION,
  type FamilyTree,
  type Person,
  type Union,
} from '../types.js';

export const MOCK_IDS = {
  focus: 'P1',
  greatGreatGrandfather: 'P2',
  greatGreatGrandmother: 'P3',
  tripleMarriedAncestor: 'P4',
  firstWife: 'P5',
  secondWifeDivorced: 'P6',
  thirdWife: 'P7',
  grandfather: 'P8',
  singleParentAunt: 'P9',
  halfGreatUncle: 'P10',
  maternalGreatGrandfather: 'P11',
  maternalGreatGrandmother: 'P12',
  grandmother: 'P13',
  greatUncleVance: 'P14',
  father: 'P15',
  auntHelen: 'P16',
  uncleDavid: 'P17',
  mother: 'P18',
  fullSister: 'P19',
  stepMother: 'P20',
  stepFatherFirstHusband: 'P21',
  stepBrother: 'P22',
  halfSister: 'P23',
  stepSisterInBlendedUnion: 'P24',
  uncleGrahamEllis: 'P25',
  cousinSpouseChloe: 'P26',
  adoptedChild: 'P27',
  birthFatherDaniel: 'P28',
  sameSexPartnerNadia: 'P29',
  twinDaughterMaya: 'P30',
  twinSonLeo: 'P31',
  grandchildPartnerSamir: 'P32',
  grandchildZara: 'P33',
  auntMiriamEllis: 'P34',
  ellisGrandfather: 'P35',
  ellisGrandmother: 'P36',
  doubleCousinJulian: 'P37',
  singleParentChildA: 'P38',
  singleParentChildB: 'P39',
  disconnectedHusband: 'P40',
  disconnectedWife: 'P41',
  unions: {
    greatGreatGrandparents: 'U1',
    tripleMarriage1Widowed: 'U2',
    tripleMarriage2Divorced: 'U3',
    tripleMarriage3Active: 'U4',
    vanceGreatGrandparents: 'U5',
    grandparents: 'U6',
    focusParentsDivorced: 'U7',
    stepMothersFirstMarriage: 'U8',
    blendedRemarriage: 'U9',
    helenAndGraham: 'U10',
    adoptedChildBirthUnion: 'U11',
    sameSexAdoptiveUnion: 'U12',
    pedigreeCollapseUnion: 'U13',
    grandchildParents: 'U14',
    ellisGrandparents: 'U15',
    doubleCousinParents: 'U16',
    singleParentUnion: 'U17',
    disconnectedUnion: 'U18',
  },
  media: {
    missingFilePortrait: 'M1',
    localGatheringPhoto: 'M2',
    marriageCertificateWithTranscription: 'M3',
    censusPlaceholder: 'M4',
  },
  sources: {
    census1901: 'S1',
    parishRegisters: 'S2',
    familyBible: 'S3',
  },
  repositories: {
    archives: 'R1',
  },
  notes: {
    overview: 'N1',
  },
} as const;

function makePerson(
  id: string,
  given: string,
  surname: string,
  sex: Person['sex'],
  opts: {
    birthDate?: string;
    birthPlace?: string;
    deathDate?: string;
    deathPlace?: string;
    isLiving?: boolean;
    events?: Person['events'];
    media?: Person['media'];
    notes?: string[];
    noteIds?: string[];
    citations?: Person['citations'];
    alternateNames?: Person['alternateNames'];
  } = {},
): Person {
  const display = [given, surname].filter(Boolean).join(' ');
  const person: Person = {
    id,
    name: {
      given: given || undefined,
      surname: surname || undefined,
      display: display || 'Unknown',
    },
    sex,
    events: opts.events ?? [],
    media: opts.media ?? [],
    notes: opts.notes ?? [],
    citations: opts.citations ?? [],
  };
  if (opts.alternateNames) person.alternateNames = opts.alternateNames;
  if (opts.birthDate || opts.birthPlace) {
    person.birth = {
      type: 'birth',
      ...(opts.birthDate ? { date: parseGenealogicalDate(opts.birthDate) } : {}),
      ...(opts.birthPlace ? { place: opts.birthPlace } : {}),
    };
  }
  if (opts.deathDate || opts.deathPlace) {
    person.death = {
      type: 'death',
      ...(opts.deathDate ? { date: parseGenealogicalDate(opts.deathDate) } : {}),
      ...(opts.deathPlace ? { place: opts.deathPlace } : {}),
    };
  }
  if (opts.isLiving !== undefined) person.isLiving = opts.isLiving;
  if (opts.noteIds) person.noteIds = opts.noteIds;
  return person;
}

export function createMockFamilyTree(): FamilyTree {
  const persons: Record<string, Person> = {
    P1: makePerson('P1', 'Oliver', 'Hawthorne', 'male', {
      birthDate: '15 Mar 1962',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
      events: [
        {
          type: 'occupation',
          description: 'Architectural Draughtsman',
          date: parseGenealogicalDate('1988'),
          place: 'Bath, Somerset, England',
        },
        {
          type: 'residence',
          date: parseGenealogicalDate('1995'),
          place: 'Clifton, Bristol, England',
        },
      ],
      media: [{ mediaId: 'M2' }],
      notes: ['Focus individual for multi-generation and pedigree collapse tests.'],
      noteIds: ['N1'],
      citations: [{ sourceId: 'S3', page: 'p. 12' }],
    }),
    P2: makePerson('P2', 'Thomas', 'Hawthorne', 'male', {
      birthDate: 'ABT 1848',
      birthPlace: 'Taunton, Somerset, England',
      deathDate: 'BEF 1920',
      deathPlace: 'Bristol, Gloucestershire, England',
      isLiving: false,
      events: [
        {
          type: 'census',
          date: parseGenealogicalDate('1901'),
          place: 'Bedminster, Bristol, England',
          citations: [{ sourceId: 'S1', page: 'RG13/2380 f.14' }],
        },
      ],
      media: [{ mediaId: 'M4', isPrimary: true }],
      citations: [{ sourceId: 'S1', page: 'RG13/2380 f.14', externalIds: ['1,7814::10042'] }],
    }),
    P3: makePerson('P3', 'Mary', 'Ashworth', 'female', {
      birthDate: '1852',
      birthPlace: 'Wells, Somerset, England',
      deathDate: '1924',
      deathPlace: 'Bristol, Gloucestershire, England',
      isLiving: false,
      citations: [{ sourceId: 'S1', page: 'RG13/2380 f.14' }],
    }),
    P4: makePerson('P4', 'Henry', 'Hawthorne', 'male', {
      birthDate: '12 Apr 1876',
      birthPlace: 'Bristol, Gloucestershire, England',
      deathDate: '19 Nov 1952',
      deathPlace: 'Exeter, Devon, England',
      isLiving: false,
      events: [
        {
          type: 'military',
          description: 'Royal Engineers',
          date: parseGenealogicalDate('1914-1918'),
          place: 'France',
        },
      ],
      citations: [{ sourceId: 'S2', page: 'Vol. 4, p. 88' }],
    }),
    P5: makePerson('P5', 'Beatrice', 'Finch', 'female', {
      birthDate: '1879',
      birthPlace: 'Bath, Somerset, England',
      deathDate: '1908',
      deathPlace: 'Bristol, Gloucestershire, England',
      isLiving: false,
    }),
    P6: makePerson('P6', 'Eleanor', 'Price', 'female', {
      birthDate: '1884',
      birthPlace: 'Cardiff, Glamorgan, Wales',
      deathDate: '1961',
      isLiving: false,
    }),
    P7: makePerson('P7', 'Dorothy', 'Penn', 'female', {
      birthDate: '1888',
      birthPlace: 'Exeter, Devon, England',
      deathDate: '1972',
      isLiving: false,
    }),
    P8: makePerson('P8', 'Arthur', 'Hawthorne', 'male', {
      birthDate: '22 Jan 1904',
      birthPlace: 'Bristol, Gloucestershire, England',
      deathDate: '08 Oct 1978',
      deathPlace: 'Bristol, Gloucestershire, England',
      isLiving: false,
      media: [{ mediaId: 'M1', isPrimary: true }, { mediaId: 'M3' }],
      citations: [{ sourceId: 'S2', page: 'Entry 42' }],
    }),
    P9: makePerson('P9', 'Margaret', 'Hawthorne', 'female', {
      birthDate: '1912',
      birthPlace: 'Bristol, Gloucestershire, England',
      deathDate: '1989',
      isLiving: false,
    }),
    P10: makePerson('P10', 'Edward', 'Hawthorne', 'male', {
      birthDate: '1920',
      birthPlace: 'Exeter, Devon, England',
      deathDate: '1995',
      isLiving: false,
    }),
    P11: makePerson('P11', 'George', 'Vance', 'male', {
      birthDate: 'BET 1874 AND 1877',
      birthPlace: 'Gloucester, England',
      deathDate: '1948',
      isLiving: false,
    }),
    P12: makePerson('P12', 'Florence', 'Mercer', 'female', {
      birthDate: '1880',
      birthPlace: 'Cheltenham, Gloucestershire, England',
      deathDate: '1957',
      isLiving: false,
    }),
    P13: makePerson('P13', 'Clara', 'Vance', 'female', {
      birthDate: '1906',
      birthPlace: 'Gloucester, England',
      deathDate: '1985',
      deathPlace: 'Bristol, Gloucestershire, England',
      isLiving: false,
      alternateNames: [
        {
          given: 'Clara',
          surname: 'Hawthorne',
          display: 'Clara Hawthorne',
          type: 'married',
        },
      ],
      media: [{ mediaId: 'M3' }],
    }),
    P14: makePerson('P14', 'Frederick', 'Vance', 'male', {
      birthDate: '1909',
      deathDate: '1981',
      isLiving: false,
    }),
    P15: makePerson('P15', 'Martin', 'Hawthorne', 'male', {
      birthDate: '03 May 1933',
      birthPlace: 'Bristol, Gloucestershire, England',
      deathDate: '2012',
      isLiving: false,
      media: [{ mediaId: 'M2' }],
    }),
    P16: makePerson('P16', 'Helen', 'Hawthorne', 'female', {
      birthDate: '1936',
      birthPlace: 'Bristol, Gloucestershire, England',
      deathDate: '2019',
      isLiving: false,
    }),
    P17: makePerson('P17', 'David', 'Hawthorne', 'male', {
      birthDate: '1939',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
    }),
    P18: makePerson('P18', 'Eleanor', 'Bennett', 'female', {
      birthDate: '1935',
      birthPlace: 'Bath, Somerset, England',
      deathDate: '2015',
      isLiving: false,
    }),
    P19: makePerson('P19', 'Claire', 'Hawthorne', 'female', {
      birthDate: '04 Nov 1965',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
    }),
    P20: makePerson('P20', 'Catherine', 'Reid', 'female', {
      birthDate: '1940',
      birthPlace: 'Oxford, Oxfordshire, England',
      isLiving: true,
    }),
    P21: makePerson('P21', 'Samuel', 'Reid', 'male', {
      birthDate: '1938',
      deathDate: '1968',
      isLiving: false,
    }),
    P22: makePerson('P22', 'Liam', 'Reid', 'male', {
      birthDate: '1964',
      birthPlace: 'Oxford, Oxfordshire, England',
      isLiving: true,
    }),
    P23: makePerson('P23', 'Sophie', 'Hawthorne', 'female', {
      birthDate: '1972',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
    }),
    P24: makePerson('P24', 'Hannah', 'Reid', 'female', {
      birthDate: '1966',
      birthPlace: 'Oxford, Oxfordshire, England',
      isLiving: true,
    }),
    P25: makePerson('P25', 'Graham', 'Ellis', 'male', {
      birthDate: '1935',
      deathDate: '2014',
      isLiving: false,
    }),
    P26: makePerson('P26', 'Chloe', 'Ellis', 'female', {
      birthDate: '1964',
      birthPlace: 'Bath, Somerset, England',
      isLiving: true,
    }),
    P27: makePerson('P27', 'Lucas', 'Hawthorne', 'male', {
      birthDate: '1992',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
      events: [
        {
          type: 'adoption',
          date: parseGenealogicalDate('1994'),
          place: 'Bristol, Gloucestershire, England',
        },
      ],
    }),
    P28: makePerson('P28', 'Daniel', 'Foster', 'male', {
      birthDate: '1970',
      isLiving: true,
    }),
    P29: makePerson('P29', 'Nadia', 'Patel', 'female', {
      birthDate: '1967',
      birthPlace: 'Leicester, England',
      isLiving: true,
    }),
    P30: makePerson('P30', 'Maya', 'Hawthorne', 'female', {
      birthDate: '18 Aug 1990',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
    }),
    P31: makePerson('P31', 'Leo', 'Hawthorne', 'male', {
      birthDate: '18 Aug 1990',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
    }),
    P32: makePerson('P32', 'Samir', 'Khan', 'male', {
      birthDate: '1989',
      birthPlace: 'Birmingham, England',
      isLiving: true,
    }),
    P33: makePerson('P33', 'Zara', 'Hawthorne-Khan', 'female', {
      birthDate: '10 May 2021',
      birthPlace: 'Bristol, Gloucestershire, England',
      isLiving: true,
    }),
    P34: makePerson('P34', 'Miriam', 'Ellis', 'female', {
      birthDate: '1937',
      isLiving: true,
    }),
    P35: makePerson('P35', 'Walter', 'Ellis', 'male', {
      birthDate: '1908',
      deathDate: '1983',
      isLiving: false,
    }),
    P36: makePerson('P36', 'Rose', 'Carter', 'female', {
      birthDate: '1910',
      deathDate: '1990',
      isLiving: false,
    }),
    P37: makePerson('P37', 'Julian', 'Hawthorne', 'male', {
      birthDate: '1966',
      birthPlace: 'Exeter, Devon, England',
      isLiving: true,
    }),
    P38: makePerson('P38', 'Peter', 'Hawthorne', 'male', {
      birthDate: '1938',
      deathDate: '2010',
      isLiving: false,
    }),
    P39: makePerson('P39', 'Grace', 'Hawthorne', 'female', {
      birthDate: '1941',
      isLiving: true,
    }),
    P40: makePerson('P40', 'Edmund', 'Blackwood', 'male', {
      birthDate: '1895',
      deathDate: '1960',
      isLiving: false,
    }),
    P41: makePerson('P41', 'Clara', 'Blackwood', 'female', {
      birthDate: '1898',
      deathDate: '1972',
      isLiving: false,
    }),
  };

  const unions: Record<string, Union> = {
    U1: {
      id: 'U1',
      partners: [
        { personId: 'P2', role: 'husband' },
        { personId: 'P3', role: 'wife' },
      ],
      children: [{ personId: 'P4', pedigree: 'biological' }],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1874'),
        place: 'Wells, Somerset, England',
      },
      events: [],
      notes: [],
      citations: [{ sourceId: 'S2', page: 'Wells Register 1874' }],
    },
    U2: {
      id: 'U2',
      partners: [
        { personId: 'P4', role: 'husband' },
        { personId: 'P5', role: 'wife' },
      ],
      children: [{ personId: 'P8', pedigree: 'biological' }],
      type: 'marriage',
      status: 'widowed',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('02 Jun 1902'),
        place: 'Bath, Somerset, England',
      },
      events: [],
      notes: ['Henry Hawthorne first marriage; ended with Beatrice death in 1908.'],
      citations: [{ sourceId: 'S2', page: 'Bath Register 1902' }],
    },
    U3: {
      id: 'U3',
      partners: [
        { personId: 'P4', role: 'husband' },
        { personId: 'P6', role: 'wife' },
      ],
      children: [{ personId: 'P9', pedigree: 'biological' }],
      type: 'marriage',
      status: 'divorced',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1910'),
        place: 'Cardiff, Wales',
      },
      divorce: {
        type: 'divorce',
        date: parseGenealogicalDate('1917'),
      },
      events: [],
      notes: ['Henry Hawthorne second marriage; ended in divorce.'],
      citations: [],
    },
    U4: {
      id: 'U4',
      partners: [
        { personId: 'P4', role: 'husband' },
        { personId: 'P7', role: 'wife' },
      ],
      children: [{ personId: 'P10', pedigree: 'biological' }],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1919'),
        place: 'Exeter, Devon, England',
      },
      events: [],
      notes: ['Henry Hawthorne third marriage.'],
      citations: [],
    },
    U5: {
      id: 'U5',
      partners: [
        { personId: 'P11', role: 'husband' },
        { personId: 'P12', role: 'wife' },
      ],
      children: [
        { personId: 'P13', pedigree: 'biological' },
        { personId: 'P14', pedigree: 'biological' },
      ],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1903'),
        place: 'Gloucester, England',
      },
      events: [],
      notes: [],
      citations: [],
    },
    U6: {
      id: 'U6',
      partners: [
        { personId: 'P8', role: 'husband' },
        { personId: 'P13', role: 'wife' },
      ],
      children: [
        { personId: 'P15', pedigree: 'biological' },
        { personId: 'P16', pedigree: 'biological' },
        { personId: 'P17', pedigree: 'biological' },
      ],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('14 Jun 1930'),
        place: 'Bristol, Gloucestershire, England',
      },
      events: [],
      notes: [],
      citations: [{ sourceId: 'S2', page: 'Entry 42' }],
      media: [{ mediaId: 'M3' }],
    },
    U7: {
      id: 'U7',
      partners: [
        { personId: 'P15', role: 'husband' },
        { personId: 'P18', role: 'wife' },
      ],
      children: [
        { personId: 'P1', pedigree: 'biological' },
        { personId: 'P19', pedigree: 'biological' },
      ],
      type: 'marriage',
      status: 'divorced',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1958'),
        place: 'Bristol, Gloucestershire, England',
      },
      divorce: {
        type: 'divorce',
        date: parseGenealogicalDate('1969'),
      },
      events: [],
      notes: [],
      citations: [],
    },
    U8: {
      id: 'U8',
      partners: [
        { personId: 'P21', role: 'husband' },
        { personId: 'P20', role: 'wife' },
      ],
      children: [{ personId: 'P22', pedigree: 'biological' }],
      type: 'marriage',
      status: 'widowed',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1961'),
        place: 'Oxford, Oxfordshire, England',
      },
      events: [],
      notes: [],
      citations: [],
    },
    U9: {
      id: 'U9',
      partners: [
        { personId: 'P15', role: 'husband' },
        { personId: 'P20', role: 'wife' },
      ],
      children: [
        { personId: 'P23', pedigree: 'biological' },
        {
          personId: 'P24',
          parentRelations: {
            P15: 'step',
            P20: 'biological',
          },
        },
      ],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1971'),
        place: 'Bristol, Gloucestershire, England',
      },
      events: [],
      notes: ['Blended remarriage with half-sibling Sophie and step-child Hannah.'],
      citations: [],
    },
    U10: {
      id: 'U10',
      partners: [
        { personId: 'P25', role: 'husband' },
        { personId: 'P16', role: 'wife' },
      ],
      children: [{ personId: 'P26', pedigree: 'biological' }],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1960'),
        place: 'Bath, Somerset, England',
      },
      events: [],
      notes: [],
      citations: [],
    },
    U11: {
      id: 'U11',
      partners: [
        { personId: 'P28', role: 'husband' },
        { personId: 'P23', role: 'wife' },
      ],
      children: [{ personId: 'P27', pedigree: 'biological' }],
      type: 'partnership',
      status: 'ended',
      events: [],
      notes: ['Biological parents of Lucas prior to adoption.'],
      citations: [],
    },
    U12: {
      id: 'U12',
      partners: [
        { personId: 'P19', role: 'partner' },
        { personId: 'P29', role: 'partner' },
      ],
      children: [{ personId: 'P27', pedigree: 'adopted' }],
      type: 'civil_union',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('2006'),
        place: 'Bristol, Gloucestershire, England',
      },
      events: [],
      notes: ['Same-sex civil union and legal adoption of Lucas.'],
      citations: [],
    },
    U13: {
      id: 'U13',
      partners: [
        { personId: 'P1', role: 'husband' },
        { personId: 'P26', role: 'wife' },
      ],
      children: [
        { personId: 'P30', pedigree: 'biological' },
        { personId: 'P31', pedigree: 'biological' },
      ],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1988'),
        place: 'Bristol, Gloucestershire, England',
      },
      events: [],
      notes: ['First-cousin marriage creating pedigree collapse for Maya & Leo.'],
      citations: [],
    },
    U14: {
      id: 'U14',
      partners: [
        { personId: 'P32', role: 'husband' },
        { personId: 'P30', role: 'wife' },
      ],
      children: [{ personId: 'P33', pedigree: 'biological' }],
      type: 'partnership',
      status: 'active',
      events: [],
      notes: [],
      citations: [],
    },
    U15: {
      id: 'U15',
      partners: [
        { personId: 'P35', role: 'husband' },
        { personId: 'P36', role: 'wife' },
      ],
      children: [
        { personId: 'P25', pedigree: 'biological' },
        { personId: 'P34', pedigree: 'biological' },
      ],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1933'),
        place: 'Bath, Somerset, England',
      },
      events: [],
      notes: [],
      citations: [],
    },
    U16: {
      id: 'U16',
      partners: [
        { personId: 'P17', role: 'husband' },
        { personId: 'P34', role: 'wife' },
      ],
      children: [{ personId: 'P37', pedigree: 'biological' }],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1963'),
        place: 'Exeter, Devon, England',
      },
      events: [],
      notes: ['Creates double first cousin relationship between Chloe (P26) and Julian (P37).'],
      citations: [],
    },
    U17: {
      id: 'U17',
      partners: [{ personId: 'P9', role: 'wife' }],
      children: [
        { personId: 'P38', pedigree: 'biological' },
        { personId: 'P39', pedigree: 'biological' },
      ],
      type: 'unknown',
      status: 'unknown',
      events: [],
      notes: ['Single-parent family unit.'],
      citations: [],
    },
    U18: {
      id: 'U18',
      partners: [
        { personId: 'P40', role: 'husband' },
        { personId: 'P41', role: 'wife' },
      ],
      children: [],
      type: 'marriage',
      status: 'active',
      marriage: {
        type: 'marriage',
        date: parseGenealogicalDate('1921'),
        place: 'York, Yorkshire, England',
      },
      events: [],
      notes: ['Disconnected family component for multi-component testing.'],
      citations: [],
    },
  };

  return {
    schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
    metadata: {
      title: 'The Hawthorne–Vance Family',
      description:
        'Synthetic multi-generational family tree covering remarriages, blended siblings, adoptions, pedigree collapse, double cousins, same-sex unions, and disconnected branches.',
      sourceSystem: 'FamilyTree Mock Generator',
      sourceVersion: '1.0.0',
      defaultRootPersonId: 'P1',
      submitterName: 'FamilyTree Test Suite',
    },
    persons,
    unions,
    media: {
      M1: {
        id: 'M1',
        title: 'Arthur Hawthorne Portrait (1925)',
        format: 'jpg',
        mimeType: 'image/jpeg',
        mediaType: 'image',
        width: 1200,
        height: 1600,
        fileSize: 342100,
        externalId: 'anc-media-001',
        description: 'Studio portrait taken in Bristol (placeholder without binary file)',
      },
      M2: {
        id: 'M2',
        title: 'Hawthorne Manor Gathering',
        format: 'png',
        mimeType: 'image/png',
        mediaType: 'image',
        file: 'assets/hawthorne-gathering.png',
        width: 1920,
        height: 1080,
      },
      M3: {
        id: 'M3',
        title: 'Marriage Certificate — Arthur Hawthorne & Clara Vance',
        format: 'jpg',
        mimeType: 'image/jpeg',
        mediaType: 'document',
        file: 'assets/u6-marriage-cert.jpg',
        date: parseGenealogicalDate('14 Jun 1930'),
        place: 'Bristol, Gloucestershire, England',
        transcription: 'Entry No. 42: Arthur Hawthorne & Clara Vance, married 14 June 1930.',
      },
      M4: {
        id: 'M4',
        title: '1901 Census Return — Thomas Hawthorne',
        format: 'jpg',
        mediaType: 'document',
        description: 'Census schedule RG13/2380 f.14',
      },
    },
    sources: {
      S1: {
        id: 'S1',
        title: '1901 England & Wales Census',
        author: 'General Register Office',
        repositoryId: 'R1',
        externalId: '1,7814::0',
      },
      S2: {
        id: 'S2',
        title: 'Parish Marriage & Baptism Registers (1850–1960)',
        repositoryId: 'R1',
      },
      S3: {
        id: 'S3',
        title: 'Hawthorne Family Bible & Letters',
      },
    },
    repositories: {
      R1: {
        id: 'R1',
        name: 'Devon & Somerset County Archives',
        address: 'Exeter, Devon, England',
        url: 'https://archives.example.org',
      },
    },
    notes: {
      N1: {
        id: 'N1',
        text: 'Compiled from parish registers, census returns, and family correspondence.\nIncludes adoption and remarriage records across 7 generations.',
      },
    },
  };
}
