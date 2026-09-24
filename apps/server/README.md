# novo server

The Express service on port 4000 is the shared source of truth for mobile members, the laptop companion, and Operations.

It persists members, operations accounts, events, custom-task submissions, marketplace records, fulfillment orders, donations, and NFC tags in `data/novo.sqlite`. Successful mutations are serialized into SQLite transactions.

No demo records are seeded. Bootstrap operations roles with `NOVO_ADMIN_EMAIL`, `NOVO_STAFF_EMAIL`, and/or `NOVO_ORGANIZER_EMAIL` before the first start. Members are created through app onboarding.

Important optional configuration:

- `GOOGLE_*_CLIENT_ID` / `GOOGLE_CLIENT_IDS`: accepted Google ID-token audiences.
- `YOLO_SERVICE_URL`: custom-task image analysis endpoint.
- `YOLO_SERVICE_TOKEN`: optional bearer token for that endpoint.
- `CLIENT_ORIGIN`: comma-separated CORS origins.
- `NOVO_DB_PATH`: alternate SQLite location.

Run checks from the repository root with `npm test` and intentionally clear local state with `npm run db:reset`.

Before public deployment, add password hashing and recovery, durable refresh-token sessions, rate limiting, audit logs, schema migrations/backups, object storage for evidence photos, and managed secrets.

