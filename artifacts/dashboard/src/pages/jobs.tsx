import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useListJobs, useCreateJob, useCompleteJob, useListCustomers } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Input, Select, Label } from "@/components/ui-components";
import { Plus, Check, Calendar, DollarSign, Clock, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const TECHNICIANS = ["Naseem", "Zak"];

type FilterType = "all" | "scheduled" | "completed";

type PendingSale = {
  leadId: string;
  firstName: string;
  lastName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  canvasser: string | null;
  soldPrice: string | null;
  servicePackage: string | null;
  isBundle: boolean;
  repNotes: string | null;
  createdAt: string;
};

export default function JobsPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [schedulingLead, setSchedulingLead] = useState<PendingSale | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: jobs, isLoading, error } = useListJobs(
    filter !== "all" ? { status: filter as any } : undefined
  );

  const { data: pendingSales = [], isLoading: pendingLoading } = useQuery<PendingSale[]>({
    queryKey: ["/api/jobs/pending-sales"],
    queryFn: async () => {
      const r = await fetch("/api/jobs/pending-sales");
      if (!r.ok) throw new Error("Failed to fetch pending sales");
      return r.json();
    },
  });

  const completeMutation = useCompleteJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast({ title: "Job marked as completed", description: "Review workflow triggered automatically." });
      },
      onError: (err: any) => {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    }
  });

  const handleComplete = (id: number) => {
    if (confirm("Mark this job as completed? This will trigger the satisfaction workflow.")) {
      completeMutation.mutate({ id });
    }
  };

  if (isLoading && !jobs) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: "all", label: "All" },
    { key: "scheduled", label: "Scheduled" },
    { key: "completed", label: "Done" },
  ];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Jobs Pipeline</h2>
          <p className="text-slate-500 mt-1 text-sm">Manage scheduled service appointments</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="bg-white border border-slate-200 p-1 rounded-xl flex shadow-sm">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
                  filter === f.key
                    ? f.key === "scheduled" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button onClick={() => setIsModalOpen(true)} className="flex-1 sm:flex-none justify-center">
            <Plus className="w-4 h-4 mr-1" /> New Job
          </Button>
        </div>
      </div>

      {/* Pending Sales — sold leads awaiting scheduling */}
      {pendingSales.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-500" />
            <h3 className="font-bold text-base text-slate-900">
              Needs Scheduling
            </h3>
            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {pendingSales.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {pendingSales.map(sale => (
              <Card key={sale.leadId} className="!p-4 sm:!p-5 border-l-4 border-l-amber-400 bg-amber-50/30">
                <div className="flex justify-between items-start mb-2">
                  <Badge variant="warning">NEEDS SCHEDULING</Badge>
                  <span className="text-base font-bold text-slate-900">
                    {sale.soldPrice ? formatCurrency(sale.soldPrice) : "—"}
                  </span>
                </div>
                <h3 className="font-bold text-sm sm:text-base text-slate-900 mb-0.5">
                  {sale.firstName} {sale.lastName}
                </h3>
                {sale.address && (
                  <p className="text-xs text-slate-500 mb-1">{sale.address}{sale.city ? `, ${sale.city}` : ""}</p>
                )}
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">
                  {sale.servicePackage?.replace(/_/g, " ") || "Service TBD"}
                  {sale.isBundle && (
                    <span className="ml-2 bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded text-xs font-bold normal-case">Bundle</span>
                  )}
                </p>
                <div className="text-xs text-slate-400 mb-3">
                  Sold {formatDate(sale.createdAt)}
                  {sale.canvasser && <> · {sale.canvasser}</>}
                </div>
                {sale.repNotes && (
                  <div className="flex gap-1.5 bg-amber-100/60 rounded-lg px-2.5 py-2 mb-3">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-800 leading-relaxed">{sale.repNotes}</p>
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() => setSchedulingLead(sale)}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  Schedule Job
                </Button>
              </Card>
            ))}
          </div>
          <div className="border-t border-slate-200 mt-6" />
        </div>
      )}

      {/* Regular jobs pipeline */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {jobs?.map((job) => (
          <Card key={job.id} className="flex flex-col !p-4 sm:!p-6 border-t-4 border-t-transparent hover:border-t-primary transition-all">
            <div className="flex justify-between items-start mb-3">
              <Badge variant={job.status === 'scheduled' ? 'default' : job.status === 'completed' ? 'success' : 'neutral'}>
                {(job.status as string).replace(/_/g, " ").toUpperCase()}
              </Badge>
              <span className="text-base sm:text-lg font-bold text-slate-900">{formatCurrency((job as any).soldPrice || (job as any).quotedPrice)}</span>
            </div>

            <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-1">Customer #{job.customerId}</h3>
            <p className="text-slate-500 text-xs sm:text-sm font-medium uppercase tracking-wider mb-3 sm:mb-4">
              {job.serviceType.replace(/_/g, ' ')}
            </p>

            <div className="mt-auto space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-slate-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Scheduled:</span>
                <span className="font-bold text-slate-700">{formatDate((job as any).scheduledAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Technician:</span>
                <span className="font-bold text-slate-700">{(job as any).technicianAssigned || 'Unassigned'}</span>
              </div>

              {job.status === 'scheduled' && (
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => handleComplete(job.id)}
                  isLoading={completeMutation.isPending}
                >
                  <Check className="w-4 h-4 mr-2 text-emerald-500" />
                  Mark Complete
                </Button>
              )}
            </div>
          </Card>
        ))}
        {jobs?.length === 0 && pendingSales.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400">
            <p className="font-medium">No jobs matching that filter.</p>
          </div>
        )}
        {jobs?.length === 0 && pendingSales.length > 0 && filter === "all" && (
          <div className="col-span-full py-8 text-center text-slate-400">
            <p className="text-sm">No scheduled or completed jobs yet. Schedule the sales above to populate the pipeline.</p>
          </div>
        )}
      </div>

      <CreateJobModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {schedulingLead && (
        <ScheduleModal
          sale={schedulingLead}
          onClose={() => setSchedulingLead(null)}
        />
      )}
    </div>
  );
}

function ScheduleModal({ sale, onClose }: { sale: PendingSale; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const scheduleMutation = useMutation({
    mutationFn: async (data: { scheduledAt: string; technicianAssigned: string }) => {
      const r = await fetch(`/api/jobs/from-lead/${sale.leadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to schedule job");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs/pending-sales"] });
      toast({
        title: "Job scheduled!",
        description: `${sale.firstName} ${sale.lastName} added to pipeline.`,
      });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    scheduleMutation.mutate({
      scheduledAt: fd.get("scheduledAt") as string,
      technicianAssigned: (fd.get("technicianAssigned") as string) || "",
    });
  };

  return (
    <Modal isOpen onClose={onClose} title="Schedule Job">
      <div className="mb-4 p-4 bg-slate-50 rounded-xl space-y-1">
        <p className="font-bold text-slate-900">{sale.firstName} {sale.lastName}</p>
        {sale.address && <p className="text-sm text-slate-600">{sale.address}{sale.city ? `, ${sale.city}` : ""}</p>}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            {sale.servicePackage?.replace(/_/g, " ") || "Service TBD"}
          </span>
          {sale.isBundle && (
            <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded text-xs font-bold">Bundle</span>
          )}
          {sale.soldPrice && (
            <span className="flex items-center gap-1 text-sm font-bold text-emerald-700 ml-auto">
              <DollarSign className="w-3.5 h-3.5" />
              {formatCurrency(sale.soldPrice)}
            </span>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Scheduled Date *</Label>
          <Input type="date" name="scheduledAt" required />
        </div>
        <div>
          <Label>Assign Technician</Label>
          <Select name="technicianAssigned">
            <option value="">Unassigned</option>
            {TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={scheduleMutation.isPending}>
            <Calendar className="w-4 h-4 mr-2" />
            Confirm Schedule
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateJobModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: customers } = useListCustomers();

  const createMutation = useCreateJob({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
        toast({ title: "Job created successfully" });
        onClose();
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      data: {
        customerId: parseInt(fd.get("customerId") as string),
        serviceType: fd.get("serviceType") as any,
        quotedPrice: fd.get("quotedPrice") as string,
        soldPrice: fd.get("soldPrice") as string,
        scheduledAt: fd.get("scheduledAt") ? new Date(fd.get("scheduledAt") as string).toISOString() : undefined,
        technicianAssigned: fd.get("technicianAssigned") as string,
        status: "scheduled",
        paymentStatus: "pending"
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Schedule New Job">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Customer</Label>
          <Select name="customerId" required>
            <option value="">Select a customer...</option>
            {customers?.map(c => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName}{c.address ? ` — ${c.address}` : ''}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label>Service Type</Label>
          <Select name="serviceType" required>
            <option value="house_wash">House Wash</option>
            <option value="driveway_cleaning">Driveway Cleaning</option>
            <option value="bundle">Bundle Package</option>
            <option value="other">Other</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Quoted Price ($)</Label>
            <Input type="number" step="0.01" name="quotedPrice" required inputMode="decimal" />
          </div>
          <div>
            <Label>Sold Price ($)</Label>
            <Input type="number" step="0.01" name="soldPrice" required inputMode="decimal" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Scheduled Date</Label>
            <Input type="date" name="scheduledAt" required />
          </div>
          <div>
            <Label>Technician</Label>
            <Select name="technicianAssigned">
              <option value="">Unassigned</option>
              {TECHNICIANS.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
        </div>

        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Create Job</Button>
        </div>
      </form>
    </Modal>
  );
}
