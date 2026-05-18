// Точка входу — імпорти даних, конфіг Supabase, вся логіка магазину.
// Усі функції експортуються в window, бо в HTML використовуються inline-хендлери onclick.
import './css/main.css';
import { PRODS, ALL_REVIEWS, CATS_BASE } from './data/products.js';
import { I18N, SUPPORTED_LANGS, DEFAULT_LANG } from './data/i18n.js';
import { STORES as LS, CITY_COLORS as LC } from './data/stores.js';
import { supabase, isSupabaseConfigured, cartAPI, favsAPI, reviewsAPI } from './js/supabase.js';
import { liqpayCheckout } from './js/liqpay.js';
import {
  initAnalytics, trackViewItem, trackAddToCart,
  trackRemoveFromCart, trackBeginCheckout,
  trackAddPaymentInfo, trackPurchase, updateMeta,
} from './js/analytics.js';

// Експорт даних у window — щоб тестувати з консолі
window.PRODS = PRODS;
window.ALL_REVIEWS = ALL_REVIEWS;
window.CATS_BASE = CATS_BASE;
window.I18N = I18N;
window.SUPPORTED_LANGS = SUPPORTED_LANGS;
window.DEFAULT_LANG = SUPPORTED_LANGS;  // legacy
window.LS = LS;
window.LC = LC;
window.supabase = supabase;
window.isSupabaseConfigured = isSupabaseConfigured;
window.cartAPI = cartAPI;
window.favsAPI = favsAPI;
window.reviewsAPI = reviewsAPI;

// ============================================================
// ОСНОВНА ЛОГІКА (state, render, panels, cart, fav, AI, i18n)
// ============================================================
var currentLang=DEFAULT_LANG;
var CATS=[],HINTS=[],NAV=[],AI_RESP=[],AI_QUICK=[];
var _sbCats=null; // категорії з Supabase; null = ще не завантажено
function normalizeLang(lang){return SUPPORTED_LANGS.indexOf(lang)>=0?lang:DEFAULT_LANG;}
function getLangPack(lang){return I18N[normalizeLang(lang||currentLang)]||I18N[DEFAULT_LANG];}
function getCurrentLangPack(){return getLangPack(currentLang);}
function updateLocalizedCollections(){
  var tr=getCurrentLangPack();
  PRODS.forEach(function(p){
    var locNm=currentLang==='en'?(p.nm_en||p.nm_uk):currentLang==='ru'?(p.nm_ru||p.nm_uk):p.nm_uk;
    p.nm=locNm||p.name||"";
  });
  if(_sbCats){
    CATS=_sbCats.map(function(c){return{e:c.e||"📦",n:c.name||c.slug,c:c._count||"",cat:c.slug};});
  }else{
    CATS=[];
  }
  HINTS=tr.hints.slice();
  NAV=tr.nav.slice();
  AI_RESP=tr.aiResp.slice();
  AI_QUICK=tr.aiQuick.slice();
}
updateLocalizedCollections();

// ============================================================
// STORE STATE
// ============================================================
var cart=[],favs=[],qty=1,currentProdId=null,aiInit=false,aiBotIdx=0,loggedIn=false,currentUserName="Покупець",currentUserEmail="";
var phIdx=0,phCharIdx=0,phDeleting=false,phPause=0,phTimer=null,srFocus=false;
var activeFilter="all",coStep=1,coDelivery="nova",coPay="card";
var _coName="",_coPhone="",_coEmail="",_coCity="",_coDept="",_coCityRef="",_coWareRef="",_coStreet="",_coApt="",_coTime="";

// ── PAGES ──
function showPage(name){
  closeAllPanels();
  document.querySelectorAll(".page").forEach(function(p){p.classList.remove("active");});
  document.getElementById("page-"+name).classList.add("active");
  window.scrollTo(0,0);
  if(name==="products"){
    renderAllProducts();
    if(activeFilter&&activeFilter!=="all"&&activeFilter!=="home")fltSetCat(activeFilter);
    activeFilter="all";
  }
  if(name==="reviews")renderAllReviews();
}

// ── PANELS ──
function openPanel(id){
  closeAllPanels(false);
  document.getElementById("ovl").classList.add("open");
  document.getElementById(id).classList.add("open");
}
function closeAllPanels(closeOvl){
  if(closeOvl===undefined)closeOvl=true;
  ["cart-panel","acc-panel","fav-panel","ai-panel","co-panel","support-panel"].forEach(function(id){
    document.getElementById(id).classList.remove("open");
  });
  if(closeOvl)document.getElementById("ovl").classList.remove("open");
}

// ── CART ──
function addToCart(pid,cnt){
  if(!pid){showToast("❌ помилка: id товару відсутній");return;}
  var p=PRODS.find(function(x){return String(x.id)===String(pid);});
  if(!p){showToast("❌ Товар не знайдено (PRODS:"+PRODS.length+")");return;}
  var q=Math.max(1,parseInt(cnt,10)||1);
  var ex=cart.find(function(x){return String(x.id)===String(pid);});
  if(ex){ex.qty+=q;}else{cart.push({id:p.id,nm:p.nm,e:p.e,p:p.p,op:p.op,qty:q});}
  updateCartBadge();
  trackAddToCart(p, q);
  showToast("\u2705 "+p.nm+" \u2014 \u0434\u043e\u0434\u0430\u043d\u043e \u0434\u043e \u043a\u043e\u0448\u0438\u043a\u0430"+(q>1?" \u00D7"+q:"")+"!");
}
function removeFromCart(pid){
  var _rem=cart.find(function(x){return String(x.id)===String(pid);});
  if(_rem)trackRemoveFromCart(_rem);
  cart=cart.filter(function(x){return String(x.id)!==String(pid);});
  updateCartBadge();renderCart();
}
function changeCartQty(pid,d){
  var item=cart.find(function(x){return String(x.id)===String(pid);});if(!item)return;
  item.qty=Math.max(1,item.qty+d);
  updateCartBadge();renderCart();
}
function updateCartBadge(){
  document.getElementById("cart-badge").textContent=cart.reduce(function(s,x){return s+x.qty;},0);
}
function renderCart(){
  var body=document.getElementById("cart-body"),foot=document.getElementById("cart-foot");
  if(!cart.length){
    body.innerHTML="<div class=\"cart-empty\"><div class=\"ce-em\">\uD83D\uDED2</div><p>\u041a\u043e\u0448\u0438\u043a \u043f\u043e\u0440\u043e\u0436\u043d\u0456\u0439</p><span>\u0414\u043e\u0434\u0430\u0439\u0442\u0435 \u0442\u043e\u0432\u0430\u0440\u0438 \u0449\u043e\u0431 \u043f\u0440\u043e\u0434\u043e\u0432\u0436\u0438\u0442\u0438</span></div>";
    foot.innerHTML="";return;
  }
  var total=cart.reduce(function(s,x){return s+x.p*x.qty;},0);
  var saved=cart.reduce(function(s,x){return s+(x.op-x.p)*x.qty;},0);
  var delivery=total>=1500?0:65;
  var h="";
  cart.forEach(function(item){
    h+="<div class=\"cart-item\"><div class=\"ci-em\">"+item.e+"</div><div class=\"ci-info\">";
    h+="<div class=\"ci-nm\">"+item.nm+"</div><div class=\"ci-pr\">"+item.p*item.qty+" \u0433\u0440\u043d</div>";
    h+="<div class=\"ci-qty\"><button class=\"ciq-btn\" onclick=\"changeCartQty('"+item.id+"',-1)\">\u2212</button>";
    h+="<span class=\"ciq-val\">"+item.qty+"</span>";
    h+="<button class=\"ciq-btn\" onclick=\"changeCartQty('"+item.id+"',1)\">+</button></div></div>";
    h+="<button class=\"ci-del\" onclick=\"removeFromCart('"+item.id+"')\">&#x2715;</button></div>";
  });
  body.innerHTML=h;
  foot.innerHTML="<div class=\"cart-total-box\">"
    +"<div class=\"ct-row\"><span>\u0422\u043e\u0432\u0430\u0440\u0438</span><span>"+total+" \u0433\u0440\u043d</span></div>"
    +"<div class=\"ct-row\" style=\"color:var(--gd)\"><span>\u0415\u043a\u043e\u043d\u043e\u043c\u0456\u044f</span><span>\u2212"+saved+" \u0433\u0440\u043d</span></div>"
    +"<div class=\"ct-row\"><span>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430</span><span>"+(delivery===0?"\u0411\u0435\u0437\u043a\u043e\u0448\u0442\u043e\u0432\u043d\u043e":delivery+" \u0433\u0440\u043d")+"</span></div>"
    +"<div class=\"ct-row big\"><span>\u0420\u0430\u0437\u043e\u043c</span><span>"+(total+delivery)+" \u0433\u0440\u043d</span></div></div>"
    +"<button class=\"cart-checkout-btn\" onclick=\"startCheckout()\">\uD83C\uDF89 \u041e\u0444\u043e\u0440\u043c\u0438\u0442\u0438 \u0437\u0430\u043c\u043e\u0432\u043b\u0435\u043d\u043d\u044f</button>";
}

// ── CHECKOUT ──
function startCheckout(){
  if(!cart.length){showToast("\u26A0\uFE0F \u041a\u043e\u0448\u0438\u043a \u043f\u043e\u0440\u043e\u0436\u043d\u0456\u0439!");return;}
  closeAllPanels(false);
  document.getElementById("ovl").classList.add("open");
  document.getElementById("co-panel").classList.add("open");
  coStep=1;renderCheckout();
}
function stepsHTML(){
  var labels=["\u041a\u043e\u043d\u0442\u0430\u043a\u0442\u0438","\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430","\u041e\u043f\u043b\u0430\u0442\u0430","\u041f\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0430"];
  var h="<div class=\"checkout-steps\">";
  for(var i=0;i<4;i++){
    var n=i+1;
    var nc=n<coStep?"done":n===coStep?"active":"";
    var lc=n===coStep?"active":"";
    h+="<div class=\"cs-step\"><div class=\"cs-num "+nc+"\">"+(n<coStep?"\u2713":String(n))+"</div><span class=\"cs-lbl "+lc+"\">"+labels[i]+"</span></div>";
    if(i<3)h+="<div class=\"cs-line"+(n<coStep?" done":"")+"\">";h+="</div>";
  }
  h+="</div>";return h;
}
function renderCheckout(){
  var titles=["","\uD83D\uDED2 \u041a\u043e\u043d\u0442\u0430\u043a\u0442\u0438","\uD83D\uDE9A \u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430","\uD83D\uDCB3 \u041e\u043f\u043b\u0430\u0442\u0430","\uD83D\uDCCB \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043a\u0430","\u2705 \u041F\u0440\u0438\u0439\u043d\u044f\u0442\u043e!"];
  document.getElementById("co-title").textContent=titles[Math.min(coStep,5)];
  var body=document.getElementById("co-body");
  var total=cart.reduce(function(s,x){return s+x.p*x.qty;},0);
  var saved=cart.reduce(function(s,x){return s+(x.op-x.p)*x.qty;},0);
  var dcost=coDelivery==="courier"?120:coDelivery==="ukr"?35:65;
  if(total>=1500)dcost=0;
  var s=stepsHTML();
  if(coStep===1){
    body.innerHTML=s+"<div class=\"co-section\"><h4>\uD83D\uDCDE \u041a\u043e\u043d\u0442\u0430\u043a\u0442\u043d\u0430 \u0456\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0456\u044f</h4>"
      +"<div class=\"co-grid\"><div class=\"co-field\"><label>\u0406\u043c'\u044f</label><input class=\"co-input\" id=\"co-name\" placeholder=\"\u0412\u0430\u0448\u0435 \u0456\u043c'\u044f\"></div>"
      +"<div class=\"co-field\"><label>\u041f\u0440\u0456\u0437\u0432\u0438\u0449\u0435</label><input class=\"co-input\" id=\"co-lname\" placeholder=\"\u041f\u0440\u0456\u0437\u0432\u0438\u0449\u0435\"></div>"
      +"<div class=\"co-field\"><label>\u0422\u0435\u043b\u0435\u0444\u043e\u043d</label><input class=\"co-input\" id=\"co-phone\" value=\"+380\" placeholder=\"+380 XX XXX XX XX\"></div>"
      +"<div class=\"co-field\"><label>Email</label><input class=\"co-input\" id=\"co-email\" placeholder=\"email@example.com\"></div></div>"
      +"<div id=\"co-err1\" class=\"err-msg\">\u26A0\uFE0F \u0417\u0430\u043f\u043e\u0432\u043d\u0456\u0442\u044c \u0456\u043c'\u044f \u0442\u0430 \u0442\u0435\u043b\u0435\u0444\u043e\u043d</div></div>"
      +"<button class=\"co-next-btn\" onclick=\"coNext1()\">\u0414\u0430\u043b\u0456: \u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 \u2192</button>";
  } else if(coStep===2){
    var dc="";
    [["nova","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 32 32\" width=\"38\" height=\"38\" style=\"display:block\"><rect width=\"32\" height=\"32\" rx=\"4\" fill=\"#E41E27\"/><rect x=\"8\" y=\"9\" width=\"4\" height=\"14\" fill=\"#fff\"/><rect x=\"20\" y=\"9\" width=\"4\" height=\"14\" fill=\"#fff\"/><rect x=\"8\" y=\"13\" width=\"16\" height=\"6\" fill=\"#fff\"/><polygon points=\"16,2 11,9 21,9\" fill=\"#fff\"/><polygon points=\"16,30 11,23 21,23\" fill=\"#fff\"/><polygon points=\"2,16 8,11 8,21\" fill=\"#fff\"/><polygon points=\"30,16 24,11 24,21\" fill=\"#fff\"/></svg>","Nova Poshta","1-2 \u0434\u043d\u0456","\u0432\u0456\u0434 65 \u0433\u0440\u043d"],
     ["courier","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 40 28\" width=\"40\" height=\"38\" style=\"display:block\"><rect x=\"1\" y=\"3\" width=\"22\" height=\"17\" rx=\"3\" fill=\"#1FAF5A\"/><path d=\"M23 8 L23 20 L37 20 L37 14 L31 8 Z\" fill=\"#1FAF5A\"/><rect x=\"25\" y=\"9\" width=\"8\" height=\"7\" rx=\"1\" fill=\"#c8f5d8\"/><circle cx=\"8\" cy=\"23\" r=\"4\" fill=\"#333\"/><circle cx=\"8\" cy=\"23\" r=\"2\" fill=\"#fff\"/><circle cx=\"29\" cy=\"23\" r=\"4\" fill=\"#333\"/><circle cx=\"29\" cy=\"23\" r=\"2\" fill=\"#fff\"/></svg>","\u041a\u0443\u0440'\u0454\u0440","1-3 \u0434\u043d\u0456","\u0432\u0456\u0434 120 \u0433\u0440\u043d"],
     ["ukr","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 26 36\" width=\"30\" height=\"38\" style=\"display:block\"><path d=\"M13 1C7.48 1 3 5.48 3 11c0 8.5 10 24 10 24s10-15.5 10-24C23 5.48 18.52 1 13 1z\" fill=\"#F9C000\"/><circle cx=\"13\" cy=\"11\" r=\"5\" fill=\"#fff\"/><circle cx=\"13\" cy=\"11\" r=\"2.5\" fill=\"#F9C000\"/></svg>","\u0423\u043a\u0440\u043f\u043e\u0448\u0442\u0430","3-5 \u0434\u043d\u0456\u0432","\u0432\u0456\u0434 35 \u0433\u0440\u043d"]].forEach(function(d){
      dc+="<div class=\"del-card"+(coDelivery===d[0]?" active":"")+"\" onclick=\"coSetDelivery('"+d[0]+"')\">"
        +"<div class=\"dc-em\">"+d[1]+"</div><div class=\"dc-nm\">"+d[2]+"</div>"
        +"<div style=\"font-size:11px;color:var(--gt);margin-bottom:4px\">"+d[3]+"</div>"
        +"<div class=\"dc-pr\">"+d[4]+"</div></div>";
    });
    body.innerHTML=s+"<div class=\"co-section\"><h4>\uD83D\uDE9A \u0421\u043f\u043e\u0441\u0456\u0431 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438</h4><div class=\"del-opt\">"+dc+"</div></div>"
      
+(function(){
  var addrSec="";
  // Saved addresses quick picker (NP only)
  if(coDelivery==="nova"&&_userAddresses.length>0){
    var npAddrs=_userAddresses.filter(function(a){return a.city&&a.warehouse;});
    if(npAddrs.length){
      addrSec+='<div class="co-section"><h4>\uD83D\uDCCB \u041c\u043e\u0457 \u0430\u0434\u0440\u0435\u0441\u0438</h4><div class="co-addr-chips">';
      npAddrs.forEach(function(a,i){
        addrSec+='<div class="co-addr-chip" onclick="coFillSavedAddr('+i+')"><strong>'+a.title+'</strong><span>'+a.city+'</span></div>';
      });
      addrSec+='</div></div>';
    }
  }
  var cityField,deptField;
  if(coDelivery==="nova"){
    cityField='<div class="np-wrap"><input class="co-input" id="co-city" placeholder="\u0412\u0432\u0435\u0434\u0456\u0442\u044c \u043c\u0456\u0441\u0442\u043e..." autocomplete="off" oninput="npCoCity(this.value)" onfocus="npCoCityFocus()"><div class="np-drop" id="co-city-drop"></div></div>';
    deptField='<div class="np-wrap"><input class="co-input" id="co-dept" placeholder="\u0412\u0456\u0434\u0434\u0456\u043b\u0435\u043d\u043d\u044f \u2116..." autocomplete="off" oninput="npCoWare(this.value)"><div class="np-drop" id="co-dept-drop"></div></div>';
  }else if(coDelivery==="ukr"){
    cityField='<input class="co-input" id="co-city" placeholder="\u041c\u0456\u0441\u0442\u043e">';
    deptField='<input class="co-input" id="co-dept" placeholder="\u0412\u0456\u0434\u0434\u0456\u043b\u0435\u043d\u043d\u044f \u2116...">' ;
  }else{
    cityField='<input class="co-input" id="co-city" placeholder="\u041c\u0456\u0441\u0442\u043e">';
    deptField='<div style="display:flex;flex-direction:column;gap:8px">'+'<input class="co-input" id="co-street" placeholder="\u0412\u0443\u043b\u0438\u0446\u044f, \u0431\u0443\u0434\u0438\u043d\u043e\u043a">'+'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+'<input class="co-input" id="co-apt" placeholder="\u041a\u0432\u0430\u0440\u0442\u0438\u0440\u0430">'+'<input class="co-input" id="co-time" placeholder="\u0427\u0430\u0441: 09:00\u201321:00">'+'</div></div>';
  }
  return addrSec
    +'<div class="co-section"><h4>\uD83D\uDCCD \u0410\u0434\u0440\u0435\u0441\u0430</h4>'
    +'<div class="co-field"><label>\u041c\u0456\u0441\u0442\u043e</label>'+cityField+'</div>'
    +'<div class="co-field" style="margin-top:10px"><label>'+
      (coDelivery==="courier"?"\u0410\u0434\u0440\u0435\u0441\u0430 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438":coDelivery==="ukr"?"\u0412\u0456\u0434\u0434\u0456\u043b\u0435\u043d\u043d\u044f":"\u0412\u0456\u0434\u0434\u0456\u043b\u0435\u043d\u043d\u044f \/ \u043f\u043e\u0448\u0442\u043e\u043c\u0430\u0442")
      +'</label>'+deptField+'</div>'
    +'<div id="co-err2" class="err-msg">\u26A0\uFE0F \u0412\u043a\u0430\u0436\u0456\u0442\u044c \u043c\u0456\u0441\u0442\u043e \u0442\u0430 \u0432\u0456\u0434\u0434\u0456\u043b\u0435\u043d\u043d\u044f</div></div>'
    +'<div style="display:flex;gap:10px"><button class="co-back-btn" onclick="coStepGo(1)">\u2190 \u041d\u0430\u0437\u0430\u0434</button>'
    +'<button class="co-next-btn" style="flex:1" onclick="coNext2()">\u0414\u0430\u043b\u0456: \u041e\u043f\u043b\u0430\u0442\u0430 \u2192</button></div>';
}())
  } else if(coStep===3){
    var liqDesc=coPay==="card"
      ?"<div style=\"font-size:12px;color:var(--gt);margin-top:8px;text-align:center\">Visa, Mastercard, Apple Pay, Google Pay — через LiqPay</div>"
      :"<div style=\"font-size:12px;color:var(--gt);margin-top:8px;text-align:center\">Оплата кур'єру або у відділенні</div>";
    body.innerHTML=s
      +"<div class=\"co-section\"><h4>\uD83D\uDCB3 \u0421\u043F\u043E\u0441\u0456\u0431 \u043E\u043F\u043B\u0430\u0442\u0438</h4>"
      +"<div class=\"pay-opt\">"
      +"<div class=\"pay-card"+(coPay==="card"?" active":"")+"\" onclick=\"coSetPay('card')\" style=\"flex-direction:column;align-items:center;gap:6px;padding:18px 12px\">"
      +"<div style=\"font-size:28px\">\uD83D\uDCB3</div><div style=\"font-weight:700\">\u041e\u043d\u043b\u0430\u0439\u043d \u043e\u043f\u043b\u0430\u0442\u0430</div>"
      +"<div style=\"font-size:11px;color:var(--gt)\">Visa / MC / Apple Pay</div></div>"
      +"<div class=\"pay-card"+(coPay==="cod"?" active":"")+"\" onclick=\"coSetPay('cod')\" style=\"flex-direction:column;align-items:center;gap:6px;padding:18px 12px\">"
      +"<div style=\"font-size:28px\">\uD83D\uDCB5</div><div style=\"font-weight:700\">\u0413\u043e\u0442\u0456\u0432\u043a\u0430</div>"
      +"<div style=\"font-size:11px;color:var(--gt)\">\u041d\u0430\u043b\u043e\u0436\u0435\u043d\u0438\u0439 \u043f\u043b\u0430\u0442\u0456\u0436</div></div>"
      +"</div>"+liqDesc+"</div>"
      +"<div style=\"display:flex;gap:10px\"><button class=\"co-back-btn\" onclick=\"coStepGo(2)\">\u2190 \u041D\u0430\u0437\u0430\u0434</button>"
      +"<button class=\"co-next-btn\" style=\"flex:1\" onclick=\"coStepGo(4)\">\u0414\u0430\u043B\u0456: \u041F\u0435\u0440\u0435\u0432\u0456\u0440\u043A\u0430 \u2192</button></div>";
  } else if(coStep===4){
    var dlbl={nova:"Nova Poshta",ukr:"\u0423\u043a\u0440\u043f\u043e\u0448\u0442\u0430",courier:"\u041a\u0443\u0440'\u0454\u0440"};
    var plbl={card:"\u041A\u0430\u0440\u0442\u0430",mono:"Monobank",privat:"\u041F\u0440\u0438\u0432\u0430\u0442\u0032\u0034",cod:"\u041D\u0430\u043A\u043B\u0430\u0434\u0435\u043D\u0438\u0439",apple:"<span class=\"brand-b apple\">\uF8FF</span>Apple Pay",google:"<span class=\"brand-b google\">G</span>Google Pay"};
    var ih="";
    cart.forEach(function(item){ih+="<div class=\"co-order-item\"><div class=\"coi-em\">"+item.e+"</div><div class=\"coi-nm\">"+item.nm+" \u00D7"+item.qty+"</div><div class=\"coi-pr\">"+item.p*item.qty+" \u0433\u0440\u043D</div></div>";});
    body.innerHTML=s+"<div class=\"co-section\"><h4>\uD83D\uDCCB \u0412\u0430\u0448\u0435 \u0437\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F</h4>"+ih
      +"<div style=\"margin-top:14px\"><div class=\"co-total-row\"><span>\u0422\u043E\u0432\u0430\u0440\u0438</span><span>"+total+" \u0433\u0440\u043D</span></div>"
      +"<div class=\"co-total-row\" style=\"color:var(--gd)\"><span>\u0415\u043A\u043E\u043D\u043E\u043C\u0456\u044F</span><span>\u2212"+saved+" \u0433\u0440\u043D</span></div>"
      +"<div class=\"co-total-row\"><span>\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430</span><span>"+(dcost===0?"\u0411\u0435\u0437\u043A\u043E\u0448\u0442\u043E\u0432\u043D\u043E":dcost+" \u0433\u0440\u043D")+"</span></div>"
      +"<div class=\"co-total-row big\"><span>\u0420\u0430\u0437\u043E\u043C</span><span>"+(total+dcost)+" \u0433\u0440\u043D</span></div></div></div>"
      +"<div class=\"co-section\" style=\"background:var(--bg)\"><div style=\"display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px\">"
      +"<div><div style=\"font-size:11px;font-weight:700;color:var(--gt);margin-bottom:4px;text-transform:uppercase\">\u0414\u043E\u0441\u0442\u0430\u0432\u043A\u0430</div><div style=\"font-weight:600\">"+(dlbl[coDelivery]||"")+"</div></div>"
      +"<div><div style=\"font-size:11px;font-weight:700;color:var(--gt);margin-bottom:4px;text-transform:uppercase\">\u041E\u043F\u043B\u0430\u0442\u0430</div><div style=\"font-weight:600\">"+(plbl[coPay]||"")+"</div></div></div></div>"
      +"<div style=\"display:flex;gap:10px\"><button class=\"co-back-btn\" onclick=\"coStep=3;renderCheckout()\">\u2190 \u041D\u0430\u0437\u0430\u0434</button>"
      +"<button class=\"co-next-btn\" style=\"flex:1;background:#ff8c00\" onclick=\"coFinish()\">\u2705 \u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u0437\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F</button></div>";
  } else if(coStep===5){
    var onum=Math.floor(Math.random()*9000)+1000;
    cart=[];updateCartBadge();
    body.innerHTML="<div class=\"co-success\"><div class=\"cs-em\">\uD83C\uDF89</div><h3>\u0417\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043F\u0440\u0438\u0439\u043D\u044F\u0442\u043E!</h3>"
      +"<p>\u0414\u044F\u043A\u0443\u0454\u043C\u043E \u0437\u0430 \u043F\u043E\u043A\u0443\u043F\u043A\u0443! \u041C\u0438 \u0432\u0436\u0435 \u043E\u0431\u0440\u043E\u0431\u043B\u044F\u0454\u043C\u043E \u0432\u0430\u0448\u0435 \u0437\u0430\u043C\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u0456 \u0437\u0432'\u044F\u0436\u0435\u043C\u043E\u0441\u044C \u043D\u0430\u0439\u0431\u043B\u0438\u0436\u0447\u0438\u043C \u0447\u0430\u0441\u043E\u043C.</p>"
      +"<div class=\"co-num-badge\">#"+onum+"</div>"
      +"<p style=\"font-size:13px;color:var(--gt);margin-bottom:20px\">\u041D\u0430 \u0432\u0430\u0448 email \u043D\u0430\u0434\u0456\u0439\u0434\u0435 \u043F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043D\u043D\u044F</p>"
      +"<button class=\"co-next-btn\" onclick=\"closeAllPanels();showPage('home')\" style=\"max-width:260px;margin:0 auto\">\uD83C\uDFE0 \u041D\u0430 \u0433\u043E\u043B\u043E\u0432\u043D\u0443</button></div>";
  }
}
function coNext1(){
  var n=document.getElementById("co-name"),ln=document.getElementById("co-lname"),ph=document.getElementById("co-phone"),em=document.getElementById("co-email");
  if(!n||!n.value.trim()||!ph||!ph.value.trim()){var e=document.getElementById("co-err1");if(e)e.classList.add("show");return;}
  _coName=n.value.trim()+(ln&&ln.value.trim()?" "+ln.value.trim():"");
  _coPhone=ph.value.trim();
  _coEmail=(em&&em.value.trim())||currentUserEmail||"";
  var _coTotal=cart.reduce(function(s,x){return s+x.p*x.qty;},0);
  trackBeginCheckout(cart, _coTotal);
  coStep=2;renderCheckout();
}
function coNext2(){
  var ci=document.getElementById("co-city"),cd=document.getElementById("co-dept");
  if(coDelivery==="courier"){
    var st=document.getElementById("co-street");var ap=document.getElementById("co-apt");
    if(!ci||!ci.value.trim()||!st||!st.value.trim()){var e=document.getElementById("co-err2");if(e)e.classList.add("show");return;}
    _coCity=ci.value.trim();
    _coStreet=st.value.trim();
    _coApt=(ap&&ap.value.trim())||"";
    var tm=document.getElementById("co-time");_coTime=(tm&&tm.value.trim())||"";
    _coDept=_coStreet+(_coApt?", \u043a\u0432. "+_coApt:"")+(_coTime?", "+_coTime:"");
    coStep=3;renderCheckout();return;
  }
  if(!ci||!ci.value.trim()||!cd||!cd.value.trim()){var e2=document.getElementById("co-err2");if(e2)e2.classList.add("show");return;}
  _coCity=ci.value.trim();
  _coDept=cd.value.trim();
  if(coDelivery==="nova"){_coCityRef=_npcoCityRef;_coWareRef=_npcoWareRef;}
  coStep=3;renderCheckout();
}
async function coFinish(){
  var total=cart.reduce(function(s,x){return s+x.p*x.qty;},0);
  var dcost=coDelivery==="courier"?120:coDelivery==="ukr"?35:65;
  if(total>=1500)dcost=0;
  var orderData={
    items:cart.map(function(x){return {id:x.id,nm:x.nm,p:x.p,qty:x.qty,e:x.e};}),
    total:total,delivery_cost:dcost,delivery_method:coDelivery,payment_method:coPay,
    contact_name:_coName,contact_phone:_coPhone,contact_email:_coEmail,
    city:_coCity,delivery_address:_coDept,status:"new"
  };
  trackAddPaymentInfo(cart, total, coPay);
  if(coPay==="cod"){
    var _savedOrder=await saveOrderToSupabase(orderData);
    if(_savedOrder)trackPurchase(Object.assign({},orderData,{order_number:_savedOrder.id}));
    else trackPurchase(orderData);
    coStep=5;renderCheckout();return;
  }
  localStorage.setItem("_pendingOrder",JSON.stringify(orderData));
  var btn=document.querySelector(".co-next-btn[onclick*='coFinish']");
  if(btn){btn.disabled=true;btn.textContent="\u041f\u0435\u0440\u0435\u043d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u043d\u044f...";}
  await liqpayCheckout({
    amount:total+dcost,
    orderId:"dobrobut_"+Date.now(),
    description:"\u0414\u043e\u0431\u0440\u043e\u0431\u0443\u0442 \u2014 "+cart.length+" \u0442\u043e\u0432\u0430\u0440\u0456\u0432"
  });
}
// ── FAVORITES ──
function toggleFav(pid){
  if(!loggedIn){showToast("❤️ Увійдіть в акаунт щоб додавати в обране");openPanel("acc-panel");return;}
  var p=PRODS.find(function(x){return String(x.id)===String(pid);});if(!p)return;
  var idx=favs.findIndex(function(x){return String(x.id)===String(pid);});
  if(idx>=0){favs.splice(idx,1);showToast("\uD83D\uDC94 \u0412\u0438\u0434\u0430\u043B\u0435\u043D\u043E \u0437 \u043E\u0431\u0440\u0430\u043D\u043E\u0433\u043E");}
  else{favs.push({id:p.id,nm:p.nm,e:p.e,p:p.p,op:p.op});showToast("\u2764\uFE0F "+p.nm+" \u2014 \u0434\u043E\u0434\u0430\u043D\u043E!");}
  var badge=document.getElementById("fav-badge");
  badge.textContent=favs.length;badge.style.display=favs.length>0?"flex":"none";
  document.querySelectorAll(".pfav[data-id='"+pid+"']").forEach(function(b){b.classList.toggle("on",favs.some(function(x){return String(x.id)===String(pid);}));});
}
function renderFav(){
  var body=document.getElementById("fav-body");
  if(!favs.length){body.innerHTML="<div class=\"cart-empty\"><div class=\"ce-em\">\u2661</div><p>\u041E\u0431\u0440\u0430\u043D\u0435 \u043F\u043E\u0440\u043E\u0436\u043D\u0454</p><span>\u041D\u0430\u0442\u0438\u0441\u043D\u0456\u0442\u044C \u2661 \u043D\u0430 \u0442\u043E\u0432\u0430\u0440\u0456</span></div>";return;}
  var h="<div class=\"fav-grid\">";
  favs.forEach(function(p){
    h+="<div class=\"fav-card\" onclick=\"closeAllPanels();openMod('"+p.id+"')\"><div class=\"fc-em\">"+p.e+"</div>";
    h+="<div class=\"fc-nm\">"+p.nm+"</div><div class=\"fc-pr\">"+p.p+" \u0433\u0440\u043D</div>";
    h+="<button class=\"fav-add-btn\" onclick=\"event.stopPropagation();addToCart('"+p.id+"')\"> \u0412 \u043A\u043E\u0448\u0438\u043A</button></div>";
  });
  body.innerHTML=h+"</div>";
}

// ── NOVA POSHTA ──
var NP_API_KEY = "491b79a5cbfb7334fc50e42fd9ce8cf1"; // <-- встав сюди свій ключ API Нової Пошти (novaposhta.ua → Особистий кабінет → Налаштування → API)

async function _npPost(modelName, calledMethod, props) {
  if (!NP_API_KEY) return [];
  try {
    var r = await fetch("https://api.novaposhta.ua/v2.0/json/", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({apiKey: NP_API_KEY, modelName: modelName, calledMethod: calledMethod, methodProperties: props || {}})
    });
    var j = await r.json();
    return (j.success && j.data) ? j.data : [];
  } catch(e) { return []; }
}

var _npCityRef="",_npCityDebounce=null;

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
window.npCoSelectWare=npCoSelectWare;

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
window.coFillSavedAddr=coFillSavedAddr;


// ── ACCOUNT ──
var _userOrders=[],_userProfile={},_userAddresses=[];

async function loadUserData(){
  if(!supabase||!loggedIn)return;
  try{
    var ud=await supabase.auth.getUser();
    var uid=ud.data&&ud.data.user?ud.data.user.id:null;
    if(!uid)return;
    var pr=await supabase.from("profiles").select("*").eq("id",uid).maybeSingle();
    if(pr.data){
      _userProfile=pr.data;
      if(pr.data.full_name)currentUserName=pr.data.full_name;
    }
    var od=await supabase.from("orders").select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(30);
    _userOrders=od.data||[];
    var ad=await supabase.from("addresses").select("*").eq("user_id",uid).order("is_default",{ascending:false});
    _userAddresses=ad.data||[];
    var panel=document.getElementById("acc-panel");
    if(panel&&panel.classList.contains("open"))renderAcc();
  }catch(e){console.error("[loadUserData]",e);}
}

async function saveOrderToSupabase(orderData){
  if(!supabase)return null;
  try{
    var ud=await supabase.auth.getUser();
    var uid=ud.data&&ud.data.user?ud.data.user.id:null;
    var ins=Object.assign({},orderData);
    if(uid)ins.user_id=uid;
    var res=await supabase.from("orders").insert(ins).select("id,order_number").maybeSingle();
    if(res.data){
      _userOrders.unshift(res.data);
      var emailPayload=Object.assign({},orderData,{order_number:res.data.order_number});
      supabase.functions.invoke("send-order-email",{body:emailPayload}).catch(function(e){console.warn("[email]",e);});
      return res.data;
    }
  }catch(e){console.error("[saveOrder]",e);}
  return null;
}

function _ordCls(s){return{new:"oi-new",confirmed:"oi-conf",in_transit:"oi-tr",delivered:"oi-del",cancelled:"oi-can"}[s]||"oi-new";}
function _ordLbl(s){var _a=getCurrentLangPack().acc||{};return{new:_a.statusNew||"Нове",confirmed:_a.statusConfirmed||"Підтверджено",in_transit:_a.statusInTransit||"В дорозі",delivered:_a.statusDelivered||"Доставлено",cancelled:_a.statusCancelled||"Скасовано"}[s]||_a.statusNew||"Нове";}
function _fmtDate(d){try{return new Date(d).toLocaleDateString("uk-UA",{day:"numeric",month:"short",year:"numeric"});}catch(e){return "";}}

function renderAcc(){
  var _a=getCurrentLangPack().acc||{};
  var tr=getCurrentLangPack();
  var body=document.getElementById("acc-body");
  if(!loggedIn){
    body.innerHTML='<div style="text-align:center;margin-bottom:22px"><div style="font-size:54px;margin-bottom:12px">👤</div>'
      +'<div style="font-size:18px;font-weight:800;margin-bottom:6px">'+_a.welcome+'</div>'
      +'<div style="font-size:13px;color:var(--gt)">'+_a.loginPrompt+'</div></div>'
      +'<input class="lf-input" type="email" id="lf-email" placeholder="Email">'
      +'<input class="lf-input" type="password" id="lf-pass" placeholder="'+_a.newPassword+'">'
      +'<button class="lf-btn" onclick="doLogin()" style="margin-bottom:10px">'+_a.signIn+'</button>'
      +'<div style="text-align:center;font-size:13px;color:var(--gt);margin-bottom:12px">'+_a.noAccount+' <a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showRegisterForm()">'+_a.register+'</a></div>'
      +'<button class="lf-btn social" style="margin-bottom:8px" onclick="doLogin(\'google\')"><span class="brand-b google">G</span>Google</button>'
      +'<button class="lf-btn social" onclick="showPhoneForm()">'+_a.phone+'</button>';
    return;
  }
  var ai=currentUserName&&currentUserName.trim()?currentUserName.trim().charAt(0).toUpperCase():"К";
  var activeOrds=_userOrders.filter(function(o){return o.status!=="delivered"&&o.status!=="cancelled";}).length;
  var menus=[
    {ico:"M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 000 4h6a2 2 0 000-4",t:_a.menuOrders,s:_userOrders.length?_userOrders.length+" "+(_a.menuOrdersNone||"").split(" ").slice(-1)[0]:_a.menuOrdersNone,fn:"showAccOrders()",badge:activeOrds},
    {ico:"M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",t:tr.fav,s:favs.length+" "+tr.productsWord,fn:"showAccFav()",badge:0},
    {ico:"M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",t:_a.menuAddresses,s:_userAddresses.length?_userAddresses.length+" "+_a.menuAddressesSaved:_a.menuAddressesNone,fn:"showAccAddresses()",badge:0},
    {ico:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",t:_a.menuSettings,s:_a.menuSettingsDesc,fn:"showAccSettings()",badge:0},
  ];
  var h='<div class="acc-avatar">'+ai+'</div>'
    +'<div class="acc-name">'+( currentUserName||_a.buyer)+'</div>'
    +'<div class="acc-email">'+( currentUserEmail||"")+'</div>';
  menus.forEach(function(m){
    var bdg=m.badge>0?'<span class="acc-badge">'+m.badge+'</span>':'' ;
    h+='<button class="acc-mi" onclick="'+m.fn+'">'
      +'<div class="ami-ico"><svg viewBox="0 0 24 24" stroke="var(--gd)" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="19" height="19"><path d="'+m.ico+'"/></svg></div>'
      +'<div class="ami-tx"><strong>'+m.t+'</strong><span>'+m.s+'</span></div>'
      +bdg+'<span class="ami-arr">›</span></button>';
  });
  if(_userOrders.length>0){
    h+='<div style="border-top:1px solid var(--gl2);margin-top:16px;padding-top:16px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      +'<h4 style="font-size:14px;font-weight:800;margin:0">'+_a.recentOrders+'</h4>'
      +'<a style="font-size:12px;color:var(--g);font-weight:700;cursor:pointer" onclick="showAccOrders()">'+_a.allOrders+'</a></div>';
    _userOrders.slice(0,3).forEach(function(o){
      h+='<div class="acc-ord-item" onclick="showAccOrderDetail(\''+ o.id+'\')" style="cursor:pointer">'
        +'<div class="aoi-l"><strong>'+_a.orderWord+' #'+(o.order_number||"—")+'</strong>'
        +'<span>'+_fmtDate(o.created_at)+' · '+(o.total||0)+' '+tr.currency+'</span></div>'
        +'<span class="oi-st '+_ordCls(o.status)+'">'+_ordLbl(o.status)+'</span></div>';
    });
    h+='</div>';
  }
  h+='<button class="acc-logout-btn" onclick="doLogout()">'+_a.logout+'</button>';
  body.innerHTML=h;
}

function showAccFav(){
  closeAllPanels(false);
  openPanel("fav-panel");
}

function showAccOrders(){
  var _a=getCurrentLangPack().acc||{};var tr=getCurrentLangPack();
  var body=document.getElementById("acc-body");
  var h='<button class="acc-back-btn" onclick="renderAcc()">'+_a.back+'</button>';
  if(_userOrders.length===0){
    h+='<div style="text-align:center;padding:40px 0"><div style="font-size:48px;margin-bottom:12px">📦</div>'
      +'<div style="font-size:16px;font-weight:700;margin-bottom:6px">'+_a.noOrdersTitle+'</div>'
      +'<div style="font-size:13px;color:var(--gt)">'+_a.noOrdersDesc+'</div></div>';
    body.innerHTML=h;return;
  }
  h+='<h3 style="font-size:16px;font-weight:800;margin-bottom:14px">'+_a.myOrders+'</h3>';
  _userOrders.forEach(function(o){
    var items=o.items||[];
    h+='<div class="acc-ord-card" onclick="showAccOrderDetail(\''+ o.id+'\')">'
      +'<div class="aoc-top"><div><strong style="font-size:13px">#'+(o.order_number||"—")+'</strong>'
      +'<span style="font-size:11px;color:var(--gt);display:block;margin-top:2px">'+_fmtDate(o.created_at)+'</span></div>'
      +'<span class="oi-st '+_ordCls(o.status)+'">'+_ordLbl(o.status)+'</span></div>'
      +'<div class="aoc-bot">'
      +items.slice(0,4).map(function(x){return '<span class="aoc-em">'+x.e+'</span>';}).join("")
      +(items.length>4?'<span style="font-size:11px;color:var(--gt)">+'+(items.length-4)+'</span>':"") 
      +'<span style="margin-left:auto;font-size:14px;font-weight:800;color:var(--gd)">'+(o.total||0)+' '+tr.currency+'</span></div></div>';
  });
  body.innerHTML=h;
}

function showAccOrderDetail(oid){
  var _a=getCurrentLangPack().acc||{};var tr=getCurrentLangPack();
  var body=document.getElementById("acc-body");
  var o=_userOrders.find(function(x){return x.id===oid;});
  if(!o)return;
  var dcost=o.delivery_cost||0;
  var pmLbl={cod:_a.paymentCod||"Накладений платіж",card:_a.paymentCard||"Онлайн (картка)",liqpay:"LiqPay"};
  var h='<button class="acc-back-btn" onclick="showAccOrders()">'+_a.back+'</button>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
    +'<h3 style="font-size:16px;font-weight:800;margin:0">'+_a.orderWord+' #'+(o.order_number||"—")+'</h3>'
    +'<span class="oi-st '+_ordCls(o.status)+'">'+_ordLbl(o.status)+'</span></div>';
  if(o.items&&o.items.length){
    h+='<div class="acc-det-section"><h4>'+_a.itemsTitle+'</h4>';
    o.items.forEach(function(x){
      h+='<div class="aod-item"><span class="aod-em">'+x.e+'</span>'
        +'<div class="aod-info"><strong>'+x.nm+'</strong><span>'+x.qty+' × '+x.p+' '+tr.currency+'</span></div>'
        +'<span class="aod-pr">'+(x.p*x.qty)+' '+tr.currency+'</span></div>';
    });
    h+='</div>';
  }
  h+='<div class="acc-det-section"><h4>'+_a.billTitle+'</h4>'
    +'<div class="aod-row"><span>'+_a.itemsTitle+'</span><span>'+(o.total||0)+' '+tr.currency+'</span></div>'
    +'<div class="aod-row"><span>'+_a.deliveryTitle+'</span><span>'+(dcost===0?_a.free:dcost+' '+tr.currency)+'</span></div>'
    +'<div class="aod-row big"><span>'+_a.total+'</span><span>'+((o.total||0)+dcost)+' '+tr.currency+'</span></div>'
    +'<div class="aod-row"><span>'+_a.paymentLabel+'</span><span>'+(pmLbl[o.payment_method]||o.payment_method||"—")+'</span></div>'
    +'</div>';
  if(o.contact_name||o.city){
    h+='<div class="acc-det-section"><h4>'+_a.deliveryTitle+'</h4>'
      +(o.contact_name?'<div class="aod-row"><span>'+_a.recipientLabel+'</span><span>'+o.contact_name+'</span></div>':"") 
      +(o.city?'<div class="aod-row"><span>'+_a.cityLabel+'</span><span>'+o.city+'</span></div>':"") 
      +(o.delivery_address?'<div class="aod-row"><span>'+_a.deptLabel+'</span><span>'+o.delivery_address+'</span></div>':"") 
      +'<div class="aod-row"><span>'+_a.methodLabel+'</span><span>'+({nova:"Nova Poshta",ukr:"Укрпошта"}[o.delivery_method]||o.delivery_method||"—")+'</span></div>'
      +'</div>';
  }
  body.innerHTML=h;
}

function showAccAddresses(){
  var _a=getCurrentLangPack().acc||{};
  var body=document.getElementById("acc-body");
  var h='<button class="acc-back-btn" onclick="renderAcc()">'+_a.back+'</button>'
    +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
    +'<h3 style="font-size:16px;font-weight:800;margin:0">'+_a.addressesTitle+'</h3>'
    +'<button class="acc-add-btn" onclick="showAccAddressForm()">'+_a.addAddress+'</button></div>';
  if(_userAddresses.length===0){
    h+='<div style="text-align:center;padding:36px 0"><div style="font-size:44px;margin-bottom:12px">📍</div>'
      +'<div style="font-size:14px;font-weight:700;margin-bottom:6px">'+_a.noAddressTitle+'</div>'
      +'<div style="font-size:13px;color:var(--gt)">'+_a.noAddressDesc+'</div></div>';
  }else{
    _userAddresses.forEach(function(a){
      var info=[a.city,a.warehouse].filter(Boolean).join(" · ");
      h+='<div class="addr-card">'
        +'<div class="addr-top"><div class="addr-title-row"><strong>'+a.title+'</strong>'+(a.is_default?'<span class="addr-def">'+_a.defaultBadge+'</span>':"")+'</div>'
        +'<div class="addr-actions">'
        +(!a.is_default?'<button class="addr-act-btn" onclick="doSetDefaultAddress(\''+ a.id+'\')">'+_a.makeDefault+'</button>':"") 
        +'<button class="addr-act-btn" onclick="showAccAddressForm(\''+ a.id+'\')" >✏️</button>'
        +'<button class="addr-act-btn del" onclick="doDeleteAddress(\''+ a.id+'\')" >✕</button></div></div>'
        +(a.recipient_name?'<div class="addr-recip">'+a.recipient_name+'</div>':"") 
        +'<div class="addr-info">'+info+'</div>'
        +'</div>';
    });
  }
  body.innerHTML=h;
}

function showAccAddressForm(id){
  var _a=getCurrentLangPack().acc||{};
  var a=id?_userAddresses.find(function(x){return x.id===id;}):null;
  _npCityRef=a&&a.city_ref?a.city_ref:"";
  _npWarehouseRef=a&&a.warehouse_ref?a.warehouse_ref:"";
  var body=document.getElementById("acc-body");
  var wareDisabled=_npCityRef?"":"disabled";
  body.innerHTML='<button class="acc-back-btn" onclick="showAccAddresses()">'+_a.back+'</button>'
    +'<h3 style="font-size:16px;font-weight:800;margin-bottom:14px">'+( a?_a.editAddress:_a.newAddress)+'</h3>'
    +'<div id="addr-edit-id" style="display:none">'+( a?a.id:"")+'</div>'
    +'<label class="acc-lbl">'+_a.addrNameLabel+'</label>'
    +'<input class="lf-input" id="addr-title" placeholder="'+_a.addrNamePh+'" value="'+( a&&a.title?a.title:_a.addrNameDef)+'">'
    +'<label class="acc-lbl">'+_a.addrRecipLabel+'</label>'
    +'<input class="lf-input" id="addr-recip" placeholder="'+_a.addrRecipLabel+'" value="'+( a&&a.recipient_name?a.recipient_name:"")+'">'
    +'<label class="acc-lbl">'+_a.addrCityLabel+'</label>'
    +'<div class="np-wrap">'
    +'<input class="lf-input" id="np-city-inp" placeholder="'+_a.addrCityLabel+'..." value="'+( a&&a.city?a.city:"")+'" oninput="npCityInput(this.value)" onfocus="npCityFocus()" autocomplete="off">'
    +'<div class="np-drop" id="np-city-drop"></div></div>'
    +'<label class="acc-lbl">'+_a.addrBranchLabel+'</label>'
    +'<div class="np-wrap">'
    +'<input class="lf-input" id="np-ware-inp" placeholder="'+( wareDisabled?_a.addrBranchPhNoCity:_a.addrBranchPh)+'" value="'+( a&&a.warehouse?a.warehouse:"")+'" oninput="npWareInput(this.value)" autocomplete="off" '+( wareDisabled?'disabled style="opacity:.5"':"") +'>'
    +'<div class="np-drop" id="np-ware-drop"></div></div>'
    +'<button class="lf-btn" onclick="doSaveAddress()" style="margin-top:8px">'+_a.save+'</button>';
}

async function doSaveAddress(){
  if(!supabase)return;
  var title=(document.getElementById("addr-title")||{}).value||"";
  var recip=(document.getElementById("addr-recip")||{}).value||"";
  var city=(document.getElementById("np-city-inp")||{}).value||"";
  var ware=(document.getElementById("np-ware-inp")||{}).value||"";
  var eid=(document.getElementById("addr-edit-id")||{}).textContent||"";
  title=title.trim(); recip=recip.trim(); city=city.trim(); ware=ware.trim();
  if(!city){showToast("\u26a0\ufe0f \u0412\u0438\u0431\u0435\u0440\u0456\u0442\u044c \u043c\u0456\u0441\u0442\u043e");return;}
  if(!ware){showToast("\u26a0\ufe0f \u0412\u0438\u0431\u0435\u0440\u0456\u0442\u044c \u0432\u0456\u0434\u0434\u0456\u043b\u0435\u043d\u043d\u044f");return;}
  var ud=await supabase.auth.getUser();
  var uid=ud.data&&ud.data.user?ud.data.user.id:null;
  if(!uid){showToast("\u26a0\ufe0f \u041f\u043e\u0442\u0440\u0456\u0431\u0435\u043d \u0432\u0445\u0456\u0434");return;}
  var btn=document.querySelector('button[onclick="doSaveAddress()"]');
  if(btn){btn.disabled=true;btn.textContent="\u0417\u0431\u0435\u0440\u0435\u0436\u0435\u043d\u043d\u044f...";}
  var dat={
    title:title||"\u0410\u0434\u0440\u0435\u0441\u0430",
    recipient_name:recip||null,
    city:city,
    city_ref:_npCityRef||null,
    warehouse:ware,
    warehouse_ref:_npWarehouseRef||null,
    user_id:uid
  };
  var res=eid
    ?await supabase.from("addresses").update(dat).eq("id",eid)
    :await supabase.from("addresses").insert(dat);
  if(btn){btn.disabled=false;btn.textContent="\u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438";}
  if(res.error){showToast("\u274c "+res.error.message);return;}
  showToast("\u2705 \u0410\u0434\u0440\u0435\u0441\u0443 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043d\u043e");
  await loadUserData();
  showAccAddresses();
}

async function doDeleteAddress(id){
  if(!supabase)return;
  if(!confirm("\u0412\u0438\u0434\u0430\u043b\u0438\u0442\u0438 \u0430\u0434\u0440\u0435\u0441\u0443?"))return;
  var res=await supabase.from("addresses").delete().eq("id",id);
  if(res.error){showToast("\u274c "+res.error.message);return;}
  _userAddresses=_userAddresses.filter(function(a){return a.id!==id;});
  showToast("\uD83D\uDDD1 \u0410\u0434\u0440\u0435\u0441\u0443 \u0432\u0438\u0434\u0430\u043b\u0435\u043d\u043e");
  showAccAddresses();
}

async function doSetDefaultAddress(id){
  if(!supabase)return;
  var ud=await supabase.auth.getUser();
  var uid=ud.data&&ud.data.user?ud.data.user.id:null;
  if(!uid)return;
  await supabase.from("addresses").update({is_default:false}).eq("user_id",uid);
  await supabase.from("addresses").update({is_default:true}).eq("id",id);
  _userAddresses.forEach(function(a){a.is_default=(a.id===id);});
  _userAddresses.sort(function(a,b){return (b.is_default?1:0)-(a.is_default?1:0);});
  showToast("\u2705 \u041e\u0441\u043d\u043e\u0432\u043d\u0443 \u0430\u0434\u0440\u0435\u0441\u0443 \u0437\u043c\u0456\u043d\u0435\u043d\u043e");
  showAccAddresses();
}

function showAccSettings(){
  var _a=getCurrentLangPack().acc||{};
  var body=document.getElementById("acc-body");
  var p=_userProfile||{};
  body.innerHTML='<button class="acc-back-btn" onclick="renderAcc()">'+_a.back+'</button>'
    +'<h3 style="font-size:16px;font-weight:800;margin-bottom:14px">'+_a.settingsTitle+'</h3>'
    +'<div class="acc-det-section"><h4>'+_a.personalData+'</h4>'
    +'<label class="acc-lbl">'+_a.nameLabel+'</label>'
    +'<input class="lf-input" id="s-name" placeholder="'+_a.nameLabel+'" value="'+( currentUserName||"")+'">'
    +'<label class="acc-lbl">'+_a.phoneLabel+'</label>'
    +'<input class="lf-input" id="s-phone" type="tel" placeholder="+380..." value="'+( p.phone||"")+'">'
    +'<button class="lf-btn" onclick="doSaveProfile()" style="margin-top:4px">'+_a.saveData+'</button></div>'
    +'<div class="acc-det-section"><h4>'+_a.emailSection+'</h4>'
    +'<div style="padding:11px 14px;background:var(--gl);border-radius:10px;font-size:13px;color:var(--gt)">'+( currentUserEmail||"—")+'</div></div>'
    +'<div class="acc-det-section"><h4>'+_a.changePassword+'</h4>'
    +'<label class="acc-lbl">'+_a.newPassword+'</label>'
    +'<input class="lf-input" type="password" id="s-newpass" placeholder="'+_a.newPassword+'">'
    +'<label class="acc-lbl">'+_a.repeatPassword+'</label>'
    +'<input class="lf-input" type="password" id="s-newpass2" placeholder="'+_a.repeatPassword+'">'
    +'<button class="lf-btn" onclick="doChangePassword()">'+_a.changePasswordBtn+'</button></div>';
}

async function doSaveProfile(){
  if(!supabase)return;
  var name=document.getElementById("s-name")?document.getElementById("s-name").value.trim():"";
  var phone=document.getElementById("s-phone")?document.getElementById("s-phone").value.trim():"";
  var ud=await supabase.auth.getUser();
  var uid=ud.data&&ud.data.user?ud.data.user.id:null;
  if(!uid){showToast("⚠️ Потрібен вхід");return;}
  var btn=document.querySelector('button[onclick="doSaveProfile()"]');
  if(btn){btn.disabled=true;btn.textContent="Збереження...";}
  var res=await supabase.from("profiles").upsert({id:uid,full_name:name||currentUserName,phone:phone||null,updated_at:new Date().toISOString()});
  if(btn){btn.disabled=false;btn.textContent="Зберегти дані";}
  if(res.error){showToast("❌ "+res.error.message);return;}
  if(name){currentUserName=name;_userProfile.full_name=name;}
  _userProfile.phone=phone;
  showToast("✅ Дані збережено");
}

async function doChangePassword(){
  var p1=document.getElementById("s-newpass")?document.getElementById("s-newpass").value:"";
  var p2=document.getElementById("s-newpass2")?document.getElementById("s-newpass2").value:"";
  if(!p1){showToast("⚠️ Введіть новий пароль");return;}
  if(p1!==p2){showToast("⚠️ Паролі не збігаються");return;}
  if(p1.length<6){showToast("⚠️ Мінімум 6 символів");return;}
  if(!supabase)return;
  var btn=document.querySelector('button[onclick="doChangePassword()"]');
  if(btn){btn.disabled=true;btn.textContent="Зміна...";}
  var res=await supabase.auth.updateUser({password:p1});
  if(btn){btn.disabled=false;btn.textContent="Змінити пароль";}
  if(res.error){showToast("❌ "+res.error.message);return;}
  document.getElementById("s-newpass").value="";
  document.getElementById("s-newpass2").value="";
  showToast("✅ Пароль змінено успішно");
}

async function doLogin(provider){
  if(!supabase){showToast("⚠️ Supabase не підключений");return;}
  if(provider==="google"){
    var oauthRes=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:window.location.origin}});
    if(oauthRes.error)showToast("❌ "+oauthRes.error.message);
    return;
  }
  var e=document.getElementById("lf-email"),p=document.getElementById("lf-pass");
  if(!e||!e.value||!p||!p.value){showToast("⚠️ Введіть email та пароль");return;}
  var btn=document.querySelector(".lf-btn:not(.social)");
  if(btn){btn.disabled=true;btn.textContent="Завантаження...";}
  var res=await supabase.auth.signInWithPassword({email:e.value.trim(),password:p.value});
  if(btn){btn.disabled=false;btn.textContent="Увійти";}
  if(res.error){showToast("❌ "+res.error.message);return;}
}
async function doRegister(){
  if(!supabase){return;}
  var e=document.getElementById("lf-email"),p=document.getElementById("lf-pass");
  if(!e||!e.value||!p||!p.value){showToast("⚠️ Введіть email та пароль");return;}
  var email=e.value.trim();
  var btn=document.querySelector(".lf-btn:not(.social)");
  if(btn){btn.disabled=true;btn.textContent="Завантаження...";}
  var res=await supabase.auth.signUp({email:email,password:p.value,options:{data:{full_name:email.split("@")[0]}}});
  if(btn){btn.disabled=false;btn.textContent="Зареєструватись";}
  if(res.error){showToast("❌ "+res.error.message);return;}
  showOtpForm(email);
}
var _otpEmail="",_otpPhone="",_otpMode="email";
function showOtpForm(email){
  _otpEmail=email;
  var body=document.getElementById("acc-body");if(!body)return;
  var inp="";
  for(var i=0;i<6;i++){inp+='<input class="otp-inp" maxlength="1" type="text" inputmode="numeric" oninput="otpNext(this,'+i+')" onkeydown="otpKey(this,'+i+',event)" '+(i===0?'onpaste="otpPaste(event)"':'')+' >';}
  body.innerHTML='<div style="text-align:center;margin-bottom:22px"><div style="font-size:48px;margin-bottom:12px">📧</div><div style="font-size:18px;font-weight:800;margin-bottom:6px">Введіть код</div><div style="font-size:13px;color:var(--gt)">Ми надіслали 6-значний код на <b>'+email+'</b></div></div>'
    +'<div class="otp-row">'+inp+'</div>'
    +'<button class="lf-btn" id="otp-btn" onclick="doVerifyOtp()" style="margin-top:16px">Підтвердити</button>'
    +'<div style="text-align:center;font-size:13px;color:var(--gt);margin-top:12px"><a style="color:var(--g);font-weight:700;cursor:pointer" onclick="doResendOtp()">Надіслати знову</a> · <a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showRegisterForm()">Назад</a></div>';
  setTimeout(function(){var f=document.querySelector(".otp-inp");if(f)f.focus();},100);
}
function otpNext(el,idx){
  el.value=el.value.replace(/[^0-9]/g,"");
  var inputs=document.querySelectorAll(".otp-inp");
  if(el.value&&idx<5)inputs[idx+1].focus();
  if(idx===5&&el.value)doVerifyOtp();
}
function otpKey(el,idx,e){
  if(e.key==="Backspace"&&!el.value&&idx>0){
    var inputs=document.querySelectorAll(".otp-inp");
    inputs[idx-1].focus();
  }
}
function otpPaste(e){
  e.preventDefault();
  var text=(e.clipboardData||window.clipboardData).getData("text").replace(/[^0-9]/g,"").slice(0,6);
  var inputs=document.querySelectorAll(".otp-inp");
  text.split("").forEach(function(c,i){if(inputs[i])inputs[i].value=c;});
  var last=Math.min(text.length,5);
  if(inputs[last])inputs[last].focus();
  if(text.length===6)doVerifyOtp();
}
async function doVerifyOtp(){
  if(!supabase)return;
  var inputs=document.querySelectorAll(".otp-inp");
  var code=Array.from(inputs).map(function(i){return i.value;}).join("");
  if(code.length<6){showToast("⚠️ Введіть всі 6 цифр");return;}
  var btn=document.getElementById("otp-btn");
  if(btn){btn.disabled=true;btn.textContent="Перевірка...";}
  var res=_otpMode==="phone"
    ?await supabase.auth.verifyOtp({phone:_otpPhone,token:code,type:"sms"})
    :await supabase.auth.verifyOtp({email:_otpEmail,token:code,type:"signup"});
  if(btn){btn.disabled=false;btn.textContent="Підтвердити";}
  if(res.error){showToast("❌ "+res.error.message);return;}
  showToast("✅ "+(_otpMode==="phone"?"Вхід успішний!":"Акаунт підтверджено!"));
}
async function doResendOtp(){
  if(!supabase)return;
  if(_otpMode==="phone"){
    var r=await supabase.auth.signInWithOtp({phone:_otpPhone});
    if(r.error){showToast("❌ "+r.error.message);return;}
    showToast("📱 Код надіслано знову на "+_otpPhone);return;
  }
  var res=await supabase.auth.resend({type:"signup",email:_otpEmail});
  if(res.error){showToast("❌ "+res.error.message);return;}
  showToast("📧 Код надіслано знову на "+_otpEmail);
}
function showPhoneForm(){
  var body=document.getElementById("acc-body");if(!body)return;
  body.innerHTML='<div style="text-align:center;margin-bottom:22px"><div style="font-size:54px;margin-bottom:12px">📱</div><div style="font-size:18px;font-weight:800;margin-bottom:6px">Вхід за номером</div><div style="font-size:13px;color:var(--gt)">Введіть номер у форматі +380...</div></div>'
    +'<input class="lf-input" type="tel" id="lf-phone" value="+380" placeholder="+380 XX XXX XX XX">'
    +'<button class="lf-btn" onclick="doSendPhoneSms()" style="margin-bottom:10px">Отримати код</button>'
    +'<div style="text-align:center;font-size:13px;color:var(--gt);margin-top:8px"><a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showLoginForm()">← Назад</a></div>';
  setTimeout(function(){var f=document.getElementById("lf-phone");if(f)f.focus();},100);
}
async function doSendPhoneSms(){
  if(!supabase)return;
  var ph=document.getElementById("lf-phone");
  if(!ph||!ph.value.trim()){showToast("⚠️ Введіть номер телефону");return;}
  var phone=ph.value.trim().replace(/s/g,"");
  if(!phone.startsWith("+")){showToast("⚠️ Номер має починатися з +");return;}
  var btn=document.querySelector(".lf-btn:not(.social)");
  if(btn){btn.disabled=true;btn.textContent="Надсилання...";}
  var res=await supabase.auth.signInWithOtp({phone:phone});
  if(btn){btn.disabled=false;btn.textContent="Отримати код";}
  if(res.error){showToast("❌ "+res.error.message);return;}
  _otpPhone=phone;_otpMode="phone";
  var body=document.getElementById("acc-body");if(!body)return;
  var inp="";
  for(var i=0;i<6;i++){inp+='<input class="otp-inp" maxlength="1" type="text" inputmode="numeric" oninput="otpNext(this,'+i+')" onkeydown="otpKey(this,'+i+',event)" '+(i===0?'onpaste="otpPaste(event)"':'')+' >';}
  body.innerHTML='<div style="text-align:center;margin-bottom:22px"><div style="font-size:48px;margin-bottom:12px">📱</div><div style="font-size:18px;font-weight:800;margin-bottom:6px">Введіть код</div><div style="font-size:13px;color:var(--gt)">SMS-код надіслано на <b>'+phone+'</b></div></div>'
    +'<div class="otp-row">'+inp+'</div>'
    +'<button class="lf-btn" id="otp-btn" onclick="doVerifyOtp()" style="margin-top:16px">Підтвердити</button>'
    +'<div style="text-align:center;font-size:13px;color:var(--gt);margin-top:12px"><a style="color:var(--g);font-weight:700;cursor:pointer" onclick="doResendOtp()">Надіслати знову</a> · <a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showPhoneForm()">Назад</a></div>';
  setTimeout(function(){var f=document.querySelector(".otp-inp");if(f)f.focus();},100);
}
async function doLogout(){
  _supMsgs=[];aiHistory=[];aiInit=false;
  loggedIn=false;currentUserEmail="";currentUserName="Покупець";
  _userOrders=[];_userProfile={};_userAddresses=[];
  if(supabase)await supabase.auth.signOut();
  renderAcc();
  if(document.getElementById("pd-review-write"))renderPdReviewWriter();
  showToast("👋 Ви вийшли з акаунту");
}
function showLoginForm(){
  var _a=getCurrentLangPack().acc||{};
  var body=document.getElementById("acc-body");if(!body)return;
  body.innerHTML='<div style="text-align:center;margin-bottom:22px"><div style="font-size:54px;margin-bottom:12px">👤</div><div style="font-size:18px;font-weight:800;margin-bottom:6px">'+(_a.welcome||'Вітаємо!')+'</div><div style="font-size:13px;color:var(--gt)">'+(_a.loginPrompt||'Увійдіть щоб бачити замовлення')+'</div></div>'
    +'<input class="lf-input" type="email" id="lf-email" placeholder="Email">'
    +'<input class="lf-input" type="password" id="lf-pass" placeholder="'+(_a.newPassword||'Пароль')+'">'
    +'<button class="lf-btn" onclick="doLogin()" style="margin-bottom:10px">'+(_a.signIn||'Увійти')+'</button>'
    +'<div style="text-align:center;font-size:13px;color:var(--gt);margin-bottom:12px">'+(_a.noAccount||'Немає акаунту?')+' <a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showRegisterForm()">'+(_a.register||'Зареєструватись')+'</a></div>'
    +'<button class="lf-btn social" style="margin-bottom:8px" onclick="doLogin(\'google\')"><span class="brand-b google">G</span>Google</button>'
    +'<button class="lf-btn social" onclick="showPhoneForm()">'+(_a.phone||'📱 Телефон')+'</button>';
}
function showRegisterForm(){
  var _a=getCurrentLangPack().acc||{};
  var body=document.getElementById("acc-body");if(!body)return;
  body.innerHTML='<div style="text-align:center;margin-bottom:22px"><div style="font-size:54px;margin-bottom:12px">📝</div><div style="font-size:18px;font-weight:800;margin-bottom:6px">'+(_a.register||'Реєстрація')+'</div><div style="font-size:13px;color:var(--gt)">'+(_a.loginPrompt||'Створіть акаунт')+'</div></div>'
    +'<input class="lf-input" type="email" id="lf-email" placeholder="Email">'
    +'<input class="lf-input" type="password" id="lf-pass" placeholder="'+(_a.newPassword||'Пароль')+' (мін. 6)">'
    +'<button class="lf-btn" onclick="doRegister()" style="margin-bottom:10px">'+(_a.register||'Зареєструватись')+'</button>'
    +'<div style="text-align:center;font-size:13px;color:var(--gt);margin-bottom:12px">'+(_a.signIn?'Вже є акаунт? <a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showLoginForm()">'+_a.signIn+'</a>':'Вже є акаунт? <a style="color:var(--g);font-weight:700;cursor:pointer" onclick="showLoginForm()">Увійти</a>')+'</div>'
    +'<div style="text-align:center;font-size:12px;color:var(--gt);margin-bottom:8px">або</div>'
    +'<button class="lf-btn social" style="margin-bottom:8px" onclick="doLogin(\'google\')"><span class="brand-b google">G</span>Google</button>'
    +'<button class="lf-btn social" onclick="showPhoneForm()">'+(_a.phone||'📱 Телефон')+'</button>';
}

window.showAccOrders=showAccOrders;
window.showAccOrderDetail=showAccOrderDetail;
window.showAccAddresses=showAccAddresses;
window.showAccAddressForm=showAccAddressForm;
window.doSaveAddress=doSaveAddress;
window.doDeleteAddress=doDeleteAddress;
window.doSetDefaultAddress=doSetDefaultAddress;
window.showAccSettings=showAccSettings;
window.doSaveProfile=doSaveProfile;
window.doChangePassword=doChangePassword;
window.showAccFav=showAccFav;
window.loadUserData=loadUserData;
window.saveOrderToSupabase=saveOrderToSupabase;

// ── AI ──
var OPENAI_KEY=import.meta.env.VITE_OPENAI_KEY||atob("c2stcHJvai1pVWlPcl9Ma0VxR3pfRlAwcnUwYjZFYWtLZXgxeEpjc0xmU21EaGpySFZwZlUwNUl3Q2ZJazFUTmItWG10LUg3YkFXRHpteGlPN1QzQmxia0ZKLUg4LVF0RlZoTzRQS2R1WGtfUWQ1YTRfU043UXU5eHV0cGFzMmRaYzhrSXpmRHE4UmZuNWJybkpwRzhOUEJNRUtENzc1M0w5SUE=");
var aiHistory=[];

function buildAISys(){
  var lines=PRODS.map(function(p){
    var d=Math.round((1-p.p/p.op)*100);
    return 'ID:'+p.id+' | '+p.e+' '+p.nm_uk+' | '+p.p+' грн (-'+d+'%) | ⭐'+p.r+' ('+p.rv+' відг.)';
  });
  return 'Ти — AI-помічник інтернет-магазину «Добробут» (товари для дому). ВІДПОВІДАЙ ЛИШЕ ПО ТЕМІ МАГАЗИНУ.\n\n'
    +'КАТАЛОГ ТОВАРІВ:\n'+lines.join('\n')+'\n\n'
    +'КАТЕГОРІЇ: Кухня, Ванна, Прибирання, Декор, Спальня, Освітлення, Дитячі, Тварини, Інструменти, Сад\n\n'
    +'ДОСТАВКА: Нова Пошта (відділення/кур\'єр) 1-2 дні 50-80 грн; Укрпошта 2-5 днів 45 грн; БЕЗКОШТОВНО від 1500 грн.\n\n'
    +'ОПЛАТА: Онлайн (LiqPay, Visa/Mastercard, Apple Pay, Google Pay) або накладений платіж.\n\n'
    +'ПОВЕРНЕННЯ: 14 днів, товар у незайманому вигляді. Зв\'язок: підтримка в чаті на сайті.\n\n'
    +'ПРАВИЛА:\n'
    +'1. Відповідай ТІЛЬКИ про магазин, товари, ціни, доставку, оплату, повернення.\n'
    +'2. Якщо питання не про магазин — скажи: "Я консультую лише по магазину Добробут 😊"\n'
    +'3. Рекомендуючи товар — ЗАВЖДИ додавай посилання: [PRODUCT:id:назва], наприклад [PRODUCT:5:Набір ножів]. Клієнт натисне і побачить товар.\n'
    +'4. Відповідай мовою клієнта (uk/ru/en). Будь коротким (2-5 речень) і доброзичливим, використовуй емодзі.';
}

function parseAIReply(txt){
  var s=txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s=s.replace(/\[PRODUCT:(\d+):([^\]]+)\]/g,function(_,id,name){
    return '<button class="ai-prod-link" onclick="openProdPage('+id+')">'+name+' →</button>';
  });
  return s.replace(/\n/g,'<br>');
}

async function callGPT(messages){
  var res=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+OPENAI_KEY},
    body:JSON.stringify({model:"gpt-4o-mini",messages:messages,max_tokens:350,temperature:0.7})
  });
  if(!res.ok){var e=await res.json().catch(function(){return {};});throw new Error((e.error&&e.error.message)||"OpenAI "+res.status);}
  var j=await res.json();
  return j.choices[0].message.content.trim();
}

function initAI(){
  var tr=getCurrentLangPack();
  if(aiInit)return; aiInit=true;
  document.getElementById("cnotif").style.display="none";
  var qh="";
  AI_QUICK.forEach(function(q){qh+="<button class=\"aiq\" onclick=\"sendAIMsg('"+q+"')\">"+q+"</button>";});
  document.getElementById("ai-quick-btns").innerHTML=qh;
  addAIBot(tr.aiWelcome);
}
function addAIBot(txt){
  var c=document.getElementById("ai-msgs");
  var d=document.createElement("div");d.className="ai-msg bot";
  d.innerHTML=parseAIReply(txt);
  c.appendChild(d);c.scrollTop=99999;
}
function sendAI(){var inp=document.getElementById("ai-inp");var t=inp.value.trim();if(!t)return;inp.value="";sendAIMsg(t);}
function sendAIMsg(t){
  if(!aiInit)initAI();
  var c=document.getElementById("ai-msgs");
  var um=document.createElement("div");um.className="ai-msg usr";um.textContent=t;c.appendChild(um);c.scrollTop=99999;
  var typ=document.createElement("div");typ.className="ai-msg typing";typ.id="ai-typ";
  typ.innerHTML="<div class=\"tdot\"></div><div class=\"tdot\"></div><div class=\"tdot\"></div>";
  c.appendChild(typ);c.scrollTop=99999;
  aiHistory.push({role:"user",content:t});
  if(aiHistory.length>20)aiHistory=aiHistory.slice(-20);
  callGPT([{role:"system",content:buildAISys()}].concat(aiHistory)).then(function(reply){
    aiHistory.push({role:"assistant",content:reply});
    _saveAIChat();
    var el=document.getElementById("ai-typ");if(el)el.remove();
    addAIBot(reply);
  }).catch(function(err){
    var el=document.getElementById("ai-typ");if(el)el.remove();
    addAIBot("⚠️ Помилка: "+err.message);
    aiHistory.pop();
  });
}

// ── MODAL ──
// _openModLegacy — стара модалка товару. Тепер не використовується, бо нижче
// openMod() переоприсано як прокладка до openProdPage() (повноцінна сторінка товару).
// Залишена для зворотної сумісності, якщо знадобиться swap-modal.
function _openModLegacy(id){
  var p=PRODS.find(function(x){return x.id===id;});if(!p)return;
  currentProdId=id;qty=1;
  document.getElementById("qty-val").textContent=1;
  var disc=Math.round((1-p.p/p.op)*100);
  document.getElementById("mtitle").textContent=p.nm;
  document.getElementById("mtitle2").textContent=p.nm;
  var mimgEl=document.getElementById("mimg");
  if(p.image_url){mimgEl.innerHTML='<img src="'+p.image_url+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit">';}
  else{mimgEl.textContent=p.e;}
  document.getElementById("mpnew").textContent=p.p+" \u0433\u0440\u043D";
  document.getElementById("mpold").textContent=p.op+" \u0433\u0440\u043D";
  document.getElementById("mdisc").textContent=disc>0?"-"+disc+"%":"";
  document.getElementById("msave").textContent=disc>0?"\u0412\u0438 \u0435\u043A\u043E\u043D\u043E\u043C\u0438\u0442\u0435: "+(p.op-p.p)+" \u0433\u0440\u043D":"";
  document.getElementById("mrevs").textContent="("+p.rv+" \u0432\u0456\u0434\u0433\u0443\u043A\u0456\u0432)";
  var thumbs="";
  var th0=p.image_url?'<img src="'+p.image_url+'" alt="" style="width:100%;height:100%;object-fit:cover">':p.e;
  [th0,"\uD83D\uDCF8","\u2B50"].forEach(function(em,i){thumbs+="<div class=\"mthumb"+(i===0?" active":"")+"\">" + em + "</div>";});
  document.getElementById("mthumb-row").innerHTML=thumbs;
  document.getElementById("modal").classList.add("open");
}
function closeModal(){document.getElementById("modal").classList.remove("open");}
document.getElementById("macbtn").onclick=function(){if(currentProdId){addToCart(currentProdId,qty);closeModal();}};
document.getElementById("mfavbtn").onclick=function(){if(currentProdId)toggleFav(currentProdId);};
function chQty(d){qty=Math.max(1,Math.min(99,qty+d));document.getElementById("qty-val").textContent=qty;}

// ── PRODUCT CARDS ──
window._lastBtnMs=0;
function pCard(p){
  var tr=getCurrentLangPack();
  var disc=(p.op>0&&p.p<p.op)?Math.round((1-p.p/p.op)*100):0;
  var bc=p.b==="new"?"nb":p.b==="hot"?"hb":"";
  var bl=p.b==="new"?tr.badgeNew:p.b==="hot"?tr.badgeHot:tr.badgeDiscount;
  var isFav=favs.some(function(x){return String(x.id)===String(p.id);});
  var pid="'"+p.id+"'";
  var imgHtml=p.image_url
    ?'<img src="'+p.image_url+'" alt="" style="width:100%;height:100%;object-fit:contain;padding:6px;box-sizing:border-box" loading="lazy" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">'
     +'<span class="pimg-fb" style="display:none">'+p.e+'</span>'
    :'<span>'+p.e+'</span>';
  var badgeTxt=disc>0?bl+" -"+disc+"%":bl;
  var h="<div class=\"pcard\">";
  h+="<div class=\"pimg\" onclick=\"openMod("+pid+")\" style=\"cursor:pointer\">";
  h+="<div class=\"pimg-inner\">"+imgHtml+"</div>";
  h+="<span class=\"pbadge "+bc+"\">"+badgeTxt+"</span>";
  h+="<button class=\"pfav"+(isFav?" on":"")+"\" data-id=\""+p.id+"\" onclick=\"window._lastBtnMs=Date.now();event.stopPropagation();toggleFav("+pid+")\">";
  h+="<svg viewBox=\"0 0 24 24\"><path d=\"M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z\"/></svg></button>";
  h+="</div>";
  h+="<div class=\"pbody\">";
  h+="<div class=\"pname\" onclick=\"openMod("+pid+")\" style=\"cursor:pointer\">"+p.nm+"</div>";
  h+="<div class=\"prat\"><span class=\"pstars\">"+"★".repeat(Math.floor(p.r))+"☆".repeat(5-Math.floor(p.r))+"</span><span class=\"prc\">("+p.rv+")</span></div>";
  h+="<div class=\"pprices\"><span class=\"ppnew\">"+p.p+" "+tr.currency+"</span>"+(disc>0?"<span class=\"ppold\">"+p.op+" "+tr.currency+"</span><span class=\"pdisc\">-"+disc+"%</span>":"")+"</div>";
  h+="<button class=\"pqa\" onclick=\"window._lastBtnMs=Date.now();addToCart("+pid+")\">"+tr.addToCart+"</button>";
  h+="</div></div>";return h;
}

// ── ALL PRODUCTS PAGE ──
function renderAllProducts(){FLT_PMIN=0;FLT_PMAX=0;PRODS.forEach(function(p){if(p.p>FLT_PMAX)FLT_PMAX=p.p;});FLT_PMAX=Math.ceil(FLT_PMAX/100)*100;fltMinP=FLT_PMIN;fltMaxP=FLT_PMAX;fltCat="all";fltSort="popular";var sel=document.getElementById("flt-sort-sel");if(sel)sel.value="popular";renderFilterPanel();applyFilters();}

function setFilter(cat){
  var tr=getCurrentLangPack();
  activeFilter=cat;
  document.querySelectorAll(".filter-btn").forEach(function(b){b.classList.remove("active");});
  var fb=document.getElementById("fb-"+cat);if(fb)fb.classList.add("active");
  var list=cat==="all"?PRODS:PRODS.filter(function(p){return p.cat===cat;});
  var grid=document.getElementById("all-products-grid");
  grid.innerHTML=list.length?list.map(pCard).join(""):"<div style=\"grid-column:1/-1;text-align:center;padding:60px;color:var(--gt)\"><div style=\"font-size:48px;margin-bottom:12px\">\uD83D\uDD0D</div><p style=\"font-size:16px;font-weight:600\">"+tr.noProducts+"</p></div>";
}

// ── ALL REVIEWS ──
function escHtml(v){
  return String(v==null?"":v)
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;");
}
function rCard(r){
  var h="<div class=\"rcard\"><div class=\"rcard-top\"><div class=\"rav\">"+escHtml(r.em)+"</div><div class=\"rinfo\"><strong>"+escHtml(r.nm)+"</strong><span>"+escHtml(r.date)+"</span></div></div>";
  h+="<div class=\"rstars\">"+"★".repeat(r.stars)+"☆".repeat(5-r.stars)+"</div><div class=\"rtxt\">"+escHtml(r.txt)+"</div>";
  if(r.prod)h+="<div class=\"rtag\">"+escHtml(r.prod)+"</div>";
  return h+"</div>";
}
function renderAllReviews(){document.getElementById("all-reviews-grid").innerHTML=ALL_REVIEWS.map(rCard).join("");}

// ── SEARCH ──
function startPh(){
  if(phTimer)clearInterval(phTimer);
  phIdx=0;phCharIdx=0;phDeleting=false;phPause=0;
  document.getElementById("srph-dy").textContent="";
  phTimer=setInterval(function(){
    if(srFocus)return;
    var word=HINTS[phIdx%HINTS.length];
    if(phPause>0){phPause--;return;}
    if(!phDeleting){phCharIdx++;document.getElementById("srph-dy").textContent=word.slice(0,phCharIdx);if(phCharIdx>=word.length){phDeleting=true;phPause=30;}}
    else{phCharIdx--;document.getElementById("srph-dy").textContent=word.slice(0,phCharIdx);if(phCharIdx<=0){phDeleting=false;phIdx++;phPause=8;}}
  },58);
}
function onSrInput(){
  var tr=getCurrentLangPack();
  var v=document.getElementById("srinput").value.trim();
  document.getElementById("srph").style.display=v?"none":"flex";
  var drop=document.getElementById("srch-drop");
  if(v.length>0){
    var vl=v.toLowerCase();
    var scored=PRODS.map(function(p){
      var nm=(p.nm||"").toLowerCase();
      var nmUk=(p.nm_uk||"").toLowerCase();
      var desc=(p.description||"").toLowerCase();
      var score=0;
      if(nm===vl||nmUk===vl)score=100;
      else if(nm.startsWith(vl)||nmUk.startsWith(vl))score=80;
      else if(nm.indexOf(vl)>=0||nmUk.indexOf(vl)>=0)score=60;
      else if(desc.indexOf(vl)>=0)score=30;
      else{vl.split(/\s+/).forEach(function(tok){if(tok.length>1){if(nm.indexOf(tok)>=0||nmUk.indexOf(tok)>=0)score+=20;else if(desc.indexOf(tok)>=0)score+=8;}});}
      return{p:p,score:score};
    }).filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;});
    if(scored.length>0){
      var dh="<div class=\"sd-lbl\">"+tr.searchDropLabel+"</div>";
      scored.slice(0,6).forEach(function(x){
        var p=x.p;
        dh+="<div class=\"sd-item\" onclick=\"document.getElementById('srch-drop').classList.remove('open');openMod('"+p.id+"')\"><div class=\"sd-em\">"+p.e+"</div>"
          +"<div><div class=\"sd-nm\">"+p.nm+"</div><div style=\"display:flex;align-items:center;gap:5px\"><span class=\"sd-pr\">"+p.p+" "+tr.currency+"</span><span class=\"sd-old\">"+p.op+" "+tr.currency+"</span></div></div></div>";
      });
      drop.innerHTML=dh;drop.classList.add("open");
    } else drop.classList.remove("open");
  } else drop.classList.remove("open");
}
document.getElementById("srinput").addEventListener("focus",function(){srFocus=true;document.getElementById("srph").style.display="none";});
document.getElementById("srinput").addEventListener("blur",function(){
  srFocus=false;
  setTimeout(function(){document.getElementById("srch-drop").classList.remove("open");},200);
  if(!document.getElementById("srinput").value)document.getElementById("srph").style.display="flex";
});
function doSearch(){
  var q=document.getElementById("srinput").value.trim();
  document.getElementById("srch-drop").classList.remove("open");
  fltSearch=q;
  showPage("products");
}

// ── TOAST ──
function showToast(msg){
  var t=document.getElementById("toast");
  document.getElementById("toast-msg").textContent=msg;
  t.classList.add("show");clearTimeout(t._t);
  t._t=setTimeout(function(){t.classList.remove("show");},2800);
}


function setText(sel,text){var el=document.querySelector(sel);if(el)el.textContent=text;}
function setHtml(sel,html){var el=document.querySelector(sel);if(el)el.innerHTML=html;}
function setSelectOptionText(sel,idx,text){var el=document.querySelector(sel);if(el&&el.options&&el.options[idx])el.options[idx].textContent=text;}
function getStoreTexts(){var tr=getCurrentLangPack();return tr.store||(I18N.uk&&I18N.uk.store)||{};}
function renderStoreLegend(){
  var st=getStoreTexts();
  var el=document.getElementById("loc-leg");
  if(!el)return;
  var cnt={Dnipro:0,Kamianske:0,Zaporizhzhia:0};
  if(typeof LS!=="undefined"&&LS&&LS.forEach)LS.forEach(function(s){if(cnt[s.c]!==undefined)cnt[s.c]++;});
  el.innerHTML=""
    +'<div class="loc-li"><div class="loc-ld" style="background:#1FAF5A"></div>'+(st.cityDnipro||"Dnipro")+' ('+(cnt.Dnipro||0)+")</div>"
    +'<div class="loc-li"><div class="loc-ld" style="background:#2563eb"></div>'+(st.cityKamianske||"Kamianske")+' ('+(cnt.Kamianske||0)+")</div>"
    +'<div class="loc-li"><div class="loc-ld" style="background:#f59e0b"></div>'+(st.cityZaporizhzhia||"Zaporizhzhia")+' ('+(cnt.Zaporizhzhia||0)+")</div>"
    +'<div class="loc-li"><div class="loc-ld" style="background:#ff8c00"></div>'+(st.nearestBadge||"Nearest")+"</div>";
}
function applyStaticLangText(tr){
  var promo=document.querySelectorAll(".promo-bar span");
  if(promo[0])promo[0].textContent=tr.promo1;
  if(promo[1])promo[1].textContent=tr.promo2;
  if(promo[2])promo[2].textContent=tr.promo3;
  setText(".logo-sb",tr.logoSub);
  setText(".srch-btn",tr.searchBtn);
  setText("#ai-hbtn-label",tr.aiLabel);
  var aiInput=document.getElementById("ai-inp");if(aiInput)aiInput.placeholder=tr.aiPlaceholder;

  setText("#page-home .hbadge",tr.heroBadge);
  var homeTtls=document.querySelectorAll("#page-home .sec-hdr .sec-ttl");
  if(homeTtls[0])homeTtls[0].innerHTML=tr.homePopularTitleHtml;
  if(homeTtls[1])homeTtls[1].innerHTML=tr.homeHitsTitleHtml;
  if(homeTtls[2])homeTtls[2].innerHTML=tr.homeNewTitleHtml;
  if(homeTtls[3])homeTtls[3].innerHTML=tr.homeReviewsTitleHtml;
  var homeBtns=document.querySelectorAll("#page-home .sec-hdr .see-all");
  if(homeBtns[0])homeBtns[0].textContent=tr.homePopularBtn;
  if(homeBtns[1])homeBtns[1].textContent=tr.homeHitsBtn;
  if(homeBtns[2])homeBtns[2].textContent=tr.homeNewBtn;
  if(homeBtns[3])homeBtns[3].textContent=tr.homeReviewsBtn;
  setText("#page-home .db-left h2",tr.homeDealsTitle);
  setText("#page-home .db-left p",tr.homeDealsSubtitle);
  setText("#page-home .db-btn",tr.homeDealsBtn);
  var tLbls=document.querySelectorAll("#page-home .db-left .tlbl");
  if(tLbls[0])tLbls[0].textContent=tr.timerHours;
  if(tLbls[1])tLbls[1].textContent=tr.timerMinutes;
  if(tLbls[2])tLbls[2].textContent=tr.timerSeconds;

  setHtml("#page-products .sec-hdr .sec-ttl",tr.productsTitleHtml);
  setText("#page-products .sec-hdr .see-all",tr.backBtn);
  var elCat=document.getElementById("flt-lbl-cat");
  if(elCat)elCat.textContent=tr.filterCategoryLabel;
  var elPrice=document.getElementById("flt-lbl-price");
  if(elPrice)elPrice.textContent=tr.filterPriceLabel;
  var elStock=document.getElementById("flt-lbl-stock");
  if(elStock)elStock.textContent=tr.currentLang==="en"?"In stock only":tr.currentLang==="ru"?"Только в наличии":"Тільки в наявності";
  setSelectOptionText("#flt-sort-sel",0,tr.sortPopular);
  setSelectOptionText("#flt-sort-sel",1,tr.sortPriceAsc);
  setSelectOptionText("#flt-sort-sel",2,tr.sortPriceDesc);
  setSelectOptionText("#flt-sort-sel",3,tr.sortDiscount);
  setSelectOptionText("#flt-sort-sel",4,tr.sortRating);
  setSelectOptionText("#flt-sort-sel",5,tr.sortNew);

  setHtml("#page-reviews .sec-hdr .sec-ttl",tr.reviewsTitleHtml);
  setText("#page-reviews .sec-hdr .see-all",tr.backBtn);

}
function getSavedLang(){
  try{return normalizeLang(localStorage.getItem("dobrobut_lang")||DEFAULT_LANG);}
  catch(_){return DEFAULT_LANG;}
}
function setLang(l,silent){
  currentLang=normalizeLang(l);
  document.documentElement.lang=currentLang;
  updateLocalizedCollections();
  var tr=getCurrentLangPack();

  document.querySelectorAll("button.lb").forEach(function(b){
    var on=b.getAttribute("data-lang")===currentLang;
    b.classList.toggle("active",on);
  });

  setText("#lbl-cab",tr.cab);
  setText("#lbl-fav",tr.fav);
  setText("#lbl-cart",tr.cart);
  var sp=document.querySelector(".srch-ph .st");if(sp)sp.textContent=tr.srch;

  renderHome();
  if(typeof fltMinP==="number"&&typeof fltMaxP==="number"){
    renderFilterPanel();
    applyFilters();
  }
  if(document.getElementById("all-reviews-grid"))renderAllReviews();
  applyStaticLangText(tr);
  startPh();
  var _accPanel=document.getElementById("acc-panel");
  if(_accPanel&&_accPanel.classList.contains("open"))renderAcc();

  if(aiInit){
    var qh="";
    AI_QUICK.forEach(function(q){qh+="<button class=\"aiq\" onclick=\"sendAIMsg('"+q+"')\">"+q+"</button>";});
    document.getElementById("ai-quick-btns").innerHTML=qh;
  }
  if(document.getElementById("pd-review-write"))renderPdReviewWriter();
  var _pdPage=document.getElementById("page-product");
  if(_pdPage&&_pdPage.classList.contains("active")&&pdCurrentId){openProdPage(pdCurrentId);}

  try{localStorage.setItem("dobrobut_lang",currentLang);}catch(_){}
  if(!silent)showToast(tr.toast);
}

// ── HOME RENDER ──
function renderHome(){
  var tr=getCurrentLangPack();

  // \u2500\u2500 \u041D\u0430\u0432\u0456\u0433\u0430\u0446\u0456\u044F \u043F\u043E \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F\u0445 (\u0432\u0435\u0440\u0445\u043D\u0456\u0439 \u0440\u044F\u0434\u043E\u043A) \u2500\u2500
  var catnav=document.getElementById("catnav-in");
  if(catnav){
    var navH="<a class=\"cni active\" onclick=\"showPage('home')\">"+tr.nav[0]+"</a>";
    if(_sbCats&&_sbCats.length){
      _sbCats.forEach(function(c){
        navH+="<a class=\"cni\" onclick=\"setFilter('"+c.slug+"');showPage('products')\">"+c.name+"</a>";
      });
    }
    catnav.innerHTML=navH;
  }

  // \u2500\u2500 \u0413\u0435\u0440\u043E\u0439: \u043F\u043E\u043F\u0443\u043B\u044F\u0440\u043D\u0456 \u0442\u043E\u0432\u0430\u0440\u0438 \u2500\u2500
  var hpa=document.getElementById("hero-prods-all");
  if(hpa){
    hpa.innerHTML=PRODS.slice(0,6).map(function(p){
      var disc=p.op>p.p?Math.round((1-p.p/p.op)*100):0;
      return "<div class=\"hpc\" onclick=\"openMod('"+p.id+"')\"><div class=\"hpc-em\">"+p.e+"</div>"
        +"<div><div class=\"hpc-nm\">"+p.nm+"</div><div class=\"hpc-row\"><div class=\"hpc-pr\">"+p.p+" \u0433\u0440\u043D</div><div class=\"hpc-op\">"+p.op+" \u0433\u0440\u043D</div>"+(disc>0?"<div class=\"hpc-bd\">-"+disc+"%</div>":"")+"</div></div></div>";
    }).join("");
  }

  // \u2500\u2500 \u0421\u0456\u0442\u043A\u0430 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0439 \u2500\u2500
  var catH="";
  if(CATS.length){
    CATS.forEach(function(c){
      catH+="<div class=\"cc\" onclick=\"setFilter('"+c.cat+"');showPage('products')\"><div class=\"cc-em\">"+c.e+"</div><div class=\"cc-nm\">"+c.n+"</div>"+(c.c?"<div class=\"cc-ct\">"+c.c+" "+tr.productsWord+"</div>":"")+"</div>";
    });
  }else{
    catH="<div style=\"grid-column:1/-1;text-align:center;padding:20px;color:var(--gt)\">\u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u0457 \u0432 \u0430\u0434\u043C\u0456\u043D-\u043F\u0430\u043D\u0435\u043B\u0456</div>";
  }
  document.getElementById("cat-grid").innerHTML=catH;

  // \u2500\u2500 \u0413\u0440\u0456\u0434 \u0442\u043E\u0432\u0430\u0440\u0456\u0432 \u2500\u2500
  var pg=document.getElementById("pgrid");
  if(pg)pg.innerHTML=PRODS.length?PRODS.slice(0,8).map(pCard).join(""):"<div style=\"grid-column:1/-1;text-align:center;padding:40px;color:var(--gt)\">\u0414\u043E\u0434\u0430\u0439\u0442\u0435 \u0442\u043E\u0432\u0430\u0440\u0438 \u0432 \u0430\u0434\u043C\u0456\u043D-\u043F\u0430\u043D\u0435\u043B\u0456</div>";

  var npg=document.getElementById("npgrid");if(npg)npg.innerHTML=PRODS.slice(8).map(pCard).join("");
  document.getElementById("reviews-home").innerHTML=ALL_REVIEWS.slice(0,3).map(rCard).join("");
}

// ============================================================
// STORE LOCATOR
// ============================================================

// ============================================================
// СТОРІНКА МАГАЗИНІВ / Google Maps
// ============================================================

var lMap=null,lMk={},lIW=null,lAid=null,lNid=null,lUp=null,lCF="all",lInit=false;
var GOOGLE_MAPS_API_KEY=((window.DOBROBUT_GOOGLE_MAPS_API_KEY||"")+"").trim()||(function(){try{return (localStorage.getItem("dobrobut_google_maps_key")||"").trim();}catch(_){return "";}}())||"AIzaSyD-9tSrke72PouQMnMX-a7eZSW0jkFMBWY";
var lApiReady=false,lApiLoading=false,lApiFailed=false,lApiCallbacks=[];

function flushMapCallbacks(){
  var cbs=lApiCallbacks.slice();
  lApiCallbacks=[];
  cbs.forEach(function(cb){try{cb();}catch(_){}});
}
function showStoreMapFallback(){
  var mapEl=document.getElementById("loc-map");
  if(!mapEl)return;
  mapEl.dataset.fallback="1";
  mapEl.innerHTML='<iframe title="Store map" src="https://www.google.com/maps?output=embed&z=7&q=48.4647,35.0462" style="width:100%;height:100%;border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
}
function showStoreFallbackByCoords(lat,lng){
  var mapEl=document.getElementById("loc-map");
  if(!mapEl)return;
  mapEl.dataset.fallback="1";
  mapEl.innerHTML='<iframe title="Store map" src="https://www.google.com/maps?output=embed&z=15&q='+encodeURIComponent(lat+","+lng)+'" style="width:100%;height:100%;border:0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>';
}
function handleMapsApiFailure(){
  lApiLoading=false;
  lApiFailed=true;
  showStoreMapFallback();
  flushMapCallbacks();
}
window.__dobrobutMapsReady=function(){
  lApiReady=true;
  lApiLoading=false;
  flushMapCallbacks();
};
window.gm_authFailure=function(){
  handleMapsApiFailure();
  showToast("\u26A0\uFE0F Google Maps API \u043D\u0435 \u0430\u0432\u0442\u043e\u0440\u0438\u0437\u043e\u0432\u0430\u043d\u043e. \u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E fallback-\u043A\u0430\u0440\u0442\u0443.");
};
function ensureMapsApi(cb){
  if(window.google&&google.maps){lApiReady=true;if(cb)cb();return;}
  if(cb)lApiCallbacks.push(cb);
  if(lApiLoading||lApiFailed)return;
  if(!GOOGLE_MAPS_API_KEY){handleMapsApiFailure();return;}
  lApiLoading=true;
  var s=document.createElement("script");
  s.async=true;
  s.defer=true;
  s.src="https://maps.googleapis.com/maps/api/js?key="+GOOGLE_MAPS_API_KEY+"&callback=__dobrobutMapsReady";
  s.onerror=handleMapsApiFailure;
  document.head.appendChild(s);
  setTimeout(function(){
    if(lApiReady||lApiFailed)return;
    handleMapsApiFailure();
  },7000);
}
function openStoresPage(){
  lBldF();
  lFlt();
  renderStoreLegend();
  if(!lInit)initLocMap();
}

function initLocMap(){
  if(lApiFailed){
    lInit=true;
    lBldF();
    lRndL(LS);
    lFlt();
    showStoreMapFallback();
    return;
  }
  if(!(window.google&&google.maps)){ensureMapsApi(initLocMap);return;}
  if(lInit)return; lInit=true;
  var mapEl=document.getElementById("loc-map");
  if(mapEl)mapEl.innerHTML="";
  lMap=new google.maps.Map(document.getElementById("loc-map"),{
    center:{lat:48.25,lng:35.0},zoom:7,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,
    zoomControlOptions:{position:google.maps.ControlPosition.RIGHT_CENTER},
    styles:[{featureType:"poi",elementType:"labels",stylers:[{visibility:"off"}]},{featureType:"transit",elementType:"labels.icon",stylers:[{visibility:"off"}]},{featureType:"water",stylers:[{color:"#c9e8f5"}]},{featureType:"landscape",stylers:[{color:"#f4f5f3"}]},{featureType:"road",elementType:"geometry",stylers:[{color:"#ffffff"}]},{featureType:"road.highway",elementType:"geometry",stylers:[{color:"#e8e8e8"}]},{featureType:"administrative.locality",elementType:"labels.text.fill",stylers:[{color:"#1a1d1f"}]}]
  });
  lIW=new google.maps.InfoWindow();
  lMap.addListener("click",function(){lIW.close();lClA();});
  LS.forEach(lAddM);
  lBldF();lFlt();renderStoreLegend();
}
function lIco(s,act){
  var isN=s.id===lNid,c=isN?LC.N:(LC[s.c]||LC.Dnipro);
  var sz=act?40:32,r=sz/2,fs=act?12:10,sw=act?3:2;
  var svg="<svg xmlns='http://www.w3.org/2000/svg' width='"+sz+"' height='"+(sz+8)+"' viewBox='0 0 "+sz+" "+(sz+8)+"'>"
    +"<ellipse cx='"+r+"' cy='"+(sz+5)+"' rx='"+(r*0.6)+"' ry='3' fill='rgba(0,0,0,0.15)'/>"
    +"<path d='M"+r+" "+(sz+4)+" L"+(r-6)+" "+(sz-4)+" Q"+r+" "+sz+" "+(r+6)+" "+(sz-4)+" Z' fill='"+c.f+"'/>"
    +"<circle cx='"+r+"' cy='"+r+"' r='"+(r-1)+"' fill='"+c.f+"' stroke='"+c.b+"' stroke-width='"+sw+"'/>"
    +"<text x='"+r+"' y='"+(r+fs*0.38)+"' text-anchor='middle' fill='white' font-size='"+fs+"' font-weight='800' font-family='Manrope,Arial,sans-serif'>"+s.id+"</text>"
    +"</svg>";
  return{url:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg),scaledSize:new google.maps.Size(sz,sz+8),anchor:new google.maps.Point(r,sz+8)};
}
function lAddM(s){
  var m=new google.maps.Marker({position:{lat:s.lt,lng:s.ln},map:lMap,title:s.a,icon:lIco(s,false),zIndex:s.id});
  m.addListener("click",function(){lAct(s.id,false);});
  lMk[s.id]=m;
}
function lClA(){
  if(lAid){var ps=LS.find(function(x){return x.id===lAid;});if(ps&&lMk[lAid])lMk[lAid].setIcon(lIco(ps,false));lAid=null;}
  document.querySelectorAll(".lsc").forEach(function(c){c.classList.remove("on");});
}
function lAct(id,fl){
  var st=getStoreTexts();
  var s=LS.find(function(x){return x.id===id;});if(!s)return;
  if(lAid&&lAid!==id){var ps=LS.find(function(x){return x.id===lAid;});if(ps&&lMk[lAid]){lMk[lAid].setIcon(lIco(ps,false));lMk[lAid].setZIndex(ps.id);}}
  lAid=id;
  if(lMk[id]){lMk[id].setIcon(lIco(s,true));lMk[id].setZIndex(9999);}
  var mu=lGMU(s),ru=lRU(s);
  if(lIW&&lMap&&lMk[id]){
    lIW.setContent("<div style='font-family:Manrope,sans-serif;padding:14px 16px;min-width:210px'>"
      +"<div style='font-size:10px;font-weight:700;color:#1FAF5A;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px'>"+s.u+"</div>"
      +"<div style='font-size:14px;font-weight:700;color:#1a1d1f;margin-bottom:12px;line-height:1.35'>"+s.a+"</div>"
      +"<div style='display:flex;gap:8px'>"
      +"<a href='"+ru+"' target='_blank' style='flex:1;background:#1FAF5A;color:white;border-radius:8px;padding:8px 10px;font-size:11px;font-weight:700;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px'>&#9992; "+(st.route||"Route")+"</a>"
      +"<a href='"+mu+"' target='_blank' style='flex:1;background:#f4f5f3;color:#1a1d1f;border:1.5px solid #e8eae8;border-radius:8px;padding:8px 10px;font-size:11px;font-weight:700;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:5px'>&#128205; "+(st.maps||"Google Maps")+"</a>"
      +"</div></div>");
    lIW.open(lMap,lMk[id]);
    lMap.panTo({lat:s.lt,lng:s.ln});
    if(lMap.getZoom()<13)lMap.setZoom(14);
  }else{
    showStoreFallbackByCoords(s.lt,s.ln);
  }
  document.querySelectorAll(".lsc").forEach(function(c){c.classList.remove("on");});
  var card=document.getElementById("lsc"+id);
  if(card){card.classList.add("on");if(!fl)card.scrollIntoView({behavior:"smooth",block:"nearest"});}
}
function lGMU(s){return "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(s.a+", "+s.u+", \u0423\u043A\u0440\u0430\u0457\u043D\u0430");}
function lRU(s){var d=encodeURIComponent(s.a+", "+s.u+", \u0423\u043A\u0440\u0430\u0457\u043D\u0430");return lUp?"https://www.google.com/maps/dir/"+lUp.lat+","+lUp.lng+"/"+d:"https://www.google.com/maps/dir//"+d;}
function lFlt(){
  var st=getStoreTexts();
  var q=document.getElementById("loc-search").value.toLowerCase().trim();
  var list=LS.filter(function(s){return(lCF==="all"||s.c===lCF)&&(!q||s.a.toLowerCase().indexOf(q)>=0||s.u.toLowerCase().indexOf(q)>=0);});
  var ids=list.map(function(s){return s.id;});
  LS.forEach(function(s){if(lMk[s.id])lMk[s.id].setVisible(ids.indexOf(s.id)>=0);});
  lRndL(list);
  document.getElementById("loc-cnt").textContent=list.length+" "+(st.foundWord||"found");
  if(lMap&&window.google&&google.maps){
    if(list.length&&(lCF!=="all"||q)){var b=new google.maps.LatLngBounds();list.forEach(function(s){b.extend({lat:s.lt,lng:s.ln});});lMap.fitBounds(b,{top:40,right:40,bottom:40,left:40});}
    else if(!q){lMap.setCenter({lat:48.25,lng:35.0});lMap.setZoom(7);}
  }
}
function lSetC(city){lCF=city;lBldF();lFlt();}
function lBldF(){
  var st=getStoreTexts();
  var defs=[{k:"all",l:st.allCities||"All"},{k:"Dnipro",l:st.cityDnipro||"Dnipro"},{k:"Kamianske",l:st.cityKamianske||"Kamianske"},{k:"Zaporizhzhia",l:st.cityZaporizhzhia||"Zaporizhzhia"}];
  var cnt={Dnipro:0,Kamianske:0,Zaporizhzhia:0};
  LS.forEach(function(s){if(cnt[s.c]!==undefined)cnt[s.c]++;});
  document.getElementById("loc-fbrow").innerHTML=defs.map(function(d){
    var n=d.k==="all"?LS.length:(cnt[d.k]||0);
    return "<button class=\"loc-fb"+(lCF===d.k?" on":"")+"\" onclick=\"lSetC('"+d.k+"')\">"+d.l+" ("+n+")</button>";
  }).join("");
}
function lRndL(list){
  var st=getStoreTexts();
  var el=document.getElementById("loc-list");
  if(!list.length){el.innerHTML="<div class=\"loc-empty\"><p>"+(st.nothingFound||"Nothing found")+"</p><span>"+(st.changeFilter||"Change the filter")+"</span></div>";return;}
  var h="";
  list.forEach(function(s){
    var isN=s.id===lNid,d=lUp?lHav(lUp.lat,lUp.lng,s.lt,s.ln):null;
    var c=LC[s.c]||LC.Dnipro;
    h+="<div class=\"lsc"+(isN?" near":"")+(lAid===s.id?" on":"")+"\" id=\"lsc"+s.id+"\" onclick=\"lAct("+s.id+",true)\">";
    if(isN)h+="<div class=\"lsc-nt\">"+(st.nearestBadge||"Nearest")+"</div>";
    h+="<div class=\"lsc-top\"><div class=\"lsc-num\" style=\"background:"+c.f+"\">"+s.id+"</div><div style=\"flex:1;min-width:0\">";
    h+="<div class=\"lsc-city\" style=\"color:"+c.f+"\">"+s.u+"</div><div class=\"lsc-addr\">"+s.a+"</div>";
    if(isN||d!==null){h+="<div class=\"lsc-meta\">";if(isN)h+="<span class=\"lsc-bdg nb\">"+(st.nearestBadge||"Nearest")+"</span>";if(d!==null)h+="<span class=\"lsc-dist\">"+d.toFixed(1)+" \u043A\u043C</span>";h+="</div>";}
    h+="</div></div>";
    h+="<div class=\"lsc-acts\">";
    h+="<a class=\"lsc-btn lsc-r\" href=\""+lRU(s)+"\" target=\"_blank\" onclick=\"event.stopPropagation()\"><svg viewBox=\"0 0 24 24\"><path d=\"M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z\"/></svg>"+(st.route||"Route")+"</a>";
    h+="<a class=\"lsc-btn lsc-m\" href=\""+lGMU(s)+"\" target=\"_blank\" onclick=\"event.stopPropagation()\"><svg viewBox=\"0 0 24 24\"><path d=\"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z\"/><circle cx=\"12\" cy=\"10\" r=\"3\"/></svg>"+(st.maps||"Google Maps")+"</a>";
    h+="</div></div>";
  });
  el.innerHTML=h;
}
function lHav(a,b,c,d){var R=6371,dL=(c-a)*Math.PI/180,dN=(d-b)*Math.PI/180,x=Math.sin(dL/2)*Math.sin(dL/2)+Math.cos(a*Math.PI/180)*Math.cos(c*Math.PI/180)*Math.sin(dN/2)*Math.sin(dN/2);return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function lNearest(){
  var st=getStoreTexts();
  if(!navigator.geolocation){showToast(st.geolocationUnavailable||"Geolocation unavailable");return;}
  document.getElementById("loc-nb-sub").textContent=st.locating||"Locating...";
  navigator.geolocation.getCurrentPosition(function(pos){
    lUp={lat:pos.coords.latitude,lng:pos.coords.longitude};
    var best=null,bd=Infinity;
    LS.forEach(function(s){var d=lHav(lUp.lat,lUp.lng,s.lt,s.ln);if(d<bd){bd=d;best=s;}});
    if(!best)return;
    lNid=best.id;
    LS.forEach(function(s){if(lMk[s.id])lMk[s.id].setIcon(lIco(s,s.id===lAid));});
    if(lMap&&window.google&&google.maps){
      new google.maps.Marker({position:lUp,map:lMap,title:st.youAreHere||"You are here",icon:{url:"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'><circle cx='11' cy='11' r='9' fill='#2563eb' stroke='white' stroke-width='3'/><circle cx='11' cy='11' r='3' fill='white'/></svg>"),scaledSize:new google.maps.Size(22,22),anchor:new google.maps.Point(11,11)}});
    }
    document.getElementById("loc-nb-sub").textContent=best.a+" ("+bd.toFixed(1)+" \u043A\u043C)";
    lFlt();lAct(best.id,false);
    showToast((st.nearestToastPrefix||"Nearest")+": "+best.a+" \u2014 "+bd.toFixed(1)+" \u043A\u043C");
  },function(){document.getElementById("loc-nb-sub").textContent=st.failed||"Failed";showToast(st.allowGeolocation||"Allow geolocation access");});
}
function lReset(){if(lIW)lIW.close();lClA();if(lMap){lMap.setCenter({lat:48.25,lng:35.0});lMap.setZoom(7);}}


// ============================================================
// ЕКСПОРТ ФУНКЦІЙ В window (потрібно для inline onclick)
// ============================================================
window.showPage = showPage;
window.openPanel = openPanel;
window.closeAllPanels = closeAllPanels;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.changeCartQty = changeCartQty;
window.renderCart = renderCart;
window.startCheckout = startCheckout;
window.coNext1 = coNext1;
window.coNext2 = coNext2;
window.coFinish = coFinish;
window.renderCheckout = renderCheckout;
window.coSetPay  = function(v){ coPay=v; renderCheckout(); };
window.coStepGo     = function(n){ coStep=n; renderCheckout(); };
window.coSetDelivery = function(v){ coDelivery=v; renderCheckout(); };
window.toggleFav = toggleFav;
window.renderFav = renderFav;
window.renderAcc = renderAcc;
window.doLogin = doLogin;
window.initAI = initAI;
window.sendAI = sendAI;
window.openMod = openMod;
window.closeModal = closeModal;
window.chQty = chQty;
window.setFilter = setFilter;
window.onSrInput = onSrInput;
window.doSearch = doSearch;
window.showToast = showToast;
window.setLang = setLang;
window.renderHome = renderHome;
window.openProdPage = openProdPage;
window.pdThumb = pdThumb;
window.pdChgQty = pdChgQty;
window.pdTab = pdTab;
window.togglePdAI = togglePdAI;
window.pdSend = pdSend;
window.pdAiSend = pdAiSend;
window.pdAsk = pdAsk;
window.fltSetCat = fltSetCat;
window.fltSetSort = fltSetSort;
window.applyFilters = applyFilters;
window.fltReset = fltReset;
window.onPriceInp = onPriceInp;
window.startDrag = startDrag;
window.renderAllProducts = renderAllProducts;
window.renderAllReviews = renderAllReviews;
window.sendAIMsg = sendAIMsg;
window.getLoginState = function(){ return loggedIn; };
window.doLogout = doLogout;
window.doRegister = doRegister;
window.showLoginForm = showLoginForm;
window.showRegisterForm = showRegisterForm;
window.showOtpForm = showOtpForm;
window.otpNext = otpNext;
window.otpKey = otpKey;
window.otpPaste = otpPaste;
window.doVerifyOtp = doVerifyOtp;
window.doResendOtp = doResendOtp;
window.showPhoneForm = showPhoneForm;
window.doSendPhoneSms = doSendPhoneSms;
window.addAIBot = addAIBot;
window.submitPdReview = submitPdReview;

// ── MOBILE NAV ──
window.mobNavActive = function(id) {
  document.querySelectorAll('.mob-nav-item').forEach(function(el){ el.classList.remove('active'); });
  var el = document.getElementById(id); if(el) el.classList.add('active');
};

// ── SUPPORT CHAT ──
var _supMsgs = [];

function _chatSupKey(){ return currentUserEmail ? 'chat_sup_'+currentUserEmail : null; }
function _chatAIKey(){  return currentUserEmail ? 'chat_ai_'+currentUserEmail  : null; }

function _saveSupChat(){
  var k=_chatSupKey(); if(!k) return;
  try{ localStorage.setItem(k, JSON.stringify(_supMsgs)); }catch(e){}
}
function _saveAIChat(){
  var k=_chatAIKey(); if(!k) return;
  try{ localStorage.setItem(k, JSON.stringify(aiHistory)); }catch(e){}
}

function _loadSupChat(){
  var k=_chatSupKey(); if(!k) return;
  try{
    var saved=JSON.parse(localStorage.getItem(k));
    if(Array.isArray(saved)&&saved.length){ _supMsgs=saved; renderSupMessages(); }
  }catch(e){}
}
function _loadAIChat(){
  var k=_chatAIKey(); if(!k) return;
  try{
    var saved=JSON.parse(localStorage.getItem(k));
    if(!Array.isArray(saved)||!saved.length) return;
    aiHistory=saved;
    aiInit=true;
    document.getElementById("cnotif").style.display="none";
    var qh=""; AI_QUICK.forEach(function(q){qh+="<button class=\"aiq\" onclick=\"sendAIMsg('"+q+"')\">"+q+"</button>";});
    document.getElementById("ai-quick-btns").innerHTML=qh;
    var c=document.getElementById("ai-msgs"); if(!c) return;
    c.innerHTML="";
    addAIBot(getCurrentLangPack().aiWelcome);
    saved.forEach(function(msg){
      var d=document.createElement("div");
      d.className="ai-msg "+(msg.role==="user"?"usr":"bot");
      if(msg.role==="user") d.textContent=msg.content;
      else d.innerHTML=parseAIReply(msg.content);
      c.appendChild(d);
    });
    c.scrollTop=99999;
  }catch(e){}
}

function renderSupMessages(){
  var m = document.getElementById('sup-msgs');
  if(!m) return;
  if(_supMsgs.length === 0){
    m.innerHTML = '<div style="text-align:center;padding:30px 16px;color:var(--gt);font-size:13px">💬 Напишіть нам — відповімо якнайшвидше</div>';
    return;
  }
  m.innerHTML = _supMsgs.map(function(msg){
    var safe = msg.text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return '<div class="ai-msg ' + (msg.from==='user'?'usr':'bot') + '">' + safe + '</div>';
  }).join('');
  m.scrollTop = 99999;
}
window.sendSupportMsg = function(){
  var inp = document.getElementById('sup-inp');
  if(!inp) return;
  var text = inp.value.trim();
  if(!text) return;
  inp.value = '';
  _supMsgs.push({from:'user', text:text});
  renderSupMessages();
  _saveSupChat();
  setTimeout(function(){
    _supMsgs.push({from:'bot', text:'✅ Повідомлення прийнято! Оператор відповість найближчим часом.'});
    renderSupMessages();
    _saveSupChat();
  }, 800);
};
window.handleSupportFile = function(event){
  var file = event.target.files && event.target.files[0];
  if(!file) return;
  _supMsgs.push({from:'user', text:'📎 ' + file.name});
  renderSupMessages();
  _saveSupChat();
  setTimeout(function(){
    _supMsgs.push({from:'bot', text:'✅ Файл отримано.'});
    renderSupMessages();
    _saveSupChat();
  }, 600);
};

// ── COMBINED CHAT (mobile) ──
window.openCombinedChat = function() {
  openPanel('ai-panel');
  initAI();
};
window.openSupportChat = function() {
  openPanel('support-panel');
  renderSupMessages();
};
window.switchChatTab = function(tab) {
  var ai = document.getElementById('ai-panel');
  var sup = document.getElementById('support-panel');
  if(tab === 'ai') {
    if(sup) sup.classList.remove('open');
    if(ai) ai.classList.add('open');
    initAI();
  } else {
    if(ai) ai.classList.remove('open');
    if(sup) sup.classList.add('open');
    if(typeof window._supChatActivate === 'function') window._supChatActivate();
  }
};

// sync sort label to mob-sort-val
var _origSetSortMini = window.setSortMini;
window.setSortMini = function(v) {
  if(_origSetSortMini) _origSetSortMini(v);
  var mv = document.getElementById('mob-sort-val');
  var sv = document.getElementById('sort-mini-val');
  if(mv && sv) mv.textContent = sv.textContent;
};

// sync found count to mob-found-cnt
function updateMobFoundCnt() {
  var mc = document.getElementById('mob-found-cnt');
  var dc = document.getElementById('prod-found-cnt');
  if(mc && dc) mc.textContent = dc.textContent + ' товарів';
}

// mobile filter sheet — DOM-move approach (preserves event handlers and IDs)
var _mobFltHost = null;
var _mobFltNext = null;
window.openMobFilter = function() {
  var body = document.getElementById('mob-flt-body');
  var panel = document.getElementById('filter-panel');
  if(!body || !panel) return;
  // Store original position
  _mobFltHost = panel.parentNode;
  _mobFltNext = panel.nextSibling;
  // Hide duplicate header/buttons (sheet footer has its own)
  var ph = panel.querySelector('.flt-header'); if(ph) ph.style.display='none';
  var pb = panel.querySelector('.flt-btns'); if(pb) pb.style.display='none';
  // Move actual DOM node into sheet body
  body.innerHTML = '';
  body.appendChild(panel);
  panel.style.cssText = 'display:block !important;width:100%';
  var ov = document.getElementById('mob-flt-overlay');
  var sh = document.getElementById('mob-flt-sheet');
  if(ov) { ov.style.display = 'block'; setTimeout(function(){ ov.classList.add('open'); }, 10); }
  if(sh) { sh.style.display = 'flex'; setTimeout(function(){ sh.classList.add('open'); }, 10); }
  document.body.style.overflow = 'hidden';
};
window.closeMobFilter = function() {
  var panel = document.getElementById('filter-panel');
  if(panel && _mobFltHost) {
    var ph = panel.querySelector('.flt-header'); if(ph) ph.style.display='';
    var pb = panel.querySelector('.flt-btns'); if(pb) pb.style.display='';
    if(_mobFltNext && _mobFltNext.parentNode) {
      _mobFltHost.insertBefore(panel, _mobFltNext);
    } else {
      _mobFltHost.appendChild(panel);
    }
    panel.style.cssText = '';
    _mobFltHost = null; _mobFltNext = null;
  }
  var ov = document.getElementById('mob-flt-overlay');
  var sh = document.getElementById('mob-flt-sheet');
  if(ov) { ov.classList.remove('open'); setTimeout(function(){ ov.style.display='none'; }, 280); }
  if(sh) { sh.classList.remove('open'); setTimeout(function(){ sh.style.display='none'; }, 280); }
  document.body.style.overflow = '';
};

function updateMobCartBadge() {
  var b = document.getElementById('mob-cart-badge');
  if(!b) return;
  var n = cart.reduce(function(s,i){return s+(i.qty||1);},0);
  b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none';
}
var _origRenderCart = window.renderCart;
window.renderCart = function(){ if(_origRenderCart) _origRenderCart(); updateMobCartBadge(); };

document.addEventListener('DOMContentLoaded', function() {
  updateMobCartBadge();
  // observe prod-found-cnt
  var pfc = document.getElementById('prod-found-cnt');
  if(pfc) {
    new MutationObserver(updateMobFoundCnt).observe(pfc, {childList:true});
  }
});

// ============================================================
// ЗАВАНТАЖЕННЯ ТОВАРІВ З SUPABASE
// ============================================================
async function loadProdsFromSupabase(){
  if(!supabase)return;
  try{
    // Паралельно завантажуємо товари і категорії
    var[prodsRes,catsRes,pcRes,revRes,bannersRes]=await Promise.all([
      supabase.from("products").select("id,name,name_en,name_ru,price,old_price,emoji,image_url,images,in_stock,description,slug,meta_title,meta_description,parameters").or("is_active.eq.true,is_active.is.null").order("id",{ascending:false}),
      supabase.from("categories").select("id,name,slug,parent_id,emoji").eq("is_active",true).order("sort_order"),
      supabase.from("product_categories").select("product_id,category_id"),
      supabase.from("reviews").select("product_id,rating"),
      supabase.from("banners").select("id,image_url,title").eq("is_active",true).order("sort_order").order("created_at"),
    ]);
    // ── Банери ──
    var banners=(!bannersRes.error&&bannersRes.data)||[];
    if(banners.length>0)_hsRender(banners);

    // ── Категорії ──
    var rawCats=(!catsRes.error&&catsRes.data)||[];
    // Карта id→slug для прив'язки товарів
    var catById={};
    rawCats.forEach(function(c){catById[c.id]=c;});

    // Підрахунок товарів у категорії
    var catCount={};
    ((!pcRes.error&&pcRes.data)||[]).forEach(function(pc){
      catCount[pc.category_id]=(catCount[pc.category_id]||0)+1;
    });
    // Тільки кореневі категорії для відображення
    _sbCats=rawCats.filter(function(c){return !c.parent_id;}).map(function(c){
      return{id:c.id,name:c.name,slug:c.slug,e:c.emoji||"📦",_count:catCount[c.id]||""};
    });
    updateLocalizedCollections();

    // Карта product_id → slug категорії
    var catMap={};
    ((!pcRes.error&&pcRes.data)||[]).forEach(function(pc){
      if(!catMap[pc.product_id]&&catById[pc.category_id])catMap[pc.product_id]=catById[pc.category_id].slug;
    });

    // ── Рейтинги з відгуків ──
    var revMap={};
    ((!revRes||revRes.error)?[]:revRes.data||[]).forEach(function(rv){
      var pid=rv.product_id;
      if(!revMap[pid])revMap[pid]={sum:0,count:0};
      revMap[pid].sum+=rv.rating||5;
      revMap[pid].count++;
    });

    // ── Товари ──
    var rawProds=(!prodsRes.error&&prodsRes.data)||[];
    if(prodsRes.error)console.warn("[loadProds] products:",prodsRes.error.message);

    var mapped=rawProds.map(function(d){
      var price=d.price||0;
      var oldPrice=d.old_price||price;
      var rvData=revMap[d.id];
      var rVal=rvData?Math.round((rvData.sum/rvData.count)*10)/10:5;
      var rvCount=rvData?rvData.count:0;
      var imgs=Array.isArray(d.images)?d.images:(d.images?[d.images]:[]);
      return{id:d.id,nm_uk:d.name||"",nm_en:d.name_en||"",nm_ru:d.name_ru||"",nm:d.name||"",
        e:d.emoji||"📦",p:price,op:oldPrice,r:rVal,rv:rvCount,b:oldPrice>price?"sale":"new",
        cat:catMap[d.id]||null,image_url:d.image_url||null,images:imgs,in_stock:d.in_stock!==false,
        description:d.description||"",slug:d.slug||null,meta_title:d.meta_title||null,
        meta_desc:d.meta_description||null,params:d.parameters||null};
    });

    PRODS.splice(0,PRODS.length,...mapped);
    console.info("[dobrobut] "+mapped.length+" товарів, "+_sbCats.length+" категорій завантажено з Supabase");
    renderHome();
    var pp=document.getElementById("page-products");
    if(pp&&pp.classList.contains("active")){renderAllProducts();}
  }catch(e){console.warn("[loadProds] exception:",e);}
}

// ── Hero slider ──────────────────────────────────────────────
var _hsIdx=0,_hsTotal=0,_hsTimer=null;
function _hsRender(banners){
  var track=document.getElementById('hs-track');
  var dots=document.getElementById('hs-dots');
  var prev=document.getElementById('hs-prev');
  var next=document.getElementById('hs-next');
  if(!track)return;
  _hsTotal=banners.length;
  _hsIdx=0;
  track.innerHTML=banners.map(function(b){
    return '<img class="hs-slide" src="'+b.image_url+'" alt="'+(b.title||'')+'" loading="lazy">';
  }).join('');
  track.style.transform='translateX(0)';
  if(dots)dots.innerHTML=banners.map(function(_,i){
    return '<span class="hs-dot'+(i===0?' active':'')+'" onclick="hsGo('+i+')"></span>';
  }).join('');
  var show=banners.length>1;
  if(prev)prev.style.display=show?'':'none';
  if(next)next.style.display=show?'':'none';
  if(show){clearInterval(_hsTimer);_hsTimer=setInterval(function(){hsGo((_hsIdx+1)%_hsTotal);},4000);}
}
function hsGo(i){
  if(_hsTotal===0)return;
  _hsIdx=i;
  var t=document.getElementById('hs-track');
  if(t)t.style.transform='translateX(-'+(i*100)+'%)';
  document.querySelectorAll('.hs-dot').forEach(function(d,j){d.classList.toggle('active',j===i);});
}
function hsNav(d){
  hsGo((_hsIdx+d+_hsTotal)%_hsTotal);
  clearInterval(_hsTimer);
  _hsTimer=setInterval(function(){hsGo((_hsIdx+1)%_hsTotal);},4000);
}
window.hsGo=hsGo;window.hsNav=hsNav;

// ============================================================
// ІНІЦІАЛІЗАЦІЯ
// ============================================================
// ── INIT ──

// Handle LiqPay redirect
if(window.location.search.includes("payment=success")){
  var _pending=localStorage.getItem("_pendingOrder");
  if(_pending){
    try{
      var _pord=JSON.parse(_pending);
      _pord.status="new";
      saveOrderToSupabase(_pord).then(function(saved){
        trackPurchase(Object.assign({},_pord,saved?{order_number:saved.order_number}:{}));
        localStorage.removeItem("_pendingOrder");
      });
    }catch(_e){}
  }
  history.replaceState(null,"",window.location.pathname);
  setTimeout(function(){showToast("✅ Оплата успішна! Замовлення оформлено.");},600);
}

// iOS Safari: resize open panels when virtual keyboard changes visual viewport
if(window.visualViewport){
  function _vpResize(){
    var vv=window.visualViewport;
    var kbH=window.innerHeight-vv.height-vv.offsetTop;
    document.querySelectorAll('.sp.open').forEach(function(el){
      if(kbH>50){
        el.style.top=vv.offsetTop+'px';
        el.style.height=vv.height+'px';
      }else{
        el.style.top='';
        el.style.height='';
      }
    });
  }
  window.visualViewport.addEventListener('resize',_vpResize);
  window.visualViewport.addEventListener('scroll',_vpResize);
}

initAnalytics();
setLang(getSavedLang(),true);
loadProdsFromSupabase();
if(supabase){
  supabase.auth.onAuthStateChange(function(event,session){
    if(session&&session.user){
      var u=session.user;
      loggedIn=true;
      currentUserEmail=u.email||"";
      currentUserName=(u.user_metadata&&u.user_metadata.full_name)||u.email.split("@")[0]||"Покупець";
      renderAcc();
      loadUserData();
      _loadSupChat();
      _loadAIChat();
      if(document.getElementById("pd-review-write"))renderPdReviewWriter();
    }else{
      if(loggedIn){
        loggedIn=false;currentUserEmail="";currentUserName="Покупець";
        renderAcc();
        if(document.getElementById("pd-review-write"))renderPdReviewWriter();
      }
    }
  });
}


var pdQty=1,pdCurrentId=null,pdAiOpen=false,pdAiIdx=0;
var pdGalleryImages=[],pdGalleryIdx=0;

function _pdGalSetup(images){
  pdGalleryImages=images;pdGalleryIdx=0;
  var prev=document.getElementById("pd-gal-prev");
  var next=document.getElementById("pd-gal-next");
  var ctr=document.getElementById("pd-gal-counter");
  var multi=images.length>1;
  if(prev)prev.classList.toggle("visible",multi);
  if(next)next.classList.toggle("visible",multi);
  if(ctr){ctr.classList.toggle("visible",multi);if(multi)ctr.textContent="1 / "+images.length;}
  // touch/swipe
  var pdImgEl=document.querySelector(".pd-img");
  if(pdImgEl&&!pdImgEl._galSwipe){
    pdImgEl._galSwipe=true;
    var sx=0;
    pdImgEl.addEventListener("touchstart",function(e){sx=e.touches[0].clientX;},{passive:true});
    pdImgEl.addEventListener("touchend",function(e){
      var dx=e.changedTouches[0].clientX-sx;
      if(Math.abs(dx)>40)pdGalNav(dx<0?1:-1);
    },{passive:true});
  }
}
function pdGalNav(dir){
  var len=pdGalleryImages.length;if(len<=1)return;
  pdGalleryIdx=(pdGalleryIdx+dir+len)%len;
  var url=pdGalleryImages[pdGalleryIdx];
  var el=document.getElementById("pd-emoji");
  if(el)el.innerHTML='<img src="'+url+'" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">';
  document.querySelectorAll(".pd-th").forEach(function(t,i){t.classList.toggle("active",i===pdGalleryIdx);});
  var ctr=document.getElementById("pd-gal-counter");
  if(ctr)ctr.textContent=(pdGalleryIdx+1)+" / "+len;
  // scroll thumbnail into view
  var th=document.querySelectorAll(".pd-th")[pdGalleryIdx];
  if(th)th.scrollIntoView({block:"nearest",inline:"center",behavior:"smooth"});
}
window.pdGalNav=pdGalNav;
var PROD_DESCS={
  1:"<h4>\u041f\u0440\u043e \u0442\u043e\u0432\u0430\u0440</h4><p>\u0410\u043d\u0442\u0438\u043f\u0440\u0438\u0433\u0430\u0440\u043d\u0430 \u0441\u043a\u043e\u0432\u043e\u0440\u043e\u0434\u0430 \u043f\u0440\u0435\u043c\u0456\u0443\u043c \u043a\u043b\u0430\u0441\u0443 \u0437 \u0433\u0440\u0430\u043d\u0456\u0442\u043d\u0438\u043c \u043f\u043e\u043a\u0440\u0438\u0442\u0442\u044f\u043c ILAG (\u0428\u0432\u0435\u0439\u0446\u0430\u0440\u0456\u044f). \u0420\u0456\u0432\u043d\u043e\u043c\u0456\u0440\u043d\u0438\u0439 \u0440\u043e\u0437\u043f\u043e\u0434\u0456\u043b \u0442\u0435\u043f\u043b\u0430 \u0437\u0430\u0432\u0434\u044f\u043a\u0438 \u043f\u043e\u0442\u043e\u0432\u0449\u0435\u043d\u043e\u043c\u0443 \u0434\u043d\u0443 6 \u043c\u043c.</p><h4>\u041e\u0441\u043e\u0431\u043b\u0438\u0432\u043e\u0441\u0442\u0456</h4><ul><li>\u0422\u0440\u0438\u0448\u0430\u0440\u043e\u0432\u0435 \u0433\u0440\u0430\u043d\u0456\u0442\u043d\u0435 \u043f\u043e\u043a\u0440\u0438\u0442\u0442\u044f</li><li>\u041f\u043e\u0442\u043e\u0432\u0449\u0435\u043d\u0435 \u0434\u043d\u043e 6 \u043c\u043c</li><li>\u0420\u0443\u0447\u043a\u0430, \u0449\u043e \u043d\u0435 \u043d\u0430\u0433\u0440\u0456\u0432\u0430\u0454\u0442\u044c\u0441\u044f</li><li>\u041f\u0456\u0434\u0445\u043e\u0434\u0438\u0442\u044c \u0434\u043b\u044f \u0456\u043d\u0434\u0443\u043a\u0446\u0456\u0439\u043d\u0438\u0445 \u043f\u043b\u0438\u0442</li></ul>",
  2:"<h4>\u041f\u0440\u043e \u043d\u0430\u0431\u0456\u0440</h4><p>6 \u0433\u0435\u0440\u043c\u0435\u0442\u0438\u0447\u043d\u0438\u0445 \u043a\u043e\u043d\u0442\u0435\u0439\u043d\u0435\u0440\u0456\u0432 \u0437 \u0445\u0430\u0440\u0447\u043e\u0432\u043e\u0433\u043e \u043f\u043b\u0430\u0441\u0442\u0438\u043a\u0443 BPA-free \u0434\u043b\u044f \u0437\u0431\u0435\u0440\u0456\u0433\u0430\u043d\u043d\u044f \u0431\u0443\u0434\u044c-\u044f\u043a\u0438\u0445 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0456\u0432.</p>",
  3:"<h4>\u041f\u0440\u043e \u043a\u0430\u0448\u043f\u043e</h4><p>\u0421\u0442\u0438\u043b\u044c\u043d\u0435 \u043a\u0430\u0448\u043f\u043e \u0437 \u043d\u0430\u0442\u0443\u0440\u0430\u043b\u044c\u043d\u043e\u0433\u043e \u0431\u0430\u043c\u0431\u0443\u043a\u0443. \u0414\u043e\u0434\u0430\u0454 \u0442\u0435\u043f\u043b\u0430 \u0442\u0430 \u043f\u0440\u0438\u0440\u043e\u0434\u043d\u043e\u0441\u0442\u0456 \u0456\u043d\u0442\u0435\u0440\u2019\u0454\u0440\u0443.</p>",
  4:"<h4>\u041f\u0440\u043e \u0434\u0438\u0441\u043f\u0435\u043d\u0441\u0435\u0440</h4><p>\u0410\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u043d\u0438\u0439 \u0434\u0438\u0441\u043f\u0435\u043d\u0441\u0435\u0440 \u0437 \u0456\u043d\u0444\u0440\u0430\u0447\u0435\u0440\u0432\u043e\u043d\u0438\u043c \u0441\u0435\u043d\u0441\u043e\u0440\u043e\u043c. \u0413\u0456\u0433\u0456\u0454\u043d\u0456\u0447\u043d\u0438\u0439 \u2014 \u0431\u0435\u0437 \u043a\u043e\u043d\u0442\u0430\u043a\u0442\u0443 \u0440\u0443\u043a.</p>",
  5:"<h4>\u041f\u0440\u043e \u043d\u0430\u0431\u0456\u0440 \u043d\u043e\u0436\u0456\u0432</h4><p>5 \u043a\u0443\u0445\u043e\u043d\u043d\u0438\u0445 \u043d\u043e\u0436\u0456\u0432 + \u043f\u0456\u0434\u0441\u0442\u0430\u0432\u043a\u0430. \u0417\u0430\u0442\u043e\u0447\u0435\u043d\u0456 \u0437\u0430 \u044f\u043f\u043e\u043d\u0441\u044c\u043a\u043e\u044e \u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433\u0456\u0454\u044e.</p>",
  6:"<h4>\u041f\u0440\u043e \u043f\u043b\u0435\u0434</h4><p>\u0424\u043b\u0456\u0441\u043e\u0432\u0438\u0439 \u043f\u043b\u0435\u0434 200 \u0433/\u043c2. \u0414\u0443\u0436\u0435 \u043c'\u044f\u043a\u0438\u0439 \u0456 \u0442\u0435\u043f\u043b\u0438\u0439.</p>",
  7:"<h4>\u041f\u0440\u043e \u043e\u0440\u0433\u0430\u043d\u0430\u0439\u0437\u0435\u0440</h4><p>\u0410\u043a\u0440\u0438\u043b\u043e\u0432\u0438\u0439 \u043e\u0440\u0433\u0430\u043d\u0430\u0439\u0437\u0435\u0440 \u0434\u043b\u044f \u043a\u043e\u0441\u043c\u0435\u0442\u0438\u043a\u0438 \u0437 12 \u0441\u0435\u043a\u0446\u0456\u044f\u043c\u0438.</p>",
  8:"<h4>\u041f\u0440\u043e \u0440\u0443\u0448\u043d\u0438\u043a\u0438</h4><p>5 \u043c\u0456\u043a\u0440\u043e\u0444\u0456\u0431\u0440\u043e\u043d\u0438\u0445 \u0440\u0443\u0448\u043d\u0438\u043a\u0456\u0432. \u041f\u043e\u0433\u043b\u0438\u043d\u0430\u044e\u0442\u044c \u0432\u043e\u0434\u0443 \u0432 7 \u0440\u0430\u0437\u0456\u0432 \u043a\u0440\u0430\u0449\u0435.</p>"
};
var PROD_SPECS={
  1:[["\u0414\u0456\u0430\u043c\u0435\u0442\u0440","28 \u0441\u043c"],["\u041c\u0430\u0442\u0435\u0440\u0456\u0430\u043b","\u0410\u043b\u044e\u043c\u0456\u043d\u0456\u0439+\u0433\u0440\u0430\u043d\u0456\u0442"],["\u0422\u043e\u0432\u0449\u0438\u043d\u0430 \u0434\u043d\u0430","6 \u043c\u043c"],["\u0422\u0438\u043f \u043f\u043b\u0438\u0442\u0438","\u0412\u0441\u0456,\u0456\u043d\u0434\u0443\u043a\u0446\u0456\u044f"],["\u0412\u0430\u0433\u0430","1.2 \u043a\u0433"]],
  2:[["\u041e\u0431'\u0454\u043c","500\u043c\u043b/1\u043b/2\u043b"],["\u041c\u0430\u0442\u0435\u0440\u0456\u0430\u043b","BPA-free"],["\u041a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c","6 \u0448\u0442"]],
  3:[["\u041c\u0430\u0442\u0435\u0440\u0456\u0430\u043b","\u0411\u0430\u043c\u0431\u0443\u043a"],["\u0420\u043e\u0437\u043c\u0456\u0440","15x14 \u0441\u043c"],["\u0412\u0430\u0433\u0430","320 \u0433"]],
  4:[["\u041e\u0431'\u0454\u043c","300 \u043c\u043b"],["\u0421\u0435\u043d\u0441\u043e\u0440","\u0406\u043d\u0444\u0440\u0430\u0447\u0435\u0440\u0432\u043e\u043d\u0438\u0439"],["\u0416\u0438\u0432\u043b\u0435\u043d\u043d\u044f","4xAA"]],
  5:[["\u041c\u0430\u0442\u0435\u0440\u0456\u0430\u043b","\u041d\u0435\u0440\u0436\u0430\u0432\u0456\u044e\u0447\u0430 \u0441\u0442\u0430\u043b\u044c"],["\u0417\u0430\u0442\u043e\u0447\u0443\u0432\u0430\u043d\u043d\u044f","\u042f\u043f\u043e\u043d\u0441\u044c\u043a\u0430,15\u00b0"],["\u041d\u0430\u0431\u0456\u0440","5 \u043d\u043e\u0436\u0456\u0432"]],
  6:[["\u0420\u043e\u0437\u043c\u0456\u0440","150x200 \u0441\u043c"],["\u041c\u0430\u0442\u0435\u0440\u0456\u0430\u043b","\u041c\u0456\u043a\u0440\u043e\u0444\u0456\u0431\u0440\u0430 200\u0433/\u043c2"]],
  7:[["\u041c\u0430\u0442\u0435\u0440\u0456\u0430\u043b","\u0410\u043a\u0440\u0438\u043b"],["\u0421\u0435\u043a\u0446\u0456\u0439","12"]],
  8:[["\u041c\u0430\u0442\u0435\u0440\u0456\u0430\u043b","\u041c\u0456\u043a\u0440\u043e\u0444\u0456\u0431\u0440\u0430"],["\u041d\u0430\u0431\u0456\u0440","5 \u0448\u0442"]]
};
var PROD_REVS={
  1:[{em:"\uD83D\uDC69",nm:"\u041e\u043b\u0435\u043d\u0430 \u041a.",date:"15 \u043b\u044e\u0442 2025",stars:5,txt:"\u0427\u0443\u0434\u043e\u0432\u0430 \u0441\u043a\u043e\u0432\u043e\u0440\u043e\u0434\u0430! \u041d\u0456\u0447\u043e\u0433\u043e \u043d\u0435 \u043f\u0440\u0438\u0433\u043e\u0440\u0430\u0454.",pro:"\u0412\u0456\u0434\u043c\u0456\u043d\u043d\u0435 \u043f\u043e\u043a\u0440\u0438\u0442\u0442\u044f",con:""},
     {em:"\uD83D\uDC68",nm:"\u041e\u043b\u0435\u043a\u0441\u0456\u0439 \u041c.",date:"3 \u043b\u044e\u0442 2025",stars:5,txt:"\u042f\u0454\u0447\u043d\u044f \u0431\u0435\u0437 \u043e\u043b\u0456\u0457!",pro:"\u0410\u043d\u0442\u0438\u043f\u0440\u0438\u0433\u0430\u0440\u043d\u0435",con:"\u0420\u0443\u0447\u043a\u0430"}],
  2:[{em:"\uD83D\uDC68",nm:"\u0414\u043c\u0438\u0442\u0440\u043e \u041b.",date:"10 \u043b\u044e\u0442 2025",stars:5,txt:"\u041a\u043e\u043d\u0442\u0435\u0439\u043d\u0435\u0440\u0438 \u044f\u043a\u0456\u0441\u043d\u0456!",pro:"\u0413\u0435\u0440\u043c\u0435\u0442\u0438\u0447\u043d\u0456\u0441\u0442\u044c",con:""}]
};
var PD_AI=["\u0426\u0435 \u0447\u0443\u0434\u043e\u0432\u0438\u0439 \u0442\u043e\u0432\u0430\u0440 \u0437 \u0440\u0435\u0439\u0442\u0438\u043d\u0433\u043e\u043c {r}/5! \u0412\u0436\u0435 {rv}+ \u043f\u043e\u043a\u0443\u043f\u0446\u0456\u0432 \u0437\u0430\u0434\u043e\u0432\u043e\u043b\u0435\u043d\u0456.","\u0426\u0456\u043d\u0430 {p} \u0433\u0440\u043d \u2014 \u0435\u043a\u043e\u043d\u043e\u043c\u0456\u044f {save} \u0433\u0440\u043d!","\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 1-2 \u0434\u043d\u0456. \u0411\u0435\u0437\u043a\u043e\u0448\u0442\u043e\u0432\u043d\u043e \u0432\u0456\u0434 1500 \u0433\u0440\u043d.","\u041f\u043e\u0432\u0435\u0440\u043d\u0435\u043d\u043d\u044f 30 \u0434\u043d\u0456\u0432. \u0413\u0430\u0440\u0430\u043d\u0442\u0456\u044f 12 \u043c\u0456\u0441\u044f\u0446\u0456\u0432.","\u0422\u043e\u043f-\u043f\u0440\u043e\u0434\u0430\u0436 \u0441\u0432\u043e\u0454\u0457 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0456\u0457!"];
function getPdReviewTexts(){
  if(currentLang==="en")return{
    title:"Leave a review",
    placeholder:"Write your feedback about this product...",
    rating:"Rating",
    submit:"Publish review",
    loginNote:"Only authorized users can leave reviews.",
    loginBtn:"Sign in",
    needLogin:"Sign in to leave a review.",
    shortText:"Review is too short.",
    saved:"Thanks! Your review has been published.",
    defaultName:"Buyer"
  };
  if(currentLang==="ru")return{
    title:"Оставить отзыв",
    placeholder:"Напишите ваш отзыв о товаре...",
    rating:"Оценка",
    submit:"Опубликовать отзыв",
    loginNote:"Оставлять отзывы могут только авторизованные пользователи.",
    loginBtn:"Войти",
    needLogin:"Войдите, чтобы оставить отзыв.",
    shortText:"Отзыв слишком короткий.",
    saved:"Спасибо! Отзыв опубликован.",
    defaultName:"Покупатель"
  };
  return{
    title:"Залишити відгук",
    placeholder:"Напишіть ваш відгук про товар...",
    rating:"Оцінка",
    submit:"Опублікувати відгук",
    loginNote:"Залишати відгуки можуть тільки авторизовані користувачі.",
    loginBtn:"Увійти",
    needLogin:"Увійдіть, щоб залишити відгук.",
    shortText:"Відгук занадто короткий.",
    saved:"Дякуємо! Відгук опубліковано.",
    defaultName:"Покупець"
  };
}
function getPdReviewDate(){
  var loc=currentLang==="en"?"en-US":currentLang==="ru"?"ru-RU":"uk-UA";
  try{return new Date().toLocaleDateString(loc,{day:"numeric",month:"short",year:"numeric"});}
  catch(_){return new Date().toLocaleDateString();}
}
function renderPdReviewWriter(){
  var box=document.getElementById("pd-review-write");
  if(!box)return;
  var t=getPdReviewTexts();
  if(!loggedIn){
    box.innerHTML="<div class=\"pd-rlogin\">"+t.loginNote+" <a onclick=\"openPanel('acc-panel');renderAcc()\">"+t.loginBtn+"</a></div>";
    return;
  }
  box.innerHTML="<div class=\"pd-rwrite\"><h4>"+t.title+"</h4>"
    +"<textarea class=\"pd-rta\" id=\"pd-new-review-text\" placeholder=\""+t.placeholder+"\"></textarea>"
    +"<div class=\"pd-rmeta\"><span class=\"pd-rlbl\">"+t.rating+":</span>"
    +"<select class=\"pd-rsel\" id=\"pd-new-review-stars\"><option value=\"5\">5 ★★★★★</option><option value=\"4\">4 ★★★★☆</option><option value=\"3\">3 ★★★☆☆</option><option value=\"2\">2 ★★☆☆☆</option><option value=\"1\">1 ★☆☆☆☆</option></select>"
    +"<button class=\"pd-rbtn\" onclick=\"submitPdReview()\">"+t.submit+"</button></div></div>";
}
function submitPdReview(){
  var t=getPdReviewTexts();
  if(!loggedIn){showToast(t.needLogin);renderPdReviewWriter();return;}
  if(!pdCurrentId)return;
  var txtEl=document.getElementById("pd-new-review-text");
  var starsEl=document.getElementById("pd-new-review-stars");
  if(!txtEl||!starsEl)return;
  var txt=txtEl.value.trim();
  var stars=Math.max(1,Math.min(5,parseInt(starsEl.value,10)||5));
  if(txt.length<4){showToast(t.shortText);return;}
  var p=PRODS.find(function(x){return x.id===pdCurrentId;});
  if(!p)return;
  var nm=(currentUserName&&currentUserName.trim())?currentUserName.trim():t.defaultName;
  var rev={em:"\uD83E\uDDD1",nm:nm,date:getPdReviewDate(),stars:stars,txt:txt,pro:"",con:""};
  if(!PROD_REVS[pdCurrentId])PROD_REVS[pdCurrentId]=[];
  PROD_REVS[pdCurrentId].unshift(rev);
  var rv=Math.max(0,Number(p.rv)||0);
  var rt=Math.max(0,Number(p.r)||0);
  p.r=Math.round((((rt*rv)+stars)/(rv+1))*10)/10;
  p.rv=rv+1;
  ALL_REVIEWS.unshift({em:rev.em,nm:rev.nm,date:rev.date,stars:rev.stars,txt:rev.txt,prod:p.nm});
  showToast(t.saved);
  openProdPage(pdCurrentId);
  pdTab("reviews");
}
function openProdPage(id){
  var p=PRODS.find(function(x){return String(x.id)===String(id);});if(!p)return;
  pdCurrentId=id;pdQty=1;pdAiOpen=false;
  var ap=document.getElementById("pd-ai-panel");if(ap)ap.classList.remove("open");
  showPage("product");
  trackViewItem(p);
  updateMeta({
    title:p.meta_title||p.nm,
    description:p.meta_desc||(p.nm+' — купити в інтернет-магазині Добробут. Ціна '+p.p+' грн.'),
    image:p.image_url||undefined,
    url:window.location.origin+window.location.pathname+(p.slug?'?product='+p.id:''),
  });
  document.getElementById("pd-title").textContent=p.nm;
  document.getElementById("pd-bread").textContent=p.nm;
  var pdEmojiEl=document.getElementById("pd-emoji");
  if(p.image_url){pdEmojiEl.innerHTML='<img src="'+p.image_url+'" alt="" style="width:100%;height:100%;object-fit:contain;background:#fff;border-radius:inherit">';}
  else{pdEmojiEl.textContent=p.e;}
  document.getElementById("pd-qty-v").textContent="1";
  var disc=(p.op>0&&p.p<p.op)?Math.round((1-p.p/p.op)*100):0;
  document.getElementById("pd-pnew").textContent=p.p+" \u0433\u0440\u043d";
  var pdOldEl=document.getElementById("pd-pold");
  var pdDiscEl=document.getElementById("pd-disc");
  var pdSaveEl=document.getElementById("pd-save");
  if(disc>0){
    pdOldEl.textContent=p.op+" \u0433\u0440\u043d"; pdOldEl.style.display="";
    pdDiscEl.textContent="-"+disc+"%"; pdDiscEl.style.display="";
    pdSaveEl.textContent="\u0412\u0438 \u0435\u043a\u043e\u043d\u043e\u043c\u0438\u0442\u0435 "+(p.op-p.p)+" \u0433\u0440\u043d";
  }else{
    pdOldEl.style.display="none";
    pdDiscEl.style.display="none";
    pdSaveEl.textContent="";
  }
  document.getElementById("pd-stars").textContent="\u2605".repeat(Math.floor(p.r))+"\u2606".repeat(5-Math.floor(p.r));
  document.getElementById("pd-rcnt").textContent="("+p.rv+" \u0432\u0456\u0434\u0433\u0443\u043a\u0456\u0432)";
  document.getElementById("pd-sold").textContent="\u2022 "+(p.rv*5)+"+ \u043f\u0440\u043e\u0434\u0430\u043d\u043e";
  document.getElementById("pd-revnum").textContent=p.r.toFixed(1);
  document.getElementById("pd-revtot").textContent=p.rv;
  document.getElementById("pd-tab-rcnt").textContent=p.rv;
  var bc="";
  if(p.b==="sale")bc+='<span class="pd-badge pbs">\uD83D\uDD25 -'+disc+'%</span>';
  else if(p.b==="new")bc+='<span class="pd-badge pbn">\u2728 \u041d\u041e\u0412\u0418\u041d\u041a\u0410</span>';
  else if(p.b==="hot")bc+='<span class="pd-badge pbh">\uD83C\uDFC6 \u0425\u0406\u0422</span>';
  bc+='<span class="pd-badge pba">\u2705 \u0412 \u043d\u0430\u044f\u0432\u043d\u043e\u0441\u0442\u0456</span>';
  document.getElementById("pd-badges").innerHTML=bc;
  // Build full gallery array: main photo first, then extras
  var allImgs=[];
  if(p.image_url)allImgs.push(p.image_url);
  if(p.images&&p.images.length){p.images.forEach(function(u){if(u&&u!==p.image_url)allImgs.push(u);});}
  _pdGalSetup(allImgs);
  // Render thumbnail strip
  var ths="";
  allImgs.forEach(function(url,i){
    ths+='<div class="pd-th'+(i===0?" active":"")+'" onclick="pdThumb(this,'+i+')"><img src="'+url+'" alt="" loading="lazy"></div>';
  });
  if(!allImgs.length)ths='<div class="pd-th active"><span>'+p.e+'</span></div>';
  document.getElementById("pd-thumbs").innerHTML=ths;
  document.getElementById("pd-desc").innerHTML=p.description?("<p>"+escHtml(p.description)+"</p>"):PROD_DESCS[id]||("<p>"+escHtml(p.nm)+"</p>");
  var sp;
  if(p.params&&typeof p.params==="object"&&!Array.isArray(p.params)){
    sp=Object.entries(p.params).map(function(kv){return[kv[0],kv[1]];});
  }
  if(!sp||!sp.length)sp=PROD_SPECS[id]||[["\u0410\u0440\u0442\u0438\u043a\u0443\u043b","#"+(1000+id)]];
  document.getElementById("pd-specs").innerHTML=sp.map(function(r){return "<tr><td>"+escHtml(String(r[0]))+"</td><td>"+escHtml(String(r[1]))+"</td></tr>";}).join("");
  var _revListEl=document.getElementById("pd-revlist");
  if(_revListEl)_revListEl.innerHTML='<div style="text-align:center;padding:24px;color:var(--gt)">\u23f3 \u0417\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f \u0432\u0456\u0434\u0433\u0443\u043a\u0456\u0432\u2026</div>';
  var _loadedForId=id;
  reviewsAPI.list(id).then(function(sbRevs){
    if(pdCurrentId!==_loadedForId)return;
    var rh="";
    if(sbRevs&&sbRevs.length){
      sbRevs.forEach(function(r){
        var stars=r.rating||5;
        rh+='<div class="pd-rcard"><div class="pd-rtop"><div class="pd-rava">\ud83d\udc64</div><div><div class="pd-rnm">'+escHtml(r.name||"\u041f\u043e\u043a\u0443\u043f\u0435\u0446\u044c")+'</div><div class="pd-rdt">'+escHtml(new Date(r.created_at).toLocaleDateString("uk-UA"))+'</div></div><div style="margin-left:auto;color:#f59e0b;font-size:13px">'+"\u2605".repeat(stars)+"\u2606".repeat(5-stars)+'</div></div><div class="pd-rtxt">'+escHtml(r.text||"")+'</div></div>';
      });
      var rAvg=Math.round((sbRevs.reduce(function(s,r){return s+(r.rating||5);},0)/sbRevs.length)*10)/10;
      p.r=rAvg;p.rv=sbRevs.length;
      var _rn=document.getElementById("pd-revnum");var _rt=document.getElementById("pd-revtot");
      var _rc=document.getElementById("pd-rcnt");var _rtc=document.getElementById("pd-tab-rcnt");var _rst=document.getElementById("pd-stars");
      if(_rn)_rn.textContent=rAvg.toFixed(1);if(_rt)_rt.textContent=sbRevs.length;
      if(_rc)_rc.textContent="("+sbRevs.length+" \u0432\u0456\u0434\u0433\u0443\u043a\u0456\u0432)";if(_rtc)_rtc.textContent=sbRevs.length;
      if(_rst)_rst.textContent="\u2605".repeat(Math.floor(rAvg))+"\u2606".repeat(5-Math.floor(rAvg));
    }else{
      rh='<div style="text-align:center;padding:36px;color:var(--gt)">\u0412\u0456\u0434\u0433\u0443\u043a\u0456\u0432 \u043f\u043e\u043a\u0438 \u043d\u0435\u043c\u0430\u0454. \u0411\u0443\u0434\u044c\u0442\u0435 \u043f\u0435\u0440\u0448\u0438\u043c! \u2b50</div>';
    }
    if(_revListEl)_revListEl.innerHTML=rh;
  }).catch(function(){
    if(_revListEl)_revListEl.innerHTML='<div style="text-align:center;padding:24px;color:var(--gt)">\u041d\u0435 \u0432\u0434\u0430\u043b\u043e\u0441\u044f \u0437\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0438\u0442\u0438 \u0432\u0456\u0434\u0433\u0443\u043a\u0438</div>';
  });
  renderPdReviewWriter();
  var sim=PRODS.filter(function(x){return x.id!==id;}).slice(0,4);
  document.getElementById("pd-sim").innerHTML=sim.map(pCard).join("");
  var favBtn=document.getElementById("pd-fav-btn");
  var cartBtn=document.getElementById("pd-cart-btn");
  if(cartBtn)cartBtn.onclick=function(){addToCart(id,pdQty);};
  if(favBtn){
    favBtn.onclick=function(){
      toggleFav(id);
      var f=favs.some(function(x){return x.id===id;});
      favBtn.classList.toggle("active",f);
      favBtn.innerHTML=f?"&#9829;":"&#9825;";
    };
    var isFav=favs.some(function(x){return x.id===id;});
    favBtn.classList.toggle("active",isFav);
    favBtn.innerHTML=isFav?"&#9829;":"&#9825;";
  }
  pdTab("desc");document.getElementById("pd-ai-msgs").innerHTML="";pdAiIdx=0;window.scrollTo(0,0);
}
function pdThumb(el,idx){
  document.querySelectorAll(".pd-th").forEach(function(t){t.classList.remove("active");});
  el.classList.add("active");
  pdGalleryIdx=idx;
  var url=pdGalleryImages[idx];
  var pdEmojiEl=document.getElementById("pd-emoji");
  if(url){pdEmojiEl.innerHTML='<img src="'+url+'" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:inherit">';}
  var ctr=document.getElementById("pd-gal-counter");
  if(ctr&&pdGalleryImages.length>1)ctr.textContent=(idx+1)+" / "+pdGalleryImages.length;
}
function pdChgQty(d){pdQty=Math.max(1,Math.min(99,pdQty+d));document.getElementById("pd-qty-v").textContent=pdQty;}
function pdTab(t){
  document.querySelectorAll(".pd-tb").forEach(function(b){b.classList.remove("active");});
  document.querySelectorAll(".pd-tc").forEach(function(c){c.classList.remove("active");});
  var b=document.querySelector('[data-t="'+t+'"]');if(b)b.classList.add("active");
  var c=document.getElementById("pd-tc-"+t);if(c)c.classList.add("active");
}
function togglePdAI(){
  pdAiOpen=!pdAiOpen;
  var panel=document.getElementById("pd-ai-panel");panel.classList.toggle("open",pdAiOpen);
  if(pdAiOpen&&document.getElementById("pd-ai-msgs").children.length===0){
    var p=PRODS.find(function(x){return x.id===pdCurrentId;});
    pdAiMsg("bot","\u041f\u0440\u0438\u0432\u0456\u0442! \u0420\u043e\u0437\u043f\u043e\u0432\u0456\u043c \u0432\u0441\u0435 \u043f\u0440\u043e "+(p?p.nm:"\u0446\u0435\u0439 \u0442\u043e\u0432\u0430\u0440")+". \u0429\u043e \u0446\u0456\u043a\u0430\u0432\u0438\u0442\u044c?");
    var chips=["\u041f\u0435\u0440\u0435\u0432\u0430\u0433\u0438","\u042f\u043a \u0434\u043e\u0433\u043b\u044f\u0434\u0430\u0442\u0438","\u0414\u043b\u044f \u043f\u043e\u0434\u0430\u0440\u0443\u043d\u043a\u0443","\u041f\u043e\u0432\u0435\u0440\u043d\u0435\u043d\u043d\u044f","\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430"];
    document.getElementById("pd-ai-chips").innerHTML=chips.map(function(c){return '<button class="pd-chip" onclick="pdAsk(\''+c+'\')">'+c+'</button>';}).join("");
  }
}
function pdAiMsg(t,x){var m=document.getElementById("pd-ai-msgs");var d=document.createElement("div");d.className="pd-amsg "+t;if(t==="bot"){d.innerHTML=parseAIReply(x);}else{d.textContent=x;}m.appendChild(d);m.scrollTop=99999;}
function pdSend(){var inp=document.getElementById("pd-ai-inp");var t=inp.value.trim();if(!t)return;inp.value="";pdAsk(t);}
function pdAiSend(){pdSend();}
function pdAsk(q){
  pdAiMsg("usr",q);
  var p=PRODS.find(function(x){return x.id===pdCurrentId;});
  var extra=p?("\n\nЗАРАЗ КЛІЄНТ ДИВИТЬСЯ НА ТОВАР: ID:"+p.id+" — «"+p.nm_uk+"», ціна "+p.p+" грн (стара "+p.op+" грн), рейтинг "+p.r+"/5 ("+p.rv+" відгуків). Пріоритетно відповідай про цей товар."):"";
  var sysPd=buildAISys()+extra;
  var typ=document.createElement("div");typ.className="pd-amsg bot typing";typ.id="pd-ai-typ";
  typ.innerHTML="<div class=\"tdot\"></div><div class=\"tdot\"></div><div class=\"tdot\"></div>";
  var m=document.getElementById("pd-ai-msgs");m.appendChild(typ);m.scrollTop=99999;
  callGPT([{role:"system",content:sysPd},{role:"user",content:q}]).then(function(reply){
    var el=document.getElementById("pd-ai-typ");if(el)el.remove();
    pdAiMsg("bot",reply);
  }).catch(function(err){
    var el=document.getElementById("pd-ai-typ");if(el)el.remove();
    pdAiMsg("bot","⚠️ "+err.message);
  });
}
function openMod(id){if(Date.now()-window._lastBtnMs<400)return;openProdPage(id);}

var fltCat="all",fltSort="popular",fltMinP=0,fltMaxP=2000,FLT_PMIN=0,FLT_PMAX=2000,fltDrag=null,fltInStock=false,fltSale=false,fltSearch="";
window.toggleInStock=function(){
  fltInStock=!fltInStock;
  var t=document.getElementById("flt-toggle-stock");
  if(t)t.classList.toggle("on",fltInStock);
  applyFilters();
};
window.toggleSale=function(){
  fltSale=!fltSale;
  var t=document.getElementById("flt-toggle-sale");
  if(t)t.classList.toggle("on",fltSale);
  applyFilters();
};
function getFilteredProds(){var r=PRODS.slice();if(fltCat!=="all")r=r.filter(function(p){return p.cat===fltCat;});if(fltSearch){var s=fltSearch.toLowerCase();r=r.filter(function(p){return (p.nm&&p.nm.toLowerCase().indexOf(s)>=0)||(p.nm_uk&&p.nm_uk.toLowerCase().indexOf(s)>=0)||(p.description&&p.description.toLowerCase().indexOf(s)>=0);});}r=r.filter(function(p){return p.p>=fltMinP&&p.p<=fltMaxP;});if(fltInStock)r=r.filter(function(p){return p.inStock!==false;});
if(fltSale)r=r.filter(function(p){return p.op&&p.op>p.p;});if(fltSort==="price_asc")r.sort(function(a,b){return a.p-b.p;});else if(fltSort==="price_desc")r.sort(function(a,b){return b.p-a.p;});else if(fltSort==="discount")r.sort(function(a,b){return (b.op-b.p)/b.op-(a.op-a.p)/a.op;});else if(fltSort==="rating")r.sort(function(a,b){return b.r-a.r;});else if(fltSort==="new")r.sort(function(a,b){return b.id-a.id;});return r;}
function renderFilterPanel(){
  var tr=getCurrentLangPack();
  var ci=document.getElementById("flt-cats-inner");
  if(!ci)return;
  var cats=[{cat:"all",n:tr.filterAll,e:""}];
  CATS.forEach(function(c){cats.push(c);});
  // update dropdown button label
  var activeCat=cats.find(function(c){return c.cat===fltCat;})||cats[0];
  var lbl=document.getElementById("cat-drop-val");
  if(lbl)lbl.textContent=(activeCat.e?activeCat.e+" ":"")+activeCat.n;
  // render dropdown items
  ci.innerHTML=cats.map(function(c){
    return '<div class="cat-drop-item'+(fltCat===c.cat?" active":"")+'" onclick="fltSetCat(\''+c.cat+'\')">'+(c.e?c.e+" ":"")+c.n+'</div>';
  }).join("");
  var mn=document.getElementById("flt-min-inp");
  if(mn)mn.value=fltMinP;
  var mx=document.getElementById("flt-max-inp");
  if(mx)mx.value=fltMaxP;
  updateSlider();
  var cnt=document.getElementById("flt-count");
  if(cnt)cnt.textContent=getFilteredProds().length+" "+tr.productsWord;
}
function fltSetCat(cat){
  fltCat=cat;
  var ci=document.getElementById("flt-cats-inner");
  if(ci)ci.classList.remove("open");
  renderFilterPanel();
  applyFilters();
}
window.toggleCatDrop=function(){
  var ci=document.getElementById("flt-cats-inner");
  if(ci)ci.classList.toggle("open");
};
document.addEventListener("click",function(e){
  var wrap=document.getElementById("cat-drop-wrap");
  if(wrap&&!wrap.contains(e.target)){
    var ci=document.getElementById("flt-cats-inner");
    if(ci)ci.classList.remove("open");
  }
});
function fltSetSort(v){fltSort=v;applyFilters();}
var SORT_LABELS={popular:"Популярні",new:"Новинки",price_asc:"Від дешевших",price_desc:"Від дорогих",discount:"За знижкою",rating:"За рейтингом"};
window.toggleSortMini=function(){
  var d=document.getElementById("sort-mini-drop");
  if(d)d.classList.toggle("open");
};
window.setSortMini=function(v){
  var lbl=document.getElementById("sort-mini-val");
  if(lbl)lbl.textContent=SORT_LABELS[v]||v;
  var d=document.getElementById("sort-mini-drop");
  if(d)d.classList.remove("open");
  document.querySelectorAll(".smd-item").forEach(function(el){el.classList.toggle("active",el.getAttribute("onclick").includes("'"+v+"'"));});
  var sel=document.getElementById("flt-sort-sel");
  if(sel)sel.value=v;
  fltSetSort(v);
};
document.addEventListener("click",function(e){
  var wrap=document.getElementById("sort-mini");
  if(wrap&&!wrap.contains(e.target)){
    var d=document.getElementById("sort-mini-drop");
    if(d)d.classList.remove("open");
  }
});
function applyFilters(){
  var tr=getCurrentLangPack();
  var res=getFilteredProds();
  var grid=document.getElementById("all-products-grid");
  if(!grid)return;
  grid.innerHTML=res.length
    ?res.map(pCard).join("")
    :'<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--gt)"><div style="font-size:48px;margin-bottom:14px">&#128269;</div><p style="font-size:16px;font-weight:700;color:var(--dk)">'+tr.noProducts+"</p></div>";
  var cnt=document.getElementById("flt-count");
  if(cnt)cnt.textContent=res.length+" "+tr.productsWord;
  var fc=document.getElementById("prod-found-cnt");
  if(fc)fc.textContent=res.length;
}
function fltReset(){fltCat="all";fltSort="popular";fltMinP=FLT_PMIN;fltMaxP=FLT_PMAX;fltSearch="";var si=document.getElementById("srinput");if(si)si.value="";var sel=document.getElementById("flt-sort-sel");if(sel)sel.value="popular";renderFilterPanel();applyFilters();}
function updateSlider(){
  var tr=getCurrentLangPack();
  if(FLT_PMAX===FLT_PMIN)return;
  var mn=document.getElementById("flt-min-inp");if(mn)mn.value=fltMinP;
  var mx=document.getElementById("flt-max-inp");if(mx)mx.value=fltMaxP;
  var p1=(fltMinP-FLT_PMIN)/(FLT_PMAX-FLT_PMIN)*100;
  var p2=(fltMaxP-FLT_PMIN)/(FLT_PMAX-FLT_PMIN)*100;
  var fill=document.getElementById("flt-fill");
  if(fill){fill.style.left=p1+"%";fill.style.width=(p2-p1)+"%";}
  var t1=document.getElementById("price-thumb1");
  if(t1)t1.style.left=p1+"%";
  var t2=document.getElementById("price-thumb2");
  if(t2)t2.style.left=p2+"%";
  var l1=document.getElementById("price-lbl1");
  if(l1)l1.textContent=fltMinP+" "+tr.currency;
  var l2=document.getElementById("price-lbl2");
  if(l2)l2.textContent=fltMaxP+" "+tr.currency;
}
function onPriceInp(w){var v=parseInt(document.getElementById("flt-"+w+"-inp").value)||0;if(w==="min"){fltMinP=Math.max(FLT_PMIN,Math.min(v,fltMaxP-1));}else{fltMaxP=Math.min(FLT_PMAX,Math.max(v,fltMinP+1));}var el=document.getElementById("flt-"+w+"-inp");if(el)el.value=(w==="min"?fltMinP:fltMaxP);updateSlider();applyFilters();}
function startDrag(thumb,e){e.preventDefault();fltDrag=thumb;document.addEventListener("mousemove",onDrag);document.addEventListener("mouseup",stopDrag);document.addEventListener("touchmove",onDrag,{passive:false});document.addEventListener("touchend",stopDrag);}
function onDrag(e){if(!fltDrag)return;e.preventDefault();var x=e.type==="touchmove"?e.touches[0].clientX:e.clientX;var wrap=document.getElementById("flt-slider-wrap");if(!wrap)return;var rect=wrap.getBoundingClientRect();var pct=Math.max(0,Math.min(1,(x-rect.left)/rect.width));var val=Math.round(FLT_PMIN+(FLT_PMAX-FLT_PMIN)*pct);if(fltDrag==="thumb1"){fltMinP=Math.max(FLT_PMIN,Math.min(val,fltMaxP-1));}else{fltMaxP=Math.min(FLT_PMAX,Math.max(val,fltMinP+1));}updateSlider();applyFilters();}
function stopDrag(){fltDrag=null;document.removeEventListener("mousemove",onDrag);document.removeEventListener("mouseup",stopDrag);document.removeEventListener("touchmove",onDrag);document.removeEventListener("touchend",stopDrag);}

