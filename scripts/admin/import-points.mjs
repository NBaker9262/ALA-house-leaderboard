import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import readline from "readline";

// Initialize Firebase Admin
const serviceAccountPath = path.resolve("./service-account-key.json");
if (!fs.existsSync(serviceAccountPath)) {
  console.error("❌ service-account-key.json not found");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Parse command line arguments
const args = process.argv.slice(2);
const MODE = args.includes("--apply") ? "apply" : "preview";

// Sample data embedded (user provides this)
const POINT_DATA = `Blue	30	Assembly Games	8/22/25
Silver	20	Assembly Games	8/22/25
Red	14	RAISE Cards August	9/1/25
White	13	RAISE Cards August	9/1/25
Blue	24	RAISE Cards August	9/1/25
Silver	18	RAISE Cards August	9/1/25
White	10	Scavenger Hunt (Trinity White)	9/3/25
Red	10	Scavenger Hunt (Janie Worlton)	9/16/25
White	10	Scavenger Hunt- Spirit Week (Ryan Gill)	9/22/25
Blue	20	Lunch Games- Basketball	9/23/25
Silver	10	Scavenger Hunt- Spirit Week (Emily Nixon)	9/23/25
White	10	Scavenger Hunt- Spirit Week (Trinity White)	9/24/25
Blue	20	Lunch Games- Jeopardy	9/25/25
Silver	10	Scavenger Hunt-Spirit Week (Ian Barahas)	9/25/25
Red	18	HOCO games attendance	9/25/25
White	17	HOCO games attendance	9/25/25
Blue	24	HOCO games attendance	9/25/25
Silver	22	HOCO games attendance	9/25/25
Blue	10	Scavenger Hunt-Spirit Week (Bryson Jones-Lynn)	9/26/25
Red	40	HOCO Hobby Horse	9/26/25
White	40	HOCO Hobby Horse 2	9/26/25
Silver	40	Potato Sack Race	9/26/25
Red	40	Potato Sack Race 2	9/26/25
Blue	40	Tug-Of-War	9/26/25
Silver	40	Raffle	9/26/25
Blue	27	Homecoming Dance Attendance	9/26/25
Red	31	Homecoming Dance Attendance	9/26/25
White	29	Homecoming Dance Attendance	9/26/25
Silver	32	Homecoming Dance Attendance	9/26/25
White	10	Scavenger Hunt	10/2/25
White	31	RAISE Cards September-October	11/4/25
Silver	37	RAISE Cards September-October	11/4/25
Blue	38	RAISE Cards September-October	11/4/25
Red	49	RAISE Cards September-October	11/4/25
Blue	5	Scavenger Hunt (Vanessa Olson)	11/6/25
Silver	5	Scavenger Hunt (Emily Nixon)	11/6/25
Blue	10	Assembly Cheer Off	12/5/25
Blue	50	Assembly Box Stacking Game	12/5/25
Blue	50	Assembly Pool Float Game	12/5/25
Blue	10	Mascot Naming Contest	12/5/25
Blue	50	Assembly Basketball Balance Game	12/5/25
Red	20	Scavenger Hunt (Blake Paniti)	1/15/26
White	20	Scavenger Hunt (Madelyn Michopoulos)	1/21/26
Blue	20	Scavenger Hunt (Isabelle Cullimore)	1/21/26
Silver	20	Scavenger Hunt (Josephine Wenndt)	1/21/26
White	10	Scavenger Hunt (Rae-Lynn Peterson)	1/21/26
Silver	20	Scavenger Hunt (Ian Barajas)	1/28/26
Silver	20	Scavenger Hunt (Emily Nixon)	1/28/26
Blue	50	Powderpuff Game	1/30/26
Silver	50	Powderpuff Game	1/30/26
Red	25	Powderpuff Game	1/30/26
White	25	Powderpuff Game	1/30/26
Red	21	RAISE Cards - January	2/3/26
White	17	RAISE Cards - January	2/3/26
Blue	24	RAISE Cards - January	2/3/26
Silver	26	RAISE Cards - January	2/3/26
Blue	20	Scavenger Hunt  (Bristol Thompson)	2/4/26
Blue	20	Scavenger Hunt  (Vanessa Olson)	2/4/26
Red	420	Academic Awards Points 	2/6/26
White	335	Academic Awards Points 	2/6/26
Blue	425	Academic Awards Points 	2/6/26
Silver	355	Academic Awards Points 	2/6/26
Red	50	Assembly Cheer Off First Place	3/13/26
Silver	30	Assembly Cheer Off Second Place	3/13/26
Red	50	Assembly Relay Race Game First Place	3/13/26
Red	-30	Cheating on Relay Race Points Deduction (3)	3/13/26
Silver	30	Assembly Relay Race Game Second Place	3/13/26
Blue	15	Assembly Relay Race Game Third Place	3/13/26
White	10	Assembly Relay Race Game Fourth Place	3/13/26
Silver	100	Assembly Balloon Pop Game	3/13/26
Blue	50	Assembly Balloon Pop Game	3/13/26
White	190	Mr. Rivera	3/13/26
White	50	Assembly Eat the Cookie Game First Place	3/13/26
Blue	30	Assembly Eat the Cookie Game Second Place	3/13/26
Silver	15	Assembly Eat the Cookie Game Third Place	3/13/26
Red	10	Assembly Eat the Cookie Game Fourth Place	3/13/26
Red	190	Assembly Eat the Cookie Game Toppings	3/13/26
White	190	Assembly Eat the Cookie Game Toppings	3/13/26
Blue	190	Assembly Eat the Cookie Game Toppings	3/13/26
Silver	190	Assembly Eat the Cookie Game Toppings	3/13/26
Red	29	Dress Code Points Tuesday	3/24/26
Silver	26	Dress Code Points Tuesday	3/24/26
Red	31	Dress Code Points Wednesday	3/25/26
Silver	17	Dress Code Points Wednesday	3/25/26
Blue	-3	Dress Code Points Wednesday	3/25/26
Red	16	Dress Code Points Friday	3/27/26
Silver	15	Dress Code Points Friday	3/27/26`;

// Parse entries
function parseEntries(data) {
  return data
    .trim()
    .split("\n")
    .map((line) => {
      const parts = line.split("\t").map((p) => p.trim());
      if (parts.length !== 4) return null;

      const [house, pointsStr, reason, dateStr] = parts;
      const points = parseInt(pointsStr, 10);

      // Parse date MM/DD/YY to Date object
      const [m, d, y] = dateStr.split("/").map((x) => parseInt(x, 10));
      const fullYear = y < 50 ? 2000 + y : 1900 + y;
      const date = new Date(fullYear, m - 1, d);

      return {
        house: house.toLowerCase(),
        points,
        reason: reason.trim(),
        date,
        dateStr: date.toISOString().split("T")[0] // YYYY-MM-DD
      };
    })
    .filter(Boolean);
}

// Calculate totals from entries grouped by house
function calculateTotals(entries) {
  const totals = { red: 0, white: 0, blue: 0, silver: 0 };
  entries.forEach((entry) => {
    if (totals.hasOwnProperty(entry.house)) {
      totals[entry.house] += entry.points;
    }
  });
  return totals;
}

async function importPoints() {
  try {
    const entries = parseEntries(POINT_DATA);
    const totals = calculateTotals(entries);

    console.log(`\n📊 Import Preview: ${entries.length} entries`);
    console.log(`   Red:    ${totals.red} points`);
    console.log(`   White:  ${totals.white} points`);
    console.log(`   Blue:   ${totals.blue} points`);
    console.log(`   Silver: ${totals.silver} points`);

    console.log("\n📝 Sample entries:");
    entries.slice(0, 5).forEach((e) => {
      console.log(`   ${e.dateStr} | ${e.house.toUpperCase().padStart(6)} | +${e.points.toString().padStart(3)} | ${e.reason}`);
    });
    console.log(`   ... (${entries.length - 5} more)`);

    if (MODE === "preview") {
      console.log("\n✅ Preview mode. Use --apply to confirm import.");
      process.exit(0);
    }

    // APPLY MODE: Write to Firestore
    console.log("\n🚀 Importing to Firestore...");

    const scoresDocRef = admin.firestore().collection("leaderboard").doc("scores");
    const auditLogRef = scoresDocRef.collection("auditLog");

    // Create audit entries
    let created = 0;
    for (const entry of entries) {
      const timestamp = admin.firestore.Timestamp.fromDate(entry.date);
      const timeMs = entry.date.getTime();

      const auditEntry = {
        type: "imported",
        status: "applied",
        summary: `${entry.reason} (+${entry.points})`,
        reason: entry.reason,
        eventTag: "Imported Data",
        changes: {
          red: entry.house === "red" ? entry.points : 0,
          white: entry.house === "white" ? entry.points : 0,
          blue: entry.house === "blue" ? entry.points : 0,
          silver: entry.house === "silver" ? entry.points : 0
        },
        beforeScores: { red: 0, white: 0, blue: 0, silver: 0 }, // Placeholder
        afterScores: { red: 0, white: 0, blue: 0, silver: 0 }, // Will be calculated
        createdAtMs: timeMs,
        createdAt: timestamp,
        actorEmail: "system@import",
        actorUid: "system",
        importedDate: entry.dateStr
      };

      // Use timestamp as doc ID for unique ordering
      const docId = `${timeMs.toString().padStart(15, "0")}-${Date.now()}`;
      await auditLogRef.doc(docId).set(auditEntry);
      created++;

      if (created % 20 === 0) {
        console.log(`   ✓ Created ${created}/${entries.length} audit entries`);
      }
    }

    // Update main scores document
    await scoresDocRef.update({
      red: totals.red,
      white: totals.white,
      blue: totals.blue,
      silver: totals.silver,
      updatedAtMs: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`\n✅ Import complete!`);
    console.log(`   • Created ${created} audit log entries`);
    console.log(`   • Updated totals: Red ${totals.red} | White ${totals.white} | Blue ${totals.blue} | Silver ${totals.silver}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Import failed:", err.message);
    process.exit(1);
  }
}

importPoints();
