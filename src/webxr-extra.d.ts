interface XRPlane {
  planeSpace: XRSpace;
  polygon: readonly DOMPointReadOnly[];
  orientation: 'horizontal' | 'vertical' | null;
  semanticLabel?: string | null;
  lastChangedTime: DOMHighResTimeStamp;
}

interface XRFrame {
  detectedPlanes?: ReadonlySet<XRPlane>;
  getDepthInformation?(view: XRView): XRCPUDepthInformation | null;
}

interface XRCPUDepthInformation {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayBuffer;
  readonly rawValueToMeters: number;
  readonly normDepthBufferFromNormView: XRRigidTransform;
  getDepthInMeters(x: number, y: number): number;
}

interface XRHitTestResult {
  createAnchor?(): Promise<XRAnchor>;
}

interface XRAnchor {
  readonly anchorSpace: XRSpace;
  delete(): void;
}

interface XRSessionInit {
  depthSensing?: {
    usagePreference?: Array<'cpu-optimized' | 'gpu-optimized'>;
    dataFormatPreference?: Array<'luminance-alpha' | 'float32' | 'unsigned-short'>;
  };
  domOverlay?: { root: Element };
}

interface XRSession {
  depthUsage?: string;
  depthDataFormat?: string;
  domOverlayState?: { type: string };
}
