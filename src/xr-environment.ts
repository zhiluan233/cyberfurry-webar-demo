import * as THREE from 'three';
import type { CursorHit, DemoConfig } from './app-types';

type PlaneRecord = { mesh: THREE.Mesh; lastChanged: number };

type DepthMeshRecord = {
  mesh: THREE.Mesh;
  surfaceAreaSquareMeters: number;
  triangleCount: number;
  capturedAt: number;
  center: THREE.Vector3;
  radius: number;
};

type DepthSurfaceTriangle = {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
  nx: number; ny: number; nz: number;
};

type DepthSurfaceIndex = {
  cellSize: number;
  maximumDistanceSquared: number;
  minimumNormalDot: number;
  triangles: DepthSurfaceTriangle[];
  cells: Map<string, number[]>;
  center: THREE.Vector3;
  radius: number;
};

export class XREnvironment {
  readonly group = new THREE.Group();
  readonly cursorObject = new THREE.Group();
  readonly anchorMarker = new THREE.Group();
  cursor: CursorHit = {
    valid: false,
    position: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
  };
  planeCount = 0;
  depthTriangleCount = 0;
  depthAvailable = false;

  private planeRecords = new Map<XRPlane, PlaneRecord>();
  private depthMesh: THREE.Mesh | null = null;
  private depthSnapshots: DepthMeshRecord[] = [];
  private retainedDepthSurfaceAreaSquareMeters = 0;
  private liveDepthSurfaceAreaSquareMeters = 0;
  private liveDepthTriangleCount = 0;
  private liveDepthCapturedAt = 0;
  private readonly liveDepthCapturePosition = new THREE.Vector3();
  private readonly liveDepthCaptureQuaternion = new THREE.Quaternion();
  private lastCommittedDepthPosition: THREE.Vector3 | null = null;
  private lastCommittedDepthQuaternion: THREE.Quaternion | null = null;
  private colliderCache: THREE.Mesh[] = [];
  private colliderCacheDirty = true;
  private anchorFloorProxy: THREE.Mesh | null = null;
  private lastDepthUpdate = -Infinity;
  private latestXRHit: XRHitTestResult | undefined;
  private anchor: XRAnchor | null = null;
  private debugVisible = false;
  private depthFailureCount = 0;
  private depthDisabledForSession = false;
  private readonly centerRaycaster = new THREE.Raycaster();
  private readonly temporaryMatrix = new THREE.Matrix4();
  private readonly temporaryDepthPoint = new THREE.Vector3();
  private readonly temporaryDepthUv = new THREE.Vector4();
  private readonly temporaryCapturePosition = new THREE.Vector3();
  private readonly temporaryCaptureQuaternion = new THREE.Quaternion();

  constructor(private readonly scene: THREE.Scene, private readonly config: DemoConfig) {
    this.group.name = 'XR environment geometry';
    this.scene.add(this.group);
    this.createCursorObjects();
  }

  get colliders(): THREE.Mesh[] {
    if (this.colliderCacheDirty) {
      this.colliderCache = [...this.planeRecords.values()].map(record => record.mesh);
      for (const record of this.depthSnapshots) this.colliderCache.push(record.mesh);
      if (this.depthMesh) this.colliderCache.push(this.depthMesh);
      if (this.anchorFloorProxy) this.colliderCache.push(this.anchorFloorProxy);
      this.colliderCacheDirty = false;
    }
    return this.colliderCache;
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    for (const record of this.planeRecords.values()) this.updateEnvironmentAppearance(record.mesh);
    for (const record of this.depthSnapshots) this.updateEnvironmentAppearance(record.mesh);
    if (this.depthMesh) this.updateEnvironmentAppearance(this.depthMesh);
    if (this.anchorFloorProxy) this.updateEnvironmentAppearance(this.anchorFloorProxy);
  }

  update(
    time: number,
    frame: XRFrame | undefined,
    referenceSpace: XRReferenceSpace | null,
    camera: THREE.Camera,
    hitTestSource: XRHitTestSource | null,
    fallbackColliders: THREE.Mesh[],
  ): void {
    if (frame && referenceSpace) {
      this.updatePlanes(frame, referenceSpace);
      this.updateDepthMesh(time, frame, referenceSpace);
      this.updateAnchor(frame, referenceSpace);
    }
    this.updateCursor(frame, referenceSpace, camera, hitTestSource, frame ? this.colliders : fallbackColliders);
  }

  async lockAnchorAtCursor(): Promise<THREE.Vector3 | null> {
    if (!this.cursor.valid || this.cursor.normal.y < 0.35) return null;
    if (this.anchor) {
      this.anchor.delete();
      this.anchor = null;
    }
    if (this.latestXRHit?.createAnchor) {
      try {
        this.anchor = await this.latestXRHit.createAnchor();
      } catch {
        this.anchor = null;
      }
    }
    this.anchorMarker.visible = true;
    this.anchorMarker.position.copy(this.cursor.position);
    this.anchorMarker.quaternion.copy(this.cursorObject.quaternion);
    if (!this.anchorFloorProxy) {
      const geometry = new THREE.PlaneGeometry(4, 4);
      geometry.rotateX(-Math.PI / 2);
      this.anchorFloorProxy = new THREE.Mesh(geometry, this.createEnvironmentMaterial(0xffd56a));
      this.anchorFloorProxy.name = 'Anchor floor collision fallback';
      this.anchorFloorProxy.userData.isEnvironmentCollider = true;
      this.group.add(this.anchorFloorProxy);
      this.syncEnvironmentDebugOverlay(this.anchorFloorProxy);
      this.colliderCacheDirty = true;
    }
    this.anchorFloorProxy.position.copy(this.cursor.position);
    this.anchorFloorProxy.quaternion.copy(this.cursorObject.quaternion);
    this.anchorFloorProxy.updateMatrixWorld(true);
    return this.cursor.position.clone();
  }

  clearXRGeometry(): void {
    for (const record of this.planeRecords.values()) this.disposeEnvironmentMesh(record.mesh);
    this.planeRecords.clear();
    if (this.depthMesh) {
      this.disposeEnvironmentMesh(this.depthMesh);
      this.depthMesh = null;
    }
    for (const record of this.depthSnapshots) this.disposeEnvironmentMesh(record.mesh);
    this.depthSnapshots = [];
    this.retainedDepthSurfaceAreaSquareMeters = 0;
    this.liveDepthSurfaceAreaSquareMeters = 0;
    this.liveDepthTriangleCount = 0;
    this.liveDepthCapturedAt = 0;
    this.lastCommittedDepthPosition = null;
    this.lastCommittedDepthQuaternion = null;
    if (this.anchorFloorProxy) {
      this.disposeEnvironmentMesh(this.anchorFloorProxy);
      this.anchorFloorProxy = null;
    }
    this.anchor?.delete();
    this.anchor = null;
    this.anchorMarker.visible = false;
    this.planeCount = 0;
    this.depthTriangleCount = 0;
    this.depthAvailable = false;
    this.depthFailureCount = 0;
    this.depthDisabledForSession = false;
    this.colliderCache = [];
    this.colliderCacheDirty = true;
  }

  private updateCursor(
    frame: XRFrame | undefined,
    referenceSpace: XRReferenceSpace | null,
    camera: THREE.Camera,
    hitTestSource: XRHitTestSource | null,
    colliders: THREE.Mesh[],
  ): void {
    this.latestXRHit = undefined;
    let hitPosition: THREE.Vector3 | null = null;
    let hitNormal = new THREE.Vector3(0, 1, 0);
    let hitQuaternion: THREE.Quaternion | null = null;

    this.centerRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const meshHit = this.centerRaycaster.intersectObjects(colliders, false)[0];
    if (meshHit) {
      hitPosition = meshHit.point.clone();
      if (meshHit.face) {
        const normalMatrix = new THREE.Matrix3().getNormalMatrix(meshHit.object.matrixWorld);
        hitNormal = meshHit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      }
    }

    if (frame && referenceSpace && hitTestSource) {
      const xrHit = frame.getHitTestResults(hitTestSource)[0];
      const pose = xrHit?.getPose(referenceSpace);
      if (xrHit && pose) {
        const xrPosition = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
        const cameraPosition = new THREE.Vector3();
        camera.getWorldPosition(cameraPosition);
        if (!hitPosition || cameraPosition.distanceTo(xrPosition) < cameraPosition.distanceTo(hitPosition)) {
          hitPosition = xrPosition;
          hitQuaternion = new THREE.Quaternion(
            pose.transform.orientation.x,
            pose.transform.orientation.y,
            pose.transform.orientation.z,
            pose.transform.orientation.w,
          );
          hitNormal.set(0, 1, 0).applyQuaternion(hitQuaternion);
          this.latestXRHit = xrHit;
        }
      }
    }

    this.cursor.valid = Boolean(hitPosition);
    this.cursorObject.visible = this.cursor.valid;
    if (!hitPosition) return;
    this.cursor.position.copy(hitPosition);
    this.cursor.normal.copy(hitNormal);
    this.cursorObject.position.copy(hitPosition).addScaledVector(hitNormal, 0.008);
    if (hitQuaternion) this.cursorObject.quaternion.copy(hitQuaternion);
    else this.cursorObject.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), hitNormal);
  }

  private updatePlanes(frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    if (!this.config.environment.planeDetection || !frame.detectedPlanes) return;
    const active = new Set(frame.detectedPlanes);
    for (const [plane, record] of this.planeRecords) {
      if (!active.has(plane)) {
        this.disposeEnvironmentMesh(record.mesh);
        this.planeRecords.delete(plane);
        this.colliderCacheDirty = true;
      }
    }

    for (const plane of active) {
      const pose = frame.getPose(plane.planeSpace, referenceSpace);
      if (!pose) continue;
      let record = this.planeRecords.get(plane);
      if (!record || record.lastChanged !== plane.lastChangedTime) {
        const geometry = this.createPlaneGeometry(plane.polygon);
        if (record) {
          this.replaceEnvironmentGeometry(record.mesh, geometry);
          record.lastChanged = plane.lastChangedTime;
        } else {
          const mesh = new THREE.Mesh(geometry, this.createEnvironmentMaterial(0x4df0a0));
          mesh.name = `XR plane: ${plane.semanticLabel ?? plane.orientation ?? 'unknown'}`;
          mesh.userData.isEnvironmentCollider = true;
          this.group.add(mesh);
          this.syncEnvironmentDebugOverlay(mesh);
          this.colliderCacheDirty = true;
          record = { mesh, lastChanged: plane.lastChangedTime };
          this.planeRecords.set(plane, record);
        }
      }
      this.temporaryMatrix.fromArray(pose.transform.matrix);
      this.temporaryMatrix.decompose(record.mesh.position, record.mesh.quaternion, record.mesh.scale);
      record.mesh.updateMatrixWorld(true);
    }
    this.planeCount = this.planeRecords.size;
  }

  private createPlaneGeometry(polygon: readonly DOMPointReadOnly[]): THREE.BufferGeometry {
    const points = Array.from(polygon, point => new THREE.Vector2(point.x, point.z));
    const triangles = THREE.ShapeUtils.triangulateShape(points, []);
    const positions = new Float32Array(points.length * 3);
    points.forEach((point, index) => {
      positions[index * 3] = point.x;
      positions[index * 3 + 1] = 0;
      positions[index * 3 + 2] = point.y;
    });
    const indices = triangles.flatMap(([a, b, c]) => {
      const pa = new THREE.Vector3(points[a].x, 0, points[a].y);
      const pb = new THREE.Vector3(points[b].x, 0, points[b].y);
      const pc = new THREE.Vector3(points[c].x, 0, points[c].y);
      const normalY = pb.sub(pa).cross(pc.sub(pa)).y;
      return normalY >= 0 ? [a, b, c] : [a, c, b];
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }

  private updateDepthMesh(time: number, frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    const settings = this.config.environment.depthMesh;
    if (
      !settings.enabled
      || this.depthDisabledForSession
      || !frame.getDepthInformation
      || time - this.lastDepthUpdate < settings.updateIntervalMilliseconds
    ) return;

    const pose = frame.getViewerPose(referenceSpace);
    const view = pose?.views[0];
    if (!view) return;

    try {
      const depth = frame.getDepthInformation(view);
      if (!depth) return;

      // Limit retries once the runtime starts returning depth information.
      this.lastDepthUpdate = time;

      const columns = Math.max(2, Math.floor(settings.sampleColumns));
      const rows = Math.max(2, Math.floor(settings.sampleRows));
      const positions = new Float32Array(columns * rows * 3);
      const valid = new Uint8Array(columns * rows);
      const depths = new Float32Array(columns * rows);
      const inverseProjection = new THREE.Matrix4().fromArray(view.projectionMatrix).invert();
      const viewToWorld = new THREE.Matrix4().fromArray(view.transform.matrix);
      const uvTransform = new THREE.Matrix4().fromArray(depth.normDepthBufferFromNormView.matrix);
      this.temporaryCapturePosition.setFromMatrixPosition(viewToWorld);
      this.temporaryCaptureQuaternion.setFromRotationMatrix(viewToWorld);

      // Avoid XRCPUDepthInformation.getDepthInMeters(). Some Android/Chrome
      // implementations throw an internal out-of-bounds RangeError when the
      // view-to-depth transform maps a valid view coordinate outside the
      // cropped depth buffer. Reading the exposed CPU buffer directly lets us
      // validate every index before accessing it.
      const pixelCount = depth.width * depth.height;
      const raw32 = depth.data.byteLength === pixelCount * Float32Array.BYTES_PER_ELEMENT
        ? new Float32Array(depth.data)
        : null;
      const raw16 = depth.data.byteLength === pixelCount * Uint16Array.BYTES_PER_ELEMENT
        ? new Uint16Array(depth.data)
        : null;

      if (!raw32 && !raw16) {
        throw new Error(
          `Unsupported WebXR depth buffer size: ${depth.data.byteLength} bytes for ${depth.width}x${depth.height}.`,
        );
      }

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;
          const u = (column + 0.5) / columns;
          const v = (row + 0.5) / rows;

          const depthUv = this.temporaryDepthUv.set(u, v, 0, 1).applyMatrix4(uvTransform);
          if (!Number.isFinite(depthUv.w) || Math.abs(depthUv.w) < 1e-7) continue;

          const normalizedDepthX = depthUv.x / depthUv.w;
          const normalizedDepthY = depthUv.y / depthUv.w;
          if (
            !Number.isFinite(normalizedDepthX)
            || !Number.isFinite(normalizedDepthY)
            || normalizedDepthX < 0
            || normalizedDepthX >= 1
            || normalizedDepthY < 0
            || normalizedDepthY >= 1
          ) continue;

          const depthX = Math.min(depth.width - 1, Math.floor(normalizedDepthX * depth.width));
          const depthY = Math.min(depth.height - 1, Math.floor(normalizedDepthY * depth.height));
          const depthIndex = depthY * depth.width + depthX;
          if (depthIndex < 0 || depthIndex >= pixelCount) continue;

          const rawDepth = raw32 ? raw32[depthIndex] : raw16![depthIndex];
          const meters = rawDepth * depth.rawValueToMeters;
          if (!Number.isFinite(meters) || meters <= 0.08 || meters > settings.maximumDepthMeters) continue;

          const cameraPoint = this.temporaryDepthPoint
            .set(u * 2 - 1, 1 - v * 2, 0.5)
            .applyMatrix4(inverseProjection)
            .normalize();
          const forwardScale = meters / Math.max(0.001, Math.abs(cameraPoint.z));
          cameraPoint.multiplyScalar(forwardScale).applyMatrix4(viewToWorld);
          positions[index * 3] = cameraPoint.x;
          positions[index * 3 + 1] = cameraPoint.y;
          positions[index * 3 + 2] = cameraPoint.z;
          valid[index] = 1;
          depths[index] = meters;
        }
      }

      const indices: number[] = [];
      const edgeOkay = (a: number, b: number) => Boolean(
        valid[a]
        && valid[b]
        && Math.abs(depths[a] - depths[b]) <= settings.maximumEdgeDeltaMeters,
      );
      for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
          const a = row * columns + column;
          const b = a + 1;
          const c = a + columns;
          const d = c + 1;
          if (edgeOkay(a, b) && edgeOkay(a, c) && edgeOkay(b, c)) indices.push(a, c, b);
          if (edgeOkay(b, c) && edgeOkay(b, d) && edgeOkay(c, d)) indices.push(b, c, d);
        }
      }

      // Keep the last useful mesh if a transient frame contains no valid depth.
      // Replacing it with an empty geometry is what made scanned areas blink out.
      if (indices.length === 0) {
        this.pruneDepthSnapshots(this.temporaryCapturePosition, time);
        this.refreshDepthStatistics();
        this.depthAvailable = Boolean(this.depthMesh || this.depthSnapshots.length);
        return;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeBoundingSphere();
      // MeshBasicMaterial and raycasting do not require a normal attribute.

      const triangleCount = Math.floor(indices.length / 3);
      const surfaceAreaSquareMeters = this.calculateSurfaceArea(positions, indices);
      const shouldPersistLiveMesh = this.shouldPersistLiveDepthMesh();
      this.removeDepthOverlapsCoveredBy(geometry, shouldPersistLiveMesh);
      const persistedLiveMesh = shouldPersistLiveMesh ? this.persistLiveDepthMesh() : false;

      if (!this.depthMesh || persistedLiveMesh) {
        this.depthMesh = new THREE.Mesh(geometry, this.createEnvironmentMaterial(0x69a8ff));
        this.depthMesh.name = 'WebXR live depth collision and occlusion mesh';
        this.depthMesh.userData.isEnvironmentCollider = true;
        this.depthMesh.renderOrder = -20;
        this.group.add(this.depthMesh);
        this.syncEnvironmentDebugOverlay(this.depthMesh);
        this.colliderCacheDirty = true;
      } else {
        this.replaceEnvironmentGeometry(this.depthMesh, geometry);
      }

      this.liveDepthSurfaceAreaSquareMeters = surfaceAreaSquareMeters;
      this.liveDepthTriangleCount = triangleCount;
      this.liveDepthCapturedAt = time;
      this.liveDepthCapturePosition.copy(this.temporaryCapturePosition);
      this.liveDepthCaptureQuaternion.copy(this.temporaryCaptureQuaternion);

      this.depthMesh.updateMatrixWorld(true);
      this.pruneDepthSnapshots(this.temporaryCapturePosition, time);
      this.refreshDepthStatistics();
      this.depthAvailable = true;
      this.depthFailureCount = 0;
    } catch (error) {
      this.depthAvailable = Boolean(this.depthMesh || this.depthSnapshots.length);
      this.depthFailureCount += 1;
      console.warn(`WebXR depth processing failed (${this.depthFailureCount}/3).`, error);

      // Experimental depth implementations must never terminate the XR loop.
      if (this.depthFailureCount >= 3) {
        this.depthDisabledForSession = true;
        console.error('WebXR depth mesh disabled for this session after repeated failures.');
      }
    }
  }

  private shouldPersistLiveDepthMesh(): boolean {
    const settings = this.config.environment.depthMesh;
    if (settings.retainWorldMesh === false || !this.depthMesh || this.liveDepthTriangleCount === 0) return false;

    const translationThreshold = Math.max(0.05, settings.snapshotTranslationMeters ?? 0.45);
    const rotationThresholdRadians = Math.max(1, settings.snapshotRotationDegrees ?? 15) * Math.PI / 180;
    const movedEnough = !this.lastCommittedDepthPosition
      || this.liveDepthCapturePosition.distanceTo(this.lastCommittedDepthPosition) >= translationThreshold;
    const rotatedEnough = !this.lastCommittedDepthQuaternion
      || this.liveDepthCaptureQuaternion.angleTo(this.lastCommittedDepthQuaternion) >= rotationThresholdRadians;
    return movedEnough || rotatedEnough;
  }

  private persistLiveDepthMesh(): boolean {
    this.lastCommittedDepthPosition = this.liveDepthCapturePosition.clone();
    this.lastCommittedDepthQuaternion = this.liveDepthCaptureQuaternion.clone();
    if (!this.depthMesh || this.liveDepthTriangleCount === 0) return false;

    if (!this.depthMesh.geometry.boundingSphere) this.depthMesh.geometry.computeBoundingSphere();
    const sphere = this.depthMesh.geometry.boundingSphere;
    if (!sphere) return false;

    this.depthMesh.name = `Retained WebXR depth mesh ${this.depthSnapshots.length + 1}`;
    this.depthSnapshots.push({
      mesh: this.depthMesh,
      surfaceAreaSquareMeters: this.liveDepthSurfaceAreaSquareMeters,
      triangleCount: this.liveDepthTriangleCount,
      capturedAt: this.liveDepthCapturedAt,
      center: sphere.center.clone(),
      radius: sphere.radius,
    });
    this.retainedDepthSurfaceAreaSquareMeters += this.liveDepthSurfaceAreaSquareMeters;
    this.depthMesh = null;
    this.liveDepthSurfaceAreaSquareMeters = 0;
    this.liveDepthTriangleCount = 0;
    this.colliderCacheDirty = true;
    return true;
  }

  private removeDepthOverlapsCoveredBy(newGeometry: THREE.BufferGeometry, includeLiveMesh: boolean): void {
    const settings = this.config.environment.depthMesh;
    if (settings.overlapRemovalEnabled === false) return;

    const surfaceIndex = this.createDepthSurfaceIndex(newGeometry);
    if (!surfaceIndex) return;

    for (let index = this.depthSnapshots.length - 1; index >= 0; index -= 1) {
      const record = this.depthSnapshots[index];
      if (!this.depthBoundsCanOverlap(record.center, record.radius, surfaceIndex)) continue;
      const trimmed = this.trimGeometryAgainstDepthSurface(record.mesh.geometry, surfaceIndex);
      if (!trimmed) continue;
      if (!trimmed.geometry) {
        this.removeDepthSnapshot(index);
        continue;
      }

      this.retainedDepthSurfaceAreaSquareMeters = Math.max(
        0,
        this.retainedDepthSurfaceAreaSquareMeters - record.surfaceAreaSquareMeters + trimmed.surfaceAreaSquareMeters,
      );
      this.replaceEnvironmentGeometry(record.mesh, trimmed.geometry);
      record.surfaceAreaSquareMeters = trimmed.surfaceAreaSquareMeters;
      record.triangleCount = trimmed.triangleCount;
      record.center.copy(trimmed.center);
      record.radius = trimmed.radius;
    }

    if (!includeLiveMesh || !this.depthMesh) return;
    if (!this.depthMesh.geometry.boundingSphere) this.depthMesh.geometry.computeBoundingSphere();
    const liveSphere = this.depthMesh.geometry.boundingSphere;
    if (!liveSphere || !this.depthBoundsCanOverlap(liveSphere.center, liveSphere.radius, surfaceIndex)) return;

    const trimmedLive = this.trimGeometryAgainstDepthSurface(this.depthMesh.geometry, surfaceIndex);
    if (!trimmedLive) return;
    if (!trimmedLive.geometry) {
      this.disposeEnvironmentMesh(this.depthMesh);
      this.depthMesh = null;
      this.liveDepthSurfaceAreaSquareMeters = 0;
      this.liveDepthTriangleCount = 0;
      this.colliderCacheDirty = true;
      return;
    }

    this.replaceEnvironmentGeometry(this.depthMesh, trimmedLive.geometry);
    this.liveDepthSurfaceAreaSquareMeters = trimmedLive.surfaceAreaSquareMeters;
    this.liveDepthTriangleCount = trimmedLive.triangleCount;
  }

  private createDepthSurfaceIndex(geometry: THREE.BufferGeometry): DepthSurfaceIndex | null {
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    if (!position || !index || index.count < 3) return null;

    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (!sphere) return null;

    const settings = this.config.environment.depthMesh;
    const maximumDistance = Math.max(0.015, settings.overlapDistanceMeters ?? 0.1);
    const cellSize = Math.max(maximumDistance * 1.5, settings.overlapSpatialCellMeters ?? 0.18);
    const maximumNormalAngleDegrees = Math.min(89, Math.max(1, settings.overlapNormalAngleDegrees ?? 45));
    const minimumNormalDot = Math.cos(maximumNormalAngleDegrees * Math.PI / 180);
    const positions = position.array as ArrayLike<number>;
    const indices = index.array as ArrayLike<number>;
    const triangles: DepthSurfaceTriangle[] = [];
    const cells = new Map<string, number[]>();

    for (let offset = 0; offset < index.count; offset += 3) {
      const ai = Number(indices[offset]) * 3;
      const bi = Number(indices[offset + 1]) * 3;
      const ci = Number(indices[offset + 2]) * 3;
      const ax = Number(positions[ai]);
      const ay = Number(positions[ai + 1]);
      const az = Number(positions[ai + 2]);
      const bx = Number(positions[bi]);
      const by = Number(positions[bi + 1]);
      const bz = Number(positions[bi + 2]);
      const cx = Number(positions[ci]);
      const cy = Number(positions[ci + 1]);
      const cz = Number(positions[ci + 2]);
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      const normalLength = Math.hypot(crossX, crossY, crossZ);
      if (!Number.isFinite(normalLength) || normalLength < 1e-7) continue;

      const triangleIndex = triangles.length;
      triangles.push({
        ax, ay, az, bx, by, bz, cx, cy, cz,
        nx: crossX / normalLength,
        ny: crossY / normalLength,
        nz: crossZ / normalLength,
      });

      const minimumCellX = Math.floor((Math.min(ax, bx, cx) - maximumDistance) / cellSize);
      const minimumCellY = Math.floor((Math.min(ay, by, cy) - maximumDistance) / cellSize);
      const minimumCellZ = Math.floor((Math.min(az, bz, cz) - maximumDistance) / cellSize);
      const maximumCellX = Math.floor((Math.max(ax, bx, cx) + maximumDistance) / cellSize);
      const maximumCellY = Math.floor((Math.max(ay, by, cy) + maximumDistance) / cellSize);
      const maximumCellZ = Math.floor((Math.max(az, bz, cz) + maximumDistance) / cellSize);
      for (let x = minimumCellX; x <= maximumCellX; x += 1) {
        for (let y = minimumCellY; y <= maximumCellY; y += 1) {
          for (let z = minimumCellZ; z <= maximumCellZ; z += 1) {
            const key = `${x}|${y}|${z}`;
            const bucket = cells.get(key);
            if (bucket) bucket.push(triangleIndex);
            else cells.set(key, [triangleIndex]);
          }
        }
      }
    }

    if (triangles.length === 0) return null;
    return {
      cellSize,
      maximumDistanceSquared: maximumDistance * maximumDistance,
      minimumNormalDot,
      triangles,
      cells,
      center: sphere.center.clone(),
      radius: sphere.radius,
    };
  }

  private depthBoundsCanOverlap(center: THREE.Vector3, radius: number, surface: DepthSurfaceIndex): boolean {
    const maximumDistance = Math.sqrt(surface.maximumDistanceSquared);
    return center.distanceToSquared(surface.center) <= (radius + surface.radius + maximumDistance) ** 2;
  }

  private trimGeometryAgainstDepthSurface(
    geometry: THREE.BufferGeometry,
    surface: DepthSurfaceIndex,
  ): {
    geometry: THREE.BufferGeometry | null;
    triangleCount: number;
    surfaceAreaSquareMeters: number;
    center: THREE.Vector3;
    radius: number;
  } | null {
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    if (!position || !index || index.count < 3) return null;

    const positions = position.array as ArrayLike<number>;
    const indices = index.array as ArrayLike<number>;
    const keptIndices: number[] = [];
    let removedTriangleCount = 0;

    for (let offset = 0; offset < index.count; offset += 3) {
      const a = Number(indices[offset]);
      const b = Number(indices[offset + 1]);
      const c = Number(indices[offset + 2]);
      const ai = a * 3;
      const bi = b * 3;
      const ci = c * 3;
      const ax = Number(positions[ai]);
      const ay = Number(positions[ai + 1]);
      const az = Number(positions[ai + 2]);
      const bx = Number(positions[bi]);
      const by = Number(positions[bi + 1]);
      const bz = Number(positions[bi + 2]);
      const cx = Number(positions[ci]);
      const cy = Number(positions[ci + 1]);
      const cz = Number(positions[ci + 2]);
      const centroidX = (ax + bx + cx) / 3;
      const centroidY = (ay + by + cy) / 3;
      const centroidZ = (az + bz + cz) / 3;
      const abx = bx - ax;
      const aby = by - ay;
      const abz = bz - az;
      const acx = cx - ax;
      const acy = cy - ay;
      const acz = cz - az;
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      const normalLength = Math.hypot(crossX, crossY, crossZ);
      let covered = false;

      if (normalLength >= 1e-7) {
        const nx = crossX / normalLength;
        const ny = crossY / normalLength;
        const nz = crossZ / normalLength;
        const cellX = Math.floor(centroidX / surface.cellSize);
        const cellY = Math.floor(centroidY / surface.cellSize);
        const cellZ = Math.floor(centroidZ / surface.cellSize);
        const candidates = surface.cells.get(`${cellX}|${cellY}|${cellZ}`);
        if (candidates) {
          for (const candidateIndex of candidates) {
            const candidate = surface.triangles[candidateIndex];
            const normalDot = nx * candidate.nx + ny * candidate.ny + nz * candidate.nz;
            if (normalDot < surface.minimumNormalDot) continue;
            if (
              this.pointTriangleDistanceSquared(
                centroidX,
                centroidY,
                centroidZ,
                candidate,
              ) <= surface.maximumDistanceSquared
            ) {
              covered = true;
              break;
            }
          }
        }
      }

      if (covered) removedTriangleCount += 1;
      else keptIndices.push(a, b, c);
    }

    if (removedTriangleCount === 0) return null;
    if (keptIndices.length === 0) {
      return {
        geometry: null,
        triangleCount: 0,
        surfaceAreaSquareMeters: 0,
        center: new THREE.Vector3(),
        radius: 0,
      };
    }

    const copiedPositions = new Float32Array(position.count * 3);
    for (let indexOffset = 0; indexOffset < copiedPositions.length; indexOffset += 1) {
      copiedPositions[indexOffset] = Number(positions[indexOffset]);
    }
    const trimmedGeometry = new THREE.BufferGeometry();
    trimmedGeometry.setAttribute('position', new THREE.BufferAttribute(copiedPositions, 3));
    trimmedGeometry.setIndex(keptIndices);
    trimmedGeometry.computeBoundingSphere();
    const boundingSphere = trimmedGeometry.boundingSphere;
    return {
      geometry: trimmedGeometry,
      triangleCount: Math.floor(keptIndices.length / 3),
      surfaceAreaSquareMeters: this.calculateSurfaceArea(copiedPositions, keptIndices),
      center: boundingSphere?.center.clone() ?? new THREE.Vector3(),
      radius: boundingSphere?.radius ?? 0,
    };
  }

  private pointTriangleDistanceSquared(
    px: number,
    py: number,
    pz: number,
    triangle: DepthSurfaceTriangle,
  ): number {
    const abx = triangle.bx - triangle.ax;
    const aby = triangle.by - triangle.ay;
    const abz = triangle.bz - triangle.az;
    const acx = triangle.cx - triangle.ax;
    const acy = triangle.cy - triangle.ay;
    const acz = triangle.cz - triangle.az;
    const apx = px - triangle.ax;
    const apy = py - triangle.ay;
    const apz = pz - triangle.az;
    const d1 = abx * apx + aby * apy + abz * apz;
    const d2 = acx * apx + acy * apy + acz * apz;
    if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;

    const bpx = px - triangle.bx;
    const bpy = py - triangle.by;
    const bpz = pz - triangle.bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;

    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      const dx = triangle.ax + v * abx - px;
      const dy = triangle.ay + v * aby - py;
      const dz = triangle.az + v * abz - pz;
      return dx * dx + dy * dy + dz * dz;
    }

    const cpx = px - triangle.cx;
    const cpy = py - triangle.cy;
    const cpz = pz - triangle.cz;
    const d5 = abx * cpx + aby * cpy + abz * cpz;
    const d6 = acx * cpx + acy * cpy + acz * cpz;
    if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;

    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      const dx = triangle.ax + w * acx - px;
      const dy = triangle.ay + w * acy - py;
      const dz = triangle.az + w * acz - pz;
      return dx * dx + dy * dy + dz * dz;
    }

    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const edgeX = triangle.cx - triangle.bx;
      const edgeY = triangle.cy - triangle.by;
      const edgeZ = triangle.cz - triangle.bz;
      const w = (d4 - d3) / (d4 - d3 + d5 - d6);
      const dx = triangle.bx + w * edgeX - px;
      const dy = triangle.by + w * edgeY - py;
      const dz = triangle.bz + w * edgeZ - pz;
      return dx * dx + dy * dy + dz * dz;
    }

    const denominator = 1 / (va + vb + vc);
    const v = vb * denominator;
    const w = vc * denominator;
    const dx = triangle.ax + abx * v + acx * w - px;
    const dy = triangle.ay + aby * v + acy * w - py;
    const dz = triangle.az + abz * v + acz * w - pz;
    return dx * dx + dy * dy + dz * dz;
  }

  private pruneDepthSnapshots(viewerPosition: THREE.Vector3, time: number): void {
    const settings = this.config.environment.depthMesh;
    if (settings.retainWorldMesh === false) {
      while (this.depthSnapshots.length) this.removeDepthSnapshot(this.depthSnapshots.length - 1);
      return;
    }

    const maximumDistance = Math.max(1, settings.retentionDistanceMeters ?? 20);
    for (let index = this.depthSnapshots.length - 1; index >= 0; index -= 1) {
      const record = this.depthSnapshots[index];
      const nearestDistance = Math.max(0, viewerPosition.distanceTo(record.center) - record.radius);
      if (nearestDistance > maximumDistance) this.removeDepthSnapshot(index);
    }

    const maximumArea = Math.max(1, settings.maximumRetainedAreaSquareMeters ?? 250);
    const maximumSnapshots = Math.max(1, Math.floor(settings.maximumSnapshots ?? 96));
    while (
      this.depthSnapshots.length > 0
      && (
        this.depthSnapshots.length > maximumSnapshots
        || this.retainedDepthSurfaceAreaSquareMeters + this.liveDepthSurfaceAreaSquareMeters > maximumArea
      )
    ) {
      let evictionIndex = 0;
      let highestScore = -Infinity;
      for (let index = 0; index < this.depthSnapshots.length; index += 1) {
        const record = this.depthSnapshots[index];
        const nearestDistance = Math.max(0, viewerPosition.distanceTo(record.center) - record.radius);
        const ageSeconds = Math.max(0, time - record.capturedAt) / 1000;
        // Distance dominates; age breaks ties so old remote scans disappear first.
        const score = nearestDistance + Math.min(ageSeconds, 600) * 0.01;
        if (score > highestScore) {
          highestScore = score;
          evictionIndex = index;
        }
      }
      this.removeDepthSnapshot(evictionIndex);
    }
  }

  private removeDepthSnapshot(index: number): void {
    const [record] = this.depthSnapshots.splice(index, 1);
    if (!record) return;
    this.retainedDepthSurfaceAreaSquareMeters = Math.max(
      0,
      this.retainedDepthSurfaceAreaSquareMeters - record.surfaceAreaSquareMeters,
    );
    this.disposeEnvironmentMesh(record.mesh);
    this.colliderCacheDirty = true;
  }

  private refreshDepthStatistics(): void {
    let triangleCount = this.liveDepthTriangleCount;
    for (const record of this.depthSnapshots) triangleCount += record.triangleCount;
    this.depthTriangleCount = triangleCount;
  }

  private calculateSurfaceArea(positions: Float32Array, indices: number[]): number {
    let total = 0;
    for (let offset = 0; offset < indices.length; offset += 3) {
      const ai = indices[offset] * 3;
      const bi = indices[offset + 1] * 3;
      const ci = indices[offset + 2] * 3;
      const abx = positions[bi] - positions[ai];
      const aby = positions[bi + 1] - positions[ai + 1];
      const abz = positions[bi + 2] - positions[ai + 2];
      const acx = positions[ci] - positions[ai];
      const acy = positions[ci + 1] - positions[ai + 1];
      const acz = positions[ci + 2] - positions[ai + 2];
      const crossX = aby * acz - abz * acy;
      const crossY = abz * acx - abx * acz;
      const crossZ = abx * acy - aby * acx;
      const area = 0.5 * Math.hypot(crossX, crossY, crossZ);
      if (Number.isFinite(area)) total += area;
    }
    return total;
  }

  private updateAnchor(frame: XRFrame, referenceSpace: XRReferenceSpace): void {
    if (!this.anchor) return;
    const pose = frame.getPose(this.anchor.anchorSpace, referenceSpace);
    if (!pose) return;
    this.temporaryMatrix.fromArray(pose.transform.matrix);
    this.temporaryMatrix.decompose(this.anchorMarker.position, this.anchorMarker.quaternion, this.anchorMarker.scale);
  }

  private createEnvironmentMaterial(color: number): THREE.MeshBasicMaterial {
    const material = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      depthWrite: true,
      depthTest: true,
      transparent: false,
    });
    material.userData.environmentBaseColor = color;
    this.updateEnvironmentMaterial(material);
    return material;
  }

  private updateEnvironmentAppearance(mesh: THREE.Mesh): void {
    this.updateEnvironmentMaterial(mesh.material as THREE.MeshBasicMaterial);
    this.syncEnvironmentDebugOverlay(mesh);
  }

  private updateEnvironmentMaterial(material: THREE.MeshBasicMaterial): void {
    const baseColor = Number(material.userData.environmentBaseColor ?? material.color.getHex());
    material.color.setHex(this.debugVisible ? 0x168cff : baseColor);
    material.colorWrite = this.debugVisible || !this.config.environment.occlusion;
    material.transparent = this.debugVisible;
    material.opacity = this.debugVisible ? 0.1 : 1;
    material.depthWrite = !this.debugVisible || this.config.environment.occlusion;
    material.wireframe = false;
    material.needsUpdate = true;
  }

  private replaceEnvironmentGeometry(mesh: THREE.Mesh, geometry: THREE.BufferGeometry): void {
    this.disposeEnvironmentDebugOverlay(mesh);
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    this.syncEnvironmentDebugOverlay(mesh);
  }

  private disposeEnvironmentMesh(mesh: THREE.Mesh): void {
    this.disposeEnvironmentDebugOverlay(mesh);
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) material.dispose();
    mesh.removeFromParent();
  }

  private syncEnvironmentDebugOverlay(mesh: THREE.Mesh): void {
    this.disposeEnvironmentDebugOverlay(mesh);
    if (!this.debugVisible || !mesh.geometry.getAttribute('position')) return;

    const expanded = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const expandedPosition = expanded.getAttribute('position');
    if (!expandedPosition || expandedPosition.count < 3) {
      expanded.dispose();
      return;
    }

    const wireGeometry = new THREE.BufferGeometry();
    wireGeometry.setAttribute('position', expandedPosition.clone());
    const barycentric = new Float32Array(expandedPosition.count * 3);
    for (let vertex = 0; vertex + 2 < expandedPosition.count; vertex += 3) {
      barycentric[(vertex + 0) * 3 + 0] = 1;
      barycentric[(vertex + 1) * 3 + 1] = 1;
      barycentric[(vertex + 2) * 3 + 2] = 1;
    }
    wireGeometry.setAttribute('aBarycentric', new THREE.BufferAttribute(barycentric, 3));
    wireGeometry.computeBoundingSphere();
    expanded.dispose();

    const wireMaterial = new THREE.ShaderMaterial({
      uniforms: {
        lineColor: { value: new THREE.Color(0x63b7ff) },
        lineOpacity: { value: 0.96 },
        lineWidth: { value: 1.65 },
      },
      vertexShader: `
        attribute vec3 aBarycentric;
        varying vec3 vBarycentric;
        void main() {
          vBarycentric = aBarycentric;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 lineColor;
        uniform float lineOpacity;
        uniform float lineWidth;
        varying vec3 vBarycentric;
        void main() {
          vec3 edgeWidth = fwidth(vBarycentric) * lineWidth;
          vec3 edgeDistance = smoothstep(vec3(0.0), edgeWidth, vBarycentric);
          float edge = 1.0 - min(min(edgeDistance.x, edgeDistance.y), edgeDistance.z);
          if (edge < 0.025) discard;
          gl_FragColor = vec4(lineColor, edge * lineOpacity);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      toneMapped: false,
    });
    const overlay = new THREE.Mesh(wireGeometry, wireMaterial);
    overlay.name = `${mesh.name || 'Environment mesh'} debug wire overlay`;
    overlay.renderOrder = 90;
    overlay.userData.isEnvironmentDebugOverlay = true;
    mesh.add(overlay);
    mesh.userData.environmentDebugOverlay = overlay;
  }

  private disposeEnvironmentDebugOverlay(mesh: THREE.Mesh): void {
    const overlay = mesh.userData.environmentDebugOverlay as THREE.Mesh | undefined;
    if (!overlay) return;
    overlay.geometry.dispose();
    const materials = Array.isArray(overlay.material) ? overlay.material : [overlay.material];
    for (const material of materials) material.dispose();
    mesh.remove(overlay);
    delete mesh.userData.environmentDebugOverlay;
  }

  private createCursorObjects(): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.095, 32),
      new THREE.MeshBasicMaterial({ color: 0x80ffc2, side: THREE.DoubleSide, transparent: true, opacity: 0.94, depthTest: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 100;
    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.018, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false }),
    );
    dot.rotation.x = -Math.PI / 2;
    dot.position.y = 0.001;
    this.cursorObject.add(ring, dot);
    this.cursorObject.visible = false;
    this.cursorObject.renderOrder = 100;
    this.scene.add(this.cursorObject);

    const anchorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.11, 0.125, 4),
      new THREE.MeshBasicMaterial({ color: 0xffd56a, side: THREE.DoubleSide, transparent: true, opacity: 0.88, depthTest: false }),
    );
    anchorRing.rotation.x = -Math.PI / 2;
    anchorRing.renderOrder = 99;
    this.anchorMarker.add(anchorRing);
    this.anchorMarker.visible = false;
    this.scene.add(this.anchorMarker);
  }
}
