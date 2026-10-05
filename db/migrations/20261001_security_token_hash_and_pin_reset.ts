import { Kysely, sql } from "kysely";

/**
 * Migration: Session token hashing at rest + device PIN re-enrollment
 * Created at: 2026-10-01
 * Description:
 *   1. Session tokens were stored as plaintext UUIDs. A database leak exposed
 *      live sessions. This migration adds a `token_hash` column (SHA-256 hex),
 *      backfills it from the existing plaintext values, enforces NOT NULL +
 *      a unique index, and drops the plaintext `token` column. The plaintext
 *      bearer value remains unchanged for clients — only the at-rest
 *      representation changes.
 *
 *   2. Device PIN codes were stored as unsalted SHA-256 hashes of 6-digit
 *      PINs (1,000,000 combinations — trivially brute-forceable offline).
 *      Existing PIN hashes cannot be migrated to a slow hash (the PINs are
 *      not recoverable), so all rows are deleted and devices must
 *      re-enroll PINs.
 *
 * Depends on: 20260325_create_reports_tables
 */
export async function up(db: Kysely<any>): Promise<void> {
  // ── 1. Token hashing ──────────────────────────────────────
  await db.schema
    .alterTable("tokens")
    .addColumn("token_hash", "text")
    .execute();

  await db.executeQuery(
    sql`UPDATE tokens SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')`.compile(
      db,
    ),
  );

  await db.schema
    .alterTable("tokens")
    .alterColumn("token_hash", (col) => col.setNotNull())
    .execute();

  await db.schema
    .createIndex("tokens_token_hash_idx")
    .on("tokens")
    .column("token_hash")
    .unique()
    .execute();

  await db.schema.dropIndex("tokens_token_idx").execute();

  await db.schema.alterTable("tokens").dropColumn("token").execute();

  // ── 2. Device PIN re-enrollment ───────────────────────────
  await db.deleteFrom("device_pin_codes").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Plaintext tokens cannot be recovered from hashes; restore the column
  // as empty and drop the hash column. Sessions issued before this migration
  // are invalid after a down-migration.
  await db.schema.alterTable("tokens").addColumn("token", "text").execute();

  await db.schema.dropIndex("tokens_token_hash_idx").execute();

  await db.schema.alterTable("tokens").dropColumn("token_hash").execute();
}
