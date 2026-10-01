import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// 会員ログイン（Supabase Auth）。ログイン状態はCookieに入り、proxy.ts が毎回更新する。
// Supabase が未設定のデモモードでは、ログインは使えず誰でも非会員として扱う。

export function authKeys() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export async function createAuthClient() {
  const keys = authKeys();
  if (!keys) return null;
  const store = await cookies();
  return createServerClient(keys.url, keys.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Component からは書き込めない。更新は proxy.ts が行う。
        }
      },
    },
  });
}

export type Member = { id: string; email: string | null };

export async function currentUser(): Promise<Member | null> {
  const client = await createAuthClient();
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}
