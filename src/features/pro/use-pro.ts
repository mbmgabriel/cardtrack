import { repos } from '@/db';
import { useLiveData } from '@/db/live';

/**
 * CardTrack Pro (PLAN.md §8: a one-time unlock). Purchases arrive with RevenueCat in Phase 11;
 * until then the unlock is a stored flag that only a development build can switch on.
 */
export function usePro(): boolean {
  return useLiveData(() => repos.settings.get('pro_unlocked'), ['settings']);
}

/** Development only: switch Pro on or off without a purchase. */
export function setProForTesting(unlocked: boolean) {
  repos.settings.set('pro_unlocked', unlocked);
}
