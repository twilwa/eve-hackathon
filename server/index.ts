import express, { type Request, type Response, type NextFunction } from "express";
import * as http from "node:http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import type * as net from "node:net";
import { initializeDatabase } from "./db";
import { jobExpiryService } from "./services/job-expiry";
import { WebSocketService, setWebSocketService } from "./services/websocket";
import { riskUpdateService } from "./services/risk-update-service";
import { jobNotificationService } from "./services/job-notification-service";
import { systemDetailsService } from "./services/system-details-service";
import cors from "cors";

// Define the error type
interface ServerError extends Error {
	status?: number;
	statusCode?: number;
}

const app = express();

// CORS configuration
const corsOptions = {
	origin: process.env.ALLOWED_ORIGINS ? 
		process.env.ALLOWED_ORIGINS.split(',') : 
		['http://localhost:5173'],
	methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization'],
	credentials: true,
	maxAge: 86400 // 24 hours
};

// Apply CORS middleware before other middleware
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware
app.use((req, res, next) => {
	const start = Date.now();
	const path = req.path;
	let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

	const originalResJson = res.json;
	res.json = (bodyJson, ...args) => {
		capturedJsonResponse = bodyJson;
		return originalResJson.apply(res, [bodyJson, ...args]);
	};

	res.on("finish", () => {
		const duration = Date.now() - start;
		if (path.startsWith("/api")) {
			let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
			if (capturedJsonResponse) {
				logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
			}

			if (logLine.length > 80) {
				logLine = `${logLine.slice(0, 79)}…`;
			}

			log(logLine);
		}
	});

	next();
});

(async () => {
	// Initialize database before registering routes
	try {
		await initializeDatabase();
		log("Database initialized successfully");
	} catch (error) {
		log("Database initialization failed:", String(error));
		process.exit(1);
	}

	await registerRoutes(app);

	// Start job expiry service
	jobExpiryService.startExpiryChecks();

	// Start system details service to fetch entity data
	systemDetailsService.startScheduledUpdates();

	app.use((err: ServerError, _req: Request, res: Response, _next: NextFunction) => {
		const status = err.status || err.statusCode || 500;
		const message = err.message || "Internal Server Error";
		log(`Error: ${status} - ${message}`);
		if (!res.headersSent) {
			res.status(status).json({ message });
		}
		if (app.get("env") === "development") {
			console.error(err.stack);
		}
	});

	const server = http.createServer(app);
	
	// Initialize WebSocket service with the HTTP server
	const wsService = new WebSocketService(server);
	// Make websocketService available from the imported module using the setter
	setWebSocketService(wsService);

	// The risk update service and job notification service don't need
	// explicit initialization as they are initialized when imported

	if (app.get("env") === "development") {
		await setupVite(app, server);
	} else {
		serveStatic(app);
	}

	// Start the server
	const PORT = process.env.PORT || 5001;

	async function startServer() {
		try {
			// Initialize database first
			await initializeDatabase();
			
			// Start the server
			const server = await registerRoutes(app);
			
			// Initialize the WebSocket service
			const wsService = new WebSocketService(server);
			setWebSocketService(wsService);
			
			// Start the job expiry service
			jobExpiryService.startExpiryChecks();
			
			// Start the system details service to fetch entity data
			systemDetailsService.startScheduledUpdates();
			
			// Start server
			server.listen(PORT, () => {
				log(`Server listening on port ${PORT}`);
			});
			
			return server;
		} catch (err) {
			console.error("Failed to start server:", err);
			process.exit(1);
		}
	}

	// Graceful shutdown
	const gracefulShutdown = async () => {
		log("Shutting down gracefully...");
		jobExpiryService.stop();
		
		// Also stop the WebSocket service on shutdown using dynamic import
		try {
			const websocketModule = await import("./services/websocket");
			if (websocketModule.websocketService) {
				websocketModule.websocketService.shutdown();
			}
		} catch (error) {
			console.error("Error shutting down WebSocket service:", error);
		}
		
		// Stop risk update service
		if (riskUpdateService) {
			riskUpdateService.stop();
		}
		
		server.close(() => {
			log("Server closed");
			process.exit(0);
		});
		
		// Force close after 10 seconds
		setTimeout(() => {
			log("Forcing shutdown after timeout");
			process.exit(1);
		}, 10000);
	};

	// Handle termination signals
	process.on("SIGTERM", gracefulShutdown);
	process.on("SIGINT", gracefulShutdown);
})();
