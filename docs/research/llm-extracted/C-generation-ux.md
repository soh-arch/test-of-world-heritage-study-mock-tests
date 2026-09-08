> **未検証**: このファイルはLLM調査エージェントの出力であり、一次情報での裏取りが済んでいない。
> 取り扱いは `README.md` を参照。実装へ取り込む前に `../open-questions.md` の該当項目を確認すること。

---

# 調査C: 出題生成アルゴリズム／学習UX設計調査（世界遺産検定3級 模試ツール）

## 要約
- 4択問題は「構造化データ→テンプレート文面」で最低15種類生成でき、うち10種は3級レベルでそのまま使える（登録年/所在国/種別/登録基準/危機遺産/複合遺産識別など）。
- 品質の要はディストラクタ生成で、原則は「同じ地域・同じ時代・同じカテゴリから、値だけ確実に異なるものを実データから引く」（ランダム捏造ではなく実在データ流用）。
- 自動生成の最大の落とし穴は「正解が複数成立する」「越境遺産・複数国遺産で単一正解が破綻する」で、生成後バリデーション（重複チェック・整合性チェック）を必須工程にする。
- テンプレートで作れない「文化的背景・時事・写真判定」は手書き問題プールで補完するハイブリッド構成が現実解。JSONスキーマ案を本文に提示。
- 模試の出題選抜は層化サンプリング（分野別配分＋難易度配分）＋seeded PRNG（Mulberry32等）で「同じ模試の再現」と「毎回の新規性」を両立できる。
- 学習効果面では、静的サイトでもLeitner箱式の簡易SRS（本格SM-2/FSRSは過剰）で十分機能し、localStorageで弱点分野の可視化・間違いノート・スコア推移を実装できる。
- 本番モード（時間制限・解説非表示・一括採点）と練習モード（即時フィードバック）を明確に分離するのが検定学習アプリの定石。
- 指定の配色（藍/青磁/黄土/弁柄 on ウォームアイボリー）はテキスト用途でWCAG AA（4.5:1）をほぼ全ペアでクリアするが、AAA基準（7:1）には届かないため、正誤表現は色だけに依存せずアイコン併用が必須。
- MVPは「固定分野配分の層化抽選＋テンプレート生成＋練習/本番モード＋簡易誤答ノート」に絞り、SRSスケジューリングや写真問題、詳細分析は第2版以降に回すのが妥当。

---

## 1. 問題自動生成

### 1.1 データモデル（前提）
以下のフィールドを持つ遺産マスタ（例: `sites.json`）を前提にテンプレートを設計する。

```
Site {
  id: string                 // "jp-himeji-castle"
  name_ja: string            // "姫路城"
  name_en: string
  country: string[]          // 越境遺産は複数国 ["IT","VA"] 等
  unesco_region: "アフリカ"|"アラブ諸国"|"アジア・太平洋"|"ヨーロッパ・北米"|"ラテンアメリカ・カリブ"
  registration_year: number  // 1993
  type: "文化遺産"|"自然遺産"|"複合遺産"
  criteria: string[]         // ["ⅰ","ⅳ"] などi〜x（ローマ数字表記に注意）
  in_danger: boolean
  is_transboundary: boolean  // 複数国またがりか
  city_or_area: string
  description_short: string  // 1文要約（説明文当てテンプレート用）
  keywords: string[]
}
```

### 1.2 テンプレート案（15種、うち★は3級レベルで即採用）

| # | テンプレート文面例 | 必要フィールド | 想定難易度 | 生成可能問題数の目安 |
|---|---|---|---|---|
| ★1 | 「〇〇（遺産名）が登録された年として正しいものはどれか」 | name, registration_year | 易〜中 | サイト数と同数（全遺産×1、日本25件だけでも25問） |
| ★2 | 「〇〇が所在する国として正しいものはどれか」 | name, country | 易 | 単一国遺産数（越境遺産は除外 or 専用テンプレへ） |
| ★3 | 「〇〇の種別として正しいものはどれか（文化遺産/自然遺産/複合遺産）」 | name, type | 易 | 全件 |
| ★4 | 「〇〇が満たす登録基準に**含まれる**ものはどれか」 | name, criteria | 中〜難 | criteriaを持つ全件（3級では基準名の丸暗記は少ないため出題比率は抑えめ） |
| ★5 | 「次のうち複合遺産はどれか」 | type=複合遺産のリスト | 中 | 複合遺産件数（世界で40件弱）× 出題ごとに他3択を文化/自然から選出 → 実質は"問題形式"であり複合遺産数分は作れないため、他タイプ3件との組合せで数百通り生成可 |
| ★6 | 「次のうち危機遺産リストに登録されているものはどれか」 | in_danger | 中 | 危機遺産数（世界で50件強）と非危機遺産の組合せ数 |
| 7 | 「〇〇の正式名称として正しいものはどれか」 | name_ja, name_en, 表記ゆれ候補 | 中 | 表記ゆれが用意できる件数のみ（自動生成しづらく手書き併用推奨） |
| ★8 | 「次のうち日本国内にある世界遺産はどれか」 | country="JP" | 易 | 日本25件×他国からの3択組合せ多数 |
| 9 | 「〇〇の登録年に最も近いのはどれか」（年代の近さで正解を選ぶ形式） | registration_year | 難 | 全件（4択の年がいずれも実在遺産の年） |
| ★10 | 「次のうち登録基準(vii)（自然美・自然現象）を満たす遺産はどれか」 | criteria | 中 | 各基準ごとの該当件数分 |
| 11 | 「〇〇が属する地域（大陸区分）として正しいものはどれか」 | unesco_region | 易〜中 | 全件 |
| 12 | 「〇〇と同じ国にある世界遺産はどれか」 | country, 同国内の他遺産 | 中 | 同一国内に複数遺産を持つ国の件数分 |
| ★13 | 「次の説明文が示す遺産はどれか」（説明文→名称当て、逆引き） | description_short, name | 中〜難 | 説明文が用意されている全件 |
| 14 | 「〇〇の面積として最も近いものはどれか」 | area_ha（データがあれば） | 難（上級向け、3級では出題頻度低） | area保持件数分 |
| 15 | 「次のうち世界遺産条約採択（1972年）**より前**/**後**に登録されたものはどれか」（基礎知識問題） | registration_year, 条約採択年=1972固定 | 易 | 全件（正誤の境界年を使った定番パターン） |

★=3級の出題傾向（「基礎知識」「日本の遺産」「世界の自然遺産」「世界の文化遺産」の4分野、日本国内比率が高い）に直接対応。3級は60問・100点満点・配点は問題により異なる構成である（出典：オンスクJP・kentei-lab調査）ため、テンプレート1・2・3・8を主軸に、5・6・10・13で厚みを出す設計が妥当。

### 1.3 ディストラクタ生成戦略

原則: **「もっともらしいが明確に誤り」＝実データベースから同じ属性グループの別レコードを引く**。ゼロから捏造しない。既存研究（Automatic Distractor Generation, 系統的レビュー各種）でも、シソーラス／同一文脈内の候補／意味的類似度でのランキングが主流であり、本プロジェクトでは以下のルールで代替する。

| フィールド | 戦略 | 実装例 |
|---|---|---|
| 登録年 | ① 同じ遺産プール内で**近い年**（±2〜15年）の別遺産の実年号を使う ②候補が枯渇したら正解±N年（N=3,5,8,15からランダム、実在しない/離れすぎない値に丸め） | `pickNearbyYears(correctYear, allYears, k=3, minGap=2)` |
| 所在国 | 正解と**同じUNESCO地域**の別の国を優先（例: 日本の遺産→韓国/中国/インドなど同アジア太平洋地域）。地域内候補が3未満なら地域を広げる | `pickCountriesSameRegion(correctCountry, region, k=3)` |
| 種別 | 正解以外の2種別＋同種別だが別遺産、の混成（"文化遺産/自然遺産/複合遺産"の3値なので単純に他2値を必ず含める） | 固定候補プール |
| 登録基準 | 正解が持たない基準番号のうち、**同じ大分類（文化基準i〜vi／自然基準vii〜x）**から優先的に選ぶ（全く異分野の基準を混ぜると自明になりすぎるため） | `pickCriteriaSameCategory` |
| 危機遺産 | 正解グループの逆（危機遺産→非危機遺産、非危機遺産→危機遺産）だが、同地域・同時代のものを優先し地理的手がかりで消去法にならないようにする | — |
| 名称表記 | 類似名（同じ国・近い地域の遺産名、"，，城"など同カテゴリ語尾）から選ぶ。自動化しづらいため手書きプールで補強 | 手動タグ`similar_name_pool` |
| 説明文当て | 同じ分野・同種別の他3遺産の説明文をダミー選択肢に使う（文体・文長を揃える） | — |

**難易度調整との連動**: ディストラクタの「正解との近さ」で難易度を制御できる。年代なら差分が小さいほど難しく、国なら同地域か別地域かで難易度が変わる。これを`difficulty`フィールドに反映し、テンプレート生成時に難易度別のディストラクタ選択関数を切り替える。

### 1.4 自動生成の失敗パターンと対策バリデーション

| 失敗パターン | 具体例 | バリデーションルール |
|---|---|---|
| 正解が複数成立 | 越境遺産（フランス・スペイン共同の遺産等）で「所在国」を単一選択問題にすると誤り | `is_transboundary=true` の遺産はテンプレート2（単一国選択）の生成対象から除外、または「次のうち所在国に**含まれる**ものはどれか」の複数正解許容形式に変更 |
| ディストラクタが実は正解と同値 | 登録年が同じ2遺産をディストラクタに使い「Xの登録年」が2択とも正解になる | 生成後に `distractorValue !== correctValue` を厳密比較（数値は完全一致、文字列は正規化後比較） |
| 選択肢から答えが自明 | 正解だけ実在の地名で他3つが不自然な文字列 | ディストラクタは必ず実データ由来にする（1.3参照）。生成後、選択肢の文字数・文体のばらつきを閾値チェック（例: 文字数の標準偏差が大きすぎる場合は再生成） |
| 事実誤り（データ側起因） | 元データの登録年やcriteriaが古い／誤記 | データ更新時にスキーマバリデーション＋既知の公式資料との突合を人手レビュー（自動生成前提のデータ品質担保。これは調査A/B領域と連携） |
| 同一模試内の重複 | 同じ遺産から複数テンプレートで問題が生成され、片方の問題文がもう片方の答えのヒントになる | 模試生成時に「1遺産につき1問まで」or「同一遺産からの複数採用は分野をまたぐ場合のみ許可」ルールを選抜アルゴリズム側に実装（§2） |
| 選択肢の並び手がかり | 正解が常に一番説明的に詳しい／短い | シャッフル前に選択肢文字列を軽く正規化し長さを揃える簡易ルール（極端な差がある場合は再選定） |
| 表記ゆれによる誤判定 | ユーザーの表記と模範解答表記の揺れ（選択式なので影響小だが、正解値の内部比較で発生しうる） | 内部比較は必ず`id`ベースで行い、表示用文字列と正解判定用IDを分離する |

生成パイプラインの推奨フロー: `テンプレート適用 → ディストラクタ候補抽出 → 一意性・整合性チェック → 文字数/体裁チェック → 生成ログ(seed, template_id, source_site_id)記録 → 問題プールに追加`。失敗時はリトライ（別ディストラクタ候補で再試行、最大N回）し、それでも失敗する遺産・テンプレート組合せは「生成不可」としてスキップする設計にする（既存研究でも同様のretry-then-skip方式が採られている）。

### 1.5 ハイブリッド構成: 手書き問題プール

テンプレート生成が苦手な領域:
- 文化的背景・エピソード（「なぜこの遺産が登録されたか」等のストーリー系）
- 時事（新規登録・危機遺産指定・登録抹消などの最新動向）
- 写真判定（画像を見て遺産名や国を当てる）
- 複数遺産の比較・関係性を問う応用問題

これらは`manual_questions.json`として別プールに保持し、模試生成時に一定比率（例: 60問中5〜10問）を手書きプールから抽出する。

```json
{
  "id": "manual-0007",
  "source_type": "manual",
  "category": "basic" | "japan" | "world_natural" | "world_cultural",
  "subtopic": "時事" | "文化的背景" | "写真判定" | "複合知識",
  "difficulty": 1,
  "question": "2024年に新たに世界遺産に登録された遺産として正しいものはどれか。",
  "choices": ["佐渡島の金山", "○○", "○○", "○○"],
  "answer_index": 0,
  "explanation": "佐渡島の金山は2024年の第46回世界遺産委員会で登録された。",
  "related_site_ids": ["jp-sado-mine"],
  "image": null,
  "tags": ["2024-update", "news"],
  "review_status": "verified",
  "source_ref": "公式テキスト第◯版 p.XX",
  "created_at": "2026-01-10",
  "updated_at": "2026-01-10"
}
```

`image`フィールドを使う場合は `{ "url": "assets/img/xxx.webp", "alt": "姫路城の外観" }` の形にし、静的サイトなので画像は同梱アセットとして配置する。

---

## 2. 模試としての出題選抜アルゴリズム

### 2.1 層化サンプリング（分野別構成比の維持）

3級の出題は「基礎知識」「日本の遺産」「世界の自然遺産」「世界の文化遺産」の4分野に大別され、日本国内の遺産を扱う分野の出題比率が最も高い（出典: オンスクJP調査ページ）。60問構成を模した場合の配分例:

```
CATEGORY_QUOTA = {
  basic:          12,  // 基礎知識(条約, OUV, 登録基準の考え方等)
  japan:          18,  // 日本の遺産
  world_natural:  15,  // 世界の自然遺産
  world_cultural: 15,  // 世界の文化遺産
}
// 合計60。実際の配分値は調査A（出題領域調査）のデータで確定させる
```

各カテゴリ内でも難易度配分（例: 易30%・中50%・難20%）を維持する二重層化にする。

### 2.2 選抜擬似コード

```js
function generateMockExam(pool, seed, categoryQuota, recentHistory) {
  const rng = mulberry32(seed);
  const exam = [];

  for (const [category, quota] of Object.entries(categoryQuota)) {
    let candidates = pool.filter(q => q.category === category);

    // 重複回避: 直近K回の模試で出題済みの問題IDにペナルティ(除外ではなく重み低下)
    candidates = weightByRecency(candidates, recentHistory, {
      excludeIfUsedWithinRuns: 2,     // 直近2回に出た問題は今回除外
      penaltyDecayRuns: 5,            // 3〜5回前のものは選ばれにくくする
    });

    // 難易度配分を満たすように層化
    const byDifficulty = groupBy(candidates, 'difficulty');
    const diffQuota = splitByRatio(quota, { easy: 0.3, normal: 0.5, hard: 0.2 });

    for (const [level, n] of Object.entries(diffQuota)) {
      const picked = weightedSampleWithoutReplacement(
        byDifficulty[level] ?? [], n, rng
      );
      exam.push(...picked);
    }
  }

  // 同一遺産(site_id)からの重複を分野間でも1問までに制限
  dedupeBySiteId(exam);

  // 出題順は分野ごとにブロック化 or 完全シャッフル（要件次第）
  shuffleArray(exam, rng);

  // 各設問内の選択肢シャッフルは別シードストリームを使う
  exam.forEach((q, i) => {
    q.shuffledChoices = seededShuffleChoices(q.choices, rng, i);
  });

  return { seed, generatedAt: Date.now(), questions: exam };
}
```

### 2.3 シード値による再現

- `mulberry32(seed)` のような軽量PRNGでシード可能な乱数列を作り、Fisher–Yatesシャッフルに使う（Mulberry32は32bit状態・高速・十分な周期を持つ非暗号用途PRNGとして広く使われる）。
- **重要な注意**: 「テンプレート生成問題」はマスタデータ由来のため、データが更新されると同じシードでも生成結果が変わりうる。したがって「同じ模試を再現する」機能は、シードだけでなく**生成結果そのもの（展開済みの問題オブジェクト一式）をlocalStorageに保存**し、「再挑戦」時はスナップショットを再利用する方式にする。シードは「同じ条件から新規生成したい（データ更新後の再現込みでよい）」場合のみ使う、という2階建て設計が安全。
- シードの決め方: `examId = `${dateStr}-${userChoiceOfMode}-${randomSalt}`` とし、`seed = hash(examId)`。ユーザーが「もう一度この模試」を選んだら保存済みスナップショットをロード、「同じ設定で新しい模試」を選んだら新しいsaltでシード生成、という2導線をUIに用意する。

### 2.4 選択肢シャッフルと正解位置の偏り防止

- 単純に毎回`shuffle(choices)`するだけでも長期的には均等化されるが、短期的な偏り（例: 直近10問で正解が"A"に集中）は学習者に「Aを選べば当たりやすい」という誤学習を生むリスクがある。
- 対策: 生成時に正解位置のヒストグラムを追跡し、直近N問で特定位置（A/B/C/D）の出現率が閾値（例: 35%）を超えたら、その問題については正解位置が別になるよう再シャッフルする簡易的なバランサーを入れる。
- 擬似コード:
```js
function seededShuffleChoices(choices, rng, positionHistogram) {
  let shuffled, correctPos;
  let attempts = 0;
  do {
    shuffled = seededShuffle(choices, rng); // Fisher-Yates
    correctPos = shuffled.findIndex(c => c.isCorrect);
    attempts++;
  } while (positionHistogram[correctPos] > MAX_SHARE && attempts < 5);
  positionHistogram[correctPos]++;
  return shuffled;
}
```

---

## 3. 学習効果を高める機能

### 3.1 間隔反復（簡易版の現実解）

- **SM-2**（SuperMemo-2）: quality(0-5)・repetitions・ease factor・intervalの4値で次回復習日を算出する軽量アルゴリズム。数十行で実装可能で、Ankiの基礎にもなっている。
- **FSRS**（Free Spaced Repetition Scheduler）: difficulty/stability/retrievabilityの3変数モデルで「忘却確率90%地点」を予測する現代的手法。SM-2比で同等定着率を20〜30%少ない復習回数で達成できるとされるが、パラメータ最適化には受験ログの蓄積が要る＝立ち上げ初期のデータが少ない静的サイトには過剰投資になりやすい。
- **本プロジェクトへの推奨**: 立ち上げ時はSM-2よりさらに単純な**Leitner式5箱モデル**（不正解→Box1に戻す、正解→次のBoxへ、Boxごとに復習間隔[1日/3日/7日/14日/30日]を固定）を採用。理由は (1) パラメータチューニング不要 (2) localStorageに`{questionId, box, lastSeenAt}`だけ保存すればよく実装コストが低い (3) ユーザーにも「箱が進む」という直感的なフィードバックを提示しやすい。データが十分蓄積された第2版以降にSM-2（ease factor管理）へ移行、将来的にFSRS（stability/difficulty推定）を検討、という段階移行が現実的。

簡易Leitner実装イメージ:
```js
const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30]; // index=box番号
function reviewResult(record, isCorrect) {
  record.box = isCorrect
    ? Math.min(record.box + 1, BOX_INTERVAL_DAYS.length - 1)
    : 1;
  record.dueAt = Date.now() + BOX_INTERVAL_DAYS[record.box] * 86400000;
  record.history.push({ at: Date.now(), correct: isCorrect });
  return record;
}
```

### 3.2 弱点分野の可視化・間違いノート・解説・スコア推移

- **弱点可視化**: カテゴリ別正答率をレーダーチャート or 横棒グラフで表示（「基礎知識72%・日本の遺産85%・自然遺産60%…」）。データはlocalStorageの受験ログから集計。
- **間違いノート**: 誤答した問題を`wrongNotebook`コレクションに自動追加し、練習モードで「間違えた問題だけ」を再抽選できる専用モードを用意。正解したら自動的にノートから外す（または「連続2回正解で除外」のように多少の粘りを持たせる）。
- **解説表示**: 各問題オブジェクトに`explanation`フィールドを必須化し、練習モードでは選択直後に表示、本番モードでは採点画面でまとめて表示。
- **スコア推移**: 受験ごとに`{examId, date, totalScore, categoryScores, durationSec}`を`examHistory`として保存し、折れ線グラフで推移表示。

### 3.3 本番モードと練習モードの分離

| | 本番モード | 練習モード |
|---|---|---|
| 制限時間 | あり（例: 60問50分、検定の実時間に合わせる） | なし、または問題ごとの目安時間のみ表示 |
| フィードバック | 即時なし（全問終了後に一括採点） | 選択直後に正誤＋解説を即表示 |
| 途中離脱 | 原則不可（離脱時は未回答扱い、または再開可の下書き保存） | いつでも中断・再開可 |
| 出題範囲 | 層化サンプリングでフル模試（60問） | カテゴリ絞り込み・弱点分野・間違いノートなど自由選択可 |
| 目的 | 本番の緊張感・時間感覚のシミュレーション | 反復学習・弱点克服 |

この分離は資格学習系アプリ（模擬試験と一問一答/ドリルの併存）で定着したパターンであり、指定の配色方針とも整合する：本番モードは藍（情報・主要操作）を基調に落ち着いたトーン、練習モードの即時フィードバックは青磁（正解）／弁柄（誤答）を使い分ける。

---

## 4. UXベンチマーク

### 4.1 定番の画面フロー
資格・検定学習アプリで定着している流れは概ね次の通り:

`ホーム（モード選択）→ 開始前確認（問題数・時間・注意事項）→ 設問（進捗バー＋残り時間）→（本番モードのみ）見直し画面（未回答・フラグ付き問題の一覧から再訪可）→ 提出確認 → 採点結果（総合スコア＋分野別内訳）→ 解説一覧 → 復習（間違いノートへの導線）`

- 「見直し画面」は本番モード限定機能として重要。各設問に「フラグを立てる」ボタンを置き、一覧からジャンプできるようにする（紙の試験の「後で見直す」慣習をデジタルで再現）。
- 練習モードは見直し画面を省略し、1問ごとに正誤フィードバック→次の問題、のシンプルなループにする。

### 4.2 モバイル縦画面での操作性の定石
- 1画面1問を基本とし、選択肢は縦並びの大きなタップ領域（44×44pt/48×48dp以上）で並べる。
- 画面下部に固定の「次へ」「採点する」ボタンを配置し、スクロールしても常時押せるようにする（親指の可動域＝画面下部を重視）。
- スワイプでの問題送りは誤操作（意図しないスワイプでの誤回答送信）のリスクがあるため避け、明示的なボタン操作を主導線にする。
- 進捗表示は「12/60」のような数値＋プログレスバーの併用で、残量感を視覚・数値両方から伝える。
- タイマーは本番モードで画面上部に常時表示し、残り5分などの閾値で色を黄土（注意）に変える、といった指定配色との連動が自然。

### 4.3 アクセシビリティの要点
- **キーボード操作**: 選択肢に数字キー（1〜4）または矢印キー＋Enterで選べるようにし、Tab移動順序を論理的（問題文→選択肢→次へボタン）に保つ。
- **スクリーンリーダー**: 選択肢グループに`role="radiogroup"`、各選択肢に`role="radio"`＋`aria-checked`を付与。タイマーや正誤フィードバックのような動的更新箇所には`aria-live="polite"`（採点結果など重要な通知は`assertive`）を使う。
- **コントラスト**: 指定配色で実測したWCAGコントラスト比（本文執筆時点で計算）は以下の通り。

| 前景色 | 背景色 | コントラスト比 | WCAG判定（通常文字/太字・大文字） |
|---|---|---|---|
| text #231E16 | bg #F7F3ED | 14.97:1 | AAA（余裕あり） |
| text #231E16 | surface #FFFEFB | 16.41:1 | AAA（余裕あり） |
| 藍 #22759E | bg #F7F3ED | 4.63:1 | AA通過（AAA未達） |
| 藍 #22759E | surface #FFFEFB | 5.07:1 | AA通過（AAA未達） |
| 青磁 #4F794A | bg/surface | 4.56 / 5.00:1 | AA通過（AAA未達） |
| 黄土 #9B621B | bg/surface | 4.57 / 5.01:1 | AA通過（AAA未達） |
| 弁柄 #AB5649 | bg/surface | 4.57 / 5.01:1 | AA通過（AAA未達） |
| 白 #FFFFFF | 各セマンティック色（ボタン背景時） | 5.04〜5.11:1 | AA通過（AAA未達） |

**含意**: 4色セマンティックカラーはいずれも本文サイズ通常文字でAA(4.5:1)をクリアするが、AAA(7:1)には届かない。したがって
1. 正誤・注意・不可逆操作の意味づけを**色のみに依存させない**（正解に✓アイコン、誤答に✕アイコン、注意に⚠アイコンを必ず併記）。
2. 小さい文字（キャプション等）でこれらの色を使う場合はAAが限界ラインのため、可能な限り14px以上・太字を推奨。
3. 藍地に白文字のプライマリボタンはコントラスト5.11:1でAA通過だが、ボタン内テキストは18px以上または太字にしてAA Largeの余裕を持たせるとより安全。

---

## 5. 段階的リリース設計（MVP切り分け）

### MVP（第1版）に入れるべき最小機能
1. テンプレート生成（★印5〜7種程度: 登録年/所在国/種別/複合遺産識別/日本遺産識別）＋手書き問題プール少数（時事・写真は後回し可、ただし文化的背景は少数用意）
2. 層化サンプリングによる模試生成（4分野×固定問題数、難易度配分は簡易でよい）
3. seeded PRNGでの選択肢シャッフルとシード保存（「同じ模試をもう一度」機能）
4. 本番モード（時間制限・一括採点）と練習モード（即時フィードバック）の分離
5. 採点結果画面（総合スコア＋分野別正答率）
6. localStorageへの受験履歴保存（スコア推移の最低限）
7. 基本アクセシビリティ（キーボード操作・コントラスト・ARIA最低限）

### 第2版以降に回してよい機能
- 簡易SRS（Leitner箱）による復習スケジューリングと「今日の復習」通知的UI
- 間違いノートの自動集計・専用復習モード
- ディストラクタ生成の高度化（意味的類似度ランキング、表記ゆれデータベースの拡充）
- 写真判定問題、時事問題の継続的な追加運用フロー
- 弱点分野のレーダーチャート等リッチな可視化
- SM-2への移行、さらに先にFSRS導入の検討（受験ログが十分蓄積してから）
- 出題位置バランサーの高度化（正解位置ヒストグラムの学習者間共有など、静的サイトでは限定的）
- IndexedDBへの移行（localStorage容量が問題になった場合）

---

## MVP提案: 画面一覧・データスキーマ・生成アルゴリズム擬似コード

### 画面一覧
1. **ホーム画面**: 「本番模試を始める」「練習問題（分野選択）」「これまでの成績」への導線。直近スコアのサマリーをカード表示。
2. **開始前確認画面**（本番モードのみ）: 問題数・制限時間・注意事項、「開始」ボタン。
3. **設問画面**: 進捗バー、（本番のみ）タイマー、問題文、4択（radiogroup）、「フラグを立てる」（本番のみ）、「次へ」固定ボタン。練習モードは選択直後に正誤＋解説を表示。
4. **見直し画面**（本番モードのみ）: 未回答・フラグ付き問題の一覧、各項目タップで該当設問へジャンプ、「採点する」ボタン。
5. **採点結果画面**: 総合スコア、合否ライン表示（60点以上目安）、分野別正答率バー。
6. **解説一覧画面**: 各設問の正誤・選択した答え・正解・解説文。「間違いノートに追加」導線（第2版で本格活用）。
7. **成績推移画面**: 過去の受験履歴一覧、スコア推移グラフ、分野別の弱点サマリー。

### データスキーマ（MVP最小構成）

```ts
// sites.json（構造化マスタ、調査A/Bのデータと連携）
interface Site {
  id: string;
  name_ja: string;
  country: string[];
  unesco_region: string;
  registration_year: number;
  type: "文化遺産" | "自然遺産" | "複合遺産";
  criteria: string[];
  in_danger: boolean;
  is_transboundary: boolean;
  description_short: string;
}

// generated_questions.json（テンプレート生成物、ビルド時 or 実行時生成）
interface GeneratedQuestion {
  id: string;                 // `${templateId}-${siteId}`
  source_type: "generated";
  template_id: string;        // "year-basic", "country-basic" 等
  category: "basic" | "japan" | "world_natural" | "world_cultural";
  difficulty: 1 | 2 | 3;
  site_id: string;
  question: string;
  choices: { id: string; text: string; isCorrect: boolean }[];
  explanation: string;
}

// manual_questions.json（1.5節で定義済みのスキーマを流用）

// localStorage: exam_history
interface ExamRecord {
  examId: string;
  seed: number;
  mode: "mock" | "practice";
  startedAt: number;
  finishedAt: number;
  questions: { questionId: string; chosenId: string; correct: boolean }[];
  categoryScores: Record<string, { correct: number; total: number }>;
  totalScore: number;
}

// localStorage: srs_state（第2版で本格利用、MVPでは器だけ用意してもよい）
interface SrsRecord {
  questionId: string;
  box: number;       // Leitner box 1-5
  dueAt: number;
  history: { at: number; correct: boolean }[];
}
```

### 生成アルゴリズム 擬似コード（テンプレート生成〜模試組み立てまで一気通貫）

```js
// --- 1. テンプレートからの問題生成（ビルド時 or 初回ロード時に全量生成しキャッシュ） ---
function generateAllQuestions(sites) {
  const questions = [];
  for (const template of TEMPLATES) {              // §1.2の各テンプレート定義
    for (const site of sites) {
      if (!template.appliesTo(site)) continue;      // 例: 越境遺産は所在国テンプレ対象外
      const distractors = template.pickDistractors(site, sites); // §1.3戦略
      if (distractors.length < 3) continue;         // 候補不足ならスキップ
      const q = template.build(site, distractors);
      if (!validateQuestion(q)) continue;            // §1.4のバリデーション
      questions.push(q);
    }
  }
  return questions;
}

function validateQuestion(q) {
  const correct = q.choices.find(c => c.isCorrect);
  const texts = q.choices.map(c => c.text.trim().toLowerCase());
  const uniqueTexts = new Set(texts);
  if (uniqueTexts.size !== q.choices.length) return false;      // 重複選択肢
  if (q.choices.filter(c => c.isCorrect).length !== 1) return false; // 正解が1つでない
  const lengths = texts.map(t => t.length);
  const spread = Math.max(...lengths) - Math.min(...lengths);
  if (spread > MAX_LENGTH_SPREAD) return false;                 // 文字数の手がかり化を防止
  return true;
}

// --- 2. 模試の層化サンプリング生成 ---
function generateMockExam(allQuestions, manualQuestions, seed, quota, history) {
  const rng = mulberry32(seed);
  const pool = [...allQuestions, ...manualQuestions];
  const exam = [];

  for (const [category, count] of Object.entries(quota)) {
    const manualSlice = Math.round(count * MANUAL_RATIO[category] ?? 0.1);
    const generatedSlice = count - manualSlice;

    exam.push(...stratifiedPick(pool, category, "manual", manualSlice, rng, history));
    exam.push(...stratifiedPick(pool, category, "generated", generatedSlice, rng, history));
  }

  dedupeBySiteId(exam);
  shuffleArray(exam, rng);
  exam.forEach(q => { q.choices = seededShuffleChoices(q.choices, rng); });

  return { seed, generatedAt: Date.now(), questions: exam };
}

function stratifiedPick(pool, category, sourceType, n, rng, history) {
  let candidates = pool.filter(q => q.category === category && q.source_type === sourceType);
  candidates = candidates.filter(q => !recentlyUsed(q.id, history, 2)); // 直近2回除外
  const byDifficulty = groupBy(candidates, "difficulty");
  const quota = splitByRatio(n, { 1: 0.3, 2: 0.5, 3: 0.2 });
  const picked = [];
  for (const [level, cnt] of Object.entries(quota)) {
    picked.push(...weightedSample(byDifficulty[level] ?? [], cnt, rng));
  }
  return picked;
}
```

---

## 出典一覧

- [Automatic distractor generation for multiple-choice English vocabulary questions](https://telrp.springeropen.com/articles/10.1186/s41039-018-0082-z)
- [Automatic distractor generation in multiple-choice questions: a systematic literature review (PubMed)](https://pubmed.ncbi.nlm.nih.gov/39650367/)
- [Automatic distractor generation in multiple-choice questions: a systematic literature review (PeerJ CS)](https://peerj.com/articles/cs-2441/)
- [Automatic Distractor Generation for Multiple Choice Questions in Standard Tests (arXiv:2011.13100)](https://arxiv.org/pdf/2011.13100)
- [Generating Multiple-Choice Knowledge Questions with Interpretable Difficulty Estimation Using Knowledge Graphs and LLMs](https://arxiv.org/html/2604.10748)
- [Generate-Then-Validate: A Novel Question Generation Approach Using Small Language Models (arXiv:2512.10110)](https://arxiv.org/pdf/2512.10110)
- [Knowledge Questions from Knowledge Graphs (arXiv:1610.09935)](https://arxiv.org/abs/1610.09935)
- [Generating Quiz Questions from Knowledge Graphs (ResearchGate)](https://www.researchgate.net/publication/311488373_Generating_Quiz_Questions_from_Knowledge_Graphs)
- [SM-2 spaced repetition algorithm (GitHub: thyagoluciano/sm2)](https://github.com/thyagoluciano/sm2)
- [The Anki SM-2 Spaced Repetition Algorithm — RemNote Help Center](https://help.remnote.com/en/articles/6026144-the-anki-sm-2-spaced-repetition-algorithm)
- [The FSRS Spaced Repetition Algorithm — RemNote Help Center](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm)
- [Spaced Repetition Systems Have Gotten Way Better (Domenic Denicola)](https://domenic.me/fsrs/)
- [free-spaced-repetition-scheduler (GitHub: open-spaced-repetition)](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler)
- [ライトナーシステム解説 (note: Sangmin Ahn)](https://note.com/sangmin/n/n769e30ed703e)
- [間隔反復 - Wikipedia](https://ja.wikipedia.org/wiki/%E9%96%93%E9%9A%94%E5%8F%8D%E5%BE%A9)
- [Mulberry32 (GitHub: cprosche/mulberry32)](https://github.com/cprosche/mulberry32)
- [Understanding how to use Mulberry32 to achieve deterministic randomness in JavaScript](https://emanueleferonato.com/2026/01/08/understanding-how-to-use-mulberry32-to-achieve-deterministic-randomness-in-javascript/)
- [How to Randomly Shuffle a List with a Seed in JavaScript](https://www.javaspring.net/blog/javascript-random-ordering-with-seed/)
- [Mobile Accessibility Testing: WCAG, ADA & How to Test (TestGrid)](https://testgrid.io/blog/mobile-accessibility-testing/)
- [Mobile Accessibility Testing: Guidelines, Tools, and Best Practices (BrowserStack)](https://www.browserstack.com/guide/accessibility-testing-for-mobile-apps)
- [世界遺産検定3級の過去問からみる出題傾向 (オンスクJP)](https://onsuku.jp/training/world/trend)
- [世界遺産検定3級 無料問題集 (kentei-lab.com)](https://kentei-lab.com/exams/sekai3kyu/questions)
- WCAGコントラスト比: 相対輝度計算式（WCAG 2.x, 1.4.3 Contrast (Minimum) / 1.4.6 Contrast (Enhanced)）に基づき本レポート作成時に独自算出（bg #F7F3ED, surface #FFFEFB, text #231E16, 藍 #22759E, 青磁 #4F794A, 黄土 #9B621B, 弁柄 #AB5649 の各ペアで計算）。
