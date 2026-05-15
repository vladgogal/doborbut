// patch-co-np.cjs — NP autocomplete in checkout step 2
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/main.js');
let code = fs.readFileSync(file, 'utf8');

// ── 1. Add _coCityRef to checkout vars ────────────────────────────────────
code = code.replace(
  'var _coName="",_coPhone="",_coEmail="",_coCity="",_coDept="";',
  'var _coName="",_coPhone="",_coEmail="",_coCity="",_coDept="",_coCityRef="",_coWareRef="";'
);

// ── 2. Add NP checkout functions right after window.npSelectWare line ─────
const anchor = 'window.npSelectWare = npSelectWare;';
const npCoFns = `
var _npcoCityRef="",_npcoWareRef="",_npcoCityDeb=null,_npcoWareDeb=null;

function npCoCity(val){
  clearTimeout(_npcoCityDeb);
  var drop=document.getElementById("co-city-drop");
  if(!drop)return;
  if(!val||val.length<2){drop.innerHTML="";drop.style.display="none";return;}
  drop.innerHTML='<div class="np-loading">Пошук...</div>';drop.style.display="block";
  _npcoCityDeb=setTimeout(async function(){
    var data=await _npPost("Address","getCities",{FindByString:val,Limit:"8"});
    if(!data.length){drop.innerHTML='<div class="np-no-res">Не знайдено</div>';return;}
    drop.innerHTML=data.map(function(c){
      var lbl=c.Description+(c.RegionsDescription?", "+c.RegionsDescription:"");
      return '<div class="np-item" onclick="npCoSelectCity('+JSON.stringify(c.Ref)+','+JSON.stringify(c.Description)+')">'+lbl+"</div>";
    }).join("");
  },350);
}

function npCoSelectCity(ref,name){
  _npcoCityRef=ref;_npcoWareRef="";
  var ci=document.getElementById("co-city");
  var cd=document.getElementById("co-city-drop");
  var wi=document.getElementById("co-dept");
  var wd=document.getElementById("co-dept-drop");
  if(ci)ci.value=name;
  if(cd){cd.innerHTML="";cd.style.display="none";}
  if(wi){wi.value="";wi.disabled=false;wi.placeholder="Номер або адреса відділення";wi.focus();}
  if(wd){wd.innerHTML="";wd.style.display="none";}
  _coCity=name;
}

function npCoWare(val){
  clearTimeout(_npcoWareDeb);
  var drop=document.getElementById("co-dept-drop");
  if(!drop)return;
  if(!_npcoCityRef){showToast("\\u26a0\\ufe0f \\u0421\\u043f\\u043e\\u0447\\u0430\\u0442\\u043a\\u0443 \\u0432\\u0438\\u0431\\u0435\\u0440\\u0456\\u0442\\u044c \\u043c\\u0456\\u0441\\u0442\\u043e");return;}
  drop.innerHTML='<div class="np-loading">\\u041f\\u043e\\u0448\\u0443\\u043a...</div>';drop.style.display="block";
  _npcoWareDeb=setTimeout(async function(){
    var props={CityRef:_npcoCityRef,Language:"UA",Limit:"15"};
    if(val)props.FindByString=val;
    var data=await _npPost("AddressGeneral","getWarehouses",props);
    if(!data.length){drop.innerHTML='<div class="np-no-res">\\u041d\\u0435 \\u0437\\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e</div>';return;}
    drop.innerHTML=data.map(function(w){
      return '<div class="np-item" onclick="npCoSelectWare('+JSON.stringify(w.Ref)+','+JSON.stringify(w.Description)+')">'+w.Description+"</div>";
    }).join("");
  },300);
}

function npCoSelectWare(ref,name){
  _npcoWareRef=ref;
  var wi=document.getElementById("co-dept");
  var wd=document.getElementById("co-dept-drop");
  if(wi)wi.value=name;
  if(wd){wd.innerHTML="";wd.style.display="none";}
  _coDept=name;_coCityRef=_npcoCityRef;_coWareRef=ref;
}

function coFillSavedAddr(idx){
  var a=_userAddresses[idx];if(!a)return;
  _npcoCityRef=a.city_ref||"";_npcoWareRef=a.warehouse_ref||"";
  _coCity=a.city||"";_coDept=a.warehouse||"";
  var ci=document.getElementById("co-city");
  var wi=document.getElementById("co-dept");
  if(ci)ci.value=a.city||"";
  if(wi){wi.value=a.warehouse||"";wi.disabled=false;}
  document.querySelectorAll(".co-addr-chip").forEach(function(el,i){
    el.classList.toggle("active",i===idx);
  });
}

window.npCoCity=npCoCity;
window.npCoSelectCity=npCoSelectCity;
window.npCoWare=npCoWare;
window.npCoSelectWare=npCoSelectWare;
window.coFillSavedAddr=coFillSavedAddr;
`;

if (!code.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
code = code.replace(anchor, anchor + npCoFns);

// ── 3. Replace step 2 HTML rendering ─────────────────────────────────────
// Find the step 2 body.innerHTML assignment
const step2Start = '+"<div class=\\"co-section\\"><h4>\\uD83D\\uDCCD \\u0410\\u0434\\u0440\\u0435\\u0441\\u0430</h4>"';
const step2End   = '+"<button class=\\"co-next-btn\\" style=\\"flex:1\\" onclick=\\"coNext2()\\">\\u0414\\u0430\\u043b\\u0456: \\u041e\\u043f\\u043b\\u0430\\u0442\\u0430 \\u2192</button></div>";';

const si = code.indexOf(step2Start);
const ei = code.indexOf(step2End);
if (si < 0 || ei < 0) { console.error('step2 bounds not found'); process.exit(1); }

const newStep2 = `
+(function(){
  var addrSec="";
  // Saved addresses quick picker (NP only)
  if(coDelivery==="nova"&&_userAddresses.length>0){
    var npAddrs=_userAddresses.filter(function(a){return a.city&&a.warehouse;});
    if(npAddrs.length){
      addrSec+='<div class="co-section"><h4>\\uD83D\\uDCCB \\u041c\\u043e\\u0457 \\u0430\\u0434\\u0440\\u0435\\u0441\\u0438</h4><div class="co-addr-chips">';
      npAddrs.forEach(function(a,i){
        addrSec+='<div class="co-addr-chip" onclick="coFillSavedAddr('+i+')"><strong>'+a.title+'</strong><span>'+a.city+'</span></div>';
      });
      addrSec+='</div></div>';
    }
  }
  var cityField,deptField;
  if(coDelivery==="nova"){
    cityField='<div class="np-wrap"><input class="co-input" id="co-city" placeholder="\\u0412\\u0432\\u0435\\u0434\\u0456\\u0442\\u044c \\u043c\\u0456\\u0441\\u0442\\u043e..." autocomplete="off" oninput="npCoCity(this.value)"><div class="np-drop" id="co-city-drop"></div></div>';
    deptField='<div class="np-wrap"><input class="co-input" id="co-dept" placeholder="\\u0421\\u043f\\u043e\\u0447\\u0430\\u0442\\u043a\\u0443 \\u0432\\u0438\\u0431\\u0435\\u0440\\u0456\\u0442\\u044c \\u043c\\u0456\\u0441\\u0442\\u043e" disabled style="opacity:.5" autocomplete="off" oninput="npCoWare(this.value)"><div class="np-drop" id="co-dept-drop"></div></div>';
  }else if(coDelivery==="ukr"){
    cityField='<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">';
    deptField='<input class="co-input" id="co-dept" placeholder="\\u0412\\u0456\\u0434\\u0434\\u0456\\u043b\\u0435\\u043d\\u043d\\u044f \\u2116...">';
  }else{
    cityField='<input class="co-input" id="co-city" placeholder="\\u041c\\u0456\\u0441\\u0442\\u043e">';
    deptField='<input class="co-input" id="co-dept" placeholder="\\u0412\\u0443\\u043b\\u0438\\u0446\\u044f, \\u0431\\u0443\\u0434\\u0438\\u043d\\u043e\\u043a, \\u043a\\u0432\\u0430\\u0440\\u0442\\u0438\\u0440\\u0430">';
  }
  return addrSec
    +'<div class="co-section"><h4>\\uD83D\\uDCCD \\u0410\\u0434\\u0440\\u0435\\u0441\\u0430</h4>'
    +'<div class="co-field"><label>\\u041c\\u0456\\u0441\\u0442\\u043e</label>'+cityField+'</div>'
    +'<div class="co-field" style="margin-top:10px"><label>'+
      (coDelivery==="courier"?"\\u0410\\u0434\\u0440\\u0435\\u0441\\u0430 \\u0434\\u043e\\u0441\\u0442\\u0430\\u0432\\u043a\\u0438":"\\u0412\\u0456\\u0434\\u0434\\u0456\\u043b\\u0435\\u043d\\u043d\\u044f \\/ \\u043f\\u043e\\u0448\\u0442\\u043e\\u043c\\u0430\\u0442")
      +'</label>'+deptField+'</div>'
    +'<div id="co-err2" class="err-msg">\\u26A0\\uFE0F \\u0412\\u043a\\u0430\\u0436\\u0456\\u0442\\u044c \\u043c\\u0456\\u0441\\u0442\\u043e \\u0442\\u0430 \\u0432\\u0456\\u0434\\u0434\\u0456\\u043b\\u0435\\u043d\\u043d\\u044f</div></div>'
    +'<div style="display:flex;gap:10px"><button class="co-back-btn" onclick="coStep=1;renderCheckout()">\\u2190 \\u041d\\u0430\\u0437\\u0430\\u0434</button>'
    +'<button class="co-next-btn" style="flex:1" onclick="coNext2()">\\u0414\\u0430\\u043b\\u0456: \\u041e\\u043f\\u043b\\u0430\\u0442\\u0430 \\u2192</button></div>';
}())`;

code = code.slice(0, si) + newStep2 + code.slice(ei + step2End.length);

// ── 4. Patch coNext2 to also save NP refs ────────────────────────────────
code = code.replace(
  /function coNext2\(\)\{[\s\S]*?coStep=3;renderCheckout\(\);\s*\}/,
  `function coNext2(){
  var ci=document.getElementById("co-city"),cd=document.getElementById("co-dept");
  if(!ci||!ci.value.trim()||!cd||!cd.value.trim()){var e=document.getElementById("co-err2");if(e)e.classList.add("show");return;}
  _coCity=ci.value.trim();
  _coDept=cd.value.trim();
  if(coDelivery==="nova"){_coCityRef=_npcoCityRef;_coWareRef=_npcoWareRef;}
  coStep=3;renderCheckout();
}`
);

fs.writeFileSync(file, code, 'utf8');
console.log('✅ patch-co-np done');
