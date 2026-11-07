// ====== DESIGN CARDS: a design form as cards with sliders, real-world ticks, help and a live preview (builds 238-239) ======
// Built for the electric drive (build 238), shared since build 239 by the combustion engine. A form's fields stay in
// src/shell.html, grouped in <section class="evd-card" id="{p}Card-{id}"><div class="evd-fields"> ... </div></section>
// inside a <div class="evd" id="{root}"> with a {p}Rail nav, a {p}Cards column and a {p}Side aside. This class adds,
// around those fields:
//   · a menu of the cards, one open at a time (on a narrow panel the cards stack and fold instead);
//   · a slider beside each number, with a tick for every real example (cfg.ticks) and their range shaded;
//   · a "?" that explains the input in the side panel: what it is, what it trades, the real examples, the guide page;
//   · the effect of each change beside the input that made it (cfg.deltas);
//   · a side panel of what the design gives (cfg.stats, cfg.curve) and what holds it back (cfg.limits); on a phone a
//     bar at the bottom that opens.
// Nothing here is physics. cfg.compute() returns what the preview shows, from the functions the build itself runs.
// A new parameter is its field in the right card in src/shell.html and one entry in the form's field table; a new form
// is a config (src/js/ev-designer.js, src/js/engine-designer.js). Classes are .evd-* for both: the styles are shared.
const DC_COLOURS={well:'#12121c',edge:'#26263a',edge2:'#3a3a55',dim:'#8a8aa6',green:'#00ff88',cyan:'#00ccff',yellow:'#ffcc00',red:'#ff4d5e',
  blue:'#3d7bff',copper:'#d9853b',steel:'#6b6b85',fg:'#d8d8e8'};
const dcFmt=(x,d=0)=>(+x).toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
const dcCtx=cv=>{const x=cv.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle=DC_COLOURS.well;x.fillRect(0,0,cv.width,cv.height);return x;};
const dcShown=cv=>!!cv&&cv.offsetParent!==null;
const dcOptText=id=>{const el=document.getElementById(id);return el&&el.selectedOptions&&el.selectedOptions[0]?el.selectedOptions[0].textContent:'';};

class DesignCards{
  // cfg: prefix, root, cards [{id,title,guide,viz,cap,vizH}], fields {id:{what,trade,adv,log}}, ticks(id), using(id,val),
  // choices(id) -> Map(value -> names), realHead, compute(), slow(res), active(), depFields, deltas, stats(res,d),
  // slowText(res,slow), curve(res), legend, limits(res), mini(res), summary(card,res), warnings(res), h1(), drawViz(dc,res),
  // icons {card: fn(P,C)}, visible(f), helpEmpty, delay (ms after typing stops; 0 = next frame)
  constructor(cfg){
    this.cfg=cfg;this.p=cfg.prefix;
    this.st={ready:false,card:cfg.cards[0].id,adv:false,help:null,res:null,prev:null,last:null,chips:'',mode:'',queued:0,timer:0,wait:0,slow:null};
  }
  el(s){return document.getElementById(this.p+s);}
  box(){return document.getElementById(this.cfg.root);}
  q(sel){const b=this.box();return b?[...b.querySelectorAll(sel)]:[];}
  // Narrow is the panel's width, as the stylesheet's container queries read it (700 px); hidden, the screen's.
  narrow(){const p=document.getElementById('designPanel'),w=p?p.getBoundingClientRect().width:0;
    if(w>0)return w<=700;try{return matchMedia('(max-width:760px)').matches;}catch(e){return false;}}
  field(id){const el=document.getElementById(id);return el&&el.closest('.field');}
  ctl(f){return f.querySelector('select,input:not([type=range]):not([type=hidden])');}

  // ---- building the cards around the fields (once) ----
  init(){
    const box=this.box(),st=this.st,p=this.p;if(!box||st.ready)return!!box;
    st.ready=true;
    try{st.adv=localStorage.getItem('pes.'+p+'Adv')==='1';const c=localStorage.getItem('pes.'+p+'Card');if(this.cfg.cards.some(k=>k.id===c))st.card=c;}catch(e){}
    const cards=this.el('Cards');
    const bar=document.createElement('div');bar.className='evd-bar';
    bar.innerHTML='<div class="evd-seg" role="group" id="'+p+'Level"><button type="button" data-lv="0"></button><button type="button" data-lv="1"></button></div>';
    cards.prepend(bar);
    bar.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>this.setAdv(b.dataset.lv==='1')));
    for(const c of this.cfg.cards){
      const card=this.el('Card-'+c.id);
      const head=document.createElement('button');head.type='button';head.className='evd-head';head.setAttribute('aria-controls',p+'Card-'+c.id);
      head.innerHTML='<canvas class="evd-ic" width="14" height="14" data-icon="'+c.id+'"></canvas><span class="evd-ht"><span class="evd-t"></span><span class="evd-sum"></span></span><span class="evd-ar"></span>';
      head.addEventListener('click',()=>{if(!this.narrow())return;st.card=st.card===c.id?null:c.id;this.layout();});
      card.prepend(head);
      const body=card.querySelector('.evd-fields');
      const wrap=document.createElement('div');wrap.className='evd-body'+(c.viz?'':' noviz');
      card.insertBefore(wrap,body);wrap.appendChild(body);
      if(c.viz){const v=document.createElement('div');v.className='evd-viz';
        v.innerHTML='<canvas id="'+p+'Viz-'+c.id+'" width="232" height="'+(c.vizH||150)+'"></canvas><div class="evd-cap"></div>';wrap.appendChild(v);}
      const more=document.createElement('div');more.className='evd-more';body.appendChild(more);
      const rb=document.createElement('button');rb.type='button';rb.className='evd-rb';rb.id=p+'Rb-'+c.id;rb.setAttribute('aria-controls',p+'Card-'+c.id);
      rb.innerHTML='<canvas class="evd-ic" width="14" height="14" data-icon="'+c.id+'"></canvas><span class="evd-t"></span><span class="evd-sum"></span>';
      rb.addEventListener('click',()=>{st.card=c.id;this.layout();try{localStorage.setItem('pes.'+p+'Card',c.id);}catch(e){}});
      this.el('Rail').appendChild(rb);
    }
    this.q('.evd-fields>.field').forEach(f=>this.enhance(f));
    this.el('Side').innerHTML=
      '<button type="button" class="evd-mini" id="'+p+'Mini" aria-expanded="false" aria-controls="'+p+'Side"></button>'+
      '<section class="evd-panel"><h4 id="'+p+'H1"></h4><div class="evd-stats" id="'+p+'Stats"></div>'+
      '<canvas id="'+p+'Curve" class="evd-curve" width="320" height="150"></canvas><div class="evd-legend" id="'+p+'Legend"></div><div class="evd-slow" id="'+p+'Slow"></div></section>'+
      '<section class="evd-panel"><h4 id="'+p+'H2"></h4><div class="evd-lims" id="'+p+'Lims"></div><div class="evd-verdict" id="'+p+'Verdict"></div></section>'+
      '<section class="evd-panel evd-helpbox" aria-live="polite"><h4 id="'+p+'H3"></h4><div class="evd-help" id="'+p+'Help"></div></section>';
    this.el('Mini').addEventListener('click',()=>{const o=this.el('Side').classList.toggle('open');this.el('Mini').setAttribute('aria-expanded',o);this.renderResults();});
    box.addEventListener('input',e=>{if(e.target.matches('.evd-fields input[type=number]'))this.changed(e.target.id,false);});
    box.addEventListener('change',e=>{if(e.target.matches('.evd-fields input[type=number], .evd-fields select'))this.changed(e.target.id,true);});
    let wasNarrow=null;window.addEventListener('resize',()=>{const n=this.narrow();if(n!==wasNarrow){wasNarrow=n;this.layout();}this.drawViz();this.drawCurve();});
    return true;
  }
  // One field: [?] LABEL [slider] [box], then a line that appears when there is something to say, then the help (phone).
  // A field without a control (a readout) gets the help and nothing else.
  enhance(f){
    const ctl=this.ctl(f),p=this.p;
    const id=ctl?ctl.id:(f.querySelector('.val')||{}).id,spec=this.cfg.fields[id]||{};
    f.classList.add('evd-row');if(spec.adv)f.classList.add('evd-adv');if(!ctl)f.classList.add('evd-readout');
    if(!id)return;
    const q=document.createElement('button');q.type='button';q.className='evd-q';q.textContent='?';q.dataset.f=id;q.setAttribute('aria-expanded','false');
    q.addEventListener('click',()=>this.showHelp(this.st.help===id?null:id));
    f.prepend(q);
    if(ctl&&ctl.type==='number'){
      const lo=+ctl.min,hi=+ctl.max,tr0=document.createElement('div');tr0.className='evd-track';
      const pos=v=>spec.log?Math.log(Math.max(v,lo)/lo)/Math.log(hi/lo)*100:(v-lo)/(hi-lo)*100;
      const ticks=this.cfg.ticks(id);
      if(ticks.length){const a=pos(ticks[0].v),b=pos(ticks[ticks.length-1].v);
        tr0.insertAdjacentHTML('beforeend','<span class="evd-band" style="left:'+a+'%;width:'+Math.max(1.5,b-a)+'%"></span>');}
      const rng=document.createElement('input');rng.type='range';rng.min=0;rng.max=1000;rng.step=1;rng.tabIndex=-1;rng.setAttribute('aria-hidden','true');
      rng.dataset.f=id;tr0.appendChild(rng);
      const toVal=k=>{const x=spec.log?lo*Math.pow(hi/lo,k/1000):lo+(hi-lo)*k/1000,s=+ctl.step||1;return Math.round(x/s)*s;};
      rng.addEventListener('input',()=>{ctl.value=+toVal(+rng.value).toFixed(2);this.changed(id,false);});
      rng.addEventListener('change',()=>{ctl.dispatchEvent(new Event('change',{bubbles:true}));});
      for(const t of ticks){const b=document.createElement('button');b.type='button';b.className='evd-tick';b.style.left=pos(t.v)+'%';
        b.dataset.v=t.v;b.dataset.names=t.names.slice(0,6).join(', ')+(t.names.length>6?' +'+(t.names.length-6):'');
        b.addEventListener('click',()=>{ctl.value=t.v;ctl.dispatchEvent(new Event('change',{bubbles:true}));});tr0.appendChild(b);}
      tr0._pos=pos;
      f.insertBefore(tr0,ctl);
    }
    const meta=document.createElement('div');meta.className='evd-meta';meta.id=p+'Meta-'+id;f.appendChild(meta);
    const ih=document.createElement('div');ih.className='evd-inhelp evd-help';ih.hidden=true;ih.dataset.f=id;f.appendChild(ih);
  }

  // ---- reacting to the form ----
  changed(id,done){
    if(!document.getElementById(id))return;
    if(done&&(this.cfg.depFields||[]).includes(id)){syncDesignEnable();return;}   // syncs the dependent fields, then sync()
    this.st.last=id;
    this.queue(true,done);
    if(this.st.help||!this.narrow())this.showHelp(id,true);
  }
  // Called when the form is synced (a preset, the engine type, the language): mode names what the host shows.
  sync(mode){
    if(!mode){this.st.res=null;this.st.mode='';return;}
    if(!this.init())return;
    this.st.mode=mode;
    this.renderText();
    this.queue(false,true);
  }
  // The preview runs at most once a frame while a slider is dragged; a slow one (cfg.delay) once the dragging stops.
  queue(change,now){
    const st=this.st;
    if(change){if(!st.wait&&!st.queued)st.prev=st.res;}else{st.prev=null;st.last=null;}
    if(this.cfg.delay&&!now){clearTimeout(st.wait);st.wait=setTimeout(()=>{st.wait=0;this.update();},this.cfg.delay);this.renderFields();return;}
    clearTimeout(st.wait);st.wait=0;
    if(st.queued)return;
    st.queued=requestAnimationFrame(()=>{st.queued=0;this.update();});
  }
  update(){
    const st=this.st;if(!this.cfg.active())return;
    let r=null;try{r=this.cfg.compute();}catch(e){r=null;}
    const before=st.prev||null;
    st.res=r;
    st.chips=before&&r&&st.last?this.chips(before,r):'';
    st.slow=null;clearTimeout(st.timer);
    if(r&&this.cfg.slow)st.timer=setTimeout(()=>{try{st.slow=this.cfg.slow(st.res);}catch(e){st.slow=null;}this.renderResults();},250);
    this.renderFields();this.renderResults();
  }
  // ---- the effect of a change, as chips: [key, unit, decimals (negative: round to tens/hundreds), good sign, word] ----
  chips(a,b){
    const out=[];
    for(const [k,u,dp,good,w] of this.cfg.deltas){
      if(a[k]==null||b[k]==null)continue;
      const d=b[k]-a[k];if(Math.abs(d)<Math.max(1e-6,0.004*Math.abs(a[k])))continue;
      const n=dp<0?dcFmt(Math.round(Math.abs(d)/Math.pow(10,-dp))*Math.pow(10,-dp)):dcFmt(Math.abs(d),dp);
      out.push('<span class="evd-chip '+(good===0?'eq':Math.sign(d)===good?'up':'dn')+'">'+(d>0?'+':'−')+(k==='cost'?'$':'')+n+u+(w?' '+tr(w):'')+'</span>');
    }
    return out.join('')||'<span class="evd-chip eq">'+tr('no change to the peak figures')+'</span>';
  }

  // ---- the text: card names, summaries, labels (on every sync, so a language change shows at once) ----
  renderText(){
    const p=this.p,cfg=this.cfg;
    for(const c of cfg.cards){
      this.q('#'+p+'Card-'+c.id+' .evd-t, #'+p+'Rb-'+c.id+' .evd-t').forEach(t=>t.textContent=tr(c.title));
      const cap=this.box().querySelector('#'+p+'Card-'+c.id+' .evd-cap');if(cap)cap.textContent=tr(c.cap);
    }
    const lv=this.el('Level');lv.setAttribute('aria-label',tr('Detail'));
    lv.children[0].textContent=tr('BASIC');lv.children[1].textContent=tr('ADVANCED');
    this.q('.evd-q').forEach(q=>{const l=q.parentElement.querySelector('label');q.setAttribute('aria-label',tr('About this input')+': '+(l?l.textContent:''));});
    this.q('.evd-tick').forEach(b=>{const t=b.dataset.names+': '+dcFmt(+b.dataset.v,+b.dataset.v%1?2:0);b.title=t;b.setAttribute('aria-label',tr('Set to')+' '+t);});
    this.el('H1').textContent=tr(cfg.h1());
    this.el('H2').textContent=tr('WHAT HOLDS IT BACK');this.el('H3').textContent=tr('ABOUT THIS INPUT');
    this.el('Legend').innerHTML=cfg.legend.map(([c,w])=>'<span><i class="'+c+'"></i>'+tr(w)+'</span>').join('');
    this.el('Curve').setAttribute('aria-label',tr(cfg.curveLabel));
    this.layout();
    this.showHelp(this.st.help,true);
  }
  setAdv(on){
    this.st.adv=on;try{localStorage.setItem('pes.'+this.p+'Adv',on?'1':'0');}catch(e){}
    this.renderFields();
  }
  // Which card is open: on a wide panel, the one chosen in the menu; on a narrow one, the one unfolded (or none).
  layout(){
    const st=this.st;
    if(!st.card&&!this.narrow())st.card=this.cfg.cards[0].id;
    for(const c of this.cfg.cards){const on=c.id===st.card,card=this.el('Card-'+c.id);
      card.classList.toggle('on',on);this.el('Rb-'+c.id).setAttribute('aria-current',on?'true':'false');
      const h=card.querySelector('.evd-head');h.setAttribute('aria-expanded',on?'true':'false');h.querySelector('.evd-ar').textContent=on?'▲':'▼';}
    this.drawIcons();this.drawViz();
  }
  // A field the host shows in this mode (data-ev-only, data-hy and the like): one it hides is not "more" either.
  shownByMode(f){return this.cfg.visible?this.cfg.visible(f,this.st.mode):true;}

  // ---- each field's state, warnings and slider ----
  renderFields(){
    const st=this.st,r=st.res,p=this.p;
    const lv=this.el('Level');if(lv){lv.children[0].setAttribute('aria-pressed',!st.adv);lv.children[1].setAttribute('aria-pressed',st.adv);}
    const warn=r&&this.cfg.warnings?this.cfg.warnings(r):{};
    const warnCards=new Set();
    this.q('.evd-row').forEach(f=>{
      const ctl=this.ctl(f),id=ctl?ctl.id:(f.querySelector('.val')||{}).id;
      if(ctl)f.classList.toggle('evd-off',ctl.disabled);   // a field the design has no use for: a turbo's on an engine without one
      f.classList.toggle('evd-hide',f.classList.contains('evd-adv')&&!st.adv);
      const rng=f.querySelector('input[type=range]');
      if(rng){const tr0=rng.parentElement,v=+ctl.value;rng.value=Math.round(Math.max(0,Math.min(100,tr0._pos(v)))*10);}
      const meta=document.getElementById(p+'Meta-'+id);if(!meta)return;
      let h='';
      if(warn[id]){h+='<span class="evd-warn">▲ '+warn[id]+'</span>';warnCards.add(f.closest('.evd-card').dataset.card);}
      if(id===st.last&&st.chips)h+=st.chips;
      else if(ctl&&ctl.type==='number'){const u=this.cfg.using(id,ctl.value);if(u.length)h+='<span class="evd-real">• '+u.slice(0,2).join(', ')+(u.length>2?' +'+(u.length-2):'')+'</span>';}
      meta.innerHTML=h;
    });
    for(const c of this.cfg.cards){
      const s=this.cfg.summary(c.id,r);
      this.q('#'+p+'Card-'+c.id+' .evd-sum, #'+p+'Rb-'+c.id+' .evd-sum').forEach(t=>t.textContent=s);
      this.el('Rb-'+c.id).classList.toggle('warn',warnCards.has(c.id));
      const hidden=this.q('#'+p+'Card-'+c.id+' .evd-fields>.field').filter(f=>f.classList.contains('evd-hide')&&!f.classList.contains('evd-off')&&this.shownByMode(f)).length;
      const more=this.box().querySelector('#'+p+'Card-'+c.id+' .evd-more');
      more.innerHTML=hidden?'<button type="button">'+tr('{n} more in ADVANCED').replace('{n}',hidden)+'</button>':'';
      const b=more.querySelector('button');if(b)b.addEventListener('click',()=>this.setAdv(true));
    }
    this.drawViz();
  }

  // ---- the side panel ----
  renderResults(){
    const st=this.st,r=st.res,p=st.prev,cfg=this.cfg;if(!this.el('Stats'))return;
    if(!r){this.el('Stats').innerHTML='';this.el('Lims').innerHTML='';this.el('Verdict').textContent='';this.el('Mini').textContent='';this.el('Slow').textContent='';return;}
    const d=(k,good,dp)=>{if(!p||!st.last||p[k]==null)return'';const x=r[k]-p[k];if(Math.abs(x)<Math.max(1e-6,0.004*Math.abs(p[k])))return'';
      return'<span class="'+(Math.sign(x)===good?'up':'dn')+'">'+(x>0?'+':'−')+(k==='cost'?'$':'')+dcFmt(Math.abs(x),dp)+'</span>';};
    this.el('Stats').innerHTML=cfg.stats(r,d).map(([l,v,u,dd])=>'<div class="evd-stat"><span class="l">'+tr(l)+'</span><span class="v">'+v+'<small>'+u+'</small></span><span class="dd">'+dd+'</span></div>').join('');
    this.el('Slow').textContent=cfg.slowText?cfg.slowText(r,st.slow):'';
    // what holds it back: groups of bars, the one that binds lit, and a sentence
    const L=cfg.limits(r);
    const rows=(list,lit,fmt)=>list.map(([n,v],i)=>'<div class="evd-lim'+(i===lit?' bind':'')+'"><span>'+tr(n)+'</span><span class="bar"><span style="width:'+
      Math.max(0,Math.min(100,v/Math.max(1e-9,...list.map(x=>x[1]))*100))+'%"></span></span><span class="n">'+fmt(v)+'</span></div>').join('');
    this.el('Lims').innerHTML=L.groups.map(g=>'<div class="lh">'+tr(g.head)+'</div>'+rows(g.rows,g.lit,g.fmt)).join('');
    this.el('Verdict').textContent=L.verdict;
    const open=this.el('Side').classList.contains('open');
    this.el('Mini').innerHTML=cfg.mini(r).map(([v,u])=>'<span>'+v+'<small>'+u+'</small></span>').join('')+'<span class="ar">'+(open?'▼':'▲')+'</span>';
    this.drawCurve();
  }

  // ---- help: in the side panel, or under the field on a narrow panel ----
  helpHTML(id){
    const spec=this.cfg.fields[id]||{},ctl=document.getElementById(id),f=this.field(id)||(ctl&&ctl.closest('.evd-row'));
    const lab=f&&f.querySelector('label')?f.querySelector('label').textContent:id;
    let h='<span class="hn">'+lab+'</span><b>'+tr('WHAT IT IS')+'</b><span>'+tr(spec.what||'')+'</span><b>'+tr('WHAT IT TRADES')+'</b><span>'+tr(spec.trade||'')+'</span>';
    if(ctl&&ctl.tagName==='SELECT'){
      const used=this.cfg.choices(id);
      h+='<b>'+tr('THE CHOICES')+'</b><ul>'+[...ctl.options].filter(o=>!o.disabled||o.selected).map(o=>{const u=used.get(o.value)||used.get(String(+o.value))||[];
        return '<li class="'+(o.selected?'on':'')+'"><span>'+o.textContent+'</span>'+u.slice(0,4).join(', ')+(u.length>4?' +'+(u.length-4):'')+'</li>';}).join('')+'</ul>';
    }else if(ctl&&ctl.type==='number'){
      const real=this.cfg.ticks(id);
      if(real.length)h+='<b>'+tr(this.cfg.realHead)+'</b><ul>'+real.map(t=>'<li class="'+(+ctl.value===t.v?'on':'')+'"><span>'+dcFmt(t.v,t.v%1?2:0)+'</span>'+
        t.names.slice(0,5).join(', ')+(t.names.length>5?' +'+(t.names.length-5):'')+'</li>').join('')+'</ul>';
    }
    const card=this.cfg.cards.find(c=>c.id===(f&&f.closest('.evd-card').dataset.card));
    const guide=spec.guide||(card&&card.guide);
    if(guide)h+='<button type="button" class="evd-guide" data-gp="'+guide+'">'+tr('GUIDE')+' ▸</button>';
    return h;
  }
  showHelp(id,quiet){
    const st=this.st;
    if(id&&!(document.getElementById(id)&&this.box().contains(document.getElementById(id))))id=null;
    st.help=id;
    this.q('.evd-row').forEach(f=>f.classList.toggle('sel',!!id&&f.contains(document.getElementById(id))));
    this.q('.evd-q').forEach(q=>q.setAttribute('aria-expanded',q.dataset.f===id?'true':'false'));
    const box=this.el('Help');if(!box)return;
    box.innerHTML=id?this.helpHTML(id):'<span class="empty">'+tr(this.cfg.helpEmpty)+'</span>';
    this.q('.evd-inhelp').forEach(x=>{const on=!!id&&x.dataset.f===id&&this.narrow();x.hidden=!on;x.innerHTML=on?box.innerHTML:'';});
    this.q('.evd-guide').forEach(b=>b.addEventListener('click',()=>{const t=document.getElementById('tabGuide');if(t)t.click();if(typeof showGuide==='function')showGuide(b.dataset.gp);}));
    if(!quiet&&id&&this.narrow()){const f=this.field(id);if(f)f.scrollIntoView({block:'nearest'});}
  }

  // ---- pictures ----
  drawViz(){const r=this.st.res;if(r&&this.cfg.drawViz)this.cfg.drawViz(this,r);}
  vizCanvas(card){const cv=this.el('Viz-'+card);return dcShown(cv)?cv:null;}
  // The curve: a (green, left axis) and b (yellow, right axis) against x, a0/b0 dotted beside them, one marked x.
  drawCurve(){
    const r=this.st.res,cv=this.el('Curve');if(!r||!dcShown(cv))return;
    const c=this.cfg.curve(r),C=DC_COLOURS,x=dcCtx(cv),W=cv.width,H=cv.height,pl=30,pr=30,pt=10,pb=18,iw=W-pl-pr,ih=H-pt-pb;
    const pts=c.pts,step=(m,s)=>Math.max(s,Math.ceil(m/s)*s);
    const xMax=Math.ceil(c.xMax/2000)*2000,Am=step(Math.max(...pts.map(q=>Math.max(q.a,q.a0==null?0:q.a0))),50),Bm=step(Math.max(...pts.map(q=>Math.max(q.b,q.b0==null?0:q.b0))),50);
    const X=n=>pl+n/xMax*iw,YA=v=>pt+ih-v/Am*ih,YB=v=>pt+ih-v/Bm*ih;
    x.font='7px "Press Start 2P"';x.strokeStyle=C.edge;x.lineWidth=1;
    for(let i=0;i<=4;i++){const y=Math.round(pt+ih*i/4)+.5;x.beginPath();x.moveTo(pl,y);x.lineTo(W-pr,y);x.stroke();
      x.textAlign='right';x.fillStyle=C.green;x.fillText(dcFmt(Am*(1-i/4)),pl-3,y+3);x.textAlign='left';x.fillStyle=C.yellow;x.fillText(dcFmt(Bm*(1-i/4)),W-pr+3,y+3);}
    x.fillStyle=C.dim;x.textAlign='center';for(let k=0;k<=4;k++)x.fillText(dcFmt(xMax*k/4000)+'k',X(xMax*k/4),H-5);
    if(c.mark&&c.mark.x<c.xMax){const mx=Math.round(X(c.mark.x))+.5;x.strokeStyle=C.edge2;x.setLineDash([3,3]);x.beginPath();x.moveTo(mx,pt);x.lineTo(mx,pt+ih);x.stroke();x.setLineDash([]);
      x.fillStyle=C.dim;x.fillText(c.mark.label,X(c.mark.x),pt+8);}
    const line=(k,Y,col,w,dash)=>{if(pts[0][k]==null)return;x.strokeStyle=col;x.lineWidth=w;x.setLineDash(dash||[]);x.beginPath();pts.forEach((q,i)=>{i?x.lineTo(X(q.x),Y(q[k])):x.moveTo(X(q.x),Y(q[k]));});x.stroke();x.setLineDash([]);};
    line('a0',YA,C.dim,1,[2,3]);line('b0',YB,C.dim,1,[2,3]);line('b',YB,C.yellow,2);line('a',YA,C.green,2);
  }
  drawIcons(){
    const C=DC_COLOURS;
    this.q('canvas[data-icon]').forEach(cv=>{
      if(cv.dataset.drawn)return;cv.dataset.drawn='1';
      const x=cv.getContext('2d'),P=(c,pts)=>{x.fillStyle=c;pts.forEach(([a,b,w,h])=>x.fillRect(a,b,w||1,h||1));};
      const f=this.cfg.icons[cv.dataset.icon];if(f)f(P,C);
    });
  }
}
// The real examples behind a form's ticks and help: [{name, e}] -> ticks per field, users per value.
function dcTicks(list,key,keep){
  const by=new Map();
  for(const d of list){const v=d.e[key];if(v==null||v===''||typeof v==='boolean'||isNaN(+v)||(keep&&!keep(d)))continue;
    if(!by.has(+v))by.set(+v,[]);by.get(+v).push(d.name);}
  return [...by].map(([v,names])=>({v,names})).sort((a,b)=>a.v-b.v);
}
function dcUsers(list,key,keep,toVal){
  const used=new Map();
  for(const d of list){if(keep&&!keep(d))continue;let v=d.e[key];if(v==null)continue;if(toVal)v=toVal(v);const k=String(v);used.set(k,(used.get(k)||[]).concat(d.name));}
  return used;
}
