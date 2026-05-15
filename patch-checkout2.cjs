// patch-checkout2.cjs
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/main.js');
let code = fs.readFileSync(file, 'utf8');

// ── 1. Remove courier delivery option ────────────────────────────────────────
const COURIER_LINE = '     ["courier","\\uD83C\\uDFE0","\\u041A\\u0443\\u0440\'\\u0454\\u0440","1 \\u0434\\u0435\\u043d\\u044c","\\u0432\\u0456\\u0434 120 \\u0433\\u0440\\u043d"],';
const COURIER_LINE2 = '     ["courier","\\uD83C\\uDFE0","\\u041A\\u0443\\u0440\'\\u0454\\u0440","1 \\u0434\\u0435\\u043d\\u044c","\\u0432\\u0456\\u0434 120 \\u0433\\u0440\\u043d"]].forEach';

// The courier line ends the array, so we need to remove it and fix the preceding ukr line
const UKR_END_COMMA = '"\\u0432\\u0456\\u0434 35 \\u0433\\u0440\\u043d"],';
const ci = code.indexOf(UKR_END_COMMA);
if (ci < 0) { console.error('ukr line end not found'); process.exit(1); }

// Find the start of the courier line (next line after ukr)
let courierStart = code.indexOf('\n', ci) + 1;
// Find end of courier line (the .forEach line starts after it)
let courierLineEnd = code.indexOf('].forEach', courierStart);
if (courierLineEnd < 0) { console.error('courier end not found'); process.exit(1); }

// Remove the courier line and fix the trailing comma on ukr line
// Replace ukr trailing comma+newline+courier line with just ].forEach
code = code.slice(0, ci)
  + '"\\u0432\\u0456\\u0434 35 \\u0433\\u0440\\u043d"]].forEach'
  + code.slice(courierLineEnd + '].forEach'.length);

// ── 2. Fix delivery card onclick: coDelivery='X';renderCheckout() → coSetDelivery('X') ───
code = code.replace(
  /onclick=\\"coDelivery='"\+d\[0\]\+"';renderCheckout\(\)\\"/g,
  'onclick=\\"coSetDelivery(\'"+d[0]+"\')\\"'
);

// ── 3. Fix step 2 back button ─────────────────────────────────────────────────
code = code.replace(
  'onclick="coStep=1;renderCheckout()"',
  'onclick="coStepGo(1)"'
);

// ── 4. Fix step 4 back button ─────────────────────────────────────────────────
code = code.replace(
  'onclick="coStep=3;renderCheckout()"',
  'onclick="coStepGo(3)"'
);

// ── 5. Add +380 prefill to checkout phone ─────────────────────────────────────
code = code.replace(
  'id="co-phone" placeholder="+380 XX XXX XX XX">',
  'id="co-phone" value="+380" placeholder="+380 XX XXX XX XX">'
);

// ── 6. Add +380 prefill to login phone ────────────────────────────────────────
code = code.replace(
  'id="lf-phone" placeholder="+380 XX XXX XX XX"',
  'id="lf-phone" value="+380" placeholder="+380 XX XXX XX XX"'
);

// ── 7. Add window.coSetDelivery ───────────────────────────────────────────────
code = code.replace(
  'window.coStepGo  = function(n){ coStep=n; renderCheckout(); };',
  'window.coStepGo     = function(n){ coStep=n; renderCheckout(); };\nwindow.coSetDelivery = function(v){ coDelivery=v; renderCheckout(); };'
);

fs.writeFileSync(file, code, 'utf8');
console.log('patch-checkout2 done');
