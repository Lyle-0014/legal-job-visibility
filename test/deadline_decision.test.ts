import assert from "node:assert/strict";
import test from "node:test";
import { needsDeadlineFollowUp } from "../src/matter_intake.ts";
import { InfraiClient } from "../src/infrai_client.ts";

test("a signed matter due within three days gets a deadline follow-up", () => {
  const now = new Date("2026-09-15T09:00:00.000Z");
  assert.equal(needsDeadlineFollowUp("2026-09-17T08:59:00.000Z", now), true);
  assert.equal(needsDeadlineFollowUp("2026-09-20T09:00:00.000Z", now), false);
});

test("publishing includes the queue and preserves idempotency across retries", async (t) => {
  const calls: RequestInit[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => {
    calls.push(init);
    return calls.length === 1
      ? new Response(JSON.stringify({ ok: false }), { status: 429, headers: { "Retry-After": "0" } })
      : new Response(JSON.stringify({ ok: true, data: { message_id: "message-1" } }));
  });
  const client = new InfraiClient("test-key");
  const payload = { matterId: "test-matter" };
  await client.publishSignedDelivery("test-queue", payload);
  await client.publishSignedDelivery("test-queue", payload);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.deepEqual(JSON.parse(call.body as string), { queue: "test-queue", payload });
  }
  const keys = calls.map((call) => new Headers(call.headers).get("Idempotency-Key"));
  assert.ok(keys[0]);
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});
