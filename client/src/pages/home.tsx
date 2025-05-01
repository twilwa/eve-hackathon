import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/app-header";
import { ControlPanel } from "@/components/control-panel";
import { StarMap } from "@/components/star-map";
import { RouteDetails } from "@/components/route-details";
import { ScoutJobModal } from "@/components/scout-job-modal";
import { WebSocketStatus } from "@/components/websocket-status";
import { RealTimeUpdates } from "@/components/real-time-updates";
import { 
  fetchSolarSystems,
  fetchSystemConnections,
  fetchRiskData,
  calculateRoute
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useWebSocketUpdates } from "@/hooks/use-websocket-updates";
import type { SolarSystem, SystemConnection, RiskData, RouteResponse } from "@shared/schema";

export default function Home() {
  const [selectedRoute, setSelectedRoute] = useState<RouteResponse | null>(null);
  const [startSystem, setStartSystem] = useState<SolarSystem | null>(null);
  const [endSystem, setEndSystem] = useState<SolarSystem | null>(null);
  const [isScoutJobModalOpen, setIsScoutJobModalOpen] = useState(false);
  const { toast } = useToast();
  
  const queryClient = useQueryClient();
  
  // Initialize WebSocket for real-time updates
  const { isConnected, recentJobUpdates, recentRiskUpdates } = useWebSocketUpdates();
  
  // Fetch solar systems
  const { data: systems = [], isLoading: isLoadingSystems, error: systemsError } = useQuery({
    queryKey: ["/api/systems"],
    queryFn: fetchSolarSystems
  });
  
  // Fetch system connections
  const { data: connections = [], isLoading: isLoadingConnections, error: connectionsError } = useQuery({
    queryKey: ["/api/connections"],
    queryFn: fetchSystemConnections
  });
  
  // Fetch risk data
  const { data: riskData = [], isLoading: isLoadingRiskData, error: riskDataError } = useQuery({
    queryKey: ["/api/risk"],
    queryFn: fetchRiskData,
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
  
  // Function to refresh data from the server
  const handleRefreshData = async () => {
    try {
      // Manually invalidate all relevant queries to refetch data
      queryClient.invalidateQueries({ queryKey: ["/api/systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/connections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/risk"] });
      
      // Trigger a toast notification
      toast({
        title: "Refreshing Data",
        description: "Fetching latest system and risk data from the server..."
      });
    } catch (error) {
      console.error("Error refreshing data:", error);
      toast({
        title: "Error",
        description: "Failed to refresh data from the server",
        variant: "destructive"
      });
    }
  };
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader />
      
      <main className="container mx-auto py-6 px-4 flex-grow">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column - Controls */}
          <div className="lg:col-span-1 space-y-6">
            <ControlPanel
              systems={systems}
              startSystem={startSystem}
              endSystem={endSystem}
              onStartSystemChange={setStartSystem}
              onEndSystemChange={setEndSystem}
              onCalculateRoute={handleCalculateRoute}
              onCreateScoutJob={() => setIsScoutJobModalOpen(true)}
              isCalculatingRoute={isCalculatingRoute}
              onRefreshData={handleRefreshData}
            />
            
            {/* Scout Job Button */}
            <div className="mt-4">
              <ScoutJobModal />
            </div>
          </div>
          
          {/* Right Column - Map and Route Details */}
          <div className="lg:col-span-3 space-y-6">
            {/* Loading and Error States */}
            {isDataLoading && (
              <div className="p-8 text-center bg-background border rounded-lg shadow-sm">
                <div className="animate-pulse inline-block h-8 w-8 rounded-full border-4 border-t-primary border-r-transparent border-b-transparent border-l-transparent" />
                <p className="mt-4 text-lg font-medium">Loading EVE Frontier World API data...</p>
                <p className="text-sm text-muted-foreground">This may take a moment as we fetch the latest system information and risk data.</p>
              </div>
            )}
            
            {dataError && (
              <div className="p-8 text-center bg-destructive/10 text-destructive border border-destructive rounded-lg">
                <p className="text-lg font-medium">Error loading data from EVE Frontier World API</p>
                <p className="mt-2">{String(dataError)}</p>
                <button 
                  type="button"
                  onClick={handleRefreshData}
                  className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Try Again
                </button>
              </div>
            )}
            
            {/* Star Map */}
            {!isDataLoading && !dataError && (
              <StarMap
                systems={systems}
                connections={connections}
                riskData={riskData}
                selectedRoute={selectedRoute}
                isLoading={isCalculatingRoute}
                startSystem={startSystem}
                endSystem={endSystem}
                onSystemSelect={handleSystemSelect}
              />
            )}
            
            {/* Route Details */}
            {!isDataLoading && !dataError && (
              <RouteDetails 
                route={selectedRoute} 
                onAlternativeRouteSelect={(alternativeRoute) => {
                  // When an alternative route is selected, update the displayed route
                  setSelectedRoute(alternativeRoute);
                  toast({
                    title: "Alternative Route Selected",
                    description: `Showing the alternative route with ${alternativeRoute.totalJumps} jumps and ${alternativeRoute.averageRisk.toFixed(2)} risk.`
                  });
                }}
              />
            )}
          </div>
        </div>
      </main>
      
      <footer className="mt-6 py-4 px-6 bg-slate-900 border-t border-slate-800">
        <div className="container mx-auto flex flex-col md:flex-row justify-between items-center text-muted-foreground text-sm">
          <div>Advanced Risk-Aware Route Planner for EVE Frontier</div>
          <div className="flex items-center gap-4">
            <RealTimeUpdates />
            <span>Using EVE Frontier World API</span>
            <WebSocketStatus />
          </div>
        </div>
      </footer>
    </div>
  );
}
