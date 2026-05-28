import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize DB with Web Persistent Local Cache to prevent repeated reads under rate limits
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({})
});
export const auth = getAuth();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Robust, skill-compliant check to handle and propagate Firestore permission errors.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Executes a database or general promise function using exponential backoff retry.
 * Handles rate limits, quota issues, and resource unavailability seamlessly.
 */
export async function runWithRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 800,
  factor: number = 2
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error: any) {
      attempt++;
      const errorMsg = String(error?.message || error || "").toLowerCase();
      // Detect common rate limit, exhaustion, resource-unreachable or quota-exceeded errors
      const isRateOrQuota = (
        errorMsg.includes("quota") ||
        errorMsg.includes("exhausted") ||
        errorMsg.includes("rate") ||
        errorMsg.includes("limit") ||
        errorMsg.includes("unavailable") ||
        errorMsg.includes("resource") ||
        error?.code === "resource-exhausted" ||
        error?.code === "unavailable"
      );
      if (attempt >= maxRetries || !isRateOrQuota) {
        throw error;
      }
      const sleepTime = delayMs * Math.pow(factor, attempt - 1);
      console.warn(`[Retry Engine] Attempt ${attempt} failed due to rate limits or network issues. Retrying in ${sleepTime}ms...`, error);
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
    }
  }
}
