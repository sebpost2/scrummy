import Link from "next/link";

import { SignupForm } from "./SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;

  return (
    <main className="container container--narrow">
      <div className="auth">
        <Link href="/" className="auth__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1 className="auth__title">Create an account</h1>
        <SignupForm invite={invite} />
        <p className="auth__alt">
          Already have an account? <Link href={invite ? `/login?invite=${invite}` : "/login"}>Log in</Link>
        </p>
      </div>
    </main>
  );
}
