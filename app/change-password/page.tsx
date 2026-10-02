import { ArrowLeft, KeyRound, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { changePassword } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

const errorMessages: Record<string, string> = {
  current: "Current password is incorrect.",
  length: "Choose a password between 12 and 128 characters.",
  mismatch: "The new passwords do not match.",
};

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  if (!(await getCurrentUser())) redirect("/login");
  const { error, success } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card password-card" aria-labelledby="password-title">
        <a className="auth-brand" href="/dashboard" aria-label="LeadsSaarthi dashboard">
          <span className="auth-brand-mark"><MapPin size={19} /></span>
          <span>Leads<span>Saarthi</span></span>
        </a>
        <div className="auth-kicker">ACCOUNT SECURITY</div>
        <h1 id="password-title">Change password</h1>
        <p className="auth-intro">Use your current password to choose a new one.</p>

        {error && <p className="auth-alert" role="alert">{errorMessages[error] || "Unable to change password."}</p>}
        {success && <p className="auth-success" role="status">Password updated. Your other sessions have been signed out.</p>}

        <form className="auth-form" action={changePassword}>
          <label htmlFor="currentPassword">Current password</label>
          <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
          <label htmlFor="newPassword">New password</label>
          <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
          <p className="password-hint">Use at least 12 characters.</p>
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required />
          <button className="auth-submit" type="submit">Update password <KeyRound size={15} /></button>
        </form>
        <Link className="auth-back-link" href="/dashboard"><ArrowLeft size={14} /> Back to dashboard</Link>
      </section>
      <footer className="auth-footer"><span>LEADSSAARTHI</span><span>Business prospecting workspace</span></footer>
    </main>
  );
}