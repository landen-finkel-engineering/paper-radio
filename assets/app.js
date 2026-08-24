/* ================= Paper Radio ================= */
(function(){
"use strict";
var $=function(s,r){return (r||document).querySelector(s);};
var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
var APP=$("#app");
var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

function toast(msg,ms){var t=$("#toast");t.textContent=msg;t.classList.add("show");
  clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove("show");},ms||2600);}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function clamp(v,a,b){return v<a?a:v>b?b:v;}
function fmtTime(sec){sec=Math.max(0,Math.round(sec));var h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;
  return h? h+"h "+m+"m" : m? m+"m "+(s<10?"0":"")+s+"s" : s+"s";}

/* ---------------- 1. TEXT NORMALISATION ---------------- */
var LIG={"ﬀ":"ff","ﬁ":"fi","ﬂ":"fl","ﬃ":"ffi","ﬄ":"ffl","ﬅ":"st","ﬆ":"st"};
function normChars(s){
  return s.replace(/[ﬀ-ﬆ]/g,function(c){return LIG[c]||c;})
          .replace(/­/g,"")            /* soft hyphen */
          .replace(/[‘’‛]/g,"'")
          .replace(/[“”]/g,'"')
          .replace(/[‐‑]/g,"-")
          .replace(/⁄/g,"/")
          .replace(/[   ]/g," ")
          .replace(/[​-‍﻿]/g,"")
          .replace(/|•|▪|●/g,"•");
}

/* ---------------- 2. PDF -> LINES ---------------- */
function parseItems(items){
  var raw=[],i,it;
  for(i=0;i<items.length;i++){
    it=items[i];
    if(!it||typeof it.str!=="string"||!it.str.trim()) continue;
    var tr=it.transform||[1,0,0,1,0,0];
    var h=Math.abs(it.height)||Math.abs(tr[3])||10;
    raw.push({str:it.str,x:tr[4],y:tr[5],w:it.width||0,h:h,font:it.fontName||""});
  }
  return raw;
}
function groupRows(raw){
  var i,rows=[],cur=null;
  raw=raw.slice().sort(function(a,b){
    var dy=b.y-a.y;
    if(Math.abs(dy)>Math.max(1.4,0.32*Math.max(a.h,b.h))) return dy;
    return a.x-b.x;
  });
  for(i=0;i<raw.length;i++){
    var it=raw[i],tol=Math.max(1.6,0.42*it.h);
    if(cur&&Math.abs(cur.y-it.y)<=tol){ cur.items.push(it); if(it.h>cur.h)cur.h=it.h; }
    else { cur={y:it.y,h:it.h,items:[it]}; rows.push(cur); }
  }
  return rows;
}
function assembleRows(rows,pageH){
  var out=[],i,j;
  for(i=0;i<rows.length;i++){
    var L=rows[i]; L.items.sort(function(a,b){return a.x-b.x;});
    var txt="",end=null,minX=1e9,maxX=-1e9,fonts={};
    for(j=0;j<L.items.length;j++){
      var p=L.items[j];
      if(end!==null && (p.x-end)>p.h*0.20 && !/\s$/.test(txt) && !/^\s/.test(p.str)) txt+=" ";
      txt+=p.str; end=p.x+p.w;
      if(p.x<minX)minX=p.x; if(p.x+p.w>maxX)maxX=p.x+p.w;
      fonts[p.font]=(fonts[p.font]||0)+p.str.length;
    }
    txt=normChars(txt).replace(/\s+/g," ").trim();
    if(!txt) continue;
    var domFont="",best=0;
    for(var f in fonts){ if(fonts[f]>best){best=fonts[f];domFont=f;} }
    out.push({text:txt,y:L.y,h:L.h,x:minX,w:maxX-minX,right:maxX,font:domFont,rel:L.y/pageH});
  }
  return out;
}
function linesFrom(raw,pageH){ return assembleRows(groupRows(raw),pageH); }

/* Column layout is decided once for the whole document from an x-coverage
   histogram: a real gutter is a vertical band the text never crosses. */
var NBINS=120;
function addCoverage(bins,raw,pageW){
  for(var i=0;i<raw.length;i++){
    var it=raw[i]; if(it.w<=0) continue;
    var a=clamp(Math.floor(it.x/pageW*NBINS),0,NBINS-1),
        b=clamp(Math.ceil((it.x+it.w)/pageW*NBINS),1,NBINS);
    for(var k=a;k<b;k++) bins[k]++;
  }
}
function decideGutter(bins){
  var i,vals=[];
  for(i=Math.floor(NBINS*0.12);i<Math.ceil(NBINS*0.88);i++) vals.push(bins[i]);
  var med=median(vals);
  if(med<10) return null;
  var thresh=Math.max(1,med*0.22),lo=Math.floor(NBINS*0.30),hi=Math.ceil(NBINS*0.70);
  var bestS=-1,bestL=0,run=-1;
  for(i=lo;i<hi;i++){
    if(bins[i]<=thresh){ if(run<0) run=i; }
    else { if(run>=0&&i-run>bestL){ bestL=i-run; bestS=run; } run=-1; }
  }
  if(run>=0&&hi-run>bestL){ bestL=hi-run; bestS=run; }
  if(bestS<0||bestL<NBINS*0.02) return null;
  var left=0,ln=0,right=0,rn=0;
  for(i=Math.floor(NBINS*0.05);i<Math.ceil(NBINS*0.95);i++){
    if(i<bestS){ left+=bins[i]; ln++; }
    else if(i>=bestS+bestL){ right+=bins[i]; rn++; }
  }
  if(!ln||!rn) return null;
  if(left/ln<med*0.45||right/rn<med*0.45) return null;
  return {s:bestS/NBINS,e:(bestS+bestL)/NBINS,m:(bestS+bestL/2)/NBINS};
}
function linesForPage(raw,pageW,pageH,g){
  if(!raw.length) return [];
  if(!g) return linesFrom(raw,pageH);
  var gw=(g.e-g.s)*pageW, inset=Math.max(2,gw*0.25);
  var gs=g.s*pageW+inset, ge=g.e*pageW-inset, gm=g.m*pageW;
  if(ge<=gs){ gs=gm-1; ge=gm+1; }
  var rows=groupRows(raw),out=[],pending=[],i,j;
  function flush(){
    if(!pending.length) return;
    var A=[],B=[];
    for(var a=0;a<pending.length;a++){
      var its=pending[a].items;
      for(var b=0;b<its.length;b++){ ((its[b].x+its[b].x+its[b].w)/2<gm?A:B).push(its[b]); }
    }
    if(A.length&&B.length) out=out.concat(linesFrom(A,pageH),linesFrom(B,pageH));
    else out=out.concat(linesFrom(A.concat(B),pageH));
    pending=[];
  }
  for(i=0;i<rows.length;i++){
    var r=rows[i],cross=false;
    for(j=0;j<r.items.length;j++){
      var it=r.items[j];
      if(it.x<ge&&it.x+it.w>gs){ cross=true; break; }
    }
    if(cross){ flush(); out=out.concat(assembleRows([r],pageH)); }
    else pending.push(r);
  }
  flush();
  return out;
}

/* ---------------- 3. RUNNING HEADS / FOLIOS ---------------- */
var PAGENUM=/^(?:[-–—•\s]*)(?:page\s*)?(?:\d{1,4}|[ivxlcdm]{1,7})(?:\s*(?:of|\/)\s*\d{1,4})?(?:[-–—•\s]*)$/i;
function stripFurniture(pages){
  var key=function(s){return s.toLowerCase().replace(/\d+/g,"#").replace(/[^a-z#\s]/g,"").replace(/\s+/g," ").trim();};
  var bands={},i,j;
  for(i=0;i<pages.length;i++){
    var pg=pages[i];
    for(j=0;j<pg.lines.length;j++){
      var L=pg.lines[j];
      var zone = L.rel>=0.885 ? "t" : (L.rel<=0.115 ? "b" : null);
      if(!zone) continue;
      var k=zone+"|"+key(L.text);
      if(k.length<4) continue;
      (bands[k]||(bands[k]={}))[pg.num]=1;
    }
  }
  var need=Math.max(2,Math.ceil(pages.length*0.45));
  var repeat={};
  for(var k2 in bands){ if(Object.keys(bands[k2]).length>=need) repeat[k2]=1; }
  var dropped=0;
  for(i=0;i<pages.length;i++){
    var p=pages[i],keep=[];
    for(j=0;j<p.lines.length;j++){
      var Ln=p.lines[j];
      var z = Ln.rel>=0.885 ? "t" : (Ln.rel<=0.115 ? "b" : null);
      if(z){
        if(repeat[z+"|"+key(Ln.text)]){dropped++;continue;}
        if(PAGENUM.test(Ln.text)&&Ln.text.length<=22){dropped++;continue;}
      }
      keep.push(Ln);
    }
    p.lines=keep;
  }
  return dropped;
}

/* ---------------- 5. LINES -> BLOCKS ---------------- */
function median(a){ if(!a.length) return 0; var b=a.slice().sort(function(x,y){return x-y;}); return b[Math.floor(b.length/2)]; }
var HEADPAT=/^(chapter|section|part|appendix|article|annex|abstract|introduction|conclusion|references|bibliography|acknowledg|summary|contents|index|figure|table)\b/i;

function toBlocks(pages){
  var all=[],i,j;
  for(i=0;i<pages.length;i++) for(j=0;j<pages[i].lines.length;j++){
    var L=pages[i].lines[j]; L.page=pages[i].num; all.push(L);
  }
  if(!all.length) return [];
  var hs=all.map(function(l){return l.h;});
  var medH=median(hs)||10;
  var rights=all.filter(function(l){return l.text.length>25;}).map(function(l){return l.right;});
  var bodyRight=rights.length? median(rights) : 1e9;
  var gaps=[];
  for(i=1;i<all.length;i++){ if(all[i].page===all[i-1].page){ var g=all[i-1].y-all[i].y; if(g>0&&g<120) gaps.push(g); } }
  var medGap=median(gaps)||medH*1.35;

  function isHeading(L,prev){
    var t=L.text;
    if(t.length>150) return false;
    var big=L.h>=medH*1.14;
    var words=t.split(/\s+/).length;
    var fills=L.right>=bodyRight-medH*0.9;   /* line runs the full measure => wrapped body text */
    if(big && words<=22 && !(fills&&words>12)) return true;
    if(fills) return false;
    if(HEADPAT.test(t) && words<=14 && !/[.!?]$/.test(t)) return true;
    if(/^\d+(\.\d+)*\.?\s+\S/.test(t) && words<=14 && !/[.!?;,]$/.test(t) && L.h>=medH*1.02) return true;
    if(/^[A-Z0-9 .,'’&()\/-]{6,60}$/.test(t) && /[A-Z]{3}/.test(t) && words<=12 && !/[.!?]$/.test(t) && (!prev||prev.h<=L.h)) return true;
    return false;
  }
  var blocks=[],cur=null;
  for(i=0;i<all.length;i++){
    var L=all[i],prev=all[i-1];
    var brk=false;
    if(!cur) brk=true;
    else if(L.page!==prev.page) brk = !(/[a-z,;:’')—-]$/.test(prev.text) && /^[a-z(]/.test(L.text));
    else{
      var vgap=prev.y-L.y;
      if(vgap<=0) brk=ENDER.test(prev.text);            /* jumped to the next column */
      else if(vgap>medGap*1.42) brk=true;
      else if(Math.abs(L.h-prev.h)>medH*0.22) brk=true;
      else if(ENDER.test(prev.text) && prev.right < bodyRight-medH*1.6) brk=true;
      else if(/^([\u2022\u25aa\u25cf\-\u2013]\s|\(?\d{1,2}[.)]\s|[a-z]\)\s)/.test(L.text)) brk=true;
      else if(L.x > (cur.x||L.x)+medH*1.1) brk=true;
    }

    var head=isHeading(L,prev);
    if(head||(cur&&cur.head)) brk=true;
    if(brk){ cur={type:head?"heading":"para",lines:[L],page:L.page,x:L.x,head:head}; blocks.push(cur); }
    else cur.lines.push(L);
  }
  var out=[];
  for(i=0;i<blocks.length;i++){
    var b=blocks[i],txt="";
    for(j=0;j<b.lines.length;j++){
      var s=b.lines[j].text;
      if(j===0){ txt=s; continue; }
      if(/[a-zÀ-ɏ]-$/.test(txt) && /^[a-zÀ-ɏ]/.test(s)) txt=txt.slice(0,-1)+s;
      else txt+=" "+s;
    }
    txt=txt.replace(/\s+/g," ").replace(/\s+([,.;:!?)])/g,"$1").trim();
    if(txt.length<2) continue;
    if(b.type==="para" && txt.length<=22 && PAGENUM.test(txt)) continue;
    out.push({type:b.type,text:txt,page:b.page});
  }
  return out;
}

/* ---------------- 6. SENTENCES ---------------- */
var ABBR=("mr mrs ms dr prof sr jr st mt rev hon gen col capt sgt lt fig figs eq eqs no nos vol vols "+
"ch chap sec secs art pp p pt approx est dept univ inc ltd co corp llc etc vs al ca cf ibid ed eds "+
"jan feb mar apr jun jul aug sept sep oct nov dec mon tue wed thu fri sat sun min max avg ref refs "+
"trans repr rev'd ph.d m.d b.a m.a b.s m.s e.g i.e a.m p.m u.s u.k u.n e.u i.q op cit").split(" ");
var ABBRSET={};ABBR.forEach(function(a){ABBRSET[a]=1;});
var ENDER=/[.!?…]+["'")\]\u2019\u201d]*$/;

function splitSentences(text){
  var out=[],start=0,re=/([.!?…]+)(["'\u2019\u201d)\]]*)(\s+|$)/g,m;
  while((m=re.exec(text))){
    var end=m.index+m[0].length, punct=m[1], cutAt=m.index+m[1].length+m[2].length;
    var before=text.slice(start,m.index);
    var lastWord=(before.match(/([A-Za-z0-9'\u2019.\-]+)$/)||["",""])[1];
    var after=text.slice(end,end+3);
    var split=true;
    if(punct==="."){
      var lw=lastWord.toLowerCase().replace(/[^a-z.']/g,"");
      if(ABBRSET[lw]||ABBRSET[lw.replace(/\.+$/,"")]) split=false;
      else if(/^[A-Z]$/.test(lastWord)) split=false;
      else if(/(^|[^A-Za-z])([A-Za-z]\.){1,4}$/.test(before)) split=false;
      else if(/^\d+$/.test(lastWord) && /^[a-z(]/.test(after)) split=false;
      else if(/^[a-z]/.test(after) && !/^\s*$/.test(after)) split=false;
    }
    if(m[3]==="") split=true;
    if(split){
      var s=text.slice(start,cutAt).trim();
      if(s) out.push(s);
      start=end;
    }
  }
  var tail=text.slice(start).trim();
  if(tail) out.push(tail);
  return out;
}
function chunkLong(s,limit){
  if(s.length<=limit) return [s];
  var raw=s.split(/([;:,]\s+)/),bits=[],i;
  for(i=0;i<raw.length;i+=2){ var seg=(raw[i]||"")+(raw[i+1]||""); if(seg) bits.push(seg); }
  if(bits.length<2){
    var ws=s.split(/\s+/); bits=[];
    for(i=0;i<ws.length;i+=26) bits.push(ws.slice(i,i+26).join(" ")+" ");
  }
  var parts=[],buf="";
  for(i=0;i<bits.length;i++){
    var cand=buf+bits[i];
    if(cand.trim().length>limit && buf.trim().length>=90){ parts.push(buf.trim()); buf=bits[i]; }
    else buf=cand;
  }
  if(buf.trim()) parts.push(buf.trim());
  return parts.length?parts:[s];
}

function buildSentences(blocks){
  var sents=[],sections=[],secIdx=-1,i,j;
  for(i=0;i<blocks.length;i++){
    var b=blocks[i];
    if(b.type==="heading"){
      secIdx=sections.length;
      sections.push({title:b.text,page:b.page,from:sents.length,to:sents.length});
    }
    var raw=splitSentences(b.text),k=0;
    for(j=0;j<raw.length;j++){
      var pieces=chunkLong(raw[j],320);
      for(var q=0;q<pieces.length;q++){
        sents.push({i:sents.length,text:pieces[q],page:b.page,block:i,sec:secIdx,
                    head:b.type==="heading",ord:k++,words:pieces[q].split(/\s+/).length});
      }
    }
    if(secIdx>=0) sections[secIdx].to=sents.length;
  }
  return {sents:sents,sections:sections};
}

/* ---------------- 8. STATE ---------------- */
var SS=window.speechSynthesis;
var ST={model:null,queue:[],idx:0,playing:false,
        rate:1,pitch:1,vol:1,gap:0,voiceURI:null,size:19.5,spans:[],token:0,
        lastEvent:0,autoScroll:true,scrollLock:0,voices:[],
        marks:[],markIndex:{},color:"butter",filter:"all"};
var LSKEY="paperradio.v2";
var MKEY="paperradio.marks.v1";

function prefsLoad(){
  try{ var p=JSON.parse(localStorage.getItem(LSKEY+".prefs")||"{}");
    ["rate","pitch","vol","gap","size"].forEach(function(k){ if(typeof p[k]==="number") ST[k]=p[k]; });
    if(p.voiceURI) ST.voiceURI=p.voiceURI;
    if(p.color) ST.color=p.color;
  }catch(e){}
}
function prefsSave(){
  try{ localStorage.setItem(LSKEY+".prefs",JSON.stringify({rate:ST.rate,pitch:ST.pitch,vol:ST.vol,
    gap:ST.gap,size:ST.size,voiceURI:ST.voiceURI,color:ST.color})); }catch(e){}
}
function libLoad(){ try{ return JSON.parse(localStorage.getItem(LSKEY)||"[]"); }catch(e){ return []; } }
function libSave(list){
  for(var trim=0;trim<6;trim++){
    try{ localStorage.setItem(LSKEY,JSON.stringify(list)); return true; }
    catch(e){
      var dropped=false;
      for(var i=list.length-1;i>=0;i--){ if(list[i].blocks){ delete list[i].blocks; dropped=true; break; } }
      if(!dropped){ if(list.length>1) list.pop(); else return false; }
    }
  }
  return false;
}
function libTouch(){
  if(!ST.model) return;
  var list=libLoad().filter(function(e){return e.id!==ST.model.id;});
  var entry={id:ST.model.id,title:ST.model.title,pages:ST.model.pages,words:ST.model.words,
             sents:ST.model.sents.length,idx:ST.idx,at:Date.now()};
  var payload=JSON.stringify(ST.model.blocks);
  if(payload.length<640000) entry.blocks=ST.model.blocks;
  list.unshift(entry);
  libSave(list.slice(0,10));
}

/* ---------------- 9. VOICES ---------------- */
function loadVoices(){
  var v=SS?SS.getVoices():[];
  if(!v||!v.length) return false;
  ST.voices=v.slice().sort(function(a,b){
    var al=a.lang||"",bl=b.lang||"";
    if(al===bl) return (a.name||"").localeCompare(b.name||"");
    var pref=(navigator.language||"en-US");
    var ap=al.slice(0,2)===pref.slice(0,2)?0:1, bp=bl.slice(0,2)===pref.slice(0,2)?0:1;
    if(ap!==bp) return ap-bp;
    return al.localeCompare(bl);
  });
  var sel=$("#voice"); sel.innerHTML="";
  var groups={},order=[];
  ST.voices.forEach(function(vo){
    var g=(vo.lang||"??");
    if(!groups[g]){groups[g]=[];order.push(g);}
    groups[g].push(vo);
  });
  order.forEach(function(g){
    var og=document.createElement("optgroup"); og.label=g;
    groups[g].forEach(function(vo){
      var o=document.createElement("option");
      o.value=vo.voiceURI; o.textContent=vo.name+(vo.localService?"":" (online)");
      og.appendChild(o);
    });
    sel.appendChild(og);
  });
  if(!ST.voiceURI || !ST.voices.some(function(v2){return v2.voiceURI===ST.voiceURI;})){
    var pref=(navigator.language||"en-US").slice(0,2);
    var best=ST.voices.filter(function(v2){return (v2.lang||"").slice(0,2)===pref;});
    var local=best.filter(function(v2){return v2.localService;});
    ST.voiceURI=((local[0]||best[0]||ST.voices[0])||{}).voiceURI||null;
  }
  if(ST.voiceURI) sel.value=ST.voiceURI;
  return true;
}
function currentVoice(){
  for(var i=0;i<ST.voices.length;i++) if(ST.voices[i].voiceURI===ST.voiceURI) return ST.voices[i];
  return null;
}

/* ---------------- 10. PLAYER ---------------- */
function meterKick(){
  if(REDUCED) return;
  var bars=$$("#meter i");
  for(var i=0;i<bars.length;i++){
    var h=25+Math.random()*70;
    bars[i].style.height=h.toFixed(0)+"%";
  }
}
function meterIdle(){ $$("#meter i").forEach(function(b){b.style.height="18%";}); }

function setPlaying(on){
  ST.playing=on;
  APP.setAttribute("data-playing",on?"1":"0");
  var ic=$("#playIcon"),btn=$("#play");
  ic.innerHTML=on?'<rect x="5" y="3.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="10" y="3.5" width="3" height="11" rx="1" fill="currentColor"/>'
                 :'<path d="M5.5 3.5l9 5.5-9 5.5z" fill="currentColor"/>';
  btn.setAttribute("aria-label",on?"Pause":"Play");
  btn.title=on?"Pause (space)":"Play (space)";
  if(!on) meterIdle();
}
function itemEl(i){ var it=ST.queue[i]; return it?it.el:null; }

function paintActive(i){
  var prev=$(".s.on");
  if(prev){ prev.classList.remove("on"); prev.innerHTML=sentHTML(+prev.dataset.i); }
  var el=itemEl(i);
  if(!el) return;
  el.classList.add("on");
  {
    var from=ST.doneUpTo||0,j;
    if(i>from){ for(j=from;j<i;j++){ if(ST.spans[j]) ST.spans[j].classList.add("done"); } }
    else if(i<from){ for(j=i;j<from;j++){ if(ST.spans[j]) ST.spans[j].classList.remove("done"); } }
    ST.doneUpTo=i;
  }
  scrollTo(el);
}
function scrollTo(el,force){
  if(!el) return;
  if(!force && (!ST.autoScroll || Date.now()<ST.scrollLock)) { $("#jump").classList.add("show"); return; }
  var host=el.closest("#stage")?$("#stage"):el.closest(".sum-body");
  if(!host) return;
  var hr=host.getBoundingClientRect(), er=el.getBoundingClientRect();
  var target=host.scrollTop+(er.top-hr.top)-hr.height*0.38;
  if(Math.abs(er.top-hr.top-hr.height*0.38)<hr.height*0.16 && !force) return;
  ST.scrollLock=0;
  ST.programmatic=Date.now();
  host.scrollTo({top:Math.max(0,target),behavior:REDUCED?"auto":"smooth"});
  $("#jump").classList.remove("show");
}
function sentHTML(i,wr){
  var text=ST.model.sents[i].text, segs=ST.markIndex[i];
  if((!segs||!segs.length)&&!wr) return esc(text);
  var n=text.length,col=new Array(n),ids=new Array(n),k,j;
  if(segs) for(k=0;k<segs.length;k++){
    var sg=segs[k],a=Math.max(0,sg.a),b=Math.min(n,sg.b);
    for(j=a;j<b;j++){ col[j]=sg.color; ids[j]=sg.id; }
  }
  var out="";k=0;
  while(k<n){
    var c=col[k],id=ids[k],w=!!(wr&&k>=wr[0]&&k<wr[1]);
    j=k+1;
    while(j<n && col[j]===c && ids[j]===id && (!!(wr&&j>=wr[0]&&j<wr[1]))===w) j++;
    var chunk=esc(text.slice(k,j));
    if(c) out+='<mark class="hl '+c+(w?" w":"")+'" data-hl="'+id+'">'+chunk+"</mark>";
    else if(w) out+='<mark class="w">'+chunk+"</mark>";
    else out+=chunk;
    k=j;
  }
  return out;
}
function paintWord(i,ci,cl,text){
  var el=itemEl(i); if(!el||ci<0||ci>=text.length) return;
  var end=cl?ci+cl:(function(){ var m=text.slice(ci).match(/^\S+/); return ci+(m?m[0].length:0); })();
  el.innerHTML=sentHTML(i,[ci,end]);
}
function clearWord(i){ var el=itemEl(i); if(el) el.innerHTML=sentHTML(i); }
function speakAt(i,resume){
  if(!SS) return;
  if(i<0) i=0;
  if(i>=ST.queue.length){ stop(true); return; }
  ST.idx=i; ST.token++;
  var token=ST.token;
  paintActive(i); updateReadout();
  if(!ST.playing) return;
  var text=ST.queue[i].text;
  try{ SS.cancel(); }catch(e){}
  setTimeout(function(){
    if(token!==ST.token||!ST.playing) return;
    var u=new SpeechSynthesisUtterance(text);
    var v=currentVoice();
    if(v){ try{ u.voice=v; }catch(e){} if(v.lang) u.lang=v.lang; }
    u.rate=clamp(ST.rate,0.1,10); u.pitch=ST.pitch; u.volume=ST.vol;
    ST.lastEvent=Date.now();
    u.onstart=function(){ ST.lastEvent=Date.now(); };
    u.onboundary=function(e){
      ST.lastEvent=Date.now();
      if(e.name&&e.name!=="word"&&e.name!=="sentence") return;
      meterKick();
      paintWord(i,e.charIndex,e.charLength,text);
    };
    u.onend=function(){
      if(token!==ST.token||!ST.playing) return;
      ST.lastEvent=Date.now();
      clearWord(i);
      if(ST.gap>0) setTimeout(function(){ if(token===ST.token&&ST.playing) speakAt(i+1); },ST.gap);
      else speakAt(i+1);
    };
    u.onerror=function(e){
      if(token!==ST.token) return;
      var err=(e&&e.error)||"";
      if(err==="interrupted"||err==="canceled") return;
      if(err==="not-allowed"){ setPlaying(false); toast("Your browser blocked speech until you interact with the page — press play again."); return; }
      ST.lastEvent=Date.now();
      if(ST.playing) setTimeout(function(){ if(token===ST.token&&ST.playing) speakAt(i+1); },120);
    };
    ST._u=u;
    try{ SS.speak(u); }catch(err){ toast("Speech engine refused that sentence — skipping."); speakAt(i+1); }
  },resume?0:45);
}
function play(){
  if(!ST.queue.length) return;
  if(!SS){ toast("This browser has no speech synthesis."); return; }
  setPlaying(true); speakAt(ST.idx);
}
function pause(){
  setPlaying(false); ST.token++;
  try{ SS.cancel(); }catch(e){}
  clearWord(ST.idx); var el=itemEl(ST.idx); if(el) el.classList.add("on");
  libTouch();
}
function stop(finished){
  setPlaying(false); ST.token++;
  try{ SS.cancel(); }catch(e){}
  if(finished){ toast("That's the end of the document."); ST.idx=Math.max(0,ST.queue.length-1); paintActive(ST.idx); }
  libTouch(); updateReadout();
}
function toggle(){ ST.playing?pause():play(); }
function jump(delta){
  var target=clamp(ST.idx+delta,0,ST.queue.length-1);
  ST.scrollLock=0; ST.autoScroll=true;
  if(ST.playing) speakAt(target); else { ST.idx=target; paintActive(target); scrollTo(itemEl(target),true); updateReadout(); }
}
function jumpToIndex(i,startPlaying){
  i=clamp(i,0,ST.queue.length-1);
  ST.scrollLock=0; ST.autoScroll=true;
  if(startPlaying&&!ST.playing) setPlaying(true);
  if(ST.playing) speakAt(i);
  else { ST.idx=i; paintActive(i); scrollTo(itemEl(i),true); updateReadout(); }
}
function jumpPage(dir){
  if(!ST.model) return;
  var cur=ST.model.sents[ST.idx]?ST.model.sents[ST.idx].page:1;
  var target=clamp(cur+dir,1,ST.model.pages);
  var sents=ST.model.sents,i;
  if(dir<0){
    var startOfCur=-1;
    for(i=0;i<sents.length;i++) if(sents[i].page===cur){startOfCur=i;break;}
    if(startOfCur>=0&&ST.idx>startOfCur+1) target=cur;
  }
  for(i=0;i<sents.length;i++) if(sents[i].page>=target){ jumpToIndex(i,false); return; }
  jumpToIndex(sents.length-1,false);
}

/* watchdog: browsers silently drop long utterances */
setInterval(function(){
  if(!ST.playing||!SS) return;
  var quiet=Date.now()-ST.lastEvent;
  if(SS.speaking&&quiet>5000){ try{ SS.pause(); SS.resume(); }catch(e){} ST.lastEvent=Date.now()-3000; }
  else if(!SS.speaking&&!SS.pending&&quiet>1800){ speakAt(ST.idx+1); }
},1500);

/* ---------------- 11. READOUT ---------------- */
function wpsEstimate(){ return 2.75*clamp(ST.rate,0.3,4); }
function updateReadout(){
  var m=ST.model; if(!m) return;
  var total=ST.queue.length||1;
  var pct=total>1?(ST.idx/(total-1))*100:0;
  $("#railFill").style.width=pct.toFixed(2)+"%";
  $("#rail").setAttribute("aria-valuenow",Math.round(pct));
  var sn=m.sents[ST.idx];
  $("#posNow").textContent="p."+(sn?sn.page:1)+" / "+m.pages;
  var left=0;
  for(var i=ST.idx;i<m.sents.length;i++) left+=m.sents[i].words;
  $("#posLeft").textContent=fmtTime(left/wpsEstimate())+" left";
}
function setSize(px){
  ST.size=clamp(px,15,30);
  $("#doc").style.setProperty("--read-size",ST.size+"px");
  prefsSave();
}

/* ---------------- 12. RENDER DOCUMENT ---------------- */
function renderDoc(){
  var m=ST.model,html=[],i,curPage=0,openTag=null;
  var byBlock={};
  for(i=0;i<m.sents.length;i++){ (byBlock[m.sents[i].block]||(byBlock[m.sents[i].block]=[])).push(m.sents[i]); }
  for(var b=0;b<m.blocks.length;b++){
    var blk=m.blocks[b],list=byBlock[b];
    if(!list||!list.length) continue;
    if(blk.page!==curPage){
      if(curPage!==0) html.push('<div class="brk"><span>Page '+blk.page+'</span></div>');
      curPage=blk.page;
    }
    var inner=list.map(function(s){ return '<span class="s" data-i="'+s.i+'">'+sentHTML(s.i)+"</span>"; }).join(" ");
    html.push(blk.type==="heading"?'<h2 class="hd">'+inner+"</h2>":'<p class="pg">'+inner+"</p>");
  }
  var doc=$("#doc");
  doc.innerHTML=html.join("")||'<p class="pg">No readable text found.</p>';
  if(m.warning) doc.insertAdjacentHTML("afterbegin",'<div class="note"><b>Heads up.</b> '+esc(m.warning)+"</div>");
  ST.spans=[];
  $$("#doc .s").forEach(function(el){ ST.spans[+el.dataset.i]=el; });
  ST.queue=m.sents.map(function(s){ return {text:s.text,el:ST.spans[s.i]}; });
  ST.doneUpTo=0;
  /* page ticks on the rail */
  var ticks=[],seen={},step=Math.max(1,Math.ceil(m.pages/42));
  for(i=0;i<m.sents.length;i++){
    var p=m.sents[i].page;
    if(!seen[p]&&p%step===0){ seen[p]=1; ticks.push('<i style="left:'+((i/(m.sents.length-1||1))*100).toFixed(2)+'%"></i>'); }
  }
  $("#railTicks").innerHTML=ticks.join("");
  $("#docTitle").textContent=m.title;
  $("#docStats").textContent=m.pages+" pages · "+m.words.toLocaleString()+" words · "+fmtTime(m.words/wpsEstimate())+" read";
}

/* ---------------- 15. LOADING A PDF ---------------- */
function overlay(html){ var o=$("#overlay"); $("#ovCard").innerHTML=html; o.classList.add("open"); }
function overlayClose(){ $("#overlay").classList.remove("open"); }
function progress(pct,label){
  var b=$("#ovBar"),l=$("#ovLabel");
  if(b) b.style.width=clamp(pct,0,100).toFixed(1)+"%";
  if(l) l.textContent=label;
}
function buildModel(blocks,meta){
  var m=buildSentences(blocks);
  var plain=blocks.map(function(b){return b.text;}).join("\n");
  var words=plain.split(/\s+/).filter(Boolean).length;
  var model={id:meta.id,title:meta.title,pages:meta.pages,blocks:blocks,plain:plain,words:words,
             sents:m.sents,sections:m.sections,warning:meta.warning||null};
  return model;
}
function niceTitle(model,fallback){
  for(var i=0;i<model.blocks.length&&i<6;i++){
    var b=model.blocks[i];
    if(b.type==="heading"&&b.text.length>6&&b.text.length<110) return b.text;
  }
  return fallback;
}
function openArrayBuffer(buf,name,password){
  var t0=Date.now();
  overlay('<h3>Reading the file</h3><p id="ovLabel">Opening…</p><div class="bar"><i id="ovBar"></i></div>');
  var bytes=(buf instanceof ArrayBuffer)?new Uint8Array(buf.slice(0)):new Uint8Array(buf);
  var task=pdfjsLib.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:false,
                                 disableFontFace:true,password:password||undefined,verbosity:0});
  task.promise.then(function(pdf){
    var pages=[],n=pdf.numPages,chars=0;
    var bins=new Float64Array(NBINS),buffer=[],gutter,decided=false;
    var sampleUntil=Math.min(n,10);
    function emit(raw,num,w,h){
      var lines=linesForPage(raw,w,h,gutter);
      for(var k=0;k<lines.length;k++) chars+=lines[k].text.length;
      pages.push({num:num,lines:lines,height:h,width:w});
    }
    function decide(){
      gutter=decideGutter(bins); decided=true;
      for(var b=0;b<buffer.length;b++) emit(buffer[b].raw,buffer[b].num,buffer[b].w,buffer[b].h);
      buffer=[];
    }
    function step(i){
      if(i>n){ if(!decided) decide(); return finish(); }
      progress((i-1)/n*88,"Page "+i+" of "+n);
      return pdf.getPage(i).then(function(pg){
        var vp=pg.getViewport({scale:1});
        return pg.getTextContent().then(function(tc){
          var raw=parseItems(tc.items);
          if(!decided){
            addCoverage(bins,raw,vp.width);
            buffer.push({raw:raw,num:i,w:vp.width,h:vp.height});
            if(i>=sampleUntil) decide();
          } else emit(raw,i,vp.width,vp.height);
          pg.cleanup&&pg.cleanup();
          return new Promise(function(r){ (i%4===0?setTimeout:queueMicrotask)(function(){r(step(i+1));},0); });
        });
      });
    }
    function finish(){
      progress(92,"Sorting out the text…");
      stripFurniture(pages);
      var blocks=toBlocks(pages);
      var warning=null;
      if(chars<Math.max(60,n*22)){
        warning="This PDF has almost no text layer — it looks like a scan or images of pages. A reader can only speak text it can actually read, so you'd need to run OCR on it first.";
      }
      var id=name+"|"+(buf.byteLength||bytes.length)+"|"+n;
      var model=buildModel(blocks,{id:id,title:name.replace(/\.pdf$/i,""),pages:n,warning:warning});
      model.title=niceTitle(model,model.title);
      progress(100,"Ready");
      mountModel(model);
      pdf.destroy&&pdf.destroy();
      if(!warning) toast("Read "+model.pages+" pages in "+((Date.now()-t0)/1000).toFixed(1)+"s");
    }
    step(1).catch(fail);
  }).catch(function(err){
    if(err&&err.name==="PasswordException"){ askPassword(buf,name); return; }
    fail(err);
  });
  function fail(err){
    console.error(err);
    overlay('<h3>That PDF wouldn’t open</h3><p>'+esc((err&&err.message)||"Unknown error")+
      '</p><button class="btn" id="ovOk">Back</button>');
    $("#ovOk").onclick=overlayClose;
  }
}
function askPassword(buf,name){
  overlay('<h3>This PDF is locked</h3><p>Enter its password to continue.</p>'+
    '<input type="password" id="pw" autocomplete="off"><div style="display:flex;gap:8px;justify-content:center">'+
    '<button class="btn" id="pwGo">Unlock</button><button class="btn ghost" id="pwNo">Cancel</button></div>');
  $("#pw").focus();
  $("#pwGo").onclick=function(){ var v=$("#pw").value; overlayClose(); openArrayBuffer(buf,name,v); };
  $("#pwNo").onclick=overlayClose;
  $("#pw").onkeydown=function(e){ if(e.key==="Enter") $("#pwGo").click(); };
}
function mountModel(model){
  ST.model=model; ST.idx=0; ST.docIdx=0;
  ST.marks=marksLoadFor(model.id); sortMarks(); buildMarkIndex();
  var saved=libLoad().filter(function(e){return e.id===model.id;})[0];
  if(saved&&saved.idx>0&&saved.idx<model.sents.length) ST.idx=saved.idx;
  APP.setAttribute("data-view","reader");
  renderDoc(); renderMarks();
  paintActive(ST.idx); updateReadout(); libTouch();
  overlayClose();
  setTimeout(function(){ scrollTo(itemEl(ST.idx),true); },60);
  if(saved&&ST.idx>0) toast("Picked up at page "+(model.sents[ST.idx]?model.sents[ST.idx].page:1)+".");
}
function openFile(f){
  if(!f) return;
  if(!/pdf$/i.test(f.name)&&f.type!=="application/pdf"){ toast("That isn't a PDF."); return; }
  var fr=new FileReader();
  fr.onload=function(){ openArrayBuffer(fr.result,f.name); };
  fr.onerror=function(){ toast("Couldn't read that file."); };
  fr.readAsArrayBuffer(f);
}

/* ---------------- 16. LIBRARY ---------------- */
function renderLibrary(){
  var list=libLoad(),host=$("#recent"),ul=$("#recentList");
  if(!list.length){ host.hidden=true; return; }
  host.hidden=false;
  ul.innerHTML=list.map(function(e,i){
    var pct=e.sents?clamp(e.idx/(e.sents-1||1)*100,0,100):0;
    var C=2*Math.PI*10;
    return '<li><div style="display:flex;align-items:center">'+
      '<button class="rec" data-i="'+i+'"'+(e.blocks?"":' data-needfile="1"')+'>'+
      '<svg class="ring" viewBox="0 0 26 26"><circle class="bg" cx="13" cy="13" r="10"/>'+
      '<circle class="fg" cx="13" cy="13" r="10" stroke-dasharray="'+C.toFixed(1)+'" stroke-dashoffset="'+
      (C*(1-pct/100)).toFixed(1)+'"/></svg>'+
      '<span class="ttl">'+esc(e.title)+"</span>"+
      '<span class="meta">'+Math.round(pct)+"% · "+e.pages+" pp"+(e.blocks?"":" · needs the file")+"</span></button>"+
      '<button class="kill" data-kill="'+i+'" title="Remove" aria-label="Remove '+esc(e.title)+'">'+
      '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'+
      "</button></div></li>";
  }).join("");
}
$("#recentList").addEventListener("click",function(e){
  var kill=e.target.closest("[data-kill]");
  if(kill){ var l=libLoad(); l.splice(+kill.dataset.kill,1); libSave(l); renderLibrary(); return; }
  var rec=e.target.closest(".rec");
  if(!rec) return;
  var entry=libLoad()[+rec.dataset.i];
  if(!entry) return;
  if(!entry.blocks){ toast("That one was too big to keep. Choose the file again — it'll resume where you left off."); $("#file").click(); return; }
  var model=buildModel(entry.blocks,{id:entry.id,title:entry.title,pages:entry.pages});
  mountModel(model);
});

/* ---------------- 17. EVENTS ---------------- */
$("#pick").onclick=function(){ $("#file").click(); };
$("#file").onchange=function(e){ var f=e.target.files[0]; e.target.value=""; openFile(f); };
(function(){
  var plate=$("#plate"),zone=$("#intake"),depth=0;
  ["dragenter","dragover"].forEach(function(ev){ zone.addEventListener(ev,function(e){
    e.preventDefault(); depth++; plate.classList.add("hot"); }); });
  ["dragleave","dragend"].forEach(function(ev){ zone.addEventListener(ev,function(){
    depth=Math.max(0,depth-1); if(!depth) plate.classList.remove("hot"); }); });
  zone.addEventListener("drop",function(e){ e.preventDefault(); depth=0; plate.classList.remove("hot");
    openFile(e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]); });
  window.addEventListener("dragover",function(e){ e.preventDefault(); });
  window.addEventListener("drop",function(e){ e.preventDefault(); });
})();
$("#back").onclick=function(){ pause(); libTouch(); renderLibrary(); APP.setAttribute("data-view","intake"); };
$("#play").onclick=toggle;
$("#prevSent").onclick=function(){ jump(-1); };
$("#nextSent").onclick=function(){ jump(1); };
$("#prevPage").onclick=function(){ jumpPage(-1); };
$("#nextPage").onclick=function(){ jumpPage(1); };
$("#doc").addEventListener("click",function(e){
  var hl=e.target.closest("mark.hl");
  if(hl){ e.stopPropagation(); showTool(hl.getBoundingClientRect(),hl.dataset.hl); return; }
  if(!window.getSelection().isCollapsed) return;
  var sp=e.target.closest(".s"); if(!sp) return;
  jumpToIndex(+sp.dataset.i,true);
});
function onSelectEnd(){
  setTimeout(function(){
    if(ST.editing) return;
    var r=readSelection();
    if(!r){ if(!ST.editing) hideTool(); return; }
    ST.pending={fromS:r.fromS,fromO:r.fromO,toS:r.toS,toO:r.toO};
    showTool(r.rect,null);
  },10);
}
$("#stage").addEventListener("mouseup",onSelectEnd);
$("#stage").addEventListener("touchend",onSelectEnd);
$$("#hlTool .sw").forEach(function(b){
  b.onclick=function(){ if(ST.editing) recolorMark(ST.editing,b.dataset.color); else addMark(b.dataset.color); };
});
$("#hlNote").onclick=function(){
  var id=ST.editing;
  if(!id){ var m=addMark(ST.color); id=m&&m.id; }
  hideTool();
  if(!id) return;
  setPanel(true);
  setTimeout(function(){
    var li=$('#markList li[data-id="'+id+'"]');
    if(li) openNote(li,id);
  },120);
};
$("#hlDel").onclick=function(){ if(ST.editing) removeMark(ST.editing); };
document.addEventListener("mousedown",function(e){
  if(!e.target.closest("#hlTool")&&!e.target.closest("mark.hl")) hideTool();
});
$("#markNow").onclick=markCurrentSentence;
$$("#colorFilter button").forEach(function(b){
  b.onclick=function(){
    ST.filter=b.dataset.filter;
    $$("#colorFilter button").forEach(function(x){ x.setAttribute("aria-pressed",x===b?"true":"false"); });
    renderMarks();
  };
});
function openNote(li,id){
  var m=markById(id); if(!m||li.querySelector("textarea")) return;
  var ta=document.createElement("textarea");
  ta.value=m.note||"";
  ta.placeholder="What is worth remembering here?";
  li.querySelector(".mbody").appendChild(ta);
  ta.focus();
  var saved=false;
  function done(){ if(saved) return; saved=true; m.note=ta.value.trim(); marksSave(); renderMarks(); }
  ta.addEventListener("blur",done);
  ta.addEventListener("keydown",function(ev){
    if(ev.key==="Enter"&&(ev.metaKey||ev.ctrlKey)){ ev.preventDefault(); ta.blur(); }
    else if(ev.key==="Escape"){ ev.stopPropagation(); ta.value=m.note||""; ta.blur(); }
  });
}
$("#markList").addEventListener("click",function(e){
  var li=e.target.closest("li[data-id]"); if(!li) return;
  var id=li.dataset.id,act=e.target.closest("[data-act]");
  if(!act){ if(e.target.closest(".quote")) jumpToMark(id); return; }
  if(act.dataset.act==="del") removeMark(id);
  else if(act.dataset.act==="color") recolorMark(id,act.dataset.color);
  else if(act.dataset.act==="note") openNote(li,id);
});
$("#clearMarks").onclick=function(){
  if(!ST.marks.length) return;
  var n=ST.marks.length;
  var touched=Object.keys(ST.markIndex).map(Number);
  ST.marks=[]; buildMarkIndex(); marksSave();
  touched.forEach(function(i){ if(ST.spans[i]) ST.spans[i].innerHTML=sentHTML(i); });
  renderMarks();
  toast("Cleared "+n+" note"+(n===1?"":"s")+".");
};
$("#copyMarks").onclick=function(){ copyText(marksMarkdown(),"Notes copied."); };
$("#dlMarks").onclick=function(){
  var name=(ST.model.title||"marks").replace(/[^\w \-]+/g,"").trim().slice(0,60).replace(/\s+/g,"-").toLowerCase();
  saveFile((name||"paper-radio")+"-notes.md",marksMarkdown());
};
$("#stage").addEventListener("scroll",function(){
  if(Date.now()-(ST.programmatic||0)<900) return;   /* our own smooth scroll, not the reader's */
  if($("#hlTool").classList.contains("open")) hideTool();
  ST.scrollLock=Date.now()+6000;
  var el=itemEl(ST.idx);
  if(el){
    var r=el.getBoundingClientRect(),h=$("#stage").getBoundingClientRect();
    $("#jump").classList.toggle("show",r.bottom<h.top+20||r.top>h.bottom-20);
  }
},{passive:true});
$("#jump").onclick=function(){ ST.scrollLock=0; scrollTo(itemEl(ST.idx),true); };
(function(){
  var rail=$("#rail"),drag=false;
  function seek(e){
    var r=rail.getBoundingClientRect();
    var x=((e.touches?e.touches[0].clientX:e.clientX)-r.left)/r.width;
    jumpToIndex(Math.round(clamp(x,0,1)*(ST.queue.length-1)),false);
  }
  rail.addEventListener("pointerdown",function(e){ drag=true; rail.setPointerCapture(e.pointerId); seek(e); });
  rail.addEventListener("pointermove",function(e){ if(drag) seek(e); });
  rail.addEventListener("pointerup",function(){ drag=false; });
  rail.addEventListener("keydown",function(e){
    if(e.key==="ArrowLeft"){ jump(-1); e.preventDefault(); }
    if(e.key==="ArrowRight"){ jump(1); e.preventDefault(); }
  });
})();
$("#voice").onchange=function(e){
  ST.voiceURI=e.target.value; prefsSave();
  if(ST.playing) speakAt(ST.idx);
};
function setRate(r){
  ST.rate=clamp(r,0.5,3);
  $("#rate").value=ST.rate; $("#rateVal").textContent=ST.rate.toFixed(2)+"×";
  $$(".sp").forEach(function(b){ b.setAttribute("aria-pressed",Math.abs(+b.dataset.rate-ST.rate)<0.001?"true":"false"); });
  updateReadout();
  if(ST.model) $("#docStats").textContent=ST.model.pages+" pages · "+ST.model.words.toLocaleString()+" words · "+fmtTime(ST.model.words/wpsEstimate())+" read";
  prefsSave();
  if(ST.playing) speakAt(ST.idx);
}
$$(".sp").forEach(function(b){ b.onclick=function(){ setRate(+b.dataset.rate); }; });
$("#rate").oninput=function(e){ setRate(+e.target.value); };
$("#pitch").oninput=function(e){ ST.pitch=+e.target.value; $("#pitchVal").textContent=ST.pitch.toFixed(2); prefsSave(); if(ST.playing) speakAt(ST.idx); };
$("#vol").oninput=function(e){ ST.vol=+e.target.value; $("#volVal").textContent=Math.round(ST.vol*100)+"%"; prefsSave(); if(ST.playing) speakAt(ST.idx); };
$("#gap").oninput=function(e){ ST.gap=+e.target.value; $("#gapVal").textContent=ST.gap+" ms"; prefsSave(); };
$("#tuneBtn").onclick=function(){
  var t=$("#tune"),open=!t.classList.contains("open");
  t.classList.toggle("open",open); this.setAttribute("aria-expanded",open?"true":"false");
};
document.addEventListener("click",function(e){
  if(!e.target.closest("#tune")&&!e.target.closest("#tuneBtn")){
    $("#tune").classList.remove("open"); $("#tuneBtn").setAttribute("aria-expanded","false");
  }
});
function panelOpen(){ return APP.getAttribute("data-panel")==="open"; }
function setPanel(open){
  APP.setAttribute("data-panel",open?"open":"closed");
  $("#marksBtn").setAttribute("aria-pressed",open?"true":"false");
}
$("#marksBtn").onclick=function(){ setPanel(!panelOpen()); };
$("#panelClose").onclick=function(){ setPanel(false); };
$("#sizeUp").onclick=function(){ setSize(ST.size+1.5); };
$("#sizeDown").onclick=function(){ setSize(ST.size-1.5); };
document.addEventListener("keydown",function(e){
  if(APP.getAttribute("data-view")!=="reader") return;
  var t=e.target;
  if(t&&(t.tagName==="INPUT"||t.tagName==="SELECT"||t.tagName==="TEXTAREA")) return;
  switch(e.key){
    case " ": case "k": e.preventDefault(); toggle(); break;
    case "ArrowRight": e.preventDefault(); jump(1); break;
    case "ArrowLeft": e.preventDefault(); jump(-1); break;
    case "ArrowUp": e.preventDefault(); setRate(ST.rate+0.05); break;
    case "ArrowDown": e.preventDefault(); setRate(ST.rate-0.05); break;
    case "]": jumpPage(1); break;
    case "[": jumpPage(-1); break;
    case "n": case "N": setPanel(!panelOpen()); break;
    case "m": case "M": e.preventDefault(); markCurrentSentence(); break;
    case "Escape": setPanel(false); $("#tune").classList.remove("open"); hideTool(); break;
  }
});
window.addEventListener("beforeunload",function(){ try{ libTouch(); SS&&SS.cancel(); }catch(e){} });
document.addEventListener("visibilitychange",function(){ if(document.hidden) libTouch(); });

function noVoices(msg){
  $("#voiceWrap").innerHTML='<span class="lbl" style="max-width:210px;white-space:normal;line-height:1.35">'+esc(msg)+'</span>';
}

/* ---------------- 19. MARKS ---------------- */
var COLORS=["butter","moss","sky","rose"];
function marksAll(){ try{ return JSON.parse(localStorage.getItem(MKEY)||"{}"); }catch(e){ return {}; } }
function marksSave(){
  if(!ST.model) return;
  var all=marksAll();
  if(ST.marks.length) all[ST.model.id]=ST.marks; else delete all[ST.model.id];
  for(var t=0;t<5;t++){
    try{ localStorage.setItem(MKEY,JSON.stringify(all)); return; }
    catch(e){
      var keys=Object.keys(all).filter(function(k){return k!==ST.model.id;});
      if(!keys.length) return;
      delete all[keys[0]];
    }
  }
}
function marksLoadFor(id){ var a=marksAll()[id]; return Array.isArray(a)?a:[]; }
function sortMarks(){ ST.marks.sort(function(a,b){ return a.fromS-b.fromS||a.fromO-b.fromO; }); }
function buildMarkIndex(){
  var idx={},i,k;
  for(i=0;i<ST.marks.length;i++){
    var m=ST.marks[i];
    for(k=m.fromS;k<=m.toS;k++){
      var sent=ST.model.sents[k]; if(!sent) continue;
      (idx[k]||(idx[k]=[])).push({a:k===m.fromS?m.fromO:0,b:k===m.toS?m.toO:sent.text.length,color:m.color,id:m.id});
    }
  }
  ST.markIndex=idx;
}
function repaintSents(from,to){
  for(var i=Math.max(0,from);i<=to&&i<ST.spans.length;i++){
    var el=ST.spans[i]; if(el) el.innerHTML=sentHTML(i);
  }
}
function markSpanText(fromS,fromO,toS,toO){
  var out=[],i;
  for(i=fromS;i<=toS;i++){
    var t=ST.model.sents[i].text;
    out.push(t.slice(i===fromS?fromO:0, i===toS?toO:t.length));
  }
  return out.join(" ").replace(/\s+/g," ").trim();
}
function markById(id){ for(var i=0;i<ST.marks.length;i++) if(ST.marks[i].id===id) return ST.marks[i]; return null; }

/* --- selection --- */
function spanOf(node){
  if(!node) return null;
  var el=node.nodeType===1?node:node.parentElement;
  return el?el.closest("#doc .s"):null;
}
function offsetIn(span,node,off){
  var total=0,k;
  if(node===span){
    for(k=0;k<off&&k<span.childNodes.length;k++) total+=(span.childNodes[k].textContent||"").length;
    return total;
  }
  var w=document.createTreeWalker(span,NodeFilter.SHOW_TEXT),n;
  while((n=w.nextNode())){
    if(n===node) return total+off;
    total+=n.nodeValue.length;
  }
  return Math.min(total,ST.model.sents[+span.dataset.i].text.length);
}
function readSelection(){
  var sel=window.getSelection();
  if(!sel||sel.isCollapsed||!sel.rangeCount) return null;
  var r=sel.getRangeAt(0);
  var sa=spanOf(r.startContainer),sb=spanOf(r.endContainer);
  if(!sa||!sb) return null;
  var ia=+sa.dataset.i, ib=+sb.dataset.i;
  var oa=offsetIn(sa,r.startContainer,r.startOffset), ob=offsetIn(sb,r.endContainer,r.endOffset);
  if(ia>ib||(ia===ib&&oa>ob)){ var t=ia;ia=ib;ib=t; t=oa;oa=ob;ob=t; }
  if(ia===ib&&ob-oa<1) return null;
  return {fromS:ia,fromO:oa,toS:ib,toO:ob,rect:r.getBoundingClientRect()};
}
function showTool(rect,editId){
  var el=$("#hlTool");
  ST.editing=editId||null;
  $("#hlDel").hidden=!editId;
  $$("#hlTool .sw").forEach(function(b){
    var m=editId?markById(editId):null;
    b.setAttribute("aria-pressed", m&&m.color===b.dataset.color?"true":"false");
  });
  el.classList.add("open");
  var w=el.offsetWidth||210,h=el.offsetHeight||34;
  var left=clamp(rect.left+rect.width/2-w/2,8,Math.max(8,innerWidth-w-8));
  var top=rect.top-h-9;
  if(top<54) top=rect.bottom+9;
  top=clamp(top,54,Math.max(54,innerHeight-h-14));
  el.style.left=left+"px"; el.style.top=top+"px";
}
function hideTool(){ $("#hlTool").classList.remove("open"); ST.pending=null; ST.editing=null; }

function addMark(color){
  var p=ST.pending; if(!p||!ST.model) return;
  var m={id:"m"+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
         fromS:p.fromS,fromO:p.fromO,toS:p.toS,toO:p.toO,color:color,note:"",
         at:Date.now(),page:ST.model.sents[p.fromS].page,
         text:markSpanText(p.fromS,p.fromO,p.toS,p.toO)};
  ST.marks.push(m); sortMarks(); buildMarkIndex(); marksSave();
  repaintSents(m.fromS,m.toS); renderMarks();
  ST.color=color; prefsSave();
  var sel=window.getSelection(); if(sel) sel.removeAllRanges();
  hideTool();
  return m;
}
function recolorMark(id,color){
  var m=markById(id); if(!m) return;
  m.color=color; ST.color=color; prefsSave();
  buildMarkIndex(); marksSave(); repaintSents(m.fromS,m.toS); renderMarks();
  $$("#hlTool .sw").forEach(function(b){ b.setAttribute("aria-pressed",b.dataset.color===color?"true":"false"); });
}
function removeMark(id){
  var m=markById(id); if(!m) return;
  ST.marks=ST.marks.filter(function(x){return x.id!==id;});
  buildMarkIndex(); marksSave(); repaintSents(m.fromS,m.toS); renderMarks(); hideTool();
}
function markCurrentSentence(){
  if(!ST.model||!ST.model.sents.length) return;
  var i=ST.idx,sent=ST.model.sents[i];
  var whole=null;
  for(var k=0;k<ST.marks.length;k++){
    var m=ST.marks[k];
    if(m.fromS===i&&m.toS===i&&m.fromO===0&&m.toO===sent.text.length) whole=m;
  }
  if(whole){ removeMark(whole.id); toast("Note removed."); return; }
  ST.pending={fromS:i,fromO:0,toS:i,toO:sent.text.length};
  addMark(ST.color);
  var btn=$("#markNow"); btn.classList.add("hit"); setTimeout(function(){btn.classList.remove("hit");},700);
  toast("Noted — page "+sent.page+".");
}
function jumpToMark(id){
  var m=markById(id); if(!m) return;
  jumpToIndex(m.fromS,false);
  if(innerWidth<1040) setPanel(false);
  setTimeout(function(){
    var el=$('#doc mark.hl[data-hl="'+id+'"]');
    if(el){ el.classList.add("flash"); setTimeout(function(){el.classList.remove("flash");},1200); }
  },260);
}
function renderMarks(){
  var host=$("#markList"),n=ST.marks.length;
  var badge=$("#markCount");
  badge.textContent=n; badge.hidden=n===0;
  $("#markActions").style.display=n?"flex":"none";
  var list=ST.filter==="all"?ST.marks:ST.marks.filter(function(m){return m.color===ST.filter;});
  if(!list.length){
    host.innerHTML='<div class="sum-empty">'+(n?"No notes in that colour.":
      "Nothing noted yet.<br><br>Select any text in the document to highlight it, or press <kbd>M</kbd> while it is reading to keep the sentence you just heard.")+"</div>";
    return;
  }
  host.innerHTML=list.map(function(m){
    return '<li class="'+m.color+'" data-id="'+m.id+'"><span class="cbar"></span><div class="mbody">'+
      '<button class="quote">'+esc(m.text.length>230?m.text.slice(0,230)+"…":m.text)+"</button>"+
      (m.note?'<div class="mnote">'+esc(m.note)+"</div>":"")+
      '<div class="mmeta"><span class="pgno">P.'+m.page+"</span>"+
      '<button class="act" data-act="note">'+(m.note?"Edit note":"Add note")+"</button>"+
      '<button class="act del" data-act="del">Remove</button>'+
      '<span class="dots">'+COLORS.map(function(c){
        return '<button class="sw '+c+'" data-act="color" data-color="'+c+'" aria-label="'+c+'"></button>';
      }).join("")+"</span></div></div></li>";
  }).join("");
}
function marksMarkdown(){
  var m=ST.model,out=["# "+m.title,"","*"+ST.marks.length+" note"+(ST.marks.length===1?"":"s")+
    " · "+new Date().toLocaleDateString()+"*",""];
  ST.marks.forEach(function(k){
    out.push("---","","**Page "+k.page+"**","","> "+k.text.replace(/\n/g," "),"");
    if(k.note) out.push("**Note:** "+k.note,"");
  });
  return out.join("\n");
}
function copyText(text,msg){
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(text).then(function(){ toast(msg||"Copied."); },
      function(){ toast("The browser blocked copying."); });
  } else toast("Copying isn't available here.");
}
function saveFile(name,text){
  var hosted=!!(window.claude&&typeof window.claude.use==="function");
  function anchor(){
    try{
      var b=new Blob([text],{type:"text/markdown"});
      var u=URL.createObjectURL(b),a=document.createElement("a");
      a.href=u; a.download=name; document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(u); a.remove(); },500);
      toast("Downloaded "+name);
    }catch(e){ copyText(text,"Download blocked — copied to the clipboard instead."); }
  }
  if(!hosted){ anchor(); return; }
  window.claude.use("downloads").then(function(d){
    if(!d){ copyText(text,"Downloads aren't available here — copied to the clipboard instead."); return; }
    d.save({filename:name,data:text}).then(function(){ toast("Saved "+name); },function(err){
      if(err&&err.code==="declined") return;
      copyText(text,"Couldn't save the file — copied to the clipboard instead.");
    });
  },function(){ copyText(text,"Couldn't save the file — copied to the clipboard instead."); });
}

/* ---------------- 18. INIT ---------------- */
(function init(){
  /* Served as separate files (GitHub Pages): use a real background worker.
     In the single-file build the worker script is already inlined, and pdf.js
     runs it on the main thread instead. */
  try{
    if(window.PR_WORKER_SRC && !(globalThis.pdfjsWorker&&globalThis.pdfjsWorker.WorkerMessageHandler))
      pdfjsLib.GlobalWorkerOptions.workerSrc=window.PR_WORKER_SRC;
  }catch(e){}
  if(window.PR_WORKER_SRC && "serviceWorker" in navigator && /^https?:$/.test(location.protocol)){
    window.addEventListener("load",function(){
      navigator.serviceWorker.register("sw.js").catch(function(){});
    });
  }
  prefsLoad();
  setSize(ST.size); setRate(ST.rate);
  $("#pitch").value=ST.pitch; $("#pitchVal").textContent=ST.pitch.toFixed(2);
  $("#vol").value=ST.vol; $("#volVal").textContent=Math.round(ST.vol*100)+"%";
  $("#gap").value=ST.gap; $("#gapVal").textContent=ST.gap+" ms";
  meterIdle();
  renderLibrary();
  if(SS){
    if(!loadVoices()){
      SS.addEventListener&&SS.addEventListener("voiceschanged",loadVoices);
      var tries=0,iv=setInterval(function(){
        if(loadVoices()){ clearInterval(iv); return; }
        if(++tries>25){ clearInterval(iv); noVoices("This browser reports no installed voices — check your system's text-to-speech settings."); }
      },200);
    }
  } else noVoices("This browser has no speech engine.");
  if(window.ResizeObserver){
    new ResizeObserver(function(){ document.documentElement.style.setProperty("--deck-h",$("#deck").offsetHeight+"px"); }).observe($("#deck"));
  }
  window.__PR={ST:ST,open:openArrayBuffer};
})();
})();
