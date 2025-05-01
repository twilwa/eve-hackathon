import { websocketService } from './websocket';
import { RiskData } from '@shared/schema';
import { log } from '../vite';

/**
 * Service for broadcasting risk data updates to connected clients
 */
export class RiskUpdateService {
  private lastBroadcastTime: number = 0;
  private broadcastIntervalMs: number = 5000; // 5 seconds between broadcasts
  private throttleTimeMs: number = 1000; // 1 second between individual updates
  private pendingUpdates: Map<number, RiskData> = new Map();
  private broadcastTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.setupBroadcastTimer();
  }

  /**
   * Set up timer to broadcast pending updates periodically
   */
  private setupBroadcastTimer(): void {
    this.broadcastTimer = setInterval(() => {
      this.broadcastPendingUpdates();
    }, this.broadcastIntervalMs);
  }

  /**
   * Update risk data for a system and schedule it for broadcast
   * @param riskData The updated risk data for a system
   */
  public updateRiskData(riskData: RiskData): void {
    // Store the update in the pending updates map
    this.pendingUpdates.set(riskData.systemId, riskData);
    
    // Check if we should broadcast immediately or wait for the next scheduled broadcast
    const now = Date.now();
    const timeSinceLastBroadcast = now - this.lastBroadcastTime;
    
    if (timeSinceLastBroadcast > this.throttleTimeMs && this.pendingUpdates.size > 0) {
      this.broadcastPendingUpdates();
    }
  }

  /**
   * Update risk data for multiple systems and schedule them for broadcast
   * @param riskDataArray Array of updated risk data for multiple systems
   */
  public updateMultipleRiskData(riskDataArray: RiskData[]): void {
    if (!riskDataArray.length) return;
    
    // Store updates in the pending updates map
    for (const riskData of riskDataArray) {
      this.pendingUpdates.set(riskData.systemId, riskData);
    }
    
    // Check if we should broadcast immediately or wait for the next scheduled broadcast
    const now = Date.now();
    const timeSinceLastBroadcast = now - this.lastBroadcastTime;
    
    if (timeSinceLastBroadcast > this.throttleTimeMs && this.pendingUpdates.size > 0) {
      this.broadcastPendingUpdates();
    }
  }

  /**
   * Broadcast all pending risk data updates to connected clients
   */
  private broadcastPendingUpdates(): void {
    if (this.pendingUpdates.size === 0) return;
    
    // Convert map to array
    const updates = Array.from(this.pendingUpdates.values());
    
    // Clear pending updates
    this.pendingUpdates.clear();
    
    // Update timestamp
    this.lastBroadcastTime = Date.now();
    
    // Broadcast the updates via WebSocket
    websocketService.broadcast({
      channel: 'risk_update',
      data: {
        timestamp: new Date().toISOString(),
        updates
      }
    });
    
    log(`Broadcasted risk updates for ${updates.length} systems via WebSocket`);
  }

  /**
   * Stop the risk update service
   */
  public stop(): void {
    if (this.broadcastTimer) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
    }
    
    // Broadcast any remaining updates
    this.broadcastPendingUpdates();
  }
}

// Create and export singleton instance
export const riskUpdateService = new RiskUpdateService(); 