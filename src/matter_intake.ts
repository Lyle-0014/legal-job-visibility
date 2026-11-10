import { z } from "zod";
import { InfraiClient } from "./infrai_client.ts";

export const MatterIntake = z.object({
  matterId: z.string().min(1),
  signedDocumentId: z.string().min(1),
  recipientEmail: z.string().email(),
  deadlineAt: z.string().datetime(),
});

export type MatterIntake = z.infer<typeof MatterIntake>;

export function needsDeadlineFollowUp(deadlineAt: string, now: Date): boolean {
  const deadline = new Date(deadlineAt).getTime();
  const hoursAway = (deadline - now.getTime()) / 3_600_000;
  return hoursAway > 0 && hoursAway <= 72;
}

export async function handOffSignedMatter(
  client: InfraiClient,
  intake: MatterIntake,
  followUpTaskUrl: string,
  queue: string,
  now = new Date(),
) {
  const delivery = await client.publishSignedDelivery(queue, {
    matterId: intake.matterId,
    signedDocumentId: intake.signedDocumentId,
    recipientEmail: intake.recipientEmail,
  });
  const followUp = needsDeadlineFollowUp(intake.deadlineAt, now)
    ? await client.createDeadlineFollowUp(followUpTaskUrl)
    : undefined;
  return { deliveryMessageId: delivery.message_id, deadlineJobId: followUp?.job_id };
}
