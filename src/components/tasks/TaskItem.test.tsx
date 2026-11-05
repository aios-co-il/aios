import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { withTestQuery } from "@/test/withTestQuery";
import { TaskItem } from "./TaskItem";

afterEach(cleanup);

describe("TaskItem relation badges", () => {
  it("renders PostgREST embedded counts rather than the count row length", () => {
    render(
      withTestQuery(
        <TaskItem
          task={{
            id: "task",
            title: "Task",
            status: "todo",
            client_id: null,
            task_updates: [{ count: 3 }],
            task_collaborators: [{ count: 5 }],
          }}
          onClick={() => {}}
          onToggleComplete={() => {}}
        />,
      ),
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("keeps legacy row counts and hides empty relation badges", () => {
    render(
      withTestQuery(
        <TaskItem
          task={{
            id: "task",
            title: "Task",
            status: "todo",
            client_id: null,
            task_updates: [{ id: "a" }, { id: "b" }],
            task_collaborators: [],
          }}
          onClick={() => {}}
          onToggleComplete={() => {}}
        />,
      ),
    );
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
