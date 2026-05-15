// patch-i18n-acc.cjs — Translates product names & cabinet panel
'use strict';
const fs = require('fs');
const path = require('path');

const fp = path.join(__dirname, 'src', 'main.js');
const raw = fs.readFileSync(fp, 'utf8');
const hasCRLF = raw.includes('\r\n');
// normalize to LF for matching
let src = hasCRLF ? raw.replace(/\r\n/g, '\n') : raw;

function replaceBlock(startMarker, endMarker, newBlock) {
  const s = src.indexOf(startMarker);
  if (s === -1) { console.warn('NOT FOUND start:', startMarker.slice(0, 60)); return false; }
  const e = src.indexOf(endMarker, s + startMarker.length);
  if (e === -1) { console.warn('NOT FOUND end:', endMarker.slice(0, 60)); return false; }
  src = src.slice(0, s) + newBlock + src.slice(e + endMarker.length);
  return true;
}

// ── 1. updateLocalizedCollections: add PRODS locale update ──────────────────
replaceBlock(
  'function updateLocalizedCollections(){\n  var tr=getCurrentLangPack();\n  CATS=',
  '\n}\nupdateLocalizedCollections();',
  'function updateLocalizedCollections(){\n' +
  '  var tr=getCurrentLangPack();\n' +
  '  PRODS.forEach(function(p){p.nm=currentLang==="en"&&p.nm_en?p.nm_en:currentLang==="ru"&&p.nm_ru?p.nm_ru:p.nm_uk||p.nm;});\n' +
  '  CATS=CATS_BASE.map(function(c){\n' +
  '    return{e:c.e,n:tr.catNames[c.cat]||c.cat,c:c.c,cat:c.cat};\n' +
  '  });\n' +
  '  HINTS=tr.hints.slice();\n' +
  '  NAV=tr.nav.slice();\n' +
  '  AI_RESP=tr.aiResp.slice();\n' +
  '  AI_QUICK=tr.aiQuick.slice();\n' +
  '}\nupdateLocalizedCollections();'
);

// ── 2. _ordLbl: language-aware status labels ────────────────────────────────
replaceBlock(
  'function _ordLbl(s){',
  '}\nfunction _fmtDate(',
  'function _ordLbl(s){\n' +
  '  var _a=getCurrentLangPack().acc||{};\n' +
  '  return{new:_a.statusNew||"Нове",confirmed:_a.statusConfirmed||"Підтверджено",in_transit:_a.statusInTransit||"В дорозі",delivered:_a.statusDelivered||"Доставлено",cancelled:_a.statusCancelled||"Скасовано"}[s]||_a.statusNew||"Нове";\n' +
  '}\nfunction _fmtDate('
);

// ── 3. renderAcc: full i18n rewrite ─────────────────────────────────────────
replaceBlock(
  'function renderAcc(){',
  '\nfunction showAccFav(){',
  'function renderAcc(){\n' +
  '  var _a=getCurrentLangPack().acc||{};\n' +
  '  var tr=getCurrentLangPack();\n' +
  '  var body=document.getElementById("acc-body");\n' +
  '  if(!loggedIn){\n' +
  '    body.innerHTML=\'<div style="text-align:center;margin-bottom:22px"><div style="font-size:54px;margin-bottom:12px">👤</div>\'\n' +
  '      +\'<div style="font-size:18px;font-weight:800;margin-bottom:6px">\'+_a.welcome+\'</div>\'\n' +
  '      +\'<div style="font-size:13px;color:var(--gt)">\'+_a.loginPrompt+\'</div></div>\'\n' +
  '      +\'<input class="lf-input" type="email" id="lf-email" placeholder="Email">\'\n' +
  '      +\'<input class="lf-input" type="password" id="lf-pass" placeholder="\'+_a.newPassword+\'">\'\n' +
  '      +\'<button class="lf-btn" onclick="doLogin()" style="margin-bottom:10px">\'+_a.signIn+\'</button>\'\n' +
  '      +\'<div style="text-align:center;font-size:13px;color:var(--gt);margin-bottom:12px">\'+_a.noAccount+\' <a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showRegisterForm()">\'+_a.register+\'</a></div>\'\n' +
  '      +\'<button class="lf-btn social" style="margin-bottom:8px" onclick="doLogin(\\\'google\\\')"><span class="brand-b google">G</span>Google</button>\'\n' +
  '      +\'<button class="lf-btn social" style="margin-bottom:8px" onclick="doLogin(\\\'apple\\\')"><span class="brand-b apple">&#xF8FF;</span>Apple</button>\'\n' +
  '      +\'<button class="lf-btn social" onclick="showPhoneForm()">\'+_a.phone+\'</button>\';\n' +
  '    return;\n' +
  '  }\n' +
  '  var ai=currentUserName&&currentUserName.trim()?currentUserName.trim().charAt(0).toUpperCase():"К";\n' +
  '  var activeOrds=_userOrders.filter(function(o){return o.status!=="delivered"&&o.status!=="cancelled";}).length;\n' +
  '  var menus=[\n' +
  '    {ico:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 000 4h6a2 2 0 000-4",t:_a.menuOrders,s:_userOrders.length?_userOrders.length+" "+(_a.menuOrdersNone||"").split(" ").slice(-1)[0]:_a.menuOrdersNone,fn:"showAccOrders()",badge:activeOrds},\n' +
  '    {ico:"M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",t:tr.fav,s:favs.length+" "+tr.productsWord,fn:"showAccFav()",badge:0},\n' +
  '    {ico:"M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",t:_a.menuAddresses,s:_userAddresses.length?_userAddresses.length+" "+_a.menuAddressesSaved:_a.menuAddressesNone,fn:"showAccAddresses()",badge:0},\n' +
  '    {ico:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",t:_a.menuSettings,s:_a.menuSettingsDesc,fn:"showAccSettings()",badge:0},\n' +
  '  ];\n' +
  '  var h=\'<div class="acc-avatar">\'+ai+\'</div>\'\n' +
  '    +\'<div class="acc-name">\'+( currentUserName||_a.buyer)+\'</div>\'\n' +
  '    +\'<div class="acc-email">\'+( currentUserEmail||"")+\'</div>\';\n' +
  '  menus.forEach(function(m){\n' +
  '    var bdg=m.badge>0?\'<span class="acc-badge">\'+m.badge+\'</span>\':\'\' ;\n' +
  '    h+=\'<button class="acc-mi" onclick="\'+m.fn+\'">\'\n' +
  '      +\'<div class="ami-ico"><svg viewBox="0 0 24 24" stroke="var(--gd)" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="19" height="19"><path d="\'+m.ico+\'"/></svg></div>\'\n' +
  '      +\'<div class="ami-tx"><strong>\'+m.t+\'</strong><span>\'+m.s+\'</span></div>\'\n' +
  '      +bdg+\'<span class="ami-arr">›</span></button>\';\n' +
  '  });\n' +
  '  if(_userOrders.length>0){\n' +
  '    h+=\'<div style="border-top:1px solid var(--gl2);margin-top:16px;padding-top:16px">\'\n' +
  '      +\'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">\'\n' +
  '      +\'<h4 style="font-size:14px;font-weight:800;margin:0">\'+_a.recentOrders+\'</h4>\'\n' +
  '      +\'<a style="font-size:12px;color:var(--g);font-weight:700;cursor:pointer" onclick="showAccOrders()">\'+_a.allOrders+\'</a></div>\';\n' +
  '    _userOrders.slice(0,3).forEach(function(o){\n' +
  '      h+=\'<div class="acc-ord-item" onclick="showAccOrderDetail(\\\'\'+ o.id+\'\\\')" style="cursor:pointer">\'\n' +
  '        +\'<div class="aoi-l"><strong>\'+_a.orderWord+\' #\'+(o.order_number||"—")+\'</strong>\'\n' +
  '        +\'<span>\'+_fmtDate(o.created_at)+\' · \'+(o.total||0)+\' \'+tr.currency+\'</span></div>\'\n' +
  '        +\'<span class="oi-st \'+_ordCls(o.status)+\'">\'+_ordLbl(o.status)+\'</span></div>\';\n' +
  '    });\n' +
  '    h+=\'</div>\';\n' +
  '  }\n' +
  '  h+=\'<button class="acc-logout-btn" onclick="doLogout()">\'+_a.logout+\'</button>\';\n' +
  '  body.innerHTML=h;\n' +
  '}\n' +
  '\nfunction showAccFav(){'
);

// ── 4. showAccOrders ─────────────────────────────────────────────────────────
replaceBlock(
  'function showAccOrders(){',
  '\nfunction showAccOrderDetail(',
  'function showAccOrders(){\n' +
  '  var _a=getCurrentLangPack().acc||{};var tr=getCurrentLangPack();\n' +
  '  var body=document.getElementById("acc-body");\n' +
  '  var h=\'<button class="acc-back-btn" onclick="renderAcc()">\'+_a.back+\'</button>\';\n' +
  '  if(_userOrders.length===0){\n' +
  '    h+=\'<div style="text-align:center;padding:40px 0"><div style="font-size:48px;margin-bottom:12px">📦</div>\'\n' +
  '      +\'<div style="font-size:16px;font-weight:700;margin-bottom:6px">\'+_a.noOrdersTitle+\'</div>\'\n' +
  '      +\'<div style="font-size:13px;color:var(--gt)">\'+_a.noOrdersDesc+\'</div></div>\';\n' +
  '    body.innerHTML=h;return;\n' +
  '  }\n' +
  '  h+=\'<h3 style="font-size:16px;font-weight:800;margin-bottom:14px">\'+_a.myOrders+\'</h3>\';\n' +
  '  _userOrders.forEach(function(o){\n' +
  '    var items=o.items||[];\n' +
  '    h+=\'<div class="acc-ord-card" onclick="showAccOrderDetail(\\\'\'+ o.id+\'\\\')">\'\n' +
  '      +\'<div class="aoc-top"><div><strong style="font-size:13px">#\'+(o.order_number||"—")+\'</strong>\'\n' +
  '      +\'<span style="font-size:11px;color:var(--gt);display:block;margin-top:2px">\'+_fmtDate(o.created_at)+\'</span></div>\'\n' +
  '      +\'<span class="oi-st \'+_ordCls(o.status)+\'">\'+_ordLbl(o.status)+\'</span></div>\'\n' +
  '      +\'<div class="aoc-bot">\'\n' +
  '      +items.slice(0,4).map(function(x){return \'<span class="aoc-em">\'+x.e+\'</span>\';}).join("")\n' +
  '      +(items.length>4?\'<span style="font-size:11px;color:var(--gt)">+\'+(items.length-4)+\'</span>\':"") \n' +
  '      +\'<span style="margin-left:auto;font-size:14px;font-weight:800;color:var(--gd)">\'+(o.total||0)+\' \'+tr.currency+\'</span></div></div>\';\n' +
  '  });\n' +
  '  body.innerHTML=h;\n' +
  '}\n' +
  '\nfunction showAccOrderDetail('
);

// ── 5. showAccOrderDetail ────────────────────────────────────────────────────
replaceBlock(
  'function showAccOrderDetail(oid){',
  '\nfunction showAccAddresses(){',
  'function showAccOrderDetail(oid){\n' +
  '  var _a=getCurrentLangPack().acc||{};var tr=getCurrentLangPack();\n' +
  '  var body=document.getElementById("acc-body");\n' +
  '  var o=_userOrders.find(function(x){return x.id===oid;});\n' +
  '  if(!o)return;\n' +
  '  var dcost=o.delivery_cost||0;\n' +
  '  var pmLbl={cod:_a.paymentCod||"Накладений платіж",card:_a.paymentCard||"Онлайн (картка)",liqpay:"LiqPay"};\n' +
  '  var h=\'<button class="acc-back-btn" onclick="showAccOrders()">\'+_a.back+\'</button>\'\n' +
  '    +\'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">\'\n' +
  '    +\'<h3 style="font-size:16px;font-weight:800;margin:0">\'+_a.orderWord+\' #\'+(o.order_number||"—")+\'</h3>\'\n' +
  '    +\'<span class="oi-st \'+_ordCls(o.status)+\'">\'+_ordLbl(o.status)+\'</span></div>\';\n' +
  '  if(o.items&&o.items.length){\n' +
  '    h+=\'<div class="acc-det-section"><h4>\'+_a.itemsTitle+\'</h4>\';\n' +
  '    o.items.forEach(function(x){\n' +
  '      h+=\'<div class="aod-item"><span class="aod-em">\'+x.e+\'</span>\'\n' +
  '        +\'<div class="aod-info"><strong>\'+x.nm+\'</strong><span>\'+x.qty+\' × \'+x.p+\' \'+tr.currency+\'</span></div>\'\n' +
  '        +\'<span class="aod-pr">\'+(x.p*x.qty)+\' \'+tr.currency+\'</span></div>\';\n' +
  '    });\n' +
  '    h+=\'</div>\';\n' +
  '  }\n' +
  '  h+=\'<div class="acc-det-section"><h4>\'+_a.billTitle+\'</h4>\'\n' +
  '    +\'<div class="aod-row"><span>\'+_a.itemsTitle+\'</span><span>\'+(o.total||0)+\' \'+tr.currency+\'</span></div>\'\n' +
  '    +\'<div class="aod-row"><span>\'+_a.deliveryTitle+\'</span><span>\'+(dcost===0?_a.free:dcost+\' \'+tr.currency)+\'</span></div>\'\n' +
  '    +\'<div class="aod-row big"><span>\'+_a.total+\'</span><span>\'+((o.total||0)+dcost)+\' \'+tr.currency+\'</span></div>\'\n' +
  '    +\'<div class="aod-row"><span>\'+_a.paymentLabel+\'</span><span>\'+(pmLbl[o.payment_method]||o.payment_method||"—")+\'</span></div>\'\n' +
  '    +\'</div>\';\n' +
  '  if(o.contact_name||o.city){\n' +
  '    h+=\'<div class="acc-det-section"><h4>\'+_a.deliveryTitle+\'</h4>\'\n' +
  '      +(o.contact_name?\'<div class="aod-row"><span>\'+_a.recipientLabel+\'</span><span>\'+o.contact_name+\'</span></div>\':"") \n' +
  '      +(o.city?\'<div class="aod-row"><span>\'+_a.cityLabel+\'</span><span>\'+o.city+\'</span></div>\':"") \n' +
  '      +(o.delivery_address?\'<div class="aod-row"><span>\'+_a.deptLabel+\'</span><span>\'+o.delivery_address+\'</span></div>\':"") \n' +
  '      +\'<div class="aod-row"><span>\'+_a.methodLabel+\'</span><span>\'+({nova:"Nova Poshta",ukr:"Укрпошта"}[o.delivery_method]||o.delivery_method||"—")+\'</span></div>\'\n' +
  '      +\'</div>\';\n' +
  '  }\n' +
  '  body.innerHTML=h;\n' +
  '}\n' +
  '\nfunction showAccAddresses(){'
);

// ── 6. showAccAddresses ──────────────────────────────────────────────────────
replaceBlock(
  'function showAccAddresses(){',
  '\nfunction showAccAddressForm(',
  'function showAccAddresses(){\n' +
  '  var _a=getCurrentLangPack().acc||{};\n' +
  '  var body=document.getElementById("acc-body");\n' +
  '  var h=\'<button class="acc-back-btn" onclick="renderAcc()">\'+_a.back+\'</button>\'\n' +
  '    +\'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">\'\n' +
  '    +\'<h3 style="font-size:16px;font-weight:800;margin:0">\'+_a.addressesTitle+\'</h3>\'\n' +
  '    +\'<button class="acc-add-btn" onclick="showAccAddressForm()">\'+_a.addAddress+\'</button></div>\';\n' +
  '  if(_userAddresses.length===0){\n' +
  '    h+=\'<div style="text-align:center;padding:36px 0"><div style="font-size:44px;margin-bottom:12px">📍</div>\'\n' +
  '      +\'<div style="font-size:14px;font-weight:700;margin-bottom:6px">\'+_a.noAddressTitle+\'</div>\'\n' +
  '      +\'<div style="font-size:13px;color:var(--gt)">\'+_a.noAddressDesc+\'</div></div>\';\n' +
  '  }else{\n' +
  '    _userAddresses.forEach(function(a){\n' +
  '      var info=[a.city,a.warehouse].filter(Boolean).join(" · ");\n' +
  '      h+=\'<div class="addr-card">\'\n' +
  '        +\'<div class="addr-top"><div class="addr-title-row"><strong>\'+a.title+\'</strong>\'+(a.is_default?\'<span class="addr-def">\'+_a.defaultBadge+\'</span>\':"")+\'</div>\'\n' +
  '        +\'<div class="addr-actions">\'\n' +
  '        +(!a.is_default?\'<button class="addr-act-btn" onclick="doSetDefaultAddress(\\\'\'+ a.id+\'\\\')">\'+_a.makeDefault+\'</button>\':"") \n' +
  '        +\'<button class="addr-act-btn" onclick="showAccAddressForm(\\\'\'+ a.id+\'\\\')" >✏️</button>\'\n' +
  '        +\'<button class="addr-act-btn del" onclick="doDeleteAddress(\\\'\'+ a.id+\'\\\')" >✕</button></div></div>\'\n' +
  '        +(a.recipient_name?\'<div class="addr-recip">\'+a.recipient_name+\'</div>\':"") \n' +
  '        +\'<div class="addr-info">\'+info+\'</div>\'\n' +
  '        +\'</div>\';\n' +
  '    });\n' +
  '  }\n' +
  '  body.innerHTML=h;\n' +
  '}\n' +
  '\nfunction showAccAddressForm('
);

// ── 7. showAccAddressForm ────────────────────────────────────────────────────
replaceBlock(
  'function showAccAddressForm(id){',
  '\nasync function doSaveAddress(){',
  'function showAccAddressForm(id){\n' +
  '  var _a=getCurrentLangPack().acc||{};\n' +
  '  var a=id?_userAddresses.find(function(x){return x.id===id;}):null;\n' +
  '  _npCityRef=a&&a.city_ref?a.city_ref:"";\n' +
  '  _npWarehouseRef=a&&a.warehouse_ref?a.warehouse_ref:"";\n' +
  '  var body=document.getElementById("acc-body");\n' +
  '  var wareDisabled=_npCityRef?"":"disabled";\n' +
  '  body.innerHTML=\'<button class="acc-back-btn" onclick="showAccAddresses()">\'+_a.back+\'</button>\'\n' +
  '    +\'<h3 style="font-size:16px;font-weight:800;margin-bottom:14px">\'+( a?_a.editAddress:_a.newAddress)+\'</h3>\'\n' +
  '    +\'<div id="addr-edit-id" style="display:none">\'+( a?a.id:"")+\'</div>\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.addrNameLabel+\'</label>\'\n' +
  '    +\'<input class="lf-input" id="addr-title" placeholder="\'+_a.addrNamePh+\'" value="\'+( a&&a.title?a.title:_a.addrNameDef)+\'">\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.addrRecipLabel+\'</label>\'\n' +
  '    +\'<input class="lf-input" id="addr-recip" placeholder="\'+_a.addrRecipLabel+\'" value="\'+( a&&a.recipient_name?a.recipient_name:"")+\'">\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.addrCityLabel+\'</label>\'\n' +
  '    +\'<div class="np-wrap">\'\n' +
  '    +\'<input class="lf-input" id="np-city-inp" placeholder="\'+_a.addrCityLabel+\'..." value="\'+( a&&a.city?a.city:"")+\'" oninput="npCityInput(this.value)" onfocus="npCityFocus()" autocomplete="off">\'\n' +
  '    +\'<div class="np-drop" id="np-city-drop"></div></div>\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.addrBranchLabel+\'</label>\'\n' +
  '    +\'<div class="np-wrap">\'\n' +
  '    +\'<input class="lf-input" id="np-ware-inp" placeholder="\'+( wareDisabled?_a.addrBranchPhNoCity:_a.addrBranchPh)+\'" value="\'+( a&&a.warehouse?a.warehouse:"")+\'" oninput="npWareInput(this.value)" autocomplete="off" \'+( wareDisabled?\'disabled style="opacity:.5"\':"") +\'>\'\n' +
  '    +\'<div class="np-drop" id="np-ware-drop"></div></div>\'\n' +
  '    +\'<button class="lf-btn" onclick="doSaveAddress()" style="margin-top:8px">\'+_a.save+\'</button>\';\n' +
  '}\n' +
  '\nasync function doSaveAddress(){'
);

// ── 8. showAccSettings ───────────────────────────────────────────────────────
replaceBlock(
  'function showAccSettings(){',
  '\nasync function doSaveProfile(){',
  'function showAccSettings(){\n' +
  '  var _a=getCurrentLangPack().acc||{};\n' +
  '  var body=document.getElementById("acc-body");\n' +
  '  var p=_userProfile||{};\n' +
  '  body.innerHTML=\'<button class="acc-back-btn" onclick="renderAcc()">\'+_a.back+\'</button>\'\n' +
  '    +\'<h3 style="font-size:16px;font-weight:800;margin-bottom:14px">\'+_a.settingsTitle+\'</h3>\'\n' +
  '    +\'<div class="acc-det-section"><h4>\'+_a.personalData+\'</h4>\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.nameLabel+\'</label>\'\n' +
  '    +\'<input class="lf-input" id="s-name" placeholder="\'+_a.nameLabel+\'" value="\'+( currentUserName||"")+\'">\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.phoneLabel+\'</label>\'\n' +
  '    +\'<input class="lf-input" id="s-phone" type="tel" placeholder="+380..." value="\'+( p.phone||"")+\'">\'\n' +
  '    +\'<button class="lf-btn" onclick="doSaveProfile()" style="margin-top:4px">\'+_a.saveData+\'</button></div>\'\n' +
  '    +\'<div class="acc-det-section"><h4>\'+_a.emailSection+\'</h4>\'\n' +
  '    +\'<div style="padding:11px 14px;background:var(--gl);border-radius:10px;font-size:13px;color:var(--gt)">\'+( currentUserEmail||"—")+\'</div></div>\'\n' +
  '    +\'<div class="acc-det-section"><h4>\'+_a.changePassword+\'</h4>\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.newPassword+\'</label>\'\n' +
  '    +\'<input class="lf-input" type="password" id="s-newpass" placeholder="\'+_a.newPassword+\'">\'\n' +
  '    +\'<label class="acc-lbl">\'+_a.repeatPassword+\'</label>\'\n' +
  '    +\'<input class="lf-input" type="password" id="s-newpass2" placeholder="\'+_a.repeatPassword+\'">\'\n' +
  '    +\'<button class="lf-btn" onclick="doChangePassword()">\'+_a.changePasswordBtn+\'</button></div>\';\n' +
  '}\n' +
  '\nasync function doSaveProfile(){'
);

// restore original line endings
const out = hasCRLF ? src.replace(/\n/g, '\r\n') : src;
fs.writeFileSync(fp, out, 'utf8');
console.log('Done. Changes applied to main.js.');
