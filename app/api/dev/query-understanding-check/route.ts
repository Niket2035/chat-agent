import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { understandQuery } from "@/server/query-understanding/query-understanding.service";

import { createSearchPlan } from "@/server/query-understanding/search-planner.service";

const requestSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  timezone: z.string().default("Asia/Kolkata"),
  referenceDate: z.string().datetime({ offset: true }).optional(),
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

    const understoodQuery = await understandQuery(validation.data);

    const searchPlan = createSearchPlan(understoodQuery);

    return NextResponse.json({
      success: true,
      understoodQuery,
      searchPlan,
    });
  } catch (error) {
    console.error("[Query Understanding Error]", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Query understanding failed.",
      },
      { status: 500 },
    );
  }
}
