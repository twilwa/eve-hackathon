import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import { log } from '../vite';
import * as crypto from 'node:crypto';
import * as zlib from 'node:zlib';
import type * as http from 'node:http';

// Type definitions for client tracking and message formats
type Client = {
  id: string;
  ws: WebSocket;
  isAlive: boolean;
  lastActivity: number;
  supportsCompression: boolean; // Flag to track compression support
};

export type BroadcastMessage = {
  channel: string;
  data: unknown;
};

type ThrottledChannel = {
  lastBroadcastTime: number;
  minIntervalMs: number;
  pendingMessages: Map<string, unknown>; // Key is a unique ID for the data type
  batchMode: boolean;
};

// Type for message data with ID
interface MessageDataWithId {
  id: string | number;
  [key: string]: unknown;
}

export class WebSocketService {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private throttledChannels: Map<string, ThrottledChannel> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;
  
  constructor(server: http.Server) {
    // Create WebSocket server using the existing HTTP server
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws',
      // Add CORS verification for WebSocket connections
      verifyClient: (info, callback) => {
        const origin = info.origin || info.req.headers.origin;
        const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
          process.env.ALLOWED_ORIGINS.split(',') : 
          ['http://localhost:5173'];
          
        if (!origin || allowedOrigins.includes(origin)) {
          callback(true);
        } else {
          log(`WebSocket connection from origin ${origin} rejected (not in allowed origins)`);
          callback(false, 403, 'Origin not allowed');
        }
      }
    });
    
    // Set up event handlers
    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Set up ping interval
    this.pingInterval = setInterval(this.pingClients.bind(this), 30000);
    
    log('WebSocket server initialized');
    
    // Set up throttled channels
    this.setupThrottledChannels();
  }
  
  // Handle a new WebSocket connection
  private handleConnection(ws: WebSocket, request: IncomingMessage): void {
    // Generate a unique ID for this client
    const clientId = this.generateClientId();
    
    // Store the client
    this.clients.set(clientId, {
      id: clientId,
      ws,
      isAlive: true,
      lastActivity: Date.now(),
      supportsCompression: false // Default to no compression
    });
    
    log(`Client connected: ${clientId}`);
    
    // Send welcome message
    this.sendToClient(clientId, {
      channel: 'system',
      data: {
        type: 'welcome',
        clientId,
        supportsCompression: false,
        timestamp: new Date().toISOString()
      }
    });
    
    // Set up event handlers
    ws.on('message', (message: WebSocket.Data) => this.handleMessage(clientId, message));
    ws.on('close', () => this.handleClose(clientId));
    ws.on('error', (error) => this.handleError(clientId, error));
    ws.on('pong', () => this.handlePong(clientId));
  }
  
  // Handle a message from a client
  private handleMessage(clientId: string, message: WebSocket.Data): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Update activity timestamp
    client.lastActivity = Date.now();
    
    // Parse message
    try {
      const parsedMessage = JSON.parse(message.toString());
      
      // Handle echo messages
      if (parsedMessage.channel === 'echo') {
        this.sendToClient(clientId, {
          channel: 'echo',
          data: parsedMessage.data
        });
      }
    } catch (error) {
      console.error(`Error parsing message from client ${clientId}:`, error);
    }
  }
  
  // Handle client disconnect
  private handleClose(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    // Remove client from map
    this.clients.delete(clientId);
    log(`Client disconnected: ${clientId}`);
  }
  
  // Handle client errors
  private handleError(clientId: string, error: Error): void {
    console.error(`Error from client ${clientId}:`, error);
  }
  
  // Handle pong response
  private handlePong(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    client.isAlive = true;
  }
  
  // Send a ping to all clients to check if they're still alive
  private pingClients(): void {
    // Create a copy of clients entries to avoid issues with iteration
    const clientEntries = Array.from(this.clients.entries());
    
    for (const [clientId, client] of clientEntries) {
      if (!client.isAlive) {
        // Client failed to respond to ping, close connection
        log(`Client ${clientId} failed to respond to ping, closing connection`);
        client.ws.terminate();
        this.clients.delete(clientId);
        continue;
      }
      
      // Mark as not alive, will be marked alive again when pong is received
      client.isAlive = false;
      
      // Send ping
      try {
        client.ws.ping();
      } catch (error) {
        console.error(`Error sending ping to client ${clientId}:`, error);
        client.ws.terminate();
        this.clients.delete(clientId);
      }
    }
  }
  
  // Send a message to a specific client
  private async sendToClient(clientId: string, message: BroadcastMessage): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return;
    
    try {
      // Serialize message
      const messageData = JSON.stringify(message);
      
      // Send message
      client.ws.send(messageData);
    } catch (error) {
      console.error(`Error sending message to client ${clientId}:`, error);
    }
  }
  
  // Set up throttled channels
  private setupThrottledChannels(): void {
    // Risk updates - throttle to at most once per second, and batch multiple updates
    this.throttledChannels.set('risk_update', {
      lastBroadcastTime: 0,
      minIntervalMs: 1000, // 1 second
      pendingMessages: new Map(),
      batchMode: true
    });
    
    // Job updates - throttle to at most once per 500ms
    this.throttledChannels.set('job_update', {
      lastBroadcastTime: 0,
      minIntervalMs: 500, // 500ms
      pendingMessages: new Map(),
      batchMode: false
    });
  }
  
  // Broadcast a message to all clients
  public async broadcast(message: BroadcastMessage): Promise<void> {
    // If this channel is throttled, queue the message
    if (this.throttledChannels.has(message.channel)) {
      this.queueThrottledMessage(message);
      return;
    }
    
    // Broadcast immediately to all clients
    this.broadcastToAllClients(message);
  }
  
  // Queue a message for throttled broadcast
  private queueThrottledMessage(message: BroadcastMessage): void {
    const channel = this.throttledChannels.get(message.channel);
    if (!channel) return;
    
    // For batch mode channels, store by ID to deduplicate
    if (channel.batchMode && message.data && typeof message.data === 'object' && 'id' in message.data) {
      const messageWithId = message.data as MessageDataWithId;
      const id = String(messageWithId.id);
      channel.pendingMessages.set(id, message.data);
    } else {
      // For non-batch mode, just store the latest message
      const now = Date.now().toString();
      channel.pendingMessages.set(now, message.data);
    }
    
    // Check if we should broadcast now
    const timeSinceLastBroadcast = Date.now() - channel.lastBroadcastTime;
    if (timeSinceLastBroadcast >= channel.minIntervalMs) {
      this.processPendingMessages(message.channel);
    }
  }
  
  // Process pending messages for a throttled channel
  private processPendingMessages(channelName: string): void {
    const channel = this.throttledChannels.get(channelName);
    if (!channel || channel.pendingMessages.size === 0) return;
    
    // Update last broadcast time
    channel.lastBroadcastTime = Date.now();
    
    // Create message to send
    let messageData: unknown;
    
    if (channel.batchMode && channel.pendingMessages.size > 1) {
      // Batch mode - send array of items
      messageData = {
        type: 'batch',
        timestamp: new Date().toISOString(),
        count: channel.pendingMessages.size,
        items: Array.from(channel.pendingMessages.values())
      };
    } else {
      // Non-batch mode - send single item
      messageData = channel.pendingMessages.values().next().value;
    }
    
    // Clear pending messages
    channel.pendingMessages.clear();
    
    // Broadcast message
    this.broadcastToAllClients({
      channel: channelName,
      data: messageData
    });
  }
  
  // Process all pending messages for throttled channels
  private processAllPendingMessages(): void {
    // Create a copy of throttled channel entries to avoid iteration issues
    const channelEntries = Array.from(this.throttledChannels.entries());
    
    for (const [channelName, channel] of channelEntries) {
      if (channel.pendingMessages.size > 0) {
        this.processPendingMessages(channelName);
      }
    }
  }
  
  // Broadcast to all connected clients
  private broadcastToAllClients(message: BroadcastMessage): void {
    if (this.clients.size === 0) return;
    
    // Serialize the message once
    const messageData = JSON.stringify(message);
    
    // Send to all clients
    // Create a copy of client entries to avoid iteration issues
    const clientEntries = Array.from(this.clients.entries());
    
    for (const [clientId, client] of clientEntries) {
      if (client.ws.readyState === WebSocket.OPEN) {
        try {
          client.ws.send(messageData);
        } catch (error) {
          console.error(`Error broadcasting to client ${clientId}:`, error);
        }
      }
    }
  }
  
  // Generate a unique client ID
  private generateClientId(): string {
    return crypto.randomUUID();
  }
  
  // Clean up resources
  public shutdown(): void {
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Process any pending messages
    this.processAllPendingMessages();
    
    // Close all connections
    // Create a copy of client entries to avoid iteration issues
    const clientEntries = Array.from(this.clients.entries());
    
    for (const [_, client] of clientEntries) {
      try {
        client.ws.close(1000, 'Server shutting down');
      } catch (error) {
        // Ignore errors when closing
      }
    }
    
    // Clear clients
    this.clients.clear();
    
    // Close server
    this.wss.close();
    
    log('WebSocket server shutdown complete');
  }
}

// Export singleton instance
export let websocketService: WebSocketService | undefined;

// Provide a setter function to set the service from outside
export function setWebSocketService(service: WebSocketService): void {
  websocketService = service;
} 