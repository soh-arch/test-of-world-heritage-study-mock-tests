// Turns the research datasets under docs/research/facts/data into the shape the
// app consumes, applying the fixes recorded in facts/04-dataset-validation.md.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "docs/research/facts/data");
const target = resolve(root, "src/data");

const REGIONS = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州・沖縄"];

const PREFECTURE_REGION = {
  北海道: "北海道",
  青森県: "東北", 岩手県: "東北", 宮城県: "東北", 秋田県: "東北", 山形県: "東北", 福島県: "東北",
  茨城県: "関東", 栃木県: "関東", 群馬県: "関東", 埼玉県: "関東", 千葉県: "関東", 東京都: "関東", 神奈川県: "関東",
  新潟県: "中部", 富山県: "中部", 石川県: "中部", 福井県: "中部", 山梨県: "中部", 長野県: "中部",
  岐阜県: "中部", 静岡県: "中部", 愛知県: "中部",
  三重県: "近畿", 滋賀県: "近畿", 京都府: "近畿", 大阪府: "近畿", 兵庫県: "近畿", 奈良県: "近畿", 和歌山県: "近畿",
  鳥取県: "中国", 島根県: "中国", 岡山県: "中国", 広島県: "中国", 山口県: "中国",
  徳島県: "四国", 香川県: "四国", 愛媛県: "四国", 高知県: "四国",
  福岡県: "九州・沖縄", 佐賀県: "九州・沖縄", 長崎県: "九州・沖縄", 熊本県: "九州・沖縄",
  大分県: "九州・沖縄", 宮崎県: "九州・沖縄", 鹿児島県: "九州・沖縄", 沖縄県: "九州・沖縄",
};

// The research data carries formal state names. Choices read better, and match
// how the exam phrases them, with the everyday short form.
const COUNTRY_SHORT = {
  アメリカ合衆国: "アメリカ",
  アルゼンチン共和国: "アルゼンチン",
  イタリア共和国: "イタリア",
  イラク共和国: "イラク",
  "イラン・イスラム共和国": "イラン",
  インド: "インド",
  ウズベキスタン共和国: "ウズベキスタン",
  エクアドル共和国: "エクアドル",
  "エジプト・アラブ共和国": "エジプト",
  エチオピア連邦民主共和国: "エチオピア",
  "エルサレム（ヨルダン・ハシェミット王国による申請遺産）": "エルサレム",
  オーストラリア連邦: "オーストラリア",
  オーストリア共和国: "オーストリア",
  カザフスタン共和国: "カザフスタン",
  カンボジア王国: "カンボジア",
  キルギス共和国: "キルギス",
  ギリシャ共和国: "ギリシャ",
  コンゴ民主共和国: "コンゴ民主共和国",
  ザンビア共和国: "ザンビア",
  ジンバブエ共和国: "ジンバブエ",
  スイス連邦: "スイス",
  スペイン: "スペイン",
  タイ王国: "タイ",
  タンザニア連合共和国: "タンザニア",
  チリ共和国: "チリ",
  トルコ共和国: "トルコ",
  ドイツ連邦共和国: "ドイツ",
  ニュージーランド: "ニュージーランド",
  ネパール: "ネパール",
  フィリピン共和国: "フィリピン",
  フランス共和国: "フランス",
  ブラジル連邦共和国: "ブラジル",
  ベトナム社会主義共和国: "ベトナム",
  ベルギー王国: "ベルギー",
  ペルー共和国: "ペルー",
  ホンジュラス共和国: "ホンジュラス",
  ボリビア多民族国: "ボリビア",
  ポーランド共和国: "ポーランド",
  マリ共和国: "マリ",
  マレーシア: "マレーシア",
  メキシコ合衆国: "メキシコ",
  ロシア連邦: "ロシア",
  "ヴァティカン市国": "ヴァティカン市国",
  中華人民共和国: "中国",
  南アフリカ共和国: "南アフリカ",
  大韓民国: "韓国",
  日本国: "日本",
  "英国（グレートブリテン及び北アイルランド連合王国）": "イギリス",
};

/**
 * Sites inscribed after the current textbook edition. The organiser's own
 * notice about Sado shows the pattern: a site inscribed in July 2024 only
 * entered the syllabus with the revised edition, at the 60th sitting in mid
 * 2025. Asuka and Fujiwara was inscribed in July 2026 and no 6th edition has
 * been announced, so it is probably not examinable yet.
 *
 * They are still included: if a site turns out to be out of scope, the cost is
 * having learnt something extra, whereas dropping one that is in scope leaves a
 * gap. The flag lets that be reversed once the syllabus is confirmed.
 */
const PENDING_SCOPE = new Set(["jp-asuka-and-fujiwara"]);

// The region_jp string joins several regions with the same separator that
// "九州・沖縄" contains, so match the longest region name first.
function parseRegions(composite) {
  const ordered = [...REGIONS].sort((a, b) => b.length - a.length);
  const found = [];
  let rest = composite;
  while (rest.length > 0) {
    const match = ordered.find((r) => rest.startsWith(r));
    if (!match) {
      rest = rest.slice(1);
      continue;
    }
    found.push(match);
    rest = rest.slice(match.length).replace(/^・/, "");
  }
  return found;
}

function normalizeEnglish(name) {
  return [...(name ?? "")].filter((c) => /[a-z0-9]/i.test(c)).join("").toLowerCase();
}

const manualRaw = JSON.parse(readFileSync(resolve(root, "data/manual-questions.json"), "utf8"));
const japanRaw = JSON.parse(readFileSync(resolve(source, "japan-sites.json"), "utf8"));
const worldRaw = JSON.parse(readFileSync(resolve(source, "world-sites-candidates.json"), "utf8"));
const config = JSON.parse(readFileSync(resolve(source, "exam-config.json"), "utf8"));

const problems = [];

const japan = japanRaw.map((site) => {
  const derived = [...new Set(site.prefectures.map((p) => PREFECTURE_REGION[p]))];
  if (derived.some((r) => r === undefined)) {
    problems.push(`${site.id}: unknown prefecture in ${JSON.stringify(site.prefectures)}`);
  }

  const declared = parseRegions(site.region_jp);
  const agrees = derived.length === declared.length && derived.every((r) => declared.includes(r));
  if (!agrees) {
    problems.push(
      `${site.id}: regions derived from prefectures ${JSON.stringify(derived)} ` +
        `disagree with region_jp ${JSON.stringify(declared)}`,
    );
  }

  return {
    id: site.id,
    scope: "japan",
    nameJa: site.name_ja,
    places: site.prefectures,
    regions: derived,
    year: site.registration_year,
    type: site.type,
    criteria: site.criteria,
    // A site shared with other countries is not "located in" one Japanese
    // region, even though the data only lists its Japanese component.
    transboundary: site.is_transboundary,
    ...(PENDING_SCOPE.has(site.id) ? { pendingScope: true } : {}),
  };
});

// Le Corbusier's work spans seven countries including Japan, so it appears in
// both datasets. Keep the Japanese record: grade 3 covers every Japanese site.
const japaneseEnglishNames = new Set(japanRaw.map((s) => normalizeEnglish(s.name_en)));
const duplicates = [];

const world = worldRaw
  .filter((site) => !site.delisted)
  .filter((site) => {
    const duplicate = japaneseEnglishNames.has(normalizeEnglish(site.name_en));
    if (duplicate) duplicates.push(site.id);
    return !duplicate;
  })
  .map((site) => {
    const places = site.country_ja.map((country) => {
      const short = COUNTRY_SHORT[country];
      if (!short) problems.push(`${site.id}: no short name for ${country}`);
      return short ?? country;
    });

    return {
      id: site.id,
      scope: "world",
      nameJa: site.name_ja,
      places,
      regions: [site.unesco_region],
      year: site.registration_year,
      type: site.type,
      criteria: site.criteria,
      transboundary: site.is_transboundary,
      // Whether the site is really in the grade 3 textbook is inferred for most
      // of these; see docs/research/open-questions.md, D1.
      estimated: site.in_textbook_confidence !== "確定",
    };
  });

const sites = [...japan, ...world];

const ids = new Set();
for (const site of sites) {
  if (ids.has(site.id)) problems.push(`duplicate id ${site.id}`);
  ids.add(site.id);
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`ERROR ${problem}`);
  process.exit(1);
}

// Hand-written questions carry the burden of being right on their own, so they
// are checked harder than generated ones: a source is required, and only the
// questions marked verified reach the app.
const CATEGORIES = new Set(["basic", "japan", "world_natural", "world_cultural", "other"]);
const siteIds = new Set(sites.map((s) => s.id));
const manualIds = new Set();

for (const question of manualRaw) {
  const where = `manual ${question.id}`;
  if (manualIds.has(question.id)) problems.push(`${where}: duplicate id`);
  manualIds.add(question.id);

  if (!CATEGORIES.has(question.category)) problems.push(`${where}: unknown category ${question.category}`);
  if (question.siteId && !siteIds.has(question.siteId)) problems.push(`${where}: unknown site ${question.siteId}`);
  if (question.verified && !question.source) problems.push(`${where}: verified without a source`);
  if (question.verified && !["primary", "secondary"].includes(question.verificationLevel)) {
    problems.push(`${where}: verified without a verification level`);
  }
  if (!question.topic) problems.push(`${where}: no topic`);
  if (!question.text?.endsWith("。")) problems.push(`${where}: question does not end in a full stop`);

  const keys = question.choices?.map((c) => c.key) ?? [];
  if (keys.length !== 4) problems.push(`${where}: ${keys.length} choices`);
  if (new Set(keys).size !== keys.length) problems.push(`${where}: duplicate choice key`);
  if (!keys.includes(question.answerKey)) problems.push(`${where}: answer is not among the choices`);

  const labels = question.choices?.map((c) => c.label) ?? [];
  if (new Set(labels).size !== labels.length) problems.push(`${where}: two choices read the same`);
  if (!question.explanation) problems.push(`${where}: no explanation`);
}

const manual = manualRaw.filter((q) => q.verified);

const examConfig = {
  grade: config.grade,
  sourceVerifiedAt: config.source_verified_at,
  totalQuestions: config.total_questions,
  timeLimitMinutes: config.time_limit_minutes,
  passScore: config.pass_score,
  categories: config.categories.map((c) => ({ key: c.key, label: c.label, ratio: c.ratio })),
  // Estimated from the five official sample questions, so weak evidence. The
  // exam allocates templates from these rather than from hard-coded weights.
  questionTypes: config.question_types.map((t) => ({
    key: t.key,
    label: t.label,
    ratio: t.estimated_ratio,
  })),
};

mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, "sites.json"), JSON.stringify(sites, null, 2) + "\n");
writeFileSync(resolve(target, "manual-questions.json"), JSON.stringify(manual, null, 2) + "\n");
writeFileSync(resolve(target, "exam-config.json"), JSON.stringify(examConfig, null, 2) + "\n");

const unverified = manualRaw.length - manual.length;
const primary = manual.filter((q) => q.verificationLevel === "primary").length;
console.log(
  `built ${sites.length} sites (japan ${japan.length}, world ${world.length}); ` +
    `dropped duplicates: ${duplicates.join(", ") || "none"}`,
);
const pending = sites.filter((s) => s.pendingScope).map((s) => s.id);
if (pending.length > 0) {
  console.log(`sites awaiting confirmation of the syllabus: ${pending.join(", ")}`);
}
console.log(
  `built ${manual.length} hand-written questions ` +
    `(${primary} confirmed against a primary source, ${manual.length - primary} against secondary ones)` +
    (unverified > 0 ? `; withheld ${unverified}` : ""),
);
