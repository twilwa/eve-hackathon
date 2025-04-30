import { apiRequest } from "./queryClient";
import type { 
  SolarSystem, 
  SystemConnection, 
  RiskData, 
  RouteRequest,
  RouteResponse,
  Job,
  JobInsert,
  JobClaim,
  JobComplete
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

// Jobs API

// Get all jobs with optional filtering
export async function getJobs(status?: string, page: number = 1, limit: number = 10) {
  let url = `/api/jobs?page=${page}&limit=${limit}`;
  if (status) {
    url += `&status=${status}`;
  }
  const response = await apiRequest("GET", url);
  return await response.json() as {
    data: Job[];
    pagination: {
      page: number;
      limit: number;
      totalItems: number;
      totalPages: number;
    }
  };
}

// Get a specific job by ID
export async function getJob(id: number) {
  const response = await apiRequest("GET", `/api/jobs/${id}`);
  return await response.json() as Job;
}

// Create a new job
export async function createJob(jobData: JobInsert) {
  const response = await apiRequest("POST", "/api/jobs", jobData);
  return await response.json() as Job;
}

// Claim a job
export async function claimJob(id: number, claimData: JobClaim) {
  const response = await apiRequest("PUT", `/api/jobs/${id}/claim`, claimData);
  return await response.json() as Job;
}

// Complete a job
export async function completeJob(id: number, completeData: JobComplete, scoutPubKey: string) {
  const headers = { 'X-Scout-PubKey': scoutPubKey };
  const response = await fetch(`/api/jobs/${id}/complete`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Scout-PubKey': scoutPubKey
    },
    body: JSON.stringify(completeData),
    credentials: 'include',
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text || response.statusText}`);
  }
  
  return await response.json() as Job;
}
