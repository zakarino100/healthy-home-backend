import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";

// Pages
import DashboardToday from "@/pages/dashboard-today";
import DashboardWeekly from "@/pages/dashboard-weekly";
import JobsPage from "@/pages/jobs";
import CanvassingPage from "@/pages/canvassing";
import CustomersPage from "@/pages/customers";
import ReviewsPage from "@/pages/reviews";
import ReportsPage from "@/pages/reports";
import UsersPage from "@/pages/users";
import LeadsPage from "@/pages/leads";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardToday} />
        <Route path="/weekly" component={DashboardWeekly} />
        <Route path="/jobs" component={JobsPage} />
        <Route path="/canvassing" component={CanvassingPage} />
        <Route path="/leads" component={LeadsPage} />
        <Route path="/customers" component={CustomersPage} />
        <Route path="/reviews" component={ReviewsPage} />
        <Route path="/reports" component={ReportsPage} />
        <Route path="/users" component={UsersPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
