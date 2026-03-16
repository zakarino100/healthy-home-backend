import { useState, useEffect, useCallback } from "react";
import { X, Phone, Mail, MapPin, Briefcase, Trash2, Edit2, Check, AlertTriangle, BellOff, Star, ChevronRight } from "lucide-react";
import { Badge, Button } from "@/components/ui-components";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CustomerDetail {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  notes: string | null;
  optOut: boolean;
  reviewCampaignEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CustomerDrawerProps {
  open: boolean;
  customer: CustomerDetail | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onCustomerUpdated: (updated: CustomerDetail) => void;
  onCustomerDeleted: (id: number) => void;
}

// ---------------------------------------------------------------------------
// Edit input helper
// ---------------------------------------------------------------------------

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
    <div>
      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Delete confirm modal
// ---------------------------------------------------------------------------

function DeleteConfirmModal({
  customerName,
  linkedJobCount,
  isLoading,
  onConfirm,
  onCancel,
}: {
  customerName: string;
  linkedJobCount: number;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 z-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900">Delete Customer?</h3>
            <p className="text-sm text-slate-500">{customerName}</p>
          </div>
        </div>

        {linkedJobCount > 0 ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-sm text-red-700">
            <strong>Cannot delete</strong> — this customer has {linkedJobCount} linked job{linkedJobCount > 1 ? "s" : ""}. Remove those jobs first.
          </div>
        ) : (
          <p className="text-sm text-slate-600 mb-4">
            This will permanently delete the customer record. This cannot be undone.
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {linkedJobCount === 0 && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-60"
            >
              {isLoading ? "Deleting…" : "Yes, Delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main CustomerDrawer
// ---------------------------------------------------------------------------

export default function CustomerDrawer({
  open,
  customer,
  loading,
  error,
  onClose,
  onCustomerUpdated,
  onCustomerDeleted,
}: CustomerDrawerProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"view" | "edit" | "delete">("view");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [linkedJobCount, setLinkedJobCount] = useState(0);
  const [jobs, setJobs] = useState<any[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    notes: "",
    optOut: false,
    reviewCampaignEligible: false,
  });

  // Reset when customer changes
  useEffect(() => {
    if (customer) {
      setFormData({
        firstName: customer.firstName ?? "",
        lastName: customer.lastName ?? "",
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        address: customer.address ?? "",
        city: customer.city ?? "",
        state: customer.state ?? "",
        zip: customer.zip ?? "",
        notes: customer.notes ?? "",
        optOut: customer.optOut ?? false,
        reviewCampaignEligible: customer.reviewCampaignEligible ?? false,
      });
      setMode("view");
      // Load jobs
      setJobsLoading(true);
      fetch(`${API}/api/customers/${customer.id}/jobs`)
        .then(r => r.json())
        .then(data => {
          setJobs(Array.isArray(data) ? data : []);
          setLinkedJobCount(Array.isArray(data) ? data.length : 0);
        })
        .catch(() => setJobs([]))
        .finally(() => setJobsLoading(false));
    }
  }, [customer]);

  // Close on Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const set = (field: keyof typeof formData) => (value: string | boolean) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!customer) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/customers/${customer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName || "Unknown",
          lastName: formData.lastName,
          phone: formData.phone || null,
          email: formData.email || null,
          address: formData.address || null,
          city: formData.city || null,
          state: formData.state || null,
          zip: formData.zip || null,
          notes: formData.notes || null,
          optOut: formData.optOut,
          reviewCampaignEligible: formData.reviewCampaignEligible,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Save failed");
      const updated = await r.json();
      onCustomerUpdated(updated);
      setMode("view");
      toast({ title: "Customer updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!customer) return;
    setDeleting(true);
    try {
      const r = await fetch(`${API}/api/customers/${customer.id}`, { method: "DELETE" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409 && (body as any).linkedJobCount) {
          setLinkedJobCount((body as any).linkedJobCount);
          toast({ title: "Cannot delete", description: (body as any).error, variant: "destructive" });
          return;
        }
        throw new Error((body as any).error ?? "Delete failed");
      }
      onCustomerDeleted(customer.id);
      toast({ title: "Customer deleted" });
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeleting(false);
      setMode("view");
    }
  };

  const fullName = customer
    ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() || "Unknown"
    : "";

  const initials = customer
    ? `${customer.firstName?.[0] ?? ""}${customer.lastName?.[0] ?? ""}`.toUpperCase() || "?"
    : "";

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/30 z-[999] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] bg-white shadow-2xl z-[1000] flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
              {loading ? "…" : initials}
            </div>
            <div>
              <p className="font-bold text-slate-900 text-sm leading-tight">{loading ? "Loading…" : fullName}</p>
              <p className="text-xs text-slate-400">Customer</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {mode === "view" && !loading && customer && (
              <>
                <button
                  onClick={() => setMode("edit")}
                  className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-primary transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setMode("delete")}
                  className="p-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="py-16 text-center text-slate-400">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading…
            </div>
          )}

          {error && !loading && (
            <div className="py-8 text-center text-red-500 text-sm">{error}</div>
          )}

          {!loading && !error && customer && mode === "view" && (
            <>
              {/* Status badges */}
              <div className="flex flex-wrap gap-2">
                {customer.optOut && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                    <BellOff className="w-3 h-3" /> Opted Out
                  </span>
                )}
                {customer.reviewCampaignEligible && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    <Star className="w-3 h-3" /> Review Eligible
                  </span>
                )}
                {!customer.optOut && !customer.reviewCampaignEligible && (
                  <span className="text-xs text-slate-400">Active customer</span>
                )}
              </div>

              {/* Contact info */}
              <div className="space-y-3">
                {customer.phone && (
                  <div className="flex items-center gap-3 text-sm">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={`tel:${customer.phone}`} className="text-primary hover:underline font-medium">{customer.phone}</a>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-3 text-sm min-w-0">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <a href={`mailto:${customer.email}`} className="text-primary hover:underline truncate">{customer.email}</a>
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div>
                      <p>{customer.address}</p>
                      {(customer.city || customer.state) && (
                        <p className="text-slate-500">{[customer.city, customer.state, customer.zip].filter(Boolean).join(", ")}</p>
                      )}
                    </div>
                  </div>
                )}
                {!customer.phone && !customer.email && !customer.address && (
                  <p className="text-sm text-slate-400 italic">No contact info on file</p>
                )}
              </div>

              {/* Notes */}
              {customer.notes && (
                <div className="bg-slate-50 rounded-xl p-3.5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Notes</p>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{customer.notes}</p>
                </div>
              )}

              {/* Job history */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="w-4 h-4 text-slate-400" />
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Job History</p>
                  {!jobsLoading && (
                    <span className="ml-auto text-xs text-slate-400">{jobs.length} job{jobs.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
                {jobsLoading && (
                  <div className="py-4 text-center text-slate-400 text-sm">Loading jobs…</div>
                )}
                {!jobsLoading && jobs.length === 0 && (
                  <p className="text-sm text-slate-400 italic py-2">No jobs yet</p>
                )}
                {!jobsLoading && jobs.map((job: any) => (
                  <div key={job.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{job.serviceType?.replace(/_/g, " ") || "Service TBD"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold mr-1.5 ${
                          job.status === "completed" ? "bg-green-100 text-green-700"
                          : job.status === "scheduled" ? "bg-blue-100 text-blue-700"
                          : "bg-amber-100 text-amber-700"
                        }`}>{job.status?.replace(/_/g, " ").toUpperCase()}</span>
                        {job.scheduledAt ? formatDate(job.scheduledAt) : "—"}
                        {job.technicianAssigned && ` · ${job.technicianAssigned}`}
                      </p>
                    </div>
                    {(job.soldPrice || job.quotedPrice) && (
                      <span className="text-sm font-bold text-emerald-700 ml-3 shrink-0">
                        {formatCurrency(job.soldPrice || job.quotedPrice)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Meta */}
              <div className="pt-2 border-t border-slate-100 text-xs text-slate-400 space-y-1">
                <p>Added {formatDate(customer.createdAt)}</p>
                {customer.updatedAt !== customer.createdAt && (
                  <p>Last updated {formatDate(customer.updatedAt)}</p>
                )}
              </div>
            </>
          )}

          {/* ─── Edit mode ─── */}
          {!loading && !error && customer && mode === "edit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <EditInput label="First Name" value={formData.firstName} onChange={set("firstName")} placeholder="Jane" />
                <EditInput label="Last Name" value={formData.lastName} onChange={set("lastName")} placeholder="Smith" />
              </div>
              <EditInput label="Phone" value={formData.phone} onChange={set("phone")} type="tel" placeholder="555-0100" />
              <EditInput label="Email" value={formData.email} onChange={set("email")} type="email" placeholder="jane@email.com" />
              <EditInput label="Street Address" value={formData.address} onChange={set("address")} placeholder="123 Main St" />
              <div className="grid grid-cols-5 gap-2">
                <div className="col-span-2"><EditInput label="City" value={formData.city} onChange={set("city")} placeholder="Raleigh" /></div>
                <div className="col-span-1"><EditInput label="State" value={formData.state} onChange={set("state")} placeholder="NC" /></div>
                <div className="col-span-2"><EditInput label="ZIP" value={formData.zip} onChange={set("zip")} placeholder="27601" /></div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={e => set("notes")(e.target.value)}
                  rows={3}
                  placeholder="Internal notes about this customer…"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white resize-none"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-1">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Opted Out</p>
                    <p className="text-xs text-slate-400">Do not contact for marketing</p>
                  </div>
                  <div
                    onClick={() => set("optOut")(!formData.optOut)}
                    className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${formData.optOut ? "bg-red-500" : "bg-slate-200"}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow m-0.5 transition-transform ${formData.optOut ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Review Campaign Eligible</p>
                    <p className="text-xs text-slate-400">Include in review request workflow</p>
                  </div>
                  <div
                    onClick={() => set("reviewCampaignEligible")(!formData.reviewCampaignEligible)}
                    className={`w-11 h-6 rounded-full transition-colors cursor-pointer ${formData.reviewCampaignEligible ? "bg-primary" : "bg-slate-200"}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow m-0.5 transition-transform ${formData.reviewCampaignEligible ? "translate-x-5" : "translate-x-0"}`} />
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {!loading && !error && customer && mode === "edit" && (
          <div className="shrink-0 px-5 py-4 border-t border-slate-100 flex gap-3 justify-end bg-white">
            <button
              type="button"
              onClick={() => setMode("view")}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {mode === "delete" && customer && (
        <DeleteConfirmModal
          customerName={fullName}
          linkedJobCount={linkedJobCount}
          isLoading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setMode("view")}
        />
      )}
    </>
  );
}
