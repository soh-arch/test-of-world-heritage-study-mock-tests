import configJson from "./data/exam-config.json";
import type { CategoryKey, Exam, Question, Site, TemplateKey } from "./types";
import { applicableSites, categoriesOf, generateWith } from "./generator";
import { createRng, shuffle } from "./rng";

const config = configJson as {
  categories: Array<{ key: string; label: string; ratio: number }>;
  questionTypes: Array<{ key: string; label: string; ratio: number }>;
};

/** The categories the current data can answer. Basic knowledge and "その他" need
 *  hand-written questions, so they are left out and the rest are renormalised. */
export const COVERED: CategoryKey[] = ["japan", "world_natural", "world_cultural"];

export const CATEGORY_LABEL: Record<CategoryKey, string> = {
  japan: "日本の遺産",
  world_natural: "世界の自然遺産",
  world_cultural: "世界の文化遺産",
};

/**
 * Which of the exam's own question types each template stands in for, and how
 * much of that type it covers. Deriving the weights from the config instead of
 * hard-coding them keeps the mix tied to the researched ratios: an earlier
 * hand-picked set asked for the inscription year six times as often as the exam
 * appears to. See docs/research/facts/05-question-type-gap.md.
 */
const TEMPLATE_SOURCE: Record<TemplateKey, { type: string; share: number }> = {
  year: { type: "year", share: 1 },
  // One official type covers both prefectures/countries and regions.
  place: { type: "attribute_country_place", share: 0.5 },
  region: { type: "attribute_country_place", share: 0.5 },
  related: { type: "related_association", share: 1 },
  // No official type matches "which of these is a cultural site". Filed under
  // basic knowledge at a guessed share; the rest of that type needs
  // hand-written questions.
  pickByType: { type: "basic_knowledge", share: 0.2 },
};

export const TEMPLATE_WEIGHTS: Record<TemplateKey, number> = Object.fromEntries(
  (Object.entries(TEMPLATE_SOURCE) as Array<[TemplateKey, { type: string; share: number }]>).map(
    ([key, { type, share }]) => [key, (config.questionTypes.find((t) => t.key === type)?.ratio ?? 0) * share],
  ),
) as Record<TemplateKey, number>;

/** Largest remainder, so the counts always add up to `total`. */
function split<K extends string>(total: number, weights: Array<[K, number]>): Array<[K, number]> {
  const sum = weights.reduce((acc, [, w]) => acc + w, 0);
  const exact = weights.map(([key, w]) => [key, (total * w) / sum] as const);
  const counts = exact.map(([key, value]) => [key, Math.floor(value)] as [K, number]);

  let remaining = total - counts.reduce((acc, [, n]) => acc + n, 0);
  const byRemainder = exact
    .map(([, value], i) => ({ i, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);

  for (const { i } of byRemainder) {
    if (remaining <= 0) break;
    counts[i]![1] += 1;
    remaining -= 1;
  }
  return counts;
}

export function allocateCategories(total: number): Array<[CategoryKey, number]> {
  const ratios = COVERED.map(
    (key) => [key, config.categories.find((c) => c.key === key)?.ratio ?? 0] as [CategoryKey, number],
  );
  return split(total, ratios);
}

export function allocateTemplates(total: number): Array<[TemplateKey, number]> {
  return split(total, Object.entries(TEMPLATE_WEIGHTS) as Array<[TemplateKey, number]>);
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Most Japanese sites are cultural, so drawing uniformly would make nearly every
 * "which of these is a cultural site" question look the same and burn the few
 * natural sites as distractors. Interleaving by type keeps both kinds asked.
 */
function orderCandidates(rng: () => number, pool: readonly Site[], template: TemplateKey): Site[] {
  const applicable = applicableSites(pool, template);
  if (template !== "pickByType") return shuffle(rng, applicable);

  const byType = new Map<string, Site[]>();
  for (const site of shuffle(rng, applicable)) {
    byType.set(site.type, [...(byType.get(site.type) ?? []), site]);
  }

  const groups = [...byType.values()];
  const ordered: Site[] = [];
  for (let i = 0; ordered.length < applicable.length; i++) {
    for (const group of groups) {
      const site = group[i];
      if (site) ordered.push(site);
    }
  }
  return ordered;
}

interface Taken {
  /** Sites already asked about; a second question could hint at the answer. */
  sites: Set<string>;
  /** Question stems already used. "次のうち、文化遺産は…" has only three
   *  possible forms, so without this it fills half the paper. */
  stems: Set<string>;
}

function take(
  rng: () => number,
  want: number,
  pool: readonly Site[],
  all: readonly Site[],
  taken: Taken,
  category: CategoryKey,
): Question[] {
  const questions: Question[] = [];

  const fill = (template: TemplateKey, limit: number) => {
    let count = 0;
    for (const site of orderCandidates(rng, pool, template)) {
      if (count >= limit) break;
      if (taken.sites.has(site.id)) continue;
      const question = generateWith(rng, site, all, template);
      if (!question || taken.stems.has(question.text)) continue;
      taken.sites.add(site.id);
      taken.stems.add(question.text);
      questions.push({ ...question, category });
      count += 1;
    }
  };

  for (const [template, count] of allocateTemplates(want)) fill(template, count);

  // A template can run out of unused sites; make up the shortfall with any
  // other template so the category still gets its share.
  for (const template of shuffle(rng, Object.keys(TEMPLATE_WEIGHTS) as TemplateKey[])) {
    if (questions.length >= want) break;
    fill(template, want - questions.length);
  }

  return questions;
}

/**
 * Builds an exam of `total` questions, holding the official category split.
 * Each site appears at most once, so no question can hint at another's answer.
 */
export function buildExam(sites: readonly Site[], total: number, seed: number): Exam {
  const rng = createRng(seed);
  const taken: Taken = { sites: new Set(), stems: new Set() };
  const questions: Question[] = [];

  for (const [category, want] of allocateCategories(total)) {
    const pool = sites.filter((site) => categoriesOf(site).includes(category));
    questions.push(...take(rng, want, pool, sites, taken, category));
  }

  // If a category could not be filled, top up from everything that is left.
  if (questions.length < total) {
    questions.push(...take(rng, total - questions.length, sites, sites, taken, "japan"));
  }

  // Categories are filled in order, so shuffle to avoid a predictable run.
  return { seed, questions: shuffle(rng, questions) };
}

export interface Grade {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  byCategory: Array<{ category: CategoryKey; correct: number; total: number }>;
  wrong: Array<{ question: Question; chosen: string | null }>;
}

export function grade(exam: Exam, answers: ReadonlyMap<string, string>, passScore: number): Grade {
  const wrong: Grade["wrong"] = [];
  const tally = new Map<CategoryKey, { correct: number; total: number }>();
  let correct = 0;

  for (const question of exam.questions) {
    const bucket = tally.get(question.category) ?? { correct: 0, total: 0 };
    bucket.total += 1;

    if (answers.get(question.id) === question.answerKey) {
      correct += 1;
      bucket.correct += 1;
    } else {
      wrong.push({ question, chosen: answers.get(question.id) ?? null });
    }
    tally.set(question.category, bucket);
  }

  const total = exam.questions.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);

  return {
    correct,
    total,
    score,
    passed: score >= passScore,
    byCategory: COVERED.filter((c) => tally.has(c)).map((category) => ({ category, ...tally.get(category)! })),
    wrong,
  };
}
