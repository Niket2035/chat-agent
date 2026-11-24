import "server-only";

import type { Prisma } from "@/src/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { ExtractedFact } from "@/server/research/fact-extractor.service";
import { normalizeEntityName } from "@/server/repositories/entity.repository";

export interface SaveResearchFactsInput {
  researchSessionId: string;
  sourceId: string;
  facts: ExtractedFact[];
  observedAt?: Date;
}

export async function saveResearchFacts(input: SaveResearchFactsInput) {
  const observedAt = input.observedAt ?? new Date();

  const savedFacts = [];

  for (const fact of input.facts) {
    const canonicalName = normalizeEntityName(fact.entityName);

    const entity = await prisma.entity.findFirst({
      where: {
        canonicalName,
      },
    });

    if (!entity) {
      // Do not create an entity from an unsupported fact.
      continue;
    }

    const value: Prisma.InputJsonValue = fact.value;

    const saved = await prisma.researchFact.create({
      data: {
        researchSessionId: input.researchSessionId,
        entityId: entity.id,
        sourceId: input.sourceId,
        attribute: fact.attribute,
        value,
        normalizedValue: fact.normalizedValue,
        unit: fact.unit,
        currency: fact.currency,
        effectiveAt: fact.effectiveAt ? new Date(fact.effectiveAt) : null,
        observedAt,
        confidence: fact.confidence,
        notes: fact.notes,
      },
    });

    savedFacts.push(saved);
  }

  return savedFacts;
}
