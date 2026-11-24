import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { resolveNaturalLanguageDate } from "@/server/query-understanding/date-resolver.service";



const requestSchema = z.object({
  phrase: z.string().min(1),
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

    const result = resolveNaturalLanguageDate(validation.data);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Date resolution failed.",
      },
      { status: 400 },
    );
  }
}
