// Theme package loader — validates and returns a typed ThemePackage.
// Uses Zod schema for full runtime validation.

import type { ThemePackage } from '@/themes/schema';
import { themePackageSchema } from '@/lib/theme-schema';

export function loadTheme(raw: unknown): ThemePackage {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Theme data must be a non-null object');
  }

  const result = themePackageSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 5)
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Theme validation failed: ${issues}`);
  }

  return result.data as ThemePackage;
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
