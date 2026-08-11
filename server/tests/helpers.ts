import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/prisma";

export async function resetDb() {
  await prisma.comment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
}

export async function registerUser(email = "test@example.com", password = "password123") {
  const res = await request(app).post("/api/auth/register").send({ email, password });
  return { token: res.body.token as string, userId: res.body.user.id as string };
}

export async function createProject(token: string, name = "Test Project") {
  const res = await request(app)
    .post("/api/projects")
    .set("Authorization", `Bearer ${token}`)
    .send({ name });
  return res.body;
}

export async function createTask(token: string, projectId: string, title = "Test Task") {
  const res = await request(app)
    .post("/api/tasks")
    .set("Authorization", `Bearer ${token}`)
    .send({ title, projectId });
  return res.body;
}

export { app };
