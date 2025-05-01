import { useState, useEffect } from "react";
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Wifi } from "lucide-react";
import { WebSocketStatus } from "@/components/websocket-status";
import { useWebSocketUpdates } from "@/hooks/use-websocket-updates";
import { formatDistanceToNow } from "date-fns";
import type { Job, RiskData } from "@shared/schema";

/**
 * Component that shows real-time updates from the WebSocket connection
 */
export function RealTimeUpdates() {
  const { isConnected, recentJobUpdates, recentRiskUpdates } = useWebSocketUpdates();
  const [hasNewUpdates, setHasNewUpdates] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  
  // Reset new updates indicator when sheet is opened
  useEffect(() => {
    if (isOpen) {
      setHasNewUpdates(false);
    }
  }, [isOpen]);
  
  // Set new updates indicator when new updates arrive
  useEffect(() => {
    if (recentJobUpdates.length > 0 || recentRiskUpdates.length > 0) {
      if (!isOpen) {
        setHasNewUpdates(true);
      }
    }
  }, [recentJobUpdates, recentRiskUpdates, isOpen]);
  
  // Job update badge variant mapping
  const jobUpdateVariants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    created: "default",
    claimed: "secondary",
    completed: "outline",
    expired: "destructive",
    cancelled: "destructive"
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="relative"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          Updates
          {hasNewUpdates && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 animate-pulse" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            <span>Real-time Updates</span>
            <WebSocketStatus />
          </SheetTitle>
          <SheetDescription>
            Live updates for scouting jobs and risk data.
          </SheetDescription>
        </SheetHeader>
        
        <Tabs defaultValue="jobs" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="risk">Risk Data</TabsTrigger>
          </TabsList>
          
          <TabsContent value="jobs" className="mt-4">
            <h3 className="text-sm font-medium mb-2">Job Updates</h3>
            {recentJobUpdates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No recent job updates.</p>
            ) : (
              <ScrollArea className="h-[400px] rounded-md border p-4">
                <div className="space-y-4">
                  {recentJobUpdates.map((update, index) => (
                    <div key={`job-${update.job.id}-${update.type}`} className="bg-card/50 p-3 rounded-lg border">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant={jobUpdateVariants[update.type] || "default"}>
                          {update.type.charAt(0).toUpperCase() + update.type.slice(1)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(update.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium">Job #{update.job.id}</h4>
                        <p className="text-xs">
                          {update.job.fromSystemName} → {update.job.toSystemName}
                        </p>
                        <span className="inline-flex items-center">
                          Reward: {update.job.reward} Lux
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
          
          <TabsContent value="risk" className="mt-4">
            <h3 className="text-sm font-medium mb-2">Risk Data Updates</h3>
            {recentRiskUpdates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No recent risk data updates.</p>
            ) : (
              <ScrollArea className="h-[400px] rounded-md border p-4">
                <div className="space-y-4">
                  {recentRiskUpdates.map((update, timestamp) => (
                    <div key={`risk-${timestamp}`} className="bg-card/50 p-3 rounded-lg border">
                      <div className="flex justify-between items-start mb-2">
                        <Badge>Risk Update</Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(update.timestamp), { addSuffix: true })}
                        </span>
                      </div>
                      <p className="text-sm">
                        Updated risk data for {update.updates.length} systems
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {update.updates.slice(0, 6).map((riskData) => {
                          // Get system name from the system ID using a lookup or service
                          // For now, we'll display the systemId as a fallback
                          const systemName = `System-${riskData.systemId}`;
                          
                          return (
                            <div key={riskData.systemId} className="text-xs">
                              <Badge 
                                variant={riskData.riskScore > 0.7 ? "destructive" : (riskData.riskScore > 0.4 ? "secondary" : "outline")}
                                className="mr-1"
                              >
                                {Math.round(riskData.riskScore * 100)}%
                              </Badge>
                              {systemName}
                            </div>
                          );
                        })}
                      </div>
                      {update.updates.length > 6 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          + {update.updates.length - 6} more systems
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
} 