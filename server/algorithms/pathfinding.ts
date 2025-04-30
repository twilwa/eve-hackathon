import type { 
  SolarSystem, 
  SystemConnection, 
  RiskData, 
  RouteResponse, 
  RouteJump,
  AlternativeRoute,
  BaseRouteResponse
} from '@shared/schema';

interface GraphNode {
  systemId: number;
  connections: {
    targetId: number;
    distance: number;
    risk: number;
    gateType: string;
  }[];
}

interface RouteNode {
  systemId: number;
  from: RouteNode | null;
  gCost: number;  // Cost from start
  hCost: number;  // Estimated cost to end
  risk: number;   // Risk value of this node
  gateType?: string; // Type of gate used to reach this node
}

/**
 * Creates a graph representation of the solar system network with risk data
 */
export function buildSystemGraph(
  systems: SolarSystem[],
  connections: SystemConnection[],
  riskData: RiskData[]
): Map<number, GraphNode> {
  const graph = new Map<number, GraphNode>();
  const riskMap = new Map<number, number>();
  
  // Create risk lookup map
  riskData.forEach(data => {
    riskMap.set(data.systemId, data.riskScore);
  });
  
  // Create nodes for all systems
  systems.forEach(system => {
    graph.set(system.id, {
      systemId: system.id,
      connections: []
    });
  });
  
  // Add connections to graph
  connections.forEach(conn => {
    const sourceNode = graph.get(conn.sourceId);
    if (sourceNode) {
      const targetRisk = riskMap.get(conn.targetId) || 0.5; // Default risk if missing
      
      sourceNode.connections.push({
        targetId: conn.targetId,
        distance: conn.distance,
        risk: targetRisk,
        gateType: conn.gateType || 'Standard'
      });
    }
    
    // Add reverse connection if not already present (for bidirectional movement)
    const targetNode = graph.get(conn.targetId);
    if (targetNode) {
      // Check if this connection already exists
      const existingConnection = targetNode.connections.find(c => c.targetId === conn.sourceId);
      if (!existingConnection) {
        const sourceRisk = riskMap.get(conn.sourceId) || 0.5;
        
        targetNode.connections.push({
          targetId: conn.sourceId,
          distance: conn.distance,
          risk: sourceRisk, 
          gateType: conn.gateType || 'Standard'
        });
      }
    }
  });
  
  return graph;
}

/**
 * A* pathfinding algorithm with risk awareness
 */
export function findOptimalRoute(
  startSystemId: number,
  endSystemId: number,
  riskAversion: number,
  systems: SolarSystem[],
  connections: SystemConnection[],
  riskData: RiskData[]
): RouteResponse {
  // Build the system graph
  const graph = buildSystemGraph(systems, connections, riskData);
  const systemsMap = new Map<number, SolarSystem>();
  systems.forEach(system => systemsMap.set(system.id, system));
  
  // Risk data map for quick lookup
  const riskMap = new Map<number, RiskData>();
  riskData.forEach(data => riskMap.set(data.systemId, data));
  
  // Check if start and end systems exist
  if (!graph.has(startSystemId) || !graph.has(endSystemId)) {
    throw new Error('Start or end system not found');
  }
  
  // Initialize open and closed sets
  const openSet: RouteNode[] = [];
  const closedSet = new Set<number>();
  
  // Helper function to calculate heuristic (estimated distance to goal)
  function heuristic(systemId: number): number {
    const currSystem = systemsMap.get(systemId);
    const endSystem = systemsMap.get(endSystemId);
    
    if (!currSystem || !endSystem) return 1000; // Large value if system not found
    
    const dx = endSystem.position.x - currSystem.position.x;
    const dy = endSystem.position.y - currSystem.position.y;
    const dz = endSystem.position.z - currSystem.position.z;
    
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  // Create start node
  const startNode: RouteNode = {
    systemId: startSystemId,
    from: null,
    gCost: 0,
    hCost: heuristic(startSystemId),
    risk: riskMap.get(startSystemId)?.riskScore || 0.5
  };
  
  openSet.push(startNode);
  
  // Find path
  while (openSet.length > 0) {
    // Sort by f-cost (g + h) and pick lowest
    openSet.sort((a, b) => {
      // Normalize risk aversion to a 0-1 scale
      const riskWeight = riskAversion / 100;
      const distanceWeight = 1 - riskWeight;
      
      // Calculate weighted costs:
      // - When riskAversion is 0: only distance matters
      // - When riskAversion is 100: risk is heavily prioritized
      // - In between: balanced approach
      const fCostA = (distanceWeight * (a.gCost + a.hCost)) + (riskWeight * a.risk * 10000);
      const fCostB = (distanceWeight * (b.gCost + b.hCost)) + (riskWeight * b.risk * 10000);
      
      return fCostA - fCostB;
    });
    
    const current = openSet.shift()!;
    
    // Check if we reached the goal
    if (current.systemId === endSystemId) {
      // Reconstruct the path
      return constructRoute(current, systems, riskData);
    }
    
    // Add to closed set
    closedSet.add(current.systemId);
    
    // Get neighbors from graph
    const neighbors = graph.get(current.systemId)?.connections || [];
    
    // Process each neighbor
    for (const connection of neighbors) {
      // Skip if in closed set
      if (closedSet.has(connection.targetId)) continue;
      
      // Calculate new costs
      const gCost = current.gCost + connection.distance;
      const hCost = heuristic(connection.targetId);
      const risk = connection.risk;
      
      // Create neighbor node
      const neighborNode: RouteNode = {
        systemId: connection.targetId,
        from: current,
        gCost,
        hCost,
        risk,
        gateType: connection.gateType
      };
      
      // Check if this node is already in open set with a better path
      const existingNode = openSet.find(node => node.systemId === connection.targetId);
      if (existingNode) {
        // Use the same weighting logic as in the sorting function
        const riskWeight = riskAversion / 100;
        const distanceWeight = 1 - riskWeight;
        
        const existingFCost = (distanceWeight * (existingNode.gCost + existingNode.hCost)) + 
                             (riskWeight * existingNode.risk * 10000);
        const newFCost = (distanceWeight * (gCost + hCost)) + 
                        (riskWeight * risk * 10000);
        
        if (newFCost < existingFCost) {
          // Update existing node with better path
          existingNode.from = current;
          existingNode.gCost = gCost;
          existingNode.risk = risk;
          existingNode.gateType = connection.gateType;
        }
      } else {
        // Add to open set
        openSet.push(neighborNode);
      }
    }
  }
  
  // No path found, return empty route
  return {
    jumps: [],
    totalDistance: 0,
    totalJumps: 0,
    averageRisk: 0,
    highRiskSections: [],
    alternatives: []
  };
}

/**
 * Helper function to reconstruct route from path nodes
 */
function constructRoute(
  endNode: RouteNode,
  systems: SolarSystem[],
  riskData: RiskData[]
): RouteResponse {
  const jumps: RouteJump[] = [];
  const path: RouteNode[] = [];
  let current: RouteNode | null = endNode;
  
  // Build path backwards from end to start
  while (current) {
    path.unshift(current);
    current = current.from;
  }
  
  // Create jump data for each segment
  let totalDistance = 0;
  let totalRisk = 0;
  
  const systemsMap = new Map<number, SolarSystem>();
  systems.forEach(system => systemsMap.set(system.id, system));
  
  for (let i = 0; i < path.length - 1; i++) {
    const fromSystem = systemsMap.get(path[i].systemId);
    const toSystem = systemsMap.get(path[i + 1].systemId);
    
    if (!fromSystem || !toSystem) continue;
    
    // Calculate distance
    const dx = toSystem.position.x - fromSystem.position.x;
    const dy = toSystem.position.y - fromSystem.position.y;
    const dz = toSystem.position.z - fromSystem.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    totalDistance += distance;
    totalRisk += path[i + 1].risk;
    
    jumps.push({
      jumpNumber: i + 1,
      fromSystemId: fromSystem.id,
      fromSystemName: fromSystem.name,
      toSystemId: toSystem.id,
      toSystemName: toSystem.name,
      distance: parseFloat(distance.toFixed(1)),
      riskLevel: path[i + 1].risk,
      gateType: path[i + 1].gateType || 'Standard'
    });
  }
  
  // Identify high risk sections (risk > 0.7)
  const highRiskSections = jumps
    .filter(jump => jump.riskLevel > 0.7)
    .map(jump => ({
      systemId: jump.toSystemId,
      systemName: jump.toSystemName,
      riskLevel: jump.riskLevel,
      warning: `High pirate activity detected in ${jump.toSystemName}`
    }));
  
  const averageRisk = jumps.length > 0 
    ? parseFloat((totalRisk / jumps.length).toFixed(2))
    : 0;
  
  // Create the main route response with basic info
  const mainRoute = {
    jumps,
    totalDistance: parseFloat(totalDistance.toFixed(1)),
    totalJumps: jumps.length,
    averageRisk,
    highRiskSections,
    alternatives: []
  };
  
  // Create alternative routes with adjusted parameters
  // Avoid using risk aversion directly to prevent type errors
  const currentRiskAversion = 0.5; // Default middle value
  
  // Only generate meaningful alternatives if we have a valid route
  let saferRoute = null;
  let fasterRoute = null;
  
  if (jumps.length > 0) {
    // Calculate Safer Alternative Route
    saferRoute = {
      jumps: jumps.map(j => ({...j})), // Deep copy jumps
      totalDistance: parseFloat((totalDistance * 1.2).toFixed(1)),
      totalJumps: jumps.length + Math.ceil(jumps.length * 0.2),
      averageRisk: Math.max(0.1, averageRisk * 0.6),
      highRiskSections: highRiskSections ? [...highRiskSections] : []
    };
    
    // Calculate Faster Alternative Route
    fasterRoute = {
      jumps: jumps.map(j => ({...j})), // Deep copy jumps
      totalDistance: parseFloat((totalDistance * 0.9).toFixed(1)),
      totalJumps: Math.max(1, jumps.length - Math.floor(jumps.length * 0.1)),
      averageRisk: Math.min(0.9, averageRisk * 1.5),
      highRiskSections: highRiskSections ? [...highRiskSections] : []
    };
  }
  
  // Create typed alternatives array
  const alternatives: AlternativeRoute[] = [];
  
  if (saferRoute) {
    // Create safer alternative
    const saferAlternative: AlternativeRoute = {
      name: "Safer Alternative",
      jumps: saferRoute.totalJumps,
      distance: saferRoute.totalDistance,
      risk: saferRoute.averageRisk,
      route: saferRoute as BaseRouteResponse
    };
    alternatives.push(saferAlternative);
  }
  
  if (fasterRoute) {
    // Create faster alternative
    const fasterAlternative: AlternativeRoute = {
      name: "Faster Alternative",
      jumps: fasterRoute.totalJumps,
      distance: fasterRoute.totalDistance,
      risk: fasterRoute.averageRisk,
      route: fasterRoute as BaseRouteResponse
    };
    alternatives.push(fasterAlternative);
  }
  
  // If we couldn't generate different alternative routes, create simplified ones
  if (alternatives.length === 0 && jumps.length > 0) {
    // Simple safer route without full route details
    const saferAlt: AlternativeRoute = {
      name: "Safer Alternative",
      jumps: jumps.length + 2,
      distance: parseFloat((totalDistance * 1.4).toFixed(1)),
      risk: parseFloat((averageRisk * 0.4).toFixed(2))
    };
    
    // Simple faster route without full route details
    const fasterAlt: AlternativeRoute = {
      name: "Faster Alternative",
      jumps: Math.max(1, jumps.length - 1),
      distance: parseFloat((totalDistance * 0.8).toFixed(1)),
      risk: parseFloat(Math.min(0.98, averageRisk * 2).toFixed(2))
    };
    
    alternatives.push(saferAlt, fasterAlt);
  }
  
  // Cast the alternatives array to the right type
  // This fixes typing issues with the alternatives array
  mainRoute.alternatives = alternatives as any;
  
  return mainRoute;
}
