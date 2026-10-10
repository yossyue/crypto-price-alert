# crypto-price-alert

指定した銘柄(ミームコイン含む)が目標価格に達したら、スマホにプッシュ通知を送ります。

- 価格取得: [DEXScreener](https://docs.dexscreener.com/api/reference)(コントラクトアドレス指定。DEX上の新興トークンも対応)
- 通知: [ntfy](https://ntfy.sh)
- 実行: GitHub Actions(5分ごと)
- 操作画面: `docs/index.html`(GitHub Pages)

## 仕組み

| ファイル | 役割 |
|---|---|
| `rules.json` | 監視ルール。Web画面が GitHub API 経由で書き換える |
| `state.json` | 最後に通知した時刻(重複通知防止)。Actions が更新する |
| `src/monitor.js` | 価格取得 → 判定 → ntfy 送信 |
| `.github/workflows/monitor.yml` | 5分ごとに `monitor.js` を実行 |

条件は「指定額以上」「指定額以下」「登録時の価格から +n%」「登録時の価格から -n%」の4種類。
一度通知したルールは、設定した休止時間(初期値24時間)のあいだ再通知しません。

## セットアップ

1. **ntfy**: スマホに ntfy アプリを入れ、推測されにくい長いトピック名(例: `price-alert-x9f3k2m7q1`)を購読する。
2. **Secrets**: Settings → Secrets and variables → Actions → New repository secret
   - 名前 `NTFY_TOPIC` / 値: 上のトピック名
3. **Actions の権限**: Settings → Actions → General → Workflow permissions を **Read and write permissions** にする。
4. **GitHub Pages**: Settings → Pages → Source を `Deploy from branch`、Branch を `main` / `/docs` にする。
5. **トークン**: Settings → Developer settings → Fine-grained tokens で、このリポジトリのみ・Contents の Read and write を許可したものを作成し、Web画面の「設定」に入力する。
6. 動作確認: Actions タブ → monitor → Run workflow。

> このリポジトリは公開です。`rules.json` の銘柄・目標価格は誰でも見られます。ntfy のトピック名とトークンは **絶対にコミットしないでください**(Secrets と手元のブラウザだけに置く)。

## 開発

```
npm test                              # テスト
NTFY_TOPIC=xxx node src/monitor.js    # 手元で1回実行(未設定なら通知せずログ出力)
```
