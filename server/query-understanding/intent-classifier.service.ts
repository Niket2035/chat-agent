import "server-only";

import { z } from "zod";

import { generateValidatedJson } from "@/server/query-understanding/model-output";

export const intentSchema = z.object({
  intent: z.enum([
    "historical_recall",
    "current_research",
    "change_detection",
    "general_chat",
  ]),

  datePhrase: z.string().nullable(),

  comparisonRequested: z.boolean(),

  confidence: z.number().min(0).max(1),

  reason: z.string().max(300),
});

export type QueryIntent = z.infer<typeof intentSchema>;

const systemInstruction = `
You are an intent classification component for a conversational research agent.

Classify the user's latest question into exactly one intent:

historical_recall:
The user wants to know what they previously asked, discussed, or received as an answer.

current_research:
The user wants fresh information, facts, recommendations, or research.

change_detection:
The user wants to know what has changed since a previous date,
conversation, observation, or answer.

general_chat:
Greetings, casual conversation, or requests that do not require
historical retrieval or external research.

Rules:
- Do not answer the user's question.
- Do not invent dates.
- Extract a date phrase only when the user explicitly indicates one.
- "Is my previous answer still correct?" is change_detection.
- "What did I ask last Tuesday?" is historical_recall.
- "What is the current price?" is current_research.
- Return only JSON matching the requested fields.
`;

export async function classifyIntent(question: string): Promise<QueryIntent> {
  const normalizedQuestion = question.trim();

  if (!normalizedQuestion) {
    throw new Error("Question cannot be empty.");
  }

  const prompt = `
Classify this user question.

USER QUESTION:
${JSON.stringify(normalizedQuestion)}

Return JSON with:
- intent
- datePhrase (string or null)
- comparisonRequested (boolean)
- confidence (number between 0 and 1)
- reason (short explanation)
`;

  return generateValidatedJson(prompt, intentSchema, systemInstruction);
}
