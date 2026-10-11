/** "a\\b.pdf" → "a/b.pdf" (older keys were saved on Windows); refuses anything that could climb out of the storage area. */
export function normalizeKey(key: string) {
  const k = key.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!k || k.split("/").some((part) => part === ".." || part === "" || part === ".")) throw new Error("Bad file key");
  return k;
}
