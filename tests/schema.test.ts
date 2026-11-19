import { describe, expect, it } from 'vitest';
import Ajv2020Module from 'ajv/dist/2020.js';
import schema from '../schemas/family-tree.schema.json' with { type: 'json' };
import { createMockFamilyTree, parseGedcom } from '../src/index.js';

type AjvConstructor = new (opts?: Record<string, unknown>) => {
  compile: (s: unknown) => {
    (data: unknown): boolean;
    errors?: Array<{ instancePath?: string; message?: string }> | null;
  };
};

const Ajv2020 = ((Ajv2020Module as unknown as { default?: AjvConstructor }).default ??
  Ajv2020Module) as unknown as AjvConstructor;

describe('Draft 2020-12 JSON Schema validation', () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  it('validates the complex mock family tree against family-tree.schema.json', () => {
    const mockTree = createMockFamilyTree();
    const ok = validate(mockTree);
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  it('validates a GEDCOM-parsed tree against family-tree.schema.json', () => {
    const ged = [
      '0 HEAD',
      '1 SOUR TestSystem',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Alice /Smith/',
      '1 SEX F',
      '1 BIRT',
      '2 DATE 14 MAY 1990',
      '0 @I2@ INDI',
      '1 NAME Bob /Jones/',
      '1 SEX M',
      '0 @F1@ FAM',
      '1 HUSB @I2@',
      '1 WIFE @I1@',
      '0 TRLR',
    ].join('\n');

    const { tree } = parseGedcom(ged);
    const ok = validate(tree);
    expect(validate.errors).toBeNull();
    expect(ok).toBe(true);
  });

  it('rejects invalid schemaVersion, missing fields, bad enums, out-of-range dates, and unknown properties', () => {
    const base = createMockFamilyTree();

    const badVersion = { ...base, schemaVersion: '2.0.0' };
    expect(validate(badVersion)).toBe(false);

    const missingPersons = { ...base } as Record<string, unknown>;
    delete missingPersons.persons;
    expect(validate(missingPersons)).toBe(false);

    const badSex = structuredClone(base);
    badSex.persons.P1!.sex = 'invalid-sex' as never;
    expect(validate(badSex)).toBe(false);

    const badMonth = structuredClone(base);
    badMonth.persons.P1!.birth!.date!.start = { year: 1990, month: 13, day: 1 };
    expect(validate(badMonth)).toBe(false);

    const extraProp = structuredClone(base) as unknown as Record<string, unknown>;
    extraProp.unexpectedRootField = true;
    expect(validate(extraProp)).toBe(false);
  });
});
