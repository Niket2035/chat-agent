
import "server-only";
import { z } from "zod";

const envSchema = z.object({
  GEMINI_API_KEY: z.string().min(1, "Gemini API key is required"),

  GEMINI_MODEL: z.string().default("gemini-flash-latest"),

  TAVILY_API_KEY: z.string().min(1, "Tavily API key is required"),

  DATABASE_URL: z.string().min(1, "Database URL is required"),

  APP_URL: z.string().default("http://localhost:3000"),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error(
      "Invalid environment variables:",
      result.error.flatten().fieldErrors
    );

    throw new Error("Environment configuration is invalid.");
  }

  return result.data;
}

export const env = validateEnv();
