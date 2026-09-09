# 開発・調査環境の制約

検証日: 2026-09-08、2026-09-09（ネットワーク方針の変更後に再測定）
検証方法: リモート実行環境上でのコマンド実行

## 2026-09-09 更新：外部アクセスが可能になった

利用者が環境のネットワーク方針を変更したため、**一次情報へ直接到達できるようになった**。
実測値（2026-09-09）:

```
https://www.sekaken.jp/            200   世界遺産検定 公式
https://pamon.sekaken.jp/          200   検定公式の遺産データベース
https://www.bunka.go.jp/           200   文化庁
https://ja.wikipedia.org/          200
https://whc.unesco.org/en/faq/126  200
https://query.wikidata.org/sparql  200   User-Agent を付けること
https://www.j-platpat.inpit.go.jp/ 302   特許庁
```

- `https://whc.unesco.org/en/list/` は 403 を返すが、これは **UNESCO側のボット対策**であり、
  プロキシによる遮断ではない（同じホストの FAQ ページは 200 で読める）。
- 公式3級ページから「問題の比率」の表を直接取得し、
  **基礎知識25% / 日本の遺産30% / 世界の自然遺産10% / 世界の文化遺産30% / その他5%** を
  この環境で確認した。

**これ以降の調査・検証は一次情報にあたること。** 検索スニペットで代替しない。

---

## 以下は 2026-09-08 時点の記録（変更前）

## ネットワークegressの制限

このリモート実行環境は、パッケージレジストリとGitHub以外への外向き通信を遮断している。

```
$ curl -sS -o /dev/null --max-time 20 https://whc.unesco.org/en/list/xml/
curl: (56) CONNECT tunnel failed, response 403

$ curl -sS -o /dev/null --max-time 20 https://www.sekaken.jp/
curl: (56) CONNECT tunnel failed, response 403

$ curl -sS -o /dev/null --max-time 20 "https://query.wikidata.org/sparql?..."
curl: (56) CONNECT tunnel failed, response 403
```

プロキシのステータス（`$HTTPS_PROXY/__agentproxy/status`）に記録された拒否ログでも、
以下のホストが `connect_rejected`（gateway answered 403 to CONNECT）となっている。

- `ja.wikipedia.org` / `www.wikidata.org` / `query.wikidata.org` / `dbpedia.org`
- `commons.wikimedia.org`
- `bunka.go.jp` / `bunkaisan.bunka.go.jp`

### 到達可能なホスト

`noProxy` に列挙されているもの（直結）:
`registry.npmjs.org`, `jsr.io`, `pypi.org`, `files.pythonhosted.org`,
`index.crates.io`, `proxy.golang.org`, `api.anthropic.com`

加えて、調査中に実際に疎通が確認できたもの:

- `https://github.com/` — `git clone` 成功
- `https://gist.github.com/<id>.git` — `git clone` 成功
- `https://api.github.com/` — 制限付きで到達
- `https://raw.githubusercontent.com/` — HEAD/リダイレクトのみ、実体取得は不可

### 当時の実装上の帰結

1. 公式サイトの一次確認はこの環境では不可能だった（**2026-09-09 に解消**）。
2. データ取得スクリプトはこの環境で実行・検証できなかった（**同上**）。
3. **ビルド時に外部APIを叩く構成にはしない。静的アセットとしてデータを同梱する。**
   これは現在も維持している方針。到達できるようになっても、
   公開ページの動作を外部サービスの可用性に依存させない。

## ツールチェーン

```
$ node -v   → v22.22.2
$ npm -v    → 10.9.7
$ pnpm -v   → 10.33.0
$ python3 -V → Python 3.11.15
```

## リポジトリの初期状態

```
$ git status -sb
## No commits yet on claude/world-heritage-exam-tool-t87m2s
```

調査開始時点でコミットは存在せず、`.git` のみの空リポジトリだった。
