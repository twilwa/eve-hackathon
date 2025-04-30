import fetch, { Response } from 'node-fetch';

/**
 * Make an API request with error handling
 */
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...(data ? { 'Content-Type': 'application/json' } : {}),
        'Accept': 'application/json',
        'User-Agent': 'EVE-Frontier-Route-Planner/1.0'
      },
      body: data ? JSON.stringify(data) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`API request failed: ${response.status} ${errorText}`);
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return response;
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}
