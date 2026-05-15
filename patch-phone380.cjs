// patch-phone380.cjs — add +380 prefill to checkout phone
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/main.js');
let code = fs.readFileSync(file, 'utf8');

// The phone input in step 1 uses \" escapes inside a JS double-quoted string
const OLD = 'id=\\"co-phone\\" placeholder=\\"+380 XX XXX XX XX\\">';
const NEW = 'id=\\"co-phone\\" value=\\"+380\\" placeholder=\\"+380 XX XXX XX XX\\">';

const i = code.indexOf(OLD);
if (i < 0) { console.error('co-phone not found'); process.exit(1); }
code = code.slice(0, i) + NEW + code.slice(i + OLD.length);

fs.writeFileSync(file, code, 'utf8');
console.log('patch-phone380 done');
