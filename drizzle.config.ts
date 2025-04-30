import { defineConfig } from "drizzle-kit";
import { resolve } from 'path';

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: resolve(__dirname, './sqlite.db'),
  },
});
