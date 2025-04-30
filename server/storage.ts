import { 
  users, type User, type InsertUser,
  type SolarSystem, type RiskData, type SystemConnection, 
  type RouteResponse
} from "@shared/schema";

// modify the interface with any CRUD methods
// you might need
export interface IStorage {
  // User management (from original schema)
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Solar systems
  getAllSystems(): Promise<SolarSystem[]>;
  getSystemById(id: number): Promise<SolarSystem | undefined>;
  searchSystems(query: string): Promise<SolarSystem[]>;
  
  // System connections (gates)
  getSystemConnections(): Promise<SystemConnection[]>;
  getConnectionsForSystem(systemId: number): Promise<SystemConnection[]>;
  
  // Risk data
  getAllRiskData(): Promise<RiskData[]>;
  getRiskDataForSystem(systemId: number): Promise<RiskData | undefined>;
  updateRiskData(riskData: RiskData): Promise<RiskData>;
  
  // Routes
  saveRecentRoute(route: RouteResponse): Promise<void>;
  getRecentRoutes(limit: number): Promise<RouteResponse[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private systems: Map<number, SolarSystem>;
  private connections: SystemConnection[];
  private riskData: Map<number, RiskData>;
  private recentRoutes: RouteResponse[];
  currentId: number;

  constructor() {
    this.users = new Map();
    this.systems = new Map();
    this.connections = [];
    this.riskData = new Map();
    this.recentRoutes = [];
    this.currentId = 1;
  }

  // User methods (from original storage)
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Solar Systems methods
  async getAllSystems(): Promise<SolarSystem[]> {
    return Array.from(this.systems.values());
  }

  async getSystemById(id: number): Promise<SolarSystem | undefined> {
    return this.systems.get(id);
  }

  async searchSystems(query: string): Promise<SolarSystem[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.systems.values()).filter(system => 
      system.name.toLowerCase().includes(lowercaseQuery)
    );
  }

  async setSystems(systems: SolarSystem[]): Promise<void> {
    this.systems.clear();
    systems.forEach(system => {
      this.systems.set(system.id, system);
    });
  }

  // System connections methods
  async getSystemConnections(): Promise<SystemConnection[]> {
    return this.connections;
  }

  async getConnectionsForSystem(systemId: number): Promise<SystemConnection[]> {
    return this.connections.filter(
      conn => conn.sourceId === systemId || conn.targetId === systemId
    );
  }

  async setConnections(connections: SystemConnection[]): Promise<void> {
    this.connections = connections;
  }

  // Risk data methods
  async getAllRiskData(): Promise<RiskData[]> {
    return Array.from(this.riskData.values());
  }

  async getRiskDataForSystem(systemId: number): Promise<RiskData | undefined> {
    return this.riskData.get(systemId);
  }

  async updateRiskData(riskData: RiskData): Promise<RiskData> {
    this.riskData.set(riskData.systemId, riskData);
    return riskData;
  }

  async setRiskData(riskDataArray: RiskData[]): Promise<void> {
    this.riskData.clear();
    riskDataArray.forEach(data => {
      this.riskData.set(data.systemId, data);
    });
  }

  // Route methods
  async saveRecentRoute(route: RouteResponse): Promise<void> {
    this.recentRoutes.unshift(route);
    
    // Keep only the most recent 10 routes
    if (this.recentRoutes.length > 10) {
      this.recentRoutes = this.recentRoutes.slice(0, 10);
    }
  }

  async getRecentRoutes(limit: number): Promise<RouteResponse[]> {
    return this.recentRoutes.slice(0, limit);
  }
}

export const storage = new MemStorage();
