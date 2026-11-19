import {
  FAMILY_TREE_SCHEMA_VERSION,
  type FamilyTree,
  type ParentChildType,
  type Person,
  type PersonEventType,
  type Union,
  type UnionEventType,
  type UnionStatus,
  type UnionType,
} from './types.js';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  entityId?: string;
  path?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

const BIOLOGICAL_SEX_SET = new Set(['male', 'female', 'other', 'unknown']);
const UNION_TYPE_SET = new Set<UnionType>([
  'marriage',
  'partnership',
  'civil_union',
  'engaged',
  'common_law',
  'unknown',
]);
const UNION_STATUS_SET = new Set<UnionStatus>([
  'active',
  'divorced',
  'separated',
  'annulled',
  'widowed',
  'ended',
  'unknown',
]);
const PARENT_CHILD_TYPE_SET = new Set<ParentChildType>([
  'biological',
  'adopted',
  'foster',
  'step',
  'sealed',
  'unknown',
]);
const PARTNER_ROLE_SET = new Set(['husband', 'wife', 'partner']);
const PERSON_EVENT_TYPE_SET = new Set<PersonEventType>([
  'birth',
  'baptism',
  'christening',
  'death',
  'burial',
  'cremation',
  'residence',
  'occupation',
  'immigration',
  'emigration',
  'arrival',
  'departure',
  'military',
  'census',
  'adoption',
  'custom',
]);
const UNION_EVENT_TYPE_SET = new Set<UnionEventType>([
  'marriage',
  'engagement',
  'divorce',
  'divorce_filed',
  'annulment',
  'separation',
  'custom',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function addIssue(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  issue: ValidationIssue,
): void {
  if (issue.severity === 'error') {
    errors.push(issue);
  } else {
    warnings.push(issue);
  }
}

export function validateFamilyTree(input: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isPlainObject(input)) {
    errors.push({
      code: 'INVALID_ROOT',
      severity: 'error',
      message: 'FamilyTree root must be a plain object.',
    });
    return { valid: false, errors, warnings };
  }

  if (input.schemaVersion !== FAMILY_TREE_SCHEMA_VERSION) {
    errors.push({
      code: 'INVALID_SCHEMA_VERSION',
      severity: 'error',
      message: `Expected schemaVersion "${FAMILY_TREE_SCHEMA_VERSION}", got "${String(input.schemaVersion)}".`,
      path: 'schemaVersion',
    });
  }

  const requiredMaps = [
    'metadata',
    'persons',
    'unions',
    'media',
    'sources',
    'repositories',
    'notes',
  ] as const;

  for (const key of requiredMaps) {
    if (!isPlainObject(input[key])) {
      errors.push({
        code: 'MISSING_COLLECTION',
        severity: 'error',
        message: `Expected "${key}" to be an object.`,
        path: key,
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const tree = input as unknown as FamilyTree;

  // Validate map keys match entity.id and structural entity fields
  const checkCollectionIds = (
    collection: Record<string, unknown>,
    collectionName: string,
  ): void => {
    for (const [key, value] of Object.entries(collection)) {
      if (!isPlainObject(value)) {
        errors.push({
          code: 'INVALID_ENTITY',
          severity: 'error',
          message: `${collectionName}["${key}"] must be an object.`,
          entityId: key,
          path: `${collectionName}.${key}`,
        });
        continue;
      }
      if (typeof value.id !== 'string' || value.id.length === 0) {
        errors.push({
          code: 'MISSING_ENTITY_ID',
          severity: 'error',
          message: `${collectionName}["${key}"] is missing a non-empty string id.`,
          entityId: key,
          path: `${collectionName}.${key}.id`,
        });
      } else if (value.id !== key) {
        errors.push({
          code: 'ID_MISMATCH',
          severity: 'error',
          message: `${collectionName} key "${key}" does not match entity id "${value.id}".`,
          entityId: key,
          path: `${collectionName}.${key}.id`,
        });
      }
    }
  };

  checkCollectionIds(tree.persons as Record<string, unknown>, 'persons');
  checkCollectionIds(tree.unions as Record<string, unknown>, 'unions');
  checkCollectionIds(tree.media as Record<string, unknown>, 'media');
  checkCollectionIds(tree.sources as Record<string, unknown>, 'sources');
  checkCollectionIds(tree.repositories as Record<string, unknown>, 'repositories');
  checkCollectionIds(tree.notes as Record<string, unknown>, 'notes');

  if (
    tree.metadata.defaultRootPersonId !== undefined &&
    !tree.persons[tree.metadata.defaultRootPersonId]
  ) {
    errors.push({
      code: 'DANGLING_ROOT_PERSON',
      severity: 'error',
      message: `metadata.defaultRootPersonId "${tree.metadata.defaultRootPersonId}" does not exist in persons.`,
      entityId: tree.metadata.defaultRootPersonId,
      path: 'metadata.defaultRootPersonId',
    });
  }

  const checkMediaRefs = (
    refs: unknown,
    ownerId: string,
    basePath: string,
  ): void => {
    if (!Array.isArray(refs)) {
      return;
    }
    refs.forEach((ref, index) => {
      if (!isPlainObject(ref) || typeof ref.mediaId !== 'string') {
        errors.push({
          code: 'INVALID_MEDIA_REF',
          severity: 'error',
          message: `Invalid media reference at ${basePath}[${index}].`,
          entityId: ownerId,
          path: `${basePath}[${index}]`,
        });
        return;
      }
      if (!tree.media[ref.mediaId]) {
        errors.push({
          code: 'DANGLING_MEDIA_REF',
          severity: 'error',
          message: `Referenced media "${ref.mediaId}" does not exist.`,
          entityId: ownerId,
          path: `${basePath}[${index}].mediaId`,
        });
      }
    });
  };

  const checkCitations = (
    citations: unknown,
    ownerId: string,
    basePath: string,
  ): void => {
    if (!Array.isArray(citations)) {
      return;
    }
    citations.forEach((cit, index) => {
      if (!isPlainObject(cit) || typeof cit.sourceId !== 'string') {
        errors.push({
          code: 'INVALID_CITATION',
          severity: 'error',
          message: `Invalid citation at ${basePath}[${index}].`,
          entityId: ownerId,
          path: `${basePath}[${index}]`,
        });
        return;
      }
      if (!tree.sources[cit.sourceId]) {
        errors.push({
          code: 'DANGLING_SOURCE_REF',
          severity: 'error',
          message: `Referenced source "${cit.sourceId}" does not exist.`,
          entityId: ownerId,
          path: `${basePath}[${index}].sourceId`,
        });
      }
    });
  };

  const checkNoteIds = (
    noteIds: unknown,
    ownerId: string,
    basePath: string,
  ): void => {
    if (!Array.isArray(noteIds)) {
      return;
    }
    noteIds.forEach((noteId, index) => {
      if (typeof noteId !== 'string' || !tree.notes[noteId]) {
        errors.push({
          code: 'DANGLING_NOTE_REF',
          severity: 'error',
          message: `Referenced note "${String(noteId)}" does not exist.`,
          entityId: ownerId,
          path: `${basePath}[${index}]`,
        });
      }
    });
  };

  // Validate Repositories & Sources
  for (const [sourceId, source] of Object.entries(tree.sources)) {
    if (!isPlainObject(source)) {
      continue;
    }
    if (source.repositoryId !== undefined && !tree.repositories[source.repositoryId]) {
      errors.push({
        code: 'DANGLING_REPOSITORY_REF',
        severity: 'error',
        message: `Source "${sourceId}" references missing repository "${source.repositoryId}".`,
        entityId: sourceId,
        path: `sources.${sourceId}.repositoryId`,
      });
    }
  }

  for (const [repoId, repo] of Object.entries(tree.repositories)) {
    if (!isPlainObject(repo)) {
      continue;
    }
    if (typeof repo.name !== 'string') {
      errors.push({
        code: 'INVALID_REPOSITORY',
        severity: 'error',
        message: `Repository "${repoId}" is missing a string name.`,
        entityId: repoId,
        path: `repositories.${repoId}.name`,
      });
    }
  }

  for (const [noteId, note] of Object.entries(tree.notes)) {
    if (!isPlainObject(note)) {
      continue;
    }
    if (typeof note.text !== 'string') {
      errors.push({
        code: 'INVALID_NOTE',
        severity: 'error',
        message: `Note "${noteId}" is missing a string text.`,
        entityId: noteId,
        path: `notes.${noteId}.text`,
      });
    }
  }

  // Validate Persons
  for (const [personId, person] of Object.entries(tree.persons)) {
    if (!isPlainObject(person)) {
      continue;
    }
    const p = person as Person;
    if (!isPlainObject(p.name) || typeof p.name.display !== 'string') {
      errors.push({
        code: 'INVALID_PERSON_NAME',
        severity: 'error',
        message: `Person "${personId}" must have name.display.`,
        entityId: personId,
        path: `persons.${personId}.name`,
      });
    }
    if (!BIOLOGICAL_SEX_SET.has(p.sex)) {
      errors.push({
        code: 'INVALID_PERSON_SEX',
        severity: 'error',
        message: `Person "${personId}" has invalid sex "${String(p.sex)}".`,
        entityId: personId,
        path: `persons.${personId}.sex`,
      });
    }
    if (!Array.isArray(p.events)) {
      errors.push({
        code: 'INVALID_PERSON_FIELD',
        severity: 'error',
        message: `Person "${personId}" must have an events array.`,
        entityId: personId,
        path: `persons.${personId}.events`,
      });
    } else {
      p.events.forEach((ev, idx) => {
        if (!isPlainObject(ev) || !PERSON_EVENT_TYPE_SET.has(ev.type)) {
          errors.push({
            code: 'INVALID_EVENT_TYPE',
            severity: 'error',
            message: `Person "${personId}" has invalid event type at events[${idx}].`,
            entityId: personId,
            path: `persons.${personId}.events[${idx}].type`,
          });
        } else {
          checkCitations(ev.citations, personId, `persons.${personId}.events[${idx}].citations`);
        }
      });
    }
    if (p.birth) {
      checkCitations(p.birth.citations, personId, `persons.${personId}.birth.citations`);
    }
    if (p.death) {
      checkCitations(p.death.citations, personId, `persons.${personId}.death.citations`);
    }
    if (!Array.isArray(p.media)) {
      errors.push({
        code: 'INVALID_PERSON_FIELD',
        severity: 'error',
        message: `Person "${personId}" must have a media array.`,
        entityId: personId,
        path: `persons.${personId}.media`,
      });
    } else {
      checkMediaRefs(p.media, personId, `persons.${personId}.media`);
    }
    if (!Array.isArray(p.notes)) {
      errors.push({
        code: 'INVALID_PERSON_FIELD',
        severity: 'error',
        message: `Person "${personId}" must have a notes array.`,
        entityId: personId,
        path: `persons.${personId}.notes`,
      });
    }
    checkNoteIds(p.noteIds, personId, `persons.${personId}.noteIds`);
    if (!Array.isArray(p.citations)) {
      errors.push({
        code: 'INVALID_PERSON_FIELD',
        severity: 'error',
        message: `Person "${personId}" must have a citations array.`,
        entityId: personId,
        path: `persons.${personId}.citations`,
      });
    } else {
      checkCitations(p.citations, personId, `persons.${personId}.citations`);
    }
  }

  // Track person references for disconnected/multi-parent checks & parent->child DAG for cycle check
  const referencedPersons = new Set<string>();
  const childUnionCount = new Map<string, number>();
  const childrenByParent = new Map<string, string[]>();

  for (const [unionId, unionRaw] of Object.entries(tree.unions)) {
    if (!isPlainObject(unionRaw)) {
      continue;
    }
    const u = unionRaw as Union;

    if (!UNION_TYPE_SET.has(u.type)) {
      errors.push({
        code: 'INVALID_UNION_TYPE',
        severity: 'error',
        message: `Union "${unionId}" has invalid type "${String(u.type)}".`,
        entityId: unionId,
        path: `unions.${unionId}.type`,
      });
    }
    if (!UNION_STATUS_SET.has(u.status)) {
      errors.push({
        code: 'INVALID_UNION_STATUS',
        severity: 'error',
        message: `Union "${unionId}" has invalid status "${String(u.status)}".`,
        entityId: unionId,
        path: `unions.${unionId}.status`,
      });
    }
    if (!Array.isArray(u.partners) || !Array.isArray(u.children)) {
      errors.push({
        code: 'INVALID_UNION_FIELD',
        severity: 'error',
        message: `Union "${unionId}" must have partners and children arrays.`,
        entityId: unionId,
        path: `unions.${unionId}`,
      });
      continue;
    }

    if (u.partners.length === 0 && u.children.length === 0) {
      addIssue(errors, warnings, {
        code: 'ORPHAN_UNION',
        severity: 'warning',
        message: `Union "${unionId}" has neither partners nor children.`,
        entityId: unionId,
        path: `unions.${unionId}`,
      });
    }

    const partnerSet = new Set<string>();
    u.partners.forEach((partner, idx) => {
      if (!isPlainObject(partner) || typeof partner.personId !== 'string') {
        errors.push({
          code: 'INVALID_PARTNER',
          severity: 'error',
          message: `Union "${unionId}" has invalid partner at partners[${idx}].`,
          entityId: unionId,
          path: `unions.${unionId}.partners[${idx}]`,
        });
        return;
      }
      if (partner.role !== undefined && !PARTNER_ROLE_SET.has(partner.role)) {
        errors.push({
          code: 'INVALID_PARTNER_ROLE',
          severity: 'error',
          message: `Union "${unionId}" partner has invalid role "${String(partner.role)}".`,
          entityId: unionId,
          path: `unions.${unionId}.partners[${idx}].role`,
        });
      }
      if (!tree.persons[partner.personId]) {
        errors.push({
          code: 'DANGLING_PARTNER_REF',
          severity: 'error',
          message: `Union "${unionId}" partner "${partner.personId}" does not exist in persons.`,
          entityId: unionId,
          path: `unions.${unionId}.partners[${idx}].personId`,
        });
        return;
      }
      if (partnerSet.has(partner.personId)) {
        errors.push({
          code: 'DUPLICATE_PARTNER',
          severity: 'error',
          message: `Person "${partner.personId}" appears multiple times as partner in union "${unionId}".`,
          entityId: unionId,
          path: `unions.${unionId}.partners[${idx}].personId`,
        });
      }
      partnerSet.add(partner.personId);
      referencedPersons.add(partner.personId);
    });

    const childSet = new Set<string>();
    u.children.forEach((child, idx) => {
      if (!isPlainObject(child) || typeof child.personId !== 'string') {
        errors.push({
          code: 'INVALID_CHILD',
          severity: 'error',
          message: `Union "${unionId}" has invalid child at children[${idx}].`,
          entityId: unionId,
          path: `unions.${unionId}.children[${idx}]`,
        });
        return;
      }
      if (child.pedigree !== undefined && !PARENT_CHILD_TYPE_SET.has(child.pedigree)) {
        errors.push({
          code: 'INVALID_PEDIGREE',
          severity: 'error',
          message: `Union "${unionId}" child "${child.personId}" has invalid pedigree "${String(child.pedigree)}".`,
          entityId: unionId,
          path: `unions.${unionId}.children[${idx}].pedigree`,
        });
      }
      if (child.parentRelations !== undefined) {
        if (!isPlainObject(child.parentRelations)) {
          errors.push({
            code: 'INVALID_PARENT_RELATIONS',
            severity: 'error',
            message: `Union "${unionId}" child "${child.personId}" parentRelations must be an object.`,
            entityId: unionId,
            path: `unions.${unionId}.children[${idx}].parentRelations`,
          });
        } else {
          for (const [relParentId, relType] of Object.entries(child.parentRelations)) {
            if (!partnerSet.has(relParentId)) {
              errors.push({
                code: 'INVALID_PARENT_RELATION_KEY',
                severity: 'error',
                message: `parentRelations key "${relParentId}" on child "${child.personId}" in union "${unionId}" is not a partner of that union.`,
                entityId: unionId,
                path: `unions.${unionId}.children[${idx}].parentRelations.${relParentId}`,
              });
            }
            if (!PARENT_CHILD_TYPE_SET.has(relType)) {
              errors.push({
                code: 'INVALID_PARENT_RELATION_TYPE',
                severity: 'error',
                message: `parentRelations value "${String(relType)}" on child "${child.personId}" in union "${unionId}" is invalid.`,
                entityId: unionId,
                path: `unions.${unionId}.children[${idx}].parentRelations.${relParentId}`,
              });
            }
          }
        }
      }
      if (!tree.persons[child.personId]) {
        errors.push({
          code: 'DANGLING_CHILD_REF',
          severity: 'error',
          message: `Union "${unionId}" child "${child.personId}" does not exist in persons.`,
          entityId: unionId,
          path: `unions.${unionId}.children[${idx}].personId`,
        });
        return;
      }
      if (childSet.has(child.personId)) {
        errors.push({
          code: 'DUPLICATE_CHILD',
          severity: 'error',
          message: `Person "${child.personId}" appears multiple times as child in union "${unionId}".`,
          entityId: unionId,
          path: `unions.${unionId}.children[${idx}].personId`,
        });
      }
      if (partnerSet.has(child.personId)) {
        errors.push({
          code: 'SELF_PARENT_IN_UNION',
          severity: 'error',
          message: `Person "${child.personId}" is both a partner and a child in union "${unionId}".`,
          entityId: unionId,
          path: `unions.${unionId}.children[${idx}].personId`,
        });
      }
      childSet.add(child.personId);
      referencedPersons.add(child.personId);
      childUnionCount.set(child.personId, (childUnionCount.get(child.personId) ?? 0) + 1);

      const childPerson = tree.persons[child.personId];
      for (const parentId of partnerSet) {
        if (parentId !== child.personId) {
          const list = childrenByParent.get(parentId);
          if (list) {
            list.push(child.personId);
          } else {
            childrenByParent.set(parentId, [child.personId]);
          }
        }

        // Chronology warnings (only when both have exact years)
        const parentPerson = tree.persons[parentId];
        if (
          childPerson?.birth?.date?.qualifier === 'exact' &&
          childPerson.birth.date.start?.year !== undefined &&
          parentPerson
        ) {
          const childBirthYear = childPerson.birth.date.start.year;
          if (
            parentPerson.birth?.date?.qualifier === 'exact' &&
            parentPerson.birth.date.start?.year !== undefined &&
            childBirthYear < parentPerson.birth.date.start.year
          ) {
            warnings.push({
              code: 'CHRONOLOGY_ANOMALY',
              severity: 'warning',
              message: `Child "${child.personId}" (${childBirthYear}) was born before parent "${parentId}" (${parentPerson.birth.date.start.year}).`,
              entityId: child.personId,
              path: `unions.${unionId}.children[${idx}]`,
            });
          }
          if (
            parentPerson.death?.date?.qualifier === 'exact' &&
            parentPerson.death.date.start?.year !== undefined &&
            childBirthYear > parentPerson.death.date.start.year + 1
          ) {
            warnings.push({
              code: 'CHRONOLOGY_ANOMALY',
              severity: 'warning',
              message: `Child "${child.personId}" (${childBirthYear}) was born more than 1 year after parent "${parentId}" died (${parentPerson.death.date.start.year}).`,
              entityId: child.personId,
              path: `unions.${unionId}.children[${idx}]`,
            });
          }
        }
      }
    });

    if (!Array.isArray(u.events)) {
      errors.push({
        code: 'INVALID_UNION_FIELD',
        severity: 'error',
        message: `Union "${unionId}" must have an events array.`,
        entityId: unionId,
        path: `unions.${unionId}.events`,
      });
    } else {
      u.events.forEach((ev, idx) => {
        if (!isPlainObject(ev) || !UNION_EVENT_TYPE_SET.has(ev.type)) {
          errors.push({
            code: 'INVALID_EVENT_TYPE',
            severity: 'error',
            message: `Union "${unionId}" has invalid event type at events[${idx}].`,
            entityId: unionId,
            path: `unions.${unionId}.events[${idx}].type`,
          });
        } else {
          checkCitations(ev.citations, unionId, `unions.${unionId}.events[${idx}].citations`);
        }
      });
    }
    if (u.marriage) {
      checkCitations(u.marriage.citations, unionId, `unions.${unionId}.marriage.citations`);
    }
    if (u.divorce) {
      checkCitations(u.divorce.citations, unionId, `unions.${unionId}.divorce.citations`);
    }
    if (!Array.isArray(u.notes)) {
      errors.push({
        code: 'INVALID_UNION_FIELD',
        severity: 'error',
        message: `Union "${unionId}" must have a notes array.`,
        entityId: unionId,
        path: `unions.${unionId}.notes`,
      });
    }
    checkNoteIds(u.noteIds, unionId, `unions.${unionId}.noteIds`);
    if (!Array.isArray(u.citations)) {
      errors.push({
        code: 'INVALID_UNION_FIELD',
        severity: 'error',
        message: `Union "${unionId}" must have a citations array.`,
        entityId: unionId,
        path: `unions.${unionId}.citations`,
      });
    } else {
      checkCitations(u.citations, unionId, `unions.${unionId}.citations`);
    }
    checkMediaRefs(u.media, unionId, `unions.${unionId}.media`);
  }

  // Multiple parent unions warning
  for (const [personId, count] of childUnionCount.entries()) {
    if (count > 1) {
      warnings.push({
        code: 'MULTIPLE_PARENT_UNIONS',
        severity: 'warning',
        message: `Person "${personId}" appears as a child in ${count} unions (e.g., biological and adoptive/step families).`,
        entityId: personId,
      });
    }
  }

  // Disconnected person warning
  for (const personId of Object.keys(tree.persons)) {
    if (!referencedPersons.has(personId)) {
      warnings.push({
        code: 'DISCONNECTED_PERSON',
        severity: 'warning',
        message: `Person "${personId}" is not referenced in any union.`,
        entityId: personId,
        path: `persons.${personId}`,
      });
    }
  }

  // Ancestry cycle detection using 3-color iterative/recursive DFS
  // 0 = unvisited, 1 = visiting (in stack), 2 = visited
  const color = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reportedCycleKeys = new Set<string>();

  const dfs = (personId: string): void => {
    color.set(personId, 1);
    stack.push(personId);

    const children = childrenByParent.get(personId) ?? [];
    for (const childId of children) {
      const childColor = color.get(childId) ?? 0;
      if (childColor === 1) {
        const startIdx = stack.indexOf(childId);
        const cycle = startIdx >= 0 ? [...stack.slice(startIdx), childId] : [personId, childId];
        const cycleKey = cycle.slice(0, -1).slice().sort().join('|');
        if (!reportedCycleKeys.has(cycleKey)) {
          reportedCycleKeys.add(cycleKey);
          errors.push({
            code: 'ANCESTRY_CYCLE',
            severity: 'error',
            message: `Ancestry cycle detected: ${cycle.join(' -> ')}.`,
            entityId: childId,
          });
        }
      } else if (childColor === 0) {
        dfs(childId);
      }
    }

    stack.pop();
    color.set(personId, 2);
  };

  for (const personId of Object.keys(tree.persons)) {
    if ((color.get(personId) ?? 0) === 0) {
      dfs(personId);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
