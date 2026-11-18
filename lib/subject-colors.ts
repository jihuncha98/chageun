export const SUBJECT_COLORS = [
 '#8438D5','#F47516','#00894C','#DD283B','#235BE0','#E7B500','#008692','#D72A87',
 '#5636A8','#A84B05','#75AC00','#A51429','#0093DC','#A98500','#006257','#9E1764',
 '#AB56E4','#FF9F25','#19B76C','#F54E43','#143B92','#DAD012','#14B5BB','#F361AF',
 '#5831E7','#BD6A31','#416D08','#F16F78','#5078E9','#786313','#007788','#7D2B55',
 '#AE218F','#FFAA54','#007840','#922A24','#176FAB','#FFD338','#237F71','#BC435F',
] as const;

type ColorSubject = {id: string; colorIndex?: number};

function validIndex(index: number | undefined): index is number {
 return index !== undefined && Number.isSafeInteger(index) && index >= 0;
}

export function assignSubjectColors<T extends ColorSubject>(subjects: T[]): T[] {
 const reserved = new Set(subjects.map(s => s.colorIndex).filter(validIndex));
 const seen = new Set<number>();
 let next = 0;
 return subjects.map(subject => {
  if (validIndex(subject.colorIndex) && !seen.has(subject.colorIndex)) {
   seen.add(subject.colorIndex);
   return subject;
  }
  while (reserved.has(next)) next++;
  reserved.add(next);
  return {...subject, colorIndex: next++};
 });
}

export function subjectPalette(id: string, subjects: readonly ColorSubject[]) {
 const index = subjects.find(subject => subject.id === id)?.colorIndex;
 // Archived rollups can reference subjects no longer present in the workspace.
 let hash = 2166136261;
 for (const character of id) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619) >>> 0;
 const solid = SUBJECT_COLORS[(validIndex(index) ? index : hash) % SUBJECT_COLORS.length];
 return {solid, soft: `color-mix(in srgb, ${solid} 20%, white)`, ink: `color-mix(in srgb, ${solid} 53%, black)`};
}

export function donutBackground(subjects: readonly {ms: number; color: string}[]) {
 if (!subjects.length) return undefined;
 const total = subjects.reduce((sum, subject) => sum + subject.ms, 0);
 let angle = 0;
 const stops = subjects.flatMap(({ms, color}, index) => {
  const start = angle;
  const span = ms / total * 360;
  angle = index === subjects.length - 1 ? 360 : start + span;
  if (subjects.length === 1) return [`${color} 0deg 360deg`];
  const divider = Math.min(0.7, span * 0.12);
  return [`${color} ${start}deg ${angle - divider}deg`, `white ${angle - divider}deg ${angle}deg`];
 });
 return `conic-gradient(${stops.join(', ')})`;
}
