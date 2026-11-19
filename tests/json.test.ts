import { describe, expect, it } from 'vitest';
import {
  FamilyTreeParseError,
  createMockFamilyTree,
  parseFamilyTreeJson,
  serializeFamilyTreeJson,
} from '../src/index.js';

describe('JSON parser and serializer', () => {
  it('round-trips the complex mock family tree via JSON', () => {
    const mock = createMockFamilyTree();
    const json = serializeFamilyTreeJson(mock, { validate: true, pretty: true });
    const { tree, validation } = parseFamilyTreeJson(json);

    expect(validation.valid).toBe(true);
    expect(tree).toEqual(mock);
  });

  it('throws FamilyTreeParseError on invalid JSON syntax or validation errors in strict mode', () => {
    expect(() => parseFamilyTreeJson('{ invalid json')).toThrow(FamilyTreeParseError);

    const badVersion = JSON.stringify({
      ...createMockFamilyTree(),
      schemaVersion: '9.9.9',
    });
    expect(() => parseFamilyTreeJson(badVersion)).toThrow(FamilyTreeParseError);

    // Dangling ID & cycle detection via strict mode
    const invalidTree = createMockFamilyTree();
    invalidTree.unions.U1!.children.push({ personId: 'DOES_NOT_EXIST' });
    expect(() =>
      serializeFamilyTreeJson(invalidTree, { validate: true }),
    ).toThrow(FamilyTreeParseError);

    const invalidJson = JSON.stringify(invalidTree);
    expect(() => parseFamilyTreeJson(invalidJson, { strict: true })).toThrow(
      FamilyTreeParseError,
    );

    // Non-strict mode returns validation errors without throwing
    const nonStrict = parseFamilyTreeJson(invalidJson, { strict: false });
    expect(nonStrict.validation.valid).toBe(false);
    expect(
      nonStrict.validation.errors.some((e) => e.code === 'DANGLING_CHILD_REF'),
    ).toBe(true);
  });
});
