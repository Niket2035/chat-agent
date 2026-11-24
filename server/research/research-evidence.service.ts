import "server-only";

import type { EntityType } from "@/src/generated/prisma/client";

import {
  createResearchSession,
  completeResearchSession,
  failResearchSession,
} from "@/server/repositories/research-session.repository";

import {
  resolveAndLinkEntities,
  normalizeEntityName,
} from "@/server/repositories/entity.repository";

import { saveResearchSource } from "@/server/repositories/source.repository";
import { saveResearchFacts } from "@/server/repositories/research-fact.repository";

import { extractFactsFromSource } from "@/server/research/fact-extractor.service";
import { compareResearchSessionFacts } from "@/server/research/temporal-comparison.service";

interface ResearchSourceInput {
  title: string;
  url: string;
  domain: string;
  content: string;
  publishedDate: string | null;
}

interface ResearchEntityInput {
  name: string;
  type: string;
}

function toEntityType(type: string): EntityType {
  const normalized = type.toLowerCase();

  switch (normalized) {
    case "company":
      return "COMPANY";
    case "product":
      return "PRODUCT";
    case "service":
      return "SERVICE";
    case "technology":
      return "TECHNOLOGY";
    default:
      // The existing database enum has no PERSON member.
      return "OTHER";
  }
}

function parsePublishedDate(value: string | null): Date | null {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function processResearchEvidence(input: {
  userId: string;
  conversationId: string;
  topic: string;
  entities: ResearchEntityInput[];
  sources: ResearchSourceInput[];
}) {
  const session = await createResearchSession({
    userId: input.userId,
    conversationId: input.conversationId,
    topic: input.topic,
  });

  try {
    // Resolve and associate all entities with this session.
    const resolvedEntities = await resolveAndLinkEntities({
      researchSessionId: session.id,
      entities: input.entities.map((entity) => ({
        name: entity.name,
        type: toEntityType(entity.type),
      })),
    });

    const entityNames = resolvedEntities.map((entity) => entity.name);
    const persistedSources = [];
    let extractedFactCount = 0;

    for (const source of input.sources) {
      const savedSource = await saveResearchSource({
        researchSessionId: session.id,
        title: source.title,
        url: source.url,
        domain: source.domain,
        snippet: source.content,
        publishedAt: parsePublishedDate(source.publishedDate),
      });

      persistedSources.push(savedSource);

      const facts = await extractFactsFromSource({
        title: source.title,
        url: source.url,
        content: source.content,
        knownEntities: entityNames,
      });

      // Only persist facts for entities linked to this research session.
      const allowedEntityNames = new Set(
        resolvedEntities.map((entity) => normalizeEntityName(entity.name)),
      );

      const supportedFacts = facts.filter((fact) =>
        allowedEntityNames.has(normalizeEntityName(fact.entityName)),
      );

      const safeFacts = supportedFacts.map((fact) => ({
        ...fact,
        effectiveAt:
          fact.effectiveAt &&
          !Number.isNaN(new Date(fact.effectiveAt).getTime())
            ? new Date(fact.effectiveAt).toISOString()
            : null,
      }));

      const savedFacts = await saveResearchFacts({
        researchSessionId: session.id,
        sourceId: savedSource.id,
        facts: safeFacts,
      });

      extractedFactCount += savedFacts.length;
    }

    // Compare the newly saved facts with earlier observations.
    const comparisons = await compareResearchSessionFacts({
      researchSessionId: session.id,
      userId: input.userId,
    });

    await completeResearchSession({
      sessionId: session.id,
      userId: input.userId,
      summary: `Research completed. ${resolvedEntities.length} entities, ${persistedSources.length} sources, ${extractedFactCount} facts.`,
    });

    return {
      researchSessionId: session.id,
      entities: resolvedEntities,
      sources: persistedSources,
      extractedFactCount,
      comparisons,
    };
  } catch (error) {
    await failResearchSession({
      sessionId: session.id,
      userId: input.userId,
    });

    throw error;
  }
}
