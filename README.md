# わたしの絵本

子どもやママの写真から、その子が主人公の絵本を AI で作り、製本して届けるサービスの試作版です。

## 画面の流れ

トップ → テイスト選択 → お話と名前 → 写真アップロード → 見本プレビュー →（会員登録・ログイン）→ サイズと見積もり → 注文確認 → 決済（Stripe）→ 完了

- 見本プレビューでは、お話のうち3場面だけ絵を作ります。残りはご注文後に管理画面から作ります。
- 会員登録なしでも、ブラウザごと・IPアドレスごとに1回だけ見本3枚を作れます（作り直しなし）。
- 会員（Google、またはメールアドレス＋パスワードでログイン）は、プレビューを月30枚まで作れます（作り直しを含む）。注文は会員のみ。
- マイページ `/account` で、作った絵本の絵、注文状況、保存している写真の確認・削除ができます。
- お届け先・電話・メール・カード情報は Stripe の決済画面で入力します。
- 管理画面 `/admin`（ユーザー名 `admin`、パスワードは `ADMIN_PASSWORD`）で、支払い済みの注文の全ページ作成、制作完了、発送済みの記録ができます。

## 作例スタジオ

`/admin/samples` で、実在しない家族の見本の絵（3テイスト × 3話 × 3場面 = 27枚）を作れます。作った絵は Supabase の公開ストレージ `samples` に保存され、トップページ・テイスト選択・お話選択にすぐ表示されます。まだ無い絵は `[見本]` の仮表示のままです。

## 試作スタジオ

`/admin/trial` で、子ども（必須）・ママ・パパの写真から、お話ごとの全場面の絵をまとめて作れます。注文や決済は通らず、写真と絵はサーバーに保存しません。必要な設定は `OPENAI_API_KEY` と `ADMIN_PASSWORD` だけです。

## 手元で動かす

```bash
npm install
npm run dev
```

http://localhost:3000 を開きます。キーを何も設定しなければ「デモモード」で動き、絵は仮の画像、決済はスキップされます。

## 本番の設定

`.env.example` を `.env.local` にコピーして値を入れます（Vercel では Environment Variables に同じ名前で設定）。

1. **Supabase**：プロジェクトを作り、SQL Editor で `supabase/schema.sql` を実行。`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` を設定。
   - Authentication > URL Configuration：Site URL にサイトのURL、Redirect URLs に `https://<サイトのURL>/auth/callback` を追加。
   - Authentication > Emails（Email Templates）：`docs/email-templates.md` の日本語の文面に置き換える。パスワード再設定は別のブラウザで開いても使えるよう implicit 方式で送り、`/auth/callback` → `/reset-password` で受け取る。
   - Authentication > Sign In / Providers > Email：**Confirm email** をオン、**Minimum password length** を 8 にする（`src/lib/password.ts` と合わせる）。ログインはメールアドレス＋パスワード。パスワードを忘れたときは再設定メールから `/account/password` で決め直す。
   - Authentication > Providers：Email は最初から有効。Google は Google Cloud で OAuth クライアントを作り、Client ID と Secret を入れて有効にする（承認済みのリダイレクトURIは Supabase の画面に表示される `https://<project>.supabase.co/auth/v1/callback`）。ログイン画面の Google ボタンは、Supabase で Google が有効なときだけ表示される。
2. **OpenAI**：`OPENAI_API_KEY` を設定。モデルは `gpt-image-2`（`OPENAI_IMAGE_MODEL` で変更可）。
3. **Stripe**：テストモードの `STRIPE_SECRET_KEY` を設定。Webhook の送信先を `https://<サイトのURL>/api/stripe/webhook`、イベントを `checkout.session.completed` と `checkout.session.async_payment_succeeded`（コンビニ払い用）にして、表示される署名シークレットを `STRIPE_WEBHOOK_SECRET` に設定。お客様への支払い完了メールは Stripe ダッシュボードの「メールによる領収書」を有効にする。
4. **支払い方法**：Stripe ダッシュボードの「設定 > 支払い方法」で、カード・Apple Pay・Google Pay・コンビニ決済・PayPay を有効にする（PayPay は申請が必要）。コードの変更は不要です。
5. **管理画面と自動削除**：`ADMIN_PASSWORD` と `CRON_SECRET` に長いランダムな文字列を設定。

## 写真と絵の保管期間

毎日の自動処理（`vercel.json` の Cron → `/api/cron/cleanup`）で削除します。期間は `src/lib/catalog.ts` の `RETENTION` で変えられます。

- 会員の写真：保管し、次の絵本でも選べる。マイページからいつでも削除でき、最後に使ってから1年で自動削除。
- 登録前のお試しの写真：3日以内に会員登録されなければ削除。
- 注文されなかった下書きの絵：作成から30日で削除。
- 支払い済みの注文の絵：支払いから100日で削除（制作完了・発送済みのもの）。

## 公開前に残っていること

- `src/app/legal`（特定商取引法に基づく表記）と `src/app/privacy` の `[ ]` を実際の内容にする
- お話の文章（`src/lib/catalog.ts`）を確定させる。L サイズ（32ページ）のページ構成を決める
- 印刷用データ（本文入りの PDF）の作成。現在は挿絵の画像のみ作成
- 作例スタジオで見本の絵を作る（トップの表紙・テイスト見本などが差し替わる）
- Apple でのログイン（Apple Developer Program への登録が必要）
