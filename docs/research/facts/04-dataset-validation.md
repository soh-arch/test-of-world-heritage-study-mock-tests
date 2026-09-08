# 確定データの検証

検証日: 2026-09-08
検証方法: `validate_datasets.py`（同ディレクトリ）を実行

```
$ python3 docs/research/facts/validate_datasets.py
japan sites          : 27 ({'cultural': 22, 'natural': 5})
world candidates     : 84 active, 3 delisted
category ratios      : 1.0
question estimates   : 60
NOTE  region_jp holds a composite string for ['jp-meiji-industrial-revolution', 'jp-jomon'];
      normalise to a list before using it for region-based questions
exit=0
```

## 出所

`data/` の3ファイルと `exam-spec.md` は、ネットワーク制限のない環境の調査エージェントが
2026-09-09 に一次情報へ**直接アクセスして**作成したもの。
`sekaken.jp`（検定公式）／`pamon.sekaken.jp`（検定公式DB）／`bunka.go.jp`（文化庁）／
`whc.unesco.org`／J-PlatPat（特許庁）／Wikidata SPARQL（実クエリ実行）が出典。

ただし `facts/` に置くのは**レポート内で確度「確定」とされた項目**に限る趣旨である。
レポート内には確度「推定」「不明」の項目も含まれるため、
**個々の記述の確度表記を必ず確認すること。** 未確定項目は `../open-questions.md` に残してある。

## 通った検査

| 検査 | 結果 |
| --- | --- |
| 日本27件・ID重複なし | ✅ |
| 種別の内訳 文化22 / 自然5 | ✅ UNESCO公表値と一致 |
| 登録基準が 1〜10 の範囲・重複なし | ✅ |
| **登録基準と種別の整合**（文化=i〜vi / 自然=vii〜x / 複合=両方） | ✅ 全111件 |
| 登録年が 1978〜2030 の範囲 | ✅ |
| `japan-sites.json` の件数と `exam-config.json` の `scope.japan_sites_count` | ✅ 一致 |
| 分野比率の合計 | ✅ 1.0 |
| 分野別問題数の合計 | ✅ 60問 |
| 世界候補の内訳 | 有効84件（文化65 / 自然14 / 複合5）＋登録抹消3件 |

Wikidata が誤っていた `セレンゲティ国立公園` の登録年は、本データでは正しく **1981** になっている
（Wikidata は 1960。調査レポート §2-1 参照）。

## 実装前に直すべき点

### 1. `region_jp` が単一文字列になっている

2件が複合値を持つ。

- `jp-meiji-industrial-revolution` → `"九州・沖縄・中国・東北・中部"`（8県）
- `jp-jomon` → `"北海道・東北"`（4道県）

地方を使った問題（所在地問題、同地方からの誤答選択肢生成）が破綻するため、
実装時に **`region_jp: string[]` へ正規化する**。

### 2. 名称のダッシュ記号が3種類混在

`─`(U+2500) / `－`(U+FF0D) / `‐`(U+2010) が混在し、検定表記と文化庁表記でも異なる。
**正誤判定は必ず `id` で行い**、表示文字列の比較には使わないこと。
表示は検定表記（`name_ja`）を正とし、文化庁表記（`name_ja_alt_bunkacho`）はエイリアスとして保持する。

### 3. 世界候補84件のうち63件は「推定」

`in_textbook_confidence` が `推定` のものは、公式テキストの掲載ページ番号からの逆算であり、
**その遺産が本当に3級の範囲かは未確定**。遺産の属性（名称・年・国・基準）自体は pamon 由来で確定。
第1版は日本27件のみを使うため、この不確かさは第2版まで顕在化しない。
