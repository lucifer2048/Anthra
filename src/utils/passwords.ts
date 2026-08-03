import * as Crypto from "expo-crypto";

const LOWERCASE = "abcdefghijkmnopqrstuvwxyz";
const UPPERCASE = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMBERS = "23456789";
const SYMBOLS = "!@#$%&*+-=?";
const CHARACTER_SET = `${LOWERCASE}${UPPERCASE}${NUMBERS}${SYMBOLS}`;

function characterFromByte(characters: string, byte: number): string {
  return characters[byte % characters.length];
}

export async function generateStrongPassword(length = 18): Promise<string> {
  const safeLength = Math.min(64, Math.max(12, Math.floor(length)));
  const bytes = await Crypto.getRandomBytesAsync(safeLength + 4);
  const required = [
    characterFromByte(LOWERCASE, bytes[0]),
    characterFromByte(UPPERCASE, bytes[1]),
    characterFromByte(NUMBERS, bytes[2]),
    characterFromByte(SYMBOLS, bytes[3])
  ];
  const generated = Array.from(bytes.slice(4), (byte) => characterFromByte(CHARACTER_SET, byte));
  const password = [...required, ...generated].slice(0, safeLength);

  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = bytes[index % bytes.length] % (index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }

  return password.join("");
}
