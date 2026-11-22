import "server-only";

import { prisma } from "@/server/db/prisma";

export interface CreateConversationInput {
  userId: string;
  title?: string;
}

export interface GetConversationInput {
  conversationId: string;
  userId: string;
}

export interface ListConversationsInput {
  userId: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateConversationTitleInput {
  conversationId: string;
  userId: string;
  title: string;
}


//   Create a new conversation.

export async function createConversation(input: CreateConversationInput) {
  const title = input.title?.trim() || "New conversation";

  return prisma.conversation.create({
    data: {
      userId: input.userId,
      title,
    },
  });
}


 // Retrieve a conversation belonging to a specific user.
 
export async function getConversationById(input: GetConversationInput) {
  return prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      userId: input.userId,
    },
  });
}


 // List conversations with pagination.

export async function listConversations(input: ListConversationsInput) {
  const page = Math.max(1, input.page ?? 1);

  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? 20));

  const skip = (page - 1) * pageSize;

  const [conversations, total] = await prisma.$transaction([
    prisma.conversation.findMany({
      where: {
        userId: input.userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      skip,
      take: pageSize,
    }),

    prisma.conversation.count({
      where: {
        userId: input.userId,
      },
    }),
  ]);

  return {
    conversations,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}


 // Update the title of a conversation belonging to a user.

export async function updateConversationTitle(
  input: UpdateConversationTitleInput,
) {
  const title = input.title.trim();

  if (!title) {
    throw new Error("Conversation title cannot be empty.");
  }

  if (title.length > 120) {
    throw new Error("Conversation title cannot exceed 120 characters.");
  }

  const result = await prisma.conversation.updateMany({
    where: {
      id: input.conversationId,
      userId: input.userId,
    },
    data: {
      title,
    },
  });

  if (result.count === 0) {
    return null;
  }

  return prisma.conversation.findFirst({
    where: {
      id: input.conversationId,
      userId: input.userId,
    },
  });
}
