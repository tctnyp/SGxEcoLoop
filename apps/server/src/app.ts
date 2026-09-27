import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import { z } from 'zod';
import { initializeDatabase, persistDatabase, PersistedCollections } from './database.js';
import { fallbackLockerLocations, getLockerDirectory, searchLockerDirectory } from './lockerDirectory.js';
import { getReturnRightDirectory } from './returnRightDirectory.js';

const users = new Map<string, User>();

type User = {
  id: string;
  name: string;
  email: string;
  mascotName: string;
  mascotType: MascotType;
  wristbandColor: WristbandColor;
  wristbandPaired: boolean;
  wristbandPickupLocation: string | null;
  accessories: AccessoryId[];
  equippedAccessories: AccessoryId[];
  friendIds: string[];
  notificationPreferences: NotificationPreferences;
  streak: number;
  points: number;
  lifetimePoints: number;
  lastWristbandTapAt: string | null;
  questBoardDate: string | null;
  dailyQuests: DailyQuest[];
  coupons: RedeemedCoupon[];
};

type NotificationPreferences = { dailyGreeting: boolean; tasks: boolean; events: boolean; friends: boolean; orders: boolean };

type DailyQuest = { id: string; title: string; description: string; points: number; completed: boolean; kind?: 'photo' | 'video-quiz'; lesson?: { title: string; summary: string; question: string; options: string[] } };
type RedeemedCoupon = { id: string; offerId: string; name: string; code: string; redeemedAt: string };

type AccessoryId = 'bright-star' | 'sunny-cap' | 'petal-pin' | 'trail-scarf' | 'cloud-mitts' | 'meadow-socks' | 'tide-loop';
type WristbandColor = 'snowy-white' | 'charcoal-black' | 'sunset-orange' | 'tropical-green' | 'ocean-blue';
type MascotType = 'polar-bear' | 'penguin' | 'fox' | 'turtle' | 'bird';

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
  checkedInUserIds: string[];
  status: 'draft' | 'open' | 'completed';
  latitude: number | null;
  longitude: number | null;
};
type PortalAccount = { id: string; name: string; email: string; role: 'member' | PortalRole; status: 'active' | 'review' | 'suspended' };
type MarketItem = { id: string; name: string; category: 'accessory' | 'charity' | 'coupon'; price: number; stock: number | null; active: boolean; description: string; imageDataUrl: string | null; accessoryId: AccessoryId | null };
type WeeklyEntry = { id: string; weekId: string; userId: string; startedAt: string; completedAt: string | null; elapsedMs: number | null; pointsAwarded: number; correct: boolean };
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
  photoFingerprint: string;
  photoEmbedding: number[] | null;
  questId?: string;
  questBoardDate?: string | null;
};
function memberSubmission(submission: Submission) {
  const { photoDataUrl: _photoDataUrl, ...summary } = submission;
  return summary;
}
type FulfillmentOrder = { id: string; userId: string; accessoryId: AccessoryId; lockerLocation: string; points: number; status: 'confirmed' | 'tagged' | 'dispatched' | 'delivered' | 'cancelled'; createdAt: string };
type Donation = { id: string; userId: string; causeId: string; causeName: string; points: number; createdAt: string };
type NfcTag = { id: string; token: string; label: string; wristbandColor: WristbandColor; mascotType: MascotType; createdBy: string; createdAt: string; pairedUserId: string | null; pairedAt: string | null; status: 'ready' | 'paired' | 'retired' };
type AccessoryQrTag = { id: string; token: string; accessoryId: AccessoryId; label: string; createdBy: string; createdAt: string; pairedUserId: string | null; pairedAt: string | null; status: 'ready' | 'paired' | 'retired'; orderId?: string | null };
type WebSession = { token: string; accountId: string; role: PortalAccount['role']; expiresAt: number };
type MobileSession = { token: string; userId: string; expiresAt: number };
type MobileHandoff = { token: string; userId: string; expiresAt: number; consumed: boolean };
type Credential = { email: string; salt: string; passwordHash: string };

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
const credentials = new Map<string, Credential>();
const weeklyEntries = new Map<string, WeeklyEntry>();

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
  webSessions,
  mobileSessions,
  mobileHandoffs,
  credentials,
  weeklyEntries,
} as unknown as PersistedCollections;

function passwordMatches(email: string, password: string) {
  const credential = credentials.get(email.toLowerCase());
  if (!credential) return true;
  try {
    const expected = Buffer.from(credential.passwordHash, 'hex');
    const actual = scryptSync(password, credential.salt, expected.length);
    return expected.length > 0 && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function createCredential(email: string, password: string): Credential {
  const salt = randomBytes(16).toString('hex');
  return { email: email.toLowerCase(), salt, passwordHash: scryptSync(password, salt, 64).toString('hex') };
}

function accountView(account: PortalAccount) {
  const member = findUser(account.id);
  return {
    ...account,
    passwordSet: credentials.has(account.email.toLowerCase()),
    member: member ? {
      points: member.points,
      lifetimePoints: member.lifetimePoints,
      streak: member.streak,
      mascotName: member.mascotName,
      wristbandPaired: member.wristbandPaired,
      wristbandColor: member.wristbandColor,
    } : null,
  };
}

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
  const now = Date.now();
  for (const [token, session] of webSessions) {
    if (session.expiresAt > now && portalAccounts.has(session.accountId)) continue;
    webSessions.delete(token);
    changed = true;
  }
  for (const [token, session] of mobileSessions) {
    if (session.expiresAt > now && findUser(session.userId)) continue;
    mobileSessions.delete(token);
    changed = true;
  }
  for (const [token, handoff] of mobileHandoffs) {
    if (handoff.expiresAt > now && !handoff.consumed && findUser(handoff.userId)) continue;
    mobileHandoffs.delete(token);
    changed = true;
  }
  for (const user of users.values()) {
    const legacy = user as User & { plushieName?: string; plushieType?: string; plushiePaired?: boolean; lastPlushieScanAt?: string | null; pendingAccessories?: AccessoryId[] };
    user.mascotName ??= legacy.plushieName || 'Nova';
    user.mascotType ??= 'polar-bear';
    user.wristbandColor ??= 'snowy-white';
    user.wristbandPaired ??= legacy.plushiePaired ?? false;
    user.wristbandPickupLocation ??= null;
    user.lastWristbandTapAt ??= legacy.lastPlushieScanAt ?? null;
    user.questBoardDate ??= null;
    user.dailyQuests ??= [];
    user.coupons ??= [];
    user.friendIds ??= [];
    const uniqueFriendIds = [...new Set(user.friendIds)].filter((friendId) => friendId !== user.id);
    if (uniqueFriendIds.length !== user.friendIds.length) { user.friendIds = uniqueFriendIds; changed = true; }
    user.notificationPreferences ??= { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true };
  }
  const validUserIds = new Set([...users.values()].map((user) => user.id));
  for (const user of users.values()) {
    const validFriendIds = user.friendIds.filter((friendId) => validUserIds.has(friendId));
    if (validFriendIds.length !== user.friendIds.length) { user.friendIds = validFriendIds; changed = true; }
  }
  for (const [submissionId, submission] of submissions) {
    if (!validUserIds.has(submission.userId)) { submissions.delete(submissionId); changed = true; continue; }
    submission.rewardApplied ??= submission.status === 'approved' && Boolean(submission.points);
    submission.aiAccepted ??= submission.status === 'approved' && submission.aiConfidence !== null && submission.aiConfidence >= 0.8;
    submission.aiDetections ??= [];
    submission.aiProcessingMs ??= null;
    submission.aiSummary ??= null;
    submission.aiDecisionReason ??= null;
    submission.aiModel ??= null;
    submission.photoFingerprint ??= fingerprintPhoto(submission.photoDataUrl);
    submission.photoEmbedding ??= null;
  }
  for (const [orderId, order] of fulfillmentOrders) {
    if (!validUserIds.has(order.userId)) { fulfillmentOrders.delete(orderId); changed = true; continue; }
    order.status ??= 'confirmed';
  }
  for (const [donationId, donation] of donations) if (!validUserIds.has(donation.userId)) { donations.delete(donationId); changed = true; }
  for (const [entryId, entry] of weeklyEntries) if (!validUserIds.has(entry.userId)) { weeklyEntries.delete(entryId); changed = true; }
  for (const item of marketItems.values()) {
    const legacy = item as MarketItem & { description?: string; imageDataUrl?: string | null; accessoryId?: AccessoryId | null };
    const needsMigration = legacy.description === undefined || legacy.imageDataUrl === undefined || legacy.accessoryId === undefined;
    item.description ??= item.category === 'accessory' ? 'A digital accessory made to fit every novo mascot.' : item.category === 'coupon' ? 'Trade leaves for a verified partner reward.' : 'Direct your leaves towards a verified community cause.';
    item.imageDataUrl ??= null;
    item.accessoryId ??= item.category === 'accessory' ? inferAccessoryId(item.id, item.name) : null;
    if (needsMigration) changed = true;
  }
  for (const tag of nfcTags.values()) {
    tag.wristbandColor ??= 'snowy-white';
    tag.mascotType ??= WRISTBAND_MASCOTS[tag.wristbandColor];
    if (tag.pairedUserId && !validUserIds.has(tag.pairedUserId)) { tag.pairedUserId = null; tag.pairedAt = null; tag.status = 'ready'; changed = true; }
  }
  for (const tag of accessoryQrTags.values()) {
    tag.orderId ??= null;
    if (tag.pairedUserId && !validUserIds.has(tag.pairedUserId)) { tag.pairedUserId = null; tag.pairedAt = null; tag.status = 'ready'; changed = true; }
  }
  for (const event of portalEvents.values()) {
    event.checkedInUserIds ??= [];
    const attendees = [...new Set(event.attendees)].filter((userId) => validUserIds.has(userId));
    const checkedInUserIds = [...new Set(event.checkedInUserIds)].filter((userId) => attendees.includes(userId));
    if (attendees.length !== event.attendees.length) { event.attendees = attendees; changed = true; }
    if (checkedInUserIds.length !== event.checkedInUserIds.length) { event.checkedInUserIds = checkedInUserIds; changed = true; }
    if (typeof event.latitude === 'number' && typeof event.longitude === 'number') continue;
    const coordinates = coordinatesForSingaporeLocation(event.location);
    event.latitude = coordinates.latitude;
    event.longitude = coordinates.longitude;
    changed = true;
  }
  const accountEmails = new Set([...portalAccounts.values()].map((account) => account.email.toLowerCase()));
  for (const [email] of credentials) if (!accountEmails.has(email.toLowerCase())) { credentials.delete(email); changed = true; }
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
  mascotName: z.string().trim().min(1).max(30),
  focus: z.enum(['single-use', 'food', 'repair']),
});

const pairSchema = z.object({ tagToken: z.string().trim().min(24).max(200), pickupLocation: z.string().trim().min(3).max(240).optional() });
const pickupReservationSchema = z.object({ pickupLocation: z.string().trim().min(3).max(240) });
const wristbandColorSchema = z.enum(['snowy-white', 'charcoal-black', 'sunset-orange', 'tropical-green', 'ocean-blue']);
const provisionTagSchema = z.object({ label: z.string().trim().min(2).max(80), wristbandColor: wristbandColorSchema.default('snowy-white') });
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
const checkInSchema = z.object({ tagToken: z.string().trim().min(24).max(200) });
const accountPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().email().optional(),
  role: z.enum(['member', 'organizer', 'staff', 'admin']).optional(),
  status: z.enum(['active', 'review', 'suspended']).optional(),
  password: z.string().min(6).max(128).optional(),
  points: z.number().int().min(0).max(10_000_000).optional(),
  lifetimePoints: z.number().int().min(0).max(100_000_000).optional(),
  streak: z.number().int().min(0).max(100_000).optional(),
  mascotName: z.string().trim().min(1).max(30).optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one account change.');
const accountCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().email(),
  role: z.enum(['member', 'organizer', 'staff', 'admin']),
  status: z.enum(['active', 'review', 'suspended']).default('active'),
  password: z.string().min(6).max(128),
  points: z.number().int().min(0).max(10_000_000).default(0),
  lifetimePoints: z.number().int().min(0).max(100_000_000).default(0),
  streak: z.number().int().min(0).max(100_000).default(0),
  mascotName: z.string().trim().min(1).max(30).default('Nova'),
});
const marketSchema = z.object({
  name: z.string().trim().min(2).max(80),
  category: z.enum(['accessory', 'charity', 'coupon']),
  price: z.number().int().min(0).max(100000),
  stock: z.number().int().min(0).nullable(),
  active: z.boolean().default(true),
  description: z.string().trim().min(10).max(800).default('A verified novo marketplace listing.'),
  imageDataUrl: z.string().regex(/^data:image\/(jpeg|jpg|png|webp);base64,/).max(6_000_000).nullable().default(null),
  accessoryId: z.enum(['bright-star', 'sunny-cap', 'petal-pin', 'trail-scarf', 'cloud-mitts', 'meadow-socks', 'tide-loop']).nullable().default(null),
});
const orderStatusSchema = z.object({ status: z.enum(['confirmed', 'tagged', 'dispatched', 'delivered', 'cancelled']) });
const reviewSchema = z.object({ decision: z.enum(['approved', 'changes_requested']), points: z.number().int().min(0).max(5000) });
const handoffExchangeSchema = z.object({ handoffToken: z.string().min(10) });
const memberAccessorySchema = z.object({ accessoryId: z.enum(['bright-star', 'sunny-cap', 'petal-pin', 'trail-scarf', 'cloud-mitts', 'meadow-socks', 'tide-loop']) });
const memberPurchaseSchema = memberAccessorySchema;
const contributionSchema = z.object({ points: z.number().int().min(1).max(10000), causeId: z.string().trim().min(2).max(100), causeName: z.string().trim().min(2).max(100) });
const couponSchema = z.object({ offerId: z.string().trim().min(2).max(60), name: z.string().trim().min(2).max(100), points: z.number().int().min(1).max(10000) });
const quizSubmissionSchema = z.object({ answer: z.string().trim().min(1).max(160) });
const notificationPreferencesSchema = z.object({ dailyGreeting: z.boolean(), tasks: z.boolean(), events: z.boolean(), friends: z.boolean(), orders: z.boolean() });
const weeklySubmissionSchema = z.object({ answers: z.array(z.number().int().min(0).max(3)).length(4) });

const questTemplates = [
  { title: 'Build with recyclables', description: 'Show yourself making a useful product from recyclable materials.', points: 45, kind: 'photo' as const },
  { title: 'Return a BCRS bottle', description: 'Show at least one eligible beverage container being returned through BCRS.', points: 35, kind: 'photo' as const },
  { title: 'Choose a green purchase', description: 'Show a receipt from a verified green event, product, or business.', points: 30, kind: 'photo' as const },
  { title: 'Sustainability lesson', description: 'Watch today’s short sustainability lesson and complete its knowledge check.', points: 25, kind: 'video-quiz' as const, lesson: { title: 'Why clean recycling matters', summary: 'Food and liquid residue can contaminate an otherwise recyclable load. Empty, rinse and dry containers before placing them in the blue bin.', question: 'What should you do before recycling a used drink container?', options: ['Empty, rinse and dry it', 'Leave liquid inside', 'Put it in a plastic bag'] } },
  { title: 'Bring a reusable', description: 'Show yourself using a reusable bag, container, cup, or bottle.', points: 30, kind: 'photo' as const },
  { title: 'Sort clean recyclables', description: 'Show a clean and correctly sorted recycling load before disposal.', points: 35, kind: 'photo' as const },
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
  ...fallbackLockerLocations,
] as const;

const memberRewards: Partial<Record<AccessoryId, number>> = {
  'sunny-cap': 320,
  'trail-scarf': 460,
  'cloud-mitts': 280,
  'meadow-socks': 240,
};

const ACCESSORY_IDS: AccessoryId[] = ['bright-star', 'sunny-cap', 'petal-pin', 'trail-scarf', 'cloud-mitts', 'meadow-socks', 'tide-loop'];

function inferAccessoryId(id: string, name: string): AccessoryId | null {
  const haystack = `${id.replace(/_/g, '-')} ${name.toLowerCase().replace(/\s+/g, '-')}`;
  return ACCESSORY_IDS.find((accessoryId) => haystack.includes(accessoryId)) ?? null;
}

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

const weeklyChallengeTemplates = [
  {
    title: 'Circular sprint',
    description: 'Four rapid questions about recycling and reuse. Accuracy comes first; the fastest correct finish earns the biggest leaves reward.',
    questions: [
      { id: 'clean', prompt: 'Before recycling a drink container, what should you do?', options: ['Empty, rinse and dry it', 'Seal liquid inside', 'Wrap it in a plastic bag', 'Put it with food waste'], answerIndex: 0 },
      { id: 'reuse', prompt: 'Which choice prevents the most single-use waste?', options: ['Take a new cup', 'Use a refillable bottle', 'Double-bag a purchase', 'Request extra cutlery'], answerIndex: 1 },
      { id: 'bcrs', prompt: 'What belongs in a beverage-container return system?', options: ['Food scraps', 'Used tissues', 'Eligible empty drink containers', 'Ceramic plates'], answerIndex: 2 },
      { id: 'repair', prompt: 'A shirt loses one button. What is the most circular first step?', options: ['Throw it away', 'Buy two replacements', 'Repair the button', 'Use a disposable shirt'], answerIndex: 2 },
    ],
  },
  {
    title: 'Low-waste lightning round',
    description: 'Race the community through a weekly sustainability knowledge sprint. Correct answers are ranked by completion time.',
    questions: [
      { id: 'bag', prompt: 'Which bag is usually best for a repeat grocery trip?', options: ['A bag you already own', 'A new paper bag every time', 'Two plastic bags', 'No bag, then buy one'], answerIndex: 0 },
      { id: 'food', prompt: 'What is the best first option for edible surplus food?', options: ['Landfill it', 'Keep or redistribute it safely', 'Mix it with plastic', 'Pour it away'], answerIndex: 1 },
      { id: 'sort', prompt: 'Why should recyclables stay free of food residue?', options: ['To make them heavier', 'To reduce contamination', 'To change their colour', 'To hide labels'], answerIndex: 1 },
      { id: 'trip', prompt: 'For a short nearby trip, which option has the lowest waste impact?', options: ['Walk with a reusable bag', 'Drive for a disposable cup', 'Order several bags', 'Buy bottled water first'], answerIndex: 0 },
    ],
  },
] as const;

function weeklyChallenge() {
  const today = singaporeDate();
  const localNoon = new Date(`${today}T12:00:00+08:00`);
  const daysSinceMonday = (localNoon.getUTCDay() + 6) % 7;
  localNoon.setUTCDate(localNoon.getUTCDate() - daysSinceMonday);
  const weekId = singaporeDate(localNoon);
  const startsAt = `${weekId}T00:00:00+08:00`;
  const endsAt = new Date(Date.parse(startsAt) + 7 * 86_400_000).toISOString();
  const seed = [...weekId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return { id: `weekly-${weekId}`, weekId, startsAt, endsAt, durationSeconds: 120, ...(weeklyChallengeTemplates[seed % weeklyChallengeTemplates.length] ?? weeklyChallengeTemplates[0]!) };
}

function weeklyCompetitionView(user: User) {
  const challenge = weeklyChallenge();
  const entry = weeklyEntries.get(`${challenge.weekId}:${user.id}`) ?? null;
  const ranked = [...weeklyEntries.values()].filter((item) => item.weekId === challenge.weekId && item.completedAt && item.correct && item.elapsedMs !== null).sort((left, right) => (left.elapsedMs ?? Infinity) - (right.elapsedMs ?? Infinity) || (left.completedAt ?? '').localeCompare(right.completedAt ?? ''));
  const myRank = entry?.completedAt ? ranked.findIndex((item) => item.id === entry.id) + 1 : null;
  return {
    id: challenge.id,
    weekId: challenge.weekId,
    title: challenge.title,
    description: challenge.description,
    startsAt: challenge.startsAt,
    endsAt: challenge.endsAt,
    durationSeconds: challenge.durationSeconds,
    questions: challenge.questions.map(({ answerIndex: _answerIndex, ...question }) => question),
    entry: entry ? { startedAt: entry.startedAt, completedAt: entry.completedAt, elapsedMs: entry.elapsedMs, pointsAwarded: entry.pointsAwarded, rank: myRank } : null,
    leaderboard: ranked.slice(0, 10).map((item, index) => ({ rank: index + 1, name: findUser(item.userId)?.name ?? 'Novo member', elapsedMs: item.elapsedMs!, points: item.pointsAwarded, isCurrentUser: item.userId === user.id })),
  };
}

function previousSingaporeDate(date: string) {
  const value = new Date(`${date}T00:00:00+08:00`);
  value.setUTCDate(value.getUTCDate() - 1);
  return singaporeDate(value);
}

function createDailyQuests(user: User, date: string): DailyQuest[] {
  const seed = [...date].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
  const generalStart = seed % questTemplates.length;
  return Array.from({ length: 3 }, (_, index) => ({ id: `${date}-daily-${index + 1}`, ...(questTemplates[(generalStart + index * 2) % questTemplates.length] ?? questTemplates[0]!), completed: false }));
}

function applyDailyWristbandTap(user: User) {
  const now = new Date();
  const today = singaporeDate(now);
  const lastDate = user.lastWristbandTapAt ? singaporeDate(user.lastWristbandTapAt) : null;
  if (lastDate !== today) {
    user.streak = lastDate === previousSingaporeDate(today) ? Math.max(1, user.streak + 1) : 1;
    user.questBoardDate = today;
    user.dailyQuests = createDailyQuests(user, today);
  }
  user.lastWristbandTapAt = now.toISOString();
  return { scannedToday: true, questsRefreshed: lastDate !== today };
}

function findNfcTag(tagToken: string) {
  return [...nfcTags.values()].find((tag) => tag.token === tagToken && tag.status !== 'retired');
}

const WRISTBAND_MASCOTS: Record<WristbandColor, MascotType> = {
  'snowy-white': 'polar-bear',
  'charcoal-black': 'penguin',
  'sunset-orange': 'fox',
  'tropical-green': 'turtle',
  'ocean-blue': 'bird',
};

function fingerprintPhoto(photoDataUrl: string) {
  const base64 = photoDataUrl.slice(photoDataUrl.indexOf(',') + 1).replace(/\s+/g, '');
  return createHash('sha256').update(base64).digest('hex');
}

function embeddingSimilarity(left: number[] | null, right: number[] | null) {
  if (!left?.length || !right?.length || left.length !== right.length) return 0;
  let dot = 0; let leftNorm = 0; let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0; const b = right[index] ?? 0;
    dot += a * b; leftNorm += a * a; rightNorm += b * b;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

function findAccessoryQrTag(tagToken: string) {
  return [...accessoryQrTags.values()].find((tag) => tag.token === tagToken && tag.status !== 'retired');
}

async function analyzeSubmission(photoDataUrl: string, description: string) {
  const unavailable = { confidence: null as number | null, label: null as string | null, embedding: null as number[] | null, accepted: false, detections: [] as AiDetection[], processingMs: null as number | null, summary: null as string | null, decisionReason: null as string | null, model: null as string | null };
  if (!process.env.YOLO_SERVICE_URL) return unavailable;
  try {
    const response = await fetch(process.env.YOLO_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.YOLO_SERVICE_TOKEN ? { Authorization: `Bearer ${process.env.YOLO_SERVICE_TOKEN}` } : {}) },
      body: JSON.stringify({ image: photoDataUrl, description }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return unavailable;
    const result = await response.json() as { confidence?: number; label?: string; embedding?: number[]; accepted?: boolean; detections?: Array<{ label?: string; confidence?: number; box?: { x1?: number; y1?: number; x2?: number; y2?: number } }>; processing_ms?: number; summary?: string; decision_reason?: string; model?: string };
    const confidence = typeof result.confidence === 'number' ? Math.max(0, Math.min(1, result.confidence)) : null;
    const embedding = Array.isArray(result.embedding) && result.embedding.length <= 4096 && result.embedding.every(Number.isFinite) ? result.embedding : null;
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
      embedding,
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
  if (!session) return null;
  const account = portalAccounts.get(session.accountId);
  if (session.expiresAt <= Date.now() || !account || account.status !== 'active' || account.role !== session.role) {
    webSessions.delete(session.token);
    return null;
  }
  return session;
}

function memberFromRequest(request: Request) {
  const session = sessionFromRequest(request);
  if (session?.role === 'member') return findUser(session.accountId) ?? null;

  const authorization = request.header('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const mobileSession = token ? mobileSessions.get(token) : undefined;
  if (!mobileSession) return null;
  const user = findUser(mobileSession.userId);
  if (mobileSession.expiresAt <= Date.now() || !user) {
    mobileSessions.delete(mobileSession.token);
    return null;
  }
  return user;
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

app.post('/api/auth/sign-in', async (request, response, next) => {
  try {
    const { email, password } = signInSchema.parse(request.body);
    const existing = users.get(email.toLowerCase());
    if (!existing) return response.json({ isNewUser: true, draft: { name: '', email: email.toLowerCase() } });
    const account = findPortalAccountByEmail(email);
    if (account?.status === 'suspended') return response.status(403).json({ message: 'This account is suspended.' });
    if (!passwordMatches(email, password)) return response.status(401).json({ message: 'Invalid email or password.' });
    const token = createMobileSession(existing.id);
    await persistDatabase(persistedCollections);
    response.json({ isNewUser: false, token, user: existing });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/web-sign-in', async (request, response, next) => {
  try {
    const { email, password } = signInSchema.parse(request.body);
    const normalizedEmail = email.toLowerCase();
    let account = findPortalAccountByEmail(normalizedEmail);
    let user = users.get(normalizedEmail);

    if (!account) return response.status(401).json({ message: 'No account was found. Create your account in the novo app first.' });

    if (account.status === 'suspended') return response.status(403).json({ message: 'This account is suspended.' });
    if (!passwordMatches(normalizedEmail, password)) return response.status(401).json({ message: 'Invalid email or password.' });
    const session = createWebSession(account);
    const privileged = account.role !== 'member';
    const handoffToken = !privileged && user ? createMobileHandoff(user.id) : undefined;
    await persistDatabase(persistedCollections);
    response.json({ token: session.token, account, role: account.role, destination: privileged ? 'operations' : 'member-web', handoffToken, member: privileged ? undefined : user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/sign-out', async (request, response, next) => {
  try {
    const authorization = request.header('authorization');
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    if (token) {
      webSessions.delete(token);
      mobileSessions.delete(token);
    }
    await persistDatabase(persistedCollections);
    response.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/auth/session', async (request, response, next) => {
  try {
    const session = sessionFromRequest(request);
    if (!session) return response.status(401).json({ message: 'Session expired.' });
    const account = portalAccounts.get(session.accountId);
    if (!account) return response.status(404).json({ message: 'Account not found.' });
    const privileged = account.role !== 'member';
    const user = findUser(account.id);
    const handoffToken = !privileged && user ? createMobileHandoff(user.id) : undefined;
    if (handoffToken) await persistDatabase(persistedCollections);
    response.json({ account, role: account.role, destination: privileged ? 'operations' : 'member-web', handoffToken, member: privileged ? undefined : user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/mobile-handoff/exchange', async (request, response, next) => {
  try {
    const { handoffToken } = handoffExchangeSchema.parse(request.body);
    const handoff = mobileHandoffs.get(handoffToken);
    if (!handoff || handoff.consumed || handoff.expiresAt <= Date.now()) return response.status(401).json({ message: 'This sign-in handoff has expired.' });
    const user = findUser(handoff.userId);
    if (!user) return response.status(404).json({ message: 'Account not found.' });
    handoff.consumed = true;
    const token = createMobileSession(user.id);
    await persistDatabase(persistedCollections);
    response.json({ isNewUser: false, token, user });
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
    const token = createMobileSession(user.id);
    await persistDatabase(persistedCollections);
    response.json({ isNewUser: false, token, user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/onboarding', async (request, response, next) => {
  try {
    const input = onboardingSchema.parse(request.body);
    const user: User = {
      id: crypto.randomUUID(),
      name: input.name,
      email: input.email.toLowerCase(),
      mascotName: input.mascotName,
      mascotType: 'polar-bear',
      wristbandColor: 'snowy-white',
      wristbandPaired: false,
      wristbandPickupLocation: null,
      accessories: ['bright-star'],
      equippedAccessories: ['bright-star'],
      friendIds: [],
      notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true },
      streak: 0,
      points: 0,
      lifetimePoints: 0,
      lastWristbandTapAt: null,
      questBoardDate: null,
      dailyQuests: [],
      coupons: [],
    };
    users.set(user.email, user);
    portalAccounts.set(user.id, { id: user.id, name: user.name, email: user.email, role: 'member', status: 'active' });
    const token = createMobileSession(user.id);
    await persistDatabase(persistedCollections);
    response.status(201).json({ isNewUser: false, token, user });
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
    needsWristbandTap: !user.lastWristbandTapAt || singaporeDate(user.lastWristbandTapAt) !== today,
    questBoardDate: user.questBoardDate,
    quests: user.dailyQuests,
  });
});

app.post('/api/member/wristband/reserve', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    if (user.wristbandPaired) return response.status(409).json({ message: 'This account already has a paired wristband.' });
    const { pickupLocation } = pickupReservationSchema.parse(request.body);
    user.wristbandPickupLocation = pickupLocation;
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/wristband/pair', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { tagToken, pickupLocation } = pairSchema.parse(request.body);
    const tag = findNfcTag(tagToken);
    if (!tag) return response.status(404).json({ message: 'This novo tag has not been prepared by staff.' });
    if (tag.pairedUserId && tag.pairedUserId !== user.id) return response.status(409).json({ message: 'This wristband is already paired to another account.' });
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
    user.wristbandPaired = true;
    user.wristbandColor = tag.wristbandColor;
    user.mascotType = tag.mascotType;
    user.wristbandPickupLocation = pickupLocation ?? user.wristbandPickupLocation;
    response.json({ user, daily: { scannedToday: false, questsRefreshed: false } });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/wristband/interact', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { tagToken } = pairSchema.parse(request.body);
    const tag = findNfcTag(tagToken);
    if (!tag || tag.pairedUserId !== user.id || tag.status !== 'paired') return response.status(403).json({ message: 'Tap the wristband paired to this account.' });
    const daily = applyDailyWristbandTap(user);
    response.json({ user, daily });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/accessories/redeem', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    redeemSchema.parse(request.body);
    response.status(410).json({ message: 'Physical accessory QR pairing has retired. Accessories now unlock instantly in the marketplace.' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/accessories/equip', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const { accessoryId } = memberAccessorySchema.parse(request.body);
    if (!user.accessories.includes(accessoryId)) return response.status(403).json({ message: 'Unlock this digital accessory in the marketplace before equipping it.' });
    user.equippedAccessories = user.equippedAccessories.includes(accessoryId)
      ? user.equippedAccessories.filter((id) => id !== accessoryId)
      : [...user.equippedAccessories, accessoryId];
    response.json({ user });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/wristband/unpair', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  user.wristbandPaired = false;
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
  response.json({ quests: user.dailyQuests, events, submissions: [...submissions.values()].filter((submission) => submission.userId === user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(memberSubmission), weeklyCompetition: weeklyCompetitionView(user) });
});

app.post('/api/member/weekly/start', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const challenge = weeklyChallenge();
  const entryId = `${challenge.weekId}:${user.id}`;
  if (!weeklyEntries.has(entryId)) weeklyEntries.set(entryId, { id: entryId, weekId: challenge.weekId, userId: user.id, startedAt: new Date().toISOString(), completedAt: null, elapsedMs: null, pointsAwarded: 0, correct: false });
  response.json({ weeklyCompetition: weeklyCompetitionView(user) });
});

app.post('/api/member/weekly/complete', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const challenge = weeklyChallenge();
    const entry = weeklyEntries.get(`${challenge.weekId}:${user.id}`);
    if (!entry) return response.status(409).json({ message: 'Start this week’s sprint before submitting answers.' });
    if (entry.completedAt) return response.status(409).json({ message: 'You have already completed this week’s sprint.' });
    const elapsedMs = Date.now() - Date.parse(entry.startedAt);
    if (elapsedMs > challenge.durationSeconds * 1000) return response.status(408).json({ message: 'Time is up. A new competition opens next week.' });
    const { answers } = weeklySubmissionSchema.parse(request.body);
    if (!answers.every((answer, index) => answer === challenge.questions[index]?.answerIndex)) return response.status(422).json({ message: 'Not all answers are correct yet. Check your choices while the timer is running.' });
    entry.completedAt = new Date().toISOString();
    entry.elapsedMs = elapsedMs;
    entry.correct = true;
    const rankedEntries = [...weeklyEntries.values()].filter((item) => item.weekId === challenge.weekId && item.completedAt && item.correct && item.elapsedMs !== null).sort((left, right) => (left.elapsedMs ?? Infinity) - (right.elapsedMs ?? Infinity));
    rankedEntries.forEach((rankedEntry, index) => {
      const desiredPoints = [300, 220, 160, 120, 90][index] ?? 60;
      const difference = desiredPoints - rankedEntry.pointsAwarded;
      if (!difference) return;
      const member = findUser(rankedEntry.userId);
      if (member) {
        member.points = Math.max(0, member.points + difference);
        member.lifetimePoints = Math.max(0, member.lifetimePoints + difference);
      }
      rankedEntry.pointsAwarded = desiredPoints;
    });
    response.json({ weeklyCompetition: weeklyCompetitionView(user), user });
  } catch (error) {
    next(error);
  }
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
    const photoFingerprint = fingerprintPhoto(input.photoDataUrl);
    if ([...submissions.values()].some((item) => item.photoFingerprint === photoFingerprint)) return response.status(409).json({ message: 'This camera image has already been submitted.' });
    const analysis = await analyzeSubmission(input.photoDataUrl, `${input.title}. Member evidence: ${input.description}`);
    if (analysis.embedding && [...submissions.values()].some((item) => embeddingSimilarity(item.photoEmbedding, analysis.embedding) >= 0.985)) return response.status(409).json({ message: 'This photo is too similar to evidence already submitted.' });
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
      photoFingerprint,
      photoEmbedding: analysis.embedding,
    };
    if (awardedPoints) {
      user.points += awardedPoints;
      user.lifetimePoints += awardedPoints;
    }
    submissions.set(submission.id, submission);
    response.status(201).json({ submission: memberSubmission(submission), user, automated: analysis.accepted });
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
    const photoFingerprint = fingerprintPhoto(input.photoDataUrl);
    if ([...submissions.values()].some((item) => item.photoFingerprint === photoFingerprint)) return response.status(409).json({ message: 'This camera image has already been submitted.' });
    const analysis = await analyzeSubmission(input.photoDataUrl, `${quest.title}. ${quest.description} Member evidence: ${input.description}`);
    if (analysis.embedding && [...submissions.values()].some((item) => embeddingSimilarity(item.photoEmbedding, analysis.embedding) >= 0.985)) return response.status(409).json({ message: 'This photo is too similar to evidence already submitted.' });
    const awardedPoints = analysis.accepted ? quest.points : null;
    const submission: Submission = { id: `sub_${crypto.randomUUID()}`, userId: user.id, task: quest.title, note: input.description, photoDataUrl: input.photoDataUrl, status: analysis.accepted ? 'approved' : 'pending', points: awardedPoints, aiConfidence: analysis.confidence, aiLabel: analysis.label, aiAccepted: analysis.accepted, aiDetections: analysis.detections, aiProcessingMs: analysis.processingMs, aiSummary: analysis.summary, aiDecisionReason: analysis.decisionReason, aiModel: analysis.model, createdAt: new Date().toISOString(), rewardApplied: Boolean(awardedPoints), photoFingerprint, photoEmbedding: analysis.embedding, questId: quest.id, questBoardDate: user.questBoardDate };
    if (awardedPoints) {
      user.points += awardedPoints;
      user.lifetimePoints += awardedPoints;
      quest.completed = true;
    }
    submissions.set(submission.id, submission);
    response.status(201).json({ submission: memberSubmission(submission), user, automated: analysis.accepted });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/tasks/:questId/quiz', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const quest = user.dailyQuests.find((item) => item.id === routeParam(request.params.questId));
    if (!quest || quest.kind !== 'video-quiz' || !quest.lesson) return response.status(404).json({ message: 'This knowledge check is not on today’s quest board.' });
    if (quest.completed) return response.status(409).json({ message: 'This lesson has already been completed today.' });
    const { answer } = quizSubmissionSchema.parse(request.body);
    if (answer !== quest.lesson.options[0]) return response.status(422).json({ message: 'Not quite. Rewatch the lesson and try the knowledge check again.' });
    quest.completed = true;
    user.points += quest.points;
    user.lifetimePoints += quest.points;
    const submission: Submission = { id: `sub_${crypto.randomUUID()}`, userId: user.id, task: quest.title, note: `Knowledge check: ${answer}`, photoDataUrl: '', status: 'approved', points: quest.points, aiConfidence: 1, aiLabel: 'knowledge-check', aiAccepted: true, aiDetections: [], aiProcessingMs: null, aiSummary: 'The member completed the knowledge check successfully.', aiDecisionReason: 'The submitted answer matched the correct response.', aiModel: 'knowledge-check', createdAt: new Date().toISOString(), rewardApplied: true, photoFingerprint: '', photoEmbedding: null, questId: quest.id, questBoardDate: user.questBoardDate };
    submissions.set(submission.id, submission);
    response.status(201).json({ submission: memberSubmission(submission), user, automated: true });
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
    .map((member, index) => ({ rank: index + 1, id: member.id, name: member.name, mascotName: member.mascotName, mascotType: member.mascotType, lifetimePoints: member.lifetimePoints, accessories: member.equippedAccessories, isCurrentUser: member.id === user.id }));
  response.json({ leaders });
});

app.get('/api/member/friends', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  const friends = user.friendIds.map(findUser).filter((friend): friend is User => Boolean(friend)).map((friend) => ({ id: friend.id, name: friend.name, mascotName: friend.mascotName, mascotType: friend.mascotType, lifetimePoints: friend.lifetimePoints, accessories: friend.equippedAccessories }));
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

app.get('/api/locations', async (request, response, next) => {
  try {
    const directory = await getReturnRightDirectory({ offline: process.env.NOVO_RETURN_RIGHT_DIRECTORY_OFFLINE === '1' });
    const allLocations = [...verifiedLocations, ...directory.locations];
    const kind = typeof request.query.kind === 'string' ? request.query.kind : '';
    const locations = kind ? allLocations.filter((location) => location.kind === kind) : allLocations;
    response.json({ locations, total: locations.length, returnRightTotal: directory.locations.length, updatedAt: directory.updatedAt, source: directory.source, liveReturnRightUrl: 'https://returnright.sg/p/find-my-nearest-rvm' });
  } catch (error) {
    next(error);
  }
});

app.get('/api/member/wristband/pickup-locations', async (request, response, next) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  try {
    const directory = await getLockerDirectory({ offline: process.env.NOVO_LOCKER_DIRECTORY_OFFLINE === '1' });
    const query = typeof request.query.q === 'string' ? request.query.q : '';
    const provider = typeof request.query.provider === 'string' ? request.query.provider.toLowerCase() : undefined;
    const lockers = searchLockerDirectory(directory.lockers, query, provider);
    response.json({ lockers, total: lockers.length, directoryTotal: directory.lockers.length, sourceCounts: directory.sourceCounts, updatedAt: directory.updatedAt });
  } catch (error) {
    next(error);
  }
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
    const { accessoryId } = memberPurchaseSchema.parse(request.body);
    const listing = [...marketItems.values()].find((item) => item.active && item.category === 'accessory' && (item.accessoryId === accessoryId || inferAccessoryId(item.id, item.name) === accessoryId));
    const price = listing?.price ?? memberRewards[accessoryId];
    if (!price) return response.status(404).json({ message: 'This reward is not currently available.' });
    if (user.accessories.includes(accessoryId)) return response.status(409).json({ message: 'This reward is already in your wardrobe.' });
    if (user.points < price) return response.status(409).json({ message: 'You need more leaves for this reward.' });
    user.points -= price;
    user.accessories.push(accessoryId);
    user.equippedAccessories = Array.from(new Set([...user.equippedAccessories, accessoryId]));
    response.json({ user, price, unlocked: accessoryId });
  } catch (error) {
    next(error);
  }
});

app.get('/api/member/market', (request, response) => {
  const user = memberFromRequest(request);
  if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
  response.json({ items: [...marketItems.values()].filter((item) => item.active).sort((left, right) => left.category.localeCompare(right.category) || left.price - right.price) });
});

app.post('/api/member/charity/contribute', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const requested = contributionSchema.parse(request.body);
    const listing = marketItems.get(requested.causeId);
    const points = listing?.active && listing.category === 'charity' ? listing.price : requested.points;
    const causeId = listing?.active && listing.category === 'charity' ? listing.id : requested.causeId;
    const causeName = listing?.active && listing.category === 'charity' ? listing.name : requested.causeName;
    if (user.points < points) return response.status(409).json({ message: 'You need more leaves to contribute.' });
    user.points -= points;
    const contribution: Donation = { id: `don_${crypto.randomUUID()}`, userId: user.id, causeId, causeName, points, createdAt: new Date().toISOString() };
    donations.set(contribution.id, contribution);
    response.json({ user, contribution });
  } catch (error) {
    next(error);
  }
});

app.post('/api/member/market/coupon/redeem', (request, response, next) => {
  try {
    const user = memberFromRequest(request);
    if (!user) return response.status(401).json({ message: 'Member sign-in required.' });
    const requested = couponSchema.parse(request.body);
    const listing = marketItems.get(requested.offerId);
    const offerId = listing?.active && listing.category === 'coupon' ? listing.id : requested.offerId;
    const name = listing?.active && listing.category === 'coupon' ? listing.name : requested.name;
    const points = listing?.active && listing.category === 'coupon' ? listing.price : requested.points;
    if (user.coupons.some((coupon) => coupon.offerId === offerId)) return response.status(409).json({ message: 'This coupon is already in your rewards wallet.' });
    if (user.points < points) return response.status(409).json({ message: 'You need more leaves to redeem this coupon.' });
    user.points -= points;
    const coupon: RedeemedCoupon = { id: `coupon_${crypto.randomUUID()}`, offerId, name, code: `NOVO-${randomBytes(4).toString('hex').toUpperCase()}`, redeemedAt: new Date().toISOString() };
    user.coupons.push(coupon);
    response.json({ user, coupon });
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
      checkedInUserIds: [],
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
    const { tagToken } = checkInSchema.parse(request.body);
    const tag = findNfcTag(tagToken);
    if (!tag || tag.status !== 'paired' || !tag.pairedUserId) return response.status(404).json({ message: 'This is not an active paired Novo wristband.' });
    const attendeeId = tag.pairedUserId;
    const event = portalEvents.get(routeParam(request.params.eventId));
    if (!event) return response.status(404).json({ message: 'Event not found.' });
    if (!event.attendees.includes(attendeeId)) return response.status(403).json({ message: 'This wristband owner is not registered for this event.' });
    if (event.checkedInUserIds.includes(attendeeId)) return response.status(409).json({ message: 'This wristband has already completed attendance for this event.' });
    event.attendees = Array.from(new Set([...event.attendees, attendeeId]));
    event.checkedInUserIds.push(attendeeId);
    const member = findUser(attendeeId);
    if (member) { member.points += event.points; member.lifetimePoints += event.points; }
    response.json({ event, attendee: member ? { id: member.id, name: member.name, mascotName: member.mascotName } : { id: attendeeId }, pointsAwarded: event.points });
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
    const { label, wristbandColor } = provisionTagSchema.parse(request.body);
    const session = sessionFromRequest(request);
    const tag: NfcTag = {
      id: `nfc_${crypto.randomUUID()}`,
      token: randomBytes(32).toString('base64url'),
      label,
      wristbandColor,
      mascotType: WRISTBAND_MASCOTS[wristbandColor],
      createdBy: session?.accountId ?? `development-${response.locals.portalRole}`,
      createdAt: new Date().toISOString(),
      pairedUserId: null,
      pairedAt: null,
      status: 'ready',
    };
    nfcTags.set(tag.id, tag);
    response.status(201).json({ tag, ndefUrl: `novo://wristband/${tag.token}` });
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
    if (user) user.wristbandPaired = false;
  }
  tag.pairedUserId = null;
  tag.pairedAt = null;
  response.json({ tag });
});

app.patch('/api/portal/nfc-tags/:tagId', requirePortalRole('staff', 'admin'), (request, response, next) => {
  try {
    const tag = nfcTags.get(routeParam(request.params.tagId));
    if (!tag) return response.status(404).json({ message: 'NFC tag not found.' });
    const changes = z.object({ label: z.string().trim().min(2).max(80), wristbandColor: wristbandColorSchema.optional() }).parse(request.body);
    tag.label = changes.label;
    if (changes.wristbandColor) { tag.wristbandColor = changes.wristbandColor; tag.mascotType = WRISTBAND_MASCOTS[changes.wristbandColor]; }
    response.json({ tag });
  } catch (error) { next(error); }
});

app.delete('/api/portal/nfc-tags/:tagId', requirePortalRole('staff', 'admin'), (request, response) => {
  const tag = nfcTags.get(routeParam(request.params.tagId));
  if (!tag) return response.status(404).json({ message: 'NFC tag not found.' });
  if (tag.status === 'paired') return response.status(409).json({ message: 'Retire a paired wristband tag before deleting it.' });
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
  const accounts = [...portalAccounts.values()]
    .map(accountView)
    .sort((left, right) => left.name.localeCompare(right.name));
  response.json({ accounts });
});

app.post('/api/portal/accounts', requirePortalRole('admin'), (request, response, next) => {
  try {
    const input = accountCreateSchema.parse(request.body);
    if (findPortalAccountByEmail(input.email)) return response.status(409).json({ message: 'An account with this email already exists.' });
    const { password, points, lifetimePoints, streak, mascotName, ...accountInput } = input;
    const account: PortalAccount = { id: `account_${crypto.randomUUID()}`, ...accountInput, email: input.email.toLowerCase() };
    portalAccounts.set(account.id, account);
    credentials.set(account.email, createCredential(account.email, password));
    if (account.role === 'member') {
      users.set(account.email, {
        id: account.id,
        name: account.name,
        email: account.email,
        mascotName,
        mascotType: 'polar-bear',
        wristbandColor: 'snowy-white',
        wristbandPaired: false,
        wristbandPickupLocation: null,
        accessories: [],
        equippedAccessories: [],
        friendIds: [],
        notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true },
        streak,
        points,
        lifetimePoints: Math.max(points, lifetimePoints),
        lastWristbandTapAt: null,
        questBoardDate: null,
        dailyQuests: [],
        coupons: [],
      });
    }
    response.status(201).json({ account: accountView(account) });
  } catch (error) { next(error); }
});

app.patch('/api/portal/accounts/:accountId', requirePortalRole('admin'), (request, response, next) => {
  try {
    const changes = accountPatchSchema.parse(request.body);
    const account = portalAccounts.get(routeParam(request.params.accountId));
    if (!account) return response.status(404).json({ message: 'Account not found.' });
    if (changes.email && changes.email.toLowerCase() !== account.email.toLowerCase() && findPortalAccountByEmail(changes.email)) return response.status(409).json({ message: 'An account with this email already exists.' });
    const activeSession = sessionFromRequest(request);
    if (activeSession?.accountId === account.id && ((changes.role && changes.role !== 'admin') || (changes.status && changes.status !== 'active'))) {
      return response.status(409).json({ message: 'You cannot remove access from the administrator account currently in use.' });
    }

    const previousEmail = account.email.toLowerCase();
    const { password, points, lifetimePoints, streak, mascotName, ...accountChanges } = changes;
    Object.assign(account, accountChanges);
    account.email = account.email.toLowerCase();
    let member = findUser(account.id);
    if (account.role === 'member' && !member) {
      member = {
        id: account.id,
        name: account.name,
        email: account.email,
        mascotName: mascotName ?? 'Nova',
        mascotType: 'polar-bear',
        wristbandColor: 'snowy-white',
        wristbandPaired: false,
        wristbandPickupLocation: null,
        accessories: [],
        equippedAccessories: [],
        friendIds: [],
        notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true },
        streak: streak ?? 0,
        points: points ?? 0,
        lifetimePoints: Math.max(points ?? 0, lifetimePoints ?? 0),
        lastWristbandTapAt: null,
        questBoardDate: null,
        dailyQuests: [],
        coupons: [],
      };
      users.set(account.email, member);
    } else if (member) {
      users.delete(member.email.toLowerCase());
      member.name = account.name;
      member.email = account.email;
      if (points !== undefined) member.points = points;
      member.lifetimePoints = Math.max(member.points, lifetimePoints ?? member.lifetimePoints);
      if (streak !== undefined) member.streak = streak;
      if (mascotName !== undefined) member.mascotName = mascotName;
      users.set(member.email, member);
    }

    const existingCredential = credentials.get(previousEmail);
    if (previousEmail !== account.email) {
      credentials.delete(previousEmail);
      if (existingCredential) credentials.set(account.email, { ...existingCredential, email: account.email });
    }
    if (password) credentials.set(account.email, createCredential(account.email, password));

    if (password || changes.role || changes.status) {
      for (const [token, session] of webSessions) if (session.accountId === account.id && token !== request.header('authorization')?.replace(/^Bearer /, '')) webSessions.delete(token);
      for (const [token, session] of mobileSessions) if (session.userId === account.id) mobileSessions.delete(token);
      for (const [token, handoff] of mobileHandoffs) if (handoff.userId === account.id) mobileHandoffs.delete(token);
    }
    response.json({ account: accountView(account) });
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
  if (member) {
    users.delete(member.email.toLowerCase());
    for (const other of users.values()) other.friendIds = other.friendIds.filter((friendId) => friendId !== accountId);
    for (const [id, submission] of submissions) if (submission.userId === accountId) submissions.delete(id);
    for (const [id, order] of fulfillmentOrders) if (order.userId === accountId) fulfillmentOrders.delete(id);
    for (const [id, donation] of donations) if (donation.userId === accountId) donations.delete(id);
    for (const event of portalEvents.values()) {
      event.attendees = event.attendees.filter((userId) => userId !== accountId);
      event.checkedInUserIds = event.checkedInUserIds.filter((userId) => userId !== accountId);
    }
    for (const tag of nfcTags.values()) if (tag.pairedUserId === accountId) { tag.pairedUserId = null; tag.pairedAt = null; tag.status = 'ready'; }
    for (const tag of accessoryQrTags.values()) if (tag.pairedUserId === accountId) { tag.pairedUserId = null; tag.pairedAt = null; tag.status = 'ready'; }
  }
  credentials.delete(account.email.toLowerCase());
  for (const [token, value] of webSessions) if (value.accountId === accountId) webSessions.delete(token);
  for (const [token, value] of mobileSessions) if (value.userId === accountId) mobileSessions.delete(token);
  for (const [token, value] of mobileHandoffs) if (value.userId === accountId) mobileHandoffs.delete(token);
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
