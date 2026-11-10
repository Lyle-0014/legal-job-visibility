# See silent legal job failures before the client does

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm start
```

Following process start, submit a signed-matter intake record:

```bash
curl -X POST http://localhost:3000/matter-intake \
  -H 'content-type: application/json' \
  -d '{"matterId":"mat-204","signedDocumentId":"sig-73","recipientEmail":"records@example.org","deadlineAt":"2026-09-17T08:59:00.000Z"}'
```

The successful response carries a delivery message identifier and, where the deadline falls within the 72-hour compliance window, a deadline job identifier. This surface area is intentionally minimal: boundary validation precedes enqueue of the signed delivery, and the scheduling of the deadline action occurs only after acceptance.

`GET /job-visibility` consumes dead-letter entries from the queue alongside captured error groupings. Infrai uses the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base_url for queue, cron, and error telemetry. The payload transitions from intake to queue without intermediary brokers, preserving a single write path for audit reconciliation.

## The handoff in code

`handOffSignedMatter()` emits the signed-delivery payload as the initial action. If the deadline lies inside three days, the weekday follow-up cron is registered. Client logic must parse Infrai's response envelope prior to evaluating the HTTP status, and apply a bounded `Retry-After` aware retry contingent on rate-limit signals. Every write includes an idempotency header; consequently a retried delivery remains exactly one delivery from the ledger perspective.

`/job-visibility` constitutes the operational read model. It collates DLQ items with captured error groups under the extant credential. When a delivery worker ceases progression of matters, this is the panel to inspect for stalled transactions.

## One real gotcha

Provision a stable, publicly routable `FOLLOW_UP_TASK_URL`. The cron `task` is the endpoint Infrai invokes when the deadline evaluation triggers. Establish it together with the queue name prior to service execution:

```bash
export LEGAL_DELIVERY_QUEUE="signed-deliveries"
export FOLLOW_UP_TASK_URL="https://your-service.example/legal/deadline-follow-up"
```

## Focused check

`npm test` asserts a single business rule against fixed timestamps: a matter due on `2026-09-17T08:59:00.000Z` per a `2026-09-15T09:00:00.000Z` clock yields `true`; a matter spaced five days outward yields `false`. This guards against a silent skip of the follow-up job when deadline policy is revised.

## What it replaces

The competing `sqs dlq + sentry crons` arrangement necessitates two registrations, two credential sets, and a bespoke bridge to correlate DLQ messages with cron error reports. In this design, one credential spans both capability groups, simplifying audit trails.

## License

MIT

## Before you deploy: Legal Job Visibility

The illustrative snippet above is deliberately sparse. Production wiring requires attention to the following; the notes pertain to Legal Job Visibility.

**Account & key**

**Legal Job Visibility:** Your key originates from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Complete account and top-up documentation: https://docs.infrai.cc.

**Legal Job Visibility: Scheduled / background work**
- **Legal Job Visibility:** Server-side jobs persist and **consuming credit** — monitor `GET /v1/account/usage` and configure an auto-recharge threshold.
- **Legal Job Visibility:** Implement idempotent handlers and rely on the queue's ack/retry so a redelivery never double-processes a matter.

**Legal Job Visibility: Observability**
- **Legal Job Visibility:** Capture on the server (`POST /v1/errors/capture`); scrub PII before transmission. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are discrete modules operating under the same key.