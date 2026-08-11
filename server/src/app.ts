import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import { authRouter } from "./routes/auth";
import { projectsRouter } from "./routes/projects";
import { tasksRouter } from "./routes/tasks";

export const app = express();

if (process.env.NODE_ENV !== "test") {
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
}
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
