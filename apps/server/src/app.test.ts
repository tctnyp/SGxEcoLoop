import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import request from 'supertest';

process.env.NOVO_DB_PATH = ':memory:';
process.env.NOVO_ADMIN_EMAIL = 'admin@example.com';
process.env.NOVO_STAFF_EMAIL = 'staff@example.com';
process.env.NOVO_ORGANIZER_EMAIL = 'organizer@example.com';
process.env.NOVO_BOOTSTRAP_PASSWORD = 'password';
process.env.NOVO_LOCKER_DIRECTORY_OFFLINE = '1';
process.env.NOVO_RETURN_RIGHT_DIRECTORY_OFFLINE = '1';
const { app } = await import('./app.js');

async function createMember(email: string, name = 'Sam') {
  const response = await request(app).post('/api/auth/onboarding').send({ name, email, password: 'Password1!', mascotName: 'Sprout', focus: 'food' });
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
    assert.equal(user.wristbandPaired, false);
    assert.equal(user.mascotType, 'polar-bear');
    assert.equal(user.points, 0);
    assert.equal(user.lifetimePoints, 0);
    assert.deepEqual(user.dailyQuests, []);
    assert.deepEqual(user.coupons, []);
  });

  it('enforces the complete password policy and supports profile and password changes', async () => {
    const weak = await request(app).post('/api/auth/onboarding').send({ name: 'Weak', email: 'weak@example.com', password: 'password1', mascotName: 'Bud', focus: 'food' });
    assert.equal(weak.status, 400);
    const { authorization, user } = await createMember('custom-profile@example.com', 'Original Name');
    assert.equal(user.username, 'custom-profile');
    const changed = await request(app).patch('/api/member/profile').set('authorization', authorization).send({ name: 'New Name', username: 'new.name', avatarDataUrl: null });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.user.username, 'new.name');
    const wrongCurrent = await request(app).post('/api/member/password').set('authorization', authorization).send({ currentPassword: 'wrong', newPassword: 'EvenBetter2#' });
    assert.equal(wrongCurrent.status, 401);
    const updated = await request(app).post('/api/member/password').set('authorization', authorization).send({ currentPassword: 'Password1!', newPassword: 'EvenBetter2#' });
    assert.equal(updated.status, 200);
    const signedIn = await request(app).post('/api/auth/sign-in').send({ email: 'custom-profile@example.com', password: 'EvenBetter2#' });
    assert.equal(signedIn.status, 200);
  });

  it('uses the Microsoft Graph user principal name when the mail field is empty', async () => {
    await createMember('microsoft-user@example.com', 'Microsoft User');
    process.env.MICROSOFT_CLIENT_ID = 'microsoft-test-client';
    process.env.MICROSOFT_CLIENT_SECRET = 'microsoft-test-secret';
    process.env.MICROSOFT_TENANT_ID = 'common';
    const originalFetch = globalThis.fetch;
    try {
      const started = await request(app).get('/api/auth/microsoft/start?platform=web');
      assert.equal(started.status, 302);
      const state = new URL(started.headers.location).searchParams.get('state');
      assert.ok(state);
      globalThis.fetch = async (input) => {
        const url = String(input);
        if (url.includes('/oauth2/v2.0/token')) return new Response(JSON.stringify({ access_token: 'microsoft-access-token' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        if (url.includes('graph.microsoft.com/v1.0/me')) return new Response(JSON.stringify({ id: 'microsoft-subject', displayName: 'Microsoft User', mail: null, userPrincipalName: 'microsoft-user@example.com' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        return new Response('Not found', { status: 404 });
      };
      const callback = await request(app).get(`/api/auth/microsoft/callback?state=${encodeURIComponent(state)}&code=test-code`);
      assert.equal(callback.status, 302);
      assert.match(callback.headers.location, /oauthToken=/);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MICROSOFT_CLIENT_ID;
      delete process.env.MICROSOFT_CLIENT_SECRET;
      delete process.env.MICROSOFT_TENANT_ID;
    }
  });

  it('provisions a coloured wristband, reveals its mascot and refreshes quests once daily', async () => {
    const { authorization } = await createMember('pair@example.com', 'Mina');
    const provisioned = await request(app).post('/api/portal/nfc-tags').set('x-novo-role', 'staff').send({ label: 'SUNSET-0004', wristbandColor: 'sunset-orange' });
    assert.equal(provisioned.status, 201);
    assert.match(provisioned.body.ndefUrl, /^novo:\/\/wristband\//);
    const tagToken = provisioned.body.tag.token;
    const paired = await request(app).post('/api/member/wristband/pair').set('authorization', authorization).send({ tagToken, pickupLocation: 'Pick! Locker @ Tampines' });
    assert.equal(paired.status, 200);
    assert.equal(paired.body.user.wristbandPaired, true);
    assert.equal(paired.body.user.wristbandColor, 'sunset-orange');
    assert.equal(paired.body.user.mascotType, 'fox');
    assert.equal(paired.body.user.streak, 0);
    assert.equal(paired.body.user.lastWristbandTapAt, null);
    assert.deepEqual(paired.body.user.dailyQuests, []);
    const interacted = await request(app).post('/api/member/wristband/interact').set('authorization', authorization).send({ tagToken });
    assert.equal(interacted.status, 200);
    assert.equal(interacted.body.user.streak, 1);
    assert.equal(interacted.body.user.dailyQuests.length, 3);
    assert.ok(interacted.body.user.dailyQuests[0].title);
    assert.equal(interacted.body.daily.questsRefreshed, true);
    const repeated = await request(app).post('/api/member/wristband/interact').set('authorization', authorization).send({ tagToken });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.body.user.streak, 1);
    assert.equal(repeated.body.daily.questsRefreshed, false);
  });

  it('rejects an unprepared NFC tag', async () => {
    const { authorization } = await createMember('badtag@example.com');
    const response = await request(app).post('/api/member/wristband/pair').set('authorization', authorization).send({ tagToken: 'abcdefghijklmnopqrstuvwxyz123456', pickupLocation: 'Pick! Locker' });
    assert.equal(response.status, 404);
  });

  it('stores custom task evidence for staff when AI is unavailable', async () => {
    const { authorization } = await createMember('task@example.com');
    const submitted = await request(app).post('/api/member/tasks/custom').set('authorization', authorization).send({ title: 'Sorted home recycling', description: 'Separated clean cans and bottles from the general waste bin.', photoDataUrl: `data:image/jpeg;base64,${Buffer.from('photo').toString('base64')}` });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.automated, false);
    assert.equal(submitted.body.submission.status, 'pending');
    assert.equal(submitted.body.submission.photoDataUrl, undefined);
    const memberTasks = await request(app).get('/api/member/tasks').set('authorization', authorization);
    assert.equal(memberTasks.body.submissions[0].photoDataUrl, undefined);
    const reviewed = await request(app).post(`/api/portal/submissions/${submitted.body.submission.id}/review`).set('x-novo-role', 'staff').send({ decision: 'approved', points: 80 });
    assert.equal(reviewed.status, 200);
    assert.equal(reviewed.body.user.points, 80);
    assert.equal(reviewed.body.user.lifetimePoints, 80);
    const queue = await request(app).get('/api/portal/submissions').set('x-novo-role', 'staff');
    assert.ok(!queue.body.submissions.some((submission: { id: string }) => submission.id === submitted.body.submission.id));
  });

  it('stores detailed YOLO results and automatically rewards accepted evidence', async () => {
    const originalFetch = globalThis.fetch;
    let submittedDescription = '';
    process.env.YOLO_SERVICE_URL = 'https://yolo.test/analyze';
    globalThis.fetch = async (_input, init) => {
      submittedDescription = String(JSON.parse(String(init?.body)).description);
      return new Response(JSON.stringify({
        accepted: true,
        confidence: 0.93,
        label: 'bottle',
        embedding: [0.2, 0.4, 0.6],
        detections: [{ label: 'bottle', confidence: 0.93, box: { x1: 1, y1: 2, x2: 30, y2: 40 } }],
        processing_ms: 84.5,
        summary: 'A recyclable bottle is clearly visible.',
        decision_reason: 'A relevant object exceeded the approval threshold.',
        model: 'yolov8n.pt',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    try {
      const { authorization } = await createMember('yolo-details@example.com');
      const submitted = await request(app).post('/api/member/tasks/custom').set('authorization', authorization).send({ title: 'Recycle a bottle', description: 'Placed a clean bottle in the recycling bin.', photoDataUrl: `data:image/jpeg;base64,${Buffer.from('yolo-details-photo').toString('base64')}` });
      assert.equal(submitted.status, 201);
      assert.equal(submitted.body.automated, true);
      assert.equal(submitted.body.submission.status, 'approved');
      assert.equal(submitted.body.submission.aiAccepted, true);
      assert.equal(submitted.body.submission.aiDetections[0].label, 'bottle');
      assert.equal(submitted.body.submission.aiProcessingMs, 84.5);
      assert.equal(submitted.body.submission.aiModel, 'yolov8n.pt');
      assert.match(submittedDescription, /Recycle a bottle/);

      const allResults = await request(app).get('/api/portal/submissions?scope=all').set('x-novo-role', 'staff');
      const stored = allResults.body.submissions.find((submission: { id: string }) => submission.id === submitted.body.submission.id);
      assert.equal(stored.aiSummary, 'A recyclable bottle is clearly visible.');
      assert.equal(stored.aiDecisionReason, 'A relevant object exceeded the approval threshold.');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.YOLO_SERVICE_URL;
    }
  });

  it('accepts daily task evidence from the generated quest board', async () => {
    const { authorization } = await createMember('daily-task@example.com');
    const provisioned = await request(app).post('/api/portal/nfc-tags').set('x-novo-role', 'staff').send({ label: 'CALICO-DAILY-0001' });
    const tagToken = provisioned.body.tag.token;
    await request(app).post('/api/member/wristband/pair').set('authorization', authorization).send({ tagToken, pickupLocation: 'POPStation @ General Post Office' });
    const interacted = await request(app).post('/api/member/wristband/interact').set('authorization', authorization).send({ tagToken });
    const quest = interacted.body.user.dailyQuests[0];
    assert.ok(quest?.id);

    const submitted = await request(app).post(`/api/member/tasks/${quest.id}/submit`).set('authorization', authorization).send({ description: 'Completed this task and photographed the finished result.', photoDataUrl: `data:image/jpeg;base64,${Buffer.from('daily-photo').toString('base64')}` });
    assert.equal(submitted.status, 201);
    assert.equal(submitted.body.automated, false);
    assert.equal(submitted.body.submission.questId, quest.id);
    assert.equal(submitted.body.submission.status, 'pending');
  });

  it('unlocks an in-app accessory immediately without a locker or physical QR', async () => {
    const member = await createMember('accessory@example.com');
    const evidence = await request(app).post('/api/member/tasks/custom').set('authorization', member.authorization).send({ title: 'Prepared recycling', description: 'Prepared enough recycling evidence to earn leaves for an accessory.', photoDataUrl: `data:image/jpeg;base64,${Buffer.from('accessory-photo').toString('base64')}` });
    await request(app).post(`/api/portal/submissions/${evidence.body.submission.id}/review`).set('x-novo-role', 'staff').send({ decision: 'approved', points: 500 });
    const unlocked = await request(app).post('/api/member/market/purchase').set('authorization', member.authorization).send({ accessoryId: 'sunny-cap' });
    assert.equal(unlocked.status, 200);
    assert.ok(unlocked.body.user.accessories.includes('sunny-cap'));
    assert.ok(unlocked.body.user.equippedAccessories.includes('sunny-cap'));
    assert.equal(unlocked.body.order, undefined);
    const toggled = await request(app).post('/api/member/accessories/equip').set('authorization', member.authorization).send({ accessoryId: 'sunny-cap' });
    assert.equal(toggled.status, 200);
    assert.ok(!toggled.body.user.equippedAccessories.includes('sunny-cap'));
    const retiredQrFlow = await request(app).post('/api/member/accessories/redeem').set('authorization', member.authorization).send({ code: 'NOVO-SUNNY-01' });
    assert.equal(retiredQrFlow.status, 410);
  });

  it('stores a redeemed coupon in the member rewards wallet', async () => {
    const member = await createMember('coupon@example.com');
    const evidence = await request(app).post('/api/member/tasks/custom').set('authorization', member.authorization).send({ title: 'Reusable container', description: 'Used a reusable container and recorded it in the novo camera.', photoDataUrl: `data:image/jpeg;base64,${Buffer.from('coupon-photo').toString('base64')}` });
    await request(app).post(`/api/portal/submissions/${evidence.body.submission.id}/review`).set('x-novo-role', 'staff').send({ decision: 'approved', points: 300 });
    const redeemed = await request(app).post('/api/member/market/coupon/redeem').set('authorization', member.authorization).send({ offerId: 'green-cafe-5', name: '$5 Green Café coupon', points: 250 });
    assert.equal(redeemed.status, 200);
    assert.equal(redeemed.body.user.coupons.length, 1);
    assert.equal(redeemed.body.user.coupons[0].offerId, 'green-cafe-5');
    assert.match(redeemed.body.user.coupons[0].code, /^NOVO-[A-F0-9]{8}$/);
    assert.equal(redeemed.body.user.points, 50);
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

    const createdAccount = await request(app).post('/api/portal/accounts').set('x-novo-role', 'admin').send({ name: 'CRUD Member', email: 'crud-member@example.com', password: 'member-pass-1', role: 'member', status: 'active', points: 120, lifetimePoints: 300, streak: 4, mascotName: 'Sprout' });
    assert.equal(createdAccount.status, 201);
    assert.equal(createdAccount.body.account.member.points, 120);
    assert.equal(createdAccount.body.account.passwordSet, true);
    const accounts = await request(app).get('/api/portal/accounts').set('x-novo-role', 'admin');
    assert.equal(accounts.body.accounts.find((account: { email: string }) => account.email === 'crud-member@example.com').member.mascotName, 'Sprout');
    const changedAccount = await request(app).patch(`/api/portal/accounts/${createdAccount.body.account.id}`).set('x-novo-role', 'admin').send({ role: 'staff', points: 999, lifetimePoints: 1200, streak: 8, password: 'member-pass-2' });
    assert.equal(changedAccount.body.account.role, 'staff');
    assert.equal(changedAccount.body.account.member.points, 999);
    assert.equal((await request(app).post('/api/auth/web-sign-in').send({ email: 'crud-member@example.com', password: 'member-pass-1' })).status, 401);
    const staffSignIn = await request(app).post('/api/auth/web-sign-in').send({ email: 'crud-member@example.com', password: 'member-pass-2' });
    assert.equal(staffSignIn.body.role, 'staff');
    assert.equal((await request(app).delete(`/api/portal/accounts/${createdAccount.body.account.id}`).set('x-novo-role', 'admin')).status, 204);
  });

  it('applies active, limited and suspended access without destroying the mobile session', async () => {
    const member = await createMember('status-member@example.com', 'Status Member');

    const limited = await request(app).patch(`/api/portal/accounts/${member.user.id}`).set('x-novo-role', 'admin').send({ status: 'limited' });
    assert.equal(limited.status, 200);
    assert.equal(limited.body.account.status, 'limited');

    const limitedSession = await request(app).get('/api/auth/mobile-session').set('authorization', member.authorization);
    assert.equal(limitedSession.status, 200);
    assert.equal(limitedSession.body.accountStatus, 'limited');
    const safeProfileUpdate = await request(app).patch('/api/member/profile').set('authorization', member.authorization).send({ name: 'Limited Member', username: member.user.username, avatarDataUrl: null });
    assert.equal(safeProfileUpdate.status, 200);
    const blockedMutation = await request(app).post('/api/member/market/coupon/redeem').set('authorization', member.authorization).send({ points: 250, offerId: 'limited-test', name: 'Limited test' });
    assert.equal(blockedMutation.status, 403);
    assert.equal(blockedMutation.body.accountStatus, 'limited');
    assert.equal(blockedMutation.body.code, 'ACCOUNT_LIMITED');

    const suspended = await request(app).patch(`/api/portal/accounts/${member.user.id}`).set('x-novo-role', 'admin').send({ status: 'suspended' });
    assert.equal(suspended.status, 200);
    const suspendedSession = await request(app).get('/api/auth/mobile-session').set('authorization', member.authorization);
    assert.equal(suspendedSession.status, 423);
    assert.equal(suspendedSession.body.accountStatus, 'suspended');
    assert.equal(suspendedSession.body.code, 'ACCOUNT_SUSPENDED');
    const suspendedSignIn = await request(app).post('/api/auth/sign-in').send({ email: 'status-member@example.com', password: 'Password1!' });
    assert.equal(suspendedSignIn.status, 423);

    const active = await request(app).patch(`/api/portal/accounts/${member.user.id}`).set('x-novo-role', 'admin').send({ status: 'active' });
    assert.equal(active.status, 200);
    const restoredSession = await request(app).get('/api/auth/mobile-session').set('authorization', member.authorization);
    assert.equal(restoredSession.status, 200);
    assert.equal(restoredSession.body.accountStatus, 'active');
    const restoredSignIn = await request(app).post('/api/auth/sign-in').send({ email: 'status-member@example.com', password: 'Password1!' });
    assert.equal(restoredSignIn.status, 200);

    const legacyStatus = await request(app).patch(`/api/portal/accounts/${member.user.id}`).set('x-novo-role', 'admin').send({ status: 'review' });
    assert.equal(legacyStatus.status, 400);
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
    const returnRight = await request(app).get('/api/locations?kind=return-right');
    assert.equal(returnRight.status, 200);
    assert.equal(returnRight.body.locations.length, 3);
    assert.ok(returnRight.body.locations.every((location: { kind: string }) => location.kind === 'return-right'));
    const member = await createMember('locker-search@example.com', 'Locker');
    const lockers = await request(app).get('/api/member/wristband/pickup-locations?q=admiralty&provider=pick').set('authorization', member.authorization);
    assert.equal(lockers.status, 200);
    assert.equal(lockers.body.lockers.length, 1);
    assert.equal(lockers.body.lockers[0].kind, 'pick-locker');
    assert.equal(lockers.body.directoryTotal, 6);
  });

  it('builds a leaderboard from persisted lifetime leaves', async () => {
    const { authorization } = await createMember('leader@example.com', 'Leaf');
    const response = await request(app).get('/api/member/leaderboard').set('authorization', authorization);
    assert.equal(response.status, 200);
    assert.ok(response.body.leaders.some((entry: { name: string }) => entry.name === 'Leaf'));
  });

  it('runs one timed weekly competition and awards speed-ranked leaves', async () => {
    const member = await createMember('weekly@example.com', 'Fast Leaf');
    const tasks = await request(app).get('/api/member/tasks').set('authorization', member.authorization);
    assert.equal(tasks.status, 200);
    assert.equal(tasks.body.weeklyCompetition.questions.length, 4);
    assert.equal(tasks.body.weeklyCompetition.entry, null);
    const started = await request(app).post('/api/member/weekly/start').set('authorization', member.authorization);
    assert.equal(started.status, 200);
    assert.ok(started.body.weeklyCompetition.entry.startedAt);
    const correctById: Record<string, number> = { clean: 0, reuse: 1, bcrs: 2, repair: 2, bag: 0, food: 1, sort: 1, trip: 0 };
    const answers = started.body.weeklyCompetition.questions.map((question: { id: string }) => correctById[question.id]);
    const completed = await request(app).post('/api/member/weekly/complete').set('authorization', member.authorization).send({ answers });
    assert.equal(completed.status, 200);
    assert.equal(completed.body.weeklyCompetition.entry.rank, 1);
    assert.equal(completed.body.weeklyCompetition.entry.pointsAwarded, 300);
    assert.equal(completed.body.user.points, 300);
    assert.equal((await request(app).post('/api/member/weekly/complete').set('authorization', member.authorization).send({ answers })).status, 409);
  });

  it('allows an organizer to verify completed attendance by paired wristband', async () => {
    const member = await createMember('attendee@example.com');
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const created = await request(app).post('/api/portal/events').set('x-novo-role', 'organizer').send({ organizerId: 'organizer', title: 'Community repair circle', location: 'Bedok Community Centre', startsAt, durationMinutes: 120, capacity: null, points: 140, status: 'open' });
    assert.equal(created.status, 201);
    assert.equal(typeof created.body.event.latitude, 'number');
    assert.equal(typeof created.body.event.longitude, 'number');
    const memberTasks = await request(app).get('/api/member/tasks').set('authorization', member.authorization);
    assert.ok(memberTasks.body.events.some((event: { id: string; status: string }) => event.id === created.body.event.id && event.status === 'scheduled'));
    const registered = await request(app).post(`/api/member/events/${created.body.event.id}/signup`).set('authorization', member.authorization);
    assert.equal(registered.status, 200);
    assert.equal(registered.body.event.registered, true);
    const provisioned = await request(app).post('/api/portal/nfc-tags').set('x-novo-role', 'staff').send({ label: 'EVENT-BAND-1', wristbandColor: 'ocean-blue' });
    const tagToken = provisioned.body.tag.token;
    await request(app).post('/api/member/wristband/pair').set('authorization', member.authorization).send({ tagToken, pickupLocation: 'Pick! Locker @ Bedok' });
    const checkedIn = await request(app).post(`/api/portal/events/${created.body.event.id}/check-in`).set('x-novo-role', 'organizer').send({ tagToken });
    assert.equal(checkedIn.status, 200);
    assert.deepEqual(checkedIn.body.event.checkedInUserIds, [member.user.id]);
    assert.equal(checkedIn.body.pointsAwarded, 140);
    const repeated = await request(app).post(`/api/portal/events/${created.body.event.id}/check-in`).set('x-novo-role', 'organizer').send({ tagToken });
    assert.equal(repeated.status, 409);
  });

  it('routes configured operations roles to the operations portal', async () => {
    const signedIn = await request(app).post('/api/auth/web-sign-in').send({ email: 'admin@example.com', password: 'password' });
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.body.role, 'admin');
    assert.equal(signedIn.body.destination, 'operations');
    const adminAuthorization = `Bearer ${signedIn.body.token}`;
    const created = await request(app).post('/api/portal/accounts').set('Authorization', adminAuthorization).send({ name: 'Operations Profile', email: 'operations-profile@example.com', password: 'Original2#', role: 'staff', status: 'active' });
    assert.equal(created.status, 201);
    const operationsSignIn = await request(app).post('/api/auth/web-sign-in').send({ email: 'operations-profile@example.com', password: 'Original2#' });
    const authorization = `Bearer ${operationsSignIn.body.token}`;
    const changed = await request(app).patch('/api/auth/account/profile').set('Authorization', authorization).send({ name: 'Updated Operations Profile' });
    assert.equal(changed.status, 200);
    assert.equal(changed.body.account.name, 'Updated Operations Profile');
    const changedPassword = await request(app).post('/api/auth/account/password').set('Authorization', authorization).send({ currentPassword: 'Original2#', newPassword: 'Operations2#' });
    assert.equal(changedPassword.status, 200);
    const signedInAgain = await request(app).post('/api/auth/web-sign-in').send({ email: 'operations-profile@example.com', password: 'Operations2#' });
    assert.equal(signedInAgain.status, 200);
    assert.equal((await request(app).delete(`/api/portal/accounts/${created.body.account.id}`).set('Authorization', adminAuthorization)).status, 204);
  });

  it('creates a one-time mobile handoff for an existing member', async () => {
    await createMember('handoff@example.com');
    const signedIn = await request(app).post('/api/auth/web-sign-in').send({ email: 'handoff@example.com', password: 'Password1!' });
    assert.equal(signedIn.status, 200);
    assert.ok(signedIn.body.handoffToken);
    const exchanged = await request(app).post('/api/auth/mobile-handoff/exchange').send({ handoffToken: signedIn.body.handoffToken });
    assert.equal(exchanged.status, 200);
    const reused = await request(app).post('/api/auth/mobile-handoff/exchange').send({ handoffToken: signedIn.body.handoffToken });
    assert.equal(reused.status, 401);
  });

  it('revokes member and operations sessions on sign out', async () => {
    const member = await createMember('logout-member@example.com', 'Logout Member');
    const memberBefore = await request(app).get('/api/auth/mobile-session').set('Authorization', member.authorization);
    assert.equal(memberBefore.status, 200);

    const memberSignOut = await request(app).post('/api/auth/sign-out').set('Authorization', member.authorization);
    assert.equal(memberSignOut.status, 204);
    const memberAfter = await request(app).get('/api/auth/mobile-session').set('Authorization', member.authorization);
    assert.equal(memberAfter.status, 401);

    const operations = await request(app).post('/api/auth/web-sign-in').send({ email: 'admin@example.com', password: 'password' });
    assert.equal(operations.status, 200);
    const operationsBefore = await request(app).get('/api/auth/session').set('Authorization', `Bearer ${operations.body.token}`);
    assert.equal(operationsBefore.status, 200);

    const operationsSignOut = await request(app).post('/api/auth/sign-out').set('Authorization', `Bearer ${operations.body.token}`);
    assert.equal(operationsSignOut.status, 204);
    const operationsAfter = await request(app).get('/api/auth/session').set('Authorization', `Bearer ${operations.body.token}`);
    assert.equal(operationsAfter.status, 401);
  });
});
