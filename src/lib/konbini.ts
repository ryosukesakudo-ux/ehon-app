import "server-only";
import { getStripe } from "./services";

export type KonbiniVoucher = { url: string; expiresAt: Date | null };

/**
 * コンビニ払いのお支払い番号の画面（Stripe が用意するページ）のURLと期限。
 * コンビニ払いは、決済画面のあとサイトに戻らずこの画面で終わるため、メールやマイページから開けるようにする。
 * コンビニ払いでない・支払い済み・期限切れのときは null。
 */
export async function konbiniVoucher(paymentIntentId: string | null | undefined): Promise<KonbiniVoucher | null> {
  const stripe = getStripe();
  if (!stripe || !paymentIntentId) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const details = pi.status === "requires_action" ? pi.next_action?.konbini_display_details : null;
    if (!details?.hosted_voucher_url) return null;
    const expiresAt = details.expires_at ? new Date(details.expires_at * 1000) : null;
    if (expiresAt && expiresAt.getTime() < Date.now()) return null;
    return { url: details.hosted_voucher_url, expiresAt };
  } catch (e) {
    console.error("konbini voucher lookup failed", e);
    return null;
  }
}
