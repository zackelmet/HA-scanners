/*
 * Cleanup script for scans data (Firestore + GCS).
 * Default is DRY RUN. Set DRY_RUN=0 to actually delete.
 * To delete everything, set DELETE_ALL=1. Otherwise it deletes docs with createdAt/startTime older than CUTOFF_DAYS (default 30).
 * Bucket defaults to hosted-scanners-scan-results; override with SCAN_RESULTS_BUCKET.
 */

const admin = require("firebase-admin");

const dryRun = process.env.DRY_RUN !== "0"; // default true
const deleteAll = process.env.DELETE_ALL === "1";
const cutoffDays = Number(process.env.CUTOFF_DAYS || "30");
const cutoffMs = Date.now() - cutoffDays * 24 * 60 * 60 * 1000;
const bucketName =
  process.env.SCAN_RESULTS_BUCKET || "hosted-scanners-scan-results";

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: bucketName,
  });
}

const db = admin.firestore();
const bucket = admin.storage().bucket(bucketName);

function shouldDeleteDoc(doc) {
  if (deleteAll) return true;
  const data = doc.data() || {};
  const ts = data.createdAt || data.startTime || data.endTime || null;
  if (ts && typeof ts.toDate === "function") {
    return ts.toDate().getTime() < cutoffMs;
  }
  return true; // fallback if no timestamp present
}

async function deleteBatch(query, label) {
  let total = 0;
  // limit batches to keep memory down
  while (true) {
    const snap = await query.limit(300).get();
    if (snap.empty) break;
    const docsToDelete = snap.docs.filter((doc) => shouldDeleteDoc(doc));
    const batch = db.batch();
    docsToDelete.forEach((doc) => batch.delete(doc.ref));
    const toDelete = docsToDelete.length;
    if (!dryRun && toDelete > 0) {
      await batch.commit();
    }
    total += toDelete;
    if (toDelete === 0 && dryRun) break; // nothing matched
    if (snap.size < 300) break;
  }
  console.log(`${label}: ${dryRun ? "would delete" : "deleted"} ${total}`);
  return total;
}

async function deleteGlobalScans() {
  const base = db.collection("scans");
  const query = deleteAll
    ? base
    : base.where(
        "createdAt",
        "<",
        admin.firestore.Timestamp.fromMillis(cutoffMs),
      );
  return deleteBatch(query, "Global scans");
}

async function deleteCompletedScansGroup() {
  const query = db.collectionGroup("completedScans");
  return deleteBatch(query, "User completedScans");
}

async function deleteUsageDocs() {
  if (!deleteAll) return 0;
  const snap = await db.collection("usage").get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  if (!dryRun) await batch.commit();
  console.log(
    `Usage docs: ${dryRun ? "would delete" : "deleted"} ${snap.size}`,
  );
  return snap.size;
}

async function deleteGcsFiles() {
  const [files] = await bucket.getFiles({ prefix: "scan-results/" });
  const toDelete = files.filter((file) => {
    if (deleteAll) return true;
    const updated = file.metadata && file.metadata.updated;
    if (!updated) return true;
    const updatedMs = new Date(updated).getTime();
    return updatedMs < cutoffMs;
  });

  if (dryRun) {
    console.log(
      `GCS: would delete ${toDelete.length} of ${files.length} files`,
    );
    return toDelete.length;
  }

  const chunkSize = 50;
  for (let i = 0; i < toDelete.length; i += chunkSize) {
    const chunk = toDelete.slice(i, i + chunkSize);
    await Promise.all(chunk.map((file) => file.delete().catch(() => null)));
    console.log(
      `Deleted ${Math.min(i + chunkSize, toDelete.length)}/${toDelete.length} files...`,
    );
  }
  console.log(
    `GCS: deleted ${toDelete.length} files (of ${files.length} listed)`,
  );
  return toDelete.length;
}

async function main() {
  console.log(`Dry run: ${dryRun ? "YES" : "NO"}`);
  console.log(`Delete all: ${deleteAll ? "YES" : "NO"}`);
  console.log(`Cutoff days: ${cutoffDays}`);
  console.log(`Bucket: ${bucketName}`);

  await deleteGlobalScans();
  await deleteCompletedScansGroup();
  await deleteUsageDocs();
  await deleteGcsFiles();

  if (dryRun) {
    console.log("Nothing deleted (dry run). Set DRY_RUN=0 to apply.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
