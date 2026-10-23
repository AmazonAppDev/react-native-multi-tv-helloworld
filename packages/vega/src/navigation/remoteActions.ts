/**
 * The screen-level half of the on-screen remote.
 *
 * HOME, BACK and MENU are not focus moves, so they cannot travel through the
 * D-pad graph: the navigator owns the route and registers its callbacks here.
 * The arrows and OK live in `useRemoteSelect`, next to the focus tracking they
 * depend on.
 */

export interface RemoteNav {
  home?: () => void;
  back?: () => void;
  menu?: () => void;
}

let handlers: RemoteNav = {};

/** Called by the navigator on every route change, so BACK is never stale. */
export function setRemoteNav(next: RemoteNav): void {
  handlers = next;
}

export const remoteHome = (): void => handlers.home?.();

export const remoteBack = (): void => handlers.back?.();

export const remoteMenu = (): void => handlers.menu?.();
