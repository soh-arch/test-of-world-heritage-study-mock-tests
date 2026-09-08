# 配色のコントラスト比（実測）

検証日: 2026-09-08
検証方法: `contrast.py`（同ディレクトリ）を実行。WCAG 2.x の相対輝度と
コントラスト比の定義に従って算出したもので、外部情報に依存しない。

```
$ python3 docs/research/facts/contrast.py
```

対象は `semantic-color-design-direction.md` で指定されたパレット。

## 前景色 × 背景色

| foreground | bg `#F7F3ED` | surface `#FFFEFB` | bg-sunken `#F0ECE4` |
| --- | ---: | ---: | ---: |
| text `#231E16` | 14.97 | 16.41 | 14.05 |
| text-muted `#534C41` | 7.67 | 8.40 | 7.19 |
| text-faint `#736D62` | 4.64 | 5.09 | 4.35 |
| indigo-text `#316A89` | 5.35 | 5.86 | 5.02 |
| indigo-solid/graphic `#22759E` | 4.63 | 5.07 | 4.34 |
| celadon-text `#486E44` | 5.29 | 5.80 | 4.97 |
| celadon-solid `#4F794A` | 4.56 | 5.00 | 4.28 |
| celadon-graphic `#648F5F` | 3.37 | 3.69 | 3.16 |
| ochre-text `#845C32` | 5.34 | 5.85 | 5.01 |
| ochre-solid `#9B621B` | 4.57 | 5.01 | 4.29 |
| ochre-graphic `#7E4A01` | 6.63 | 7.26 | 6.22 |
| bengara-text `#8E554B` | 5.35 | 5.86 | 5.02 |
| bengara-solid `#AB5649` | 4.57 | 5.01 | 4.29 |
| bengara-graphic `#9F4A3E` | 5.39 | 5.91 | 5.06 |

## 白文字 × solid 背景（ボタン等）

| 背景 | `#FFFEFB` を載せた場合 |
| --- | ---: |
| indigo-solid `#22759E` | 5.07 |
| celadon-solid `#4F794A` | 5.00 |
| ochre-solid `#9B621B` | 5.01 |
| bengara-solid `#AB5649` | 5.01 |

## 判定

WCAG 2.1 の基準（通常サイズ文字: AA 4.5:1 / AAA 7:1、非テキスト要素: 3:1）に照らすと:

- **本文・見出し** `text` `text-muted` は AAA を満たす。
- **有彩色のテキスト** (`*-text`, `*-solid`) はいずれも **AA は満たすが AAA には届かない**（4.5〜5.9）。
  ボタン上の白文字も同様に AA 止まり。
- `text-faint` は bg 上で 4.64 と AA ぎりぎり。**小さい文字には使わない。**
- **`celadon-graphic` `#648F5F` は bg 上で 3.37** となり、テキストには使えない。
  アイコン・データ可視化など非テキスト要素（3:1）専用に限定する。

### 設計上の帰結

1. 正誤・状態の表現を**色だけに依存させない**。アイコンと文言を必ず併用する
   （AAA 未達であること、および色覚特性への配慮の両方の理由から）。
2. `*-graphic` はグラフ・アイコン専用。テキスト色に流用しない。
3. AAA が要件になった場合は、有彩色テキストをより暗い値に差し替える必要がある。
