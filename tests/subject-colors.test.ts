import {test} from 'node:test';
import assert from 'node:assert/strict';
import {subjectPalette} from '../lib/subject-colors';

test('각 과목마다 같은 색상을 안정적으로 사용한다',()=>{
 for(const name of ['국어','수학','영어','화학 반응의 세계','미적분Ⅱ']){
  assert.deepEqual(subjectPalette(name),subjectPalette(name));
 }
 assert.notEqual(subjectPalette('국어').solid,subjectPalette('수학').solid);
 assert.notEqual(subjectPalette('영어').solid,subjectPalette('수학').solid);
 assert.notEqual(subjectPalette('영어').solid,subjectPalette('국어').solid);
});
test('태그 색과 시간표 색을 둘 다 제공한다',()=>{
 const col=subjectPalette('물질과 에너지');
 for(const key of ['solid','soft','ink'] as const)assert.match(col[key],/^#[0-9A-Fa-f]{6}$/);
});
