import { useEffect, useState } from "react";
import { useWebSocket, ConnectionStatus } from "@/lib/websocket";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";

export function WebSocketStatus() {
  const { connect, onStatusChange, ConnectionStatus } = useWebSocket();
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const { toast } = useToast();
  
  // Connect to WebSocket on component mount
  useEffect(() => {
    connect();
    
    // Subscribe to status changes
    const unsubscribe = onStatusChange((newStatus) => {
      setStatus(newStatus);
      
      // Show toast for connection failures
      if (newStatus === ConnectionStatus.DISCONNECTED && 
          status === ConnectionStatus.RECONNECTING) {
        toast({
          title: "Connection Failed",
          description: "Failed to connect to real-time updates server",
          variant: "destructive"
        });
      }
    });
    
    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [connect, onStatusChange, status, toast]);
  
  // Determine icon and tooltip based on connection status
  const getStatusDetails = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return {
          icon: <Wifi className="h-4 w-4 text-green-500" />,
          text: "Connected to real-time updates",
          className: "bg-green-500/10"
        };
      case ConnectionStatus.CONNECTING:
        return {
          icon: <Wifi className="h-4 w-4 text-yellow-500 animate-pulse" />,
          text: "Connecting to real-time updates...",
          className: "bg-yellow-500/10"
        };
      case ConnectionStatus.RECONNECTING:
        return {
          icon: <Wifi className="h-4 w-4 text-orange-500 animate-pulse" />,
          text: "Reconnecting to real-time updates...",
          className: "bg-orange-500/10"
        };
      case ConnectionStatus.DISCONNECTED:
      default:
        return {
          icon: <WifiOff className="h-4 w-4 text-gray-500" />,
          text: "Disconnected from real-time updates",
          className: "bg-gray-500/10"
        };
    }
  };
  
  const { icon, text, className } = getStatusDetails();
  
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full p-1.5",
            className
          )}>
            {icon}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 