import "server-only";

import { prisma } from "@/server/db/prisma";
import { createConversation } from "@/server/repositories/conversation.repository";
import { createResearchSession } from "@/server/repositories/research-session.repository";

import {
  resolveEntity,
  linkEntityToResearchSession,
} from "@/server/repositories/entity.repository";

import { saveResearchSource } from "@/server/repositories/source.repository";
import { saveResearchFacts } from "@/server/repositories/research-fact.repository";
import { compareResearchSessionFacts } from "@/server/research/temporal-comparison.service";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runResearchMemoryTests(input: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error("Test user not found.");
  }

  let conversationId: string | undefined;
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
        details: error instanceof Error ? error.message : "Unknown test error.",
      });
    }
  }

  try {
    const conversation = await createConversation({
      userId: input.userId,
      title: "Research memory integration test",
    });

    conversationId = conversation.id;

    let oldSessionId = "";
    let currentSessionId = "";
    let entityId = "";
    let currentSourceId = "";

    // Test 1: Entity resolution
    await runTest("Entity resolution and deduplication", async () => {
      const first = await resolveEntity({
        name: "PostgreSQL",
        type: "TECHNOLOGY",
      });

      const second = await resolveEntity({
        name: "Postgres",
        type: "TECHNOLOGY",
      });

      if (first.id !== second.id) {
        throw new Error("Entity aliases created duplicate records.");
      }

      entityId = first.id;

      return `Both names resolved to entity ${first.id}.`;
    });

    // Create old and current sessions.
    const oldSession = await createResearchSession({
      conversationId,
      userId: input.userId,
      topic: "PostgreSQL historical pricing",
    });

    oldSessionId = oldSession.id;

    const currentSession = await createResearchSession({
      conversationId,
      userId: input.userId,
      topic: "PostgreSQL current pricing",
    });

    currentSessionId = currentSession.id;

    await linkEntityToResearchSession({
      researchSessionId: oldSessionId,
      entityId,
    });

    await linkEntityToResearchSession({
      researchSessionId: currentSessionId,
      entityId,
    });

    // Test 2: Entity-session association
    await runTest("Entity-session association", async () => {
      const associations = await prisma.researchSessionEntity.findMany({
        where: {
          entityId,
          researchSessionId: {
            in: [oldSessionId, currentSessionId],
          },
        },
      });

      if (associations.length !== 2) {
        throw new Error("Entity was not linked to both sessions.");
      }

      return "Entity linked to both research sessions.";
    });

    // Test 3: Source persistence
    const oldSource = await saveResearchSource({
      researchSessionId: oldSessionId,
      title: "Historical PostgreSQL pricing",
      url: "https://example.com/postgres-old",
      domain: "example.com",
      snippet: "Historical starting price was 15 USD per month.",
    });

    const currentSource = await saveResearchSource({
      researchSessionId: currentSessionId,
      title: "Current PostgreSQL pricing",
      url: "https://example.com/postgres-current",
      domain: "example.com",
      snippet: "Current starting price is 20 USD per month.",
    });

    currentSourceId = currentSource.id;

    await runTest("Source persistence and deduplication", async () => {
      const duplicate = await saveResearchSource({
        researchSessionId: currentSessionId,
        title: "Current PostgreSQL pricing",
        url: "https://example.com/postgres-current",
        domain: "example.com",
        snippet: "Current starting price is 20 USD per month.",
      });

      if (duplicate.id !== currentSource.id) {
        throw new Error("Duplicate source was created.");
      }

      const stored = await prisma.source.count({
        where: {
          researchSessionId: currentSessionId,
        },
      });

      if (stored !== 1) {
        throw new Error("Unexpected number of current sources.");
      }

      return "Source stored once and duplicate retrieval reused it.";
    });

    // Test 4: Historical fact persistence
    await runTest("Historical fact persistence", async () => {
      const historicalDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const saved = await saveResearchFacts({
        researchSessionId: oldSessionId,
        sourceId: oldSource.id,
        observedAt: historicalDate,
        facts: [
          {
            entityName: "PostgreSQL",
            attribute: "starting_price",
            value: 15,
            normalizedValue: "15",
            currency: "USD",
            unit: "month",
            effectiveAt: null,
            confidence: 0.95,
            notes: "Historical test observation.",
          },
        ],
      });

      if (saved.length !== 1) {
        throw new Error("Historical fact was not saved.");
      }

      return "Historical fact stored with its observation timestamp.";
    });

    // Test 5: Current fact persistence
    await runTest("Current fact persistence", async () => {
      const saved = await saveResearchFacts({
        researchSessionId: currentSessionId,
        sourceId: currentSourceId,
        facts: [
          {
            entityName: "PostgreSQL",
            attribute: "starting_price",
            value: 20,
            normalizedValue: "20",
            currency: "USD",
            unit: "month",
            effectiveAt: null,
            confidence: 0.98,
            notes: "Current test observation.",
          },
        ],
      });

      if (saved.length !== 1) {
        throw new Error("Current fact was not saved.");
      }

      return "Current fact stored separately from historical fact.";
    });

    // Test 6: Temporal change detection
    await runTest("Temporal change detection", async () => {
      const comparisons = await compareResearchSessionFacts({
        researchSessionId: currentSessionId,
        userId: input.userId,
      });

      const priceComparison = comparisons.find(
        (item) => item.attribute === "starting_price",
      );

      if (!priceComparison) {
        throw new Error("Price comparison was not returned.");
      }

      if (priceComparison.changeType !== "CHANGED") {
        throw new Error(
          `Expected CHANGED, received ${priceComparison.changeType}.`,
        );
      }

      if (
        priceComparison.previous?.normalizedValue !== "15" ||
        priceComparison.current.normalizedValue !== "20"
      ) {
        throw new Error("Incorrect previous/current fact values.");
      }

      return "Detected starting_price change from 15 to 20 USD/month.";
    });

    // Test 7: Historical facts were not overwritten
    await runTest("Append-only fact history", async () => {
      const count = await prisma.researchFact.count({
        where: {
          entityId,
          attribute: "starting_price",
          researchSessionId: {
            in: [oldSessionId, currentSessionId],
          },
        },
      });

      if (count !== 2) {
        throw new Error(`Expected 2 stored observations, received ${count}.`);
      }

      return "Both historical and current observations remain stored.";
    });

    // Test 8: Ownership protection
    await runTest("User ownership protection", async () => {
      const result = await compareResearchSessionFacts({
        researchSessionId: currentSessionId,
        userId: "invalid-user-id",
      }).then(
        () => false,
        () => true,
      );

      if (!result) {
        throw new Error("Another user accessed the research session.");
      }

      return "Research session access is restricted to its owner.";
    });

    const passed = results.filter((item) => item.passed).length;

    return {
      success: passed === results.length,
      summary: {
        passed,
        total: results.length,
        failed: results.length - passed,
      },
      results,
    };
  } finally {
    if (conversationId) {
      await prisma.conversation.deleteMany({
        where: {
          id: conversationId,
          userId: input.userId,
        },
      });
    }
  }
}
