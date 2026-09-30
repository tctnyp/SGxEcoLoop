import NfcManager, { Ndef, NfcError, NfcEvents, NfcTech, TagEvent } from 'react-native-nfc-manager';
import { Platform } from 'react-native';

export class NfcUnavailableError extends Error {}

let nfcStartPromise: Promise<void> | null = null;

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
    // The manager must be initialised before any requestTechnology call. Keep a
    // single shared promise so Home and onboarding cannot race two native starts.
    nfcStartPromise ??= NfcManager.start().then(() => undefined);
    await nfcStartPromise;
  } catch (error) {
    nfcStartPromise = null;
    throw normalizeNfcError(error);
  }
  const supported = await NfcManager.isSupported().catch(() => false);
  if (!supported) {
    throw new NfcUnavailableError(Platform.OS === 'ios'
      ? 'Core NFC is unavailable on this iPhone or in this installed copy of novo.'
      : 'This phone does not support NFC tag reading.');
  }
  if (Platform.OS === 'android' && !(await NfcManager.isEnabled())) {
    throw new NfcUnavailableError('Turn on NFC in your phone settings to tap your novo wristband.');
  }
}

function normalizeNfcError(error: unknown) {
  if (error instanceof NfcError.UserCancel) return new Error('NFC scan cancelled. Tap the button when you are ready to try again.');
  if (error instanceof NfcError.SecurityViolation || error instanceof NfcError.InvalidConfiguration) {
    return new NfcUnavailableError('This installed copy cannot access Core NFC. Re-sign novo with an Apple provisioning profile that includes NFC Tag Reading.');
  }
  if (error instanceof NfcError.UnsupportedFeature) {
    return new NfcUnavailableError('This iPhone does not support the required NFC tag-reading session.');
  }
  if (error instanceof NfcError.RadioDisabled) return new NfcUnavailableError('NFC is unavailable. Unlock the phone and try again.');
  if (error instanceof NfcError.SystemBusy) return new Error('Another NFC session is active. Close it, then try again.');
  if (error instanceof NfcError.Timeout) return new Error('No wristband was detected. Hold it near the top edge of the iPhone and try again.');
  if (error instanceof NfcError.TagConnectionLost || error instanceof NfcError.RetryExceeded) {
    return new Error('The wristband moved away too soon. Keep it against the top edge of the iPhone until the scan completes.');
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/entitlement|missing required entitlement|security violation/i.test(message)) {
    return new NfcUnavailableError("This installed copy cannot access Core NFC. Re-sign novo with an Apple provisioning profile that includes Near Field Communication Tag Reading.");
  }
  if (/not support|unsupported|readingavailable/i.test(message)) {
    return Platform.OS === 'ios'
      ? new NfcUnavailableError('Core NFC is unavailable to this installed copy of novo. Reinstall the latest IPA and ensure your signer keeps the NFC Tag Reading entitlement.')
      : new NfcUnavailableError('This phone does not support NFC tag reading.');
  }
  return error instanceof Error ? error : new Error('NFC could not start. Try again with novo open and your phone unlocked.');
}

export async function startNovoWristbandListener(
  onToken: (token: string) => void,
  onInvalidTag?: () => void,
  onError?: (error: Error) => void,
) {
  await prepareNfc();

  if (Platform.OS === 'ios') {
    let active = true;
    const reader = (async () => {
      try {
        // requestTechnology uses NFCTagReaderSession on iOS. The wristband must
        // contain a novo URI or text record in its NDEF message.
        await NfcManager.requestTechnology(NfcTech.Ndef, {
          alertMessage: 'Bring your novo wristband near the top of your iPhone.',
        });
        if (!active) return;
        const token = tokenFromTag(await NfcManager.getTag());
        if (token) {
          await NfcManager.setAlertMessageIOS('Wristband read. Updating novo…').catch(() => undefined);
          onToken(token);
        } else {
          await NfcManager.invalidateSessionWithErrorIOS('This is not a prepared novo wristband.').catch(() => undefined);
          onInvalidTag?.();
        }
      } catch (error) {
        if (active) onError?.(normalizeNfcError(error));
      } finally {
        await NfcManager.cancelTechnologyRequest({ throwOnError: false });
      }
    })();

    return async () => {
      active = false;
      await NfcManager.cancelTechnologyRequest({ throwOnError: false });
      await reader.catch(() => undefined);
    };
  }

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
    await NfcManager.requestTechnology(NfcTech.Ndef, {
      alertMessage: Platform.OS === 'ios'
        ? 'Hold the wristband against the top edge of your iPhone.'
        : 'Hold your novo wristband near the back of your phone.',
    });
    const token = tokenFromTag(await NfcManager.getTag());
    if (token) {
      if (Platform.OS === 'ios') await NfcManager.setAlertMessageIOS('novo wristband found.').catch(() => undefined);
      return token;
    }
    if (Platform.OS === 'ios') await NfcManager.invalidateSessionWithErrorIOS('This is not a prepared novo wristband.').catch(() => undefined);
    throw new Error('This NFC tag is not a prepared novo wristband.');
  } catch (error) {
    throw normalizeNfcError(error);
  } finally {
    await NfcManager.cancelTechnologyRequest({ throwOnError: false });
  }
}
