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
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Search, Calculator, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SolarSystem } from "@shared/schema";

interface ControlPanelProps {
  onSubmit: (startSystem: SolarSystem, endSystem: SolarSystem, riskAversion: number) => void;
  isLoading: boolean;
  startSystem?: SolarSystem | null;
  endSystem?: SolarSystem | null;
  onStartSystemSelect?: (system: SolarSystem | null) => void;
  onEndSystemSelect?: (system: SolarSystem | null) => void;
}

export function ControlPanel({ 
  onSubmit, 
  isLoading, 
  startSystem: externalStartSystem, 
  endSystem: externalEndSystem,
  onStartSystemSelect,
  onEndSystemSelect
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
    if (onStartSystemSelect) {
      onStartSystemSelect(system);
    }
  };
  
  // Set local end system and notify parent if handler provided
  const setEndSystemSelected = (system: SolarSystem | null) => {
    setLocalEndSystem(system);
    if (onEndSystemSelect) {
      onEndSystemSelect(system);
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
    queryKey: ["/api/systems/search", startSystemSearch],
    enabled: startSystemSearch.length > 2 && startSystemOpen,
  });

  // Fetch system search results for end system
  const { data: endSystemResults, isFetching: isLoadingEndResults } = useQuery({
    queryKey: ["/api/systems/search", endSystemSearch],
    enabled: endSystemSearch.length > 2 && endSystemOpen,
  });

  // Fetch data status for "last updated" information
  const { data: dataStatus, refetch: refetchDataStatus } = useQuery({
    queryKey: ["/api/data-status"],
  });

  // Format the "last updated" timestamp
  const lastUpdated = dataStatus?.lastUpdate 
    ? formatDistanceToNow(new Date(dataStatus.lastUpdate), { addSuffix: true })
    : "Unknown";

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

    onSubmit(
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
    <div className="space-y-6">
      {/* System Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Route Planning</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  {isLoadingStartResults ? (
                    <div className="p-2">
                      <Skeleton className="h-8 w-full mb-2" />
                      <Skeleton className="h-8 w-full mb-2" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : startSystemResults?.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No systems found
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {startSystemResults?.map((system: SolarSystem) => (
                        <button
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
                  {isLoadingEndResults ? (
                    <div className="p-2">
                      <Skeleton className="h-8 w-full mb-2" />
                      <Skeleton className="h-8 w-full mb-2" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  ) : endSystemResults?.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      No systems found
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {endSystemResults?.map((system: SolarSystem) => (
                        <button
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
            disabled={isLoading || !startSystemSelected || !endSystemSelected}
          >
            <Calculator className="mr-2 h-4 w-4" />
            Calculator Route
          </Button>
        </CardContent>
      </Card>

      {/* Display Options */}
      <Card>
        <CardHeader>
          <CardTitle>Display Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Show Risk Heatmap</span>
            <Switch
              checked={showRiskHeatmap}
              onCheckedChange={setShowRiskHeatmap}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Show Gate Types</span>
            <Switch
              checked={showGateTypes}
              onCheckedChange={setShowGateTypes}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Animate Route</span>
            <Switch
              checked={animateRoute}
              onCheckedChange={setAnimateRoute}
            />
          </div>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Data Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Systems Data</span>
              <span className="text-primary">EVE Frontier API</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Risk Assessment</span>
              <span className="text-primary">Killmail Analysis</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Gate Access</span>
              <span className="text-primary">Smart Gate Data</span>
            </div>
            <div className="mt-4 text-xs text-muted-foreground italic flex justify-between items-center">
              <span>Data refreshed: {lastUpdated}</span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleRefreshData} 
                title="Refresh Data"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
