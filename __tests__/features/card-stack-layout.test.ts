import {
  FRONT_PEEK,
  RAISED_GAP,
  stackLayout,
  TUCKED_BAND,
} from '@/features/dashboard/card-stack-layout';

const H = 200;
const MIN_TAP = 44;

/**
 * How much of each card is visible: from its top down to whatever covers it first — a card
 * drawn in front of it (later in the stack, or the raised card) or the pocket.
 */
function visibleBands(tops: number[], pocketTop: number, raised: number | null) {
  return tops.map((top, i) => {
    if (i === raised) return Math.min(H, pocketTop - top);
    const coveredBy = tops
      .map((t, j) => ({ t, j }))
      .filter(({ t, j }) => j !== i && (j === raised || j > i) && t + H > top)
      .map(({ t }) => (t <= top ? top : t));
    const bottom = Math.min(pocketTop, top + H, ...coveredBy);
    return bottom - top;
  });
}

describe('stackLayout', () => {
  it('shows a single card in full above the pocket', () => {
    expect(stackLayout(1, null, H)).toEqual({ tops: [0], pocketTop: H + RAISED_GAP });
  });

  it('gives every card a tappable band when nothing is raised', () => {
    for (const count of [2, 3, 5, 8]) {
      const { tops, pocketTop } = stackLayout(count, null, H);
      const bands = visibleBands(tops, pocketTop, null);
      bands.forEach((band) => expect(band).toBeGreaterThanOrEqual(MIN_TAP));
      expect(pocketTop - tops[count - 1]).toBeCloseTo(FRONT_PEEK);
    }
  });

  it('keeps the other cards tappable and uncovered while one is raised', () => {
    for (const count of [2, 3, 5]) {
      for (let raised = 0; raised < count; raised++) {
        const { tops, pocketTop } = stackLayout(count, raised, H);
        expect(tops[raised]).toBe(0);
        const bands = visibleBands(tops, pocketTop, raised);
        // The raised card shows in full.
        expect(bands[raised]).toBe(H);
        tops.forEach((top, i) => {
          if (i === raised) return;
          // Below the raised card, above the pocket, a full band each.
          expect(top).toBeGreaterThanOrEqual(H);
          expect(bands[i]).toBe(TUCKED_BAND);
        });
      }
    }
  });

  it('keeps the same height whether or not a card is raised', () => {
    expect(stackLayout(3, null, H).pocketTop).toBe(stackLayout(3, 1, H).pocketTop);
  });
});
