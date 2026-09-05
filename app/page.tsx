import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <h1>Scrummy</h1>
      <p>A small task tracker with traceability.</p>
      <p>
        <Link className="button" href="/login">
          Log in
        </Link>{" "}
        <Link className="button button--link" href="/signup">
          Create an account
        </Link>
      </p>
    </main>
  );
}
