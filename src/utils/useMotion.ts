import { useEffect, useRef, useState } from 'react';

/**
 * Motion helpers for the dashboard.
 *
 * Every animation on the dashboard is decoration over a figure that is already correct,
 * so all of it yields to `prefers-reduced-motion`: the number appears at its final value
 * and nothing moves (PRD section 23).
 */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Eases a figure up to its target so it reads as arriving rather than blinking into place.
 *
 * Counting restarts from wherever the previous run stopped, which keeps a refresh that
 * lands on a new number smooth instead of snapping back to zero.
 */
export function useCountUp(target: number, duration = 850): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(() => (reduced ? target : 0));
  const currentRef = useRef(reduced ? target : 0);

  useEffect(() => {
    if (reduced || typeof requestAnimationFrame !== 'function') {
      currentRef.current = target;
      setValue(target);
      return;
    }

    const from = currentRef.current;
    if (from === target) return;

    const started = performance.now();
    let frame = requestAnimationFrame(function step(now: number) {
      const progress = duration > 0 ? Math.min(1, (now - started) / duration) : 1;
      // Cubic ease-out: fast arrival, soft landing.
      const eased = 1 - (1 - progress) ** 3;
      const next = from + (target - from) * eased;
      currentRef.current = progress < 1 ? next : target;
      setValue(currentRef.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    });

    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  return value;
}

/**
 * Flips to true one frame after mount, which is what CSS transitions need to run on
 * first paint — a value that was never false has nothing to transition from.
 */
export function useEntered(): boolean {
  const [entered, setEntered] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      setEntered(true);
      return;
    }
    const frame = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return entered;
}

/** The current time, re-read on an interval, for the "as of" line in the hero. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
