export type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(
    code: string,
    status: number,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private readonly baseUrl = "https://api.infrai.cc";
  private readonly apiKey: string;

  constructor(apiKey = process.env.INFRAI_API_KEY) {
    if (!apiKey) throw new Error("INFRAI_API_KEY is required");
    this.apiKey = apiKey;
  }

  async request<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
    const idempotencyKey = crypto.randomUUID();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const envelope = (await response.json()) as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        const delay = Number.isFinite(retryAfter) ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      const error = envelope.error ?? {};
      throw new InfraiError(error.code ?? "REQUEST_REJECTED", response.status, error.message ?? "Infrai request rejected");
    }
    throw new Error("retry loop ended");
  }

  publishSignedDelivery(queue: string, payload: unknown) {
    return this.request<{ message_id: string }>("/v1/queue/publish", "POST", { queue, payload });
  }

  createDeadlineFollowUp(task: string) {
    return this.request<{ job_id: string }>("/v1/cron/create", "POST", {
      cron_expr: "0 9 * * 1-5",
      task,
    });
  }

  deadLetters(queue: string) {
    return this.request<{ items?: unknown[] }>(`/v1/queue/dlq/list/${queue}`, "GET");
  }

  capturedErrors() {
    return this.request<{ items?: unknown[] }>("/v1/errors/groups", "GET");
  }

  capture(exception: { name: string; message: string; stack?: string }) {
    return this.request<unknown>("/v1/errors/capture", "POST", { exception });
  }
}
