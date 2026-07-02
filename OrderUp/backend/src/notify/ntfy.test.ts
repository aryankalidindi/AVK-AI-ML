import { describe, expect, test, vi } from "vitest";
import { createNtfyNotifier } from "./ntfy.js";

describe("createNtfyNotifier", () => {
  test("POSTs to <baseUrl>/<topic> with title, click and priority headers", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const notifier = createNtfyNotifier("http://127.0.0.1:8090", "orderup", fetchFn);

    await notifier.send({
      title: "Review your order — $8.42",
      body: "1× McChicken from McDonald's",
      deepLink: "orderup://review/abc",
      priority: "high",
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8090/orderup");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("1× McChicken from McDonald's");
    expect(init.headers.Title).toBe("Review your order — $8.42");
    expect(init.headers.Click).toBe("orderup://review/abc");
    expect(init.headers.Priority).toBe("high");
  });

  test("throws on a non-2xx response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 502 });
    const notifier = createNtfyNotifier("http://127.0.0.1:8090", "orderup", fetchFn);
    await expect(
      notifier.send({ title: "t", body: "b", deepLink: "orderup://x" }),
    ).rejects.toThrow(/502/);
  });
});
