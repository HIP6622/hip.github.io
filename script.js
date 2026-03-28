const BACKEND = 'https://hiphopruzbcrd.pythonanywhere.com';
const GOOGLE_CLIENT_ID = '548333676754-ohvlnp1nfjpc1jnbkdfmr9hpccaj508i.apps.googleusercontent.com';
const LOGO = 'https://i.ibb.co/pBvLbsG3/ed89a1453931.png';
const ADMIN_EMAIL = 'hip@hamakom.ovh';
const SUPER_ADMINS = ['hip@hamakom.ovh', '0548537646a@gmail.com'];
const STORAGE_KEY = 'bina_user';
const IMGBB_KEY = '74b5db34f7d743e270990275f1afd0ee';

const MAX_COMMENT_LEN = 500;
const MAX_EMOJI_LEN = 8;

let me = null, items = [], lastTs = 0, newCount = 0, atBottom = true;
let activePicker = null, activeCmtMsgId = null;
let rxnCache = {}, cmtCount = {};
const knownIds = new Set();
let pollPending = false;
let oldestTs = 0;
let allLoaded = false;
let loadingMore = false;
let _isAllowedAdmin = false;

let composeProfile = 'news';
let composeImgUrl = '';
let composeVidUrl = '';
let composeBtns = [];
let composeHtmlCode = '';

let chatLastIds = '';
let chatTypingTimer = null;

let adminMsgsLastId = null;
let adminMsgsUnread = 0;

// GLOBAL SETTINGS (Mocked for now until backend supports it)
let siteGlobalSettings = { title: "בינה ודעה", blockedEmails: [], description: "קהילת יוצרי ה-AI של ישראל" };
try{ const locS = localStorage.getItem('siteGlobalSettings'); if(locS) siteGlobalSettings = JSON.parse(locS); } catch(e){}

function initGlobalSettings() {
    document.getElementById('pageTitle').innerText = siteGlobalSettings.title;
    document.getElementById('hdrChannelName').innerHTML = `${esc(siteGlobalSettings.title)} - <span style="color:#1a56db">${CHANNELS.find(c=>c.id===currentChannelId)?.name||'כללי'}</span>`;
    const logT = document.getElementById('loginSiteTitle');
    if(logT) logT.innerText = siteGlobalSettings.title;
}

// --- ערוצים (מעודכן לפי הבקשה) ---
let currentChannelId = 'general';
const CHANNELS = [
  { id: 'general', name: 'הערוץ הרשמי', icon: 'fa-star' },
  { id: 'creators', name: 'לפי יוצרים', icon: 'fa-palette' },
  { id: 'news', name: 'חדשות ועדכוני AI', icon: 'fa-newspaper' },
  { id: 'system', name: 'עדכוני מערכת', icon: 'fa-bullhorn' },
  { id: 'misc', name: 'שונות (בדיחות ותכני AI)', icon: 'fa-smile-beam' }
];

function renderChannels() {
  const list = document.getElementById('channelsList');
  if(!list) return;
  list.innerHTML = CHANNELS.map(ch => `
    <div class="channel-item ${ch.id === currentChannelId ? 'active' : ''}" onclick="switchChannel('${ch.id}', '${ch.name}')">
      <i class="fas ${ch.icon}"></i> ${ch.name}
    </div>
  `).join('');
  const hdrName = document.getElementById('hdrChannelName');
  if (hdrName) {
    hdrName.innerHTML = `${esc(siteGlobalSettings.title)} - <span style="color:#1a56db">${CHANNELS.find(c=>c.id===currentChannelId).name}</span>`;
  }
}

async function switchChannel(channelId, channelName) {
  if (currentChannelId === channelId) return;
  currentChannelId = channelId;
  renderChannels();
  if(window.innerWidth <= 900) { document.getElementById('leftSidebar').classList.remove('open'); }
  items = []; lastTs = 0; knownIds.clear(); oldestTs = 0; allLoaded = false;
  document.getElementById('feedInner').innerHTML = '';
  document.getElementById('empty').style.display = 'block';
  await loadFeed();
}

function toggleLeftSidebar() { document.getElementById('leftSidebar').classList.toggle('open'); }

const REACT_SVG = `<svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.65"/><circle cx="8.5" cy="9.5" r="1.1" fill="currentColor"/><circle cx="13.5" cy="9.5" r="1.1" fill="currentColor"/><path d="M8 13.2c.65 1.5 2 2.2 3 2.2s2.35-.72 3-2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function esc(t){return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escAttr(t){return esc(t).replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function rich(t){
  if(!t)return'';
  let s=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s=s.replace(/\u200Bquote:([a-f0-9\-]+)\n((?:&gt; [^\n]*\n?)*)\u200B\n*/g,(m,qid,body)=>{
    const lines=body.replace(/^&gt; /gm,'').trim().split('\n');
    const firstLine=lines[0]||'';
    const rest=lines.slice(1).join(' ').trim();
    const preview=`<strong>${firstLine}</strong>`+(rest?' — <span style="font-weight:400">'+rest.substring(0,80)+(rest.length>80?'…':'')+'</span>':'');
    return `<div class="quote-block" onclick="jumpToQuotedMsg('${qid}')" title="לחץ לקפוץ להודעה המצוטטת"><i class="fas fa-quote-right" style="font-size:9px;color:#9ca3af;"></i><span class="quote-block-text">${preview}</span></div>`;
  });
  s=s.replace(/\u200B/g,'');
  s=s.replace(/\n/g,'<br>');
  s=s.replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>');
  s=s.replace(/__([^_\n]+)__/g,'<u>$1</u>');
  s=s.replace(/_([^_\n]+)_/g,'<em>$1</em>');
  s=s.replace(/~~([^~\n]+)~~/g,'<s>$1</s>');
  s=s.replace(/---DIVIDER---/g,'<hr class="bubble-divider">');
  s=s.replace(/<br>\s*(<hr[^>]*>)\s*<br>/g,'$1');
  s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  s=s.replace(/(?<!href=")(https?:\/\/[^\s<>"']{1,500})/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  s=s.replace(/\x02color:([^\x03]+)\x03([\s\S]*?)\x02\/color\x03/g,'<span style=\"color:$1\">$2</span>');
  return s;
}

function timeLabel(e){
  const today=new Date().toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric'});
  return (e.date&&e.date!==today)?e.date+' '+e.time:(e.time||'');
}

function fixServerTime(t){
  if(!t||!t.includes(':'))return t;
  const[h,m]=t.split(':').map(Number);
  return ((h+2)%24).toString().padStart(2,'0')+':'+m.toString().padStart(2,'0');
}

function isSuperAdmin(){return SUPER_ADMINS.includes(me?.email?.toLowerCase());}
function isAdmin(){return _isAllowedAdmin;}

async function checkAllowedAdmin(){
  if(!me)return;
  try{
    const r=await fetch(BACKEND+'/allowed_list');
    const d=await r.json();
    const emails=(d.emails||[]).map(e=>typeof e==='string'?e:e.email).map(e=>e.toLowerCase());
    _isAllowedAdmin=emails.includes(me.email.toLowerCase())||isSuperAdmin();
  }catch(e){_isAllowedAdmin=isSuperAdmin();}

  if(_isAllowedAdmin){
    await loadAllowedMap();
    document.getElementById('adminComposeBar').classList.add('show');
    document.getElementById('adminMsgsBtn').style.display='flex';
    document.getElementById('adminChatPanel').classList.add('show');
    document.getElementById('rightSidebar').classList.add('show');
    loadAdminChat();
    setInterval(loadAdminChat, 2500);
    setInterval(pollChatTyping, 2500);
    loadAdminMsgs();
    setInterval(loadAdminMsgs, 5000);
    pingChatPresence();
    setInterval(pingChatPresence, 15000);
    await pollWritePerm();
    setInterval(pollWritePerm, 3000);
    pollUpdateMode();
    setInterval(pollUpdateMode, 5000);
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
    loadAdminUsers();
    setInterval(loadAdminUsers, 30000);
  }
}

/* ── AUTH ── */
function saveUser(u){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(u));}catch(e){}}
function loadSavedUser(){try{const r=localStorage.getItem(STORAGE_KEY);if(r)return JSON.parse(r);}catch(e){}return null;}
function clearSavedUser(){try{localStorage.removeItem(STORAGE_KEY);}catch(e){}}

function toggleUserMenu(e){
  e.stopPropagation();
  const menu=document.getElementById('userMenu');
  if(!menu)return;
  const isOpen=menu.style.display!=='none';
  menu.style.display=isOpen?'none':'block';
  if(!isOpen){setTimeout(()=>document.addEventListener('click',()=>{menu.style.display='none';},{once:true}),0);}
}

function doLogout(){
  clearSavedUser();me=null;
  document.getElementById('app').style.display='none';
  document.getElementById('leftSidebar').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  try{google.accounts.id.disableAutoSelect();}catch(e){}
}

async function verifyAndLogin(user){
  if(siteGlobalSettings.blockedEmails.includes(user.email.toLowerCase())){
      alert('גישתך לאתר חסומה על ידי ההנהלה.');
      doLogout();
      return false;
  }
  if(user.name&&(user.name.includes('×—')||user.name.includes('Ã'))){
    user.name=user.email.split('@')[0];
  }
  me=user;saveUser(user);applyLogin();return true;
}

function applyLogin(){
  initGlobalSettings();
  const av=document.getElementById('userAvatar');
  const avatarHtml=me.picture
    ?`<img src="${escAttr(me.picture)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;border:2px solid #eee">`
    :`<div style="width:30px;height:30px;border-radius:50%;background:#1a56db;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">${esc(me.name[0].toUpperCase())}</div>`;
  av.innerHTML=`<div style="cursor:pointer" onclick="toggleUserMenu(event)">${avatarHtml}</div>
  <div id="userMenu" style="display:none;position:absolute;top:48px;left:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.14);z-index:200;min-width:160px;overflow:hidden;font-family:'Heebo',sans-serif;">
    <div style="padding:10px 14px;font-size:12px;font-weight:700;color:#374151;border-bottom:1px solid #f3f4f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(me.name)}</div>
    <button onclick="doLogout()" style="width:100%;padding:10px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#dc2626;font-family:'Heebo',sans-serif;display:flex;align-items:center;gap:8px;"><i class="fas fa-sign-out-alt"></i> התנתק</button>
  </div>`;
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('leftSidebar').style.display='flex';

  renderChannels();

  fetch(BACKEND+'/feed_login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:me.name,picture:me.picture})})
    .then(r=>r.json()).then(d=>{if(isSuperAdmin()&&d.count!=null)document.getElementById('adminUserCount').textContent=d.count;}).catch(()=>{});

  checkAllowedAdmin();
  if(isSuperAdmin())loadAllowedMap();
  loadFeed();
  setTimeout(loadAd,3000);
  setInterval(loadAd, 60*60*1000);
  initDark();
  initNotifications();
}

async function loadAdminUsers(){
  try{
    const r=await fetch(BACKEND+'/feed_logins?email='+encodeURIComponent(me.email));
    const d=await r.json();
    document.getElementById('adminUserCount').textContent=(d.logins||[]).length;
  }catch(e){}
}

function initGoogle(){
  if(!window.google) return;
  google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:handleLogin,auto_select:true});
  const saved=loadSavedUser();
  if(saved){verifyAndLogin(saved);return;}
  initGlobalSettings();
  google.accounts.id.renderButton(document.getElementById('googleBtn'),{theme:'outline',size:'large',locale:'he',width:240});
  google.accounts.id.prompt();
}

async function handleLogin(resp){
  let payload={};
  try{const parts=resp.credential.split('.');if(parts.length!==3)throw new Error('invalid');payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));}catch(e){return;}
  const email=(payload.email||'').toLowerCase();
  if(!email||!email.includes('@'))return;
  const picture=payload.picture||'';
  let displayName='';
  try{
    const lr=await fetch(BACKEND+'/allowed_list');
    const ld=await lr.json();
    const entries=ld.emails||[];
    const myEntry=entries.find(e=>typeof e==='object'&&e.email===email);
    if(myEntry&&myEntry.name&&!myEntry.name.includes('×—')&&myEntry.name!==email){
      displayName=myEntry.name;
    }
  }catch(e){}
  if(!displayName||displayName.includes('×—'))displayName=email.split('@')[0];
  const user={email,name:displayName,picture};
  await verifyAndLogin(user);
}

/* ── COPY LINK ── */
function copyMsgLink(id, btn){
  const el=document.querySelector(`.msg-row[data-id="${id}"]`);
  if(el)el.id='msg-link-'+id;
  const url=location.href.split('#')[0]+'#msg-link-'+id;
  const copy=text=>{
    navigator.clipboard.writeText(text).catch(()=>{
      const ta=document.createElement('textarea');ta.value=text;ta.style.cssText='position:fixed;opacity:0';
      document.body.appendChild(ta);ta.select();document.execCommand('copy');document.body.removeChild(ta);
    });
  };
  copy(url);
  btn.classList.add('copied');
  btn.innerHTML='<i class="fas fa-check" style="font-size:9px"></i>';
  setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML='<i class="fas fa-link" style="font-size:9px"></i>';},1500);
}

function highlightMsgFromHash(){
  const hash=location.hash;
  if(!hash||!hash.startsWith('#msg-link-'))return;
  const id=hash.replace('#msg-link-','');
  const el=document.querySelector(`.msg-row[data-id="${id}"]`)||document.getElementById(hash.slice(1));
  if(!el)return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.style.transition='background .2s';
  el.style.background='rgba(26,86,219,.08)';
  el.style.borderRadius='14px';
  setTimeout(()=>{el.style.background='';el.style.borderRadius='';},2800);
}

/* ── BUILD MSG ── */
function buildMsg(e){
  const red=e.profile==='red';
  const id=e.id;
  const lines=(e.text||'').trim().split('\n');
  const h=lines[0]||'';
  const body=lines.slice(1).join('\n').trim();
  let content='';
  if(red){content=`<div class="bubble-headline">🚨 ${esc(h)}</div>`;if(body)content+=`<div class="bubble-text" style="margin-top:4px">${rich(body)}</div>`;}
  else{content=`<div class="bubble-text">${rich(h+(body?'\n'+body:''))}</div>`;}

  let media='';
  if(e.imgUrl){const su=escAttr(e.imgUrl);media+=`<div class="bubble-img"><img src="${su}" loading="lazy" style="cursor:pointer;border-radius:12px;display:block;" onclick="openLightbox('${su}')" onerror="this.closest('.bubble-img').remove()"></div>`;}

  if(e.videoUrl){
    const vu=e.videoUrl;
    const ytMatch=vu.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const driveMatch=vu.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    const isHlsUrl=vu.includes('.m3u8')||vu.includes('master.m3u8');
    const isDirectVideo=/\.(mp4|webm|ogg|m3u8)([?#,]|$)/i.test(vu)||isHlsUrl;
    if(ytMatch){
      media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;">
        <iframe width="100%" height="200" src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowfullscreen style="display:block;"></iframe>
      </div>`;
    } else if(driveMatch){
      media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;">
        <iframe src="https://drive.google.com/file/d/${driveMatch[1]}/preview" width="100%" height="300" frameborder="0" allow="autoplay" allowfullscreen style="display:block;min-height:300px;"></iframe>
      </div>`;
    } else if(isDirectVideo){
      const vidId='vid-'+escAttr(id);
      const isHls=isHlsUrl;
      media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;width:100%;">
        <video id="${vidId}" controls playsinline preload="metadata"
          style="max-height:480px;display:block;border-radius:12px;object-fit:contain;" onloadedmetadata="if(this.videoHeight>this.videoWidth)this.classList.add('portrait')"
          ${!isHls?`src="${escAttr(vu)}"`:''}
          onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        </video>
        <a class="vid-btn" href="${escAttr(vu)}" target="_blank" rel="noopener noreferrer" style="display:none;margin-top:6px;">
          <i class="fas fa-play" style="font-size:10px"></i> פתח סרטון
        </a>
        ${isHls?`<script>
(function(){
  var v=document.getElementById('${vidId}');
  if(!v)return;
  if(v.canPlayType('application/vnd.apple.mpegurl')){
    v.src='${vu.replace(/'/g,"\\'")}';
  } else if(window.Hls&&Hls.isSupported()){
    var h=new Hls();h.loadSource('${vu.replace(/'/g,"\\'")}');h.attachMedia(v);
  }
})();
<\/script>`:''}
      </div>`;
    } else {
      media+=`<div class="bubble-vid" style="margin-top:9px;border-radius:12px;overflow:hidden;width:100%;background:#000;">
        <iframe src="${escAttr(vu)}"
          width="100%" height="300" frameborder="0"
          allowfullscreen allow="autoplay; fullscreen"
          style="display:block;border-radius:12px;min-height:300px;"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups">
        </iframe>
      </div>`;
    }
  }

  let btns='';
  if(e.buttons&&e.buttons.length)btns='<div class="bubble-btns">'+e.buttons.map(b=>`<a class="lnk-btn" href="${escAttr(b.url)}" target="_blank" rel="noopener noreferrer">${esc(b.text)}</a>`).join('')+'</div>';
  if(e.htmlCode){
    const safeHtml=e.htmlCode.replace(/`/g,'&#96;');
    media+=`<div class="bubble-html" style="margin-top:9px;border-radius:12px;overflow:hidden;width:100%;">
      <iframe
        srcdoc="${safeHtml.replace(/"/g,'&quot;')}"
        style="width:100%;border:none;border-radius:12px;display:block;"
        sandbox="allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation"
        scrolling="no"
        onload="(function(f){
          try{
            var body=f.contentDocument.body;
            var html=f.contentDocument.documentElement;
            var h=Math.max(body.scrollHeight,body.offsetHeight,html.scrollHeight,html.offsetHeight);
            f.style.height=Math.min(h+24,500)+'px';
          }catch(e){f.style.height='300px';}
        })(this)"
      ></iframe>
    </div>`;
  }
  const n=cmtCount[id]||0;
  const cmtLabel=n===0?'תגובות':n===1?'1 תגובה':n+' תגובות';
  const canDel=isAdmin();
  return `<div class="msg-row" data-id="${escAttr(id)}">
    <img class="msg-av" src="${LOGO}" onerror="this.style.display='none'">
    <div class="msg-col">
      <div class="msg-meta">
        <span class="msg-meta-name">${esc(siteGlobalSettings.title)}</span>
        <span class="msg-meta-time">${esc(timeLabel(e))}</span>
        ${e.edited?'<span class="msg-meta-edited">נערכה</span>':''}
        ${isSuperAdmin()&&e.senderEmail?`<span class="msg-meta-sender">${esc(getDisplayName(e.senderEmail,e.sender||''))}</span>`:''}
      </div>
      <div class="bubble-wrap-outer">
        <div class="bubble-top-actions" id="bta-${escAttr(id)}">
          <button class="link-btn" id="lnk-${escAttr(id)}" onclick="copyMsgLink('${escAttr(id)}',this)" title="העתק קישור">
            <i class="fas fa-link" style="font-size:9px"></i>
          </button>
          <button class="cmt-btn${n>0?' has-cmt':''}" id="cbtn-${escAttr(id)}" onclick="openComments('${escAttr(id)}')">
            <i class="fas fa-comment" style="font-size:11px"></i>${n>0?'<span style="font-size:9px;font-weight:800;margin-right:2px">'+(n)+'</span>':''}
          </button>
          ${canDel?`
          <button class="msg-action-btn edit" onclick="openEditMsg('${escAttr(id)}')" title="ערוך">
            <i class="fas fa-pen" style="font-size:9px"></i>
          </button>
          <button class="msg-action-btn quote" onclick="quoteFeedMsg('${escAttr(id)}')" title="ציטוט">
            <i class="fas fa-quote-right" style="font-size:9px"></i>
          </button>
          <button class="msg-action-btn del" onclick="deleteFeedMsg('${escAttr(id)}')" title="מחק">
            <i class="fas fa-trash" style="font-size:9px"></i>
          </button>`:''}
        </div>
        <div class="bubble${red?' is-red':''}">
          ${content}${media}${btns}
        </div>
      </div>
      <div class="bubble-foot">
        <div class="rxn-row" id="rxn-${escAttr(id)}">
          <button class="rxn-add-btn" onclick="openPicker(event,'${escAttr(id)}')" title="הוסף תגובה">${REACT_SVG}</button>
        </div>
      </div>
    </div>
  </div>`;
}

function jumpToQuotedMsg(id){
  const el=document.querySelector(`.msg-row[data-id="${id}"]`);
  if(!el){return;}
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.style.transition='background .2s';
  el.style.background='rgba(26,86,219,.07)';
  el.style.borderRadius='14px';
  setTimeout(()=>{el.style.background='';el.style.borderRadius='';},2000);
}

function quoteFeedMsg(id){
  if(!isAdmin())return;
  const entry=items.find(e=>e.id===id);
  if(!entry)return;
  const ed=document.getElementById('composeEditor');
  const rawText=(entry.text||'').trim();
  const lines=rawText.split('\n');
  const preview=lines.slice(0,2).join(' ').substring(0,100)+(rawText.length>100?'…':'');
  ed._quoteData={id, text:rawText, preview};
  ed.innerHTML='';
  const qDiv=document.createElement('div');
  qDiv.setAttribute('data-quote-preview','1');
  qDiv.contentEditable='false';
  qDiv.style.cssText='background:#f3f4f6;border-right:3px solid #9ca3af;border-radius:8px;padding:7px 10px;margin-bottom:6px;color:#6b7280;font-size:13px;font-style:italic;cursor:default;user-select:none;display:flex;align-items:center;gap:6px;';
  qDiv.innerHTML=`<i class="fas fa-quote-right" style="font-size:10px;opacity:.5;flex-shrink:0;"></i><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(preview)}</span><button onclick="cancelQuote()" style="margin-right:auto;background:none;border:none;cursor:pointer;color:#aaa;font-size:12px;padding:0;line-height:1;flex-shrink:0;">✕</button>`;
  ed.appendChild(qDiv);
  const cursor=document.createElement('div');
  cursor.innerHTML='<br>';
  ed.appendChild(cursor);
  ed.focus();
  const range=document.createRange();
  range.setStart(cursor,0);
  range.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.getElementById('adminComposeBar')?.scrollIntoView({behavior:'smooth',block:'end'});
  onComposeChange();
}

function cancelQuote(){
  const ed=document.getElementById('composeEditor');
  ed.querySelector('[data-quote-preview]')?.remove();
  ed._quoteData=null;
  onComposeChange();
}

async function deleteFeedMsg(id){
  if(!me||!isAdmin())return;
  if(!confirm('למחוק הודעה זו מהפיד?'))return;
  try{
    const r=await fetch(BACKEND+'/feed_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,id})});
    const d=await r.json();
    if(d.status==='ok'){
      items=items.filter(e=>e.id!==id);
      knownIds.delete(id);
      document.querySelector(`.msg-row[data-id="${id}"]`)?.remove();
    }
  }catch(e){}
}

function renderRxn(msgId,rxns){rxnCache[msgId]=rxns;
  const bar=document.getElementById('rxn-'+msgId);
  if(!bar)return;
  const addBtn=bar.querySelector('.rxn-add-btn');
  bar.innerHTML='';
  const activeTypes=Object.entries(rxns).filter(([,users])=>users.length);
  activeTypes.forEach(([emoji,users])=>{
    const mine=users.includes(me?.email);
    const c=document.createElement('button');
    c.className='rxn-chip'+(mine?' mine':'');
    c.innerHTML=`<span class="rxn-emoji">${esc(emoji)}</span><span class="rxn-count">${users.length}</span>`;
    c.onclick=()=>doReact(msgId,emoji);
    bar.appendChild(c);
  });
  if(addBtn){addBtn.classList.toggle('maxed',activeTypes.length>=5);bar.appendChild(addBtn);}
  else{
    const b=document.createElement('button');
    b.className='rxn-add-btn'+(activeTypes.length>=5?' maxed':'');
    b.innerHTML=REACT_SVG;
    b.onclick=(ev)=>openPicker(ev,msgId);
    bar.appendChild(b);
  }
}

function openPicker(ev,msgId){
  ev.stopPropagation();activePicker=msgId;
  const p=document.getElementById('emojiPicker');
  p.style.visibility='hidden';p.style.display='grid';
  const pH=p.offsetHeight,pW=p.offsetWidth;
  p.style.display='';p.style.visibility=''; 
  const rect=ev.currentTarget.getBoundingClientRect();
  const M=8;
  let top=rect.top-pH-M;
  if(top<56+M)top=rect.bottom+M;
  top=Math.max(56+M,top);
  let left=rect.right-pW;
  if(left<M)left=M;
  if(left+pW>window.innerWidth-M)left=window.innerWidth-pW-M;
  p.style.top=top+'px';p.style.left=left+'px';
  p.classList.add('show');
}

function pickEmoji(em){document.getElementById('emojiPicker').classList.remove('show');if(activePicker)doReact(activePicker,em);activePicker=null;}

document.addEventListener('click',e=>{
  if(!e.target.closest('#mentionDropdown')&&!e.target.closest('#chatInput'))hideMentionDrop();
  if(!e.target.closest('#emojiPicker')&&!e.target.closest('.rxn-add-btn'))document.getElementById('emojiPicker').classList.remove('show');
  if(!e.target.closest('.ctb-dropdown')&&!e.target.closest('.ctb-dropdown-wrap'))closeAllCtbDropdowns();
});

async function doReact(msgId,emoji){
  if(!me)return;
  if(typeof emoji!=='string'||emoji.length>MAX_EMOJI_LEN)return;
  const current=rxnCache[msgId]||{};
  const activeTypes=Object.entries(current).filter(([,u])=>u.length);
  const isNewType=!(emoji in current);
  if(isNewType&&activeTypes.length>=5)return;
  const users=[...(current[emoji]||[])];
  const myIdx=users.indexOf(me.email);
  if(myIdx>=0)users.splice(myIdx,1);else users.push(me.email);
  const optimistic={...current};
  if(users.length)optimistic[emoji]=users;else delete optimistic[emoji];
  renderRxn(msgId,optimistic);
  try{
    const r=await fetch(BACKEND+'/feed_react',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,msgId,emoji})});
    const d=await r.json();
    if(d.status==='ok')renderRxn(msgId,d.reactions);
  }catch(e){}
}

/* ── COMMENTS ── */
function openComments(msgId){activeCmtMsgId=msgId;document.getElementById('commentsPanel').classList.add('open');loadComments(msgId);}
function closeComments(){document.getElementById('commentsPanel').classList.remove('open');activeCmtMsgId=null;}

async function loadComments(msgId){
  const b=document.getElementById('cpBody');
  const cached=b.dataset.msgId===msgId;
  if(!cached)b.innerHTML='<div class="cp-spinner"><div class="cp-spinner-ring"></div>טוען...</div>';
  b.dataset.msgId=msgId;
  try{
    const r=await fetch(BACKEND+'/feed_comments?msgId='+encodeURIComponent(msgId));
    const d=await r.json();
    const list=d.comments||[];
    cmtCount[msgId]=list.length;updateCmtBtn(msgId,list.length);
    const wasAtBottom=(b.scrollHeight-b.scrollTop-b.clientHeight)<60;
    b.innerHTML=list.length?list.map(c=>buildCmt(msgId,c)).join(''):'<div class="no-cmt">עדיין אין תגובות</div>';
    if(wasAtBottom||!cached)b.scrollTop=b.scrollHeight;
  }catch(e){b.innerHTML='<div class="no-cmt">שגיאה</div>';}
}

function buildCmt(msgId,c){
  const canDelete=isSuperAdmin()||(c.email===me?.email);
  const av=c.picture?`<img class="ci-av" src="${escAttr(c.picture)}" onerror="this.parentNode.innerHTML='<div class=ci-av-i>${esc((c.name||'?')[0].toUpperCase())}</div>'">`:`<div class="ci-av-i">${esc((c.name||'?')[0].toUpperCase())}</div>`;
  return `<div class="ci" id="ci-${escAttr(c.id)}">${av}<div class="ci-bubble"><div class="ci-text">${esc(c.text)}</div><div class="ci-time">${esc(fixServerTime(c.time||''))}</div>${canDelete?`<button class="ci-del" onclick="delCmt('${escAttr(msgId)}','${escAttr(c.id)}')"><i class="fas fa-times"></i></button>`:''}</div></div>`;
}

function updateCmtBtn(msgId,n){
  const btn=document.getElementById('cbtn-'+msgId);if(!btn)return;
  btn.className='cmt-btn'+(n>0?' has-cmt':'');
  btn.innerHTML=`<i class="fas fa-comment" style="font-size:11px"></i>${n>0?`<span style="font-size:9px;font-weight:800;margin-right:2px">${n}</span>`:''}`;
}

async function sendComment(){
  const inp=document.getElementById('cpInp');const text=inp.value.trim();
  if(!text||!me||!activeCmtMsgId)return;
  if(text.length>MAX_COMMENT_LEN){alert('תגובה ארוכה מדי');return;}
  inp.value='';inp.style.height='auto';
  try{
    const r=await fetch(BACKEND+'/feed_comment_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:me.name,picture:me.picture,msgId:activeCmtMsgId,text})});
    const d=await r.json();
    if(d.status==='ok'){
      const b=document.getElementById('cpBody');b.querySelector('.no-cmt')?.remove();
      const div=document.createElement('div');div.innerHTML=buildCmt(activeCmtMsgId,d.comment);b.appendChild(div.firstChild);b.scrollTop=b.scrollHeight;
      cmtCount[activeCmtMsgId]=(cmtCount[activeCmtMsgId]||0)+1;updateCmtBtn(activeCmtMsgId,cmtCount[activeCmtMsgId]);
    }
  }catch(e){}
}

async function delCmt(msgId,cid){
  if(!me)return;
  try{
    const r=await fetch(BACKEND+'/feed_comment_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,msgId,commentId:cid})});
    const d=await r.json();
    if(d.status==='ok'){document.getElementById('ci-'+cid)?.remove();cmtCount[msgId]=Math.max(0,(cmtCount[msgId]||1)-1);updateCmtBtn(msgId,cmtCount[msgId]);if(!document.querySelector('#cpBody .ci'))document.getElementById('cpBody').innerHTML='<div class="no-cmt">עדיין אין תגובות</div>';}
  }catch(e){}
}

/* ── FEED ── */
let _lastVisitTs = 0;
function _saveLastVisitTs(){
  if(!me||!lastTs)return;
  localStorage.setItem('shaagat_visit_'+me.email, String(lastTs));
}
function _loadLastVisitTs(){
  if(!me)return 0;
  return parseInt(localStorage.getItem('shaagat_visit_'+me.email)||'0',10);
}
window.addEventListener('pagehide',_saveLastVisitTs);
window.addEventListener('beforeunload',_saveLastVisitTs);

async function loadFeed(){
  _lastVisitTs = _loadLastVisitTs();
  setLoading(true);
  try{
    const r=await fetch(BACKEND+`/feed?channel=${currentChannelId}&limit=20`);
    const d=await r.json();
    if(d.status==='ok'){
      let allPages=[...d.feed].reverse();
      allPages.forEach(e=>knownIds.add(e.id));
      allLoaded=d.feed.length<20;
      oldestTs=allPages.length?Math.min(...allPages.map(e=>e.ts||Infinity)):0;

      if(_lastVisitTs && allPages.length && allPages[0].ts > _lastVisitTs){
        for(let i=0;i<5&&!allLoaded;i++){
          try{
            const rp=await fetch(BACKEND+`/feed?channel=${currentChannelId}&before=${oldestTs}&limit=20`);
            const dp=await rp.json();
            if(dp.status==='ok'&&dp.feed.length){
              const older=dp.feed.filter(e=>!knownIds.has(e.id)).reverse();
              older.forEach(e=>knownIds.add(e.id));
              allPages=[...older,...allPages];
              oldestTs=Math.min(...older.map(e=>e.ts||Infinity));
              allLoaded=dp.feed.length<20;
              if(allPages[0].ts <= _lastVisitTs) break; 
            }else{allLoaded=true;break;}
          }catch(e){break;}
        }
      }

      items=allPages;
      lastTs=items.length?Math.max(...items.map(e=>e.ts||0)):0;

      const inner=document.getElementById('feedInner');
      inner.innerHTML='';
      if(!items.length){document.getElementById('empty').style.display='block';}
      else{
        document.getElementById('empty').style.display='none';
        inner.innerHTML=items.map(buildMsg).join('');
      }

      let scrollTarget=null;
      if(_lastVisitTs&&items.length){
        const firstUnreadIdx=items.findIndex(e=>(e.ts||0)>_lastVisitTs);
        if(firstUnreadIdx>0){
          const row=document.querySelector(`.msg-row[data-id="${items[firstUnreadIdx].id}"]`);
          if(row){
            document.getElementById('unreadSep')?.remove();
            const sep=document.createElement('div');
            sep.id='unreadSep';sep.className='unread-sep';
            sep.innerHTML='<span>לא נקראו</span>';
            row.parentNode.insertBefore(sep,row);
            scrollTarget=sep;
          }
        }
      }

      const wrap=document.getElementById('feedWrap');
      if(scrollTarget){
        wrap.scrollTop=0; 
        setTimeout(()=>scrollTarget.scrollIntoView({behavior:'auto',block:'start'}),50);
      }else{
        wrap.scrollTop=wrap.scrollHeight;
      }

      if(items.length)await pollAll(true);
      setTimeout(highlightMsgFromHash,500);
      if(isAdmin()) loadPageStats();
    }
  }catch(e){}
  setLoading(false);
}

async function loadMore(){
  if(loadingMore||allLoaded||!oldestTs)return;
  loadingMore=true;document.getElementById('loadMoreSpinner').classList.add('show');
  try{
    const r=await fetch(BACKEND+`/feed?channel=${currentChannelId}&before=${oldestTs}&limit=20`);
    const d=await r.json();
    if(d.status==='ok'&&d.feed.length){
      const older=d.feed.filter(e=>!knownIds.has(e.id)).reverse();
      if(!older.length){allLoaded=true;}
      else{
        older.forEach(e=>{knownIds.add(e.id);items.unshift(e);});
        oldestTs=Math.min(...older.map(e=>e.ts||Infinity));
        allLoaded=older.length<20;
        const inner=document.getElementById('feedInner');const wrap=document.getElementById('feedWrap');
        const prevHeight=wrap.scrollHeight;const prevTop=wrap.scrollTop;
        inner.insertAdjacentHTML('afterbegin',older.map(buildMsg).join(''));
        wrap.scrollTop=prevTop+(wrap.scrollHeight-prevHeight);
        if(older.length)setTimeout(pollAll,100);
      }
    }else{allLoaded=true;}
  }catch(e){}finally{loadingMore=false;document.getElementById('loadMoreSpinner').classList.remove('show');}
}

async function pollAll(){if(!me||!items.length)return;
  pollPending=true;
  try{
    const r=await fetch(BACKEND+'/feed_poll',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel: currentChannelId, msgIds:items.map(e=>e.id),since:lastTs})});
    const d=await r.json();if(d.status!=='ok')return;
    const newRaw=d.new_items||[];
    const ni=newRaw.filter(e=>!knownIds.has(e.id));
    if(ni.length){
      lastTs=Math.max(...newRaw.map(e=>e.ts||0),lastTs);
      ni.forEach(e=>knownIds.add(e.id));items.push(...ni);
      const inner=document.getElementById('feedInner');document.getElementById('empty').style.display='none';
      ni.forEach(e=>{const div=document.createElement('div');div.innerHTML=buildMsg(e);inner.appendChild(div.firstChild);});
      if(atBottom)document.getElementById('feedWrap').scrollTop=999999;
      else{newCount+=ni.length;updateScrollBtn();}
      if(ni.length)sendNotification(siteGlobalSettings.title + ' — הודעה חדשה',ni[ni.length-1].text?.substring(0,60)||'');
    }else if(newRaw.length){lastTs=Math.max(...newRaw.map(e=>e.ts||0),lastTs);}
    const serverIds=new Set(d.active_ids||[]);
    if(serverIds.size>0){
      const toRemove=items.filter(e=>!serverIds.has(e.id));
      toRemove.forEach(e=>{
        items=items.filter(i=>i.id!==e.id);
        knownIds.delete(e.id);
        document.querySelector(`.msg-row[data-id="${e.id}"]`)?.remove();
      });
      if(!items.length)document.getElementById('empty').style.display='block';
    }
    const rxns=d.reactions||{};Object.entries(rxns).forEach(([mid,rxn])=>renderRxn(mid,rxn));
    const counts=d.comment_counts||{};Object.entries(counts).forEach(([mid,n])=>{if(n!==(cmtCount[mid]||0)){cmtCount[mid]=n;updateCmtBtn(mid,n);}});
    const edited=d.edited_items||[];
    edited.forEach(entry=>{
      const idx=items.findIndex(i=>i.id===entry.id);
      if(idx<0)return;
      const existing=items[idx];
      if(existing.edit_ts&&existing.edit_ts>=entry.edit_ts)return;
      items[idx]=entry;
      const row=document.querySelector(`.msg-row[data-id="${entry.id}"]`);
      if(row){
        const nd=document.createElement('div');
        nd.innerHTML=buildMsg(entry);
        row.replaceWith(nd.firstChild);
        if(rxnCache[entry.id])renderRxn(entry.id,rxnCache[entry.id]);
      }
    });
  }catch(e){}finally{pollPending=false;}
}

function scrollToBottom(){document.getElementById('feedWrap').scrollTo({top:999999,behavior:'smooth'});newCount=0;updateScrollBtn();}
function updateScrollBtn(){
  const btn=document.getElementById('scrollDownBtn');
  if(!atBottom){btn.classList.add('show');if(newCount>0)btn.classList.add('has-new');else btn.classList.remove('has-new');}
  else{btn.classList.remove('show','has-new');newCount=0;}
}
function updateComposeHeight(){
  const bar=document.getElementById('adminComposeBar');
  if(bar&&bar.classList.contains('show')){
    document.documentElement.style.setProperty('--compose-h', bar.offsetHeight+'px');
    document.body.classList.add('has-compose');
  }else{
    document.body.classList.remove('has-compose');
  }
}
const _composeObserver=new ResizeObserver(updateComposeHeight);
const _composeEl=document.getElementById('adminComposeBar');
if(_composeEl)_composeObserver.observe(_composeEl);

document.getElementById('feedWrap').addEventListener('scroll',function(){
  atBottom=(this.scrollHeight-this.scrollTop-this.clientHeight)<80;updateScrollBtn();
  if(this.scrollTop<120&&!loadingMore&&!allLoaded)loadMore();
},{passive:true});

function setLoading(v){document.getElementById('prog').classList.toggle('on',v);}

/* ══ WRITE PERMISSION SYSTEM ══ */
let _writePerm=null;
let _writePermPending=false;

/* ══ UPDATE MODE ══ */
let _updateMode=false;
let _updateUntil='';

function onUpdateModeHdrClick(e){
  e.stopPropagation();
  if(isSuperAdmin()){
    const pop=document.getElementById('updateModePopover');
    if(!pop)return;
    const isOpen=pop.classList.contains('open');
    closeAllCtbDropdowns();
    document.getElementById('writePermDropdown').style.display='none';
    if(!isOpen) pop.classList.add('open');
    else pop.classList.remove('open');
  } else {
    toggleUpdateMode();
  }
}

function closeUpdateModePopover(){
  document.getElementById('updateModePopover')?.classList.remove('open');
}

function openUpdateTimeDialog(){
  const now=new Date();
  now.setHours(now.getHours()+1,0,0,0);
  const h=String(now.getHours()).padStart(2,'0');
  const inp=document.getElementById('updateTimeInput');
  if(inp)inp.value=h+':00';
  document.getElementById('updateTimeDialog').classList.add('open');
  setTimeout(()=>inp?.focus(),100);
}

function closeUpdateTimeDialog(){
  document.getElementById('updateTimeDialog').classList.remove('open');
}

function confirmUpdateTime(){
  const inp=document.getElementById('updateTimeInput');
  const val=(inp?.value||'').trim();
  if(!val){alert('נא לבחור שעה');return;}
  _updateMode=true;
  _updateUntil=val;
  closeUpdateTimeDialog();
  applyUpdateModeUI();
  saveUpdateModeToServer(true,val);
}

function toggleUpdateMode(){
  if(_updateMode){
    _updateMode=false;
    _updateUntil='';
    applyUpdateModeUI();
    saveUpdateModeToServer(false,'');
  } else {
    openUpdateTimeDialog();
  }
}

function applyUpdateModeUI(){
  const btn=document.getElementById('updateModeBtn');
  const bar=document.getElementById('updateModeBar');
  const hdrBtn=document.getElementById('updateModeHdrBtn');
  const notice=document.getElementById('updateModeNotice');
  if(btn&&bar){
    if(_updateMode){
      btn.className='update-mode-btn on';
      btn.innerHTML='<i class="fas fa-check" style="font-size:9px"></i> מעדכן'
        +(_updateUntil?` עד ${_updateUntil}`:'');
    } else {
      btn.className='update-mode-btn off';
      btn.innerHTML='<i class="fas fa-times" style="font-size:9px"></i> לא מעדכן';
    }
    const whoEl=document.getElementById('updateModeWho');
    if(whoEl)whoEl.textContent='';
  }
  if(hdrBtn){
    if(_updateMode){
      hdrBtn.classList.add('is-on');
      hdrBtn.title='מעדכן'+(_updateUntil?' עד '+_updateUntil:'')+' — לחץ לסיום';
    } else {
      hdrBtn.classList.remove('is-on');
      hdrBtn.title='לא מעדכן — לחץ להפעלה';
    }
  }
  if(notice&&!isSuperAdmin()){
    notice.classList.toggle('show',!_updateMode);
  }
}

async function saveUpdateModeToServer(active,until){
  try{
    await fetch(BACKEND+'/update_mode_set',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({email:me.email,name:getDisplayName(me.email,me.name),active,until})});
  }catch(e){}
}

function isUntilExpired(until){
  if(!until)return false;
  const m=until.match(/^(\d{1,2}):(\d{2})$/);
  if(!m)return false;
  const now=new Date();
  const endH=parseInt(m[1],10), endM=parseInt(m[2],10);
  const endMinutes=endH*60+endM;
  const nowMinutes=now.getHours()*60+now.getMinutes();
  return nowMinutes>endMinutes;
}

async function pollUpdateMode(){
  if(!isAdmin())return;
  try{
    const r=await fetch(BACKEND+'/update_mode_get');
    const d=await r.json();
    const bar=document.getElementById('updateModeBar');
    if(bar)bar.classList.remove('show');
    const hdrBtn=document.getElementById('updateModeHdrBtn');
    if(hdrBtn)hdrBtn.style.display='inline-flex';

    if(_updateMode && isUntilExpired(_updateUntil)){
      _updateMode=false;
      _updateUntil='';
      applyUpdateModeUI();
      saveUpdateModeToServer(false,'');
    }

    const myEntry=(d.updaters||[]).find(u=>u.email===me?.email?.toLowerCase());
    if(myEntry&&!_updateMode){
      const expired=isUntilExpired(myEntry.until);
      if(myEntry.active && expired){
        saveUpdateModeToServer(false,'');
      } else {
        _updateMode=myEntry.active;
        _updateUntil=myEntry.until||'';
        applyUpdateModeUI();
      }
    }

    if(isSuperAdmin()){
      const allActive=(d.updaters||[]).filter(u=>
        u.active && u.email!==me?.email?.toLowerCase() && !isUntilExpired(u.until)
      );
      const body=document.getElementById('updateModePopoverBody');
      if(body){
        if(allActive.length){
          body.innerHTML=allActive.map(u=>`
            <div class="ump-row">
              <div class="ump-dot"></div>
              <span>${u.name||u.email}${u.until?' — עד '+u.until:''}</span>
            </div>`).join('');
        } else {
          body.innerHTML='<div class="ump-empty">אין מעדכנים פעילים כרגע</div>';
        }
      }
      if(hdrBtn){
        hdrBtn.classList.remove('has-active','no-active');
        hdrBtn.classList.add(allActive.length?'has-active':'no-active');
        hdrBtn.title=allActive.length
          ?'מעדכנים: '+allActive.map(u=>u.name+(u.until?' עד '+u.until:'')).join(', ')
          :'אין מעדכנים פעילים כרגע';
      }
    }

    if(!isSuperAdmin()){
      const canSend=_updateMode;
      const sendBtn=document.getElementById('composeSendBtn');
      if(sendBtn){
        sendBtn.disabled=!canSend;
        sendBtn.style.opacity=canSend?'1':'0.4';
        sendBtn.title=canSend?'שלח':'עליך להפעיל מצב מעדכן לפני שליחה';
      }
    }
  }catch(e){}
}

async function pollWritePerm(){
  if(!isAdmin()||_writePermPending)return;
  _writePermPending=true;
  try{
    const r=await fetch(BACKEND+'/write_perm_get');
    const d=await r.json();
    if(d.status==='ok')applyWritePerm(d.perm);
  }catch(e){}finally{_writePermPending=false;}
}

function applyWritePerm(perm){
  _writePerm=perm;
  const grantedEmails=perm?.emails||[];
  const bar=document.getElementById('adminComposeBar');
  const notice=document.getElementById('blockNotice');
  const btn=document.getElementById('writePermBtn');
  if(!bar)return;
  if(isSuperAdmin()){
    bar.classList.remove('blocked');
    notice.classList.remove('show');
    if(btn)btn.classList.toggle('has-granted',grantedEmails.length>0);
    const dd=document.getElementById('writePermDropdown');
    if(dd&&dd.style.display==='block') renderWritePermDropdown(grantedEmails);
    return;
  }
  if(btn)btn.classList.toggle('has-granted',grantedEmails.length>0);
  const hasPermission=grantedEmails.includes(me?.email||'');
  bar.classList.toggle('blocked',!hasPermission);
  notice.classList.toggle('show',!hasPermission);
  if(!hasPermission){
    notice.textContent='✋ אין לך הרשאת כתיבה כרגע — המתן ל-hip להעניק הרשאה';
  }
}

async function toggleWritePerm(targetEmail,e){
  if(e)e.stopPropagation();
  if(!isSuperAdmin())return;
  const grantedEmails=_writePerm?.emails||[];
  const grant=!grantedEmails.includes(targetEmail);
  try{
    const r=await fetch(BACKEND+'/write_perm_set',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({requester:me.email,target:targetEmail,grant})});
    const d=await r.json();
    if(d.status==='ok')applyWritePerm(d.perm);
  }catch(e){}
}

function toggleWritePermDropdown(e){
  if(e)e.stopPropagation();
  const dd=document.getElementById('writePermDropdown');
  if(dd.style.display==='block'){
    dd.style.display='none';
  } else {
    renderWritePermDropdown(_writePerm?.emails||[]);
    dd.style.display='block';
  }
}

document.addEventListener('click',function(e){
  const dd=document.getElementById('writePermDropdown');
  const btn=document.getElementById('writePermBtn');
  if(dd&&dd.style.display==='block'&&!dd.contains(e.target)&&e.target!==btn&&!btn?.contains(e.target)){
    dd.style.display='none';
  }
  const pop=document.getElementById('updateModePopover');
  const hdrBtn=document.getElementById('updateModeHdrBtn');
  if(pop&&pop.classList.contains('open')&&!pop.contains(e.target)&&!hdrBtn?.contains(e.target)){
    pop.classList.remove('open');
  }
});

document.addEventListener('keydown',function(e){
  if(e.key==='Enter'&&document.getElementById('updateTimeDialog')?.classList.contains('open')){
    confirmUpdateTime();
  }
  if(e.key==='Escape'&&document.getElementById('updateTimeDialog')?.classList.contains('open')){
    closeUpdateTimeDialog();
  }
});

function renderWritePermDropdown(grantedEmails){
  const list=document.getElementById('writePermList');
  if(!list)return;
  const admins=Object.entries(_allowedMap).filter(([email])=>email!==ADMIN_EMAIL.toLowerCase());
  if(!admins.length){
    list.innerHTML='<div style="padding:12px 6px;text-align:center;color:#aaa;font-size:12px;">אין מנהלים משניים</div>';
    return;
  }
  list.innerHTML=admins.map(([email,info])=>{
    const isGranted=grantedEmails.includes(email);
    const pic=info.picture||'';
    const initials=(info.name||email)[0].toUpperCase();
    const bg=chatCol(info.name||email);
    const av=pic
      ?`<img src="${escAttr(pic)}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;flex-shrink:0;" onerror="this.style.display='none'">`
      :`<div style="width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${initials}</div>`;
    return `<div onclick="toggleWritePerm('${escAttr(email)}',event)" style="
      display:flex;align-items:center;gap:9px;padding:7px 8px;
      border-radius:10px;cursor:pointer;
      background:${isGranted?'#eff6ff':'transparent'};
      border:1.5px solid ${isGranted?'#bfdbfe':'transparent'};
      transition:background .12s,border-color .12s;
    " onmouseover="this.style.background='${isGranted?'#dbeafe':'#f3f4f6'}'" onmouseout="this.style.background='${isGranted?'#eff6ff':'transparent'}'">
      ${av}
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(info.name||email)}</div>
        <div style="font-size:10px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(email)}</div>
      </div>
      <div style="width:18px;height:18px;border-radius:50%;border:2px solid ${isGranted?'#1a56db':'#d1d5db'};background:${isGranted?'#1a56db':'transparent'};display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .12s;">
        ${isGranted?'<i class="fas fa-check" style="font-size:8px;color:#fff;"></i>':''}
      </div>
    </div>`;
  }).join('');
}

/* ══ ADMIN COMPOSE BAR ══ */

function toggleComposeProfile(){
  composeProfile=composeProfile==='news'?'red':'news';
  const t=document.getElementById('profileToggle');
  const lbl=document.getElementById('profileLabel');
  const icon=document.getElementById('profileIcon');
  const btn=document.getElementById('composeSendBtn');
  if(composeProfile==='red'){
    t.classList.add('red');lbl.textContent='צבע אדום';icon.className='fas fa-exclamation-triangle';
    btn.classList.add('red');
  }else{
    t.classList.remove('red');lbl.textContent='מבזק חדשות';icon.className='fas fa-newspaper';
    btn.classList.remove('red');
  }
}

function composeDragOver(e){
  const items=[...(e.dataTransfer?.items||[])];
  const hasImg=items.some(i=>i.kind==='file'&&i.type.startsWith('image/'));
  const hasVid=items.some(i=>i.kind==='file'&&i.type.startsWith('video/'));
  if(hasImg||hasVid){
    e.preventDefault();e.dataTransfer.dropEffect='copy';
    e.currentTarget.style.borderColor=hasVid?'#7c3aed':'#1a56db';
    e.currentTarget.style.background=hasVid?'#faf5ff':'#f0f6ff';
  }
}
function composeDragLeave(e){
  if(!e.currentTarget.contains(e.relatedTarget)){e.currentTarget.style.borderColor='';e.currentTarget.style.background='';}
}
async function composeDrop(e){
  e.preventDefault();
  e.currentTarget.style.borderColor='';e.currentTarget.style.background='';
}
async function composePaste(e){
  // NO FILE UPLOADS ANYMORE per user request.
}

function applyHtmlCode(){
  const ta=document.getElementById('composeHtmlCode');
  if(!ta||!ta.value.trim()){return;}
  composeHtmlCode=ta.value.trim();
  const badge=document.getElementById('htmlPreviewBadge');
  if(badge)badge.style.display='flex';
  updateAttachPreview();
  closeAllCtbDropdowns();
}

function clearHtmlCode(){
  composeHtmlCode='';
  const ta=document.getElementById('composeHtmlCode');if(ta)ta.value='';
  const badge=document.getElementById('htmlPreviewBadge');if(badge)badge.style.display='none';
  updateAttachPreview();
}

function insertHeading(){
  const ed=document.getElementById('composeEditor');
  ed.focus();
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount)return;
  const range=sel.getRangeAt(0);

  let node=range.startContainer;
  let offset=range.startOffset;

  if(node===ed){
    const children=ed.childNodes;
    if(children.length>0){node=children[children.length-1];offset=node.textContent?.length||0;}
    else{ed.innerHTML='<br>';onComposeChange();return;}
  }

  if(node.nodeType!==Node.TEXT_NODE){
    if(node.childNodes[offset-1]){node=node.childNodes[offset-1];offset=node.textContent?.length||0;}
    else if(node.firstChild){node=node.firstChild;offset=0;}
  }

  if(node.nodeType===Node.TEXT_NODE){
    const text=node.textContent;
    const before=text.substring(0,offset);
    const after=text.substring(offset);
    const lastNL=before.lastIndexOf('\n');
    const lineStart=lastNL>=0?lastNL+1:0;
    const lineText=before.substring(lineStart);

    const newBefore=before.substring(0,lineStart)+(lineText?'**'+lineText+' •**':'**•**');
    node.textContent=newBefore+after;

    const newRange=document.createRange();
    newRange.setStart(node,newBefore.length);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  } else {
    document.execCommand('insertText',false,' •');
  }
  onComposeChange();
}

function composeFormat(cmd){
  const ed=document.getElementById('composeEditor');
  ed.focus();
  requestAnimationFrame(()=>{
    document.execCommand(cmd,false,null);
    onComposeChange();
  });
}

function onComposeChange(){
  const ed=document.getElementById('composeEditor');
  const text=editorToMarkdown(ed);
  document.getElementById('composeCharCount').textContent=text.length;
}

function clearCompose(){
  const ed=document.getElementById('composeEditor');
  ed.innerHTML='';
  ed._quoteData=null;
  composeImgUrl='';composeVidUrl='';composeBtns=[];composeHtmlCode='';
  const ta=document.getElementById('composeHtmlCode');if(ta)ta.value='';
  const badge=document.getElementById('htmlPreviewBadge');if(badge)badge.style.display='none';
  document.getElementById('composeImgUrl').value='';
  document.getElementById('composeImgThumb').style.display='none';
  document.getElementById('composeVidUrl').value='';
  document.getElementById('composeBtnList').innerHTML='';
  updateAttachPreview();onComposeChange();
}

function toggleCtbDropdown(id){
  const el=document.getElementById(id);
  const wasOpen=el.classList.contains('open');
  closeAllCtbDropdowns();
  if(!wasOpen)el.classList.add('open');
}

function closeAllCtbDropdowns(){
  document.querySelectorAll('.ctb-dropdown').forEach(el=>el.classList.remove('open'));
}

function updateComposeImg(){
  const url=document.getElementById('composeImgUrl').value.trim();
  composeImgUrl=url;
  const thumb=document.getElementById('composeImgThumb');
  if(url){
    document.getElementById('composeImgThumbImg').src=url;
    thumb.style.display='block';
  }
  else{thumb.style.display='none';}
  updateAttachPreview();
}

function clearComposeImg(){composeImgUrl='';document.getElementById('composeImgUrl').value='';document.getElementById('composeImgThumb').style.display='none';updateAttachPreview();}

function updateComposeVid(){
  composeVidUrl=document.getElementById('composeVidUrl').value.trim();
  updateAttachPreview();
}

function addComposeButton(){
  const text=document.getElementById('composeBtnText').value.trim();
  const url=document.getElementById('composeBtnUrl').value.trim();
  if(!text||!url)return;
  composeBtns.push({id:Date.now(),text,url});
  document.getElementById('composeBtnText').value='';
  document.getElementById('composeBtnUrl').value='';
  renderComposeBtns();updateAttachPreview();
}

function removeComposeButton(id){
  composeBtns=composeBtns.filter(b=>b.id!==id);
  renderComposeBtns();updateAttachPreview();
}

function renderComposeBtns(){
  document.getElementById('composeBtnList').innerHTML=composeBtns.map(b=>
    `<div style="display:inline-flex;align-items:center;gap:4px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:700;color:#ea580c;">
      <i class="fas fa-mouse-pointer" style="font-size:9px"></i>${esc(b.text)}
      <button onclick="removeComposeButton(${b.id})" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:11px;padding:0;line-height:1;">✕</button>
    </div>`
  ).join('');
}

function updateAttachPreview(){
  const prev=document.getElementById('attachPreview');
  const chips=[];
  if(composeImgUrl)chips.push(`<div class="attach-chip"><i class="fas fa-image" style="color:#1a56db;font-size:10px"></i> תמונה <button onclick="clearComposeImg()">✕</button></div>`);
  if(composeVidUrl)chips.push(`<div class="attach-chip"><i class="fas fa-video" style="color:#7c3aed;font-size:10px"></i> סרטון <button onclick="clearComposeVid()">✕</button></div>`);
  if(composeHtmlCode)chips.push(`<div class="attach-chip"><i class="fas fa-code" style="color:#059669;font-size:10px"></i> HTML <button onclick="clearHtmlCode()">✕</button></div>`);
  composeBtns.forEach(b=>chips.push(`<div class="attach-chip"><i class="fas fa-mouse-pointer" style="color:#ea580c;font-size:10px"></i> ${esc(b.text)} <button onclick="removeComposeButton(${b.id})">✕</button></div>`));
  prev.innerHTML=chips.join('');
  prev.classList.toggle('show',chips.length>0);
}

function clearComposeVid(){composeVidUrl='';document.getElementById('composeVidUrl').value='';updateAttachPreview();}

function editorToMarkdown(el){
  function nodeToText(node){
    if(node.nodeType===Node.TEXT_NODE)return node.textContent;
    if(node.nodeType!==Node.ELEMENT_NODE)return'';
    if(node.getAttribute&&node.getAttribute('data-quote-preview'))return'';
    const tag=node.tagName.toLowerCase();
    const inner=Array.from(node.childNodes).map(nodeToText).join('');
    if(tag==='b'||tag==='strong')return'**'+inner+'**';
    if(tag==='i'||tag==='em')return'_'+inner+'_';
    if(tag==='u')return inner;
    if(tag==='br')return'\n';
    if(tag==='font'){
      const color=node.getAttribute('color');
      if(color)return` color:${color} ${inner} /color `;
      return inner;
    }
    if(tag==='span'){
      const style=node.getAttribute('style')||'';
      const colorMatch=style.match(/color:\s*([^;]+)/);
      if(colorMatch)return` color:${colorMatch[1].trim()} ${inner} /color `;
      return inner;
    }
    if(tag==='s'){return`~~${inner}~~`;}
    if(tag==='hr'){return '\n---DIVIDER---\n';}
    if(tag==='a'){
      const href=node.getAttribute('href')||'';
      if(href&&href.startsWith('http'))return`[${inner}](${href})`;
      return inner;
    }
    if(tag==='div'||tag==='p'){
      return (node.previousElementSibling&&!node.previousElementSibling.getAttribute('data-quote-preview')?'\n':'')+inner;
    }
    return inner;
  }
  return nodeToText(el);
}

function insertDivider(){
  const ed=document.getElementById('composeEditor');
  ed.focus();
  const hr=document.createElement('hr');
  hr.className='bubble-divider';
  const sel=window.getSelection();
  if(sel&&sel.rangeCount){
    const range=sel.getRangeAt(0);
    range.collapse(false);
    range.insertNode(hr);
    const br=document.createElement('br');
    hr.insertAdjacentElement('afterend',br);
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  onComposeChange();
}

function composeStrikethrough(){
  const ed=document.getElementById('composeEditor');
  ed.focus();
  const sel=window.getSelection();
  if(!sel||!sel.rangeCount||sel.isCollapsed)return;
  const range=sel.getRangeAt(0);
  const s=document.createElement('s');
  try{range.surroundContents(s);}
  catch(e){document.execCommand('strikeThrough',false,null);}
  onComposeChange();
}

let _savedLinkRange=null;
function saveLinkSelection(){
  const sel=window.getSelection();
  if(sel&&sel.rangeCount){_savedLinkRange=sel.getRangeAt(0).cloneRange();}
  const sel2=window.getSelection();
  const txt=sel2&&!sel2.isCollapsed?sel2.toString():'';
  if(txt)document.getElementById('composeLinkText').value=txt;
}

function insertComposeLink(){
  const text=document.getElementById('composeLinkText').value.trim();
  const url=document.getElementById('composeLinkUrl').value.trim();
  if(!text||!url){alert('יש למלא טקסט וקישור');return;}
  const ed=document.getElementById('composeEditor');
  ed.focus();
  if(_savedLinkRange){
    const sel=window.getSelection();
    sel.removeAllRanges();
    sel.addRange(_savedLinkRange);
  }
  const a=document.createElement('a');
  a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  a.textContent=text;
  a.style.color='#1a56db';
  const sel=window.getSelection();
  if(sel&&sel.rangeCount){
    const range=sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(a);
    range.setStartAfter(a);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  document.getElementById('composeLinkText').value='';
  document.getElementById('composeLinkUrl').value='';
  closeAllCtbDropdowns();
  onComposeChange();
}

function applyTextColor(color){
  const ed=document.getElementById('composeEditor');
  ed.focus();
  const sel=window.getSelection();
  if(!sel||sel.rangeCount===0||sel.isCollapsed){
    document.execCommand('foreColor',false,color);
  } else {
    document.execCommand('foreColor',false,color);
  }
  closeAllCtbDropdowns();
  onComposeChange();
}

function removeTextColor(){
  const ed=document.getElementById('composeEditor');
  ed.focus();
  document.execCommand('foreColor',false,'#374151');
  closeAllCtbDropdowns();
  onComposeChange();
}

function onComposeKeyDown(e){
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){
    e.preventDefault();
    if(_editMsgId)saveEditMsg();
    else sendFeedPost();
    return;
  }
}

async function sendFeedPost(){
  if(!me||!isAdmin())return;
  if(!isSuperAdmin()){
    const granted=_writePerm?.emails||[];
    if(!granted.includes(me.email)){alert('אין לך הרשאת כתיבה כרגע');return;}
  }
  const ed=document.getElementById('composeEditor');
  const editorText=editorToMarkdown(ed).trim();
  const quoteData=ed._quoteData||null;
  const quotePrefix=quoteData
    ? `\u200Bquote:${quoteData.id}\n${quoteData.text.split('\n').map(l=>'> '+l).join('\n')}\n\u200B\n\n`
    : '';
  const text=(quotePrefix+editorText).trim();
  if(!text&&!composeImgUrl&&!composeHtmlCode){alert('הודעה ריקה');return;}
  const now=new Date();
  const entry={
    channel: currentChannelId,
    profile:composeProfile,
    text,
    imgUrl:composeImgUrl,
    videoUrl:composeVidUrl,
    htmlCode:composeHtmlCode,
    sender:me.name,
    senderEmail:me.email,
    time:now.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',hour12:false}),
    date:now.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'/'),
    ts:now.getTime(),
    groupCount:0,
    buttons:composeBtns.map(b=>({text:b.text,url:b.url})),
  };
  const btn=document.getElementById('composeSendBtn');
  btn.innerHTML='<i class="fas fa-spinner fa-spin" style="font-size:12px"></i>';btn.disabled=true;
  try{
    const r=await fetch(BACKEND+'/feed_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(entry)});
    const d=await r.json();
    if(d.status==='ok'){
      const newEntry=d.entry||entry;
      if(!newEntry.id)newEntry.id=entry.id||String(entry.ts);
      if(!knownIds.has(newEntry.id)){
        knownIds.add(newEntry.id);
        items.push(newEntry);
        lastTs=Math.max(lastTs,newEntry.ts||0);
        const inner=document.getElementById('feedInner');
        document.getElementById('empty').style.display='none';
        const div=document.createElement('div');
        div.innerHTML=buildMsg(newEntry);
        inner.appendChild(div.firstChild);
      }
      clearCompose();
      document.getElementById('feedWrap').scrollTop=999999;
    }else{alert('שגיאה בשליחה');}
  }catch(e){alert('שגיאת שרת');}
  btn.innerHTML='<i class="fas fa-paper-plane" style="font-size:14px"></i>';btn.disabled=false;
}

/* ══ ADMIN CHAT (in sidebar) ══ */
const CHAT_COLORS=['#3b82f6','#7c3aed','#059669','#d97706','#dc2626','#db2777'];
const chatCol=s=>CHAT_COLORS[(s||'').charCodeAt(0)%CHAT_COLORS.length];

let _allowedMap={};
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

function toggleChatMinimize(){
  const panel=document.getElementById('adminChatPanel');
  panel.classList.toggle('minimized');
  const isMin=panel.classList.contains('minimized');
  const btn=document.getElementById('chatMinimizeBtn');
  btn.innerHTML=isMin
    ?'<i class="fas fa-expand-alt"></i>'
    :'<i class="fas fa-minus"></i>';
  const adInChat=document.getElementById('adInChat');
  if(adInChat&&_adInChatData){
    adInChat.style.display=isMin?'flex':'none';
  }
}

async function pingChatPresence(){
  if(!me)return;
  try{
    const r=await fetch(BACKEND+'/presence_ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:me.name,picture:me.picture})});
    const d=await r.json();
    document.getElementById('chatPresenceCount').textContent=(d.active||[]).length;
  }catch(e){}
}

function renderChatText(t){
  if(!t)return'';
  let s=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  s=s.replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>');
  s=s.replace(/\_([^_\n]+)\_/g,'<em>$1</em>');
  s=s.replace(/(https?:\/\/[^\s<>"']+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  return s;
}

async function loadAdminChat(){
  if(!isAdmin())return;
  try{
    const r=await fetch(BACKEND+'/chat_messages');
    const d=await r.json();if(d.status!=='success')return;
    const msgs=d.messages||[];
    const sig=msgs.map(m=>m.id+(m.reactions?JSON.stringify(m.reactions):'')).join(',');
    if(sig===chatLastIds)return;
    const hadMsgs=chatLastIds!=='';
    chatLastIds=sig;
    renderAdminChat(msgs);
    if(hadMsgs&&msgs.length){
      const newest=msgs[msgs.length-1];
      if(newest.email!==me?.email)
        sendNotification("צ'אט מנהלים",getDisplayName(newest.email,newest.sender)+': '+(newest.text||'').substring(0,40));
    }
  }catch(e){}
}

function renderAdminChat(msgs){
  const box=document.getElementById('chatMessages');
  if(!box)return;
  const empty=document.getElementById('chatEmptyMsg');
  const atBot=box.scrollHeight-box.scrollTop-box.clientHeight<80;

  if(!msgs.length){
    box.innerHTML='';
    if(empty){empty.style.display='block';box.appendChild(empty);}
    return;
  }
  if(empty)empty.style.display='none';

  box.innerHTML='';
  let lastDate='',lastEmail='',lastMin='';

  msgs.forEach((msg,idx)=>{
    const isMe=msg.email===me?.email;
    const displayName=getDisplayName(msg.email,msg.sender);
    const picture=msg.picture||_allowedMap[(msg.email||'').toLowerCase()]?.picture||'';
    const msgMin=(msg.clientTime||msg.time||'').substring(0,5);
    const sameGroup=lastEmail===msg.email&&msgMin===lastMin;

    const d=msg.date||msg.clientDate||'';
    if(d&&d!==lastDate){
      const sep=document.createElement('div');
      sep.className='chat-date-sep';
      sep.innerHTML=`<span>${d}</span>`;
      box.appendChild(sep);
      lastDate=d;
    }

    const grp=document.createElement('div');
    grp.className='chat-grp'+(isMe?' me':'')+(!sameGroup&&idx>0?' gap':'');

    const avEl=document.createElement('div');
    avEl.className='chat-av';
    avEl.style.background=chatCol(displayName);
    avEl.style.visibility=sameGroup?'hidden':'visible';
    if(picture){
      const img=document.createElement('img');
      img.src=picture;
      img.onerror=()=>{img.style.display='none';avEl.textContent=displayName[0].toUpperCase();};
      avEl.appendChild(img);
    }else{avEl.textContent=displayName[0].toUpperCase();}

    const bubs=document.createElement('div');
    bubs.className='chat-bubs'+(isMe?' me':' other');

    if(!isMe&&!sameGroup){
      const nm=document.createElement('div');
      nm.className='chat-sender';
      nm.style.color=chatCol(displayName);
      nm.textContent=displayName;
      bubs.appendChild(nm);
    }

    const bub=document.createElement('div');
    bub.className='chat-bub '+(isMe?'me':'other');
    bub.dataset.id=msg.id;
    bub.innerHTML=renderChatText(msg.text||'');
    const t=msg.clientTime||msg.time||'';
    if(t){
      const ts=document.createElement('span');
      ts.className='chat-time';
      ts.textContent=' '+t;
      bub.appendChild(ts);
    }
    bub.addEventListener('dblclick',ev=>{ev.preventDefault();showChatCtx(ev,msg,isMe);});
    bubs.appendChild(bub);

    if(isMe){grp.appendChild(bubs);grp.appendChild(avEl);}
    else{grp.appendChild(avEl);grp.appendChild(bubs);}
    box.appendChild(grp);

    lastEmail=msg.email;lastMin=msgMin;
  });

  if(atBot)box.scrollTop=box.scrollHeight;
}

let _ctxMsgId=null;
function showChatCtx(ev,msg,isMe){
  ev.stopPropagation();
  _ctxMsgId=msg.id;
  const menu=document.getElementById('chatCtxMenu');
  const canDel=isMe||isSuperAdmin();
  menu.innerHTML=
    `<div class="ctx-item" onclick="copyChatMsg('${escAttr(msg.id)}')"><i class="fas fa-copy"></i> העתק</div>`+
    (canDel?`<div class="ctx-item danger" onclick="deleteChatMsg('${escAttr(msg.id)}')"><i class="fas fa-trash"></i> מחק</div>`:'');
  menu.classList.add('show');
  let x=ev.clientX,y=ev.clientY;
  menu.style.left=x+'px';menu.style.top=y+'px';
  requestAnimationFrame(()=>{
    const r=menu.getBoundingClientRect();
    if(r.right>window.innerWidth)menu.style.left=(x-r.width)+'px';
    if(r.bottom>window.innerHeight)menu.style.top=(y-r.height)+'px';
  });
}
function hideChatCtx(){document.getElementById('chatCtxMenu').classList.remove('show');}
document.addEventListener('click',e=>{if(!e.target.closest('#chatCtxMenu'))hideChatCtx();});

function copyChatMsg(id){
  const bub=document.querySelector(`.chat-bub[data-id="${id}"]`);
  if(!bub)return;
  const text=bub.innerText.replace(/\s+\d{2}:\d{2}$/,'').trim();
  navigator.clipboard.writeText(text).catch(()=>{});
  hideChatCtx();
}

async function deleteChatMsg(id){
  hideChatCtx();
  if(!confirm('למחוק הודעה זו?'))return;
  try{
    await fetch(BACKEND+'/chat_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,id})});
    chatLastIds='';loadAdminChat();
  }catch(e){}
}

let _chatTypingTimer=null;
function onChatType(){
  if(!me)return;
  fetch(BACKEND+'/typing_ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:getDisplayName(me.email,me.name),email:me.email})}).catch(()=>{});
  clearTimeout(_chatTypingTimer);
  _chatTypingTimer=setTimeout(()=>{
    fetch(BACKEND+'/typing_stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email})}).catch(()=>{});
  },3000);
}

async function pollChatTyping(){
  if(!isAdmin())return;
  try{
    const r=await fetch(BACKEND+'/typing_status');
    const d=await r.json();
    const others=(d.typers||[]).filter(n=>n!==me?.name);
    const bar=document.getElementById('chatTypingBar');
    if(others.length){bar.style.display='block';bar.textContent=others.map(n=>getDisplayName('',n)).join(', ')+' מקלידים...';}
    else{bar.style.display='none';}
  }catch(e){}
}

/* ── CHAT MENTION AUTOCOMPLETE ── */
let _mentionQuery=null,_mentionIdx=0;

function checkChatMention(ta){
  const val=ta.value;
  const pos=ta.selectionStart;
  const before=val.substring(0,pos);
  const atIdx=before.lastIndexOf('@');
  if(atIdx===-1||(atIdx>0&&/\S/.test(before[atIdx-1]))){hideMentionDrop();return;}
  const query=before.substring(atIdx+1).toLowerCase();
  if(query.includes(' ')){hideMentionDrop();return;}
  _mentionQuery={start:atIdx,query};
  const candidates=getChatMentionCandidates(query);
  if(!candidates.length){hideMentionDrop();return;}
  showMentionDrop(candidates);
}

function getChatMentionCandidates(query){
  return Object.entries(_allowedMap)
    .filter(([email,info])=>{
      const name=(info.name||'').toLowerCase();
      return name.includes(query)||email.includes(query);
    })
    .map(([email,info])=>({email,name:info.name||email.split('@')[0],picture:info.picture||''}))
    .slice(0,6);
}

function showMentionDrop(candidates){
  const box=document.getElementById('mentionDropdown');
  if(!box)return;
  _mentionIdx=0;
  const COLORS=['#3b82f6','#7c3aed','#059669','#d97706','#dc2626','#db2777'];
  const col=s=>COLORS[(s||'').charCodeAt(0)%COLORS.length];
  box.innerHTML=candidates.map((u,i)=>{
    const av=u.picture
      ?`<div class="mention-av"><img src="${u.picture}" onerror="this.style.display='none'"></div>`
      :`<div class="mention-av" style="background:${col(u.name)}">${(u.name[0]||'?').toUpperCase()}</div>`;
    return `<div class="mention-item${i===0?' active':''}" onclick="insertChatMention('${u.name.replace(/'/,"\'")}')">
      ${av}<span>${u.name}</span>
    </div>`;
  }).join('');
  box.classList.add('show');
}

function hideMentionDrop(){
  const box=document.getElementById('mentionDropdown');
  if(box){box.classList.remove('show');box.innerHTML='';}
  _mentionQuery=null;_mentionIdx=0;
}

function insertChatMention(name){
  const ta=document.getElementById('chatInput');
  if(!ta||!_mentionQuery)return;
  const val=ta.value;
  const before=val.substring(0,_mentionQuery.start);
  const after=val.substring(_mentionQuery.start+1+_mentionQuery.query.length);
  ta.value=before+'@'+name+' '+after;
  ta.selectionStart=ta.selectionEnd=before.length+name.length+2;
  hideMentionDrop();
  ta.focus();
}

function handleChatInputKey(e){
  const box=document.getElementById('mentionDropdown');
  const items=box?box.querySelectorAll('.mention-item'):[];
  if(box&&box.classList.contains('show')&&items.length){
    if(e.key==='ArrowDown'){e.preventDefault();_mentionIdx=Math.min(_mentionIdx+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('active',i===_mentionIdx));return;}
    if(e.key==='ArrowUp'){e.preventDefault();_mentionIdx=Math.max(_mentionIdx-1,0);items.forEach((el,i)=>el.classList.toggle('active',i===_mentionIdx));return;}
    if(e.key==='Enter'||e.key==='Tab'){
      e.preventDefault();
      const active=items[_mentionIdx];
      if(active)active.click();
      return;
    }
    if(e.key==='Escape'){hideMentionDrop();return;}
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMsg();}
}

async function sendChatMsg(){
  const inp=document.getElementById('chatInput');
  const text=inp.value.trim();if(!text||!me)return;
  const now=new Date();
  const clientTime=now.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',hour12:false});
  const clientDate=now.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'/');
  inp.value='';inp.style.height='auto';
  clearTimeout(_chatTypingTimer);
  fetch(BACKEND+'/typing_stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email})}).catch(()=>{});
  try{
    await fetch(BACKEND+'/chat_send',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sender:getDisplayName(me.email,me.name),text,picture:me.picture,email:me.email,clientTime,clientDate,clientTs:now.getTime()})});
    chatLastIds='';loadAdminChat();
  }catch(e){}
}

/* ══ ADMIN MESSAGES MODAL ══ */
async function openManageAdmins(){
  if(!isSuperAdmin())return;
  document.getElementById('manageAdminsModal').style.display='flex';
  await refreshAdminsList();
}
function closeManageAdmins(){document.getElementById('manageAdminsModal').style.display='none';}

async function refreshAdminsList(){
  try{
    const r=await fetch(BACKEND+'/allowed_list');
    const d=await r.json();
    const list=document.getElementById('adminsList');
    const entries=d.emails||[];
    if(!entries.length){list.innerHTML='<div style="text-align:center;color:#aaa;font-size:13px;padding:20px;">אין מנהלים נוספים</div>';return;}
    list.innerHTML=entries.map(e=>{
      const email=typeof e==='string'?e:e.email;
      const name=typeof e==='object'?(e.name||email):email;
      const pic=typeof e==='object'?(e.picture||''):'';
      const av=pic
        ?`<img src="${escAttr(pic)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;border:2px solid #e5e7eb;" onerror="this.style.display='none'">`
        :`<div style="width:32px;height:32px;border-radius:50%;background:#1a56db;color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;">${esc((name||'?')[0].toUpperCase())}</div>`;
      return `<div style="display:flex;align-items:center;gap:10px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:9px 12px;">
        ${av}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(name)}</div>
          <div style="font-size:11px;color:#9ca3af;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(email)}</div>
        </div>
        <button onclick="removeAdmin('${escAttr(email)}')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:4px 10px;font-size:11px;color:#dc2626;cursor:pointer;font-weight:700;font-family:'Heebo',sans-serif;flex-shrink:0;">הסר</button>
      </div>`;
    }).join('');
  }catch(e){}
}

async function addAdmin(){
  const email=document.getElementById('newAdminEmail').value.trim().toLowerCase();
  const name=document.getElementById('newAdminName').value.trim();
  if(!email||!email.includes('@')){showAdminMsgResult('אימייל לא תקין','red');return;}
  if(!name){showAdminMsgResult('יש להזין שם','red');return;}
  try{
    const r=await fetch(BACKEND+'/allowed_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({admin_email:me.email,email,name,picture:''})});
    const d=await r.json();
    if(d.status==='success'){
      document.getElementById('newAdminEmail').value=''; document.getElementById('newAdminName').value='';
      showAdminMsgResult('נוסף ✓','green'); await refreshAdminsList(); await loadAllowedMap();
    }else{showAdminMsgResult(d.msg||'שגיאה','red');}
  }catch(e){showAdminMsgResult('שגיאת שרת','red');}
}

async function removeAdmin(email){
  if(!confirm('להסיר את '+email+'?'))return;
  try{
    await fetch(BACKEND+'/allowed_remove',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({admin_email:me.email,email})});
    await refreshAdminsList();
    await loadAllowedMap();
    showAdminMsgResult('הוסר ✓','green');
  }catch(e){}
}

function showAdminMsgResult(txt,color){
  const el=document.getElementById('adminMsgResult');
  el.textContent=txt;el.style.color=color==='green'?'#16a34a':'#dc2626';
  el.style.display='block';setTimeout(()=>el.style.display='none',2500);
}

function openAdminMsgs(){
  if(!isAdmin())return;
  document.getElementById('adminMsgsModal').classList.add('open');
  if(adminMsgsLastId){
    localStorage.setItem('admin_msgs_seen', adminMsgsLastId);
    adminMsgsUnread=0;
    updateAdminMsgsBadge();
  }
  loadAdminMsgs();
}
function closeAdminMsgs(){document.getElementById('adminMsgsModal').classList.remove('open');}

async function loadAdminMsgs(){
  try{
    const r=await fetch(BACKEND+'/admin_list');
    const d=await r.json();
    const msgs=d.messages||[];
    renderAdminMsgs(msgs);
    checkAdminMsgsNew(msgs);
  }catch(e){}
}

function checkAdminMsgsNew(msgs){
  const lastSeen=localStorage.getItem('admin_msgs_seen')||'';
  if(!msgs.length){
    adminMsgsLastId='';
    adminMsgsUnread=0;
    updateAdminMsgsBadge();
    return;
  }
  const topId=String(msgs[0].id);
  if(adminMsgsLastId!==null && adminMsgsLastId!=='' && topId!==adminMsgsLastId){
    const newest=msgs[0];
    if(String(newest.email)!==String(me?.email)){
      sendNotification('📢 הודעת מנהל חדשה', newest.sender+': '+(newest.text||'').substring(0,50));
    }
  }
  const unread=msgs.filter(m=>String(m.id)>String(lastSeen) && String(m.email)!==String(me?.email)).length;
  adminMsgsUnread=unread;
  updateAdminMsgsBadge();
  if(adminMsgsLastId===null) adminMsgsLastId=topId;
  else adminMsgsLastId=topId;
}

function updateAdminMsgsBadge(){
  const badge=document.getElementById('adminMsgsBadge');
  if(!badge)return;
  badge.classList.toggle('show', adminMsgsUnread>0);
}

function markAdminMsgsRead(){
  if(!adminMsgsLastId)return;
  localStorage.setItem('admin_msgs_seen', adminMsgsLastId);
  adminMsgsUnread=0;
  updateAdminMsgsBadge();
  loadAdminMsgs();
}

const ADMIN_MSG_COLORS=['#3b82f6','#7c3aed','#059669','#d97706','#dc2626','#db2777'];
const aMsgCol=s=>ADMIN_MSG_COLORS[(s||'').charCodeAt(0)%ADMIN_MSG_COLORS.length];

function renderAdminMsgs(msgs){
  const c=document.getElementById('adminMsgsBody');if(!c)return;
  if(!msgs.length){c.innerHTML='<div style="text-align:center;padding:30px;color:#aaa;font-size:13px;">אין הודעות</div>';return;}
  const lastSeen=localStorage.getItem('admin_msgs_seen')||'';
  c.innerHTML=msgs.map(m=>{
    const unread=String(m.id)>String(lastSeen)&&m.email!==me?.email;
    const av=m.picture?`<img src="${escAttr(m.picture)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:`<span>${(m.sender||'?')[0].toUpperCase()}</span>`;
    return `<div class="admin-msg-item${unread?' unread':''}">
      <div class="admin-msg-sender-row">
        <div class="admin-msg-av" style="background:${aMsgCol(m.sender)}">${av}</div>
        <span class="admin-msg-name">${esc(m.sender)}</span>
        <span class="admin-msg-time">${esc(m.time||'')}</span>
        ${unread?'<span style="background:#eff6ff;color:#1a56db;font-size:9px;font-weight:800;padding:1px 7px;border-radius:99px;border:1px solid #bfdbfe;">חדש</span>':''}
        ${isSuperAdmin()?`<button onclick="deleteAdminMsg('${escAttr(String(m.id))}')" style="background:#fef2f2;border:1px solid #fecaca;border-radius:7px;padding:2px 8px;font-size:10px;color:#dc2626;cursor:pointer;font-family:'Heebo',sans-serif;font-weight:700;margin-right:auto"><i class="fas fa-trash"></i></button>`:''}
      </div>
      <div class="admin-msg-text">${esc(m.text)}</div>
    </div>`;
  }).join('');
}

async function sendAdminMsg(){
  const inp=document.getElementById('adminMsgInput');
  const text=inp.value.trim();if(!text||!me||!isSuperAdmin())return;
  try{
    await fetch(BACKEND+'/admin_send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,sender:me.name,picture:me.picture,email:me.email})});
    inp.value='';inp.style.height='auto';
    loadAdminMsgs();
  }catch(e){alert('שגיאה בשליחה');}
}

async function deleteAdminMsg(id){
  if(!confirm('למחוק?'))return;
  try{
    await fetch(BACKEND+'/admin_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,email:me.email})});
    loadAdminMsgs();
  }catch(e){}
}

/* ── AD SYSTEM ── */
const AD_KEY='shaagat_ad';const AD_INTERVAL=60*60*1000;

async function loadAd(){
  try{
    const r=await fetch(BACKEND+'/ad_get');const d=await r.json();
    if(d.side&&(d.side.imageUrl||d.side.htmlUrl||d.side.htmlCode)){showAdSide(d.side);}else{hideAdSide();}
    if(d.popup&&(d.popup.imageUrl||d.popup.htmlUrl||d.popup.htmlCode)&&shouldShowAd()){showAdPopup(d.popup);}
  }catch(e){}
}

function shouldShowAd(){const last=parseInt(localStorage.getItem(AD_KEY)||'0');return Date.now()-last>AD_INTERVAL;}
function markAdShown(){localStorage.setItem(AD_KEY,String(Date.now()));}

let _adInChatData=null;
function showAdSide(ad){
  const img=document.getElementById('adSidebarImg');
  const link=document.getElementById('adSidebarLink');
  const frame=document.getElementById('adSidebarFrame');
  if(ad.htmlCode||ad.htmlUrl){
    if(img)img.style.display='none';
    if(link)link.style.display='none';
    if(frame){
      if(ad.htmlCode){frame.srcdoc=ad.htmlCode;}
      else if(ad.htmlUrl){frame.src=ad.htmlUrl;}
      frame.style.display='block';
    }
  } else {
    if(frame){frame.style.display='none';frame.src='';}
    if(img){img.src=ad.imageUrl||'';img.style.display='block';}
    if(link)link.href=ad.linkUrl||'#';
  }

  if(isAdmin()){
    const adInChat=document.getElementById('adInChat');
    const adFrame=document.getElementById('adInChatFrame');
    const adImg=document.getElementById('adInChatImg');
    const adLink=document.getElementById('adInChatLink');
    if(adInChat){
      if(ad.htmlCode||ad.htmlUrl){
        if(adFrame){
          if(ad.htmlCode)adFrame.srcdoc=ad.htmlCode;
          else adFrame.src=ad.htmlUrl;
          adFrame.style.display='block';
        }
        if(adLink)adLink.style.display='none';
      } else {
        if(adFrame)adFrame.style.display='none';
        if(adImg){adImg.src=ad.imageUrl||'';adImg.style.display='block';}
        if(adLink)adLink.style.display='block';
        if(adLink)adLink.href=ad.linkUrl||'#';
      }
      _adInChatData=ad;
    }
  } else {
    if(window.innerWidth>900){
      document.getElementById('adOnlySidebar').style.display='block';
    }
  }
}

function hideAdSide(){
  document.getElementById('adOnlySidebar').style.display='none';
  const adInChat=document.getElementById('adInChat');
  if(adInChat)adInChat.style.display='none';
  _adInChatData=null;
}

function showAdPopup(ad){
  const existing=document.getElementById('adOverlay');if(existing)return;
  const overlay=document.createElement('div');overlay.id='adOverlay';
  overlay.style.cssText='position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  const inner=document.createElement('div');
  inner.style.cssText='position:relative;max-width:420px;width:90%;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)';
  
  let timerVal = parseInt(ad.timer||0);
  if(timerVal > 5) timerVal = 5;
  
  const closeBtn=`<button id="adCloseBtn" onclick="closeAd()" style="position:absolute;top:10px;right:10px;z-index:2;background:rgba(0,0,0,.5);border:none;border-radius:50%;width:32px;height:32px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:Heebo,sans-serif" ${timerVal>0?'disabled':''}>${timerVal>0?timerVal:'✕'}</button>`;
  
  if(ad.htmlCode||ad.htmlUrl){
    inner.innerHTML=closeBtn;
    const frame=document.createElement('iframe');
    if(ad.htmlCode){
      frame.srcdoc=ad.htmlCode;
    } else {
      frame.src=ad.htmlUrl;
    }
    frame.style.cssText='width:100%;height:70vh;border:none;display:block;';
    frame.setAttribute('sandbox','allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation');
    inner.appendChild(frame);
  } else {
    inner.innerHTML=closeBtn+`<a href="${escAttr(ad.linkUrl||'#')}" target="_blank" rel="noopener noreferrer" onclick="closeAd()"><img src="${escAttr(ad.imageUrl)}" style="width:100%;display:block;max-height:70vh;object-fit:contain;background:#000"></a>`;
  }
  overlay.appendChild(inner);
  document.body.appendChild(overlay);markAdShown();
  
  if(timerVal > 0){
    let t = timerVal;
    let intv = setInterval(()=>{
        t--;
        let b = document.getElementById('adCloseBtn');
        if(b) {
            if(t<=0){ b.disabled=false; b.innerText='✕'; clearInterval(intv); }
            else { b.innerText = t; }
        } else { clearInterval(intv); }
    }, 1000);
  }
}

function closeAd(){document.getElementById('adOverlay')?.remove();}

async function openAdPanel(){
  const modal=document.getElementById('adModal');modal.style.display='flex';
  try{
    const r=await fetch(BACKEND+'/ad_get');const d=await r.json();
    if(d.popup){
        document.getElementById('adPopupImageUrl').value=d.popup.imageUrl||'';
        document.getElementById('adPopupLinkUrl').value=d.popup.linkUrl||'';
        if(document.getElementById('adPopupHtmlUrl'))document.getElementById('adPopupHtmlUrl').value=d.popup.htmlCode||'';
        if(document.getElementById('adPopupTimer'))document.getElementById('adPopupTimer').value=d.popup.timer||0;
    }
    if(d.side){document.getElementById('adSideImageUrl').value=d.side.imageUrl||'';document.getElementById('adSideLinkUrl').value=d.side.linkUrl||'';if(document.getElementById('adSideHtmlUrl'))document.getElementById('adSideHtmlUrl').value=d.side.htmlCode||'';}
  }catch(e){}
}
function closeAdPanel(){document.getElementById('adModal').style.display='none';}

async function saveAd(type){
  const imgEl=type==='popup'?'adPopupImageUrl':'adSideImageUrl';
  const lnkEl=type==='popup'?'adPopupLinkUrl':'adSideLinkUrl';
  const htmlEl=type==='popup'?'adPopupHtmlUrl':'adSideHtmlUrl';
  const imageUrl=document.getElementById(imgEl).value.trim();
  const linkUrl=document.getElementById(lnkEl).value.trim();
  const htmlCode=document.getElementById(htmlEl)?.value.trim()||'';
  let timer = 0;
  if(type==='popup'){
      timer = parseInt(document.getElementById('adPopupTimer').value||0);
      if(timer < 0) timer = 0; if(timer > 5) timer = 5;
  }
  
  if(!imageUrl&&!htmlCode){showAdMsg('יש להזין תמונה או קוד HTML','red');return;}
  try{
    const r=await fetch(BACKEND+'/ad_set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,imageUrl,linkUrl,htmlCode,displayType:type, timer:timer})});
    const d=await r.json();if(d.status==='ok'){showAdMsg('נשמר ✓','green');loadAd();}else showAdMsg(d.msg||'שגיאה','red');
  }catch(e){showAdMsg('שגיאת שרת','red');}
}

async function deleteAd(type){
  const imgEl=type==='popup'?'adPopupImageUrl':'adSideImageUrl';
  const lnkEl=type==='popup'?'adPopupLinkUrl':'adSideLinkUrl';
  try{
    await fetch(BACKEND+'/ad_set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,imageUrl:'',linkUrl:'',displayType:type, timer:0})});
    document.getElementById(imgEl).value='';document.getElementById(lnkEl).value='';
    if(type==='side')hideAdSide();showAdMsg('הוסרה ✓','green');
  }catch(e){}
}

function showAdMsg(txt,color){
  const el=document.getElementById('adMsg');el.textContent=txt;el.style.color=color==='green'?'#16a34a':'#dc2626';el.style.display='block';
  setTimeout(()=>el.style.display='none',2000);
}

/* ── DARK MODE ── */
function toggleDark(){const on=document.body.classList.toggle('dark');document.getElementById('darkBtn').classList.toggle('active',on);localStorage.setItem('shaagat_dark',on?'1':'0');}
function initDark(){if(localStorage.getItem('shaagat_dark')==='1'){document.body.classList.add('dark');document.getElementById('darkBtn')?.classList.add('active');}}

/* ── NOTIFICATIONS ── */
let notificationsOn=false;
async function toggleNotifications(){
  if(!('Notification'in window)){alert('הדפדפן שלך לא תומך בהתראות');return;}
  if(notificationsOn){notificationsOn=false;document.getElementById('notifBtn').classList.remove('active');localStorage.setItem('shaagat_notif','0');return;}
  const perm=await Notification.requestPermission();
  if(perm==='granted'){notificationsOn=true;document.getElementById('notifBtn').classList.add('active');localStorage.setItem('shaagat_notif','1');new Notification('בינה ודעה',{body:'התראות מופעלות ✓',icon:LOGO});}
}
function initNotifications(){if(localStorage.getItem('shaagat_notif')==='1'&&Notification.permission==='granted'){notificationsOn=true;document.getElementById('notifBtn')?.classList.add('active');}}
function sendNotification(title,body){
  if(!notificationsOn||Notification.permission!=='granted')return;
  if(document.visibilityState==='visible')return;
  new Notification(title||'בינה ודעה',{body:body||'הודעה חדשה',icon:LOGO});
}

/* ── SEARCH ── */
let searchTimer=null;
function toggleSearch(){
  const bar=document.getElementById('searchBar');const btn=document.getElementById('searchBtn');
  const isOpen=bar.classList.contains('open');
  if(isOpen){clearSearch();}else{bar.classList.add('open');btn.classList.add('active');setTimeout(()=>document.getElementById('searchInput').focus(),280);}
}
function onSearch(val){
  const clear=document.getElementById('searchClear');clear.classList.toggle('show',val.length>0);
  clearTimeout(searchTimer);
  if(!val.trim()){document.getElementById('searchResults').style.display='none';document.getElementById('feedWrap').style.display='';return;}
  searchTimer=setTimeout(()=>doSearch(val.trim()),250);
}
async function doSearch(q){
  const qLow=q.toLowerCase();
  document.getElementById('feedWrap').style.display='none';
  document.getElementById('searchResults').style.display='block';
  const inner=document.getElementById('searchResultsInner');
  const empty=document.getElementById('searchEmpty');
  inner.innerHTML='<div style="text-align:center;padding:30px;color:#aaa;font-size:13px;"><i class="fas fa-spinner fa-spin"></i> מחפש...</div>';
  empty.style.display='none';
  let allItems=[];let before=0;
  for(let page=0;page<30;page++){
    try{
      const url=before?BACKEND+`/feed?channel=${currentChannelId}&before=${before}&limit=50`:BACKEND+`/feed?channel=${currentChannelId}&limit=50`;
      const r=await fetch(url);const d=await r.json();
      if(d.status!=='ok'||!d.feed.length)break;
      allItems.push(...d.feed);
      if(d.feed.length<50)break;
      before=Math.min(...d.feed.map(e=>e.ts||Infinity));
    }catch(e){break;}
  }
  allItems.reverse();
  const results=allItems.filter(e=>(e.text||'').toLowerCase().includes(qLow));
  if(!results.length){inner.innerHTML='';empty.style.display='block';return;}
  const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  inner.innerHTML=results.map(e=>
    buildMsg(e).replace(new RegExp(`(${escaped})`,'gi'),'<mark style="background:#fff176;border-radius:3px;padding:0 1px">$1</mark>')
  ).join('');
  results.forEach(e=>{if(rxnCache[e.id])renderRxn(e.id,rxnCache[e.id]);});
}
function clearSearch(){
  document.getElementById('searchInput').value='';document.getElementById('searchClear').classList.remove('show');
  document.getElementById('searchResults').style.display='none';document.getElementById('searchResultsInner').innerHTML='';
  document.getElementById('searchEmpty').style.display='none';document.getElementById('feedWrap').style.display='';
  document.getElementById('searchBar').classList.remove('open');document.getElementById('searchBtn').classList.remove('active');
}

/* ── LIGHTBOX ── */
function openLightbox(src){if(!src||!src.match(/^https?:\/\//))return;document.getElementById('lbImg').src=src;document.getElementById('lightbox').classList.add('show');document.body.style.overflow='hidden';}
function closeLightbox(){document.getElementById('lightbox').classList.remove('show');document.getElementById('lbImg').src='';document.body.style.overflow='';}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeLightbox();closeAdminMsgs();}});

/* ══ EDIT MSG ══ */
let _editMsgId=null;

function openEditMsg(id){
  if(!isAdmin())return;
  const e=items.find(i=>i.id===id);
  if(!e)return;
  _editMsgId=id;
  const ed=document.getElementById('composeEditor');
  ed.innerText=e.text||'';
  composeImgUrl=e.imgUrl||'';
  composeVidUrl=e.videoUrl||'';
  composeHtmlCode=e.htmlCode||'';
  composeBtns=(e.buttons||[]).map(b=>({text:b.text,url:b.url}));
  if(composeImgUrl){
    document.getElementById('composeImgUrl').value=composeImgUrl;
    const th=document.getElementById('composeImgThumb');
    if(th){document.getElementById('composeImgThumbImg').src=composeImgUrl;th.style.display='flex';}
  }
  if(composeVidUrl)document.getElementById('composeVidUrl').value=composeVidUrl;
  updateAttachPreview();
  document.getElementById('composeSendBtn').style.display='none';
  document.getElementById('composeEditConfirmBtn').style.display='flex';
  document.getElementById('composeEditCancelBtn').style.display='flex';
  document.getElementById('composeEditBanner').classList.add('show');
  document.getElementById('adminComposeBar').scrollIntoView({behavior:'smooth',block:'end'});
  setTimeout(()=>{ed.focus();const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r);},200);
}

function cancelEditMode(){
  _editMsgId=null;
  clearCompose();
  document.getElementById('composeSendBtn').style.display='flex';
  document.getElementById('composeEditConfirmBtn').style.display='none';
  document.getElementById('composeEditCancelBtn').style.display='none';
  document.getElementById('composeEditBanner').classList.remove('show');
}

function closeEditMsg(){cancelEditMode();}

async function saveEditMsg(){
  if(!_editMsgId||!me)return;
  const ed=document.getElementById('composeEditor');
  const editorText=editorToMarkdown(ed).trim();
  if(!editorText&&!composeImgUrl&&!composeHtmlCode){alert('ההודעה לא יכולה להיות ריקה');return;}
  const btn=document.getElementById('composeEditConfirmBtn');
  btn.innerHTML='<i class="fas fa-spinner fa-spin" style="font-size:12px"></i>';btn.disabled=true;
  try{
    const r=await fetch(BACKEND+'/feed_edit',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        email:me.email,id:_editMsgId,
        text:editorText,
        imgUrl:composeImgUrl,
        videoUrl:composeVidUrl,
        htmlCode:composeHtmlCode,
        buttons:composeBtns.map(b=>({text:b.text,url:b.url}))
      })});
    const d=await r.json();
    if(d.status==='ok'){
      cancelEditMode();
      const entry=d.entry;
      if(entry){
        const idx=items.findIndex(i=>i.id===entry.id);
        if(idx>=0)items[idx]=entry;
        const row=document.querySelector(`.msg-row[data-id="${entry.id}"]`);
        if(row){
          const newDiv=document.createElement('div');
          newDiv.innerHTML=buildMsg(entry);
          row.replaceWith(newDiv.firstChild);
        }
      }
    }else{alert(d.msg||'שגיאה בשמירה');}
  }catch(e){alert('שגיאת רשת');}
  finally{btn.innerHTML='<i class="fas fa-check" style="font-size:14px"></i>';btn.disabled=false;}
}

/* SITE SETTINGS (CONNECTED TO BACKEND) */
async function fetchSiteSettings() {
    try {
        const r = await fetch(BACKEND + '/api/settings');
        if(r.ok) {
            siteGlobalSettings = await r.json();
            initGlobalSettings();
            if(isAdmin()) renderBlockedUsers();
        }
    } catch(e) {}
}

window.addEventListener('load', fetchSiteSettings);

function openSiteSettings(){
    document.getElementById('siteSettingsModal').classList.add('open');
    document.getElementById('settingsSiteTitle').value = siteGlobalSettings.title || "בינה ודעה";
    renderBlockedUsers();
    loadPageStats();
}
function closeSiteSettings(){ document.getElementById('siteSettingsModal').classList.remove('open'); }

async function saveSiteTitle(){
    const val = document.getElementById('settingsSiteTitle').value.trim();
    if(!val) return;
    siteGlobalSettings.title = val;
    initGlobalSettings();
    if(isSuperAdmin()) {
        await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, title:val})});
        alert('שם האתר עודכן בשרת!');
    }
}

async function blockUser(){
    const email = document.getElementById('settingsBlockEmail').value.trim().toLowerCase();
    if(!email) return;
    if(!siteGlobalSettings.blockedEmails) siteGlobalSettings.blockedEmails = [];
    if(!siteGlobalSettings.blockedEmails.includes(email)){
        siteGlobalSettings.blockedEmails.push(email);
        renderBlockedUsers();
        document.getElementById('settingsBlockEmail').value = '';
        if(isSuperAdmin()) {
            await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, blockedEmails:siteGlobalSettings.blockedEmails})});
            alert('המשתמש נחסם!');
        }
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

function loadPageStats(){
    const view = document.getElementById('pageStatsView');
    if(!view) return;
    view.innerHTML = `
        <strong>סטטיסטיקות ערוץ "${currentChannelId}":</strong><br>
        סך הודעות שנטענו: ${items.length}<br>
        משתמשים פעילים כרגע: ${document.getElementById('chatPresenceCount')?.innerText || 0}<br>
    `;
}

async function pollOpenComments(){
  if(!activeCmtMsgId)return;
  try{
    const r=await fetch(BACKEND+'/feed_comments?msgId='+encodeURIComponent(activeCmtMsgId));
    const d=await r.json();const list=d.comments||[];
    if(list.length===(cmtCount[activeCmtMsgId]||0))return;
    cmtCount[activeCmtMsgId]=list.length;updateCmtBtn(activeCmtMsgId,list.length);
    const b=document.getElementById('cpBody');const wasAtBottom=(b.scrollHeight-b.scrollTop-b.clientHeight)<60;
    b.innerHTML=list.length?list.map(c=>buildCmt(activeCmtMsgId,c)).join(''):'<div class="no-cmt">עדיין אין תגובות</div>';
    if(wasAtBottom)b.scrollTop=b.scrollHeight;
  }catch(e){}
}

setInterval(pollAll,3000);
setInterval(pollOpenComments,3000);
setTimeout(pollAll,800);
