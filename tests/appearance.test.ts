import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {normalizeAppearance,readAppearance} from '../lib/appearance';
test('appearance uses safe defaults for unknown stored values',()=>{
 assert.deepEqual(normalizeAppearance('unknown','black','unknown'),{dark:false,accent:'blue',font:'sans'});
});
test('previous dark setting remains respected',()=>{
 assert.deepEqual(normalizeAppearance('dark',null,null),{dark:true,accent:'blue',font:'sans'});
});
test('appearance supports independently chosen theme and font',()=>{
 assert.deepEqual(normalizeAppearance('light','violet','serif'),{dark:false,accent:'violet',font:'serif'});
 assert.deepEqual(normalizeAppearance('dark','mint','rounded'),{dark:true,accent:'mint',font:'rounded'});
});
test('appearance reads the existing per-browser preference keys',()=>{
 const saved = new Map([['chageun:theme','dark'],['chageun:accent','coral'],['chageun:font','serif']]);
 assert.deepEqual(readAppearance({getItem:(key)=>saved.get(key)??null}),{dark:true,accent:'coral',font:'serif'});
});
