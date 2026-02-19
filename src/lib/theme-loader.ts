// Theme package loader — validates and returns a typed ThemePackage.
// Phase 1: type assertion only. Phase 3 will add Zod schema validation.

import type { ThemePackage } from '@/themes/schema';

export function loadTheme(raw: unknown): ThemePackage {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Theme data must be a non-null object');
  }

  const pkg = raw as Record<string, unknown>;

  // Basic required-field presence checks
  const requiredFields: (keyof ThemePackage)[] = [
    'id', 'name', 'description', 'source',
    'civilizations', 'map', 'resources', 'techTree',
    'buildings', 'units', 'events', 'diplomacyOptions',
    'victoryConditions', 'defeatConditions', 'mechanics', 'flavor',
  ];

  for (const field of requiredFields) {
    if (!(field in pkg)) {
      throw new Error(`Theme is missing required field: "${field}"`);
    }
  }

  // Phase 3: replace this cast with a Zod parse for full runtime safety
  return raw as ThemePackage;
}

export function loadThemeFromJson(json: string): ThemePackage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new Error(`Failed to parse theme JSON: ${String(err)}`);
  }
  return loadTheme(parsed);
}
