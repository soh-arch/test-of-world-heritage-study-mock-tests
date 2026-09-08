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

// The research data stores region_jp as one string, joining several regions with
// the same separator that "九州・沖縄" contains. Longest match first avoids
// splitting that region in two.
function parseRegions(composite) {
  const found = [];
  let rest = composite;
  while (rest.length > 0) {
    const match = [...REGIONS].sort((a, b) => b.length - a.length).find((r) => rest.startsWith(r));
    if (!match) {
      rest = rest.slice(1);
      continue;
    }
    found.push(match);
    rest = rest.slice(match.length).replace(/^・/, "");
  }
  return found;
}

const japan = JSON.parse(readFileSync(resolve(source, "japan-sites.json"), "utf8"));
const config = JSON.parse(readFileSync(resolve(source, "exam-config.json"), "utf8"));

const problems = [];

const sites = japan.map((site) => {
  const derived = [...new Set(site.prefectures.map((p) => PREFECTURE_REGION[p]))];
  if (derived.some((r) => r === undefined)) {
    problems.push(`${site.id}: unknown prefecture in ${JSON.stringify(site.prefectures)}`);
  }

  const declared = parseRegions(site.region_jp);
  const sameSet = derived.length === declared.length && derived.every((r) => declared.includes(r));
  if (!sameSet) {
    problems.push(
      `${site.id}: regions derived from prefectures ${JSON.stringify(derived)} ` +
        `disagree with region_jp ${JSON.stringify(declared)}`,
    );
  }

  return {
    id: site.id,
    nameJa: site.name_ja,
    nameAlt: site.name_ja_alt_bunkacho,
    prefectures: site.prefectures,
    regions: derived,
    year: site.registration_year,
    type: site.type,
    criteria: site.criteria,
  };
});

if (problems.length > 0) {
  for (const problem of problems) console.error(`ERROR ${problem}`);
  process.exit(1);
}

const examConfig = {
  grade: config.grade,
  sourceVerifiedAt: config.source_verified_at,
  totalQuestions: config.total_questions,
  timeLimitMinutes: config.time_limit_minutes,
  totalPoints: config.total_points,
  passScore: config.pass_score,
  categories: config.categories.map((c) => ({ key: c.key, label: c.label, ratio: c.ratio })),
};

mkdirSync(target, { recursive: true });
writeFileSync(resolve(target, "japan-sites.json"), JSON.stringify(sites, null, 2) + "\n");
writeFileSync(resolve(target, "exam-config.json"), JSON.stringify(examConfig, null, 2) + "\n");

console.log(`built ${sites.length} sites, ${new Set(sites.flatMap((s) => s.regions)).size} regions`);
