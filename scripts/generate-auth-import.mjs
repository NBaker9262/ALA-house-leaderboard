import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultPassword = 'StuG0!';
const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(projectRoot, '..', 'auth-users.import.json');

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

function slugFromEmail(email) {
  return createHash('sha1').update(email).digest('hex').slice(0, 20);
}

function hashPassword(password, salt) {
  return pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

const records = users.map(user => {
  const salt = randomBytes(16);
  const passwordHash = hashPassword(defaultPassword, salt);

  return {
    uid: `seed_${slugFromEmail(user.email)}`,
    email: user.email,
    displayName: user.displayName,
    customClaims: { role: user.role },
    passwordHash: passwordHash.toString('base64'),
    passwordSalt: salt.toString('base64')
  };
});

await writeFile(outputPath, JSON.stringify(records, null, 2));
console.log(`Wrote ${records.length} auth user records to ${outputPath}`);