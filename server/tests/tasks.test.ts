import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, resetDb, registerUser, createProject, createTask } from "./helpers";

beforeEach(resetDb);

async function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("POST /api/tasks", () => {
  it("creates a task defaulting to TODO/MEDIUM, appended to the end of TODO", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    await createTask(token, project.id, "First");
    const res = await request(app)
      .post("/api/tasks")
      .set(await auth(token))
      .send({ title: "Second", projectId: project.id });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("TODO");
    expect(res.body.priority).toBe("MEDIUM");
    expect(res.body.order).toBe(1);
  });

  it("404s for a project the caller doesn't own", async () => {
    const userA = await registerUser("a@test.com");
    const userB = await registerUser("b@test.com");
    const project = await createProject(userA.token);

    const res = await request(app)
      .post("/api/tasks")
      .set(await auth(userB.token))
      .send({ title: "Task", projectId: project.id });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("updates description, priority, and due date", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const task = await createTask(token, project.id);

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set(await auth(token))
      .send({ description: "details", priority: "HIGH", dueDate: "2026-01-01" });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe("details");
    expect(res.body.priority).toBe("HIGH");
    expect(new Date(res.body.dueDate).toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("rejects an invalid priority", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const task = await createTask(token, project.id);

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set(await auth(token))
      .send({ priority: "URGENT" });
    expect(res.status).toBe(400);
  });

  it("appends to the end of the new column when status changes via this route", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const existing = await createTask(token, project.id, "Already in progress");
    await request(app)
      .patch(`/api/tasks/${existing.id}`)
      .set(await auth(token))
      .send({ status: "IN_PROGRESS" });
    const task = await createTask(token, project.id, "Moving over");

    const res = await request(app)
      .patch(`/api/tasks/${task.id}`)
      .set(await auth(token))
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
    expect(res.body.order).toBe(1);
  });
});

describe("PATCH /api/tasks/:id/reorder", () => {
  it("renumbers siblings when reordering within the same column", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const a = await createTask(token, project.id, "A");
    const b = await createTask(token, project.id, "B");
    const c = await createTask(token, project.id, "C");
    // initial order: A=0, B=1, C=2

    const res = await request(app)
      .patch(`/api/tasks/${c.id}/reorder`)
      .set(await auth(token))
      .send({ status: "TODO", index: 0 });
    expect(res.status).toBe(200);

    const list = await request(app).get("/api/projects").set(await auth(token));
    const tasks = list.body[0].tasks.sort((x: { order: number }, y: { order: number }) => x.order - y.order);
    expect(tasks.map((t: { id: string }) => t.id)).toEqual([c.id, a.id, b.id]);
    expect(tasks.map((t: { order: number }) => t.order)).toEqual([0, 1, 2]);
  });

  it("renumbers both source and destination columns on a cross-column move", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const a = await createTask(token, project.id, "A");
    const b = await createTask(token, project.id, "B");
    const c = await createTask(token, project.id, "C");
    // TODO: A=0, B=1, C=2 ; IN_PROGRESS: empty

    const res = await request(app)
      .patch(`/api/tasks/${b.id}/reorder`)
      .set(await auth(token))
      .send({ status: "IN_PROGRESS", index: 0 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("IN_PROGRESS");
    expect(res.body.order).toBe(0);

    const list = await request(app).get("/api/projects").set(await auth(token));
    const tasks: { id: string; status: string; order: number }[] = list.body[0].tasks;

    const todo = tasks.filter((t) => t.status === "TODO").sort((x, y) => x.order - y.order);
    expect(todo.map((t) => t.id)).toEqual([a.id, c.id]);
    expect(todo.map((t) => t.order)).toEqual([0, 1]);

    const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS");
    expect(inProgress.map((t) => t.id)).toEqual([b.id]);
    expect(inProgress[0].order).toBe(0);
  });

  it("drops a task into an empty column at index 0", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const a = await createTask(token, project.id, "A");

    const res = await request(app)
      .patch(`/api/tasks/${a.id}/reorder`)
      .set(await auth(token))
      .send({ status: "DONE", index: 0 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DONE");
    expect(res.body.order).toBe(0);
  });

  it("rejects an invalid status", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const a = await createTask(token, project.id);

    const res = await request(app)
      .patch(`/api/tasks/${a.id}/reorder`)
      .set(await auth(token))
      .send({ status: "ARCHIVED", index: 0 });
    expect(res.status).toBe(400);
  });

  it("404s reordering a task owned by another user", async () => {
    const userA = await registerUser("a@test.com");
    const userB = await registerUser("b@test.com");
    const project = await createProject(userA.token);
    const task = await createTask(userA.token, project.id);

    const res = await request(app)
      .patch(`/api/tasks/${task.id}/reorder`)
      .set(await auth(userB.token))
      .send({ status: "DONE", index: 0 });
    expect(res.status).toBe(404);
  });
});

describe("comments", () => {
  it("adds and deletes a comment on an owned task", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const task = await createTask(token, project.id);

    const add = await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set(await auth(token))
      .send({ content: "hello" });
    expect(add.status).toBe(201);
    expect(add.body.content).toBe("hello");

    const del = await request(app)
      .delete(`/api/tasks/${task.id}/comments/${add.body.id}`)
      .set(await auth(token));
    expect(del.status).toBe(204);
  });

  it("404s adding a comment to another user's task", async () => {
    const userA = await registerUser("a@test.com");
    const userB = await registerUser("b@test.com");
    const project = await createProject(userA.token);
    const task = await createTask(userA.token, project.id);

    const res = await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set(await auth(userB.token))
      .send({ content: "hi" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("cascades deleting its comments", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    const task = await createTask(token, project.id);
    await request(app)
      .post(`/api/tasks/${task.id}/comments`)
      .set(await auth(token))
      .send({ content: "hello" });

    const res = await request(app).delete(`/api/tasks/${task.id}`).set(await auth(token));
    expect(res.status).toBe(204);

    const list = await request(app).get("/api/projects").set(await auth(token));
    expect(list.body[0].tasks).toEqual([]);
  });
});
