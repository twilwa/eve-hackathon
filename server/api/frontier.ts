import { apiRequest } from '../utils/request';
import type { SolarSystem, SystemConnection, RiskData } from '@shared/schema';
import { 
  generateMockSystems, 
  generateMockConnections, 
  generateMockRiskData 
} from '../utils/mock-data';

const API_BASE_URL = process.env.EVE_FRONTIER_API_URL || 'https://world-api-nova.live.tech.evefrontier.com';
const API_KEY = process.env.EVE_FRONTIER_API_KEY || '';

// Cache mock data
let mockSystems: SolarSystem[] | null = null;

/**
 * Fetches all solar systems from EVE Frontier API
 * Using mock data for development purposes
 */
export async function fetchSolarSystems(): Promise<SolarSystem[]> {
  try {
    // Check if we're in development mode or need to use mock data
    if (process.env.NODE_ENV === 'development' || !API_KEY) {
      if (!mockSystems) {
        mockSystems = generateMockSystems(50);
      }
      return mockSystems;
    }
    
    // Try to fetch from real API if in production
    const response = await apiRequest('GET', `${API_BASE_URL}/solar-systems`);
    const data = await response.json();

    // Map the API response to our schema
    return data.map((system: any) => ({
      id: system.id,
      name: system.name,
      position: {
        x: system.position?.x || 0,
        y: system.position?.y || 0,
        z: system.position?.z || 0,
      },
      securityStatus: system.security_status || 0,
      connections: system.stargates || []
    }));
  } catch (error) {
    console.error('Error fetching solar systems:', error);
    
    // Use mock data as fallback
    if (!mockSystems) {
      mockSystems = generateMockSystems(50);
    }
    return mockSystems;
  }
}

/**
 * Fetches system connections (gates) from EVE Frontier API
 * Using mock data for development purposes
 */
export async function fetchSystemConnections(): Promise<SystemConnection[]> {
  try {
    // Check if we're in development mode or need to use mock data
    if (process.env.NODE_ENV === 'development' || !API_KEY) {
      const systems = await fetchSolarSystems();
      return generateMockConnections(systems);
    }
    
    // If in production or we have a real API key, use the real logic
    const systems = await fetchSolarSystems();
    const connections: SystemConnection[] = [];

    // Create connections based on system connectivity
    systems.forEach(system => {
      if (system.connections) {
        system.connections.forEach(targetId => {
          const targetSystem = systems.find(s => s.id === targetId);
          if (targetSystem) {
            // Calculate distance between systems based on their positions
            const distance = calculateDistance(system.position, targetSystem.position);
            
            // Create a connection
            connections.push({
              sourceId: system.id,
              targetId: targetId,
              distance: distance,
              gateType: 'Standard' // Default gate type
            });
          }
        });
      }
    });

    return connections;
  } catch (error) {
    console.error('Error generating system connections:', error);
    
    // Use mock connections as fallback
    const systems = await fetchSolarSystems();
    return generateMockConnections(systems);
  }
}

/**
 * Fetches killmail data and calculates risk levels
 * Using mock data for development purposes
 */
export async function fetchKillmailData(): Promise<RiskData[]> {
  try {
    // Check if we're in development mode or need to use mock data
    if (process.env.NODE_ENV === 'development' || !API_KEY) {
      const systems = await fetchSolarSystems();
      return generateMockRiskData(systems);
    }
    
    // If in production or we have a real API key, use the real logic
    const response = await apiRequest('GET', `${API_BASE_URL}/killmails`);
    const data = await response.json() as any[];
    
    // Process killmails to calculate risk scores by system
    const systemRiskMap = new Map<number, { kills: number, timestamp: string }>();
    
    // Aggregate killmail data by system
    data.forEach((killmail: any) => {
      const systemId = killmail.solar_system_id;
      const timestamp = killmail.killmail_time;
      
      if (!systemRiskMap.has(systemId)) {
        systemRiskMap.set(systemId, { kills: 0, timestamp });
      }
      
      const current = systemRiskMap.get(systemId)!;
      systemRiskMap.set(systemId, {
        kills: current.kills + 1,
        timestamp: timestamp > current.timestamp ? timestamp : current.timestamp
      });
    });
    
    // Convert map to array of RiskData objects
    const now = Date.now();
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    
    // Get all systems to ensure we have risk data for everything
    const systems = await fetchSolarSystems();
    
    return systems.map(system => {
      const riskInfo = systemRiskMap.get(system.id);
      
      if (!riskInfo) {
        // No kills, so lowest risk
        return {
          systemId: system.id,
          riskScore: 0.05, // Baseline risk
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
    console.error('Error fetching killmail data:', error);
    
    // Fallback: generate mock risk data
    const systems = await fetchSolarSystems();
    return generateMockRiskData(systems);
  }
}

/**
 * Fetch Smart Assembly data to identify custom gates
 * Using mock data for development purposes
 */
export async function fetchSmartGates(): Promise<SystemConnection[]> {
  try {
    // Check if we're in development mode or need to use mock data
    if (process.env.NODE_ENV === 'development' || !API_KEY) {
      // For mock data, just generate a few Smart Gates (5% of connections)
      const systems = await fetchSolarSystems();
      const allConnections = generateMockConnections(systems);
      
      // Convert a random subset to Smart Gates
      return allConnections
        .filter(() => Math.random() < 0.05) // 5% of connections are smart gates
        .map(conn => ({
          ...conn,
          gateType: 'Smart Gate'
        }));
    }
    
    // If in production with API key, use real API
    const response = await apiRequest('GET', `${API_BASE_URL}/smart-assemblies`);
    const assemblies = await response.json() as any[];
    
    // Filter for smart gates
    const smartGates = assemblies.filter((assembly: any) => 
      assembly.type === 'SmartGate' || assembly.name?.toLowerCase().includes('gate')
    );
    
    // Convert to system connections
    return smartGates.map((gate: any) => ({
      sourceId: gate.source_system_id || gate.system_id,
      targetId: gate.destination_system_id || gate.linked_system_id,
      distance: calculateDistance(
        gate.position || { x: 0, y: 0, z: 0 },
        gate.destination_position || { x: 0, y: 0, z: 0 }
      ),
      gateType: 'Smart Gate'
    })).filter((conn: SystemConnection) => 
      // Filter out connections with missing source or target
      conn.sourceId && conn.targetId
    );
  } catch (error) {
    console.error('Error fetching smart gates:', error);
    
    // Generate a few random smart gates as fallback
    const systems = await fetchSolarSystems();
    const allConnections = generateMockConnections(systems);
    
    return allConnections
      .filter(() => Math.random() < 0.05)
      .map(conn => ({
        ...conn,
        gateType: 'Smart Gate'
      }));
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
