import { ArrowRight, KeyRound, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { login } from "@/app/auth-actions";
import { getCurrentUser } from "@/lib/auth";

const errorMessages: Record<string, string> = {
  invalid: "Username or password is incorrect.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one" />
      <div className="auth-decoration auth-decoration-two" />
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="auth-brand" href="/" aria-label="LeadsSaarthi home">
          <span className="auth-brand-mark"><MapPin size={19} /></span>
          <span>Leads<span>Saarthi</span></span>
        </Link>
        <div className="auth-kicker">PRIVATE WORKSPACE</div>
        <h1 id="login-title">Welcome back</h1>
        <p className="auth-intro">Sign in to continue to your leads dashboard.</p>

        {error && <p className="auth-alert" role="alert">{errorMessages[error] || "Unable to sign in."}</p>}

        <form className="auth-form" action={login}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={32}
            required
          />
          <div className="password-label-row">
            <label htmlFor="password">Password</label>
            <KeyRound size={14} aria-hidden="true" />
          </div>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
          <button className="auth-submit" type="submit">Sign in <ArrowRight size={16} /></button>
        </form>
        <p className="auth-footnote">Accounts are provisioned by the workspace owner.</p>
      </section>
      <footer className="auth-footer"><span>LEADSSAARTHI</span><span>Business prospecting workspace</span></footer>
    </main>
  );
}