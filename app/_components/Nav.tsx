import Link from "next/link";

import { logout } from "@/app/login/actions";

export function Nav() {
  return (
    <nav className="nav">
      <div>
        <Link href="/projects">Projects</Link> <Link href="/my-tasks">My tasks</Link>
      </div>
      <form action={logout}>
        <button type="submit" className="button button--link">
          Log out
        </button>
      </form>
    </nav>
  );
}
