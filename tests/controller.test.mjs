import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDemoCharacter } from '../src/demo-character.ts';
import { CharacterController } from '../src/character-controller.ts';
import { LOCOMOTION_STYLES } from '../src/locomotion.ts';
import { BEHAVIORS } from '../src/behaviors.ts';
import { MToonMaterial } from '@pixiv/three-vrm';
import { setLegacyShadeCompatibility } from '../src/material-compat.ts';
const baseConfig = JSON.parse(readFileSync(new URL('../public/config/character.json', import.meta.url)));
function setup() {
  const config = structuredClone(baseConfig);
  const character = new CharacterController(new THREE.Scene(), config, () => {});
  const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 60), new THREE.MeshBasicMaterial()); floor.position.y = -0.1; floor.updateMatrixWorld(true);
  character.useDemoCharacter(createDemoCharacter);
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.65, 5);
  const world = {meshes:[floor]};
  character.position.set(0,0,0); character.grounded = true;
  return {character, config, camera, world};
}
function tick(s, frames=120) { for(let i=0;i<frames;i++) s.character.update(1/60,s.camera,new THREE.Vector3(3,0,1),s.world); }
test('production controller starts empty and remains inert until a character is loaded',()=>{
  const config = structuredClone(baseConfig);
  const character = new CharacterController(new THREE.Scene(), config, () => {});
  assert.equal(character.loaded,false); assert.equal(character.hasVRM,false); assert.equal(character.root.visible,false);
  assert.equal(character.root.children.length,0);
  character.joystick.set(1,0);
  character.update(1/60,new THREE.PerspectiveCamera(),null,{meshes:[]});
  assert.deepEqual(character.position.toArray(),[0,0,0]);
});
test('the default preset plays configured clips and natural walking uses the procedural gait', () => {
  const s = setup();
  const { character } = s;
  const rig = character.root.getObjectByName('Articulated locomotion demonstrator');
  const hips = rig.getObjectByName('hips');
  const mixer = new THREE.AnimationMixer(rig);
  character.mixer = mixer;
  const height = hips.position.y + 0.1;
  const positions = [hips.position.x, height, hips.position.z];
  const clip = new THREE.AnimationClip('configured walk', 1, [new THREE.VectorKeyframeTrack('hips.position', [0], positions)]);
  const action = mixer.clipAction(clip);
  character.actions.walk = action;
  assert.equal(character.locomotionStyle, 'default');
  character.joystick.set(1, 0);
  tick(s, 60);
  assert.ok(action.isRunning());
  assert.ok(Math.abs(hips.position.y - height) < 1e-6);
  character.setLocomotion('walk');
  tick(s, 60);
  assert.equal(action.isRunning(), false);
  assert.ok(hips.position.y < height - 0.08);
});
test('zero speed freezes every behavior and gait, including vertical ladder routes',()=>{
  const s=setup(); s.config.character.moveSpeedMetersPerSecond=0;
  for(const style of LOCOMOTION_STYLES) for(const behavior of BEHAVIORS) {
    s.character.position.set(0,0,0); s.character.setLocomotion(style.id); s.character.setMode(behavior.id,new THREE.Vector3(4,0,1));
    tick(s,30); assert.ok(s.character.position.length()<1e-7,style.id+' / '+behavior.id); assert.equal(s.character.motionState,'idle');
  }
  s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(0,2,0)],'ladder'); tick(s);
  assert.deepEqual(s.character.position.toArray(),[0,0,0]);
});
test('go-to arrives and stops; direct movement remains blocked by a wall',()=>{
  const s=setup(); s.character.setMode('go-to',new THREE.Vector3(1,0,0)); tick(s,180);
  assert.equal(s.character.mode,'go-to'); assert.equal(s.character.motionState,'idle'); assert.ok(Math.abs(s.character.position.x-1)<.2);
  const wall=new THREE.Mesh(new THREE.BoxGeometry(.3,2,4),new THREE.MeshBasicMaterial()); wall.position.set(2,1,0); wall.updateMatrixWorld(true); s.world.meshes.push(wall);
  s.character.setNavigationMode('direct'); s.character.setMode('go-to',new THREE.Vector3(3,0,0)); tick(s,240);
  assert.ok(s.character.position.x<1.65); assert.equal(s.character.motionState,'walk'); assert.equal(s.character.mode,'go-to');
});
test('gizmo freezes physics while retaining gait and the original go-to goal, then resumes it',()=>{
  const s=setup(); s.character.setMode('go-to',new THREE.Vector3(4,0,0));
  s.character.beginManipulation(); s.character.position.set(1,2,3);
  tick(s); assert.deepEqual(s.character.position.toArray(),[1,2,3]); assert.equal(s.character.mode,'go-to'); assert.equal(s.character.motionState,'walk');
  s.character.endManipulation(); tick(s,600);
  assert.ok(s.character.position.distanceTo(new THREE.Vector3(4,0,0))<.2); assert.equal(s.character.mode,'go-to'); assert.equal(s.character.motionState,'idle');
});
test('gizmo preserves autonomous patrol anchors instead of restarting patrol at the dropped point',()=>{
  const s=setup(); s.character.setNavigationMode('direct'); s.character.setMode('patrol-route',null); tick(s,15);
  s.character.beginManipulation(); s.character.position.set(7,0,0); tick(s,120);
  assert.equal(s.character.mode,'patrol-route'); assert.deepEqual(s.character.position.toArray(),[7,0,0]);
  s.character.endManipulation(); tick(s,300);
  assert.ok(s.character.position.x<3,'original first patrol point remains at (-2.5, -2.5)');
  assert.ok(s.character.position.z<0); assert.equal(s.character.mode,'patrol-route');
});
test('gizmo preserves ground and vertical demonstration routes, and completion still idles',()=>{
  for(const traversal of ['ground','ladder','swim']) {
    const s=setup();
    const end=traversal==='ground'?new THREE.Vector3(2,0,1):new THREE.Vector3(0,1,0);
    s.character.startRoute([new THREE.Vector3(),end],traversal); tick(s,10);
    s.character.beginManipulation(); s.character.position.set(.5,.4,.5); tick(s,120);
    assert.equal(s.character.routeActive,true,traversal); assert.equal(s.character.motionState,'walk',traversal);
    assert.deepEqual(s.character.position.toArray(),[.5,.4,.5]);
    s.character.endManipulation(); tick(s,360);
    assert.equal(s.character.routeActive,false,traversal);
    if(traversal==='ground') assert.ok(s.character.position.distanceTo(end)<.15);
    assert.equal(s.character.motionState,'idle',traversal);
  }
});
test('blocked movement and failed paths keep the selected gait at the configured intended speed',()=>{
  for(const mode of ['direct','pathfinding']) {
    const s=setup(); s.character.setNavigationMode(mode); s.character.setLocomotion('run');
    const wall=new THREE.Mesh(new THREE.BoxGeometry(.4,3,60),new THREE.MeshBasicMaterial()); wall.position.set(1,1.5,0); wall.updateMatrixWorld(true); s.world.meshes.push(wall);
    s.character.setMode('go-to',new THREE.Vector3(3,0,0));
    const samples=[];
    const update=s.character.procedural.update.bind(s.character.procedural);
    s.character.procedural.update=(...args)=>{samples.push(args);update(...args);};
    tick(s,360);
    assert.equal(s.character.mode,'go-to'); assert.equal(s.character.motionState,'walk');
    const expected=s.config.character.moveSpeedMetersPerSecond*LOCOMOTION_STYLES.find(style=>style.id==='run').speedMultiplier;
    assert.ok(samples.every(sample=>sample[2]===true&&Math.abs(sample[4]-expected)<1e-9),mode);
    if(mode==='pathfinding') assert.ok(s.character.position.length()<1e-7);
  }
});
test('losing a followed target retains animation intent without inventing movement, then reacquires',()=>{
  const s=setup(); s.character.setMode('follow-cursor',null); tick(s,20);
  assert.equal(s.character.motionState,'walk'); const before=s.character.position.clone();
  for(let frame=0;frame<180;frame++)s.character.update(1/60,s.camera,null,s.world);
  assert.ok(s.character.position.distanceTo(before)<1e-8); assert.equal(s.character.motionState,'walk'); assert.equal(s.character.mode,'follow-cursor');
  tick(s,20); assert.ok(s.character.position.distanceTo(before)>.1);
  s.config.character.moveSpeedMetersPerSecond=0;
  for(let frame=0;frame<10;frame++)s.character.update(1/60,s.camera,null,s.world);
  assert.equal(s.character.motionState,'idle');
});
test('manual no-input, a missing initial target, arrivals, and behavior observation retain natural idle',()=>{
  const s=setup(); tick(s,10); assert.equal(s.character.motionState,'idle');
  s.character.setMode('follow-cursor',null); s.character.update(1/60,s.camera,null,s.world); assert.equal(s.character.motionState,'idle');
  s.character.update(1/60,s.camera,s.character.position.clone(),s.world); assert.equal(s.character.motionState,'idle');
  s.character.update(1/60,s.camera,null,s.world); assert.equal(s.character.motionState,'idle');
  s.character.setMode('guard',null); tick(s,10); assert.equal(s.character.motionState,'idle'); assert.equal(s.character.mode,'guard');
  s.character.setMode('patrol-route',null); s.character.position.set(-2.5,0,-2.5); tick(s,10); assert.equal(s.character.motionState,'idle');
});
test('external placement keeps the selected task and original destination',()=>{
  const s=setup(); s.character.setMode('go-to',new THREE.Vector3(4,0,0)); tick(s,10);
  s.character.place(new THREE.Vector3(2,0,2)); assert.equal(s.character.mode,'go-to');
  tick(s,360); assert.ok(s.character.position.distanceTo(new THREE.Vector3(4,0,0))<.2); assert.equal(s.character.mode,'go-to');
  s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(2,0,0)]);
  s.character.place(new THREE.Vector3(1,0,1)); assert.equal(s.character.routeActive,true); tick(s,360);
  assert.equal(s.character.routeActive,false); assert.ok(s.character.position.distanceTo(new THREE.Vector3(2,0,0))<.15);
});
test('manual input temporarily overrides autonomous movement without advancing its task or route',()=>{
  const s=setup(); s.character.setMode('go-to',new THREE.Vector3(2,0,0));
  s.character.joystick.set(1,0); tick(s,180); assert.equal(s.character.mode,'go-to'); assert.ok(s.character.position.x>3);
  s.character.joystick.set(0,0); tick(s,180); assert.ok(Math.abs(s.character.position.x-2)<.2); assert.equal(s.character.motionState,'idle');
  s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(1,0,0),new THREE.Vector3(2,0,0)],'ladder');
  s.character.joystick.set(1,0); tick(s,180); assert.equal(s.character.routeActive,true); assert.ok(s.character.position.x>3);
  s.character.joystick.set(0,0); tick(s,60); assert.ok(s.character.position.x<3,'resume the original first waypoint instead of completing the overridden route');
  tick(s,240); assert.equal(s.character.routeActive,false); assert.ok(Math.abs(s.character.position.x-2)<.15);
});
test('manual input without a valid followed target cannot leave a stale walking intent',()=>{
  const s=setup(); s.character.setMode('follow-cursor',null); s.character.joystick.set(1,0);
  s.character.update(1/60,s.camera,null,s.world); assert.equal(s.character.motionState,'walk');
  s.character.joystick.set(0,0); s.character.update(1/60,s.camera,null,s.world); assert.equal(s.character.motionState,'idle');
});
test('ground and ladder demonstration routes reach their final waypoint',()=>{
  const s=setup(); s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(1,0,0),new THREE.Vector3(1,0,1)]); tick(s,300);
  assert.equal(s.character.routeActive,false); assert.ok(s.character.position.distanceTo(new THREE.Vector3(1,0,1))<.15);
  assert.equal(s.character.activity,'场景演示完成'); assert.equal(s.character.navigator.status,'等待目标');
  tick(s,30); assert.equal(s.character.activity,'场景演示完成');
  s.character.setLocomotion('ladder'); s.character.startRoute([new THREE.Vector3(),new THREE.Vector3(0,1,0),new THREE.Vector3()],'ladder'); tick(s,360);
  assert.equal(s.character.routeActive,false); assert.ok(s.character.position.length()<.15);
  assert.equal(s.character.activity,'场景演示完成');
  s.character.joystick.set(1,0); tick(s,1); assert.equal(s.character.activity,'手动控制');
});
test('legacy shade repair is reversible and preserves authored maps, tint, and VRM1',()=>{
  const scene=new THREE.Group(); const legacy=new MToonMaterial(); legacy.map=new THREE.Texture(); legacy.shadeColorFactor.setRGB(.9,.8,.7);
  const authored=new MToonMaterial(); authored.map=new THREE.Texture(); authored.shadeMultiplyTexture=new THREE.Texture(); const original=authored.shadeMultiplyTexture;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(),[legacy,authored]));
  assert.equal(setLegacyShadeCompatibility(scene,true,false),0); assert.equal(legacy.shadeMultiplyTexture,null);
  assert.equal(setLegacyShadeCompatibility(scene,true,true),1); assert.equal(legacy.shadeMultiplyTexture,legacy.map); assert.equal(authored.shadeMultiplyTexture,original);
  assert.deepEqual(legacy.shadeColorFactor.toArray(),[.9,.8,.7]);
  assert.equal(setLegacyShadeCompatibility(scene,false,true),1); assert.equal(legacy.shadeMultiplyTexture,null);
  setLegacyShadeCompatibility(scene,true,true); assert.equal(legacy.shadeMultiplyTexture,legacy.map);
});
