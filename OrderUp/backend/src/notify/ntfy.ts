import type { Notifier, OrderNotification } from "./notifier.js";

// ntfy sends the Title as an HTTP header, which must be Latin-1. Map common
// typographic characters to ASCII and drop anything else out of range.
// (The body is the request body and keeps full UTF-8.)
function headerSafe(text: string): string {
  return text
    .replace(/[—–]/g, "-")
    .replace(/×/g, "x")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\xFF]/g, "");
}

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
          Title: headerSafe(notification.title),
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
