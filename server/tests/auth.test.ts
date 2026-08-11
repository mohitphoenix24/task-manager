import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { app, resetDb } from "./helpers";

beforeEach(resetDb);

describe("POST /api/auth/register", () => {
  it("creates a user and returns a token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@test.com", password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe("a@test.com");
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send({ email: "a@test.com", password: "password123" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "a@test.com", password: "different" });
    expect(res.status).toBe(409);
  });

  it("rejects a missing password", async () => {
    const res = await request(app).post("/api/auth/register").send({ email: "a@test.com" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/auth/register").send({ email: "a@test.com", password: "password123" });
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@test.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it("rejects an incorrect password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "a@test.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@test.com", password: "password123" });
    expect(res.status).toBe(401);
  });
});
