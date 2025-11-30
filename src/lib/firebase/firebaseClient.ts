import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

/**
 * Firebase configuration object.
 * These values are loaded from environment variables.
 */
const clientCredentials = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let firebase_app: FirebaseApp | null = null;
let _db: ReturnType<typeof getFirestore> | undefined;
let _auth: ReturnType<typeof getAuth> | undefined;
let _functions: ReturnType<typeof getFunctions> | undefined;

// Only initialize the Firebase *client* SDK in the browser.
// During Next.js server-side builds / prerendering, `window` is undefined
// and environment variables for the client SDK (apiKey) may not be available.
// Initializing the client SDK on the server can cause runtime errors like
// "auth/invalid-api-key" during the build. Guard initialization to the
// browser environment to avoid build-time failures.
if (typeof window !== "undefined") {
  if (!getApps().length) {
    firebase_app = initializeApp(clientCredentials);
  } else {
    firebase_app = getApps()[0];
  }

  _db = getFirestore(firebase_app);
  _auth = getAuth(firebase_app);
  _functions = getFunctions(firebase_app);
}

// Exports: on the server these will be `undefined` which prevents the client
// SDK from running during build/prerender. Consumers must only use these
// exports from browser code (client components / effects).
export default firebase_app as unknown as FirebaseApp;
export const db = _db as ReturnType<typeof getFirestore>;
export const auth = _auth as ReturnType<typeof getAuth>;
export const functions = _functions as ReturnType<typeof getFunctions>;
