import { Nav } from "@/app/_components/Nav";
import { PageHeader } from "@/app/_components/PageHeader";
import { EmptyState } from "@/app/_components/EmptyState";
import { TaskRow } from "@/app/_components/TaskCard";
import { requireUser } from "@/lib/auth/session";
import { getNavProjects } from "@/lib/projects/queries";
import { getMyTasks } from "@/lib/tasks/queries";

export default async function MyTasksPage() {
  const user = await requireUser();
  const tasks = await getMyTasks(user.id);

  const navProjects = await getNavProjects(user.id);

  const byProject = new Map<string, { name: string; slug: string; tasks: typeof tasks }>();
  for (const task of tasks) {
    const entry = byProject.get(task.project.id) ?? { name: task.project.name, slug: task.project.slug, tasks: [] };
    entry.tasks.push(task);
    byProject.set(task.project.id, entry);
  }

  return (
    <>
      <Nav
        user={{ name: user.name, email: user.email }}
        projects={navProjects.map((m) => ({ name: m.project.name, slug: m.project.slug }))}
      />
      <main className="container">
        <div className="stack">
          <PageHeader title="My tasks" subtitle="Everything assigned to you, grouped by project." />

          {tasks.length === 0 ? (
            <EmptyState
              title="Nothing assigned"
              body="When a teammate assigns you a task, it shows up here."
            />
          ) : (
            [...byProject.values()].map((group) => (
              <section key={group.slug} className="tasklist">
                <h2 className="tasklist__project">{group.name}</h2>
                <div className="tasklist__rows">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      href={`/projects/${group.slug}/tasks/${task.id}`}
                      title={task.title}
                      status={task.status}
                      priority={task.priority}
                      dueDate={task.dueDate}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </>
  );
}
