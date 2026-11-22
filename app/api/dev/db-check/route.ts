
import { NextResponse } from "next/server";
import { prisma } from "@/server/db/prisma";


export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      success: true,
      message: "PostgreSQL connection successful.",
    });
  } catch (error) {
    console.error("[Database Check Error]", error);

    return NextResponse.json(
      {
        success: false,
        message: "Database connection failed.",
      },
      { status: 503 }
    );
  }
}
