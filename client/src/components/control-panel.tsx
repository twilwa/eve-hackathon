import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  searchSolarSystems, 
  getDataStatus, 
  refreshData 
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Calculator, RotateCcw, BriefcaseBusiness } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SolarSystem } from "@shared/schema";

interface ControlPanelProps {
  systems: SolarSystem[];
  startSystem?: SolarSystem | null;
  endSystem?: SolarSystem | null;
  onStartSystemChange?: (system: SolarSystem | null) => void;
  onEndSystemChange?: (system: SolarSystem | null) => void;
  onCalculateRoute: (startSystem: SolarSystem, endSystem: SolarSystem, riskAversion: number) => void;
  onCreateScoutJob?: () => void;
  isCalculatingRoute?: boolean;
  onRefreshData?: () => void;
}

export function ControlPanel({ 
  systems,
  startSystem: externalStartSystem, 
  endSystem: externalEndSystem,
  onStartSystemChange,
  onEndSystemChange,
  onCalculateRoute,
  onCreateScoutJob,
  isCalculatingRoute = false,
  onRefreshData
}: ControlPanelProps) {
  const [startSystemSearch, setStartSystemSearch] = useState("");
  const [endSystemSearch, setEndSystemSearch] = useState("");
  const [localStartSystem, setLocalStartSystem] = useState<SolarSystem | null>(null);
  const [localEndSystem, setLocalEndSystem] = useState<SolarSystem | null>(null);
  
  // Determine which start system to use (external or local)
  const startSystemSelected = externalStartSystem !== undefined ? externalStartSystem : localStartSystem;
  const endSystemSelected = externalEndSystem !== undefined ? externalEndSystem : localEndSystem;
  
  // Set local start system and notify parent if handler provided
  const setStartSystemSelected = (system: SolarSystem | null) => {
    setLocalStartSystem(system);
    if (onStartSystemChange) {
      onStartSystemChange(system);
    }
  };
  
  // Set local end system and notify parent if handler provided
  const setEndSystemSelected = (system: SolarSystem | null) => {
    setLocalEndSystem(system);
    if (onEndSystemChange) {
      onEndSystemChange(system);
    }
  };
  const [riskAversion, setRiskAversion] = useState(50);
  const [showRiskHeatmap, setShowRiskHeatmap] = useState(true);
  const [showGateTypes, setShowGateTypes] = useState(true);
  const [animateRoute, setAnimateRoute] = useState(true);
  const [startSystemOpen, setStartSystemOpen] = useState(false);
  const [endSystemOpen, setEndSystemOpen] = useState(false);
  
  const { toast } = useToast();

  // Fetch system search results for start system
  const { data: startSystemResults, isFetching: isLoadingStartResults } = useQuery({
    queryKey: ["/api/systems/search", { query: startSystemSearch }],
    enabled: startSystemSearch.length > 2 && startSystemOpen,
    queryFn: () => searchSolarSystems(startSystemSearch)
  });

  // Fetch system search results for end system
  const { data: endSystemResults, isFetching: isLoadingEndResults } = useQuery({
    queryKey: ["/api/systems/search", { query: endSystemSearch }],
    enabled: endSystemSearch.length > 2 && endSystemOpen,
    queryFn: () => searchSolarSystems(endSystemSearch)
  });

  // Fetch data status for "last updated" information
  const { data: dataStatus, refetch: refetchDataStatus } = useQuery({
    queryKey: ["/api/data-status"],
  });

  // Format the "last updated" timestamp
  const lastUpdated = dataStatus?.lastUpdate 
    ? formatDistanceToNow(new Date(dataStatus.lastUpdate), { addSuffix: true })
    : "Unknown";

  // Properly type the search results with defaults
  const typedStartResults = startSystemResults as SolarSystem[] || [];
  const typedEndResults = endSystemResults as SolarSystem[] || [];

  // Handle route calculation
  const handleCalculateRoute = () => {
    if (!startSystemSelected) {
      toast({
        variant: "destructive",
        title: "Missing Start System",
        description: "Please select a starting system",
      });
      return;
    }

    if (!endSystemSelected) {
      toast({
        variant: "destructive",
        title: "Missing Destination System",
        description: "Please select a destination system",
      });
      return;
    }

    onCalculateRoute(
      startSystemSelected,
      endSystemSelected,
      riskAversion / 100 // Convert to 0-1 range
    );
  };

  // Handle refresh data
  const handleRefreshData = async () => {
    try {
      await refreshData();
      refetchDataStatus();
      toast({
        title: "Data Refreshed",
        description: "The latest risk data has been loaded",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Refresh Failed",
        description: "Could not refresh data. Please try again later.",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle>Route Planning</CardTitle>
        <div className="flex space-x-1">
          {onRefreshData && (
            <Button 
              size="sm" 
              variant="outline" 
              onClick={onRefreshData}
              title="Refresh map data"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          )}
          {onCreateScoutJob && (
            <Button 
              size="sm" 
              variant="secondary" 
              onClick={onCreateScoutJob}
              title="Create a new scouting job"
            >
              <BriefcaseBusiness className="h-4 w-4 mr-1" />
              Scout Jobs
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4 pt-2">
        {/* Start System */}
        <div>
          <Label htmlFor="start-system" className="text-muted-foreground mb-2 block">
            Start System
          </Label>
          <Popover open={startSystemOpen} onOpenChange={setStartSystemOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="start-system"
                  placeholder={startSystemSelected ? startSystemSelected.name : "Search start system..."}
                  value={startSystemSearch}
                  onChange={(e) => setStartSystemSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[300px]" align="start">
              <div className="max-h-56 overflow-auto">
                {/* Search Results for Start System */}
                {isLoadingStartResults ? (
                  <div className="p-4">
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : typedStartResults.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No systems found
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {typedStartResults.map((system: SolarSystem) => (
                      <button
                        type="button"
                        key={system.id}
                        className="w-full text-left px-4 py-2 hover:bg-muted transition-colors"
                        onClick={() => {
                          setStartSystemSelected(system);
                          setStartSystemSearch("");
                          setStartSystemOpen(false);
                        }}
                      >
                        {system.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* End System */}
        <div>
          <Label htmlFor="end-system" className="text-muted-foreground mb-2 block">
            Destination System
          </Label>
          <Popover open={endSystemOpen} onOpenChange={setEndSystemOpen}>
            <PopoverTrigger asChild>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="end-system"
                  placeholder={endSystemSelected ? endSystemSelected.name : "Search destination..."}
                  value={endSystemSearch}
                  onChange={(e) => setEndSystemSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-[300px]" align="start">
              <div className="max-h-56 overflow-auto">
                {/* Search Results for End System */}
                {isLoadingEndResults ? (
                  <div className="p-4">
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : typedEndResults.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No systems found
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {typedEndResults.map((system: SolarSystem) => (
                      <button
                        type="button"
                        key={system.id}
                        className="w-full text-left px-4 py-2 hover:bg-muted transition-colors"
                        onClick={() => {
                          setEndSystemSelected(system);
                          setEndSystemSearch("");
                          setEndSystemOpen(false);
                        }}
                      >
                        {system.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* Risk Aversion Slider */}
        <div className="pt-2">
          <div className="flex justify-between items-center mb-2">
            <Label htmlFor="risk-aversion" className="text-muted-foreground">
              Risk Aversion
            </Label>
            <span className="text-primary font-medium">{riskAversion}%</span>
          </div>
          <Slider
            id="risk-aversion"
            min={0}
            max={100}
            step={1}
            value={[riskAversion]}
            onValueChange={(value) => setRiskAversion(value[0])}
            className="risk-slider"
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>Speed Priority</span>
            <span>Safety Priority</span>
          </div>
        </div>

        {/* Calculator Button */}
        <Button
          onClick={handleCalculateRoute}
          className="w-full mt-2"
          disabled={isCalculatingRoute || !startSystemSelected || !endSystemSelected}
        >
          <Calculator className="mr-2 h-4 w-4" />
          Calculator Route
        </Button>
      </CardContent>
    </Card>
  );
}
