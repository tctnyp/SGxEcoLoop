import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { AccessoryId, AccountStatus, AuthResult, Friend, ImpactSummary, MarketItem, NotificationPreferences, NovoEvent, NovoLocation, OAuthProvider, TaskSubmission, User, WeeklyCompetition } from './types';

const PRODUCTION_API_URL = 'https://novo.tancheetiong.com/api';

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');

  const configuredApiUrl = Constants.expoConfig?.extra?.apiUrl;
  if (typeof configuredApiUrl === 'string' && configuredApiUrl.trim()) return configuredApiUrl.trim().replace(/\/$/, '');

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const localWebHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return localWebHost
      ? `${window.location.protocol}//${window.location.hostname}:4000/api`
      : `${window.location.origin}/api`;
  }

  if (__DEV__) {
    const expoHost = Constants.expoConfig?.hostUri?.split(':')[0];
    const host = expoHost || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost');
    return `http://${host}:4000/api`;
  }

  return PRODUCTION_API_URL;
}

export const API_URL = resolveApiUrl();

function resolvePublicAppUrl(apiUrl: string) {
  const origin = apiUrl.match(/^https?:\/\/[^/]+/i)?.[0];
  return origin ?? PRODUCTION_API_URL.replace(/\/api$/, '');
}

export const PUBLIC_APP_URL = resolvePublicAppUrl(API_URL);
export const createFriendInviteUrl = (userId: string) => `${PUBLIC_APP_URL}/invite/${encodeURIComponent(userId)}`;

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly accountStatus?: AccountStatus, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

let accountStatusListener: ((status: AccountStatus) => void) | null = null;

export function setAccountStatusListener(listener: ((status: AccountStatus) => void) | null) {
  accountStatusListener = listener;
  return () => {
    if (accountStatusListener === listener) accountStatusListener = null;
  };
}

async function request<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const method = options?.method?.toUpperCase() ?? 'GET';
  const attempts = method === 'GET' ? 2 : 1;
  let response: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), method === 'GET' ? 15_000 : 45_000);
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options?.headers,
        },
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 450));
    } finally {
      clearTimeout(timeout);
    }
  }
  if (!response) {
    const timedOut = lastError instanceof Error && lastError.name === 'AbortError';
    throw new Error(timedOut
      ? 'The server took too long to respond. Check your connection and try again.'
      : `novo could not reach ${API_URL}. Check that the server is running and that this phone is on the same network.`);
  }

  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { message?: string; accountStatus?: AccountStatus; code?: string };
    if (data.accountStatus) accountStatusListener?.(data.accountStatus);
    throw new ApiError(data.message ?? 'Something went wrong. Please try again.', response.status, data.accountStatus, data.code);
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

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return request<{ message: string }>('/auth/request-password-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function finishOnboarding(input: {
  name: string;
  email: string;
  password?: string;
  oauthOnboardingToken?: string;
}): Promise<AuthResult> {
  return request<AuthResult>('/auth/onboarding', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function completeMemberOnboarding(token: string, mascotName: string): Promise<User> {
  const result = await request<{ user: User }>('/member/onboarding/complete', {
    method: 'POST',
    body: JSON.stringify({ mascotName }),
  }, token);
  return result.user;
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

export function getAuthProviders(): Promise<Record<OAuthProvider, boolean>> {
  return request<Record<OAuthProvider, boolean>>('/auth/providers');
}

export function revokeSession(token: string): Promise<void> {
  return request<void>('/auth/sign-out', { method: 'POST' }, token);
}

export async function getMemberProfile(token: string): Promise<User> {
  const result = await request<{ user: User }>('/member/profile', undefined, token);
  return result.user;
}

export async function updateMemberProfile(token: string, input: { name: string; username: string; avatarDataUrl?: string | null }): Promise<User> {
  const result = await request<{ user: User }>('/member/profile', { method: 'PATCH', body: JSON.stringify(input) }, token);
  return result.user;
}

export async function changeMemberPassword(token: string, input: { currentPassword: string; newPassword: string }): Promise<void> {
  await request<{ message: string }>('/member/password', { method: 'POST', body: JSON.stringify(input) }, token);
}

export async function startLinkedAccount(token: string, provider: OAuthProvider): Promise<string> {
  const result = await request<{ authorizationUrl: string }>(`/member/oauth/${provider}/link`, { method: 'POST' }, token);
  return result.authorizationUrl;
}

export async function pairWristband(token: string, tagToken: string, pickupLocation: string): Promise<User> {
  const result = await request<{ user: User }>('/member/wristband/pair', {
    method: 'POST',
    body: JSON.stringify({ tagToken, ...(pickupLocation.trim() ? { pickupLocation: pickupLocation.trim() } : {}) }),
  }, token);
  return result.user;
}

export async function reserveWristbandPickup(token: string, pickupLocation: string): Promise<User> {
  const result = await request<{ user: User }>('/member/wristband/reserve', {
    method: 'POST',
    body: JSON.stringify({ pickupLocation }),
  }, token);
  return result.user;
}

export async function interactWithWristband(token: string, tagToken: string): Promise<User> {
  const result = await request<{ user: User }>('/member/wristband/interact', { method: 'POST', body: JSON.stringify({ tagToken }) }, token);
  return result.user;
}

export async function getDailyStatus(token: string) {
  return request<{ needsWristbandTap: boolean; questBoardDate: string | null; quests: User['dailyQuests'] }>('/member/daily-status', undefined, token);
}

export async function getLocations(kind?: NovoLocation['kind']): Promise<NovoLocation[]> {
  const result = await request<{ locations: NovoLocation[] }>(`/locations${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);
  return result.locations;
}

export async function getWristbandPickupLocations(token: string, coordinates?: { latitude: number; longitude: number }): Promise<NovoLocation[]> {
  const query = coordinates ? `?lat=${encodeURIComponent(coordinates.latitude)}&lng=${encodeURIComponent(coordinates.longitude)}` : '';
  const result = await request<{ lockers: NovoLocation[] }>(`/member/wristband/pickup-locations${query}`, undefined, token);
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
  return request<{ quests: User['dailyQuests']; events: NovoEvent[]; submissions: TaskSubmission[]; weeklyCompetition: WeeklyCompetition }>('/member/tasks', undefined, token);
}

export async function getMemberImpact(token: string) {
  return request<ImpactSummary>('/member/impact', undefined, token);
}

export async function startWeeklyCompetition(token: string) {
  return request<{ weeklyCompetition: WeeklyCompetition }>('/member/weekly/start', { method: 'POST' }, token);
}

export async function completeWeeklyCompetition(token: string, answers: number[]) {
  return request<{ weeklyCompetition: WeeklyCompetition; user: User }>('/member/weekly/complete', { method: 'POST', body: JSON.stringify({ answers }) }, token);
}

export async function getMemberMarket(token: string) {
  return request<{ items: MarketItem[] }>('/member/market', undefined, token);
}

export async function submitCustomTask(token: string, input: { title: string; description: string; photoDataUrl: string }) {
  return request<{ submission: TaskSubmission; user: User; automated: boolean }>('/member/tasks/custom', { method: 'POST', body: JSON.stringify(input) }, token);
}

export async function submitDailyTask(token: string, questId: string, input: { description: string; photoDataUrl: string }) {
  return request<{ submission: TaskSubmission; user: User; automated: boolean }>(`/member/tasks/${encodeURIComponent(questId)}/submit`, { method: 'POST', body: JSON.stringify(input) }, token);
}

export async function submitDailyQuiz(token: string, questId: string, answer: string) {
  return request<{ submission: TaskSubmission; user: User; automated: true }>(`/member/tasks/${encodeURIComponent(questId)}/quiz`, { method: 'POST', body: JSON.stringify({ answer }) }, token);
}

export async function signUpForEvent(token: string, eventId: string): Promise<NovoEvent> {
  const result = await request<{ event: NovoEvent }>(`/member/events/${encodeURIComponent(eventId)}/signup`, { method: 'POST' }, token);
  return result.event;
}

export async function cancelEventSignup(token: string, eventId: string): Promise<NovoEvent> {
  const result = await request<{ event: NovoEvent }>(`/member/events/${encodeURIComponent(eventId)}/signup`, { method: 'DELETE' }, token);
  return result.event;
}

export async function updateNotificationPreferences(token: string, preferences: NotificationPreferences): Promise<User> {
  const result = await request<{ user: User }>('/member/notifications', { method: 'PATCH', body: JSON.stringify(preferences) }, token);
  return result.user;
}

export async function equipAccessory(token: string, accessoryId: AccessoryId): Promise<User> {
  const result = await request<{ user: User }>('/member/accessories/equip', {
    method: 'POST',
    body: JSON.stringify({ accessoryId }),
  }, token);
  return result.user;
}

export async function purchaseAccessory(token: string, accessoryId: AccessoryId): Promise<User> {
  const result = await request<{ user: User }>('/member/market/purchase', {
    method: 'POST',
    body: JSON.stringify({ accessoryId }),
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

export async function redeemCoupon(token: string, points: number, offerId: string, name: string): Promise<User> {
  const result = await request<{ user: User }>('/member/market/coupon/redeem', { method: 'POST', body: JSON.stringify({ points, offerId, name }) }, token);
  return result.user;
}

export async function unpairWristband(token: string): Promise<User> {
  const result = await request<{ user: User }>('/member/wristband/unpair', { method: 'POST' }, token);
  return result.user;
}

export function deleteMemberAccount(token: string): Promise<void> {
  return request<void>('/member/account', { method: 'DELETE' }, token);
}
