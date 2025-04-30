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
  
  // Normalize coordinates to 0-1 range
  const normalizeX = (x: number) => (x - minX) / (maxX - minX || 1);
  const normalizeY = (y: number) => (y - minY) / (maxY - minY || 1);
  const normalizeZ = (z: number) => (z - minZ) / (maxZ - minZ || 1);
  
  // Project 3D coordinates to 2D
  // Using a simple projection where X and Z determine screen position
  systems.forEach(system => {
    const nx = normalizeX(system.position.x);
    const ny = normalizeY(system.position.y);
    const nz = normalizeZ(system.position.z);
    
    // Project to 2D - we'll use X coordinate directly and
    // combine Y and Z for the Y coordinate with a weighting
    const x = nx;
    const y = (ny * 0.3) + (nz * 0.7); // Weighted average
    
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
  // Size range from 5 to 15
  systems.forEach(system => {
    const connectionCount = connectionCounts.get(system.id) || 0;
    const normalizedCount = normalizeCount(connectionCount);
    const size = 5 + normalizedCount * 10;
    sizesMap.set(system.id, size);
  });
  
  return sizesMap;
}
