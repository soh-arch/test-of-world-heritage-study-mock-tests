import type { CategoryKey, Choice, HeritageType, Question, Site, TemplateKey } from "./types";
import { drawFrom, pick, shuffle } from "./rng";

const TYPE_LABEL: Record<HeritageType, string> = {
  cultural: "文化遺産",
  natural: "自然遺産",
  mixed: "複合遺産",
};

const PLACE_LABEL = { japan: "都道府県", world: "国" } as const;
const REGION_QUESTION = { japan: "所在する地方", world: "属する地域" } as const;

const DASHES = /[‐‒–—―−－─]/g;

/** Names mix U+2500, U+FF0D and U+2010 dashes; only used for duplicate checks. */
export function normalizeName(name: string): string {
  return name.replace(DASHES, "-").replace(/\s+/g, "");
}

/**
 * Which exam categories a site can answer for. A mixed site counts as both
 * kinds of world heritage, because it is one.
 */
export function categoriesOf(site: Site): CategoryKey[] {
  if (site.scope === "japan") return ["japan"];
  if (site.type === "mixed") return ["world_natural", "world_cultural"];
  return site.type === "natural" ? ["world_natural"] : ["world_cultural"];
}

// A template only applies where the site's data yields exactly one answer.
const APPLICABLE: Record<TemplateKey, (site: Site, all: readonly Site[]) => boolean> = {
  year: () => true,
  place: (site) => site.places.length === 1 && !site.transboundary,
  region: (site) => site.regions.length === 1 && !site.transboundary,
  related: (site, all) => relatedVariants(site, all).length > 0,
  pickByType: () => true,
};

export function applicableSites(sites: readonly Site[], template: TemplateKey): Site[] {
  return sites.filter((site) => APPLICABLE[template](site, sites));
}

function yearQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const years = [...new Set(all.map((s) => s.year))].filter((y) => y !== site.year);
  const near = years.filter((y) => Math.abs(y - site.year) <= 12);
  const distractors = drawFrom(rng, 3, near, years);

  return finish(
    rng,
    site,
    "year",
    `${site.nameJa}が世界遺産に登録された年として、正しいものはどれか。`,
    [
      { key: String(site.year), label: `${site.year}年` },
      ...distractors.map((y) => ({ key: String(y), label: `${y}年` })),
    ],
    `${site.nameJa}の登録は${site.year}年。`,
  );
}

/** Prefectures and countries are different vocabularies; never mix them. */
function placeQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const answer = site.places[0]!;
  const region = site.regions[0];
  const sameScope = all.filter((s) => s.id !== site.id && s.scope === site.scope);
  const nearby = sameScope.filter((s) => region !== undefined && s.regions.includes(region));
  const distractors = drawFrom(
    rng,
    3,
    [...new Set(nearby.flatMap((s) => s.places))].filter((p) => !site.places.includes(p)),
    [...new Set(sameScope.flatMap((s) => s.places))].filter((p) => !site.places.includes(p)),
  );

  return finish(
    rng,
    site,
    "place",
    `${site.nameJa}が所在する${PLACE_LABEL[site.scope]}として、正しいものはどれか。`,
    [{ key: answer, label: answer }, ...distractors.map((p) => ({ key: p, label: p }))],
    `${site.nameJa}は${answer}にある。`,
  );
}

function regionQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const answer = site.regions[0]!;
  const others = [...new Set(all.filter((s) => s.scope === site.scope).flatMap((s) => s.regions))];
  const distractors = drawFrom(rng, 3, others.filter((r) => r !== answer));
  const suffix = site.scope === "japan" ? "地方" : "";

  return finish(
    rng,
    site,
    "region",
    `${site.nameJa}が${REGION_QUESTION[site.scope]}として、正しいものはどれか。`,
    [{ key: answer, label: answer }, ...distractors.map((r) => ({ key: r, label: r }))],
    `${site.nameJa}は${answer}${suffix}の${site.places.join("・")}にある。`,
  );
}

/** Asks which of four sites has a given type, so the answer is a site. */
function pickByTypeQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const others = all.filter((s) => s.id !== site.id && s.type !== site.type);
  const sameScope = others.filter((s) => s.scope === site.scope);
  const similar = sameScope.filter((s) => Math.abs(s.nameJa.length - site.nameJa.length) <= 8);
  const distractors = drawFrom(rng, 3, similar, sameScope, others);
  const otherTypes = [...new Set(distractors.map((s) => TYPE_LABEL[s.type]))].join("・");

  return finish(
    rng,
    site,
    "pickByType",
    `次のうち、${TYPE_LABEL[site.type]}として正しいものはどれか。`,
    [{ key: site.id, label: site.nameJa }, ...distractors.map((s) => ({ key: s.id, label: s.nameJa }))],
    `${site.nameJa}は${TYPE_LABEL[site.type]}。ほかの3件は${otherTypes}である。`,
  );
}

/**
 * Approximates the exam's "relate one site to another" type. The official
 * examples relate sites thematically (Rome to ancient Nara); this data only
 * supports relating them by inscription year or by where they are, so it is a
 * stand-in until hand-written questions exist. See
 * docs/research/facts/05-question-type-gap.md.
 */
type RelatedVariant = "year" | "place";

function traitOf(site: Site): string[] {
  return site.scope === "japan" ? site.regions : site.places;
}

/**
 * Saying a site is "in" one place only holds where it has a single one and is
 * not shared with other countries. Le Corbusier's work is recorded under Tokyo
 * but spans seven countries, and the Meiji industrial sites span five regions.
 */
function locatable(site: Site): boolean {
  return !site.transboundary && traitOf(site).length === 1;
}

function relatedMatches(site: Site, other: Site, variant: RelatedVariant): boolean {
  if (other.id === site.id) return false;
  if (variant === "year") return other.year === site.year;
  return traitOf(site).some((value) => traitOf(other).includes(value));
}

/**
 * Candidates for one variant. A shared site is dropped from the place variant
 * altogether rather than merely counted as no match: Rome is shared with the
 * Holy See, so treating it as "not in Italy" would let it become a distractor
 * to an Italy question it actually answers.
 */
function relatedPool(site: Site, all: readonly Site[], variant: RelatedVariant): Site[] {
  if (variant === "year") return [...all];
  return all.filter((s) => s.scope === site.scope && !s.transboundary);
}

export function relatedVariants(site: Site, all: readonly Site[]): RelatedVariant[] {
  return (["year", "place"] as RelatedVariant[]).filter((variant) => {
    if (variant === "place" && !locatable(site)) return false;
    const scoped = relatedPool(site, all, variant);
    const matching = scoped.filter((s) => relatedMatches(site, s, variant));
    const rest = scoped.filter((s) => s.id !== site.id && !relatedMatches(site, s, variant));
    return matching.length >= 1 && rest.length >= 3;
  });
}

function relatedQuestion(rng: () => number, site: Site, all: readonly Site[]): Question {
  const variant = pick(rng, relatedVariants(site, all));
  const scoped = relatedPool(site, all, variant);
  const answer = pick(rng, scoped.filter((s) => relatedMatches(site, s, variant)));
  const distractors = drawFrom(
    rng,
    3,
    scoped.filter((s) => s.id !== site.id && s.id !== answer.id && !relatedMatches(site, s, variant)),
  );

  const shared =
    variant === "year"
      ? `${site.year}年に登録された`
      : `${traitOf(site)[0]}${site.scope === "japan" ? "地方" : ""}にある`;

  return finish(
    rng,
    site,
    "related",
    `${site.nameJa}と同じく${shared}世界遺産として、正しいものはどれか。`,
    [
      { key: answer.id, label: answer.nameJa },
      ...distractors.map((s) => ({ key: s.id, label: s.nameJa })),
    ],
    `${answer.nameJa}も${shared}。`,
  );
}

const BUILDERS: Record<TemplateKey, (rng: () => number, site: Site, all: readonly Site[]) => Question> = {
  year: yearQuestion,
  place: placeQuestion,
  region: regionQuestion,
  related: relatedQuestion,
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
    category: categoriesOf(site)[0]!,
    siteId: site.id,
    text,
    choices: shuffle(rng, choices),
    answerKey: choices[0]!.key,
    explanation,
  };
}

export function generate(rng: () => number, site: Site, all: readonly Site[]): Question | null {
  const templates = (Object.keys(BUILDERS) as TemplateKey[]).filter((t) => APPLICABLE[t](site, all));
  if (templates.length === 0) return null;
  return generateWith(rng, site, all, pick(rng, templates));
}

export function generateWith(
  rng: () => number,
  site: Site,
  all: readonly Site[],
  template: TemplateKey,
): Question | null {
  if (!APPLICABLE[template](site, all)) return null;
  const question = BUILDERS[template](rng, site, all);
  return validate(question).length === 0 ? question : null;
}

const LENGTH_CHECKED = new Set<string>(["year"]);

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

  // A choice far longer than the rest gives the answer away, but only where every
  // choice follows the same fixed form. Proper nouns - heritage names, countries,
  // regions - vary in length by nature, and a long one is not a tell.
  if (LENGTH_CHECKED.has(question.template)) {
    const lengths = question.choices.map((c) => c.label.length);
    const longest = Math.max(...lengths);
    const shortest = Math.min(...lengths);
    if (longest > 4 && longest > shortest * 3) {
      problems.push(`choice lengths are lopsided (${shortest}..${longest})`);
    }
  }

  return problems;
}
