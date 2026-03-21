"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase/firebaseClient";
import { useAuth } from "@/lib/context/AuthContext";
import { UserDocument } from "@/lib/types/user";

export function useUserData() {
  const { currentUser } = useAuth();
  const [userData, setUserData] = useState<UserDocument | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setUserData(null);
      setLoading(false);
      return;
    }

    console.log(
      "🔍 useUserData: Setting up listener for user:",
      currentUser.uid,
    );

    const userRef = doc(db, "users", currentUser.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (doc) => {
        if (doc.exists()) {
          const data = doc.data() as UserDocument;
          console.log("📊 useUserData: User data updated:", {
            scanCredits: data.scanCredits,
            scansUsed: data.scansUsed,
          });
          setUserData(data);
        } else {
          console.warn("⚠️ useUserData: User document does not exist");
          setUserData(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("❌ useUserData: Error fetching user data:", error);
        setLoading(false);
      },
    );

    return () => {
      console.log("🔌 useUserData: Cleaning up listener");
      unsubscribe();
    };
  }, [currentUser]);

  return { userData, loading };
}
