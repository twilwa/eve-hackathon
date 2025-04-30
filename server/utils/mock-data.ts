import { SolarSystem, SystemConnection, RiskData } from "@shared/schema";

// Generate a mock solar system
function generateMockSystem(id: number): SolarSystem {
  const systemNames = [
    "Jita", "Amarr", "Dodixie", "Rens", "Hek",
    "New Caldari", "Alikara", "Urlen", "Osmon", "Obe",
    "Tash-Murkon", "Penirgman", "Orvolle", "Ryddinjorn", "Frarn",
    "Evati", "Alentene", "Sobaseki", "Iyen-Oursta", "Akiainavas",
    "Aldrat", "Sakht", "Ned", "Hatakani", "Agil"
  ];

  const x = Math.random() * 1000 - 500;
  const y = Math.random() * 1000 - 500;
  const z = Math.random() * 100 - 50;

  return {
    id,
    name: systemNames[id % systemNames.length],
    position: { x, y, z },
    securityStatus: Number(Math.random().toFixed(1)),
    connections: [] // Will be filled later
  };
}

// Generate a set of mock solar systems
export function generateMockSystems(count: number = 50): SolarSystem[] {
  const systems: SolarSystem[] = [];
  
  for (let i = 1; i <= count; i++) {
    systems.push(generateMockSystem(i));
  }
  
  // Add connections after all systems are created
  systems.forEach(system => {
    // Each system connects to 1-4 others
    const connectionCount = Math.floor(Math.random() * 4) + 1;
    
    for (let i = 0; i < connectionCount; i++) {
      // Don't connect to self
      let targetId;
      do {
        targetId = Math.floor(Math.random() * count) + 1;
      } while (targetId === system.id || system.connections.includes(targetId));
      
      system.connections.push(targetId);
    }
  });
  
  return systems;
}

// Generate system connections
export function generateMockConnections(systems: SolarSystem[]): SystemConnection[] {
  const connections: SystemConnection[] = [];
  
  systems.forEach(system => {
    system.connections.forEach(targetId => {
      const targetSystem = systems.find(s => s.id === targetId);
      
      if (targetSystem) {
        const distance = calculateDistance(system.position, targetSystem.position);
        
        connections.push({
          sourceId: system.id,
          targetId: targetId,
          distance: distance,
          gateType: Math.random() > 0.9 ? 'Smart Gate' : 'Standard'
        });
      }
    });
  });
  
  return connections;
}

// Generate risk data for systems
export function generateMockRiskData(systems: SolarSystem[]): RiskData[] {
  return systems.map(system => {
    // Random risk score between 0.05 and 1
    const riskScore = Math.max(0.05, Math.random());
    const killCount = Math.floor(riskScore * 20); // Higher risk = more kills
    
    return {
      systemId: system.id,
      riskScore,
      killCount,
      lastUpdated: new Date().toISOString()
    };
  });
}

// Helper function to calculate distance between points
function calculateDistance(
  point1: {x: number, y: number, z: number}, 
  point2: {x: number, y: number, z: number}
): number {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  const dz = point2.z - point1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}