import { websocketService } from './websocket';
import { Job } from '@shared/schema';
import { log } from '../vite';

/**
 * Service for broadcasting job status updates to connected clients
 */
export class JobNotificationService {
  /**
   * Notify clients when a new job is created
   * @param job The newly created job
   */
  public notifyJobCreated(job: Job): void {
    websocketService.broadcast({
      channel: 'job_update',
      data: {
        type: 'created',
        timestamp: new Date().toISOString(),
        job
      }
    });
    
    log(`Broadcasted job created notification for job ID ${job.id}`);
  }

  /**
   * Notify clients when a job is claimed
   * @param job The claimed job
   */
  public notifyJobClaimed(job: Job): void {
    websocketService.broadcast({
      channel: 'job_update',
      data: {
        type: 'claimed',
        timestamp: new Date().toISOString(),
        job
      }
    });
    
    log(`Broadcasted job claimed notification for job ID ${job.id}`);
  }

  /**
   * Notify clients when a job is completed
   * @param job The completed job
   */
  public notifyJobCompleted(job: Job): void {
    websocketService.broadcast({
      channel: 'job_update',
      data: {
        type: 'completed',
        timestamp: new Date().toISOString(),
        job
      }
    });
    
    log(`Broadcasted job completed notification for job ID ${job.id}`);
  }

  /**
   * Notify clients when a job expires
   * @param job The expired job
   */
  public notifyJobExpired(job: Job): void {
    websocketService.broadcast({
      channel: 'job_update',
      data: {
        type: 'expired',
        timestamp: new Date().toISOString(),
        job
      }
    });
    
    log(`Broadcasted job expired notification for job ID ${job.id}`);
  }

  /**
   * Notify clients when a job is cancelled
   * @param job The cancelled job
   */
  public notifyJobCancelled(job: Job): void {
    websocketService.broadcast({
      channel: 'job_update',
      data: {
        type: 'cancelled',
        timestamp: new Date().toISOString(),
        job
      }
    });
    
    log(`Broadcasted job cancelled notification for job ID ${job.id}`);
  }
}

// Create and export singleton instance
export const jobNotificationService = new JobNotificationService(); 