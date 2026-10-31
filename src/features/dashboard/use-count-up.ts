import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * A number that eases from its previous value to `target` (ease-out cubic) so totals visibly
 * settle when they change. Integer in, integer out — safe for cents. With Reduce Motion on, it
 * just shows the target.
 */
export function useCountUp(target: number, duration = 700): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(0);
  const current = useRef(0);

  useEffect(() => {
    if (reduced) return;
    const start = current.current;
    const startedAt = Date.now();
    let frame = 0;
    const step = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      current.current = Math.round(start + (target - start) * eased);
      setValue(current.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return reduced ? target : value;
}
