"use client";

import { ChevronsUpDown } from "lucide-react";

import Menu, { MenuItem, MenuSeparator } from "./Menu";

export default function ProjectSwitcher({
  projects,
  currentSlug,
}: {
  projects: { name: string; slug: string }[];
  currentSlug?: string;
}) {
  const current = projects.find((p) => p.slug === currentSlug);
  return (
    <Menu
      align="start"
      trigger={
        <>
          <span className="nav__project">{current?.name ?? "Projects"}</span>
          <ChevronsUpDown size={13} />
        </>
      }
    >
      {projects.map((p) => (
        <MenuItem key={p.slug} href={`/projects/${p.slug}`}>
          {p.name}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem href="/projects">All projects</MenuItem>
    </Menu>
  );
}
