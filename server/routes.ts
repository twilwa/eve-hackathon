import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { storage } from "./storage";
import { ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import {
	systemSearchSchema,
	routeRequestSchema,
	type SolarSystem,
	type SystemConnection,
	type RiskData,
} from "@shared/schema";
import {
	fetchSolarSystems,
	fetchSystemConnections,
	fetchKillmailData,
	fetchSmartGates,
} from "./api/frontier";
import { findOptimalRoute } from "./algorithms/pathfinding";
import NodeCache from "node-cache";
import jobsRouter from "./api/jobs";
import { riskUpdateService } from "./services/risk-update-service";
import { systemDetailsService } from "./services/system-details-service";

// Cache for storing data with TTL
const cache = new NodeCache({
	stdTTL: 600, // 10 minute TTL for cached data
	checkperiod: 120, // Check for expired keys every 2 minutes
});

// Initialize data function to load data from EVE Frontier API
const initializeData = async (): Promise<void> => {
	try {
		// Check if data is already cached
		if (
			!cache.has("systems") ||
			!cache.has("connections") ||
			!cache.has("riskData")
		) {
			console.log("Initializing data from EVE Frontier API...");

			// Fetch all required data
			const systems = await fetchSolarSystems();
			const standardConnections = await fetchSystemConnections();
			const smartGates = await fetchSmartGates();
			const riskData = await fetchKillmailData();

			// Combine standard connections with smart gates
			const allConnections = [...standardConnections, ...smartGates];

			// Store in cache
			cache.set("systems", systems);
			cache.set("connections", allConnections);
			cache.set("riskData", riskData);
			cache.set("lastUpdate", new Date().toISOString());

			console.log(
				`Initialized ${systems.length} systems, ${allConnections.length} connections, and risk data`,
			);
		}
	} catch (error) {
		console.error("Error initializing data:", error);
		throw error;
	}
};

export async function registerRoutes(app: Express): Promise<Server> {
	const httpServer = createServer(app);

	// Register Jobs API router
	app.use("/api/jobs", jobsRouter);

	// Health check endpoint
	app.get("/api/health", (req: Request, res: Response) => {
		res.json({ status: "online", timestamp: new Date().toISOString() });
	});

	// Endpoint to get all solar systems
	app.get("/api/systems", async (req: Request, res: Response) => {
		try {
			await initializeData();
			const systems = cache.get("systems") as SolarSystem[];
			res.json(systems);
		} catch (error) {
			console.error("Error fetching systems:", error);
			res.status(500).json({ message: "Failed to fetch systems data" });
		}
	});

	// Endpoint to search for systems
	app.get("/api/systems/search", async (req: Request, res: Response) => {
		try {
			const { query } = req.query;

			try {
				const validated = systemSearchSchema.parse({ query });

				await initializeData();
				const systems = cache.get("systems") as SolarSystem[];

				// Simple search algorithm
				const searchResults = systems.filter((system) =>
					system.name.toLowerCase().includes(validated.query.toLowerCase()),
				);

				// Limit results to top 10
				res.json(searchResults.slice(0, 10));
			} catch (error) {
				if (error instanceof ZodError) {
					res.status(400).json({ message: fromZodError(error).message });
				} else {
					throw error;
				}
			}
		} catch (error) {
			console.error("Error searching systems:", error);
			res.status(500).json({ message: "Failed to search systems" });
		}
	});

	// Endpoint to get system connections
	app.get("/api/connections", async (req: Request, res: Response) => {
		try {
			await initializeData();
			const connections = cache.get("connections") as SystemConnection[];
			res.json(connections);
		} catch (error) {
			console.error("Error fetching connections:", error);
			res.status(500).json({ message: "Failed to fetch connection data" });
		}
	});

	// Endpoint to get risk data
	app.get("/api/risk", async (req: Request, res: Response) => {
		try {
			await initializeData();
			const riskData = cache.get("riskData") as RiskData[];
			res.json(riskData);
		} catch (error) {
			console.error("Error fetching risk data:", error);
			res.status(500).json({ message: "Failed to fetch risk data" });
		}
	});

	// Endpoint to calculate a route
	app.post("/api/route", async (req: Request, res: Response) => {
		try {
			const routeRequest = req.body;

			try {
				const validated = routeRequestSchema.parse(routeRequest);

				await initializeData();

				const systems = cache.get("systems") as SolarSystem[];
				const connections = cache.get("connections") as SystemConnection[];
				const riskData = cache.get("riskData") as RiskData[];

				// Calculate the optimal route
				const route = findOptimalRoute(
					validated.startSystemId,
					validated.endSystemId,
					validated.riskAversion,
					systems,
					connections,
					riskData,
				);

				// Store route in recent routes
				await storage.saveRecentRoute(route);

				res.json(route);
			} catch (error) {
				if (error instanceof ZodError) {
					res.status(400).json({ message: fromZodError(error).message });
				} else {
					throw error;
				}
			}
		} catch (error) {
			console.error("Error calculating route:", error);
			res.status(500).json({ message: "Failed to calculate route" });
		}
	});

	// Endpoint to get data freshness
	app.get("/api/data-status", (req: Request, res: Response) => {
		const lastUpdate = (cache.get("lastUpdate") as string) || null;

		res.json({
			lastUpdate,
			cacheFreshness: lastUpdate ? new Date(lastUpdate).toISOString() : null,
			isStale: lastUpdate
				? Date.now() - new Date(lastUpdate).getTime() > 3600000 // More than an hour old
				: true,
		});
	});

	// Refresh data endpoint
	app.post("/api/refresh-data", async (req: Request, res: Response) => {
		try {
			// Clear cache
			cache.del("systems");
			cache.del("connections");
			cache.del("riskData");
			
			// Re-fetch all data
			await initializeData();
			
			// Get freshly fetched risk data and broadcast update
			const riskData = cache.get("riskData") as RiskData[];
			
			// Send updates via WebSocket
			riskUpdateService.updateMultipleRiskData(riskData);
			
			res.json({
				success: true,
				message: "Data refreshed successfully",
				timestamp: new Date().toISOString(),
			});
		} catch (error) {
			console.error("Error refreshing data:", error);
			res.status(500).json({ message: "Failed to refresh data" });
		}
	});

	// Get recent routes
	app.get("/api/recent-routes", async (req: Request, res: Response) => {
		try {
			const limit = Number.parseInt(req.query.limit as string) || 5;
			const recentRoutes = await storage.getRecentRoutes(limit);
			res.json(recentRoutes);
		} catch (error) {
			console.error("Error fetching recent routes:", error);
			res.status(500).json({ message: "Failed to fetch recent routes" });
		}
	});

	// Endpoint to get details for a specific solar system
	app.get("/api/systems/:id/details", async (req: Request, res: Response) => {
		try {
			const systemId = Number.parseInt(req.params.id);
			
			if (isNaN(systemId)) {
				return res.status(400).json({ message: "Invalid system ID" });
			}
			
			const systemDetails = await systemDetailsService.getSystemDetails(systemId);
			
			if (!systemDetails) {
				return res.status(404).json({ message: "System details not found" });
			}
			
			res.json(systemDetails);
		} catch (error) {
			console.error("Error fetching system details:", error);
			res.status(500).json({ message: "Failed to fetch system details" });
		}
	});

	return httpServer;
}
