import { useSyncExternalStore } from 'react';

/**
 * Return a boolean indicating if the JS has been hydrated already.
 * When doing Server-Side Rendering, the result will always be false.
 * When doing Client-Side Rendering, the result will always be false on the
 * first render and true from then on. Even if a new component renders it will
 * always start with true.
 *
 * @example
 * ```tsx
 * // Disable a button that needs JS to work.
 * let hydrated = useHydrated()
 * return (
 *   <button type="button" disabled={!hydrated} onClick={doSomethingCustom}>
 *     Click me
 *   </button>
 * )
 * ```
 * @returns True if the JS has been hydrated already, false otherwise.
 *
 * Inspired by the `useHydrated` hook from TanStack Start: https://tanstack.com/start/latest/docs/framework/react/guide/execution-model#usehydrated-hook
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

function subscribe() {
  return () => {};
}
