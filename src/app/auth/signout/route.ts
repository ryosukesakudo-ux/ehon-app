import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth";

export async function POST(request: Request) {
  const client = await createAuthClient();
  // このブラウザのログインだけを終える（ほかの端末はログインしたまま）
  await client?.auth.signOut({ scope: "local" }).catch(() => {});
  const res = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  // 通信の失敗などで消えなかった場合に備えて、ログインの Cookie（sb-…）を直接消す
  for (const { name } of (await cookies()).getAll()) {
    if (name.startsWith("sb-")) res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
