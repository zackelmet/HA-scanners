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
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:
            process.env.FIREBASE_ADMIN_PROJECT_ID ||
            process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          clientEmail:
            process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
            process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: (
            process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
            process.env.FIREBASE_PRIVATE_KEY
          )?.replace(/\\n/g, "\n"),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
      console.log("Firebase Admin Initialized");
    } catch (error) {
      console.error("Firebase admin initialization error", error);
      throw error;
    }
  }
  return admin;
};
