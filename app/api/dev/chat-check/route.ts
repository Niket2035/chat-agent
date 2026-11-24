import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runChatOrchestrator } from "@/server/orchestration/chat-orchestrator.service";


const requestSchema = z.object({
  userId: z.string().min(1),
  conversationId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(2000),
  timezone: z.string().min(1).default("Asia/Kolkata"),
});

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const body = await request.json();

    const validation = requestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request.",
          errors: validation.error.flatten(),
        },
        { status: 400 },
      );
    }

    const result = await runChatOrchestrator(validation.data);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[Chat Orchestrator Error]", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unable to process chat request.",
      },
      { status: 500 },
    );
  }
}
