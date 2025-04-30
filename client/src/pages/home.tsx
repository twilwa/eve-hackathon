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
  const [riskAversion, setRiskAversion] = useState<number>(50); // Default to 50% balanced risk aversion
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
  
  // Handle system selection from star map
  const handleSystemSelect = (system: SolarSystem) => {
    // If the system is already selected as start, deselect it
    if (startSystem && startSystem.id === system.id) {
      setStartSystem(null);
      return;
    }
    
    // If the system is already selected as end, deselect it
    if (endSystem && endSystem.id === system.id) {
      setEndSystem(null);
      return;
    }
    
    // If no start system is selected, set it as start
    if (!startSystem) {
      setStartSystem(system);
      return;
    }
    
    // If start is selected but no end, set it as end
    if (startSystem && !endSystem) {
      setEndSystem(system);
      return;
    }
    
    // If both are already selected, replace start and clear end
    setStartSystem(system);
    setEndSystem(null);
  };
  
  // Handle route calculation request
  const handleCalculateRoute = (
    startSys: SolarSystem, 
    endSys: SolarSystem, 
    riskAversion: number
  ) => {
    calculateRouteMutation({
      startSystemId: startSys.id,
      endSystemId: endSys.id,
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
              startSystem={startSystem}
              endSystem={endSystem}
              onStartSystemSelect={setStartSystem}
              onEndSystemSelect={setEndSystem}
              riskAversion={riskAversion} 
              onRiskAversionChange={setRiskAversion}
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
              startSystem={startSystem}
              endSystem={endSystem}
              onSystemSelect={handleSystemSelect}
            />
            
            {/* Route Details */}
            <RouteDetails 
              route={selectedRoute} 
              onAlternativeRouteSelect={(alternativeRoute) => {
                // When an alternative route is selected, we need to:
                // 1. Update the displayed route
                // 2. Recalculate new alternative routes from this route
                
                // First, store the selected alternative as our current route 
                setSelectedRoute(alternativeRoute);
                
                // Now, generate new alternatives by calling the API with the same parameters
                // but with a different risk aversion based on which alternative was selected
                if (startSystem && endSystem) {
                  const isSelectingSaferRoute = alternativeRoute.averageRisk < (selectedRoute?.averageRisk || 0.5);
                  const newRiskAversion = isSelectingSaferRoute ? 
                    Math.min(100, riskAversion + 20) : // Increase risk aversion (safer)
                    Math.max(0, riskAversion - 20);    // Decrease risk aversion (faster)
                  
                  // Update the risk aversion slider value
                  setRiskAversion(newRiskAversion);
                  
                  // Recalculate the route with new parameters
                  // Note: handleCalculateRoute expects riskAversion in 0-100 range (0-100%)
                  // The API expects 0-1 range (conversion happens in the handler)
                  handleCalculateRoute(startSystem, endSystem, newRiskAversion);
                  
                  toast({
                    title: isSelectingSaferRoute ? "Safer Route Selected" : "Faster Route Selected",
                    description: `Risk aversion adjusted to ${newRiskAversion}%. Looking for even ${isSelectingSaferRoute ? 'safer' : 'faster'} alternatives.`
                  });
                }
              }}
            />
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
