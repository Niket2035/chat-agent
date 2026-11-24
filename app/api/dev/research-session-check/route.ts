
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { createConversation } from "@/server/repositories/conversation.repository";

import {
  createResearchSession,
  getResearchSessionById,
  listResearchSessions,
  completeResearchSession,
  failResearchSession,
} from "@/server/repositories/research-session.repository";


const requestSchema = z.object({
  userId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  let conversationId: string | undefined;
  const sessionIds: string[] = [];

  try {
    const body = await request.json();
    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, message: "A valid userId is required." },
        { status: 400 }
      );
    }

    const { userId } = validation.data;

    const conversation = await createConversation({
      userId,
      title: "Research session repository test",
    });

    conversationId = conversation.id;

    // Test 1: Create a session
    const session = await createResearchSession({
      conversationId,
      userId,
      topic: "PostgreSQL hosting pricing",
    });

    sessionIds.push(session.id);

    if (session.status !== "IN_PROGRESS") {
      throw new Error("New research session did not start as IN_PROGRESS.");
    }

    // Test 2: Retrieve a session
    const retrieved = await getResearchSessionById({
      sessionId: session.id,
      userId,
    });

    if (!retrieved || retrieved.id !== session.id) {
      throw new Error("Unable to retrieve the created research session.");
    }

    // Test 3: List sessions
    const listed = await listResearchSessions({
      conversationId,
      userId,
      page: 1,
      pageSize: 10,
    });

    if (!listed.sessions.some((item) => item.id === session.id)) {
      throw new Error("Created session was not found in the session list.");
    }

    // Test 4: Complete the first session
    const completed = await completeResearchSession({
      sessionId: session.id,
      userId,
      summary: "Test research session completed successfully.",
    });

    if (
      !completed ||
      completed.status !== "COMPLETED" ||
      !completed.completedAt
    ) {
      throw new Error("Research session completion failed.");
    }

    // Test 5: Fail a second session
    const secondSession = await createResearchSession({
      conversationId,
      userId,
      topic: "MongoDB hosting options",
    });

    sessionIds.push(secondSession.id);

    const failed = await failResearchSession({
      sessionId: secondSession.id,
      userId,
    });

    if (
      !failed ||
      failed.status !== "FAILED" ||
      !failed.completedAt
    ) {
      throw new Error("Research session failure transition failed.");
    }

    return NextResponse.json({
      success: true,
      message: "Research session repository tests passed.",
      tests: [
        "Session creation",
        "Session retrieval",
        "Session listing",
        "Session completion",
        "Session failure",
      ],
    });
  } catch (error) {
    console.error("[Research Session Check]", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Research session verification failed.",
      },
      { status: 500 }
    );
  } finally {
    if (conversationId) {
      // The conversation relation uses onDelete: Cascade.
      // Deleting the test conversation also deletes its sessions.
      await prisma.conversation.deleteMany({
        where: {
          id: conversationId,
        },
      });
    }
  }
}
