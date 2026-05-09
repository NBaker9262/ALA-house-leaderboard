import { createHash } from 'node:crypto';

const projectId = 'ala-house-leaderboard';
const apiKey = 'AIzaSyAAAz2beBA1QnvLPTbaq5LmEnR6m-VvK0s';
const adminEmail = 'nb72258@stu.alaschools.org';
const adminPassword = 'StuG0!';

const users = [
  { email: 'nb72258@stu.alaschools.org', displayName: 'Nate Briggs', role: 'superadmin' },
  { email: 'ap70382@stu.alaschools.org', displayName: 'Alexis Portillo', role: 'member' },
  { email: 'ec59654@stu.alaschools.org', displayName: 'Emily Cox', role: 'member' },
  { email: 'el71845@stu.alaschools.org', displayName: 'Elise Londonson', role: 'member' },
  { email: 'io74755@stu.alaschools.org', displayName: 'Ikponmwosa Obahiagbon', role: 'member' },
  { email: 'jd71016@stu.alaschools.org', displayName: 'Jibrilla Dartoe', role: 'member' },
  { email: 'kc73702@stu.alaschools.org', displayName: 'Kash Cravy', role: 'member' },
  { email: 'lisl.nixon@alaschools.org', displayName: 'Lisl Nixon', role: 'member' },
  { email: 'ls70990@stu.alaschools.org', displayName: 'Leia Saielli', role: 'member' },
  { email: 'nw72197@stu.alaschools.org', displayName: 'Nola Wilson', role: 'member' },
  { email: 'wp76080@stu.alaschools.org', displayName: 'Wyatt Pulaski', role: 'member' }
];

function uidFromEmail(email) {
  return `seed_${createHash('sha1').update(email).digest('hex').slice(0, 20)}`;
}

async function signIn(email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });

  if (!response.ok) {
    throw new Error(`Auth sign-in failed (${response.status}): ${await response.text()}`);
  }

  return response.json();
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  return { stringValue: String(value) };
}

async function upsertUserProfile(idToken, user) {
  const uid = uidFromEmail(user.email);
  const now = new Date().toISOString();
  const document = {
    fields: {
      uid: toFirestoreValue(uid),
      email: toFirestoreValue(user.email),
      displayName: toFirestoreValue(user.displayName),
      role: toFirestoreValue(user.role),
      status: toFirestoreValue('active'),
      createdAt: toFirestoreValue(now),
      updatedAt: toFirestoreValue(now)
    }
  };

  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(document)
  });

  if (!response.ok) {
    throw new Error(`Firestore write failed for ${user.email} (${response.status}): ${await response.text()}`);
  }
}

const session = await signIn(adminEmail, adminPassword);
for (const user of users) {
  await upsertUserProfile(session.idToken, user);
}

console.log(`Synced ${users.length} Firestore user profiles.`);