// patch-np-fix.cjs — fix NP city dropdown: clicks, sorting, top-5 defaults
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/main.js');
let code = fs.readFileSync(file, 'utf8');

// ── 1. Replace entire NP function block ──────────────────────────────────────
const OLD_START = 'var _npCityRef = "", _npCityDebounce = null;';
const OLD_END   = 'window.npCoSelectWare=npCoSelectWare;';

const si = code.indexOf(OLD_START);
const ei = code.indexOf(OLD_END);
if (si < 0 || ei < 0) { console.error('NP block bounds not found', si, ei); process.exit(1); }

const newBlock = `var _npCityRef="",_npCityDebounce=null;

// ── NP helpers ───────────────────────────────────────────────────────────────
function _npH(s){return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;");}

function _npSortCities(arr){
  return arr.slice().sort(function(a,b){
    var ta=(a.SettlementTypeDescription||"").toLowerCase();
    var tb=(b.SettlementTypeDescription||"").toLowerCase();
    var ra=ta.indexOf("місто")>=0?0:(ta.indexOf("смт")>=0?1:2);
    var rb=tb.indexOf("місто")>=0?0:(tb.indexOf("смт")>=0?1:2);
    return ra-rb;
  });
}

function _npRenderCities(drop,data,selectFn){
  var sorted=_npSortCities(data);
  drop.innerHTML=sorted.map(function(c){
    var lbl=_npH(c.Description)+(c.RegionsDescription?", "+_npH(c.RegionsDescription):"");
    return '<div class="np-item" data-ref="'+_npH(c.Ref)+'" data-name="'+_npH(c.Description)+'">'+lbl+"</div>";
  }).join("");
  drop.style.display="block";
  drop.onclick=function(e){
    var item=e.target.closest(".np-item");
    if(item&&item.dataset.ref)selectFn(item.dataset.ref,item.dataset.name);
  };
}

function _npRenderWares(drop,data,selectFn){
  drop.innerHTML=data.map(function(w){
    return '<div class="np-item" data-ref="'+_npH(w.Ref)+'" data-name="'+_npH(w.Description)+'">'+_npH(w.Description)+"</div>";
  }).join("");
  drop.style.display="block";
  drop.onclick=function(e){
    var item=e.target.closest(".np-item");
    if(item&&item.dataset.ref)selectFn(item.dataset.ref,item.dataset.name);
  };
}

var _npTopCache=null;
var _npTopNames=["Київ","Харків","Одеса","Дніпро","Львів"];

async function _npGetTopCities(){
  if(_npTopCache)return _npTopCache;
  _npTopCache=[];
  var results=await Promise.all(_npTopNames.map(function(n){
    return _npPost("Address","getCities",{FindByString:n,Limit:"3"}).then(function(data){
      return data.find(function(c){return c.Description===n;})||data[0]||null;
    });
  }));
  _npTopCache=results.filter(Boolean);
  return _npTopCache;
}

// ── ADDRESS FORM NP ──────────────────────────────────────────────────────────
async function npCityInput(val){
  clearTimeout(_npCityDebounce);
  var drop=document.getElementById("np-city-drop");
  if(!drop)return;
  if(!val||val.length<2){
    var top=_npTopCache;
    if(top&&top.length){_npRenderCities(drop,top,npSelectCity);}
    else{drop.innerHTML="";drop.style.display="none";}
    return;
  }
  drop.innerHTML='<div class="np-loading">Пошук...</div>';drop.style.display="block";
  _npCityDebounce=setTimeout(async function(){
    var data=await _npPost("Address","getCities",{FindByString:val,Limit:"12"});
    if(!data.length){drop.innerHTML='<div class="np-no-res">Не знайдено</div>';return;}
    _npRenderCities(drop,data,npSelectCity);
  },350);
}

async function npCityFocus(){
  var inp=document.getElementById("np-city-inp");
  var drop=document.getElementById("np-city-drop");
  if(!drop)return;
  if(inp&&inp.value.trim()){return;}
  if(_npTopCache){_npRenderCities(drop,_npTopCache,npSelectCity);return;}
  drop.innerHTML='<div class="np-loading">Пошук...</div>';drop.style.display="block";
  var top=await _npGetTopCities();
  if(top.length)_npRenderCities(drop,top,npSelectCity);
  else{drop.innerHTML="";drop.style.display="none";}
}

function npSelectCity(ref,name){
  _npCityRef=ref;_npWarehouseRef="";
  var ci=document.getElementById("np-city-inp");
  var cd=document.getElementById("np-city-drop");
  var wi=document.getElementById("np-ware-inp");
  var wr=document.getElementById("np-ware-ref");
  var wd=document.getElementById("np-ware-drop");
  if(ci)ci.value=name;
  if(cd){cd.innerHTML="";cd.style.display="none";}
  if(wi){wi.value="";wi.disabled=false;wi.placeholder="Номер або адреса відділення";wi.focus();}
  if(wr)wr.value="";
  if(wd){wd.innerHTML="";wd.style.display="none";}
}

var _npWarehouseRef="",_npWareDebounce=null;

async function npWareInput(val){
  clearTimeout(_npWareDebounce);
  var drop=document.getElementById("np-ware-drop");
  if(!drop)return;
  if(!_npCityRef){showToast("⚠️ Спочатку виберіть місто");return;}
  drop.innerHTML='<div class="np-loading">Пошук...</div>';drop.style.display="block";
  _npWareDebounce=setTimeout(async function(){
    var props={CityRef:_npCityRef,Language:"UA",Limit:"15"};
    if(val)props.FindByString=val;
    var data=await _npPost("AddressGeneral","getWarehouses",props);
    if(!data.length){drop.innerHTML='<div class="np-no-res">Не знайдено</div>';return;}
    _npRenderWares(drop,data,npSelectWare);
  },300);
}

function npSelectWare(ref,name){
  _npWarehouseRef=ref;
  var wi=document.getElementById("np-ware-inp");
  var wd=document.getElementById("np-ware-drop");
  if(wi)wi.value=name;
  if(wd){wd.innerHTML="";wd.style.display="none";}
}

window.npCityInput=npCityInput;
window.npCityFocus=npCityFocus;
window.npSelectCity=npSelectCity;
window.npWareInput=npWareInput;
window.npSelectWare=npSelectWare;

// ── CHECKOUT NP ──────────────────────────────────────────────────────────────
var _npcoCityRef="",_npcoWareRef="",_npcoCityDeb=null,_npcoWareDeb=null;

async function npCoCity(val){
  clearTimeout(_npcoCityDeb);
  var drop=document.getElementById("co-city-drop");
  if(!drop)return;
  if(!val||val.length<2){
    var top=_npTopCache;
    if(top&&top.length){_npRenderCities(drop,top,npCoSelectCity);}
    else{drop.innerHTML="";drop.style.display="none";}
    return;
  }
  drop.innerHTML='<div class="np-loading">Пошук...</div>';drop.style.display="block";
  _npcoCityDeb=setTimeout(async function(){
    var data=await _npPost("Address","getCities",{FindByString:val,Limit:"12"});
    if(!data.length){drop.innerHTML='<div class="np-no-res">Не знайдено</div>';return;}
    _npRenderCities(drop,data,npCoSelectCity);
  },350);
}

async function npCoCityFocus(){
  var inp=document.getElementById("co-city");
  var drop=document.getElementById("co-city-drop");
  if(!drop)return;
  if(inp&&inp.value.trim())return;
  if(_npTopCache){_npRenderCities(drop,_npTopCache,npCoSelectCity);return;}
  drop.innerHTML='<div class="np-loading">Пошук...</div>';drop.style.display="block";
  var top=await _npGetTopCities();
  if(top.length)_npRenderCities(drop,top,npCoSelectCity);
  else{drop.innerHTML="";drop.style.display="none";}
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

async function npCoWare(val){
  clearTimeout(_npcoWareDeb);
  var drop=document.getElementById("co-dept-drop");
  if(!drop)return;
  if(!_npcoCityRef){showToast("⚠️ Спочатку виберіть місто");return;}
  drop.innerHTML='<div class="np-loading">Пошук...</div>';drop.style.display="block";
  _npcoWareDeb=setTimeout(async function(){
    var props={CityRef:_npcoCityRef,Language:"UA",Limit:"15"};
    if(val)props.FindByString=val;
    var data=await _npPost("AddressGeneral","getWarehouses",props);
    if(!data.length){drop.innerHTML='<div class="np-no-res">Не знайдено</div>';return;}
    _npRenderWares(drop,data,npCoSelectWare);
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

window.npCoCity=npCoCity;
window.npCoCityFocus=npCoCityFocus;
window.npCoSelectCity=npCoSelectCity;
window.npCoWare=npCoWare;
window.npCoSelectWare=npCoSelectWare;`;

code = code.slice(0, si) + newBlock + '\n' + code.slice(ei + OLD_END.length);

// ── 2. Add onfocus to address-form city input ────────────────────────────────
code = code.replace(
  'oninput="npCityInput(this.value)" autocomplete="off">',
  'oninput="npCityInput(this.value)" onfocus="npCityFocus()" autocomplete="off">'
);

// ── 3. Add onfocus to checkout city input ────────────────────────────────────
code = code.replace(
  'autocomplete="off" oninput="npCoCity(this.value)">',
  'autocomplete="off" oninput="npCoCity(this.value)" onfocus="npCoCityFocus()">'
);

fs.writeFileSync(file, code, 'utf8');
console.log('patch-np-fix done');
