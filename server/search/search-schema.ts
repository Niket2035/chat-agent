
import { z } from "zod";

export const webSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(3, "Search query is too short")
    .max(400, "Search query is too long"),

  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5),
});

export type WebSearchInput = z.infer<
  typeof webSearchInputSchema
>;
