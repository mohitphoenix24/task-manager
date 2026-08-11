import type { DragEvent } from "react";
import type { Task } from "../api";

interface Props {
  task: Task;
  dragging: boolean;
  onOpen: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOverCard: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

const PRIORITY_LABEL: Record<Task["priority"], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "DONE") return false;
  return new Date(task.dueDate).getTime() < Date.now();
}

function formatDueDate(dueDate: string) {
  return new Date(dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskCard({ task, dragging, onOpen, onDragStart, onDragOverCard, onDragEnd }: Props) {
  return (
    <div
      className={`task-card${dragging ? " task-card-dragging" : ""}`}
      data-task-id={task.id}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOverCard}
      onDragEnd={onDragEnd}
      onClick={onOpen}
    >
      <div className="task-card-top">
        <span className={`priority-badge priority-${task.priority.toLowerCase()}`}>
          {PRIORITY_LABEL[task.priority]}
        </span>
        {task.dueDate && (
          <span className={`due-badge${isOverdue(task) ? " due-overdue" : ""}`}>
            {formatDueDate(task.dueDate)}
          </span>
        )}
      </div>
      <p className="task-card-title">{task.title}</p>
      {task.comments.length > 0 && (
        <span className="comment-count">💬 {task.comments.length}</span>
      )}
    </div>
  );
}
