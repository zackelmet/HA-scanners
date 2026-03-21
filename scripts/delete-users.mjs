import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

const envContent = readFileSync('/home/zack/Desktop/WebDev/Hacker Analytics/SaaS/.env.local', 'utf8');
const parseEnv = (content) => {
  const vars = {};
  const lines = content.split('\n');
  let currentKey = null;
  let currentVal = '';
  let inQuote = false;
  for (const line of lines) {
    if (!inQuote) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)/);
      if (match) {
        if (currentKey) vars[currentKey] = currentVal;
        currentKey = match[1];
        currentVal = match[2];
        if (currentVal.startsWith('"') && !currentVal.endsWith('"')) {
          inQuote = true;
          currentVal = currentVal.slice(1);
        } else {
          currentVal = currentVal.replace(/^"|"$/g, '');
          vars[currentKey] = currentVal;
          currentKey = null; currentVal = '';
        }
      }
    } else {
      if (line.endsWith('"')) {
        currentVal += '\n' + line.slice(0, -1);
        vars[currentKey] = currentVal;
        currentKey = null; currentVal = ''; inQuote = false;
      } else { currentVal += '\n' + line; }
    }
  }
  return vars;
};
const env = parseEnv(envContent);
const privateKey = env['FIREBASE_ADMIN_PRIVATE_KEY'].replace(/\\n/g, '\n');
const clientEmail = env['FIREBASE_ADMIN_CLIENT_EMAIL'];

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId: 'hosted-scanners-30b84', clientEmail, privateKey })
  });
}

const db = admin.firestore();

// Keep ONLY Connor
const KEEP_UID = 'rrZhtmM1XaTWK4ACRIU6HXDPtoF3';

const snap = await db.collection('users').get();
const toDelete = snap.docs.filter(d => d.id !== KEEP_UID);

console.log(`Found ${snap.size} total users. Deleting ${toDelete.length}...`);

for (const doc of toDelete) {
  const data = doc.data();
  console.log(`Deleting: ${doc.id} | ${data.email}`);

  // Delete Firestore doc
  await db.collection('users').doc(doc.id).delete();
  console.log(`  ✅ Firestore doc deleted`);

  // Delete Firebase Auth account
  try {
    await admin.auth().deleteUser(doc.id);
    console.log(`  ✅ Auth account deleted`);
  } catch (e) {
    console.log(`  ⚠️  Auth deletion: ${e.message}`);
  }
}

console.log('\n✅ Done. Remaining users:');
const remaining = await db.collection('users').get();
remaining.docs.forEach(d => console.log(`  ${d.id} | ${d.data().email}`));
