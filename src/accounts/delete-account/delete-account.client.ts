function confirmed(value: unknown): boolean {
  return !!value && typeof value === "object" && "deleted" in value && value.deleted === true;
}

export async function deleteCloudAccount(token: string): Promise<void> {
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  try {
    const response = await fetch("/api/account", {
      method: "DELETE", headers, body: JSON.stringify({ confirmation: "DELETE" }), signal: AbortSignal.timeout(60_000),
    });
    const data: unknown = await response.json();
    if (!response.ok || !confirmed(data)) throw new Error(data && typeof data === "object" && "error" in data && typeof data.error === "string" ? data.error : "Account deletion failed. Please try again.");
  } catch (error) {
    console.error("Account deletion request failed; checking its outcome:", error);
    let complete: boolean;
    try {
      const check = await fetch("/api/account", { headers, signal: AbortSignal.timeout(15_000) });
      complete = check.ok && confirmed(await check.json());
    } catch (recoveryError) {
      console.error("Account deletion outcome check failed:", recoveryError);
      throw new Error("Account deletion could not be confirmed. Retry or contact support; some data may already be removed.");
    }
    if (!complete) throw error;
  }
}
