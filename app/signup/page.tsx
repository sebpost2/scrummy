import Link from "next/link";

import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="container container--narrow">
      <div className="auth">
        <Link href="/" className="auth__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1 className="auth__title">Create an account</h1>
        <SignupForm />
        <p className="auth__alt">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
