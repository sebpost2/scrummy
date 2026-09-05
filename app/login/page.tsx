import Link from "next/link";

import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="container container--narrow">
      <div className="stack">
        <Link href="/" className="hero__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1>Log in</h1>
        <LoginForm />
        <p className="page-header__subtitle">
          No account? <Link href="/signup">Create one</Link>
        </p>
      </div>
    </main>
  );
}
