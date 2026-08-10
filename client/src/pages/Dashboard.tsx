import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { Project, TaskStatus } from "../api";
import { useAuth } from "../context/AuthContext";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const { logout } = useAuth();

  async function loadProjects() {
    try {
      setProjects(await api.getProjects());
    } catch (err) {
      setError((err as Error).message);
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
    <div className="dashboard">
      <header>
        <h1>My Projects</h1>
        <button onClick={logout}>Logout</button>
      </header>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleCreateProject} className="new-project-form">
        <input
          placeholder="New project name"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
        />
        <button type="submit">Add Project</button>
      </form>

      {projects.map((project) => (
        <div key={project.id} className="project-card">
          <div className="project-header">
            <h2>{project.name}</h2>
            <button onClick={() => handleDeleteProject(project.id)}>Delete Project</button>
          </div>

          <ul className="task-list">
            {project.tasks.map((task) => (
              <li key={task.id}>
                <span>{task.title}</span>
                <select
                  value={task.status}
                  onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="DONE">DONE</option>
                </select>
                <button onClick={() => handleDeleteTask(task.id)}>Delete</button>
              </li>
            ))}
          </ul>

          <form onSubmit={(e) => handleCreateTask(e, project.id)} className="new-task-form">
            <input
              placeholder="New task title"
              value={newTaskTitle[project.id] || ""}
              onChange={(e) => setNewTaskTitle((prev) => ({ ...prev, [project.id]: e.target.value }))}
            />
            <button type="submit">Add Task</button>
          </form>
        </div>
      ))}
    </div>
  );
}
