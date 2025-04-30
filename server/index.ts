import express, { type Request, Response, NextFunction } from "express";
import http from "http";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as net from "node:net";
import { initializeDatabase } from "./db";
import { jobExpiryService } from "./services/job-expiry";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Logging middleware (remains the same)
app.use((req, res, next) => {
	const start = Date.now();
	const path = req.path;
	let capturedJsonResponse: Record<string, any> | undefined = undefined;

	const originalResJson = res.json;
	res.json = function (bodyJson, ...args) {
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
				logLine = logLine.slice(0, 79) + "…";
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
		log("Database initialization failed:", error);
		process.exit(1);
	}

	await registerRoutes(app);

	// Start job expiry service
	jobExpiryService.start();

	app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
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

	if (app.get("env") === "development") {
		await setupVite(app, server);
	} else {
		serveStatic(app);
	}

	const tryListen = async (
		serverInstance: http.Server,
		startPort: number,
		maxAttempts: number = 10,
	) => {
		const host = "0.0.0.0";
		const maxPort = startPort + maxAttempts - 1;

		for (let port = startPort; port <= maxPort; port++) {
			try {
				await new Promise<void>((resolve, reject) => {
					const onError = (err: NodeJS.ErrnoException) => {
						serverInstance.removeListener("listening", onListening); // Clean up listener
						reject(err);
					};

					const onListening = () => {
						serverInstance.removeListener("error", onError); // Clean up listener
						log(`Successfully serving on http://${host}:${port}`);
						resolve();
					};

					serverInstance.once("error", onError);
					serverInstance.once("listening", onListening);

					const opts: net.ListenOptions = { port, host };
					if (process.platform === "linux") opts.reusePort = true; // only where it works
					serverInstance.listen(opts);
				});
				// If the promise resolved, listen was successful
				return port; // Return the successful port
			} catch (error: any) {
				// Log the specific error for this port
				log(
					`Failed to bind to port ${port}: ${error.message} (Code: ${error.code || "N/A"})`,
				);

				if (port === maxPort) {
					// If this was the last attempt, throw error to be caught outside
					log(`All ports up to ${maxPort} failed.`);
					throw error; // Re-throw the last error
				} else {
					// Otherwise, log and continue the loop to try the next port
					log(`Trying next port (${port + 1})...`);
				}
				// Allow the loop to continue implicitly
			}
		}
		// This should theoretically not be reached if maxAttempts > 0
		// because the last attempt's error is re-thrown.
		// But as a safeguard:
		throw new Error(
			`Failed to bind to any port between ${startPort} and ${maxPort}`,
		);
	};

	const initialPort = 5001;
	const retryAttempts = 10; // Try ports 5000 through 5009
	try {
		await tryListen(server, initialPort, retryAttempts);
	} catch (error) {
		log(
			`Server failed to start after trying ports ${initialPort} to ${initialPort + retryAttempts - 1}: ${error}`,
		);
		process.exit(1);
	}

	// Graceful shutdown
	const gracefulShutdown = () => {
		log("Shutting down gracefully...");
		jobExpiryService.stop();
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
