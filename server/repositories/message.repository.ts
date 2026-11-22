import "server-only";

import type { MessageRole, Prisma } from "@/src/generated/prisma/client";

import { prisma } from "@/server/db/prisma";

export interface CreateMessageInput {
  conversationId: string;
  userId: string;
  role: MessageRole;
  content: string;
  metadata?: Prisma.InputJsonValue;
}

export interface GetConversationMessagesInput {
  conversationId: string;
  userId: string;
  page?: number;
  pageSize?: number;
}

export interface GetLatestMessagesInput {
  conversationId: string;
  userId: string;
  limit?: number;
}

/**
 * Save a new message to a conversation.
 */
export async function createMessage(input: CreateMessageInput) {
  const content = input.content.trim();

  if (!content) {
    throw new Error("Message content cannot be empty.");
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

  return prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: input.role,
      content,
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    },
  });
}

/**
 * Retrieve conversation messages with pagination.
 * Messages are returned oldest first.
 */
export async function getConversationMessages(
  input: GetConversationMessagesInput,
) {
  const page = Math.max(1, input.page ?? 1);

  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 30));

  const skip = (page - 1) * pageSize;

  const where = {
    conversationId: input.conversationId,
    conversation: {
      is: {
        userId: input.userId,
      },
    },
  };

  const [messages, total] = await prisma.$transaction([
    prisma.message.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: pageSize,
    }),

    prisma.message.count({ where }),
  ]);

  return {
    messages,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

/**
 * Retrieve the latest N messages for AI context.
 * Return them in chronological order.
 */
export async function getLatestMessages(input: GetLatestMessagesInput) {
  const limit = Math.min(100, Math.max(1, input.limit ?? 20));

  const messages = await prisma.message.findMany({
    where: {
      conversationId: input.conversationId,
      conversation: {
        is: {
          userId: input.userId,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });

  // The database returns newest first.
  // Reverse so Gemini receives messages chronologically.
  return messages.reverse();
}

/**
 * Count messages in a conversation.
 */
export async function getMessageCount(input: {
  conversationId: string;
  userId: string;
}) {
  return prisma.message.count({
    where: {
      conversationId: input.conversationId,
      conversation: {
        is: {
          userId: input.userId,
        },
      },
    },
  });
}
