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

    const userRef = doc(db, "users", currentUser.uid);
    const unsubscribe = onSnapshot(
      userRef,
      (doc) => {
        if (doc.exists()) {
          setUserData(doc.data() as UserDocument);
        } else {
          setUserData(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching user data:", error);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [currentUser]);

  return { userData, loading };
}
