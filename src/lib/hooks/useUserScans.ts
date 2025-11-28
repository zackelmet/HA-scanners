"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase/firebaseClient";

export function useUserScans(uid?: string | null) {
  const [scans, setScans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setScans([]);
      setLoading(false);
      return;
    }

    const scansCol = collection(db, "users", uid, "completedScans");
    const q = query(scansCol, orderBy("startTime", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items: any[] = [];
        snap.forEach((doc) => items.push({ scanId: doc.id, ...doc.data() }));
        setScans(items);
        setLoading(false);
      },
      (err) => {
        console.error("useUserScans: snapshot error", err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [uid]);

  return { scans, loading };
}
