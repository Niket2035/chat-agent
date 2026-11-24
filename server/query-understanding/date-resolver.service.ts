import "server-only";

import { z } from "zod";
import { addDays, format, isValid, parseISO } from "date-fns";

const dateResolverSchema = z.object({
  phrase: z.string().trim().min(1).max(100),
  timezone: z.string().min(1).default("UTC"),
  // Optional reference time makes the resolver easy to test.
  referenceDate: z.string().datetime({ offset: true }).optional(),
});

export type DateResolverInput = z.input<typeof dateResolverSchema>;

export interface ResolvedDate {
  originalPhrase: string;
  resolvedDate: string;
  timezone: string;
  referenceLocalDate: string;
  resolutionType: "relative" | "weekday" | "explicit";
}

const weekdays: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const months: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function getLocalDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(date: string, amount: number): string {
  const parsed = parseISO(`${date}T00:00:00Z`);
  return format(addDays(parsed, amount), "yyyy-MM-dd");
}

function getWeekday(date: string): number {
  return parseISO(`${date}T00:00:00Z`).getUTCDay();
}

function getMonday(date: string): string {
  const weekday = getWeekday(date);
  const daysSinceMonday = (weekday + 6) % 7;
  return addCalendarDays(date, -daysSinceMonday);
}

function resolveWeekday(
  phrase: string,
  referenceLocalDate: string,
): string | null {
  const match = phrase.match(
    /^(last|this|next)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/,
  );

  if (!match) return null;

  const [, direction, weekdayName] = match;
  const targetDay = weekdays[weekdayName];
  const currentDay = getWeekday(referenceLocalDate);

  if (direction === "last") {
    const difference = (currentDay - targetDay + 7) % 7 || 7;
    return addCalendarDays(referenceLocalDate, -difference);
  }

  if (direction === "next") {
    const difference = (targetDay - currentDay + 7) % 7 || 7;
    return addCalendarDays(referenceLocalDate, difference);
  }

  // "This Tuesday" means Tuesday in the current Monday–Sunday week.
  const monday = getMonday(referenceLocalDate);
  const offset = (targetDay + 6) % 7;

  return addCalendarDays(monday, offset);
}

function resolveMonthDay(
  phrase: string,
  referenceLocalDate: string,
): string | null {
  const match = phrase.match(
    /^(?:(?:on|the)\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?$/,
  );

  if (!match) return null;

  const [, dayText, monthText, yearText] = match;
  const month = months[monthText];

  if (month === undefined) return null;

  const day = Number(dayText);
  const currentYear = Number(referenceLocalDate.slice(0, 4));

  let year = yearText ? Number(yearText) : currentYear;

  const buildDate = (candidateYear: number) => {
    const candidate = new Date(Date.UTC(candidateYear, month, day));

    if (
      candidate.getUTCFullYear() !== candidateYear ||
      candidate.getUTCMonth() !== month ||
      candidate.getUTCDate() !== day
    ) {
      return null;
    }

    return format(candidate, "yyyy-MM-dd");
  };

  let result = buildDate(year);

  if (!result) {
    throw new Error("The specified calendar date is invalid.");
  }

  // Without a year, interpret a future date as the most recent past occurrence.
  if (!yearText && result > referenceLocalDate) {
    year -= 1;
    result = buildDate(year);
  }

  return result;
}

export function resolveNaturalLanguageDate(
  input: DateResolverInput,
): ResolvedDate {
  const validated = dateResolverSchema.parse(input);

  const phrase = validated.phrase
    .toLowerCase()
    .replace(/[,?.!]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const timezone = validated.timezone;

  // Validate timezone before doing any date calculations.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  const referenceInstant = validated.referenceDate
    ? new Date(validated.referenceDate)
    : new Date();

  if (!isValid(referenceInstant)) {
    throw new Error("Invalid reference date.");
  }

  const referenceLocalDate = getLocalDate(referenceInstant, timezone);

  let resolvedDate: string | null = null;
  let resolutionType: ResolvedDate["resolutionType"] = "relative";

  if (phrase === "today") {
    resolvedDate = referenceLocalDate;
  } else if (phrase === "yesterday") {
    resolvedDate = addCalendarDays(referenceLocalDate, -1);
  } else if (phrase === "tomorrow") {
    resolvedDate = addCalendarDays(referenceLocalDate, 1);
  } else if (phrase === "day before yesterday") {
    resolvedDate = addCalendarDays(referenceLocalDate, -2);
  } else {
    resolvedDate = resolveWeekday(phrase, referenceLocalDate);

    if (resolvedDate) {
      resolutionType = "weekday";
    } else {
      // Accept YYYY-MM-DD.
      if (/^\d{4}-\d{2}-\d{2}$/.test(phrase)) {
        const parsed = parseISO(phrase);

        if (isValid(parsed) && format(parsed, "yyyy-MM-dd") === phrase) {
          resolvedDate = phrase;
          resolutionType = "explicit";
        } else {
          throw new Error("The specified calendar date is invalid.");
        }
      } else {
        resolvedDate = resolveMonthDay(phrase, referenceLocalDate);

        if (resolvedDate) {
          resolutionType = "explicit";
        }
      }
    }
  }

  if (!resolvedDate) {
    throw new Error(`Unsupported date phrase: "${validated.phrase}".`);
  }

  return {
    originalPhrase: validated.phrase,
    resolvedDate,
    timezone,
    referenceLocalDate,
    resolutionType,
  };
}
