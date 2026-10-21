/** Price list lines (the price ladder): other lengths of a lumber size, priced per board, no quantity. */
export const LADDER_PREFIX = "ladder:";
export const isLadderLine = (l: { key: string }) => l.key.startsWith(LADDER_PREFIX);
