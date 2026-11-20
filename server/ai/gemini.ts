
import "server-only";

import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

const gemini = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

export interface GenerateTextOptions {
  systemInstruction?: string;
  temperature?: number;
}

export async function generateText(
  prompt: string,
  options: GenerateTextOptions = {}
): Promise<string> {
  const response = await gemini.models.generateContent({
    model: env.GEMINI_MODEL,

    contents: prompt,

    config: {
      systemInstruction: options.systemInstruction,

      temperature: options.temperature ?? 0.2,
    },
  });

  const text = response.text?.trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return text;
}
