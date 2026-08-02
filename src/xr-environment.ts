import * as THREE from 'three';
import type { CursorHit, DemoConfig } from './app-types';

type PlaneRecord = { mesh: THREE.Mesh; lastChanged: number };

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

  constructor(private readonly scene: THREE.Scene, private readonly config: DemoConfig) {
    this.group.name = 'XR environment geometry';
    this.scene.add(this.group);
    this.createCursorObjects();
  }

  get colliders(): THREE.Mesh[] {
    const result = [...this.planeRecords.values()].map(record => record.mesh);
    if (this.depthMesh) result.push(this.depthMesh);
    if (this.anchorFloorProxy) result.push(this.anchorFloorProxy);
    return result;
  }

  setDebugVisible(visible: boolean): void {
    this.debugVisible = visible;
    for (const record of this.planeRecords.values()) this.updateEnvironmentMaterial(record.mesh.material as THREE.MeshBasicMaterial);
    if (this.depthMesh) this.updateEnvironmentMaterial(this.depthMesh.material as THREE.MeshBasicMaterial);
    if (this.anchorFloorProxy) this.updateEnvironmentMaterial(this.anchorFloorProxy.material as THREE.MeshBasicMaterial);
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
    }
    this.anchorFloorProxy.position.copy(this.cursor.position);
    this.anchorFloorProxy.quaternion.copy(this.cursorObject.quaternion);
    this.anchorFloorProxy.updateMatrixWorld(true);
    return this.cursor.position.clone();
  }

  clearXRGeometry(): void {
    for (const record of this.planeRecords.values()) {
      record.mesh.geometry.dispose();
      (record.mesh.material as THREE.Material).dispose();
      this.group.remove(record.mesh);
    }
    this.planeRecords.clear();
    if (this.depthMesh) {
      this.depthMesh.geometry.dispose();
      (this.depthMesh.material as THREE.Material).dispose();
      this.group.remove(this.depthMesh);
      this.depthMesh = null;
    }
    if (this.anchorFloorProxy) {
      this.anchorFloorProxy.geometry.dispose();
      (this.anchorFloorProxy.material as THREE.Material).dispose();
      this.group.remove(this.anchorFloorProxy);
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
    this.lastDepthUpdate = -Infinity;
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
        record.mesh.geometry.dispose();
        (record.mesh.material as THREE.Material).dispose();
        this.group.remove(record.mesh);
        this.planeRecords.delete(plane);
      }
    }

    for (const plane of active) {
      const pose = frame.getPose(plane.planeSpace, referenceSpace);
      if (!pose) continue;
      let record = this.planeRecords.get(plane);
      if (!record || record.lastChanged !== plane.lastChangedTime) {
        const geometry = this.createPlaneGeometry(plane.polygon);
        if (record) {
          record.mesh.geometry.dispose();
          record.mesh.geometry = geometry;
          record.lastChanged = plane.lastChangedTime;
        } else {
          const mesh = new THREE.Mesh(geometry, this.createEnvironmentMaterial(0x4df0a0));
          mesh.name = `XR plane: ${plane.semanticLabel ?? plane.orientation ?? 'unknown'}`;
          mesh.userData.isEnvironmentCollider = true;
          this.group.add(mesh);
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

      // Rate-limit both successful and failed processing attempts once the
      // runtime starts returning depth data. This avoids retrying a device-side
      // depth failure on every XR frame.
      this.lastDepthUpdate = time;

      const columns = Math.max(2, Math.floor(settings.sampleColumns));
      const rows = Math.max(2, Math.floor(settings.sampleRows));
      const positions = new Float32Array(columns * rows * 3);
      const valid = new Uint8Array(columns * rows);
      const depths = new Float32Array(columns * rows);
      const inverseProjection = new THREE.Matrix4().fromArray(view.projectionMatrix).invert();
      const viewToWorld = new THREE.Matrix4().fromArray(view.transform.matrix);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const index = row * columns + column;
          const u = (column + 0.5) / columns;
          const v = (row + 0.5) / rows;

          // getDepthInMeters() expects normalized VIEW coordinates in [0, 1].
          // Passing depth-buffer pixel coordinates throws RangeError when the
          // first depth frame arrives and can terminate Three.js' XR loop.
          const meters = depth.getDepthInMeters(u, v);
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

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      // MeshBasicMaterial and raycasting do not require a normal attribute.

      if (!this.depthMesh) {
        this.depthMesh = new THREE.Mesh(geometry, this.createEnvironmentMaterial(0x69a8ff));
        this.depthMesh.name = 'WebXR depth collision and occlusion mesh';
        this.depthMesh.userData.isEnvironmentCollider = true;
        this.depthMesh.renderOrder = -20;
        this.group.add(this.depthMesh);
      } else {
        this.depthMesh.geometry.dispose();
        this.depthMesh.geometry = geometry;
      }

      this.depthTriangleCount = Math.floor(indices.length / 3);
      this.depthMesh.updateMatrixWorld(true);
      this.depthAvailable = true;
      this.depthFailureCount = 0;
    } catch (error) {
      this.depthAvailable = false;
      this.depthFailureCount += 1;
      console.warn(`WebXR depth processing failed (${this.depthFailureCount}/3).`, error);

      // Experimental depth implementations must never be allowed to terminate
      // the XR render loop. Keep hit-test/plane AR alive after repeated errors.
      if (this.depthFailureCount >= 3) {
        this.depthDisabledForSession = true;
        console.error('WebXR depth mesh disabled for this session after repeated failures.');
      }
    }
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
    this.updateEnvironmentMaterial(material);
    return material;
  }

  private updateEnvironmentMaterial(material: THREE.MeshBasicMaterial): void {
    material.colorWrite = this.debugVisible || !this.config.environment.occlusion;
    material.transparent = this.debugVisible;
    material.opacity = this.debugVisible ? 0.28 : 1;
    material.wireframe = this.debugVisible;
    material.needsUpdate = true;
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
