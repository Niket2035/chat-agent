
import "server-only";

import { tavily } from "@tavily/core";
import { env } from "@/lib/env";

export const tavilyClient = tavily({
  apiKey: env.TAVILY_API_KEY,
});
