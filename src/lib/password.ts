import { randomBytes } from "node:crypto";

const allowed = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";

export function generateTemporaryPassword(length = 14) {
  const bytes = randomBytes(length);
  let result = "";

  for (let index = 0; index < length; index += 1) {
    result += allowed[bytes[index] % allowed.length];
  }

  return result;
}
