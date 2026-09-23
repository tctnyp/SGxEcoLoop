export class NfcUnavailableError extends Error {}
export function scanNovoPlushieTag(): Promise<string>;
export function startNovoPlushieListener(onToken: (token: string) => void, onInvalidTag?: () => void): Promise<() => Promise<void>>;
