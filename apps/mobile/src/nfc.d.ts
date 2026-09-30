export class NfcUnavailableError extends Error {}
export function scanNovoWristbandTag(): Promise<string>;
export function startNovoWristbandListener(
  onToken: (token: string) => void,
  onInvalidTag?: () => void,
  onError?: (error: Error) => void,
): Promise<() => Promise<void>>;
