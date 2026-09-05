import Link from "next/link";

import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <main className="container">
      <h1>Create an account</h1>
      <SignupForm />
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
