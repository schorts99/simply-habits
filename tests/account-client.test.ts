import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteCloudAccount, getDeletionStatus } from "@/accounts/delete-account/delete-account.client";

afterEach(() => vi.unstubAllGlobals());
describe("Account deletion client", () => {
  it("reports empty or HTML status failures without attempting to parse JSON", async () => {
    for (const body of [null, "<html>Internal Server Error</html>"]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { status: 500 })));
      await expect(getDeletionStatus("test-token")).rejects.toThrow("Account deletion status could not be checked. Retry or contact support.");
    }
  });
  it("requires the exact successful deletion response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ deleted: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await deleteCloudAccount("test-token");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "DELETE", body: '{"confirmation":"DELETE"}' });
  });
  it("accepts queued deletion without claiming cleanup is complete", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"deleted":false,"pending":true,"failed":false}', { status: 202 })));
    expect(await deleteCloudAccount("test-token")).toEqual({ deleted: false, pending: true, failed: false });
  });
  it("recovers a lost enqueue response as pending and retains failed-job status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Failed to fetch")).mockResolvedValueOnce(new Response('{"deleted":false,"pending":true,"failed":true}')));
    expect(await deleteCloudAccount("test-token")).toEqual({ deleted: false, pending: true, failed: true });
  });
  it("recovers an interrupted response only after confirming deletion on the server", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError")).mockResolvedValueOnce(new Response('{"deleted":true}'));
    vi.stubGlobal("fetch", fetcher);
    await deleteCloudAccount("test-token");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1][1].method).toBeUndefined();
  });
  it("reports partial failures or unconfirmed outcomes rather than implying success", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"error":"Cleanup failed"}', { status: 503 })).mockResolvedValueOnce(new Response('{"deleted":false}'));
    vi.stubGlobal("fetch", fetcher);
    await expect(deleteCloudAccount("test-token")).rejects.toThrow("Cleanup failed");
    fetcher.mockResolvedValueOnce(new Response('{"ok":true}')).mockRejectedValueOnce(new Error("Offline"));
    await expect(deleteCloudAccount("test-token")).rejects.toThrow("Account deletion could not be confirmed");
  });
});
