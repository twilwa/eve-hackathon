import { processExpiredJobs } from '../api/jobs';
import { log } from '../vite';

// Default check interval (1 minute)
const DEFAULT_CHECK_INTERVAL = 60 * 1000;

export class JobExpiryService {
  private intervalId: NodeJS.Timeout | null = null;
  private checkIntervalMs: number;

  constructor(checkIntervalMs = DEFAULT_CHECK_INTERVAL) {
    this.checkIntervalMs = checkIntervalMs;
  }

  // Start the job expiry service
  start(): void {
    if (this.intervalId) {
      return; // Already running
    }

    log('Starting job expiry service');
    
    // Run once immediately
    this.checkExpiredJobs();
    
    // Then schedule regular checks
    this.intervalId = setInterval(() => {
      this.checkExpiredJobs();
    }, this.checkIntervalMs);
  }

  // Stop the job expiry service
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      log('Stopped job expiry service');
    }
  }

  // Check for and process expired jobs
  private async checkExpiredJobs(): Promise<void> {
    try {
      const expiredCount = await processExpiredJobs();
      if (expiredCount > 0) {
        log(`Job expiry service: Expired ${expiredCount} jobs`);
      }
    } catch (error) {
      console.error('Error while processing expired jobs:', error);
    }
  }
}

// Create and export a singleton instance
export const jobExpiryService = new JobExpiryService(); 