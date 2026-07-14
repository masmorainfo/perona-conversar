import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createActor } from 'xstate';
import { contentMachine, isTerminalState } from './index.js';

function makeContext(overrides?: Partial<import('./index.js').ContentMachineContext>) {
  return {
    contentId: 'test-001',
    channelId: 'chan-001',
    topic: 'Test Topic',
    metadata: {},
    attemptCounts: {},
    ...overrides,
  };
}

function runMachine(events: import('./index.js').ContentMachineEvent[], ctx?: Partial<import('./index.js').ContentMachineContext>) {
  const actor = createActor(contentMachine, { input: makeContext(ctx) });
  actor.start();
  for (const event of events) {
    actor.send(event);
  }
  const state = actor.getSnapshot().value as string;
  actor.stop();
  return state;
}

describe('State Machine — Happy Path', () => {
  test('DISCOVERED → EVALUATED via EVALUATE', () => {
    assert.equal(runMachine([{ type: 'EVALUATE' }]), 'EVALUATED');
  });

  test('EVALUATED → APPROVED via APPROVE', () => {
    assert.equal(
      runMachine([
        { type: 'EVALUATE' },
        { type: 'APPROVE', score: 85, direction: 'Herói Trágico' },
      ]),
      'APPROVED'
    );
  });

  test('APPROVED → RESEARCHED via RESEARCH_COMPLETE', () => {
    assert.equal(
      runMachine([
        { type: 'EVALUATE' },
        { type: 'APPROVE', score: 85, direction: 'test' },
        { type: 'RESEARCH_COMPLETE', researchPackage: {} },
      ]),
      'RESEARCHED'
    );
  });

  test('RESEARCHED → SCRIPTED → CRITIC_OK via SCRIPT + CRITIC_PASS', () => {
    assert.equal(
      runMachine([
        { type: 'EVALUATE' },
        { type: 'APPROVE', score: 85, direction: 'test' },
        { type: 'RESEARCH_COMPLETE', researchPackage: {} },
        { type: 'SCRIPT_COMPLETE', script: {} },
        { type: 'CRITIC_PASS', evaluation: {} },
      ]),
      'CRITIC_OK'
    );
  });
});

describe('State Machine — STORYBOARD_PLANNED isolation', () => {
  const toStoryboard: import('./index.js').ContentMachineEvent[] = [
    { type: 'EVALUATE' },
    { type: 'APPROVE', score: 85, direction: 'test' },
    { type: 'RESEARCH_COMPLETE', researchPackage: {} },
    { type: 'SCRIPT_COMPLETE', script: {} },
    { type: 'CRITIC_PASS', evaluation: {} },
    { type: 'STORYBOARD_COMPLETE', manifestPath: '/manifests/test.json' },
  ];

  test('CRITIC_OK → STORYBOARD_PLANNED via STORYBOARD_COMPLETE', () => {
    assert.equal(runMachine(toStoryboard), 'STORYBOARD_PLANNED');
  });

  test('STORYBOARD_PLANNED → PRODUCED via MEDIA_COMPLETE', () => {
    assert.equal(
      runMachine([...toStoryboard, { type: 'MEDIA_COMPLETE', assetUrls: { img: '/a.jpg' } }]),
      'PRODUCED'
    );
  });

  test('STORYBOARD_PLANNED stores manifestPath in metadata', () => {
    const actor = createActor(contentMachine, { input: makeContext() });
    actor.start();
    for (const e of toStoryboard) actor.send(e);
    const snap = actor.getSnapshot();
    assert.equal(snap.context.metadata.storyManifestPath, '/manifests/test.json');
    actor.stop();
  });

  test('STORYBOARD_PLANNED → ABANDONED via ABANDON', () => {
    assert.equal(
      runMachine([...toStoryboard, { type: 'ABANDON', reason: 'test' }]),
      'ABANDONED'
    );
  });
});

describe('State Machine — Full pipeline to PENDING_REVIEW', () => {
  test('Complete happy path reaches PENDING_REVIEW', () => {
    const state = runMachine([
      { type: 'EVALUATE' },
      { type: 'APPROVE', score: 90, direction: 'test' },
      { type: 'RESEARCH_COMPLETE', researchPackage: {} },
      { type: 'SCRIPT_COMPLETE', script: {} },
      { type: 'CRITIC_PASS', evaluation: {} },
      { type: 'STORYBOARD_COMPLETE', manifestPath: '/m.json' },
      { type: 'MEDIA_COMPLETE', assetUrls: {} },
      { type: 'RENDER_COMPLETE', videoFile: '/v.mp4' },
      { type: 'QC_PASS', score: 95, checklist: {} },
      { type: 'CINEMATIC_PASS', evaluation: {} },
    ]);
    assert.equal(state, 'PENDING_REVIEW');
  });
});

describe('State Machine — Retry limits', () => {
  test('CRITIC_FAIL exceeds max retries → ABANDONED', () => {
    const state = runMachine([
      { type: 'EVALUATE' },
      { type: 'APPROVE', score: 85, direction: 'test' },
      { type: 'RESEARCH_COMPLETE', researchPackage: {} },
      // Fail 1: guard sees count=0 < 3 → REVISED, then count=1
      { type: 'SCRIPT_COMPLETE', script: {} },
      { type: 'CRITIC_FAIL', evaluation: {} },
      // Fail 2: guard sees count=1 < 3 → REVISED, then count=2
      { type: 'SCRIPT_COMPLETE', script: {} },
      { type: 'CRITIC_FAIL', evaluation: {} },
      // Fail 3: guard sees count=2 < 3 → REVISED, then count=3
      { type: 'SCRIPT_COMPLETE', script: {} },
      { type: 'CRITIC_FAIL', evaluation: {} },
      // Fail 4: guard sees count=3 >= 3 → ABANDONED
      { type: 'SCRIPT_COMPLETE', script: {} },
      { type: 'CRITIC_FAIL', evaluation: {} },
    ]);
    assert.equal(state, 'ABANDONED');
    assert.ok(isTerminalState('ABANDONED'));
  });
});

describe('State Machine — Terminal states', () => {
  test('REJECTED is terminal', () => {
    assert.ok(isTerminalState('REJECTED'));
  });

  test('LEARNED is terminal', () => {
    assert.ok(isTerminalState('LEARNED'));
  });

  test('STORYBOARD_PLANNED is NOT terminal', () => {
    assert.ok(!isTerminalState('STORYBOARD_PLANNED'));
  });
});
