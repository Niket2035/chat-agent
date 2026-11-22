
import "server-only";

import { z } from "zod";
import { addDays, format, isValid, parseISO } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

import type { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

// Validate incoming retrieval requests.
const memorySearchSchema = z.object({
  userId: z.string().min(1),
  date: z.string().regex(
    /^\d{4}-\d{2}-\d{2}$/,
    "Date must use YYYY-MM-DD format."
  ),
  timezone: z.string().min(1).default("UTC"),
  query: z.string().trim().max(200).optional(),
  maxResults: z.number().int().min(1).max(50).default(30),
});

export type MemorySearchInput = z.input<
  typeof memorySearchSchema
>;

/**
 * Convert a local calendar date into a UTC date range.
 *
 * Example:
 * Local date: 2026-11-03
 * Timezone: Asia/Kolkata
 *
 * The result is the UTC interval covering that
 * entire local calendar day.
 */
function getUtcDateRange(date: string, timezone: string) {
  const parsedDate = parseISO(date);

  if (!isValid(parsedDate) || format(parsedDate, "yyyy-MM-dd") !== date) {
    throw new Error("Invalid calendar date.");
  }

  // Validate the timezone identifier.
  try {
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    });
  } catch {
    throw new Error("Invalid timezone.");
  }

  const nextDate = format(
    addDays(parsedDate, 1),
    "yyyy-MM-dd"
  );

  const start = fromZonedTime(
    `${date}T00:00:00`,
    timezone
  );

  const end = fromZonedTime(
    `${nextDate}T00:00:00`,
    timezone
  );

  return { start, end };
}

/**
 * Search historical messages for a user on a specific
 * local calendar date.
 *
 * If query is provided, match message content or
 * conversation title.
 */
export async function searchMemoryByDate(
  input: MemorySearchInput
) {
  const validated = memorySearchSchema.parse(input);

  const { userId, date, timezone, query, maxResults } =
    validated;

  const { start, end } = getUtcDateRange(date, timezone);

  const normalizedQuery = query?.trim();

  const conditions: Prisma.MessageWhereInput[] = [
    {
      conversation: {
        is: {
          userId,
        },
      },
    },
    {
      createdAt: {
        gte: start,
        lt: end,
      },
    },
  ];

  if (normalizedQuery) {
    conditions.push({
      OR: [
        {
          content: {
            contains: normalizedQuery,
            mode: "insensitive",
          },
        },
        {
          conversation: {
            is: {
              userId,
              title: {
                contains: normalizedQuery,
                mode: "insensitive",
              },
            },
          },
        },
      ],
    });
  }

  const messages = await prisma.message.findMany({
    where: {
      AND: conditions,
    },
    select: {
      id: true,
      role: true,
      content: true,
      metadata: true,
      createdAt: true,
      conversation: {
        select: {
          id: true,
          title: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { createdAt: "asc" },
      { id: "asc" },
    ],
    take: maxResults + 1,
  });

  const hasMore = messages.length > maxResults;
  const results = messages.slice(0, maxResults);

  return {
    searchedDate: date,
    timezone,
    query: normalizedQuery ?? null,
    searchedAt: new Date(),
    resultCount: results.length,
    hasMore,
    dateRangeUtc: {
      start: start.toISOString(),
      end: end.toISOString(),
    },
    messages: results,
  };
}
