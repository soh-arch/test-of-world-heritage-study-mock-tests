import { describe, expect, it } from "vitest";
import sitesJson from "../src/data/japan-sites.json";
import type { Site, TemplateKey } from "../src/types";
import { applicableSites, generateWith, normalizeName, validate } from "../src/generator";
import { allocate, buildExam, grade } from "../src/exam";
import { createRng } from "../src/rng";

const sites = sitesJson as Site[];
const TEMPLATES: TemplateKey[] = ["year", "prefecture", "region", "pickByType"];

describe("site data", () => {
  it("carries every Japanese site", () => {
    expect(sites).toHaveLength(27);
  });

  it("has regions as a list, including the sites spanning several", () => {
    const meiji = sites.find((s) => s.id === "jp-meiji-industrial-revolution")!;
    expect(meiji.regions.length).toBeGreaterThan(1);
    expect(sites.every((s) => s.regions.length > 0)).toBe(true);
  });
});

describe("generated questions", () => {
  it("are sound for every site and template that accepts them", () => {
    for (const template of TEMPLATES) {
      for (const site of applicableSites(sites, template)) {
        for (let seed = 0; seed < 20; seed++) {
          const question = generateWith(createRng(seed), site, sites, template);
          expect(question, `${site.id}/${template}/${seed}`).not.toBeNull();
          expect(validate(question!)).toEqual([]);
        }
      }
    }
  });

  it("exclude sites whose data would allow more than one right answer", () => {
    const multiPrefecture = sites.filter((s) => s.prefectures.length > 1).map((s) => s.id);
    const accepted = applicableSites(sites, "prefecture").map((s) => s.id);
    expect(multiPrefecture.length).toBeGreaterThan(0);
    expect(accepted.some((id) => multiPrefecture.includes(id))).toBe(false);
  });

  it("never offer a distractor that is also correct", () => {
    for (const template of TEMPLATES) {
      for (const site of applicableSites(sites, template)) {
        const question = generateWith(createRng(7), site, sites, template)!;
        const answer = question.choices.find((c) => c.key === question.answerKey)!;

        if (template === "year") {
          const others = question.choices.filter((c) => c !== answer);
          expect(others.every((c) => c.label !== `${site.year}年`)).toBe(true);
        }
        if (template === "prefecture") {
          const others = question.choices.filter((c) => c !== answer);
          expect(others.every((c) => !site.prefectures.includes(c.label))).toBe(true);
        }
        if (template === "pickByType") {
          const distractors = question.choices.filter((c) => c.key !== site.id);
          const types = distractors.map((c) => sites.find((s) => s.id === c.key)!.type);
          expect(types.every((t) => t !== site.type)).toBe(true);
        }
      }
    }
  });
});

describe("validate", () => {
  const base = {
    id: "q",
    template: "year" as const,
    siteId: "jp-himeji-jo",
    text: "問題文",
    answerKey: "a",
    explanation: "",
  };

  it("rejects a duplicated key", () => {
    const problems = validate({
      ...base,
      choices: [
        { key: "a", label: "1993年" },
        { key: "a", label: "1994年" },
        { key: "c", label: "1995年" },
        { key: "d", label: "1996年" },
      ],
    });
    expect(problems.join()).toMatch(/share a key/);
  });

  it("rejects choices that read alike once dashes are normalised", () => {
    const problems = validate({
      ...base,
      choices: [
        { key: "a", label: "平泉─浄土" },
        { key: "b", label: "平泉‐浄土" },
        { key: "c", label: "日光の社寺" },
        { key: "d", label: "厳島神社" },
      ],
    });
    expect(problems.join()).toMatch(/read the same/);
  });

  it("rejects a giveaway length gap", () => {
    const problems = validate({
      ...base,
      choices: [
        { key: "a", label: "平泉－仏国土（浄土）を表す建築・庭園及び考古学的遺跡群－" },
        { key: "b", label: "知床" },
        { key: "c", label: "屋久島" },
        { key: "d", label: "姫路城" },
      ],
    });
    expect(problems.join()).toMatch(/lopsided/);
  });

  it("accepts a well-formed question", () => {
    expect(
      validate({
        ...base,
        choices: [
          { key: "a", label: "1993年" },
          { key: "b", label: "1994年" },
          { key: "c", label: "1995年" },
          { key: "d", label: "1996年" },
        ],
      }),
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
    for (const total of [4, 10, 20, 27]) {
      expect(allocate(total).reduce((sum, [, n]) => sum + n, 0)).toBe(total);
    }
  });

  it("uses each site at most once", () => {
    for (let seed = 0; seed < 50; seed++) {
      const exam = buildExam(sites, 20, seed);
      const ids = exam.questions.map((q) => q.siteId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("produces the requested number of questions", () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(buildExam(sites, 20, seed).questions).toHaveLength(20);
    }
  });

  it("is reproducible from its seed and varies between seeds", () => {
    const a = buildExam(sites, 20, 12345);
    const b = buildExam(sites, 20, 12345);
    const c = buildExam(sites, 20, 54321);
    expect(a).toEqual(b);
    expect(a.questions.map((q) => q.id)).not.toEqual(c.questions.map((q) => q.id));
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
});

describe("grading", () => {
  it("scores answers and lists what went wrong", () => {
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
  });

  it("treats an unanswered question as wrong", () => {
    const exam = buildExam(sites, 20, 1);
    const result = grade(exam, new Map(), 60);
    expect(result.correct).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.wrong[0]!.chosen).toBeNull();
  });
});

describe("type-pick balance", () => {
  it("asks about natural sites, not only the plentiful cultural ones", () => {
    const asked = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      for (const q of buildExam(sites, 20, seed).questions) {
        if (q.template === "pickByType") {
          asked.add(sites.find((s) => s.id === q.siteId)!.type);
        }
      }
    }
    expect([...asked].sort()).toEqual(["cultural", "natural"]);
  });
});
