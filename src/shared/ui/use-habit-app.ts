"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, reauthenticateWithPopup, type User } from "firebase/auth";
import { firebaseAuth } from "@/sync/infrastructure/firebase-client";
import { HabitRuntime, initialSnapshot, errorMessage } from "@/shared/application/habit-runtime";
import { disableDevice } from "@/notifications/application/device-client";
import { deleteCloudAccount, getDeletionStatus } from "@/accounts/delete-account/delete-account.client";

const emptySubscribe = () => () => {};
const emptySnapshot = () => initialSnapshot;

export function useHabitApp() {
  const [runtime, setRuntime] = useState<HabitRuntime | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const importOnLogin = useRef(false);
  const deletionToken = useRef<string | null>(null);
  const snapshot = useSyncExternalStore(runtime?.subscribe ?? emptySubscribe, runtime?.snapshot ?? emptySnapshot, emptySnapshot);

  useEffect(() => {
    let cancelled = false;
    let current: HabitRuntime | null = null;
    let changes = Promise.resolve();
    const switchAccount = (account: User | null) => {
      changes = changes.then(async () => {
        if (cancelled) return;
        setRuntime(null);
        if (current) await current.close();
        if (cancelled) return;
        current = new HabitRuntime(account);
        setUser(account);
        setRuntime(current);
        await current.start();
        if (account && importOnLogin.current) {
          importOnLogin.current = false;
          await current.importGuestHabits();
        }
      }).catch(error => {
        console.error("Account initialization failed:", error);
        if (!cancelled) setAuthError(errorMessage(error));
      });
    };
    let unsubscribe = () => {};
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const auth = firebaseAuth();
      if (auth) unsubscribe = onAuthStateChanged(auth, switchAccount, error => {
        console.error("Authentication failed:", error);
        if (!cancelled) setAuthError(errorMessage(error));
      });
      else switchAccount(null);
    }).catch(error => {
      console.error("Firebase initialization failed:", error);
      if (!cancelled) setAuthError(errorMessage(error));
      switchAccount(null);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      void changes.then(() => current?.close()).catch(error => console.error("Account cleanup failed:", error));
    };
  }, []);

  useEffect(() => {
    if (!user || !runtime || !snapshot.deletionPending || authBusy) return;
    let cancelled = false, checking = false;
    async function check() {
      if (checking || cancelled || !navigator.onLine || !user || !runtime) return;
      checking = true;
      try {
        const token = deletionToken.current ?? await user.getIdToken();
        const status = snapshot.accountDeleted ? { deleted: true, pending: false, failed: false } : await getDeletionStatus(token);
        if (cancelled) return;
        if (!status.deleted) await runtime.applyDeletionStatus(status);
        else {
          await runtime.clearAccountVault();
          runtime.notifyAccountDeleted();
          try {
            if ("serviceWorker" in navigator) {
              const registration = await navigator.serviceWorker.getRegistration();
              const subscription = registration && "pushManager" in registration ? await registration.pushManager.getSubscription() : null;
              if (subscription && !await subscription.unsubscribe()) throw new Error("Account deleted, but browser push cleanup failed. Clear this site's data.");
            }
          } catch (error) {
            console.error("Deleted account browser push cleanup failed:", error);
            setAuthError(errorMessage(error));
          }
          const auth = firebaseAuth();
          if (auth) await signOut(auth);
          deletionToken.current = null;
        }
      } catch (error) {
        console.error("Account deletion recovery failed:", error);
        if (!cancelled) setAuthError(errorMessage(error));
      } finally { checking = false; }
    }
    void check();
    const timer = setInterval(() => { void check(); }, 15_000);
    window.addEventListener("online", check);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener("online", check); };
  }, [user, runtime, snapshot.deletionPending, snapshot.accountDeleted, authBusy]);

  async function connect() {
    setAuthBusy(true); setAuthError(null);
    try {
      const auth = firebaseAuth();
      if (!auth) throw new Error("Firebase hasn't been configured for this app yet.");
      importOnLogin.current = !user;
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      importOnLogin.current = false;
      console.error("Sign-in failed:", error);
      setAuthError(errorMessage(error));
    } finally { setAuthBusy(false); }
  }
  async function disconnect() {
    setAuthBusy(true); setAuthError(null);
    try {
      const auth = firebaseAuth();
      if (user) await disableDevice(user);
      if (auth) await signOut(auth);
    } catch (error) {
      console.error("Sign-out failed:", error);
      setAuthError(errorMessage(error));
    } finally { setAuthBusy(false); }
  }
  async function deleteAccount() {
    if (!user || !runtime) throw new Error("Sign in to use this feature.");
    setAuthBusy(true); setAuthError(null);
    try {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
      deletionToken.current = await user.getIdToken(true);
      await runtime.pauseForAccountDeletion();
      await runtime.applyDeletionStatus(await deleteCloudAccount(deletionToken.current));
    } catch (error) {
      console.error("Account deletion failed:", error); setAuthError(errorMessage(error));
      try { await runtime.applyDeletionStatus(await getDeletionStatus(deletionToken.current ?? await user.getIdToken())); }
      catch (recoveryError) { console.error("Account deletion recovery check failed:", recoveryError); setAuthError(errorMessage(recoveryError)); }
      throw error;
    }
    finally { setAuthBusy(false); }
  }
  async function checkAccountDeletion() {
    if (!user || !runtime) return;
    setAuthBusy(true); setAuthError(null);
    try { await runtime.applyDeletionStatus(await getDeletionStatus(deletionToken.current ?? await user.getIdToken())); }
    catch (error) { console.error("Account deletion status check failed:", error); setAuthError(errorMessage(error)); }
    finally { setAuthBusy(false); }
  }
  return { runtime, snapshot, user, authBusy, authError, connect, disconnect, deleteAccount, checkAccountDeletion, clearAuthError: () => setAuthError(null) };
}
