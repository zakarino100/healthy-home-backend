import { useState, useEffect, useCallback } from "react";
import { X, Phone, Mail, MapPin, User, Calendar, DollarSign, Tag, Clock, Archive, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui-components";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadDetail {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  canvasser: string | null;
  serviceInterest: string | null;
  quoteAmount: string | null;
  status: string;
  followUpDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
  changeLog: ChangeEntry[];
  linkedCustomer: Record<string, any> | null;
  linkedJobs: Record<string, any>[];
  // Historical import fields (Wolf Pack Wash)
  isHistoricalImport?: boolean;
  importBatch?: string | null;
  leadYear?: number | null;
  leadSourceOriginal?: string | null;
  isServiced?: boolean;
  servicedOn?: string | null;
  soldDate?: string | null;
  scheduledDate?: string | null;
  isPurchased?: boolean;
  totalQuote?: string | null;
  frequency?: string | null;
  houseSqft?: number | null;
  cementSqft?: number | null;
  serviceNotes?: string | null;
  conversationNotes?: string | null;
}

interface ChangeEntry {
  changedAt: string;
  changedBy: string;
  changedByName: string;
  fields: Record<string, { from: any; to: any }>;
}

interface LeadDrawerProps {
  open: boolean;
  lead: LeadDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onLeadUpdated: (updated: LeadDetail) => void;
  onLeadDeleted: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  quoted: "Quoted",
  follow_up: "Follow Up",
  sold: "Sold",
  lost: "Lost",
  no_answer: "No Answer",
  not_home: "Not Home",
  not_interested: "Not Interested",
  contacted: "Contacted",
  completed: "Completed",
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "neutral"> = {
  new: "default",
  quoted: "warning",
  follow_up: "warning",
  sold: "success",
  lost: "destructive",
  no_answer: "neutral",
  not_home: "neutral",
  not_interested: "destructive",
  contacted: "default",
  completed: "success",
};

const SERVICE_OPTIONS = [
  { value: "house_wash", label: "House Wash" },
  { value: "driveway_cleaning", label: "Driveway Cleaning" },
  { value: "bundle", label: "Bundle Package" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "no_answer", label: "No Answer" },
  { value: "not_home", label: "Not Home" },
  { value: "contacted", label: "Contacted" },
  { value: "quoted", label: "Quoted" },
  { value: "follow_up", label: "Follow Up" },
  { value: "sold", label: "Sold" },
  { value: "not_interested", label: "Not Interested" },
  { value: "lost", label: "Lost" },
  { value: "completed", label: "Completed" },
];

const EDITABLE_FIELDS = [
  "firstName", "lastName", "phone", "email",
  "address", "city", "state", "zip",
  "serviceInterest", "quoteAmount", "status",
  "followUpDate", "notes",
] as const;

type EditableField = typeof EDITABLE_FIELDS[number];

// ---------------------------------------------------------------------------
// Change confirm modal
// ---------------------------------------------------------------------------

interface EditConfirmModalProps {
  changed: Record<string, { from: any; to: any }>;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function fieldLabel(key: string): string {
  const map: Record<string, string> = {
    firstName: "First Name",
    lastName: "Last Name",
    phone: "Phone",
    email: "Email",
    address: "Address",
    city: "City",
    state: "State",
    zip: "ZIP",
    serviceInterest: "Service",
    quoteAmount: "Quote Amount",
    status: "Status",
    followUpDate: "Follow-up Date",
    notes: "Notes",
  };
  return map[key] ?? key;
}

function formatFieldValue(key: string, val: any): string {
  if (val === null || val === undefined || val === "") return "—";
  if (key === "quoteAmount") return formatCurrency(parseFloat(val));
  if (key === "status") return STATUS_LABELS[val] ?? val;
  return String(val);
}

function EditConfirmModal({ changed, saving, onCancel, onConfirm }: EditConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Save Changes?</h3>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left pb-2 text-slate-500 font-semibold w-1/3">Field</th>
                <th className="text-left pb-2 text-slate-500 font-semibold w-1/3">Before</th>
                <th className="text-left pb-2 text-slate-500 font-semibold w-1/3">After</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(changed).map(([key, { from, to }]) => (
                <tr key={key} className="border-b border-slate-100">
                  <td className="py-2 font-medium text-slate-700">{fieldLabel(key)}</td>
                  <td className="py-2 text-slate-400">{formatFieldValue(key, from)}</td>
                  <td className="py-2 text-slate-900 font-semibold">{formatFieldValue(key, to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------

interface DeleteConfirmModalProps {
  leadName: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function DeleteConfirmModal({ leadName, deleting, onCancel, onConfirm }: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <h3 className="text-lg font-bold text-slate-900 mb-3">Delete This Lead?</h3>
        <p className="text-slate-600 text-sm mb-6">
          You are about to delete <span className="font-semibold text-slate-900">{leadName}</span>.
          This cannot be easily undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {deleting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Delete Lead
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field components
// ---------------------------------------------------------------------------

function FieldRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-slate-400 mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-slate-400 font-medium">{label}</p>
        <div className="text-sm text-slate-900 font-medium">{value}</div>
      </div>
    </div>
  );
}

function EditInput({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-primary focus:outline-none text-sm bg-white"
      />
    </div>
  );
}

function EditSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-primary focus:outline-none text-sm bg-white"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main drawer
// ---------------------------------------------------------------------------

export default function LeadDrawer({
  open,
  lead,
  loading,
  error,
  onClose,
  onLeadUpdated,
  onLeadDeleted,
}: LeadDrawerProps) {
  const { toast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Record<EditableField, string>>({} as any);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, { from: any; to: any }>>({});
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset edit mode when drawer closes or lead changes
  useEffect(() => {
    if (!open) {
      setEditMode(false);
      setShowEditConfirm(false);
      setShowDeleteConfirm(false);
    }
  }, [open]);

  const initForm = useCallback((l: LeadDetail) => {
    setFormData({
      firstName: l.firstName ?? "",
      lastName: l.lastName ?? "",
      phone: l.phone ?? "",
      email: l.email ?? "",
      address: l.address ?? "",
      city: l.city ?? "",
      state: l.state ?? "",
      zip: l.zip ?? "",
      serviceInterest: l.serviceInterest ?? "",
      quoteAmount: l.quoteAmount ? String(l.quoteAmount) : "",
      status: l.status ?? "new",
      followUpDate: l.followUpDate ?? "",
      notes: l.notes ?? "",
    });
  }, []);

  function handleEditClick() {
    if (!lead) return;
    initForm(lead);
    setEditMode(true);
  }

  function handleCancelEdit() {
    setEditMode(false);
    setShowEditConfirm(false);
  }

  function set(field: EditableField) {
    return (v: string) => setFormData(prev => ({ ...prev, [field]: v }));
  }

  function handleSaveClick() {
    if (!lead) return;
    // Compute changed fields
    const changed: Record<string, { from: any; to: any }> = {};
    for (const field of EDITABLE_FIELDS) {
      const oldVal = (lead as any)[field] ?? null;
      const newVal = formData[field] === "" ? null : formData[field];
      const oldStr = oldVal === null ? "" : String(oldVal);
      const newStr = newVal === null ? "" : String(newVal);
      if (oldStr !== newStr) {
        changed[field] = { from: oldVal, to: newVal };
      }
    }
    if (Object.keys(changed).length === 0) {
      toast({ title: "No changes to save." });
      return;
    }
    setPendingChanges(changed);
    setShowEditConfirm(true);
  }

  async function handleConfirmSave() {
    if (!lead) return;
    setSaving(true);
    try {
      // Send only changed fields
      const body: Record<string, any> = {};
      for (const [field, { to }] of Object.entries(pendingChanges)) {
        body[field] = to;
      }
      const res = await fetch(`${API}/api/canvassing/leads/${lead.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Update failed");
      const updated = await res.json();
      onLeadUpdated(updated);
      setEditMode(false);
      setShowEditConfirm(false);
      toast({ title: "Lead updated." });
    } catch {
      toast({ title: "Update failed. Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmDelete() {
    if (!lead) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/api/canvassing/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      onLeadDeleted(lead.id);
      toast({ title: "Lead deleted." });
    } catch {
      toast({ title: "Delete failed. Please try again.", variant: "destructive" });
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  }

  const fullName = lead ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Unknown" : "";
  const fullAddress = lead
    ? [lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ")
    : "";

  // Change history (most recent first)
  const changeHistory = lead?.changeLog ? [...lead.changeLog].reverse() : [];

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[999]"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-screen w-[420px] max-w-full bg-white shadow-2xl z-[1000] transition-transform duration-250 overflow-y-auto pb-20 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ willChange: "transform" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-slate-900 text-base truncate">
              {loading && !lead ? "Loading..." : fullName}
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {lead && (
                <Badge variant={STATUS_VARIANT[lead.status] ?? "neutral"}>
                  {STATUS_LABELS[lead.status] ?? lead.status}
                </Badge>
              )}
              {lead?.isHistoricalImport && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                  <Archive className="w-3 h-3" /> Historical
                </span>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 px-5 py-4 space-y-6">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {lead && !editMode && (
            <>
              {/* Contact Info */}
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Contact</h3>
                <div className="divide-y divide-slate-50">
                  {lead.phone && (
                    <FieldRow
                      icon={<Phone className="w-4 h-4" />}
                      label="Phone"
                      value={<a href={`tel:${lead.phone}`} className="text-primary hover:underline">{lead.phone}</a>}
                    />
                  )}
                  {lead.email && (
                    <FieldRow
                      icon={<Mail className="w-4 h-4" />}
                      label="Email"
                      value={<a href={`mailto:${lead.email}`} className="text-primary hover:underline">{lead.email}</a>}
                    />
                  )}
                  {fullAddress && (
                    <FieldRow
                      icon={<MapPin className="w-4 h-4" />}
                      label="Address"
                      value={fullAddress}
                    />
                  )}
                </div>
              </section>

              {/* Lead Info */}
              <section>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Lead Details</h3>
                <div className="divide-y divide-slate-50">
                  {lead.serviceInterest && (
                    <FieldRow
                      icon={<Tag className="w-4 h-4" />}
                      label="Service"
                      value={lead.serviceInterest.replace(/_/g, " ")}
                    />
                  )}
                  {lead.quoteAmount && (
                    <FieldRow
                      icon={<DollarSign className="w-4 h-4" />}
                      label="Quote Amount"
                      value={formatCurrency(parseFloat(lead.quoteAmount))}
                    />
                  )}
                  {lead.source && (
                    <FieldRow
                      icon={<Tag className="w-4 h-4" />}
                      label="Source"
                      value={lead.source}
                    />
                  )}
                  {lead.canvasser && (
                    <FieldRow
                      icon={<User className="w-4 h-4" />}
                      label="Canvasser"
                      value={lead.canvasser}
                    />
                  )}
                  {lead.followUpDate && (
                    <FieldRow
                      icon={<Calendar className="w-4 h-4" />}
                      label="Follow-up Date"
                      value={<span className="text-amber-600">{formatDate(lead.followUpDate)}</span>}
                    />
                  )}
                  <FieldRow
                    icon={<Clock className="w-4 h-4" />}
                    label="Created"
                    value={formatDate(lead.createdAt)}
                  />
                </div>
              </section>

              {/* Notes */}
              {lead.notes && (
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Notes</h3>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-4 py-3 leading-relaxed">
                    {lead.notes}
                  </p>
                </section>
              )}

              {/* Historical Import Record (Wolf Pack Wash) */}
              {lead.isHistoricalImport && (
                <section className="border border-amber-200 rounded-2xl bg-amber-50/60 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Archive className="w-4 h-4 text-amber-600" />
                    <h3 className="text-xs font-bold text-amber-700 uppercase tracking-widest">
                      Wolf Pack Wash — Historical Record
                    </h3>
                  </div>
                  <div className="divide-y divide-amber-100 text-sm">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-500 font-medium">Serviced</span>
                      {lead.isServiced ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <CheckCircle className="w-4 h-4" /> Yes
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400">
                          <XCircle className="w-4 h-4" /> No
                        </span>
                      )}
                    </div>
                    {lead.servicedOn && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Serviced On</span>
                        <span className="text-slate-800">{formatDate(lead.servicedOn)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between py-2">
                      <span className="text-slate-500 font-medium">Purchased</span>
                      {lead.isPurchased ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <CheckCircle className="w-4 h-4" /> Yes
                        </span>
                      ) : (
                        <span className="text-slate-400">No</span>
                      )}
                    </div>
                    {lead.totalQuote && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Total Quote</span>
                        <span className="text-slate-800 font-semibold">{formatCurrency(parseFloat(lead.totalQuote))}</span>
                      </div>
                    )}
                    {lead.soldDate && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Sold Date</span>
                        <span className="text-slate-800">{formatDate(lead.soldDate)}</span>
                      </div>
                    )}
                    {lead.scheduledDate && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Scheduled Date</span>
                        <span className="text-slate-800">{formatDate(lead.scheduledDate)}</span>
                      </div>
                    )}
                    {lead.frequency && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Frequency</span>
                        <span className="text-slate-800 capitalize">{lead.frequency}</span>
                      </div>
                    )}
                    {lead.leadYear && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Year</span>
                        <span className="text-slate-800">{lead.leadYear}</span>
                      </div>
                    )}
                    {(lead.houseSqft || lead.cementSqft) && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Property Size</span>
                        <span className="text-slate-800 text-xs text-right">
                          {lead.houseSqft ? `${lead.houseSqft.toLocaleString()} sqft house` : ""}
                          {lead.houseSqft && lead.cementSqft ? " · " : ""}
                          {lead.cementSqft ? `${lead.cementSqft.toLocaleString()} sqft cement` : ""}
                        </span>
                      </div>
                    )}
                    {lead.leadSourceOriginal && (
                      <div className="flex items-center justify-between py-2">
                        <span className="text-slate-500 font-medium">Original Source</span>
                        <span className="text-slate-800">{lead.leadSourceOriginal}</span>
                      </div>
                    )}
                  </div>
                  {lead.serviceNotes && (
                    <div className="mt-3 pt-3 border-t border-amber-100">
                      <p className="text-xs font-semibold text-slate-500 mb-1">Service Notes</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{lead.serviceNotes}</p>
                    </div>
                  )}
                  {lead.conversationNotes && (
                    <div className="mt-3 pt-3 border-t border-amber-100">
                      <p className="text-xs font-semibold text-slate-500 mb-1">Conversation Notes</p>
                      <p className="text-sm text-slate-700 leading-relaxed">{lead.conversationNotes}</p>
                    </div>
                  )}
                </section>
              )}

              {/* Linked jobs */}
              {lead.linkedJobs && lead.linkedJobs.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Linked Jobs</h3>
                  <div className="space-y-2">
                    {lead.linkedJobs.map((job: any) => (
                      <div key={job.id} className="bg-slate-50 rounded-xl px-4 py-3 text-sm">
                        <p className="font-semibold text-slate-900">
                          {job.serviceType?.replace(/_/g, " ")} — #{job.id}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">
                          {job.status?.replace(/_/g, " ")}
                          {job.scheduledAt ? ` · ${formatDate(job.scheduledAt)}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Change History */}
              {changeHistory.length > 0 && (
                <section>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Change History</h3>
                  <div className="space-y-3">
                    {changeHistory.map((entry, i) => (
                      <div key={i} className="text-xs text-slate-600 border-l-2 border-slate-200 pl-3">
                        <p className="font-semibold text-slate-500 mb-1">
                          {new Date(entry.changedAt).toLocaleDateString("en-US", {
                            month: "short", day: "numeric",
                          })} at {new Date(entry.changedAt).toLocaleTimeString("en-US", {
                            hour: "numeric", minute: "2-digit",
                          })} — {entry.changedByName}
                        </p>
                        {Object.entries(entry.fields).map(([field, { from, to }]) => (
                          <p key={field}>
                            changed <span className="font-medium text-slate-800">{fieldLabel(field)}</span>:{" "}
                            <span className="text-slate-400">{formatFieldValue(field, from)}</span>
                            {" → "}
                            <span className="text-slate-900 font-medium">{formatFieldValue(field, to)}</span>
                          </p>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* Edit Mode */}
          {lead && editMode && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <EditInput label="First Name" value={formData.firstName} onChange={set("firstName")} />
                <EditInput label="Last Name" value={formData.lastName} onChange={set("lastName")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditInput label="Phone" value={formData.phone} onChange={set("phone")} type="tel" />
                <EditInput label="Email" value={formData.email} onChange={set("email")} type="email" />
              </div>
              <EditInput label="Street Address" value={formData.address} onChange={set("address")} />
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-2">
                  <EditInput label="City" value={formData.city} onChange={set("city")} />
                </div>
                <div className="col-span-1">
                  <EditInput label="State" value={formData.state} onChange={set("state")} />
                </div>
                <div className="col-span-2">
                  <EditInput label="ZIP" value={formData.zip} onChange={set("zip")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditSelect
                  label="Service"
                  value={formData.serviceInterest}
                  onChange={set("serviceInterest")}
                  options={SERVICE_OPTIONS}
                />
                <EditInput label="Quote Amount ($)" value={formData.quoteAmount} onChange={set("quoteAmount")} type="number" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <EditSelect
                  label="Status"
                  value={formData.status}
                  onChange={set("status")}
                  options={STATUS_OPTIONS}
                />
                <EditInput label="Follow-up Date" value={formData.followUpDate} onChange={set("followUpDate")} type="date" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={e => set("notes")(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 focus:border-primary focus:outline-none text-sm bg-white resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Bar — fixed at bottom */}
        {lead && (
          <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-5 py-3 flex gap-3">
            {!editMode ? (
              <>
                <button
                  onClick={handleEditClick}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-red-200 text-red-600 font-semibold text-sm hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSaveClick}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex-1 px-4 py-2.5 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showEditConfirm && (
        <EditConfirmModal
          changed={pendingChanges}
          saving={saving}
          onCancel={() => setShowEditConfirm(false)}
          onConfirm={handleConfirmSave}
        />
      )}
      {showDeleteConfirm && (
        <DeleteConfirmModal
          leadName={fullName}
          deleting={deleting}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  );
}
