/** Browser-only appearance preferences. No private study data is changed. */
export const ACCENTS = ['blue','violet','mint','coral'] as const;
export type Accent = (typeof ACCENTS)[number];
export const FONTS = ['sans','serif','rounded'] as const;
export type FontChoice = (typeof FONTS)[number];
export type Appearance = {dark:boolean;accent:Accent;font:FontChoice};
export const defaultAppearance:Appearance = {dark:false,accent:'blue',font:'sans'};
export const appearanceStorageKeys = {theme:'chageun:theme',accent:'chageun:accent',font:'chageun:font'} as const;
export function normalizeAppearance(theme:string|null,accent:string|null,font:string|null):Appearance {
 return {
  dark:theme==='dark',
  accent:ACCENTS.find(value=>value===accent)??defaultAppearance.accent,
  font:FONTS.find(value=>value===font)??defaultAppearance.font
 };
}
export function readAppearance(storage:Pick<Storage,'getItem'>):Appearance{
 return normalizeAppearance(storage.getItem(appearanceStorageKeys.theme),storage.getItem(appearanceStorageKeys.accent),storage.getItem(appearanceStorageKeys.font));
}
