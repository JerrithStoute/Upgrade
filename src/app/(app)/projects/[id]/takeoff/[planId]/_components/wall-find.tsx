/**
 * The stud a drawn stud space looks like. Plans draw it a little under the real depth
 * (3½" studs drawn 2⅞"–3¼"), so it's the nearest of 2x4 / 2x6 / 2x8 / 2x10 / 2x12 by range.
 */
export function drawnStud(studSpaceIn: number): string | null {
  if (studSpaceIn < 2.5) return null;
  const sizes: [number, string][] = [
    [4.5, "2x4"],
    [6.5, "2x6"],
    [8.5, "2x8"],
    [10.5, "2x10"],
  ];
  return sizes.find(([upTo]) => studSpaceIn < upTo)?.[1] ?? "2x12";
}
