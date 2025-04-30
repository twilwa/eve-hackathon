import { pgTable, text, serial, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText, integer as sqliteInteger, real as sqliteReal } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// User model from original schema
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Solar System Schema
export const solarSystemSchema = z.object({
  id: z.number(),
  name: z.string(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  securityStatus: z.number().optional(),
  connections: z.array(z.number()).optional()
});

export type SolarSystem = z.infer<typeof solarSystemSchema>;

// System Connection Schema
export const systemConnectionSchema = z.object({
  sourceId: z.number(),
  targetId: z.number(),
  distance: z.number(),
  gateType: z.string().optional()
});

export type SystemConnection = z.infer<typeof systemConnectionSchema>;

// Risk Data Schema
export const riskDataSchema = z.object({
  systemId: z.number(),
  riskScore: z.number(),
  killCount: z.number().optional(),
  lastUpdated: z.string().optional()
});

export type RiskData = z.infer<typeof riskDataSchema>;

// Route Request Schema
export const routeRequestSchema = z.object({
  startSystemId: z.number(),
  endSystemId: z.number(),
  riskAversion: z.number().min(0).max(1)
});

export type RouteRequest = z.infer<typeof routeRequestSchema>;

// Route Jump Schema
export const routeJumpSchema = z.object({
  jumpNumber: z.number(),
  fromSystemId: z.number(),
  fromSystemName: z.string(),
  toSystemId: z.number(),
  toSystemName: z.string(),
  distance: z.number(),
  riskLevel: z.number(),
  gateType: z.string().optional()
});

export type RouteJump = z.infer<typeof routeJumpSchema>;

// Define the structure of a high risk section
export const highRiskSectionSchema = z.object({
  systemId: z.number(),
  systemName: z.string(),
  riskLevel: z.number(),
  warning: z.string().optional()
});

// Define the base alternative route schema
export const alternativeRouteSchema = z.object({
  name: z.string(),
  jumps: z.number(),
  distance: z.number(),
  risk: z.number()
});

// First define a base route response schema without alternatives
export const baseRouteResponseSchema = z.object({
  jumps: z.array(routeJumpSchema),
  totalDistance: z.number(),
  totalJumps: z.number(),
  averageRisk: z.number(),
  highRiskSections: z.array(highRiskSectionSchema).optional()
});

// Define a complete alternative route with route data
export const alternativeWithRouteSchema = alternativeRouteSchema.extend({
  route: z.lazy(() => baseRouteResponseSchema).optional()
});

// Then define the full RouteResponseSchema with alternatives
export const routeResponseSchema = baseRouteResponseSchema.extend({
  alternatives: z.array(alternativeWithRouteSchema).optional()
});

// Export the types for use in implementation
export type AlternativeRoute = z.infer<typeof alternativeWithRouteSchema>;
export type BaseRouteResponse = z.infer<typeof baseRouteResponseSchema>;

export type RouteResponse = z.infer<typeof routeResponseSchema>;

// Solar System Search Schema
export const systemSearchSchema = z.object({
  query: z.string().min(1)
});

export type SystemSearch = z.infer<typeof systemSearchSchema>;

// Job status enum
export const JobStatus = {
  OPEN: 'open',
  CLAIMED: 'claimed',
  COMPLETED: 'completed',
  EXPIRED: 'expired'
} as const;

export type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

// Job schema for SQLite
export const jobs = sqliteTable('jobs', {
  id: sqliteInteger('id').primaryKey({ autoIncrement: true }),
  fromSystemId: sqliteInteger('from_system_id').notNull(),
  fromSystemName: sqliteText('from_system_name').notNull(),
  toSystemId: sqliteInteger('to_system_id').notNull(),
  toSystemName: sqliteText('to_system_name').notNull(),
  reward: sqliteReal('reward').notNull(),
  status: sqliteText('status').notNull().default(JobStatus.OPEN),
  createdAt: sqliteText('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  expiresAt: sqliteText('expires_at').notNull(),
  claimedBy: sqliteText('claimed_by'),
  claimedAt: sqliteText('claimed_at'),
  completedAt: sqliteText('completed_at'),
  proofJson: sqliteText('proof_json'),
});

// Job insert schema with validation
export const jobInsertSchema = createInsertSchema(jobs, {
  fromSystemId: (schema) => schema.fromSystemId.positive(),
  toSystemId: (schema) => schema.toSystemId.positive(),
  reward: (schema) => schema.reward.positive(),
  expiresAt: (schema) => schema.expiresAt.refine(
    (date) => new Date(date) > new Date(),
    {
      message: "Expiry time must be in the future",
    }
  ),
}).omit({ id: true, claimedBy: true, claimedAt: true, completedAt: true, proofJson: true, status: true });

export const jobClaimSchema = z.object({
  scoutPubKey: z.string().min(1),
});

export const jobCompleteSchema = z.object({
  proofJson: z.string().min(1),
});

export type JobInsert = z.infer<typeof jobInsertSchema>;
export type Job = typeof jobs.$inferSelect;
export type JobClaim = z.infer<typeof jobClaimSchema>;
export type JobComplete = z.infer<typeof jobCompleteSchema>;
