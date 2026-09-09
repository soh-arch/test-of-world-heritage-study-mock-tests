import { describe, expect, it } from "vitest";
import sitesJson from "../src/data/sites.json";
import type { CategoryKey, Question, Site, TemplateKey } from "../src/types";
import configJson from "../src/data/exam-config.json";
import {
  applicableSites,
  categoriesOf,
  generateWith,
  normalizeName,
  relatedVariants,
  validate,
} from "../src/generator";
import {
  allocateCategories,
  allocateTemplates,
  buildExam,
  EXCLUDE_PENDING_SCOPE,
  grade,
  MANUAL,
  TEMPLATE_WEIGHTS,
} from "../src/exam";
import { createRng, shuffle } from "../src/rng";

const sites = sitesJson as Site[];
const TEMPLATES: TemplateKey[] = ["year", "place", "region", "related", "pickByType"];

const japan = sites.filter((s) => s.scope === "japan");
const world = sites.filter((s) => s.scope === "world");

function question(overrides: Partial<Question> & { choices: Question["choices"] }): Question {
  return {
    id: "q",
    template: "year",
    category: "japan",
    siteId: "jp-himeji-jo",
    text: "問題文",
    answerKey: "a",
    explanation: "",
    ...overrides,
  };
}

describe("site data", () => {
  it("carries both the Japanese and the world sites", () => {
    expect(japan).toHaveLength(27);
    expect(world).toHaveLength(84);
  });

  it("drops the site that appears in both datasets", () => {
    // Le Corbusier's work spans seven countries including Japan.
    expect(sites.filter((s) => s.nameJa.startsWith("ル・コルビュジエ"))).toHaveLength(1);
    expect(sites.find((s) => s.nameJa.startsWith("ル・コルビュジエ"))!.scope).toBe("japan");
  });

  it("gives every site at least one place and region", () => {
    expect(sites.every((s) => s.places.length > 0 && s.regions.length > 0)).toBe(true);
  });

  it("shortens the formal country names", () => {
    const places = new Set(world.flatMap((s) => s.places));
    expect(places.has("フランス")).toBe(true);
    expect(places.has("フランス共和国")).toBe(false);
    expect([...places].every((p) => p.length <= 10)).toBe(true);
  });

  it("counts a mixed site as both kinds of world heritage", () => {
    const mixed = world.filter((s) => s.type === "mixed");
    expect(mixed.length).toBeGreaterThan(0);
    expect(categoriesOf(mixed[0]!)).toEqual(["world_natural", "world_cultural"]);
  });
});

describe("generated questions", () => {
  it("are sound for every site and template that accepts them", () => {
    for (const template of TEMPLATES) {
      for (const site of applicableSites(sites, template)) {
        for (let seed = 0; seed < 10; seed++) {
          const result = generateWith(createRng(seed), site, sites, template);
          expect(result, `${site.id}/${template}/${seed}`).not.toBeNull();
          expect(validate(result!)).toEqual([]);
        }
      }
    }
  });

  it("never mixes prefectures with countries in one set of choices", () => {
    const prefectures = new Set(japan.flatMap((s) => s.places));
    const countries = new Set(world.flatMap((s) => s.places));

    for (const template of ["place", "region"] as TemplateKey[]) {
      for (const site of applicableSites(sites, template)) {
        for (let seed = 0; seed < 5; seed++) {
          const result = generateWith(createRng(seed), site, sites, template)!;
          const labels = result.choices.map((c) => c.label);
          const foreign = site.scope === "japan" ? countries : prefectures;
          const own = site.scope === "japan" ? prefectures : countries;
          if (template === "place") {
            expect(labels.every((l) => own.has(l)), `${site.id}/${seed}`).toBe(true);
            expect(labels.some((l) => foreign.has(l))).toBe(false);
          }
        }
      }
    }
  });

  it("keeps Japanese regions apart from the world regions", () => {
    const japanRegions = new Set(japan.flatMap((s) => s.regions));
    const worldRegions = new Set(world.flatMap((s) => s.regions));

    for (const site of applicableSites(sites, "region")) {
      const result = generateWith(createRng(3), site, sites, "region")!;
      const expected = site.scope === "japan" ? japanRegions : worldRegions;
      expect(result.choices.every((c) => expected.has(c.label)), site.id).toBe(true);
    }
  });

  it("excludes sites whose data would allow more than one right answer", () => {
    const multiPlace = sites.filter((s) => s.places.length > 1).map((s) => s.id);
    const accepted = applicableSites(sites, "place").map((s) => s.id);
    expect(multiPlace.length).toBeGreaterThan(0);
    expect(accepted.some((id) => multiPlace.includes(id))).toBe(false);
  });

  it("never offers a distractor that is also correct", () => {
    for (const template of TEMPLATES) {
      for (const site of applicableSites(sites, template)) {
        const result = generateWith(createRng(7), site, sites, template)!;
        const others = result.choices.filter((c) => c.key !== result.answerKey);

        if (template === "year") expect(others.every((c) => c.label !== `${site.year}年`)).toBe(true);
        if (template === "place") expect(others.every((c) => !site.places.includes(c.label))).toBe(true);
        if (template === "region") expect(others.every((c) => !site.regions.includes(c.label))).toBe(true);
        if (template === "pickByType") {
          const types = others.map((c) => sites.find((s) => s.id === c.key)!.type);
          expect(types.every((t) => t !== site.type)).toBe(true);
        }
      }
    }
  });
});

describe("the related-association template", () => {
  it("offers exactly one choice that shares the stated trait", () => {
    for (const site of applicableSites(sites, "related")) {
      for (let seed = 0; seed < 8; seed++) {
        const result = generateWith(createRng(seed), site, sites, "related")!;
        const chosen = result.choices.map((c) => sites.find((s) => s.id === c.key)!);
        const answer = chosen.find((s) => s.id === result.answerKey)!;

        const byYear = result.text.includes("年に登録された");
        const shares = (other: Site) =>
          byYear
            ? other.year === site.year
            : site.scope === "japan"
              ? other.regions.some((r) => site.regions.includes(r))
              : other.places.some((p) => site.places.includes(p));

        expect(shares(answer), `${site.id}/${seed} answer`).toBe(true);
        expect(chosen.filter(shares), `${site.id}/${seed}`).toHaveLength(1);
        expect(chosen.some((s) => s.id === site.id)).toBe(false);
      }
    }
  });

  it("only applies where a partner and three non-partners exist", () => {
    const accepted = applicableSites(sites, "related");
    expect(accepted.length).toBeGreaterThan(50);
    for (const site of accepted) {
      expect(relatedVariants(site, sites).length).toBeGreaterThan(0);
    }
  });
});

describe("template weights", () => {
  it("come from the researched question types, not from hand-picked numbers", () => {
    const config = configJson as { questionTypes: Array<{ key: string; ratio: number }> };
    const ratio = (key: string) => config.questionTypes.find((t) => t.key === key)!.ratio;

    expect(TEMPLATE_WEIGHTS.year).toBe(ratio("year"));
    expect(TEMPLATE_WEIGHTS.related).toBe(ratio("related_association"));
    expect(TEMPLATE_WEIGHTS.place + TEMPLATE_WEIGHTS.region).toBeCloseTo(ratio("attribute_country_place"));
  });

  it("no longer asks for the inscription year more than any other kind", () => {
    // The hand-picked weights had year at 30%, against an estimated 5% in the
    // real exam. It must not be the heaviest template any more.
    const heaviest = Object.entries(TEMPLATE_WEIGHTS).sort((a, b) => b[1] - a[1])[0]!;
    expect(heaviest[0]).not.toBe("year");
  });
});

describe("validate", () => {
  it("rejects a duplicated key", () => {
    const problems = validate(
      question({
        choices: [
          { key: "a", label: "1993年" },
          { key: "a", label: "1994年" },
          { key: "c", label: "1995年" },
          { key: "d", label: "1996年" },
        ],
      }),
    );
    expect(problems.join()).toMatch(/share a key/);
  });

  it("rejects choices that read alike once dashes are normalised", () => {
    const problems = validate(
      question({
        choices: [
          { key: "a", label: "平泉─浄土" },
          { key: "b", label: "平泉‐浄土" },
          { key: "c", label: "日光の社寺" },
          { key: "d", label: "厳島神社" },
        ],
      }),
    );
    expect(problems.join()).toMatch(/read the same/);
  });

  it("rejects a giveaway length gap", () => {
    const problems = validate(
      question({
        choices: [
          { key: "a", label: "平泉－仏国土（浄土）を表す建築・庭園及び考古学的遺跡群－" },
          { key: "b", label: "知床" },
          { key: "c", label: "屋久島" },
          { key: "d", label: "姫路城" },
        ],
      }),
    );
    expect(problems.join()).toMatch(/lopsided/);
  });

  it("accepts a well-formed question", () => {
    expect(
      validate(
        question({
          choices: [
            { key: "a", label: "1993年" },
            { key: "b", label: "1994年" },
            { key: "c", label: "1995年" },
            { key: "d", label: "1996年" },
          ],
        }),
      ),
    ).toEqual([]);
  });
});

describe("normalizeName", () => {
  it("folds the three dash characters the data mixes", () => {
    expect(normalizeName("富士山─信仰")).toBe(normalizeName("富士山‐信仰"));
    expect(normalizeName("平泉－浄土")).toBe(normalizeName("平泉‐浄土"));
  });
});

describe("exam assembly", () => {
  it("allocates every question", () => {
    for (const total of [4, 10, 20, 27, 60]) {
      expect(allocateTemplates(total).reduce((sum, [, n]) => sum + n, 0)).toBe(total);
      expect(allocateCategories(total).reduce((sum, [, n]) => sum + n, 0)).toBe(total);
    }
  });

  it("holds the official category split, renormalised over what it can answer", () => {
    // The published ratios are 25 / 30 / 10 / 30 / 5, which divide 20 questions
    // exactly, with every category now covered.
    expect(allocateCategories(20)).toEqual([
      ["basic", 5],
      ["japan", 6],
      ["world_natural", 2],
      ["world_cultural", 6],
      ["other", 1],
    ]);
  });

  it("actually produces that split", () => {
    for (let seed = 0; seed < 30; seed++) {
      const counts = new Map<CategoryKey, number>();
      for (const q of buildExam(sites, 20, seed).questions) {
        counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
      }
      expect([...counts.entries()].sort()).toEqual([
        ["basic", 5],
        ["japan", 6],
        ["other", 1],
        ["world_cultural", 6],
        ["world_natural", 2],
      ]);
    }
  });

  it("puts each generated question in a category its site can answer", () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const q of buildExam(sites, 20, seed).questions) {
        if (q.template === "manual") continue;
        const site = sites.find((s) => s.id === q.siteId)!;
        expect(categoriesOf(site), `${site.id}`).toContain(q.category);
      }
    }
  });

  it("uses each site at most once", () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = buildExam(sites, 20, seed).questions
        .map((q) => q.siteId)
        .filter((id): id is string => id !== undefined);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("produces the requested number of questions", () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(buildExam(sites, 20, seed).questions).toHaveLength(20);
    }
  });

  it("is reproducible from its seed and varies between seeds", () => {
    expect(buildExam(sites, 20, 12345)).toEqual(buildExam(sites, 20, 12345));
    expect(buildExam(sites, 20, 12345).questions.map((q) => q.id)).not.toEqual(
      buildExam(sites, 20, 54321).questions.map((q) => q.id),
    );
  });

  it("does not park the answer in one position", () => {
    const positions = new Map<number, number>();
    for (let seed = 0; seed < 100; seed++) {
      for (const q of buildExam(sites, 20, seed).questions) {
        const index = q.choices.findIndex((c) => c.key === q.answerKey);
        positions.set(index, (positions.get(index) ?? 0) + 1);
      }
    }
    const counts = [0, 1, 2, 3].map((i) => positions.get(i) ?? 0);
    const total = counts.reduce((a, b) => a + b, 0);
    for (const count of counts) {
      expect(count / total).toBeGreaterThan(0.2);
      expect(count / total).toBeLessThan(0.3);
    }
  });

  it("never repeats a question stem within one exam", () => {
    for (let seed = 0; seed < 50; seed++) {
      const texts = buildExam(sites, 20, seed).questions.map((q) => q.text);
      expect(new Set(texts).size, `seed ${seed}`).toBe(texts.length);
    }
  });

  it("asks about natural sites, not only the plentiful cultural ones", () => {
    const asked = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      for (const q of buildExam(sites, 20, seed).questions) {
        if (q.template === "pickByType") asked.add(sites.find((s) => s.id === q.siteId)!.type);
      }
    }
    expect(asked.has("cultural") && asked.has("natural")).toBe(true);
  });
});

describe("grading", () => {
  it("scores answers, breaks them down by category, and lists what went wrong", () => {
    const exam = buildExam(sites, 20, 999);
    const answers = new Map<string, string>();
    exam.questions.forEach((q, i) => {
      const wrong = q.choices.find((c) => c.key !== q.answerKey)!;
      answers.set(q.id, i < 15 ? q.answerKey : wrong.key);
    });

    const result = grade(exam, answers, 60);
    expect(result.correct).toBe(15);
    expect(result.score).toBe(75);
    expect(result.passed).toBe(true);
    expect(result.wrong).toHaveLength(5);
    expect(result.byCategory.reduce((sum, c) => sum + c.total, 0)).toBe(20);
    expect(result.byCategory.reduce((sum, c) => sum + c.correct, 0)).toBe(15);
  });

  it("treats an unanswered question as wrong", () => {
    const result = grade(buildExam(sites, 20, 1), new Map(), 60);
    expect(result.correct).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.wrong[0]!.chosen).toBeNull();
  });
});

describe("transboundary sites", () => {
  it("are never asked for a single place or region", () => {
    const shared = sites.filter((s) => s.transboundary);
    expect(shared.length).toBeGreaterThan(0);

    for (const template of ["place", "region"] as TemplateKey[]) {
      const accepted = applicableSites(sites, template).map((s) => s.id);
      for (const site of shared) {
        expect(accepted, `${site.id}/${template}`).not.toContain(site.id);
      }
    }
  });

  it("covers Le Corbusier, whose Japanese record lists only its Tokyo component", () => {
    const site = sites.find((s) => s.id === "jp-le-corbusier")!;
    expect(site.transboundary).toBe(true);
    expect(site.places).toEqual(["東京都"]);
  });
});

describe("related questions about where a site is", () => {
  const placeVariant = (site: Site) => relatedVariants(site, sites).includes("place");

  it("skips sites that are shared with other countries", () => {
    for (const site of sites.filter((s) => s.transboundary)) {
      expect(placeVariant(site), site.id).toBe(false);
    }
  });

  it("skips sites that span several regions or countries", () => {
    const spread = sites.filter((s) => (s.scope === "japan" ? s.regions : s.places).length > 1);
    expect(spread.length).toBeGreaterThan(0);
    for (const site of spread) {
      expect(placeVariant(site), site.id).toBe(false);
    }
  });

  it("names the site's single place, never a list of them", () => {
    for (const site of applicableSites(sites, "related")) {
      for (let seed = 0; seed < 5; seed++) {
        const text = generateWith(createRng(seed), site, sites, "related")!.text;
        if (text.includes("年に登録された")) continue;
        const trait = site.scope === "japan" ? site.regions : site.places;
        expect(trait, site.id).toHaveLength(1);
        expect(text, `${site.id}/${seed}`).toContain(`同じく${trait[0]}`);
      }
    }
  });

  it("never offers a shared site as the answer to a single-place question", () => {
    for (const site of applicableSites(sites, "related")) {
      for (let seed = 0; seed < 5; seed++) {
        const result = generateWith(createRng(seed), site, sites, "related")!;
        if (result.text.includes("年に登録された")) continue;
        const answer = sites.find((s) => s.id === result.answerKey)!;
        expect(answer.transboundary, `${site.id}/${seed}`).toBe(false);
      }
    }
  });
});

describe("the hand-written pool", () => {
  it("is the only source of basic-knowledge questions", () => {
    for (let seed = 0; seed < 30; seed++) {
      const basic = buildExam(sites, 20, seed).questions.filter((q) => q.category === "basic");
      expect(basic).toHaveLength(5);
      expect(basic.every((q) => q.template === "manual"), `seed ${seed}`).toBe(true);
    }
  });

  it("passes the same checks as a generated question", () => {
    for (const source of MANUAL) {
      for (let seed = 0; seed < 5; seed++) {
        const question = {
          id: source.id,
          template: "manual" as const,
          category: source.category,
          siteId: source.siteId,
          text: source.text,
          choices: shuffle(createRng(seed), source.choices),
          answerKey: source.answerKey,
          explanation: source.explanation,
        };
        expect(validate(question), source.id).toEqual([]);
      }
    }
  });

  it("cites a source for every question", () => {
    expect(MANUAL.length).toBeGreaterThan(40);
    expect(MANUAL.every((q) => q.source.length > 0)).toBe(true);
    expect(MANUAL.every((q) => q.verified)).toBe(true);
  });

  it("only points at sites that exist", () => {
    const ids = new Set(sites.map((s) => s.id));
    for (const q of MANUAL) {
      if (q.siteId) expect(ids, q.id).toContain(q.siteId);
    }
  });

  it("reaches the paper alongside generated questions", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      for (const q of buildExam(sites, 20, seed).questions) seen.add(q.template);
    }
    expect(seen.has("manual")).toBe(true);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the current-affairs category", () => {
  it("is filled, and only from hand-written questions", () => {
    for (let seed = 0; seed < 30; seed++) {
      const other = buildExam(sites, 20, seed).questions.filter((q) => q.category === "other");
      expect(other, `seed ${seed}`).toHaveLength(1);
      expect(other[0]!.template).toBe("manual");
    }
  });

  it("dates every question whose answer will go out of date", () => {
    for (const q of MANUAL.filter((m) => m.volatile)) {
      expect(q.text, q.id).toMatch(/\d{4}年\d{1,2}月時点/);
    }
  });
});

describe("the verification gate", () => {
  it("keeps unverified questions out of the app", () => {
    // The build withholds them, so nothing the exam can reach is unverified.
    expect(MANUAL.every((q) => q.verified && q.source.length > 0)).toBe(true);
  });
});

describe("verification levels", () => {
  it("records how every question in the app was confirmed", () => {
    expect(MANUAL.every((q) => q.verificationLevel === "primary" || q.verificationLevel === "secondary")).toBe(true);
  });

  it("still rests mostly on the organiser's own answer sheets", () => {
    const primary = MANUAL.filter((q) => q.verificationLevel === "primary").length;
    expect(primary / MANUAL.length).toBeGreaterThan(0.5);
  });
});

describe("sites awaiting confirmation of the syllabus", () => {
  it("marks the newest inscription, which no textbook edition covers yet", () => {
    const asuka = sites.find((s) => s.id === "jp-asuka-and-fujiwara")!;
    expect(asuka.pendingScope).toBe(true);
  });

  it("still asks about it, because omitting a site in scope costs more", () => {
    expect(EXCLUDE_PENDING_SCOPE).toBe(false);
    const asked = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      for (const q of buildExam(sites, 20, seed).questions) if (q.siteId) asked.add(q.siteId);
    }
    expect(asked).toContain("jp-asuka-and-fujiwara");
  });
});

describe("current affairs", () => {
  it("mostly asks things that will not go out of date", () => {
    const other = MANUAL.filter((q) => q.category === "other");
    const durable = other.filter((q) => !q.volatile);
    expect(other.length).toBeGreaterThan(20);
    expect(durable.length).toBeGreaterThan(other.length * 0.6);
  });

  it("gives no two questions the same stem", () => {
    const texts = MANUAL.map((q) => q.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});
