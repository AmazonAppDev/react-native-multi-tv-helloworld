import {useEffect, useRef, useState} from 'react';
import type {TvCommand, TvCommandPoll} from '@multitv/shared';

/**
 * How long one poll waits on the server. The server caps this at 20s; 15s keeps
 * a round trip inside the app's own patience while cutting idle requests to
 * four a minute.
 */
export const TV_POLL_WAIT_MS = 15_000;
/** A relay that cannot be reached, or has no pairing, must not spin. */
export const TV_POLL_PAUSE_MS = 3_000;

export interface TvCommandSource {
  nextCommand(waitMs: number, signal?: AbortSignal): Promise<TvCommandPoll>;
}

export interface UseTvCommandPollOptions {
  relay: TvCommandSource;
  onCommand: (command: TvCommand) => void;
  waitMs?: number;
  pauseMs?: number;
}

/**
 * The app-wide command loop. It lives beside the navigator rather than inside
 * a screen because a spoken search must arrive whichever screen is showing -
 * and because the server keeps one pending poll per television, so two loops
 * would steal each other's commands.
 *
 * Returns whether the relay reports a paired Alexa account, which is what the
 * search screen needs to decide between a pairing code and "Paired."
 */
export const useTvCommandPoll = ({
  relay,
  onCommand,
  waitMs = TV_POLL_WAIT_MS,
  pauseMs = TV_POLL_PAUSE_MS,
}: UseTvCommandPollOptions): {paired: boolean; error: string | null} => {
  const [paired, setPaired] = useState(false);
  /**
   * Why the last poll failed, or null.
   *
   * JS console output never reaches the device log on Vega, so a bare `catch`
   * left the TV mute with no way to say why. The pairing screen shows this.
   */
  const [error, setError] = useState<string | null>(null);

  // The loop must not restart when the handler is re-created by a render.
  const handler = useRef(onCommand);
  useEffect(() => {
    handler.current = onCommand;
  }, [onCommand]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const pause = () =>
      new Promise<void>(resolve => {
        setTimeout(() => resolve(), pauseMs);
      });

    const loop = async () => {
      while (!cancelled) {
        try {
          const poll = await relay.nextCommand(waitMs, controller.signal);
          if (cancelled) {
            return;
          }
          setPaired(poll.paired);
          setError(null);
          if (poll.command) {
            handler.current(poll.command);
          }
          // An unpaired TV is answered at once - nothing can be queued for it -
          // so the pause here is what stops the loop from hammering the relay.
          if (!poll.paired) {
            await pause();
          }
        } catch (failure) {
          if (cancelled) {
            return;
          }
          setPaired(false);
          setError(failure instanceof Error ? failure.message : String(failure));
          await pause();
        }
      }
    };

    void loop();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [relay, waitMs, pauseMs]);

  return {paired, error};
};
