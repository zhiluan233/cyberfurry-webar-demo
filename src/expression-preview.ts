import type { VRMExpression, VRMExpressionManager } from '@pixiv/three-vrm';

const SYLLABLE_SECONDS = 0.19;
const CUSTOM_MOUTH = /^(?:(?:vrc[._ -]*)?(?:viseme|v|mouth)[._ -]*)?(?:aa|ih|ou|ee|oh|[aiueoあいうえお])$|^(?:mouth[._ -]*open|jaw[._ -]*open|张嘴|張嘴)$/iu;

export class ExpressionPreview {
  readonly keys: readonly { name: string; preset: boolean }[];
  private readonly mouthKeys: string[];
  private readonly weights = new Map<string, number>();
  private speechTime = 0;
  private hadPreview = false;
  speaking = false;

  constructor(private readonly manager: VRMExpressionManager) {
    const presets = manager.presetExpressionMap;
    this.keys = manager.expressions.map(({ expressionName: name }) => ({ name, preset: Object.hasOwn(presets, name) }));
    const mouthKeys = this.keys.map(key => key.name);
    this.mouthKeys = manager.mouthExpressionNames.filter(name => mouthKeys.includes(name));
    if (!this.mouthKeys.length) this.mouthKeys = mouthKeys.filter(name => CUSTOM_MOUTH.test(name));
  }

  get canSpeak(): boolean { return this.mouthKeys.length > 0; }

  setWeight(name: string, weight: number): void {
    if (weight > 0) this.weights.set(name, weight);
    else this.weights.delete(name);
  }

  reset(): void {
    this.weights.clear();
    this.speaking = false;
    this.speechTime = 0;
  }

  update(delta: number): void {
    const speaking = this.speaking && this.canSpeak;
    this.speechTime = speaking ? (this.speechTime + delta) % (SYLLABLE_SECONDS * this.mouthKeys.length) : 0;
    if (!speaking && !this.weights.size) {
      if (this.hadPreview) this.manager.update();
      this.hadPreview = false;
      return;
    }

    const syllable = this.speechTime / SYLLABLE_SECONDS;
    const mouth = speaking ? this.mouthKeys[Math.floor(syllable)] : undefined;
    const speechWeight = 0.8 * Math.sin(Math.PI * (syllable % 1));
    const baseWeights = new Map<VRMExpression, number>();
    const apply = (name: string, weight: number) => {
      const expression = this.manager.getExpression(name);
      if (!expression) return;
      baseWeights.set(expression, expression.weight);
      this.manager.setValue(name, expression.weight + weight);
    };
    for (const [name, weight] of this.weights) {
      if (name !== mouth) apply(name, weight);
    }
    if (mouth) apply(mouth, (this.weights.get(mouth) ?? 0) + speechWeight);

    // Keep the active test vowel visible while previewing expressions that override VRM mouth weights.
    const mouthExpressionNames = this.manager.mouthExpressionNames;
    if (mouth) this.manager.mouthExpressionNames = mouthExpressionNames.filter(name => name !== mouth);
    try {
      this.manager.update();
    } finally {
      this.manager.mouthExpressionNames = mouthExpressionNames;
      // Leave the animated weights available for the mixer and look-at on the next frame.
      for (const [expression, base] of baseWeights) expression.weight = base;
    }
    this.hadPreview = true;
  }
}
