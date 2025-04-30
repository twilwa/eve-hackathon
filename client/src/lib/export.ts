import type { RouteResponse } from "@shared/schema";

/**
 * Downloads route data as a JSON file
 * @param route The route data to export
 * @param filename Optional custom filename (defaults to route-{fromSystemId}-to-{endSystemId}.json)
 */
export function downloadRouteAsJson(route: RouteResponse, filename?: string): void {
  if (!route) {
  
  // Get start and end systems from first and last jump
  const firstJump = route.jumps[0];
  const lastJump = route.jumps[route.jumps.length - 1];
  
  // Create a standardized export format with all route metadata
  const exportData = {
    metadata: {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      source: "EVE Frontier Broker-Scout",
    },
    route: {
      fromSystemId: firstJump.fromSystemId,
      fromSystemName: firstJump.fromSystemName,
      toSystemId: lastJump.toSystemId,
      toSystemName: lastJump.toSystemName,
      totalJumps: route.totalJumps,
      totalDistance: route.totalDistance,
      averageRisk: route.averageRisk,
      highRiskSections: route.highRiskSections || [],
      calculatedAt: new Date().toISOString(),
    },
    jumps: route.jumps.map(jump => ({
      jumpNumber: jump.jumpNumber,
      fromSystemId: jump.fromSystemId,
      fromSystemName: jump.fromSystemName,
      toSystemId: jump.toSystemId,
      toSystemName: jump.toSystemName,
      distance: jump.distance,
      riskLevel: jump.riskLevel,
      gateType: jump.gateType
    })),
    alternatives: route.alternatives 
      ? route.alternatives.map(alt => ({
          name: alt.name,
          jumps: alt.jumps,
          distance: alt.distance,
          risk: alt.risk,
          route: alt.route ? {
            totalJumps: alt.route.totalJumps,
            totalDistance: alt.route.totalDistance,
            averageRisk: alt.route.averageRisk,
            jumps: alt.route.jumps
          } : undefined
        })) 
      : [],
  };
  
  // Generate default filename if none provided
  const defaultFilename = `route-${firstJump.fromSystemId}-to-${lastJump.toSystemId}.json`;
  const outputFilename = filename || defaultFilename;
  
  // Convert to JSON string
  const jsonString = JSON.stringify(exportData, null, 2);
  
  // Create blob and download link
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  // Create and trigger download
  const link = document.createElement("a");
  link.href = url;
  link.download = outputFilename;
  document.body.appendChild(link);
  link.click();
  
  // Clean up
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
} 