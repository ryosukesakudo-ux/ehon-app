import { NextResponse } from "next/server";
import { createAuthClient } from "@/lib/auth";

export async function POST(request: Request) {
  const client = await createAuthClient();
  await client?.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
