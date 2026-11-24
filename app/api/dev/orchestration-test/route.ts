import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { runOrchestrationIntegrationTests } from
  "@/server/testing/orchestration-tests.service";



const requestSchema = z.object({
  userId: z.string().min(1),
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
          message: "A valid userId is required.",
          errors: validation.error.flatten(),
        },
        { status: 400 }
      );
    }

    const result = await runOrchestrationIntegrationTests(
      validation.data
    );

    return NextResponse.json(result, {
      status: result.success ? 200 : 207,
    });
  } catch (error) {
    console.error("[Orchestration Integration Test Error]", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Integration tests failed.",
      },
      { status: 500 }
    );
  }
}