"use client";

import { clearLocalFlow } from "../create/flow-storage";

// ログアウトしたら、このブラウザに残っている作りかけ（名前・写真）も消す。
// 別のアカウントでログインし直したときに、前のアカウントの内容が引き継がれないように。
export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post" onSubmit={() => clearLocalFlow()}>
      <button type="submit" className="ghost" style={{ width: "100%" }}>ログアウト</button>
    </form>
  );
}
