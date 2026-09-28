export type Screen = 'signin' | 'onboarding' | 'pair-wristband' | 'home' | 'account-status';
export type AccountStatus = 'active' | 'limited' | 'suspended';

export type WristbandColor = 'snowy-white' | 'charcoal-black' | 'sunset-orange' | 'tropical-green' | 'ocean-blue';
export type MascotType = 'polar-bear' | 'penguin' | 'fox' | 'turtle' | 'bird';

export type DailyQuest = { id: string; title: string; description: string; points: number; completed: boolean; kind?: 'photo' | 'video-quiz'; lesson?: { title: string; summary: string; question: string; options: string[] } };
export type RedeemedCoupon = { id: string; offerId: string; name: string; code: string; redeemedAt: string };

export type AccessoryId =
  | 'bright-star'
  | 'sunny-cap'
  | 'petal-pin'
  | 'trail-scarf'
  | 'cloud-mitts'
  | 'meadow-socks'
  | 'tide-loop';

export type AccessoryCategory = 'badges' | 'hats' | 'scarves' | 'mitts' | 'socks' | 'bracelets';
export type AccessoryRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type Accessory = {
  id: AccessoryId;
  name: string;
  description: string;
  color: string;
  code: string;
  category: AccessoryCategory;
  rarity: AccessoryRarity;
};

export type User = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarDataUrl: string | null;
  linkedAccounts: Array<{ provider: OAuthProvider; subject: string; email: string }>;
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

export type OAuthProvider = 'google' | 'discord' | 'microsoft';

export type NotificationPreferences = { dailyGreeting: boolean; tasks: boolean; events: boolean; friends: boolean; orders: boolean };

export type NovoLocation = {
  id: string;
  kind: 'pick-locker' | 'singpost-locker' | 'return-right';
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  hours: string;
  sourceUrl: string;
  distanceKm?: number;
};

export type NovoEvent = {
  id: string;
  title: string;
  location: string;
  startsAt: string;
  durationMinutes: number;
  capacity: number | null;
  points: number;
  attending: number;
  registered: boolean;
  status: 'live' | 'scheduled';
  latitude: number | null;
  longitude: number | null;
};

export type TaskSubmission = { id: string; task: string; note: string; status: 'pending' | 'approved' | 'changes_requested'; points: number | null; aiConfidence: number | null; createdAt: string };
export type MarketItem = { id: string; name: string; category: 'accessory' | 'charity' | 'coupon'; price: number; stock: number | null; description: string; imageDataUrl: string | null; accessoryId: AccessoryId | null };
export type WeeklyCompetition = {
  id: string;
  weekId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  durationSeconds: number;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
  entry: { startedAt: string; completedAt: string | null; elapsedMs: number | null; pointsAwarded: number; rank: number | null } | null;
  leaderboard: Array<{ rank: number; name: string; elapsedMs: number; points: number; isCurrentUser: boolean }>;
};
export type LeaderboardEntry = { rank: number; id: string; name: string; mascotName: string; mascotType: MascotType; lifetimePoints: number; accessories: AccessoryId[]; isCurrentUser: boolean };
export type Friend = { id: string; name: string; mascotName: string; mascotType: MascotType; lifetimePoints: number; accessories: AccessoryId[] };

export type AuthResult = {
  isNewUser: boolean;
  accountStatus?: AccountStatus;
  token?: string;
  user?: User;
  draft?: Pick<User, 'name' | 'email'>;
};
