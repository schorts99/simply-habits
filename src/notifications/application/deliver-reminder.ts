import "server-only";
import { AbstractEventSubscriber } from "@schorts/shared-kernel/event-bus";
import type { Firestore } from "@schorts/firestore-admin-dao";
import { ReminderDue } from "../domain/reminder";
import { expiredPush, parseSubscription, sendPush, type DeviceSubscription } from "../infrastructure/web-push";

export type PushSender = (subscription: DeviceSubscription, message: { title: string; body: string; tag: string }) => Promise<void>;
export class DeliverReminder extends AbstractEventSubscriber<ReminderDue> {
  constructor(private readonly db: Firestore, private readonly sender: PushSender = sendPush) { super(); }
  getName(): string { return "notifications.deliver-web-push"; }
  subscribedTo(): string[] { return [ReminderDue.NAME]; }
  async handle(event: ReminderDue) {
    const { deviceId, uid, key, title, body } = event.getPayload();
    const device = this.db.doc(`pushDevices/${deviceId}`);
    const delivery = device.collection("deliveries").doc(key);
    const claimed = await this.db.runTransaction(async tx => {
      const [record, receipt] = await Promise.all([tx.get(device), tx.get(delivery)]);
      if (!record.exists || record.data()?.uid !== uid || receipt.data()?.sentAt || (receipt.data()?.leaseUntil ?? 0) > Date.now()) return null;
      tx.set(delivery, { leaseUntil: Date.now() + 60_000, expiresAt: new Date(Date.now() + 7 * 86_400_000) }, { merge: true });
      return parseSubscription(record.data()!.subscription);
    });
    if (!claimed) return;
    try {
      await this.sender(claimed, { title, body, tag: key });
      await delivery.set({ sentAt: Date.now(), leaseUntil: 0 }, { merge: true });
    } catch (error) {
      await delivery.set({ leaseUntil: 0 }, { merge: true });
      if (expiredPush(error)) {
        await this.db.runTransaction(async tx => {
          const current = await tx.get(device);
          if (current.data()?.uid === uid && current.data()?.subscription.endpoint === claimed.endpoint) tx.delete(device);
        });
        return;
      }
      throw error;
    }
  }
}
