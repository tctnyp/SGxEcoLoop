# novo

novo is a mobile-first waste-reduction system built around a physical plushie. The same Express and SQLite backend powers the React Native app and the supporting laptop/operations web portal.

## Included

- Expo/React Native client for Android, iOS, and browser previews
- Native NFC plushie pairing and daily interaction through `react-native-nfc-manager`
- Staff/admin plushie NFC provisioning plus one-time physical accessory QR generation
- Daily plushie-tap streaks and deterministic daily quest-board refreshes
- Photo-backed custom tasks, optional YOLO verification, and staff moderation
- Automatic awards only when the vision service returns an accepted result at 80% confidence or higher
- Connected-friends lists and private invite links
- GPS-aware full-screen task map, event registration, and shared evidence overlays
- Configurable local reminders for plushie greetings, tasks, events, friends, and orders
- Verified Singapore Pick!, SingPost POPStation, and Return Right map data
- Marketplace fulfillment using real Pick!/SingPost locker choices; purchased accessories stay locked until their physical QR is paired
- Organizer events and attendance, staff reviews/market management, and admin accounts
- SQLite persistence and a deliberate database-reset command

## Start the system

Requirements: Node.js 20+ and npm 10+.

```bash
npm install
npm run dev:server
```

In another terminal:

```bash
npm run dev:mobile
```

The unified operations/member web portal is available after running:

```bash
npm run dev:web
```

Open `http://localhost:4000`. Port 8081 is the Expo browser preview; port 4000 is the shared web portal and API.

## Build an installable Android APK

The build script supports a local Android toolchain or EAS cloud build:

```powershell
npm run build:apk -- -ApiUrl http://YOUR_COMPUTER_LAN_IP:4000/api
```

- Local mode requires Android Studio, its bundled JDK, and the Android SDK. A successful local build is copied to `artifacts/novo-android.apk`.
- The Android build uses JDK 17. If Android Studio bundles a newer incompatible runtime, download JDK 17 from **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle JDK → Download JDK**, or pass `-JavaHome 'C:\path\to\jdk-17'`. The script detects incompatible Java versions before Gradle starts.
- If those tools are unavailable, Auto mode uses the EAS `preview` profile and may ask you to sign in to Expo. The profile produces an APK, not an AAB. Configure `EXPO_PUBLIC_API_URL` in the EAS preview environment before the cloud build; the local `-ApiUrl` argument is not uploaded as an EAS secret.
- Force a mode with `-Mode Local` or `-Mode Cloud`.
- The API URL is compiled into the standalone app. Your phone and computer must be on the same network for a local HTTP server; use HTTPS for deployed builds.

Expo Go cannot load the NFC native module. Rebuild the APK whenever native dependencies or Expo config plugins change.

If an installed build reports a missing native Expo module, uninstall the old APK and install a newly generated one. JavaScript bundling alone cannot add a native Android module to an existing binary.

## NFC lifecycle

1. Configure a real staff or admin role using `NOVO_STAFF_EMAIL` or `NOVO_ADMIN_EMAIL` before starting the server.
2. Sign in to Operations and open **Physical tags**.
3. Create a tag record, then write the returned `novo://plushie/...` NDEF URL to the physical tag. Web NFC writing requires Chrome on an NFC-capable Android phone and a secure HTTPS context.
4. In the installed novo app, a member scans that tag during pairing. The server binds that tag to one member and opens Home; pairing itself does not count as the daily greeting.
5. Home immediately prompts a newly paired member to greet their plushie. That first intentional tap creates the first quest board and starts the streak at day one. Later daily taps must use the same paired tag and refresh quests while advancing or resetting the streak. Opening the app alone never changes the streak, and repeat taps on the same Singapore day do not inflate it.

The server stores only a high-entropy public tag token in the NDEF payload. Pairing ownership and all streak decisions remain server-side.

## Physical accessory lifecycle

1. A member buys an accessory with leaves and chooses a pickup locker. The item immediately appears in the shared wardrobe as **Awaiting QR pairing**, but cannot be equipped yet.
2. Staff or an administrator opens **Physical tags** in Operations, selects the matching accessory and generates its one-time QR code for printing and attachment.
3. After pickup, the member scans that QR in the installed app. The API validates the order, accessory and unused physical tag, then permanently unlocks and equips the item.
4. Used, mismatched, retired and unpurchased accessory codes are rejected server-side.

## Operations role bootstrap

The database now starts without demo users or fake records. Set one or more environment variables before the first server start:

```powershell
$env:NOVO_ADMIN_EMAIL='admin@your-domain.sg'
$env:NOVO_STAFF_EMAIL='staff@your-domain.sg'
$env:NOVO_ORGANIZER_EMAIL='organizer@your-domain.sg'
npm run dev:server
```

Existing member accounts are created through app onboarding. Unknown email sign-ins are routed to onboarding instead of silently creating a filled demo profile.

For Google sign-in, set the appropriate Expo build variables (`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) and allow the same IDs on the server with `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, and `GOOGLE_WEB_CLIENT_ID` (or comma-separated `GOOGLE_CLIENT_IDS`). Without these credentials the app clearly disables the Google button instead of using a simulated account.

## Vision review

Set `YOLO_SERVICE_URL` to an HTTP endpoint accepting:

```json
{ "image": "data:image/jpeg;base64,...", "description": "..." }
```

It must return `{ "confidence": 0.91, "label": "sorted recyclables", "accepted": true }`. novo auto-awards 50 leaves only when `accepted` is true and confidence is at least `0.8`. Timeouts, missing models, lower confidence, or rejection always create a pending staff review. Optionally set `YOLO_SERVICE_TOKEN` for bearer authentication.

## Location data

The API includes verified real locations from SingPost/Pick! listings and the Return Right locator. Return Right availability can change during deployment or maintenance, so the API also returns the official live locator URL. Production should periodically import the providers’ authorized live feeds rather than treating the checked-in snapshot as real-time status.

## Database and checks

SQLite data lives at `apps/server/data/novo.sqlite`. This command permanently clears current application records:

```bash
npm run db:reset
```

After reset, restart with the desired `NOVO_*_EMAIL` bootstrap variables.

For a presentation-ready local dataset, stop the server and run:

```bash
npm run demo
```

This replaces the current database with connected demo members, role accounts, plushies and NFC tags, events, evidence reviews, marketplace inventory, orders, donations, quests, and friend activity. Every demo member receives 10,000 spendable leaves—more than the combined accessory catalogue price. Use password `novo2026` with any of these accounts:

- `amira.tan@demo.novo.sg` — member
- `organizer@demo.novo.sg` — organizer
- `staff@demo.novo.sg` — staff
- `admin@demo.novo.sg` — administrator

Restart the server after seeding. `npm run demo` is destructive and is intended only for local demonstrations.

```bash
npm run typecheck
npm test
npm run build
```

## Structure

```text
apps/mobile/   Expo / React Native mobile app and browser preview
apps/web/      React / Vite member and operations portal
apps/server/   Express API and SQLite persistence
scripts/       APK build workflow
```
