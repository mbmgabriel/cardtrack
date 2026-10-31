/**
 * Where each card in the wallet stack sits. One fixed height for the whole stack, so raising or
 * lowering a card never shifts the page below it.
 *
 * - Nothing raised: the cards share the space above the pocket as equal bands, later cards in
 *   front, and the front card shows a little more.
 * - One raised: it sits at the top in full; the others line up under it as bands of `TUCKED_BAND`,
 *   clear of both the raised card and the pocket, so every one of them can still be tapped.
 */

/** Height of each tucked card's visible band: big enough to read its name and to tap (≥44pt). */
export const TUCKED_BAND = 52;
/** Space between the raised card and the tucked ones. */
export const RAISED_GAP = 14;
/** How much of the front card shows above the pocket when nothing is raised. */
export const FRONT_PEEK = 76;

export type StackLayout = {
  /** Top of each card, in the stack's original order. */
  tops: number[];
  pocketTop: number;
};

export function stackLayout(
  count: number,
  raisedIndex: number | null,
  cardHeight: number,
): StackLayout {
  if (count === 0) return { tops: [], pocketTop: 0 };
  // A single card is always shown in full.
  const raised = count === 1 ? 0 : raisedIndex;
  const pocketTop = cardHeight + RAISED_GAP + (count - 1) * TUCKED_BAND;

  if (raised == null) {
    const band = (pocketTop - FRONT_PEEK) / (count - 1);
    return { tops: Array.from({ length: count }, (_, i) => i * band), pocketTop };
  }

  let tucked = 0;
  const tops = Array.from({ length: count }, (_, i) =>
    i === raised ? 0 : cardHeight + RAISED_GAP + tucked++ * TUCKED_BAND,
  );
  return { tops, pocketTop };
}
