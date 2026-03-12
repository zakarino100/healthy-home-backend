import { useState } from "react";
import { useListCanvassingSessions, useCreateCanvassingSession } from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PageLoader, ErrorState, Card, Button, Badge, Modal, Input, Label } from "@/components/ui-components";
import { Plus, MapPin, Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function CanvassingPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { data: sessions, isLoading, error } = useListCanvassingSessions();

  if (isLoading && !sessions) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-8 animate-in-stagger delay-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900">Canvassing Sessions</h2>
          <p className="text-slate-500 mt-1">Track daily door-knocking performance</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-5 h-5 mr-1" /> Log Session
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {sessions?.map((session) => (
          <Card key={session.id} className="relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
              <MapPin className="w-32 h-32" />
            </div>
            
            <div className="flex justify-between items-start mb-6 relative z-10">
              <div>
                <h3 className="font-bold text-xl text-slate-900">{session.canvasser}</h3>
                <p className="text-slate-500">{formatDate(session.sessionDate)} {session.neighborhood ? `• ${session.neighborhood}` : ''}</p>
              </div>
              <Badge variant="success" className="text-sm px-3 py-1">
                {formatCurrency(session.revenueSold)} Sold
              </Badge>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6 relative z-10">
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Doors</p>
                <p className="text-xl font-display font-bold text-slate-900 mt-1">{session.doorsKnocked}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Convos</p>
                <p className="text-xl font-display font-bold text-slate-900 mt-1">{session.goodConversations}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase">Quotes</p>
                <p className="text-xl font-display font-bold text-slate-900 mt-1">{session.quotesGiven}</p>
              </div>
              <div className="bg-primary/5 rounded-xl p-3 text-center border border-primary/20">
                <p className="text-xs font-bold text-primary uppercase">Closes</p>
                <p className="text-xl font-display font-bold text-primary mt-1">{session.closes}</p>
              </div>
            </div>

            <div className="flex gap-4 text-sm text-slate-600 border-t border-slate-100 pt-4 relative z-10">
              <span className="flex items-center gap-1"><Users className="w-4 h-4"/> {session.peopleReached} Reached</span>
              <span>•</span>
              <span>{session.bundleCount} Bundles</span>
            </div>
          </Card>
        ))}
        {sessions?.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500">
            No canvassing sessions logged yet.
          </div>
        )}
      </div>

      <CreateSessionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

function CreateSessionModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMutation = useCreateCanvassingSession({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/canvassing/sessions"] });
        toast({ title: "Session logged successfully" });
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
        canvasser: fd.get("canvasser") as string,
        sessionDate: fd.get("sessionDate") as string,
        neighborhood: fd.get("neighborhood") as string,
        doorsKnocked: parseInt(fd.get("doorsKnocked") as string) || 0,
        peopleReached: parseInt(fd.get("peopleReached") as string) || 0,
        goodConversations: parseInt(fd.get("goodConversations") as string) || 0,
        quotesGiven: parseInt(fd.get("quotesGiven") as string) || 0,
        closes: parseInt(fd.get("closes") as string) || 0,
        revenueSold: fd.get("revenueSold") as string || "0",
        bundleCount: parseInt(fd.get("bundleCount") as string) || 0,
        driveawayAddOnCount: parseInt(fd.get("driveawayAddOnCount") as string) || 0,
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Log Canvassing Session">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Canvasser Name</Label>
            <Input name="canvasser" required />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" name="sessionDate" required defaultValue={new Date().toISOString().split('T')[0]} />
          </div>
        </div>

        <div>
          <Label>Neighborhood / Route</Label>
          <Input name="neighborhood" placeholder="e.g. Oakridge Estates" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><Label>Doors</Label><Input type="number" name="doorsKnocked" required min="0" defaultValue="0" /></div>
          <div><Label>Reached</Label><Input type="number" name="peopleReached" required min="0" defaultValue="0" /></div>
          <div><Label>Convos</Label><Input type="number" name="goodConversations" required min="0" defaultValue="0" /></div>
          <div><Label>Quotes</Label><Input type="number" name="quotesGiven" required min="0" defaultValue="0" /></div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
          <div><Label>Closes</Label><Input type="number" name="closes" required min="0" defaultValue="0" /></div>
          <div><Label>Revenue Sold ($)</Label><Input type="number" step="0.01" name="revenueSold" required defaultValue="0.00" /></div>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Bundles Sold</Label><Input type="number" name="bundleCount" min="0" defaultValue="0" /></div>
          <div><Label>Driveway Add-ons</Label><Input type="number" name="driveawayAddOnCount" min="0" defaultValue="0" /></div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Save Session</Button>
        </div>
      </form>
    </Modal>
  );
}
