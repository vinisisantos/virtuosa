import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogEndTime } from '../src/lib/catalog-duration.ts';

test('tempo do catálogo não é arredondado para quartos de hora nem perde a virada da hora',()=>{
  assert.deepEqual(catalogEndTime(9,0,5),{endH:'09',endM:'05'});
  assert.deepEqual(catalogEndTime(9,45,10),{endH:'09',endM:'55'});
  assert.deepEqual(catalogEndTime(9,50,10),{endH:'10',endM:'00'});
  assert.deepEqual(catalogEndTime(9,0,2),{endH:'09',endM:'02'});
  assert.deepEqual(catalogEndTime(9,0,480),{endH:'17',endM:'00'});
});
test('zero ou duração fora do horário não inventa uma reserva ou encurta o procedimento',()=>{
  for(const duration of [0,-1,NaN,Infinity,1.5])assert.equal(catalogEndTime(9,0,duration),null);
  assert.equal(catalogEndTime(21,0,120),null);
});
