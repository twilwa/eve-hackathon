import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSolarSystemDetails } from '@/lib/api';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ShieldAlert } from 'lucide-react';
import type { SolarSystem, RiskData } from '@shared/schema';

interface SystemDetailsTooltipProps {
  system: SolarSystem;
  riskData?: RiskData;
  children: React.ReactNode;
}

export function SystemDetailsTooltip({ system, riskData, children }: SystemDetailsTooltipProps) {
  const { data: systemDetails, isLoading, error } = useQuery({
    queryKey: [`/api/systems/${system.id}/details`],
    enabled: true,
  });
  
  const [riskLevel, setRiskLevel] = useState<'low' | 'medium' | 'high'>('low');
  const [riskColor, setRiskColor] = useState('text-green-500');
  
  // Determine risk level label and color based on risk score
  useEffect(() => {
    if (riskData) {
      if (riskData.riskScore < 0.3) {
        setRiskLevel('low');
        setRiskColor('text-green-500');
      } else if (riskData.riskScore < 0.7) {
        setRiskLevel('medium');
        setRiskColor('text-yellow-500');
      } else {
        setRiskLevel('high');
        setRiskColor('text-red-500');
      }
    }
  }, [riskData]);
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {children}
        </TooltipTrigger>
        <TooltipContent side="right" className="p-0 max-w-sm">
          <div className="p-3 space-y-2">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-lg">{system.name}</h3>
              <Badge variant="outline" className={riskColor}>
                <ShieldAlert className="h-3 w-3 mr-1" />
                {riskLevel.toUpperCase()} RISK
              </Badge>
            </div>
            
            <div className="text-xs">
              System ID: {system.id}
            </div>
            
            {riskData && (
              <div className="text-xs">
                Risk Score: {Math.round(riskData.riskScore * 100)}%
              </div>
            )}
            
            {isLoading && (
              <div className="text-sm py-2">Loading system details...</div>
            )}
            
            {error && (
              <div className="text-sm text-red-500">Error loading system details</div>
            )}
            
            {systemDetails && (
              <>
                <h4 className="font-medium text-sm">Smart Entities</h4>
                <div className="space-y-1">
                  {systemDetails.entities.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No entities present</div>
                  ) : (
                    systemDetails.entities.map((entity, index) => (
                      <div key={index} className="text-sm flex justify-between">
                        <span>{entity.name}</span>
                        <span className="text-muted-foreground">{entity.owner}</span>
                      </div>
                    ))
                  )}
                </div>
                
                <div className="text-xs text-muted-foreground mt-2">
                  Updated {formatDistanceToNow(new Date(systemDetails.lastUpdated), { addSuffix: true })}
                </div>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
} 