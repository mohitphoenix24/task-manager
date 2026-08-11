const API_URL = import.meta.env.VITE_API_URL;

export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

export interface Comment {
  id: string;
  content: string;
  createdAt: string;
  taskId: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  order: number;
  projectId: string;
  comments: Comment[];
}

export interface Project {
  id: string;
  name: string;
  tasks: Task[];
}

export interface NewTaskInput {
  title: string;
  projectId: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
}

export interface TaskEdits {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string | null;
  status?: TaskStatus;
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
  createTask: (input: NewTaskInput): Promise<Task> =>
    request("/tasks", { method: "POST", body: JSON.stringify(input) }),
  updateTask: (id: string, edits: TaskEdits): Promise<Task> =>
    request(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(edits) }),
  reorderTask: (id: string, status: TaskStatus, index: number): Promise<Task> =>
    request(`/tasks/${id}/reorder`, { method: "PATCH", body: JSON.stringify({ status, index }) }),
  deleteTask: (id: string) => request(`/tasks/${id}`, { method: "DELETE" }),
  addComment: (taskId: string, content: string): Promise<Comment> =>
    request(`/tasks/${taskId}/comments`, { method: "POST", body: JSON.stringify({ content }) }),
  deleteComment: (taskId: string, commentId: string) =>
    request(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
};
