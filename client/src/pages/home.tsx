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
            />
          </div>
          
          {/* Right Column - Map and Route Details */}
          <div className="lg:col-span-3 space-y-6">
            {/* Star Map */}
            <StarMap
              systems={Array.isArray(systems) ? systems : []}
              connections={Array.isArray(connections) ? connections : []}
              riskData={Array.isArray(riskData) ? riskData : []}
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
                // When an alternative route is selected, update the displayed route
                setSelectedRoute(alternativeRoute);
                
                // Check if the route has full route data
                if (alternativeRoute.jumps && alternativeRoute.jumps.length > 0) {
                  // Find first and last jump to determine start and end systems
                  const firstJump = alternativeRoute.jumps[0];
                  const lastJump = alternativeRoute.jumps[alternativeRoute.jumps.length - 1];
                  
                  // Find the corresponding start and end systems
                  const systemsArray = Array.isArray(systems) ? systems : [];
                  const newStartSystem = systemsArray.find((s: SolarSystem) => s.id === firstJump.fromSystemId);
                  const newEndSystem = systemsArray.find((s: SolarSystem) => s.id === lastJump.toSystemId);
                  
                  if (newStartSystem && newEndSystem) {
                    // Update the start and end systems to match the new route
                    setStartSystem(newStartSystem);
                    setEndSystem(newEndSystem);
                    
                    // Don't recalculate the route immediately - just set the state
                    // This will avoid flicker and let us display the alternative route
                    
                    // Only recalculate if the route doesn't have alternatives of its own
                    if (!alternativeRoute.alternatives || alternativeRoute.alternatives.length === 0) {
                      console.log("No alternatives in selected route, calculating new ones");
                      // Use a different risk aversion based on which alternative type was selected
                      const riskValue = alternativeRoute.averageRisk < 0.4 ? 0.8 : 0.2;
                      
                      calculateRouteMutation({
                        startSystemId: newStartSystem.id,
                        endSystemId: newEndSystem.id,
                        riskAversion: riskValue
                      });
                    }
                  }
                }
                
                toast({
                  title: "Alternative Route Selected",
                  description: `Showing the alternative route with ${alternativeRoute.totalJumps} jumps and ${alternativeRoute.averageRisk.toFixed(2)} risk.`
                });
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
