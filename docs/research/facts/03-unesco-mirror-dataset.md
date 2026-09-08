# UNESCO公式データのGitHubミラー（実物確認）

検証日: 2026-09-08
検証方法: `git clone https://gist.github.com/01c21d04531570cf0206d67748f240d3.git` で
実際に取得し、ファイルの中身を確認した。再現可能。

> **注意**: 取得したCSVは **このリポジトリにコミットしていない**。
> UNESCO由来データの再配布条件（`../llm-extracted/B-data-sources.md` 参照）が未確認のため。
> ここに記録するのは「ファイルの構造」という事実のみ。

## 取得したもの

- Gist `jawj/01c21d04531570cf0206d67748f240d3` の `whc-sites-2021.csv`
- サイズ: 2,194,673 バイト
- ファイル内の記載: `Data from https://whc.unesco.org/en/syndication/ converted to CSV | Copyright © 1992 – 2022 UNESCO/World Heritage Centre`

## フィールド構成（37列）

```
unique_number, id_no, rev_bis, name_en, name_fr,
short_description_en, short_description_fr,
justification_en, justification_fr,
date_inscribed, secondary_dates,
danger, date_end, danger_list,
longitude, latitude, area_hectares,
C1,C2,C3,C4,C5,C6, N7,N8,N9,N10,
criteria_txt,
category, category_short,
states_name_en, states_name_fr,
region_en, region_fr,
iso_code, udnp_code, transboundary
```

- `C1`〜`N10` は登録基準 (i)〜(x) の 0/1 フラグ
- `criteria_txt` は `"(i)(iv)"` のような文字列
- `category` は `Cultural` / `Natural` / `Mixed`

## 実データの内訳（2021年スナップショット）

| 項目 | 値 |
| --- | ---: |
| 総件数 | 1,154 |
| Cultural | 897 |
| Natural | 218 |
| Mixed | 39 |
| 危機遺産 (`danger=1`) | 52 |

## 重要な欠落: 日本語がない

**日本語フィールドは存在しない。** 英語(`_en`)とフランス語(`_fr`)のみ。
これはミラー側の欠落ではなく、UNESCO公式のsyndication自体が英仏2言語構成であることによる。

日本の遺産のレコード例（`name_en` のみ）:

```
Buddhist Monuments in the Horyu-ji Area
```

### 実装上の帰結

日本語の検定ツールを作る以上、**遺産の日本語名称は別途用意しなければならない**。
これがデータ設計の起点になる。選択肢は次の3つ。

1. **自前で日本語ファクトデータを作成する**（3級の対象は日本26件＋世界100件程度＝約126件と小規模）
2. Wikidata（CC0、日本語ラベルあり）から取得する — ただしこの環境では未検証
3. UNESCO由来データを翻訳して使う — 再配布条件の問題が残るため非推奨

## データサイズの見積もり

問題生成に必要な最小フィールドのみのJSONに落とすと、1,154件で約332KB。
現在の登録件数（1,200件超）でも400KB程度に収まる。
**GitHub Pages で静的配信するのに分割は不要。**
3級の範囲（約126件）に絞れば、さらに一桁小さくなる。
