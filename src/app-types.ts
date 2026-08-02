import type * as THREE from 'three';

export type MotionState = 'idle' | 'walk' | 'jump';
export type MovementMode = 'manual' | 'follow-player' | 'follow-cursor' | 'go-to';

export interface DemoConfig {
  character: {
    visualHeightMeters: number;
    spawnLiftMeters: number;
    moveSpeedMetersPerSecond: number;
    turnSpeed: number;
    gravityMetersPerSecondSquared: number;
    jumpVelocityMetersPerSecond: number;
    followDistanceMeters: number;
    arrivalDistanceMeters: number;
    maxStepHeightMeters: number;
    capsule: {
      radiusMeters: number;
      heightMeters: number;
    };
  };
  animations: Record<MotionState, {
    url: string;
    loop: boolean;
    fadeSeconds: number;
  }>;
  environment: {
    occlusion: boolean;
    planeDetection: boolean;
    depthMesh: {
      enabled: boolean;
      sampleColumns: number;
      sampleRows: number;
      updateIntervalMilliseconds: number;
      maximumDepthMeters: number;
      maximumEdgeDeltaMeters: number;
    };
  };
}

export interface CursorHit {
  valid: boolean;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  xrHitResult?: XRHitTestResult;
}

export interface CollisionWorld {
  meshes: THREE.Mesh[];
}
