import { pgTable, text, serial, integer, boolean, real, timestamp } from "drizzle-orm/pg-core";
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

// Route Response Schema
export const routeResponseSchema = z.object({
  jumps: z.array(routeJumpSchema),
  totalDistance: z.number(),
  totalJumps: z.number(),
  averageRisk: z.number(),
  highRiskSections: z.array(z.object({
    systemId: z.number(),
    systemName: z.string(),
    riskLevel: z.number(),
    warning: z.string().optional()
  })).optional(),
  alternatives: z.array(z.object({
    name: z.string(),
    jumps: z.number(),
    distance: z.number(),
    risk: z.number(),
    route: z.lazy(() => routeResponseSchema).optional()
  })).optional()
});

export type RouteResponse = z.infer<typeof routeResponseSchema>;

// Solar System Search Schema
export const systemSearchSchema = z.object({
  query: z.string().min(1)
});

export type SystemSearch = z.infer<typeof systemSearchSchema>;
