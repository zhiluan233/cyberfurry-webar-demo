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

function setupRotatedBasis(yaw) {
  const rig = createDemoCharacter();
  const basis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const inverse = basis.clone().invert();
  rig.scene.traverse(node => {
    if (node === rig.scene) return;
    node.position.applyQuaternion(basis);
    node.quaternion.premultiply(basis).multiply(inverse);
  });
  // Like rotateVRM0, the outer scene faces forward while bone-local axes retain
  // their original basis. Inspecting only world positions misses this case.
  rig.scene.quaternion.copy(inverse);
  rig.scene.updateMatrixWorld(true);
  return { ...rig, animation: new ProceduralLocomotion(rig.getBone) };
}

test('all poses adapt to the local humanoid basis even after its scene rotates forward', () => {
  for (const yaw of [Math.PI, Math.PI / 2]) {
    const reference = setup();
    const transformed = setupRotatedBasis(yaw);
    for (const style of LOCOMOTION_STYLES) {
      reference.animation.reset();
      transformed.animation.reset();
      for (let frame = 0; frame < 90; frame++) {
        const grounded = frame < 70;
        reference.animation.update(1 / 60, style.id, true, grounded, 1.5 * style.speedMultiplier);
        transformed.animation.update(1 / 60, style.id, true, grounded, 1.5 * style.speedMultiplier);
        if (frame % 10 !== 0) continue;
        for (const name of ['hips', 'head', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot']) {
          const expected = reference.getBone(name).getWorldPosition(new THREE.Vector3());
          const actual = transformed.getBone(name).getWorldPosition(new THREE.Vector3());
          assert.ok(actual.distanceTo(expected) < 1e-6, `${style.id}: ${name} differs under local yaw ${yaw}`);
        }
      }
    }
  }
});

test('VRM0-style reversed local arms lower below shoulders during walking and running', () => {
  for (const style of ['walk', 'run', 'sprint']) {
    const rig = setupRotatedBasis(Math.PI);
    for (let frame = 0; frame < 180; frame++) {
      rig.animation.update(1 / 60, style, true, true, 1.8);
      if (frame < 60) continue;
      for (const side of ['left', 'right']) {
        const shoulder = rig.getBone(`${side}UpperArm`).getWorldPosition(new THREE.Vector3());
        const hand = rig.getBone(`${side}Hand`).getWorldPosition(new THREE.Vector3());
        assert.ok(hand.y < shoulder.y, `${style}: ${side} hand incorrectly raised over its shoulder`);
      }
    }
  }
});

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

test('walking stride follows travelled distance across slow and fast speeds', () => {
  const measuredStrides = [];
  for (const speed of [0.3, 0.7, 1.5]) {
    const rig = setup();
    const foot = new THREE.Vector3();
    const crossings = [];
    let previousZ = 0;
    for (let frame = 0; frame < 2400; frame++) {
      rig.animation.update(1 / 120, 'walk', true, true, speed);
      rig.scene.updateMatrixWorld(true);
      rig.getBone('leftFoot').getWorldPosition(foot);
      // Measure a completed forward foot return from the visible skeleton;
      // this deliberately does not inspect the animation's private phase.
      if (frame > 240 && previousZ < 0 && foot.z >= 0) crossings.push(frame / 120 * speed);
      previousZ = foot.z;
    }
    assert.ok(crossings.length >= 4, 'enough complete strides to measure cadence');
    measuredStrides.push((crossings.at(-1) - crossings[0]) / (crossings.length - 1));
  }
  assert.ok(Math.max(...measuredStrides) - Math.min(...measuredStrides) < 0.015,
    `stride distance must stay consistent as speed changes: ${measuredStrides}`);
});

test('scaled avatars use the same pose at proportionally scaled travel speeds', () => {
  const regular = setup();
  const large = createDemoCharacter();
  large.scene.scale.setScalar(2);
  large.scene.updateMatrixWorld(true);
  large.animation = new ProceduralLocomotion(large.getBone);
  for (let frame = 0; frame < 360; frame++) {
    regular.animation.update(1 / 60, 'run', true, true, 2.4);
    large.animation.update(1 / 60, 'run', true, true, 4.8);
  }
  for (const name of ['hips', 'leftUpperLeg', 'leftLowerLeg', 'rightUpperLeg', 'rightLowerLeg']) {
    assert.ok(regular.getBone(name).quaternion.angleTo(large.getBone(name).quaternion) < 1e-6, `${name}: scale-aware cadence`);
    assert.ok(regular.getBone(name).position.distanceTo(large.getBone(name).position) < 1e-6, `${name}: scale-aware support height`);
  }
});

test('walk, run and sprint lift the returning foot while the supporting foot stays near the ground', () => {
  for (const fps of [30, 60, 120]) {
  for (const [style, speed, requiredLift] of [['walk', 1.5, 0.045], ['run', 2.475, 0.16], ['sprint', 3.525, 0.19]]) {
    const rig = setup();
    const previous = new Map();
    const positions = [];
    const contactSlip = [];
    const supportKnees = [];
    const swingKnees = [];
    const restAnkleHeight = rig.getBone('leftFoot').getWorldPosition(new THREE.Vector3()).y;
    let minimumSoleHeight = Infinity;
    for (let frame = 0; frame < fps * 8; frame++) {
      rig.scene.position.z += speed / fps;
      rig.animation.update(1 / fps, style, true, true, speed);
      rig.scene.updateMatrixWorld(true);
      if (frame > fps * 2) minimumSoleHeight = Math.min(minimumSoleHeight, new THREE.Box3().setFromObject(rig.scene).min.y);
      for (const side of ['left', 'right']) {
        const foot = rig.getBone(`${side}Foot`).getWorldPosition(new THREE.Vector3());
        const before = previous.get(side);
        const knee = rig.getBone(`${side}LowerLeg`).rotation.x;
        if (frame > fps * 2 && before) {
          positions.push(foot.y);
          if (foot.y < restAnkleHeight + 0.015 && Math.abs(foot.y - before.y) * fps < 0.15) {
            contactSlip.push(Math.abs(foot.z - before.z) * fps);
            supportKnees.push(knee);
          } else if (foot.y > restAnkleHeight + requiredLift * 0.7) swingKnees.push(knee);
        }
        previous.set(side, foot);
      }
    }
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    assert.ok(minimumSoleHeight >= -0.01, `${style}: sole penetrates ground (${minimumSoleHeight})`);
    assert.ok(Math.max(...positions) - restAnkleHeight > requiredLift, `${style}: returning foot must clear ground`);
    assert.ok(contactSlip.length > fps * 0.5, `${style} at ${fps} FPS: gait has a measurable support interval`);
    assert.ok(mean(contactSlip) < speed * 0.05, `${style} at ${fps} FPS: planted foot sliding ${mean(contactSlip)} m/s`);
    assert.ok(mean(swingKnees) > mean(supportKnees) + 0.15, `${style}: knee flexion belongs to foot recovery, not planted support`);
  }
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

test('stairs gaits retain one supported foot on level platforms instead of floating or sinking', () => {
  for (const fps of [30, 60, 120]) {
    for (const [style, speed] of [['stairs-up', 0.96], ['stairs-down', 0.87]]) {
      for (const basis of [0, Math.PI]) {
        const rig = setupRotatedBasis(basis);
        const restHeight = rig.getBone('leftFoot').getWorldPosition(new THREE.Vector3()).y;
        let greatestSupportGap = -Infinity;
        let leastSupportHeight = Infinity;
        let swingClearance = 0;
        for (let frame = 0; frame < fps * 5; frame++) {
          rig.animation.update(1 / fps, style, true, true, speed);
          if (frame < fps) continue;
          const heights = ['leftFoot', 'rightFoot'].map(name => rig.getBone(name).getWorldPosition(new THREE.Vector3()).y - restHeight);
          greatestSupportGap = Math.max(greatestSupportGap, Math.min(...heights));
          leastSupportHeight = Math.min(leastSupportHeight, ...heights);
          swingClearance = Math.max(swingClearance, ...heights);
        }
        assert.ok(greatestSupportGap < 0.025, `${style} ${fps} FPS: both support feet float ${greatestSupportGap} m`);
        assert.ok(leastSupportHeight > -0.015, `${style} ${fps} FPS: support foot sinks ${leastSupportHeight} m`);
        assert.ok(swingClearance > (style === 'stairs-up' ? 0.17 : 0.09), `${style}: swing foot retains stair clearance`);
      }
    }
  }
});

test('stairs use different contact heights when the two feet straddle a riser', () => {
  const surface = point => point.z > 0 ? 0.2 : 0;
  for (const style of ['stairs-up', 'stairs-down']) {
    const rig = setup();
    const feet = ['left', 'right'].map(side => {
      const foot = rig.getBone(`${side}Foot`);
      const sole = foot.getWorldPosition(new THREE.Vector3());
      sole.y = 0;
      const local = foot.worldToLocal(sole);
      return { side, foot, local, forefootLocal: local.clone() };
    });
    rig.animation.configureGrounding(feet, () => 0, surface);
    let contactsOnTwoLevels = 0;
    for (let frame = 0; frame < 360; frame++) {
      rig.animation.update(1 / 60, style, true, true, 0.7);
      if (frame < 60) continue;
      const soles = feet.map(({ foot, local }) => foot.localToWorld(local.clone()));
      if (surface(soles[0]) !== surface(soles[1]) && soles.every(sole => Math.abs(sole.y - surface(sole)) < 0.025)) contactsOnTwoLevels++;
    }
    assert.ok(contactsOnTwoLevels > 12, `${style} uses both real treads during double support`);
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
