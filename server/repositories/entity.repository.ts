import "server-only";

import type { EntityType } from "@/src/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export interface ResolveEntityInput {
  name: string;
  type: EntityType;
}

const aliases: Record<string, string> = {
  postgres: "postgresql",
  "postgre sql": "postgresql",
  "amazon web services": "aws",
  "microsoft azure": "azure",
  "google cloud platform": "google cloud",
};

export function normalizeEntityName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  return aliases[cleaned] ?? cleaned;
}

export async function resolveEntity(input: ResolveEntityInput) {
  const name = input.name.trim();

  if (!name || name.length > 150) {
    throw new Error("Entity name must contain 1–150 characters.");
  }

  const canonicalName = normalizeEntityName(name);

  return prisma.entity.upsert({
    where: {
      canonicalName_type: {
        canonicalName,
        type: input.type,
      },
    },
    create: {
      name,
      canonicalName,
      type: input.type,
    },
    update: {
      // Keep the original display name stable.
    },
  });
}

export async function linkEntityToResearchSession(input: {
  researchSessionId: string;
  entityId: string;
}) {
  return prisma.researchSessionEntity.upsert({
    where: {
      researchSessionId_entityId: {
        researchSessionId: input.researchSessionId,
        entityId: input.entityId,
      },
    },
    create: {
      researchSessionId: input.researchSessionId,
      entityId: input.entityId,
    },
    update: {},
  });
}

export async function resolveAndLinkEntities(input: {
  researchSessionId: string;
  entities: ResolveEntityInput[];
}) {
  const unique = new Map<string, ResolveEntityInput>();

  for (const entity of input.entities) {
    const canonicalName = normalizeEntityName(entity.name);
    unique.set(`${canonicalName}:${entity.type}`, entity);
  }

  const results = [];

  for (const entityInput of unique.values()) {
    const entity = await resolveEntity(entityInput);

    await linkEntityToResearchSession({
      researchSessionId: input.researchSessionId,
      entityId: entity.id,
    });

    results.push(entity);
  }

  return results;
}
