
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";

import {
  createConversation,
} from "@/server/repositories/conversation.repository";

import {
  searchMemoryByDate,
} from "@/server/memory/memory-retrieval.service";

import {
  buildMemoryContext,
} from "@/server/memory/memory-context.service";


const requestSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  let testConversationId: string | undefined;

  try {
    const body = await request.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "A valid userId is required.",
        },
        { status: 400 }
      );
    }

    const { userId } = validation.data;

    // Verify that the supplied user exists.
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Test user not found.",
        },
        { status: 404 }
      );
    }

    // Use a unique token so unrelated historical messages
    // cannot affect this test.
    const testToken = "MEMORY_VERIFY_20261103_X7Q9";

    // Create a temporary test conversation.
    const conversation = await createConversation({
      userId: user.id,
      title: `Memory verification ${testToken}`,
    });

    testConversationId = conversation.id;

    // 3 November 2026, 00:05 IST.
    const firstTimestamp = new Date(
      "2026-11-02T18:35:00.000Z"
    );

    // 3 November 2026, 00:06 IST.
    const secondTimestamp = new Date(
      "2026-11-02T18:36:00.000Z"
    );

    // Insert test messages with fixed historical timestamps.
    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          role: "USER",
          content: `${testToken}: What are the best PostgreSQL hosting options?`,
          createdAt: firstTimestamp,
        },
        {
          conversationId: conversation.id,
          role: "ASSISTANT",
          content: `${testToken}: Here are some PostgreSQL hosting providers.`,
          createdAt: secondTimestamp,
        },
      ],
    });

    // TEST 1: Exact date + topic retrieval.
    const memory = await searchMemoryByDate({
      userId: user.id,
      date: "2026-11-03",
      timezone: "Asia/Kolkata",
      query: testToken,
      maxResults: 10,
    });

    const dateAndTopicPassed =
      memory.messages.length === 2 &&
      memory.messages[0].role === "USER" &&
      memory.messages[1].role === "ASSISTANT" &&
      memory.messages[0].createdAt.getTime() <
        memory.messages[1].createdAt.getTime();

    // TEST 2: Wrong date should not return these messages.
    const wrongDateMemory = await searchMemoryByDate({
      userId: user.id,
      date: "2026-11-04",
      timezone: "Asia/Kolkata",
      query: testToken,
      maxResults: 10,
    });

    const wrongDatePassed =
      wrongDateMemory.messages.length === 0;

    // TEST 3: Missing topic should return no matches.
    const missingMemory = await searchMemoryByDate({
      userId: user.id,
      date: "2026-11-03",
      timezone: "Asia/Kolkata",
      query: "NO_MATCH_TOKEN_ABC987",
      maxResults: 10,
    });

    const missingMemoryPassed =
      missingMemory.messages.length === 0;

    // TEST 4: Another user must not retrieve these messages.
    const otherUserMemory = await searchMemoryByDate({
      userId: `${user.id}_not_the_owner`,
      date: "2026-11-03",
      timezone: "Asia/Kolkata",
      query: testToken,
      maxResults: 10,
    });

    const ownershipPassed =
      otherUserMemory.messages.length === 0;

    // TEST 5: Context builder must preserve the messages.
    const context = buildMemoryContext({
      memory,
      currentQuestion:
        "What did I ask about PostgreSQL on 3 November?",
      maxMessages: 10,
    });

    const contextPassed =
      context.includedMessages === 2 &&
      context.messages[0].role === "USER" &&
      context.messages[1].role === "ASSISTANT" &&
      context.memoryContext.includes(testToken);

    const tests = {
      dateAndTopic: dateAndTopicPassed,
      wrongDate: wrongDatePassed,
      missingMemory: missingMemoryPassed,
      ownership: ownershipPassed,
      contextBuilder: contextPassed,
    };

    const passed = Object.values(tests).filter(Boolean).length;
    const total = Object.keys(tests).length;

    return NextResponse.json({
      success: passed === total,
      summary: {
        passed,
        total,
        failed: total - passed,
      },
      tests,
      details: {
        searchedDate: memory.searchedDate,
        timezone: memory.timezone,
        retrievedMessages: memory.messages.length,
        includedMessages: context.includedMessages,
        utcDateRange: memory.dateRangeUtc,
      },
    });

  } catch (error) {
    console.error("[Memory Verification Error]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Memory verification failed.",
      },
      { status: 500 }
    );

  } finally {
    // Remove only the temporary test conversation and its messages.
    if (testConversationId) {
      try {
        await prisma.message.deleteMany({
          where: {
            conversationId: testConversationId,
          },
        });

        await prisma.conversation.deleteMany({
          where: {
            id: testConversationId,
          },
        });
      } catch (cleanupError) {
        console.error(
          "[Memory Verification Cleanup Error]",
          cleanupError
        );
      }
    }
  }
}
