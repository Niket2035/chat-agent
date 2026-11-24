import "server-only";

import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { createConversation } from "@/server/repositories/conversation.repository";
import { runChatOrchestrator } from "@/server/orchestration/chat-orchestrator.service";

const inputSchema = z.object({
  userId: z.string().min(1),
});

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runOrchestrationIntegrationTests(input: {
  userId: string;
}) {
  const { userId } = inputSchema.parse(input);
  let orchestratedConversationId: string | undefined;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error("Test user not found.");
  }

  const createdConversationIds: string[] = [];
  const results: TestResult[] = [];

  async function runTest(name: string, test: () => Promise<string>) {
    try {
      const details = await test();

      results.push({
        name,
        passed: true,
        details,
      });
    } catch (error) {
      results.push({
        name,
        passed: false,
        details:
          error instanceof Error ? error.message : "Unknown test failure.",
      });
    }
  }

  try {
    // ------------------------------------------------
    // TEST FIXTURE: Create historical conversation data
    // ------------------------------------------------

    const fixture = await createConversation({
      userId,
      title: "Integration test: PostgreSQL hosting",
    });

    createdConversationIds.push(fixture.id);

    await prisma.message.createMany({
      data: [
        {
          conversationId: fixture.id,
          role: "USER",
          content:
            "On 3 November, I asked about PostgreSQL hosting providers and their pricing.",
          createdAt: new Date("2026-11-03T05:00:00.000Z"),
        },
        {
          conversationId: fixture.id,
          role: "ASSISTANT",
          content:
            "We discussed PostgreSQL hosting options, pricing models, and provider comparisons.",
          createdAt: new Date("2026-11-03T05:01:00.000Z"),
        },
      ],
    });

    // ------------------------------------------------
    // TEST 1: Historical recall
    // ------------------------------------------------

    await runTest("historical_recall", async () => {
      const response = await runChatOrchestrator({
        userId,
        message: "What did I ask you on 3 November about PostgreSQL?",
        timezone: "Asia/Kolkata",
      });

      createdConversationIds.push(response.conversationId);
      orchestratedConversationId = response.conversationId;

      if (response.intent.intent !== "historical_recall") {
        throw new Error(
          `Expected historical_recall, received ${response.intent.intent}`,
        );
      }

      if ((response.memory?.retrievedMessages ?? 0) < 2) {
        throw new Error(
          "Expected at least two historical messages to be retrieved.",
        );
      }

      return `Retrieved ${response.memory?.retrievedMessages ?? 0} historical messages.`;
    });

    // ------------------------------------------------
    // TEST 2: Current research
    // ------------------------------------------------

    await runTest("current_research", async () => {
      const response = await runChatOrchestrator({
        userId,
        message: "Find current PostgreSQL hosting providers and their pricing.",
        timezone: "Asia/Kolkata",
      });

      createdConversationIds.push(response.conversationId);

      if (response.intent.intent !== "current_research") {
        throw new Error(
          `Expected current_research, received ${response.intent.intent}`,
        );
      }

      if (response.sources.length === 0) {
        throw new Error("Expected at least one web search source.");
      }

      return `Retrieved ${response.sources.length} web sources.`;
    });

    // ------------------------------------------------
    // TEST 3: Change detection
    // ------------------------------------------------

    await runTest("change_detection", async () => {
      const response = await runChatOrchestrator({
        userId,
        message: "Has PostgreSQL hosting pricing changed since 3 November?",
        timezone: "Asia/Kolkata",
      });

      createdConversationIds.push(response.conversationId);

      if (response.intent.intent !== "change_detection") {
        throw new Error(
          `Expected change_detection, received ${response.intent.intent}`,
        );
      }

      if (response.sources.length === 0) {
        throw new Error("Expected current web sources for change detection.");
      }

      if ((response.memory?.retrievedMessages ?? 0) < 2) {
        throw new Error("Expected historical baseline messages.");
      }

      return (
        `Retrieved ${response.memory?.retrievedMessages ?? 0} historical messages ` +
        `and ${response.sources.length} current sources.`
      );
    });

    // ------------------------------------------------
    // TEST 4: Missing historical date
    // ------------------------------------------------

    await runTest("missing_date_clarification", async () => {
      const response = await runChatOrchestrator({
        userId,
        message: "What did I ask you about PostgreSQL?",
        timezone: "Asia/Kolkata",
      });

      createdConversationIds.push(response.conversationId);

      if (response.searchPlan.requiresClarification !== true) {
        throw new Error(
          "Expected the orchestrator to request a date or time period.",
        );
      }

      if (response.sources.length !== 0) {
        throw new Error(
          "The orchestrator should not search the web for this historical recall.",
        );
      }

      return "The agent correctly requested a date or time period.";
    });

    // ------------------------------------------------
    // TEST 5: Conversation persistence
    // ------------------------------------------------

    await runTest("conversation_persistence", async () => {
      const conversationId = orchestratedConversationId;

      if (!conversationId) {
        throw new Error("No test conversation was created.");
      }

      const messages = await prisma.message.findMany({
        where: {
          conversationId,
          conversation: {
            is: { userId },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      const hasUserMessage = messages.some(
        (message) => message.role === "USER",
      );

      const hasAssistantMessage = messages.some(
        (message) => message.role === "ASSISTANT",
      );

      if (!hasUserMessage || !hasAssistantMessage) {
        throw new Error(
          "Expected both user and assistant messages in the database.",
        );
      }

      return `Found ${messages.length} persisted messages.`;
    });
  } finally {
    // ------------------------------------------------
    // CLEANUP: Delete temporary test data
    // ------------------------------------------------

    if (createdConversationIds.length > 0) {
      await prisma.message.deleteMany({
        where: {
          conversationId: {
            in: createdConversationIds,
          },
        },
      });

      await prisma.conversation.deleteMany({
        where: {
          id: {
            in: createdConversationIds,
          },
          userId,
        },
      });
    }
  }

  const passed = results.filter((result) => result.passed).length;

  return {
    success: passed === results.length,
    summary: {
      passed,
      total: results.length,
      failed: results.length - passed,
    },
    results,
  };
}
