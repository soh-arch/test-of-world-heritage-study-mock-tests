# 開発・調査環境の制約

検証日: 2026-09-08
検証方法: リモート実行環境上でのコマンド実行

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

### 実装上の帰結

1. **公式サイトの一次確認はこの環境では不可能。** 別環境（ローカル、またはネットワーク制限のないCIランナー）に委任する。
2. データ取得スクリプトを書く場合、**この環境では実行・検証できない**。CI（GitHub Actions）またはローカル実行を前提とし、取得済みJSONをリポジトリにコミットする設計にする。
3. ビルド時に外部APIを叩く構成にはしない。静的アセットとしてデータを同梱する。

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
