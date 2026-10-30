import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import {mountWorld} from '../server/world-api.js';

async function fixture(t, {ownerInterpreter, opsInterpreter} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stayweave-owner-'));
  const calls = {owner: 0, ops: 0};
  const owner = async (...args) => {
    calls.owner++;
    return ownerInterpreter ? ownerInterpreter(...args) : {value: {tool: 'brief'}};
  };
  const ops = async (...args) => {
    calls.ops++;
    return opsInterpreter ? opsInterpreter(...args) : {kind: 'linen_count', cleanSets: 70, message: args[0], evidence: args[0]};
  };
  const start = async () => {
    const app = express();
    app.use(express.json());
    mountWorld(app, dir, async () => ({claims: []}), {ownerInterpreter: owner, opsInterpreter: ops});
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    return server;
  };
  let server = await start();
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, {recursive: true, force: true});
  });
  const call = async (url, body, headers = {}) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {'Content-Type': 'application/json', ...headers},
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    return {status: response.status, data: await response.json()};
  };
  return {
    call, calls,
    world: () => fs.readFileSync(path.join(dir, 'world.json'), 'utf8'),
    writeWorld: state => fs.writeFileSync(path.join(dir, 'world.json'), JSON.stringify(state, null, 2)),
    restart: async () => { await new Promise(resolve => server.close(resolve)); server = await start(); },
  };
}

const message = (id, text, extra = {}) => ({id, message: text, ...extra});
const reportRoute = async () => ({value: {tool: 'report'}});

test('owner summary is read-only and invalid model routes do not enter the conversation', async t => {
  let route = {tool: 'brief'};
  const f = await fixture(t, {ownerInterpreter: async () => ({value: route})});
  const before = f.world();
  const brief = await f.call('/api/owner/message', message('owner-summary-0001', 'Summarize today'));
  assert.equal(brief.status, 200);
  assert.equal(brief.data.tool, 'brief');
  assert.ok(brief.data.facts.length);
  assert.equal(f.world(), before);
  route = {tool: 'invented_action'};
  assert.equal((await f.call('/api/owner/message', message('invalid-tool-0001', 'Invent a tool'))).status, 422);
  route = {tool: 'rooms', roomId: '999'};
  assert.equal((await f.call('/api/owner/message', message('invalid-room-0001', 'Inspect room 999'))).status, 422);
  assert.equal(f.world(), before);
  assert.deepEqual((await f.call('/api/owner/conversation')).data.messages.map(m => m.id), ['owner-summary-0001']);
  assert.equal(f.calls.ops, 0);
});

test('report preview leaves world unchanged, records once on confirmation, and survives restart', async t => {
  const f = await fixture(t, {ownerInterpreter: reportRoute});
  const before = f.world();
  const input = message('owner-report-00001', 'I counted 70 clean linen sets.');
  const preview = await f.call('/api/owner/message', input);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.proposal.status, 'proposed');
  assert.equal(preview.data.proposal.incident.kind, 'linen_count');
  assert.equal(f.world(), before);
  assert.equal((await f.call('/api/owner/message/owner-report-00001/confirm', {confirmed: false})).status, 400);
  assert.equal((await f.call('/api/owner/message/owner-report-00001/confirm', {confirmed: 'true'})).status, 400);
  assert.equal(f.world(), before);
  const confirm = await f.call('/api/owner/message/owner-report-00001/confirm', {confirmed: true});
  assert.equal(confirm.status, 200);
  assert.equal(confirm.data.readback, true);
  assert.equal(confirm.data.proposal.status, 'recorded');
  const saved = JSON.parse(f.world());
  assert.equal(saved.autopilot.cases.filter(c => c.key === `owner-chat:${input.id}`).length, 1);
  assert.equal(saved.autopilot.cases[0].incident.cleanSets, 70);
  const repeated = await f.call('/api/owner/message/owner-report-00001/confirm', {confirmed: true});
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.proposal.case.id, confirm.data.proposal.case.id);
  assert.equal(f.world(), JSON.stringify(saved, null, 2));
  await f.restart();
  const conversation = await f.call('/api/owner/conversation');
  assert.equal(conversation.status, 200);
  assert.equal(conversation.data.messages.length, 1);
  assert.equal(conversation.data.messages[0].proposal.case.id, confirm.data.proposal.case.id);
  const retry = await f.call('/api/owner/message', input);
  assert.equal(retry.data.proposal.status, 'recorded');
  assert.equal(f.calls.owner, 1);
  assert.equal(f.calls.ops, 1);
  assert.equal((await f.call('/api/owner/message/owner-report-00001/confirm', {confirmed: true})).data.proposal.case.id, confirm.data.proposal.case.id);
  assert.equal(JSON.parse(f.world()).autopilot.cases.filter(c => c.key === `owner-chat:${input.id}`).length, 1);
});

test('message IDs reject changed input or shortcut without another model call', async t => {
  const f = await fixture(t);
  const input = message('owner-idempotent-01', 'What is happening?');
  assert.equal((await f.call('/api/owner/message', input)).status, 200);
  assert.equal((await f.call('/api/owner/message', input)).status, 200);
  assert.equal((await f.call('/api/owner/message', {...input, message: 'Different request'})).status, 409);
  assert.equal((await f.call('/api/owner/message', {...input, quick: 'brief'})).status, 409);
  assert.equal(f.calls.owner, 1);
  assert.equal((await f.call('/api/owner/conversation')).data.messages.length, 1);
});

test('a report preview becomes stale when the world version changes', async t => {
  const f = await fixture(t, {ownerInterpreter: reportRoute});
  const input = message('owner-stale-000001', 'I counted 70 clean linen sets.');
  const preview = await f.call('/api/owner/message', input);
  assert.equal(preview.status, 200);
  assert.equal((await f.call('/api/world/linen', {quantity: 1})).status, 200);
  const current = f.world();
  const result = await f.call(`/api/owner/message/${input.id}/confirm`, {confirmed: true});
  assert.equal(result.status, 409);
  assert.equal(f.world(), current);
  assert.equal((JSON.parse(current).autopilot?.cases || []).length, 0);
});

test('owner report cannot fabricate consent for a guest arrival change', async t => {
  const f = await fixture(t, {ownerInterpreter: reportRoute, opsInterpreter: async message => ({kind: 'arrival_change', bookingId: 'booking-1', arrival: 900, message, evidence: message, consent: true})});
  const before = f.world();
  const response = await f.call('/api/owner/message', message('owner-consent-0001', 'The guest will arrive at 15:00.'));
  assert.equal(response.status, 422);
  assert.match(response.data.error, /consent/i);
  assert.equal(f.world(), before);
  assert.equal((await f.call('/api/owner/conversation')).data.messages.length, 0);
});


test('a raw incident key does not collide with an owner report namespace', async t => {
  const f = await fixture(t, {ownerInterpreter: reportRoute});
  const id = 'shared-incident-key-01';
  const version = JSON.parse(f.world()).version;
  const prior = await f.call('/api/world/autopilot/report', {
    version, live: false, incident: {kind: 'linen_count', cleanSets: 10},
  }, {'Idempotency-Key': id});
  assert.equal(prior.status, 200);
  const afterPrior = f.world();
  const preview = await f.call('/api/owner/message', message(id, 'I counted 70 clean linen sets.'));
  assert.equal(preview.status, 200);
  assert.equal(preview.data.proposal.case.incident.cleanSets, 70);
  assert.equal(f.world(), afterPrior);
  const confirmation = await f.call(`/api/owner/message/${id}/confirm`, {confirmed: true});
  assert.equal(confirmation.status, 200);
  assert.notEqual(confirmation.data.proposal.case.id, prior.data.case.id);
  assert.equal(confirmation.data.proposal.case.incident.cleanSets, 70);
  const cases = JSON.parse(f.world()).autopilot.cases;
  assert.equal(cases.filter(c => c.key === id && c.incident.cleanSets === 10).length, 1);
  assert.equal(cases.filter(c => c.key === `owner-chat:${id}` && c.incident.cleanSets === 70).length, 1);
});

test('a conflicting incident in the owner namespace cannot be acknowledged as the proposal', async t => {
  const f = await fixture(t, {ownerInterpreter: reportRoute});
  const id = 'owner-key-conflict-01';
  const version = JSON.parse(f.world()).version;
  const prior = await f.call('/api/world/autopilot/report', {
    version, live: false, incident: {kind: 'linen_count', cleanSets: 10},
  }, {'Idempotency-Key': id});
  assert.equal(prior.status, 200);
  const seeded = JSON.parse(f.world());
  seeded.autopilot.cases[0].key = `owner-chat:${id}`;
  seeded.autopilot.cases[0].source = 'owner_chat';
  f.writeWorld(seeded);
  await f.restart();
  const before = f.world();
  const preview = await f.call('/api/owner/message', message(id, 'I counted 70 clean linen sets.'));
  if (preview.status === 409) {
    assert.equal(f.world(), before);
    return;
  }
  assert.equal(preview.status, 200);
  const confirmation = await f.call(`/api/owner/message/${id}/confirm`, {confirmed: true});
  assert.equal(confirmation.status, 409);
  assert.equal(f.world(), before);
});
