/**
 * Kepler ships `Pressability` as Flow-typed JavaScript without a declaration,
 * and its package `exports` map has no `.d.ts` behind this subpath. Only the
 * members the SELECT fallback touches are described here.
 */
declare module '@amazon-devices/react-native-kepler/Libraries/Pressability/Pressability' {
  export type PressEvent = {
    target?: number;
    nativeEvent?: {target?: number};
  };

  export type EventHandlers = {
    onPress?: (event?: unknown) => void;
    onFocus?: (event?: PressEvent) => void;
    onBlur?: (event?: PressEvent) => void;
    [name: string]: ((event: any) => void) | undefined;
  };

  export default class Pressability {
    _config: {onPress?: (event?: unknown) => void};
    _createEventHandlers(): EventHandlers;
    getEventHandlers(): EventHandlers;
  }
}
