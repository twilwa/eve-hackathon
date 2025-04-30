import { Router } from 'express';
import { db, runTransaction } from '../db';
import { 
  jobs, 
  JobStatus, 
  jobInsertSchema, 
  jobClaimSchema, 
  jobCompleteSchema,
  type Job
} from '@shared/schema';
import { eq, and, desc, lt, gt } from 'drizzle-orm';
import { z } from 'zod';

const router = Router();
// TODO: fix lints, some type errors etc

// GET /api/jobs - Retrieve all jobs (with optional status filter)
router.get('/', async (req, res) => {
  try {
    const statusFilter = req.query.status as string | undefined;
    const page = parseInt(req.query.page as string || '1');
    const limit = parseInt(req.query.limit as string || '20');
    const offset = (page - 1) * limit;

    let query = db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit).offset(offset);
    
    if (statusFilter && Object.values(JobStatus).includes(statusFilter as any)) {
      query = query.where(eq(jobs.status, statusFilter));
    }

    const results = await query;
    
    // Count total records for pagination
    let countQuery = db.select({ count: db.fn.count() }).from(jobs);
    if (statusFilter && Object.values(JobStatus).includes(statusFilter as any)) {
      countQuery = countQuery.where(eq(jobs.status, statusFilter));
    }
    const [{ count }] = await countQuery;

    res.json({
      data: results,
      pagination: {
        page,
        limit,
        totalItems: Number(count),
        totalPages: Math.ceil(Number(count) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ message: 'Failed to fetch jobs' });
  }
});

// GET /api/jobs/:id - Retrieve a specific job
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }

    const [result] = await db.select().from(jobs).where(eq(jobs.id, id));
    
    if (!result) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ message: 'Failed to fetch job' });
  }
});

// POST /api/jobs - Create a new job
router.post('/', async (req, res) => {
  try {
    const validatedData = jobInsertSchema.parse(req.body);
    
    // Create new job
    const [result] = await db.insert(jobs).values({
      ...validatedData,
      status: JobStatus.OPEN,
      createdAt: new Date().toISOString(),
    }).returning();
    
    res.status(201).json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Error creating job:', error);
    res.status(500).json({ message: 'Failed to create job' });
  }
});

// PUT /api/jobs/:id/claim - Claim a job
router.put('/:id/claim', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }

    const validatedData = jobClaimSchema.parse(req.body);
    
    let claimedJob: Job | null = null;
    
    // Run in transaction for atomicity
    await runTransaction(() => {
      // First check if job exists and is claimable
      const [job] = db.select().from(jobs).where(
        and(
          eq(jobs.id, id),
          eq(jobs.status, JobStatus.OPEN),
          gt(jobs.expiresAt, new Date().toISOString())
        )
      );
      
      if (!job) {
        throw new Error('Job not found or not available for claiming');
      }
      
      // Update the job to claimed status
      const [updatedJob] = db.update(jobs)
        .set({
          status: JobStatus.CLAIMED,
          claimedBy: validatedData.scoutPubKey,
          claimedAt: new Date().toISOString()
        })
        .where(eq(jobs.id, id))
        .returning();
      
      claimedJob = updatedJob;
    });
    
    if (!claimedJob) {
      return res.status(409).json({ message: 'Job is not available for claiming' });
    }
    
    res.json(claimedJob);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    if (error instanceof Error && error.message === 'Job not found or not available for claiming') {
      return res.status(409).json({ message: error.message });
    }
    console.error('Error claiming job:', error);
    res.status(500).json({ message: 'Failed to claim job' });
  }
});

// PUT /api/jobs/:id/complete - Complete a job
router.put('/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid job ID' });
    }

    const validatedData = jobCompleteSchema.parse(req.body);
    const scoutPubKey = req.headers['x-scout-pubkey'] as string;
    
    if (!scoutPubKey) {
      return res.status(401).json({ message: 'Scout public key is required' });
    }
    
    // First check if job exists and is claimable by this scout
    const [job] = await db.select().from(jobs).where(
      and(
        eq(jobs.id, id),
        eq(jobs.status, JobStatus.CLAIMED),
        eq(jobs.claimedBy, scoutPubKey),
      )
    );
    
    if (!job) {
      return res.status(403).json({ message: 'Job not found or not claimed by you' });
    }
    
    // Parse and validate proof JSON
    let proofData: any;
    try {
      proofData = JSON.parse(validatedData.proofJson);
      // Add minimal validation for the proof - should contain a list of jumps
      if (!Array.isArray(proofData.jumps) || proofData.jumps.length === 0) {
        return res.status(400).json({ message: 'Invalid proof: must contain jumps array' });
      }
      
      // Verify the route proof covers the required path
      const firstJump = proofData.jumps[0];
      const lastJump = proofData.jumps[proofData.jumps.length - 1];
      
      if (firstJump.fromSystemId !== job.fromSystemId || lastJump.toSystemId !== job.toSystemId) {
        return res.status(400).json({ 
          message: 'Invalid proof: route must start at the job source system and end at the destination system' 
        });
      }
    } catch (e) {
      return res.status(400).json({ message: 'Invalid proof JSON format' });
    }
    
    // Update the job to completed status
    const [completedJob] = await db.update(jobs)
      .set({
        status: JobStatus.COMPLETED,
        completedAt: new Date().toISOString(),
        proofJson: validatedData.proofJson
      })
      .where(eq(jobs.id, id))
      .returning();
    
    res.json(completedJob);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: 'Validation error', errors: error.errors });
    }
    console.error('Error completing job:', error);
    res.status(500).json({ message: 'Failed to complete job' });
  }
});

// Export the job expiry handler for background processing
export const processExpiredJobs = async () => {
  const now = new Date().toISOString();
  const expiredJobs = await db.update(jobs)
    .set({ status: JobStatus.EXPIRED })
    .where(
      and(
        lt(jobs.expiresAt, now),
        eq(jobs.status, JobStatus.OPEN)
      )
    )
    .returning();
  
  return expiredJobs.length;
};

export default router; 