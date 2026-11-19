import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateGenerations,
  createFamilyGraph,
  getTreeStats,
  parseGedcom,
  validateFamilyTree,
} from '../src/index.js';

function main(): void {
  const filePathArg = process.argv[2];
  if (!filePathArg) {
    console.error('Usage: bun scripts/inspect-gedcom.ts <path-to-gedcom-file>');
    process.exitCode = 1;
    return;
  }

  const absolutePath = resolve(process.cwd(), filePathArg);
  const rawContent = readFileSync(absolutePath, 'utf8');

  const { tree, warnings: parseWarnings } = parseGedcom(rawContent);
  const validation = validateFamilyTree(tree);
  const graph = createFamilyGraph(tree);
  const stats = getTreeStats(graph);

  console.log('=== FamilyTree GEDCOM Inspection ===');
  console.log(`Title:                 ${tree.metadata.title ?? '(untitled)'}`);
  console.log(`Source System:         ${tree.metadata.sourceSystem ?? '(unknown)'}`);
  console.log(`Persons:               ${stats.personCount}`);
  console.log(`Unions:                ${stats.unionCount}`);
  console.log(`Media Objects:         ${stats.mediaCount} (missing file: ${stats.missingMediaFileCount})`);
  console.log(`Sources / Repos:       ${stats.sourceCount} / ${stats.repositoryCount}`);
  console.log(`Remarried Persons:     ${stats.remarriedPersonCount}`);
  console.log(`Multi-FAMC Persons:    ${stats.multiParentUnionPersonCount}`);
  console.log(`Single-Parent Unions:  ${stats.singleParentUnionCount}`);
  console.log(`Connected Components:  ${stats.disconnectedComponentCount}`);
  if (stats.earliestBirthYear !== undefined || stats.latestBirthYear !== undefined) {
    console.log(
      `Birth Year Span:       ${stats.earliestBirthYear ?? '?'} – ${stats.latestBirthYear ?? '?'}`,
    );
  }
  console.log(`Parse Warnings:        ${parseWarnings.length}`);
  console.log(
    `Validation:            ${validation.valid ? 'VALID' : 'INVALID'} (${validation.errors.length} errors, ${validation.warnings.length} warnings)`,
  );

  const rootId = tree.metadata.defaultRootPersonId ?? Object.keys(tree.persons)[0];
  if (rootId) {
    const rootPerson = graph.getPerson(rootId);
    const gens = calculateGenerations(graph, rootId);
    console.log('');
    console.log(`Generations from ${rootPerson?.name.display ?? rootId} (${rootId}):`);
    console.log(`  Span: ${gens.minGeneration} to ${gens.maxGeneration}`);
    console.log(`  Generation conflicts: ${gens.conflicts.length}`);
    console.log(`  Unreachable persons:  ${gens.unreachablePersonIds.length}`);
    for (const [gen, members] of gens.byGeneration.entries()) {
      console.log(`  Gen ${String(gen).padStart(3, ' ')}: ${members.length} person(s)`);
    }
  }

  if (validation.errors.length > 0) {
    console.log('');
    console.log('Errors:');
    for (const err of validation.errors.slice(0, 10)) {
      console.log(`  [${err.code}] ${err.message}`);
    }
  }
}

main();
