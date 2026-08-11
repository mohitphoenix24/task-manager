import { useState } from "react";
import type { FormEvent } from "react";
import type { Task, TaskEdits, TaskPriority } from "../api";

interface Props {
  task: Task;
  onClose: () => void;
  onSave: (edits: TaskEdits) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddComment: (content: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

function toDateInputValue(dueDate: string | null) {
  return dueDate ? dueDate.slice(0, 10) : "";
}

export function TaskDetailModal({ task, onClose, onSave, onDelete, onAddComment, onDeleteComment }: Props) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueDate, setDueDate] = useState(toDateInputValue(task.dueDate));
  const [saving, setSaving] = useState(false);
  const [newComment, setNewComment] = useState("");

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        title,
        description,
        priority,
        dueDate: dueDate || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await onAddComment(newComment.trim());
    setNewComment("");
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Task details</h2>
          <button className="btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        <form onSubmit={handleSave} className="task-detail-form">
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          <label>
            Description
            <textarea
              rows={3}
              placeholder="Add more detail…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="task-detail-row">
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>

            <label>
              Due date
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>

          <div className="task-detail-actions">
            <button type="button" className="btn-danger btn-sm" onClick={onDelete}>
              Delete task
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={saving || !title.trim()}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>

        <div className="comments-section">
          <h3>Comments</h3>
          {task.comments.length === 0 ? (
            <p className="task-empty">No comments yet.</p>
          ) : (
            <ul className="comment-list">
              {task.comments.map((comment) => (
                <li key={comment.id}>
                  <p>{comment.content}</p>
                  <div className="comment-meta">
                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                    <button className="btn-danger btn-sm" onClick={() => onDeleteComment(comment.id)}>
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={handleAddComment} className="new-comment-form">
            <input
              placeholder="Add a comment…"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <button type="submit" className="btn-ghost btn-sm" disabled={!newComment.trim()}>
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
