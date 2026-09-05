"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logout } from "@/app/login/actions";

const LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/my-tasks", label: "My tasks" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="nav">
      <Link href="/projects" className="nav__brand">
        <span className="nav__mark" aria-hidden="true" />
        scrummy
      </Link>
      <div className="nav__links">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="nav__link"
            aria-current={pathname?.startsWith(link.href) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
        <form action={logout}>
          <button type="submit" className="button button--link">
            Log out
          </button>
        </form>
      </div>
    </nav>
  );
}
