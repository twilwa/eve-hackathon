import { QueryClient, type QueryFunction } from "@tanstack/react-query";

// Add API base URL to ensure consistent server connection
const API_BASE_URL = "http://localhost:5001";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Ensure the URL is properly prefixed with API base URL if it starts with /api
  const fullUrl = url.startsWith('/api') ? `${API_BASE_URL}${url}` : url;
  
  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// Function to convert query key array to URL with parameters
function buildUrlFromQueryKey(queryKey: unknown[]): string {
  // First item in the array is expected to be the base URL
  let url = typeof queryKey[0] === 'string' ? queryKey[0] : '';
  
  // Ensure the URL is properly prefixed with API base URL if it starts with /api
  if (url.startsWith('/api')) {
    url = `${API_BASE_URL}${url}`;
  }
  
  // Check if there are additional parameters in the second item
  if (queryKey.length > 1) {
    const params = queryKey[1];
    
    // If the second item is an object, treat it as URL parameters
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      const searchParams = new URLSearchParams();
      
      // Add each key-value pair to the URLSearchParams
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      
      // If we have parameters, append them to the URL
      const searchString = searchParams.toString();
      if (searchString) {
        url += (url.includes('?') ? '&' : '?') + searchString;
      }
    }
    // If the second item is a string or number, append it as a path parameter
    else if (typeof params === 'string' || typeof params === 'number') {
      url += `/${params}`;
    }
  }
  
  return url;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Build URL with parameters from query key
    const url = buildUrlFromQueryKey(queryKey);
    
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Number.POSITIVE_INFINITY,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
