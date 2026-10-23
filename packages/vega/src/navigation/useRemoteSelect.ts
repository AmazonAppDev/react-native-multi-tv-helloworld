import {useCallback} from 'react';
import {FocusManager, useTVEventHandler} from '@amazon-devices/react-native-kepler';
import type {HWEvent} from '@amazon-devices/react-native-kepler';

/**
 * Remote SELECT fallback for Kepler 4 (RN 0.83).
 *
 * On this build the activation key reaches `useTVEventHandler` as
 * `eventType: 'enter'` (never `'select'`), and the native press dispatch behind
 * `Pressability` never fires, so every TouchableOpacity in the app looks dead
 * on the remote. D-pad focus and BACK are unaffected: neither goes through a
 * press handler.
 *
 * `FocusManager.getFocused()` is also broken on the virtual device (always
 * `undefined`), so the target is tracked here instead. Kepler's
 * `TouchableOpacity` passes Pressability's `onFocus` / `onBlur` through to the
 * host view, so wrapping the handler set Pressability builds tells us which
 * control currently owns focus without touching any call site.
 *
 * Note: `TouchableOpacity` cannot be patched directly on Kepler because its
 * default export is a function component wrapper, not the class.
 *
 * Remove this once the platform dispatches press events again.
 */

type PressabilityConfig = {
  onPress?: (event?: unknown) => void;
  onFocus?: (event?: unknown) => void;
  onBlur?: (event?: unknown) => void;
  disabled?: boolean;
};

type EventHandlers = {
  onPress?: (event?: unknown) => void;
  onFocus?: (event?: unknown) => void;
  onBlur?: (event?: unknown) => void;
  [key: string]: unknown;
};

type PressabilityInstance = {
  _config?: PressabilityConfig;
  getEventHandlers: () => EventHandlers;
};

/** The four arrows the on-screen remote can send. */
export type RemoteDirection = 'up' | 'down' | 'left' | 'right';

/** The focus event carries the native tag of the view that just took focus. */
type FocusEvent = {target?: number; nativeEvent?: {target?: number}};

/**
 * Kepler ships no type declarations for this path, so it has to be required.
 * The path goes through the Kepler package rather than the `react-native`
 * deep path: both resolve to the same module instance, but the latter makes
 * React Native raise a "deep imports are deprecated" warning on every launch.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Pressability = require('@amazon-devices/react-native-kepler/Libraries/Pressability/Pressability')
  .default as {prototype: PressabilityInstance};

/** The control that currently owns focus. This is the Pressability instance,
 * not its config: `usePressability` swaps `_config` for a fresh object on every
 * render, so a stored config would keep the `onPress` closure (and any state it
 * reads) from the moment focus was gained.
 */
let active: PressabilityInstance | undefined;

/** The native tag of the focused control, which is what the arrows need. */
let activeTag: number | undefined;

/**
 * The D-pad graph, mirrored in JS: from-tag → direction → to-tag.
 *
 * Every screen builds its graph with `FocusManager.setNextFocus`, and the
 * platform has no call that reads it back. Recording those calls is what lets
 * the on-screen remote walk exactly the edges a handset would.
 */
const edges = new Map<number, Partial<Record<RemoteDirection, number>>>();

/** When the native press path last ran, so the fallback can stand down. */
let lastNativePressAt = 0;

/** The fallback's own last activation, to swallow down/up duplicates. */
let lastFallbackAt = 0;

/** How long a native press gets to prove the platform is working. */
const NATIVE_GRACE_MS = 60;

/** Activation keys arrive as `enter` on this build; accept `select` too. */
const ACTIVATION_TYPES = ['enter', 'select'];

let installed = false;

/**
 * Must run before the first TouchableOpacity renders, which is why it is a
 * module side effect.
 */
function installSelectFallback(): void {
  if (installed) {
    return;
  }
  installed = true;

  const prototype = Pressability.prototype;
  const getEventHandlers = prototype.getEventHandlers;

  prototype.getEventHandlers = function (this: PressabilityInstance) {
    const handlers = getEventHandlers.call(this);

    if (typeof handlers.onFocus !== 'function') {
      return handlers;
    }

    return {
      ...handlers,
      onPress: (event?: unknown) => {
        lastNativePressAt = Date.now();
        handlers.onPress?.(event);
      },
      onFocus: (event?: unknown) => {
        active = this;
        const focusEvent = event as FocusEvent | undefined;
        const tag = focusEvent?.nativeEvent?.target ?? focusEvent?.target;
        if (typeof tag === 'number') {
          activeTag = tag;
        }
        handlers.onFocus?.(event);
      },
      onBlur: (event?: unknown) => {
        if (active === this) {
          active = undefined;
        }
        handlers.onBlur?.(event);
      },
    };
  };
}

installSelectFallback();

/**
 * Mirrors every `setNextFocus` call the screens make, so the on-screen remote
 * can send the same four arrows. Until the platform exposes a read, this is the
 * only copy of the D-pad graph the app can walk on its own.
 */
function installFocusGraphCapture(): void {
  const setNextFocus = FocusManager.setNextFocus.bind(FocusManager);

  try {
    FocusManager.setNextFocus = (from, to, direction) => {
      if (
        typeof from === 'number' &&
        typeof to === 'number' &&
        direction !== 'all'
      ) {
        const row = edges.get(from) ?? {};
        row[direction] = to;
        edges.set(from, row);
      }
      setNextFocus(from, to, direction);
    };
  } catch {
    // A frozen module would leave the on-screen arrows as no-ops; the keyboard
    // still works, so this is a degradation, not a failure.
  }
}

installFocusGraphCapture();

/**
 * Runs the focus owner's press handler. `minGap` is the window in which a
 * second activation is ignored; the key path needs it to swallow the key-up,
 * the on-screen remote does not.
 */
function pressFocused(
  target: PressabilityInstance | undefined,
  minGap: number,
): void {
  const now = Date.now();
  if (now - lastFallbackAt < minGap) {
    return;
  }

  const config = target?._config;
  if (!config || config.disabled || typeof config.onPress !== 'function') {
    return;
  }

  lastFallbackAt = now;
  config.onPress();
}

/**
 * Activates whatever control currently has focus when SELECT is pressed.
 * Mount once, at the app root.
 */
export function useRemoteSelect(): void {
  const handleEvent = useCallback((event: HWEvent) => {
    if (!ACTIVATION_TYPES.includes(event.eventType)) {
      return;
    }

    // Only the press-down may activate. The key-up lands 60 ms or more later and
    // the screen may already have swapped under it (a summary's PLAY AGAIN, the
    // next round's first option), so a release would press a control nobody
    // aimed at.
    if (event.eventKeyAction !== undefined && event.eventKeyAction !== 0) {
      return;
    }

    const nativeAt = lastNativePressAt;
    // The instance is captured now, not inside the timer: a screen-level handler
    // may answer the same key and swap the screen within the grace window.
    // Reading it later would then press a control that just mounted (the next
    // round's first option, or a summary's PLAY AGAIN), not the one the user
    // aimed at. Its `_config` is read late on purpose, so the press runs the
    // handler from the latest render rather than a stale closure.
    const target = active;
    setTimeout(() => {
      if (lastNativePressAt !== nativeAt) {
        return;
      }

      pressFocused(target, 300);
    }, NATIVE_GRACE_MS);
  }, []);

  useTVEventHandler(handleEvent);
}

/**
 * Moves the focus ring one step along the graph the current screen installed.
 * A direction the screen did not link is a no-op, exactly as on the handset.
 */
export function moveRemoteFocus(direction: RemoteDirection): void {
  if (activeTag === undefined) {
    return;
  }

  const to = edges.get(activeTag)?.[direction];
  if (to === undefined) {
    return;
  }

  try {
    FocusManager.focus(to);
  } catch {
    // The Jest turbo-module stub does not implement focus().
  }
}

/** Presses whatever control currently has the focus ring. */
export function activateRemoteFocus(): void {
  pressFocused(active, 0);
}
