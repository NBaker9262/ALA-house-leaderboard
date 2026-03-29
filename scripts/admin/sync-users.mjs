import admin from "firebase-admin";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const projectId = process.env.FIREBASE_PROJECT_ID || "ala-house-leaderboard";
const dryRun = !process.argv.includes("--apply");
const defaultPassword = process.env.SYNC_USERS_DEFAULT_PASSWORD || "";
const firebaseToolsConfigPath = path.join(os.homedir(), ".config", "configstore", "firebase-tools.json");
const usersConfigPath = process.env.SYNC_USERS_FILE || path.join(process.cwd(), "scripts", "admin", "users.local.json");

const PERMISSIONS = [
  "scoreEdit",
  "proposePoints",
  "placeAwards",
  "studentLookup",
  "approveProposals",
  "historyAccess",
  "restoreHistory",
  "checkpoint",
  "downloadBackup",
  "resetAll",
  "passwordReset",
  "manageUsers",
  "manageCatalog"
];

const ROLE_DEFAULTS = {
  superadmin: {
    scoreEdit: true,
    proposePoints: true,
    placeAwards: true,
    studentLookup: true,
    approveProposals: true,
    historyAccess: true,
    restoreHistory: true,
    checkpoint: true,
    downloadBackup: true,
    resetAll: true,
    passwordReset: true,
    manageUsers: true,
    manageCatalog: true
  },
  admin: {
    scoreEdit: true,
    proposePoints: true,
    placeAwards: true,
    studentLookup: true,
    approveProposals: true,
    historyAccess: true,
    restoreHistory: true,
    checkpoint: true,
    downloadBackup: true,
    resetAll: false,
    passwordReset: true,
    manageUsers: false,
    manageCatalog: false
  },
  staff: {
    scoreEdit: true,
    proposePoints: false,
    placeAwards: true,
    studentLookup: true,
    approveProposals: false,
    historyAccess: true,
    restoreHistory: false,
    checkpoint: true,
    downloadBackup: false,
    resetAll: false,
    passwordReset: true,
    manageUsers: false,
    manageCatalog: false
  },
  helper: {
    scoreEdit: false,
    proposePoints: true,
    placeAwards: true,
    studentLookup: true,
    approveProposals: false,
    historyAccess: true,
    restoreHistory: false,
    checkpoint: false,
    downloadBackup: false,
    resetAll: false,
    passwordReset: false,
    manageUsers: false,
    manageCatalog: false
  }
};

function loadUsersConfig() {
  try {
    const raw = readFileSync(usersConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    const value = Array.isArray(parsed) ? parsed : parsed?.users;
    if (Array.isArray(value)) return value;
    console.warn(`User config ${usersConfigPath} must be an array or {\"users\": []}.`);
    return [];
  } catch {
    return [];
  }
}

const users = loadUsersConfig();

function usage() {
  console.log(`\nUsage:\n  node scripts/admin/sync-users.mjs [--apply]\n  node scripts/admin/sync-users.mjs --list\n  node scripts/admin/sync-users.mjs --email=user@x.com [--set-role=helper|staff|admin|superadmin] [--name="Display Name"] [--grant=p1,p2] [--revoke=p3] [--password=NewPass] [--preserve-password] [--apply]\n\nDefaults:\n  - No --apply => dry-run\n  - Bulk user list loaded from ${usersConfigPath}\n  - Default password loaded from SYNC_USERS_DEFAULT_PASSWORD when provided\n\nPermissions:\n  ${PERMISSIONS.join(", ")}\n`);
}

function normalizeRole(role) {
  return role === "superadmin" || role === "admin" || role === "staff" || role === "helper" ? role : "staff";
}

function sanitizePermissions(raw) {
  const out = {};
  PERMISSIONS.forEach(key => {
    if (typeof raw?.[key] === "boolean") out[key] = raw[key];
  });
  return out;
}

function resolvePermissions(role, overrides = {}) {
  const defaults = ROLE_DEFAULTS[normalizeRole(role)] || ROLE_DEFAULTS.staff;
  return { ...defaults, ...sanitizePermissions(overrides) };
}

function calculateOverrides(role, absolutePermissions = {}) {
  const defaults = ROLE_DEFAULTS[normalizeRole(role)] || ROLE_DEFAULTS.staff;
  const clean = sanitizePermissions(absolutePermissions);
  const overrides = {};

  PERMISSIONS.forEach(key => {
    if (typeof clean[key] === "boolean" && clean[key] !== defaults[key]) {
      overrides[key] = clean[key];
    }
  });

  return overrides;
}

function claimsFor(role, permissions) {
  return {
    role,
    admin: role === "admin" || role === "superadmin",
    superadmin: role === "superadmin",
    helper: role === "helper",
    canResetAll: Boolean(permissions.resetAll),
    canMassChange: Boolean(permissions.manageUsers || permissions.resetAll),
    simpleViewLocked: role === "staff" || role === "helper",
    permissions
  };
}

function parseCsv(value) {
  return value
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function parseArgs(argv) {
  const args = {
    apply: argv.includes("--apply"),
    list: argv.includes("--list"),
    help: argv.includes("--help") || argv.includes("-h"),
    emails: [],
    setRole: null,
    setName: null,
    grant: [],
    revoke: [],
    password: null,
    preservePassword: argv.includes("--preserve-password")
  };

  argv.forEach(item => {
    if (item.startsWith("--email=")) {
      args.emails.push(...parseCsv(item.slice("--email=".length)).map(v => v.toLowerCase()));
      return;
    }
    if (item.startsWith("--set-role=")) {
      args.setRole = normalizeRole(item.slice("--set-role=".length));
      return;
    }
    if (item.startsWith("--name=")) {
      args.setName = item.slice("--name=".length).trim();
      return;
    }
    if (item.startsWith("--grant=")) {
      args.grant.push(...parseCsv(item.slice("--grant=".length)));
      return;
    }
    if (item.startsWith("--revoke=")) {
      args.revoke.push(...parseCsv(item.slice("--revoke=".length)));
      return;
    }
    if (item.startsWith("--password=")) {
      args.password = item.slice("--password=".length);
    }
  });

  return args;
}

function validatePermissionArgs(keys, label) {
  const normalized = [...new Set(keys)];
  const invalid = normalized.filter(key => !PERMISSIONS.includes(key));
  if (invalid.length) {
    throw new Error(`Invalid ${label} permission(s): ${invalid.join(", ")}`);
  }
  return normalized;
}

function chooseTargets(args) {
  if (!args.emails.length) return users;

  const fromConfig = args.emails
    .map(email => users.find(user => user.email.toLowerCase() === email))
    .filter(Boolean);

  const configuredEmails = new Set(fromConfig.map(user => user.email.toLowerCase()));
  const adHoc = args.emails
    .filter(email => !configuredEmails.has(email))
    .map(email => ({
      email,
      name: email,
      role: "staff",
      preservePassword: false
    }));

  return [...fromConfig, ...adHoc];
}

function firebaseCliRefreshToken() {
  try {
    const raw = readFileSync(firebaseToolsConfigPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.tokens?.refresh_token || "";
  } catch {
    return "";
  }
}

function ensureAdcFromFirebaseCli() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const refreshToken = firebaseCliRefreshToken();
  if (!refreshToken) return;
  const clientId = process.env.FIREBASE_CLIENT_ID || "";
  const clientSecret = process.env.FIREBASE_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) {
    console.warn("Firebase CLI token found, but FIREBASE_CLIENT_ID/FIREBASE_CLIENT_SECRET are missing. Skipping temporary ADC generation.");
    return;
  }

  const tmpAdcPath = path.join(os.tmpdir(), "ala-house-leaderboard-firebase-cli-adc.json");
  const adcPayload = {
    type: "authorized_user",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken
  };
  writeFileSync(tmpAdcPath, JSON.stringify(adcPayload, null, 2), "utf8");
  process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpAdcPath;
}

if (!admin.apps.length) {
  ensureAdcFromFirebaseCli();
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId
  });
}

const auth = admin.auth();
const db = admin.firestore();

async function findUserByEmail(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

async function readExistingProfile(uid) {
  const snap = await db.collection("userProfiles").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function buildPlan(entry, args, existingRecord, existingProfile) {
  const email = entry.email.toLowerCase();
  const role = normalizeRole(args.setRole || entry.role || existingProfile?.role || "staff");
  const existingRole = normalizeRole(existingProfile?.role || "staff");
  const existingOverrides = sanitizePermissions(existingProfile?.permissionOverrides);
  const existingAbsolute = sanitizePermissions(existingProfile?.permissions);
  const roleChanged = role !== existingRole;
  const baseAbsolute = roleChanged
    ? resolvePermissions(role)
    : Object.keys(existingAbsolute).length
      ? existingAbsolute
      : resolvePermissions(role, existingOverrides);

  const withGrants = { ...baseAbsolute };
  args.grant.forEach(key => { withGrants[key] = true; });
  args.revoke.forEach(key => { withGrants[key] = false; });

  const permissionOverrides = calculateOverrides(role, withGrants);
  const permissions = resolvePermissions(role, permissionOverrides);

  const name = args.setName || entry.name || existingRecord?.displayName || email;

  let password = null;
  if (args.password !== null) {
    password = args.password;
  } else if (!args.preservePassword && !entry.preservePassword) {
    password = defaultPassword || null;
  }

  return {
    email,
    role,
    name,
    accountGroupId: typeof entry.accountGroupId === "string" && entry.accountGroupId.trim()
      ? entry.accountGroupId.trim()
      : (typeof existingProfile?.accountGroupId === "string" ? existingProfile.accountGroupId : ""),
    primaryEmail: typeof entry.primaryEmail === "string" && entry.primaryEmail.trim()
      ? entry.primaryEmail.trim().toLowerCase()
      : (typeof existingProfile?.primaryEmail === "string" ? existingProfile.primaryEmail.toLowerCase() : ""),
    permissions,
    permissionOverrides,
    password,
    preservePassword: password === null
  };
}

async function applyPlan(existingRecord, plan) {
  let userRecord = existingRecord;

  if (!userRecord) {
    const createPassword = plan.password || defaultPassword;
    if (!createPassword) {
      throw new Error(`No password available for new user ${plan.email}. Pass --password or set SYNC_USERS_DEFAULT_PASSWORD.`);
    }
    const createPayload = {
      email: plan.email,
      displayName: plan.name,
      password: createPassword
    };
    userRecord = await auth.createUser(createPayload);
  } else {
    const updates = { displayName: plan.name };
    if (plan.password) updates.password = plan.password;
    await auth.updateUser(userRecord.uid, updates);
  }

  const claims = claimsFor(plan.role, plan.permissions);
  await auth.setCustomUserClaims(userRecord.uid, claims);

  await db.collection("userProfiles").doc(userRecord.uid).set({
    uid: userRecord.uid,
    name: plan.name,
    email: plan.email,
    role: plan.role,
    accountGroupId: plan.accountGroupId || null,
    primaryEmail: plan.primaryEmail || plan.email,
    permissions: plan.permissions,
    permissionOverrides: plan.permissionOverrides,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "sync-users-script"
  }, { merge: true });

  return userRecord.uid;
}

function printPlan(mode, existingRecord, plan) {
  const action = existingRecord ? "update" : "create";
  console.log(`[${mode}] ${action} ${plan.email}`);
  console.log(`        role=${plan.role} name=${plan.name}`);
  console.log(`        password=${plan.preservePassword ? "preserve" : "set"}`);
  console.log(`        overrides=${JSON.stringify(plan.permissionOverrides)}`);
}

async function runList() {
  const snap = await db.collection("userProfiles").get();
  const rows = snap.docs
    .map(docSnap => ({ uid: docSnap.id, ...docSnap.data() }))
    .sort((a, b) => String(a.name || a.email || "").localeCompare(String(b.name || b.email || "")));

  if (!rows.length) {
    console.log("No userProfiles records found.");
    return;
  }

  rows.forEach(row => {
    console.log(`${row.name || "(No Name)"} | ${row.email || row.uid} | role=${normalizeRole(row.role)}`);
  });
  console.log(`Total: ${rows.length}`);
}

async function run() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    usage();
    return;
  }

  args.grant = validatePermissionArgs(args.grant, "grant");
  args.revoke = validatePermissionArgs(args.revoke, "revoke");

  if (args.list) {
    await runList();
    return;
  }

  const targets = chooseTargets(args);
  if (!targets.length) {
    console.log("No users matched the requested filter.");
    return;
  }

  console.log(dryRun ? "Running dry-run. No changes will be written." : "Running apply mode. Changes will be written.");

  for (const entry of targets) {
    const existingRecord = await findUserByEmail(entry.email);
    const existingProfile = existingRecord ? await readExistingProfile(existingRecord.uid) : null;
    const plan = buildPlan(entry, args, existingRecord, existingProfile);

    if (dryRun) {
      printPlan("dry-run", existingRecord, plan);
      continue;
    }

    const uid = await applyPlan(existingRecord, plan);
    printPlan("applied", { uid }, plan);
  }

  console.log("Sync complete.");
}

run().catch(error => {
  console.error("Sync failed:", error.message);
  process.exitCode = 1;
});
