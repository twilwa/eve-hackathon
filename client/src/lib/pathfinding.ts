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
 * with aggressive spacing for EVE Frontier systems to avoid overcrowding
 */
export function calculateMapCoordinates(
  systems: SolarSystem[]
): Map<number, { x: number, y: number }> {
  const coordinatesMap = new Map<number, { x: number, y: number }>();
  
  // Step 1: Use a more sophisticated approach that places systems in a grid
  // and then adjusts their positions to separate clusters
  
  // First create a spatial mapping of systems to identify clusters
  type Point3D = { x: number, y: number, z: number };
  const kdTree: { position: Point3D, system: SolarSystem }[] = [];
  
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
    
    kdTree.push({
      position: system.position,
      system
    });
  });
  
  // We'll use a force-directed-like approach where close systems push each other away
  // First, calculate normalized positions based on logarithmic scaling
  const normalizedPositions = new Map<number, { x: number, y: number }>();
  
  // Use cube root scaling for even more aggressive spreading of values
  const scaleCubeRoot = (value: number, min: number, max: number) => {
    // Handle potential negative values by shifting to positive range
    const shifted = value - min + 1; // +1 to avoid issues with zero
    const shiftedMax = max - min + 1;
    
    // Use cube root scaling for aggressive distribution in dense areas
    return Math.cbrt(shifted) / Math.cbrt(shiftedMax);
  };
  
  // Initial placement with cube root scaling
  systems.forEach(system => {
    // Apply strong scaling to better distribute systems
    const nx = scaleCubeRoot(system.position.x, minX, maxX);
    const ny = scaleCubeRoot(system.position.y, minY, maxY);
    const nz = scaleCubeRoot(system.position.z, minZ, maxZ);
    
    // Use a radically different projection combining all coordinates
    // Use system ID to create systematic variability 
    const hashFactor = (system.id % 10) / 30; // Systematic variation based on ID
    
    // Project 3D to 2D with strong randomization to break up clusters
    const x = 0.1 + (nx * 0.5 + nz * 0.3 + hashFactor) * 0.8;
    const y = 0.1 + (ny * 0.5 + (nx + nz) * 0.25 + hashFactor) * 0.8;
    
    // Add systematic offsets based on system ID for better distribution
    normalizedPositions.set(system.id, { x, y });
  });
  
  // Now use repulsion to push overlapping/nearby systems apart
  // This is a simplified force-directed algorithm
  const REPULSION_FORCE = 0.1;  // How strongly systems push each other away
  const ITERATIONS = 5;         // Number of iterations for force adjustment
  const MIN_DISTANCE = 0.05;    // Minimum distance between systems
  
  for (let iter = 0; iter < ITERATIONS; iter++) {
    // For each system, calculate repulsion from all other systems
    for (let i = 0; i < systems.length; i++) {
      const systemA = systems[i];
      const posA = normalizedPositions.get(systemA.id)!;
      let forceX = 0, forceY = 0;
      
      // Calculate forces from all other systems
      for (let j = 0; j < systems.length; j++) {
        if (i === j) continue;
        
        const systemB = systems[j];
        const posB = normalizedPositions.get(systemB.id)!;
        
        // Calculate distance between systems
        const dx = posA.x - posB.x;
        const dy = posA.y - posB.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Only apply force if systems are too close
        if (distance < MIN_DISTANCE) {
          // Normalize direction and calculate repulsion force
          // Smaller distances create stronger repulsion (inverse square law)
          const forceMagnitude = REPULSION_FORCE * (1 / (distance * distance));
          const normalizedDx = dx / distance || Math.random() - 0.5;
          const normalizedDy = dy / distance || Math.random() - 0.5;
          
          forceX += normalizedDx * forceMagnitude;
          forceY += normalizedDy * forceMagnitude;
        }
      }
      
      // Apply force to position (with damping to avoid instability)
      const damping = 0.9 / Math.sqrt(iter + 1);
      const newX = Math.max(0.05, Math.min(0.95, posA.x + forceX * damping));
      const newY = Math.max(0.05, Math.min(0.95, posA.y + forceY * damping));
      
      // Update position
      normalizedPositions.set(systemA.id, { x: newX, y: newY });
    }
  }
  
  // Final pass: Add small random offsets and ensure no systems are outside the map
  systems.forEach(system => {
    const pos = normalizedPositions.get(system.id)!;
    
    // Add small random offsets to break up any remaining patterns or exact overlaps
    const randomOffset = () => (Math.random() - 0.5) * 0.03;
    
    // Ensure systems stay within display bounds with padding
    const x = Math.max(0.05, Math.min(0.95, pos.x + randomOffset()));
    const y = Math.max(0.05, Math.min(0.95, pos.y + randomOffset()));
    
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
