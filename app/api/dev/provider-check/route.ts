
import { NextResponse } from "next/server";

import { generateText } from "@/server/ai/gemini";
import { webSearch } from "@/server/search/web-search";

export async function GET() {
  // Never expose this diagnostic endpoint in production.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const [geminiResult, tavilyResult] = await Promise.allSettled([
    generateText(
      "Reply with exactly: Gemini connection successful."
    ),

    webSearch({
      query: "Tavily official documentation",
      maxResults: 2,
    }),
  ]);

  const gemini = geminiResult.status === "fulfilled"
    ? {
        status: "success",
        response: geminiResult.value,
      }
    : {
        status: "failed",
        error: String(geminiResult.reason),
      };

  const tavily = tavilyResult.status === "fulfilled"
    ? {
        status: "success",
        query: tavilyResult.value.query,
        resultCount: tavilyResult.value.results.length,
        results: tavilyResult.value.results,
      }
    : {
        status: "failed",
        error: String(tavilyResult.reason),
      };

  const success =
    gemini.status === "success" &&
    tavily.status === "success";

  return NextResponse.json(
    {
      success,
      providers: {
        gemini,
        tavily,
      },
    },
    {
      status: success ? 200 : 503,
    }
  );
}
