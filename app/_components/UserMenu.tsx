"use client";

import { logout } from "@/app/login/actions";

import Menu from "./Menu";
import Avatar from "./Avatar";

export default function UserMenu({ user }: { user: { name: string; email: string } }) {
  return (
    <Menu align="end" trigger={<Avatar name={user.name} size="sm" />}>
      <div className="menu__header">
        <span className="menu__header-name">{user.name}</span>
        <span className="menu__header-email">{user.email}</span>
      </div>
      <div className="menu__sep" role="separator" />
      <form action={logout}>
        <button type="submit" className="menu__item menu__item--danger" role="menuitem">
          Log out
        </button>
      </form>
    </Menu>
  );
}
