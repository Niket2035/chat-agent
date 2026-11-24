import "server-only";

import { z } from "zod";

import type { UnderstoodQuery } from "@/server/query-understanding/query-understanding.service";

const plannerOutputSchema = z.object({
  actions: z.array(z.enum(["memory_search", "web_search", "compare"])),

  memorySearch: z.object({
    required: z.boolean(),
    date: z.string().nullable(),
    topic: z.string().nullable(),
  }),

  webSearch: z.object({
    required: z.boolean(),
    queries: z.array(z.string().min(3).max(200)).max(5),
  }),

  comparison: z.object({
    required: z.boolean(),
    baselineDate: z.string().nullable(),
  }),

  requiresClarification: z.boolean(),
  clarificationReason: z.string().nullable(),
});

export type SearchPlan = z.infer<typeof plannerOutputSchema>;

export function createSearchPlan(query: UnderstoodQuery): SearchPlan {
  const intent = query.intent.intent;
  const date = query.date?.resolvedDate ?? null;
  const topic = query.topic.searchTopic;

  let plan: SearchPlan;

  switch (intent) {
    case "historical_recall": {
      plan = {
        actions: ["memory_search"],

        memorySearch: {
          required: true,
          date,
          topic,
        },

        webSearch: {
          required: false,
          queries: [],
        },

        comparison: {
          required: false,
          baselineDate: null,
        },

        requiresClarification: query.needsClarification,
        clarificationReason: query.dateResolutionError,
      };

      break;
    }

    case "current_research": {
      plan = {
        actions: ["web_search"],

        memorySearch: {
          required: false,
          date: null,
          topic: null,
        },

        webSearch: {
          required: true,
          queries: [query.topic.searchTopic],
        },

        comparison: {
          required: false,
          baselineDate: null,
        },

        requiresClarification: false,
        clarificationReason: null,
      };

      break;
    }

    case "change_detection": {
      const canCompare = Boolean(date);

      plan = {
        actions: canCompare ? ["memory_search", "web_search", "compare"] : [],

        memorySearch: {
          required: true,
          date,
          topic,
        },

        webSearch: {
          required: true,
          queries: [
            `${topic} current information`,
            `${topic} recent changes updates pricing`,
          ],
        },

        comparison: {
          required: true,
          baselineDate: date,
        },

        requiresClarification: !date || query.needsClarification,

        clarificationReason: !date
          ? "Which date or time period should I search in your conversation history?"
          : query.dateResolutionError,
      };

      break;
    }

    case "general_chat": {
      plan = {
        actions: [],

        memorySearch: {
          required: false,
          date: null,
          topic: null,
        },

        webSearch: {
          required: false,
          queries: [],
        },

        comparison: {
          required: false,
          baselineDate: null,
        },

        requiresClarification: false,
        clarificationReason: null,
      };

      break;
    }
  }

  return plannerOutputSchema.parse(plan);
}
