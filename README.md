# novo

novo is a mobile-first waste-reduction system built around an NFC wristband and an expressive in-app animal mascot. The same Express backend—using MariaDB in deployment and SQLite for local development and tests—powers the React Native app and the supporting laptop/operations web portal.

## Included

- Expo/React Native client for Android, iOS, and browser previews
- App-wide Material 3 Expressive color roles generated from the user's equipped accessories, including harmonious multi-accessory palettes and contrast-aware foregrounds
- Five wristband colours mapped to proportion-compatible 3D animal mascots: polar bear, penguin, fox, turtle and bird
- Native NFC wristband pairing, daily touch and event attendance through `react-native-nfc-manager`
- Staff/admin coloured-wristband provisioning and organizer attendance verification
- Daily wristband-tap streaks and deterministic random quest-board refreshes
- Camera-only photo tasks, SHA-256 fingerprints, optional model embeddings and YOLO-assisted staff moderation
- Automatic awards only when the vision service returns an accepted result at 80% confidence or higher
- Connected-friends lists and private invite links
- GPS-aware full-screen task map, event registration, and shared evidence overlays
- Configurable local reminders for wristband greetings, tasks, events, friends, and rewards
- Verified Singapore Pick!, SingPost POPStation, and Return Right map data
- Wristband collection during onboarding using the searchable Pick! and SingPost POPStation directory
- An all-digital marketplace with instant mascot accessories, account-bound coupons and charitable contributions
- Organizer events and attendance, staff reviews/market management, and admin accounts
- MariaDB deployment persistence, SQLite local/test support, and a deliberate database-reset command
- Persistent member and Operations sessions that survive server restarts, with expiry cleanup and server-side sign-out revocation

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

## Build installable Android and iOS apps

Choose the target directly in the command; there is no machine-specific configuration file to maintain:

```powershell
# Android development build against novodev.tancheetiong.com
npm run build:android:development

# iPhone development build
npm run build:ios:development

# Build both targets (local Android, then cloud iOS)
npm run build:mobile:development -- -Platform All

# Closed testing or direct distribution against the public server
npm run build:android:production
npm run build:ios:production
```

The older `build:apk:*` commands remain as Android aliases. The general command accepts `-Platform Android`, `-Platform iOS`, or `-Platform All`; development is the default environment and Android is the default platform.

- **Development** always embeds `https://novodev.tancheetiong.com/api`. The Android artifact is `artifacts/novo-development.apk`.
- **Production** always embeds `https://novo.tancheetiong.com/api`. Auto mode starts a signed EAS internal-distribution build using the `production-apk` profile, making it suitable for closed testing and direct installation.
- **iOS** local release packages are built by the Mobile Release workflow on a macOS runner. The IPA files are unsigned so SideStore can re-sign them.
- Preview a resolved target without building using `npm run build:mobile:development -- -Platform iOS -ShowConfig` or `npm run build:mobile:production -- -Platform All -ShowConfig`.
- API overrides must use HTTPS so device builds cannot accidentally ship with local or cleartext routes.
- If a physical Android phone is connected through ADB, the script also checks the selected API URL from the phone itself. Run `npm run build:apk -- development -VerifyOnly` to perform all computer and device connectivity checks without building an APK.
- Force a builder with `-Mode Local` or `-Mode Cloud`. Android development defaults to the local toolchain; iOS always requires cloud building on this Windows workflow. A forced local production Android build creates `artifacts/novo-production.apk`, but should be treated as a device smoke-test build unless you have separately configured production signing.
- Local mode requires Android Studio, the Android SDK, and JDK 17–23. If needed, pass `-JavaHome 'C:\path\to\jdk-17'`.
- The selected environment and API URL are compiled into the standalone app through Expo config, so a new APK is required when changing targets.
- Local APK builds clean the app release task before bundling, reject stale Gradle output, inspect the bundled API URL, and verify the copied file with SHA-256. The final timestamp and hash are printed after every successful build.

For Google Play production, use the existing EAS `production` profile to create an Android App Bundle. The production APK profile is intended for closed testing and direct installation.

Expo Go cannot load the NFC native module. Rebuild the APK whenever native dependencies or Expo config plugins change.

### GitHub mobile releases

Major changes must run `.github/workflows/mobile-release.yml`. Push a semantic version tag such as `v1.0.6`, or run the workflow manually with that tag. A successful run publishes one GitHub release containing exactly four device packages:

- `novo-development.apk` and `novo-development.ipa` use `https://novodev.tancheetiong.com/api`.
- `novo-production.apk` and `novo-production.ipa` use `https://novo.tancheetiong.com/api`.

The IPA files are intentionally unsigned for SideStore. Android packages use Expo's generated local install signature because Android rejects completely unsigned APKs; no production signing credential is used.

If an installed build reports a missing native Expo module, uninstall the old APK and install a newly generated one. JavaScript bundling alone cannot add a native Android module to an existing binary.

## NFC lifecycle

1. Configure a real staff or admin role using `NOVO_STAFF_EMAIL` or `NOVO_ADMIN_EMAIL` before starting the server.
2. Sign in to Operations and open **Wristbands**.
3. Create a coloured wristband record, then write the returned `novo://wristband/...` NDEF URL to its NFC tag. Web NFC writing requires Chrome on an NFC-capable Android phone and a secure HTTPS context.
4. During onboarding, a member chooses a Pick! or POPStation collection point and scans the issued wristband. Its colour selects the matching in-app mascot and the server binds the tag to one member before opening Home.
5. Home immediately prompts a newly paired member to touch the wristband. That first intentional touch creates the first random quest board and starts the streak at day one. Later daily touches must use the same paired wristband. Opening the app alone never changes the streak, and repeat touches on the same Singapore day do not inflate it.

The server stores only a high-entropy public tag token in the NDEF payload. Pairing ownership and all streak decisions remain server-side.

## Digital rewards lifecycle

1. Members spend leaves on digital accessories, coupons or charitable contributions.
2. Digital accessories unlock immediately and use one shared rig across all five mascots; no shipping, locker selection or QR pairing is involved.
3. Coupon redemptions create an account-bound code in the member profile. Charitable contributions remain separate verified transactions.
4. Pick! and POPStation are used only to collect the physical wristband during onboarding.

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

It can return `{ "confidence": 0.91, "label": "sorted recyclables", "accepted": true, "embedding": [0.12, 0.42] }`. novo fingerprints every camera image, rejects exact duplicates, compares optional embeddings for near-duplicates, and auto-awards leaves only when `accepted` is true and confidence is at least `0.8`. Timeouts, missing models, lower confidence, or rejection always create a pending staff review. Optionally set `YOLO_SERVICE_TOKEN` for bearer authentication.

## Location data

The wristband-pickup API imports the complete published Pick! and SingPost POPStation directories from their official locators, caches them for six hours, and supports name, address, postal-code and provider filtering. The Tasks map likewise imports every active Return Right machine published by Singapore's official recycling locator. If a provider is temporarily unreachable, its small verified fallback list remains available and the server retries shortly; machine availability can still change during deployment or maintenance.

## Database and checks

Deployed services use MariaDB. Set `NOVO_DB_DRIVER=mariadb` together with `NOVO_DB_HOST`, `NOVO_DB_PORT`, `NOVO_DB_NAME`, `NOVO_DB_USER`, and `NOVO_DB_PASSWORD`. Local development and tests default to SQLite at `apps/server/data/novo.sqlite`; select it explicitly with `NOVO_DB_DRIVER=sqlite` or provide `NOVO_DB_PATH`.

To copy an existing SQLite database into an empty MariaDB database, configure the MariaDB variables and run:

```bash
npm run db:migrate:sqlite-to-mariadb --workspace @novo/server
```

Set `NOVO_SQLITE_SOURCE` when the source is not the default SQLite file. The migration refuses to replace a non-empty MariaDB target unless `NOVO_MIGRATION_REPLACE=1` is explicitly set.

This command permanently clears records in the configured database:

```bash
npm run db:reset
```

After reset, restart with the desired `NOVO_*_EMAIL` bootstrap variables.

For a presentation-ready local dataset, stop the server and run:

```bash
npm run demo
```

This replaces the current database with connected demo members, coloured wristbands and animal mascots, role accounts, events, evidence reviews, digital marketplace inventory, coupons, donations, quests, and friend activity. Every demo member receives 10,000 spendable leaves—more than the combined accessory catalogue price. Use password `novo2026` with any of these accounts:

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
apps/server/   Express API with MariaDB and SQLite persistence
scripts/       APK build workflow
```
