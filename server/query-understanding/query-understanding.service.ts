import "server-only";

import { z } from "zod";

import { classifyIntent } from "@/server/query-understanding/intent-classifier.service";

import { extractTopic } from "@/server/query-understanding/topic-extractor.service";

import { resolveNaturalLanguageDate } from "@/server/query-understanding/date-resolver.service";

const inputSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  timezone: z.string().min(1).default("UTC"),
  referenceDate: z.string().datetime({ offset: true }).optional(),
});

export type UnderstandQueryInput = z.input<typeof inputSchema>;

export async function understandQuery(input: UnderstandQueryInput) {
  const validated = inputSchema.parse(input);

  // Intent and topic extraction are independent, so run them together.
  const [intent, topic] = await Promise.all([
    classifyIntent(validated.question),
    extractTopic(validated.question),
  ]);

  let dateResolution: ReturnType<typeof resolveNaturalLanguageDate> | null =
    null;

  let dateResolutionError: string | null = null;

  if (intent.datePhrase) {
    try {
      dateResolution = resolveNaturalLanguageDate({
        phrase: intent.datePhrase,
        timezone: validated.timezone,
        referenceDate: validated.referenceDate,
      });
    } catch (error) {
      dateResolutionError =
        error instanceof Error ? error.message : "Unable to resolve the date.";
    }
  }

  const needsClarification =
    (intent.intent === "historical_recall" ||
      intent.intent === "change_detection") &&
    Boolean(intent.datePhrase) &&
    !dateResolution;

  return {
    originalQuestion: validated.question,
    timezone: validated.timezone,

    intent,
    topic,

    date: dateResolution
      ? {
          phrase: dateResolution.originalPhrase,
          resolvedDate: dateResolution.resolvedDate,
          referenceLocalDate: dateResolution.referenceLocalDate,
          resolutionType: dateResolution.resolutionType,
        }
      : null,

    dateResolutionError,
    needsClarification,
  };
}

export type UnderstoodQuery = Awaited<ReturnType<typeof understandQuery>>;
