import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';

process.env.NOVO_DB_PATH = ':memory:';
process.env.NOVO_ADMIN_EMAIL = 'admin@example.com';
process.env.NOVO_STAFF_EMAIL = 'staff@example.com';
process.env.NOVO_ORGANIZER_EMAIL = 'organizer@example.com';
const { app } = await import('./app.js');

async function createMember(email: string, name = 'Sam') {
  const response = await request(app).post('/api/auth/onboarding').send({ name, email, plushieName: 'Sprout', focus: 'food' });
  assert.equal(response.status, 201);
  return { user: response.body.user, authorization: `Bearer ${response.body.token}` };
}

describe('novo API', () => {
  it('reports healthy', async () => {
    const response = await request(app).get('/api/health');
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
  });

  it('routes an unknown email to onboarding without creating placeholder data', async () => {
    const unknownStatus = await request(app).post('/api/auth/email-status').send({ email: 'new@example.com' });
    assert.equal(unknownStatus.status, 200);
    assert.equal(unknownStatus.body.exists, false);
    const response = await request(app).post('/api/auth/sign-in').send({ email: 'new@example.com', password: 'password' });
    assert.equal(response.status, 200);
    assert.equal(response.body.isNewUser, true);
    assert.equal(response.body.user, undefined);
  });

  it('creates an empty real profile after onboarding', async () => {
    const { user } = await createMember('profile@example.com');
    const knownStatus = await request(app).post('/api/auth/email-status').send({ email: 'profile@example.com' });
    assert.equal(knownStatus.status, 200);
    assert.equal(knownStatus.body.exists, true);
    assert.equal(user.plushiePaired, false);
    assert.equal(user.points, 0);
    assert.equal(user.lifetimePoints, 0);
    assert.deepEqual(user.dailyQuests, []);
  });

  it('provisions, pairs and verifies the same physical plushie tag', async () => {
    const { authorization } = await createMember('pair@example.com', 'Mina');
    const provisioned = await request(app).post('/api/portal/nfc-tags').set('x-novo-role', 'staff').send({ label: 'CALICO-0004' });
    assert.equal(provisioned.status, 201);
    assert.match(provisioned.body.ndefUrl, /^novo:\/\/plushie\//);
    const tagToken = provisioned.body.tag.token;
    const paired = await request(app).post('/api/member/plushie/pair').set('authorization', authorization).send({ tagToken });
    assert.equal(paired.status, 200);
    assert.equal(paired.body.user.plushiePaired, true);
    assert.equal(paired.body.user.streak, 0);
    assert.equal(paired.body.user.lastPlushieScanAt, null);
    assert.deepEqual(paired.body.user.dailyQuests, []);
    const interacted = await request(app).post('/api/member/plushie/interact').set('authorization', authorization).send({ tagToken });
    assert.equal(interacted.status, 200);
    assert.equal(interacted.body.user.streak, 1);
    assert.equal(interacted.body.user.dailyQuests.length, 3);
    assert.equal(interacted.body.user.dailyQuests[0].sourceAccessoryId, 'bright-star');
    assert.equal(interacted.body.daily.questsRefreshed, true);
    const repeated = await request(app).post('/api/member/plushie/interact').set('authorization', authorization).send({ tagToken });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.user.streak, 1);
    assert.equal(repeated.body.daily.questsRefreshed, false);
  });

  it('rejects an unprepared NFC tag', async () => {
    const { authorization } = await createMember('badtag@example.com');
    const response = await request(app).post('/api/member/plushie/pair').set('authorization', authorization).send({ tagToken: 'abcdefghijklmnopqrstuvwxyz123456' });
    assert.equal(response.status, 404);
  });

  it('stores custom task evidence for staff when AI is unavailable', async () => {
    const { authorization } = await createMember('task@example.com');
    const submitted = await request(app).post('/api/member/tasks/custom').set('authorization', authorization).send({ title: 'Sorted home recycling', description: 'Separated clean cans and bottles from the general waste bin.', photoDataUrl: `data:image/jpeg;base64,${Buffer.from('photo').toString('base64')}` });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.automated, false);
    assert.equal(submitted.body.submission.status, 'pending');
    const reviewed = await request(app).post(`/api/portal/submissions/${submitted.body.submission.id}/review`).set('x-novo-role', 'staff').send({ decision: 'approved', points: 80 });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.user.points, 80);
    assert.equal(reviewed.body.user.lifetimePoints, 80);
    const queue = await request(app).get('/api/portal/submissions').set('x-novo-role', 'staff');
    assert.ok(!queue.body.submissions.some((submission: { id: string }) => submission.id === submitted.body.submission.id));
  });

  it('keeps an ordered accessory locked until its unique operations QR is paired', async () => {
    const member = await createMember('accessory@example.com');
    const evidence = await request(app).post('/api/member/tasks/custom').set('authorization', member.authorization).send({ title: 'Prepared recycling', description: 'Prepared enough recycling evidence to earn leaves for an accessory.', photoDataUrl: `data:image/jpeg;base64,${Buffer.from('photo').toString('base64')}` });
    await request(app).post(`/api/portal/submissions/${evidence.body.submission.id}/review`).set('x-novo-role', 'staff').send({ decision: 'approved', points: 500 });
    const ordered = await request(app).post('/api/member/market/purchase').set('authorization', member.authorization).send({ accessoryId: 'sunny-cap', lockerLocation: 'Pick Locker @ Kallang MRT Station' });
    assert.equal(ordered.status, 200);
    assert.ok(ordered.body.user.pendingAccessories.includes('sunny-cap'));
    assert.ok(!ordered.body.user.accessories.includes('sunny-cap'));
    const blockedEquip = await request(app).post('/api/member/accessories/equip').set('authorization', member.authorization).send({ accessoryId: 'sunny-cap' });
    assert.equal(blockedEquip.status, 403);
    const queued = await request(app).get('/api/portal/fulfillment-orders').set('x-novo-role', 'staff');
    assert.ok(queued.body.orders.some((order: { id: string; status: string }) => order.id === ordered.body.order.id && order.status === 'confirmed'));
    const prepared = await request(app).post('/api/portal/accessory-tags').set('x-novo-role', 'staff').send({ label: 'SUNNY-A-001', accessoryId: 'sunny-cap', orderId: ordered.body.order.id });
    assert.equal(prepared.status, 201);
    assert.match(prepared.body.qrPayload, /^novo:\/\/accessory\//);
    const tagged = await request(app).get('/api/portal/fulfillment-orders').set('x-novo-role', 'staff');
    assert.ok(tagged.body.orders.some((order: { id: string; status: string }) => order.id === ordered.body.order.id && order.status === 'tagged'));
    const paired = await request(app).post('/api/member/accessories/redeem').set('authorization', member.authorization).send({ code: prepared.body.qrPayload });
    assert.equal(paired.status, 200);
    assert.ok(paired.body.user.accessories.includes('sunny-cap'));
    assert.ok(!paired.body.user.pendingAccessories.includes('sunny-cap'));
    const delivered = await request(app).get('/api/portal/fulfillment-orders').set('x-novo-role', 'staff');
    assert.ok(delivered.body.orders.some((order: { id: string; status: string }) => order.id === ordered.body.order.id && order.status === 'delivered'));
  });

  it('provides CRUD operations for events, marketplace items and accounts', async () => {
    const createdEvent = await request(app).post('/api/portal/events').set('x-novo-role', 'admin').send({ organizerId: 'admin', title: 'CRUD cleanup walk', location: 'Tampines', startsAt: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 60, capacity: 20, points: 50, status: 'draft' });
    assert.equal(createdEvent.status, 201);
    const changedEvent = await request(app).patch(`/api/portal/events/${createdEvent.body.event.id}`).set('x-novo-role', 'admin').send({ status: 'open', points: 70 });
    assert.equal(changedEvent.body.event.points, 70);
    assert.equal((await request(app).delete(`/api/portal/events/${createdEvent.body.event.id}`).set('x-novo-role', 'admin')).status, 204);

    const createdItem = await request(app).post('/api/portal/market').set('x-novo-role', 'admin').send({ name: 'CRUD scarf', category: 'accessory', price: 200, stock: 4, active: true });
    assert.equal(createdItem.status, 201);
    const changedItem = await request(app).patch(`/api/portal/market/${createdItem.body.item.id}`).set('x-novo-role', 'admin').send({ stock: 7, active: false });
    assert.equal(changedItem.body.item.stock, 7);
    assert.equal((await request(app).delete(`/api/portal/market/${createdItem.body.item.id}`).set('x-novo-role', 'admin')).status, 204);

    const createdAccount = await request(app).post('/api/portal/accounts').set('x-novo-role', 'admin').send({ name: 'CRUD Staff', email: 'crud-staff@example.com', role: 'staff', status: 'active' });
    assert.equal(createdAccount.status, 201);
    const changedAccount = await request(app).patch(`/api/portal/accounts/${createdAccount.body.account.id}`).set('x-novo-role', 'admin').send({ status: 'review' });
    assert.equal(changedAccount.body.account.status, 'review');
    assert.equal((await request(app).delete(`/api/portal/accounts/${createdAccount.body.account.id}`).set('x-novo-role', 'admin')).status, 204);
  });

  it('persists notification preferences and only returns connected friends', async () => {
    const first = await createMember('friends-one@example.com', 'First');
    const second = await createMember('friends-two@example.com', 'Second');
    const connected = await request(app).post(`/api/member/friends/${second.user.id}`).set('authorization', first.authorization);
    assert.equal(connected.status, 200);
    const friends = await request(app).get('/api/member/friends').set('authorization', first.authorization);
    assert.deepEqual(friends.body.friends.map((friend: { id: string }) => friend.id), [second.user.id]);
    const preferences = { dailyGreeting: true, tasks: false, events: true, friends: false, orders: true };
    const updated = await request(app).patch('/api/member/notifications').set('authorization', first.authorization).send(preferences);
    assert.deepEqual(updated.body.user.notificationPreferences, preferences);
  });

  it('serves verified pickup and Return Right locations', async () => {
    const response = await request(app).get('/api/locations');
    assert.equal(response.status, 200);
    assert.ok(response.body.locations.some((location: { kind: string }) => location.kind === 'return-right'));
    assert.ok(response.body.locations.some((location: { kind: string }) => location.kind === 'pick-locker'));
    assert.ok(response.body.locations.some((location: { kind: string }) => location.kind === 'singpost-locker'));
  });

  it('builds a leaderboard from persisted lifetime leaves', async () => {
    const { authorization } = await createMember('leader@example.com', 'Leaf');
    const response = await request(app).get('/api/member/leaderboard').set('authorization', authorization);
    assert.equal(response.status, 200);
    assert.ok(response.body.leaders.some((entry: { name: string }) => entry.name === 'Leaf'));
  });

  it('allows an organizer to create an unlimited event and check in a member', async () => {
    const member = await createMember('attendee@example.com');
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const created = await request(app).post('/api/portal/events').set('x-novo-role', 'organizer').send({ organizerId: 'organizer', title: 'Community repair circle', location: 'Bedok Community Centre', startsAt, durationMinutes: 120, capacity: null, points: 140, status: 'open' });
    assert.equal(created.status, 201);
    assert.equal(typeof created.body.event.latitude, 'number');
    assert.equal(typeof created.body.event.longitude, 'number');
    const checkedIn = await request(app).post(`/api/portal/events/${created.body.event.id}/check-in`).set('x-novo-role', 'organizer').send({ attendeeId: member.user.id });
    assert.equal(checkedIn.status, 200);
    assert.deepEqual(checkedIn.body.event.attendees, [member.user.id]);
    const memberTasks = await request(app).get('/api/member/tasks').set('authorization', member.authorization);
    assert.ok(memberTasks.body.events.some((event: { id: string; status: string }) => event.id === created.body.event.id && event.status === 'scheduled'));
    const registered = await request(app).post(`/api/member/events/${created.body.event.id}/signup`).set('authorization', member.authorization);
    assert.equal(registered.status, 200);
    assert.equal(registered.body.event.registered, true);
  });

  it('routes configured operations roles to the operations portal', async () => {
    const signedIn = await request(app).post('/api/auth/web-sign-in').send({ email: 'admin@example.com', password: 'password' });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.role, 'admin');
    assert.equal(signedIn.body.destination, 'operations');
  });

  it('creates a one-time mobile handoff for an existing member', async () => {
    await createMember('handoff@example.com');
    const signedIn = await request(app).post('/api/auth/web-sign-in').send({ email: 'handoff@example.com', password: 'password' });
    assert.equal(signedIn.status, 200);
    assert.ok(signedIn.body.handoffToken);
    const exchanged = await request(app).post('/api/auth/mobile-handoff/exchange').send({ handoffToken: signedIn.body.handoffToken });
    assert.equal(exchanged.status, 200);
    const reused = await request(app).post('/api/auth/mobile-handoff/exchange').send({ handoffToken: signedIn.body.handoffToken });
    assert.equal(reused.status, 401);
  });
});
