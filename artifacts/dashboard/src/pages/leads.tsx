import { useState, useMemo } from "react";
import {
  useListLeads,
  useListCanvassingSessions,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Badge, Button, Modal, Input, Select, Label } from "@/components/ui-components";
import { MapPin, Phone, User, TrendingUp, Filter, Plus, Archive } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCreateLead } from "@workspace/api-client-react";
import LeadDrawer, { type LeadDetail } from "@/components/LeadDrawer";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");

const WOLF_PACK_SOURCE = "Wolf Pack Wash leads historical import";

type Source = "d2d" | "referral" | "ad" | "other";
type Status = "new" | "quoted" | "follow_up" | "sold" | "lost" | "no_answer" | "not_home" | "not_interested" | "contacted" | "completed";

const SOURCE_LABELS: Record<Source, string> = {
  d2d: "Door-to-Door",
  referral: "Referral",
  ad: "Advertisement",
  other: "Other",
};

const SOURCE_COLORS: Record<Source, string> = {
  d2d: "bg-blue-100 text-blue-800 border-blue-200",
  referral: "bg-emerald-100 text-emerald-800 border-emerald-200",
  ad: "bg-purple-100 text-purple-800 border-purple-200",
  other: "bg-slate-100 text-slate-700 border-slate-200",
};

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

function heatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "bg-slate-50 text-slate-300";
  const ratio = value / max;
  if (ratio < 0.25) return "bg-emerald-50 text-emerald-600";
  if (ratio < 0.5) return "bg-emerald-100 text-emerald-700";
  if (ratio < 0.75) return "bg-emerald-300 text-emerald-900";
  return "bg-emerald-500 text-white";
}

export default function LeadsPage() {
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Drawer state
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Track optimistic local state so list updates instantly (no loading flash)
  const [localDeleted, setLocalDeleted] = useState<Set<string>>(new Set());
  const [localUpdated, setLocalUpdated] = useState<Map<string, Partial<LeadDetail>>>(new Map());

  async function handleLeadClick(lead: any) {
    setSelectedLead(lead as LeadDetail);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const res = await fetch(`${API}/api/canvassing/leads/${lead.id}`);
      if (!res.ok) throw new Error("Failed to load lead");
      const full = await res.json();
      setSelectedLead(full as LeadDetail);
    } catch {
      setDrawerError("Could not load lead detail. Please try again.");
    } finally {
      setDrawerLoading(false);
    }
  }

  function handleLeadUpdated(updated: LeadDetail) {
    setSelectedLead(updated);
    setLocalUpdated(prev => new Map(prev).set(updated.id, updated));
  }

  function handleLeadDeleted(deletedId: string) {
    setLocalDeleted(prev => new Set(prev).add(deletedId));
    setDrawerOpen(false);
    setSelectedLead(null);
  }

  const { data: leads, isLoading: leadsLoading, error: leadsError } = useListLeads(
    (sourceFilter !== "all" || statusFilter !== "all")
      ? {
          ...(sourceFilter === "historical" ? { source: WOLF_PACK_SOURCE as any } : sourceFilter !== "all" ? { source: sourceFilter as any } : {}),
          ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
        }
      : undefined
  );

  const { data: allLeads } = useListLeads();
  const { data: sessions } = useListCanvassingSessions();

  // --- Source breakdown stats ---
  const sourceStats = useMemo(() => {
    const counts: Record<string, number> = { d2d: 0, referral: 0, ad: 0, other: 0, historical: 0 };
    (allLeads ?? []).forEach((l) => {
      const s = l.source ?? "other";
      if (s === WOLF_PACK_SOURCE) {
        counts.historical = (counts.historical ?? 0) + 1;
      } else if (["d2d", "referral", "ad"].includes(s)) {
        counts[s] = (counts[s] ?? 0) + 1;
      } else {
        counts.other = (counts.other ?? 0) + 1;
      }
    });
    return counts;
  }, [allLeads]);

  // --- Neighborhood heat map (from sessions) ---
  const heatmapData = useMemo(() => {
    const map: Record<string, { doors: number; convos: number; closes: number; revenue: number; sessions: number }> = {};
    (sessions ?? []).forEach((s) => {
      const key = s.neighborhood || "Unknown";
      if (!map[key]) map[key] = { doors: 0, convos: 0, closes: 0, revenue: 0, sessions: 0 };
      map[key].doors += s.doorsKnocked ?? 0;
      map[key].convos += s.goodConversations ?? 0;
      map[key].closes += s.closes ?? 0;
      map[key].revenue += parseFloat(s.revenueSold ?? "0");
      map[key].sessions += 1;
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sessions]);

  const maxDoors = Math.max(...heatmapData.map((r) => r.doors), 1);
  const maxConvos = Math.max(...heatmapData.map((r) => r.convos), 1);
  const maxCloses = Math.max(...heatmapData.map((r) => r.closes), 1);
  const maxRevenue = Math.max(...heatmapData.map((r) => r.revenue), 1);

  // Apply local optimistic deletes and updates on top of server data
  const visibleLeads = useMemo(
    () =>
      (leads ?? [])
        .filter((l) => !localDeleted.has(l.id))
        .map((l) => ({ ...l, ...(localUpdated.get(l.id) ?? {}) })),
    [leads, localDeleted, localUpdated],
  );

  if (leadsLoading && !leads) return <PageLoader />;
  if (leadsError) return <ErrorState error={leadsError} />;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Leads</h2>
          <p className="text-slate-500 mt-1 text-sm">All leads — one table, every source</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4 mr-1" /> Add Lead
        </Button>
      </div>

      {/* Source Breakdown */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 md:gap-4">
        {(["d2d", "referral", "ad", "other"] as Source[]).map((src) => (
          <button
            key={src}
            onClick={() => setSourceFilter(sourceFilter === src ? "all" : src)}
            className={`text-left rounded-2xl p-4 sm:p-5 border-2 transition-all hover-lift ${
              sourceFilter === src
                ? "border-primary bg-primary/5 shadow-md"
                : "border-slate-200/60 bg-white shadow-sm hover:border-slate-300"
            }`}
          >
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{SOURCE_LABELS[src]}</p>
            <p className="text-2xl md:text-3xl font-display font-extrabold text-slate-900">{sourceStats[src] ?? 0}</p>
            <p className="text-xs text-slate-400 mt-1">leads</p>
          </button>
        ))}
        {/* Wolf Pack historical imports */}
        <button
          onClick={() => setSourceFilter(sourceFilter === "historical" ? "all" : "historical")}
          className={`text-left rounded-2xl p-4 sm:p-5 border-2 transition-all hover-lift ${
            sourceFilter === "historical"
              ? "border-amber-500 bg-amber-50 shadow-md"
              : "border-amber-200/60 bg-white shadow-sm hover:border-amber-300"
          }`}
        >
          <div className="flex items-center gap-1 mb-2">
            <Archive className="w-3 h-3 text-amber-600" />
            <p className="text-xs font-bold text-amber-600 uppercase tracking-wide">Historical</p>
          </div>
          <p className="text-2xl md:text-3xl font-display font-extrabold text-slate-900">{sourceStats.historical ?? 0}</p>
          <p className="text-xs text-amber-500 mt-1">Wolf Pack Wash</p>
        </button>
      </div>

      {/* Neighborhood Heat Map */}
      {heatmapData.length > 0 && (
        <Card className="!p-4 sm:!p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-display font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Neighborhood Heat Map
            </h3>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className="w-4 h-4 rounded bg-slate-50 border inline-block" /> Low
              <span className="w-4 h-4 rounded bg-emerald-100 inline-block" />
              <span className="w-4 h-4 rounded bg-emerald-300 inline-block" />
              <span className="w-4 h-4 rounded bg-emerald-500 inline-block" /> High
            </div>
          </div>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[420px] text-sm border-separate border-spacing-1">
              <thead>
                <tr>
                  <th className="text-left text-xs font-bold text-slate-500 pb-2 pr-3 min-w-[120px]">Neighborhood</th>
                  <th className="text-center text-xs font-bold text-slate-500 pb-2 w-20">Doors</th>
                  <th className="text-center text-xs font-bold text-slate-500 pb-2 w-20">Convos</th>
                  <th className="text-center text-xs font-bold text-slate-500 pb-2 w-20">Closes</th>
                  <th className="text-center text-xs font-bold text-slate-500 pb-2 w-28">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {heatmapData.map((row) => (
                  <tr key={row.name}>
                    <td className="py-1 pr-3 font-semibold text-slate-700 text-xs sm:text-sm truncate max-w-[140px]">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        {row.name}
                      </div>
                    </td>
                    <td className="py-1">
                      <div className={`rounded-lg px-2 py-1.5 text-center font-bold text-xs ${heatColor(row.doors, maxDoors)}`}>
                        {row.doors}
                      </div>
                    </td>
                    <td className="py-1">
                      <div className={`rounded-lg px-2 py-1.5 text-center font-bold text-xs ${heatColor(row.convos, maxConvos)}`}>
                        {row.convos}
                      </div>
                    </td>
                    <td className="py-1">
                      <div className={`rounded-lg px-2 py-1.5 text-center font-bold text-xs ${heatColor(row.closes, maxCloses)}`}>
                        {row.closes}
                      </div>
                    </td>
                    <td className="py-1">
                      <div className={`rounded-lg px-2 py-1.5 text-center font-bold text-xs ${heatColor(row.revenue, maxRevenue)}`}>
                        {formatCurrency(row.revenue)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {heatmapData.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-6">Log canvassing sessions with neighborhoods to see the heat map.</p>
          )}
        </Card>
      )}

      {/* Filters + Lead List */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <div className="flex flex-wrap gap-2">
            {["all", "d2d", "referral", "ad", "other", "historical"].map((s) => (
              <button
                key={s}
                onClick={() => setSourceFilter(s)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  sourceFilter === s
                    ? s === "historical"
                      ? "bg-amber-500 text-white border-amber-500"
                      : "bg-primary text-white border-primary"
                    : s === "historical"
                      ? "bg-white text-amber-600 border-amber-200 hover:border-amber-400"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {s === "all" ? "All Sources" : s === "historical" ? "Historical (Wolf Pack)" : SOURCE_LABELS[s as Source]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 ml-auto">
            {["all", "new", "no_answer", "not_home", "contacted", "follow_up", "quoted", "sold", "not_interested", "completed"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                  statusFilter === s
                    ? s === "sold" ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {s === "all" ? "All Statuses" : (STATUS_LABELS[s] ?? s.replace(/_/g, " "))}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {visibleLeads.map((lead) => (
            <Card
              key={lead.id}
              className="!p-4 sm:!p-5 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => handleLeadClick(lead)}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 shrink-0 text-xs font-bold">
                    {lead.firstName?.[0]}{lead.lastName?.[0] || ""}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                        {lead.firstName} {lead.lastName}
                      </h3>
                      {lead.source === WOLF_PACK_SOURCE ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border bg-amber-100 text-amber-700 border-amber-200">
                          <Archive className="w-3 h-3" /> Historical
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${SOURCE_COLORS[lead.source as Source ?? "other"]}`}>
                          {SOURCE_LABELS[lead.source as Source ?? "other"]}
                        </span>
                      )}
                      <Badge variant={STATUS_VARIANT[lead.status ?? "new"] ?? "neutral"}>
                        {STATUS_LABELS[lead.status ?? "new"] ?? (lead.status ?? "new").replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {lead.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          <a href={`tel:${lead.phone}`} className="hover:text-primary">{lead.phone}</a>
                        </span>
                      )}
                      {(lead.city || lead.address) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {lead.address ? `${lead.address}, ` : ""}{lead.city}
                        </span>
                      )}
                      {lead.canvasser && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {lead.canvasser}
                        </span>
                      )}
                    </div>
                    {lead.serviceInterest && (
                      <p className="text-xs text-slate-400 mt-1">{lead.serviceInterest}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 sm:shrink-0 pl-12 sm:pl-0">
                  {lead.quoteAmount && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Quote</p>
                      <p className="font-bold text-slate-900 text-sm">{formatCurrency(lead.quoteAmount)}</p>
                    </div>
                  )}
                  {lead.followUpDate && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Follow-up</p>
                      <p className="font-bold text-amber-600 text-xs">{formatDate(lead.followUpDate)}</p>
                    </div>
                  )}
                </div>
              </div>
              {lead.notes && (
                <p className="mt-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 ml-12">
                  {lead.notes}
                </p>
              )}
            </Card>
          ))}

          {visibleLeads.length === 0 && (
            <div className="py-16 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No leads match these filters.</p>
              <p className="text-sm mt-1">Try changing the source or status filter above.</p>
            </div>
          )}
        </div>
      </div>

      <AddLeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <LeadDrawer
        open={drawerOpen}
        lead={selectedLead}
        loading={drawerLoading}
        error={drawerError}
        onClose={() => setDrawerOpen(false)}
        onLeadUpdated={handleLeadUpdated}
        onLeadDeleted={handleLeadDeleted}
      />
    </div>
  );
}

function AddLeadModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [status, setStatus] = useState<string>("new");

  const createMutation = useCreateLead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/canvassing/leads"] });
        queryClient.invalidateQueries({ queryKey: ["/api/jobs/pending-sales"] });
        toast({ title: "Lead added successfully" });
        onClose();
        setStatus("new");
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        firstName: fd.get("firstName") as string,
        lastName: (fd.get("lastName") as string) || "",
        phone: (fd.get("phone") as string) || undefined,
        email: (fd.get("email") as string) || undefined,
        address: (fd.get("address") as string) || undefined,
        city: (fd.get("city") as string) || undefined,
        state: (fd.get("state") as string) || undefined,
        zip: (fd.get("zip") as string) || undefined,
        source: (fd.get("source") as any) || "d2d",
        serviceInterest: (fd.get("serviceInterest") as string) || undefined,
        quotePrice: (fd.get("quotePrice") as string) || undefined,
        soldPrice: status === "sold" ? ((fd.get("soldPrice") as string) || undefined) : undefined,
        isBundle: fd.get("isBundle") === "on",
        status: status as any,
        notes: (fd.get("notes") as string) || undefined,
      } as any,
    });
  };

  const isSold = status === "sold";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Lead">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name *</Label><Input name="firstName" required placeholder="Jane" /></div>
          <div><Label>Last Name</Label><Input name="lastName" placeholder="Smith" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Source *</Label>
            <Select name="source" required defaultValue="d2d">
              <option value="d2d">Door-to-Door</option>
              <option value="referral">Referral</option>
              <option value="ad">Advertisement</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div>
            <Label>Status *</Label>
            <Select name="status" value={status} onChange={e => setStatus(e.target.value)} required>
              <option value="new">New</option>
              <option value="no_answer">No Answer</option>
              <option value="not_home">Not Home</option>
              <option value="contacted">Contacted</option>
              <option value="quoted">Quoted</option>
              <option value="follow_up">Follow Up</option>
              <option value="sold">Sold ✓</option>
              <option value="not_interested">Not Interested</option>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><Label>Phone</Label><Input type="tel" name="phone" placeholder="555-0100" inputMode="tel" /></div>
          <div><Label>Email</Label><Input type="email" name="email" placeholder="jane@email.com" /></div>
        </div>

        <div><Label>Street Address</Label><Input name="address" placeholder="123 Main St" /></div>
        <div className="grid grid-cols-5 gap-3">
          <div className="col-span-2"><Label>City</Label><Input name="city" placeholder="Austin" /></div>
          <div className="col-span-1"><Label>State</Label><Input name="state" placeholder="TX" /></div>
          <div className="col-span-2"><Label>ZIP</Label><Input name="zip" placeholder="78701" inputMode="numeric" /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Service / Package</Label>
            <Select name="serviceInterest" defaultValue="house_wash">
              <option value="house_wash">House Wash</option>
              <option value="driveway_cleaning">Driveway Cleaning</option>
              <option value="bundle">Bundle Package</option>
              <option value="other">Other</option>
            </Select>
          </div>
          <div><Label>Quote Price ($)</Label><Input type="number" step="0.01" name="quotePrice" inputMode="decimal" placeholder="0.00" /></div>
        </div>

        {isSold && (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide">Sale Details</p>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Sold Price ($) *</Label>
                <Input type="number" step="0.01" name="soldPrice" required={isSold} inputMode="decimal" placeholder="0.00" className="border-emerald-300 focus:border-emerald-500" />
              </div>
              <div className="flex items-center gap-2 pb-2">
                <input
                  type="checkbox"
                  name="isBundle"
                  id="isBundle"
                  className="w-4 h-4 rounded border-slate-300 text-primary"
                />
                <label htmlFor="isBundle" className="text-sm font-medium text-slate-700 cursor-pointer">Bundle sale?</label>
              </div>
            </div>
          </div>
        )}

        <div>
          <Label>Canvasser / Rep</Label>
          <Input name="canvasser" placeholder="Name or email" />
        </div>

        <div>
          <Label>Notes</Label>
          <textarea
            name="notes"
            rows={2}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-50 border-2 border-slate-200 focus:border-primary focus:outline-none text-base resize-none"
            placeholder="Any relevant notes..."
          />
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            isLoading={createMutation.isPending}
            className={isSold ? "bg-emerald-600 hover:bg-emerald-700" : ""}
          >
            {isSold ? "💰 Record Sale" : "Save Lead"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
