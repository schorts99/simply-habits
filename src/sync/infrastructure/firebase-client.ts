"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const cloudConfigured = Object.values(config).every(Boolean);
let emulatorConnected = false;

export function firebaseAuth() {
  if (!cloudConfigured) return null;
  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = getAuth(app);
  const emulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
  if (emulator && !emulatorConnected) {
    connectAuthEmulator(auth, emulator);
    emulatorConnected = true;
  }
  return auth;
}
