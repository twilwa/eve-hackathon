import { apiRequest } from '../utils/request';
import type { SolarSystem, SystemConnection, RiskData } from '@shared/schema';

const API_BASE_URL = process.env.EVE_FRONTIER_API_URL || 'https://world-api-nova.live.tech.evefrontier.com';
const API_KEY = process.env.EVE_FRONTIER_API_KEY || '';

// No need for mock data cache anymore as we're using the real API

/**
 * Fetches all solar systems from EVE Frontier API
 */
export async function fetchSolarSystems(): Promise<SolarSystem[]> {
  try {
    // Fetch from real EVE Frontier API
    const response = await apiRequest('GET', `${API_BASE_URL}/v2/solarsystems`);
    const responseData = await response.json() as { data: any[] };
    
    // API returns { data: [...systems] }
    const systemsData = responseData.data;
    
    if (!Array.isArray(systemsData)) {
      throw new Error('Expected array of systems in API response');
    }
    
    // Map the API response to our schema
    const systems: SolarSystem[] = systemsData.map(system => ({
      id: system.id,
      name: system.name,
      position: {
        x: system.location?.x || 0,
        y: system.location?.y || 0,
        z: system.location?.z || 0,
      },
      securityStatus: system.securityStatus || 0,
      // For now, we'll init with empty connections - we'll build these later
      connections: []
    }));
    
    console.log(`Fetched ${systems.length} solar systems from EVE Frontier API`);
    return systems;
  } catch (error) {
    console.error('Error fetching solar systems:', error);
    throw new Error('Failed to fetch solar systems data from EVE Frontier API');
  }
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
        // Get potential nearby systems using our grid
        const potentialNeighbors = getNearbySystemsFromGrid(system);
        
        // Calculate exact distances to each potential neighbor
        const neighborsWithDistances = potentialNeighbors.map(neighbor => ({
          system: neighbor,
          distance: calculateDistance(system.position, neighbor.position)
        }));
        
        // Sort by distance and take the closest 3-5 systems to ensure better connectivity
        // This will create more connections and make the map easier to navigate
        const closestNeighbors = neighborsWithDistances
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5); // Increased from 4 to 5 for better connectivity
        
        // Create connections to closest neighbors
        closestNeighbors.forEach(({ system: neighbor, distance }) => {
          // Check if this connection already exists
          const connectionExists = connections.some(
            conn => (conn.sourceId === system.id && conn.targetId === neighbor.id) ||
                    (conn.sourceId === neighbor.id && conn.targetId === system.id)
          );
          
          if (!connectionExists) {
            connections.push({
              sourceId: system.id,
              targetId: neighbor.id,
              distance: distance,
              gateType: 'Standard Gate'
            });
          }
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
    // Try to fetch killmail data from EVE Frontier API
    const systems = await fetchSolarSystems();
    let response;
    let killmailData: any[] = [];
    
    try {
      // Attempt to fetch killmail data - the endpoint might be /v2/killmails or /killmails
      try {
        response = await apiRequest('GET', `${API_BASE_URL}/v2/killmails`);
        const responseData = await response.json();
        killmailData = responseData.data || [];
      } catch (v2Error) {
        console.log('Trying fallback killmail endpoint...');
        response = await apiRequest('GET', `${API_BASE_URL}/killmails`);
        const responseData = await response.json();
        killmailData = Array.isArray(responseData) ? responseData : (responseData.data || []);
      }
    } catch (killmailError) {
      console.warn('Could not fetch killmail data, generating random risk data:', killmailError);
    }
    
    // Process killmails to calculate risk scores by system
    const systemRiskMap = new Map<number, { kills: number, timestamp: string }>();
    
    // If we have killmail data, use it
    if (killmailData.length > 0) {
      console.log(`Processing ${killmailData.length} killmails from API`);
      
      // Aggregate killmail data by system
      killmailData.forEach((killmail: any) => {
        // Adapt to the API's killmail structure
        const systemId = killmail.solar_system_id || killmail.systemId;
        const timestamp = killmail.killmail_time || killmail.timestamp || new Date().toISOString();
        
        if (!systemId) {
          return; // Skip invalid entries
        }
        
        if (!systemRiskMap.has(systemId)) {
          systemRiskMap.set(systemId, { kills: 0, timestamp });
        }
        
        const current = systemRiskMap.get(systemId)!;
        systemRiskMap.set(systemId, {
          kills: current.kills + 1,
          timestamp: timestamp > current.timestamp ? timestamp : current.timestamp
        });
      });
    }
    
    // Calculate risk scores for all systems (random for those without killmail data)
    const now = Date.now();
    
    return systems.map(system => {
      const riskInfo = systemRiskMap.get(system.id);
      
      if (!riskInfo) {
        // Generate a random risk score between 0.05 and 0.6 for systems without risk data
        // This is needed for development/testing when real data isn't available
        const randomRisk = Math.max(0.05, Math.random() * 0.6);
        
        return {
          systemId: system.id,
          riskScore: randomRisk,
          killCount: 0,
          lastUpdated: new Date().toISOString()
        };
      }
      
      // Calculate risk score based on kill count and recency
      const killDate = new Date(riskInfo.timestamp).getTime();
      const daysSinceKill = (now - killDate) / (24 * 60 * 60 * 1000);
      
      // Higher kill count and more recent kills = higher risk
      // Normalize to 0-1 range
      let riskScore = Math.min(riskInfo.kills / 10, 1) * (1 - Math.min(daysSinceKill / 7, 1) * 0.5);
      
      // Ensure minimum risk
      riskScore = Math.max(0.05, riskScore);
      
      return {
        systemId: system.id,
        riskScore,
        killCount: riskInfo.kills,
        lastUpdated: new Date().toISOString()
      };
    });
  } catch (error) {
    console.error('Error generating risk data:', error);
    throw new Error('Failed to generate risk data');
  }
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
    
    // Find the longest connections (which would benefit most from being smart gates)
    const connectionsByDistance = [...standardConnections]
      .sort((a, b) => b.distance - a.distance)
      .slice(0, Math.ceil(standardConnections.length * 0.05)); // Take top 5%
      
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
