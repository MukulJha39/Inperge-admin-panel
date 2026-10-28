import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Open traps, innermost last. Every trap listens on the document, so when one overlay
 * opens over another (a photo viewer over a drawer) only the top one may react —
 * otherwise Escape would close both and Tab would be pulled back into the one below.
 */
const openTraps: symbol[] = [];

/**
 * Keeps keyboard focus inside an overlay while it is open, and returns focus to
 * wherever it came from on close (PRD section 25).
 *
 * The effect deliberately depends only on `active`. An overlay re-renders on every
 * keystroke of the form inside it, and if this re-ran each time it would re-assert
 * initial focus — pulling the caret out of the field being typed into and dropping
 * every character after the first. `onEscape` is therefore read through a ref rather
 * than taken as a dependency.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  options: { active: boolean; onEscape?: () => void },
): void {
  const { active, onEscape } = options;

  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;

    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function focusables(): HTMLElement[] {
      if (!container) return [];
      // Visibility is judged by attributes rather than by layout: offsetParent is
      // null for everything under jsdom, which would leave the trap with nothing to
      // cycle through in tests.
      return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
      );
    }

    // Move focus in once, when the overlay opens.
    const initial = focusables();
    (initial[0] ?? container)?.focus();

    const token = Symbol('focus-trap');
    openTraps.push(token);

    function handleKeyDown(event: KeyboardEvent) {
      if (openTraps[openTraps.length - 1] !== token) return;

      const escape = onEscapeRef.current;
      if (event.key === 'Escape' && escape) {
        event.stopPropagation();
        escape();
        return;
      }

      if (event.key !== 'Tab') return;

      const elements = focusables();
      if (elements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = elements[0] as HTMLElement;
      const last = elements[elements.length - 1] as HTMLElement;
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !container?.contains(current))) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && current === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);

    // Prevent the page behind the overlay from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      openTraps.splice(openTraps.indexOf(token), 1);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef]);
}
