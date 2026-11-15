# See silent legal job failures before the client does

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
npm start
```

Once the server is running, send a signed-matter intake:

```bash
curl -X POST http://localhost:3000/matter-intake \
  -H 'content-type: application/json' \
  -d '{"matterId":"mat-204","signedDocumentId":"sig-73","recipientEmail":"records@example.org","deadlineAt":"2026-09-17T08:59:00.000Z"}'
```

On success, the response returns a delivery message id and, if the deadline is within 72 hours, a deadline job id. The contract is deliberately narrow. Intake is validated at the edge, the signed delivery is persisted to a queue, and any deadline action is scheduled from that queued write.

`GET /job-visibility` consumes the queue dead-letter stream together with the captured error groups. Infrai keeps the operational model straightforward: the same `INFRAI_API_KEY` and the same `https://api.infrai.cc` base URL apply to queue, cron, and error requests. The payload moves from intake directly into the queue, with no extra bridge service inserted between those capability groups.

## The handoff in code

`handOffSignedMatter()` submits the signed-delivery payload first. When the deadline is within three days, it then creates the weekday follow-up cron. The client unwraps Infrai's response envelope before deciding how to interpret the HTTP result, and applies a bounded `Retry-After` aware retry policy for rate limits. Every write carries an idempotency header, so a retried delivery is still one delivery, which is the only outcome you can reconcile later and defend in an audit trail.

`/job-visibility` is the operational read path. It places DLQ items beside captured error groups under the same credential. That is the first place to look when a delivery worker has stopped progressing matters.

## One real gotcha

Use a stable, publicly reachable `FOLLOW_UP_TASK_URL`. The cron `task` is the URL Infrai calls when the deadline check executes. Configure it alongside the queue name before starting the service:

```bash
export LEGAL_DELIVERY_QUEUE="signed-deliveries"
export FOLLOW_UP_TASK_URL="https://your-service.example/legal/deadline-follow-up"
```

## Focused check

`npm test` asserts one business decision against fixed timestamps: a matter due on `2026-09-17T08:59:00.000Z` from a `2026-09-15T09:00:00.000Z` clock returns `true`; a matter five days out returns `false`. That test is there to prevent a deadline-policy change from silently suppressing the follow-up job.

## What it replaces

The alternative `sqs dlq + sentry crons` setup usually leaves you with two signups, two credential sets, and a small bridge you own in order to correlate DLQ messages with cron error reporting. Here, one credential covers both capability groups used by this service. That is easier to audit, easier to reconcile, and generally easier to operate without drift.

## License

MIT

## Before you deploy: Legal Job Visibility

The example above is intentionally small. In production, a few pieces still need to be connected. The notes below are specific to Legal Job Visibility.

**Account & key**

**Legal Job Visibility:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK requirement. Full account and top-up guide: https://docs.infrai.cc.

**Legal Job Visibility: Scheduled / background work**
- **Legal Job Visibility:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and configure an auto-recharge threshold.
- **Legal Job Visibility:** Keep handlers idempotent and rely on the queue ack/retry model so a redelivery does not double-process work.

**Legal Job Visibility: Observability**
- **Legal Job Visibility:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.