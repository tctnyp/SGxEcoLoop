import NfcManager, { Ndef, NfcEvents, NfcTech, TagEvent } from 'react-native-nfc-manager';
import { Platform } from 'react-native';

export class NfcUnavailableError extends Error {}

function tokenFromValue(value: string) {
  const match = value.trim().match(/(?:novo:\/\/wristband\/|https:\/\/[^/]+\/nfc\/)([A-Za-z0-9_-]{24,200})/i);
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
  try {
    await NfcManager.start();
  } catch (error) {
    throw normalizeNfcError(error);
  }
  const supported = await NfcManager.isSupported().catch(() => false);
  if (!supported) {
    if (Platform.OS === 'ios') {
      throw new NfcUnavailableError('Core NFC is unavailable to this installed copy of novo. Reinstall the latest IPA and ensure your signer keeps the NFC Tag Reading entitlement.');
    }
    throw new NfcUnavailableError('This phone does not support NFC tag reading.');
  }
  if (Platform.OS === 'android' && !(await NfcManager.isEnabled())) {
    throw new NfcUnavailableError('Turn on NFC in your phone settings to tap your novo wristband.');
  }
}

function normalizeNfcError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/entitlement|missing required entitlement|security violation/i.test(message)) {
    return new NfcUnavailableError('This installed copy cannot access Core NFC. Reinstall the latest novo IPA with a signer that preserves the NFC Tag Reading entitlement.');
  }
  if (/not support|unsupported|readingavailable/i.test(message)) {
    return Platform.OS === 'ios'
      ? new NfcUnavailableError('Core NFC is unavailable to this installed copy of novo. Reinstall the latest IPA and ensure your signer keeps the NFC Tag Reading entitlement.')
      : new NfcUnavailableError('This phone does not support NFC tag reading.');
  }
  return error instanceof Error ? error : new Error('NFC could not start. Try again with novo open and your phone unlocked.');
}

export async function startNovoWristbandListener(onToken: (token: string) => void, onInvalidTag?: () => void) {
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
    await NfcManager.registerTagEvent({ alertMessage: 'Bring your novo wristband near your phone.', invalidateAfterFirstRead: false });
  } catch (error) {
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    throw normalizeNfcError(error);
  }
  return async () => {
    active = false;
    NfcManager.setEventListener(NfcEvents.DiscoverTag, null);
    await NfcManager.unregisterTagEvent().catch(() => undefined);
  };
}

export async function scanNovoWristbandTag() {
  await prepareNfc();
  try {
    await NfcManager.requestTechnology(NfcTech.Ndef, { alertMessage: 'Hold your novo wristband near your phone.' });
    const token = tokenFromTag(await NfcManager.getTag());
    if (token) return token;
    throw new Error('This NFC tag is not a prepared novo wristband.');
  } catch (error) {
    throw normalizeNfcError(error);
  } finally {
    await NfcManager.cancelTechnologyRequest().catch(() => undefined);
  }
}
