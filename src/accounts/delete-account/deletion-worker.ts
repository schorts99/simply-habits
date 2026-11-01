import "server-only";
import { randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

type Task = { kind: "collection" | "document"; path: string };
type Job = {
  phase: "app" | "devices" | "auth";
  tasks: Task[];
  initialized: boolean;
  owner?: string;
  leaseUntil: number;
  failed: boolean;
  completed: boolean;
};
const BATCH_SIZE = 25;

async function childDocuments(db: Firestore, auth: Auth, path: string): Promise<string[]> {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = auth.app.options.projectId;
  if (!projectId) throw new Error("Firebase project is not configured.");
  const base = host ? `http://${host}` : "https://firestore.googleapis.com";
  const url = new URL(`${base}/v1/projects/${projectId}/databases/${db.databaseId}/documents/${path}`);
  url.searchParams.set("pageSize", String(BATCH_SIZE));
  url.searchParams.set("showMissing", "true");
  url.searchParams.set("mask.fieldPaths", "deletionProjection");
  const credential = auth.app.options.credential;
  if (!host && !credential) throw new Error("Firebase Admin credentials are unavailable for deletion.");
  const token = !host && credential ? await credential.getAccessToken() : null;
  if (!host && !token) throw new Error("Firebase Admin credentials are unavailable for deletion.");
  const authorization = host ? "Bearer owner" : `Bearer ${token?.access_token}`;
  const response = await fetch(url, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Account deletion document listing failed (${response.status}).`);
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Account deletion returned an invalid document list.");
  if (!("documents" in data)) return [];
  if (!Array.isArray(data.documents) || data.documents.length > BATCH_SIZE) throw new Error("Account deletion returned an invalid document list.");
  return data.documents.map((document: unknown) => {
    if (!document || typeof document !== "object" || !("name" in document) || typeof document.name !== "string") throw new Error("Account deletion returned an invalid document list.");
    const prefix = `projects/${projectId}/databases/${db.databaseId}/documents/`;
    const child = document.name.slice(prefix.length);
    if (!document.name.startsWith(prefix) || !child.startsWith(`${path}/`) || child.split("/").length !== path.split("/").length + 1) throw new Error("Account deletion returned an invalid document list.");
    return child;
  });
}

export async function enqueueDeletion(db: Firestore, uid: string) {
  const account = db.doc(`users/${uid}`);
  const job = db.doc(`accountDeletions/${uid}`);
  await db.runTransaction(async tx => {
    const previous = await tx.get(job);
    if (previous.data()?.completed) return;
    tx.set(account, { deleting: true, deletionStartedAt: Date.now() });
    if (!previous.exists) tx.set(job, { phase: "app", tasks: [], initialized: false, leaseUntil: 0, nextAttemptAt: 0, failed: false, completed: false });
    else tx.update(job, { failed: false, nextAttemptAt: 0 });
  });
}

export async function processDeletion(db: Firestore, auth: Auth, uid: string, deadline: number): Promise<boolean> {
  const ref = db.doc(`accountDeletions/${uid}`);
  const owner = randomUUID();
  const claimed = await db.runTransaction(async tx => {
    const record = await tx.get(ref);
    if (!record.exists || record.data()?.completed || (record.data()?.leaseUntil ?? 0) > Date.now()) return false;
    tx.update(ref, { owner, leaseUntil: Date.now() + 120_000, nextAttemptAt: Date.now() + 300_000, failed: false });
    return true;
  });
  if (!claimed) return false;
  try {
    for (let step = 0; step < 100 && Date.now() < deadline; step++) {
      const job = (await ref.get()).data() as Job;
      if (job.owner !== owner || job.completed) return job.completed;
      const tasks = [...job.tasks];
      const deletions: string[] = [];
      let phase = job.phase, initialized = job.initialized;
      if (tasks.length) {
        const task = tasks[tasks.length - 1];
        if (task.kind === "document") {
          deletions.push(task.path); tasks.pop();
        } else {
          // showMissing includes orphaned parents, so nested data is not skipped.
          const docs = await childDocuments(db, auth, task.path);
          if (!docs.length) tasks.pop();
          for (const path of docs) {
            const doc = db.doc(path);
            const children = await doc.listCollections();
            if (children.length) {
              tasks.push({ kind: "document", path: doc.path }, ...children.map(child => ({ kind: "collection" as const, path: child.path })));
              break;
            }
            deletions.push(doc.path);
          }
        }
      } else if (phase === "app") {
        if (!initialized) {
          tasks.push(...(await db.doc(`users/${uid}`).listCollections()).map(collection => ({ kind: "collection" as const, path: collection.path })));
          initialized = true;
        } else phase = "devices";
      } else if (phase === "devices") {
        const devices = await db.collection("pushDevices").where("uid", "==", uid).limit(1).get();
        if (devices.empty) phase = "auth";
        else {
          const device = devices.docs[0].ref;
          tasks.push({ kind: "document", path: device.path }, ...(await device.listCollections()).map(collection => ({ kind: "collection" as const, path: collection.path })));
        }
      } else {
        try { await auth.deleteUser(uid); }
        catch (error) {
          if (!error || typeof error !== "object" || !("code" in error) || error.code !== "auth/user-not-found") throw error;
        }
        await ref.set({ completed: true, failed: false, leaseUntil: 0 });
        return true;
      }
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (current.data()?.owner !== owner) throw new Error("Account deletion lease was lost.");
        for (const path of deletions) tx.delete(db.doc(path));
        tx.update(ref, { tasks, phase, initialized });
      });
    }
    return false;
  } catch (error) {
    console.error("Account deletion worker failed:", uid, error);
    await ref.update({ failed: true });
    throw error;
  } finally {
    await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (current.data()?.owner === owner) tx.update(ref, { leaseUntil: 0 });
    });
  }
}

export async function runDeletionJobs(db: Firestore, auth: Auth, deadline: number) {
  const jobs = await db.collection("accountDeletions").where("nextAttemptAt", "<=", Date.now()).orderBy("nextAttemptAt").limit(10).get();
  let completed = 0, failed = 0;
  for (const job of jobs.docs) {
    if (Date.now() >= deadline) break;
    try { if (await processDeletion(db, auth, job.id, Math.min(deadline, Date.now() + 2_000))) completed++; }
    catch { failed++; /* Individual failures are logged and persisted by processDeletion. */ }
  }
  return { completed, failed };
}
