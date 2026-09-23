export class NfcUnavailableError extends Error {}

export async function scanNovoPlushieTag(): Promise<string> {
  throw new NfcUnavailableError('NFC scanning is available in the installed Android or iOS app.');
}

export async function startNovoPlushieListener(): Promise<() => Promise<void>> {
  throw new NfcUnavailableError('NFC interaction is available in the installed Android or iOS app.');
}
