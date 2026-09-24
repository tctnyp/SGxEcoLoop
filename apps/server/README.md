# novo server

The Express service on port 4000 is the shared source of truth for mobile members, the laptop companion, and Operations.

It persists members, operations accounts, events, custom-task submissions, marketplace records, fulfillment orders, donations, and NFC tags in MariaDB. Successful mutations are serialized into database transactions. SQLite remains available for local tests and as the source format for one-time migrations.

No demo records are seeded. Bootstrap operations roles with `NOVO_ADMIN_EMAIL`, `NOVO_STAFF_EMAIL`, and/or `NOVO_ORGANIZER_EMAIL` before the first start. Members are created through app onboarding.

Important configuration:

- `NOVO_DB_DRIVER`: `mariadb` for deployed services or `sqlite` for local tests.
- `NOVO_DB_HOST`, `NOVO_DB_PORT`, `NOVO_DB_NAME`, `NOVO_DB_USER`, `NOVO_DB_PASSWORD`: MariaDB connection settings.
- `NOVO_DB_PATH`: alternate SQLite location when the SQLite driver is selected.
- `GOOGLE_*_CLIENT_ID` / `GOOGLE_CLIENT_IDS`: accepted Google ID-token audiences.
- `YOLO_SERVICE_URL`: custom-task image analysis endpoint.
- `YOLO_SERVICE_TOKEN`: optional bearer token for that endpoint.
- `CLIENT_ORIGIN`: comma-separated CORS origins.

Migrate an existing SQLite database by setting `NOVO_SQLITE_SOURCE` and the MariaDB variables, then running `npm run db:migrate:sqlite-to-mariadb --workspace @novo/server`. The migration refuses to overwrite a non-empty target unless `NOVO_MIGRATION_REPLACE=1` is explicitly set.

Run checks from the repository root with `npm test` and intentionally clear the configured database with `npm run db:reset`.

Before public deployment, add password hashing and recovery, durable refresh-token sessions, rate limiting, audit logs, versioned schema migrations/backups, object storage for evidence photos, and managed secrets.
