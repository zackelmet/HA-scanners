import admin from "firebase-admin";

/**
 * Initializes the Firebase Admin SDK. (SHOULD ONLY BE USED IN SERVER SIDE)
 *
 * This function initializes the Firebase Admin SDK with the provided credentials.
 * It is used to interact with Firebase services from a server environment.
 *
 * @returns {void}
 */
export const initializeAdmin = () => {
  if (!admin.apps.length) {
    try {
      // Prefer explicit service account credentials when provided (Vercel env vars)
      const projectId =
        process.env.FIREBASE_ADMIN_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const clientEmail =
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
        process.env.FIREBASE_CLIENT_EMAIL;
      const privateKey = (
        process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
        process.env.FIREBASE_PRIVATE_KEY
      )?.replace(/\\n/g, "\n");

      if (projectId && clientEmail && privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        });
        console.log(
          "Firebase Admin initialized using explicit service account",
        );
      } else {
        // Fall back to application default credentials (useful for Cloud Build / GCP environments)
        try {
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          });
          console.log(
            "Firebase Admin initialized using application default credentials",
          );
        } catch (adcErr) {
          // During build (or environments without credentials) we don't want to fail the entire build.
          // Log the error and continue; runtime requests will fail if credentials are actually required.
          console.error(
            "Firebase admin applicationDefault init failed:",
            adcErr,
          );
          console.warn(
            "Firebase Admin not initialized: no service account env vars and application default credentials unavailable.",
          );
        }
      }
    } catch (error) {
      console.error("Firebase admin initialization unexpected error", error);
    }
  }
  return admin;
};
