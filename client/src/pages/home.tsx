import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { ControlPanel } from "@/components/control-panel";
import { StarMap } from "@/components/star-map";
import { RouteDetails } from "@/components/route-details";
import { 
  fetchSolarSystems,
  fetchSystemConnections,
  fetchRiskData,
  calculateRoute
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import type { SolarSystem, RouteResponse } from "@shared/schema";

export default function Home() {
  const [selectedRoute, setSelectedRoute] = useState<RouteResponse | null>(null);
  const [startSystem, setStartSystem] = useState<SolarSystem | null>(null);
  const [endSystem, setEndSystem] = useState<SolarSystem | null>(null);
  const { toast } = useToast();
  
  // Fetch solar systems
  const { data: systems, isLoading: isLoadingSystems, error: systemsError } = useQuery({
    queryKey: ["/api/systems"],
  });
  
  // Fetch system connections
  const { data: connections, isLoading: isLoadingConnections, error: connectionsError } = useQuery({
    queryKey: ["/api/connections"],
  });
  
  // Fetch risk data
  const { data: riskData, isLoading: isLoadingRiskData, error: riskDataError } = useQuery({
    queryKey: ["/api/risk"],
  });
  
  // Route calculation mutation
  const { mutate: calculateRouteMutation, isPending: isCalculatingRoute } = useMutation({
    mutationFn: (params: { 
      startSystemId: number, 
      endSystemId: number, 
      riskAversion: number 
    }) => calculateRoute({
      startSystemId: params.startSystemId,
      endSystemId: params.endSystemId,
      riskAversion: params.riskAversion
    }),
    onSuccess: (data) => {
      setSelectedRoute(data);
      toast({
        title: "Route Calculated",
        description: `Found a route with ${data.totalJumps} jumps and average risk ${data.averageRisk.toFixed(2)}`
      });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Route Calculation Failed",
        description: String(error)
      });
    }
  });
  
  // Handle route calculation request
  const handleCalculateRoute = (
    startSystem: SolarSystem, 
    endSystem: SolarSystem, 
    riskAversion: number
  ) => {
    calculateRouteMutation({
      startSystemId: startSystem.id,
      endSystemId: endSystem.id,
      riskAversion
    });
  };
  
  // Check for data loading errors
  const dataError = systemsError || connectionsError || riskDataError;
  
  // Loading state
  const isDataLoading = isLoadingSystems || isLoadingConnections || isLoadingRiskData;
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      
      <main className="container mx-auto py-6 px-4 flex-grow">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Controls */}
          <div className="lg:col-span-1">
            <ControlPanel 
              onSubmit={handleCalculateRoute}
              isLoading={isCalculatingRoute}
            />
          </div>
          
          {/* Right Column - Map and Route Details */}
          <div className="lg:col-span-3 space-y-6">
            {/* Star Map */}
            <StarMap
              systems={systems || []}
              connections={connections || []}
              riskData={riskData || []}
              selectedRoute={selectedRoute}
              isLoading={isCalculatingRoute}
            />
            
            {/* Route Details */}
            <RouteDetails route={selectedRoute} />
          </div>
        </div>
      </main>
      
      <footer className="mt-6 py-4 px-6 bg-slate-900 border-t border-slate-800">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center text-muted-foreground text-sm">
          <div>Advanced Risk-Aware Route Planner for EVE Frontier</div>
          <div>Using EVE Frontier World API</div>
        </div>
      </footer>
    </div>
  );
}
