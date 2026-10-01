import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { PasswordForm } from "./form";

export const dynamic = "force-dynamic";

// パスワードを決める・変える画面。再設定メールのリンクからもここに来る。
export default async function PasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account/password");
  return (
    <div className="shell">
      <PageHeader title="パスワードの設定" />
      <main className="step-body">
        <p className="step-lead">{user.email} でログインするときのパスワードを決めてください。次からはメールを待たずにログインできます。</p>
        <PasswordForm />
      </main>
    </div>
  );
}
