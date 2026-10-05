import { Option } from "effect";
import type {
  ColumnType,
  Selectable,
} from "kysely";
import { createHash } from "crypto";
import db from "@/db";
import User from "./user";
import { createServerOnlyFn } from "@tanstack/react-start";

/**
 * Session tokens are stored hashed (SHA-256) at rest — a database leak no
 * longer yields usable session tokens. The plaintext bearer value is only
 * ever known to the client; lookups hash the presented token before querying.
 */
export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

namespace Token {
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

  /**
   * Given a token, return a user if the token is valid
   * @param {string} token - The token to validate
   * @returns {Promise<Option.Option<User.T>>} - The user if the token is valid, null otherwise
   */
  export const getUser = createServerOnlyFn(
    async (token: string): Promise<Option.Option<User.T>> => {
      let query = db.selectFrom(Table.name);

      query = query.where("token_hash", "=", hashToken(token));
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

  /**
   * Given a token, invalidate it
   * @param {string} token - The token to invalidate
   * @returns {Promise<void>} - Resolves when the token is invalidated
   */
  export const invalidate = createServerOnlyFn(
    async (token: string): Promise<void> => {
      await db
        .deleteFrom(Table.name)
        .where("token_hash", "=", hashToken(token))
        .execute();
    },
  );

  /**
   * Create a new token for a user given their id
   * @param {string} userId - The user's id
   * @param {Date} expiry - The token's expiry date
   * @returns {Promise<string>} - The new token
   */
  export const create = createServerOnlyFn(
    async (userId: string, expiry: Date): Promise<string> => {
      const token = crypto.randomUUID();
      await db
        .insertInto(Token.Table.name)
        .values({
          user_id: userId,
          token_hash: hashToken(token),
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
