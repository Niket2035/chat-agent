import "server-only";

import { z } from "zod";
import { generateText } from "@/server/ai/gemini";

export async function generateValidatedJson<T extends z.ZodType>(
  prompt: string,
  schema: T,
  systemInstruction: string,
): Promise<z.infer<T>> {
  const output = await generateText(prompt, {
    systemInstruction,
    temperature: 0.1,
  });

  // Remove optional Markdown code fences.
  const cleaned = output
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsed: unknown;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini returned invalid JSON.");
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    throw new Error(`Gemini output failed validation: ${result.error.message}`);
  }

  return result.data;
}
