import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket, WebSocketChannel, ConnectionStatus } from '@/lib/websocket';
import { useToast } from './use-toast';
import type { Job, RiskData } from '@shared/schema';

type JobUpdateType = 'created' | 'claimed' | 'completed' | 'expired' | 'cancelled';

interface JobUpdate {
  type: JobUpdateType;
  timestamp: string;
  job: Job;
}

interface RiskUpdate {
  timestamp: string;
  updates: RiskData[];
}

/**
 * Hook that subscribes to WebSocket updates for risk data and job status changes
 */
export function useWebSocketUpdates() {
  const { on, connect, status } = useWebSocket();
  const [isConnected, setIsConnected] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // State for tracking recent updates
  const [recentJobUpdates, setRecentJobUpdates] = useState<JobUpdate[]>([]);
  const [recentRiskUpdates, setRecentRiskUpdates] = useState<RiskUpdate[]>([]);
  
  // Callback for handling job updates
  const handleJobUpdate = useCallback((data: JobUpdate) => {
    // Add to recent updates (limited to last 5)
    setRecentJobUpdates(prev => [data, ...prev].slice(0, 5));
    
    // Show toast notification
    const jobTypeLabels: Record<JobUpdateType, string> = {
      created: 'New Job Posted',
      claimed: 'Job Claimed',
      completed: 'Job Completed',
      expired: 'Job Expired',
      cancelled: 'Job Cancelled'
    };
    
    toast({
      title: jobTypeLabels[data.type],
      description: `Job #${data.job.id} from ${data.job.fromSystemName} to ${data.job.toSystemName}`,
      variant: data.type === 'expired' ? 'destructive' : 'default'
    });
    
    // Invalidate relevant queries to refresh data
    queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
  }, [toast, queryClient]);
  
  // Callback for handling risk updates
  const handleRiskUpdate = useCallback((data: RiskUpdate) => {
    // Add to recent updates (limited to last 5)
    setRecentRiskUpdates(prev => [data, ...prev].slice(0, 5));
    
    // Update risk data in query cache
    queryClient.setQueryData(['/api/risk'], (oldData: RiskData[] | undefined) => {
      if (!oldData) return undefined;
      
      // Create a map of the current risk data for easy lookup
      const riskDataMap = new Map(oldData.map(risk => [risk.systemId, risk]));
      
      // Update with new values
      for (const update of data.updates) {
        riskDataMap.set(update.systemId, update);
      }
      
      // Convert back to array
      return Array.from(riskDataMap.values());
    });
    
    // Only show toast for significant updates (lots of systems or high risk)
    const highRiskUpdates = data.updates.filter(update => update.riskScore > 0.7);
    if (data.updates.length > 10 || highRiskUpdates.length > 0) {
      toast({
        title: 'Risk Data Updated',
        description: `Updated risk data for ${data.updates.length} systems`,
        variant: highRiskUpdates.length > 0 ? 'destructive' : 'default'
      });
    }
  }, [toast, queryClient]);
  
  // Set up WebSocket subscriptions
  useEffect(() => {
    // Connect to WebSocket
    connect();
    
    // Subscribe to job updates
    const unsubscribeJobs = on(WebSocketChannel.JOB_UPDATE, handleJobUpdate);
    
    // Subscribe to risk updates
    const unsubscribeRisk = on(WebSocketChannel.RISK_UPDATE, handleRiskUpdate);
    
    // Cleanup on unmount
    return () => {
      unsubscribeJobs();
      unsubscribeRisk();
    };
  }, [connect, on, handleJobUpdate, handleRiskUpdate]);
  
  // Update connection status based on the current status value
  useEffect(() => {
    setIsConnected(status === ConnectionStatus.CONNECTED);
  }, [status]);
  
  return {
    isConnected,
    recentJobUpdates,
    recentRiskUpdates
  };
} 