import { apiRequest } from '../utils/request';
import type { SolarSystem, SystemConnection, RiskData, SystemEntity, SolarSystemDetails } from '@shared/schema';
import { log } from '../vite';

// Update to use the correct API endpoints based on docs
const API_BASE_URL = process.env.EVE_FRONTIER_API_URL || 'https://world-api-nova.live.tech.evefrontier.com';
const API_KEY = process.env.EVE_FRONTIER_API_KEY || '';

// Keep track of API failures for better error handling
let apiFailureCount = 0;
const MAX_API_FAILURES = 3;

/**
 * Fetches all solar systems from EVE Frontier API
 */
export async function fetchSolarSystems(): Promise<SolarSystem[]> {
  try {
    log("Fetching solar systems from EVE Frontier API");
    
    // Attempt to fetch from real EVE Frontier API
    const response = await apiRequest('GET', `${API_BASE_URL}/v2/solarsystems`);
    
    // Check if response contains data
    const responseData = await response.json();
    
    // API returns data in various formats
    let systemsData = responseData;
    
    // Handle different data structures
    if (responseData.data && Array.isArray(responseData.data)) {
      systemsData = responseData.data;
    } else if (!Array.isArray(systemsData)) {
      throw new Error('Expected array of systems in API response');
    }
    
    // Map the API response to our schema
    const systems: SolarSystem[] = systemsData.map((system: any) => ({
      id: system.id || system.solarSystemID || system.solarSystemId,
      name: system.name || system.solarSystemName,
      position: {
        x: system.location?.x || (system.position ? system.position.x : 0) || 0,
        y: system.location?.y || (system.position ? system.position.y : 0) || 0,
        z: system.location?.z || (system.position ? system.position.z : 0) || 0,
      },
      securityStatus: system.securityStatus || 0,
      connections: []
    }));
    
    log(`Fetched ${systems.length} solar systems from EVE Frontier API`);
    
    // Reset failure count on success
    apiFailureCount = 0;
    
    return systems;
  } catch (error) {
    apiFailureCount++;
    
    console.error(`Error fetching solar systems (attempt ${apiFailureCount}):`, error);
    
    // If too many failures, generate fallback data
    if (apiFailureCount >= MAX_API_FAILURES) {
      console.warn("Too many API failures, falling back to generated data");
      return generateFallbackSystems();
    }
    
    throw new Error(`Failed to fetch solar systems data from EVE Frontier API: ${error}`);
  }
}

/**
 * Generate fallback system data for demo purposes
 */
function generateFallbackSystems(): SolarSystem[] {
  const systems: SolarSystem[] = [];
  
  // Generate a grid of systems
  const gridSize = 5;
  const spacing = 10e12; // 10 trillion units
  
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      const id = x * gridSize + y + 1;
      
      systems.push({
        id,
        name: `Demo System ${id}`,
        position: {
          x: x * spacing,
          y: y * spacing,
          z: 0
        },
        securityStatus: Math.random(),
        connections: []
      });
    }
  }
  
  return systems;
}

/**
 * Fetches system connections (gates) from EVE Frontier API
 */
export async function fetchSystemConnections(): Promise<SystemConnection[]> {
  try {
    // Fetch systems from API first
    const systems = await fetchSolarSystems();
    const connections: SystemConnection[] = [];
    
    // Try to get connections from API first if explicitly provided
    let hasExplicitConnections = false;
    
    // Create a spatial grid to optimize finding nearby systems
    // This is a simple spatial partitioning optimization for large datasets
    const gridSize = 5e12; // Grid cell size based on typical EVE distances
    const spatialGrid = new Map<string, SolarSystem[]>();
    
    // Place systems in grid cells
    systems.forEach(system => {
      const gridX = Math.floor(system.position.x / gridSize);
      const gridY = Math.floor(system.position.y / gridSize);
      const gridZ = Math.floor(system.position.z / gridSize);
      const gridKey = `${gridX},${gridY},${gridZ}`;
      
      if (!spatialGrid.has(gridKey)) {
        spatialGrid.set(gridKey, []);
      }
      spatialGrid.get(gridKey)!.push(system);
    });
    
    // Function to get nearby systems using the spatial grid
    const getNearbySystemsFromGrid = (system: SolarSystem): SolarSystem[] => {
      const gridX = Math.floor(system.position.x / gridSize);
      const gridY = Math.floor(system.position.y / gridSize);
      const gridZ = Math.floor(system.position.z / gridSize);
      
      // Check current cell and adjacent cells
      const nearbySystems: SolarSystem[] = [];
      
      // Search in current and adjacent grid cells
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dz = -1; dz <= 1; dz++) {
            const searchKey = `${gridX + dx},${gridY + dy},${gridZ + dz}`;
            const cellSystems = spatialGrid.get(searchKey) || [];
            nearbySystems.push(...cellSystems.filter(s => s.id !== system.id));
          }
        }
      }
      
      return nearbySystems;
    };
    
    // First check for explicit connections in the API data
    for (const system of systems) {
      if (system.connections && system.connections.length > 0) {
        hasExplicitConnections = true;
        
        system.connections.forEach(targetId => {
          const targetSystem = systems.find(s => s.id === targetId);
          if (targetSystem) {
            const distance = calculateDistance(system.position, targetSystem.position);
            
            connections.push({
              sourceId: system.id,
              targetId: targetId,
              distance: distance,
              gateType: 'Standard Gate'
            });
          }
        });
      }
    }
    
    // If no explicit connections were found, create them based on proximity
    if (!hasExplicitConnections) {
      console.log("No explicit connections found in API data, generating based on proximity");
      
      // For each system, find its closest neighbors
      for (const system of systems) {
        // Calculate distances to ALL other systems instead of just grid neighbors
        // This ensures we always have connections even if the grid approach doesn't work
        const allOtherSystems = systems.filter(s => s.id !== system.id);
        
        const neighborsWithDistances = allOtherSystems.map(neighbor => ({
          system: neighbor,
          distance: calculateDistance(system.position, neighbor.position)
        }));
        
        // Sort by distance and take more neighbors to ensure better connectivity
        // This will create more connections and make the map easier to navigate
        const closestNeighbors = neighborsWithDistances
          .sort((a, b) => a.distance - b.distance)
          .slice(0, Math.min(5, neighborsWithDistances.length)); // Take the 5 closest systems
        
        // Create connections to closest neighbors
        closestNeighbors.forEach(({ system: neighbor, distance }) => {
          // Check if this connection already exists
          const connectionExists = connections.some(
            conn => (conn.sourceId === system.id && conn.targetId === neighbor.id) ||
                    (conn.sourceId === neighbor.id && conn.targetId === system.id)
          );
          
          if (!connectionExists) {
            // Assign varying risk levels to connections based on distance
            // This will make risk-based routing more interesting
            connections.push({
              sourceId: system.id,
              targetId: neighbor.id,
              distance: distance,
              gateType: distance > 10 ? 'Smart Gate' : 'Standard Gate'
            });
          }
        });
      }
      
      // Ensure the graph is highly connected by adding some longer jumps
      if (connections.length < systems.length * 3) {
        console.log("Adding additional connections to ensure pathfinding works properly");
        
        // For testing purposes, create some direct connections between distant systems
        // to ensure there are multiple possible routes between systems
        for (let i = 0; i < systems.length; i += 5) {
          const sourceSystem = systems[i];
          // Add a few long-distance connections as "wormholes" or "jump bridges"
          for (let j = 0; j < systems.length; j += 10) {
            if (i !== j) {
              const targetSystem = systems[j];
              const dist = calculateDistance(sourceSystem.position, targetSystem.position);
              
              // Check if this connection already exists
              const connectionExists = connections.some(
                conn => (conn.sourceId === sourceSystem.id && conn.targetId === targetSystem.id) ||
                        (conn.sourceId === targetSystem.id && conn.targetId === sourceSystem.id)
              );
              
              if (!connectionExists) {
                connections.push({
                  sourceId: sourceSystem.id,
                  targetId: targetSystem.id,
                  distance: dist,
                  gateType: 'Jump Bridge'
                });
              }
            }
          }
        }
      }
    }

    // If we still have no connections after all attempts, generate direct connections
    if (connections.length === 0) {
      console.log('Failed to create connections, generating direct connections as fallback');
      
      // Simple approach: connect each system to its 5 nearest neighbors
      for (let i = 0; i < systems.length; i++) {
        const system = systems[i];
        const otherSystems = systems.filter(s => s.id !== system.id);
        
        // Calculate distances to all other systems
        const systemsWithDistance = otherSystems.map(other => ({
          system: other,
          distance: calculateDistance(system.position, other.position)
        }));
        
        // Sort by distance and take the 5 nearest
        const nearestSystems = systemsWithDistance
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5);
        
        // Create connections
        nearestSystems.forEach(({ system: other, distance }) => {
          connections.push({
            sourceId: system.id,
            targetId: other.id,
            distance,
            gateType: 'Standard Gate'
          });
        });
      }
    }
    
    console.log(`Created ${connections.length} system connections`);
    return connections;
  } catch (error) {
    console.error('Error generating system connections:', error);
    throw new Error('Failed to generate system connections');
  }
}

/**
 * Fetches killmail data and calculates risk levels
 */
export async function fetchKillmailData(): Promise<RiskData[]> {
  try {
    log("Fetching killmail data from EVE Frontier API");
    
    // Try to fetch killmail data from EVE Frontier API
    const systems = await fetchSolarSystems();
    let response;
    let killmailData: any[] = [];
    
    try {
      // Attempt to fetch killmail data - the endpoint might be /v2/killmails or /killmails
      try {
        response = await apiRequest('GET', `${API_BASE_URL}/v2/killmails`);
      } catch (err) {
        // Try alternative endpoint
        response = await apiRequest('GET', `${API_BASE_URL}/killmails`);
      }
      
      const responseData = await response.json();
      
      // Handle different data structures
      if (responseData.data && Array.isArray(responseData.data)) {
        killmailData = responseData.data;
      } else if (Array.isArray(responseData)) {
        killmailData = responseData;
      } else {
        throw new Error('Expected array of killmails in API response');
      }
    } catch (err) {
      console.warn('Failed to fetch killmail data from EVE Frontier API:', err);
      console.warn('Generating simulated risk data instead');
      return generateSimulatedRiskData(systems);
    }
    
    // Process killmail data to calculate risk levels
    const riskMap = new Map<number, number>();
    
    // Initialize risk levels for all systems
    systems.forEach(system => {
      // Set initial risk based on security status (higher security = lower risk)
      let baseRisk = 1 - system.securityStatus;
      // Ensure value is in 0-1 range
      baseRisk = Math.max(0.1, Math.min(0.9, baseRisk));
      riskMap.set(system.id, baseRisk);
    });
    
    // Process killmail data to increase risk levels
    killmailData.forEach(killmail => {
      const systemId = killmail.solarSystemID || killmail.solarSystemId || killmail.systemId;
      const value = killmail.value || killmail.iskValue || 0;
      
      if (systemId && riskMap.has(systemId)) {
        let currentRisk = riskMap.get(systemId) || 0.1;
        
        // Increase risk based on killmail value
        const riskIncrease = Math.min(0.3, value / 1000000000 * 0.1); // 0.1 risk per billion ISK, max 0.3
        currentRisk = Math.min(1, currentRisk + riskIncrease);
        
        riskMap.set(systemId, currentRisk);
      }
    });
    
    // Convert map to array of RiskData objects
    const riskData: RiskData[] = Array.from(riskMap.entries()).map(([systemId, riskLevel]) => ({
      systemId,
      riskLevel,
      updatedAt: new Date().toISOString()
    }));
    
    log(`Processed risk data for ${riskData.length} systems`);
    return riskData;
  } catch (error) {
    console.error('Error fetching or processing risk data:', error);
    
    // Fallback to simulated risk data
    const systems = await fetchSolarSystems();
    return generateSimulatedRiskData(systems);
  }
}

/**
 * Generate simulated risk data for demo purposes
 */
function generateSimulatedRiskData(systems: SolarSystem[]): RiskData[] {
  return systems.map(system => {
    // Base risk on security status with some randomness
    let baseRisk = 1 - system.securityStatus;
    
    // Add some random variation to make it interesting
    baseRisk = Math.max(0.1, Math.min(0.9, baseRisk + (Math.random() * 0.4 - 0.2)));
    
    return {
      systemId: system.id,
      riskLevel: baseRisk,
      updatedAt: new Date().toISOString()
    };
  });
}

/**
 * Fetch Smart Assembly data to identify custom gates
 */
export async function fetchSmartGates(): Promise<SystemConnection[]> {
  try {
    // Get all regular system connections
    const standardConnections = await fetchSystemConnections();
    
    // Try to fetch smart assembly data from EVE Frontier API
    try {
      // First try v2 endpoint
      try {
        const response = await apiRequest('GET', `${API_BASE_URL}/v2/smart-assemblies`);
        const responseData = await response.json();
        const assemblies = responseData.data || [];
        
        // Filter for smart gates
        const smartGates = assemblies.filter((assembly: any) => 
          assembly.type === 'SmartGate' || 
          assembly.name?.toLowerCase().includes('gate') ||
          assembly.assemblyType?.toLowerCase().includes('gate')
        );
        
        if (smartGates.length > 0) {
          // Convert to system connections
          const smartConnections = smartGates.map((gate: any) => ({
            sourceId: gate.source_system_id || gate.sourceSystemId || gate.system_id || gate.systemId,
            targetId: gate.destination_system_id || gate.destinationSystemId || gate.linked_system_id || gate.linkedSystemId,
            distance: calculateDistance(
              gate.position || gate.location || { x: 0, y: 0, z: 0 },
              gate.destination_position || gate.destinationLocation || { x: 0, y: 0, z: 0 }
            ),
            gateType: 'Smart Gate'
          })).filter((conn) => 
            // Filter out connections with missing source or target
            conn.sourceId && conn.targetId
          );
          
          console.log(`Added ${smartConnections.length} smart gate connections from v2 API`);
          return smartConnections;
        }
      } catch (v2Error) {
        console.log('Trying fallback smart-assemblies endpoint');
        
        // Try fallback endpoint
        const response = await apiRequest('GET', `${API_BASE_URL}/smart-assemblies`);
        const responseData = await response.json();
        const assemblies = Array.isArray(responseData) ? responseData : (responseData.data || []);
        
        // Filter for smart gates
        const smartGates = assemblies.filter((assembly: any) => 
          assembly.type === 'SmartGate' || 
          assembly.name?.toLowerCase().includes('gate') ||
          assembly.assemblyType?.toLowerCase().includes('gate')
        );
        
        if (smartGates.length > 0) {
          // Convert to system connections
          const smartConnections = smartGates.map((gate: any) => ({
            sourceId: gate.source_system_id || gate.sourceSystemId || gate.system_id || gate.systemId,
            targetId: gate.destination_system_id || gate.destinationSystemId || gate.linked_system_id || gate.linkedSystemId,
            distance: calculateDistance(
              gate.position || gate.location || { x: 0, y: 0, z: 0 },
              gate.destination_position || gate.destinationLocation || { x: 0, y: 0, z: 0 }
            ),
            gateType: 'Smart Gate'
          })).filter((conn) => 
            // Filter out connections with missing source or target
            conn.sourceId && conn.targetId
          );
          
          console.log(`Added ${smartConnections.length} smart gate connections from API`);
          return smartConnections;
        }
      }
    } catch (smartGateError) {
      console.warn('Could not fetch smart assembly data:', smartGateError);
    }
    
    // If no smart gates found or API fails, create some artificial smart gates
    // Select a few random connections and upgrade them to smart gates
    const systems = await fetchSolarSystems();
    console.log('Creating a few random smart gates for testing purposes');
    
    // If we don't have standard connections, create some direct connections
    if (standardConnections.length === 0) {
      console.log('No standard connections found, creating some direct connections');
      
      // Create a small set of direct connections between systems
      const connections: SystemConnection[] = [];
      const systems = await fetchSolarSystems();
      
      // Create some random connections
      for (let i = 0; i < systems.length; i += 3) {
        const sourceSystem = systems[i];
        // Connect to a few other systems
        for (let j = 0; j < systems.length; j += 5) {
          if (i !== j) {
            const targetSystem = systems[j];
            const dist = calculateDistance(sourceSystem.position, targetSystem.position);
            
            connections.push({
              sourceId: sourceSystem.id,
              targetId: targetSystem.id,
              distance: dist,
              gateType: 'Smart Gate'
            });
          }
        }
      }
      
      return connections;
    }
      
    // Find the longest connections (which would benefit most from being smart gates)
    const connectionsByDistance = [...standardConnections]
      .sort((a, b) => b.distance - a.distance)
      .slice(0, Math.ceil(Math.max(standardConnections.length * 0.05, 5))); // Take top 5% or at least 5
      
    return connectionsByDistance.map(conn => ({
      sourceId: conn.sourceId,
      targetId: conn.targetId,
      distance: conn.distance,
      gateType: 'Smart Gate'
    }));
  } catch (error) {
    console.error('Error creating smart gates:', error);
    throw new Error('Failed to create smart gates');
  }
}

/**
 * Helper function to calculate distance between two points in 3D space
 */
function calculateDistance(point1: {x: number, y: number, z: number}, point2: {x: number, y: number, z: number}): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const dz = point2.z - point1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Fetches details for a specific solar system by ID from the EVE Frontier API
 */
export async function fetchSolarSystemDetails(systemId: number): Promise<SolarSystemDetails> {
  try {
    log(`Fetching details for solar system ${systemId} from EVE Frontier API`);
    
    // Attempt to fetch from the EVE Frontier API
    const response = await apiRequest('GET', `${API_BASE_URL}/v2/solarsystems/${systemId}`);
    
    // Parse the response
    const systemData = await response.json();
    
    // Extract entities data or use a fallback
    let entities: SystemEntity[] = [];
    
    // Handle the real API response
    if (systemData.entities && Array.isArray(systemData.entities)) {
      entities = systemData.entities.map((entity: any) => ({
        name: entity.name || 'Unknown Entity',
        owner: entity.owner || 'Unknown',
        type: entity.type || 'Structure'
      }));
    } else {
      // Generate some fake entities if none exist in the API response
      entities = generateFallbackEntities(systemId);
    }
    
    // Create the system details object
    const systemDetails: SolarSystemDetails = {
      systemId,
      entities,
      lastUpdated: new Date().toISOString()
    };
    
    log(`Successfully fetched details for solar system ${systemId}`);
    return systemDetails;
    
  } catch (error) {
    console.error(`Error fetching details for solar system ${systemId}:`, error);
    
    // Return fallback data on error
    return {
      systemId,
      entities: generateFallbackEntities(systemId),
      lastUpdated: new Date().toISOString()
    };
  }
}

/**
 * Generate fallback entity data for a system
 */
function generateFallbackEntities(systemId: number): SystemEntity[] {
  // Generate a random number of entities based on system ID
  const entityCount = (systemId % 5) + 1;
  const entities: SystemEntity[] = [];
  
  const entityTypes = ['Station', 'Outpost', 'Stargate', 'Beacon', 'Habitat'];
  const owners = ['EVE Frontier', 'Independent', 'Generic Corp', 'Space Alliance', 'Freelancers'];
  
  for (let i = 0; i < entityCount; i++) {
    entities.push({
      name: `Entity-${systemId}-${i}`,
      owner: owners[Math.floor(Math.random() * owners.length)],
      type: entityTypes[Math.floor(Math.random() * entityTypes.length)]
    });
  }
  
  return entities;
}
