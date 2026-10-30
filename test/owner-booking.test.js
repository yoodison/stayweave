import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHmac} from 'node:crypto';
import express from 'express';
import {mountWorld} from '../server/world-api.js';

async function fixture(t, {demo = true} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stayweave-chat-booking-'));
  let result = {updates: []};
  const start = async () => {
    const app = express();
    app.use(express.json());
    mountWorld(app, dir, async () => ({claims: []}), {
      demo,
      ownerInterpreter: async () => ({value: {tool: 'guest_intake'}}),
      bookingInterpreter: async () => ({value: result}),
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    return server;
  };
  let server = await start();
  t.after(async () => { await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, {recursive: true, force: true}); });
  const call = async (url, body, token) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    return {status: response.status, data: await response.json()};
  };
  let sequence = 0;
  return {
    dir, call,
    world: () => JSON.parse(fs.readFileSync(path.join(dir, 'world.json'), 'utf8')),
    key: () => fs.readFileSync(path.join(dir, 'agent-key'), 'utf8').trim(),
    capability: id => createHmac('sha256', fs.readFileSync(path.join(dir, 'agent-key'), 'utf8').trim()).update(`guest:${id}`).digest('hex'),
    send: async (text, updates) => { result = {updates}; return call('/api/owner/message', {id: `booking-message-${String(++sequence).padStart(6, '0')}`, message: text}); },
    restart: async () => { await new Promise(resolve => server.close(resolve)); server = await start(); },
  };
}

const update = (slot, fields, text, claims) => ({slot, fields, evidence: Object.fromEntries(Object.keys(fields).map(k => [k, text])), ...(claims === undefined ? {} : {claims})});
const publish = (f, d, revision = d.revision) => f.call(`/api/owner/booking/${d.id}/publish`, {confirmed: true, revision});
const current = async (f, id) => (await f.call('/api/owner/conversation')).data.drafts.find(d => d.id === id);
const view = async (f, id) => (await f.call('/api/owner/conversation')).data.messages.find(m => m.draftId === id).booking;
const selection = r => ({optionId: r.options[0].id, choiceToken: r.options[0].choiceToken, version: r.offerVersion, conditionsReviewed: true, customerConfirmed: true});
const action = (f, d, r, name, body, token) => f.call(`/api/owner/booking/${d.id}/guest/${r.id}/${name}`, body, token);
const complete = {guest: 'Taylor', checkIn: '2026-11-01', checkOut: '2026-11-03', party: 2, arrival: 900, breakfast: 2, roomId: '102'};

test('booking follow-up asks for missing details only; invalid extraction cannot mutate draft or world', async t => {
  const f = await fixture(t), before = f.world();
  const first = await f.send('Taylor arrives November 1.', [update(0, {guest: 'Taylor', checkIn: '2026-11-01'}, 'Taylor arrives November 1.')]);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.booking.missing.map(x => x.field), ['checkOut', 'party', 'arrival', 'breakfast']);
  assert.equal(first.data.booking.items[0].fields.guest, 'Taylor');
  assert.deepEqual(f.world(), before);
  const bad = await f.send('Two people.', [{slot: 0, fields: {party: 9}, evidence: {party: 'Two people.'}}]);
  assert.equal(bad.status, 422);
  const ungrounded = await f.send('Two people.', [{slot: 0, fields: {party: 2}, evidence: {party: 'three people'}}]);
  assert.equal(ungrounded.status, 422);
  assert.equal((await current(f, first.data.draftId)).revision, 1);
  const next = await f.send('Two people.', [update(0, {party: 2}, 'Two people.')]);
  assert.equal(next.status, 200);
  assert.deepEqual(next.data.booking.missing.map(x => x.field), ['checkOut', 'arrival', 'breakfast']);
  assert.equal(next.data.booking.items[0].fields.checkIn, '2026-11-01');
  assert.deepEqual(f.world(), before);
});

test('multi-guest draft publishes atomically, rejects stale revision, and retry survives restart', async t => {
  const f = await fixture(t), before = f.world();
  const text = 'Taylor and Morgan: November 1 to 3, two guests each, arrive at 15:00, breakfast for two, rooms 102 and 103.';
  const first = await f.send(text, [update(0, complete, text), update(1, {...complete, guest: 'Morgan', roomId: '103'}, text)]);
  assert.equal(first.status, 200);
  const old = first.data.booking;
  assert.equal(old.status, 'ready');
  assert.deepEqual(f.world(), before);
  const correction = 'Taylor has one breakfast.';
  const revised = (await f.send(correction, [update(0, {breakfast: 1}, correction)])).data.booking;
  assert.equal((await publish(f, revised, old.revision)).status, 409);
  assert.deepEqual(f.world(), before);
  fs.mkdirSync(path.join(f.dir, 'world.json.tmp'));
  assert.equal((await publish(f, revised)).status, 500);
  fs.rmdirSync(path.join(f.dir, 'world.json.tmp'));
  assert.deepEqual(f.world(), before);
  assert.equal((await publish(f, revised)).status, 200);
  const saved = f.world(), d = await current(f, revised.id);
  assert.equal(d.requestIds.length, 2);
  assert.equal(saved.requests.filter(r => r.ownerDraftId === d.id).length, 2);
  assert.deepEqual(saved.reservations, before.reservations);
  assert.deepEqual(saved.tasks, before.tasks);
  assert.equal((await publish(f, revised)).status, 200);
  await f.restart();
  assert.equal((await publish(f, revised)).status, 200);
  assert.deepEqual(f.world(), saved);
  assert.deepEqual((await current(f, d.id)).requestIds, d.requestIds);
});

test('a validation failure on the second guest leaves the entire batch unpublished', async t => {
  const f = await fixture(t), before = f.world();
  // Each quote is grounded and valid individually, but their combined request message
  // exceeds the ledger's inbound limit after the first guest has been processed.
  const text = Array.from({length: 60}, (_, i) => `condition${String(i).padStart(2, '0')} `).join('');
  const claims = Array.from({length: 10}, (_, i) => ({kind: 'unsupported_preference', feature: null, evidence: text.slice(i * 10, i * 10 + 250)}));
  const draft = (await f.send(text, [update(0, complete, text), update(1, {...complete, guest: 'Morgan', roomId: '103'}, text, claims)])).data.booking;
  assert.equal(draft.status, 'ready');
  assert.equal((await publish(f, draft)).status, 400);
  assert.deepEqual(f.world(), before);
  assert.equal((await current(f, draft.id)).status, 'ready');
});

test('guest choice requires explicit simulation and commits the exact option with linked operations', async t => {
  const f = await fixture(t), before = f.world();
  const text = 'Taylor, Nov 1 to Nov 3, two guests, 15:00, two breakfasts, room 102.';
  const d = (await f.send(text, [update(0, complete, text)])).data.booking;
  assert.equal((await publish(f, d)).status, 200);
  let r = (await view(f, d.id)).requests[0];
  assert.ok(r.options.length);
  const choice = selection(r), afterPublish = f.world();
  assert.equal((await action(f, d, r, 'select', choice)).status, 403);
  assert.deepEqual(f.world(), afterPublish);
  assert.equal((await action(f, d, r, 'select', {...choice, simulateGuest: true, customerConfirmed: false})).status, 400);
  assert.deepEqual(f.world(), afterPublish);
  assert.equal((await action(f, d, r, 'select', {...choice, simulateGuest: true})).status, 200);
  const saved = f.world(), reservation = saved.reservations.find(b => b.requestId === r.id);
  assert.equal(reservation.roomId, r.options[0].roomId);
  assert.equal(reservation.breakfast, 2);
  assert.ok(reservation.linenReserved > 0);
  assert.deepEqual(saved.tasks.filter(x => x.bookingId === reservation.id).map(x => x.kind).sort(), ['cleaning', 'inspection']);
  assert.deepEqual(saved.reservations.filter(b => before.reservations.some(x => x.id === b.id)), before.reservations);
  const day = (await f.call('/api/world?date=2026-11-02')).data;
  assert.equal(day.summary.breakfast, 2);
  assert.equal((await action(f, d, r, 'select', {...choice, simulateGuest: true})).status, 200);
  assert.equal(f.world().reservations.filter(b => b.requestId === r.id).length, 1);
});

test('normal mode requires the request-specific capability even when simulation is requested', async t => {
  const f = await fixture(t, {demo: false});
  const text = 'Taylor, November 1–3, two, 15:00, breakfast for two, room 102.';
  const d = (await f.send(text, [update(0, complete, text)])).data.booking;
  await publish(f, d);
  const r = (await view(f, d.id)).requests[0], choice = {...selection(r), simulateGuest: true}, before = f.world();
  assert.equal((await action(f, d, r, 'select', choice)).status, 401);
  assert.equal((await action(f, d, r, 'select', choice, f.capability('another-request'))).status, 401);
  assert.deepEqual(f.world(), before);
  assert.equal((await action(f, d, r, 'select', choice, f.capability(r.id))).status, 200);
});

test('amendment inherits original details and leaves the original intact until customer choice', async t => {
  const f = await fixture(t);
  const text = 'Taylor, Nov 1–3, two, 15:00, two breakfasts, room 102.';
  const d = (await f.send(text, [update(0, complete, text)])).data.booking;
  await publish(f, d);
  const r = (await view(f, d.id)).requests[0];
  assert.equal((await action(f, d, r, 'select', {...selection(r), simulateGuest: true})).status, 200);
  const before = f.world(), old = before.reservations.find(b => b.requestId === r.id);
  await f.call('/api/owner/new-topic', {});
  const correction = `Move ${old.id} to November 5 through November 7.`;
  const change = (await f.send(correction, [update(0, {bookingId: old.id, checkIn: '2026-11-05', checkOut: '2026-11-07'}, correction)])).data.booking;
  assert.equal(change.items[0].fields.guest, old.guest);
  assert.equal(change.items[0].fields.party, old.party);
  assert.equal(change.items[0].fields.breakfast, old.breakfast);
  assert.equal(change.items[0].fields.arrival, old.arrival);
  assert.equal(change.status, 'ready');
  assert.equal((await publish(f, change)).status, 200);
  assert.deepEqual(f.world().reservations, before.reservations);
  assert.deepEqual(f.world().tasks, before.tasks);
  let pending = (await view(f, change.id)).requests[0];
  assert.equal(pending.amendmentOf, old.id);
  assert.ok(pending.options.length);
  assert.equal((await action(f, change, pending, 'decline', {all: true, simulateGuest: true})).status, 200);
  assert.deepEqual(f.world().reservations, before.reservations);
  assert.deepEqual(f.world().tasks, before.tasks);
  assert.equal((await action(f, change, pending, 'resume', {simulateGuest: true})).status, 200);
  pending = (await view(f, change.id)).requests[0];
  assert.ok(pending.options.length);
  assert.equal((await action(f, change, pending, 'select', {...selection(pending), simulateGuest: true})).status, 200);
  const saved = f.world();
  assert.equal(saved.reservations.find(b => b.id === old.id).status, 'replaced');
  const replacement = saved.reservations.find(b => b.requestId === pending.id);
  assert.equal(replacement.replaces, old.id);
  assert.equal(replacement.checkIn, '2026-11-05');
  assert.equal(replacement.breakfast, old.breakfast);
});
