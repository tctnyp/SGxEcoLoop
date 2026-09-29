# novo server

The Express service on port 4000 is the shared source of truth for mobile members, the laptop companion, and Operations.

It persists users, marketplace records, tasks, the review queue, wristbands, sessions, and the three official location directories in dedicated MariaDB tables. Successful mutations are serialized into database transactions. SQLite remains available for local tests and as the source format for one-time migrations.

No demo records are seeded. Bootstrap operations roles with `NOVO_ADMIN_EMAIL`, `NOVO_STAFF_EMAIL`, and/or `NOVO_ORGANIZER_EMAIL` before the first start. Members are created through app onboarding.

Important configuration:

- `NOVO_DB_DRIVER`: `mariadb` for deployed services or `sqlite` for local tests.
- `NOVO_DB_HOST`, `NOVO_DB_PORT`, `NOVO_DB_NAME`, `NOVO_DB_USER`, `NOVO_DB_PASSWORD`: MariaDB connection settings.
- `NOVO_DB_PATH`: alternate SQLite location when the SQLite driver is selected.
- `GOOGLE_*_CLIENT_ID` / `GOOGLE_CLIENT_IDS`: accepted Google ID-token audiences.
- `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DISCORD_CLIENT_ID`, and `DISCORD_CLIENT_SECRET`: Google and Discord web/mobile OAuth configuration.
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and optional `MICROSOFT_AUTHORITY_TENANT`: Microsoft OAuth configuration. The authority defaults to `common`, which supports work/school and personal Microsoft accounts and avoids exposing tenant guest UPNs as email addresses.
- Register each provider callback as `${PUBLIC_APP_URL}/api/auth/<provider>/callback`. Microsoft must use the Web platform redirect, even for Android and iOS, because the server completes OAuth before returning to the novo app.
- `PUBLIC_APP_URL`: public environment URL used for OAuth callbacks, password resets, and invite links.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASSWORD`: password-reset mail transport. The VPS defaults to local SMTP on port 25.
- `NOVO_BOOTSTRAP_PASSWORD`: optional one-time password applied only to configured operations accounts that do not already have a credential.
- `YOLO_SERVICE_URL`: custom-task image analysis endpoint.
- `YOLO_SERVICE_TOKEN`: optional bearer token for that endpoint.
- `CLIENT_ORIGIN`: comma-separated CORS origins.

Migrate an existing SQLite database by setting `NOVO_SQLITE_SOURCE` and the MariaDB variables, then running `npm run db:migrate:sqlite-to-mariadb --workspace @novo/server`. The migration refuses to overwrite a non-empty target unless `NOVO_MIGRATION_REPLACE=1` is explicitly set.

Run checks from the repository root with `npm test` and intentionally clear the configured database with `npm run db:reset`.

Before public deployment, add rate limiting, audit logs, automated backups, object storage for evidence photos, and managed secrets. Credentials are hashed with scrypt and password-reset links expire after 30 minutes.

