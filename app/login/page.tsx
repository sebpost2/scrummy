import Link from "next/link";

import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="container container--narrow">
      <div className="stack">
        <Link href="/" className="hero__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1>Log in</h1>
        <LoginForm />
        {error === "google" && <p className="form-error">Google sign-in failed. Please try again.</p>}
        {error === "google_email_taken" && (
          <p className="form-error">
            An account with that email already exists. Log in with your password.
          </p>
        )}
        <a href="/api/auth/google" className="button button--secondary">
          Continue with Google
        </a>
        <p className="page-header__subtitle">
          No account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </main>
  );
}
