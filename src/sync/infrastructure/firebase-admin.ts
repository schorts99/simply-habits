import "server-only";
import { cert, getApps, getAuth, getFirestore, initializeApp } from "@schorts/firestore-admin-dao";

export function firebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Firebase project is not configured.");
  const email = process.env.FIREBASE_CLIENT_EMAIL;
  const key = process.env.FIREBASE_PRIVATE_KEY;
  if (!!email !== !!key) throw new Error("Both Firebase service account fields are required.");
  const app = getApps()[0] ?? initializeApp({
    projectId,
    ...(email && key ? { credential: cert({ projectId, clientEmail: email, privateKey: key.replace(/\\n/g, "\n") }) } : {}),
  });
  return { auth: getAuth(app), db: getFirestore(app) };
}
