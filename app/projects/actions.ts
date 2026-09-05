"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createProject } from "@/lib/projects/mutations";

export type NewProjectState = { status: "idle" } | { status: "error"; message: string };

export async function createProjectAction(_prev: NewProjectState, formData: FormData): Promise<NewProjectState> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { status: "error", message: "Project name is required." };

  const project = await createProject(user.id, name);
  redirect(`/projects/${project.slug}`);
}
