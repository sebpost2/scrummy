import { describe, it, expect } from "vitest";

import { boardReducer, columnTasks, type BoardTask } from "@/app/projects/[slug]/board-state";

function task(overrides: Partial<BoardTask> & Pick<BoardTask, "id">): BoardTask {
  return {
    title: overrides.id.toUpperCase(),
    status: "TODO",
    priority: "MEDIUM",
    rank: 0,
    assigneeName: null,
    dueDate: null,
    labels: [],
    subtaskDone: 0,
    subtaskTotal: 0,
    ...overrides,
  };
}

const base: BoardTask[] = [
  task({ id: "a", rank: 1 }),
  task({ id: "b", rank: 2, priority: "HIGH", assigneeName: "Ada" }),
  task({ id: "c", rank: 3, status: "IN_PROGRESS", priority: "LOW" }),
];

describe("boardReducer", () => {
  it("moves a task to a new status without touching others", () => {
    const next = boardReducer(base, { type: "move", taskId: "a", toStatus: "DONE" });
    expect(next.find((t) => t.id === "a")!.status).toBe("DONE");
    expect(next.find((t) => t.id === "b")!.status).toBe("TODO");
    expect(next).not.toBe(base);
  });
  it("is a no-op for an unknown task id", () => {
    const next = boardReducer(base, { type: "move", taskId: "zzz", toStatus: "DONE" });
    expect(next.map((t) => t.status)).toEqual(["TODO", "TODO", "IN_PROGRESS"]);
  });
  it("columnTasks filters by status and sorts by rank", () => {
    const shuffled = [task({ id: "b", rank: 2 }), task({ id: "a", rank: 1 })];
    expect(columnTasks(shuffled, "TODO").map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("reorder updates one task's rank and re-sorts the column", () => {
    const next = boardReducer(base, { type: "reorder", taskId: "a", rank: 2.5 });
    expect(columnTasks(next, "TODO").map((t) => t.id)).toEqual(["b", "a"]);
    expect(next).not.toBe(base);
  });
});
