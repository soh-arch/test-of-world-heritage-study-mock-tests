# Facts — 検証済みの事実

ここに置いてよいのは、**一次情報で裏取りされたもの**、または
**このリポジトリ内で再現・追試できるもの**だけ。
伝聞・Web検索スニペット由来の未検証情報を書いてはならない（それは `../llm-extracted/` へ）。

各ファイルは冒頭に **検証日・検証方法** を記載する。

## 内容

| ファイル | 内容 | 検証 |
| --- | --- | --- |
| `01-environment.md` | 実行環境のネットワーク制約とツールチェーン | コマンド実行結果 |
| `02-color-contrast.md` | 配色のWCAGコントラスト比 | `contrast.py` による実測 |
| `03-unesco-mirror-dataset.md` | UNESCO公式データのGitHubミラーの構造 | 実際にcloneして確認 |
| `04-dataset-validation.md` | `data/` の検証結果と実装前に直すべき点 | `validate_datasets.py` による検査 |
| `05-question-type-gap.md` | 公式の出題類型と実装の突合表 | 設定とコードから再現 |
| `06-official-worksheets.md` | 公式学習プリント9枚・51問の測定結果 | PDFを読んで集計（PDFは非同梱） |
| `exam-spec.md` | **3級の試験仕様レポート**（一次情報確認済み） | 公式サイト等へ直接アクセス（2026-09-09） |
| `data/exam-config.json` | 出題アルゴリズムの設定値 | 同上 |
| `data/japan-sites.json` | **日本の世界遺産27件**（全件確度「確定」） | 同上＋スキーマ検査 |
| `data/world-sites-candidates.json` | 世界の遺産候補87件（有効84＋抹消3） | 同上。ただし63件は3級範囲かが「推定」 |
| `contrast.py` / `validate_datasets.py` | 上記を再現するスクリプト | — |

## 注意

`exam-spec.md` には確度「確定」「推定」「不明」が混在している。
**`facts/` にあるからといって全記述が確定ではない。** 個々の確度表記を必ず確認すること。
未確定のまま残っている項目は `../open-questions.md` にある。
