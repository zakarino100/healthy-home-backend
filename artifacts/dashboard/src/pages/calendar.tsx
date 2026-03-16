import { useState, useMemo } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Card, Button, Badge, Modal, Input, Label, Select } from "@/components/ui-components";
import { ChevronLeft, ChevronRight, Plus, Briefcase, Map, DollarSign, Trash2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { TECHNICIANS } from "@/lib/constants";
import { useToast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function toDateStr(d: Date) {
  return d.toISOString().split("T")[0];
}
function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}
function formatDayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}
function formatMonthDay(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function formatWeekRange(start: Date, end: Date) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
}
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ---------------------------------------------------------------------------
// Tech color map
// ---------------------------------------------------------------------------
const TECH_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  Naseem: { bg: "bg-blue-50", text: "text-blue-900", border: "border-blue-300", dot: "bg-blue-500" },
  Zak:    { bg: "bg-emerald-50", text: "text-emerald-900", border: "border-emerald-300", dot: "bg-emerald-500" },
  _unassigned: { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-300", dot: "bg-slate-400" },
};
function techColor(name: string | null) {
  return TECH_COLORS[name ?? "_unassigned"] ?? TECH_COLORS["_unassigned"];
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type CalJob = {
  id: number;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  serviceType: string;
  status: string;
  scheduledAt: string | null;
  technicianAssigned: string | null;
  soldPrice: string | null;
  dateKey: string | null;
};
type CalRoute = {
  id: number;
  date: string;
  repEmail: string;
  repName: string | null;
  neighborhood: string | null;
  routeName: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Calendar page
// ---------------------------------------------------------------------------
export default function CalendarPage() {
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(toDateStr(new Date()));
  const [isAddRouteOpen, setIsAddRouteOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 6);
  const startStr = toDateStr(weekStart);
  const endStr = toDateStr(weekEnd);

  const { data, isLoading } = useQuery<{ jobs: CalJob[]; routes: CalRoute[] }>({
    queryKey: ["/api/calendar", startStr, endStr],
    queryFn: async () => {
      const r = await fetch(`/api/calendar?startDate=${startStr}&endDate=${endStr}`);
      if (!r.ok) throw new Error("Failed to load calendar");
      return r.json();
    },
  });

  const deleteRoute = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/canvassing/routes/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete route");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      toast({ title: "Route removed" });
    },
    onError: () => toast({ title: "Error removing route", variant: "destructive" }),
  });

  const dayJobs = useMemo(() => {
    const map: Record<string, CalJob[]> = {};
    (data?.jobs ?? []).forEach(j => {
      if (j.dateKey) {
        map[j.dateKey] = [...(map[j.dateKey] ?? []), j];
      }
    });
    return map;
  }, [data]);

  const dayRoutes = useMemo(() => {
    const map: Record<string, CalRoute[]> = {};
    (data?.routes ?? []).forEach(r => {
      map[r.date] = [...(map[r.date] ?? []), r];
    });
    return map;
  }, [data]);

  const selJobs = dayJobs[selectedDate] ?? [];
  const selRoutes = dayRoutes[selectedDate] ?? [];

  // Group selected jobs by technician
  const jobsByTech = useMemo(() => {
    const m: Record<string, CalJob[]> = {};
    selJobs.forEach(j => {
      const key = j.technicianAssigned || "_unassigned";
      m[key] = [...(m[key] ?? []), j];
    });
    return m;
  }, [selJobs]);

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Schedule</h2>
          <p className="text-slate-500 mt-1 text-sm">Jobs by technician · Canvassing routes by day</p>
        </div>
        <Button onClick={() => setIsAddRouteOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add Route
        </Button>
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={prevWeek}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-slate-700 min-w-[180px] text-center">
          {formatWeekRange(weekStart, weekEnd)}
        </span>
        <button
          onClick={nextWeek}
          className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-slate-600"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setWeekStart(getMondayOf(new Date())); setSelectedDate(toDateStr(new Date())); }}
          className="ml-2 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
        >
          Today
        </button>
      </div>

      {/* Day tabs */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {weekDays.map(day => {
          const ds = toDateStr(day);
          const isSelected = ds === selectedDate;
          const isToday = ds === toDateStr(new Date());
          const jobCount = (dayJobs[ds] ?? []).length;
          const routeCount = (dayRoutes[ds] ?? []).length;

          return (
            <button
              key={ds}
              onClick={() => setSelectedDate(ds)}
              className={`flex flex-col items-center p-2 sm:p-3 rounded-xl border-2 transition-all text-center ${
                isSelected
                  ? "border-primary bg-primary/5 text-primary"
                  : isToday
                    ? "border-slate-300 bg-slate-50 text-slate-800"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50 text-slate-600"
              }`}
            >
              <span className={`text-xs font-bold uppercase tracking-wide ${isSelected ? "text-primary" : "text-slate-400"}`}>
                {formatDayLabel(day)}
              </span>
              <span className={`text-base sm:text-xl font-display font-bold mt-0.5 ${isToday && !isSelected ? "text-primary" : ""}`}>
                {day.getDate()}
              </span>
              {/* Indicator dots */}
              <div className="flex gap-1 mt-1.5 h-2">
                {jobCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" title={`${jobCount} job${jobCount > 1 ? "s" : ""}`} />
                )}
                {routeCount > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={`${routeCount} route${routeCount > 1 ? "s" : ""}`} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Jobs column */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-4 h-4 text-blue-500" />
            <h3 className="font-bold text-base text-slate-900">Jobs</h3>
            {selJobs.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{selJobs.length}</span>
            )}
          </div>

          {selJobs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
              <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No jobs scheduled</p>
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(jobsByTech)
                .sort(([a], [b]) => (a === "_unassigned" ? 1 : b === "_unassigned" ? -1 : a.localeCompare(b)))
                .map(([tech, jobs]) => {
                  const c = techColor(tech === "_unassigned" ? null : tech);
                  return (
                    <div key={tech}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                          {tech === "_unassigned" ? "Unassigned" : tech}
                        </span>
                        <span className="text-xs text-slate-400">({jobs.length})</span>
                      </div>
                      {jobs.map(job => (
                        <Card key={job.id} className={`!p-3 sm:!p-4 mb-2 border-l-4 ${c.border} ${c.bg}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={`font-bold text-sm ${c.text}`}>
                                {job.customerFirstName || job.customerLastName
                                  ? `${job.customerFirstName ?? ""} ${job.customerLastName ?? ""}`.trim()
                                  : "Unknown Customer"
                                }
                              </p>
                              {job.customerAddress && (
                                <p className="text-xs text-slate-500 mt-0.5 truncate">
                                  {job.customerAddress}{job.customerCity ? `, ${job.customerCity}` : ""}
                                </p>
                              )}
                              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mt-1">
                                {job.serviceType.replace(/_/g, " ")}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {job.scheduledAt && (
                                <p className="text-xs font-bold text-slate-700">{formatTime(job.scheduledAt)}</p>
                              )}
                              {job.soldPrice && (
                                <p className={`text-xs font-bold ${c.text} flex items-center gap-0.5 justify-end mt-1`}>
                                  <DollarSign className="w-3 h-3" />{formatCurrency(job.soldPrice)}
                                </p>
                              )}
                              <Badge
                                variant={job.status === "completed" ? "success" : job.status === "scheduled" ? "default" : "neutral"}
                                className="mt-1"
                              >
                                {job.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Routes column */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Map className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-base text-slate-900">Canvassing Routes</h3>
            {selRoutes.length > 0 && (
              <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">{selRoutes.length}</span>
            )}
          </div>

          {selRoutes.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-slate-400">
              <Map className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">No routes planned</p>
              <button
                onClick={() => setIsAddRouteOpen(true)}
                className="mt-3 text-xs text-primary font-bold hover:underline"
              >
                + Add a route
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {selRoutes.map(r => (
                <Card key={r.id} className="!p-3 sm:!p-4 border-l-4 border-l-amber-400 bg-amber-50/40">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-slate-900">
                        {r.repName || r.repEmail}
                      </p>
                      {(r.neighborhood || r.routeName) && (
                        <p className="text-xs text-slate-600 mt-0.5 truncate">
                          {r.neighborhood}{r.neighborhood && r.routeName ? " · " : ""}{r.routeName}
                        </p>
                      )}
                      {r.notes && (
                        <p className="text-xs text-amber-800 mt-1 italic">{r.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        r.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                        r.status === "active" ? "bg-blue-100 text-blue-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>
                        {r.status}
                      </span>
                      <button
                        onClick={() => deleteRoute.mutate(r.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors"
                        title="Remove route"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddRouteModal
        isOpen={isAddRouteOpen}
        onClose={() => setIsAddRouteOpen(false)}
        defaultDate={selectedDate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Route modal — writes to shared canvassing_routes table
// ---------------------------------------------------------------------------
function AddRouteModal({ isOpen, onClose, defaultDate }: { isOpen: boolean; onClose: () => void; defaultDate: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const r = await fetch("/api/canvassing/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create route");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar"] });
      toast({ title: "Route added!", description: "Visible in the canvassing app route schedule." });
      onClose();
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const repRaw = fd.get("rep") as string;
    const repMap: Record<string, { email: string; name: string }> = {
      zak:    { email: "zakarino100@gmail.com", name: "Zak" },
      naseem: { email: "naseem@healthyhome.com", name: "Naseem" },
    };
    const rep = repMap[repRaw] ?? { email: repRaw, name: repRaw };
    mutation.mutate({
      date: fd.get("date") as string,
      repEmail: rep.email,
      repName: rep.name,
      neighborhood: (fd.get("neighborhood") as string) || null,
      routeName: (fd.get("routeName") as string) || null,
      notes: (fd.get("notes") as string) || null,
      status: "planned",
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Canvassing Route">
      <p className="text-sm text-slate-500 mb-4">
        Routes added here are stored in the shared canvassing routes table — visible in both this schedule and the canvassing app.
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Date *</Label>
            <Input type="date" name="date" defaultValue={defaultDate} required />
          </div>
          <div>
            <Label>Rep *</Label>
            <Select name="rep" required defaultValue="">
              <option value="" disabled>Select...</option>
              <option value="zak">Zak</option>
              <option value="naseem">Naseem</option>
              <option value="other">Other</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Neighborhood / Area</Label>
          <Input name="neighborhood" placeholder="e.g. North Hills, Cary" />
        </div>
        <div>
          <Label>Route Name / Description</Label>
          <Input name="routeName" placeholder="e.g. Sorrell Brook loop, Grid A" />
        </div>
        <div>
          <Label>Notes</Label>
          <Input name="notes" placeholder="Any notes about this route..." />
        </div>
        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={mutation.isPending}>
            <Map className="w-4 h-4 mr-2" />
            Add Route
          </Button>
        </div>
      </form>
    </Modal>
  );
}
