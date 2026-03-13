import { useState } from "react";
import { useListJobs, useCreateJob, useCompleteJob, useListCustomers } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Input, Select, Label } from "@/components/ui-components";
import { Plus, Check } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type FilterType = "all" | "scheduled" | "completed";

export default function JobsPage() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { data: jobs, isLoading, error } = useListJobs(
    filter !== "all" ? { status: filter as any } : undefined
  );

  const queryClient = useQueryClient();
  const { toast } = useToast();

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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {jobs?.map((job) => (
          <Card key={job.id} className="flex flex-col !p-4 sm:!p-6 border-t-4 border-t-transparent hover:border-t-primary transition-all">
            <div className="flex justify-between items-start mb-3">
              <Badge variant={job.status === 'scheduled' ? 'default' : job.status === 'completed' ? 'success' : 'neutral'}>
                {job.status.toUpperCase()}
              </Badge>
              <span className="text-base sm:text-lg font-bold text-slate-900">{formatCurrency(job.soldPrice || job.quotedPrice)}</span>
            </div>

            <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-1">Customer #{job.customerId}</h3>
            <p className="text-slate-500 text-xs sm:text-sm font-medium uppercase tracking-wider mb-3 sm:mb-4">
              {job.serviceType.replace(/_/g, ' ')}
            </p>

            <div className="mt-auto space-y-2 sm:space-y-3 pt-3 sm:pt-4 border-t border-slate-100">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Scheduled:</span>
                <span className="font-bold text-slate-700">{formatDate(job.scheduledAt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Technician:</span>
                <span className="font-bold text-slate-700">{job.technicianAssigned || 'Unassigned'}</span>
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
        {jobs?.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400">
            <p className="font-medium">No jobs matching that filter.</p>
          </div>
        )}
      </div>

      <CreateJobModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
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
            <Input type="text" name="technicianAssigned" placeholder="Name" />
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
