export type HeritageType = "cultural" | "natural" | "mixed";

export interface Site {
  id: string;
  nameJa: string;
  nameAlt: string;
  prefectures: string[];
  regions: string[];
  year: number;
  type: HeritageType;
  criteria: number[];
}

export type TemplateKey = "year" | "prefecture" | "region" | "pickByType";

export interface Choice {
  /** Stable key used for grading. Display text is never compared. */
  key: string;
  label: string;
}

export interface Question {
  id: string;
  template: TemplateKey;
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
