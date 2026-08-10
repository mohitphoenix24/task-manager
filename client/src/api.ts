const API_URL = import.meta.env.VITE_API_URL;

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  projectId: string;
}

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

async function request(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (email: string, password: string) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  getProjects: (): Promise<Project[]> => request("/projects"),
  createProject: (name: string): Promise<Project> =>
    request("/projects", { method: "POST", body: JSON.stringify({ name }) }),
  deleteProject: (id: string) => request(`/projects/${id}`, { method: "DELETE" }),
  createTask: (title: string, projectId: string): Promise<Task> =>
    request("/tasks", { method: "POST", body: JSON.stringify({ title, projectId }) }),
  updateTaskStatus: (id: string, status: TaskStatus): Promise<Task> =>
    request(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteTask: (id: string) => request(`/tasks/${id}`, { method: "DELETE" }),
};
