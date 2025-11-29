"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  where,
  limit,
} from "firebase/firestore";
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
      async (snap) => {
        const items: any[] = [];
        snap.forEach((doc) => items.push({ scanId: doc.id, ...doc.data() }));

        // If per-user subcollection is empty, fall back to global `scans`
        // collection for queued / in_progress entries so users see enqueued
        // scans while migration completes.
        if (items.length === 0) {
          try {
            const scansQ = query(
              collection(db, "scans"),
              where("userId", "==", uid),
              where("status", "in", ["queued", "in_progress"]),
              orderBy("createdAt", "desc"),
              limit(50),
            );
            const snapGlobal = await getDocs(scansQ);
            const globalItems: any[] = [];
            snapGlobal.forEach((doc) => {
              const data = doc.data();
              globalItems.push({
                scanId: doc.id,
                type: data.type,
                target: data.target,
                status: data.status,
                startTime: data.startTime || data.createdAt || null,
                endTime: data.endTime || null,
                resultsSummary: data.resultsSummary || null,
                gcpStorageUrl: data.gcpStorageUrl || null,
              });
            });

            if (globalItems.length > 0) {
              setScans(globalItems);
              setLoading(false);
              return;
            }
          } catch (err) {
            console.error(
              "useUserScans: fallback global scans query failed",
              err,
            );
          }
        }

        setScans(items);
        setLoading(false);
      },
      async (err) => {
        console.error("useUserScans: snapshot error", err);
        // Try fallback to global scans query if snapshot subscription fails
        try {
          const scansQ = query(
            collection(db, "scans"),
            where("userId", "==", uid),
            where("status", "in", ["queued", "in_progress"]),
            orderBy("createdAt", "desc"),
            limit(50),
          );
          const snapGlobal = await getDocs(scansQ);
          const globalItems: any[] = [];
          snapGlobal.forEach((doc) => {
            const data = doc.data();
            globalItems.push({
              scanId: doc.id,
              type: data.type,
              target: data.target,
              status: data.status,
              startTime: data.startTime || data.createdAt || null,
              endTime: data.endTime || null,
              resultsSummary: data.resultsSummary || null,
              gcpStorageUrl: data.gcpStorageUrl || null,
            });
          });

          setScans(globalItems);
        } catch (fallbackErr) {
          console.error(
            "useUserScans: fallback global scans query failed",
            fallbackErr,
          );
          setScans([]);
        }

        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [uid]);

  return { scans, loading };
}
