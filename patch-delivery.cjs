// patch-delivery.cjs — NP/UKR icons + courier delivery with address form
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

// SVG icons (as they appear inside JS double-quoted strings, so " → \")
const NP_SVG  = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 32 32\\" width=\\"38\\" height=\\"38\\" style=\\"display:block\\">'
  + '<rect width=\\"32\\" height=\\"32\\" rx=\\"5\\" fill=\\"#E41E27\\"/>'
  + '<rect x=\\"7\\" y=\\"8\\" width=\\"5\\" height=\\"16\\" fill=\\"#fff\\"/>'
  + '<rect x=\\"20\\" y=\\"8\\" width=\\"5\\" height=\\"16\\" fill=\\"#fff\\"/>'
  + '<rect x=\\"7\\" y=\\"12.5\\" width=\\"18\\" height=\\"7\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"16,1 11,7 21,7\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"16,31 11,25 21,25\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"1,16 7,11 7,21\\" fill=\\"#fff\\"/>'
  + '<polygon points=\\"31,16 25,11 25,21\\" fill=\\"#fff\\"/>'
  + '</svg>';
const CR_SVG  = '<svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 40 28\\" width=\\"40\\" height=\\"28\\" style=\\"display:block\\">'
  + '<rect x=\\"1\\" y=\\"4\\" width=\\"23\\" height=\\"16\\" rx=\\"3\\" fill=\\"#1FAF5A\\"/>'
  + '<path d=\\"M24 9 L24 20 L37 20 L37 14 L31 9 Z\\" fill=\\"#1FAF5A\\"/>'
  + '<rect x=\\"26\\" y=\\"10\\" width=\\"8\\" height=\\"6\\" rx=\\"1\\" fill=\\"#b6f0cc\\"/>'
  + '<circle cx=\\"8\\" cy=\\"24\\" r=\\"4\\" fill=\\"#1a1d1f\\"/><circle cx=\\"8\\" cy=\\"24\\" r=\\"2\\" fill=\\"#fff\\"/>'
  + '<circle cx=\\"29\\" cy=\\"24\\" r=\\"4\\" fill=\\"#1a1d1f\\"/><circle cx=\\"29\\" cy=\\"24\\" r=\\"2\\" fill=\\"#fff\\"/>'
  + '</svg>';

// ── 1. Add courier variables ─────────────────────────────────────────────────
rep(
  'var _coName="",_coPhone="",_coEmail="",_coCity="",_coDept="",_coCityRef="",_coWareRef="",_coStreet="",_coApt="",_coTime="";',
  'var _coName="",_coPhone="",_coEmail="",_coCity="",_coDept="",_coCityRef="",_coWareRef="",_coStreet="",_coApt="",_coTime="";'
);
// if not already added from previous patch:
rep(
  'var _coName="",_coPhone="",_coEmail="",_coCity="",_coDept="",_coCityRef="",_coWareRef="";',
  'var _coName="",_coPhone="",_coEmail="",_coCity="",_coDept="",_coCityRef="",_coWareRef="",_coStreet="",_coApt="",_coTime="";'
);

// ── 2. Delivery options array: remove ukr, add courier ──────────────────────
rep(
  'var dc="";\n    [["nova","<span class=\\"brand-b np\\">NP</span>","Nova Poshta","1-2 \\u0434\\u043d\\u0456","\\u0432\\u0456\\u0434 65 \\u0433\\u0440\\u043d"],\n     ["ukr","\\uD83D\\uDCEE","\\u0423\\u043a\\u0440\\u043f\\u043e\\u0448\\u0442\\u0430","3-5 \\u0434\\u043d\\u0456\\u0432","\\u0432\\u0456\\u0434 35 \\u0433\\u0440\\u043d"]].forEach(function(d){',
  'var dc="";\n    [["nova","' + NP_SVG + '","Nova Poshta","1-2 \\u0434\\u043d\\u0456","\\u0432\\u0456\\u0434 65 \\u0433\\u0440\\u043d"],\n     ["courier","' + CR_SVG + '","\\u041a\\u0443\\u0440\'\\u0454\\u0440","1-3 \\u0434\\u043d\\u0456","\\u0432\\u0456\\u0434 120 \\u0433\\u0440\\u043d"]].forEach(function(d){'
);

// ── 3. dcost in renderCheckout preview ───────────────────────────────────────
rep(
  'var dcost=coDelivery==="nova"?65:coDelivery==="ukr"?35:120;\n  if(total>=1500)dcost=0;\n  var s=stepsHTML()',
  'var dcost=coDelivery==="courier"?120:65;\n  if(total>=1500)dcost=0;\n  var s=stepsHTML()'
);
// coFinish dcost
rep(
  'var dcost=coDelivery==="nova"?65:coDelivery==="ukr"?35:120;\n  if(total>=1500)dcost=0;\n  var orderData',
  'var dcost=coDelivery==="courier"?120:65;\n  if(total>=1500)dcost=0;\n  var orderData'
);

// ── 4. Courier form: replace ukr/else blocks with proper courier fields ──────
// The current else block (fallback for courier) adds simple city+address inputs.
// We need to make courier have city + street/building + apartment + time fields.
// The current form structure builds cityField and deptField separately.
// For courier, we'll make deptField a multi-field block.
rep(
  '}else{\n    cityField=\'<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">\';\n    deptField=\'<input class="co-input" id="co-dept" placeholder="\\u0412\\u0443\\u043b\\u0438\\u0446\\u044f, \\u0431\\u0443\\u0434\\u0438\\u043d\\u043e\\u043a, \\u043a\\u0432\\u0430\\u0440\\u0442\\u0438\\u0440\\u0430">\';\n  }',
  '}else{\n    cityField=\'<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">\';\n    deptField=\'<input class="co-input" id="co-street" placeholder="\\u0412\\u0443\\u043b\\u0438\\u0446\\u044f, \\u0431\\u0443\\u0434\\u0438\\u043d\\u043e\\u043a" style="margin-bottom:8px">\'\n      +\'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><input class="co-input" id="co-apt" placeholder="\\u041a\\u0432\\u0430\\u0440\\u0442\\u0438\\u0440\\u0430"><input class="co-input" id="co-time" placeholder="\\u0427\\u0430\\u0441: 09:00\\u201321:00"></div>\';\n  }'
);

// Also remove the ukr block (it precedes the else):
rep(
  '}else if(coDelivery==="ukr"){\n    cityField=\'<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">\';\n    deptField=\'<input class="co-input" id="co-dept" placeholder="\\u0412\\u0456\\u0434\\u0434\\u0456\\u043b\\u0435\\u043d\\u043d\\u044f \\u2116...">\';\n  }',
  '}'
);

// ── 5. Update dept label for courier ─────────────────────────────────────────
rep(
  '(coDelivery==="courier"?"\\u0410\\u0434\\u0440\\u0435\\u0441\\u0430 \\u0434\\u043e\\u0441\\u0442\\u0430\\u0432\\u043a\\u0438":"\\u0412\\u0456\\u0434\\u0434\\u0456\\u043b\\u0435\\u043d\\u043d\\u044f \\/ \\u043f\\u043e\\u0448\\u0442\\u043e\\u043c\\u0430\\u0442")',
  '(coDelivery==="courier"?"\\u0410\\u0434\\u0440\\u0435\\u0441\\u0430 \\u0434\\u043e\\u0441\\u0442\\u0430\\u0432\\u043a\\u0438":"\\u0412\\u0456\\u0434\\u0434\\u0456\\u043b\\u0435\\u043d\\u043d\\u044f \\/ \\u043f\\u043e\\u0448\\u0442\\u043e\\u043c\\u0430\\u0442")'
);

// ── 6. coNext2: handle courier fields ────────────────────────────────────────
rep(
  'function coNext2(){\n  var ci=document.getElementById("co-city"),cd=document.getElementById("co-dept");\n  if(!ci||!ci.value.trim()||!cd||!cd.value.trim()){var e=document.getElementById("co-err2");if(e)e.classList.add("show");return;}\n  _coCity=ci.value.trim();\n  _coDept=cd.value.trim();\n  if(coDelivery==="nova"){_coCityRef=_npcoCityRef;_coWareRef=_npcoWareRef;}\n  coStep=3;renderCheckout();\n}',
  'function coNext2(){\n  var ci=document.getElementById("co-city");\n  if(coDelivery==="courier"){\n    var st=document.getElementById("co-street");var ap=document.getElementById("co-apt");var tm=document.getElementById("co-time");\n    if(!ci||!ci.value.trim()||!st||!st.value.trim()){var e=document.getElementById("co-err2");if(e)e.classList.add("show");return;}\n    _coCity=ci.value.trim();\n    _coDept=(st?st.value.trim():"")+(ap&&ap.value.trim()?", \\u043a\\u0432. "+ap.value.trim():"")+(tm&&tm.value.trim()?", "+tm.value.trim():"");\n    coStep=3;renderCheckout();return;\n  }\n  var cd=document.getElementById("co-dept");\n  if(!ci||!ci.value.trim()||!cd||!cd.value.trim()){var e2=document.getElementById("co-err2");if(e2)e2.classList.add("show");return;}\n  _coCity=ci.value.trim();\n  _coDept=cd.value.trim();\n  if(coDelivery==="nova"){_coCityRef=_npcoCityRef;_coWareRef=_npcoWareRef;}\n  coStep=3;renderCheckout();\n}'
);

// ── 7. Step 4 summary dlbl: remove ukr ──────────────────────────────────────
rep(
  'var dlbl={nova:"<span class=\\"brand-b np\\">NP</span>Nova Poshta",ukr:"\\u0423\\u043A\\u0440\\u043F\\u043E\\u0448\\u0442\\u0430",courier:"\\u041A\\u0443\\u0440\'\\u0454\\u0440"};',
  'var dlbl={nova:"Nova Poshta",courier:"\\u041a\\u0443\\u0440\'\\u0454\\u0440"};'
);

// ── 8. Reset coDelivery default to nova ──────────────────────────────────────
// already "nova" by default — no change needed

const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(fp, out, 'utf8');
console.log('patch-delivery done');
