/**
 * Migration Script: Add ZAP scanner limits to existing users
 *
 * This script updates all existing user documents in Firestore to include
 * the new ZAP scanner limits in their scannerLimits and scannersUsedThisMonth.
 *
 * Usage:
 *   node scripts/migrateUserScans.js
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

// Try to load from service account JSON file
const serviceAccountPath = path.join(
  __dirname,
  "../gcp/keys/hosted-scanners-appspot-key.json",
);

if (!fs.existsSync(serviceAccountPath)) {
  console.error(
    "❌ Service account key file not found at:",
    serviceAccountPath,
  );
  console.error(
    "   Please ensure gcp/keys/hosted-scanners-appspot-key.json exists",
  );
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Plan limits (should match src/lib/types/user.ts)
const PLAN_LIMITS = {
  free: {
    scanners: { nmap: 0, openvas: 0, nikto: 0, zap: 0 },
  },
  essential: {
    scanners: { nmap: 1920, openvas: 240, nikto: 60, zap: 240 },
  },
  pro: {
    scanners: { nmap: 15360, openvas: 1920, nikto: 300, zap: 1920 },
  },
  scale: {
    scanners: { nmap: 122880, openvas: 7680, nikto: 1500, zap: 7680 },
  },
};

async function migrateUsers() {
  console.log("🚀 Starting user migration to add ZAP scanner limits...\n");

  try {
    // Get all users
    const usersSnapshot = await db.collection("users").get();

    if (usersSnapshot.empty) {
      console.log("❌ No users found in database");
      return;
    }

    console.log(`📊 Found ${usersSnapshot.size} users to migrate\n`);

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // Process each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const currentPlan = userData.currentPlan || "free";

      console.log(`\n👤 Processing user: ${userId}`);
      console.log(`   Email: ${userData.email || "N/A"}`);
      console.log(`   Plan: ${currentPlan}`);

      try {
        // Check if user already has zap in scannerLimits
        const hasZapLimit =
          userData.scannerLimits &&
          typeof userData.scannerLimits.zap !== "undefined";
        const hasZapUsage =
          userData.scannersUsedThisMonth &&
          typeof userData.scannersUsedThisMonth.zap !== "undefined";

        if (hasZapLimit && hasZapUsage) {
          console.log(
            `   ✅ User already has ZAP limits and usage counters - skipping`,
          );
          skipCount++;
          continue;
        }

        // Get plan limits for this user's tier
        const planLimits = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

        // Prepare update object
        const updateData = {};

        // Add zap to scannerLimits if missing
        if (!hasZapLimit) {
          updateData["scannerLimits.zap"] = planLimits.scanners.zap;
          console.log(
            `   📝 Adding scannerLimits.zap: ${planLimits.scanners.zap}`,
          );
        }

        // Add zap to scannersUsedThisMonth if missing
        if (!hasZapUsage) {
          updateData["scannersUsedThisMonth.zap"] = 0;
          console.log(`   📝 Adding scannersUsedThisMonth.zap: 0`);
        }

        // Update timestamp
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

        // Perform the update
        await userDoc.ref.update(updateData);

        console.log(`   ✅ Successfully updated user`);
        successCount++;
      } catch (error) {
        console.error(`   ❌ Error updating user ${userId}:`, error.message);
        errorCount++;
      }
    }

    // Print summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 Migration Summary:");
    console.log("=".repeat(60));
    console.log(`✅ Successfully updated: ${successCount} users`);
    console.log(`⏭️  Skipped (already migrated): ${skipCount} users`);
    console.log(`❌ Errors: ${errorCount} users`);
    console.log(`📈 Total processed: ${usersSnapshot.size} users`);
    console.log("=".repeat(60));

    if (errorCount === 0) {
      console.log("\n🎉 Migration completed successfully!");
    } else {
      console.log(
        "\n⚠️  Migration completed with some errors. Please review above.",
      );
    }
  } catch (error) {
    console.error("\n❌ Fatal error during migration:", error);
    throw error;
  } finally {
    // Close Firebase connection
    await admin.app().delete();
    console.log("\n🔒 Firebase connection closed");
  }
}

// Run the migration
migrateUsers()
  .then(() => {
    console.log("\n✨ Migration script finished");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Migration script failed:", error);
    process.exit(1);
  });
