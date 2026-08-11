import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, requireAuth } from "../middleware/auth";

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

const STATUSES = ["TODO", "IN_PROGRESS", "DONE"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

async function findOwnedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, userId } });
}

async function findOwnedTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return null;
  const project = await findOwnedProject(task.projectId, userId);
  return project ? task : null;
}

tasksRouter.post("/", async (req: AuthRequest, res) => {
  const { title, projectId, description, priority, dueDate } = req.body;
  if (!title || !projectId) {
    return res.status(400).json({ error: "title and projectId are required" });
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "Invalid priority" });
  }

  const project = await findOwnedProject(projectId, req.userId!);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const count = await prisma.task.count({ where: { projectId, status: "TODO" } });

  const task = await prisma.task.create({
    data: {
      title,
      projectId,
      description: description || null,
      priority: priority || undefined,
      dueDate: dueDate ? new Date(dueDate) : null,
      order: count,
    },
    include: { comments: true },
  });
  res.status(201).json(task);
});

tasksRouter.patch("/:id", async (req: AuthRequest<{ id: string }>, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { title, description, priority, dueDate, status } = req.body;
  if (status !== undefined && !STATUSES.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: "Invalid priority" });
  }

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (description !== undefined) data.description = description || null;
  if (priority !== undefined) data.priority = priority;
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
  if (status !== undefined && status !== task.status) {
    data.status = status;
    data.order = await prisma.task.count({ where: { projectId: task.projectId, status } });
  }

  const updated = await prisma.task.update({ where: { id: task.id }, data });
  res.json(updated);
});

// Reorders a task within/across status columns, used by drag-and-drop.
// Renumbers every task in the affected column(s) so `order` stays a dense 0..n-1 sequence.
tasksRouter.patch("/:id/reorder", async (req: AuthRequest<{ id: string }>, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { status, index } = req.body;
  if (!STATUSES.includes(status) || typeof index !== "number" || index < 0) {
    return res.status(400).json({ error: "status and index are required" });
  }

  const sourceStatus = task.status;
  const destTasks = await prisma.task.findMany({
    where: { projectId: task.projectId, status, id: { not: task.id } },
    orderBy: { order: "asc" },
  });
  destTasks.splice(Math.min(index, destTasks.length), 0, task);

  const updates = destTasks.map((t, i) =>
    prisma.task.update({ where: { id: t.id }, data: { order: i, status } })
  );

  if (sourceStatus !== status) {
    const sourceTasks = await prisma.task.findMany({
      where: { projectId: task.projectId, status: sourceStatus, id: { not: task.id } },
      orderBy: { order: "asc" },
    });
    updates.push(
      ...sourceTasks.map((t, i) => prisma.task.update({ where: { id: t.id }, data: { order: i } }))
    );
  }

  await prisma.$transaction(updates);
  const updated = await prisma.task.findUnique({ where: { id: task.id } });
  res.json(updated);
});

tasksRouter.delete("/:id", async (req: AuthRequest<{ id: string }>, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: "Task not found" });

  await prisma.task.delete({ where: { id: task.id } });
  res.status(204).send();
});

tasksRouter.post("/:id/comments", async (req: AuthRequest<{ id: string }>, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "content is required" });

  const comment = await prisma.comment.create({
    data: { content: content.trim(), taskId: task.id, authorId: req.userId! },
  });
  res.status(201).json(comment);
});

tasksRouter.delete("/:id/comments/:commentId", async (req: AuthRequest<{ id: string; commentId: string }>, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: "Task not found" });

  const comment = await prisma.comment.findFirst({
    where: { id: req.params.commentId, taskId: task.id },
  });
  if (!comment) return res.status(404).json({ error: "Comment not found" });

  await prisma.comment.delete({ where: { id: comment.id } });
  res.status(204).send();
});
