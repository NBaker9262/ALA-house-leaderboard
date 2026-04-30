# Google Sheets Import/Export Setup

This setup keeps the app backend-free: Google Sheets is the easy editing surface, and the control app imports/exports CSV directly in the browser.

## Sheet 1: Student Roster

Create a Google Sheet named something like `House Points - Student Roster`.

Use these exact headers on row 1:

```csv
name,house,studentId,grade,email,active
```

You can also start from `templates/student-roster-template.csv`.

Allowed `house` values:

- `red`, `panda`, or `red panda`
- `white` or `polar`
- `blue` or `grizzly`
- `silver` or `kodiak`

Example:

```csv
name,house,studentId,grade,email,active
Alex Rivera,red,10001,9,alex@example.org,true
Jordan Lee,polar,10002,10,jordan@example.org,true
```

## Import Student Roster

1. Open the roster sheet.
2. Choose `File -> Download -> Comma Separated Values (.csv)`.
3. Open the iPhone/control app as a `superadmin` or user manager.
4. Open `Admin Management -> Data Import/Export`.
5. Choose `Choose Student Roster CSV`.
6. Preview the rows.
7. Click `Import Student Roster`.

The app writes rows to Firestore collection `studentDirectory`. It also builds `searchPrefixes`, which powers fast student lookup by name, email, or student ID.

## Sheet 2: Points Import/Export

Create a second sheet named something like `House Points - Point Imports`.

Use these exact headers:

```csv
house,points,reason,date
```

You can also start from `templates/points-import-template.csv`.

## Optional: Sheet 2 Pulls From Sheet 1

If you want your second sheet to be owned by you and pull roster data from the first sheet:

1. Open Sheet 2.
2. In cell `A1`, use:

```text
=IMPORTRANGE("PASTE_STUDENT_ROSTER_SHEET_URL_HERE","Sheet1!A:F")
```

3. Google Sheets will ask you to allow access once.
4. Keep a separate tab in Sheet 2 named `Point Imports` with the `house,points,reason,date` headers.

This keeps the roster source clean while giving you one owner-controlled sheet where you can view roster data and manage point import rows.

Example:

```csv
house,points,reason,date
red,50,Assembly win,4/29/2026
white,30,Second place,4/29/2026
blue,15,Third place,4/29/2026
silver,10,Fourth place,4/29/2026
```

## Import Points

1. In Google Sheets, choose `File -> Download -> Comma Separated Values (.csv)`.
2. In the control app, open `Admin Management -> Data Import/Export`.
3. Choose `Choose Points CSV`.
4. Preview the rows.
5. Click `Import Points`.

Important: point import replaces the current totals with the totals calculated from the CSV. It also writes audit rows under `leaderboard/scores/auditLog`.

## Export Back To Sheets

Use these buttons from `Admin Management -> Data Import/Export`:

- `Export Points CSV`
- `Export Student Roster CSV`

Then import into Google Sheets:

1. Open the destination sheet.
2. Choose `File -> Import`.
3. Upload the CSV.
4. Choose `Replace spreadsheet` or `Insert new sheet`.

This gives you a sheet owned by you for easy access while Firestore stays the live source for the app.
