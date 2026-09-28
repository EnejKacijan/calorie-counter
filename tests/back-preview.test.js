import test from 'node:test';
import assert from 'node:assert/strict';
import {captureBackPreview} from '../public/back-preview.js';
test('unavailable/disconnected parents do not create a preview',()=>{
  assert.equal(captureBackPreview(null,{}),null);
  assert.equal(captureBackPreview({isConnected:false},{}),null);
});
test('unreadable parent styles fail closed before creating a gesture surface',()=>{
  const sheet={get cssRules(){throw new Error('Cross-origin stylesheet');}};
  assert.equal(captureBackPreview({isConnected:true},{document:{styleSheets:[sheet],createElement(){assert.fail('No unstyled navigation parent');}}}),null);
});
