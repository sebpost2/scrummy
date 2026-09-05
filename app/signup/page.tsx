import Link from "next/link";

import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="container container--narrow">
      <div className="stack">
        <Link href="/" className="hero__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1>Create an account</h1>
        <SignupForm />
        <p className="page-header__subtitle">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
