// patch-fix-delivery.cjs — restore UKR, fix NP icon
'use strict';
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, 'src', 'main.js');
const raw = fs.readFileSync(fp, 'utf8');
const hasCRLF = raw.includes('\r\n');
let src = hasCRLF ? raw.replace(/\r\n/g, '\n') : raw;

function rep(from, to) {
  if (src.indexOf(from) === -1) { console.warn('NOT FOUND:', from.slice(0, 70)); return false; }
  src = src.split(from).join(to);
  return true;
}

// Fixed NP SVG (clean proportions, arrows seamlessly connected to H)
const NP_SVG_NEW = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 32 32\\" width=\\"38\\" height=\\"38\\" style=\\"display:block\\">'
  + '<rect width=\\"32\\" height=\\"32\\" rx=\\"4\\" fill=\\"#E41E27\\"/>'
  // H left bar
  + '<rect x=\\"8\\" y=\\"9\\" width=\\"4\\" height=\\"14\\" fill=\\"#fff\\"/>'
  // H right bar
  + '<rect x=\\"20\\" y=\\"9\\" width=\\"4\\" height=\\"14\\" fill=\\"#fff\\"/>'
  // H crossbar
  + '<rect x=\\"8\\" y=\\"13\\" width=\\"16\\" height=\\"6\\" fill=\\"#fff\\"/>'
  // Up arrow — base exactly at y=9 (H top)
  + '<polygon points=\\"16,2 11,9 21,9\\" fill=\\"#fff\\"/>'
  // Down arrow — base at y=23 (H bottom)
  + '<polygon points=\\"16,30 11,23 21,23\\" fill=\\"#fff\\"/>'
  // Left arrow — base at x=8, y=11-21
  + '<polygon points=\\"2,16 8,11 8,21\\" fill=\\"#fff\\"/>'
  // Right arrow — base at x=24, y=11-21
  + '<polygon points=\\"30,16 24,11 24,21\\" fill=\\"#fff\\"/>'
  + '</svg>';

// UKR icon SVG
const UKR_SVG = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 26 36\\" width=\\"30\\" height=\\"38\\" style=\\"display:block\\">'
  + '<path d=\\"M13 1C7.48 1 3 5.48 3 11c0 8.5 10 24 10 24s10-15.5 10-24C23 5.48 18.52 1 13 1z\\" fill=\\"#F9C000\\"/>'
  + '<circle cx=\\"13\\" cy=\\"11\\" r=\\"5\\" fill=\\"#fff\\"/>'
  + '<circle cx=\\"13\\" cy=\\"11\\" r=\\"2.5\\" fill=\\"#F9C000\\"/>'
  + '</svg>';

// Courier SVG (truck)
const CR_SVG_NEW = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 40 28\\" width=\\"40\\" height=\\"38\\" style=\\"display:block\\">'
  + '<rect x=\\"1\\" y=\\"3\\" width=\\"22\\" height=\\"17\\" rx=\\"3\\" fill=\\"#1FAF5A\\"/>'
  + '<path d=\\"M23 8 L23 20 L37 20 L37 14 L31 8 Z\\" fill=\\"#1FAF5A\\"/>'
  + '<rect x=\\"25\\" y=\\"9\\" width=\\"8\\" height=\\"7\\" rx=\\"1\\" fill=\\"#c8f5d8\\"/>'
  + '<circle cx=\\"8\\" cy=\\"23\\" r=\\"4\\" fill=\\"#333\\"/><circle cx=\\"8\\" cy=\\"23\\" r=\\"2\\" fill=\\"#fff\\"/>'
  + '<circle cx=\\"29\\" cy=\\"23\\" r=\\"4\\" fill=\\"#333\\"/><circle cx=\\"29\\" cy=\\"23\\" r=\\"2\\" fill=\\"#fff\\"/>'
  + '</svg>';

// Old NP SVG that's currently in the file (to find and replace it)
const NP_SVG_OLD = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 32 32\\" width=\\"38\\" height=\\"38\\" style=\\"display:block\\">'
  + '<rect width=\\"32\\" height=\\"32\\" rx=\\"5\\" fill=\\"#E41E27\\"/>'
  + '<rect x=\\"7\\" y=\\"8\\" width=\\"5\\" height=\\"16\\" fill=\\"#fff\\"/>'
  + '<rect x=\\"20\\" y=\\"8\\" width=\\"5\\" height=\\"16\\" fill=\\"#fff\\"/>'
  + '<rect x=\\"7\\" y=\\"12.5\\" width=\\"18\\" height=\\"7\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"16,1 11,7 21,7\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"16,31 11,25 21,25\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"1,16 7,11 7,21\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"31,16 25,11 25,21\\" fill=\\"#fff\\"/>'
  + '</svg>';

// Old Courier SVG
const CR_SVG_OLD = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 40 28\\" width=\\"40\\" height=\\"28\\" style=\\"display:block\\">'
  + '<rect x=\\"1\\" y=\\"4\\" width=\\"23\\" height=\\"16\\" rx=\\"3\\" fill=\\"#1FAF5A\\"/>'
  + '<path d=\\"M24 9 L24 20 L37 20 L37 14 L31 9 Z\\" fill=\\"#1FAF5A\\"/>'
  + '<rect x=\\"26\\" y=\\"10\\" width=\\"8\\" height=\\"6\\" rx=\\"1\\" fill=\\"#b6f0cc\\"/>'
  + '<circle cx=\\"8\\" cy=\\"24\\" r=\\"4\\" fill=\\"#1a1d1f\\"/><circle cx=\\"8\\" cy=\\"24\\" r=\\"2\\" fill=\\"#fff\\"/>'
  + '<circle cx=\\"29\\" cy=\\"24\\" r=\\"4\\" fill=\\"#1a1d1f\\"/><circle cx=\\"29\\" cy=\\"24\\" r=\\"2\\" fill=\\"#fff\\"/>'
  + '</svg>';

// ── 1. Fix NP icon ───────────────────────────────────────────────────────────
if (!rep('"'+NP_SVG_OLD+'"', '"'+NP_SVG_NEW+'"')) {
  console.warn('NP icon not replaced — trying partial match');
}

// ── 2. Fix courier icon ──────────────────────────────────────────────────────
rep('"'+CR_SVG_OLD+'"', '"'+CR_SVG_NEW+'"');

// ── 3. Add Ukrposhta back to delivery options ────────────────────────────────
// Current array ends with: ...courier data...
rep(
  '"courier","'+CR_SVG_NEW+'","\\u041a\\u0443\\u0440\'\\u0454\\u0440","1-3 \\u0434\\u043d\\u0456","\\u0432\\u0456\\u0434 120 \\u0433\\u0440\\u043d"]].forEach',
  '"courier","'+CR_SVG_NEW+'","\\u041a\\u0443\\u0440\'\\u0454\\u0440","1-3 \\u0434\\u043d\\u0456","\\u0432\\u0456\\u0434 120 \\u0433\\u0440\\u043d"],\n     ["ukr","'+UKR_SVG+'","\\u0423\\u043a\\u0440\\u043f\\u043e\\u0448\\u0442\\u0430","3-5 \\u0434\\u043d\\u0456\\u0432","\\u0432\\u0456\\u0434 35 \\u0433\\u0440\\u043d"]].forEach'
);

// ── 4. Add Ukrposhta form fields in the else branch ──────────────────────────
// Current: nova -> else (courier form)
// Need:    nova -> else if ukr -> else (courier form)
rep(
  '}else{\n    cityField=\'<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">\';\n    deptField=\'<div style="display:flex;flex-direction:column;gap:8px">\'',
  '}else if(coDelivery==="ukr"){\n    cityField=\'<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">\';\n    deptField=\'<input class="co-input" id="co-dept" placeholder="\\u0412\\u0456\\u0434\\u0434\\u0456\\u043b\\u0435\\u043d\\u043d\\u044f \\u2116...">\' ;\n  }else{\n    cityField=\'<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">\';\n    deptField=\'<div style="display:flex;flex-direction:column;gap:8px">\'}'
);

// ── 5. Update dcost to include ukr ───────────────────────────────────────────
rep(
  'var dcost=coDelivery==="courier"?120:65;\n  if(total>=1500)dcost=0;\n  var s=stepsHTML()',
  'var dcost=coDelivery==="courier"?120:coDelivery==="ukr"?35:65;\n  if(total>=1500)dcost=0;\n  var s=stepsHTML()'
);
rep(
  'var dcost=coDelivery==="courier"?120:65;\n  if(total>=1500)dcost=0;\n  var orderData',
  'var dcost=coDelivery==="courier"?120:coDelivery==="ukr"?35:65;\n  if(total>=1500)dcost=0;\n  var orderData'
);

// ── 6. Update step 4 dlbl to include ukr ────────────────────────────────────
rep(
  'var dlbl={nova:"Nova Poshta",courier:"\\u041a\\u0443\\u0440\'\\u0454\\u0440"};',
  'var dlbl={nova:"Nova Poshta",ukr:"\\u0423\\u043a\\u0440\\u043f\\u043e\\u0448\\u0442\\u0430",courier:"\\u041a\\u0443\\u0440\'\\u0454\\u0440"};'
);

const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(fp, out, 'utf8');
console.log('patch-fix-delivery done');
