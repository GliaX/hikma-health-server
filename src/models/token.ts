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
import { createHash } from "crypto";

namespace Token {
  /**
   * Tokens are stored as SHA-256 hashes so a leaked tokens table can't be
   * replayed as live sessions. Callers always deal in the raw token; hashing
   * happens only at the db boundary. Rows written before hashing was added
   * hold raw tokens and will never match, which logs those sessions out.
   */
  export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  export type T = {
    user_id: string;
    token: string;
    expiry: Date;
  };
  export namespace Table {
    export const name = "tokens";
    export const columns = {
      user_id: "user_id",
      token: "token",
      expiry: "expiry",
    };

    export interface T {
      user_id: string;
      token: string;
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

      query = query.where("token", "=", hashToken(token));
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
        .where("token", "=", hashToken(token))
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
          token: hashToken(token),
          expiry: expiry.toISOString(),
        })
        .execute();

      return token;
    },
  );
}

export default Token;
