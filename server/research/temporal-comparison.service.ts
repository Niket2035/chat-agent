import "server-only";

import { prisma } from "@/server/db/prisma";

export type FactChangeType =
  | "NEW"
  | "CHANGED"
  | "UNCHANGED"
  | "INSUFFICIENT_EVIDENCE";

export interface FactComparison {
  entityName: string;
  attribute: string;
  changeType: FactChangeType;
  previous: {
    value: unknown;
    normalizedValue: string | null;
    currency: string | null;
    unit: string | null;
    observedAt: Date;
    sourceUrl: string | null;
  } | null;
  current: {
    value: unknown;
    normalizedValue: string | null;
    currency: string | null;
    unit: string | null;
    observedAt: Date;
    sourceUrl: string | null;
  };
  explanation: string;
}

function comparableValue(fact: {
  normalizedValue: string | null;
  value: unknown;
}) {
  return fact.normalizedValue ?? JSON.stringify(fact.value);
}

export async function compareResearchSessionFacts(input: {
  researchSessionId: string;
  userId: string;
}): Promise<FactComparison[]> {
  const session = await prisma.researchSession.findFirst({
    where: {
      id: input.researchSessionId,
      conversation: {
        is: {
          userId: input.userId,
        },
      },
    },
    select: {
      id: true,
      startedAt: true,
    },
  });

  if (!session) {
    throw new Error("Research session not found.");
  }

  const currentFacts = await prisma.researchFact.findMany({
    where: {
      researchSessionId: session.id,
    },
    include: {
      entity: true,
      source: {
        select: {
          url: true,
        },
      },
    },
    orderBy: {
      observedAt: "asc",
    },
  });

  const comparisons: FactComparison[] = [];

  for (const current of currentFacts) {
    const previous = await prisma.researchFact.findFirst({
      where: {
        entityId: current.entityId,
        attribute: current.attribute,
        researchSessionId: {
          not: session.id,
        },
        observedAt: {
          lt: session.startedAt,
        },
      },
      include: {
        source: {
          select: {
            url: true,
          },
        },
      },
      orderBy: {
        observedAt: "desc",
      },
    });

    const currentEvidence = {
      value: current.value,
      normalizedValue: current.normalizedValue,
      currency: current.currency,
      unit: current.unit,
      observedAt: current.observedAt,
      sourceUrl: current.source?.url ?? null,
    };

    if (!previous) {
      comparisons.push({
        entityName: current.entity.name,
        attribute: current.attribute,
        changeType: "NEW",
        previous: null,
        current: currentEvidence,
        explanation: "No earlier stored observation was found.",
      });
      continue;
    }

    const previousEvidence = {
      value: previous.value,
      normalizedValue: previous.normalizedValue,
      currency: previous.currency,
      unit: previous.unit,
      observedAt: previous.observedAt,
      sourceUrl: previous.source?.url ?? null,
    };

    const valuesMatch = comparableValue(previous) === comparableValue(current);

    const unitsMatch = previous.unit === current.unit;
    const currenciesMatch = previous.currency === current.currency;

    if (valuesMatch && unitsMatch && currenciesMatch) {
      comparisons.push({
        entityName: current.entity.name,
        attribute: current.attribute,
        changeType: "UNCHANGED",
        previous: previousEvidence,
        current: currentEvidence,
        explanation: "The observed value, unit, and currency match.",
      });
    } else if (
      previous.currency !== current.currency ||
      previous.unit !== current.unit
    ) {
      comparisons.push({
        entityName: current.entity.name,
        attribute: current.attribute,
        changeType: "INSUFFICIENT_EVIDENCE",
        previous: previousEvidence,
        current: currentEvidence,
        explanation:
          "The units or currencies differ, so a direct comparison is not reliable.",
      });
    } else {
      comparisons.push({
        entityName: current.entity.name,
        attribute: current.attribute,
        changeType: "CHANGED",
        previous: previousEvidence,
        current: currentEvidence,
        explanation:
          "The latest observed value differs from the previous observation.",
      });
    }
  }

  return comparisons;
}
