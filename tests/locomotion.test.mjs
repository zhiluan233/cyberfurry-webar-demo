import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ProceduralLocomotion, LOCOMOTION_STYLES } from '../src/locomotion.ts';
import { createDemoCharacter } from '../src/demo-character.ts';

function setup() {
  const rig = createDemoCharacter();
  return { ...rig, animation: new ProceduralLocomotion(rig.getBone) };
}

function checkFinite(rig, label) {
  rig.scene.updateMatrixWorld(true);
  rig.scene.traverse(node => {
    assert.ok(node.matrixWorld.elements.every(Number.isFinite), `${label}: ${node.name} has a finite world transform`);
    assert.ok(Math.abs(node.quaternion.length() - 1) < 1e-6, `${label}: ${node.name} rotation stays normalized`);
  });
}

test('every locomotion keeps elbows and knees within anatomical bending limits', () => {
  const rig = setup();
  assert.equal(new Set(LOCOMOTION_STYLES.map(style => style.id)).size, LOCOMOTION_STYLES.length);
  assert.ok(LOCOMOTION_STYLES.length >= 20);
  for (const style of LOCOMOTION_STYLES) {
    rig.animation.reset();
    for (let frame = 0; frame < 240; frame++) {
      rig.animation.update(1 / 60, style.id, true, true, 1.5 * style.speedMultiplier);
      for (const side of ['left', 'right']) {
        const knee = rig.getBone(`${side}LowerLeg`).quaternion;
        const elbow = rig.getBone(`${side}LowerArm`).quaternion;
        assert.ok(knee.x >= -1e-6 && knee.w >= 0, `${style.id}: ${side} knee never bends backwards`);
        assert.ok(knee.angleTo(new THREE.Quaternion()) <= 2.3, `${style.id}: ${side} knee does not overflex`);
        assert.ok(elbow.angleTo(new THREE.Quaternion()) <= 1.8, `${style.id}: ${side} elbow does not overflex`);
        assert.ok(side === 'left' ? elbow.y <= 1e-6 : elbow.y >= -1e-6, `${style.id}: mirrored elbow flexes forward`);
      }
      if (frame % 60 === 0) checkFinite(rig, style.id);
    }
  }
});

test('walk and run flex alternating knees and articulate elbows instead of rigid leg swings', () => {
  for (const style of ['walk', 'run']) {
    const rig = setup();
    const samples = { knee: [], elbow: [], asymmetry: [] };
    for (let frame = 0; frame < 180; frame++) {
      rig.animation.update(1 / 60, style, true, true, style === 'run' ? 2.5 : 1.5);
      if (frame < 30) continue;
      const left = rig.getBone('leftLowerLeg').rotation.x;
      samples.knee.push(left);
      samples.elbow.push(rig.getBone('leftLowerArm').rotation.y);
      samples.asymmetry.push(Math.abs(left - rig.getBone('rightLowerLeg').rotation.x));
    }
    assert.ok(Math.max(...samples.knee) - Math.min(...samples.knee) > 0.35);
    assert.ok(Math.max(...samples.elbow) - Math.min(...samples.elbow) > 0.1);
    assert.ok(Math.max(...samples.asymmetry) > 0.3);
  }
});

test('zero speed suppresses the gait even if a movement command remains active', () => {
  const moving = setup();
  const stopped = setup();
  for (let frame = 0; frame < 180; frame++) {
    moving.animation.update(1 / 60, 'run', true, true, 0);
    stopped.animation.update(1 / 60, 'run', false, true, 0);
  }
  for (const name of ['hips', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg', 'leftUpperArm']) {
    assert.deepEqual(moving.getBone(name).quaternion.toArray(), stopped.getBone(name).quaternion.toArray());
    assert.deepEqual(moving.getBone(name).position.toArray(), stopped.getBone(name).position.toArray());
  }
});

test('style changes blend smoothly and repeated playback/reset has no rest-pose drift', () => {
  const rig = setup();
  const rests = new Map();
  rig.scene.traverse(node => rests.set(node, { rotation: node.quaternion.clone(), position: node.position.clone() }));
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const style of LOCOMOTION_STYLES) {
      const before = rig.getBone('hips').quaternion.clone();
      rig.animation.update(1 / 60, style.id, true, true, 1.5);
      assert.ok(before.angleTo(rig.getBone('hips').quaternion) < 0.5, `${style.id}: no abrupt pelvis rotation`);
      for (let frame = 0; frame < 20; frame++) rig.animation.update(1 / 60, style.id, true, true, 1.5);
    }
    rig.animation.reset();
    for (const [node, rest] of rests) {
      assert.deepEqual(node.quaternion.toArray(), rest.rotation.toArray());
      assert.deepEqual(node.position.toArray(), rest.position.toArray());
    }
  }
});

test('crawl maintains ground clearance and fits the 0.9 metre demonstration tunnel', () => {
  const rig = setup();
  for (let frame = 0; frame < 240; frame++) {
    rig.animation.update(1 / 60, 'crawl', true, true, 0.51);
    if (frame < 60) continue;
    const box = new THREE.Box3().setFromObject(rig.scene);
    assert.ok(box.min.y >= -0.02, `crawl penetrates ground: ${box.min.y}`);
    assert.ok(box.max.y < 0.9, `crawl exceeds tunnel clearance: ${box.max.y}`);
  }
});

test('jump, landing, missing optional bones and invalid frame durations remain safe', () => {
  const rig = setup();
  for (let frame = 0; frame < 40; frame++) rig.animation.update(1 / 60, 'walk', true, false, 1.5);
  checkFinite(rig, 'jump');
  for (let frame = 0; frame < 180; frame++) rig.animation.update(1 / 60, 'walk', false, true, 0);
  checkFinite(rig, 'landing');
  assert.ok(rig.getBone('leftLowerLeg').rotation.x < 0.1, 'landing compression relaxes');
  const hips = new THREE.Group();
  hips.position.y = 0.8;
  const partial = new ProceduralLocomotion(name => name === 'hips' ? hips : null);
  const empty = new ProceduralLocomotion(() => null);
  for (const style of LOCOMOTION_STYLES) {
    for (const duration of [0, -1, NaN, Infinity, 1 / 60, 30]) {
      partial.update(duration, style.id, true, false, 1);
      empty.update(duration, style.id, true, true, 0);
    }
  }
  assert.ok(hips.quaternion.toArray().every(Number.isFinite));
  partial.reset();
  assert.equal(hips.position.y, 0.8);
});
