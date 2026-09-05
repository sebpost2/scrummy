import Link from "next/link";

import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="container">
      <h1>Log in</h1>
      <LoginForm />
      <p>
        No account? <Link href="/signup">Create one</Link>
      </p>
    </main>
  );
}
