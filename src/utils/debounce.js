/**
 * Centralized debounce utility.
 *
 * Creates a debounced version of `fn` that delays execution until `delay` ms
 * have passed since the last call. The returned function also exposes a
 * `.cancel()` method to clear any pending invocation.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn      - Function to debounce.
 * @param {number} delay - Milliseconds to wait after the last call.
 * @returns {T & { cancel: () => void }}
 *
 * @example
 * const debouncedSearch = debounce((query) => fetchResults(query), 400);
 * debouncedSearch('hello');   // resets the timer on every keystroke
 * debouncedSearch.cancel();   // clears pending call (e.g. on unmount)
 */
export function debounce(fn, delay) {
  let timerId = null;

  function debounced(...args) {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      fn(...args);
    }, delay);
  }

  debounced.cancel = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  return /** @type {T & { cancel: () => void }} */ (debounced);
}

/**
 * React hook that returns a stable debounced version of `fn`.
 * The debounced function is recreated only when `delay` changes.
 * It is automatically cancelled when the component unmounts.
 *
 * @template {(...args: any[]) => any} T
 * @param {T} fn      - The function to debounce (can be a new reference each render).
 * @param {number} delay - Milliseconds to wait after the last call.
 * @returns {T & { cancel: () => void }}
 *
 * @example
 * const debouncedTranslate = useDebounce((text) => runTranslation(text), 500);
 * // call it in an onChange handler — it fires only after the user stops typing
 */
import { useEffect, useRef } from 'react';

export function useDebounce(fn, delay) {
  // Always keep the latest fn in a ref so the debounced wrapper never goes stale.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const debouncedRef = useRef(null);

  // Recreate the debounced wrapper only when delay changes.
  if (debouncedRef.current === null) {
    debouncedRef.current = debounce((...args) => fnRef.current(...args), delay);
  }

  // Cancel on unmount.
  useEffect(() => {
    const prev = debouncedRef.current;
    return () => prev?.cancel();
  }, []);

  // If delay changes, swap to a new debounced instance.
  const prevDelayRef = useRef(delay);
  if (prevDelayRef.current !== delay) {
    prevDelayRef.current = delay;
    debouncedRef.current?.cancel();
    debouncedRef.current = debounce((...args) => fnRef.current(...args), delay);
  }

  return /** @type {T & { cancel: () => void }} */ (debouncedRef.current);
}
