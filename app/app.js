const UNIVERS={alimentaire:{nom:'Alimentaire',c:'--u-alim'},entretien:{nom:'Entretien',c:'--u-entr'},hygiene:{nom:'Hygiène',c:'--u-hyg'},animaux:{nom:'Animaux',c:'--u-anim'}};
const UNITES=['unité','kg','g','filet','pack','bouteille','litre','boîte','sachet'];
const CHECK='<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.3 5.8 10 11 4"/></svg>';
let BASE=null,D=null;
const S={tab:'listes',lid:null,mode:'catalogue',q:'',u:'tout',open:new Set(),sheet:null,draft:null,armed:false,shop:null,pick:null,hide:false,plid:null,popt:{blank:true}};

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const slug=s=>norm(s).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'article';
const uid=()=>Math.random().toString(36).slice(2,9);
const fmt=n=>Number.isInteger(+n)?String(+n):String(Math.round(n*100)/100).replace('.',',');
const dfr=iso=>new Date(iso).toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
const rayon=id=>D.rayons.find(r=>r.id===id);
const art=id=>D.articles.find(a=>a.id===id);
const univ=x=>(rayon(x.rayon)||{}).univers||'alimentaire';
const propose=a=>!!a['proposé'];
const liste=()=>D.listes.find(l=>l.id===S.lid);
function placement(x){if(x.emplacement_ordre){const r=D.rayons.find(r=>r.ordre===+x.emplacement_ordre);if(r)return r}return rayon(x.rayon)||D.rayons[0]}
const isExc=x=>placement(x).id!==x.rayon;
const qtyTxt=(q,u)=>!q?'':(u==='unité'?'×'+fmt(q):fmt(q)+' '+u);
const stepOf=u=>u==='g'?100:u==='kg'?0.5:1;
const plural=(n,s)=>n+' '+s+(n>1?'s':'');
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('on');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('on'),2200)}
function save(){const ok=Store.save(D);if(!ok)toast("Impossible d'enregistrer sur cet appareil (photo trop lourde ?)");return ok}
const lineFrom=a=>({id:a.id,article:a.id,nom:a.nom,rayon:a.rayon,quantite:a.quantite||1,unite:a.unite,commentaire:a.commentaire||'',coche:false,ajoute:new Date().toISOString(),ajoute_par:Store.prenom()||null});
function lineView(l){const a=l.article?art(l.article):null;
  return{_id:l.id,nom:a?a.nom:l.nom,rayon:a?a.rayon:l.rayon,emplacement_ordre:a?a.emplacement_ordre:null,photo:a?a.photo:null,position:a?a.position:999,
    commentaire:l.commentaire,quantite:l.quantite,unite:l.unite,coche:l.coche,ponctuel:!l.article,coche_par:l.coche_par,ajoute_par:l.ajoute_par}}
function groups(items){
  const m=new Map();[...D.rayons].filter(r=>r.ordre!=null).sort((a,b)=>a.ordre-b.ordre).forEach(r=>m.set(r.id,[]));
  items.forEach(x=>{const p=placement(x);if(!m.has(p.id))m.set(p.id,[]);m.get(p.id).push(x)});
  return[...m].filter(([,l])=>l.length).map(([id,l])=>[rayon(id),l.sort((x,y)=>(isExc(x)-isExc(y))||((x.position??999)-(y.position??999)))]);
}
const secHead=(r,right)=>`<div class="sec-h"><span class="dot" style="background:var(${UNIVERS[r.univers].c})"></span>${esc(r.departement!==r.nom?r.departement+' · '+r.nom:r.nom)}${right??`<span class="ord">${r.ordre!=null?'Rayon '+r.ordre:''}</span>`}</div>`;
const thumb=x=>`<span class="th" style="--u:var(${UNIVERS[univ(x)].c})">${x.photo?`<img src="${x.photo}" alt="">`:esc((x.nom||'?').trim()[0]||'?')}</span>`;
const subOf=x=>[x.commentaire,isExc(x)?`Rangé ici · rayon ${(rayon(x.rayon)||{}).nom}`:''].filter(Boolean).join(' · ');

/* ---------- Données ---------- */
async function load(){
  for(const u of ['../data/catalogue.json','catalogue.json']){try{const r=await fetch(u,{cache:'no-cache'});if(r.ok){BASE=await r.json();break}}catch(e){}}
  if(!BASE){$('view').innerHTML='<div class="empty">Le catalogue n\'a pas pu être chargé.</div>';return}
  await Store.init(BASE,{onChange:remoteChange,onStatus:()=>{document.querySelectorAll('.sync').forEach(e=>e.textContent=Store.statusText())}});
  boot();
  if(Store.isShared()&&'serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{});
}
function boot(){
  if(Store.gate()){S.gate=S.gate==='code'?'code':Store.gate();renderGate();return}
  S.gate=null;$('screen').classList.remove('gate');
  D=Store.data();D.rayons=structuredClone(BASE.rayons);
  if(!Store.isShared()&&!D.listes){seed();save()}
  if(!D.listes)D.listes=[];
  render();
}
function remoteChange(){if(S.gate||!D)return;D.rayons=D.rayons||structuredClone(BASE.rayons);if(S.sheet){S.dirty=true;return}soft()}
function soft(){const sc=$('scroll'),y=sc.scrollTop,f=document.activeElement&&document.activeElement.id==='q';render();sc.scrollTop=y;
  if(f){const q=$('q');if(q){q.focus();q.setSelectionRange(q.value.length,q.value.length)}}}

/* ---------- Connexion (mode partagé) ---------- */
function renderGate(){
  $('screen').classList.add('gate');$('bar').hidden=true;closeSheet();
  const g=S.gate,err='<div class="g-err" id="g-err" role="alert"></div>';let h='';
  if(g==='email')h=`<h1>Courses Arsenal</h1><p>Entrez votre e-mail : vous recevrez un code à 6 chiffres. Pas de mot de passe.</p>
    <input id="g-email" type="email" inputmode="email" autocomplete="email" placeholder="prenom@exemple.fr" value="${esc(S.email||'')}" aria-label="E-mail">${err}
    <button class="btn pri" data-act="g-send">Recevoir le code</button>`;
  else if(g==='code')h=`<h1>Votre code</h1><p>Un code à 6 chiffres a été envoyé à <b>${esc(S.email)}</b>. Il peut mettre une minute à arriver ; pensez aux courriers indésirables.</p>
    <input id="g-code" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="······" aria-label="Code reçu">${err}
    <button class="btn pri" data-act="g-verify">Valider</button><button class="link" data-act="g-back">Changer d'e-mail</button>`;
  else h=`<h1>Votre foyer</h1><p>Indiquez votre prénom : il s'affichera quand vous cochez ou ajoutez un article.</p>
    <input id="g-prenom" autocomplete="given-name" placeholder="Prénom" value="${esc(S.gprenom||'')}" aria-label="Prénom">${err}
    <p>Quelqu'un du foyer utilise déjà l'application ? Saisissez son code d'invitation (dans Réglages).</p>
    <input id="g-join" class="code" maxlength="6" autocapitalize="characters" placeholder="CODE" aria-label="Code d'invitation">
    <button class="btn pri" data-act="g-join">Rejoindre le foyer</button>
    <div class="or">ou</div>
    <button class="btn sec" data-act="g-create">Créer notre foyer</button>
    <button class="link" data-act="g-logout">Se déconnecter</button>`;
  $('view').innerHTML=`<div class="gatebox">${h}</div>`;
  const f=$('view').querySelector('input');if(f)setTimeout(()=>f.focus(),50);
}
function gateErr(t){const e=$('g-err');if(e)e.textContent=t}
function gateMsg(e){const m=String(e&&e.message||e||'');
  if(/Failed to fetch|NetworkError|network/i.test(m))return'Pas de connexion. Vérifiez le réseau et réessayez.';
  if(/expired|invalid|otp/i.test(m))return'Code incorrect ou expiré. Vérifiez-le ou demandez-en un nouveau.';
  if(/rate|seconds/i.test(m))return'Trop de demandes. Patientez une minute avant de redemander un code.';
  if(/Code inconnu/.test(m))return"Ce code d'invitation n'existe pas. Vérifiez-le auprès d'un membre du foyer.";
  return m||'Une erreur est survenue. Réessayez.'}
async function busy(el,fn){const t=el.textContent;el.textContent='Un instant…';el.disabled=true;try{await fn()}catch(e){gateErr(gateMsg(e))}finally{if(el.isConnected){el.textContent=t;el.disabled=false}}}

function seed(){
  const p=D.articles.filter(propose),o=D.articles.filter(a=>!propose(a)),d=n=>new Date(Date.now()-n*864e5).toISOString();
  D.listes=[
    {id:uid(),nom:'Courses de la semaine (exemple)',cree:d(1),statut:'en_cours',lignes:p.filter((_,i)=>i%2===0).map(lineFrom)},
    {id:uid(),nom:'Maison et hygiène (exemple)',cree:d(3),statut:'en_cours',lignes:D.articles.filter(a=>univ(a)!=='alimentaire').slice(0,5).map(lineFrom)},
    {id:uid(),nom:'Grosses courses (exemple)',cree:d(13),termine:d(12),statut:'terminee',lignes:p.concat(o.slice(0,6)).map(a=>({...lineFrom(a),coche:true}))}
  ];
}

/* ---------- Rendu ---------- */
function render(){
  const v=S.tab==='reglages'?viewReglages():S.tab==='type'?viewType():S.tab==='magasin'?(S.shop&&shopLists().length?viewShop():(S.shop=null,viewShopPick())):S.tab==='imprimer'?(plist()?viewPrint():(S.plid=null,viewPrintPick())):S.lid&&liste()?viewDetail():(S.lid=null,viewHome());
  $('view').innerHTML=v;renderBody();renderBar();fitPaper();
  document.querySelectorAll('.tab').forEach(t=>{if(t.dataset.t===S.tab)t.setAttribute('aria-current','page');else t.removeAttribute('aria-current')});
}
function go(fn){fn();$('scroll').scrollTop=0;render()}
function renderBody(){const b=$('body');if(!b)return;b.innerHTML=S.tab==='type'?bodyType():S.tab==='magasin'?bodyShop():bodyDetail();refreshCounts();refreshShop()}
function refreshCounts(){const l=S.tab==='listes'&&liste();if(!l)return;
  const c=$('cnt');if(c)c.textContent=l.lignes.length;const s=$('lsub');if(s)s.textContent=detailSub(l)}
function chips(arts){
  const n=u=>arts.filter(a=>u==='tout'||univ(a)===u).length;
  return `<div class="chips">`+[['tout','Tout',null]].concat(Object.entries(UNIVERS).map(([k,v])=>[k,v.nom,v.c])).map(([k,l,c])=>
    `<button class="chip" data-act="chip" data-u="${k}" aria-pressed="${S.u===k}">${c?`<span class="dot" style="background:var(${c})"></span>`:''}${l}<span class="n">${n(k)}</span></button>`).join('')+`</div>`;
}
const searchBox=ph=>`<div class="search"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7" cy="7" r="5"/><path d="m11 11 3.5 3.5" stroke-linecap="round"/></svg><input id="q" type="search" placeholder="${ph}" autocomplete="off" value="${esc(S.q)}"></div>`;
const plusIcon='<svg width="18" height="18" viewBox="0 0 18 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 2v14M2 9h14"/></svg>';

/* Liste type */
function viewType(){
  return `<div class="navrow"><div class="r"><button class="iconbtn" data-act="new-art" aria-label="Ajouter un article">${plusIcon}</button></div></div>
  <div class="ltitle">Liste type</div><div class="lsub">Carrefour Arsenal · Rueil · ${D.articles.length} articles</div>
  <div class="sticky">${searchBox('Rechercher un article')}${chips(D.articles)}</div>
  <div id="body"></div>
  ${Store.isShared()?'':`<div class="foot">Modifications enregistrées sur cet appareil.<br><button data-act="reset" id="reset">Revenir au fichier d'origine</button></div>`}`;
}
function typeRow(a){const sub=subOf(a);
  return `<div class="row${propose(a)?'':' dim'}" role="button" tabindex="0" data-act="edit-art" data-id="${esc(a.id)}">${thumb(a)}
    <span class="rt"><span class="rn">${esc(a.nom)}</span>${sub?`<span class="rs">${esc(sub)}</span>`:''}</span>
    <span class="rq">${esc(qtyTxt(a.quantite,a.unite))}</span><span class="chev" aria-hidden="true">›</span></div>`}
function filtered(){const q=norm(S.q.trim());return D.articles.filter(a=>(S.u==='tout'||univ(a)===S.u)&&(!q||norm(`${a.nom} ${a.commentaire}`).includes(q)))}
function bodyType(){
  const q=S.q.trim();let h='';
  for(const [r,list] of groups(filtered())){
    const shown=q?list:list.filter(propose),hidden=q?[]:list.filter(a=>!propose(a)),open=S.open.has(r.id);
    h+=`<section class="sec">${secHead(r)}<div class="group">${shown.map(typeRow).join('')}${open?hidden.map(typeRow).join(''):''}${moreBtn(r.id,hidden.length,open)}</div></section>`;
  }
  return h||`<div class="empty">Aucun article ne correspond à « ${esc(q)} ».<br>Touchez + en haut pour le créer.</div>`;
}
const moreBtn=(rid,n,open)=>n?`<button class="more" data-act="more" data-r="${rid}"><span class="plus">${open?'−':'+'}</span>${open?'Masquer les articles sur demande':plural(n,'article')+' sur demande'}</button>`:'';

/* Accueil des listes */
function listRow(l){
  const n=l.lignes.length,c=l.lignes.filter(x=>x.coche).length,done=l.statut==='terminee';
  const sub=done?`${plural(n,'article')} · faite ${dfr(l.termine)}`:`${plural(n,'article')} · créée ${dfr(l.cree)}${c?` · ${c} dans le caddie`:''}`;
  return `<div class="row" role="button" tabindex="0" data-act="open-list" data-id="${l.id}"><span class="th" style="--u:var(${done?'--fg2':'--accent'})">${n}</span>
    <span class="rt"><span class="rn">${esc(l.nom)}</span><span class="rs">${sub}</span></span><span class="chev" aria-hidden="true">›</span></div>`}
function viewHome(){
  const enc=D.listes.filter(l=>l.statut==='en_cours').sort((a,b)=>b.cree.localeCompare(a.cree));
  const hist=D.listes.filter(l=>l.statut==='terminee').sort((a,b)=>(b.termine||'').localeCompare(a.termine||''));
  return `<div class="navrow"><div class="r"><button class="iconbtn" data-act="new-list" aria-label="Nouvelle liste">${plusIcon}</button></div></div>
  <div class="ltitle">Listes</div><div class="lsub">${enc.length} en cours · ${hist.length} dans l'historique${Store.isShared()?` · <span class="sync">${esc(Store.statusText())}</span>`:''}</div>
  <section class="sec"><div class="sec-h">En cours</div><div class="group">${enc.map(listRow).join('')}
    <button class="addq" data-act="new-list"><span class="plus">+</span><span>Nouvelle liste</span></button></div></section>
  <section class="sec"><div class="sec-h">Historique</div>${hist.length?`<div class="group">${hist.map(listRow).join('')}</div>`:`<div class="emptycard">Les listes terminées apparaîtront ici. Vous pourrez les réutiliser.</div>`}</section>
  <div class="foot">${Store.isShared()?'Listes partagées avec le foyer.':'Mode démonstration : listes enregistrées sur cet appareil.'}</div>`;
}

/* Détail d'une liste */
function detailSub(l){const n=l.lignes.length;return l.statut==='terminee'?`${plural(n,'article')} · faite ${dfr(l.termine)}`:`${plural(n,'article')} · créée ${dfr(l.cree)}`}
function viewDetail(){
  const l=liste(),ro=l.statut==='terminee';
  return `<div class="navrow"><button class="back" data-act="back"><svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg> Listes</button>
    <div class="r"><button class="iconbtn" data-act="menu" aria-label="Actions sur la liste"><svg width="18" height="4" viewBox="0 0 18 4" fill="currentColor"><circle cx="2" cy="2" r="2"/><circle cx="9" cy="2" r="2"/><circle cx="16" cy="2" r="2"/></svg></button></div></div>
  <div class="ltitle sm">${esc(l.nom)}</div><div class="lsub" id="lsub">${detailSub(l)}</div>
  <div class="sticky">${ro?'':`<div class="segw"><div class="seg" role="group" aria-label="Affichage"><button data-act="mode" data-m="catalogue" aria-pressed="${S.mode==='catalogue'}">Catalogue</button><button data-act="mode" data-m="liste" aria-pressed="${S.mode==='liste'}">Ma liste (<span id="cnt">${l.lignes.length}</span>)</button></div></div>`}
    ${searchBox(ro?'Rechercher dans la liste':'Chercher ou ajouter un article')}${!ro&&S.mode==='catalogue'?chips(D.articles):''}</div>
  <div id="body"></div><div style="height:24px"></div>`;
}
function stepper(l){return `<span class="step"><button data-act="dec" data-id="${esc(l.id)}" aria-label="Diminuer">−</button><span class="sq">${esc(qtyTxt(l.quantite,l.unite))}</span><button data-act="inc" data-id="${esc(l.id)}" aria-label="Augmenter">+</button></span>`}
function pickRow(x,line){const sub=subOf(x);
  return `<div class="row pick${line?' on':''}${!line&&x['proposé']===false?' dim':''}" role="button" tabindex="0" data-act="toggle" data-id="${esc(line?line.id:x.id)}">
    <span class="ck${line?' on':''}">${line?CHECK:''}</span>
    <span class="rt"><span class="rn">${esc(x.nom)}${line&&!line.article?'<span class="tag">ponctuel</span>':''}</span>${sub?`<span class="rs">${esc(sub)}</span>`:''}</span>
    ${line?stepper(line):`<span class="rq">${esc(qtyTxt(x.quantite||1,x.unite))}</span>`}</div>`}
function lineRow(x,ro){const sub=[subOf(x),x.ajoute_par&&x.ajoute_par!==Store.prenom()?'ajouté par '+x.ajoute_par:''].filter(Boolean).join(' · ');
  return `<div class="row${ro?' ro':''}${ro&&x.coche?' done':''}" ${ro?'':`role="button" tabindex="0" data-act="edit-line"`} data-id="${esc(x._id)}">${thumb(x)}
    <span class="rt"><span class="rn">${esc(x.nom)}${x.ponctuel?'<span class="tag">ponctuel</span>':''}</span>${sub?`<span class="rs">${esc(sub)}</span>`:''}</span>
    <span class="rq">${esc(qtyTxt(x.quantite,x.unite))}</span>${ro?'':'<span class="chev" aria-hidden="true">›</span>'}</div>`}
function addQ(){const t=S.q.trim();return t?`<section class="sec"><div class="group"><button class="addq" data-act="new-ponct"><span class="plus">+</span><span>Ajouter « ${esc(t)} » comme article ponctuel</span></button></div></section>`:''}
function bodyDetail(){
  const l=liste(),ro=l.statut==='terminee',q=norm(S.q.trim());
  if(ro||S.mode==='liste'){
    const items=l.lignes.map(lineView).filter(x=>!q||norm(`${x.nom} ${x.commentaire}`).includes(q));
    const h=groups(items).map(([r,list])=>`<section class="sec">${secHead(r)}<div class="group">${list.map(x=>lineRow(x,ro)).join('')}</div></section>`).join('');
    if(h)return h+(ro?'':addQ());
    return (q?'':`<div class="empty">${ro?'Cette liste est vide.':'Votre liste est vide.<br>Passez sur « Catalogue » pour choisir des articles.'}</div>`)+(ro?'':addQ());
  }
  const byId=new Map(l.lignes.map(x=>[x.id,x]));
  const ponct=l.lignes.filter(x=>!x.article).map(x=>({...lineView(x),id:x.id,_line:x})).filter(x=>!q||norm(x.nom).includes(q));
  const arts=filtered().map(a=>({...a,_line:byId.get(a.id)}));
  let h='';
  for(const [r,list] of groups(arts.concat(S.u==='tout'?ponct:[]))){
    const shown=q?list:list.filter(x=>x._line||x['proposé']!==false),hidden=q?[]:list.filter(x=>!x._line&&x['proposé']===false),open=S.open.has(r.id);
    h+=`<section class="sec">${secHead(r)}<div class="group">${shown.map(x=>pickRow(x,x._line)).join('')}${open?hidden.map(x=>pickRow(x,x._line)).join(''):''}${moreBtn(r.id,hidden.length,open)}</div></section>`;
  }
  return h+addQ()||`<div class="empty">Aucun article.</div>`;
}
function renderBar(){
  const b=$('bar'),l=S.tab==='listes'&&liste();
  if(S.tab==='imprimer'){if(plist()){b.hidden=false;b.innerHTML=`<button class="btn pri" data-act="print-go">Imprimer ou enregistrer en PDF</button>`}else b.hidden=true;return}
  if(S.tab==='magasin'){
    if(S.shop){b.hidden=false;b.innerHTML=`<button class="btn pri" data-act="shop-finish">Terminer les courses</button>`;return}
    const n=[...(S.pick||[])].reduce((s,id)=>s+((D.listes.find(x=>x.id===id)||{lignes:[]}).lignes.length),0);
    if(S.pick&&S.pick.size){b.hidden=false;b.innerHTML=`<button class="btn pri" data-act="shop-go">Commencer les courses · ${plural(n,'article')}</button>`}else b.hidden=true;
    return}
  if(!l){b.hidden=true;return}
  b.hidden=false;
  b.innerHTML=l.statut==='terminee'?`<button class="btn pri" data-act="reuse">Réutiliser cette liste</button>`
    :`<button class="btn sec" data-act="print-open">Imprimer</button><button class="btn pri" data-act="shop-start">Faire les courses</button>`;
}

/* Impression */
function sheetHtml(l){
  const items=l.lignes.map(lineView),now=new Date();
  const it=x=>`<div class="pr-it"><span class="pr-box"></span><span>${esc(x.nom)}${x.commentaire?` <span class="pr-c">– ${esc(x.commentaire)}</span>`:''}</span><span class="pr-q">${esc(qtyTxt(x.quantite,x.unite))}</span></div>`;
  const deps=[];for(const [r,list] of groups(items)){const d=deps[deps.length-1];if(d&&d.nom===r.departement)d.rs.push([r,list]);else deps.push({nom:r.departement,rs:[[r,list]]})}
  const body=deps.map(d=>{const solo=d.rs.length===1&&d.rs[0][0].nom===d.nom;
    return `<div class="pr-dep"><div class="pr-dh">${esc(d.nom)}<span>${solo&&d.rs[0][0].ordre!=null?d.rs[0][0].ordre:''}</span></div>${d.rs.map(([r,list])=>`<div class="pr-ray">${solo?'':`<div class="pr-rh">${esc(r.nom)}<span>${r.ordre!=null?r.ordre:''}</span></div>`}${list.map(it).join('')}</div>`).join('')}</div>`}).join('');
  const blank=S.popt.blank?`<div class="pr-dep"><div class="pr-dh">À ajouter<span></span></div>${'<div class="pr-it"><span class="pr-box"></span><span class="pr-blank"></span><span></span></div>'.repeat(8)}</div>`:'';
  return `<div class="pr-head"><h1>${esc(l.nom)}</h1><div class="pr-meta">Carrefour Arsenal · Rueil<br>${plural(items.length,'article')} · ${now.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}</div></div>
    <div class="cols">${body}${blank}</div><div class="pr-foot">Ordre de passage des rayons du magasin</div>`;
}
const plist=()=>D&&S.plid?D.listes.find(l=>l.id===S.plid&&l.lignes.length):null;
function viewPrintPick(){
  const ls=D.listes.filter(l=>l.lignes.length).sort((a,b)=>(a.statut==='terminee')-(b.statut==='terminee')||b.cree.localeCompare(a.cree));
  const row=l=>`<div class="row" role="button" tabindex="0" data-act="print-pick" data-id="${l.id}"><span class="th" style="--u:var(${l.statut==='terminee'?'--fg2':'--accent'})">${l.lignes.length}</span>
    <span class="rt"><span class="rn">${esc(l.nom)}</span><span class="rs">${l.statut==='terminee'?'Historique · faite '+dfr(l.termine):'En cours · créée '+dfr(l.cree)}</span></span><span class="chev" aria-hidden="true">›</span></div>`;
  return `<div class="navrow"></div><div class="ltitle">Imprimer</div><div class="lsub">A4 · 3 colonnes · ordre des rayons</div>
  <section class="sec"><div class="sec-h">Quelle liste imprimer ?</div>${ls.length?`<div class="group">${ls.map(row).join('')}</div>`:`<div class="emptycard">Aucune liste avec des articles. Préparez-en une dans l'onglet Listes.</div>`}</section>`;
}
function viewPrint(){const l=plist();
  return `<div class="navrow"><button class="back" data-act="print-back"><svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg> Changer</button></div>
  <div class="ltitle sm">${esc(l.nom)}</div><div class="lsub">Aperçu · A4 · 3 colonnes</div>
  <div class="sec" style="display:flex;flex-direction:column;gap:8px">
    <div class="seg" role="group" aria-label="Lignes à compléter"><button data-act="popt" data-k="blank" data-v="1" aria-pressed="${S.popt.blank}">Lignes « À ajouter »</button><button data-act="popt" data-k="blank" data-v="" aria-pressed="${!S.popt.blank}">Sans</button></div>
  </div>
  <div class="paperwrap" id="paperwrap"><div class="paper" id="paper">${sheetHtml(l)}</div></div>
  <div class="hint" style="margin:10px 16px 24px">Sur l'iPhone, le bouton ouvre la fenêtre d'impression d'iOS : AirPrint, ou PDF via Partager. Dans la maquette en ligne, cette fenêtre est bloquée par le navigateur ; elle s'ouvre depuis la version locale.</div>`;
}
function fitPaper(){const w=$('paperwrap'),p=$('paper');if(!w||!p)return;const k=w.clientWidth/p.offsetWidth;p.style.transform=`scale(${k})`;w.style.height=Math.ceil(p.offsetHeight*k)+'px'}
if(window.ResizeObserver)new ResizeObserver(()=>fitPaper()).observe(document.getElementById('screen'));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fitPaper);

/* Réglages */
function viewReglages(){
  const head=`<div class="navrow"></div><div class="ltitle">Réglages</div>`;
  if(!Store.isShared())return head+`<div class="lsub">Mode démonstration</div>
    <section class="sec"><div class="emptycard">Cette version fonctionne sur cet appareil uniquement. Une fois Supabase configuré (voir le guide de mise en ligne), chaque membre du foyer se connecte avec son e-mail et les listes sont partagées en direct.</div></section>
    <div class="foot"><button data-act="reset" id="reset">Revenir au fichier d'origine</button></div>`;
  const p=Store.profile()||{};
  setTimeout(async()=>{try{const m=await Store.members(),e=$('members');if(e)e.innerHTML=m.map(x=>`<div class="row ro"><span class="th" style="--u:var(--accent)">${esc((x.prenom||'?')[0])}</span><span class="rt"><span class="rn">${esc(x.prenom)}${x.moi?'<span class="tag">vous</span>':''}</span></span></div>`).join('')}catch(e){}
    const em=await Store.email(),ee=$('my-email');if(ee)ee.textContent=em},0);
  return head+`<div class="lsub sync">${esc(Store.statusText())}</div>
  <section class="sec"><div class="sec-h">Moi</div><div class="group">
    <div class="row" role="button" tabindex="0" data-act="set-prenom"><span class="rt"><span class="rs">Prénom</span><span class="rn">${esc(p.prenom||'')}</span></span><span class="chev" aria-hidden="true">›</span></div>
    <div class="row ro"><span class="rt"><span class="rs">E-mail</span><span class="rn" id="my-email">…</span></span></div></div></section>
  <section class="sec"><div class="sec-h">Foyer · ${esc(p.foyer_nom||'')}</div><div class="group">
    <div class="row ro"><span class="rt"><span class="rs">Code d'invitation</span><span class="codebig" id="code">${esc(p.code||'')}</span></span><button class="txtbtn" data-act="copy-code">Copier</button></div></div>
    <div class="hint">Donnez ce code aux autres membres : ils le saisissent après leur première connexion.</div></section>
  <section class="sec"><div class="sec-h">Membres</div><div class="group" id="members"><div class="row ro"><span class="rs">Chargement…</span></div></div></section>
  <section class="sec"><div class="sec-h">Synchronisation</div><div class="group">
    <button class="addq" data-act="sync-now"><span class="plus">↻</span><span>Synchroniser maintenant</span></button></div></section>
  <section class="sec"><button class="del" data-act="logout" style="margin-top:0">${S.armed==='logout'?(Store.pending()?'Des modifications ne sont pas envoyées. Confirmer ?':'Confirmer la déconnexion'):'Se déconnecter'}</button></section>
  <div style="height:24px"></div>`;
}

/* Mode magasin */
const shopLists=()=>(S.shop||[]).map(id=>D.listes.find(l=>l.id===id)).filter(l=>l&&l.statut==='en_cours');
const shopLines=()=>shopLists().flatMap(l=>l.lignes.map(x=>({...lineView(x),_lid:l.id,_lnom:l.nom,manquant:!!x.manquant})));
const findLine=(lid,id)=>(D.listes.find(l=>l.id===lid)||{lignes:[]}).lignes.find(x=>x.id===id);
function viewShopPick(){
  const enc=D.listes.filter(l=>l.statut==='en_cours'&&l.lignes.length).sort((a,b)=>b.cree.localeCompare(a.cree));
  if(!S.pick)S.pick=new Set(enc.length===1?[enc[0].id]:[]);
  const row=l=>{const on=S.pick.has(l.id),c=l.lignes.filter(x=>x.coche).length;
    return `<button class="radio" data-act="pick" data-id="${l.id}" aria-pressed="${on}"><span class="ck${on?' on':''}" style="margin:0 4px 0 0">${on?CHECK:''}</span><span class="rt"><span class="rn">${esc(l.nom)}</span><span class="rs">${plural(l.lignes.length,'article')}${c?` · ${c} déjà dans le caddie`:''}</span></span></button>`};
  return `<div class="navrow"></div><div class="ltitle">Magasin</div><div class="lsub">Carrefour Arsenal · Rueil</div>
  <section class="sec"><div class="sec-h">Quelles listes faites-vous ?</div>${enc.length?`<div class="group">${enc.map(row).join('')}</div>
    <div class="hint">Vous pouvez en choisir plusieurs : leurs articles seront réunis dans l'ordre des rayons.</div>`
    :`<div class="emptycard">Aucune liste en cours avec des articles. Préparez-en une dans l'onglet Listes.</div>`}</section>`;
}
function viewShop(){
  const ls=shopLists();
  return `<div class="navrow"><button class="back" data-act="shop-change"><svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2 2 10l8 8"/></svg> Changer</button>
    <div class="r"><button class="txtbtn" data-act="shop-hide">${S.hide?'Tout afficher':'Masquer pris'}</button></div></div>
  <div class="ltitle sm">${ls.length===1?esc(ls[0].nom):ls.length+' listes réunies'}</div><div class="lsub">${ls.length>1?esc(ls.map(l=>l.nom).join(' + ')):'Carrefour Arsenal · Rueil'}</div>
  <div class="sticky"><div class="prog"><div class="big" id="pg-t"></div><div class="bar"><i id="pg-b"></i></div><div class="meta" id="pg-m"></div></div></div>
  <div id="body"></div><div style="height:24px"></div>`;
}
function refreshShop(){const t=$('pg-t');if(!t)return;
  const L=shopLines(),n=L.length,c=L.filter(x=>x.coche).length,m=L.filter(x=>x.manquant).length,r=n-c-m;
  t.textContent=`${c} sur ${n} dans le caddie`;$('pg-b').style.width=(n?c/n*100:0)+'%';
  $('pg-m').textContent=r===0?(m?`Plus rien à chercher · ${plural(m,'article')} pas trouvé${m>1?'s':''}`:'Tout est pris. Touchez « Terminer les courses ».'):`${r} à prendre${m?` · ${m} pas trouvé${m>1?'s':''}`:''}`;
}
const MISS='<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="7.5"/><path d="M4.8 15.2 15.2 4.8"/></svg>';
function shopRow(x,multi){const sub=[x.commentaire,isExc(x)?`Rangé ici · rayon ${(rayon(x.rayon)||{}).nom}`:'',multi?x._lnom:'',x.coche&&x.coche_par&&x.coche_par!==Store.prenom()?'pris par '+x.coche_par:''].filter(Boolean).join(' · ');
  return `<div class="row shop${x.coche?' done':''}${x.manquant?' miss':''}" role="button" tabindex="0" data-act="shop-tick" data-l="${x._lid}" data-id="${esc(x._id)}">
    <span class="ck${x.coche?' on':''}">${x.coche?CHECK:''}</span>
    <span class="rt"><span class="rn">${esc(x.nom)}${x.manquant?'<span class="tag warn">pas trouvé</span>':''}</span>${sub?`<span class="rs">${esc(sub)}</span>`:''}</span>
    <span class="rq">${esc(qtyTxt(x.quantite,x.unite))}</span>
    <button class="missbtn" data-act="shop-miss" data-l="${x._lid}" data-id="${esc(x._id)}" aria-pressed="${x.manquant}" aria-label="${x.manquant?'Annuler « pas trouvé »':'Signaler pas trouvé'}">${MISS}</button></div>`}
function bodyShop(){
  const L=shopLines(),multi=shopLists().length>1;
  if(!L.length)return `<div class="empty">Cette liste est vide.</div>`;
  return groups(L).map(([r,list])=>{const done=list.filter(x=>x.coche||x.manquant).length,vis=S.hide?list.filter(x=>!x.coche):list;
    const right=done===list.length?`<span class="ord ok">✓ fait</span>`:`<span class="ord">${done}/${list.length}</span>`;
    return `<section class="sec">${secHead(r,right)}${vis.length?`<div class="group">${vis.map(x=>shopRow(x,multi)).join('')}</div>`:''}</section>`}).join('');
}
function startShop(ids){go(()=>{S.tab='magasin';S.shop=ids;S.hide=false});
  try{navigator.wakeLock&&navigator.wakeLock.request('screen').catch(()=>{})}catch(e){}
  setTimeout(()=>{const f=document.querySelector('.row.shop:not(.done):not(.miss)');if(f&&document.querySelector('.row.shop.done'))f.scrollIntoView({block:'center'})},60)}

/* ---------- Actions sur les listes ---------- */
function toggle(id){const l=liste(),i=l.lignes.findIndex(x=>x.id===id);
  if(i>=0)l.lignes.splice(i,1);else{const a=art(id);if(a)l.lignes.push(lineFrom(a))}
  save();renderBody()}
function bump(id,dir){const l=liste(),x=l.lignes.find(y=>y.id===id);if(!x)return;const s=stepOf(x.unite);
  const n=Math.round((x.quantite+dir*s)*100)/100;
  if(n<=0){l.lignes=l.lignes.filter(y=>y!==x);toast(`${x.nom} retiré de la liste`)}else x.quantite=n;
  save();renderBody()}
function duplicate(src){
  const base=src.nom.replace(/ \((exemple|copie)\)$/,'');
  const l={id:uid(),nom:`${base} · ${dfr(new Date().toISOString())}`,cree:new Date().toISOString(),statut:'en_cours',lignes:src.lignes.map(x=>({...x,coche:false}))};
  D.listes.push(l);save();return l}
function defaultName(){return 'Courses du '+new Date().toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'})}

/* ---------- Feuilles (sheets) ---------- */
function openSheet(type,draft){S.sheet=type;S.draft=draft;S.armed=false;drawSheet();$('screen').classList.add('open');
  const f=$('sheet').querySelector('[data-focus]');if(f)setTimeout(()=>f.focus({preventScroll:true}),320)}
function closeSheet(){$('screen').classList.remove('open');S.sheet=null;if(S.dirty){S.dirty=false;setTimeout(soft,0)}}
function drawSheet(){const sh=$('sheet'),b=sh.querySelector('.sh-body'),y=b?b.scrollTop:0;sh.className='sheet'+(S.sheet==='menu'?' auto':'');sh.innerHTML=SHEETS[S.sheet]();const n=sh.querySelector('.sh-body');if(n)n.scrollTop=y}
const nav=(title,ok='OK')=>`<div class="sh-nav"><button data-act="sh-cancel">Annuler</button><b id="sh-title">${esc(title)}</b><button class="ok" data-act="sh-ok">${ok}</button></div>`;
const rayonOpts=sel=>[...D.rayons].sort((a,b)=>(a.ordre??999)-(b.ordre??999)).map(r=>`<option value="${r.id}"${r.id===sel?' selected':''}>${esc(r.nom)}${r.ordre!=null?' · '+r.ordre:''}</option>`).join('');
const uniteOpts=sel=>UNITES.concat(UNITES.includes(sel)?[]:[sel]).map(x=>`<option${x===sel?' selected':''}>${esc(x)}</option>`).join('');
const qtyFields=d=>`<div class="f-row"><label for="f-qte">Quantité</label><input id="f-qte" data-k="quantite" data-num type="number" inputmode="decimal" min="0" step="any" value="${d.quantite}"></div>
  <div class="f-row sel"><label for="f-unite">Unité</label><select id="f-unite" data-k="unite">${uniteOpts(d.unite)}</select></div>`;
const SHEETS={
  art(){const d=S.draft,eopts=`<option value="">Avec son rayon</option>`+[...D.rayons].filter(r=>r.ordre!=null).sort((a,b)=>a.ordre-b.ordre).map(r=>`<option value="${r.ordre}"${+d.emplacement_ordre===r.ordre?' selected':''}>Avec ${esc(r.nom)} · ${r.ordre}</option>`).join('');
    return nav(d.id?'Article':'Nouvel article')+`<div class="sh-body">
    <div class="f-group" style="margin-top:6px"><div class="photo">${thumb(d)}<label for="f-photo">${d.photo?'Changer la photo':'Ajouter une photo'}</label><input id="f-photo" type="file" accept="image/*">${d.photo?'<button class="rm" data-act="rm-photo">Retirer</button>':''}</div></div>
    <div class="f-label">Article</div><div class="f-group">
      <div class="f-row full"><input id="f-nom" data-k="nom" data-focus value="${esc(d.nom)}" placeholder="Nom de l'article" aria-label="Nom"></div>
      <div class="f-row sel"><label for="f-rayon">Rayon</label><select id="f-rayon" data-k="rayon" data-redraw>${rayonOpts(d.rayon)}</select></div>${qtyFields(d)}</div>
    <div class="f-err" id="f-err"></div>
    <div class="f-label">Commentaire</div><div class="f-group"><div class="f-row"><textarea id="f-com" data-k="commentaire" placeholder="Marque, format, conditionnement…" aria-label="Commentaire">${esc(d.commentaire)}</textarea></div></div>
    <div class="f-label">Dans une nouvelle liste</div>
    <div class="seg" role="group" aria-label="Affichage"><button data-act="set" data-k="proposé" data-v="1" aria-pressed="${propose(d)}">Proposé</button><button data-act="set" data-k="proposé" data-v="" aria-pressed="${!propose(d)}">Sur demande (+)</button></div>
    <div class="hint">« Proposé » : l'article apparaît directement. « Sur demande » : il faut toucher + sous son rayon.</div>
    <div class="f-label">Place dans le magasin</div><div class="f-group"><div class="f-row sel"><label for="f-emp">Rangé</label><select id="f-emp" data-k="emplacement_ordre" data-num>${eopts}</select></div></div>
    <div class="hint">Pour les exceptions, comme les graines rangées avec les légumes.</div>
    ${d.id?`<button class="del${S.armed?' armed':''}" data-act="sh-del">${S.armed?'Confirmer la suppression':"Supprimer l'article"}</button>`:''}</div>`},
  line(){const d=S.draft;return nav(d.nom)+`<div class="sh-body">
    <div class="f-label">Dans cette liste</div><div class="f-group">${qtyFields(d)}</div>
    <div class="f-label">Commentaire pour cette liste</div><div class="f-group"><div class="f-row"><textarea id="f-com" data-k="commentaire" data-focus placeholder="Ex. bien mûres, en promo…" aria-label="Commentaire">${esc(d.commentaire)}</textarea></div></div>
    <div class="hint">Ce commentaire ne modifie pas la liste type.</div>
    <button class="del" data-act="sh-del">Retirer de la liste</button></div>`},
  ponct(){const d=S.draft;return nav('Article ponctuel','Ajouter')+`<div class="sh-body">
    <div class="f-group" style="margin-top:6px">
      <div class="f-row full"><input id="f-nom" data-k="nom" data-focus value="${esc(d.nom)}" placeholder="Nom de l'article" aria-label="Nom"></div>
      <div class="f-row sel"><label for="f-rayon">Rayon</label><select id="f-rayon" data-k="rayon">${rayonOpts(d.rayon)}</select></div>${qtyFields(d)}</div>
    <div class="f-err" id="f-err"></div>
    <div class="f-label">Commentaire</div><div class="f-group"><div class="f-row"><textarea id="f-com" data-k="commentaire" placeholder="Marque, format…" aria-label="Commentaire">${esc(d.commentaire)}</textarea></div></div>
    <div class="f-label">Garder cet article ?</div>
    <div class="seg" role="group"><button data-act="set" data-k="catalogue" data-v="" aria-pressed="${!d.catalogue}">Juste pour cette fois</button><button data-act="set" data-k="catalogue" data-v="1" aria-pressed="${!!d.catalogue}">Ajouter à la liste type</button></div>
    <div class="hint">S'il est ajouté à la liste type, il sera « sur demande » (accessible par +).</div></div>`},
  new(){const d=S.draft,src=[...D.listes].sort((a,b)=>b.cree.localeCompare(a.cree));
    const opt=(v,t,s)=>`<button class="radio" data-act="set" data-k="src" data-v="${v}"><span class="tick">${d.src===v?CHECK:''}</span><span class="rt"><span class="rn">${esc(t)}</span>${s?`<span class="rs">${esc(s)}</span>`:''}</span></button>`;
    return nav('Nouvelle liste','Créer')+`<div class="sh-body">
    <div class="f-group" style="margin-top:6px"><div class="f-row full"><input id="f-nom" data-k="nom" data-focus value="${esc(d.nom)}" placeholder="Nom de la liste" aria-label="Nom"></div></div>
    <div class="f-err" id="f-err"></div>
    <div class="f-label">Partir de</div><div class="f-group">${opt('','Une liste vide','Vous choisissez dans le catalogue')}${src.map(l=>opt(l.id,'Copie de '+l.nom,`${plural(l.lignes.length,'article')} · ${l.statut==='terminee'?'faite '+dfr(l.termine):'en cours'}`)).join('')}</div></div>`},
  finish(){const L=shopLines(),c=L.filter(x=>x.coche).length,m=L.filter(x=>x.manquant).length,rest=L.filter(x=>!x.coche),d=S.draft;
    return nav('Fin des courses','Terminer')+`<div class="sh-body">
    <div class="f-label">Bilan</div><div class="f-group">
      <div class="f-row"><label>Dans le caddie</label><input readonly value="${c}" aria-label="Dans le caddie"></div>
      <div class="f-row"><label>Pas trouvés</label><input readonly value="${m}" aria-label="Pas trouvés"></div>
      <div class="f-row"><label>Non pris</label><input readonly value="${rest.length-m}" aria-label="Non pris"></div></div>
    ${rest.length?`<div class="f-label">Les ${plural(rest.length,'article')} restants</div>
    <div class="seg" role="group"><button data-act="set" data-k="report" data-v="1" aria-pressed="${!!d.report}">Reporter dans une nouvelle liste</button><button data-act="set" data-k="report" data-v="" aria-pressed="${!d.report}">Les oublier</button></div>
    <div class="hint">${esc(rest.slice(0,8).map(x=>x.nom).join(', '))}${rest.length>8?'…':''}</div>`:''}
    <div class="hint" style="margin-top:14px">${shopLists().length>1?'Les listes passeront':'La liste passera'} dans l'historique.</div></div>`},
  prenom(){return nav('Votre prénom')+`<div class="sh-body"><div class="f-group" style="margin-top:6px"><div class="f-row full"><input id="f-nom" data-k="nom" data-focus value="${esc(S.draft.nom)}" aria-label="Prénom"></div></div><div class="f-err" id="f-err"></div></div>`},
  rename(){return nav('Renommer')+`<div class="sh-body"><div class="f-group" style="margin-top:6px"><div class="f-row full"><input id="f-nom" data-k="nom" data-focus value="${esc(S.draft.nom)}" aria-label="Nom de la liste"></div></div><div class="f-err" id="f-err"></div></div>`},
  menu(){const l=liste(),done=l.statut==='terminee';return `<div class="acts"><div class="cap">${esc(l.nom)}</div>
      <button data-act="m-rename">Renommer</button><button data-act="m-dup">Dupliquer</button>
      <button data-act="m-status">${done?'Remettre en cours':'Terminer la liste'}</button>
      <button class="${S.armed?'armed':'danger'}" data-act="m-del">${S.armed?'Confirmer la suppression':'Supprimer la liste'}</button></div>
    <div class="acts"><button class="bold" data-act="sh-cancel">Annuler</button></div>`}
};
function needName(){if(S.draft.nom.trim())return true;$('f-err').textContent='Donnez un nom';$('f-nom').focus();return false}
const COMMIT={
  art(){const d=S.draft;d.nom=d.nom.trim();if(!needName())return;
    const old=d.id?art(d.id):null;
    if(!old||old.rayon!==d.rayon)d.position=Math.max(0,...D.articles.filter(x=>x.rayon===d.rayon).map(x=>x.position))+1;
    d.priorite=propose(d)?1:2;
    if(old)Object.assign(old,d);else{let id=slug(d.nom),i=2;while(art(id))id=slug(d.nom)+'-'+i++;d.id=id;D.articles.push(d)}
    if(!propose(d))S.open.add(placement(d).id);
    if(save())toast(old?'Article modifié':'Article ajouté');closeSheet();render()},
  line(){const d=S.draft,x=liste().lignes.find(y=>y.id===d.id);Object.assign(x,{quantite:+d.quantite||1,unite:d.unite,commentaire:d.commentaire});save();closeSheet();renderBody()},
  ponct(){const d=S.draft;d.nom=d.nom.trim();if(!needName())return;const l=liste();
    if(d.catalogue){let id=slug(d.nom),i=2;while(art(id))id=slug(d.nom)+'-'+i++;
      const a={id,nom:d.nom,rayon:d.rayon,position:Math.max(0,...D.articles.filter(x=>x.rayon===d.rayon).map(x=>x.position))+1,unite:d.unite,quantite:+d.quantite||1,priorite:2,'proposé':false,commentaire:d.commentaire,photo:null,emplacement_ordre:null};
      D.articles.push(a);l.lignes.push(lineFrom(a));toast(`${d.nom} ajouté à la liste et à la liste type`)}
    else{l.lignes.push({id:'p-'+uid(),article:null,nom:d.nom,rayon:d.rayon,quantite:+d.quantite||1,unite:d.unite,commentaire:d.commentaire,coche:false,ajoute:new Date().toISOString(),ajoute_par:Store.prenom()||null});toast(`${d.nom} ajouté à la liste`)}
    save();S.q='';closeSheet();render()},
  new(){const d=S.draft;d.nom=d.nom.trim();if(!needName())return;
    const src=d.src&&D.listes.find(l=>l.id===d.src);
    const l={id:uid(),nom:d.nom,cree:new Date().toISOString(),statut:'en_cours',lignes:src?src.lignes.map(x=>({...x,coche:false})):[]};
    D.listes.push(l);save();closeSheet();go(()=>{S.lid=l.id;S.mode=src?'liste':'catalogue';S.q='';S.u='tout'});toast('Liste créée')},
  finish(){const ls=shopLists(),now=new Date().toISOString(),seen=new Set();
    const rest=ls.flatMap(l=>l.lignes.filter(x=>!x.coche)).filter(x=>!seen.has(x.id)&&seen.add(x.id));
    ls.forEach(l=>{l.statut='terminee';l.termine=now});
    let nl=null;if(S.draft.report&&rest.length){nl={id:uid(),nom:'Reste des courses · '+dfr(now),cree:now,statut:'en_cours',lignes:rest.map(x=>({...x,coche:false,manquant:false}))};D.listes.push(nl)}
    save();closeSheet();go(()=>{S.shop=null;S.pick=null;S.tab='listes';S.lid=nl?nl.id:null;S.mode='liste';S.q=''});
    toast(nl?`Courses terminées · ${plural(rest.length,'article')} reporté${rest.length>1?'s':''}`:'Courses terminées')},
  async prenom(){if(!needName())return;try{await Store.setPrenom(S.draft.nom.trim());closeSheet();render();toast('Prénom modifié')}catch(e){$('f-err').textContent=gateMsg(e)}},
  rename(){if(!needName())return;liste().nom=S.draft.nom.trim();save();closeSheet();render()}
};

/* ---------- Événements ---------- */
const ACTS={
  tab(el){const t=el.dataset.t;S.armed=false;
    go(()=>{if(S.tab===t){S.lid=null;if(t==='magasin'){S.shop=null;S.pick=null}if(t==='imprimer')S.plid=null}S.tab=t;S.q='';S.u='tout'})},
  'print-open'(){const l=liste();if(!l.lignes.length){toast("Ajoutez d'abord des articles à la liste");return}go(()=>{S.tab='imprimer';S.plid=l.id})},
  'print-pick'(el){go(()=>{S.plid=el.dataset.id})},
  'print-back'(){go(()=>{S.plid=null})},
  popt(el){S.popt[el.dataset.k]=el.dataset.v==='1';const y=$('scroll').scrollTop;render();$('scroll').scrollTop=y},
  'print-go'(){$('printroot').innerHTML=`<div class="paper">${sheetHtml(plist())}</div>`;try{window.print()}catch(e){}},
  'shop-start'(){const l=liste();if(!l.lignes.length){toast("Ajoutez d'abord des articles à la liste");return}startShop([l.id])},
  pick(el){const id=el.dataset.id;S.pick.has(id)?S.pick.delete(id):S.pick.add(id);render()},
  'shop-go'(){if(!S.pick||!S.pick.size){toast('Choisissez au moins une liste');return}startShop([...S.pick])},
  'shop-change'(){go(()=>{S.shop=null;S.pick=null})},
  'shop-hide'(){S.hide=!S.hide;render()},
  'shop-tick'(el){const x=findLine(el.dataset.l,el.dataset.id);if(!x)return;x.coche=!x.coche;x.coche_par=x.coche?(Store.prenom()||null):null;if(x.coche)x.manquant=false;
    try{navigator.vibrate&&navigator.vibrate(8)}catch(e){}save();renderBody()},
  'shop-miss'(el){const x=findLine(el.dataset.l,el.dataset.id);if(!x)return;x.manquant=!x.manquant;if(x.manquant)x.coche=false;save();renderBody()},
  'shop-finish'(){const rest=shopLines().filter(x=>!x.coche).length;openSheet('finish',{report:rest>0})},
  chip(el){S.u=el.dataset.u;const st=document.querySelector('.chips');const sx=st.scrollLeft;render();document.querySelector('.chips').scrollLeft=sx},
  more(el){const r=el.dataset.r;S.open.has(r)?S.open.delete(r):S.open.add(r);renderBody()},
  'edit-art'(el){openSheet('art',structuredClone(art(el.dataset.id)))},
  'new-art'(){openSheet('art',{id:'',nom:S.q.trim(),rayon:D.rayons.find(r=>r.ordre===1).id,position:0,unite:'unité',quantite:1,priorite:1,'proposé':true,commentaire:'',photo:null,emplacement_ordre:null})},
  reset(el){if(el.dataset.armed){Store.resetLocal();D=Store.data();D.rayons=structuredClone(BASE.rayons);seed();save();S.open.clear();render();toast("Données d'origine rétablies")}
    else{el.dataset.armed=1;el.textContent='Touchez encore pour tout effacer (listes comprises)'}},
  'open-list'(el){go(()=>{S.lid=el.dataset.id;S.mode=liste().lignes.length?'liste':'catalogue';S.q='';S.u='tout'})},
  'new-list'(){openSheet('new',{nom:defaultName(),src:''})},
  back(){go(()=>{S.lid=null;S.q=''})},
  mode(el){S.mode=el.dataset.m;S.q='';render()},
  toggle(el){toggle(el.dataset.id)},
  inc(el){bump(el.dataset.id,1)},dec(el){bump(el.dataset.id,-1)},
  'edit-line'(el){const x=liste().lignes.find(y=>y.id===el.dataset.id);openSheet('line',{...x,nom:lineView(x).nom})},
  'new-ponct'(){openSheet('ponct',{nom:S.q.trim(),rayon:D.rayons.find(r=>r.ordre===7)?.id||D.rayons[0].id,quantite:1,unite:'unité',commentaire:'',catalogue:''})},
  menu(){openSheet('menu',{})},
  reuse(){const l=duplicate(liste());go(()=>{S.lid=l.id;S.mode='liste'});toast('Nouvelle liste créée à partir de l\'historique')},
  soon(el){toast(`${el.dataset.s} arrive à l'étape suivante`)},
  'sh-cancel'(){closeSheet()},
  'g-send'(el){const v=($('g-email').value||'').trim();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)){gateErr('Entrez une adresse e-mail valide');return}
    busy(el,async()=>{await Store.sendCode(v);S.email=v;S.gate='code';renderGate()})},
  'g-verify'(el){const v=($('g-code').value||'').replace(/\D/g,'');if(v.length!==6){gateErr('Le code contient 6 chiffres');return}
    busy(el,async()=>{await Store.verify(S.email,v);S.gate=null;boot()})},
  'g-back'(){S.gate='email';renderGate()},
  'g-create'(el){const p=($('g-prenom').value||'').trim();if(!p){gateErr('Indiquez votre prénom');return}
    busy(el,async()=>{await Store.createFoyer(p);S.gate=null;boot();toast('Foyer créé · le catalogue est en cours d\'envoi')})},
  'g-join'(el){const p=($('g-prenom').value||'').trim(),c=($('g-join').value||'').trim().toUpperCase();if(!p){gateErr('Indiquez votre prénom');return}
    if(c.length!==6){gateErr("Le code d'invitation contient 6 caractères");return}
    busy(el,async()=>{await Store.joinFoyer(c,p);S.gate=null;boot();toast('Bienvenue dans le foyer')})},
  async 'g-logout'(){await Store.logout();S.gate='email';renderGate()},
  'set-prenom'(){openSheet('prenom',{nom:Store.prenom()})},
  'copy-code'(){const c=(Store.profile()||{}).code||'';const sel=()=>{const r=document.createRange();r.selectNodeContents($('code'));const s=getSelection();s.removeAllRanges();s.addRange(r)};
    try{navigator.clipboard.writeText(c).then(()=>toast('Code copié'),()=>{sel();toast('Code sélectionné, copiez-le')})}catch(e){sel();toast('Code sélectionné, copiez-le')}},
  async 'sync-now'(){toast('Synchronisation…');await Store.syncNow();toast(Store.statusText())},
  async logout(){if(S.armed!=='logout'){S.armed='logout';render();return}S.armed=false;await Store.logout();S.gate='email';S.tab='listes';S.lid=null;renderGate()},
  'sh-ok'(){COMMIT[S.sheet]()},
  'sh-del'(){if(S.sheet==='line'){const l=liste();l.lignes=l.lignes.filter(y=>y.id!==S.draft.id);save();closeSheet();renderBody();toast('Retiré de la liste');return}
    if(!S.armed){S.armed=true;drawSheet();return}
    D.articles=D.articles.filter(x=>x.id!==S.draft.id);save();closeSheet();render();toast('Article supprimé')},
  set(el){S.draft[el.dataset.k]=el.dataset.v==='1'?true:el.dataset.v==='' && el.dataset.k!=='src'?false:el.dataset.v;drawSheet()},
  'rm-photo'(){S.draft.photo=null;drawSheet()},
  'm-rename'(){const l=liste();closeSheet();setTimeout(()=>openSheet('rename',{nom:l.nom}),200)},
  'm-dup'(){const l=duplicate(liste());closeSheet();go(()=>{S.lid=l.id;S.mode='liste'});toast('Liste dupliquée')},
  'm-status'(){const l=liste();if(l.statut==='terminee'){l.statut='en_cours';delete l.termine;toast('Liste remise en cours')}else{l.statut='terminee';l.termine=new Date().toISOString();toast("Liste terminée, rangée dans l'historique")}
    save();closeSheet();render()},
  'm-del'(){if(!S.armed){S.armed=true;drawSheet();return}const n=liste().nom;D.listes=D.listes.filter(l=>l.id!==S.lid);save();closeSheet();go(()=>{S.lid=null});toast(`« ${n} » supprimée`)}
};
$('screen').addEventListener('click',e=>{const el=e.target.closest('[data-act]');if(!el||!$('screen').contains(el))return;const f=ACTS[el.dataset.act];if(f){e.preventDefault();f(el)}});
$('screen').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[role="button"]')){e.preventDefault();e.target.click()}
  if(e.key==='Escape'&&S.sheet)closeSheet();
  if(e.key==='Enter'&&S.sheet&&e.target.matches('input:not([type=file])')){e.preventDefault();COMMIT[S.sheet]&&COMMIT[S.sheet]()}
  if(e.key==='Enter'&&S.gate&&e.target.matches('input')){e.preventDefault();const b=$('view').querySelector(S.gate==='foyer'&&e.target.id==='g-prenom'?'[data-act="g-create"]':'.btn.pri');if(b)b.click()}});
$('view').addEventListener('input',e=>{if(e.target.id==='q'){S.q=e.target.value;renderBody()}});
$('sheet').addEventListener('input',e=>{const t=e.target,k=t.dataset.k;if(!k)return;S.draft[k]='num' in t.dataset?(t.value===''?(k==='emplacement_ordre'?null:0):+t.value):t.value;
  const er=$('f-err');if(er)er.textContent='';if('redraw' in t.dataset)drawSheet()});
$('sheet').addEventListener('change',e=>{if(e.target.id!=='f-photo')return;const f=e.target.files[0];if(f)resize(f).then(u=>{S.draft.photo=u;drawSheet()}).catch(()=>toast('Cette image ne peut pas être lue'))});
function resize(file){return new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>{const img=new Image();img.onload=()=>{
  const s=240,c=document.createElement('canvas');c.width=c.height=s;const k=Math.max(s/img.width,s/img.height),w=img.width*k,h=img.height*k;
  c.getContext('2d').drawImage(img,(s-w)/2,(s-h)/2,w,h);ok(c.toDataURL('image/jpeg',.72))};img.onerror=ko;img.src=r.result};r.onerror=ko;r.readAsDataURL(file)})}
load();
