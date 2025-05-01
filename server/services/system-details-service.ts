import { db } from '../db';
import { fetchSolarSystemDetails, fetchSolarSystems } from '../api/frontier';
import type { SolarSystemDetails, SystemEntity } from '@shared/schema';
import { log } from '../vite';

class SystemDetailsService {
  private updateTimer: NodeJS.Timeout | null = null;
  private isUpdating: boolean = false;
  private readonly UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
  
  constructor() {
    log('System Details Service initialized');
  }
  
  /**
   * Start the scheduled updates for system details
   */
  public startScheduledUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
    
    // Immediately perform first update
    this.updateAllSystemDetails();
    
    // Schedule periodic updates
    this.updateTimer = setInterval(() => {
      this.updateAllSystemDetails();
    }, this.UPDATE_INTERVAL_MS);
    
    log(`Scheduled system details updates every ${this.UPDATE_INTERVAL_MS / 1000 / 60} minutes`);
  }
  
  /**
   * Stop the scheduled updates
   */
  public stopScheduledUpdates(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
      log('System details scheduled updates stopped');
    }
  }
  
  /**
   * Update all system details by polling for each system
   */
  private async updateAllSystemDetails(): Promise<void> {
    if (this.isUpdating) {
      log('System details update already in progress, skipping');
      return;
    }
    
    this.isUpdating = true;
    try {
      log('Starting update of all system details');
      
      // Fetch all solar systems
      const systems = await fetchSolarSystems();
      
      // Process systems in batches to avoid overloading the API and database
      const BATCH_SIZE = 5;
      
      for (let i = 0; i < systems.length; i += BATCH_SIZE) {
        const batch = systems.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        await Promise.all(batch.map(system => this.updateSystemDetails(system.id)));
        
        // Wait a bit between batches to be kind to the API
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      log(`Completed update of details for ${systems.length} systems`);
    } catch (error) {
      console.error('Error updating system details:', error);
    } finally {
      this.isUpdating = false;
    }
  }
  
  /**
   * Update details for a single system
   */
  private async updateSystemDetails(systemId: number): Promise<void> {
    try {
      // Fetch details from the API
      const details = await fetchSolarSystemDetails(systemId);
      
      // Store in the database
      await this.saveSystemDetails(details);
      
      log(`Updated details for system ${systemId}`);
    } catch (error) {
      console.error(`Error updating details for system ${systemId}:`, error);
    }
  }
  
  /**
   * Save system details to the database
   */
  private async saveSystemDetails(details: SolarSystemDetails): Promise<void> {
    try {
      const entitiesJson = JSON.stringify(details.entities);
      
      // Use UPSERT to insert or update
      db.run(`
        INSERT INTO system_details (system_id, entities_json, last_updated)
        VALUES (?, ?, ?)
        ON CONFLICT(system_id) DO UPDATE SET
          entities_json = excluded.entities_json,
          last_updated = excluded.last_updated
      `, [details.systemId, entitiesJson, details.lastUpdated]);
    } catch (error) {
      console.error(`Error saving system details for system ${details.systemId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get system details by system ID
   */
  public async getSystemDetails(systemId: number): Promise<SolarSystemDetails | null> {
    try {
      // Try to get from the database first
      const row = db.prepare('SELECT * FROM system_details WHERE system_id = ?').get(systemId);
      
      if (row) {
        // Parse entities from JSON
        const entities: SystemEntity[] = JSON.parse(row.entities_json);
        
        return {
          systemId: row.system_id,
          entities,
          lastUpdated: row.last_updated
        };
      }
      
      // If not in database, fetch from API and save
      const details = await fetchSolarSystemDetails(systemId);
      await this.saveSystemDetails(details);
      
      return details;
    } catch (error) {
      console.error(`Error getting system details for system ${systemId}:`, error);
      return null;
    }
  }
}

// Export a singleton instance
export const systemDetailsService = new SystemDetailsService(); 