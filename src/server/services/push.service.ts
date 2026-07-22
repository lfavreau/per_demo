import webpush from "web-push";
import { prisma } from "@/lib/db";

// Configure VAPID details from environment variables
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:contacto@vinculoschiloe.cl";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a Web Push notification to all subscribed devices of a given user.
 * Automatically cleans up stale subscriptions (410 Gone / 404).
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    // VAPID keys not configured — silently skip push delivery
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/",
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const keys = JSON.parse(sub.keys);
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: keys.p256dh,
              auth: keys.auth,
            },
          },
          pushPayload
        );

        // Update lastUsedAt timestamp
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (err: any) {
        // If the subscription is expired or unsubscribed, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`[Push] Removing stale subscription ${sub.id} for user ${userId}`);
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error(`[Push] Error sending push to subscription ${sub.id}:`, err.message);
        }
      }
    })
  );
}

interface CreateNotificationData {
  userId: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * Creates an in-app notification in the database AND sends a Web Push
 * notification to the user's subscribed devices.
 * 
 * This is the single point of entry for all notification creation in the app.
 * Use this instead of `prisma.notification.create()` directly.
 */
export async function createNotificationWithPush(
  data: CreateNotificationData,
  // Allow passing a Prisma transaction client for use inside $transaction blocks
  tx?: any
): Promise<void> {
  const db = tx || prisma;

  // 1. Create in-app notification record
  await db.notification.create({
    data: {
      userId: data.userId,
      title: data.title,
      message: data.message,
      link: data.link || null,
    },
  });

  // 2. Send Web Push notification (fire-and-forget, non-blocking)
  // We intentionally don't await this inside transactions to avoid
  // blocking the DB transaction on external HTTP calls.
  if (!tx) {
    sendPushToUser(data.userId, {
      title: data.title,
      body: data.message,
      url: data.link || "/",
    }).catch((err) => {
      console.error("[Push] Failed to send push:", err.message);
    });
  } else {
    // When inside a transaction, schedule push delivery after the current tick
    // so it doesn't block the transaction
    setImmediate(() => {
      sendPushToUser(data.userId, {
        title: data.title,
        body: data.message,
        url: data.link || "/",
      }).catch((err) => {
        console.error("[Push] Failed to send push:", err.message);
      });
    });
  }
}
