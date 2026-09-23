import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { AccessoryId, AuthResult, Friend, NotificationPreferences, NovoEvent, NovoLocation, TaskSubmission, User } from './types';

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000/api`;
  }

  const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
  const host = expoHost || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
  return `http://${host}:4000/api`;
}

export const API_URL = resolveApiUrl();

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string };
    throw new Error(data.message ?? 'Something went wrong. Please try again.');
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function signIn(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function checkEmailStatus(email: string): Promise<{ exists: boolean }> {
  return request<{ exists: boolean }>('/auth/email-status', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function continueWithGoogle(credential = ''): Promise<AuthResult> {
  return request<AuthResult>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function finishOnboarding(input: {
  name: string;
  email: string;
  plushieName: string;
  focus: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/onboarding', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function exchangeMobileHandoff(handoffToken: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/mobile-handoff/exchange', {
    method: 'POST',
    body: JSON.stringify({ handoffToken }),
  });
}

export function restoreMobileSession(token: string): Promise<AuthResult> {
  return request<AuthResult>('/auth/mobile-session', undefined, token);
}

export async function getMemberProfile(token: string): Promise<User> {
  const result = await request<{ user: User }>('/member/profile', undefined, token);
  return result.user;
}

export async function pairPlushie(token: string, tagToken: string): Promise<User> {
  const result = await request<{ user: User }>('/member/plushie/pair', {
    method: 'POST',
    body: JSON.stringify({ tagToken }),
  }, token);
  return result.user;
}

export async function interactWithPlushie(token: string, tagToken: string): Promise<User> {
  const result = await request<{ user: User }>('/member/plushie/interact', { method: 'POST', body: JSON.stringify({ tagToken }) }, token);
  return result.user;
}

export async function getDailyStatus(token: string) {
  return request<{ needsPlushieScan: boolean; questBoardDate: string | null; quests: User['dailyQuests'] }>('/member/daily-status', undefined, token);
}

export async function getLocations(): Promise<NovoLocation[]> {
  const result = await request<{ locations: NovoLocation[] }>('/locations');
  return result.locations;
}

export async function getMarketLockers(token: string): Promise<NovoLocation[]> {
  const result = await request<{ lockers: NovoLocation[] }>('/member/market/lockers', undefined, token);
  return result.lockers;
}

export async function getFriends(token: string): Promise<Friend[]> {
  const result = await request<{ friends: Friend[] }>('/member/friends', undefined, token);
  return result.friends;
}

export async function addFriend(token: string, friendId: string): Promise<User> {
  const result = await request<{ user: User }>(`/member/friends/${encodeURIComponent(friendId)}`, { method: 'POST' }, token);
  return result.user;
}

export async function getMemberTasks(token: string) {
  return request<{ quests: User['dailyQuests']; events: NovoEvent[]; submissions: TaskSubmission[] }>('/member/tasks', undefined, token);
}

export async function submitCustomTask(token: string, input: { title: string; description: string; photoDataUrl: string }) {
  return request<{ submission: TaskSubmission; user: User; automated: boolean }>('/member/tasks/custom', { method: 'POST', body: JSON.stringify(input) }, token);
}

export async function submitDailyTask(token: string, questId: string, input: { description: string; photoDataUrl: string }) {
  return request<{ submission: TaskSubmission; user: User; automated: boolean }>(`/member/tasks/${encodeURIComponent(questId)}/submit`, { method: 'POST', body: JSON.stringify(input) }, token);
}

export async function signUpForEvent(token: string, eventId: string): Promise<NovoEvent> {
  const result = await request<{ event: NovoEvent }>(`/member/events/${encodeURIComponent(eventId)}/signup`, { method: 'POST' }, token);
  return result.event;
}

export async function updateNotificationPreferences(token: string, preferences: NotificationPreferences): Promise<User> {
  const result = await request<{ user: User }>('/member/notifications', { method: 'PATCH', body: JSON.stringify(preferences) }, token);
  return result.user;
}

export async function redeemAccessory(token: string, code: string): Promise<User> {
  const result = await request<{ user: User }>('/member/accessories/redeem', {
    method: 'POST',
    body: JSON.stringify({ code }),
  }, token);
  return result.user;
}

export async function equipAccessory(token: string, accessoryId: AccessoryId): Promise<User> {
  const result = await request<{ user: User }>('/member/accessories/equip', {
    method: 'POST',
    body: JSON.stringify({ accessoryId }),
  }, token);
  return result.user;
}

export async function purchaseAccessory(token: string, accessoryId: AccessoryId, lockerLocation: string): Promise<User> {
  const result = await request<{ user: User }>('/member/market/purchase', {
    method: 'POST',
    body: JSON.stringify({ accessoryId, lockerLocation }),
  }, token);
  return result.user;
}

export async function contributePoints(token: string, points: number, causeId: string, causeName: string): Promise<User> {
  const result = await request<{ user: User }>('/member/charity/contribute', {
    method: 'POST',
    body: JSON.stringify({ points, causeId, causeName }),
  }, token);
  return result.user;
}

export async function unpairPlushie(token: string): Promise<User> {
  const result = await request<{ user: User }>('/member/plushie/unpair', { method: 'POST' }, token);
  return result.user;
}

export function deleteMemberAccount(token: string): Promise<void> {
  return request<void>('/member/account', { method: 'DELETE' }, token);
}
