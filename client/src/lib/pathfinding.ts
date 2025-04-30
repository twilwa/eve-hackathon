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
 * using an evenly distributed grid approach with systematic offsets
 */
export function calculateMapCoordinates(
  systems: SolarSystem[]
): Map<number, { x: number, y: number }> {
  const coordinatesMap = new Map<number, { x: number, y: number }>();
  
  // Use a grid-based distribution to evenly space out systems
  const gridSize = Math.ceil(Math.sqrt(systems.length)) + 1;
  
  // Create a grid occupancy map to track placed systems
  const gridOccupancy: boolean[][] = Array(gridSize).fill(null)
    .map(() => Array(gridSize).fill(false));
  
  // Sort systems by some meaningful property to ensure consistent placement
  // Systems with similar properties will still be relatively close to each other
  const sortedSystems = [...systems].sort((a, b) => {
    // First by security status if available
    if (a.securityStatus !== undefined && b.securityStatus !== undefined) {
      return b.securityStatus - a.securityStatus;
    }
    // Then by position.x as a fallback
    return a.position.x - b.position.x;
  });
  
  // Helper function to generate a deterministic but well-distributed
  // hash value for a system to aid in grid placement
  const getSystemHash = (system: SolarSystem): number => {
    const x = Math.abs(system.position.x);
    const y = Math.abs(system.position.y);
    const z = Math.abs(system.position.z);
    const id = system.id;
    
    // Generate a hash from the system properties
    // Use prime numbers to reduce collisions
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ id) % 1000000;
  };
  
  // Function to find the next available grid cell with specified pattern
  const findAvailableGridCell = (system: SolarSystem, startIdx: number): { row: number, col: number } => {
    // Try spiral pattern, outward from the center
    const centerRow = Math.floor(gridSize / 2);
    const centerCol = Math.floor(gridSize / 2);
    
    // Use system hash for deterministic offset from center
    const hash = getSystemHash(system);
    const rowOffset = (hash % 5) - 2; // -2 to +2
    const colOffset = ((hash / 5) % 5) - 2; // -2 to +2
    
    const startRow = Math.max(0, Math.min(gridSize - 1, centerRow + rowOffset));
    const startCol = Math.max(0, Math.min(gridSize - 1, centerCol + colOffset));
    
    // Spiral search from the starting point
    const spiralDirections = [
      { dr: 0, dc: 1 },  // right
      { dr: 1, dc: 0 },  // down
      { dr: 0, dc: -1 }, // left
      { dr: -1, dc: 0 }  // up
    ];
    
    let row = startRow;
    let col = startCol;
    let dirIndex = 0;
    let stepsInCurrentDir = 1;
    let stepsTaken = 0;
    let segmentsPassed = 0;
    
    // Try to find an empty cell in the grid using spiral pattern
    for (let attempts = 0; attempts < gridSize * gridSize; attempts++) {
      // Check if current cell is available
      if (row >= 0 && row < gridSize && col >= 0 && col < gridSize && !gridOccupancy[row][col]) {
        return { row, col };
      }
      
      // Move to next cell in spiral
      const dir = spiralDirections[dirIndex];
      row += dir.dr;
      col += dir.dc;
      
      stepsTaken++;
      
      // Check if we need to change direction
      if (stepsTaken === stepsInCurrentDir) {
        dirIndex = (dirIndex + 1) % 4;
        stepsTaken = 0;
        segmentsPassed++;
        
        // Increase step length every 2 segments
        if (segmentsPassed === 2) {
          stepsInCurrentDir++;
          segmentsPassed = 0;
        }
      }
    }
    
    // Fallback: just place it in a deterministic position based on index
    const fallbackRow = startIdx % gridSize;
    const fallbackCol = Math.floor(startIdx / gridSize) % gridSize;
    return { row: fallbackRow, col: fallbackCol };
  };

  // Place each system on the grid
  sortedSystems.forEach((system, index) => {
    // Find a grid cell for this system
    const { row, col } = findAvailableGridCell(system, index);
    
    // Mark this cell as occupied
    if (row >= 0 && row < gridSize && col >= 0 && col < gridSize) {
      gridOccupancy[row][col] = true;
    }
    
    // Calculate normalized coordinates (0-1 range)
    // Add small random jitter to avoid perfect grid alignment
    const jitterX = (Math.sin(system.id * 0.1) * 0.3 + Math.random() * 0.4 - 0.2) / gridSize;
    const jitterY = (Math.cos(system.id * 0.1) * 0.3 + Math.random() * 0.4 - 0.2) / gridSize;
    
    // Position in 0.05-0.95 range with jitter
    const x = 0.05 + (col / (gridSize - 1)) * 0.9 + jitterX;
    const y = 0.05 + (row / (gridSize - 1)) * 0.9 + jitterY;
    
    // Store the calculated coordinates
    coordinatesMap.set(system.id, { 
      x: Math.max(0.05, Math.min(0.95, x)),
      y: Math.max(0.05, Math.min(0.95, y))
    });
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
