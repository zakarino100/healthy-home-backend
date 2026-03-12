import { useState } from "react";
import { useListCustomers, useCreateCustomer } from "@workspace/api-client-react";
import { PageLoader, ErrorState, Card, Button, Modal, Input, Label } from "@/components/ui-components";
import { Plus, User, Phone, MapPin, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function CustomersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: customers, isLoading, error } = useListCustomers();

  if (isLoading && !customers) return <PageLoader />;
  if (error) return <ErrorState error={error} />;

  return (
    <div className="space-y-8 animate-in-stagger delay-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-slate-900">Customer Directory</h2>
          <p className="text-slate-500 mt-1">Manage your client base</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)}>
          <Plus className="w-5 h-5 mr-1" /> Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {customers?.map((customer) => (
          <Card key={customer.id} className="flex flex-col">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                <User className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">{customer.firstName} {customer.lastName}</h3>
                {customer.optOut && <span className="inline-block mt-1 text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-md">Opted Out</span>}
              </div>
            </div>
            
            <div className="space-y-3 text-sm text-slate-600 mt-2">
              {customer.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-slate-400" /> {customer.phone}
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-slate-400" /> {customer.email}
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> 
                  <span>{customer.address}<br/>{customer.city}, {customer.state} {customer.zip}</span>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      <CreateCustomerModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}

function CreateCustomerModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const createMutation = useCreateCustomer({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        toast({ title: "Customer added successfully" });
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
        firstName: fd.get("firstName") as string,
        lastName: fd.get("lastName") as string,
        phone: fd.get("phone") as string,
        email: fd.get("email") as string,
        address: fd.get("address") as string,
        city: fd.get("city") as string,
        state: fd.get("state") as string,
        zip: fd.get("zip") as string,
        optOut: false,
        reviewCampaignEligible: true,
      }
    });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Customer">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div><Label>First Name</Label><Input name="firstName" required /></div>
          <div><Label>Last Name</Label><Input name="lastName" required /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Phone</Label><Input type="tel" name="phone" /></div>
          <div><Label>Email</Label><Input type="email" name="email" /></div>
        </div>
        <div><Label>Address</Label><Input name="address" /></div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1"><Label>City</Label><Input name="city" /></div>
          <div className="col-span-1"><Label>State</Label><Input name="state" placeholder="TX" /></div>
          <div className="col-span-1"><Label>ZIP</Label><Input name="zip" /></div>
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Save Customer</Button>
        </div>
      </form>
    </Modal>
  );
}
