import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import OpenAI from "openai";

// 外部サービスのキーが未設定のときは「デモモード」で動く（画像は仮の絵、決済はスキップ）。

export const PHOTO_BUCKET = "photos";
export const BOOK_BUCKET = "books";
export const SAMPLE_BUCKET = "samples";

let supabase: SupabaseClient | null | undefined;
export function getSupabase(): SupabaseClient | null {
  if (supabase !== undefined) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return supabase;
}

let stripe: Stripe | null | undefined;
export function getStripe(): Stripe | null {
  if (stripe !== undefined) return stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  stripe = key ? new Stripe(key) : null;
  return stripe;
}

let openai: OpenAI | null | undefined;
export function getOpenAI(): OpenAI | null {
  if (openai !== undefined) return openai;
  const key = process.env.OPENAI_API_KEY;
  openai = key ? new OpenAI({ apiKey: key }) : null;
  return openai;
}

export function siteUrl(request: Request) {
  return process.env.SITE_URL ?? new URL(request.url).origin;
}
