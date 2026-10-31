import { mergeVisibleOrder, moveItem } from '@/features/accounts/reorder';

describe('moveItem', () => {
  it('moves up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });

  it('ignores out-of-range moves', () => {
    expect(moveItem(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 1, 2)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  });
});

describe('mergeVisibleOrder', () => {
  it('keeps hidden (archived) ids in place', () => {
    // x is archived and hidden; user swaps a and b.
    expect(mergeVisibleOrder(['a', 'x', 'b', 'c'], ['b', 'a', 'c'])).toEqual(['b', 'x', 'a', 'c']);
  });

  it('is the visible order when nothing is hidden', () => {
    expect(mergeVisibleOrder(['a', 'b'], ['b', 'a'])).toEqual(['b', 'a']);
  });
});
