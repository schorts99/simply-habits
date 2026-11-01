import { createECDH, createPrivateKey } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function productionChecks(env) {
  const checks = [];
  const check = (name, validate) => {
    try { checks.push({ name, ok: !!validate() }); }
    catch { checks.push({ name, ok: false }); }
  };
  check("Public HTTPS origin (not localhost)", () => {
    const url = new URL(env.NEXT_PUBLIC_SITE_URL);
    return url.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && !url.hostname.endsWith(".localhost") && url.pathname === "/" && !url.username && !url.password && !url.search && !url.hash;
  });
  for (const key of ["NEXT_PUBLIC_FIREBASE_API_KEY", "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "NEXT_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID"]) check(key, () => !!env[key]?.trim());
  check("Matching Firebase project IDs", () => !!env.FIREBASE_PROJECT_ID && env.FIREBASE_PROJECT_ID === env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  check("Firebase Admin credentials or explicit ADC configuration", () => {
    if (!env.FIREBASE_CLIENT_EMAIL && !env.FIREBASE_PRIVATE_KEY) return !!env.GOOGLE_APPLICATION_CREDENTIALS;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.FIREBASE_CLIENT_EMAIL ?? "") && createPrivateKey(env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")).asymmetricKeyType === "rsa";
  });
  check("Matching VAPID key pair", () => {
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(env.VAPID_PRIVATE_KEY, "base64url"));
    return pair.getPublicKey().equals(Buffer.from(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, "base64url"));
  });
  check("VAPID contact URI", () => /^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(env.VAPID_SUBJECT ?? ""));
  check("CRON_SECRET (at least 32 characters)", () => env.CRON_SECRET?.length >= 32);
  check("Legal operator", () => !!env.LEGAL_OPERATOR_NAME?.trim());
  check("Legal contact email", () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.LEGAL_CONTACT_EMAIL ?? ""));
  check("Legal effective date", () => /^\d{4}-\d{2}-\d{2}$/.test(env.LEGAL_EFFECTIVE_DATE ?? "") && new Date(env.LEGAL_EFFECTIVE_DATE).toISOString().slice(0, 10) === env.LEGAL_EFFECTIVE_DATE);
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // Match Next's production env-file precedence without printing configuration values.
  for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    try { process.loadEnvFile(file); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const checks = productionChecks(process.env);
  for (const result of checks) console.log(`${result.ok ? "PASS" : "FAIL"}: ${result.name}`);
  console.log("This checks configuration only. Deployment, authorized domains, five-minute scheduler, rules/TTL, login, sync and physical-device push still require live acceptance.");
  if (checks.some(result => !result.ok)) process.exitCode = 1;
}
