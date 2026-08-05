import { betterAuth } from "better-auth";
import { argon2id, argon2Verify } from "hash-wasm";

export function createAuth(env: {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}) {
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      password: {
        hash: async (password: string) => {
          const salt = new Uint8Array(16);
          crypto.getRandomValues(salt);
          const hash = await argon2id({
            password,
            salt,
            parallelism: 1,
            iterations: 2,
            memorySize: 19456,
            hashLength: 32,
            outputType: "encoded",
          });
          return hash;
        },
        verify: async ({ hash, password }: { hash: string; password: string }) => {
          return argon2Verify({ password, hash });
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
