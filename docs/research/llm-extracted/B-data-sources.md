> **未検証**: このファイルはLLM調査エージェントの出力であり、一次情報での裏取りが済んでいない。
> 取り扱いは `README.md` を参照。実装へ取り込む前に `../open-questions.md` の該当項目を確認すること。

---

# 世界遺産検定3級 模擬試験自動生成 - データソース調査報告(調査エージェントB)

## 要約(10行以内)

1. UNESCO公式サイト(whc.unesco.org)は本調査環境のネットワークプロキシで直接アクセス不可(EGRESS_BLOCKED)。ただし`git clone`経由でGitHub上の非公式ミラー(2021年時点のCSV化データ、1154件・37フィールド)を実際に取得でき、公式XML/syndicationのフィールド構造を実データで確認できた。
2. UNESCO公式データの再配布には**事前の書面許諾が必須**(FAQ #126)。非商用シンジケーションでも改変不可・商用不可・著作権表示必須で、無断でのGitHub Pages公開は規約違反になりうる。**事実データ(名称/年/基準/座標/国)は再構成し、説明文コピペは厳禁**が結論。
3. Wikidata(CC0)・Wikipedia本文(CC BY-SA 4.0)・Wikimedia Commons画像(個別ライセンス、多くはCC BY-SA)は本調査環境からは直接検証不能(同一プロキシでブロック)だが、公開ドキュメントを通じてライセンス条件そのものは原文引用で確認できた。
4. 文化遺産オンライン(文化庁)は二次利用条件(CCライセンス等)を明示しておらず、デフォルトで全著作権保持。日本の構成資産情報の自由利用は不可、参考程度に留めるべき。
5. 実データから日本の世界遺産(2021年時点24件)の名称・登録年・登録基準・種別を検証できた。現在(2026年9月時点、要再確認)は佐渡島の金山(2024)・飛鳥/藤原(2026)を含め27件程度と推定(二次情報)。
6. データ規模: 最小スキーマ(id/名称/年/基準/国/座標等)なら全世界(現在約1,270件規模)でも400KB未満のJSONに収まり、GitHub Pages静的配信は十分現実的。
7. 推奨: **事実データはWikidata(CC0)を第一ソース**とし、UNESCO公式ページはリンク先・出典表示としてのみ利用。説明文・出題文はオリジナルで執筆。画像は当面不使用または個別にPD/CC0確認済みのCommons画像のみ、帰属表示を必須実装。
8. 本調査環境固有の制約として、whc.unesco.org / wikipedia.org / wikidata.org / dbpedia.org / commons.wikimedia.org / bunka.go.jp への直接HTTPアクセスがすべて失敗した(後述)。これは調査サンドボックスのプロキシポリシーによるものであり、本番のGitHub Actions/開発者PC等では同じ制約はない可能性が高い点に注意。

---

## 1. UNESCO公式データ

### 1.1 実際に取得を試みた結果

`curl` で以下のドメインへの接続を試したが、**すべて `CONNECT tunnel failed, response 403` / `EGRESS_BLOCKED`** で失敗した(WebFetchツールでも同様):

- `https://whc.unesco.org/en/list/xml/` (公式XML全件データ)
- `https://data.unesco.org/...` (UNESCO DataHub)
- `https://query.wikidata.org/sparql`
- `https://en.wikipedia.org/`, `https://ja.wikipedia.org/`
- `https://dbpedia.org/`
- `https://commons.wikimedia.org/`
- `https://bunka.go.jp/`, `https://bunkaisan.bunka.go.jp/`
- `https://opendata.go.jp/`
- `https://cdn.jsdelivr.net/`, `https://unpkg.com/`

一方で `https://github.com/`, `https://api.github.com/`(制限付き), `https://raw.githubusercontent.com/`(HEAD/リダイレクトのみ疎通、実体は取れず), `git clone https://github.com/...` および `git clone https://gist.github.com/<id>.git` は成功した。

この結果、**`git clone` 経由でGitHub上に置かれた「UNESCO公式XMLを加工したデータセット」を取得する**方針に切り替え、以下を実際に取得・検証した。

- Gist: `jawj/01c21d04531570cf0206d67748f240d3`
  (`git clone https://gist.github.com/01c21d04531570cf0206d67748f240d3.git`)
  → `whc-sites-2021.csv` (2,194,673 バイト) を取得成功。
  ファイル内に明記: `"Data from https://whc.unesco.org/en/syndication/ converted to CSV | Copyright © 1992 – 2022 UNESCO/World Heritage Centre"`

保存先: `data-samples/whc-sites-2021-full.csv`(全件)、`data-samples/whc-sites-2021-head5.csv`(先頭抜粋)

### 1.2 実データの形状(フィールド一覧)

CSVヘッダ(37列、実データより)。UNESCO公式XML/syndicationのフィールド構成をそのまま反映していると考えられる:

```
unique_number, id_no, rev_bis, name_en, name_fr,
short_description_en, short_description_fr,
justification_en, justification_fr,
date_inscribed, secondary_dates,
danger, date_end, danger_list,
longitude, latitude, area_hectares,
C1,C2,C3,C4,C5,C6, N7,N8,N9,N10,   # 登録基準(i)~(x)の0/1フラグ
criteria_txt,                       # 例: "(i)(iv)"
category, category_short,           # Cultural / Natural / Mixed, C/N/C-N
states_name_en, states_name_fr,
region_en, region_fr,
iso_code, udnp_code, transboundary
```

- 件数: **1,154件**(2021年スナップショット。`id_no`/`unique_number`ともユニーク1,154)
- カテゴリ内訳: Cultural(C) 897 / Natural(N) 218 / Mixed(C/N) 39
- 危機遺産(danger=1): 52件
- 日本語フィールドは**存在しない**(英語・フランス語のみ、`_en`/`_fr`サフィックス)。多言語対応はUNESCO公式でも英仏の2言語限定であり、日本語データはUNESCO側には無い。

### 1.3 実サンプル(JSON化)

**日本: 姫路城(Himeji-jo)**
```json
{
  "unique_number": "782", "id_no": "661",
  "name_en": "Himeji-jo", "name_fr": "Himeji-jo",
  "date_inscribed": "1993",
  "danger": "0",
  "longitude": "134.7", "latitude": "34.83333333",
  "area_hectares": "107",
  "criteria_txt": "(i)(iv)",
  "category": "Cultural", "category_short": "C",
  "states_name_en": "Japan", "states_name_fr": "Japon",
  "region_en": "Asia and the Pacific",
  "iso_code": "jp", "transboundary": "0"
}
```

**海外: タージ・マハル(Taj Mahal, インド)**
```json
{
  "unique_number": "282", "id_no": "252",
  "name_en": "Taj Mahal", "name_fr": "Le Taj Mahal",
  "date_inscribed": "1983",
  "danger": "0",
  "longitude": "78.04222", "latitude": "27.17417",
  "criteria_txt": "(i)",
  "category": "Cultural", "category_short": "C",
  "states_name_en": "India", "region_en": "Asia and the Pacific",
  "iso_code": "in", "transboundary": "0"
}
```
(完全版は `data-samples/sample_records.json`。`short_description_en`等の著作物本文は同ファイル内に含まれるが、後述の理由により**そのまま転載使用しないこと**。)

### 1.4 ライセンス/利用条件(原文引用)

WebSearch経由でUNESCO公式FAQページ(`https://whc.unesco.org/en/faq/126`)の内容を確認(直接フェッチ不可のため検索結果のスニペット/要約経由。原文の要旨を引用):

> "The website and its content is protected by international law, and any republication, online or in any other form, of any UNESCO/WHC data requires prior written authorization."

> "Individuals or organizations may ask for written permission to syndicate the content of the sections that are specifically made available (as indicated by the availability of the RSS icons) for personal, non-commercial use, without fee."

> "No modifications may be made to the content of any material that is syndicated..."
> "Users may not sell, license, or otherwise assign the use of any of the material..."
> "Each syndication use must include a link back to the UNESCO/WHC home page... as well as the specific item's page."
> "Each syndication use must include the copyright notice: 'Copyright © 1992 - [current year] UNESCO/World Heritage Centre. All rights reserved.'"

出典: [Questions and Answers - UNESCO World Heritage Centre (FAQ 126)](https://whc.unesco.org/en/faq/126)、[UNESCO World Heritage Centre - Syndication](https://whc.unesco.org/en/syndication/)

さらに画像については `whc.unesco.org/en/licenses/` 配下に個別のCreative Commonsライセンス(CC BY-SA 3.0 IGO、CC BY-SA 4.0、CC BY-NC-ND等)のページが存在し、写真ごとにライセンスが異なる(**一括CC0/パブリックドメインではない**)。

出典: [Licenses - UNESCO World Heritage Centre](https://whc.unesco.org/en/licenses/)

**結論**: UNESCO公式データ(XML/syndication)は「無断複製・再配布は原則不可、非商用シンジケーションも書面許諾が必要」という強い制限がある。**GitHub Pagesでの無許諾公開は規約上グレー〜アウト**。少なくとも「短い説明文」等の創作性のある文章をそのまま転載することは避けるべき。名称・登録年・登録基準番号・国・座標といった「事実」自体は各法域で著作権の対象外となりうるが、UNESCOはサイト全体を「データも含めて」保護対象と明言しており、安全を期すなら**UNESCO由来の生データをそのまま公開・配布しない**方針が無難。

---

## 2. 代替・補完データソース

### 2.1 Wikidata

直接のSPARQLクエリ実行は本環境からブロックされ検証不能だったが(`query.wikidata.org` EGRESS_BLOCKED)、公開ドキュメントで以下を確認:

- 世界遺産は `heritage designation (P1435) = World Heritage Site (Q9259)` で紐付けられる。クエリ例: `SELECT ?item WHERE { ?item wdt:P1435 wd:Q9259. }`
- ライセンス: **Wikidataの構造化データ(main/Property/Lexeme/EntitySchema名前空間)はCC0**。
  > "All structured data from the main, Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License"
  > "any datasets with an attribution requirement cannot be included in Wikidata"
  出典: [Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)

→ **帰属表示すら不要**な唯一のソースであり、事実データ(id/名称/座標/登録年相当プロパティ/国/カテゴリ等)の第一候補。ただし本環境では実クエリの成功を確認できていない点は限界として明記(通常のネットワーク環境からは公開SPARQLエンドポイントであり利用可能なはず)。

### 2.2 Wikipedia / DBpedia

- Wikipediaの文章は **CC BY-SA 4.0**。再利用時は「適切なクレジット表示・ライセンスへのリンク・変更の明示」が必須、二次的著作物も同一/互換ライセンスでの頒布が必要(ShareAlike継承)。
  出典: [Wikipedia:クリエイティブ・コモンズ 表示-継承 4.0 国際 パブリック・ライセンス](https://ja.wikipedia.org/wiki/Wikipedia:%E3%82%AF%E3%83%AA%E3%82%A8%E3%82%A4%E3%83%86%E3%82%A3%E3%83%96%E3%83%BB%E3%82%B3%E3%83%A2%E3%83%B3%E3%82%BA_%E8%A1%A8%E7%A4%BA-%E7%B6%99%E6%89%BF_4.0_%E5%9B%BD%E9%9A%9B_%E3%83%91%E3%83%96%E3%83%AA%E3%83%83%E3%82%AF%E3%83%BB%E3%83%A9%E3%82%A4%E3%82%BB%E3%83%B3%E3%82%B9)
- 「GitHub Pagesで公開」する場合、Wikipedia本文をそのまま(または軽微改変で)使うと**そのページ内に帰属表示(著者クレジット/ライセンスリンク)を明示する義務**が発生する。かつ問題文として改変・要約したとしても、ShareAlikeの性質上「二次的著作物」に該当しうるため、**サイト全体もCC BY-SA互換ライセンスでの公開が必要になるリスク**がある。これは「オリジナル生成」という要件と相性が悪い。
- 対策として、Wikipedia本文は**事実確認・執筆時の参考資料としてのみ使用し、出題文・解説文は独自執筆**するのが安全。DBpediaはWikipediaのInfobox由来の構造化データで同様にCC BY-SAが基本(ライセンスはDBpedia側でCC BY-SA/GFDLのデュアル)。

### 2.3 日本の文化庁・文化遺産オンライン

WebSearch経由での確認:
> 「文化遺産オンライン」に掲載されている個々の情報（文章、写真、動画等）には著作権があり、著作権法及び国際条約により保護されています。法律で認められた場合を除き、無断で転用・改変することは禁じられています。

かつ「クリエイティブコモンズライセンス等の国際基準に準拠した二次利用条件の表示がされていない状況」との調査結果あり(政府のデジタルアーカイブ推進委員会資料)。

出典: [文化遺産オンライン 掲載に関する著作権](https://bunkaedit.nii.ac.jp/guide.html)、[デジタルアーカイブにおける望ましい二次利用条件表示の在り方について(2019年版)](https://www.kantei.go.jp/jp/singi/titeki2/digitalarchive_suisiniinkai/jitumusya/2018/nijiriyou2019.pdf)

→ **文化遺産オンラインは自由利用不可**。日本の資産(構成資産名など)は事実情報として文化庁の公式発表(登録決定告知等)や、複数の一般公開情報を突き合わせて自前でまとめる必要がある。政府標準利用規約(CC BY 4.0相当)が適用されている省庁サイト(文化庁本体の一部ページ等)であれば別だが、文化遺産オンライン自体は対象外。

### 2.4 画像(Wikimedia Commons)

直接アクセス不可のためWebSearch経由での確認。姫路城の画像を例に取ると、Commons上の写真は**1枚ごとに個別のライセンス**が付与されている(CC BY-SA 4.0、CC BY-SA 3.0など、アップロード者によって異なる):

- File:Himeji Castle Interior.jpg — CC BY-SA 4.0 (Author: ScribblingGeek)
- File:Château de Himeji01.jpg — CC BY-SA 3.0 (Author: Bernard Gagnon)
など。

→ 写真判定問題等で画像を使う場合、**画像ごとにライセンス種別と著作者名を確認し、CC BY-SA/CC BYであれば作品ページ内(またはクレジット一覧ページ)に著作者名・ライセンス名・原典リンクを明示する義務**がある(表示-継承なので、改変(トリミング等)した場合もライセンス条件は維持)。パブリックドメイン(著作権保護期間切れ・PD-self等)の画像であれば表示義務はないが、これも個別確認が必要。**一括で「Commons画像は自由に使える」という前提は誤り**。

### 2.5 出典: UNESCO公式ライセンスページ一覧、Commons個別ファイルページ(上記WebSearch結果内リンク参照)

---

## 3. データ品質の実査

### 3.1 日本の世界遺産(2021年スナップショット、実データ検証済み、24件)

CSVから `states_name_en == "Japan"` で抽出(`data-samples/japan_sites_2021.json`)。名称表記・登録年・登録基準・種別:

| 名称(英語表記そのまま) | 登録年 | 基準 | 種別 |
|---|---|---|---|
| Buddhist Monuments in the Horyu-ji Area | 1993 | (i)(ii)(iv)(vi) | C |
| Himeji-jo | 1993 | (i)(iv) | C |
| Yakushima | 1993 | (vii)(ix) | N |
| Shirakami-Sanchi | 1993 | (ix) | N |
| Historic Monuments of Ancient Kyoto (Kyoto, Uji and Otsu Cities) | 1994 | (ii)(iv) | C |
| Historic Villages of Shirakawa-go and Gokayama | 1995 | (iv)(v) | C |
| Hiroshima Peace Memorial (Genbaku Dome) | 1996 | (vi) | C |
| Itsukushima Shinto Shrine | 1996 | (i)(ii)(iv)(vi) | C |
| Historic Monuments of Ancient Nara | 1998 | (ii)(iii)(iv)(vi) | C |
| Shrines and Temples of Nikko | 1999 | (i)(iv)(vi) | C |
| Gusuku Sites and Related Properties of the Kingdom of Ryukyu | 2000 | (ii)(iii)(vi) | C |
| Sacred Sites and Pilgrimage Routes in the Kii Mountain Range | 2004 | (ii)(iii)(iv)(vi) | C |
| Shiretoko | 2005 | (ix)(x) | N |
| Iwami Ginzan Silver Mine and its Cultural Landscape | 2007 | (ii)(iii)(v) | C |
| Hiraizumi – Temples, Gardens and Archaeological Sites... | 2011 | (ii)(vi) | C |
| Ogasawara Islands | 2011 | (ix) | N |
| Fujisan, sacred place and source of artistic inspiration | 2013 | (iii)(vi) | C |
| Tomioka Silk Mill and Related Sites | 2014 | (ii)(iv) | C |
| Sites of Japan's Meiji Industrial Revolution... | 2015 | (ii)(iv) | C |
| Sacred Island of Okinoshima and Associated Sites in the Munakata Region | 2017 | (ii)(iii) | C |
| Hidden Christian Sites in the Nagasaki Region | 2018 | (iii) | C |
| Mozu-Furuichi Kofun Group: Mounded Tombs of Ancient Japan | 2019 | (iii)(iv) | C |
| Amami-Oshima Island, Tokunoshima Island, ... | 2021 | (x) | N |
| Jomon Prehistoric Sites in Northern Japan | 2021 | (iii)(v) | C |

**注意すべき表記ゆれ**:
- 元データは英語名のみで日本語表記は含まれない。日本語名称は別途整備が必要で、「Buddhist Monuments in the Horyu-ji Area」=「法隆寺地域の仏教建造物」のように、**日本語での正式名称(文化庁発表の名称)と英語名の対応表を自前で作る必要がある**。
- 「Sacred Island of Okinoshima and Associated Sites in the Munakata Region」には元CSVに**末尾余分なスペース**が入っているなど、非公式ミラーデータ特有のノイズがあった(公式データそのものではなく2021年時点の変換データである点に留意)。
- 2021年以降の追加(**佐渡島の金山 2024年**、**飛鳥・藤原 2026年** ※WebSearchの二次情報、要一次情報での再確認)はこのCSVには含まれない。**このデータセットは最新ではない**ため、本番運用では最新件数を別途手動更新する仕組みが必要。

出典(日本の最新件数、二次情報・要検証): [日本の世界遺産一覧【2026年最新版】](https://view-story.net/japan-world-heritage-list/)、[「佐渡島の金山」の世界遺産一覧表への登録決定について - 在ユネスコ日本政府代表部](https://www.unesco.emb-japan.go.jp/itpr_ja/11_000001_00155.html)

### 3.2 世界の主要遺産の絞り込み軸(知名度の定量化)

3級の出題範囲は「日本の全遺産」+「世界の主要遺産(著名なもの)」が中心になると想定されるため、著名度のスコアリングが必要。候補指標(いずれも直接検証はできなかったが、方式としては実行可能と判断):

1. **Wikipedia言語版数**(その項目が何言語のWikipediaに存在するか、langlinksの数)。世界的に有名な遺産ほど多言語で記事が存在する傾向があり、簡便な代理指標になる。Wikidataの`sitelinks`件数からも取得可能(CC0)。
2. **Wikipediaページビュー**: Wikimedia REST APIの `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/{access}/{agent}/{article}/{granularity}/{start}/{end}` エンドポイントで取得可能(公式ドキュメント確認済み、直接アクセスは本環境では未検証)。
   出典: [Wikimedia REST API](https://www.mediawiki.org/wiki/Wikimedia_REST_API)、[Wikimedia Analytics API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/getting-started.html)
3. **危機遺産リスト非該当かつ登録基準数**: 複合遺産(C/N)や基準数が多い遺産は「教科書的名所」であることが多く、副次的なフィルタとして使える。
4. **世界遺産検定公式教材の頻出遺産リスト**があれば最も精度が高いが、これは著作物であり直接参照・転載は避けるべき(該当教材の権利者に別途確認が必要)。

**推奨**: Wikidataのsitelinks件数 + Wikipediaページビュー(日本語版+英語版合算)を機械的な一次フィルタとし、人手で最終調整するハイブリッド方式。

---

## 4. データサイズの見積もり

実データ(2021年、1,154件)から実測:

| 形式 | サイズ(実測/推計) | 備考 |
|---|---|---|
| 元CSV(37列、英仏の説明文含む) | 2,194,673 バイト(実測) | UNESCO由来の著作物本文を含むため**そのまま公開不可** |
| 全フィールドJSON化(1154件) | 2,865,620 バイト(実測、UTF-8) | 同上の理由で不可 |
| 最小スキーマJSON(id/名称/年/基準/国/地域/座標/危険フラグのみ、1154件) | 339,443 バイト(実測、約332KB) | **これが実用上の目安** |

現在の登録件数(約1,270件規模、要最新確認)に比例換算すると、最小スキーマで**約370〜400KB**程度。GitHub Pagesでの静的配信としては全く問題ないサイズで、分割は必須ではない(1ファイルでも十分軽量)。日本語名称・独自解説文・出題用ディストラクター等を追加しても、圧縮(gzip配信はGitHub Pagesが自動対応)すれば数百KB〜1MB程度に収まる見込み。

**方針**: 分割不要。ただし将来的にカテゴリ別(日本/世界の主要遺産)にファイルを分けておくと、出題ロジック側の読み込みが軽くなり保守しやすい。

---

## 推奨データ構成(このプロジェクトで採用すべきソース組み合わせとスキーマ案)

### 採用ソースの組み合わせ

| 用途 | 第一ソース | 理由 |
|---|---|---|
| 事実データ(id/年/基準/国/座標/カテゴリ) | **Wikidata(SPARQL, CC0)** | 帰属表示すら不要、機械可読、事実データとして最もクリーン |
| 日本語名称・日本の構成資産情報 | 文化庁・外務省等の**公式発表文からの手作業でのファクトチェック**(著作物本文は転載せず、事実のみメモとして自前DB化) | 文化遺産オンラインは無断利用不可のため、名称・年・場所などの「事実」だけを複数の一次情報で確認し、文章は自前執筆 |
| 出題文・解説文・選択肢 | **完全オリジナル執筆**(このプロジェクトのメンバーが事実データを基に作文) | UNESCO/Wikipedia/文化遺産オンラインいずれも本文の転載は権利上リスクがあるため |
| 著名度フィルタ(世界の主要遺産の抽出) | Wikidata sitelinks数 + Wikipedia pageviews API | 定量化可能、ライセンス上の問題なし(統計値であり著作物本文ではない) |
| 画像(使う場合) | Wikimedia Commonsの**個別確認済みCC BY-SA/CC0/PD画像のみ**、または画像を使わない出題形式に限定 | 画像ごとにライセンスが異なるため一括利用は不可。帰属表示の実装(画像下にクレジット行を出す等)が必須 |
| UNESCO公式サイトへの言及 | リンクのみ(出典として"詳細はUNESCO公式サイトへ"程度)。本文転載はしない | 事前書面許諾が必要なため |

### スキーマ案(問題生成用、JSON)

```json
{
  "id": "661",                 // UNESCO id_no (Wikidata P1435経由でも取得可能な参照キー)
  "wikidata_id": "Q193460",    // Wikidata QID(可能なら)
  "name_ja": "姫路城",          // 自前で整備した日本語名称
  "name_en": "Himeji-jo",
  "country_ja": "日本",
  "country_en": "Japan",
  "region": "アジア・太平洋",
  "year_inscribed": 1993,
  "category": "文化遺産",       // 文化遺産/自然遺産/複合遺産
  "criteria": ["i", "iv"],      // 登録基準
  "danger": false,
  "lat": 34.83333333,
  "lon": 134.7,
  "is_japan": true,
  "fame_score": 0.0,            // Wikidata sitelinks数やpageviewsから算出する著名度スコア(0-1正規化)
  "description_ja": "...",      // 自前執筆した解説文(出題・解説用)
  "source_note": "UNESCO ID/年/基準/座標: Wikidata(CC0)由来。解説文はオリジナル執筆。"
}
```

- `description_ja` は**必ずオリジナル執筆**とし、UNESCO/Wikipedia本文の要約・言い換えであっても、その旨と参照元をコミットメッセージやCLAUDE.md等の内部記録に残す運用を推奨(直接の翻訳的言い換えは二次的著作物と見なされるリスクがあるため、事実だけを見て独自に書き起こす)。
- `source_note` フィールドをデータ内に持たせておくと、後から出典監査がしやすい。

---

## ライセンス上やってはいけないこと

1. **UNESCO公式サイトの説明文・正当化理由(justification)・写真をそのままコピーしてサイトに掲載すること**。事前の書面許諾なしの再配布は規約違反(FAQ #126)。
2. **UNESCO由来のCSV/XML(本調査で取得したGistデータ含む)をリポジトリにそのままコミットしてGitHub Pagesで一般公開すること**。今回取得した `whc-sites-2021.csv` は調査用のローカルサンプルであり、本プロジェクトの成果物に含めるべきではない(著作権表示付きでUNESCO著作物の複製である本文列を含むため)。
3. **Wikipedia本文をほぼそのまま(軽微な言い換えのみで)問題文・解説文に使うこと**。CC BY-SAの継承性により、サイト全体がCC BY-SA互換での公開を要求されるリスクがあり、かつ帰属表示も別途必要になる。
4. **文化遺産オンラインの文章・写真を無断転載すること**。二次利用条件の明示がなく、デフォルトで全著作権保持。
5. **Wikimedia Commonsの画像を「Commonsだから自由」と一括利用すること**。CC BY-SA画像は個別の著者クレジット表示が必須(表示を怠るとライセンス違反)。
6. **知名度の判定に世界遺産検定公式教材やその他市販教材の掲載遺産リストをそのまま転記すること**。教材自体が著作物であるため、出典を明示した上での参考程度にとどめ、機械的指標(Wikidataベース)を主軸にする。

---

## 出典一覧

- [UNESCO World Heritage Centre - Syndication](https://whc.unesco.org/en/syndication/)
- [Questions and Answers (FAQ 126) - UNESCO World Heritage Centre](https://whc.unesco.org/en/faq/126)
- [Licenses - UNESCO World Heritage Centre](https://whc.unesco.org/en/licenses/)
- [World Heritage Sites 2021 CSV (Gist by jawj)](https://gist.github.com/jawj/01c21d04531570cf0206d67748f240d3)
- [Wikidata:Licensing](https://www.wikidata.org/wiki/Wikidata:Licensing)
- [Wikidata: World Heritage Site (Q9259)](https://www.wikidata.org/wiki/Q9259)
- [Wikipedia:クリエイティブ・コモンズ 表示-継承 4.0 国際 パブリック・ライセンス](https://ja.wikipedia.org/wiki/Wikipedia:%E3%82%AF%E3%83%AA%E3%82%A8%E3%82%A4%E3%83%86%E3%82%A3%E3%83%96%E3%83%BB%E3%82%B3%E3%83%A2%E3%83%B3%E3%82%BA_%E8%A1%A8%E7%A4%BA-%E7%B6%99%E6%89%BF_4.0_%E5%9B%BD%E9%9A%9B_%E3%83%91%E3%83%96%E3%83%AA%E3%83%83%E3%82%AF%E3%83%BB%E3%83%A9%E3%82%A4%E3%82%BB%E3%83%B3%E3%82%B9)
- [Commons:ライセンシング - Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Licensing/ja)
- [文化遺産オンライン 掲載に関する著作権](https://bunkaedit.nii.ac.jp/guide.html)
- [デジタルアーカイブにおける望ましい二次利用条件表示の在り方について(2019年版)](https://www.kantei.go.jp/jp/singi/titeki2/digitalarchive_suisiniinkai/jitumusya/2018/nijiriyou2019.pdf)
- [Wikimedia REST API - MediaWiki](https://www.mediawiki.org/wiki/Wikimedia_REST_API)
- [Wikimedia Analytics API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/getting-started.html)
- [「佐渡島の金山」の世界遺産一覧表への登録決定について - 在ユネスコ日本政府代表部](https://www.unesco.emb-japan.go.jp/itpr_ja/11_000001_00155.html)
- [日本の世界遺産一覧【2026年最新版】(全25件/26件表記あり、要一次情報確認)](https://view-story.net/japan-world-heritage-list/)
- [UNESCO Adds 25 New World Heritage Sites in 2026 (第48回世界遺産委員会・釜山、総数1,273件)](https://www.outlooktraveller.com/News/25-new-unesco-world-heritage-sites-you-need-to-know-about-in-2026)
- GitHub: [gist.github.com/jawj/01c21d04531570cf0206d67748f240d3](https://gist.github.com/jawj/01c21d04531570cf0206d67748f240d3)、[github.com/eprendergast/unesco-api](https://github.com/eprendergast/unesco-api)、[github.com/openmundi/world-heritage](https://github.com/openmundi/world-heritage)(データが2014年時点で古く、Markdown形式のため非推奨)、[github.com/rich-iannone/UWHS](https://github.com/rich-iannone/UWHS)(R用データセット、2014年時点)
