import { createServer } from "node:http";
import { InfraiClient, InfraiError } from "./infrai_client.ts";
import { MatterIntake, handOffSignedMatter } from "./matter_intake.ts";

const queue = process.env.LEGAL_DELIVERY_QUEUE ?? "signed-deliveries";
const followUpTaskUrl = process.env.FOLLOW_UP_TASK_URL ?? "https://example.org/legal/deadline-follow-up";
const infrai = new InfraiClient();

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  return JSON.parse(raw);
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/matter-intake") {
      const parsed = MatterIntake.safeParse(await readJson(request));
      if (!parsed.success) return send(response, 400, { error: parsed.error.flatten() });
      const result = await handOffSignedMatter(infrai, parsed.data, followUpTaskUrl, queue);
      return send(response, 202, result);
    }
    if (request.method === "GET" && request.url === "/job-visibility") {
      const [deadLetters, errors] = await Promise.all([infrai.deadLetters(queue), infrai.capturedErrors()]);
      return send(response, 200, { deadLetters: deadLetters.items ?? [], errors: errors.items ?? [] });
    }
    return send(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof InfraiError) return send(response, error.status, { error: error.code });
    const exception = error instanceof Error ? error : new Error("unknown request error");
    await infrai.capture({ name: exception.name, message: exception.message, stack: exception.stack });
    return send(response, 500, { error: "request could not be processed" });
  }
}).listen(3000, () => console.log("legal job visibility listening on http://localhost:3000"));
