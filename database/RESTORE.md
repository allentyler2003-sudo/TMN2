# Restoring the TMN database

The database name in the original deployment is `test_database`.

## Option A — binary restore (recommended, exact)

Requires the `mongodatabase-tools` (`mongorestore`):

```bash
# restore into a local MongoDB (overwrites existing collections with --drop)
mongorestore --uri "mongodb://localhost:27017" --drop database/mongodump

# or into Atlas / a remote server:
mongorestore --uri "mongodb+srv://USER:PASSWORD@cluster/..." --drop database/mongodump
```

## Option B — JSON import (readable, tool-light)

Each file in `database/json/` is one collection (JSON array). Import any of them with:

```bash
mongoimport --uri "mongodb://localhost:27017" \
  --db test_database --collection users --jsonArray --file database/json/users.json
```

Repeat per collection you need (users, invoices, invoice_files, messages, jobs, notes,
saved_looks, custom_colours, favourite_colours, payment_transactions, site_views,
ai_chats, ai_colours, ai_usage, login_attempts).

## After restoring

1. Start the backend with `ADMIN_EMAIL` / `ADMIN_PASSWORD` set — the admin is only
   auto-seeded if NO users exist; with the dump restored, the original admin login
   (bcrypt hash inside `users`) keeps working.
2. If you want a fresh start instead: boot with an empty database and the admin is
   created from the env vars automatically.
3. `invoices` numbering continues from the highest restored invoice number.
4. The dump contains client personal data (names, emails) and bcrypt hashes — store the
   archive securely and delete extracts you no longer need.
