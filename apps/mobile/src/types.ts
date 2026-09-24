export type Screen = 'signin' | 'onboarding' | 'pair-plushie' | 'home' | 'scan-accessory';

export type DailyQuest = { id: string; title: string; description: string; points: number; completed: boolean; sourceAccessoryId?: AccessoryId; sourceAccessoryName?: string };

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
export type LeaderboardEntry = { rank: number; id: string; name: string; plushieName: string; lifetimePoints: number; accessories: AccessoryId[]; isCurrentUser: boolean };
export type Friend = { id: string; name: string; plushieName: string; lifetimePoints: number; accessories: AccessoryId[] };

export type AuthResult = {
  isNewUser: boolean;
  token?: string;
  user?: User;
  draft?: Pick<User, 'name' | 'email'>;
};
