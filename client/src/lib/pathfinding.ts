import type { SolarSystem, RiskData, SystemConnection } from "@shared/schema";

/**
 * Calculates a risk score for a connection between two systems
 */
export function calculateConnectionRisk(
  sourceId: number,
  targetId: number,
  riskData: Map<number, RiskData>
): number {
  const sourceRisk = riskData.get(sourceId)?.riskScore || 0.3;
  const targetRisk = riskData.get(targetId)?.riskScore || 0.3;
  
  // Average risk between source and target systems
  return (sourceRisk + targetRisk) / 2;
}

/**
 * Determines risk category from a numeric risk score
 */
export function getRiskCategory(riskScore: number): "safe" | "warning" | "danger" {
  if (riskScore < 0.3) return "safe";
  if (riskScore < 0.7) return "warning";
  return "danger";
}

/**
 * Calculates coordinates for visualizing a solar system on a 2D map
 * with better spacing for EVE Frontier systems
 */
export function calculateMapCoordinates(
  systems: SolarSystem[]
): Map<number, { x: number, y: number }> {
  const coordinatesMap = new Map<number, { x: number, y: number }>();
  
  // Find the bounding box of all systems
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  
  systems.forEach(system => {
    minX = Math.min(minX, system.position.x);
    maxX = Math.max(maxX, system.position.x);
    minY = Math.min(minY, system.position.y);
    maxY = Math.max(maxY, system.position.y);
    minZ = Math.min(minZ, system.position.z);
    maxZ = Math.max(maxZ, system.position.z);
  });
  
  // Use logarithmic scaling to better handle the extreme ranges of EVE API coordinates
  // This helps spread out systems that would otherwise be too close together
  const scaleLog = (value: number, min: number, max: number) => {
    // Handle potential negative values by shifting to positive range
    const shifted = value - min + 1; // +1 to avoid log(0)
    const shiftedMax = max - min + 1;
    
    // Use logarithmic scaling for better distribution
    return Math.log(shifted) / Math.log(shiftedMax);
  };
  
  // Project 3D coordinates to 2D with better scaling
  systems.forEach(system => {
    // Apply log scaling to better distribute systems
    const nx = scaleLog(system.position.x, minX, maxX);
    const ny = scaleLog(system.position.y, minY, maxY);
    const nz = scaleLog(system.position.z, minZ, maxZ);
    
    // Use a different projection to increase spacing
    // Add small random offsets to prevent perfect overlaps
    const randomOffset = () => (Math.random() - 0.5) * 0.02; // Small random offset
    
    // Use a combination of coordinates with buffer spacing
    // Padding the edges (0.1 to 0.9 instead of 0 to 1) to ensure systems aren't on the edge
    const x = 0.1 + (nx * 0.8) + randomOffset();
    const y = 0.1 + ((ny * 0.3) + (nz * 0.7)) * 0.8 + randomOffset();
    
    coordinatesMap.set(system.id, { x, y });
  });
  
  return coordinatesMap;
}

/**
 * Creates graph connections for visualization
 */
export function getConnectionsForVisualization(
  connections: SystemConnection[],
  coordinatesMap: Map<number, { x: number, y: number }>,
  riskDataMap: Map<number, RiskData>
) {
  return connections.map(conn => {
    const sourceCoords = coordinatesMap.get(conn.sourceId);
    const targetCoords = coordinatesMap.get(conn.targetId);
    
    if (!sourceCoords || !targetCoords) return null;
    
    const risk = calculateConnectionRisk(conn.sourceId, conn.targetId, riskDataMap);
    
    return {
      sourceId: conn.sourceId,
      targetId: conn.targetId,
      source: sourceCoords,
      target: targetCoords,
      risk,
      riskCategory: getRiskCategory(risk),
      gateType: conn.gateType || "Standard"
    };
  }).filter(Boolean);
}

/**
 * Generates node sizes based on connectivity
 */
export function generateNodeSizes(
  systems: SolarSystem[],
  connections: SystemConnection[]
): Map<number, number> {
  const sizesMap = new Map<number, number>();
  const connectionCounts = new Map<number, number>();
  
  // Count connections for each system
  connections.forEach(conn => {
    connectionCounts.set(
      conn.sourceId, 
      (connectionCounts.get(conn.sourceId) || 0) + 1
    );
    connectionCounts.set(
      conn.targetId, 
      (connectionCounts.get(conn.targetId) || 0) + 1
    );
  });
  
  // Find the range of connection counts
  let minConnections = Infinity;
  let maxConnections = 0;
  
  connectionCounts.forEach(count => {
    minConnections = Math.min(minConnections, count);
    maxConnections = Math.max(maxConnections, count);
  });
  
  const normalizeCount = (count: number) => {
    if (maxConnections === minConnections) return 0.5;
    return (count - minConnections) / (maxConnections - minConnections);
  };
  
  // Generate sizes based on normalized connection counts
  // Size range from 8 to 20 for better visibility
  systems.forEach(system => {
    const connectionCount = connectionCounts.get(system.id) || 0;
    const normalizedCount = normalizeCount(connectionCount);
    const size = 8 + normalizedCount * 12; // Increase the minimum size and range
    sizesMap.set(system.id, size);
  });
  
  return sizesMap;
}
