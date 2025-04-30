import { apiRequest } from "./queryClient";
import type { 
  SolarSystem, 
  SystemConnection, 
  RiskData, 
  RouteRequest,
  RouteResponse
} from "@shared/schema";

// Fetch all solar systems
export async function fetchSolarSystems() {
  const response = await apiRequest("GET", "/api/systems");
  return await response.json() as SolarSystem[];
}

// Search for solar systems by name
export async function searchSolarSystems(query: string) {
  const response = await apiRequest("GET", `/api/systems/search?query=${encodeURIComponent(query)}`);
  return await response.json() as SolarSystem[];
}

// Fetch all system connections (gates)
export async function fetchSystemConnections() {
  const response = await apiRequest("GET", "/api/connections");
  return await response.json() as SystemConnection[];
}

// Fetch risk data for all systems
export async function fetchRiskData() {
  const response = await apiRequest("GET", "/api/risk");
  return await response.json() as RiskData[];
}

// Calculate an optimal route
export async function calculateRoute(routeRequest: RouteRequest) {
  const response = await apiRequest("POST", "/api/route", routeRequest);
  return await response.json() as RouteResponse;
}

// Get data status information
export async function getDataStatus() {
  const response = await apiRequest("GET", "/api/data-status");
  return await response.json() as {
    lastUpdate: string;
    cacheFreshness: string;
    isStale: boolean;
  };
}

// Refresh data cache
export async function refreshData() {
  const response = await apiRequest("POST", "/api/refresh-data");
  return await response.json();
}

// Get recent routes
export async function getRecentRoutes(limit: number = 5) {
  const response = await apiRequest("GET", `/api/recent-routes?limit=${limit}`);
  return await response.json() as RouteResponse[];
}

// Get API health
export async function getApiHealth() {
  try {
    const response = await apiRequest("GET", "/api/health");
    const data = await response.json();
    return { status: "online", ...data };
  } catch (error) {
    return { status: "offline", error: String(error) };
  }
}
