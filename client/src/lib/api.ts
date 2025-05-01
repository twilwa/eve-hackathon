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
  JobComplete,
  SolarSystemDetails
} from "@shared/schema";

/**
 * Fetch solar systems from the API
 */
export async function fetchSolarSystems(): Promise<SolarSystem[]> {
  try {
    const res = await apiRequest('GET', '/api/systems');
    return await res.json();
  } catch (error) {
    console.error('Error fetching solar systems:', error);
    throw new Error(`Failed to fetch solar systems: ${error}`);
  }
}

/**
 * Fetch system connections from the API
 */
export async function fetchSystemConnections(): Promise<SystemConnection[]> {
  try {
    const res = await apiRequest('GET', '/api/connections');
    return await res.json();
  } catch (error) {
    console.error('Error fetching system connections:', error);
    throw new Error(`Failed to fetch system connections: ${error}`);
  }
}

/**
 * Fetch risk data from the API
 */
export async function fetchRiskData(): Promise<RiskData[]> {
  try {
    const res = await apiRequest('GET', '/api/risk');
    return await res.json();
  } catch (error) {
    console.error('Error fetching risk data:', error);
    throw new Error(`Failed to fetch risk data: ${error}`);
  }
}

/**
 * Search for solar systems by name
 */
export async function searchSolarSystems(searchTerm: string): Promise<SolarSystem[]> {
  try {
    if (!searchTerm || searchTerm.length < 2) return [];
    const res = await apiRequest('GET', `/api/systems/search?query=${encodeURIComponent(searchTerm)}`);
    return await res.json();
  } catch (error) {
    console.error('Error searching solar systems:', error);
    throw new Error(`Failed to search solar systems: ${error}`);
  }
}

/**
 * Calculate a route between two solar systems
 */
export async function calculateRoute(params: {
  startSystemId: number;
  endSystemId: number;
  riskAversion: number;
}): Promise<RouteResponse> {
  try {
    const res = await apiRequest('POST', '/api/route', params);
    return await res.json();
  } catch (error) {
    console.error('Error calculating route:', error);
    throw new Error(`Failed to calculate route: ${error}`);
  }
}

/**
 * Fetch all scout jobs
 */
export async function fetchJobs(): Promise<Job[]> {
  try {
    const res = await apiRequest('GET', '/api/jobs');
    return await res.json();
  } catch (error) {
    console.error('Error fetching jobs:', error);
    throw new Error(`Failed to fetch jobs: ${error}`);
  }
}

/**
 * Create a new scout job
 */
export async function createJob(job: Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Job> {
  try {
    const res = await apiRequest('POST', '/api/jobs', job);
    return await res.json();
  } catch (error) {
    console.error('Error creating job:', error);
    throw new Error(`Failed to create job: ${error}`);
  }
}

/**
 * Accept a scout job
 */
export async function acceptJob(jobId: number): Promise<Job> {
  try {
    const res = await apiRequest('PUT', `/api/jobs/${jobId}/accept`);
    return await res.json();
  } catch (error) {
    console.error('Error accepting job:', error);
    throw new Error(`Failed to accept job: ${error}`);
  }
}

/**
 * Complete a scout job with simple route data (legacy)
 */
export async function completeScoutJob(jobId: number, routeData: unknown): Promise<Job> {
  try {
    const res = await apiRequest('PUT', `/api/jobs/${jobId}/complete`, { routeData });
    return await res.json();
  } catch (error) {
    console.error('Error completing job:', error);
    throw new Error(`Failed to complete job: ${error}`);
  }
}

/**
 * Fetch health status of the server
 */
export async function checkHealth(): Promise<{ status: string; timestamp: string }> {
  try {
    const res = await apiRequest('GET', '/api/health');
    return await res.json();
  } catch (error) {
    console.error('Error checking health:', error);
    throw new Error(`Failed to check health: ${error}`);
  }
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
export async function getRecentRoutes(limit = 5) {
  const response = await apiRequest("GET", `/api/recent-routes?limit=${limit}`);
  return await response.json() as RouteResponse[];
}

// Jobs API

// Get all jobs with optional filtering
export async function getJobs(status?: string, page = 1, limit = 10) {
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

/**
 * Fetch details for a specific solar system by ID
 */
export async function fetchSolarSystemDetails(systemId: number): Promise<SolarSystemDetails> {
  try {
    const res = await apiRequest('GET', `/api/systems/${systemId}/details`);
    return await res.json();
  } catch (error) {
    console.error(`Error fetching details for system ${systemId}:`, error);
    throw new Error(`Failed to fetch system details: ${error}`);
  }
}
