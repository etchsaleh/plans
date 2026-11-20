import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/adapters/postgres/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://plan@localhost:5433/plan" },
});
