/**
 * Core bipartite graph data model for FamilyTree.
 *
 * Person nodes hold individual biographical data without storing direct
 * parent/child/spouse arrays. All family relationships are modeled as
 * Union edges (hyperedges linking 0..N partners to 0..N children), which
 * naturally supports remarriages, half/step-siblings, adoptions, same-sex
 * couples, single parents, and pedigree collapse without data duplication.
 */

export type PersonId = string;
export type UnionId = string;
export type MediaId = string;
export type SourceId = string;
export type NoteId = string;
export type RepositoryId = string;

export const FAMILY_TREE_SCHEMA_VERSION = '1.0.0' as const;

export type DateQualifier =
  | 'exact'
  | 'about'
  | 'before'
  | 'after'
  | 'between'
  | 'from_to'
  | 'calculated'
  | 'estimated';

export interface PartialDate {
  year?: number;
  month?: number;
  day?: number;
}

export interface GenealogicalDate {
  raw: string;
  qualifier: DateQualifier;
  start?: PartialDate;
  end?: PartialDate;
  sortKey?: number;
}

export type BiologicalSex = 'male' | 'female' | 'other' | 'unknown';

export interface PersonName {
  given?: string;
  surname?: string;
  prefix?: string;
  suffix?: string;
  nickname?: string;
  display: string;
  type?: 'birth' | 'married' | 'maiden' | 'aka' | 'other';
}

export interface SourceCitation {
  sourceId: SourceId;
  page?: string;
  externalIds?: string[];
  note?: string;
}

export type PersonEventType =
  | 'birth'
  | 'baptism'
  | 'christening'
  | 'death'
  | 'burial'
  | 'cremation'
  | 'residence'
  | 'occupation'
  | 'immigration'
  | 'emigration'
  | 'arrival'
  | 'departure'
  | 'military'
  | 'census'
  | 'adoption'
  | 'custom';

export interface LifeEvent {
  type: PersonEventType;
  customType?: string;
  date?: GenealogicalDate;
  place?: string;
  description?: string;
  notes?: string[];
  citations?: SourceCitation[];
}

export type UnionEventType =
  | 'marriage'
  | 'engagement'
  | 'divorce'
  | 'divorce_filed'
  | 'annulment'
  | 'separation'
  | 'custom';

export interface UnionEvent {
  type: UnionEventType;
  customType?: string;
  date?: GenealogicalDate;
  place?: string;
  description?: string;
  notes?: string[];
  citations?: SourceCitation[];
}

export interface MediaReference {
  mediaId: MediaId;
  isPrimary?: boolean;
}

export interface MediaObject {
  id: MediaId;
  title?: string;
  format?: string;
  mimeType?: string;
  mediaType?: string;
  file?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  date?: GenealogicalDate;
  place?: string;
  description?: string;
  transcription?: string;
  externalId?: string;
}

export type PrimitiveMetadataValue = string | number | boolean;

export interface Person {
  id: PersonId;
  name: PersonName;
  alternateNames?: PersonName[];
  sex: BiologicalSex;
  birth?: LifeEvent;
  death?: LifeEvent;
  events: LifeEvent[];
  media: MediaReference[];
  notes: string[];
  noteIds?: NoteId[];
  citations: SourceCitation[];
  isLiving?: boolean;
  metadata?: Record<string, PrimitiveMetadataValue>;
}

export type UnionType =
  | 'marriage'
  | 'partnership'
  | 'civil_union'
  | 'engaged'
  | 'common_law'
  | 'unknown';

export type UnionStatus =
  | 'active'
  | 'divorced'
  | 'separated'
  | 'annulled'
  | 'widowed'
  | 'ended'
  | 'unknown';

export type ParentChildType =
  | 'biological'
  | 'adopted'
  | 'foster'
  | 'step'
  | 'sealed'
  | 'unknown';

export interface UnionPartner {
  personId: PersonId;
  role?: 'husband' | 'wife' | 'partner';
}

export interface ChildLink {
  personId: PersonId;
  pedigree?: ParentChildType;
  parentRelations?: Record<PersonId, ParentChildType>;
  notes?: string[];
}

export interface Union {
  id: UnionId;
  partners: UnionPartner[];
  children: ChildLink[];
  type: UnionType;
  status: UnionStatus;
  marriage?: UnionEvent;
  divorce?: UnionEvent;
  events: UnionEvent[];
  notes: string[];
  noteIds?: NoteId[];
  citations: SourceCitation[];
  media?: MediaReference[];
  metadata?: Record<string, PrimitiveMetadataValue>;
}

export interface SourceRecord {
  id: SourceId;
  title?: string;
  author?: string;
  publisher?: string;
  repositoryId?: RepositoryId;
  externalId?: string;
  note?: string;
  metadata?: Record<string, PrimitiveMetadataValue>;
}

export interface RepositoryRecord {
  id: RepositoryId;
  name: string;
  address?: string;
  url?: string;
  phone?: string;
  note?: string;
}

export interface NoteRecord {
  id: NoteId;
  text: string;
}

export interface TreeMetadata {
  title?: string;
  description?: string;
  sourceSystem?: string;
  sourceVersion?: string;
  exportedAt?: string;
  defaultRootPersonId?: PersonId;
  submitterName?: string;
  custom?: Record<string, PrimitiveMetadataValue>;
}

export interface FamilyTree {
  schemaVersion: typeof FAMILY_TREE_SCHEMA_VERSION;
  metadata: TreeMetadata;
  persons: Record<PersonId, Person>;
  unions: Record<UnionId, Union>;
  media: Record<MediaId, MediaObject>;
  sources: Record<SourceId, SourceRecord>;
  repositories: Record<RepositoryId, RepositoryRecord>;
  notes: Record<NoteId, NoteRecord>;
}
