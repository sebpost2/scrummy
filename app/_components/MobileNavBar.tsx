import Link from "next/link";
import { LayoutGrid, ListChecks } from "lucide-react";

export default function MobileNavBar() {
  return (
    <nav className="mobile-nav" aria-label="Primary">
      <Link href="/projects" className="mobile-nav__link">
        <LayoutGrid size={20} />
        <span>Projects</span>
      </Link>
      <Link href="/my-tasks" className="mobile-nav__link">
        <ListChecks size={20} />
        <span>My tasks</span>
      </Link>
    </nav>
  );
}
