// src/core/risk/store/hash.ts

export function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0; // 32bit
  }
  return `e_${Math.abs(hash)}`;
}
