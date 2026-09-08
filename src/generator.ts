import type { Choice, HeritageType, Question, Site, TemplateKey } from "./types";
import { drawFrom, pick, shuffle } from "./rng";

const TYPE_LABEL: Record<HeritageType, string> = {
  cultural: "文化遺産",
  natural: "自然遺産",
  mixed: "複合遺産",
};

const DASHES = /[\u2010\u2012\u2013\u2014\u2015\u2212\uFF0D\u2500]/g;

/** Names mix U+2500, U+FF0D and U+2010 dashes; only used for duplicate checks. */
export function normalizeName(name: string): string {
  return name.replace(DASHES, "-").replace(/\s+/g, "");
}

// A template can only be applied to a site whose data yields exactly one answer.
const APPLICABLE: Record<TemplateKey, (site: Site) => boolean> = {
  year: () => true,
  prefecture: (site) => site.prefectures.length === 1,
  region: (site) => site.regions.length === 1,
  pickByType: () => true,
};

export function applicableSites(sites: readonly Site[], template: TemplateKey): Site[] {
  return sites.filter(APPLICABLE[template]);
}

function yearQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const others = all.filter((s) => s.year !== site.year).map((s) => s.year);
  const near = [...new Set(others)].filter((y) => Math.abs(y - site.year) <= 12);
  const far = [...new Set(others)];
  const distractors = drawFrom(rng, 3, near, far);

  return finish(rng, site, "year", `${site.nameJa}が世界遺産に登録された年として、正しいものはどれか。`, [
    { key: String(site.year), label: `${site.year}年` },
    ...distractors.map((y) => ({ key: String(y), label: `${y}年` })),
  ], `${site.nameJa}の登録は${site.year}年。`);
}

function prefectureQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const answer = site.prefectures[0]!;
  const region = site.regions[0]!;
  const others = all.filter((s) => s.id !== site.id);
  // A prefecture from the same region is plausible; one from far away is not.
  const sameRegion = others.filter((s) => s.regions.includes(region)).flatMap((s) => s.prefectures);
  const anywhere = others.flatMap((s) => s.prefectures);
  const distractors = drawFrom(
    rng,
    3,
    [...new Set(sameRegion)].filter((p) => p !== answer),
    [...new Set(anywhere)].filter((p) => p !== answer),
  );

  return finish(rng, site, "prefecture", `${site.nameJa}が所在する都道府県として、正しいものはどれか。`, [
    { key: answer, label: answer },
    ...distractors.map((p) => ({ key: p, label: p })),
  ], `${site.nameJa}は${answer}にある。`);
}

function regionQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const answer = site.regions[0]!;
  const others = [...new Set(all.flatMap((s) => s.regions))].filter((r) => r !== answer);
  const distractors = drawFrom(rng, 3, others);

  return finish(rng, site, "region", `${site.nameJa}が所在する地方として、正しいものはどれか。`, [
    { key: answer, label: answer },
    ...distractors.map((r) => ({ key: r, label: r })),
  ], `${site.nameJa}は${answer}地方の${site.prefectures.join("・")}にある。`);
}

/** Asks which of four sites has a given type, so the answer is a site, not an attribute. */
function pickByTypeQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const others = all.filter((s) => s.id !== site.id && s.type !== site.type);
  const similar = others.filter((s) => Math.abs(s.nameJa.length - site.nameJa.length) <= 6);
  const distractors = drawFrom(rng, 3, similar, others);

  const otherTypes = [...new Set(distractors.map((s) => TYPE_LABEL[s.type]))].join("・");

  return finish(rng, site, "pickByType", `次のうち、${TYPE_LABEL[site.type]}として正しいものはどれか。`, [
    { key: site.id, label: site.nameJa },
    ...distractors.map((s) => ({ key: s.id, label: s.nameJa })),
  ], `${site.nameJa}は${TYPE_LABEL[site.type]}。ほかの3件は${otherTypes}である。`);
}

const BUILDERS: Record<TemplateKey, (rng: () => number, site: Site, all: readonly Site[]) => Question> = {
  year: yearQuestion,
  prefecture: prefectureQuestion,
  region: regionQuestion,
  pickByType: pickByTypeQuestion,
};

function finish(
  rng: () => number,
  site: Site,
  template: TemplateKey,
  text: string,
  choices: Choice[],
  explanation: string,
): Question {
  return {
    id: `${site.id}:${template}`,
    template,
    siteId: site.id,
    text,
    choices: shuffle(rng, choices),
    answerKey: choices[0]!.key,
    explanation,
  };
}

export function generate(rng: () => number, site: Site, all: readonly Site[]): Question | null {
  const templates = (Object.keys(BUILDERS) as TemplateKey[]).filter((t) => APPLICABLE[t](site));
  if (templates.length === 0) return null;
  return generateWith(rng, site, all, pick(rng, templates));
}

export function generateWith(
  rng: () => number,
  site: Site,
  all: readonly Site[],
  template: TemplateKey,
): Question | null {
  if (!APPLICABLE[template](site)) return null;
  const question = BUILDERS[template](rng, site, all);
  return validate(question).length === 0 ? question : null;
}

/** Returns the reasons a question must not be used; empty means it is sound. */
export function validate(question: Question): string[] {
  const problems: string[] = [];

  if (question.choices.length !== 4) {
    problems.push(`expected 4 choices, got ${question.choices.length}`);
  }

  const keys = question.choices.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    problems.push("two choices share a key, so a distractor equals the answer");
  }

  const labels = question.choices.map((c) => normalizeName(c.label));
  if (new Set(labels).size !== labels.length) {
    problems.push("two choices read the same once names are normalised");
  }

  if (!keys.includes(question.answerKey)) {
    problems.push("the answer is not among the choices");
  }

  // A choice far longer than the rest gives the answer away, but only where the
  // choices are comparable attributes. Heritage names vary in length by nature.
  if (question.template !== "pickByType") {
    const lengths = question.choices.map((c) => c.label.length);
    const longest = Math.max(...lengths);
    const shortest = Math.min(...lengths);
    if (longest > 4 && longest > shortest * 3) {
      problems.push(`choice lengths are lopsided (${shortest}..${longest})`);
    }
  }

  return problems;
}
