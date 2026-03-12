import { useState } from "react";
import { useListJobs, useCreateJob, useCompleteJob, useListCustomers } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Input, Select, Label } from "@/components/ui-components";
import { Plus, Check, Filter } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function JobsPage() {
  const [filter, setFilter] = useState<"all" | "scheduled" | "completed">("all");
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
    if(confirm("Mark this job as completed? This will trigger the satisfaction workflow.")) {
      completeMutation.mutate({ id });
    }
  };

  if (isLoading && !jobs) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-8 animate-in-stagger delay-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900">Jobs Pipeline</h2>
          <p className="text-slate-500 mt-1">Manage scheduled service appointments</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-white border border-slate-200 p-1 rounded-xl flex shadow-sm">
            <button 
              onClick={() => setFilter("all")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${filter === "all" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              All
            </button>
            <button 
              onClick={() => setFilter("scheduled")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${filter === "scheduled" ? "bg-primary/10 text-primary" : "text-slate-500 hover:text-slate-700"}`}
            >
              Scheduled
            </button>
            <button 
              onClick={() => setFilter("completed")}
              className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${filter === "completed" ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
            >
              Completed
            </button>
          </div>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus className="w-5 h-5 mr-1" /> New Job
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {jobs?.map((job) => (
          <Card key={job.id} className="flex flex-col border-t-4 border-t-transparent hover:border-t-primary transition-all">
            <div className="flex justify-between items-start mb-4">
              <Badge variant={job.status === 'scheduled' ? 'default' : job.status === 'completed' ? 'success' : 'neutral'}>
                {job.status.toUpperCase()}
              </Badge>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(job.soldPrice || job.quotedPrice)}</span>
            </div>
            
            <h3 className="font-bold text-lg text-slate-900 mb-1 flex items-center gap-2">
              Customer #{job.customerId}
            </h3>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-wider mb-4">
              {job.serviceType.replace('_', ' ')}
            </p>
            
            <div className="mt-auto space-y-3 pt-4 border-t border-slate-100">
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
                  className="w-full mt-4" 
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
          <div className="col-span-full py-12 text-center text-slate-500">
            No jobs found matching criteria.
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
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <Label>Customer</Label>
          <Select name="customerId" required>
            <option value="">Select a customer...</option>
            {customers?.map(c => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName} - {c.address}</option>
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Quoted Price ($)</Label>
            <Input type="number" step="0.01" name="quotedPrice" required />
          </div>
          <div>
            <Label>Sold Price ($)</Label>
            <Input type="number" step="0.01" name="soldPrice" required />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Scheduled Date</Label>
            <Input type="date" name="scheduledAt" required />
          </div>
          <div>
            <Label>Technician</Label>
            <Input type="text" name="technicianAssigned" placeholder="Name" />
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Create Job</Button>
        </div>
      </form>
    </Modal>
  );
}
