export type DeletionStatus = { deleted: boolean; pending: boolean; failed: boolean };
function parseStatus(value: unknown): DeletionStatus {
  if (!value || typeof value !== "object" || !("deleted" in value) || typeof value.deleted !== "boolean") throw new Error("Account deletion returned an invalid response.");
  const pending = "pending" in value ? value.pending : false;
  const failed = "failed" in value ? value.failed : false;
  if (typeof pending !== "boolean" || typeof failed !== "boolean" || (value.deleted && pending)) throw new Error("Account deletion returned an invalid response.");
  return { deleted: value.deleted, pending, failed };
}
export async function getDeletionStatus(token: string): Promise<DeletionStatus> {
  const response = await fetch("/api/account", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const data: unknown = await response.json();
  if (!response.ok) throw new Error("Account deletion status could not be checked. Retry or contact support.");
  return parseStatus(data);
}
export async function deleteCloudAccount(token: string): Promise<DeletionStatus> {
  try {
    const response = await fetch("/api/account", {
      method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }), signal: AbortSignal.timeout(15_000),
    });
    const data: unknown = await response.json();
    if (!response.ok) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Account deletion failed. Please try again.");
    const status = parseStatus(data);
    if (!status.deleted && !status.pending) throw new Error("Account deletion failed. Please try again.");
    return status;
  } catch (error) {
    console.error("Account deletion request failed; checking its outcome:", error);
    let status: DeletionStatus;
    try { status = await getDeletionStatus(token); }
    catch (recoveryError) {
      console.error("Account deletion outcome check failed:", recoveryError);
      throw new Error("Account deletion could not be confirmed. Retry or contact support; some data may already be removed.");
    }
    if (!status.deleted && !status.pending) throw error;
    return status;
  }
}
