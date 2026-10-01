import { closeDatabase, databaseTarget, initializeDatabase, PersistedCollections, resetDatabase } from './database.js';
import { randomBytes, scryptSync } from 'node:crypto';

type AccessoryId = 'bright-star' | 'sunny-cap' | 'petal-pin' | 'trail-scarf' | 'cloud-mitts' | 'meadow-socks' | 'tide-loop';
type DailyQuest = { id: string; title: string; description: string; points: number; completed: boolean; sourceAccessoryId?: AccessoryId; sourceAccessoryName?: string };
type DemoMember = {
  id: string;
  name: string;
  email: string;
  mascotName: string;
  mascotType: 'polar-bear' | 'penguin' | 'fox' | 'turtle' | 'bird';
  wristbandColor: 'snowy-white' | 'charcoal-black' | 'sunset-orange' | 'tropical-green' | 'ocean-blue';
  wristbandPaired: boolean;
  wristbandPickupLocation: string | null;
  accessories: AccessoryId[];
  equippedAccessories: AccessoryId[];
  friendIds: string[];
  notificationPreferences: { dailyGreeting: boolean; tasks: boolean; events: boolean; friends: boolean; orders: boolean };
  streak: number;
  points: number;
  lifetimePoints: number;
  lastWristbandTapAt: string | null;
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
const questSet = (prefix: string, completed = false): DailyQuest[] => [
  { id: `${prefix}-reusable`, title: 'Bring a reusable', description: 'Show yourself using a reusable bag, container, cup, or bottle.', points: 30, completed },
  { id: `${prefix}-bcrs`, title: 'Return a BCRS bottle', description: 'Show at least one eligible beverage container being returned through BCRS.', points: 35, completed: false },
  { id: `${prefix}-build`, title: 'Build with recyclables', description: 'Show yourself making a useful product from recyclable materials.', points: 45, completed: false },
];

// Every member has 10,000 spendable leaves. The complete in-app accessory drop costs
// 1,300 leaves, leaving ample balance for charity contributions during a demo.
const members: DemoMember[] = [
  { id: 'member_amira', name: 'Amira Tan', email: 'amira.tan@demo.novo.sg', mascotName: 'Kiko', mascotType: 'polar-bear', wristbandColor: 'snowy-white', wristbandPaired: true, wristbandPickupLocation: 'Pick! Locker @ Kallang MRT Station', accessories: ['bright-star', 'petal-pin', 'trail-scarf'], equippedAccessories: ['bright-star', 'petal-pin'], friendIds: ['member_devan', 'member_meilin'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 18, points: 10_000, lifetimePoints: 18_650, lastWristbandTapAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('amira', true) },
  { id: 'member_devan', name: 'Devan Nair', email: 'devan.nair@demo.novo.sg', mascotName: 'Pip', mascotType: 'penguin', wristbandColor: 'charcoal-black', wristbandPaired: true, wristbandPickupLocation: 'POPStation @ General Post Office', accessories: ['bright-star', 'trail-scarf'], equippedAccessories: ['trail-scarf'], friendIds: ['member_amira'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 11, points: 10_000, lifetimePoints: 14_820, lastWristbandTapAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('devan') },
  { id: 'member_meilin', name: 'Mei Lin Goh', email: 'meilin.goh@demo.novo.sg', mascotName: 'Sunny', mascotType: 'fox', wristbandColor: 'sunset-orange', wristbandPaired: true, wristbandPickupLocation: 'Pick! Locker @ Tampines', accessories: ['bright-star', 'sunny-cap', 'meadow-socks'], equippedAccessories: ['sunny-cap', 'meadow-socks'], friendIds: ['member_amira', 'member_haris'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 27, points: 10_000, lifetimePoints: 22_410, lastWristbandTapAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('meilin', true) },
  { id: 'member_haris', name: 'Haris Rahman', email: 'haris.rahman@demo.novo.sg', mascotName: 'Milo', mascotType: 'turtle', wristbandColor: 'tropical-green', wristbandPaired: true, wristbandPickupLocation: 'POPStation @ Bedok', accessories: ['bright-star', 'cloud-mitts', 'tide-loop'], equippedAccessories: ['cloud-mitts', 'tide-loop'], friendIds: ['member_meilin'], notificationPreferences: { dailyGreeting: true, tasks: true, events: true, friends: true, orders: true }, streak: 8, points: 10_000, lifetimePoints: 11_760, lastWristbandTapAt: now.toISOString(), questBoardDate: today, dailyQuests: questSet('haris') },
];

const users = new Map(members.map((member) => [member.email, member]));
const demoPassword = process.env.NOVO_DEMO_PASSWORD || 'novo2026';
const credential = (email: string) => {
  const salt = randomBytes(16).toString('hex');
  return { email, salt, passwordHash: scryptSync(demoPassword, salt, 64).toString('hex') };
};
const credentials = new Map([
  'amira.tan@demo.novo.sg',
  'organizer@demo.novo.sg',
  'staff@demo.novo.sg',
  'admin@demo.novo.sg',
].map((email) => [email, credential(email)]));
const portalAccounts = new Map<string, unknown>([
  ...members.map((member) => [member.id, { id: member.id, name: member.name, email: member.email, role: 'member', status: 'active' }] as [string, unknown]),
  ['admin_nadia', { id: 'admin_nadia', name: 'Nadia Lim', email: 'admin@demo.novo.sg', role: 'admin', status: 'active' }],
  ['staff_wei', { id: 'staff_wei', name: 'Wei Ming Lee', email: 'staff@demo.novo.sg', role: 'staff', status: 'active' }],
  ['organizer_siti', { id: 'organizer_siti', name: 'Siti Aisyah', email: 'organizer@demo.novo.sg', role: 'organizer', status: 'active' }],
]);

const portalEvents = new Map<string, unknown>([
  ['evt_live_marina', { id: 'evt_live_marina', organizerId: 'organizer_siti', title: 'Marina Bay lunchtime litter walk', location: 'Marina Bay, Singapore', startsAt: minutesAgo(30), durationMinutes: 120, capacity: 50, points: 90, attendees: ['member_amira', 'member_haris'], checkedInUserIds: [], status: 'open', latitude: 1.2834, longitude: 103.8607 }],
  ['official-cgs-joo-chiat-2026', { id: 'official-cgs-joo-chiat-2026', organizerId: 'official-nea', title: 'Urban Sustainability Bike Tour @ Joo Chiat', location: 'Joo Chiat Road, Singapore', startsAt: '2026-10-03T17:00:00+08:00', durationMinutes: 120, capacity: null, points: 180, attendees: ['member_amira'], checkedInUserIds: [], status: 'open', latitude: 1.3142, longitude: 103.9006, description: 'Cycle through Joo Chiat to explore reuse, climate adaptation, green infrastructure and practical low-carbon choices during Car-Free Day.', organizerName: 'National Environment Agency', sourceUrl: 'https://www.nea.gov.sg/media/news/news/index/clean-and-green-singapore-2026--collective-ownership-for-a-liveable--climate-resilient-future' }],
  ['official-international-ewaste-day-2026', { id: 'official-international-ewaste-day-2026', organizerId: 'official-nea', title: 'International E-Waste Day 2026', location: 'Kampung Admiralty, Singapore', startsAt: '2026-10-10T09:30:00+08:00', durationMinutes: 330, capacity: null, points: 160, attendees: ['member_devan'], checkedInUserIds: [], status: 'open', latitude: 1.4402, longitude: 103.8000, description: 'Try an e-waste sorting relay, upcycling workshops and trivia while learning how electronics and personal data are recycled safely.', organizerName: 'NEA and ALBA E-Waste Smart Recycling', sourceUrl: 'https://www.nea.gov.sg/media/news/news/index/clean-and-green-singapore-2026--collective-ownership-for-a-liveable--climate-resilient-future' }],
  ['official-race-to-sustainability-fair-2026', { id: 'official-race-to-sustainability-fair-2026', organizerId: 'official-nea', title: 'Race to Sustainability Weekend Fair', location: 'Canopy outside Flower Dome, Gardens by the Bay', startsAt: '2026-10-24T10:00:00+08:00', durationMinutes: 420, capacity: null, points: 140, attendees: ['member_meilin', 'member_haris'], checkedInUserIds: [], status: 'open', latitude: 1.2816, longitude: 103.8636, description: 'Explore interactive booths and workshops on food waste, disposables, recycling right and Singapore’s Beverage Container Return Scheme.', organizerName: 'Gardens by the Bay and NEA', sourceUrl: 'https://www.nea.gov.sg/media/news/news/index/clean-and-green-singapore-2026--collective-ownership-for-a-liveable--climate-resilient-future' }],
  ['official-cgs-day-2026', { id: 'official-cgs-day-2026', organizerId: 'official-nea', title: 'Clean & Green Singapore Day 2026', location: 'Kampung Admiralty, Singapore', startsAt: '2026-11-21T08:00:00+08:00', durationMinutes: 180, capacity: null, points: 200, attendees: [], checkedInUserIds: [], status: 'open', latitude: 1.4402, longitude: 103.8000, description: 'Join the Clean & Green Quest, discover sustainability careers and learn how everyday choices support a cleaner, climate-resilient Singapore.', organizerName: 'Clean & Green Singapore', sourceUrl: 'https://www.nea.gov.sg/media/news/news/index/clean-and-green-singapore-2026--collective-ownership-for-a-liveable--climate-resilient-future' }],
  ['evt_east_coast', { id: 'evt_east_coast', organizerId: 'organizer_siti', title: 'East Coast shoreline sort', location: 'East Coast Park, Area C', startsAt: iso(-12, 8), durationMinutes: 120, capacity: 30, points: 180, attendees: ['member_amira', 'member_devan', 'member_meilin', 'member_haris'], checkedInUserIds: ['member_amira', 'member_devan'], status: 'completed', latitude: 1.3008, longitude: 103.9122 }],
  ['evt_queenstown', { id: 'evt_queenstown', organizerId: 'organizer_siti', title: 'Queenstown swap corner', location: 'Queenstown Community Centre', startsAt: iso(15, 11), durationMinutes: 120, capacity: 60, points: 120, attendees: [], checkedInUserIds: [], status: 'draft', latitude: 1.2997, longitude: 103.8010 }],
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
  ['market_green_cafe', { id: 'market_green_cafe', name: '$5 Green Café coupon', category: 'coupon', price: 250, stock: 100, active: true }],
  ['market_refill_store', { id: 'market_refill_store', name: '10% Refill Store coupon', category: 'coupon', price: 180, stock: 100, active: true }],
]);

const submissions = new Map<string, unknown>([
  ['sub_devan', { id: 'sub_devan', userId: 'member_devan', task: 'Sort a shared recycling point', note: 'Separated cans, bottles, and clean paper at our block recycling corner.', photoDataUrl: evidence('Sorted recycling point', '#8bd3c1'), status: 'pending', points: null, aiConfidence: 0.72, aiLabel: 'bottle', aiAccepted: false, aiDetections: [{ label: 'bottle', confidence: 0.72 }, { label: 'cup', confidence: 0.46 }], aiProcessingMs: 91.4, aiSummary: 'The image contains recyclable containers, but the evidence is not clear enough for automatic approval.', aiDecisionReason: 'Relevant objects were detected below the 80% automatic approval threshold.', aiModel: 'yolov8n.pt', createdAt: iso(0, 8, 35), rewardApplied: false }],
  ['sub_amira', { id: 'sub_amira', userId: 'member_amira', task: 'Bring a reusable lunch kit', note: 'Used my own container and cutlery for lunch instead of disposables.', photoDataUrl: evidence('Reusable lunch kit', '#f4d06f'), status: 'approved', points: 50, aiConfidence: 0.94, aiLabel: 'cup', aiAccepted: true, aiDetections: [{ label: 'cup', confidence: 0.94 }, { label: 'bowl', confidence: 0.81 }], aiProcessingMs: 76.8, aiSummary: 'Reusable food containers are clearly visible and match the submitted task.', aiDecisionReason: 'Task-relevant objects were detected above the 80% automatic approval threshold.', aiModel: 'yolov8n.pt', createdAt: iso(-1, 12, 20), rewardApplied: true }],
  ['sub_meilin', { id: 'sub_meilin', userId: 'member_meilin', task: 'Return drink containers', note: 'Returned eligible containers after our weekend picnic.', photoDataUrl: evidence('Container return', '#8ab6f9'), status: 'changes_requested', points: null, aiConfidence: 0.41, aiLabel: 'bottle', aiAccepted: false, aiDetections: [{ label: 'bottle', confidence: 0.41 }], aiProcessingMs: 88.1, aiSummary: 'A possible drink container is visible, though the scene does not clearly show a return point.', aiDecisionReason: 'The detection confidence is below the automatic approval threshold.', aiModel: 'yolov8n.pt', createdAt: iso(-2, 17, 10), rewardApplied: false }],
]);

const nfcTags = new Map<string, unknown>([
  ['tag_kiko', { id: 'tag_kiko', token: 'demo_kiko_7YK9wK3vD2qF8mP6xR4sN1cA', label: 'Snowy wristband · W-001', wristbandColor: 'snowy-white', mascotType: 'polar-bear', createdBy: 'staff_wei', createdAt: iso(-60), pairedUserId: 'member_amira', pairedAt: iso(-45), status: 'paired' }],
  ['tag_pip', { id: 'tag_pip', token: 'demo_pip_2mL8qW4sV9bN5kT1yC7rH6zE', label: 'Charcoal wristband · W-002', wristbandColor: 'charcoal-black', mascotType: 'penguin', createdBy: 'staff_wei', createdAt: iso(-50), pairedUserId: 'member_devan', pairedAt: iso(-38), status: 'paired' }],
  ['tag_sunny', { id: 'tag_sunny', token: 'demo_sunny_9pR3xB7nK5fD1tV8wM4qL2cH', label: 'Sunset wristband · W-003', wristbandColor: 'sunset-orange', mascotType: 'fox', createdBy: 'admin_nadia', createdAt: iso(-40), pairedUserId: 'member_meilin', pairedAt: iso(-34), status: 'paired' }],
  ['tag_milo', { id: 'tag_milo', token: 'demo_milo_6vF2cJ8sA4nQ9yH3kT7wP5dR', label: 'Tropical wristband · W-004', wristbandColor: 'tropical-green', mascotType: 'turtle', createdBy: 'staff_wei', createdAt: iso(-30), pairedUserId: 'member_haris', pairedAt: iso(-25), status: 'paired' }],
  ['tag_ready', { id: 'tag_ready', token: 'demo_ready_4zN8bC2xL7qW1mV6sK9pR3tF', label: 'Ocean wristband · W-005', wristbandColor: 'ocean-blue', mascotType: 'bird', createdBy: 'staff_wei', createdAt: iso(-1), pairedUserId: null, pairedAt: null, status: 'ready' }],
]);

const accessoryQrTags = new Map<string, unknown>();
const fulfillmentOrders = new Map<string, unknown>();

const donations = new Map<string, unknown>([
  ['don_meilin', { id: 'don_meilin', userId: 'member_meilin', causeId: 'clean-shores', causeName: 'Singapore Clean Shores', points: 300, createdAt: iso(-3, 20) }],
  ['don_devan', { id: 'don_devan', userId: 'member_devan', causeId: 'food-rescue', causeName: 'Neighbourhood Food Rescue', points: 200, createdAt: iso(-7, 18) }],
]);

const collections = { users, portalAccounts, portalEvents, marketItems, submissions, fulfillmentOrders, donations, nfcTags, accessoryQrTags, credentials } as unknown as PersistedCollections;

try {
  await resetDatabase();
  await initializeDatabase(collections);
  await closeDatabase();
  console.log(`Created novo demo database at ${databaseTarget}`);
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
