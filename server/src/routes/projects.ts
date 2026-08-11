import { Router } from "express";
import { prisma } from "../prisma";
import { AuthRequest, requireAuth } from "../middleware/auth";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/", async (req: AuthRequest, res) => {
  const projects = await prisma.project.findMany({
    where: { userId: req.userId },
    include: {
      tasks: {
        orderBy: { order: "asc" },
        include: { comments: { orderBy: { createdAt: "asc" } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(projects);
});

projectsRouter.post("/", async (req: AuthRequest, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });

  const project = await prisma.project.create({
    data: { name, userId: req.userId! },
  });
  res.status(201).json(project);
});

projectsRouter.delete("/:id", async (req: AuthRequest<{ id: string }>, res) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!project) return res.status(404).json({ error: "Project not found" });

  await prisma.project.delete({ where: { id: project.id } });
  res.status(204).send();
});
