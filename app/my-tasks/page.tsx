import Link from "next/link";

import { Nav } from "@/app/_components/Nav";
import { requireUser } from "@/lib/auth/session";
import { getMyTasks } from "@/lib/tasks/queries";

export default async function MyTasksPage() {
  const user = await requireUser();
  const tasks = await getMyTasks(user.id);

  if (tasks.length === 0) {
    return (
      <main className="container">
        <Nav />
        <h1>My tasks</h1>
        <p>You have nothing assigned right now.</p>
      </main>
    );
  }

  const byProject = new Map<string, { name: string; slug: string; tasks: typeof tasks }>();
  for (const task of tasks) {
    const entry = byProject.get(task.project.id) ?? { name: task.project.name, slug: task.project.slug, tasks: [] };
    entry.tasks.push(task);
    byProject.set(task.project.id, entry);
  }

  return (
    <main className="container">
      <Nav />
      <h1>My tasks</h1>
      {[...byProject.values()].map((group) => (
        <section key={group.slug}>
          <h2>{group.name}</h2>
          {group.tasks.map((task) => (
            <Link key={task.id} href={`/projects/${group.slug}/tasks/${task.id}`} className="card">
              <div className="card__title">{task.title}</div>
              <div className="card__meta">
                <span className="badge">{task.status}</span>
                <span className="badge">{task.priority}</span>
                {task.dueDate && <span className="badge">{task.dueDate.toISOString().slice(0, 10)}</span>}
              </div>
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}
