import NfcManager, { Ndef, NfcEvents, NfcTech, TagEvent } from 'react-native-nfc-manager';

export class NfcUnavailableError extends Error {}

function tokenFromValue(value: string) {
  const match = value.trim().match(/(?:novo:\/\/plushie\/|https:\/\/[^/]+\/nfc\/)([A-Za-z0-9_-]{24,200})/i);
  return match?.[1] ?? null;
}

function tokenFromTag(tag: TagEvent | null) {
  for (const record of tag?.ndefMessage ?? []) {
    const payload = Uint8Array.from(record.payload);
    let value = '';
    try {
      if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_URI)) value = Ndef.uri.decodePayload(payload);
      else if (Ndef.isType(record, Ndef.TNF_WELL_KNOWN, Ndef.RTD_TEXT)) value = Ndef.text.decodePayload(payload);
    } catch {
      value = '';
    }
    const token = tokenFromValue(value);
    if (token) return token;
  }
  return null;
}

async function prepareNfc() {
  if (!(await NfcManager.isSupported())) throw new NfcUnavailableError('This phone does not support NFC.');
  await NfcManager.start();
  if (!(await NfcManager.isEnabled())) throw new NfcUnavailableError('Turn on NFC in your phone settings to greet your plushie.');
}

export async function startNovoPlushieListener(onToken: (token: string) => void, onInvalidTag?: () => void) {
  await prepareNfc();
  let active = true;
  let lastToken = '';
  let lastReadAt = 0;
  NfcManager.setEventListener(NfcEvents.DiscoverTag, (tag: TagEvent) => {
    if (!active) return;
    const token = tokenFromTag(tag);
    if (!token) {
      onInvalidTag?.();
      return;
    }
    const now = Date.now();
    if (token === lastToken && now - lastReadAt < 3000) return;
    lastToken = token;
    lastReadAt = now;
    onToken(token);
  });
  try {
    await NfcManager.registerTagEvent({ alertMessage: 'Bring your phone near the novo patch.', invalidateAfterFirstRead: false });
  } catch (error) {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    throw error;
  }
  return async () => {
    active = false;
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent().catch(() => undefined);
  };
}

export async function scanNovoPlushieTag() {
  await prepareNfc();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold your phone near the novo patch.' });
    const token = tokenFromTag(await NfcManager.getTag());
    if (token) return token;
    throw new Error('This NFC tag is not a prepared novo plushie tag.');
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}
