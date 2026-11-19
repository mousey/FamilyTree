import { describe, expect, it } from 'vitest';
import {
  calculateGenerations,
  createFamilyGraph,
  createMockFamilyTree,
  describeRelationship,
  getAncestors,
  getParents,
  parseGedcom,
  serializeGedcom,
  validateFamilyTree,
} from '../src/index.js';

describe('GEDCOM 5.5.1 parser and serializer (including Ancestry.co.uk extensions)', () => {
  it('parses an Ancestry-style GEDCOM with BOM, CRLF, reversed HUSB/WIFE, _SREL, _FREL/_MREL, _META, and CONC/CONT', () => {
    const lines = [
      '0 HEAD',
      '1 SUBM @SUBM1@',
      '1 SOUR Ancestry.com Family Trees',
      '2 NAME Ancestry.com Member Trees',
      '2 VERS 2025.08',
      '2 _TREE Fictional Ancestry Export',
      '3 RIN 99887766',
      '3 NOTE Fictional tree note',
      '1 DATE 19 Nov 2026',
      '2 TIME 11:59:38',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @SUBM1@ SUBM',
      '1 NAME Genealogy Submitter',
      '0 @I1@ INDI',
      '1 NAME Dr. Evelyn Mary /Chiew / Jr.',
      '2 NPFX Dr.',
      '2 GIVN Evelyn Mary',
      '2 SURN Chiew ',
      '2 NSFX Jr.',
      '2 NICK Evie',
      '1 SEX F',
      '1 FAMC @F1@',
      '2 PEDI birth',
      '1 FAMC @F2@',
      '2 PEDI adopted',
      '1 FAMS @F3@',
      '1 BIRT',
      '2 DATE 24/01/1952',
      '2 PLAC Cardiff, Wales',
      '2 SOUR @S1@',
      '3 PAGE Entry 101',
      '3 _APID 1,8782::1001',
      '3 _APID 1,8782::1002',
      '1 EVEN',
      '2 TYPE Arrival',
      '2 DATE 11 Mar 1975',
      '2 PLAC Southampton, England',
      '1 EVEN',
      '2 TYPE Departure',
      '2 DATE 02 23 1975',
      '1 _MILT',
      '2 DATE 1970-1974',
      '2 PLAC Service Branch',
      '1 DEAT Y',
      '1 NOTE Line one of a very long',
      '2 CONC  and continuous note',
      '2 CONT',
      '2 CONT Third line after blank line',
      '1 OBJE @O1@',
      '2 _PRIM Y',
      '1 OBJE',
      '2 FILE photos/inline.png',
      '2 FORM png',
      '2 TITL Inline Photo',
      '0 @I2@ INDI',
      '1 NAME Samuel //',
      '1 SEX M',
      '1 FAMS @F3@',
      '0 @I3@ INDI',
      '1 NAME Alex /Rowan/',
      '1 FAMS @F1@',
      '0 @I4@ INDI',
      '1 NAME Morgan /Lee/',
      '1 SEX F',
      '1 FAMS @F2@',
      '0 @I5@ INDI',
      '1 NAME Jordan /Lee/',
      '1 SEX M',
      '1 FAMS @F2@',
      '0 @I6@ INDI',
      '1 NAME Taylor /Chiew/',
      '1 SEX F',
      '1 FAMC @F3@',
      // Reversed HUSB/WIFE tags: I1 (female) in HUSB, I2 (male) in WIFE!
      '0 @F3@ FAM',
      '1 _SREL partner',
      '1 HUSB @I1@',
      '1 WIFE @I2@',
      '1 CHIL @I6@',
      '2 _FREL natural',
      '2 _MREL step',
      '1 MARR',
      '2 DATE 05 jun 1978',
      '2 PLAC Bristol',
      '2 SOUR @S1@',
      '3 _HPID 1,8753::2001',
      '3 _WPID 1,8753::2002',
      '1 DIV',
      '2 DATE 12/1989',
      '0 @F1@ FAM',
      '1 _SREL unknown',
      '1 HUSB @I3@',
      '1 CHIL @I1@',
      '0 @F2@ FAM',
      '1 WIFE @I4@',
      '1 HUSB @I5@',
      '1 CHIL @I1@',
      '2 _FREL adopted',
      '2 _MREL adopted',
      '0 @O1@ OBJE',
      '1 FILE',
      '2 FORM jpg',
      '3 TYPE image',
      '3 _STYPE jpeg',
      '3 _SIZE 173322',
      '3 _WDTH 875',
      '3 _HGHT 613',
      '2 TITL Birth Certificate',
      '1 _OID 00846810-96d5-497b-bad2-8c07e4358f14',
      '1 _DSCR Class:&nbsp;RG11;&nbsp;Page:&nbsp;3',
      '1 _META <metadataxml><transcription>District: Cardiff',
      '2 CONT Year: 1952</transcription></metadataxml>',
      '0 @S1@ SOUR',
      '1 TITL National Registry',
      '1 PUBL Ancestry.com',
      '2 DATE 2010',
      '1 _APID 1,8782::0',
      '1 REPO @R1@',
      '0 @R1@ REPO',
      '1 NAME Ancestry.com',
      '0 TRLR',
    ];

    const gedcomText = '\uFEFF' + lines.join('\r\n');
    const { tree, warnings } = parseGedcom(gedcomText);

    expect(warnings).toEqual([]);
    const validation = validateFamilyTree(tree);
    expect(validation.valid).toBe(true);

    expect(tree.metadata.title).toBe('Fictional Ancestry Export');
    expect(tree.metadata.sourceSystem).toBe('Ancestry.com Member Trees');
    expect(tree.metadata.sourceVersion).toBe('2025.08');
    expect(tree.metadata.submitterName).toBe('Genealogy Submitter');
    expect(tree.metadata.custom?.ancestryTreeId).toBe('99887766');

    const evelyn = tree.persons.I1!;
    expect(evelyn.name).toMatchObject({
      prefix: 'Dr.',
      given: 'Evelyn Mary',
      surname: 'Chiew',
      suffix: 'Jr.',
      nickname: 'Evie',
      display: 'Dr. Evelyn Mary Chiew Jr.',
    });
    expect(evelyn.sex).toBe('female');
    expect(evelyn.birth?.date?.start).toEqual({ year: 1952, month: 1, day: 24 });
    expect(evelyn.birth?.citations?.[0]?.externalIds).toEqual([
      '1,8782::1001',
      '1,8782::1002',
    ]);
    expect(evelyn.events.map((e) => e.type)).toEqual(['arrival', 'departure', 'military']);
    expect(evelyn.death).toEqual({ type: 'death' });
    expect(evelyn.isLiving).toBe(false);
    expect(evelyn.notes[0]).toBe(
      'Line one of a very long and continuous note\n\nThird line after blank line',
    );
    expect(evelyn.media[0]).toEqual({ mediaId: 'O1', isPrimary: true });
    expect(evelyn.media[1]?.mediaId).toBe('O_INLINE_1');
    expect(tree.media.O_INLINE_1?.file).toBe('photos/inline.png');

    // Empty surname & missing SEX
    expect(tree.persons.I2?.name.surname).toBeUndefined();
    expect(tree.persons.I2?.name.display).toBe('Samuel');
    expect(tree.persons.I3?.sex).toBe('unknown');

    // Reversed HUSB/WIFE must NOT overwrite Person.sex!
    expect(tree.persons.I1?.sex).toBe('female');
    expect(tree.persons.I2?.sex).toBe('male');

    // _SREL, DIV, _FREL/_MREL, _HPID/_WPID
    const f3 = tree.unions.F3!;
    expect(f3.type).toBe('partnership');
    expect(f3.status).toBe('divorced');
    expect(f3.divorce?.date?.start).toEqual({ year: 1989, month: 12 });
    expect(f3.children[0]?.parentRelations).toEqual({
      I1: 'biological',
      I2: 'step',
    });
    expect(f3.marriage?.citations?.[0]?.externalIds).toEqual([
      '_HPID:1,8753::2001',
      '_WPID:1,8753::2002',
    ]);

    // Single-parent union F1
    expect(tree.unions.F1?.partners).toHaveLength(1);
    expect(tree.unions.F1?.type).toBe('unknown');

    // Multiple FAMC with biological vs adopted
    expect(getParents(tree, 'I1', { lineageMode: 'biological' }).map((p) => p.id)).toEqual([
      'I3',
    ]);
    expect(getParents(tree, 'I1', { lineageMode: 'legal' }).map((p) => p.id).sort()).toEqual([
      'I3',
      'I4',
      'I5',
    ]);

    // OBJE metadata, missing FILE, _DSCR decoding, _META transcription
    const o1 = tree.media.O1!;
    expect(o1.file).toBeUndefined();
    expect(o1.format).toBe('jpg');
    expect(o1.mimeType).toBe('image/jpeg');
    expect(o1.width).toBe(875);
    expect(o1.height).toBe(613);
    expect(o1.fileSize).toBe(173322);
    expect(o1.description).toBe('Class: RG11; Page: 3');
    expect(o1.transcription).toBe('District: Cardiff\nYear: 1952');
  });

  it('round-trips the complex mock family tree through serializeGedcom -> parseGedcom', () => {
    const original = createMockFamilyTree();
    const gedText = serializeGedcom(original);
    const { tree: reparsed, warnings } = parseGedcom(gedText);

    expect(warnings).toEqual([]);
    const validation = validateFamilyTree(reparsed);
    expect(validation.valid).toBe(true);

    expect(Object.keys(reparsed.persons).length).toBe(Object.keys(original.persons).length);
    expect(Object.keys(reparsed.unions).length).toBe(Object.keys(original.unions).length);
    expect(Object.keys(reparsed.media).length).toBe(Object.keys(original.media).length);
    expect(Object.keys(reparsed.sources).length).toBe(Object.keys(original.sources).length);
    expect(Object.keys(reparsed.repositories).length).toBe(
      Object.keys(original.repositories).length,
    );
    expect(Object.keys(reparsed.notes).length).toBe(Object.keys(original.notes).length);

    // Verify graph traversal results match across round-trip
    const origGraph = createFamilyGraph(original);
    const repGraph = createFamilyGraph(reparsed);

    expect(calculateGenerations(repGraph, 'P1').byGeneration.size).toBe(
      calculateGenerations(origGraph, 'P1').byGeneration.size,
    );
    expect(getAncestors(repGraph, 'P30').get('P8')?.pathCount).toBe(2);
    expect(describeRelationship(repGraph, 'P26', 'P37').label).toBe('Double 1st cousin');
    expect(getParents(repGraph, 'P24', { lineageMode: 'biological' }).map((p) => p.id)).toEqual([
      'P20',
    ]);
    expect(reparsed.media.M3?.transcription).toBe(original.media.M3?.transcription);
  });

  it('handles malformed lines, dangling pointers, and reconciles INDI FAMC/FAMS links with warnings', () => {
    const messyGed = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      'THIS IS NOT A VALID GEDCOM LINE',
      '0 @I1@ INDI',
      '1 NAME Alice /North/',
      '1 SEX F',
      '1 FAMS @F1@',
      '1 FAMS @F_MISSING@',
      '1 OBJE @O_MISSING@',
      '1 SOUR @S_MISSING@',
      '1 NOTE @N_MISSING@',
      '0 @I2@ INDI',
      '1 NAME Sam /North/',
      '1 SEX M',
      '1 FAMC @F1@',
      '2 PEDI adopted',
      '0 @F1@ FAM',
      '1 HUSB @I_MISSING@',
      '1 CHIL @I_MISSING_CHILD@',
      '0 TRLR',
    ].join('\n');

    const { tree, warnings } = parseGedcom(messyGed);
    const codes = new Set(warnings.map((w) => w.code));
    expect(codes.has('MALFORMED_LINE')).toBe(true);
    expect(codes.has('DANGLING_PARTNER_REF')).toBe(true);
    expect(codes.has('DANGLING_CHILD_REF')).toBe(true);
    expect(codes.has('DANGLING_FAMILY_REF')).toBe(true);
    expect(codes.has('DANGLING_MEDIA_REF')).toBe(true);
    expect(codes.has('DANGLING_SOURCE_REF')).toBe(true);
    expect(codes.has('DANGLING_NOTE_REF')).toBe(true);
    expect(codes.has('RECONCILED_FAMILY_LINK')).toBe(true);

    // Reconciled I1 as partner and I2 as adopted child in F1
    expect(tree.unions.F1?.partners.map((p) => p.personId)).toEqual(['I1']);
    expect(tree.unions.F1?.children).toEqual([{ personId: 'I2', pedigree: 'adopted' }]);
    expect(validateFamilyTree(tree).valid).toBe(true);
  });
});
