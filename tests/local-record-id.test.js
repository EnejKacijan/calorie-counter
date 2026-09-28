import test from "node:test";
import assert from "node:assert/strict";
import {localRecordId} from "../public/local-record-id.js";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
test("native UUID is feature-detected and called on its crypto receiver",()=>{
 const c={randomUUID(){assert.equal(this,c);return "native-id";},getRandomValues(){assert.fail();}};
 assert.equal(localRecordId(c),"native-id");
});
test("getRandomValues fallback has UUID v4 version and variant bits",()=>{
 assert.equal(localRecordId({getRandomValues:a=>a.fill(0)}),"00000000-0000-4000-8000-000000000000");
 assert.equal(localRecordId({getRandomValues:a=>a.fill(255)}),"ffffffff-ffff-4fff-bfff-ffffffffffff");
});
test("fallback generates distinct UUID-compatible local record IDs",()=>{
 const c={getRandomValues:a=>crypto.getRandomValues(a)},ids=Array.from({length:1000},()=>localRecordId(c));
 assert.equal(new Set(ids).size,1000);ids.forEach(id=>assert.match(id,uuid));
});
test("no random capability fails explicitly without patching global crypto",()=>{
 const original=crypto.randomUUID;assert.throws(()=>localRecordId({}),{code:"local-id-unavailable"});assert.equal(crypto.randomUUID,original);
});
