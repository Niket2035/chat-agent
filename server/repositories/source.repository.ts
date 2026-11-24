import "server-only";

import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";

export interface SaveSourceInput {
  researchSessionId: string;
  title: string;
  url: string;
  domain?: string;
  snippet?: string;
  publishedAt?: Date | null;
}

function createContentHash(input: {
  url: string;
  title: string;
  snippet: string;
}) {
  return createHash("sha256")
    .update(`${input.url}|${input.title}|${input.snippet}`)
    .digest("hex");
}

export async function saveResearchSource(input: SaveSourceInput) {
  const url = new URL(input.url);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS sources are supported.");
  }

  const title = input.title.trim();
  if (!title) {
    throw new Error("Source title cannot be empty.");
  }

  const snippet = input.snippet?.trim() ?? "";
  const domain = input.domain?.trim() || url.hostname;
  const contentHash = createContentHash({
    url: url.toString(),
    title,
    snippet,
  });

  // Avoid duplicate sources in the same research session.
  const existing = await prisma.source.findFirst({
    where: {
      researchSessionId: input.researchSessionId,
      url: url.toString(),
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.source.create({
    data: {
      researchSessionId: input.researchSessionId,
      title,
      url: url.toString(),
      domain,
      snippet,
      publishedAt: input.publishedAt ?? null,
      retrievedAt: new Date(),
      contentHash,
    },
  });
}

export async function listResearchSources(input: {
  researchSessionId: string;
  userId: string;
}) {
  return prisma.source.findMany({
    where: {
      researchSessionId: input.researchSessionId,
      researchSession: {
        is: {
          conversation: {
            is: {
              userId: input.userId,
            },
          },
        },
      },
    },
    orderBy: {
      retrievedAt: "desc",
    },
  });
}
