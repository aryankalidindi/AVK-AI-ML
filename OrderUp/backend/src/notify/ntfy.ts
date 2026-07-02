import type { Notifier, OrderNotification } from "./notifier.js";

export function createNtfyNotifier(
  baseUrl: string,
  topic: string,
  fetchFn: typeof fetch = fetch,
): Notifier {
  return {
    async send(notification: OrderNotification): Promise<void> {
      const response = await fetchFn(`${baseUrl}/${topic}`, {
        method: "POST",
        body: notification.body,
        headers: {
          Title: notification.title,
          Click: notification.deepLink,
          Priority: notification.priority ?? "default",
          Tags: "hamburger",
        },
      });
      if (!response.ok) {
        throw new Error(`ntfy send failed with status ${response.status}`);
      }
    },
  };
}
