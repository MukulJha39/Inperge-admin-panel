import { useEffect, useState } from 'react';

/**
 * Debounces a value so typing in a search box does not fire a request per keystroke
 * (PRD section 30).
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
