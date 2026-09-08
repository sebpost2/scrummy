import Link from "next/link";

import type { NavNotificationItem } from "@/lib/notifications/queries";

import ProjectSwitcher from "./ProjectSwitcher";
import UserMenu from "./UserMenu";
import ThemeToggle from "./ThemeToggle";
import MobileNavBar from "./MobileNavBar";
import NotificationsBell from "./NotificationsBell";

const LINKS = [
  { href: "/projects", label: "Projects" },
  { href: "/my-tasks", label: "My tasks" },
];

export function Nav({
  user,
  projects = [],
  currentSlug,
  notifications,
}: {
  user: { name: string; email: string };
  projects?: { name: string; slug: string }[];
  currentSlug?: string;
  notifications: { unreadCount: number; items: NavNotificationItem[] };
}) {
  return (
    <>
      <nav className="nav">
        <Link href="/projects" className="nav__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        {projects.length > 0 && (
          <ProjectSwitcher projects={projects} currentSlug={currentSlug} />
        )}
        <div className="nav__links">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="nav__link">
              {l.label}
            </Link>
          ))}
          <NotificationsBell unreadCount={notifications.unreadCount} items={notifications.items} />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </nav>
      <MobileNavBar />
    </>
  );
}
