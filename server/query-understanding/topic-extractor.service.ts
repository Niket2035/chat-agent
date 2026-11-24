import "server-only";

import { z } from "zod";

import { generateValidatedJson } from "@/server/query-understanding/model-output";

// Normalize Gemini's category variations into our supported categories.
const entityTypeSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return "other";

    const type = value.toLowerCase().trim();

    const aliases: Record<string, string> = {
      company: "company",
      organization: "company",
      organisation: "company",
      provider: "company",
      brand: "company",

      product: "product",
      application: "product",
      app: "product",
      tool: "product",
      platform: "product",

      technology: "technology",
      tech: "technology",
      framework: "technology",
      programming_language: "technology",
      database: "technology",
      language: "technology",

      person: "person",
      individual: "person",
      developer: "person",
      founder: "person",

      service: "service",
      hosting: "service",
      cloud_service: "service",
      saas: "service",

      other: "other",
    };

    return aliases[type] ?? "other";
  },
  z.enum(["company", "product", "technology", "person", "service", "other"]),
);

export const topicSchema = z.object({
  primaryTopic: z.string().min(1).max(150),

  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        type: entityTypeSchema,
      }),
    )
    .max(10),

  keywords: z.array(z.string().min(1).max(60)).max(10),

  searchTopic: z.string().min(1).max(200),

  requiresSpecificEntity: z.boolean(),
});

export type ExtractedTopic = z.infer<typeof topicSchema>;

const systemInstruction = `
You are a topic extraction component for a conversational research agent.

Extract the main subject and named entities from the user's question.

For every entity, type MUST be exactly one of these values:

- company
- product
- technology
- person
- service
- other

Examples:
- PostgreSQL -> technology
- MongoDB -> technology
- Next.js -> technology
- Google -> company
- Gemini -> product
- Tavily -> company
- Vercel -> company
- AWS hosting -> service

Rules:
- Do not answer the question.
- Do not invent company names, product names, or facts.
- Preserve important entity names accurately.
- Keep keywords short and relevant.
- searchTopic should be a concise description of the subject.
- If the question has no research topic, use "general conversation".
- Return only valid JSON.
- Never use category descriptions or multiple categories in the type field.
`;

export async function extractTopic(question: string): Promise<ExtractedTopic> {
  const prompt = `
Extract the topic from this user question.

USER QUESTION:
${JSON.stringify(question)}

Return JSON with exactly these fields:
- primaryTopic
- entities: array of objects containing name and type
- keywords: array of strings
- searchTopic
- requiresSpecificEntity

The entity type must be exactly:
company, product, technology, person, service, or other.
`;

  return generateValidatedJson(prompt, topicSchema, systemInstruction);
}
