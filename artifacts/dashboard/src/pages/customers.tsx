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
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-slate-900">Customer Directory</h2>
          <p className="text-slate-500 mt-1 text-sm">{customers?.length ?? 0} customers</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1" /> Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {customers?.map((customer) => (
          <Card key={customer.id} className="flex flex-col !p-4 sm:!p-6">
            <div className="flex items-start gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0 text-sm font-bold">
                {customer.firstName?.[0]}{customer.lastName?.[0]}
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg text-slate-900 truncate">{customer.firstName} {customer.lastName}</h3>
                {customer.optOut && <span className="inline-block mt-1 text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-md">Opted Out</span>}
              </div>
            </div>

            <div className="space-y-2 text-sm text-slate-600">
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <a href={`tel:${customer.phone}`} className="hover:text-primary transition-colors">{customer.phone}</a>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2 min-w-0">
                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span className="text-xs sm:text-sm">
                    {customer.address}
                    {(customer.city || customer.state) && <><br />{[customer.city, customer.state, customer.zip].filter(Boolean).join(', ')}</>}
                  </span>
                </div>
              )}
            </div>
          </Card>
        ))}
        {customers?.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400">
            <User className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No customers yet.</p>
          </div>
        )}
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><Label>First Name *</Label><Input name="firstName" required placeholder="Jane" /></div>
          <div><Label>Last Name *</Label><Input name="lastName" required placeholder="Smith" /></div>
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
        <div className="pt-2 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={createMutation.isPending}>Save Customer</Button>
        </div>
      </form>
    </Modal>
  );
}
