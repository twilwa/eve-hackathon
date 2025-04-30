import { useQuery } from "@tanstack/react-query";
import { getApiHealth } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { MdRoute } from "react-icons/md";

export function AppHeader() {
  const { data: healthData, isError } = useQuery({
    queryKey: ["/api/health"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const apiStatus = isError 
    ? "offline" 
    : healthData?.status === "online" 
      ? "online" 
      : "connecting";

  return (
    <header className="bg-slate-900 py-4 px-6 shadow-md border-b border-slate-800">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <MdRoute className="text-primary-foreground text-xl" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Advanced Risk-Aware Route Planner
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">API Status:</span>
          <ApiStatusBadge status={apiStatus} />
        </div>
      </div>
    </header>
  );
}

function ApiStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "online":
      return (
        <Badge variant="outline" className="bg-green-950 text-green-400 border-green-800 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span>Connected</span>
        </Badge>
      );
    case "offline":
      return (
        <Badge variant="outline" className="bg-red-950 text-red-400 border-red-800 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span>Disconnected</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-amber-950 text-amber-400 border-amber-800 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          <span>Connecting...</span>
        </Badge>
      );
  }
}
