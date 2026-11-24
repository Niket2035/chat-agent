import "server-only";

import type { ResearchStatus } from "@/src/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export interface CreateResearchSessionInput {
  conversationId: string;
  userId: string;
  topic: string;
}

export interface GetResearchSessionInput {
  sessionId: string;
  userId: string;
}

export interface ListResearchSessionsInput {
  conversationId: string;
  userId: string;
  page?: number;
  pageSize?: number;
  status?: ResearchStatus;
}

export interface CompleteResearchSessionInput {
  sessionId: string;
  userId: string;
  summary?: string;
}

// 1. Create a research session
export async function createResearchSession(input: CreateResearchSessionInput) {
  const topic = input.topic.trim();

  if (!topic) {
    throw new Error("Research topic cannot be empty.");
  }

  if (topic.length > 200) {
    throw new Error("Research topic cannot exceed 200 characters.");
  }

  // Verify that the conversation belongs to this user.
  const conversation = await prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      userId: input.userId,
    },
    select: {
      id: true,
    },
  });

  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  return prisma.researchSession.create({
    data: {
      conversationId: conversation.id,
      topic,
      status: "IN_PROGRESS",
    },
  });
}

// 2. Get one research session
export async function getResearchSessionById(input: GetResearchSessionInput) {
  return prisma.researchSession.findFirst({
    where: {
      id: input.sessionId,
      conversation: {
        is: {
          userId: input.userId,
        },
      },
    },
    include: {
      _count: {
        select: {
          entities: true,
          facts: true,
          sources: true,
          searchLogs: true,
        },
      },
    },
  });
}

// 3. List research sessions for a conversation
export async function listResearchSessions(input: ListResearchSessionsInput) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where = {
    conversationId: input.conversationId,
    conversation: {
      is: {
        userId: input.userId,
      },
    },
    ...(input.status ? { status: input.status } : {}),
  };

  const [sessions, total] = await prisma.$transaction([
    prisma.researchSession.findMany({
      where,
      orderBy: {
        startedAt: "desc",
      },
      skip,
      take: pageSize,
      include: {
        _count: {
          select: {
            entities: true,
            facts: true,
            sources: true,
            searchLogs: true,
          },
        },
      },
    }),

    prisma.researchSession.count({ where }),
  ]);

  return {
    sessions,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// 4. Mark research as completed
export async function completeResearchSession(
  input: CompleteResearchSessionInput,
) {
  const summary = input.summary?.trim();

  if (summary !== undefined && summary.length > 10000) {
    throw new Error("Research summary cannot exceed 10000 characters.");
  }

  const result = await prisma.researchSession.updateMany({
    where: {
      id: input.sessionId,
      status: "IN_PROGRESS",
      conversation: {
        is: {
          userId: input.userId,
        },
      },
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      ...(summary !== undefined ? { summary } : {}),
    },
  });

  if (result.count === 0) {
    return null;
  }

  return getResearchSessionById({
    sessionId: input.sessionId,
    userId: input.userId,
  });
}

// 5. Mark research as failed
export async function failResearchSession(input: GetResearchSessionInput) {
  const result = await prisma.researchSession.updateMany({
    where: {
      id: input.sessionId,
      status: "IN_PROGRESS",
      conversation: {
        is: {
          userId: input.userId,
        },
      },
    },
    data: {
      status: "FAILED",
      completedAt: new Date(),
    },
  });

  if (result.count === 0) {
    return null;
  }

  return getResearchSessionById(input);
}
