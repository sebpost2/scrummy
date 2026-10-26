import Link from "next/link";

import { startDemo } from "./actions";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error, invite } = await searchParams;

  return (
    <main className="container container--narrow">
      <div className="auth">
        <Link href="/" className="auth__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1 className="auth__title">Log in</h1>
        <LoginForm invite={invite} />
        {error === "google" && <p className="form-error">Google sign-in failed. Please try again.</p>}
        {error === "google_email_taken" && (
          <p className="form-error">
            An account with that email already exists. Log in with your password.
          </p>
        )}
        <div className="divider">
          <span>or</span>
        </div>
        <a href="/api/auth/google" className="button button--secondary auth__google">
          Continue with Google
        </a>
        <form action={startDemo}>
          <button type="submit" className="button button--secondary auth__google">
            Try the demo — no sign-up
          </button>
        </form>
        {error === "demo_throttled" && (
          <p className="form-error">Too many demo sessions from here. Wait a minute and try again.</p>
        )}
        <p className="auth__alt">
          No account? <Link href={invite ? `/signup?invite=${invite}` : "/signup"}>Create one</Link>
        </p>
      </div>
    </main>
  );
}
