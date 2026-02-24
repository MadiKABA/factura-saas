import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "pnpm exec tsx prisma/seed.ts",
  },
  // Pour éviter l'erreur, on cast la configuration de la datasource
  datasource: {
    url: process.env["DIRECT_URL"],
  },
});