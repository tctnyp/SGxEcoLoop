import { closeDatabase, databasePath, initializeDatabase, PersistedCollections, resetDatabase } from './database.js';

type AccessoryId = 'bright-star' | 'sunny-cap' | 'petal-pin' | 'trail-scarf' | 'cloud-mitts' | 'meadow-socks' | 'tide-loop';
type DailyQuest = { id: string; title: string; description: string; points: number; completed: boolean; sourceAccessoryId?: AccessoryId; sourceAccessoryName?: string };
type DemoMember = {
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
  notificationPreferences: { dailyGreeting: boolean; tasks: boolean; events: boolean; friends: boolean; orders: boolean };
  streak: number;
  points: number;
  lifetimePoints: number;
  lastPlushieScanAt: string | null;
  questBoardDate: string | null;
  dailyQuests: DailyQuest[];
};

const now = new Date();
const iso = (daysFromToday = 0, hour = 10, minute = 0) => {
  const value = new Date(now);
  value.setDate(value.getDate() + daysFromToday);
  value.setHours(hour, minute, 0, 0);
  return value.toISOString();
};
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
const singaporeDate = (value = now) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
};
const evidence = (title: string, color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="#eef3e9"/><rect x="90" y="95" width="780" height="450" rx="42" fill="${color}"/><circle cx="260" cy="300" r="95" fill="#fff" opacity=".88"/><rect x="430" y="205" width="310" height="46" rx="23" fill="#fff" opacity=".92"/><rect x="430" y="280" width="230" height="28" rx="14" fill="#fff" opacity=".72"/><rect x="430" y="335" width="270" height="28" rx="14" fill="#fff" opacity=".72"/><text x="480" y="500" text-anchor="middle" font-family="Arial" font-size="32" font-weight="700" fill="#17352a">${title}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
};

const today = singaporeDate();
const questSet = (prefix: string, completed = false, accessory?: { id: AccessoryId; name: string; title: string; description: string }): DailyQuest[] => [
  accessory ? { id: `${prefix}-wear`, title: accessory.title, description: accessory.description, points: 30, completed, sourceAccessoryId: accessory.id, sourceAccessoryName: accessory.name } : { id: `${prefix}-refill`, title: 'Refill before buying', description: 'Use a reusable bottle or cup today.', points: 20, completed },
  { id: `${prefix}-sort`, title: 'Sort one recycling load', description: 'Separate clean recyclables from general waste.', points: 30, completed: false },
  { id: `${prefix}-return`, title: 'Return a drink container', description: 'Use an official Return Right point for an eligible container.', points: 25, completed: false },
];

// Every member has 10,000 spendable leaves. The complete in-app accessory drop costs
// 1,300 leaves, leaving ample balance for charity contributions during a demo.
const members: DemoMember[] = [
  { id: 'member_amira', name: 'Amira Tan', email: 'amira.tan@demo.novo.sg', plushieName: 'Kiko', plushieType: 'Natural calico bear', plushiePaired: true, accessories: ['bright-star', 'petal-pin'], pendingAccessories: ['trail-scarf'], equippedAccessories: ['bright-star', 'petal-pin'], friendIds: ['member_devan', 'member_meilin'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 18, points: 10_000, lifetimePoints: 18_650, lastPlushieScanAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('amira', true, { id: 'bright-star', name: 'Bright star', title: 'Share one bright idea', description: 'Help someone nearby sort an item into the correct waste stream.' }) },
  { id: 'member_devan', name: 'Devan Nair', email: 'devan.nair@demo.novo.sg', plushieName: 'Pip', plushieType: 'Natural calico bear', plushiePaired: true, accessories: ['bright-star', 'trail-scarf'], pendingAccessories: [], equippedAccessories: ['trail-scarf'], friendIds: ['member_amira'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 11, points: 10_000, lifetimePoints: 14_820, lastPlushieScanAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('devan', false, { id: 'trail-scarf', name: 'Trail scarf', title: 'Repair a textile', description: 'Mend or repurpose a small fabric item instead of discarding it.' }) },
  { id: 'member_meilin', name: 'Mei Lin Goh', email: 'meilin.goh@demo.novo.sg', plushieName: 'Sunny', plushieType: 'Natural calico bear', plushiePaired: true, accessories: ['bright-star', 'sunny-cap', 'meadow-socks'], pendingAccessories: [], equippedAccessories: ['sunny-cap', 'meadow-socks'], friendIds: ['member_amira', 'member_haris'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 27, points: 10_000, lifetimePoints: 22_410, lastPlushieScanAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('meilin', true, { id: 'sunny-cap', name: 'Sunny cap', title: 'Outdoor litter spot', description: 'Collect five safe pieces of litter while enjoying an outdoor walk.' }) },
  { id: 'member_haris', name: 'Haris Rahman', email: 'haris.rahman@demo.novo.sg', plushieName: 'Milo', plushieType: 'Natural calico bear', plushiePaired: true, accessories: ['bright-star', 'cloud-mitts', 'tide-loop'], pendingAccessories: [], equippedAccessories: ['cloud-mitts', 'tide-loop'], friendIds: ['member_meilin'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 8, points: 10_000, lifetimePoints: 11_760, lastPlushieScanAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('haris', false, { id: 'cloud-mitts', name: 'Cloud mitts', title: 'Clean before recycling', description: 'Rinse and dry today’s recyclable containers before sorting them.' }) },
];

const users = new Map(members.map((member) => [member.email, member]));
const portalAccounts = new Map<string, unknown>([
  ...members.map((member) => [member.id, { id: member.id, name: member.name, email: member.email, role: 'member', status: 'active' }] as [string, unknown]),
  ['admin_nadia', { id: 'admin_nadia', name: 'Nadia Lim', email: 'admin@demo.novo.sg', role: 'admin', status: 'active' }],
  ['staff_wei', { id: 'staff_wei', name: 'Wei Ming Lee', email: 'staff@demo.novo.sg', role: 'staff', status: 'active' }],
  ['organizer_siti', { id: 'organizer_siti', name: 'Siti Aisyah', email: 'organizer@demo.novo.sg', role: 'organizer', status: 'active' }],
]);

const portalEvents = new Map<string, unknown>([
  ['evt_live_marina', { id: 'evt_live_marina', organizerId: 'organizer_siti', title: 'Marina Bay lunchtime litter walk', location: 'Marina Bay, Singapore', startsAt: minutesAgo(30), durationMinutes: 120, capacity: 50, points: 90, attendees: ['member_amira', 'member_haris'], status: 'open', latitude: 1.2834, longitude: 103.8607 }],
  ['evt_bishan', { id: 'evt_bishan', organizerId: 'organizer_siti', title: 'Bishan–Ang Mo Kio Park clean-up', location: 'Bishan–Ang Mo Kio Park, River Plains', startsAt: iso(3, 9), durationMinutes: 90, capacity: 40, points: 160, attendees: ['member_amira', 'member_devan', 'member_meilin'], status: 'open', latitude: 1.3646, longitude: 103.8464 }],
  ['evt_tampines', { id: 'evt_tampines', organizerId: 'organizer_siti', title: 'Tampines repair café', location: 'Our Tampines Hub, Singapore 528523', startsAt: iso(8, 14), durationMinutes: 180, capacity: null, points: 220, attendees: ['member_haris'], status: 'open', latitude: 1.3520, longitude: 103.9402 }],
  ['evt_east_coast', { id: 'evt_east_coast', organizerId: 'organizer_siti', title: 'East Coast shoreline sort', location: 'East Coast Park, Area C', startsAt: iso(-12, 8), durationMinutes: 120, capacity: 30, points: 180, attendees: ['member_amira', 'member_devan', 'member_meilin', 'member_haris'], status: 'completed', latitude: 1.3008, longitude: 103.9122 }],
  ['evt_queenstown', { id: 'evt_queenstown', organizerId: 'organizer_siti', title: 'Queenstown swap corner', location: 'Queenstown Community Centre', startsAt: iso(15, 11), durationMinutes: 120, capacity: 60, points: 120, attendees: [], status: 'draft', latitude: 1.2997, longitude: 103.8010 }],
]);

const marketItems = new Map<string, unknown>([
  ['market_bright_star', { id: 'market_bright_star', name: 'Bright star', category: 'accessory', price: 180, stock: 80, active: true }],
  ['market_sunny_cap', { id: 'market_sunny_cap', name: 'Sunny cap', category: 'accessory', price: 320, stock: 28, active: true }],
  ['market_petal_pin', { id: 'market_petal_pin', name: 'Petal pin', category: 'accessory', price: 160, stock: 95, active: true }],
  ['market_trail_scarf', { id: 'market_trail_scarf', name: 'Trail scarf', category: 'accessory', price: 460, stock: 16, active: true }],
  ['market_cloud_mitts', { id: 'market_cloud_mitts', name: 'Cloud mitts', category: 'accessory', price: 280, stock: 34, active: true }],
  ['market_meadow_socks', { id: 'market_meadow_socks', name: 'Meadow socks', category: 'accessory', price: 240, stock: 42, active: true }],
  ['market_tide_loop', { id: 'market_tide_loop', name: 'Tide loop', category: 'accessory', price: 520, stock: 10, active: true }],
  ['market_clean_shores', { id: 'market_clean_shores', name: 'Singapore Clean Shores', category: 'charity', price: 100, stock: null, active: true }],
  ['market_food_rescue', { id: 'market_food_rescue', name: 'Neighbourhood Food Rescue', category: 'charity', price: 100, stock: null, active: true }],
]);

const submissions = new Map<string, unknown>([
  ['sub_devan', { id: 'sub_devan', userId: 'member_devan', task: 'Sort a shared recycling point', note: 'Separated cans, bottles, and clean paper at our block recycling corner.', photoDataUrl: evidence('Sorted recycling point', '#8bd3c1'), status: 'pending', points: null, aiConfidence: 0.72, aiLabel: 'sorted recyclable containers', createdAt: iso(0, 8, 35), rewardApplied: false }],
  ['sub_amira', { id: 'sub_amira', userId: 'member_amira', task: 'Bring a reusable lunch kit', note: 'Used my own container and cutlery for lunch instead of disposables.', photoDataUrl: evidence('Reusable lunch kit', '#f4d06f'), status: 'approved', points: 50, aiConfidence: 0.94, aiLabel: 'reusable food container', createdAt: iso(-1, 12, 20), rewardApplied: true }],
  ['sub_meilin', { id: 'sub_meilin', userId: 'member_meilin', task: 'Return drink containers', note: 'Returned eligible containers after our weekend picnic.', photoDataUrl: evidence('Container return', '#8ab6f9'), status: 'changes_requested', points: null, aiConfidence: 0.41, aiLabel: 'containers partially visible', createdAt: iso(-2, 17, 10), rewardApplied: false }],
]);

const nfcTags = new Map<string, unknown>([
  ['tag_kiko', { id: 'tag_kiko', token: 'demo_kiko_7YK9wK3vD2qF8mP6xR4sN1cA', label: 'Demo plushie Kiko · D-001', createdBy: 'staff_wei', createdAt: iso(-60), pairedUserId: 'member_amira', pairedAt: iso(-45), status: 'paired' }],
  ['tag_pip', { id: 'tag_pip', token: 'demo_pip_2mL8qW4sV9bN5kT1yC7rH6zE', label: 'Demo plushie Pip · D-002', createdBy: 'staff_wei', createdAt: iso(-50), pairedUserId: 'member_devan', pairedAt: iso(-38), status: 'paired' }],
  ['tag_sunny', { id: 'tag_sunny', token: 'demo_sunny_9pR3xB7nK5fD1tV8wM4qL2cH', label: 'Demo plushie Sunny · D-003', createdBy: 'admin_nadia', createdAt: iso(-40), pairedUserId: 'member_meilin', pairedAt: iso(-34), status: 'paired' }],
  ['tag_milo', { id: 'tag_milo', token: 'demo_milo_6vF2cJ8sA4nQ9yH3kT7wP5dR', label: 'Demo plushie Milo · D-004', createdBy: 'staff_wei', createdAt: iso(-30), pairedUserId: 'member_haris', pairedAt: iso(-25), status: 'paired' }],
  ['tag_ready', { id: 'tag_ready', token: 'demo_ready_4zN8bC2xL7qW1mV6sK9pR3tF', label: 'Unpaired demo plushie · D-005', createdBy: 'staff_wei', createdAt: iso(-1), pairedUserId: null, pairedAt: null, status: 'ready' }],
]);

const accessoryQrTags = new Map<string, unknown>([
  ['aqr_scarf_ready', { id: 'aqr_scarf_ready', token: 'demo_scarf_QR_7tK2mN9xP4vB6cR8wL1zF5hD', accessoryId: 'trail-scarf', label: 'Trail scarf · A-001', createdBy: 'staff_wei', createdAt: iso(-4), pairedUserId: null, pairedAt: null, status: 'ready' }],
  ['aqr_star_amira', { id: 'aqr_star_amira', token: 'demo_star_QR_2qW8nC4rV7mL1kP5xT9bH6sA', accessoryId: 'bright-star', label: 'Bright star · A-002', createdBy: 'staff_wei', createdAt: iso(-50), pairedUserId: 'member_amira', pairedAt: iso(-45), status: 'paired' }],
]);

const fulfillmentOrders = new Map<string, unknown>([
  ['ord_amira_scarf', { id: 'ord_amira_scarf', userId: 'member_amira', accessoryId: 'trail-scarf', lockerLocation: 'Pick Locker @ Kallang MRT Station · 5 Sims Avenue, Singapore 387405', points: 460, status: 'confirmed', createdAt: iso(-4, 19, 15) }],
  ['ord_haris_mitts', { id: 'ord_haris_mitts', userId: 'member_haris', accessoryId: 'cloud-mitts', lockerLocation: 'POPStation @ General Post Office · 10 Eunos Road 8, Singapore 408600', points: 280, status: 'confirmed', createdAt: iso(-6, 13, 40) }],
]);

const donations = new Map<string, unknown>([
  ['don_meilin', { id: 'don_meilin', userId: 'member_meilin', causeId: 'clean-shores', causeName: 'Singapore Clean Shores', points: 300, createdAt: iso(-3, 20) }],
  ['don_devan', { id: 'don_devan', userId: 'member_devan', causeId: 'food-rescue', causeName: 'Neighbourhood Food Rescue', points: 200, createdAt: iso(-7, 18) }],
]);

const collections = { users, portalAccounts, portalEvents, marketItems, submissions, fulfillmentOrders, donations, nfcTags, accessoryQrTags } as unknown as PersistedCollections;

try {
  await resetDatabase();
  await initializeDatabase(collections);
  await closeDatabase();
  console.log(`Created novo demo database at ${databasePath}`);
  console.log('Demo password: novo2026');
  console.log('Member: amira.tan@demo.novo.sg (10,000 spendable leaves)');
  console.log('Organizer: organizer@demo.novo.sg');
  console.log('Staff: staff@demo.novo.sg');
  console.log('Admin: admin@demo.novo.sg');
  console.log('Restart the server after seeding. This command replaces all existing local data.');
} catch (error) {
  console.error('Could not create the novo demo database.', error);
  process.exitCode = 1;
}
