# Supabase のメール文面（日本語）

Supabase の左メニュー **Authentication** → **Emails** を開き、上のタブごとに **Subject**（件名）と本文（**Source** / Body の欄）を下の内容にまるごと置き換えて、**Save** を押してください。
`{{ .ConfirmationURL }}` などの `{{ }}` の部分は、そのまま残してください（ボタンのリンクになります）。

---

## Reset Password（パスワードの再設定）

**Subject**
```
【わたしの絵本】パスワード再設定のご案内
```

**本文**
```html
<p>わたしの絵本をご利用いただき、ありがとうございます。</p>
<p>パスワード再設定のお申し込みを受け付けました。<br>下のボタンを押して、新しいパスワードを決めてください。</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;border-radius:24px;background:#F08A6C;color:#ffffff;font-weight:bold;text-decoration:none;">パスワードを再設定する</a></p>
<p>このリンクの有効期限は1時間です。期限が切れた場合は、ログイン画面の「パスワードを忘れた方・まだ決めていない方」から、もう一度お申し込みください。</p>
<p>お心当たりのない場合は、このメールを破棄してください。パスワードは変更されません。</p>
<p>わたしの絵本</p>
```

---

## Confirm signup（新規登録の確認）

**Subject**
```
【わたしの絵本】会員登録の確認
```

**本文**
```html
<p>わたしの絵本へのご登録、ありがとうございます。</p>
<p>下のボタンを押すと、会員登録が完了します。</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;border-radius:24px;background:#F08A6C;color:#ffffff;font-weight:bold;text-decoration:none;">登録を完了する</a></p>
<p>次回からは、メールアドレスとパスワードでログインできます。</p>
<p>お心当たりのない場合は、このメールを破棄してください。</p>
<p>わたしの絵本</p>
```

---

## Change Email Address（メールアドレスの変更）

**Subject**
```
【わたしの絵本】メールアドレス変更の確認
```

**本文**
```html
<p>わたしの絵本のメールアドレスを {{ .Email }} から {{ .NewEmail }} に変更するお申し込みを受け付けました。</p>
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:12px 24px;border-radius:24px;background:#F08A6C;color:#ffffff;font-weight:bold;text-decoration:none;">変更を確定する</a></p>
<p>お心当たりのない場合は、このメールを破棄してください。</p>
<p>わたしの絵本</p>
```

参考：Supabase「Email Templates」 https://supabase.com/docs/guides/auth/auth-email-templates
