
import { NextResponse } from "next/server";

import { searchMemoryByDate } from
  "@/server/memory/memory-retrieval.service";

import { buildMemoryContext } from
  "@/server/memory/memory-context.service";

import { prisma } from "@/server/db/prisma";

// export const runtime = "nodejs";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  try {
    // Development-only test user.
    // Replace this with an existing database user ID.
    const user = await prisma.user.findFirst({
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "No user found. Create a test user first.",
        },
        { status: 404 }
      );
    }

    const memory = await searchMemoryByDate({
      userId: user.id,
      date: "2026-11-03",
      timezone: "Asia/Kolkata",
      query: "Postgres",
      maxResults: 30,
    });

    const context = buildMemoryContext({
      memory,
      currentQuestion:
        "What did I ask about PostgreSQL on 3 November?",
    });

    return NextResponse.json({
      success: true,
      context: {
        searchedDate: context.searchedDate,
        totalRetrieved: context.totalRetrieved,
        includedMessages: context.includedMessages,
        omittedMessages: context.omittedMessages,
        hasMore: context.hasMore,
        messages: context.messages,
        memoryContext: context.memoryContext,
      },
    });
  } catch (error) {
    console.error("[Memory Context Check]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Memory context test failed.",
      },
      { status: 500 }
    );
  }
}
