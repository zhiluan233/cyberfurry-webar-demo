import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { Navigator } from '../src/navigation.ts';
import { BEHAVIORS, BehaviorPlanner } from '../src/behaviors.ts';

const material = new MeshBasicMaterial();
const v = (x, y = 0, z = 0) => new Vector3(x, y, z);
function floor(size = 18, x = 0, z = 0) {
  const mesh = new Mesh(new PlaneGeometry(size, size), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}
function box(x, y, z, width, height, depth) {
  const mesh = new Mesh(new BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}
function plan(nav, start, target, meshes, { radius = 0.2, height = 1.6, step = 0.25 } = {}) {
  let direction;
  for (let i = 0; i < 1600; i += 1) {
    // Zero time prevents periodic retry from hiding a deterministic terminal result.
    direction = nav.getDirection(start, target, { meshes }, radius, height, step, 0);
    if (direction.lengthSq() || !nav.status.includes('规划')) break;
  }
  assert.ok(!nav.status.includes('规划'), `planner did not finish: ${nav.status}`);
  return direction;
}

test('pathfinding follows supported open ground; direct mode bypasses planning', () => {
  const nav = new Navigator();
  assert.ok(plan(nav, v(-2), v(2), [floor()]).x > 0.99);
  assert.equal(nav.path.at(-1).x, 2);
  nav.mode = 'direct';
  assert.ok(plan(nav, v(-2), v(2), []).x > 0.99);
  assert.equal(nav.status, '直线移动');
});

test('A* routes around a wall with capsule clearance instead of falling back through it', () => {
  const nav = new Navigator();
  const meshes = [floor(), box(0, 1, 0, 0.8, 2, 4)];
  const direction = plan(nav, v(-3), v(3), meshes);
  assert.ok(direction.lengthSq() > 0);
  assert.ok(nav.path.some(point => Math.abs(point.z) >= 2.2), 'route must go around wall end');
  assert.ok(nav.path.every(point => Math.abs(point.x) >= 0.58 || Math.abs(point.z) >= 2.18), 'capsule cannot clip wall corners');
  assert.ok(nav.path.at(-1).distanceTo(v(3)) < 0.01);
  assert.ok(nav.path.length <= 4, 'a simple detour should contain turns, not every A* grid cell');
  let from = v(-3);
  for (const to of nav.path) {
    for (let sample = 0; sample <= 80; sample += 1) {
      const point = from.clone().lerp(to, sample / 80);
      const wallDistance = Math.hypot(Math.max(0, Math.abs(point.x) - 0.4), Math.max(0, Math.abs(point.z) - 2));
      assert.ok(wallDistance >= 0.19, 'smoothed segments must retain clearance around wall corners');
    }
    from = to;
  }
});

test('unchanged safe detours do not pause for periodic replanning', () => {
  const nav = new Navigator();
  const meshes = [floor(), box(0, 1, 0, 0.8, 2, 4)];
  plan(nav, v(-3), v(3), meshes);
  const route = nav.path;
  for (let frame = 0; frame < 65; frame += 1) {
    assert.ok(nav.getDirection(v(-3), v(3), { meshes }, 0.2, 1.6, 0.25, 0.1).lengthSq() > 0);
  }
  assert.equal(nav.path, route, 'live validation should preserve a valid route beyond four seconds');
});

test('an enclosing wall, unsupported target, and unknown AR space stop movement', () => {
  const nav = new Navigator();
  assert.equal(plan(nav, v(), v(3), []).lengthSq(), 0);
  assert.equal(plan(new Navigator(), v(), v(7), [floor(3)]).lengthSq(), 0);
  assert.equal(plan(new Navigator(), v(-2), v(), [floor(6), box(0, 1, 0, 1.8, 2, 1.8)]).lengthSq(), 0);
});

test('disconnected floor islands do not become a route across void', () => {
  const nav = new Navigator();
  const meshes = [floor(2, -2), floor(2, 2)];
  assert.equal(plan(nav, v(-2), v(2), meshes).lengthSq(), 0);
});

test('low ceilings reject standing capsules and accept a crawling capsule', () => {
  const meshes = [floor(10), box(0, 1.05, 0, 2, 0.3, 3)];
  assert.equal(plan(new Navigator(), v(), v(0, 0, -2), meshes).lengthSq(), 0);
  assert.ok(plan(new Navigator(), v(), v(0, 0, -2), meshes, { height: 0.65 }).lengthSq() > 0);
});

test('supported stair treads allow max-step ascents and reject an oversized step', () => {
  const meshes = [floor(10)];
  for (let i = 0; i < 4; i += 1) meshes.push(box(i * 0.6, (i + 1) * 0.1, 0, 0.6, (i + 1) * 0.2, 2));
  const nav = new Navigator();
  nav.requireTargetHeight = true;
  assert.ok(plan(nav, v(-1), v(1.8, 0.8), meshes).lengthSq() > 0);
  assert.ok(Math.abs(nav.path.at(-1).y - 0.8) < 0.01);
  const high = new Navigator();
  high.requireTargetHeight = true;
  assert.equal(plan(high, v(-1), v(0, 0.8), [floor(5), box(0, 0.4, 0, 1, 0.8, 2)]).lengthSq(), 0);
});

test('surface-picked targets on unreachable overhead platforms cannot resolve underneath', () => {
  const nav = new Navigator();
  nav.requireTargetHeight = true;
  assert.equal(plan(nav, v(-2), v(0, 2), [floor(6), box(0, 1.9, 0, 1.5, 0.2, 1.5)]).lengthSq(), 0);
});

test('adding a blocking collider invalidates the current route', () => {
  const nav = new Navigator();
  const ground = floor(5);
  assert.ok(plan(nav, v(-1), v(1), [ground]).x > 0);
  assert.equal(plan(nav, v(-1), v(1), [ground, box(-1, 0.8, 0, 0.6, 1.6, 0.6)]).lengthSq(), 0);
});

test('a moved collider invalidates a smoothed edge and replans around the new obstruction', () => {
  const nav = new Navigator();
  const obstacle = box(0, 1, 4, 0.8, 2, 2);
  const meshes = [floor(), obstacle];
  assert.ok(plan(nav, v(-3), v(3), meshes).x > 0.99);
  obstacle.position.z = 0;
  nav.getDirection(v(-3), v(3), { meshes }, 0.2, 1.6, 0.25, 0.1);
  assert.equal(nav.getDirection(v(-3), v(3), { meshes }, 0.2, 1.6, 0.25, 0.1).lengthSq(), 0);
  assert.ok(plan(nav, v(-3), v(3), meshes).lengthSq() > 0);
  assert.ok(nav.path.some(point => Math.abs(point.z) >= 1.2));
});

test('changing a surface-picked target height replans even when its X/Z remains unchanged', () => {
  const nav = new Navigator();
  nav.requireTargetHeight = true;
  const meshes = [floor(6), box(0, 1.9, 0, 1.5, 0.2, 1.5)];
  assert.ok(plan(nav, v(-2), v(), meshes).lengthSq() > 0);
  for (let frame = 0; frame < 10; frame += 1) nav.getDirection(v(-2), v(0, 2), { meshes }, 0.2, 1.6, 0.25, 0.05);
  assert.equal(plan(nav, v(-2), v(0, 2), meshes).lengthSq(), 0, 'must not reuse the route underneath the newly picked platform');
});

test('moving-target replans are throttled while an existing safe path remains usable', () => {
  const nav = new Navigator();
  const meshes = [floor(12)];
  plan(nav, v(-2), v(2), meshes);
  nav.getDirection(v(-2), v(3), { meshes }, 0.2, 1.6, 0.25, 0.05);
  assert.equal(nav.path.at(-1).x, 2, 'do not rebuild for every target update');
  for (let frame = 0; frame < 10; frame += 1) nav.getDirection(v(-2), v(3), { meshes }, 0.2, 1.6, 0.25, 0.05);
  assert.equal(nav.path.at(-1).x, 3, 'latest target is adopted after throttle interval');
});

test('small target movements are adopted near the old endpoint without interrupting long routes', () => {
  const nav = new Navigator();
  nav.requireTargetHeight = true;
  const meshes = [floor(60)];
  plan(nav, v(), v(1), meshes);
  assert.equal(nav.getDirection(v(1), v(1.3), { meshes }, 0.2, 1.6, 0.25, 0.05).lengthSq(), 0);
  assert.equal(nav.path.at(-1).x, 1, 'the endpoint adjustment still obeys the moving-target throttle');
  let direction;
  for (let frame = 0; frame < 12; frame += 1) direction = nav.getDirection(v(1), v(1.3), { meshes }, 0.2, 1.6, 0.25, 0.05);
  assert.ok(direction.x > 0.99, 'a small target displacement must not leave the follower stuck at the old endpoint');
  assert.equal(nav.path.at(-1).x, 1.3);

  const distant = new Navigator();
  plan(distant, v(), v(4), meshes);
  const route = distant.path;
  for (let frame = 0; frame < 100; frame += 1) distant.getDirection(v(), v(4.3), { meshes }, 0.2, 1.6, 0.25, 0.05);
  assert.equal(distant.path, route, 'small target motion does not rebuild an otherwise valid long route');
});

test('go-to snapshots its target, completes only at the same elevation, and reset clears state', () => {
  const planner = new BehaviorPlanner();
  const cursor = v(3);
  planner.setMode('go-to', v(), cursor);
  cursor.x = 9;
  assert.equal(planner.update(0.016, v(), v(), cursor).target.x, 3);
  planner.update(0.016, v(3, -1), v(), null);
  assert.equal(planner.completed, false);
  assert.equal(planner.update(0.016, v(3), v(), null).target, null);
  assert.equal(planner.completed, true);
  planner.reset(v());
  assert.equal(planner.completed, false);
});

test('patrol waits at waypoints and advances, and all behavior modes produce finite goals', () => {
  const planner = new BehaviorPlanner();
  planner.setMode('patrol-route', v(), null);
  const first = planner.update(0.016, v(), v(4), null).target;
  assert.ok(first);
  assert.equal(planner.update(0.016, first, v(4), null).target, null);
  let next;
  for (let i = 0; i < 12; i += 1) next = planner.update(0.1, first, v(4), null).target;
  assert.ok(next && next.distanceTo(first) > 1);
  for (const item of BEHAVIORS) {
    planner.setMode(item.id, v(), v(3));
    for (let frame = 0; frame < 100; frame += 1) {
      const intent = planner.update(0.05, v(), v(2), v(3));
      assert.ok(!intent.target || intent.target.toArray().every(Number.isFinite), item.id);
    }
  }
});

test('guard watches a nearby visitor without oscillating between visitor and post', () => {
  const planner = new BehaviorPlanner();
  planner.setMode('guard', v(), null);
  assert.equal(planner.update(0.016, v(1.5), v(2), null).target, null);
  assert.equal(planner.update(0.016, v(1.5), v(8), null).target.x, 0);
});
