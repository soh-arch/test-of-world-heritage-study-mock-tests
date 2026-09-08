import type { Exam, Question, Site, TemplateKey } from "./types";
import { applicableSites, generateWith } from "./generator";
import { createRng, shuffle } from "./rng";

/**
 * Share of an exam each template takes. Provisional: the official split by
 * question type is not published (see docs/research/open-questions.md, S4).
 */
export const TEMPLATE_WEIGHTS: Record<TemplateKey, number> = {
  year: 0.3,
  prefecture: 0.3,
  region: 0.2,
  pickByType: 0.2,
};

/** Splits `total` into per-template counts, giving remainders to the heaviest. */
export function allocate(total: number): Array<[TemplateKey, number]> {
  const entries = Object.entries(TEMPLATE_WEIGHTS) as Array<[TemplateKey, number]>;
  const counts = entries.map(([key, weight]) => [key, Math.floor(total * weight)] as [TemplateKey, number]);
  let remaining = total - counts.reduce((sum, [, n]) => sum + n, 0);
  const byWeight = [...counts].sort((a, b) => TEMPLATE_WEIGHTS[b[0]] - TEMPLATE_WEIGHTS[a[0]]);
  for (const entry of byWeight) {
    if (remaining <= 0) break;
    entry[1] += 1;
    remaining -= 1;
  }
  return counts;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Builds an exam of `total` questions. Each site appears at most once, so no
 * question can hint at the answer to another.
 */
export function buildExam(sites: readonly Site[], total: number, seed: number): Exam {
  const rng = createRng(seed);
  const used = new Set<string>();
  const questions: Question[] = [];

  for (const [template, wanted] of allocate(total)) {
    const candidates = orderCandidates(rng, sites, template);
    let taken = 0;
    for (const site of candidates) {
      if (taken >= wanted) break;
      if (used.has(site.id)) continue;
      const question = generateWith(rng, site, sites, template);
      if (!question) continue;
      used.add(site.id);
      questions.push(question);
      taken += 1;
    }
  }

  // A template can run out of unused sites; fill the gap with any template that
  // still works, so an exam is never short of questions.
  if (questions.length < total) {
    for (const site of shuffle(rng, [...sites])) {
      if (questions.length >= total) break;
      if (used.has(site.id)) continue;
      for (const template of shuffle(rng, Object.keys(TEMPLATE_WEIGHTS) as TemplateKey[])) {
        const question = generateWith(rng, site, sites, template);
        if (!question) continue;
        used.add(site.id);
        questions.push(question);
        break;
      }
    }
  }

  // Templates are allocated in order, so shuffle to avoid a predictable run.
  return { seed, questions: shuffle(rng, questions) };
}

/**
 * Most Japanese sites are cultural, so drawing uniformly would make nearly every
 * "which of these is a cultural site" question look the same and burn the five
 * natural sites as distractors. Interleaving by type keeps both kinds asked.
 */
function orderCandidates(rng: () => number, sites: readonly Site[], template: TemplateKey): Site[] {
  const applicable = applicableSites(sites, template);
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

export interface Grade {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  wrong: Array<{ question: Question; chosen: string | null }>;
}

export function grade(exam: Exam, answers: ReadonlyMap<string, string>, passScore: number): Grade {
  const wrong: Grade["wrong"] = [];
  let correct = 0;

  for (const question of exam.questions) {
    const chosen = answers.get(question.id) ?? null;
    if (chosen === question.answerKey) correct += 1;
    else wrong.push({ question, chosen });
  }

  const total = exam.questions.length;
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  return { correct, total, score, passed: score >= passScore, wrong };
}
