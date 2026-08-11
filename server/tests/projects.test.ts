import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, resetDb, registerUser, createProject } from "./helpers";

beforeEach(resetDb);

describe("projects", () => {
  it("requires auth", async () => {
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(401);
  });

  it("creates and lists a project scoped to the owner", async () => {
    const { token } = await registerUser();
    await createProject(token, "My Project");

    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("My Project");
    expect(res.body[0].tasks).toEqual([]);
  });

  it("does not leak another user's projects", async () => {
    const userA = await registerUser("a@test.com");
    const userB = await registerUser("b@test.com");
    await createProject(userA.token, "A's project");

    const res = await request(app).get("/api/projects").set("Authorization", `Bearer ${userB.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("prevents deleting another user's project", async () => {
    const userA = await registerUser("a@test.com");
    const userB = await registerUser("b@test.com");
    const project = await createProject(userA.token, "A's project");

    const res = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${userB.token}`);
    expect(res.status).toBe(404);
  });

  it("deletes a project and cascades its tasks", async () => {
    const { token } = await registerUser();
    const project = await createProject(token);
    await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Task", projectId: project.id });

    const del = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(204);

    const list = await request(app).get("/api/projects").set("Authorization", `Bearer ${token}`);
    expect(list.body).toEqual([]);
  });
});
