import './style.css';
import * as THREE from 'three';
import { CharacterController } from './character-controller';
import { loadConfig } from './config';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { BEHAVIORS } from './behaviors';
import { LOCOMOTION_STYLES, type LocomotionStyle } from './locomotion';
import type { NavigationMode } from './navigation';
import { createNatureScene } from './nature-scene';
import type { MovementMode } from './app-types';
import { XREnvironment } from './xr-environment';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`程序不完整，缺少元素 #${id}`);
  return value as T;
}

const canvas = element<HTMLCanvasElement>('stage');
const overlay = element<HTMLElement>('overlay');
const startARButton = element<HTMLButtonElement>('start-ar');
const loadVRMButton = element<HTMLButtonElement>('load-vrm');
const vrmInput = element<HTMLInputElement>('vrm-input');
const vrmaInput = element<HTMLInputElement>('vrma-input');
const loadVRMAButton = element<HTMLButtonElement>('load-vrma');
const pauseVRMAButton = element<HTMLButtonElement>('pause-vrma');
const stopVRMAButton = element<HTMLButtonElement>('stop-vrma');
const vrmaStatus = element<HTMLElement>('vrma-status');
const placeButton = element<HTMLButtonElement>('place-character');
const jumpButton = element<HTMLButtonElement>('jump');
const debugToggle = element<HTMLButtonElement>('debug-toggle');
const debugPanel = element<HTMLElement>('debug-panel');
const radiusInput = element<HTMLInputElement>('capsule-radius');
const heightInput = element<HTMLInputElement>('capsule-height');
const speedInput = element<HTMLInputElement>('move-speed');
const radiusValue = element<HTMLOutputElement>('radius-value');
const heightValue = element<HTMLOutputElement>('height-value');
const speedValue = element<HTMLOutputElement>('speed-value');
const showGeometry = element<HTMLInputElement>('show-geometry');
const runtimeLabel = element<HTMLElement>('runtime-label');
const arBadge = element<HTMLElement>('ar-badge');
const depthBadge = element<HTMLElement>('depth-badge');
const statusCopy = element<HTMLElement>('status-copy');
const planeCount = element<HTMLElement>('plane-count');
const depthCount = element<HTMLElement>('depth-count');
const motionState = element<HTMLElement>('motion-state');
const fpsLabel = element<HTMLElement>('fps');
const toastElement = element<HTMLElement>('toast');
const loadingElement = element<HTMLElement>('loading');
const joystickElement = element<HTMLElement>('joystick');
const joystickKnob = element<HTMLElement>('joystick-knob');

let toastTimer = 0;
function toast(message: string, error = false): void {
  window.clearTimeout(toastTimer);
  toastElement.textContent = message;
  toastElement.classList.toggle('error', error);
  toastElement.classList.add('show');
  toastTimer = window.setTimeout(() => toastElement.classList.remove('show'), 3600);
}

async function bootstrap(): Promise<void> {
  const config = await loadConfig();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c9c4);
  scene.fog = new THREE.FogExp2(0x87c9c4, 0.035);

  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.03, 80);
  camera.position.set(0, 1.65, 4.6);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  const hemisphere = new THREE.HemisphereLight(0xe9f4ff, 0x626b59, 1.15);
  scene.add(hemisphere);
  const sunlight = new THREE.DirectionalLight(0xfff6e9, 2.0);
  sunlight.position.set(5, 9, 4);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  sunlight.shadow.camera.left = -10;
  sunlight.shadow.camera.right = 10;
  sunlight.shadow.camera.top = 10;
  sunlight.shadow.camera.bottom = -10;
  scene.add(sunlight);

  const nature = createNatureScene();
  scene.add(nature.group);
  nature.group.updateMatrixWorld(true);
  const xrEnvironment = new XREnvironment(scene, config);
  const character = new CharacterController(scene, config, toast);
  character.place(new THREE.Vector3(0, 0, 0));
  placeButton.disabled = false;
  jumpButton.disabled = false;
  const gizmo = new TransformControls(camera, canvas);
  gizmo.setMode('translate');
  gizmo.setSpace('world');
  gizmo.setSize(0.85);
  scene.add(gizmo.getHelper());
  const gizmoEnabled = element<HTMLInputElement>('gizmo-enabled');
  const behaviorSelect = element<HTMLSelectElement>('behavior-mode');
  const styleSelect = element<HTMLSelectElement>('locomotion-style');
  const stationSelect = element<HTMLSelectElement>('demo-station');
  const navSelect = element<HTMLSelectElement>('navigation-mode');
  let tour = false;
  let stationElapsed = 0;
  let stationRunning = false;
  const pathLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd27d, depthTest: false, transparent: true, opacity: 0.85 }));
  pathLine.frustumCulled = false;
  pathLine.renderOrder = 5;
  scene.add(pathLine);
  let pathRefresh = 0;

  radiusInput.value = String(config.character.capsule.radiusMeters);
  heightInput.value = String(config.character.capsule.heightMeters);
  speedInput.value = String(config.character.moveSpeedMetersPerSecond);
  updateDebugLabels();

  let xrSession: XRSession | null = null;
  let xrReferenceSpace: XRReferenceSpace | null = null;
  let hitTestSource: XRHitTestSource | null = null;
  let isARSupported = false;
  let yaw = 0;
  let pitch = -0.13;
  const pressedKeys = new Set<string>();
  const clock = new THREE.Clock();
  let frameCounter = 0;
  let fpsAccumulator = 0;

  updateCameraRotation();
  await detectARSupport();
  setupInterface();
  setupJoystick();
  setupCameraControls();
  setupMovementInterface();

  renderer.setAnimationLoop((time, frame) => {
    const delta = clock.getDelta();
    if (!renderer.xr.isPresenting) updateFreeCamera(delta);
    const activeCamera = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
    xrEnvironment.update(time, frame, xrReferenceSpace, activeCamera, hitTestSource, nature.colliders);
    const worldMeshes = renderer.xr.isPresenting ? xrEnvironment.colliders : nature.colliders;
    character.update(delta, activeCamera, xrEnvironment.cursor.valid ? xrEnvironment.cursor.position : null, { meshes: worldMeshes });
    updateTour(delta);
    pathRefresh += delta;
    if (pathRefresh > 0.15) {
      pathRefresh = 0;
      pathLine.geometry.dispose();
      pathLine.geometry = new THREE.BufferGeometry().setFromPoints(character.navigator.path.map(p => p.clone().add(new THREE.Vector3(0, 0.045, 0))));
      pathLine.visible = !renderer.xr.isPresenting && character.navigator.path.length > 1 && character.navigationMode === 'pathfinding';
    }
    renderer.render(scene, camera);
    updateRuntimeStats(delta);
  });

  function setupMovementInterface(): void {
    for (const item of BEHAVIORS) behaviorSelect.add(new Option(item.label, item.id));
    for (const item of LOCOMOTION_STYLES) styleSelect.add(new Option(item.label, item.id));
    for (const item of nature.stations) stationSelect.add(new Option(item.label, item.id));
    updateBehaviorDescription(); updateStyleDescription(); updateStationDescription(); updatePreviewControls();
    element('demo-character').addEventListener('click', () => {
      character.useDemoCharacter(); character.place(new THREE.Vector3(0, 0, 0));
      tour = false; stationRunning = false; updatePreviewControls(); updateMaterialStatus(); updateGizmo();
      statusCopy.textContent = '内置关节测试角色';
    });
    navSelect.addEventListener('change', () => character.setNavigationMode(navSelect.value as NavigationMode));
    styleSelect.addEventListener('change', () => {
      setActiveMode('manual'); character.setLocomotion(styleSelect.value as LocomotionStyle); styleSelect.value = character.locomotionStyle; updateStyleDescription();
    });
    behaviorSelect.addEventListener('change', () => {
      if (behaviorSelect.value === 'go-to' && !xrEnvironment.cursor.valid) { behaviorSelect.value = character.mode; toast('请对准地面，或双击地面设置目标', true); return; }
      setActiveMode(behaviorSelect.value as MovementMode);
    });
    element('target-cursor').addEventListener('click', () => {
      if (!xrEnvironment.cursor.valid) { toast('请先对准可站立区域', true); return; }
      setActiveMode('go-to');
    });
    element('stop-behavior').addEventListener('click', () => setActiveMode('manual'));
    stationSelect.addEventListener('change', updateStationDescription);
    element('start-station').addEventListener('click', () => { tour = false; startStation(); });
    element('tour-stations').addEventListener('click', () => {
      tour = !tour;
      if (tour) startStation(); else { stationRunning = false; character.setMode('manual', null); }
    });
    gizmoEnabled.addEventListener('change', updateGizmo);
    element<HTMLInputElement>('gizmo-snap').addEventListener('change', event => gizmo.setTranslationSnap((event.target as HTMLInputElement).checked ? 0.25 : null));
    gizmo.addEventListener('dragging-changed', event => {
      if (event.value) { tour = false; stationRunning = false; character.beginManipulation(); pressedKeys.clear(); }
      else character.endManipulation();
    });
    element<HTMLInputElement>('shade-compatibility').addEventListener('change', event => {
      character.setShadeCompatibility((event.target as HTMLInputElement).checked); updateMaterialStatus();
    });
    element<HTMLInputElement>('exposure').addEventListener('input', event => {
      renderer.toneMappingExposure = Number((event.target as HTMLInputElement).value);
      element<HTMLOutputElement>('exposure-value').value = renderer.toneMappingExposure.toFixed(2);
    });
    canvas.addEventListener('dblclick', event => {
      if (renderer.xr.isPresenting || gizmo.dragging || (gizmo.enabled && gizmo.axis)) return;
      const rect = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
      const hit = ray.intersectObjects(nature.colliders, false)[0];
      if (!hit?.face || hit.face.normal.clone().transformDirection(hit.object.matrixWorld).y < 0.5) return;
      setActiveMode('manual'); character.setMode('go-to', hit.point); behaviorSelect.value = 'go-to'; updateBehaviorDescription();
    });
  }

  function updateGizmo(): void {
    gizmo.enabled = gizmoEnabled.checked && !renderer.xr.isPresenting && character.loaded;
    if (gizmo.enabled) gizmo.attach(character.root); else gizmo.detach();
  }

  function updateMaterialStatus(): void {
    element('material-status').textContent = character.hasVRM
      ? (character.shadeCompatibility ? '兼容修复已开启' : '使用原始材质') + ' · ' + character.repairedMaterialCount + ' 个缺失阴影贴图材质'
      : '内置角色材质';
  }

  function updateStyleDescription(): void {
    element('locomotion-description').textContent = LOCOMOTION_STYLES.find(item => item.id === styleSelect.value)?.description ?? '';
  }
  function updateBehaviorDescription(): void {
    element('behavior-description').textContent = BEHAVIORS.find(item => item.id === behaviorSelect.value)?.description ?? '';
  }
  function updateStationDescription(): void {
    element('station-description').textContent = nature.stations.find(item => item.id === stationSelect.value)?.description ?? '';
  }

  function startStation(): void {
    if (renderer.xr.isPresenting) return;
    const station = nature.stations.find(item => item.id === stationSelect.value);
    if (!station) return;
    gizmoEnabled.checked = false; updateGizmo();
    character.stopAnimationPreview(); updatePreviewControls();
    character.place(station.waypoints[0]);
    character.setLocomotion(station.style as LocomotionStyle);
    styleSelect.value = station.style; updateStyleDescription();
    if (station.behavior) {
      character.place(station.waypoints[0]);
      character.setMode(station.behavior as MovementMode, station.waypoints[1] ?? null);
    } else character.startRoute(station.waypoints, station.traversal);
    camera.position.copy(station.cameraPosition);
    camera.lookAt(station.waypoints[0].clone().add(new THREE.Vector3(0, 0.8, 0)));
    camera.rotation.order = 'YXZ'; yaw = camera.rotation.y; pitch = camera.rotation.x;
    stationElapsed = 0; stationRunning = true;
    statusCopy.textContent = station.label + ' · ' + station.description;
  }

  function updateTour(delta: number): void {
    if (!stationRunning || !tour || config.character.moveSpeedMetersPerSecond === 0) return;
    stationElapsed += Math.min(delta, 0.05);
    const station = nature.stations.find(item => item.id === stationSelect.value);
    if ((station?.behavior ? stationElapsed > 16 : !character.routeActive && stationElapsed > 2) || stationElapsed > 65) {
      stationSelect.selectedIndex = (stationSelect.selectedIndex + 1) % nature.stations.length;
      updateStationDescription(); startStation();
    }
  }

  async function detectARSupport(): Promise<void> {
    if (!navigator.xr || !window.isSecureContext) {
      arBadge.textContent = window.isSecureContext ? '设备不支持 WebXR' : 'AR 需要 HTTPS';
      arBadge.className = 'badge warn';
      return;
    }
    try {
      isARSupported = await navigator.xr.isSessionSupported('immersive-ar');
      arBadge.textContent = isARSupported ? 'WebXR AR 可用' : '使用调试场景';
      arBadge.className = isARSupported ? 'badge' : 'badge warn';
    } catch {
      arBadge.textContent = 'AR 检测失败';
      arBadge.className = 'badge warn';
    }
  }

  function setupInterface(): void {
    startARButton.addEventListener('click', async () => {
      if (xrSession) {
        await xrSession.end();
        return;
      }
      if (!isARSupported) {
        toast('该浏览器没有可启动的 WebXR AR 会话，将进入默认场景', true);
        return;
      }
      await startAR();
    });

    loadVRMButton.addEventListener('click', () => vrmInput.click());
    vrmInput.addEventListener('change', async () => {
      const file = vrmInput.files?.[0];
      if (!file) return;
      loadingElement.hidden = false;
      loadingElement.querySelector('b')!.textContent = '正在载入模型…';
      try {
        await character.loadFile(file);
        tour = false; stationRunning = false;
        placeButton.disabled = false;
        jumpButton.disabled = false;
        const spawn = xrEnvironment.cursor.valid ? await xrEnvironment.lockAnchorAtCursor() : new THREE.Vector3(0, 0, 0);
        character.place(spawn ?? new THREE.Vector3(0, 0, 0));
        statusCopy.textContent = `已载入角色 ${file.name}`;
        updateMaterialStatus();
        updateGizmo();
        toast(`已载入 ${file.name}`);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'VRM 载入失败', true);
      } finally {
        loadingElement.hidden = true;
        vrmInput.value = '';
        updatePreviewControls();
      }
    });

    loadVRMAButton.addEventListener('click', () => vrmaInput.click());
    vrmaInput.addEventListener('change', async () => {
      const file = vrmaInput.files?.[0];
      if (!file) return;
      loadingElement.querySelector('b')!.textContent = '正在载入动画…';
      loadingElement.hidden = false;
      try {
        await character.previewAnimationFile(file);
        toast(`正在循环预览 ${file.name}`);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'VRMA 载入失败', true);
      } finally {
        loadingElement.hidden = true;
        vrmaInput.value = '';
        updatePreviewControls();
      }
    });
    pauseVRMAButton.addEventListener('click', () => {
      character.toggleAnimationPreview();
      updatePreviewControls();
    });
    stopVRMAButton.addEventListener('click', () => {
      character.stopAnimationPreview();
      updatePreviewControls();
      toast('已停止预览，恢复角色默认动作');
    });

    placeButton.addEventListener('click', async () => {
      if (!xrEnvironment.cursor.valid) {
        toast('中央射线还没有找到可站立区域。', true);
        return;
      }
      const point = await xrEnvironment.lockAnchorAtCursor();
      if (!point) {
        toast('请把中央光标移动到地面或桌面。', true);
        return;
      }
      tour = false; stationRunning = false;
      character.place(point);
      toast('角色已放置。');
    });

    jumpButton.addEventListener('click', () => character.jump());

    debugToggle.addEventListener('click', () => {
      debugPanel.hidden = !debugPanel.hidden;
      debugToggle.setAttribute('aria-expanded', String(!debugPanel.hidden));
    });
    radiusInput.addEventListener('input', updateCapsuleFromPanel);
    heightInput.addEventListener('input', updateCapsuleFromPanel);
    speedInput.addEventListener('input', () => {
      config.character.moveSpeedMetersPerSecond = Number(speedInput.value);
      updateDebugLabels();
    });
    showGeometry.addEventListener('change', () => {
      character.setDebugVisible(showGeometry.checked);
      xrEnvironment.setDebugVisible(showGeometry.checked);
    });
    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  function updatePreviewControls(): void {
    loadVRMAButton.disabled = !character.hasVRM;
    pauseVRMAButton.disabled = !character.previewing;
    stopVRMAButton.disabled = !character.previewing;
    pauseVRMAButton.textContent = character.previewPaused ? '继续' : '暂停';
    vrmaStatus.textContent = character.previewing
      ? `${character.previewPaused ? '已暂停' : '循环播放'}：${character.previewFileName}`
      : character.hasVRM ? '选择 .vrma 应用于当前角色' : '请先载入 VRM 角色';
  }

  async function startAR(): Promise<void> {
    if (!navigator.xr) return;
    startARButton.disabled = true;
    try {
      const sessionInit: XRSessionInit = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor', 'anchors', 'plane-detection', 'depth-sensing', 'dom-overlay', 'light-estimation'],
        domOverlay: { root: overlay },
        depthSensing: {
          usagePreference: ['cpu-optimized'],
          dataFormatPreference: ['luminance-alpha', 'float32'],
        },
      };
      xrSession = await navigator.xr.requestSession('immersive-ar', sessionInit);
      xrSession.addEventListener('end', onXREnded, { once: true });
      await renderer.xr.setSession(xrSession);
      xrReferenceSpace = renderer.xr.getReferenceSpace();
      const viewerSpace = await xrSession.requestReferenceSpace('viewer');
      if (!xrSession.requestHitTestSource) throw new Error('浏览器未开放 WebXR Hit Test');
      hitTestSource = (await xrSession.requestHitTestSource({ space: viewerSpace })) ?? null;
      tour = false; stationRunning = false;
      character.setMode('manual', null);
      gizmo.detach(); gizmo.enabled = false;
      document.body.classList.add('in-ar');
      nature.group.visible = false;
      scene.background = null;
      scene.fog = null;
      runtimeLabel.textContent = 'Android WebXR AR';
      startARButton.textContent = '退出 AR';
      arBadge.textContent = 'AR 会话运行中';
      arBadge.className = 'badge';
      depthBadge.textContent = '等待深度数据';
      depthBadge.className = 'badge muted';
      toast('移动设备扫描环境，把中央光标对准地面后放置角色。');
    } catch (error) {
      if (xrSession) { await xrSession.end().catch(() => {}); onXREnded(); }
      xrSession = null;
      toast(error instanceof Error ? `AR 启动失败：${error.message}` : 'AR 启动失败', true);
    } finally {
      startARButton.disabled = false;
    }
  }

  function onXREnded(): void {
    hitTestSource?.cancel();
    hitTestSource = null;
    xrReferenceSpace = null;
    xrSession = null;
    xrEnvironment.clearXRGeometry();
    document.body.classList.remove('in-ar');
    nature.group.visible = true;
    character.place(new THREE.Vector3(0, 0, 0));
    queueMicrotask(updateGizmo);
    scene.background = new THREE.Color(0x87c9c4);
    scene.fog = new THREE.FogExp2(0x87c9c4, 0.035);
    runtimeLabel.textContent = '桌面调试场景';
    startARButton.textContent = '启动 AR';
    arBadge.textContent = isARSupported ? 'WebXR AR 可用' : '使用调试场景';
    depthBadge.textContent = '调试碰撞场景';
    depthBadge.className = 'badge muted';
  }

  function setupJoystick(): void {
    let pointerId: number | null = null;
    const maxDistance = 38;
    const update = (event: PointerEvent) => {
      const box = joystickElement.getBoundingClientRect();
      let dx = event.clientX - (box.left + box.width / 2);
      let dy = event.clientY - (box.top + box.height / 2);
      const length = Math.hypot(dx, dy);
      if (length > maxDistance) {
        dx = dx / length * maxDistance;
        dy = dy / length * maxDistance;
      }
      character.joystick.set(dx / maxDistance, dy / maxDistance);
      joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      if (character.mode !== 'manual' || character.routeActive) setActiveMode('manual');
    };
    joystickElement.addEventListener('pointerdown', event => {
      pointerId = event.pointerId;
      joystickElement.setPointerCapture(pointerId);
      update(event);
    });
    joystickElement.addEventListener('pointermove', event => {
      if (event.pointerId === pointerId) update(event);
    });
    const release = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      character.joystick.set(0, 0);
      joystickKnob.style.transform = 'translate(0, 0)';
    };
    joystickElement.addEventListener('pointerup', release);
    joystickElement.addEventListener('pointercancel', release);
  }

  function setupCameraControls(): void {
    addEventListener('keydown', event => {
      if ((event.target as HTMLElement)?.matches('input, select, button, textarea')) return;
      pressedKeys.add(event.code);
      if (event.code.startsWith('Arrow')) {
        event.preventDefault();
        if (character.mode !== 'manual' || character.routeActive) setActiveMode('manual');
        character.joystick.set(Number(pressedKeys.has('ArrowRight')) - Number(pressedKeys.has('ArrowLeft')), Number(pressedKeys.has('ArrowDown')) - Number(pressedKeys.has('ArrowUp')));
      }
    });
    addEventListener('blur', () => { pressedKeys.clear(); character.joystick.set(0, 0); });
    addEventListener('keyup', event => {
      pressedKeys.delete(event.code);
      if (event.code.startsWith('Arrow')) character.joystick.set(Number(pressedKeys.has('ArrowRight')) - Number(pressedKeys.has('ArrowLeft')), Number(pressedKeys.has('ArrowDown')) - Number(pressedKeys.has('ArrowUp')));
    });
    let lookPointer: number | null = null;
    let previousX = 0;
    let previousY = 0;
    canvas.addEventListener('pointerdown', event => {
      if (renderer.xr.isPresenting || gizmo.dragging || (gizmo.enabled && gizmo.axis)) return;
      lookPointer = event.pointerId;
      previousX = event.clientX;
      previousY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (lookPointer !== event.pointerId || renderer.xr.isPresenting || gizmo.dragging) return;
      yaw -= (event.clientX - previousX) * 0.004;
      pitch -= (event.clientY - previousY) * 0.004;
      pitch = THREE.MathUtils.clamp(pitch, -1.25, 1.1);
      previousX = event.clientX;
      previousY = event.clientY;
      updateCameraRotation();
    });
    const release = (event: PointerEvent) => { if (event.pointerId === lookPointer) lookPointer = null; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  function updateFreeCamera(delta: number): void {
    if (gizmo.dragging) return;
    const input = new THREE.Vector3(
      Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA')),
      Number(pressedKeys.has('KeyE')) - Number(pressedKeys.has('KeyQ')),
      Number(pressedKeys.has('KeyS')) - Number(pressedKeys.has('KeyW')),
    );
    if (input.lengthSq() === 0) return;
    input.normalize();
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    camera.position.addScaledVector(right, input.x * delta * 2.5);
    camera.position.addScaledVector(forward, -input.z * delta * 2.5);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y + input.y * delta * 2, 0.35, 8);
  }

  function updateCameraRotation(): void {
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
  }

  function updateCapsuleFromPanel(): void {
    character.setCapsule(Number(radiusInput.value), Number(heightInput.value));
    radiusInput.value = String(config.character.capsule.radiusMeters);
    heightInput.value = String(config.character.capsule.heightMeters);
    updateDebugLabels();
  }

  function updateDebugLabels(): void {
    radiusValue.value = `${Number(radiusInput.value).toFixed(2)} m`;
    heightValue.value = `${Number(heightInput.value).toFixed(2)} m`;
    speedValue.value = `${Number(speedInput.value).toFixed(2)} m/s`;
  }

  function setActiveMode(mode: MovementMode): void {
    tour = false; stationRunning = false;
    character.setMode(mode, xrEnvironment.cursor.valid ? xrEnvironment.cursor.position : null);
    behaviorSelect.value = mode;
    updateBehaviorDescription();
  }

  function updateRuntimeStats(delta: number): void {
    planeCount.textContent = String(xrEnvironment.planeCount);
    depthCount.textContent = String(xrEnvironment.depthTriangleCount);
    motionState.textContent = character.motionState === 'walk' ? (LOCOMOTION_STYLES.find(s => s.id === character.locomotionStyle)?.label ?? 'walk') : character.motionState;
    behaviorSelect.value = character.mode;
    element('task-status').textContent = character.activity + ' · ' + (config.character.moveSpeedMetersPerSecond === 0 ? '速度为 0，运动暂停' : character.navigator.status);
    element('tour-stations').textContent = tour ? '停止巡展' : '全部巡展';
    if (renderer.xr.isPresenting) {
      depthBadge.textContent = xrEnvironment.depthAvailable ? '实时深度启用' : '平面碰撞模式';
      depthBadge.className = xrEnvironment.depthAvailable ? 'badge' : 'badge warn';
    }
    fpsAccumulator += delta;
    frameCounter += 1;
    if (fpsAccumulator >= 0.5) {
      fpsLabel.textContent = `${Math.round(frameCounter / fpsAccumulator)} FPS`;
      fpsAccumulator = 0;
      frameCounter = 0;
    }

  }
}

bootstrap().catch(error => {
  console.error(error);
  toast(error instanceof Error ? error.message : 'Demo 初始化失败', true);
});
