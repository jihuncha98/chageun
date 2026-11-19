export const focusThemes = [
  { id: 'default', label: '기본 테마', color: '#182135', accent: '#668bcc' },
  { id: 'forest', label: '청록 픽셀 숲', color: '#082923', accent: '#69c891' },
  { id: 'metro', label: '심야 지하철', color: '#10191d', accent: '#e4a356' },
  { id: 'computer', label: '레트로 컴퓨터실', color: '#0a1728', accent: '#69d5de' },
  { id: 'library', label: '밤의 도서관', color: '#21130f', accent: '#dba55e' },
  { id: 'space', label: '우주 관측실', color: '#081529', accent: '#7fc6ed' },
  { id: 'laundry', label: '새벽 세탁소', color: '#102b33', accent: '#e6a995' },
  { id: 'jazz', label: '심야 재즈바', color: '#240b14', accent: '#da7986' },
] as const;

export type FocusTheme = (typeof focusThemes)[number];
const key = 'chageun-focus-theme';

export function readFocusTheme(): FocusTheme {
  try {
    const id = localStorage.getItem(key);
    return focusThemes.find(theme => theme.id === id) ?? focusThemes[0];
  } catch {
    return focusThemes[0];
  }
}

export function saveFocusTheme(theme: FocusTheme) {
  localStorage.setItem(key, theme.id);
}

export function focusThemeImage(theme: FocusTheme) {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? '/chageun'}/focus-themes/${theme.id}.webp`;
}
