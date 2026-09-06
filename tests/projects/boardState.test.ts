import { describe, it, expect } from "vitest";

import { boardReducer, columnTasks, type BoardTask } from "@/app/projects/[slug]/board-state";

const base: BoardTask[] = [
  { id: "a", title: "A", status: "TODO", priority: "MEDIUM", assigneeName: null, dueDate: null, labels: [] },
  { id: "b", title: "B", status: "TODO", priority: "HIGH", assigneeName: "Ada", dueDate: null, labels: [] },
  { id: "c", title: "C", status: "IN_PROGRESS", priority: "LOW", assigneeName: null, dueDate: null, labels: [] },
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
  it("columnTasks filters by status preserving order", () => {
    expect(columnTasks(base, "TODO").map((t) => t.id)).toEqual(["a", "b"]);
  });
});
