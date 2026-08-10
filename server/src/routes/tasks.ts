import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, requireAuth } from "../middleware/auth";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

async function findOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

tasksRouter.post("/", async (req: AuthRequest, res) => {
  const { title, projectId } = req.body;
  if (!title || !projectId) {
    return res.status(400).json({ error: "title and projectId are required" });
  }

  const project = await findOwnedProject(projectId, req.userId!);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const task = await prisma.task.create({ data: { title, projectId } });
  res.status(201).json(task);
});

tasksRouter.patch("/:id", async (req: AuthRequest<{ id: string }>, res) => {
  const { status } = req.body;
  if (!["TODO", "IN_PROGRESS", "DONE"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return res.status(404).json({ error: "Task not found" });

  const project = await findOwnedProject(task.projectId, req.userId!);
  if (!project) return res.status(404).json({ error: "Task not found" });

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status },
  });
  res.json(updated);
});

tasksRouter.delete("/:id", async (req: AuthRequest<{ id: string }>, res) => {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) return res.status(404).json({ error: "Task not found" });

  const project = await findOwnedProject(task.projectId, req.userId!);
  if (!project) return res.status(404).json({ error: "Task not found" });

  await prisma.task.delete({ where: { id: task.id } });
  res.status(204).send();
});
