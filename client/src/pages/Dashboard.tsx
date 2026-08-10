import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { Project, TaskStatus } from "../api";
import { useAuth } from "../context/AuthContext";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const { logout } = useAuth();

  async function loadProjects() {
    try {
      setProjects(await api.getProjects());
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
    await api.createTask(title, projectId);
    setNewTaskTitle((prev) => ({ ...prev, [projectId]: "" }));
    loadProjects();
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    await api.updateTaskStatus(taskId, status);
    loadProjects();
  }

  async function handleDeleteTask(taskId: string) {
    await api.deleteTask(taskId);
    loadProjects();
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

            {project.tasks.length === 0 ? (
              <p className="task-empty">No tasks yet.</p>
            ) : (
              <ul className="task-list">
                {project.tasks.map((task) => (
                  <li key={task.id}>
                    <span>{task.title}</span>
                    <select
                      className="status-select"
                      data-status={task.status}
                      value={task.status}
                      onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                    >
                      <option value="TODO">To do</option>
                      <option value="IN_PROGRESS">In progress</option>
                      <option value="DONE">Done</option>
                    </select>
                    <button className="btn-danger btn-sm" onClick={() => handleDeleteTask(task.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={(e) => handleCreateTask(e, project.id)} className="new-task-form">
              <input
                placeholder="New task title"
                value={newTaskTitle[project.id] || ""}
                onChange={(e) => setNewTaskTitle((prev) => ({ ...prev, [project.id]: e.target.value }))}
              />
              <button type="submit" className="btn-ghost btn-sm" disabled={!newTaskTitle[project.id]?.trim()}>
                Add Task
              </button>
            </form>
          </div>
        ))
      )}
    </div>
  );
}
