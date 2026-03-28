const BACKEND = 'https://hiphopruzbcrd.pythonanywhere.com';
const GOOGLE_CLIENT_ID = '548333676754-ohvlnp1nfjpc1jnbkdfmr9hpccaj508i.apps.googleusercontent.com';
const LOGO = 'https://i.ibb.co/pBvLbsG3/ed89a1453931.png';
const ADMIN_EMAIL = 'hip@hamakom.ovh';
const SUPER_ADMINS = ['hip@hamakom.ovh', '0548537646a@gmail.com'];
const STORAGE_KEY = 'bina_user';

let me = null, items = [], lastTs = 0, newCount = 0, atBottom = true;
let activePicker = null, activeCmtMsgId = null;
let rxnCache = {}, cmtCount = {};
const knownIds = new Set();
let pollPending = false, oldestTs = 0, allLoaded = false, loadingMore = false, _isAllowedAdmin = false;

let composeProfile = 'news', composeImgUrl = '', composeVidUrl = '', composeBtns = [], composeHtmlCode = '';
let chatLastIds = '', chatTypingTimer = null, adminMsgsLastId = null, adminMsgsUnread = 0;
let _allowedMap = {};
let _rbacData = {};
let _writePerm = null;

let siteGlobalSettings = { title: "בינה ודעה", blockedEmails: [], commentsEnabled: true };
try{ const locS = localStorage.getItem('siteGlobalSettings'); if(locS) siteGlobalSettings = JSON.parse(locS); } catch(e){}

function initGlobalSettings() {
    document.getElementById('pageTitle').innerText = siteGlobalSettings.title;
    document.getElementById('hdrChannelName').innerHTML = `${esc(siteGlobalSettings.title)} - <span style="color:#1a56db">${CHANNELS.find(c=>c.id===currentChannelId)?.name||'כללי'}</span>`;
    const logT = document.getElementById('loginSiteTitle'); if(logT) logT.innerText = siteGlobalSettings.title;
}

let currentChannelId = 'general';
const CHANNELS = [
  { id: 'general', name: 'הערוץ הרשמי', icon: 'fa-star' },
  { id: 'creators', name: 'לפי יוצרים', icon: 'fa-palette' },
  { id: 'news', name: 'חדשות ועדכוני AI', icon: 'fa-newspaper' },
  { id: 'system', name: 'עדכוני מערכת', icon: 'fa-bullhorn' },
  { id: 'misc', name: 'שונות (בדיחות ותכני AI)', icon: 'fa-smile-beam' }
];

function renderChannels() {
  const list = document.getElementById('channelsList'); if(!list) return;
  list.innerHTML = CHANNELS.map(ch => `<div class="channel-item ${ch.id === currentChannelId ? 'active' : ''}" onclick="switchChannel('${ch.id}', '${ch.name}')"><i class="fas ${ch.icon}"></i> ${ch.name}</div>`).join('');
  const hdrName = document.getElementById('hdrChannelName');
  if (hdrName) hdrName.innerHTML = `${esc(siteGlobalSettings.title)} - <span style="color:#1a56db">${CHANNELS.find(c=>c.id===currentChannelId).name}</span>`;
}

async function switchChannel(channelId, channelName) {
  if (currentChannelId === channelId) return;
  currentChannelId = channelId; renderChannels();
  if(window.innerWidth <= 900) document.getElementById('leftSidebar').classList.remove('open');
  items = []; lastTs = 0; knownIds.clear(); oldestTs = 0; allLoaded = false;
  document.getElementById('feedInner').innerHTML = ''; document.getElementById('empty').style.display = 'block';
  applyWritePerm(_writePerm, _rbacData); 
  await loadFeed();
}

function toggleLeftSidebar() { document.getElementById('leftSidebar').classList.toggle('open'); }
const REACT_SVG = `<svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.65"/><circle cx="8.5" cy="9.5" r="1.1" fill="currentColor"/><circle cx="13.5" cy="9.5" r="1.1" fill="currentColor"/><path d="M8 13.2c.65 1.5 2 2.2 3 2.2s2.35-.72 3-2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function esc(t){return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escAttr(t){return esc(t).replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function isSuperAdmin(){return SUPER_ADMINS.includes(me?.email?.toLowerCase());}
function isAdmin(){return _isAllowedAdmin;}

async function checkAllowedAdmin(){
  if(!me)return;
  try{
    const r=await fetch(BACKEND+'/allowed_list'); const d=await r.json();
    const emails=(d.emails||[]).map(e=>typeof e==='string'?e:e.email).map(e=>e.toLowerCase());
    _isAllowedAdmin=emails.includes(me.email.toLowerCase())||isSuperAdmin();
  }catch(e){_isAllowedAdmin=isSuperAdmin();}

  if(_isAllowedAdmin){
    await loadAllowedMap();
    document.getElementById('adminComposeBar').classList.add('show');
    document.getElementById('adminMsgsBtn').style.display='flex';
    document.getElementById('adminChatPanel').classList.add('show');
    document.getElementById('rightSidebar').classList.add('show');
    loadAdminChat(); setInterval(loadAdminChat, 2500); setInterval(pollChatTyping, 2500);
    loadAdminMsgs(); setInterval(loadAdminMsgs, 5000);
    pingChatPresence(); setInterval(pingChatPresence, 15000);
    await pollWritePerm(); setInterval(pollWritePerm, 3000);
    pollUpdateMode(); setInterval(pollUpdateMode, 5000);
    document.getElementById('feedWrap').style.paddingBottom='120px';
  }

  if(isSuperAdmin()){
    document.getElementById('adminComposeBar')?.classList.remove('blocked');
    document.getElementById('blockNotice')?.classList.remove('show');
    document.getElementById('adminBadge').classList.add('show');
    document.getElementById('adBtn').style.display='flex';
    document.getElementById('siteSettingsBtn').style.display='flex';
    document.getElementById('adminMsgsSendRow').classList.add('show');
    document.getElementById('manageAdminsBtn').style.display='flex';
    document.getElementById('writePermBtn').style.display='flex';
    loadAdminUsers(); setInterval(loadAdminUsers, 30000);
  }
}

async function loadAllowedMap(){
  try{
    const r=await fetch(BACKEND+'/allowed_list');
    const d=await r.json();
    _allowedMap={};
    (d.emails||[]).forEach(e=>{
      if(typeof e==='object'&&e.email){
        _allowedMap[e.email.toLowerCase()]={name:e.name||e.email.split('@')[0],picture:e.picture||''};
      }
    });
    _allowedMap[ADMIN_EMAIL.toLowerCase()]={name:'דוד',picture:me?.picture||''};
  }catch(ex){}
}

function getDisplayName(email,fallback){
  const entry=_allowedMap[(email||'').toLowerCase()];
  if(entry?.name)return entry.name;
  if(fallback&&!fallback.includes('@')&&!fallback.includes('×')&&fallback.length<30)return fallback;
  if(email&&email.includes('@'))return email.split('@')[0];
  return fallback||email||'?';
}

function saveUser(u){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(u));}catch(e){}}
function loadSavedUser(){try{const r=localStorage.getItem(STORAGE_KEY);if(r)return JSON.parse(r);}catch(e){}return null;}
function clearSavedUser(){try{localStorage.removeItem(STORAGE_KEY);}catch(e){}}

function toggleUserMenu(e){
  e.stopPropagation(); const menu=document.getElementById('userMenu'); if(!menu)return;
  const isOpen=menu.style.display!=='none'; menu.style.display=isOpen?'none':'block';
  if(!isOpen){setTimeout(()=>document.addEventListener('click',()=>{menu.style.display='none';},{once:true}),0);}
}

function doLogout(){
  clearSavedUser();me=null;
  document.getElementById('app').style.display='none'; document.getElementById('leftSidebar').style.display='none';
  document.getElementById('bannedScreen').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  try{google.accounts.id.disableAutoSelect();}catch(e){}
}

async function verifyAndLogin(user){
  try {
    const res = await fetch(BACKEND+'/auth_check', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email: user.email})});
    const d = await res.json();
    if(d.blocked) {
      document.getElementById('loginScreen').style.display='none';
      document.getElementById('app').style.display='none';
      document.getElementById('leftSidebar').style.display='none';
      document.getElementById('bannedScreen').style.display='flex';
      return false;
    }
  } catch(e) {}
  
  if(user.name&&(user.name.includes('×—')||user.name.includes('Ã'))) user.name=user.email.split('@')[0];
  me=user; saveUser(user); applyLogin(); return true;
}

function applyLogin(){
  initGlobalSettings();
  const av=document.getElementById('userAvatar');
  const avatarHtml=me.picture?`<img src="${escAttr(me.picture)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid #eee">`:`<div style="width:30px;height:30px;border-radius:50%;background:#1a56db;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">${esc(me.name[0].toUpperCase())}</div>`;
  av.innerHTML=`<div style="cursor:pointer" onclick="toggleUserMenu(event)">${avatarHtml}</div><div id="userMenu" style="display:none;position:absolute;top:48px;left:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:200;min-width:160px;overflow:hidden;font-family:'Heebo',sans-serif;"><div style="padding:10px 14px;font-size:12px;font-weight:700;color:#374151;border-bottom:1px solid #f3f4f6;">${esc(me.name)}</div><button onclick="doLogout()" style="width:100%;padding:10px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#dc2626;display:flex;align-items:center;gap:8px;"><i class="fas fa-sign-out-alt"></i> התנתק</button></div>`;
  document.getElementById('loginScreen').style.display='none'; document.getElementById('app').style.display='flex'; document.getElementById('leftSidebar').style.display='flex';
  renderChannels();
  fetch(BACKEND+'/feed_login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:me.name,picture:me.picture})}).then(r=>r.json()).then(d=>{if(isSuperAdmin()&&d.count!=null)document.getElementById('adminUserCount').textContent=d.count;}).catch(()=>{});
  checkAllowedAdmin();
  loadFeed(); setTimeout(loadAd,3000); setInterval(loadAd, 60*60*1000); initDark(); initNotifications();
}

async function loadAdminUsers(){try{const r=await fetch(BACKEND+'/feed_logins?email='+encodeURIComponent(me.email));const d=await r.json();document.getElementById('adminUserCount').textContent=(d.logins||[]).length;}catch(e){}}

function initGoogle(){
  if(!window.google) return;
  google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:handleLogin,auto_select:true});
  const saved=loadSavedUser(); if(saved){verifyAndLogin(saved);return;}
  initGlobalSettings();
  google.accounts.id.renderButton(document.getElementById('googleBtn'),{theme:'outline',size:'large',locale:'he',width:240});
  google.accounts.id.prompt();
}

async function handleLogin(resp){
  let payload={};
  try{const parts=resp.credential.split('.');if(parts.length!==3)throw new Error('invalid');payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));}catch(e){return;}
  const email=(payload.email||'').toLowerCase(); if(!email||!email.includes('@'))return;
  const picture=payload.picture||''; let displayName='';
  try{const lr=await fetch(BACKEND+'/allowed_list');const ld=await lr.json();const myEntry=(ld.emails||[]).find(e=>typeof e==='object'&&e.email===email);if(myEntry&&myEntry.name&&!myEntry.name.includes('×—')&&myEntry.name!==email)displayName=myEntry.name;}catch(e){}
  if(!displayName||displayName.includes('×—'))displayName=email.split('@')[0];
  await verifyAndLogin({email,name:displayName,picture});
}

function rich(t){
  if(!t)return''; let s=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s=s.replace(/\u200Bquote:([a-f0-9\-]+)\n((?:&gt; [^\n]*\n?)*)\u200B\n*/g,(m,qid,body)=>{const lines=body.replace(/^&gt; /gm,'').trim().split('\n');const firstLine=lines[0]||'';const rest=lines.slice(1).join(' ').trim();return `<div class="quote-block" onclick="jumpToQuotedMsg('${qid}')"><i class="fas fa-quote-right" style="font-size:9px;color:#9ca3af;"></i><span class="quote-block-text"><strong>${firstLine}</strong>${rest?' — <span style="font-weight:400">'+rest.substring(0,80)+(rest.length>80?'…':'')+'</span>':''}</span></div>`;});
  s=s.replace(/\u200B/g,'').replace(/\n/g,'<br>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<u>$1</u>').replace(/_([^_\n]+)_/g,'<em>$1</em>').replace(/~~([^~\n]+)~~/g,'<s>$1</s>').replace(/---DIVIDER---/g,'<hr class="bubble-divider">').replace(/<br>\s*(<hr[^>]*>)\s*<br>/g,'$1').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/(?<!href=")(https?:\/\/[^\s<>"']{1,500})/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\x02color:([^\x03]+)\x03([\s\S]*?)\x02\/color\x03/g,'<span style=\"color:$1\">$2</span>');
  return s;
}

function timeLabel(e){
  const today=new Date().toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric'});
  return (e.date&&e.date!==today)?e.date+' '+e.time:(e.time||'');
}

function buildMsg(e){
  const red=e.profile==='red'; const id=e.id; const lines=(e.text||'').trim().split('\n'); const h=lines[0]||''; const body=lines.slice(1).join('\n').trim();
  let content=red?`<div class="bubble-headline">🚨 ${esc(h)}</div>`+(body?`<div class="bubble-text" style="margin-top:4px">${rich(body)}</div>`:''):`<div class="bubble-text">${rich(h+(body?'\n'+body:''))}</div>`;
  let media='';
  if(e.imgUrl){const su=escAttr(e.imgUrl);media+=`<div class="bubble-img"><img src="${su}" loading="lazy" style="cursor:pointer;border-radius:12px;display:block;" onclick="openLightbox('${su}')" onerror="this.closest('.bubble-img').remove()"></div>`;}
  if(e.videoUrl){
    const vu=e.videoUrl; const ytMatch=vu.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/); const driveMatch=vu.match(/drive\.google\.com\/file\/d\/([^/]+)/); const isDirectVideo=/\.(mp4|webm|ogg|m3u8)([?#,]|$)/i.test(vu)||vu.includes('.m3u8');
    if(ytMatch) media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;"><iframe width="100%" height="200" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe></div>`;
    else if(driveMatch) media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;"><iframe src="https://drive.google.com/file/d/${driveMatch[1]}/preview" width="100%" height="300" frameborder="0" allow="autoplay" allowfullscreen></iframe></div>`;
    else if(isDirectVideo) media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;width:100%;"><video controls playsinline preload="metadata" style="max-height:480px;display:block;border-radius:12px;object-fit:contain;" src="${escAttr(vu)}"></video></div>`;
    else media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;width:100%;background:#000;"><iframe src="${escAttr(vu)}" width="100%" height="300" frameborder="0" allowfullscreen></iframe></div>`;
  }
  let btns=''; if(e.buttons&&e.buttons.length)btns='<div class="bubble-btns">'+e.buttons.map(b=>`<a class="lnk-btn" href="${escAttr(b.url)}" target="_blank">${esc(b.text)}</a>`).join('')+'</div>';
  if(e.htmlCode){ const safeHtml=e.htmlCode.replace(/`/g,'&#96;'); media+=`<div class="bubble-html" style="margin-top:9px;border-radius:12px;overflow:hidden;width:100%;"><iframe srcdoc="${safeHtml.replace(/"/g,'&quot;')}" style="width:100%;border:none;display:block;" sandbox="allow-scripts allow-popups" scrolling="no" onload="this.style.height=this.contentDocument.body.scrollHeight+'px'"></iframe></div>`; }
  
  const n=cmtCount[id]||0; const canDel=isAdmin();
  return `<div class="msg-row" data-id="${escAttr(id)}"><img class="msg-av" src="${LOGO}" onerror="this.style.display='none'"><div class="msg-col"><div class="msg-meta"><span class="msg-meta-name">${esc(siteGlobalSettings.title)}</span><span class="msg-meta-time">${e.time||''}</span>${e.edited?'<span class="msg-meta-edited">נערכה</span>':''}${isSuperAdmin()&&e.senderEmail?`<span class="msg-meta-sender">${esc(e.senderEmail.split('@')[0])}</span>`:''}</div><div class="bubble-wrap-outer"><div class="bubble-top-actions"><button class="link-btn" onclick="copyMsgLink('${escAttr(id)}',this)"><i class="fas fa-link"></i></button><button class="cmt-btn${n>0?' has-cmt':''}" id="cbtn-${escAttr(id)}" onclick="openComments('${escAttr(id)}')"><i class="fas fa-comment"></i>${n>0?`<span style="font-size:9px;font-weight:800;margin-right:2px">${n}</span>`:''}</button>${canDel?`<button class="msg-action-btn edit" onclick="openEditMsg('${escAttr(id)}')"><i class="fas fa-pen"></i></button><button class="msg-action-btn quote" onclick="quoteFeedMsg('${escAttr(id)}')"><i class="fas fa-quote-right"></i></button><button class="msg-action-btn del" onclick="deleteFeedMsg('${escAttr(id)}')"><i class="fas fa-trash"></i></button>`:''}</div><div class="bubble${red?' is-red':''}">${content}${media}${btns}</div></div><div class="bubble-foot"><div class="rxn-row" id="rxn-${escAttr(id)}"><button class="rxn-add-btn" onclick="openPicker(event,'${escAttr(id)}')">${REACT_SVG}</button></div></div></div></div>`;
}

function copyMsgLink(id, btn){
  const el=document.querySelector(`.msg-row[data-id="${id}"]`); if(el)el.id='msg-link-'+id;
  const url=location.href.split('#')[0]+'#msg-link-'+id;
  navigator.clipboard.writeText(url).catch(()=>{});
  btn.classList.add('copied'); btn.innerHTML='<i class="fas fa-check" style="font-size:9px"></i>'; setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML='<i class="fas fa-link" style="font-size:9px"></i>';},1500);
}

function renderRxn(msgId,rxns){
  rxnCache[msgId]=rxns; const bar=document.getElementById('rxn-'+msgId); if(!bar)return;
  const addBtn=bar.querySelector('.rxn-add-btn'); bar.innerHTML='';
  const activeTypes=Object.entries(rxns).filter(([,users])=>users.length);
  activeTypes.forEach(([emoji,users])=>{
    const mine=users.includes(me?.email); const c=document.createElement('button');
    c.className='rxn-chip'+(mine?' mine':''); c.innerHTML=`<span class="rxn-emoji">${esc(emoji)}</span><span class="rxn-count">${users.length}</span>`;
    c.onclick=()=>doReact(msgId,emoji); bar.appendChild(c);
  });
  if(addBtn){addBtn.classList.toggle('maxed',activeTypes.length>=5);bar.appendChild(addBtn);}
  else{const b=document.createElement('button');b.className='rxn-add-btn'+(activeTypes.length>=5?' maxed':'');b.innerHTML=REACT_SVG;b.onclick=(ev)=>openPicker(ev,msgId);bar.appendChild(b);}
}

function openPicker(ev,msgId){
  ev.stopPropagation();activePicker=msgId; const p=document.getElementById('emojiPicker');
  p.style.display='grid'; const rect=ev.currentTarget.getBoundingClientRect();
  p.style.top=Math.max(64, rect.top-p.offsetHeight-8)+'px'; p.style.left=Math.max(8, rect.right-p.offsetWidth)+'px';
  p.classList.add('show');
}
function pickEmoji(em){document.getElementById('emojiPicker').classList.remove('show');if(activePicker)doReact(activePicker,em);activePicker=null;}
document.addEventListener('click',e=>{if(!e.target.closest('#emojiPicker')&&!e.target.closest('.rxn-add-btn'))document.getElementById('emojiPicker').classList.remove('show');});

async function doReact(msgId,emoji){
  if(!me)return; const current=rxnCache[msgId]||{}; const activeTypes=Object.entries(current).filter(([,u])=>u.length);
  if(!(emoji in current)&&activeTypes.length>=5)return;
  const users=[...(current[emoji]||[])]; const myIdx=users.indexOf(me.email);
  if(myIdx>=0)users.splice(myIdx,1);else users.push(me.email);
  const optimistic={...current}; if(users.length)optimistic[emoji]=users;else delete optimistic[emoji];
  renderRxn(msgId,optimistic);
  try{ const r=await fetch(BACKEND+'/feed_react',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,msgId,emoji})});
  const d=await r.json();if(d.status==='ok')renderRxn(msgId,d.reactions); }catch(e){}
}

/* ── COMMENTS ── */
function openComments(msgId){activeCmtMsgId=msgId;document.getElementById('commentsPanel').classList.add('open');loadComments(msgId);}
function closeComments(){document.getElementById('commentsPanel').classList.remove('open');activeCmtMsgId=null;}

function evaluateCommentPermissions(list) {
    const hasCommented = list.some(c => c.email === me?.email);
    const commentsEnabled = siteGlobalSettings.commentsEnabled !== false; 
    const canComment = isSuperAdmin() || (commentsEnabled && !hasCommented);
    const inpRow = document.getElementById('commentInputContainer');
    const disabledMsg = document.getElementById('commentDisabledMsg');
    
    if(inpRow && disabledMsg) {
        if(canComment) {
            inpRow.style.display = 'flex'; disabledMsg.style.display = 'none';
        } else {
            inpRow.style.display = 'none'; disabledMsg.style.display = 'block';
            disabledMsg.innerText = !commentsEnabled ? 'התגובות סגורות כרגע על ידי ההנהלה.' : 'הגבת כבר על פוסט זה.';
        }
    }
}

async function loadComments(msgId){
  const b=document.getElementById('cpBody'); const cached=b.dataset.msgId===msgId;
  if(!cached)b.innerHTML='<div class="cp-spinner"><div class="cp-spinner-ring"></div>טוען...</div>';
  b.dataset.msgId=msgId;
  try{
    const r=await fetch(BACKEND+'/feed_comments?msgId='+encodeURIComponent(msgId)); const d=await r.json(); const list=d.comments||[];
    cmtCount[msgId]=list.length; updateCmtBtn(msgId,list.length);
    b.innerHTML=list.length?list.map(c=>buildCmt(msgId,c)).join(''):'<div class="no-cmt">עדיין אין תגובות</div>';
    b.scrollTop=b.scrollHeight;
    evaluateCommentPermissions(list);
  }catch(e){b.innerHTML='<div class="no-cmt">שגיאה</div>';}
}

function buildCmt(msgId,c){
  const canDelete=isSuperAdmin()||(c.email===me?.email);
  const av=c.picture?`<img class="ci-av" src="${escAttr(c.picture)}">`:`<div class="ci-av-i">${esc((c.name||'?')[0].toUpperCase())}</div>`;
  return `<div class="ci" id="ci-${escAttr(c.id)}">${av}<div class="ci-bubble"><div class="ci-text">${esc(c.text)}</div><div class="ci-time">${c.time||''}</div>${canDelete?`<button class="ci-del" onclick="delCmt('${escAttr(msgId)}','${escAttr(c.id)}')"><i class="fas fa-times"></i></button>`:''}</div></div>`;
}

function updateCmtBtn(msgId,n){
  const btn=document.getElementById('cbtn-'+msgId);if(!btn)return;
  btn.className='cmt-btn'+(n>0?' has-cmt':''); btn.innerHTML=`<i class="fas fa-comment" style="font-size:11px"></i>${n>0?`<span style="font-size:9px;font-weight:800;margin-right:2px">${n}</span>`:''}`;
}

async function sendComment(){
  const inp=document.getElementById('cpInp');const text=inp.value.trim(); if(!text||!me||!activeCmtMsgId)return;
  inp.value='';inp.style.height='auto';
  try{
    const r=await fetch(BACKEND+'/feed_comment_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:me.name,picture:me.picture,msgId:activeCmtMsgId,text})});
    const d=await r.json();
    if(d.status==='ok'){
      const b=document.getElementById('cpBody');b.querySelector('.no-cmt')?.remove();
      const div=document.createElement('div');div.innerHTML=buildCmt(activeCmtMsgId,d.comment);b.appendChild(div.firstChild);b.scrollTop=b.scrollHeight;
      cmtCount[activeCmtMsgId]=(cmtCount[activeCmtMsgId]||0)+1;updateCmtBtn(activeCmtMsgId,cmtCount[activeCmtMsgId]);
      evaluateCommentPermissions([{email: me.email}]); 
    } else { alert(d.msg || 'שגיאה'); }
  }catch(e){}
}

async function delCmt(msgId,cid){
  if(!me)return;
  try{
    await fetch(BACKEND+'/feed_comment_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,msgId,commentId:cid})});
    document.getElementById('ci-'+cid)?.remove(); cmtCount[msgId]=Math.max(0,(cmtCount[msgId]||1)-1); updateCmtBtn(msgId,cmtCount[msgId]);
  }catch(e){}
}

/* ── FEED POLLING ── */
async function loadFeed(){
  setLoading(true);
  try{
    const r=await fetch(BACKEND+`/feed?channel=${currentChannelId}&limit=20`); const d=await r.json();
    if(d.status==='ok'){
      items=[...d.feed].reverse(); items.forEach(e=>knownIds.add(e.id)); allLoaded=d.feed.length<20; oldestTs=items.length?Math.min(...items.map(e=>e.ts||Infinity)):0; lastTs=items.length?Math.max(...items.map(e=>e.ts||0)):0;
      const inner=document.getElementById('feedInner');
      inner.innerHTML=items.length?items.map(buildMsg).join(''):'';
      document.getElementById('empty').style.display=items.length?'none':'block';
      document.getElementById('feedWrap').scrollTop=999999;
      if(items.length)await pollAll();
      if(isAdmin()) loadPageStats();
    }
  }catch(e){} setLoading(false);
}

async function pollAll(){
  if(!me||!items.length)return; pollPending=true;
  try{
    const r=await fetch(BACKEND+'/feed_poll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel: currentChannelId, msgIds:items.map(e=>e.id),since:lastTs})});
    const d=await r.json();if(d.status!=='ok')return;
    const newRaw=d.new_items||[]; const ni=newRaw.filter(e=>!knownIds.has(e.id));
    if(ni.length){
      lastTs=Math.max(...newRaw.map(e=>e.ts||0),lastTs); ni.forEach(e=>knownIds.add(e.id));items.push(...ni);
      const inner=document.getElementById('feedInner'); document.getElementById('empty').style.display='none';
      ni.forEach(e=>{const div=document.createElement('div');div.innerHTML=buildMsg(e);inner.appendChild(div.firstChild);});
      if(atBottom)document.getElementById('feedWrap').scrollTop=999999; else{newCount+=ni.length;updateScrollBtn();}
      sendNotification(siteGlobalSettings.title + ' — הודעה חדשה',ni[ni.length-1].text?.substring(0,60)||'');
      if(document.getElementById('leaderboardModal').style.display === 'flex') loadLeaderboardData();
    }
    const rxns=d.reactions||{};Object.entries(rxns).forEach(([mid,rxn])=>renderRxn(mid,rxn));
    const counts=d.comment_counts||{};Object.entries(counts).forEach(([mid,n])=>{if(n!==(cmtCount[mid]||0)){cmtCount[mid]=n;updateCmtBtn(mid,n);}});
  }catch(e){}finally{pollPending=false;}
}

function scrollToBottom(){document.getElementById('feedWrap').scrollTo({top:999999,behavior:'smooth'});newCount=0;updateScrollBtn();}
function updateScrollBtn(){const btn=document.getElementById('scrollDownBtn'); if(!atBottom){btn.classList.add('show');if(newCount>0)btn.classList.add('has-new');else btn.classList.remove('has-new');}else{btn.classList.remove('show','has-new');newCount=0;}}
document.getElementById('feedWrap').addEventListener('scroll',function(){atBottom=(this.scrollHeight-this.scrollTop-this.clientHeight)<80;updateScrollBtn();},{passive:true});
function setLoading(v){document.getElementById('prog').classList.toggle('on',v);}

/* ── PERMISSIONS (RBAC & GLOBAL) ── */
async function pollWritePerm(){
  if(!isAdmin())return;
  try{
    const p1 = fetch(BACKEND+'/write_perm_get').then(r=>r.json());
    const p2 = fetch(BACKEND+'/api/rbac').then(r=>r.json());
    const [resPerm, resRbac] = await Promise.all([p1, p2]);
    if(resPerm.status==='ok') _writePerm = resPerm.perm;
    _rbacData = resRbac;
    applyWritePerm(_writePerm, _rbacData);
  }catch(e){}
}

function applyWritePerm(perm, rbac){
  _writePerm=perm; _rbacData=rbac;
  const globalEmails=perm?.emails||[];
  const myRbacChannels = rbac[me?.email] || [];
  
  const bar=document.getElementById('adminComposeBar');
  const notice=document.getElementById('blockNotice');
  const btn=document.getElementById('writePermBtn');
  
  if(!bar)return;
  if(isSuperAdmin()){
    bar.classList.remove('blocked'); notice.classList.remove('show');
    if(btn)btn.classList.toggle('has-granted',globalEmails.length>0);
    return;
  }
  
  const hasGlobal = globalEmails.includes(me?.email||'');
  const hasChannel = myRbacChannels.includes(currentChannelId);
  const canWriteHere = hasGlobal || hasChannel;
  
  bar.classList.toggle('blocked', !canWriteHere);
  notice.classList.toggle('show', !canWriteHere);
}

/* ── LEADERBOARD (NEW) ── */
let lbData = [];
function openLeaderboard() {
  document.getElementById('leaderboardModal').style.display = 'flex';
  loadLeaderboardData();
}
function closeLeaderboard() { document.getElementById('leaderboardModal').style.display = 'none'; }

async function loadLeaderboardData() {
  document.getElementById('lbContent').innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>טוען נתונים...</div>';
  try {
    const res = await fetch(BACKEND + '/api/leaderboard');
    const d = await res.json();
    lbData = d.leaderboard || [];
    switchLbView('podium'); 
  } catch(e) {
    document.getElementById('lbContent').innerHTML = '<div style="text-align:center; color:red;">שגיאה בטעינת הנתונים</div>';
  }
}

function switchLbView(viewType) {
  document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active'));
  const content = document.getElementById('lbContent');
  if(!lbData.length) { content.innerHTML = '<div style="text-align:center;color:#888;">אין עדיין מספיק נתונים לדירוג.</div>'; return; }

  if(viewType === 'podium') {
    document.getElementById('lbTabPodium').classList.add('active');
    const top3 = lbData.slice(0, 3);
    let html = '<div class="lb-podium">';
    if(top3[1]) html += `<div class="podium-item podium-2"><img class="podium-av" src="${_allowedMap[top3[1].email]?.picture || LOGO}"><div class="podium-bar">${top3[1].likes}</div><div class="podium-name">${top3[1].name}</div></div>`;
    if(top3[0]) html += `<div class="podium-item podium-1"><img class="podium-av" src="${_allowedMap[top3[0].email]?.picture || LOGO}"><div class="podium-bar">${top3[0].likes}</div><div class="podium-name">${top3[0].name}</div></div>`;
    if(top3[2]) html += `<div class="podium-item podium-3"><img class="podium-av" src="${_allowedMap[top3[2].email]?.picture || LOGO}"><div class="podium-bar">${top3[2].likes}</div><div class="podium-name">${top3[2].name}</div></div>`;
    html += '</div>';
    content.innerHTML = html;
  } 
  else if(viewType === 'bars') {
    document.getElementById('lbTabBars').classList.add('active');
    const maxLikes = Math.max(...lbData.map(u => u.likes));
    content.innerHTML = '<div class="lb-bars">' + lbData.map(u => {
      const width = maxLikes > 0 ? (u.likes / maxLikes) * 100 : 0;
      return `<div class="lb-bar-row"><div class="lb-bar-name">${u.name}</div><div class="lb-bar-track"><div class="lb-bar-fill" style="width:${width}%">${u.likes} לייקים</div></div></div>`;
    }).join('') + '</div>';
  }
  else if(viewType === 'list') {
    document.getElementById('lbTabList').classList.add('active');
    content.innerHTML = '<div class="lb-list">' + lbData.map((u, i) => {
      let rankClass = i===0 ? 'gold' : i===1 ? 'silver' : i===2 ? 'bronze' : '';
      return `<div class="lb-list-item"><div class="lb-rank ${rankClass}">${i+1}</div><div class="lb-info"><div style="font-weight:800;font-size:14px;color:#111;">${u.name}</div></div><div class="lb-stats"><div class="lb-stat-badge"><i class="fas fa-heart"></i> ${u.likes}</div><div class="lb-stat-badge" style="background:#f3f4f6;color:#4b5563;"><i class="fas fa-pen"></i> ${u.posts} פוסטים</div></div></div>`;
    }).join('') + '</div>';
  }
}

/* ── SETTINGS & EXPORT ── */
async function fetchSiteSettings() {
    try {
        const r = await fetch(BACKEND + '/api/settings');
        if(r.ok) {
            siteGlobalSettings = await r.json();
            if(siteGlobalSettings.commentsEnabled === undefined) siteGlobalSettings.commentsEnabled = true;
            initGlobalSettings();
            if(isAdmin()) renderBlockedUsers();
        }
    } catch(e) {}
}
window.addEventListener('load', fetchSiteSettings);

function openSiteSettings(){
    document.getElementById('siteSettingsModal').classList.add('open');
    document.getElementById('settingsSiteTitle').value = siteGlobalSettings.title || "בינה ודעה";
    document.getElementById('settingsCommentsEnable').checked = siteGlobalSettings.commentsEnabled;
}
function closeSiteSettings(){ document.getElementById('siteSettingsModal').classList.remove('open'); }

async function saveSiteTitle(){
    const val = document.getElementById('settingsSiteTitle').value.trim();
    if(!val) return;
    siteGlobalSettings.title = val; initGlobalSettings();
    if(isSuperAdmin()) { await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, title:val})}); alert('שם האתר עודכן בשרת!'); }
}

async function saveCommentsSettings() {
    const isEnabled = document.getElementById('settingsCommentsEnable').checked;
    siteGlobalSettings.commentsEnabled = isEnabled;
    if(isSuperAdmin()) {
        await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, commentsEnabled:isEnabled})});
        alert('הגדרות התגובות עודכנו בהצלחה.');
    }
}

async function blockUser(){
    const email = document.getElementById('settingsBlockEmail').value.trim().toLowerCase();
    if(!email) return;
    if(!siteGlobalSettings.blockedEmails) siteGlobalSettings.blockedEmails = [];
    if(!siteGlobalSettings.blockedEmails.includes(email)){
        siteGlobalSettings.blockedEmails.push(email);
        document.getElementById('settingsBlockEmail').value = '';
        renderBlockedUsers();
        if(isSuperAdmin()) { await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, blockedEmails:siteGlobalSettings.blockedEmails})}); alert('המשתמש נחסם!'); }
    }
}

function renderBlockedUsers(){
    const el = document.getElementById('blockedUsersList');
    if(!siteGlobalSettings.blockedEmails || !siteGlobalSettings.blockedEmails.length){ el.innerHTML = 'אין משתמשים חסומים.'; return; }
    el.innerHTML = siteGlobalSettings.blockedEmails.map(email => 
        `<div style="display:flex; justify-content:space-between; background:#fef2f2; padding:5px; margin-bottom:5px; border:1px solid #fecaca; border-radius:5px;">
            <span>${email}</span>
            <button onclick="unblockUser('${email}')" style="color:red; background:none; border:none; cursor:pointer;">הסר חסימה</button>
        </div>`
    ).join('');
}

async function unblockUser(email){
    siteGlobalSettings.blockedEmails = siteGlobalSettings.blockedEmails.filter(e => e !== email);
    renderBlockedUsers();
    if(isSuperAdmin()) {
        await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, blockedEmails:siteGlobalSettings.blockedEmails})});
    }
}

async function assignRbac(){
    const email = document.getElementById('rbacEmail').value.trim().toLowerCase();
    const channel = document.getElementById('rbacChannel').value;
    if(!email) return;
    if(isSuperAdmin()) {
        const r = await fetch(BACKEND+'/api/rbac', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, target_email:email, channel:channel, action:'add'})});
        if(r.ok) alert(`הרשאה לערוץ ${channel} הוענקה בהצלחה ל-${email}`);
    }
    document.getElementById('rbacEmail').value = '';
}

async function exportEmailsToGroups() {
    if(!isSuperAdmin()) return;
    try {
        const res = await fetch(BACKEND + '/api/export_emails?email=' + encodeURIComponent(me.email));
        const text = await res.text();
        const blob = new Blob([text], {type: "text/csv;charset=utf-8"});
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "community_emails.csv";
        link.click();
    } catch(e) { alert("שגיאה בייצוא המיילים"); }
}

function loadPageStats(){
    const view = document.getElementById('pageStatsView');
    if(!view) return;
    view.innerHTML = `<strong>סטטיסטיקות ערוץ "${currentChannelId}":</strong><br>סך הודעות שנטענו: ${items.length}<br>משתמשים פעילים כרגע: ${document.getElementById('chatPresenceCount')?.innerText || 0}<br>`;
}

/* ── ADMIN CHAT (RESTORED!) ── */
const CHAT_COLORS=['#3b82f6','#7c3aed','#059669','#d97706','#dc2626','#db2777'];
const chatCol=s=>CHAT_COLORS[(s||'').charCodeAt(0)%CHAT_COLORS.length];

function toggleChatMinimize(){
  const panel=document.getElementById('adminChatPanel'); panel.classList.toggle('minimized');
  const isMin=panel.classList.contains('minimized');
  document.getElementById('chatMinimizeBtn').innerHTML=isMin?'<i class="fas fa-expand-alt"></i>':'<i class="fas fa-minus"></i>';
}

async function pingChatPresence(){
  if(!me)return;
  try{
    const r=await fetch(BACKEND+'/presence_ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:me.name,picture:me.picture})});
    const d=await r.json(); document.getElementById('chatPresenceCount').textContent=(d.active||[]).length;
  }catch(e){}
}

function renderChatText(t){
  if(!t)return''; let s=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  s=s.replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>').replace(/\_([^_\n]+)\_/g,'<em>$1</em>').replace(/(https?:\/\/[^\s<>"']+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  return s;
}

async function loadAdminChat(){
  if(!isAdmin())return;
  try{
    const r=await fetch(BACKEND+'/chat_messages'); const d=await r.json(); if(d.status!=='success')return;
    const msgs=d.messages||[]; const sig=msgs.map(m=>m.id+(m.reactions?JSON.stringify(m.reactions):'')).join(',');
    if(sig===chatLastIds)return; const hadMsgs=chatLastIds!==''; chatLastIds=sig;
    renderAdminChat(msgs);
    if(hadMsgs&&msgs.length){ const newest=msgs[msgs.length-1]; if(newest.email!==me?.email) sendNotification("צ'אט מנהלים",getDisplayName(newest.email,newest.sender)+': '+(newest.text||'').substring(0,40)); }
  }catch(e){}
}

function renderAdminChat(msgs){
  const box=document.getElementById('chatMessages'); if(!box)return;
  const empty=document.getElementById('chatEmptyMsg'); const atBot=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  if(!msgs.length){ box.innerHTML=''; if(empty){empty.style.display='block';box.appendChild(empty);} return; }
  if(empty)empty.style.display='none';
  box.innerHTML=''; let lastDate='',lastEmail='',lastMin='';
  msgs.forEach((msg,idx)=>{
    const isMe=msg.email===me?.email; const displayName=getDisplayName(msg.email,msg.sender);
    const picture=msg.picture||_allowedMap[(msg.email||'').toLowerCase()]?.picture||'';
    const msgMin=(msg.clientTime||msg.time||'').substring(0,5); const sameGroup=lastEmail===msg.email&&msgMin===lastMin;
    const d=msg.date||msg.clientDate||'';
    if(d&&d!==lastDate){ const sep=document.createElement('div'); sep.className='chat-date-sep'; sep.innerHTML=`<span>${d}</span>`; box.appendChild(sep); lastDate=d; }
    const grp=document.createElement('div'); grp.className='chat-grp'+(isMe?' me':'')+(!sameGroup&&idx>0?' gap':'');
    const avEl=document.createElement('div'); avEl.className='chat-av'; avEl.style.background=chatCol(displayName); avEl.style.visibility=sameGroup?'hidden':'visible';
    if(picture){ const img=document.createElement('img'); img.src=picture; img.onerror=()=>{img.style.display='none';avEl.textContent=displayName[0].toUpperCase();}; avEl.appendChild(img); }else{avEl.textContent=displayName[0].toUpperCase();}
    const bubs=document.createElement('div'); bubs.className='chat-bubs'+(isMe?' me':' other');
    if(!isMe&&!sameGroup){ const nm=document.createElement('div'); nm.className='chat-sender'; nm.style.color=chatCol(displayName); nm.textContent=displayName; bubs.appendChild(nm); }
    const bub=document.createElement('div'); bub.className='chat-bub '+(isMe?'me':'other'); bub.dataset.id=msg.id; bub.innerHTML=renderChatText(msg.text||'');
    const t=msg.clientTime||msg.time||''; if(t){ const ts=document.createElement('span'); ts.className='chat-time'; ts.textContent=' '+t; bub.appendChild(ts); }
    bub.addEventListener('dblclick',ev=>{ev.preventDefault();showChatCtx(ev,msg,isMe);}); bubs.appendChild(bub);
    if(isMe){grp.appendChild(bubs);grp.appendChild(avEl);} else{grp.appendChild(avEl);grp.appendChild(bubs);}
    box.appendChild(grp); lastEmail=msg.email;lastMin=msgMin;
  });
  if(atBot)box.scrollTop=box.scrollHeight;
}

function showChatCtx(ev,msg,isMe){
  ev.stopPropagation(); const menu=document.getElementById('chatCtxMenu'); const canDel=isMe||isSuperAdmin();
  menu.innerHTML=`<div class="ctx-item" onclick="copyChatMsg('${escAttr(msg.id)}')"><i class="fas fa-copy"></i> העתק</div>`+(canDel?`<div class="ctx-item danger" onclick="deleteChatMsg('${escAttr(msg.id)}')"><i class="fas fa-trash"></i> מחק</div>`:'');
  menu.classList.add('show'); menu.style.left=ev.clientX+'px'; menu.style.top=ev.clientY+'px';
}
function hideChatCtx(){document.getElementById('chatCtxMenu').classList.remove('show');}
document.addEventListener('click',e=>{if(!e.target.closest('#chatCtxMenu'))hideChatCtx();});

function copyChatMsg(id){ const bub=document.querySelector(`.chat-bub[data-id="${id}"]`); if(bub) navigator.clipboard.writeText(bub.innerText.replace(/\s+\d{2}:\d{2}$/,'').trim()); hideChatCtx(); }
async function deleteChatMsg(id){ hideChatCtx(); if(!confirm('למחוק הודעה זו?'))return; try{ await fetch(BACKEND+'/chat_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,id})}); chatLastIds='';loadAdminChat(); }catch(e){} }

function onChatType(){
  if(!me)return; fetch(BACKEND+'/typing_ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:getDisplayName(me.email,me.name),email:me.email})}).catch(()=>{});
  clearTimeout(_chatTypingTimer); _chatTypingTimer=setTimeout(()=>{ fetch(BACKEND+'/typing_stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email})}).catch(()=>{}); },3000);
}

async function pollChatTyping(){
  if(!isAdmin())return;
  try{
    const r=await fetch(BACKEND+'/typing_status'); const d=await r.json(); const others=(d.typers||[]).filter(n=>n!==me?.name);
    const bar=document.getElementById('chatTypingBar');
    if(others.length){bar.style.display='block';bar.textContent=others.map(n=>getDisplayName('',n)).join(', ')+' מקלידים...';} else{bar.style.display='none';}
  }catch(e){}
}

/* ── MANAGE ADMINS (RESTORED!) ── */
async function openManageAdmins(){
  if(!isSuperAdmin())return;
  document.getElementById('manageAdminsModal').style.display='flex';
  await refreshAdminsList();
}
function closeManageAdmins(){document.getElementById('manageAdminsModal').style.display='none';}

async function refreshAdminsList(){
  try{
    const r=await fetch(BACKEND+'/allowed_list'); const d=await r.json(); const list=document.getElementById('adminsList'); const entries=d.emails||[];
    if(!entries.length){list.innerHTML='<div style="text-align:center;color:#aaa;font-size:13px;padding:20px;">אין מנהלים נוספים</div>';return;}
    list.innerHTML=entries.map(e=>{
      const email=typeof e==='string'?e:e.email; const name=typeof e==='object'?(e.name||email):email; const pic=typeof e==='object'?(e.picture||''):'';
      const av=pic?`<img src="${escAttr(pic)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #e5e7eb;">`:`<div style="width:32px;height:32px;border-radius:50%;background:#1a56db;color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;">${esc((name||'?')[0].toUpperCase())}</div>`;
      return `<div style="display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:9px 12px;">${av}<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;color:#111;">${esc(name)}</div><div style="font-size:11px;color:#9ca3af;">${esc(email)}</div></div><button onclick="removeAdmin('${escAttr(email)}')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:4px 10px;font-size:11px;color:#dc2626;cursor:pointer;font-weight:700;">הסר</button></div>`;
    }).join('');
  }catch(e){}
}

async function addAdmin(){
  const email=document.getElementById('newAdminEmail').value.trim().toLowerCase(); const name=document.getElementById('newAdminName').value.trim();
  if(!email||!email.includes('@')){showAdminMsgResult('אימייל לא תקין','red');return;}
  try{
    const r=await fetch(BACKEND+'/allowed_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin_email:me.email,email,name,picture:''})});
    const d=await r.json();
    if(d.status==='success'){ document.getElementById('newAdminEmail').value=''; document.getElementById('newAdminName').value=''; showAdminMsgResult('נוסף ✓','green'); await refreshAdminsList(); await loadAllowedMap(); }else{showAdminMsgResult(d.msg||'שגיאה','red');}
  }catch(e){showAdminMsgResult('שגיאת שרת','red');}
}

async function removeAdmin(email){
  if(!confirm('להסיר את '+email+'?'))return;
  try{ await fetch(BACKEND+'/allowed_remove',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin_email:me.email,email})}); await refreshAdminsList(); await loadAllowedMap(); showAdminMsgResult('הוסר ✓','green'); }catch(e){}
}
function showAdminMsgResult(txt,color){ const el=document.getElementById('adminMsgResult'); el.textContent=txt;el.style.color=color==='green'?'#16a34a':'#dc2626'; el.style.display='block';setTimeout(()=>el.style.display='none',2500); }

/* ── ADMIN MESSAGES (BROADCAST) (RESTORED!) ── */
function openAdminMsgs(){
  if(!isAdmin())return; document.getElementById('adminMsgsModal').classList.add('open');
  if(adminMsgsLastId){ localStorage.setItem('admin_msgs_seen', adminMsgsLastId); adminMsgsUnread=0; updateAdminMsgsBadge(); }
  loadAdminMsgs();
}
function closeAdminMsgs(){document.getElementById('adminMsgsModal').classList.remove('open');}

async function loadAdminMsgs(){
  try{ const r=await fetch(BACKEND+'/admin_list'); const d=await r.json(); const msgs=d.messages||[]; renderAdminMsgs(msgs); checkAdminMsgsNew(msgs); }catch(e){}
}

function renderAdminMsgs(msgs){
  const c=document.getElementById('adminMsgsBody');if(!c)return;
  if(!msgs.length){c.innerHTML='<div style="text-align:center;padding:30px;color:#aaa;font-size:13px;">אין הודעות</div>';return;}
  const lastSeen=localStorage.getItem('admin_msgs_seen')||'';
  c.innerHTML=msgs.map(m=>{
    const unread=String(m.id)>String(lastSeen)&&m.email!==me?.email;
    const av=m.picture?`<img src="${escAttr(m.picture)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:`<span>${(m.sender||'?')[0].toUpperCase()}</span>`;
    return `<div class="admin-msg-item${unread?' unread':''}"><div class="admin-msg-sender-row"><div class="admin-msg-av" style="background:${chatCol(m.sender)}">${av}</div><span class="admin-msg-name">${esc(m.sender)}</span><span class="admin-msg-time">${esc(m.time||'')}</span>${unread?'<span style="background:#eff6ff;color:#1a56db;font-size:9px;font-weight:800;padding:1px 7px;border-radius:99px;border:1px solid #bfdbfe;">חדש</span>':''}${isSuperAdmin()?`<button onclick="deleteAdminMsg('${escAttr(String(m.id))}')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:7px;padding:2px 8px;font-size:10px;color:#dc2626;cursor:pointer;margin-right:auto"><i class="fas fa-trash"></i></button>`:''}</div><div class="admin-msg-text">${esc(m.text)}</div></div>`;
  }).join('');
}

function checkAdminMsgsNew(msgs){
  const lastSeen=localStorage.getItem('admin_msgs_seen')||'';
  if(!msgs.length){ adminMsgsLastId=''; adminMsgsUnread=0; updateAdminMsgsBadge(); return; }
  const topId=String(msgs[0].id);
  if(adminMsgsLastId!==null && adminMsgsLastId!=='' && topId!==adminMsgsLastId){ const newest=msgs[0]; if(String(newest.email)!==String(me?.email)) sendNotification('📢 הודעת מנהל חדשה', newest.sender+': '+(newest.text||'').substring(0,50)); }
  adminMsgsUnread=msgs.filter(m=>String(m.id)>String(lastSeen) && String(m.email)!==String(me?.email)).length; updateAdminMsgsBadge(); adminMsgsLastId=topId;
}
function updateAdminMsgsBadge(){ const badge=document.getElementById('adminMsgsBadge'); if(badge) badge.classList.toggle('show', adminMsgsUnread>0); }

async function sendAdminMsg(){
  const inp=document.getElementById('adminMsgInput'); const text=inp.value.trim();if(!text||!me||!isSuperAdmin())return;
  try{ await fetch(BACKEND+'/admin_send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,sender:me.name,picture:me.picture,email:me.email})}); inp.value='';inp.style.height='auto'; loadAdminMsgs(); }catch(e){alert('שגיאה בשליחה');}
}
async function deleteAdminMsg(id){ if(!confirm('למחוק?'))return; try{ await fetch(BACKEND+'/admin_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,email:me.email})}); loadAdminMsgs(); }catch(e){} }

/* ── UI HELPERS ── */
function closeLightbox(){document.getElementById('lightbox').classList.remove('show');document.getElementById('lbImg').src='';}
function openLightbox(src){document.getElementById('lbImg').src=src;document.getElementById('lightbox').classList.add('show');}
function clearCompose(){document.getElementById('composeEditor').innerHTML='';composeImgUrl='';composeVidUrl='';composeHtmlCode='';composeBtns=[]; updateAttachPreview();}

/* ── PREVIEW & EDITOR ── */
function showPreview(){
  const ed=document.getElementById('composeEditor'); const text=editorToMarkdown(ed).trim();
  if(!text && !composeImgUrl && !composeHtmlCode && !composeVidUrl){ alert('אין מה להציג.'); return; }
  const mockEntry = { id: 'preview', channel: currentChannelId, profile: composeProfile, text: text, imgUrl: composeImgUrl, videoUrl: composeVidUrl, htmlCode: composeHtmlCode, sender: me ? me.name : 'תצוגה מקדימה', senderEmail: me ? me.email : '', time: 'עכשיו', date: 'היום', ts: Date.now(), buttons: composeBtns };
  document.getElementById('previewModalBody').innerHTML = buildMsg(mockEntry); document.getElementById('previewModal').style.display = 'flex';
}
function closePreview(){ document.getElementById('previewModal').style.display = 'none'; document.getElementById('previewModalBody').innerHTML = ''; }

function editorToMarkdown(el){
  function nodeToText(node){
    if(node.nodeType===Node.TEXT_NODE)return node.textContent; if(node.nodeType!==Node.ELEMENT_NODE)return''; if(node.getAttribute&&node.getAttribute('data-quote-preview'))return'';
    const tag=node.tagName.toLowerCase(); const inner=Array.from(node.childNodes).map(nodeToText).join('');
    if(tag==='b'||tag==='strong')return'**'+inner+'**'; if(tag==='i'||tag==='em')return'_'+inner+'_'; if(tag==='u')return inner; if(tag==='br')return'\n';
    if(tag==='font'){ const color=node.getAttribute('color'); if(color)return` color:${color} ${inner} /color `; return inner; }
    if(tag==='span'){ const style=node.getAttribute('style')||''; const colorMatch=style.match(/color:\s*([^;]+)/); if(colorMatch)return` color:${colorMatch[1].trim()} ${inner} /color `; return inner; }
    if(tag==='s')return`~~${inner}~~`; if(tag==='hr')return '\n---DIVIDER---\n';
    if(tag==='a'){ const href=node.getAttribute('href')||''; if(href&&href.startsWith('http'))return`[${inner}](${href})`; return inner; }
    if(tag==='div'||tag==='p') return (node.previousElementSibling&&!node.previousElementSibling.getAttribute('data-quote-preview')?'\n':'')+inner;
    return inner;
  }
  return nodeToText(el);
}

function onComposeChange(){ const ed=document.getElementById('composeEditor'); document.getElementById('composeCharCount').textContent=editorToMarkdown(ed).length; }
function composeFormat(cmd){ const ed=document.getElementById('composeEditor'); ed.focus(); requestAnimationFrame(()=>{ document.execCommand(cmd,false,null); onComposeChange(); }); }
function insertHeading(){ const ed=document.getElementById('composeEditor'); ed.focus(); document.execCommand('insertText',false,' •'); onComposeChange(); }
function applyTextColor(color){ const ed=document.getElementById('composeEditor'); ed.focus(); document.execCommand('foreColor',false,color); closeAllCtbDropdowns(); onComposeChange(); }
function removeTextColor(){ const ed=document.getElementById('composeEditor'); ed.focus(); document.execCommand('foreColor',false,'#374151'); closeAllCtbDropdowns(); onComposeChange(); }

function toggleCtbDropdown(id){ const el=document.getElementById(id); const wasOpen=el.classList.contains('open'); closeAllCtbDropdowns(); if(!wasOpen)el.classList.add('open'); }
function closeAllCtbDropdowns(){ document.querySelectorAll('.ctb-dropdown').forEach(el=>el.classList.remove('open')); }

function updateComposeImg(){ composeImgUrl=document.getElementById('composeImgUrl').value.trim(); const thumb=document.getElementById('composeImgThumb'); if(composeImgUrl){document.getElementById('composeImgThumbImg').src=composeImgUrl;thumb.style.display='block';}else{thumb.style.display='none';} updateAttachPreview(); }
function clearComposeImg(){ composeImgUrl='';document.getElementById('composeImgUrl').value='';document.getElementById('composeImgThumb').style.display='none'; updateAttachPreview(); }
function updateComposeVid(){ composeVidUrl=document.getElementById('composeVidUrl').value.trim(); updateAttachPreview(); }
function clearComposeVid(){ composeVidUrl='';document.getElementById('composeVidUrl').value=''; updateAttachPreview(); }
function applyHtmlCode(){ composeHtmlCode=document.getElementById('composeHtmlCode').value.trim(); document.getElementById('htmlPreviewBadge').style.display='flex'; updateAttachPreview(); closeAllCtbDropdowns(); }
function clearHtmlCode(){ composeHtmlCode='';document.getElementById('composeHtmlCode').value='';document.getElementById('htmlPreviewBadge').style.display='none'; updateAttachPreview(); }
function addComposeButton(){ const text=document.getElementById('composeBtnText').value.trim(); const url=document.getElementById('composeBtnUrl').value.trim(); if(text&&url){composeBtns.push({id:Date.now(),text,url}); document.getElementById('composeBtnText').value='';document.getElementById('composeBtnUrl').value=''; renderComposeBtns();updateAttachPreview();} }
function removeComposeButton(id){ composeBtns=composeBtns.filter(b=>b.id!==id); renderComposeBtns();updateAttachPreview(); }
function renderComposeBtns(){ document.getElementById('composeBtnList').innerHTML=composeBtns.map(b=>`<div style="display:inline-flex;align-items:center;gap:4px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;color:#ea580c;"><i class="fas fa-mouse-pointer" style="font-size:9px"></i>${esc(b.text)} <button onclick="removeComposeButton(${b.id})" style="background:none;border:none;cursor:pointer;color:#9ca3af;">✕</button></div>`).join(''); }

function updateAttachPreview(){
  const prev=document.getElementById('attachPreview'); const chips=[];
  if(composeImgUrl)chips.push(`<div class="attach-chip"><i class="fas fa-image" style="color:#1a56db;"></i> תמונה <button onclick="clearComposeImg()">✕</button></div>`);
  if(composeVidUrl)chips.push(`<div class="attach-chip"><i class="fas fa-video" style="color:#7c3aed;"></i> סרטון <button onclick="clearComposeVid()">✕</button></div>`);
  if(composeHtmlCode)chips.push(`<div class="attach-chip"><i class="fas fa-code" style="color:#059669;"></i> HTML <button onclick="clearHtmlCode()">✕</button></div>`);
  composeBtns.forEach(b=>chips.push(`<div class="attach-chip"><i class="fas fa-mouse-pointer" style="color:#ea580c;"></i> ${esc(b.text)} <button onclick="removeComposeButton(${b.id})">✕</button></div>`));
  prev.innerHTML=chips.join(''); prev.classList.toggle('show',chips.length>0);
}

async function sendFeedPost(){
  if(!me||!isAdmin())return;
  if(!isSuperAdmin()){ const canWrite = _writePerm?.emails?.includes(me.email) || _rbacData[me.email]?.includes(currentChannelId); if(!canWrite){alert('אין לך הרשאת כתיבה בערוץ זה');return;} }
  const ed=document.getElementById('composeEditor'); const editorText=editorToMarkdown(ed).trim(); const text=(ed._quoteData?`\u200Bquote:${ed._quoteData.id}\n${ed._quoteData.text.split('\n').map(l=>'> '+l).join('\n')}\n\u200B\n\n`:'')+editorText;
  if(!text&&!composeImgUrl&&!composeHtmlCode){alert('הודעה ריקה');return;}
  const btn=document.getElementById('composeSendBtn'); btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;
  try{
    const r=await fetch(BACKEND+'/feed_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel: currentChannelId, profile:composeProfile, text, imgUrl:composeImgUrl, videoUrl:composeVidUrl, htmlCode:composeHtmlCode, sender:me.name, senderEmail:me.email, buttons:composeBtns})});
    const d=await r.json(); if(d.status==='ok'){ clearCompose(); document.getElementById('feedWrap').scrollTop=999999; await loadFeed(); } else { alert('שגיאה בשליחה'); }
  }catch(e){alert('שגיאת שרת');}
  btn.innerHTML='<i class="fas fa-paper-plane"></i>'; btn.disabled=false;
}

function toggleComposeProfile(){
  composeProfile = composeProfile === 'news' ? 'red' : 'news';
  const t=document.getElementById('profileToggle'); const lbl=document.getElementById('profileLabel'); const icon=document.getElementById('profileIcon'); const btn=document.getElementById('composeSendBtn');
  if(composeProfile==='red'){ t.classList.add('red'); lbl.textContent='צבע אדום'; icon.className='fas fa-exclamation-triangle'; btn.classList.add('red'); }
  else { t.classList.remove('red'); lbl.textContent='מבזק חדשות'; icon.className='fas fa-newspaper'; btn.classList.remove('red'); }
}

function checkChatMention(ta){
  const val=ta.value; const pos=ta.selectionStart; const before=val.substring(0,pos); const atIdx=before.lastIndexOf('@');
  if(atIdx===-1||(atIdx>0&&/\S/.test(before[atIdx-1]))){hideMentionDrop();return;}
  const query=before.substring(atIdx+1).toLowerCase(); if(query.includes(' ')){hideMentionDrop();return;}
  const candidates=Object.entries(_allowedMap).filter(([email,info])=>{const name=(info.name||'').toLowerCase();return name.includes(query)||email.includes(query);}).map(([email,info])=>({email,name:info.name||email.split('@')[0],picture:info.picture||''})).slice(0,6);
  if(!candidates.length){hideMentionDrop();return;}
  const box=document.getElementById('mentionDropdown'); box.innerHTML=candidates.map((u,i)=>`<div class="mention-item${i===0?' active':''}" onclick="insertChatMention('${u.name.replace(/'/,"\'")}', ${atIdx}, '${query}')"><div class="mention-av" style="background:${chatCol(u.name)}">${u.picture?`<img src="${u.picture}">`:u.name[0].toUpperCase()}</div><span>${u.name}</span></div>`).join(''); box.classList.add('show');
}
function hideMentionDrop(){ const box=document.getElementById('mentionDropdown'); if(box){box.classList.remove('show');box.innerHTML='';} }
function insertChatMention(name, startIdx, query){
  const ta=document.getElementById('chatInput'); const val=ta.value;
  const before=val.substring(0,startIdx); const after=val.substring(startIdx+1+query.length);
  ta.value=before+'@'+name+' '+after; ta.selectionStart=ta.selectionEnd=before.length+name.length+2;
  hideMentionDrop(); ta.focus();
}
function handleChatInputKey(e){ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMsg();} }

// הפעלת כפתור גוגל בצורה חכמה (נדנוד עד שגוגל נטען)
function tryInitGoogle() {
  if (window.google && window.google.accounts) { initGoogle(); } else { setTimeout(tryInitGoogle, 100); }
}
tryInitGoogle();

setInterval(pollAll,3000);
