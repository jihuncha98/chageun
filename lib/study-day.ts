/** 한국 시간 06:00을 경계로 하는 공통 학습일. */
export function studyDay(date: Date = new Date()): string {
  if (!Number.isFinite(date.getTime())) throw new Error('유효하지 않은 날짜');
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0,10);
}
