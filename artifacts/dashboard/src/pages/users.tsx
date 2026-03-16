import { useState } from "react";
import {
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
} from "@workspace/api-client-react";
import type { CreateUser, User } from "@workspace/api-client-react";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-components";
import { useToast } from "@/hooks/use-toast";
import { Users, UserPlus, Pencil, UserX, Phone, Mail, MapPin, Wrench, Map, ShieldCheck } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Role config
// ---------------------------------------------------------------------------
type RoleKey = "canvasser" | "admin" | "management" | "technician";

const ROLE_GROUPS: { key: RoleKey[]; label: string; description: string; color: string; bg: string; border: string; icon: React.ElementType }[] = [
  {
    key: ["canvasser"],
    label: "D2D Reps",
    description: "Door-to-door sales representatives",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: Map,
  },
  {
    key: ["admin", "management"],
    label: "Admin & Management",
    description: "Owners, managers and office staff",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    icon: ShieldCheck,
  },
  {
    key: ["technician"],
    label: "Technicians",
    description: "Service crew and field technicians",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    icon: Wrench,
  },
];

const ROLE_BADGE: Record<string, string> = {
  canvasser:   "bg-blue-100 text-blue-800",
  admin:       "bg-violet-100 text-violet-800",
  management:  "bg-violet-100 text-violet-800",
  technician:  "bg-emerald-100 text-emerald-800",
};

const ROLE_AVATAR: Record<string, string> = {
  canvasser:  "bg-blue-100 text-blue-700",
  admin:      "bg-violet-100 text-violet-700",
  management: "bg-violet-100 text-violet-700",
  technician: "bg-emerald-100 text-emerald-700",
};

const ROLE_OPTIONS: { value: RoleKey; label: string }[] = [
  { value: "canvasser",   label: "D2D Rep (Canvasser)" },
  { value: "technician",  label: "Technician" },
  { value: "management",  label: "Management" },
  { value: "admin",       label: "Admin" },
];

function initials(name: string) {
  return name.split(" ").map(n => n[0] ?? "").join("").toUpperCase().slice(0, 2);
}

const emptyForm: CreateUser = {
  name: "",
  email: "",
  phone: "",
  role: "canvasser",
  position: "",
  notes: "",
  active: true,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function UsersPage() {
  const queryClient = useQueryClient();
  const { data: users, isLoading, error } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deactivateUser = useDeleteUser();
  const { toast } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<CreateUser>(emptyForm);

  const openAdd = () => {
    setEditUser(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({
      name: u.name,
      email: u.email ?? "",
      phone: u.phone ?? "",
      role: u.role as RoleKey,
      position: u.position ?? "",
      notes: u.notes ?? "",
      active: u.active,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      email: form.email || null,
      phone: (form.phone as string) || null,
      position: (form.position as string) || null,
      notes: (form.notes as string) || null,
    };
    try {
      if (editUser) {
        await updateUser.mutateAsync({ id: editUser.id, data: payload });
        toast({ title: "Team member updated" });
      } else {
        await createUser.mutateAsync({ data: payload });
        toast({ title: "Team member added" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsModalOpen(false);
    } catch {
      toast({ title: "Error saving team member", variant: "destructive" });
    }
  };

  const handleDeactivate = async (u: User) => {
    if (!confirm(`Deactivate ${u.name}?`)) return;
    try {
      await deactivateUser.mutateAsync({ id: u.id });
      toast({ title: `${u.name} deactivated` });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleReactivate = async (u: User) => {
    try {
      await updateUser.mutateAsync({ id: u.id, data: { name: u.name, role: u.role as RoleKey, active: true } });
      toast({ title: `${u.name} reactivated` });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const active = users?.filter(u => u.active) ?? [];
  const inactive = users?.filter(u => !u.active) ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Team</h2>
          <p className="text-slate-500 mt-1 text-sm">
            {active.length} active member{active.length !== 1 ? "s" : ""}
            {inactive.length > 0 && ` · ${inactive.length} inactive`}
          </p>
        </div>
        <Button onClick={openAdd}>
          <UserPlus className="w-4 h-4 mr-2" />
          Add Member
        </Button>
      </div>

      {/* Role group sections */}
      {ROLE_GROUPS.map(group => {
        const members = active.filter(u => group.key.includes(u.role as RoleKey));
        const Icon = group.icon;
        return (
          <div key={group.label}>
            <div className={`flex items-center gap-3 mb-4 px-4 py-3 rounded-xl ${group.bg} ${group.border} border`}>
              <Icon className={`w-5 h-5 ${group.color}`} />
              <div className="flex-1">
                <h3 className={`font-bold text-base ${group.color}`}>{group.label}</h3>
                <p className="text-xs text-slate-500">{group.description}</p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${group.bg} ${group.color} border ${group.border}`}>
                {members.length}
              </span>
            </div>

            {members.length === 0 ? (
              <div className="border-2 border-dashed border-slate-200 rounded-xl py-6 text-center text-slate-400 text-sm mb-2">
                No {group.label.toLowerCase()} yet.{" "}
                <button onClick={openAdd} className={`font-bold ${group.color} hover:underline`}>Add one →</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {members.map(u => (
                  <MemberCard
                    key={u.id}
                    user={u}
                    onEdit={openEdit}
                    onDeactivate={handleDeactivate}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Inactive members */}
      {inactive.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Inactive</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {inactive.map(u => (
              <Card key={u.id} className="!p-4 flex items-center gap-3 opacity-50">
                <div className={`w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-sm shrink-0`}>
                  {initials(u.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-500 text-sm line-through truncate">{u.name}</p>
                  <p className="text-xs text-slate-400">{u.role}</p>
                </div>
                <button
                  onClick={() => handleReactivate(u)}
                  className="text-xs text-primary font-bold hover:underline shrink-0"
                >
                  Reactivate
                </button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editUser ? "Edit Team Member" : "Add Team Member"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Full Name *</Label>
              <Input
                required
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Naseem Johnson"
              />
            </div>
            <div>
              <Label>Role *</Label>
              <Select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as RoleKey }))}
                required
              >
                {ROLE_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Position / Title</Label>
              <Input
                value={(form.position as string) ?? ""}
                onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                placeholder="e.g. D2D Sales Rep"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="name@healthyhome.com"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input
                type="tel"
                value={(form.phone as string) ?? ""}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="(919) 555-0100"
              />
            </div>
            <div className="col-span-2">
              <Label>Notes (optional)</Label>
              <Input
                value={(form.notes as string) ?? ""}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any additional info..."
              />
            </div>
            <div className="col-span-2 flex items-center gap-3 pt-1">
              <input
                type="checkbox"
                id="active-check"
                checked={form.active ?? true}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                className="w-4 h-4 accent-primary"
              />
              <label htmlFor="active-check" className="text-sm font-semibold text-slate-600">Active</label>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" isLoading={createUser.isPending || updateUser.isPending}>
              {editUser ? "Save Changes" : "Add Member"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member card
// ---------------------------------------------------------------------------
function MemberCard({ user, onEdit, onDeactivate }: {
  user: User;
  onEdit: (u: User) => void;
  onDeactivate: (u: User) => void;
}) {
  const avatarClass = ROLE_AVATAR[user.role] ?? "bg-slate-100 text-slate-600";
  const badgeClass  = ROLE_BADGE[user.role]  ?? "bg-slate-100 text-slate-700";
  const roleLabel   = ROLE_OPTIONS.find(r => r.value === user.role)?.label ?? user.role;

  return (
    <Card className="!p-4 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${avatarClass}`}>
            {initials(user.name)}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm leading-tight truncate">{user.name}</p>
            {user.position && (
              <p className="text-xs text-slate-500 truncate">{user.position}</p>
            )}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeClass}`}>
          {roleLabel.split(" ")[0]}
        </span>
      </div>

      {/* Contact info */}
      <div className="space-y-1">
        {user.email && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Mail className="w-3 h-3 shrink-0 text-slate-400" />
            <span className="truncate">{user.email}</span>
          </div>
        )}
        {user.phone && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Phone className="w-3 h-3 shrink-0 text-slate-400" />
            <span>{user.phone}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-slate-100">
        <button
          onClick={() => onEdit(user)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          onClick={() => onDeactivate(user)}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-red-400 rounded-lg hover:bg-red-50 transition-colors"
        >
          <UserX className="w-3.5 h-3.5" />
          Remove
        </button>
      </div>
    </Card>
  );
}
