import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const admin = require('firebase-admin');

// Parse .env.local - handle quoted multi-line values
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
          currentKey = null;
          currentVal = '';
        }
      }
    } else {
      if (line.endsWith('"')) {
        currentVal += '\n' + line.slice(0, -1);
        vars[currentKey] = currentVal;
        currentKey = null;
        currentVal = '';
        inQuote = false;
      } else {
        currentVal += '\n' + line;
      }
    }
  }
  return vars;
};
const env = parseEnv(envContent);
const privateKey = env['FIREBASE_ADMIN_PRIVATE_KEY'].replace(/\\n/g, '\n');
const clientEmail = env['FIREBASE_ADMIN_CLIENT_EMAIL'];
console.log('Using client email:', clientEmail);
console.log('Key starts with:', privateKey.substring(0, 40));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: 'hosted-scanners-30b84',
      clientEmail,
      privateKey
    })
  });
}

const db = admin.firestore();
const snap = await db.collection('users').get();

console.log(`\nTotal Firestore users: ${snap.size}\n`);
console.log('UID                                  | EMAIL                          | STATUS    | PLAN      | CREDITS');
console.log('-------------------------------------+--------------------------------+-----------+-----------+--------');
for (const doc of snap.docs) {
  const d = doc.data();
  const credits = d.scannerLimits ? `nmap:${d.scannerLimits.nmap} openvas:${d.scannerLimits.openvas} zap:${d.scannerLimits.zap}` : 'N/A';
  console.log(`${doc.id} | ${(d.email || 'N/A').padEnd(30)} | ${(d.subscriptionStatus || 'N/A').padEnd(9)} | ${(d.currentPlan || 'N/A').padEnd(9)} | ${credits}`);
}
