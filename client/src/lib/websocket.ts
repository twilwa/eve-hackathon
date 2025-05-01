import { useState, useCallback, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

// Event types for WebSocket messages
export type WebSocketEvent = {
  channel: string;
  data: unknown;
};

// Available channels
export enum WebSocketChannel {
  SYSTEM = 'system',
  RISK_UPDATE = 'risk_update',
  JOB_UPDATE = 'job_update',
  ECHO = 'echo'
}

// Connection status
export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting'
}

// Handler type for WebSocket events
export type EventHandler = (data: unknown) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private isConnecting = false;
  private reconnectTimer: number | null = null;
  private statusListeners: Set<(status: ConnectionStatus) => void> = new Set();
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Initial delay in ms
  
  constructor(url?: string) {
    // Make sure we use the server URL on port 5001
    this.url = url || 'ws://localhost:5001/ws';
  }
  
  // Connect to WebSocket server
  public connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }
    
    this.isConnecting = true;
    this.setStatus(ConnectionStatus.CONNECTING);
    
    try {
      // Create a new WebSocket connection
      this.ws = new WebSocket(this.url);
      
      // Set up event handlers
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.handleClose({ code: 1006, reason: String(error), wasClean: false } as CloseEvent);
    }
  }
  
  // Disconnect from WebSocket server
  public disconnect(): void {
    if (this.ws) {
      // Clear any pending reconnect timers
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      
      // Close the connection
      this.ws.close(1000, 'Client disconnected');
      this.ws = null;
      
      this.setStatus(ConnectionStatus.DISCONNECTED);
    }
  }
  
  // Subscribe to status changes
  public onStatusChange(callback: (status: ConnectionStatus) => void): () => void {
    this.statusListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.statusListeners.delete(callback);
    };
  }
  
  // Subscribe to events on a specific channel
  // Returns an unsubscribe function
  public on(channel: WebSocketChannel, handler: EventHandler): () => void {
    // Create a new set of handlers if it doesn't exist
    if (!this.eventHandlers.has(channel)) {
      this.eventHandlers.set(channel, new Set());
    }
    
    // Add the handler
    const handlers = this.eventHandlers.get(channel);
    if (handlers) {
      handlers.add(handler);
    }
    
    // Return unsubscribe function
    return () => {
      if (this.eventHandlers.has(channel)) {
        const handlers = this.eventHandlers.get(channel);
        if (handlers) {
          handlers.delete(handler);
        }
      }
    };
  }
  
  // Send a message to the server
  public send(channel: WebSocketChannel, data: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message - WebSocket is not connected');
      return;
    }
    
    const message: WebSocketEvent = {
      channel,
      data
    };
    
    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }
  
  // Get the current connection status
  public getStatus(): ConnectionStatus {
    return this.connectionStatus;
  }
  
  // Update the connection status and notify listeners
  private setStatus(status: ConnectionStatus): void {
    if (this.connectionStatus === status) {
      return;
    }
    
    this.connectionStatus = status;
    
    // Notify all status listeners - using Array.from to avoid iteration issues
    const listeners = Array.from(this.statusListeners);
    for (const listener of listeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in status listener:', error);
      }
    }
  }
  
  // Handle WebSocket open event
  private handleOpen(): void {
    console.log('WebSocket connection established');
    this.isConnecting = false;
    this.reconnectAttempt = 0;
    this.setStatus(ConnectionStatus.CONNECTED);
  }
  
  // Handle WebSocket close event
  // @param event The close event
  private handleClose(event: CloseEvent): void {
    console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
    this.isConnecting = false;
    this.ws = null;
    
    // Don't reconnect if the closure was clean (code 1000)
    if (event.code !== 1000) {
      this.attemptReconnect();
    } else {
      this.setStatus(ConnectionStatus.DISCONNECTED);
    }
  }
  
  // Handle WebSocket error event
  // @param event The error event
  private handleError(event: Event): void {
    console.error('WebSocket error:', event);
    this.isConnecting = false;
  }
  
  // Attempt to reconnect to the WebSocket server
  private attemptReconnect(): void {
    if (this.reconnectTimer !== null) {
      return;
    }
    
    this.reconnectAttempt++;
    
    if (this.reconnectAttempt > this.maxReconnectAttempts) {
      console.error(`Failed to reconnect after ${this.maxReconnectAttempts} attempts`);
      this.setStatus(ConnectionStatus.DISCONNECTED);
      return;
    }
    
    this.setStatus(ConnectionStatus.RECONNECTING);
    
    // Exponential backoff for reconnect attempts
    const delay = Math.min(this.reconnectDelay * (1.5 ** (this.reconnectAttempt - 1)), 30000);
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempt}/${this.maxReconnectAttempts})`);
    
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
  
  // Handle WebSocket message event
  // @param event The message event
  private async handleMessage(event: MessageEvent): Promise<void> {
    try {
      // Parse the JSON message
      const data = JSON.parse(event.data as string);
      
      // Dispatch the event to the appropriate handlers
      this.dispatchEvent(data.channel, data.data);
    } catch (error) {
      console.error('Error handling WebSocket message:', error, event.data);
    }
  }
  
  // Dispatch an event to all handlers for a specific channel
  // @param channel The channel the event is on
  // @param data The event data
  private dispatchEvent(channel: string, data: unknown): void {
    if (!this.eventHandlers.has(channel)) {
      return;
    }
    
    const handlers = this.eventHandlers.get(channel);
    if (!handlers) {
      return;
    }
    
    // Use Array.from to avoid iteration issues with Set
    const handlerArray = Array.from(handlers);
    for (const handler of handlerArray) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for channel "${channel}":`, error);
      }
    }
  }
}

// Create a singleton instance of the WebSocket client
// Initialize it early to prevent "getStatus is not a function" errors
const websocketClient = new WebSocketClient();

// React hook for using WebSocket
export function useWebSocket() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  
  // Connect to the WebSocket server
  const connect = useCallback(() => {
    websocketClient.connect();
  }, []);
  
  // Disconnect from the WebSocket server
  const disconnect = useCallback(() => {
    websocketClient.disconnect();
  }, []);
  
  // Subscribe to status changes
  const onStatusChange = useCallback((handler: (status: ConnectionStatus) => void) => {
    return websocketClient.onStatusChange(handler);
  }, []);
  
  // Subscribe to events
  const on = useCallback((channel: WebSocketChannel, handler: EventHandler) => {
    return websocketClient.on(channel, handler);
  }, []);
  
  // Send a message
  const send = useCallback((channel: WebSocketChannel, data: unknown) => {
    websocketClient.send(channel, data);
  }, []);
  
  // Subscribe to status changes on mount
  useEffect(() => {
    const unsubscribe = websocketClient.onStatusChange(setStatus);
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);
  
  // Automatically reconnect on network status change
  useEffect(() => {
    const handleOnline = () => {
      try {
        const currentStatus = websocketClient.getStatus();
        if (currentStatus !== ConnectionStatus.CONNECTED) {
          websocketClient.connect();
        }
      } catch (error) {
        console.error('Error in online handler:', error);
        // Try to reconnect anyway
        websocketClient.connect();
      }
    };
    
    window.addEventListener('online', handleOnline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);
  
  return {
    connect,
    disconnect,
    onStatusChange,
    on,
    send,
    status,
    ConnectionStatus,
  };
} 