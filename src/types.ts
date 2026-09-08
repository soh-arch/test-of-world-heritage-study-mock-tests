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

/** The categories the exam is built from that this data can answer. */
export type CategoryKey = "japan" | "world_natural" | "world_cultural";

export interface Choice {
  /** Stable key used for grading. Display text is never compared. */
  key: string;
  label: string;
}

export interface Question {
  id: string;
  template: TemplateKey;
  category: CategoryKey;
  /** Site the question is built from; one exam uses each site at most once. */
  siteId: string;
  text: string;
  choices: Choice[];
  answerKey: string;
  explanation: string;
}

export interface Exam {
  seed: number;
  questions: Question[];
}
