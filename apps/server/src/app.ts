import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { z } from 'zod';
import { initializeDatabase, persistDatabase, PersistedCollections } from './database.js';

const users = new Map<string, User>();

type User = {
  id: string;
  name: string;
  email: string;
  plushieName: string;
  plushieType: string;
  plushiePaired: boolean;
  accessories: AccessoryId[];
  pendingAccessories: AccessoryId[];
  equippedAccessories: AccessoryId[];
  friendIds: string[];
  notificationPreferences: NotificationPreferences;
  streak: number;
  points: number;
  lifetimePoints: number;
  lastPlushieScanAt: string | null;
  questBoardDate: string | null;
  dailyQuests: DailyQuest[];
};

type NotificationPreferences = { dailyGreeting: boolean; tasks: boolean; events: boolean; friends: boolean; orders: boolean };

type DailyQuest = { id: string; title: string; description: string; points: number; completed: boolean; sourceAccessoryId?: AccessoryId; sourceAccessoryName?: string };

type AccessoryId = 'bright-star' | 'sunny-cap' | 'petal-pin' | 'trail-scarf' | 'cloud-mitts' | 'meadow-socks' | 'tide-loop';

type PortalRole = 'organizer' | 'staff' | 'admin';
type PortalEvent = {
  id: string;
  organizerId: string;
  title: string;
  location: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number | null;
  points: number;
  attendees: string[];
  status: 'draft' | 'open' | 'completed';
  latitude: number | null;
  longitude: number | null;
};
type PortalAccount = { id: string; name: string; email: string; role: 'member' | PortalRole; status: 'active' | 'review' | 'suspended' };
type MarketItem = { id: string; name: string; category: 'accessory' | 'charity'; price: number; stock: number | null; active: boolean };
type AiDetection = { label: string; confidence: number; box?: { x1: number; y1: number; x2: number; y2: number } };
type Submission = {
  id: string;
  userId: string;
  task: string;
  note: string;
  photoDataUrl: string;
  status: 'pending' | 'approved' | 'changes_requested';
  points: number | null;
  aiConfidence: number | null;
  aiLabel: string | null;
  aiAccepted: boolean;
  aiDetections: AiDetection[];
  aiProcessingMs: number | null;
  aiSummary: string | null;
  aiDecisionReason: string | null;
  aiModel: string | null;
  createdAt: string;
  rewardApplied: boolean;
  questId?: string;
  questBoardDate?: string | null;
};
type FulfillmentOrder = { id: string; userId: string; accessoryId: AccessoryId; lockerLocation: string; points: number; status: 'confirmed' | 'tagged' | 'dispatched' | 'delivered' | 'cancelled'; createdAt: string };
type Donation = { id: string; userId: string; causeId: string; causeName: string; points: number; createdAt: string };
type NfcTag = { id: string; token: string; label: string; createdBy: string; createdAt: string; pairedUserId: string | null; pairedAt: string | null; status: 'ready' | 'paired' | 'retired' };
type AccessoryQrTag = { id: string; token: string; accessoryId: AccessoryId; label: string; createdBy: string; createdAt: string; pairedUserId: string | null; pairedAt: string | null; status: 'ready' | 'paired' | 'retired'; orderId?: string | null };
type WebSession = { token: string; accountId: string; role: PortalAccount['role']; expiresAt: number };
type MobileSession = { token: string; userId: string; expiresAt: number };
type MobileHandoff = { token: string; userId: string; expiresAt: number; consumed: boolean };

const portalEvents = new Map<string, PortalEvent>();
const portalAccounts = new Map<string, PortalAccount>();
const webSessions = new Map<string, WebSession>();
const mobileSessions = new Map<string, MobileSession>();
const mobileHandoffs = new Map<string, MobileHandoff>();
const marketItems = new Map<string, MarketItem>();
const submissions = new Map<string, Submission>();
const fulfillmentOrders = new Map<string, FulfillmentOrder>();
const donations = new Map<string, Donation>();
const nfcTags = new Map<string, NfcTag>();
const accessoryQrTags = new Map<string, AccessoryQrTag>();

const persistedCollections = {
  users,
  portalAccounts,
  portalEvents,
  marketItems,
  submissions,
  fulfillmentOrders,
  donations,
  nfcTags,
  accessoryQrTags,
} as unknown as PersistedCollections;

function coordinatesForSingaporeLocation(location: string) {
  const normalized = location.toLowerCase();
  const known: Array<[string[], number, number]> = [
    [['bishan', 'ang mo kio park'], 1.3621, 103.8462],
    [['tampines'], 1.3526, 103.9404],
    [['east coast'], 1.3008, 103.9122],
    [['queenstown'], 1.2942, 103.8059],
    [['bedok'], 1.3240, 103.9300],
    [['marina bay'], 1.2834, 103.8607],
    [['punggol'], 1.4052, 103.9023],
    [['jurong'], 1.3329, 103.7436],
    [['woodlands'], 1.4382, 103.7890],
    [['toa payoh'], 1.3343, 103.8563],
    [['clementi'], 1.3151, 103.7652],
    [['sengkang'], 1.3917, 103.8950],
    [['serangoon'], 1.3496, 103.8737],
    [['kallang'], 1.3100, 103.8660],
    [['yishun'], 1.4295, 103.8350],
    [['choa chu kang'], 1.3854, 103.7443],
  ];
  const match = known.find(([keywords]) => keywords.some((keyword) => normalized.includes(keyword)));
  return match ? { latitude: match[1], longitude: match[2] } : { latitude: null, longitude: null };
}

const databaseReady = initializeDatabase(persistedCollections).then(async () => {
  let changed = false;
  for (const user of users.values()) {
    user.lastPlushieScanAt ??= null;
    user.questBoardDate ??= null;
    user.dailyQuests ??= [];
    user.pendingAccessories ??= [];
    user.friendIds ??= [];
    user.notificationPreferences ??= { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true };
  }
  for (const submission of submissions.values()) {
    submission.rewardApplied ??= submission.status === 'approved' && Boolean(submission.points);
    submission.aiAccepted ??= submission.status === 'approved' && submission.aiConfidence !== null && submission.aiConfidence >= 0.8;
    submission.aiDetections ??= [];
    submission.aiProcessingMs ??= null;
    submission.aiSummary ??= null;
    submission.aiDecisionReason ??= null;
    submission.aiModel ??= null;
  }
  for (const order of fulfillmentOrders.values()) order.status ??= 'confirmed';
  for (const tag of accessoryQrTags.values()) tag.orderId ??= null;
  for (const event of portalEvents.values()) {
    if (typeof event.latitude === 'number' && typeof event.longitude === 'number') continue;
    const coordinates = coordinatesForSingaporeLocation(event.location);
    event.latitude = coordinates.latitude;
    event.longitude = coordinates.longitude;
    changed = true;
  }
  const configuredRoles: Array<[string | undefined, PortalRole]> = [
    [process.env.NOVO_ORGANIZER_EMAIL, 'organizer'],
    [process.env.NOVO_STAFF_EMAIL, 'staff'],
    [process.env.NOVO_ADMIN_EMAIL, 'admin'],
  ];
  for (const [emailValue, role] of configuredRoles) {
    const email = emailValue?.trim().toLowerCase();
    if (!email || findPortalAccountByEmail(email)) continue;
    const name = email.split('@')[0]?.replace(/[._-]+/g, ' ') || role;
    const account: PortalAccount = { id: `${role}_${crypto.randomUUID()}`, name, email, role, status: 'active' };
    portalAccounts.set(account.id, account);
    changed = true;
  }
  if (changed) await persistDatabase(persistedCollections);
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const emailStatusSchema = z.object({ email: z.string().email() });

const onboardingSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().email(),
  plushieName: z.string().trim().min(1).max(30),
  focus: z.enum(['single-use', 'food', 'repair']),
});

const pairSchema = z.object({ tagToken: z.string().trim().min(24).max(200) });
const provisionTagSchema = z.object({ label: z.string().trim().min(2).max(80) });
const provisionAccessoryTagSchema = z.object({ label: z.string().trim().min(2).max(80), accessoryId: z.enum(['bright-star', 'sunny-cap', 'petal-pin', 'trail-scarf', 'cloud-mitts', 'meadow-socks', 'tide-loop']), orderId: z.string().min(1).optional() });
const customTaskSchema = z.object({
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(10).max(1000),
  photoDataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(9_000_000),
});
const redeemSchema = z.object({ code: z.string().min(1) });
const eventSchema = z.object({
  organizerId: z.string().min(1),
  title: z.string().trim().min(3).max(100),
  location: z.string().trim().min(3).max(160),
  startsAt: z.string().datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(1440),
  capacity: z.number().int().positive().max(10000).nullable(),
  points: z.number().int().min(0).max(5000),
  status: z.enum(['draft', 'open', 'completed']).default('draft'),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});
const checkInSchema = z.object({ attendeeId: z.string().min(1) });
const accountPatchSchema = z.object({ name: z.string().trim().min(1).max(80).optional(), email: z.string().email().optional(), role: z.enum(['member', 'organizer', 'staff', 'admin']).optional(), status: z.enum(['active', 'review', 'suspended']).optional() }).refine((value) => Object.keys(value).length > 0, 'Provide at least one account change.');
const accountCreateSchema = z.object({ name: z.string().trim().min(1).max(80), email: z.string().email(), role: z.enum(['member', 'organizer', 'staff', 'admin']), status: z.enum(['active', 'review', 'suspended']).default('active') });
const marketSchema = z.object({ name: z.string().trim().min(2).max(80), category: z.enum(['accessory', 'charity']), price: z.number().int().min(0).max(100000), stock: z.number().int().min(0).nullable(), active: z.boolean().default(true) });
const orderStatusSchema = z.object({ status: z.enum(['confirmed', 'tagged', 'dispatched', 'delivered', 'cancelled']) });
const reviewSchema = z.object({ decision: z.enum(['approved', 'changes_requested']), points: z.number().int().min(0).max(5000) });
const handoffExchangeSchema = z.object({ handoffToken: z.string().min(10) });
const memberAccessorySchema = z.object({ accessoryId: z.enum(['bright-star', 'sunny-cap', 'petal-pin', 'trail-scarf', 'cloud-mitts', 'meadow-socks', 'tide-loop']) });
const memberPurchaseSchema = memberAccessorySchema.extend({ lockerLocation: z.string().trim().min(3).max(120) });
const contributionSchema = z.object({ points: z.number().int().min(100).max(10000), causeId: z.string().trim().min(2).max(60).default('clean-shores'), causeName: z.string().trim().min(2).max(100).default('Singapore Clean Shores') });
const notificationPreferencesSchema = z.object({ dailyGreeting: z.boolean(), tasks: z.boolean(), events: z.boolean(), friends: z.boolean(), orders: z.boolean() });

const questTemplates = [
  { title: 'Refill before buying', description: 'Use a reusable bottle or cup today.', points: 20 },
  { title: 'Sort one recycling load', description: 'Separate clean recyclables from general waste.', points: 30 },
  { title: 'Choose a package-free option', description: 'Avoid one piece of single-use packaging.', points: 25 },
  { title: 'Repair or reuse', description: 'Repair, donate, or repurpose one useful item.', points: 40 },
  { title: 'Plan a low-waste meal', description: 'Use ingredients already at home before buying more.', points: 30 },
  { title: 'Return a drink container', description: 'Use an official Return Right point for an eligible container.', points: 25 },
];

const accessoryQuestTemplates: Record<AccessoryId, Array<{ title: string; description: string; points: number }>> = {
  'bright-star': [
    { title: 'Spot a better bin', description: 'Find one clearly labelled recycling point and sort an item correctly.', points: 30 },
    { title: 'Share one bright idea', description: 'Show someone one simple way to avoid disposable packaging.', points: 25 },
  ],
  'petal-pin': [
    { title: 'Choose a refillable bloom', description: 'Replace one packaged drink or toiletry with a refill today.', points: 30 },
    { title: 'Rescue a small item', description: 'Keep one useful item in circulation by donating or repurposing it.', points: 35 },
  ],
  'sunny-cap': [
    { title: 'Sunny litter loop', description: 'Take a short outdoor walk and safely collect visible litter.', points: 40 },
    { title: 'Walk one short trip', description: 'Swap a short vehicle trip for walking or public transport.', points: 35 },
  ],
  'trail-scarf': [
    { title: 'Mend a textile', description: 'Repair a loose seam, button, or small tear instead of replacing it.', points: 45 },
    { title: 'Give fabric another life', description: 'Reuse a cloth, bag, or old textile for a new purpose.', points: 35 },
  ],
  'cloud-mitts': [
    { title: 'Hands-on sorting', description: 'Rinse and sort a small batch of cans, bottles, or containers.', points: 35 },
    { title: 'Clean one shared corner', description: 'Tidy a small shared space and dispose of everything correctly.', points: 45 },
  ],
  'meadow-socks': [
    { title: 'Step towards a return point', description: 'Walk to a nearby Return Right machine with an eligible container.', points: 40 },
    { title: 'Low-waste walking errand', description: 'Complete one nearby errand on foot with a reusable bag.', points: 35 },
  ],
  'tide-loop': [
    { title: 'Complete a refill loop', description: 'Refill the same bottle or cup instead of taking a disposable one.', points: 35 },
    { title: 'Count what you avoided', description: 'Track three single-use items you avoided today.', points: 30 },
  ],
};

const accessoryNames: Record<AccessoryId, string> = {
  'bright-star': 'Bright star', 'petal-pin': 'Petal pin', 'sunny-cap': 'Sunny cap', 'trail-scarf': 'Trail scarf', 'cloud-mitts': 'Cloud mitts', 'meadow-socks': 'Meadow socks', 'tide-loop': 'Tide loop',
};

const verifiedLocations = [
  { id: 'pick-360b-admiralty', kind: 'pick-locker', name: 'Pick Locker @ 360B Admiralty Drive', address: '360B Admiralty Drive, Singapore 752360', latitude: 1.4486, longitude: 103.8154, hours: '24 hours', sourceUrl: 'https://www.nhghealth.com.sg/wh/for-patients-visitors/your-medication/pharmacy-locker-locations' },
  { id: 'pick-kallang-mrt', kind: 'pick-locker', name: 'Pick Locker @ Kallang MRT Station', address: '5 Sims Avenue, Singapore 387405', latitude: 1.3114, longitude: 103.8714, hours: '24 hours', sourceUrl: 'https://www.nhghealth.com.sg/wh/for-patients-visitors/your-medication/pharmacy-locker-locations' },
  { id: 'pick-dakota-mrt', kind: 'pick-locker', name: 'Pick Locker @ Dakota MRT Station', address: '211 Old Airport Road, Singapore 397973', latitude: 1.3083, longitude: 103.8886, hours: '24 hours', sourceUrl: 'https://www.nhghealth.com.sg/wh/for-patients-visitors/your-medication/pharmacy-locker-locations' },
  { id: 'pop-general-post-office', kind: 'singpost-locker', name: 'POPStation @ General Post Office', address: '10 Eunos Road 8, Singapore 408600', latitude: 1.3196, longitude: 103.8935, hours: '24 hours', sourceUrl: 'https://www.singpost.com/locate-us/popstation' },
  { id: 'pop-toa-payoh', kind: 'singpost-locker', name: 'POPStation @ Toa Payoh Central Post Office', address: '520 Lorong 6 Toa Payoh, Singapore 310520', latitude: 1.3321, longitude: 103.8483, hours: '24 hours', sourceUrl: 'https://www.singpost.com/locate-us/popstation' },
  { id: 'pop-ang-mo-kio', kind: 'singpost-locker', name: 'POPStation @ Ang Mo Kio Central Post Office', address: '727 Ang Mo Kio Avenue 6, Singapore 560727', latitude: 1.3726, longitude: 103.8465, hours: '24 hours', sourceUrl: 'https://www.singpost.com/locate-us/popstation' },
  { id: 'returnright-nex', kind: 'return-right', name: 'Return Right @ FairPrice Xtra NEX', address: '23 Serangoon Central, Singapore 556083', latitude: 1.3507, longitude: 103.8723, hours: 'Mall operating hours', sourceUrl: 'https://returnright.sg/p/find-my-nearest-rvm' },
  { id: 'returnright-cassia-42', kind: 'return-right', name: 'Return Right @ 42 Cassia Crescent', address: '42 Cassia Crescent, Singapore 390042', latitude: 1.3095, longitude: 103.8868, hours: '24 hours', sourceUrl: 'https://returnright.sg/p/find-my-nearest-rvm' },
  { id: 'returnright-lot-one', kind: 'return-right', name: 'Return Right @ FairPrice Lot One', address: '21 Choa Chu Kang Avenue 4, Singapore 689812', latitude: 1.3851, longitude: 103.7449, hours: 'Store operating hours', sourceUrl: 'https://returnright.sg/p/find-my-nearest-rvm' },
] as const;

const memberRewards: Partial<Record<AccessoryId, number>> = {
  'sunny-cap': 320,
  'trail-scarf': 460,
  'cloud-mitts': 280,
  'meadow-socks': 240,
};

const accessoryCodes: Record<string, AccessoryId> = {
  'NOVO-STAR-04': 'bright-star',
  'NOVO-SUNNY-01': 'sunny-cap',
  'NOVO-PETAL-02': 'petal-pin',
  'NOVO-TRAIL-03': 'trail-scarf',
  'NOVO-MITTS-05': 'cloud-mitts',
  'NOVO-SOCKS-06': 'meadow-socks',
  'NOVO-TIDE-07': 'tide-loop',
};

function findUser(userId: string) {
  return [...users.values()].find((user) => user.id === userId);
}

function findPortalAccountByEmail(email: string) {
  return [...portalAccounts.values()].find((account) => account.email === email.toLowerCase());
}

function singaporeDate(value: Date | string = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function previousSingaporeDate(date: string) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() - 1);
  return singaporeDate(value);
}

function createDailyQuests(user: User, date: string): DailyQuest[] {
  const seed = [...`${user.id}:${date}`].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
  const equipped = user.equippedAccessories.length ? user.equippedAccessories : user.accessories.slice(0, 1);
  const accessoryQuests = equipped.slice(0, 2).map((accessoryId, index) => {
    const options = accessoryQuestTemplates[accessoryId];
    const template = options[(seed + index) % options.length] ?? options[0]!;
    return { id: `${date}-accessory-${index + 1}`, ...template, completed: false, sourceAccessoryId: accessoryId, sourceAccessoryName: accessoryNames[accessoryId] };
  });
  const generalNeeded = 3 - accessoryQuests.length;
  const generalStart = seed % questTemplates.length;
  const generalQuests = Array.from({ length: generalNeeded }, (_, index) => ({ id: `${date}-general-${index + 1}`, ...(questTemplates[(generalStart + index * 2) % questTemplates.length] ?? questTemplates[0]!), completed: false }));
  return [...accessoryQuests, ...generalQuests];
}

function applyDailyPlushieScan(user: User) {
  const now = new Date();
  const today = singaporeDate(now);
  const lastDate = user.lastPlushieScanAt ? singaporeDate(user.lastPlushieScanAt) : null;
  if (lastDate !== today) {
    user.streak = lastDate === previousSingaporeDate(today) ? Math.max(1, user.streak + 1) : 1;
    user.questBoardDate = today;
    user.dailyQuests = createDailyQuests(user, today);
  }
  user.lastPlushieScanAt = now.toISOString();
  return { scannedToday: true, questsRefreshed: lastDate !== today };
}

function findNfcTag(tagToken: string) {
  return [...nfcTags.values()].find((tag) => tag.token === tagToken && tag.status !== 'retired');
}

function findAccessoryQrTag(tagToken: string) {
  return [...accessoryQrTags.values()].find((tag) => tag.token === tagToken && tag.status !== 'retired');
}

async function analyzeSubmission(photoDataUrl: string, description: string) {
  const unavailable = { confidence: null as number | null, label: null as string | null, accepted: false, detections: [] as AiDetection[], processingMs: null as number | null, summary: null as string | null, decisionReason: null as string | null, model: null as string | null };
  if (!process.env.YOLO_SERVICE_URL) return unavailable;
  try {
    const response = await fetch(process.env.YOLO_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.YOLO_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.YOLO_SERVICE_TOKEN}` } : {}) },
      body: JSON.stringify({ image: photoDataUrl, description }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return unavailable;
    const result = await response.json() as { confidence?: number; label?: string; accepted?: boolean; detections?: Array<{ label?: string; confidence?: number; box?: { x1?: number; y1?: number; x2?: number; y2?: number } }>; processing_ms?: number; summary?: string; decision_reason?: string; model?: string };
    const confidence = typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : null;
    const detections = Array.isArray(result.detections) ? result.detections.flatMap((item): AiDetection[] => {
      if (typeof item.label !== 'string' || typeof item.confidence !== 'number') return [];
      const box = item.box && [item.box.x1, item.box.y1, item.box.x2, item.box.y2].every((value) => typeof value === 'number')
        ? { x1: item.box.x1!, y1: item.box.y1!, x2: item.box.x2!, y2: item.box.y2! }
        : undefined;
      return [{ label: item.label.slice(0, 100), confidence: Math.max(0, Math.min(1, item.confidence)), ...(box ? { box } : {}) }];
    }).slice(0, 20) : [];
    return {
      confidence,
      label: result.label?.slice(0, 100) ?? null,
      accepted: result.accepted === true && confidence !== null && confidence >= 0.8,
      detections,
      processingMs: typeof result.processing_ms === 'number' && Number.isFinite(result.processing_ms) ? Math.max(0, result.processing_ms) : null,
      summary: result.summary?.slice(0, 500) ?? null,
      decisionReason: result.decision_reason?.slice(0, 500) ?? null,
      model: result.model?.slice(0, 100) ?? null,
    };
  } catch {
    return unavailable;
  }
}

function createWebSession(account: PortalAccount) {
  const token = `web.${crypto.randomUUID()}`;
  const session: WebSession = { token, accountId: account.id, role: account.role, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 };
  webSessions.set(token, session);
  return session;
}

function createMobileSession(userId: string) {
  const token = `mobile.${crypto.randomUUID()}`;
  mobileSessions.set(token, { token, userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  return token;
}

function createMobileHandoff(userId: string) {
  const token = crypto.randomUUID();
  mobileHandoffs.set(token, { token, userId, expiresAt: Date.now() + 24 * 60 * 60 * 1000, consumed: false });
  return token;
}

function sessionFromRequest(request: Request) {
  const authorization = request.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const session = token ? webSessions.get(token) : undefined;
  if (!session || session.expiresAt <= Date.now()) return null;
  return session;
}

function memberFromRequest(request: Request) {
  const session = sessionFromRequest(request);
  if (session?.role === 'member') return findUser(session.accountId) ?? null;

  const authorization = request.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const mobileSession = token ? mobileSessions.get(token) : undefined;
  if (!mobileSession || mobileSession.expiresAt <= Date.now()) return null;
  return findUser(mobileSession.userId) ?? null;
}

function getPortalRole(request: Request): PortalRole | null {
  const session = sessionFromRequest(request);
  if (session && session.role !== 'member') return session.role;
  const role = request.header('x-novo-role');
  return process.env.NODE_ENV !== 'production' && (role === 'organizer' || role === 'staff' || role === 'admin') ? role : null;
}

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function requirePortalRole(...allowed: PortalRole[]) {
  return (request: Request, response: Response, next: NextFunction) => {
    const role = getPortalRole(request);
    if (!role) return response.status(401).json({ message: 'Portal sign-in required.' });
    if (!allowed.includes(role)) return response.status(403).json({ message: 'Your role cannot access this workspace.' });
    response.locals.portalRole = role;
    next();
  };
}

export const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '10mb' }));
app.use(async (_request, _response, next) => {
  try {
    await databaseReady;
    next();
  } catch (error) {
    next(error);
  }
});
app.use((request, response, next) => {
  if (request.method === 'POST' || request.method === 'PATCH' || request.method === 'DELETE') {
    response.on('finish', () => {
      if (response.statusCode < 400) void persistDatabase(persistedCollections).catch((error) => console.error('Could not persist novo state.', error));
    });
  }
  next();
});

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, service: 'novo-api' });
});

app.post('/api/auth/email-status', (request, response, next) => {
  try {
    const { email } = emailStatusSchema.parse(request.body);
    response.json({ exists: users.has(email.toLowerCase()) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/sign-in', (request, response, next) => {
  try {
    const { email } = signInSchema.parse(request.body);
    const existing = users.get(email.toLowerCase());
    if (!existing) return response.json({ isNewUser: true, draft: { name: '', email: email.toLowerCase() } });
    response.json({ isNewUser: false, token: createMobileSession(existing.id), user: existing });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/web-sign-in', (request, response, next) => {
  try {
    const { email } = signInSchema.parse(request.body);
    const normalizedEmail = email.toLowerCase();
    let account = findPortalAccountByEmail(normalizedEmail);
    let user = users.get(normalizedEmail);

    if (!account) return response.status(401).json({ message: 'No account was found. Create your account in the novo app first.' });

    if (account.status === 'suspended') return response.status(403).json({ message: 'This account is suspended.' });
    const session = createWebSession(account);
    const privileged = account.role !== 'member';
    const handoffToken = !privileged && user ? createMobileHandoff(user.id) : undefined;
    response.json({ token: session.token, account, role: account.role, destination: privileged ? 'operations' : 'member-web', handoffToken, member: privileged ? undefined : user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/session', (request, response) => {
  const session = sessionFromRequest(request);
  if (!session) return response.status(401).json({ message: 'Session expired.' });
  const account = portalAccounts.get(session.accountId);
  if (!account) return response.status(404).json({ message: 'Account not found.' });
  const privileged = account.role !== 'member';
  const user = findUser(account.id);
  const handoffToken = !privileged && user ? createMobileHandoff(user.id) : undefined;
  response.json({ account, role: account.role, destination: privileged ? 'operations' : 'member-web', handoffToken, member: privileged ? undefined : user });
});

app.post('/api/auth/mobile-handoff/exchange', (request, response, next) => {
  try {
    const { handoffToken } = handoffExchangeSchema.parse(request.body);
    const handoff = mobileHandoffs.get(handoffToken);
    if (!handoff || handoff.consumed || handoff.expiresAt <= Date.now()) return response.status(401).json({ message: 'This sign-in handoff has expired.' });
    const user = findUser(handoff.userId);
    if (!user) return response.status(404).json({ message: 'Account not found.' });
    handoff.consumed = true;
    response.json({ isNewUser: false, token: createMobileSession(user.id), user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/google', async (request, response, next) => {
  try {
    const credential = z.string().min(100).parse(request.body?.credential);
    const tokenResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!tokenResponse.ok) return response.status(401).json({ message: 'Google could not verify this sign-in.' });
    const profile = await tokenResponse.json() as { aud?: string; email?: string; name?: string; email_verified?: string };
    const allowedClientIds = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_ANDROID_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID, process.env.GOOGLE_WEB_CLIENT_ID, ...(process.env.GOOGLE_CLIENT_IDS?.split(',') ?? [])].map((value) => value?.trim()).filter(Boolean);
    if (!profile.aud || !allowedClientIds.includes(profile.aud) || profile.email_verified !== 'true' || !profile.email) return response.status(401).json({ message: 'Google sign-in is not configured for this build.' });
    const email = profile.email.toLowerCase();
    const user = users.get(email);
    if (!user) return response.json({ isNewUser: true, draft: { name: profile.name ?? '', email } });
    response.json({ isNewUser: false, token: createMobileSession(user.id), user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/onboarding', (request, response, next) => {
  try {
    const input = onboardingSchema.parse(request.body);
    const user: User = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      plushieName: input.plushieName,
      plushieType: 'Natural calico bear',
      plushiePaired: false,
      accessories: ['bright-star'],
      pendingAccessories: [],
      equippedAccessories: ['bright-star'],
      friendIds: [],
      notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true },
      streak: 0,
      points: 0,
      lifetimePoints: 0,
      lastPlushieScanAt: null,
      questBoardDate: null,
      dailyQuests: [],
    };
    users.set(user.email, user);
    portalAccounts.set(user.id, { id: user.id, name: user.name, email: user.email, role: 'member', status: 'active' });
    response.status(201).json({ isNewUser: false, token: createMobileSession(user.id), user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/mobile-session', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Mobile session expired.' });
  response.json({ isNewUser: false, user });
});

app.get('/api/member/profile', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  response.json({ user });
});

app.get('/api/member/daily-status', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const today = singaporeDate();
  response.json({
    needsPlushieScan: !user.lastPlushieScanAt || singaporeDate(user.lastPlushieScanAt) !== today,
    questBoardDate: user.questBoardDate,
    quests: user.dailyQuests,
  });
});

app.post('/api/member/plushie/pair', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { tagToken } = pairSchema.parse(request.body);
    const tag = findNfcTag(tagToken);
    if (!tag) return response.status(404).json({ message: 'This novo tag has not been prepared by staff.' });
    if (tag.pairedUserId && tag.pairedUserId !== user.id) return response.status(409).json({ message: 'This plushie is already paired to another account.' });
    for (const existingTag of nfcTags.values()) {
      if (existingTag.pairedUserId === user.id && existingTag.id !== tag.id) {
        existingTag.pairedUserId = null;
        existingTag.pairedAt = null;
        existingTag.status = 'ready';
      }
    }
    tag.pairedUserId = user.id;
    tag.pairedAt = new Date().toISOString();
    tag.status = 'paired';
    user.plushiePaired = true;
    response.json({ user, daily: { scannedToday: false, questsRefreshed: false } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/plushie/interact', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { tagToken } = pairSchema.parse(request.body);
    const tag = findNfcTag(tagToken);
    if (!tag || tag.pairedUserId !== user.id || tag.status !== 'paired') return response.status(403).json({ message: 'Tap the plushie paired to this account.' });
    const daily = applyDailyPlushieScan(user);
    response.json({ user, daily });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/accessories/redeem', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { code } = redeemSchema.parse(request.body);
    const trimmed = code.trim();
    const qrToken = trimmed.match(/^novo:\/\/accessory\/([^/?#]+)/i)?.[1];
    const qrTag = qrToken ? findAccessoryQrTag(decodeURIComponent(qrToken)) : undefined;
    const accessoryId = qrTag?.accessoryId ?? accessoryCodes[trimmed.toUpperCase()];
    if (!accessoryId) return response.status(404).json({ message: 'This accessory QR code is not recognised.' });
    if (qrTag?.pairedUserId && qrTag.pairedUserId !== user.id) return response.status(409).json({ message: 'This physical accessory is already paired to another account.' });
    if (!user.pendingAccessories.includes(accessoryId) && !user.accessories.includes(accessoryId)) return response.status(403).json({ message: 'This accessory is not waiting in your wardrobe. Order it first, then scan its physical QR tag.' });
    if (qrTag) {
      qrTag.pairedUserId = user.id;
      qrTag.pairedAt = new Date().toISOString();
      qrTag.status = 'paired';
    }
    user.accessories = Array.from(new Set([...user.accessories, accessoryId]));
    user.pendingAccessories = user.pendingAccessories.filter((id) => id !== accessoryId);
    user.equippedAccessories = Array.from(new Set([...user.equippedAccessories, accessoryId]));
    const matchingOrder = qrTag?.orderId ? fulfillmentOrders.get(qrTag.orderId) : [...fulfillmentOrders.values()].find((order) => order.userId === user.id && order.accessoryId === accessoryId && order.status !== 'delivered' && order.status !== 'cancelled');
    if (matchingOrder) matchingOrder.status = 'delivered';
    response.json({ user, accessoryId });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/accessories/equip', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { accessoryId } = memberAccessorySchema.parse(request.body);
    if (!user.accessories.includes(accessoryId)) return response.status(403).json({ message: 'Pair this accessory in the app before equipping it.' });
    user.equippedAccessories = user.equippedAccessories.includes(accessoryId)
      ? user.equippedAccessories.filter((id) => id !== accessoryId)
      : [...user.equippedAccessories, accessoryId];
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/plushie/unpair', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  user.plushiePaired = false;
  for (const tag of nfcTags.values()) {
    if (tag.pairedUserId === user.id) {
      tag.pairedUserId = null;
      tag.pairedAt = null;
      tag.status = 'ready';
    }
  }
  response.json({ user });
});

app.get('/api/member/tasks', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const now = Date.now();
  const events = [...portalEvents.values()]
    .filter((event) => {
      const startsAt = Date.parse(event.startsAt);
      const endsAt = startsAt + event.durationMinutes * 60_000;
      return event.status === 'open' && Number.isFinite(startsAt) && endsAt >= now;
    })
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt))
    .map((event) => ({
      id: event.id,
      title: event.title,
      location: event.location,
      startsAt: event.startsAt,
      durationMinutes: event.durationMinutes,
      capacity: event.capacity,
      points: event.points,
      attending: event.attendees.length,
      registered: event.attendees.includes(user.id),
      status: Date.parse(event.startsAt) <= now ? 'live' as const : 'scheduled' as const,
      latitude: event.latitude,
      longitude: event.longitude,
    }));
  response.json({ quests: user.dailyQuests, events, submissions: [...submissions.values()].filter((submission) => submission.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

app.post('/api/member/events/:eventId/signup', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const event = portalEvents.get(routeParam(request.params.eventId));
  if (!event || event.status !== 'open') return response.status(404).json({ message: 'This event is no longer accepting registrations.' });
  if (event.capacity !== null && event.attendees.length >= event.capacity && !event.attendees.includes(user.id)) return response.status(409).json({ message: 'This event has reached capacity.' });
  event.attendees = Array.from(new Set([...event.attendees, user.id]));
  response.json({ event: { id: event.id, title: event.title, location: event.location, startsAt: event.startsAt, durationMinutes: event.durationMinutes, capacity: event.capacity, points: event.points, attending: event.attendees.length, registered: true, status: Date.parse(event.startsAt) <= Date.now() ? 'live' : 'scheduled', latitude: event.latitude, longitude: event.longitude } });
});

app.post('/api/member/tasks/custom', async (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const input = customTaskSchema.parse(request.body);
    const analysis = await analyzeSubmission(input.photoDataUrl, `${input.title}. Member evidence: ${input.description}`);
    const awardedPoints = analysis.accepted ? 50 : null;
    const submission: Submission = {
      id: `sub_${crypto.randomUUID()}`,
      userId: user.id,
      task: input.title,
      note: input.description,
      photoDataUrl: input.photoDataUrl,
      status: analysis.accepted ? 'approved' : 'pending',
      points: awardedPoints,
      aiConfidence: analysis.confidence,
      aiLabel: analysis.label,
      aiAccepted: analysis.accepted,
      aiDetections: analysis.detections,
      aiProcessingMs: analysis.processingMs,
      aiSummary: analysis.summary,
      aiDecisionReason: analysis.decisionReason,
      aiModel: analysis.model,
      createdAt: new Date().toISOString(),
      rewardApplied: Boolean(awardedPoints),
    };
    if (awardedPoints) {
      user.points += awardedPoints;
      user.lifetimePoints += awardedPoints;
    }
    submissions.set(submission.id, submission);
    response.status(201).json({ submission, user, automated: analysis.accepted });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/tasks/:questId/submit', async (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const quest = user.dailyQuests.find((item) => item.id === routeParam(request.params.questId));
    if (!quest) return response.status(404).json({ message: 'This task is not on today’s quest board.' });
    if (quest.completed) return response.status(409).json({ message: 'This task has already been completed today.' });
    if ([...submissions.values()].some((item) => item.userId === user.id && item.questId === quest.id && item.status === 'pending')) return response.status(409).json({ message: 'This task is already waiting for staff review.' });
    const input = customTaskSchema.omit({ title: true }).parse(request.body);
    const analysis = await analyzeSubmission(input.photoDataUrl, `${quest.title}. ${quest.description} Member evidence: ${input.description}`);
    const awardedPoints = analysis.accepted ? quest.points : null;
    const submission: Submission = { id: `sub_${crypto.randomUUID()}`, userId: user.id, task: quest.title, note: input.description, photoDataUrl: input.photoDataUrl, status: analysis.accepted ? 'approved' : 'pending', points: awardedPoints, aiConfidence: analysis.confidence, aiLabel: analysis.label, aiAccepted: analysis.accepted, aiDetections: analysis.detections, aiProcessingMs: analysis.processingMs, aiSummary: analysis.summary, aiDecisionReason: analysis.decisionReason, aiModel: analysis.model, createdAt: new Date().toISOString(), rewardApplied: Boolean(awardedPoints), questId: quest.id, questBoardDate: user.questBoardDate };
    if (awardedPoints) {
      user.points += awardedPoints;
      user.lifetimePoints += awardedPoints;
      quest.completed = true;
    }
    submissions.set(submission.id, submission);
    response.status(201).json({ submission, user, automated: analysis.accepted });
  } catch (error) {
    next(error);
  }
});

app.get('/api/member/leaderboard', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const leaders = [...users.values()]
    .sort((left, right) => right.lifetimePoints - left.lifetimePoints || left.name.localeCompare(right.name))
    .slice(0, 50)
    .map((member, index) => ({ rank: index + 1, id: member.id, name: member.name, plushieName: member.plushieName, lifetimePoints: member.lifetimePoints, accessories: member.equippedAccessories, isCurrentUser: member.id === user.id }));
  response.json({ leaders });
});

app.get('/api/member/friends', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const friends = user.friendIds.map(findUser).filter((friend): friend is User => Boolean(friend)).map((friend) => ({ id: friend.id, name: friend.name, plushieName: friend.plushieName, lifetimePoints: friend.lifetimePoints, accessories: friend.equippedAccessories }));
  response.json({ friends });
});

app.post('/api/member/friends/:friendId', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const friend = findUser(routeParam(request.params.friendId));
  if (!friend || friend.id === user.id) return response.status(404).json({ message: 'Friend invitation is not valid.' });
  user.friendIds = Array.from(new Set([...user.friendIds, friend.id]));
  friend.friendIds = Array.from(new Set([...friend.friendIds, user.id]));
  response.json({ user, friends: user.friendIds.map(findUser).filter(Boolean) });
});

app.patch('/api/member/notifications', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    user.notificationPreferences = notificationPreferencesSchema.parse(request.body);
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

app.get('/api/locations', (_request, response) => {
  response.json({ locations: verifiedLocations, verifiedAt: '2026-09-21', liveReturnRightUrl: 'https://returnright.sg/p/find-my-nearest-rvm' });
});

app.get('/api/member/market/lockers', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  response.json({ lockers: verifiedLocations.filter((location) => location.kind === 'pick-locker' || location.kind === 'singpost-locker') });
});

app.delete('/api/member/account', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  users.delete(user.email.toLowerCase());
  portalAccounts.delete(user.id);
  for (const [token, session] of webSessions) if (session.accountId === user.id) webSessions.delete(token);
  for (const [token, session] of mobileSessions) if (session.userId === user.id) mobileSessions.delete(token);
  response.status(204).send();
});

app.post('/api/member/market/purchase', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { accessoryId, lockerLocation } = memberPurchaseSchema.parse(request.body);
    const price = memberRewards[accessoryId];
    if (!price) return response.status(404).json({ message: 'This reward is not currently available.' });
    if (user.accessories.includes(accessoryId) || user.pendingAccessories.includes(accessoryId)) return response.status(409).json({ message: 'This reward is already in your wardrobe.' });
    if (user.points < price) return response.status(409).json({ message: 'You need more leaves for this reward.' });
    user.points -= price;
    user.pendingAccessories.push(accessoryId);
    const order: FulfillmentOrder = { id: `ord_${crypto.randomUUID()}`, userId: user.id, accessoryId, lockerLocation, points: price, status: 'confirmed', createdAt: new Date().toISOString() };
    fulfillmentOrders.set(order.id, order);
    response.json({ user, price, order });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/charity/contribute', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { points, causeId, causeName } = contributionSchema.parse(request.body);
    if (user.points < points) return response.status(409).json({ message: 'You need more leaves to contribute.' });
    user.points -= points;
    const contribution: Donation = { id: `don_${crypto.randomUUID()}`, userId: user.id, causeId, causeName, points, createdAt: new Date().toISOString() };
    donations.set(contribution.id, contribution);
    response.json({ user, contribution });
  } catch (error) {
    next(error);
  }
});

app.get('/api/portal/overview', requirePortalRole('organizer', 'staff', 'admin'), (_request, response) => {
  response.json({
    role: response.locals.portalRole,
    totals: { activeMembers: portalAccounts.size, upcomingEvents: [...portalEvents.values()].filter((event) => event.status === 'open').length, pendingReviews: [...submissions.values()].filter((submission) => submission.status === 'pending').length },
  });
});

app.get('/api/portal/events', requirePortalRole('organizer', 'staff', 'admin'), (_request, response) => {
  response.json({ events: [...portalEvents.values()] });
});

app.post('/api/portal/events', requirePortalRole('organizer', 'staff', 'admin'), (request, response, next) => {
  try {
    const input = eventSchema.parse(request.body);
    const inferredCoordinates = coordinatesForSingaporeLocation(input.location);
    const event: PortalEvent = {
      id: `evt_${crypto.randomUUID()}`,
      ...input,
      latitude: input.latitude ?? inferredCoordinates.latitude,
      longitude: input.longitude ?? inferredCoordinates.longitude,
      attendees: [],
    };
    portalEvents.set(event.id, event);
    response.status(201).json({ event });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/portal/events/:eventId', requirePortalRole('organizer', 'staff', 'admin'), (request, response, next) => {
  try {
    const event = portalEvents.get(routeParam(request.params.eventId));
    if (!event) return response.status(404).json({ message: 'Event not found.' });
    const input = eventSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one event change.').parse(request.body);
    Object.assign(event, input);
    if (input.location && input.latitude === undefined && input.longitude === undefined) Object.assign(event, coordinatesForSingaporeLocation(input.location));
    response.json({ event });
  } catch (error) { next(error); }
});

app.delete('/api/portal/events/:eventId', requirePortalRole('organizer', 'staff', 'admin'), (request, response) => {
  const deleted = portalEvents.delete(routeParam(request.params.eventId));
  if (!deleted) return response.status(404).json({ message: 'Event not found.' });
  response.status(204).send();
});

app.post('/api/portal/events/:eventId/check-in', requirePortalRole('organizer', 'admin'), (request, response, next) => {
  try {
    const { attendeeId } = checkInSchema.parse(request.body);
    const event = portalEvents.get(routeParam(request.params.eventId));
    if (!event) return response.status(404).json({ message: 'Event not found.' });
    if (event.capacity !== null && event.attendees.length >= event.capacity && !event.attendees.includes(attendeeId)) return response.status(409).json({ message: 'This event has reached capacity.' });
    event.attendees = Array.from(new Set([...event.attendees, attendeeId]));
    response.json({ event, pointsQueued: event.points });
  } catch (error) {
    next(error);
  }
});

app.get('/api/portal/submissions', requirePortalRole('staff', 'admin'), (request, response) => {
  const all = request.query.scope === 'all';
  response.json({ submissions: [...submissions.values()].filter((submission) => all || submission.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

app.delete('/api/portal/submissions/:submissionId', requirePortalRole('staff', 'admin'), (request, response) => {
  const deleted = submissions.delete(routeParam(request.params.submissionId));
  if (!deleted) return response.status(404).json({ message: 'Submission not found.' });
  response.status(204).send();
});

app.post('/api/portal/submissions/:submissionId/review', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const input = reviewSchema.parse(request.body);
    const submission = submissions.get(routeParam(request.params.submissionId));
    if (!submission) return response.status(404).json({ message: 'Submission not found.' });
    submission.status = input.decision;
    submission.points = input.decision === 'approved' ? input.points : 0;
    if (input.decision === 'approved' && !submission.rewardApplied) {
      const user = findUser(submission.userId);
      if (user) {
        user.points += input.points;
        user.lifetimePoints += input.points;
        if (submission.questId && submission.questBoardDate === user.questBoardDate) {
          const quest = user.dailyQuests.find((item) => item.id === submission.questId);
          if (quest) quest.completed = true;
        }
      }
      submission.rewardApplied = true;
    }
    response.json({ submission, user: findUser(submission.userId) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/portal/nfc-tags', requirePortalRole('staff', 'admin'), (_request, response) => {
  response.json({ tags: [...nfcTags.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

app.post('/api/portal/nfc-tags', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const { label } = provisionTagSchema.parse(request.body);
    const session = sessionFromRequest(request);
    const tag: NfcTag = {
      id: `nfc_${crypto.randomUUID()}`,
      token: randomBytes(32).toString('base64url'),
      label,
      createdBy: session?.accountId ?? `development-${response.locals.portalRole}`,
      createdAt: new Date().toISOString(),
      pairedUserId: null,
      pairedAt: null,
      status: 'ready',
    };
    nfcTags.set(tag.id, tag);
    response.status(201).json({ tag, ndefUrl: `novo://plushie/${tag.token}` });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/portal/nfc-tags/:tagId/retire', requirePortalRole('staff', 'admin'), (request, response) => {
  const tag = nfcTags.get(routeParam(request.params.tagId));
  if (!tag) return response.status(404).json({ message: 'NFC tag not found.' });
  tag.status = 'retired';
  if (tag.pairedUserId) {
    const user = findUser(tag.pairedUserId);
    if (user) user.plushiePaired = false;
  }
  tag.pairedUserId = null;
  tag.pairedAt = null;
  response.json({ tag });
});

app.patch('/api/portal/nfc-tags/:tagId', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const tag = nfcTags.get(routeParam(request.params.tagId));
    if (!tag) return response.status(404).json({ message: 'NFC tag not found.' });
    const changes = z.object({ label: z.string().trim().min(2).max(80) }).parse(request.body);
    tag.label = changes.label;
    response.json({ tag });
  } catch (error) { next(error); }
});

app.delete('/api/portal/nfc-tags/:tagId', requirePortalRole('staff', 'admin'), (request, response) => {
  const tag = nfcTags.get(routeParam(request.params.tagId));
  if (!tag) return response.status(404).json({ message: 'NFC tag not found.' });
  if (tag.status === 'paired') return response.status(409).json({ message: 'Retire a paired plushie tag before deleting it.' });
  nfcTags.delete(tag.id);
  response.status(204).send();
});

app.get('/api/portal/accessory-tags', requirePortalRole('staff', 'admin'), (_request, response) => {
  response.json({ tags: [...accessoryQrTags.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

app.post('/api/portal/accessory-tags', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const { label, accessoryId, orderId } = provisionAccessoryTagSchema.parse(request.body);
    const order = orderId ? fulfillmentOrders.get(orderId) : undefined;
    if (orderId && (!order || order.accessoryId !== accessoryId || order.status === 'cancelled' || order.status === 'delivered')) return response.status(409).json({ message: 'This fulfillment order cannot be tagged with that accessory.' });
    const session = sessionFromRequest(request);
    const tag: AccessoryQrTag = { id: `aqr_${crypto.randomUUID()}`, token: randomBytes(32).toString('base64url'), accessoryId, label, createdBy: session?.accountId ?? `development-${response.locals.portalRole}`, createdAt: new Date().toISOString(), pairedUserId: null, pairedAt: null, status: 'ready', orderId: orderId ?? null };
    accessoryQrTags.set(tag.id, tag);
    if (order) order.status = 'tagged';
    response.status(201).json({ tag, qrPayload: `novo://accessory/${tag.token}` });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/portal/accessory-tags/:tagId', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const tag = accessoryQrTags.get(routeParam(request.params.tagId));
    if (!tag) return response.status(404).json({ message: 'Accessory tag not found.' });
    const changes = provisionAccessoryTagSchema.pick({ label: true }).parse(request.body);
    tag.label = changes.label;
    response.json({ tag });
  } catch (error) { next(error); }
});

app.delete('/api/portal/accessory-tags/:tagId', requirePortalRole('staff', 'admin'), (request, response) => {
  const tag = accessoryQrTags.get(routeParam(request.params.tagId));
  if (!tag) return response.status(404).json({ message: 'Accessory tag not found.' });
  if (tag.status === 'paired') return response.status(409).json({ message: 'Paired accessory tags are retained as ownership records.' });
  accessoryQrTags.delete(tag.id);
  response.status(204).send();
});

app.get('/api/portal/fulfillment-orders', requirePortalRole('staff', 'admin'), (_request, response) => {
  response.json({ orders: [...fulfillmentOrders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((order) => ({ ...order, memberName: findUser(order.userId)?.name ?? 'Unknown member' })) });
});

app.patch('/api/portal/fulfillment-orders/:orderId', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const order = fulfillmentOrders.get(routeParam(request.params.orderId));
    if (!order) return response.status(404).json({ message: 'Fulfillment order not found.' });
    order.status = orderStatusSchema.parse(request.body).status;
    response.json({ order });
  } catch (error) { next(error); }
});

app.patch('/api/portal/accessory-tags/:tagId/retire', requirePortalRole('staff', 'admin'), (request, response) => {
  const tag = accessoryQrTags.get(routeParam(request.params.tagId));
  if (!tag) return response.status(404).json({ message: 'Accessory tag not found.' });
  tag.status = 'retired';
  response.json({ tag });
});

app.get('/api/portal/market', requirePortalRole('staff', 'admin'), (_request, response) => {
  response.json({ items: [...marketItems.values()] });
});

app.post('/api/portal/market', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const input = marketSchema.parse(request.body);
    const item: MarketItem = { id: `market_${crypto.randomUUID()}`, ...input };
    marketItems.set(item.id, item);
    response.status(201).json({ item });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/portal/market/:itemId', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const item = marketItems.get(routeParam(request.params.itemId));
    if (!item) return response.status(404).json({ message: 'Marketplace item not found.' });
    const changes = marketSchema.partial().refine((value) => Object.keys(value).length > 0, 'Provide at least one marketplace change.').parse(request.body);
    Object.assign(item, changes);
    response.json({ item });
  } catch (error) { next(error); }
});

app.delete('/api/portal/market/:itemId', requirePortalRole('staff', 'admin'), (request, response) => {
  const deleted = marketItems.delete(routeParam(request.params.itemId));
  if (!deleted) return response.status(404).json({ message: 'Marketplace item not found.' });
  response.status(204).send();
});

app.get('/api/portal/accounts', requirePortalRole('admin'), (_request, response) => {
  response.json({ accounts: [...portalAccounts.values()] });
});

app.post('/api/portal/accounts', requirePortalRole('admin'), (request, response, next) => {
  try {
    const input = accountCreateSchema.parse(request.body);
    if (findPortalAccountByEmail(input.email)) return response.status(409).json({ message: 'An account with this email already exists.' });
    const account: PortalAccount = { id: `account_${crypto.randomUUID()}`, ...input, email: input.email.toLowerCase() };
    portalAccounts.set(account.id, account);
    if (account.role === 'member') {
      users.set(account.email, {
        id: account.id,
        name: account.name,
        email: account.email,
        plushieName: '',
        plushieType: '',
        plushiePaired: false,
        accessories: [],
        pendingAccessories: [],
        equippedAccessories: [],
        friendIds: [],
        notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true },
        streak: 0,
        points: 0,
        lifetimePoints: 0,
        lastPlushieScanAt: null,
        questBoardDate: null,
        dailyQuests: [],
      });
    }
    response.status(201).json({ account });
  } catch (error) { next(error); }
});

app.patch('/api/portal/accounts/:accountId', requirePortalRole('admin'), (request, response, next) => {
  try {
    const changes = accountPatchSchema.parse(request.body);
    const account = portalAccounts.get(routeParam(request.params.accountId));
    if (!account) return response.status(404).json({ message: 'Account not found.' });
    if (changes.email && changes.email.toLowerCase() !== account.email.toLowerCase() && findPortalAccountByEmail(changes.email)) return response.status(409).json({ message: 'An account with this email already exists.' });
    const member = findUser(account.id);
    if (member) {
      const previousEmail = member.email.toLowerCase();
      if (changes.name) member.name = changes.name;
      if (changes.email) {
        member.email = changes.email.toLowerCase();
        users.delete(previousEmail);
        users.set(member.email, member);
      }
    }
    Object.assign(account, changes);
    account.email = account.email.toLowerCase();
    response.json({ account });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/portal/accounts/:accountId', requirePortalRole('admin'), (request, response) => {
  const accountId = routeParam(request.params.accountId);
  const session = sessionFromRequest(request);
  if (session?.accountId === accountId) return response.status(409).json({ message: 'You cannot delete the account currently in use.' });
  const account = portalAccounts.get(accountId);
  if (!account) return response.status(404).json({ message: 'Account not found.' });
  portalAccounts.delete(accountId);
  const member = findUser(accountId);
  if (member) users.delete(member.email.toLowerCase());
  for (const [token, value] of webSessions) if (value.accountId === accountId) webSessions.delete(token);
  for (const [token, value] of mobileSessions) if (value.userId === accountId) mobileSessions.delete(token);
  response.status(204).send();
});

const webDistPath = fileURLToPath(new URL('../../web/dist/', import.meta.url));
if (existsSync(webDistPath)) {
  app.use(express.static(webDistPath, { index: false }));
  app.get('*', (request, response, next) => {
    if (request.path.startsWith('/api/')) return next();
    response.sendFile('index.html', { root: webDistPath });
  });
}

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) {
    response.status(400).json({ message: error.issues[0]?.message ?? 'Invalid request.', issues: error.issues });
    return;
  }
  console.error(error);
  response.status(500).json({ message: 'Something went wrong.' });
});
