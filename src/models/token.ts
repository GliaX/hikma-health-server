import { createHash } from "node:crypto";
import { Effect, Option } from "effect";
import type {
  ColumnType,
  Generated,
  Selectable,
  Insertable,
  Updateable,
} from "kysely";
import db from "@/db";
import User from "./user";
import { createServerOnlyFn } from "@tanstack/react-start";

namespace Token {
  /**
   * Session tokens are stored hashed (SHA-256) at rest — a database leak no
   * longer yields usable session tokens. The plaintext bearer value is only
   * ever known to the client; lookups hash the presented token before
   * querying. The column is `token_hash` (see migration
   * 20261001_security_token_hash_and_pin_reset).
   */
  export const hash = (token: string): string =>
    createHash("sha256").update(token, "utf8").digest("hex");

  export type T = {
    user_id: string;
    token_hash: string;
    expiry: Date;
  };
  export namespace Table {
    export const name = "tokens";
    export const columns = {
      user_id: "user_id",
      token_hash: "token_hash",
      expiry: "expiry",
    };

    export interface T {
      user_id: string;
      token_hash: string;
      expiry: ColumnType<Date, string | undefined, never>;
    }

    export type Tokens = Selectable<T>;
    export type NewTokens = Insertable<T>;
    export type TokensUpdate = Updateable<T>;
  }

  /** None when the token is unknown or expired. */
  export const getUser = createServerOnlyFn(
    async (token: string): Promise<Option.Option<User.T>> => {
      let query = db.selectFrom(Table.name);

      query = query.where("token_hash", "=", hash(token));
      query = query.where("expiry", ">", new Date().toISOString());

      const res = await query.select(["user_id"]).executeTakeFirst();

      return Option.match(Option.fromNullable(res), {
        onNone: () => Option.none(),
        onSome: async ({ user_id }) => {
          const user = await db
            .selectFrom(User.Table.name)
            .where("id", "=", user_id)
            .selectAll()
            .executeTakeFirst();

          return Option.fromNullable({
            ...user,
            hashed_password: "***************",
          } as unknown as User.T);
        },
      });
    },
  );

  export const invalidate = createServerOnlyFn(
    async (token: string): Promise<void> => {
      await db
        .deleteFrom(Table.name)
        .where("token_hash", "=", hash(token))
        .execute();
    },
  );

  /** Returns the raw token; only its hash is stored. */
  export const create = createServerOnlyFn(
    async (userId: string, expiry: Date): Promise<string> => {
      const token = crypto.randomUUID();
      await db
        .insertInto(Token.Table.name)
        .values({
          user_id: userId,
          token_hash: hash(token),
          expiry: expiry.toISOString(),
        })
        .execute();

      return token;
    },
  );

  /**
   * Delete expired tokens. Called opportunistically on server boot so the
   * table does not grow without bound.
   */
  export const purgeExpired = createServerOnlyFn(async (): Promise<number> => {
    const result = await db
      .deleteFrom(Table.name)
      .where("expiry", "<=", new Date().toISOString())
      .executeTakeFirst();

    return Number(result.numDeletedRows ?? 0);
  });
}

export default Token;
