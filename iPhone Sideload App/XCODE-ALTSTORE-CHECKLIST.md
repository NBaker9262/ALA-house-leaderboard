# House Points iPhone Build Checklist (Your Setup)

This project is now scaffolded for Capacitor iOS.

Current project structure includes:
- `control1.html` (your source app)
- `www/index.html` (generated from `control1.html`)
- `ios/` (Xcode project)
- `capacitor.config.json`

## A) Every time you change the app on Windows

From this folder, run:

```powershell
npm run build:ios-ready
```

From the repo root, you can run the same flow with:

```powershell
npm run iphone:sync
```

This does two things:
1. Copies `control1.html` -> `www/index.html`
2. Syncs web assets into the iOS project (`ios/App/App/public`)

## B) What to copy to Mac for Xcode session

Copy the entire project folder to Mac, including:
- `ios/`
- `www/`
- `control1.html`
- `package.json`
- `package-lock.json`
- `capacitor.config.json`

## C) On Mac (Xcode build and export)

1. Install Node 22+ if needed.
2. Install Xcode and open it once.
3. In Terminal (inside this project):

```bash
npm install
npm run build:ios-ready
npm run open:ios
```

4. In Xcode:
- Select the `App` target.
- Go to Signing & Capabilities.
- Team: choose your Apple ID Personal Team.
- Bundle Identifier: keep unique (`com.noahm.housepoints` is already set).

5. Connect iPhone by cable.
6. On iPhone, enable Developer Mode (iOS 16+).
7. In Xcode, select your real iPhone device (not simulator) and press Run.
8. If signing prompts appear, resolve them and run again until app launches.

## D) Export IPA from Xcode

1. In Xcode device selector, choose **Generic iOS Device** (or connected iPhone).
2. Product -> Archive.
3. Window -> Organizer -> Archives.
4. Select latest archive -> Distribute App.
5. Export a development-signed build and save the `.ipa`.

## E) Install with AltStore on Windows

1. On Windows, keep AltServer running as Administrator.
2. Ensure Apple-site iTunes and iCloud are installed (not Microsoft Store versions).
3. Keep iPhone on same Wi-Fi as AltServer or connected by USB.
4. Open AltStore on iPhone -> My Apps -> add/sideload your `.ipa`.
5. Trust profile on iPhone if prompted.

## F) Weekly maintenance (free Apple ID)

- Refresh apps in AltStore before 7 days.
- Keep AltServer available periodically for refresh.

## G) Fast troubleshooting

If app changes do not show:
1. Run `npm run build:ios-ready` again.
2. Reopen Xcode project.
3. Clean build folder in Xcode and rerun.

If AltStore cannot refresh:
1. Check AltServer is running.
2. Check firewall allows AltServer private network.
3. Use USB if Wi-Fi discovery fails.

## H) One-command routine

- Windows before Mac handoff: `npm run build:ios-ready`
- Mac before opening Xcode: `npm run build:ios-ready`
