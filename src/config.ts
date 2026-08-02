import type { DemoConfig } from './app-types';

export async function loadConfig(): Promise<DemoConfig> {
  const response = await fetch('/config/character.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`配置载入失败：HTTP ${response.status}`);
  return response.json() as Promise<DemoConfig>;
}
