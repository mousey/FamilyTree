import { FAMILY_TREE_SCHEMA_VERSION, type FamilyTree } from '../types.js';
import { validateFamilyTree, type ValidationIssue, type ValidationResult } from '../validation.js';

export class FamilyTreeParseError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.name = 'FamilyTreeParseError';
    this.issues = issues;
  }
}

export interface SerializeJsonOptions {
  pretty?: boolean;
  validate?: boolean;
}

export interface ParseJsonOptions {
  strict?: boolean;
}

export interface JsonParseResult {
  tree: FamilyTree;
  validation: ValidationResult;
}

export function serializeFamilyTreeJson(
  tree: FamilyTree,
  options: SerializeJsonOptions = {},
): string {
  const pretty = options.pretty ?? true;
  if (options.validate) {
    const validation = validateFamilyTree(tree);
    if (!validation.valid) {
      throw new FamilyTreeParseError(
        `Cannot serialize invalid FamilyTree: ${validation.errors[0]?.message ?? 'validation failed'}`,
        validation.errors,
      );
    }
  }
  return JSON.stringify(tree, null, pretty ? 2 : undefined);
}

export function parseFamilyTreeJson(
  input: string,
  options: ParseJsonOptions = {},
): JsonParseResult {
  const strict = options.strict ?? true;

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new FamilyTreeParseError(`Invalid JSON syntax: ${detail}`);
  }

  const validation = validateFamilyTree(parsed);
  if (strict && !validation.valid) {
    throw new FamilyTreeParseError(
      `Invalid FamilyTree JSON: ${validation.errors[0]?.message ?? 'validation failed'}`,
      validation.errors,
    );
  }

  const tree =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as FamilyTree)
      : ({
          schemaVersion: FAMILY_TREE_SCHEMA_VERSION,
          metadata: {},
          persons: {},
          unions: {},
          media: {},
          sources: {},
          repositories: {},
          notes: {},
        } satisfies FamilyTree);

  return { tree, validation };
}
