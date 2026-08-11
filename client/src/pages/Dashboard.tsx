import { useEffect, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { api } from "../api";
import type { Project, Task, TaskEdits, TaskStatus } from "../api";
import { useAuth } from "../context/AuthContext";
import { TaskCard } from "../components/TaskCard";
import { TaskDetailModal } from "../components/TaskDetailModal";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "DONE", label: "Done" },
];

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<{ status: TaskStatus; index: number } | null>(null);
  const { logout } = useAuth();

  async function loadProjects() {
    try {
      const data = await api.getProjects();
      setProjects(data);
      setOpenTask((current) => {
        if (!current) return current;
        for (const project of data) {
          const match = project.tasks.find((t) => t.id === current.id);
          if (match) return match;
        }
        return null;
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    await api.createProject(newProjectName);
    setNewProjectName("");
    loadProjects();
  }

  async function handleDeleteProject(id: string) {
    await api.deleteProject(id);
    loadProjects();
  }

  async function handleCreateTask(e: FormEvent, projectId: string) {
    e.preventDefault();
    const title = newTaskTitle[projectId]?.trim();
    if (!title) return;
    await api.createTask({ title, projectId });
    setNewTaskTitle((prev) => ({ ...prev, [projectId]: "" }));
    loadProjects();
  }

  async function handleSaveTask(taskId: string, edits: TaskEdits) {
    await api.updateTask(taskId, edits);
    await loadProjects();
  }

  async function handleDeleteTask(taskId: string) {
    await api.deleteTask(taskId);
    setOpenTask(null);
    loadProjects();
  }

  async function handleAddComment(taskId: string, content: string) {
    await api.addComment(taskId, content);
    loadProjects();
  }

  async function handleDeleteComment(taskId: string, commentId: string) {
    await api.deleteComment(taskId, commentId);
    loadProjects();
  }

  function handleCardDragStart(e: DragEvent<HTMLDivElement>, taskId: string) {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleCardDragOver(e: DragEvent<HTMLDivElement>, status: TaskStatus, index: number) {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const isAfter = e.clientY - rect.top > rect.height / 2;
    setDragOverIndex({ status, index: isAfter ? index + 1 : index });
  }

  function handleColumnDragOver(e: DragEvent<HTMLDivElement>, status: TaskStatus, count: number) {
    e.preventDefault();
    setDragOverIndex((current) => (current?.status === status ? current : { status, index: count }));
  }

  // Recomputes the drop index from live DOM positions rather than trusting
  // `dragOverIndex` state, which is set by `dragover` and can be stale if
  // `drop` fires before React has flushed that update.
  function computeDropIndex(e: DragEvent<HTMLDivElement>, columnCount: number) {
    const cards = e.currentTarget.querySelectorAll(".task-card");
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) return i;
    }
    return columnCount;
  }

  async function handleColumnDrop(e: DragEvent<HTMLDivElement>, status: TaskStatus, columnCount: number) {
    e.preventDefault();
    const taskId = draggedTaskId;
    const index = computeDropIndex(e, columnCount);
    setDraggedTaskId(null);
    setDragOverIndex(null);
    if (!taskId) return;
    await api.reorderTask(taskId, status, index);
    loadProjects();
  }

  function handleDragEnd() {
    setDraggedTaskId(null);
    setDragOverIndex(null);
  }

  return (
    <div className="app-shell dashboard">
      <header>
        <h1>My Projects</h1>
        <button className="btn-ghost" onClick={logout}>
          Log out
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleCreateProject} className="new-project-form">
        <input
          placeholder="New project name"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={!newProjectName.trim()}>
          Add Project
        </button>
      </form>

      {loading ? (
        <p className="loading-state">Loading projects…</p>
      ) : projects.length === 0 ? (
        <div className="empty-state">No projects yet — create one above to get started.</div>
      ) : (
        projects.map((project) => (
          <div key={project.id} className="project-card">
            <div className="project-header">
              <h2>{project.name}</h2>
              <button className="btn-danger btn-sm" onClick={() => handleDeleteProject(project.id)}>
                Delete
              </button>
            </div>

            <div className="kanban-board">
              {COLUMNS.map(({ status, label }) => {
                const allInColumn = project.tasks.filter((t) => t.status === status);
                const columnTasks =
                  draggedTaskId && allInColumn.some((t) => t.id === draggedTaskId)
                    ? allInColumn.filter((t) => t.id !== draggedTaskId)
                    : allInColumn;
                const showIndicatorAt = dragOverIndex?.status === status ? dragOverIndex.index : null;

                return (
                  <div
                    key={status}
                    className="kanban-column"
                    onDragOver={(e) => handleColumnDragOver(e, status, columnTasks.length)}
                    onDrop={(e) => handleColumnDrop(e, status, columnTasks.length)}
                  >
                    <div className="kanban-column-header">
                      <span>{label}</span>
                      <span className="kanban-count">{allInColumn.length}</span>
                    </div>

                    {status === "TODO" && (
                      <form onSubmit={(e) => handleCreateTask(e, project.id)} className="new-task-form">
                        <input
                          placeholder="New task title"
                          value={newTaskTitle[project.id] || ""}
                          onChange={(e) =>
                            setNewTaskTitle((prev) => ({ ...prev, [project.id]: e.target.value }))
                          }
                        />
                        <button
                          type="submit"
                          className="btn-ghost btn-sm"
                          disabled={!newTaskTitle[project.id]?.trim()}
                        >
                          Add
                        </button>
                      </form>
                    )}

                    <div className="kanban-cards">
                      {columnTasks.length === 0 && showIndicatorAt === null && (
                        <p className="task-empty">No tasks.</p>
                      )}
                      {columnTasks.map((task, index) => (
                        <div key={task.id}>
                          {showIndicatorAt === index && <div className="drop-indicator" />}
                          <TaskCard
                            task={task}
                            onOpen={() => setOpenTask(task)}
                            onDragStart={(e) => handleCardDragStart(e, task.id)}
                            onDragOverCard={(e) => handleCardDragOver(e, status, index)}
                            onDragEnd={handleDragEnd}
                          />
                        </div>
                      ))}
                      {showIndicatorAt === columnTasks.length && <div className="drop-indicator" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {openTask && (
        <TaskDetailModal
          task={openTask}
          onClose={() => setOpenTask(null)}
          onSave={(edits) => handleSaveTask(openTask.id, edits)}
          onDelete={() => handleDeleteTask(openTask.id)}
          onAddComment={(content) => handleAddComment(openTask.id, content)}
          onDeleteComment={(commentId) => handleDeleteComment(openTask.id, commentId)}
        />
      )}
    </div>
  );
}
