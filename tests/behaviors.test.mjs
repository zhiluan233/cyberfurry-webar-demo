import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { BehaviorPlanner } from '../src/behaviors.ts';

const waypointModes = ['random-patrol', 'patrol-route', 'wander', 'orbit', 'figure-eight', 'pace', 'search'];

test('autonomous behaviors retain the same goal indefinitely when obstructed', () => {
  for (const mode of waypointModes) {
    const planner = new BehaviorPlanner();
    const position = new Vector3();
    const player = new Vector3(9, 0, 9);
    planner.setMode(mode, position, new Vector3(8, 0, 8));
    const initial = planner.update(0.1, position, player, null);
    assert.ok(initial.target, `${mode}: produces an initial goal`);
    // This exceeds the previous 16-second timeout many times, without either
    // moving the character or changing its requested behavior.
    for (let frame = 0; frame < 1800; frame++) {
      const intent = planner.update(0.1, position, player, null);
      assert.deepEqual(intent.target?.toArray(), initial.target.toArray(), `${mode}: blocked goal was replaced`);
      assert.equal(intent.activity, initial.activity, `${mode}: obstruction started an unrequested pause`);
      assert.equal(planner.mode, mode);
      assert.equal(planner.completed, false);
    }
  }
});

test('autonomous waypoints advance after a real arrival and their normal observation pause', () => {
  for (const mode of waypointModes) {
    const planner = new BehaviorPlanner();
    const player = new Vector3(9, 0, 9);
    planner.setMode(mode, new Vector3(), new Vector3(8, 0, 8));
    const first = planner.update(0.1, new Vector3(), player, null).target;
    assert.ok(first);
    let next = planner.update(0.1, first.clone(), player, null);
    for (let frame = 0; frame < 40 && !next.target; frame++) next = planner.update(0.1, first.clone(), player, null);
    assert.ok(next.target, `${mode}: resumes after the normal observation pause`);
    assert.ok(next.target.distanceTo(first) > 0.24, `${mode}: selects the next waypoint after arrival`);
    assert.equal(planner.mode, mode);
  }
});

test('being raised above a waypoint does not count as reaching it', () => {
  const planner = new BehaviorPlanner();
  const player = new Vector3(9, 0, 9);
  planner.setMode('pace', new Vector3(), null);
  const goal = planner.update(0.1, new Vector3(), player, null).target;
  const raised = goal.clone().add(new Vector3(0, 2, 0));
  for (let frame = 0; frame < 300; frame++) {
    assert.deepEqual(planner.update(0.1, raised, player, null).target.toArray(), goal.toArray());
  }
  assert.equal(planner.update(0.1, goal, player, null).activity, '抵达路点 · 观察');
});
