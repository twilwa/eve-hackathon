import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bookmark, Share2, Download, AlertTriangle } from "lucide-react";
import { getRiskCategory } from "@/lib/pathfinding";
import { useToast } from "@/hooks/use-toast";
import { downloadRouteAsJson } from "@/lib/export";
import type { RouteResponse } from "@shared/schema";

interface RouteDetailsProps {
  route: RouteResponse | null;
  onAlternativeRouteSelect?: (route: RouteResponse) => void;
}

export function RouteDetails({ route, onAlternativeRouteSelect }: RouteDetailsProps) {
  const { toast } = useToast();
  
  // No route to display
  if (!route || route.jumps.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Route Details</CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          <p>Select start and destination systems and calculate a route to see details.</p>
        </CardContent>
      </Card>
    );
  }
  
  // Handle route actions
  const handleSaveRoute = () => {
    toast({
      title: "Route Saved",
      description: "This route has been saved to your favorites"
    });
  };
  
  const handleShareRoute = () => {
    // Create share URL or data
    const shareData = {
      title: "EVE Frontier Route",
      text: `Check out this route from ${route.jumps[0].fromSystemName} to ${route.jumps[route.jumps.length - 1].toSystemName}`,
      url: window.location.href
    };
    
    if (navigator.share) {
      navigator.share(shareData).catch(() => {
        // Fallback if sharing fails
        toast({
          title: "Share Link Copied",
          description: "Route share link copied to clipboard"
        });
      });
    } else {
      // Fallback for browsers that don't support sharing
      navigator.clipboard.writeText(window.location.href);
      toast({
        title: "Share Link Copied",
        description: "Route share link copied to clipboard"
      });
    }
  };
  
  const handleExportRoute = () => {
    // Use the downloadRouteAsJson utility function
    downloadRouteAsJson(route);
    
    toast({
      title: "Route Exported",
      description: "Route data has been downloaded as JSON"
    });
  };
  
  // Get risk category for styling
  const getRouteRiskClass = (risk: number) => {
    const category = getRiskCategory(risk);
    return `text-risk-${category}`;
  };
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Route Details</CardTitle>
        <div className="flex gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSaveRoute}
            title="Save Route"
          >
            <Bookmark className="h-4 w-4 text-primary" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleShareRoute}
            title="Share Route"
          >
            <Share2 className="h-4 w-4 text-primary" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleExportRoute}
            title="Export Route"
          >
            <Download className="h-4 w-4 text-primary" />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Route Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-muted bg-opacity-50 rounded-lg p-4 flex flex-col items-center justify-center">
            <div className="text-muted-foreground text-sm mb-1">Total Distance</div>
            <div className="text-2xl font-display font-medium">{route.totalDistance} LY</div>
          </div>
          <div className="bg-muted bg-opacity-50 rounded-lg p-4 flex flex-col items-center justify-center">
            <div className="text-muted-foreground text-sm mb-1">Total Jumps</div>
            <div className="text-2xl font-display font-medium">{route.totalJumps}</div>
          </div>
          <div className="bg-muted bg-opacity-50 rounded-lg p-4 flex flex-col items-center justify-center">
            <div className="text-muted-foreground text-sm mb-1">Average Risk</div>
            <div className={`text-2xl font-display font-medium ${getRouteRiskClass(route.averageRisk)}`}>
              {route.averageRisk.toFixed(2)}
            </div>
          </div>
        </div>
        
        {/* Route optimization visualization */}
        <div className="mb-6 bg-muted bg-opacity-30 rounded-lg p-4">
          <h3 className="font-medium mb-2">Route Optimization</h3>
          
          <div className="mb-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-1">
              <span>Speed Priority</span>
              <span>Safety Priority</span>
            </div>
            <div className="h-2 bg-muted rounded-full mt-1 overflow-hidden relative">
              <div 
                className="absolute top-0 left-0 h-full w-full bg-gradient-to-r from-red-500 via-amber-500 to-green-500 rounded-full"
              ></div>
              <div 
                className="absolute top-0 h-full w-1 bg-white border-2 border-primary rounded-full"
                style={{ 
                  left: `${100 - (route.averageRisk * 100)}%`,
                  transform: 'translateX(-50%)'
                }}
              ></div>
            </div>
          </div>
          
          <div className="text-sm text-muted-foreground">
            This route is {route.averageRisk < 0.3 ? 'optimized for safety' : 
                           route.averageRisk > 0.7 ? 'optimized for speed' : 
                           'balanced between safety and speed'}.
            {route.averageRisk > 0.5 && ' Consider increasing your risk aversion for a safer journey.'}
          </div>
        </div>
        
        {/* Warning for high risk sections */}
        {route.highRiskSections && route.highRiskSections.length > 0 && (
          <Alert className="mb-6 border-amber-600 bg-amber-950 bg-opacity-30">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-400">High Risk Section Detected</AlertTitle>
            <AlertDescription className="text-muted-foreground text-sm">
              Your route passes through high-risk areas near{' '}
              {route.highRiskSections.map(section => section.systemName).join(', ')}.
              Recent kill data indicates significant pirate activity in this region.
              Consider adjusting your risk aversion if safety is a priority.
            </AlertDescription>
          </Alert>
        )}
        
        {/* Jump Details Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-muted hover:bg-transparent">
                <TableHead className="text-muted-foreground">Jump</TableHead>
                <TableHead className="text-muted-foreground">From</TableHead>
                <TableHead className="text-muted-foreground">To</TableHead>
                <TableHead className="text-muted-foreground">Distance</TableHead>
                <TableHead className="text-muted-foreground">Risk Level</TableHead>
                <TableHead className="text-muted-foreground">Gate Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {route.jumps.map((jump) => {
                const riskCategory = getRiskCategory(jump.riskLevel);
                
                return (
                  <TableRow 
                    key={jump.jumpNumber}
                    className="border-b border-muted hover:bg-muted hover:bg-opacity-30 transition-colors"
                  >
                    <TableCell className="font-medium">{jump.jumpNumber}</TableCell>
                    <TableCell>{jump.fromSystemName}</TableCell>
                    <TableCell>{jump.toSystemName}</TableCell>
                    <TableCell>{jump.distance} LY</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full bg-risk-${riskCategory}`}></div>
                        <span>{jump.riskLevel.toFixed(2)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {jump.gateType === "Smart Gate" ? (
                        <Badge variant="outline" className="bg-primary bg-opacity-20 text-primary border-primary">
                          Smart Gate
                        </Badge>
                      ) : (
                        "Standard"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        {/* Alternative Routes */}
        {route.alternatives && route.alternatives.length > 0 && (
          <div className="mt-6">
            <h3 className="font-display text-lg font-medium mb-3">Alternative Routes</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {route.alternatives.map((alt, index) => {
                const riskCategory = getRiskCategory(alt.risk);
                const altRoute = alt.route ? alt.route : null;
                
                // Handle clicking on an alternative route card
                const handleAlternativeSelect = () => {
                  if (altRoute && onAlternativeRouteSelect) {
                    onAlternativeRouteSelect(altRoute);
                    
                    // Show a toast notification
                    toast({
                      title: `Selected ${alt.name}`,
                      description: `Now showing the ${alt.risk < 0.3 ? 'safer' : 'faster'} route option`
                    });
                  }
                };
                
                return (
                  <div 
                    key={index}
                    className="bg-muted bg-opacity-30 rounded-lg p-4 cursor-pointer hover:bg-opacity-50 hover:bg-primary/5 transition-colors border border-transparent hover:border-primary/30"
                    onClick={altRoute ? handleAlternativeSelect : undefined}
                    style={{ opacity: altRoute ? 1 : 0.7 }}
                    title={altRoute ? `Switch to ${alt.name}` : "Route data not available"}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">{alt.name}</span>
                      <Badge 
                        variant="outline" 
                        className={`bg-opacity-20 border-risk-${riskCategory} text-risk-${riskCategory} bg-risk-${riskCategory}`}
                      >
                        {riskCategory === "safe" ? "Low Risk" : riskCategory === "warning" ? "Medium Risk" : "High Risk"}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{alt.jumps} jumps</span>
                      <span>{alt.distance} LY</span>
                      <span>Risk: {alt.risk.toFixed(2)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
