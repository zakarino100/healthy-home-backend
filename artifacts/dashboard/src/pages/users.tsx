import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@workspace/api-client-react";
import type { CreateUser } from "@workspace/api-client-react";
import { PageLoader, ErrorState, Card } from "@/components/ui-components";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Pencil, UserX } from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-violet-100 text-violet-800",
  canvasser: "bg-blue-100 text-blue-800",
  technician: "bg-green-100 text-green-800",
};

const ROLES: CreateUser["role"][] = ["admin", "canvasser", "technician"];

const emptyForm: CreateUser = {
  name: "",
  email: "",
  role: "canvasser",
  active: true,
};

export default function UsersPage() {
  const { data: users, isLoading, error, refetch } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deactivateUser = useDeleteUser();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CreateUser>(emptyForm);

  const resetForm = () => {
    setForm(emptyForm);
    setEditId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editId !== null) {
        await updateUser.mutateAsync({ id: editId, data: form });
        toast({ title: "Team member updated" });
      } else {
        await createUser.mutateAsync({ data: form });
        toast({ title: "Team member added" });
      }
      resetForm();
      refetch();
    } catch {
      toast({ title: "Error saving team member", variant: "destructive" });
    }
  };

  const handleEdit = (user: NonNullable<typeof users>[number]) => {
    setForm({ name: user.name, email: user.email ?? "", role: user.role, active: user.active });
    setEditId(user.id);
    setShowForm(true);
  };

  const handleDeactivate = async (id: number) => {
    try {
      await deactivateUser.mutateAsync({ id });
      toast({ title: "Team member deactivated" });
      refetch();
    } catch {
      toast({ title: "Error deactivating user", variant: "destructive" });
    }
  };

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const active = users?.filter(u => u.active) ?? [];
  const inactive = users?.filter(u => !u.active) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900 flex items-center gap-3">
            <Users className="w-8 h-8 text-primary" />
            Team Members
          </h2>
          <p className="text-slate-500 mt-1">{active.length} active · {inactive.length} inactive</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          Add Member
        </button>
      </div>

      {showForm && (
        <Card className="border-2 border-primary/20">
          <h3 className="text-lg font-bold text-slate-900 mb-4">{editId ? "Edit Team Member" : "New Team Member"}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Name *</label>
              <input
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Email</label>
              <input
                type="email"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.email ?? ""}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="team@healthyhome.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Role *</label>
              <select
                required
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as CreateUser["role"] }))}
              >
                {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="active-check"
                checked={form.active ?? true}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="active-check" className="text-sm font-semibold text-slate-600">Active</label>
            </div>
            <div className="sm:col-span-2 flex gap-3 justify-end">
              <button type="button" onClick={resetForm} className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90">
                {editId ? "Update" : "Create"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {active.map(user => (
          <Card key={user.id} className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">
              {user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900">{user.name}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-700"}`}>
                  {user.role}
                </span>
              </div>
              {user.email && <p className="text-sm text-slate-500 truncate">{user.email}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleEdit(user)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <Pencil className="w-4 h-4" />
              </button>
              <button onClick={() => handleDeactivate(user.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-400 transition-colors">
                <UserX className="w-4 h-4" />
              </button>
            </div>
          </Card>
        ))}

        {active.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No active team members yet</p>
          </div>
        )}
      </div>

      {inactive.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide">Inactive</h3>
          {inactive.map(user => (
            <Card key={user.id} className="flex items-center gap-4 opacity-50">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-sm">
                {user.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-bold text-slate-500 line-through">{user.name}</span>
                <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-700"}`}>
                  {user.role}
                </span>
              </div>
              <button onClick={() => handleEdit(user)} className="text-xs text-primary font-semibold hover:underline">
                Reactivate
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
