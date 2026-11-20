
import "server-only";

import { tavilyClient } from "./tavily-client";
import { webSearchInputSchema } from "./search-schema";

import type {
  SearchResult,
  WebSearchResponse,
} from "./search-types";

function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);

    // Only accept normal web URLs.
    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    // Remove fragments and tracking parameters.
    url.hash = "";

    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_")) {
        url.searchParams.delete(key);
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}

function normalizeResults(
  rawResults: Array<{
    title: string;
    url: string;
    content: string;
    publishedDate?: string;
    score?: number;
  }>
): SearchResult[] {
  const uniqueResults = new Map<string, SearchResult>();

  for (const result of rawResults) {
    const normalizedUrl = normalizeUrl(result.url);

    // Ignore invalid URLs.
    if (!normalizedUrl) continue;

    // Remove duplicate sources.
    if (uniqueResults.has(normalizedUrl)) continue;

    const domain = new URL(normalizedUrl).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    uniqueResults.set(normalizedUrl, {
      title: result.title || "Untitled source",
      url: normalizedUrl,
      domain,
      content: (result.content || "").slice(0, 6000),
      publishedDate: result.publishedDate ?? null,
      score: typeof result.score === "number"
        ? result.score
        : null,
    });
  }

  return Array.from(uniqueResults.values());
}

export async function webSearch(
  input: unknown
): Promise<WebSearchResponse> {
  // Validate model-generated or application-generated input.
  const validatedInput = webSearchInputSchema.parse(input);

  const startedAt = Date.now();

  try {
    const response = await tavilyClient.search(
      validatedInput.query,
      {
        searchDepth: "basic",
        maxResults: validatedInput.maxResults,
        includeAnswer: false,
        includePublishedDate: true,
        safeSearch: true,
      }
    );

    const results = normalizeResults(response.results);

    console.info("[Web Search]", {
      query: validatedInput.query,
      resultCount: results.length,
      durationMs: Date.now() - startedAt,
    });

    return {
      query: validatedInput.query,
      requestId: response.requestId ?? null,
      searchedAt: new Date().toISOString(),
      results,
    };
  } catch (error) {
    console.error("[Web Search Error]", {
      query: validatedInput.query,
      error,
    });

    throw new Error("Web search failed. Please try again.");
  }
}
