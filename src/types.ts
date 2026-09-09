export type HeritageType = "cultural" | "natural" | "mixed";

/** Japanese sites and world sites differ in how a place is named, not in shape. */
export type Scope = "japan" | "world";

export interface Site {
  id: string;
  scope: Scope;
  nameJa: string;
  /** Prefectures for a Japanese site, countries for a world one. */
  places: string[];
  /** Japanese regions, or the exam's own eight world regions. */
  regions: string[];
  year: number;
  type: HeritageType;
  criteria: number[];
  /** Shared with other countries, so it has no single place or region. */
  transboundary: boolean;
  /** World sites only: whether the textbook actually covers it is inferred. */
  estimated?: boolean;
}

export type TemplateKey = "year" | "place" | "region" | "related" | "pickByType";

/** Where a question came from: a generator template, or the hand-written pool. */
export type QuestionSource = TemplateKey | "manual";

/** The exam's five categories. */
export type CategoryKey = "basic" | "japan" | "world_natural" | "world_cultural" | "other";

export interface Choice {
  /** Stable key used for grading. Display text is never compared. */
  key: string;
  label: string;
}

export interface Question {
  id: string;
  template: QuestionSource;
  category: CategoryKey;
  /** Site the question is about; one exam uses each site at most once. Absent
   *  on hand-written questions that are not about a particular site. */
  siteId?: string;
  text: string;
  choices: Choice[];
  answerKey: string;
  explanation: string;
}

export interface Exam {
  seed: number;
  questions: Question[];
}

/**
 * A question written by hand. Templates cannot reach what grade 3 actually
 * asks - the concepts behind the convention, and what is particular to one
 * site - so those are written out and checked against a source.
 */
export interface ManualQuestion {
  id: string;
  category: CategoryKey;
  topic: string;
  siteId?: string;
  text: string;
  choices: Choice[];
  answerKey: string;
  explanation: string;
  /** Where the fact was confirmed. Required once the question is verified. */
  source: string;
  /** Only verified questions reach the app. */
  verified: boolean;
  /** True where the answer changes over time, so the question states its date. */
  volatile?: boolean;
}
