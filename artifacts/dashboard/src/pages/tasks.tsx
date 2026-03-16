import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Plus, Circle, CheckCircle2, Clock, AlertTriangle, Trash2 } from "lucide-react";
import { Button, Input, Label, Modal } from "@/components/ui-components";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

type Task = {
  id: number;
  title: string;
  description: string | null;
  relatedToType: string | null;
  relatedToId: string | null;
  dueDate: string | null;
  status: string;
  priority: string;
  assignedTo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-600 bg-red-50 border-red-200",
  high: "text-orange-600 bg-orange-50 border-orange-200",
  normal: "text-slate-600 bg-slate-50 border-slate-200",
  low: "text-slate-400 bg-slate-50 border-slate-100",
};

const PRIORITY_ICON: Record<string, React.ReactNode> = {
  urgent: <AlertTriangle className="w-3.5 h-3.5" />,
  high: <AlertTriangle className="w-3.5 h-3.5" />,
  normal: <Clock className="w-3.5 h-3.5" />,
  low: <Clock className="w-3.5 h-3.5" />,
};

function isOverdue(task: Task) {
  if (!task.dueDate || task.status === "completed") return false;
  return new Date(task.dueDate) < new Date(new Date().toDateString());
}

function formatDueDate(dueDate: string | null) {
  if (!dueDate) return null;
  const d = new Date(dueDate);
  const today = new Date(new Date().toDateString());
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TasksPage() {
  const [filter, setFilter] = useState<"pending" | "completed" | "all">("pending");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks", filter],
    queryFn: async () => {
      const params = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`${API}/api/tasks${params}`);
      return res.json();
    },
  });

  const pending = tasks.filter(t => t.status === "pending");
  const completed = tasks.filter(t => t.status === "completed");
  const overdue = pending.filter(isOverdue);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Tasks</h1>
          <p className="text-slate-500 text-sm mt-0.5">Follow-ups &amp; action items</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New Task
        </Button>
      </div>

      {/* Summary strip */}
      {filter === "pending" && pending.length > 0 && (
        <div className="flex gap-3 mb-5">
          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-display font-bold text-slate-900">{pending.length}</p>
            <p className="text-xs text-slate-500">Open</p>
          </div>
          {overdue.length > 0 && (
            <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-3 text-center">
              <p className="text-2xl font-display font-bold text-red-600">{overdue.length}</p>
              <p className="text-xs text-red-500">Overdue</p>
            </div>
          )}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-display font-bold text-slate-900">{completed.length}</p>
            <p className="text-xs text-slate-500">Done today</p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(["pending", "completed", "all"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-sm font-medium transition-colors",
              filter === f
                ? "bg-primary text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            )}
          >
            {f === "pending" ? "Open" : f === "completed" ? "Done" : "All"}
          </button>
        ))}
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading…</div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-12">
          <CheckSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400">No tasks</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}

      <CreateTaskModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const overdue = isOverdue(task);

  const completeMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${API}/api/tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await fetch(`${API}/api/tasks/${task.id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task deleted" });
    },
  });

  const dueDateLabel = formatDueDate(task.dueDate);

  return (
    <div className={cn(
      "flex items-start gap-3 bg-white border rounded-xl p-3.5 group transition-colors",
      overdue ? "border-red-200 bg-red-50/30" : "border-slate-200",
      task.status === "completed" && "opacity-60"
    )}>
      <button
        onClick={() => completeMutation.mutate()}
        className="mt-0.5 shrink-0 text-slate-300 hover:text-primary transition-colors"
        disabled={completeMutation.isPending}
      >
        {task.status === "completed"
          ? <CheckCircle2 className="w-5 h-5 text-green-500" />
          : <Circle className="w-5 h-5" />
        }
      </button>

      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-medium text-slate-900 leading-snug", task.status === "completed" && "line-through text-slate-400")}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-1.5">
          {/* Priority badge */}
          <span className={cn(
            "inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5 font-medium",
            PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.normal
          )}>
            {PRIORITY_ICON[task.priority]}
            {task.priority}
          </span>

          {/* Due date */}
          {dueDateLabel && (
            <span className={cn(
              "text-xs font-medium",
              overdue ? "text-red-500" : "text-slate-400"
            )}>
              {overdue && "⚠ "}{dueDateLabel}
            </span>
          )}

          {/* Related entity */}
          {task.relatedToType && task.relatedToId && (
            <span className="text-xs text-slate-400 capitalize">{task.relatedToType} #{task.relatedToId}</span>
          )}

          {/* Assigned */}
          {task.assignedTo && (
            <span className="text-xs text-slate-400">→ {task.assignedTo}</span>
          )}
        </div>
      </div>

      <button
        onClick={() => deleteMutation.mutate()}
        className="shrink-0 text-slate-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        title="Delete task"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function CreateTaskModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await fetch(`${API}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create task");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task created" });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      title: fd.get("title") as string,
      description: (fd.get("description") as string) || null,
      dueDate: (fd.get("dueDate") as string) || null,
      priority: fd.get("priority") as string || "normal",
      assignedTo: (fd.get("assignedTo") as string) || null,
      relatedToType: (fd.get("relatedToType") as string) || null,
      relatedToId: (fd.get("relatedToId") as string) || null,
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Title *</Label>
          <Input name="title" required placeholder="What needs to be done?" />
        </div>
        <div>
          <Label>Description</Label>
          <Input name="description" placeholder="Optional details" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Due Date</Label>
            <Input type="date" name="dueDate" />
          </div>
          <div>
            <Label>Priority</Label>
            <select name="priority" className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>
        <div>
          <Label>Assign To</Label>
          <Input name="assignedTo" placeholder="Name or email" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Linked To</Label>
            <select name="relatedToType" className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">None</option>
              <option value="job">Job</option>
              <option value="lead">Lead</option>
              <option value="customer">Customer</option>
              <option value="session">Session</option>
            </select>
          </div>
          <div>
            <Label>ID</Label>
            <Input name="relatedToId" placeholder="e.g. 42" />
          </div>
        </div>
        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Create Task</Button>
        </div>
      </form>
    </Modal>
  );
}
