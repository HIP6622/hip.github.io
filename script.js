window._cardData = {};
const BACKEND = "https://hiphop.pythonanywhere.com";
const GOOGLE_CLIENT_ID = '548333676754-ohvlnp1nfjpc1jnbkdfmr9hpccaj508i.apps.googleusercontent.com';
const LOGO = 'https://i.ibb.co/KjBNwmPt/image.png';
const ADMIN_EMAIL = 'hip@hamakom.ovh';
const SUPER_ADMINS = ['hip@hamakom.ovh', '0548537646a@gmail.com'];
const STORAGE_KEY = 'bina_user';
const AD_KEY = 'shaagat_ad';
const AD_INTERVAL = 60 * 60 * 1000;

const MAX_COMMENT_LEN = 500;
const MAX_EMOJI_LEN = 8;

let me = null, items = [], lastTs = 0, newCount = 0, atBottom = true;
let activePicker = null, activeCmtMsgId = null;
let rxnCache = {}, cmtCount = {};
const knownIds = new Set();
let pollPending = false, oldestTs = 0, allLoaded = false, loadingMore = false;

let composeProfile = 'news', composeImgUrl = '', composeVidUrl = '', composeBtns = [], composeHtmlCode = '';
let chatLastIds = '', chatTypingTimer = null, adminMsgsLastId = null, adminMsgsUnread = 0;
let _allowedMap = {}, _adInChatData = null;
let _updateMode=false, _updateUntil='';

let siteGlobalSettings = { title: "בינה ודעה", blockedEmails: [], commentsEnabled: true };

/* ── SETTINGS & INITIALIZATION ── */
async function fetchSiteSettings() {
    try {
        const r = await fetch(BACKEND + '/api/settings?t=' + Date.now());
        const contentType = r.headers.get("content-type");
        if (r.ok && contentType && contentType.includes("application/json")) {
            siteGlobalSettings = await r.json();
        } else {
            siteGlobalSettings = { title: "בינה ודעה", commentsEnabled: true, blockedEmails: [] };
        }
        if (siteGlobalSettings.commentsEnabled === undefined) siteGlobalSettings.commentsEnabled = true;
        if (typeof initGlobalSettings === "function") initGlobalSettings();
    } catch (e) {
        siteGlobalSettings = { title: "בינה ודעה", commentsEnabled: true, blockedEmails: [] };
        if (typeof initGlobalSettings === "function") initGlobalSettings();
    }
}
window.addEventListener('load', fetchSiteSettings);

function initGlobalSettings() {
    const pageTitle = document.getElementById('pageTitle');
    if(pageTitle) pageTitle.innerText = siteGlobalSettings.title;
    const hdr = document.getElementById('hdrChannelName');
    if (hdr) hdr.innerHTML = `${esc(siteGlobalSettings.title)} - <span style="color:#1a56db">${CHANNELS.find(c=>c.id===currentChannelId)?.name||'כללי'}</span>`;
    const logT = document.getElementById('loginSiteTitle'); 
    if(logT) logT.innerText = siteGlobalSettings.title;
}

let currentChannelId = 'general';
let CHANNELS = [
  { id: 'general', name: 'הערוץ הרשמי', icon: 'fa-star' },
  { id: 'news', name: 'חדשות ועדכוני AI', icon: 'fa-newspaper' },
  { id: 'system', name: 'עדכוני מערכת', icon: 'fa-bullhorn' },
  { id: 'misc', name: 'שונות (בדיחות ותכני AI)', icon: 'fa-smile-beam' }
];

function renderChannels() {
  const list = document.getElementById('channelsList'); if(!list) return;
  
  // נשמור את רשימת היוצרים בצד כדי שלא תימחק כשאנחנו בונים את התפריט
  const cl = document.getElementById('creatorsList');
  const isFolderOpen = document.getElementById('creatorsFolderContent')?.style.display === 'block';

  let html = '';
  CHANNELS.forEach((ch, index) => {
    html += `<div class="channel-item ${ch.id === currentChannelId ? 'active' : ''}" onclick="switchChannel('${ch.id}', '${ch.name}')"><i class="fas ${ch.icon}"></i> ${ch.name}</div>`;
    
    // הכנסת תיקיית "לפי יוצרים" מיד אחרי "הערוץ הרשמי" (שזה אינדקס 0)
    if (index === 0) {
      html += `
        <div class="channel-item" onclick="toggleCreatorsFolder()" style="justify-content: space-between; background:#f9fafb; border-bottom:1px solid #f0f0f0;">
          <div><i class="fas fa-folder" style="color:#ca8a04;"></i> לפי יוצרים</div>
          <i class="fas fa-chevron-${isFolderOpen ? 'up' : 'down'}" id="creatorsFolderIcon" style="font-size:10px; color:#aaa;"></i>
        </div>
        <div id="creatorsFolderContent" style="display:${isFolderOpen ? 'block' : 'none'}; background:#fafafa; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);"></div>
      `;
    }
  });
  list.innerHTML = html;
  
  // הכנסת היוצרים לתוך התיקייה הנפתחת
  if (cl) document.getElementById('creatorsFolderContent').appendChild(cl);
  // העלמת הכותרת הישנה של היוצרים מקרקעית התפריט
  const oldHdr = document.querySelector('.creators-hdr');
  if (oldHdr) oldHdr.style.display = 'none';

  const currentName = CHANNELS.find(c=>c.id===currentChannelId)?.name || 'כללי';
  const hdrName = document.getElementById('hdrChannelName');
  if (hdrName) hdrName.innerHTML = `${esc(siteGlobalSettings.title)} - <span style="color:#1a56db">${currentName}</span>`;
}

function toggleCreatorsFolder() {
  const content = document.getElementById('creatorsFolderContent');
  const icon = document.getElementById('creatorsFolderIcon');
  if (!content) return;
  if (content.style.display === 'none') {
    content.style.display = 'block';
    icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
  } else {
    content.style.display = 'none';
    icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
  }
}

async function switchChannel(channelId, channelName) {
  if (currentChannelId === channelId) return;
  currentChannelId = channelId; renderChannels();
  if(window.innerWidth <= 900) document.getElementById('leftSidebar').classList.remove('open');
  items = []; lastTs = 0; knownIds.clear(); oldestTs = 0; allLoaded = false;
  document.getElementById('feedInner').innerHTML = ''; document.getElementById('empty').style.display = 'block';
  applyWritePerm(); 
  await loadFeed();
}

function toggleLeftSidebar() { document.getElementById('leftSidebar').classList.toggle('open'); }
const REACT_SVG = `<svg viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.65"/><circle cx="8.5" cy="9.5" r="1.1" fill="currentColor"/><circle cx="13.5" cy="9.5" r="1.1" fill="currentColor"/><path d="M8 13.2c.65 1.5 2 2.2 3 2.2s2.35-.72 3-2.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;

function esc(t){return (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function escAttr(t){return esc(t).replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

function isSuperAdmin(){return SUPER_ADMINS.includes(me?.email?.toLowerCase());}

function getRole() {
    if(!me) return 'visitor';
    if(isSuperAdmin()) return 'super';
    // אם האימייל מופיע ברשימה, הוא מקבל מיד הרשאת כותב
    if(_allowedMap[me.email.toLowerCase()]) return 'writer';
    return 'user';
}

function isAdmin(){
    const role = getRole();
    return role === 'super' || role === 'writer';
}

async function checkAllowedAdmin(){
  if(!me)return;
  await loadAllowedMap();
  
  if(isAdmin()) {
      document.getElementById('rightSidebar').classList.add('show');
      document.getElementById('adminChatPanel').classList.add('show');
      
      if(typeof loadAdminChat === 'function') { loadAdminChat(); setInterval(loadAdminChat, 2500); setInterval(pollChatTyping, 2500); }
      if(typeof loadAdminMsgs === 'function') { loadAdminMsgs(); setInterval(loadAdminMsgs, 5000); }
      if(typeof pingChatPresence === 'function') { pingChatPresence(); setInterval(pingChatPresence, 15000); }
      
      pollUpdateMode(); setInterval(pollUpdateMode, 5000);
      document.getElementById('feedWrap').style.paddingBottom='120px';
  }
  
  const displayName = _allowedMap[me.email.toLowerCase()]?.name || me.name;
  const composerNameBadge = document.getElementById('composerNameBadge');
  if(composerNameBadge) composerNameBadge.innerText = 'כותב בתור: ' + displayName;
  
  applyWritePerm();
}

function applyWritePerm(){
  const bar = document.getElementById('adminComposeBar');
  const notice = document.getElementById('blockNotice');
  if(!bar) return;
  
  const role = getRole();

  if (role === 'super' || role === 'writer') {
      bar.classList.add('show');
      bar.classList.remove('blocked');
      if(notice) notice.classList.remove('show');
  } else {
      bar.classList.remove('show');
  }
}

async function loadAllowedMap(){
  try{
    const r=await fetch(BACKEND+'/allowed_list?t=' + Date.now());
    const d=await r.json();
    _allowedMap={};
    (d.emails||[]).forEach(e=>{
      if(typeof e==='object'&&e.email){
        _allowedMap[e.email.toLowerCase()]={name:e.name||e.email.split('@')[0], picture:e.picture||''};
      }
    });
      renderCreatorsSidebar(d.emails || []);
      if(me) refreshUserMenu();
    // הצג יוצרים ב-sidebar
    const creators = (d.emails||[]).filter(e => typeof e === 'object' && e.email);
    if(window._renderCreatorsSidebar) window._renderCreatorsSidebar(creators);
  }catch(ex){}
}
function refreshUserMenu(){
  if(!me) return;
  const role = getRole();
  const avatarHtml=me.picture?`<img src="${escAttr(me.picture)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid #1a56db;box-shadow:0 2px 6px rgba(0,0,0,0.1)">`:`<div style="width:34px;height:34px;border-radius:50%;background:#1a56db;color:#fff;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.1)">${esc(me.name[0].toUpperCase())}</div>`;
  let adminMenuHtml = '';
  
  if(isAdmin()) {
      adminMenuHtml += `
        <div style="border-top:1px solid #e5e7eb; margin-top:8px; padding-top:8px;">
          <div style="padding:0 14px 6px;font-size:11px;font-weight:800;color:#1a56db;text-transform:uppercase;letter-spacing:0.5px;">ניהול ואזור צוות</div>
          <button onclick="openLeaderboard()" style="width:100%;padding:8px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;gap:10px;"><i class="fas fa-chart-bar" style="color:#ea580c;width:16px;"></i> סטטיסטיקות</button>
      `;
  }
  if(role === 'super') {
      adminMenuHtml += `
          <button onclick="openReportsModal()" style="width:100%;padding:8px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;gap:10px;"><i class="fas fa-flag" style="color:#dc2626;width:16px;"></i> דיווחי משתמשים</button>
          <button onclick="openManageAdmins()" style="width:100%;padding:8px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;gap:10px;"><i class="fas fa-user-cog" style="color:#1a56db;width:16px;"></i> מורשי כתיבה (ממשק)</button>
          <button onclick="openSiteSettings()" style="width:100%;padding:8px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;gap:10px;"><i class="fas fa-tools" style="color:#7c3aed;width:16px;"></i> הגדרות וחסימות</button>
          <button onclick="openAdPanel()" style="width:100%;padding:8px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;gap:10px;"><i class="fas fa-ad" style="color:#ca8a04;width:16px;"></i> פרסומות</button>
          <button onclick="if(typeof openAdminMsgs==='function')openAdminMsgs()" style="width:100%;padding:8px 14px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:600;color:#374151;display:flex;align-items:center;gap:10px;"><i class="fas fa-bullhorn" style="color:#e02020;width:16px;"></i> הודעות לצוות</button>
      `;
  }
  if(adminMenuHtml !== '') adminMenuHtml += '</div>';
  const menu = document.getElementById('userMenu');
  if(!menu) return;
  menu.innerHTML = `
    <div style="padding:16px 14px 10px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f3f4f6;">
      ${avatarHtml}
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(me.name)}</div>
        <div style="font-size:11px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(me.email)}</div>
        <div style="font-size:10px;font-weight:800;color:#1a56db;">${role === 'super' ? 'מנהל ראשי' : role === 'writer' ? 'כותב מורשה' : 'משתמש'}</div>
      </div>
    </div>
    ${adminMenuHtml}
    <div style="border-top:1px solid #e5e7eb; margin-top:4px; padding:4px 0;">
      <button onclick="doLogout()" style="width:100%;padding:10px 16px;text-align:right;background:none;border:none;cursor:pointer;font-size:13px;font-weight:700;color:#dc2626;display:flex;align-items:center;gap:10px;transition:background 0.2s;" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'"><i class="fas fa-sign-out-alt" style="width:16px;"></i> התנתק</button>
    </div>`;
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
  me=user; saveUser(user); await applyLogin(); return true;
}

async function applyLogin(){
  initGlobalSettings();
  const av=document.getElementById('userAvatar');
  const avatarHtml=me.picture?`<img src="${escAttr(me.picture)}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;border:2px solid #1a56db;box-shadow:0 2px 6px rgba(0,0,0,0.1)">`:`<div style="width:34px;height:34px;border-radius:50%;background:#1a56db;color:#fff;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.1)">${esc(me.name[0].toUpperCase())}</div>`;
  
  av.innerHTML=`<div style="cursor:pointer" onclick="toggleUserMenu(event)">${avatarHtml}</div><div id="userMenu" style="display:none;"></div>`;
  
  const mailBtns = document.querySelectorAll('a[title="פנייה למנהל"]');
  mailBtns.forEach(btn => {
      btn.href = "mailto:0548537646a@gmail.com?subject=" + encodeURIComponent("לכבוד מנהל אתר בינה ודעה");
      btn.target = "_blank";
  });

  document.getElementById('loginScreen').style.display='none'; 
  document.getElementById('app').style.display='flex'; 
  document.getElementById('leftSidebar').style.display='flex';
  renderChannels();
  
  fetch(BACKEND+'/api/log_login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(me) })
    .then(r=>r.json()).then(d=>{
        const pc = document.getElementById('publicUserCount');
        if(pc) pc.textContent = d.count || '0';
    }).catch(()=>{});

  await checkAllowedAdmin(); 
  loadFeed(); setTimeout(loadAd,3000); setInterval(loadAd, 60*60*1000); initDark(); initNotifications();
}

async function handleGoogle(resp) {
  let payload = {};
  try {
    const base64Url = resp.credential.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const pad = base64.length % 4;
    const paddedBase64 = pad ? base64 + '='.repeat(4 - pad) : base64;
    const jsonPayload = decodeURIComponent(window.atob(paddedBase64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    payload = JSON.parse(jsonPayload);
  } catch (e) { alert("חלה שגיאה טכנית בהתחברות. נסה שוב."); return; }

  const email = (payload.email || '').toLowerCase();
  if (!email || !email.includes('@')) return;

  const picture = payload.picture || '';
  let displayName = '';

  try {
    const lr = await fetch(BACKEND + '/allowed_list?t=' + Date.now());
    const ld = await lr.json();
    const myEntry = (ld.emails || []).find(e => typeof e === 'object' && e.email === email);
    if (myEntry && myEntry.name && !myEntry.name.includes('×—') && myEntry.name !== email) {
      displayName = myEntry.name;
    }
  } catch (e) {}

  if (!displayName || displayName.includes('×—')) displayName = payload.name || email.split('@')[0];

  await verifyAndLogin({ email, name: displayName, picture });
}

function editorToMarkdown(el) {
  const clone = el.cloneNode(true);
  const quoteDiv = clone.querySelector('[data-quote-preview]');
  if (quoteDiv) quoteDiv.remove();
  
  let html = clone.innerHTML;
  html = html.replace(/<br\s*\/?>/gi, '\n');
  html = html.replace(/<\/div>/gi, '\n').replace(/<div[^>]*>/gi, '');
  html = html.replace(/<\/p>/gi, '\n').replace(/<p[^>]*>/gi, '');
  html = html.replace(/<b\b[^>]*>(.*?)<\/b>/gi, '**$1**');
  html = html.replace(/<strong\b[^>]*>(.*?)<\/strong>/gi, '**$1**');
  html = html.replace(/<i\b[^>]*>(.*?)<\/i>/gi, '_$1_');
  html = html.replace(/<em\b[^>]*>(.*?)<\/em>/gi, '_$1_');
  html = html.replace(/<u\b[^>]*>(.*?)<\/u>/gi, '__$1__');
  html = html.replace(/<s\b[^>]*>(.*?)<\/s>/gi, '~~$1~~');
  html = html.replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
  html = html.replace(/<span[^>]+style="[^"]*color:\s*([^;"]+)[^"]*"[^>]*>(.*?)<\/span>/gi, '\x02color:$1\x03$2\x02/color\x03');
  html = html.replace(/<font[^>]+color="([^"]+)"[^>]*>(.*?)<\/font>/gi, '\x02color:$1\x03$2\x02/color\x03');
  
  const txt = document.createElement('textarea');
  txt.innerHTML = html.replace(/<[^>]+>/g, '');
  return txt.value.trim();
}

function rich(t){
  if(!t)return''; let s=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s=s.replace(/\n/g,'<br>').replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>').replace(/__([^_\n]+)__/g,'<u>$1</u>').replace(/_([^_\n]+)_/g,'<em>$1</em>').replace(/~~([^~\n]+)~~/g,'<s>$1</s>').replace(/---DIVIDER---/g,'<hr class="bubble-divider">').replace(/<br>\s*(<hr[^>]*>)\s*<br>/g,'$1').replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/(?<!href=")(https?:\/\/[^\s<>"']{1,500})/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\x02color:([^\x03]+)\x03([\s\S]*?)\x02\/color\x03/g,'<span style=\"color:$1\">$2</span>');
  return s;
}

function buildMsg(e){
  const id=e.id; 
  const role = getRole();
  const canDel = role === 'super' || (role === 'writer' && e.senderEmail === me?.email);
  
  let content=`<div class="bubble-text">${rich(e.text||'')}</div>`;
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
  
  let tagsHtml='';
  if(e.tags && e.tags.length){
      tagsHtml = '<div class="post-tags-row" style="margin-top:8px;">' + e.tags.map(t=>`<span class="post-tag" onclick="document.getElementById('searchInput').value='${escAttr(t)}';onSearch('${escAttr(t)}')"><i class="fas fa-tag"></i> ${esc(t)}</span>`).join('') + '</div>';
  }

  let quoteHtml='';
  if(e.quote) {
      quoteHtml = `<div class="quote-block" onclick="(function(){const el=document.querySelector('[data-id=\"${escAttr(e.quote.id||'')}\"]');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='2px solid #1a56db';setTimeout(()=>el.style.outline='',1500);}})()">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;">
          <i class="fas fa-reply" style="color:#1a56db;font-size:10px;transform:scaleX(-1);"></i>
          <span style="font-size:11px;font-weight:800;color:#1a56db;">${esc(e.quote.sender)}</span>
        </div>
        <div class="quote-block-text">${esc((e.quote.text||'').substring(0,120))}${(e.quote.text||'').length>120?'...':''}</div>
      </div>`;
  }
  
  const n=cmtCount[id]||0;
  return `<div class="msg-row" data-id="${escAttr(id)}"><img class="msg-av" src="${LOGO}" onerror="this.style.display='none'"><div class="msg-col"><div class="msg-meta"><span class="msg-meta-name">${esc(siteGlobalSettings.title)}</span><span class="msg-meta-time">${e.time||''}</span>${e.edited?'<span class="msg-meta-edited">נערכה</span>':''}<span class="msg-meta-sender">${esc(e.sender)}</span></div><div class="bubble-wrap-outer"><div class="bubble-top-actions"><button class="link-btn" onclick="copyMsgLink('${escAttr(id)}',this)" title="העתק קישור"><i class="fas fa-link"></i></button><button class="cmt-btn${n>0?' has-cmt':''}" id="cbtn-${escAttr(id)}" onclick="openComments('${escAttr(id)}')"><i class="fas fa-comment"></i>${n>0?`<span style="font-size:9px;font-weight:800;margin-right:2px">${n}</span>`:''}</button><button class="msg-action-btn" onclick="reportMsg('${escAttr(id)}')" title="דווח על תוכן פוגעני"><i class="fas fa-flag"></i></button>${role==='super'||(role==='writer'&&e.senderEmail===me?.email)?`<button class="msg-action-btn edit" onclick="openEditMsg('${escAttr(id)}')"><i class="fas fa-pen"></i></button><button class="msg-action-btn quote" onclick="quoteFeedMsg('${escAttr(id)}')"><i class="fas fa-quote-right"></i></button>`:''}${canDel?`<button class="msg-action-btn del" onclick="deleteFeedMsg('${escAttr(id)}')"><i class="fas fa-trash"></i></button>`:''}</div><div class="bubble">${quoteHtml}${content}${media}${btns}${tagsHtml}</div></div><div class="bubble-foot"><div class="rxn-row" id="rxn-${escAttr(id)}"><button class="rxn-add-btn" onclick="openPicker(event,'${escAttr(id)}')">${REACT_SVG}</button></div></div></div></div>`;
}

function copyMsgLink(id, btn){
  const el=document.querySelector(`.msg-row[data-id="${id}"]`); if(el)el.id='msg-link-'+id;
  const url=location.href.split('#')[0]+'#msg-link-'+id;
  navigator.clipboard.writeText(url).catch(()=>{});
  btn.classList.add('copied'); btn.innerHTML='<i class="fas fa-check" style="font-size:9px"></i>'; setTimeout(()=>{btn.classList.remove('copied');btn.innerHTML='<i class="fas fa-link" style="font-size:9px"></i>';},1500);
}

function renderRxn(msgId,rxns, barElement=null){
  rxnCache[msgId]=rxns; 
  const bar=barElement || document.getElementById('rxn-'+msgId); if(!bar)return;
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

document.addEventListener('click',e=>{
  if(!e.target.closest('#emojiPicker')&&!e.target.closest('.rxn-add-btn')) document.getElementById('emojiPicker').classList.remove('show');
  if(!e.target.closest('.ctb-dropdown')&&!e.target.closest('.ctb-dropdown-wrap')) closeAllCtbDropdowns();
});

function openPicker(ev,msgId){
  ev.stopPropagation(); activePicker=msgId;
  const p=document.getElementById('emojiPicker');
  p.style.visibility='hidden'; p.style.display='grid';
  const pH=p.offsetHeight, pW=p.offsetWidth;
  p.style.display=''; p.style.visibility='';
  const rect=ev.currentTarget.getBoundingClientRect();
  const M=8;
  let top=rect.top-pH-M;
  if(top<56+M) top=rect.bottom+M;
  top=Math.max(56+M,top);
  let left=rect.right-pW;
  if(left<M) left=M;
  if(left+pW>window.innerWidth-M) left=window.innerWidth-pW-M;
  p.style.top=top+'px'; p.style.left=left+'px';
  p.classList.add('show');
}

function pickEmoji(em){
  document.getElementById('emojiPicker').classList.remove('show');
  if(activePicker) doReact(activePicker,em);
  activePicker=null;
}

async function doReact(msgId,emoji){
  if(!me)return; 
  const bar = document.getElementById('rxn-'+msgId);
  const current=rxnCache[msgId]||{}; const activeTypes=Object.entries(current).filter(([,u])=>u.length);
  if(!(emoji in current)&&activeTypes.length>=5)return;
  const users=[...(current[emoji]||[])]; const myIdx=users.indexOf(me.email);
  if(myIdx>=0)users.splice(myIdx,1);else users.push(me.email);
  const optimistic={...current}; if(users.length)optimistic[emoji]=users;else delete optimistic[emoji];
  
  if(bar) renderRxn(msgId, optimistic, bar);
  try{ const r=await fetch(BACKEND+'/feed_react',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,msgId,emoji})});
  const d=await r.json();if(d.status==='ok' && bar)renderRxn(msgId,d.reactions, bar); }catch(e){}
}

async function deleteFeedMsg(id){
  if(!confirm('למחוק הודעה זו לצמיתות?')) return;
  try{
    const r=await fetch(BACKEND+'/feed_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,id:id})});
    if((await r.json()).status==='ok'){
      document.querySelector(`.msg-row[data-id="${id}"]`)?.remove();
      items = items.filter(i=>i.id!==id);
    }
  }catch(e){}
}

function quoteFeedMsg(id){
  const role = getRole();
  if(role !== 'super' && role !== 'writer') return;
  const entry=items.find(e=>e.id===id);
  if(!entry) return;
  const ed=document.getElementById('composeEditor');
  const rawText=(entry.text||'').trim();
  const lines=rawText.split('\n');
  const preview=lines.slice(0,2).join(' ').substring(0,100)+(rawText.length>100?'…':'');
  ed._quoteData={id, text:rawText, preview, sender: entry.sender};
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
  updateAttachPreview();
}

function cancelQuote(){
  const ed=document.getElementById('composeEditor');
  ed.querySelector('[data-quote-preview]')?.remove();
  ed._quoteData=null;
  onComposeChange();
  updateAttachPreview();
}

let _reportTargetMsgId = null;
function reportMsg(msgId) {
    if(!me) { showToast('יש להתחבר כדי לדווח', 'error'); return; }
    _reportTargetMsgId = msgId;
    document.getElementById('reportModalMsgId').textContent = '#' + msgId;
    document.getElementById('reportModalInput').value = '';
    document.getElementById('reportModalError').style.display = 'none';
    document.getElementById('reportModalOverlay').style.display = 'flex';
    setTimeout(() => document.getElementById('reportModalInput').focus(), 80);
}
function closeReportModal() {
    document.getElementById('reportModalOverlay').style.display = 'none';
    _reportTargetMsgId = null;
}
async function submitReport() {
    const reason = document.getElementById('reportModalInput').value.trim();
    const errEl = document.getElementById('reportModalError');
    if(!reason) { errEl.style.display='block'; errEl.textContent='נא לפרט את סיבת הדיווח.'; return; }
    const btn = document.getElementById('reportSubmitBtn');
    btn.disabled = true; btn.textContent = 'שולח...';
    try {
        const res = await fetch(BACKEND+'/feed_report', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:me.email, msgId:_reportTargetMsgId, reason})});
        const d = await res.json();
        if(d.status === 'ok') { closeReportModal(); showToast('הדיווח נשלח בהצלחה. תודה!', 'success'); }
        else { errEl.style.display='block'; errEl.textContent='שגיאה בשליחה, נסה שוב.'; }
    } catch(e) { errEl.style.display='block'; errEl.textContent='שגיאת חיבור. הדיווח לא נשלח.'; }
    btn.disabled = false; btn.textContent = 'שלח דיווח';
}
function showToast(msg, type='success') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:32px;right:24px;z-index:9999;background:${type==='success'?'#059669':'#dc2626'};color:#fff;padding:13px 20px;border-radius:12px;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.2);font-family:'Heebo',sans-serif;animation:pickerPop .25s ease-out;`;
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

async function openReportsModal() {
    document.getElementById('reportsModal').style.display = 'flex';
    document.getElementById('reportsList').innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> טוען דיווחים...</div>';
    try {
        const res = await fetch(BACKEND + '/reports_get?email=' + encodeURIComponent(me.email) + '&t=' + Date.now());
        const d = await res.json();
        const reports = d.reports || [];
        if(!reports.length) { document.getElementById('reportsList').innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;">אין דיווחים פתוחים.</div>'; return; }
        
        document.getElementById('reportsList').innerHTML = reports.map(r => `
            <div style="background:#fef2f2; border:1.5px solid #fecaca; border-radius:14px; padding:14px; margin-bottom:10px;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <i class="fas fa-flag" style="color:#dc2626;font-size:11px;"></i>
                  <span style="font-weight:800;color:#b91c1c;font-size:13px;">דיווח על הודעה</span>
                </div>
                <a href="#msg-link-${r.msgId}" onclick="scrollToReportedMsg('${r.msgId}'); closeReportsModal();" style="font-size:11px;font-weight:700;color:#1a56db;text-decoration:none;background:#eff6ff;padding:3px 9px;border-radius:6px;border:1px solid #bfdbfe;"><i class="fas fa-arrow-left" style="font-size:9px;"></i> עבור להודעה</a>
              </div>
              <div style="font-size:12px;color:#6b7280;margin-bottom:4px;"><b>מדווח:</b> ${esc(r.reporter)}</div>
              <div style="font-size:12px;color:#6b7280;margin-bottom:8px;"><b>סיבה:</b> ${esc(r.reason)}</div>
              <div style="font-size:12px;color:#374151;background:#fff;padding:8px 10px;border-radius:8px;border:1px solid #fecaca;margin-bottom:10px;font-style:italic;">"${esc((r.msgText||'').substring(0,120))}${(r.msgText||'').length>120?'...':''}"</div>
              <div style="display:flex;gap:8px;">
                <button onclick="deleteFeedMsg('${r.msgId}');dismissReport('${r.id}')" style="flex:1;background:#dc2626;color:#fff;border:none;padding:7px;border-radius:8px;cursor:pointer;font-family:'Heebo';font-weight:800;font-size:12px;"><i class="fas fa-trash" style="font-size:10px;"></i> מחק פוסט</button>
                <button onclick="dismissReport('${r.id}')" style="flex:1;background:#f3f4f6;color:#374151;border:1px solid #d1d5db;padding:7px;border-radius:8px;cursor:pointer;font-family:'Heebo';font-weight:800;font-size:12px;"><i class="fas fa-check" style="font-size:10px;"></i> טופל</button>
              </div>
            </div>
        `).join('');
    } catch(e) { document.getElementById('reportsList').innerHTML = '<div style="color:red;text-align:center;">שגיאה</div>'; }
}

function closeReportsModal() { document.getElementById('reportsModal').style.display = 'none'; }
function scrollToReportedMsg(msgId) {
  const el = document.querySelector('[data-id="'+msgId+'"]');
  if(el){ el.id='msg-link-'+msgId; el.scrollIntoView({behavior:'smooth',block:'center'}); el.style.outline='2px solid #dc2626'; setTimeout(()=>el.style.outline='',1800); }
}
async function dismissReport(reportId) {
    try {
        await fetch(BACKEND + '/report_resolve', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:me.email, reportId:reportId})});
        openReportsModal();
    } catch(e) {}
}

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
    const r=await fetch(BACKEND+'/feed_comments?msgId='+encodeURIComponent(msgId)+'&t='+Date.now()); const d=await r.json(); const list=d.comments||[];
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

async function loadFeed(){
  setLoading(true);
  try{
    const r=await fetch(BACKEND+`/feed?channel=${currentChannelId}&limit=20&t=${Date.now()}`); const d=await r.json();
    if(d.status==='ok'){
      items=[...d.feed].reverse(); items.forEach(e=>knownIds.add(e.id)); allLoaded=d.feed.length<20; oldestTs=items.length?Math.min(...items.map(e=>e.ts||Infinity)):0; lastTs=items.length?Math.max(...items.map(e=>e.ts||0)):0;
      const inner=document.getElementById('feedInner');
      inner.innerHTML=items.length?items.map(buildMsg).join(''):'';
      document.getElementById('empty').style.display=items.length?'none':'block';
      document.getElementById('feedWrap').scrollTop=999999;
      if(items.length)await pollAll();
    }
  }catch(e){} setLoading(false);
}

async function loadMore(){
  if(loadingMore||allLoaded||!oldestTs)return;
  loadingMore=true;document.getElementById('loadMoreSpinner').classList.add('show');
  try{
    const r=await fetch(BACKEND+`/feed?channel=${currentChannelId}&before=${oldestTs}&limit=20&t=${Date.now()}`);
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
      if(document.getElementById('leaderboardModal').style.display === 'flex') loadLeaderboardData();
    }
    const rxns=d.reactions||{};Object.entries(rxns).forEach(([mid,rxn])=>{
        const bar = document.getElementById('rxn-'+mid);
        if(bar) renderRxn(mid,rxn,bar);
    });
    const counts=d.comment_counts||{};Object.entries(counts).forEach(([mid,n])=>{if(n!==(cmtCount[mid]||0)){cmtCount[mid]=n;updateCmtBtn(mid,n);}});
  }catch(e){}finally{pollPending=false;}
}

function scrollToBottom(){document.getElementById('feedWrap').scrollTo({top:999999,behavior:'smooth'});newCount=0;updateScrollBtn();}
function updateScrollBtn(){const btn=document.getElementById('scrollDownBtn'); if(!atBottom){btn.classList.add('show');if(newCount>0)btn.classList.add('has-new');else btn.classList.remove('has-new');}else{btn.classList.remove('show','has-new');newCount=0;}}
document.getElementById('feedWrap').addEventListener('scroll',function(){atBottom=(this.scrollHeight-this.scrollTop-this.clientHeight)<80;updateScrollBtn();},{passive:true});
function setLoading(v){document.getElementById('prog').classList.toggle('on',v);}

function onUpdateModeHdrClick(e){
  e.stopPropagation();
  if(isSuperAdmin()){
    const pop=document.getElementById('updateModePopover'); if(!pop)return;
    closeAllCtbDropdowns(); pop.classList.toggle('open');
  } else { toggleUpdateMode(); }
}
function closeUpdateModePopover(){ document.getElementById('updateModePopover')?.classList.remove('open'); }

function openUpdateTimeDialog(){
  const now=new Date(); now.setHours(now.getHours()+1,0,0,0);
  const inp=document.getElementById('updateTimeInput'); if(inp)inp.value=String(now.getHours()).padStart(2,'0')+':00';
  document.getElementById('updateTimeDialog').classList.add('open'); setTimeout(()=>inp?.focus(),100);
}
function closeUpdateTimeDialog(){ document.getElementById('updateTimeDialog').classList.remove('open'); }

function confirmUpdateTime(){
  const val=(document.getElementById('updateTimeInput')?.value||'').trim();
  if(!val){alert('נא לבחור שעה');return;}
  _updateMode=true; _updateUntil=val; closeUpdateTimeDialog(); applyUpdateModeUI(); saveUpdateModeToServer(true,val);
}

function toggleUpdateMode(){
  if(_updateMode){ _updateMode=false; _updateUntil=''; applyUpdateModeUI(); saveUpdateModeToServer(false,''); }
  else { openUpdateTimeDialog(); }
}

function applyUpdateModeUI(){
  const btn=document.getElementById('updateModeBtn');
  if(btn){
    if(_updateMode){ btn.className='update-mode-btn on'; btn.innerHTML=`<i class="fas fa-check" style="font-size:9px"></i> מעדכן${_updateUntil?' עד '+_updateUntil:''}`; }
    else { btn.className='update-mode-btn off'; btn.innerHTML='<i class="fas fa-times" style="font-size:9px"></i> לא מעדכן'; }
  }
  const notice=document.getElementById('updateModeNotice');
  if(notice&&!isSuperAdmin()) notice.classList.toggle('show',!_updateMode);
  const hdrBtn=document.getElementById('updateModeHdrBtn');
  if(hdrBtn){
    if(_updateMode){ hdrBtn.classList.add('is-on'); hdrBtn.title='מעדכן'+(_updateUntil?' עד '+_updateUntil:'')+' — לחץ לסיום'; }
    else { hdrBtn.classList.remove('is-on'); hdrBtn.title='לא מעדכן — לחץ להפעלה'; }
  }
}

async function saveUpdateModeToServer(active,until){
  try{ await fetch(BACKEND+'/update_mode_set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:getDisplayName(me.email,me.name),active,until})}); }catch(e){}
}

function isUntilExpired(until){
  if(!until)return false; const m=until.match(/^(\d{1,2}):(\d{2})$/); if(!m)return false;
  const now=new Date(); return (now.getHours()*60+now.getMinutes()) > (parseInt(m[1],10)*60+parseInt(m[2],10));
}

async function pollUpdateMode(){
  if(!isAdmin()) return;
  try{
    const r=await fetch(BACKEND+'/update_mode_get?t='+Date.now()); const d=await r.json();
    const hdrBtn=document.getElementById('updateModeHdrBtn'); if(hdrBtn)hdrBtn.style.display='inline-flex';
    if(_updateMode && isUntilExpired(_updateUntil)){ _updateMode=false; _updateUntil=''; applyUpdateModeUI(); saveUpdateModeToServer(false,''); }
    const myEntry=(d.updaters||[]).find(u=>u.email===me?.email?.toLowerCase());
    if(myEntry&&!_updateMode){
      if(myEntry.active && isUntilExpired(myEntry.until)){ saveUpdateModeToServer(false,''); }
      else { _updateMode=myEntry.active; _updateUntil=myEntry.until||''; applyUpdateModeUI(); }
    }
    if(isSuperAdmin()){
      const allActive=(d.updaters||[]).filter(u=> u.active && u.email!==me?.email?.toLowerCase() && !isUntilExpired(u.until) );
      const body=document.getElementById('updateModePopoverBody');
      if(body){
        if(allActive.length){ body.innerHTML=allActive.map(u=>`<div class="ump-row"><div class="ump-dot"></div><span>${u.name||u.email}${u.until?' — עד '+u.until:''}</span></div>`).join(''); }
        else { body.innerHTML='<div class="ump-empty">אין מעדכנים פעילים כרגע</div>'; }
      }
      if(hdrBtn){
        hdrBtn.classList.remove('has-active','no-active'); hdrBtn.classList.add(allActive.length?'has-active':'no-active');
        hdrBtn.title=allActive.length?'מעדכנים: '+allActive.map(u=>u.name+(u.until?' עד '+u.until:'')).join(', '):'אין מעדכנים פעילים כרגע';
      }
    }
    
    const sendBtn=document.getElementById('composeSendBtn');
    if(sendBtn){ sendBtn.disabled=false; sendBtn.style.opacity='1'; sendBtn.title='שלח'; }
  }catch(e){}
}

document.addEventListener('click',function(e){
  const pop=document.getElementById('updateModePopover'); const hdrBtn=document.getElementById('updateModeHdrBtn');
  if(pop&&pop.classList.contains('open')&&!pop.contains(e.target)&&!hdrBtn?.contains(e.target)){ pop.classList.remove('open'); }
});

let lbData = [];
function openLeaderboard() { document.getElementById('leaderboardModal').style.display = 'flex'; loadLeaderboardData(); }
function closeLeaderboard() { document.getElementById('leaderboardModal').style.display = 'none'; }

async function loadLeaderboardData() {
  const lbEl = document.getElementById('lbContent');
  if(!lbEl) return;
  lbEl.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>טוען נתונים...</div>';
  try {
    const res = await fetch(BACKEND + '/api/leaderboard?t=' + Date.now());
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if(d.status !== 'ok') throw new Error(d.error || 'server error');
    lbData = d.leaderboard || [];
    switchLbView('podium');
  } catch(e) {
    lbEl.innerHTML = '<div style="text-align:center;padding:30px;color:#dc2626;"><i class="fas fa-exclamation-triangle"></i><br>שגיאה בטעינת הנתונים<br><small style="color:#aaa;font-size:11px;">' + (e.message||'') + '</small></div>';
  }
}

function switchLbView(viewType) {
  document.querySelectorAll('.lb-tab').forEach(b => b.classList.remove('active')); const content = document.getElementById('lbContent');
  if(!lbData.length) { content.innerHTML = '<div style="text-align:center;color:#888;">אין עדיין מספיק נתונים לדירוג.</div>'; return; }

  if(viewType === 'podium') {
    document.getElementById('lbTabPodium').classList.add('active'); const top3 = lbData.slice(0, 3); let html = '<div class="lb-podium">';
    if(top3[1]) html += `<div class="podium-item podium-2"><img class="podium-av" src="${_allowedMap[top3[1].email]?.picture || LOGO}"><div class="podium-bar">${top3[1].likes}</div><div class="podium-name">${top3[1].name}</div></div>`;
    if(top3[0]) html += `<div class="podium-item podium-1"><img class="podium-av" src="${_allowedMap[top3[0].email]?.picture || LOGO}"><div class="podium-bar">${top3[0].likes}</div><div class="podium-name">${top3[0].name}</div></div>`;
    if(top3[2]) html += `<div class="podium-item podium-3"><img class="podium-av" src="${_allowedMap[top3[2].email]?.picture || LOGO}"><div class="podium-bar">${top3[2].likes}</div><div class="podium-name">${top3[2].name}</div></div>`;
    html += '</div>'; content.innerHTML = html;
  } 
  else if(viewType === 'bars') {
    document.getElementById('lbTabBars').classList.add('active'); const maxLikes = Math.max(...lbData.map(u => u.likes));
    content.innerHTML = '<div class="lb-bars">' + lbData.map(u => { const width = maxLikes > 0 ? (u.likes / maxLikes) * 100 : 0; return `<div class="lb-bar-row"><div class="lb-bar-name">${u.name}</div><div class="lb-bar-track"><div class="lb-bar-fill" style="width:${width}%">${u.likes} לייקים</div></div></div>`; }).join('') + '</div>';
  }
  else if(viewType === 'list') {
    document.getElementById('lbTabList').classList.add('active');
    content.innerHTML = '<div class="lb-list">' + lbData.map((u, i) => { let rankClass = i===0 ? 'gold' : i===1 ? 'silver' : i===2 ? 'bronze' : ''; return `<div class="lb-list-item"><div class="lb-rank ${rankClass}">${i+1}</div><div class="lb-info"><div style="font-weight:800;font-size:14px;color:#111;">${u.name}</div></div><div class="lb-stats"><div class="lb-stat-badge"><i class="fas fa-heart"></i> ${u.likes}</div><div class="lb-stat-badge" style="background:#f3f4f6;color:#4b5563;"><i class="fas fa-pen"></i> ${u.posts} פוסטים</div></div></div>`; }).join('') + '</div>';
  }
}

function openSiteSettings(){
    document.getElementById('siteSettingsModal').classList.add('open');
    renderBlockedUsers();
}
function closeSiteSettings(){ document.getElementById('siteSettingsModal').classList.remove('open'); }

async function saveCommentsSettings() {
    const isEnabled = document.getElementById('settingsCommentsEnable').checked; siteGlobalSettings.commentsEnabled = isEnabled;
    if(isSuperAdmin()) { await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, commentsEnabled:isEnabled})}); alert('הגדרות התגובות עודכנו בהצלחה.'); }
}

async function blockUser(){
    const email = document.getElementById('settingsBlockEmail').value.trim().toLowerCase(); if(!email) return;
    if(!siteGlobalSettings.blockedEmails) siteGlobalSettings.blockedEmails = [];
    if(!siteGlobalSettings.blockedEmails.includes(email)){
        siteGlobalSettings.blockedEmails.push(email); document.getElementById('settingsBlockEmail').value = ''; renderBlockedUsers();
        if(isSuperAdmin()) { await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, blockedEmails:siteGlobalSettings.blockedEmails})}); alert('המשתמש נחסם!'); }
    }
}

function renderBlockedUsers(){
    const el = document.getElementById('blockedUsersList');
    if(!siteGlobalSettings.blockedEmails || !siteGlobalSettings.blockedEmails.length){ el.innerHTML = 'אין משתמשים חסומים.'; return; }
    el.innerHTML = siteGlobalSettings.blockedEmails.map(email => `<div style="display:flex; justify-content:space-between; background:#fef2f2; padding:5px; margin-bottom:5px; border:1px solid #fecaca; border-radius:5px;"><span>${email}</span><button onclick="unblockUser('${email}')" style="color:red; background:none; border:none; cursor:pointer;">הסר חסימה</button></div>`).join('');
}

async function unblockUser(email){
    siteGlobalSettings.blockedEmails = siteGlobalSettings.blockedEmails.filter(e => e !== email); renderBlockedUsers();
    if(isSuperAdmin()) { await fetch(BACKEND+'/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({admin_email:me.email, blockedEmails:siteGlobalSettings.blockedEmails})}); }
}

async function exportEmailsToGroups() {
    if(!isSuperAdmin()) return;
    try {
        const res = await fetch(BACKEND + '/api/export_emails', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ email: me.email }) });
        const text = await res.text();
        const blob = new Blob([text], {type: "text/plain;charset=utf-8"});
        const link = document.createElement("a"); link.href = URL.createObjectURL(blob);
        link.download = "community_emails.txt"; link.click();
    } catch(e) { alert("שגיאה בייצוא המיילים"); }
}

function closeLightbox(){document.getElementById('lightbox').classList.remove('show');document.getElementById('lbImg').src='';}
function openLightbox(src){document.getElementById('lbImg').src=src;document.getElementById('lightbox').classList.add('show');}
function clearCompose(){document.getElementById('composeEditor').innerHTML='';composeImgUrl='';composeVidUrl='';composeHtmlCode='';composeBtns=[]; document.getElementById('composeEditor')._quoteData=null; updateAttachPreview();}

function showPreview(){
  const ed=document.getElementById('composeEditor'); const text=editorToMarkdown(ed).trim();
  if(!text && !composeImgUrl && !composeHtmlCode && !composeVidUrl){ alert('אין מה להציג.'); return; }
  const mockEntry = { id: 'preview', channel: currentChannelId, profile: composeProfile, text: text, imgUrl: composeImgUrl, videoUrl: composeVidUrl, htmlCode: composeHtmlCode, sender: _allowedMap[me?.email?.toLowerCase()]?.name || me.name, time: 'עכשיו', ts: Date.now(), buttons: composeBtns, quote: ed._quoteData };
  document.getElementById('previewModalBody').innerHTML = buildMsg(mockEntry); document.getElementById('previewModal').style.display = 'flex';
}
function closePreview(){ document.getElementById('previewModal').style.display = 'none'; document.getElementById('previewModalBody').innerHTML = ''; }

function onComposeChange(){ const ed=document.getElementById('composeEditor'); document.getElementById('composeCharCount').textContent=editorToMarkdown(ed).length; }
function composeFormat(cmd){ const ed=document.getElementById('composeEditor'); ed.focus(); requestAnimationFrame(()=>{ document.execCommand(cmd,false,null); onComposeChange(); }); }
function insertHeading(){ const ed=document.getElementById('composeEditor'); ed.focus(); document.execCommand('insertText',false,' •'); onComposeChange(); }
function applyTextColor(color){ document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, color); closeAllCtbDropdowns(); onComposeChange(); }
function removeTextColor(){ document.execCommand('removeFormat', false, 'foreColor'); closeAllCtbDropdowns(); onComposeChange(); }
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

let savedRange;
function saveLinkSelection() { const sel = window.getSelection(); if(sel.rangeCount > 0) { savedRange = sel.getRangeAt(0); document.getElementById('composeLinkText').value = sel.toString(); } }
function insertComposeLink() {
    const url = document.getElementById('composeLinkUrl').value;
    const text = document.getElementById('composeLinkText').value || url;
    if(!url) return;
    const a = `<a href="${url}" target="_blank" style="color:#1a56db;text-decoration:underline;">${text}</a>`;
    if(savedRange) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); document.execCommand('insertHTML', false, a); } 
    else { document.getElementById('composeEditor').innerHTML += a; }
    toggleCtbDropdown('linkDrop');
}

function updateAttachPreview(){
  const prev=document.getElementById('attachPreview'); const chips=[];
  if(composeImgUrl)chips.push(`<div class="attach-chip"><i class="fas fa-image" style="color:#1a56db;"></i> תמונה <button onclick="clearComposeImg()">✕</button></div>`);
  if(composeVidUrl)chips.push(`<div class="attach-chip"><i class="fas fa-video" style="color:#7c3aed;"></i> סרטון <button onclick="clearComposeVid()">✕</button></div>`);
  if(composeHtmlCode)chips.push(`<div class="attach-chip"><i class="fas fa-code" style="color:#059669;"></i> HTML <button onclick="clearHtmlCode()">✕</button></div>`);
  composeBtns.forEach(b=>chips.push(`<div class="attach-chip"><i class="fas fa-mouse-pointer" style="color:#ea580c;"></i> ${esc(b.text)} <button onclick="removeComposeButton(${b.id})">✕</button></div>`));
  const ed = document.getElementById('composeEditor');
  if(ed && ed._quoteData) chips.push(`<div class="attach-chip"><i class="fas fa-quote-right" style="color:#aaa;"></i> צוטט: ${esc(ed._quoteData.sender)} <button onclick="document.getElementById('composeEditor')._quoteData=null;updateAttachPreview()">✕</button></div>`);
  prev.innerHTML=chips.join(''); prev.classList.toggle('show',chips.length>0);
}

function onSearch(val){
    const searchClear = document.getElementById('searchClear');
    if(searchClear) searchClear.classList.toggle('show', val.length > 0);
    if(!val || val.trim()==='') { clearSearch(); return; }
    doSearch(val);
}
function clearSearch(){
    document.getElementById('searchInput').value='';
    document.getElementById('searchBar').classList.remove('open');
    const searchClear = document.getElementById('searchClear');
    if(searchClear) searchClear.classList.remove('show');
    document.getElementById('feedWrap').style.display='';
    document.getElementById('searchResults').style.display='none';
    const inner = document.getElementById('feedInner');
    inner.innerHTML = '';
    items.forEach(m => inner.innerHTML += buildMsg(m));
}
async function sendFeedPost(){
  if(!me) return;
  const role = getRole();
  if(role !== 'super' && role !== 'writer'){alert('אין לך הרשאת כתיבה');return;}
  
  const ed=document.getElementById('composeEditor'); 
  const editorText = editorToMarkdown(ed).trim();
  const htmlCode = document.getElementById('composeHtmlCode')?.value.trim();
  const tagsInput = document.getElementById('composeTagsInput')?.value.trim();
  const tags = tagsInput ? tagsInput.split(',').map(t=>t.trim()).filter(t=>t) : [];

  if(!editorText&&!composeImgUrl&&!composeHtmlCode){alert('הודעה ריקה');return;}
  const btn=document.getElementById('composeSendBtn'); btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; btn.disabled=true;
  
  const displayName = _allowedMap[me.email.toLowerCase()]?.name || me.name;

  try{
    const r=await fetch(BACKEND+'/feed_add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel: currentChannelId, text: editorText, quote: ed._quoteData, imgUrl:composeImgUrl, videoUrl:composeVidUrl, htmlCode:composeHtmlCode, sender:displayName, senderEmail:me.email, buttons:composeBtns, tags: tags})});
    const d=await r.json(); if(d.status==='ok'){ clearCompose(); document.getElementById('feedWrap').scrollTop=999999; await loadFeed(); } else { alert('שגיאה בשליחה'); }
  }catch(e){alert('שגיאת שרת');}
  btn.innerHTML='<i class="fas fa-paper-plane"></i>'; btn.disabled=false;
}

let _editMsgId=null;
function openEditMsg(id){
  const role = getRole();
  if(role !== 'super' && role !== 'writer') return; 
  const e=items.find(i=>i.id===id); if(!e)return; _editMsgId=id;
  const ed=document.getElementById('composeEditor'); ed.innerHTML=e.text||'';
  composeImgUrl=e.imgUrl||''; composeVidUrl=e.videoUrl||''; composeHtmlCode=e.htmlCode||''; composeBtns=(e.buttons||[]).map(b=>({text:b.text,url:b.url}));
  if(composeImgUrl){ document.getElementById('composeImgUrl').value=composeImgUrl; const th=document.getElementById('composeImgThumb'); if(th){document.getElementById('composeImgThumbImg').src=composeImgUrl;th.style.display='flex';} }
  if(composeVidUrl)document.getElementById('composeVidUrl').value=composeVidUrl;
  updateAttachPreview(); document.getElementById('composeSendBtn').style.display='none'; document.getElementById('composePreviewBtn').style.display='none'; document.getElementById('composeEditConfirmBtn').style.display='flex'; document.getElementById('composeEditCancelBtn').style.display='flex'; document.getElementById('composeEditBanner').classList.add('show'); document.getElementById('adminComposeBar').scrollIntoView({behavior:'smooth',block:'end'});
  setTimeout(()=>{ed.focus();const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);const s=window.getSelection();s.removeAllRanges();s.addRange(r);},200);
}
function cancelEditMode(){ _editMsgId=null; clearCompose(); document.getElementById('composeSendBtn').style.display='flex'; document.getElementById('composePreviewBtn').style.display='flex'; document.getElementById('composeEditConfirmBtn').style.display='none'; document.getElementById('composeEditCancelBtn').style.display='none'; document.getElementById('composeEditBanner').classList.remove('show'); }
function closeEditMsg(){cancelEditMode();}
async function saveEditMsg(){
  if(!_editMsgId||!me)return; const ed=document.getElementById('composeEditor'); const editorText=editorToMarkdown(ed).trim();
  if(!editorText&&!composeImgUrl&&!composeHtmlCode){alert('ההודעה לא יכולה להיות ריקה');return;}
  const btn=document.getElementById('composeEditConfirmBtn'); btn.innerHTML='<i class="fas fa-spinner fa-spin" style="font-size:12px"></i>';btn.disabled=true;
  try{
    const r=await fetch(BACKEND+'/feed_edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,id:_editMsgId,text:editorText,imgUrl:composeImgUrl,videoUrl:composeVidUrl,htmlCode:composeHtmlCode,buttons:composeBtns.map(b=>({text:b.text,url:b.url}))})});
    const d=await r.json();
    if(d.status==='ok'){ cancelEditMode(); const entry=d.entry; if(entry){ const idx=items.findIndex(i=>i.id===entry.id); if(idx>=0)items[idx]=entry; const row=document.querySelector(`.msg-row[data-id="${entry.id}"]`); if(row){ const newDiv=document.createElement('div'); newDiv.innerHTML=buildMsg(entry); row.replaceWith(newDiv.firstChild); } } }else{alert(d.msg||'שגיאה בשמירה');}
  }catch(e){alert('שגיאת רשת');} finally{btn.innerHTML='<i class="fas fa-check" style="font-size:14px"></i>';btn.disabled=false;}
}

function toggleChatMinimize(){
  const panel=document.getElementById('adminChatPanel');
  if(!panel) return;
  panel.classList.toggle('minimized');
  const btn=document.getElementById('chatMinimizeBtn');
  if(btn) btn.innerHTML=panel.classList.contains('minimized')?'<i class="fas fa-expand-alt"></i>':'<i class="fas fa-minus"></i>';
  const adInChat=document.getElementById('adInChat');
  if(adInChat&&_adInChatData) adInChat.style.display=panel.classList.contains('minimized')?'flex':'none';
}
function toggleDark(){const on=document.body.classList.toggle('dark');document.getElementById('darkBtn').classList.toggle('active',on);localStorage.setItem('shaagat_dark',on?'1':'0');}
function initDark(){if(localStorage.getItem('shaagat_dark')==='1'){document.body.classList.add('dark');document.getElementById('darkBtn')?.classList.add('active');}}

let notificationsOn=false;
async function toggleNotifications(){
  if(!('Notification'in window)){alert('הדפדפן לא תומך בהתראות');return;}
  if(notificationsOn){notificationsOn=false;document.getElementById('notifBtn').classList.remove('active');localStorage.setItem('shaagat_notif','0');return;}
  const perm=await Notification.requestPermission(); if(perm==='granted'){notificationsOn=true;document.getElementById('notifBtn').classList.add('active');localStorage.setItem('shaagat_notif','1');new Notification('בינה ודעה',{body:'התראות מופעלות ✓',icon:LOGO});}
}
function initNotifications(){if(localStorage.getItem('shaagat_notif')==='1'&&Notification.permission==='granted'){notificationsOn=true;document.getElementById('notifBtn')?.classList.add('active');}}
function sendNotification(title,body){if(notificationsOn&&Notification.permission==='granted'&&document.visibilityState!=='visible') new Notification(title||'בינה ודעה',{body:body||'הודעה חדשה',icon:LOGO});}

async function doSearch(q){
  const qLow=q.toLowerCase(); document.getElementById('feedWrap').style.display='none'; document.getElementById('searchResults').style.display='block'; const inner=document.getElementById('searchResultsInner'); const empty=document.getElementById('searchEmpty'); inner.innerHTML='<div style="text-align:center;padding:30px;color:#aaa;"><i class="fas fa-spinner fa-spin"></i> מחפש...</div>'; empty.style.display='none';
  let allItems=[]; let before=0;
  for(let page=0;page<10;page++){ try{ const url=before?BACKEND+`/feed?channel=${currentChannelId}&before=${before}&limit=50&t=${Date.now()}`:BACKEND+`/feed?channel=${currentChannelId}&limit=50&t=${Date.now()}`; const r=await fetch(url);const d=await r.json(); if(d.status!=='ok'||!d.feed.length)break; allItems.push(...d.feed); if(d.feed.length<50)break; before=Math.min(...d.feed.map(e=>e.ts||Infinity)); }catch(e){break;} }
  const results=allItems.filter(e=>(e.text||'').toLowerCase().includes(qLow));
  if(!results.length){inner.innerHTML='';empty.style.display='block';return;}
  const escaped=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  inner.innerHTML=results.map(e=>buildMsg(e).replace(new RegExp(`(${escaped})`,'gi'),'<mark style="background:#fff176;border-radius:3px;padding:0 1px">$1</mark>')).join('');
  results.forEach(e=>{if(rxnCache[e.id])renderRxn(e.id,rxnCache[e.id]);});
}

async function loadAd(){
  try{ const r=await fetch(BACKEND+'/ad_get?t=' + Date.now());const d=await r.json(); if(d.side&&(d.side.imageUrl||d.side.htmlUrl||d.side.htmlCode)){showAdSide(d.side);}else{hideAdSide();} if(d.popup&&(d.popup.imageUrl||d.popup.htmlUrl||d.popup.htmlCode)&&shouldShowAd()){showAdPopup(d.popup);} }catch(e){}
}
function shouldShowAd(){const last=parseInt(localStorage.getItem(AD_KEY)||'0');return Date.now()-last>AD_INTERVAL;}
function markAdShown(){localStorage.setItem(AD_KEY,String(Date.now()));}

function showAdSide(ad){
  const img=document.getElementById('adSidebarImg'); const link=document.getElementById('adSidebarLink'); const frame=document.getElementById('adSidebarFrame');
  if(ad.htmlCode||ad.htmlUrl){ if(img)img.style.display='none'; if(link)link.style.display='none'; if(frame){ if(ad.htmlCode){frame.srcdoc=ad.htmlCode;} else if(ad.htmlUrl){frame.src=ad.htmlUrl;} frame.style.display='block'; } }
  else { if(frame){frame.style.display='none';frame.src='';} if(img){img.src=ad.imageUrl||'';img.style.display='block';} if(link)link.href=ad.linkUrl||'#'; }
  if(isAdmin()){
    const adInChat=document.getElementById('adInChat'); const adFrame=document.getElementById('adInChatFrame'); const adImg=document.getElementById('adInChatImg'); const adLink=document.getElementById('adInChatLink');
    if(adInChat){
      if(ad.htmlCode||ad.htmlUrl){ if(adFrame){ if(ad.htmlCode)adFrame.srcdoc=ad.htmlCode; else adFrame.src=ad.htmlUrl; adFrame.style.display='block'; } if(adLink)adLink.style.display='none'; }
      else { if(adFrame)adFrame.style.display='none'; if(adImg){adImg.src=ad.imageUrl||'';adImg.style.display='block';} if(adLink)adLink.style.display='block'; if(adLink)adLink.href=ad.linkUrl||'#'; }
      _adInChatData=ad;
    }
  } else { if(window.innerWidth>900) document.getElementById('adOnlySidebar').style.display='block'; }
}
function hideAdSide(){ document.getElementById('adOnlySidebar').style.display='none'; const adInChat=document.getElementById('adInChat'); if(adInChat)adInChat.style.display='none'; _adInChatData=null; }

function showAdPopup(ad){
  const existing=document.getElementById('adOverlay');if(existing)return;
  const overlay=document.createElement('div');overlay.id='adOverlay'; overlay.style.cssText='position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center';
  const inner=document.createElement('div'); inner.style.cssText='position:relative;max-width:420px;width:90%;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)';
  let timerVal = parseInt(ad.timer||0); if(timerVal > 5) timerVal = 5;
  const closeBtn=`<button id="adCloseBtn" onclick="closeAd()" style="position:absolute;top:10px;right:10px;z-index:2;background:rgba(0,0,0,.5);border:none;border-radius:50%;width:32px;height:32px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:Heebo,sans-serif" ${timerVal>0?'disabled':''}>${timerVal>0?timerVal:'✕'}</button>`;
  
  if(ad.htmlCode||ad.htmlUrl){
    inner.innerHTML=closeBtn; const frame=document.createElement('iframe'); if(ad.htmlCode){frame.srcdoc=ad.htmlCode;} else {frame.src=ad.htmlUrl;} frame.style.cssText='width:100%;height:70vh;border:none;display:block;'; frame.setAttribute('sandbox','allow-scripts allow-popups allow-forms allow-top-navigation-by-user-activation'); inner.appendChild(frame);
  } else { inner.innerHTML=closeBtn+`<a href="${escAttr(ad.linkUrl||'#')}" target="_blank" rel="noopener noreferrer" onclick="closeAd()"><img src="${escAttr(ad.imageUrl)}" style="width:100%;display:block;max-height:70vh;object-fit:contain;background:#000"></a>`; }
  overlay.appendChild(inner); document.body.appendChild(overlay); markAdShown();
  if(timerVal > 0){ let t = timerVal; let intv = setInterval(()=>{ t--; let b = document.getElementById('adCloseBtn'); if(b) { if(t<=0){ b.disabled=false; b.innerText='✕'; clearInterval(intv); } else { b.innerText = t; } } else { clearInterval(intv); } }, 1000); }
}
function closeAd(){document.getElementById('adOverlay')?.remove();}

async function openAdPanel(){
  document.getElementById('adModal').style.display='flex';
  try{
    const r=await fetch(BACKEND+'/ad_get?t=' + Date.now());const d=await r.json();
    if(d.popup){ document.getElementById('adPopupImageUrl').value=d.popup.imageUrl||''; document.getElementById('adPopupLinkUrl').value=d.popup.linkUrl||''; if(document.getElementById('adPopupHtmlUrl'))document.getElementById('adPopupHtmlUrl').value=d.popup.htmlCode||''; if(document.getElementById('adPopupTimer'))document.getElementById('adPopupTimer').value=d.popup.timer||0; }
    if(d.side){document.getElementById('adSideImageUrl').value=d.side.imageUrl||'';document.getElementById('adSideLinkUrl').value=d.side.linkUrl||'';if(document.getElementById('adSideHtmlUrl'))document.getElementById('adSideHtmlUrl').value=d.side.htmlCode||'';}
  }catch(e){}
}
function closeAdPanel(){document.getElementById('adModal').style.display='none';}

async function saveAd(type){
  const imgEl=type==='popup'?'adPopupImageUrl':'adSideImageUrl'; const lnkEl=type==='popup'?'adPopupLinkUrl':'adSideLinkUrl'; const htmlEl=type==='popup'?'adPopupHtmlUrl':'adSideHtmlUrl';
  const imageUrl=document.getElementById(imgEl).value.trim(); const linkUrl=document.getElementById(lnkEl).value.trim(); const htmlCode=document.getElementById(htmlEl)?.value.trim()||'';
  let timer = 0; if(type==='popup'){ timer = parseInt(document.getElementById('adPopupTimer').value||0); if(timer < 0) timer = 0; if(timer > 5) timer = 5; }
  if(!imageUrl&&!htmlCode){showAdMsg('יש להזין תמונה או קוד HTML','red');return;}
  try{ const r=await fetch(BACKEND+'/ad_set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,imageUrl,linkUrl,htmlCode,displayType:type, timer:timer})}); const d=await r.json();if(d.status==='ok'){showAdMsg('נשמר ✓','green');loadAd();}else showAdMsg(d.msg||'שגיאה','red'); }catch(e){showAdMsg('שגיאת שרת','red');}
}
async function deleteAd(type){
  const imgEl=type==='popup'?'adPopupImageUrl':'adSideImageUrl'; const lnkEl=type==='popup'?'adPopupLinkUrl':'adSideLinkUrl';
  try{ await fetch(BACKEND+'/ad_set',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,imageUrl:'',linkUrl:'',displayType:type, timer:0})}); document.getElementById(imgEl).value='';document.getElementById(lnkEl).value=''; if(type==='side')hideAdSide();showAdMsg('הוסרה ✓','green'); }catch(e){}
}
function showAdMsg(txt,color){ const el=document.getElementById('adMsg');el.textContent=txt;el.style.color=color==='green'?'#16a34a':'#dc2626';el.style.display='block'; setTimeout(()=>el.style.display='none',2000); }


const CHAT_COLORS=['#3b82f6','#7c3aed','#059669','#d97706','#dc2626','#db2777'];
const chatCol=s=>CHAT_COLORS[(s||'').charCodeAt(0)%CHAT_COLORS.length];

function renderChatText(t){
  if(!t) return '';
  let s=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  s=s.replace(/\*([^*\n]+)\*/g,'<strong>$1</strong>');
  s=s.replace(/\_([^_\n]+)\_/g,'<em>$1</em>');
  s=s.replace(/(https?:\/\/[^\s<>"']+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  return s;
}

let _chatTypingTimer = null;

async function loadAdminChat(){
  if(!isAdmin()) return;
  try{
    const r=await fetch(BACKEND+'/chat_get?t=' + Date.now());
    const d=await r.json();
    if(d.status!=='ok') return;
    const msgs=d.chat||[];
    const sig=msgs.map(m=>m.id).join(',');
    if(sig===chatLastIds) return;
    const hadMsgs=chatLastIds!=='';
    chatLastIds=sig;
    renderAdminChat(msgs);
    if(hadMsgs&&msgs.length){
      const newest=msgs[msgs.length-1];
      if(newest.email!==me?.email)
        sendNotification("צ'אט מנהלים", getDisplayName(newest.email,newest.sender)+': '+(newest.text||'').substring(0,40));
    }
  }catch(e){}
}

function renderAdminChat(msgs){
  const box=document.getElementById('chatMessages');
  if(!box) return;
  const empty=document.getElementById('chatEmptyMsg');
  const atBot=box.scrollHeight-box.scrollTop-box.clientHeight<80;
  if(!msgs.length){
    box.innerHTML='';
    if(empty){empty.style.display='block'; box.appendChild(empty);}
    return;
  }
  if(empty) empty.style.display='none';
  box.innerHTML='';
  let lastDate='', lastEmail='', lastMin='';
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
      img.onerror=()=>{img.style.display='none'; avEl.textContent=displayName[0].toUpperCase();};
      avEl.appendChild(img);
    } else { avEl.textContent=displayName[0].toUpperCase(); }
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
    bub.addEventListener('dblclick',ev=>{ev.preventDefault(); showChatCtx(ev,msg,isMe);});
    bubs.appendChild(bub);
    if(isMe){grp.appendChild(bubs); grp.appendChild(avEl);}
    else{grp.appendChild(avEl); grp.appendChild(bubs);}
    box.appendChild(grp);
    lastEmail=msg.email; lastMin=msgMin;
  });
  if(atBot) box.scrollTop=box.scrollHeight;
}

let _ctxMsgId=null;
function showChatCtx(ev,msg,isMe){
  ev.stopPropagation();
  _ctxMsgId=msg.id;
const menu=document.getElementById('chatCtxMenu');
  if(!menu) return;
  const canDel=isMe||isSuperAdmin();
  menu.innerHTML=
    `<div class="ctx-item" onclick="copyChatMsg('${escAttr(msg.id)}')"><i class="fas fa-copy"></i> העתק</div>`+
    (canDel?`<div class="ctx-item danger" onclick="deleteChatMsg('${escAttr(msg.id)}')"><i class="fas fa-trash"></i> מחק</div>`:'');
  menu.classList.add('show');
  menu.style.left=ev.clientX+'px'; menu.style.top=ev.clientY+'px';
  requestAnimationFrame(()=>{
    const r=menu.getBoundingClientRect();
    if(r.right>window.innerWidth) menu.style.left=(ev.clientX-r.width)+'px';
    if(r.bottom>window.innerHeight) menu.style.top=(ev.clientY-r.height)+'px';
  });
}
function hideChatCtx(){ document.getElementById('chatCtxMenu')?.classList.remove('show'); }
document.addEventListener('click',e=>{if(!e.target.closest('#chatCtxMenu')) hideChatCtx();});

function copyChatMsg(id){
  const bub=document.querySelector(`.chat-bub[data-id="${id}"]`);
  if(!bub) return;
  navigator.clipboard.writeText(bub.innerText.replace(/\s+\d{2}:\d{2}$/,'').trim()).catch(()=>{});
  hideChatCtx();
}

async function deleteChatMsg(id){
  hideChatCtx();
  if(!confirm('למחוק הודעה זו?')) return;
  try{
    await fetch(BACKEND+'/chat_delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,id})});
    chatLastIds=''; loadAdminChat();
  }catch(e){}
}

function onChatType(){
  if(!me) return;
  fetch(BACKEND+'/typing_ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:getDisplayName(me.email,me.name),email:me.email})}).catch(()=>{});
  clearTimeout(_chatTypingTimer);
  _chatTypingTimer=setTimeout(()=>{
    fetch(BACKEND+'/typing_stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email})}).catch(()=>{});
  },3000);
}

async function pollChatTyping(){
  if(!isAdmin()) return;
  try{
    const r=await fetch(BACKEND+'/typing_status');
    const d=await r.json();
    const others=(d.typers||[]).filter(n=>n!==getDisplayName(me?.email,me?.name));
    const bar=document.getElementById('chatTypingBar');
    if(bar){
      if(others.length){bar.style.display='block'; bar.textContent=others.join(', ')+' מקלידים...';}
      else{bar.style.display='none';}
    }
  }catch(e){}
}

async function pingChatPresence(){
  if(!me) return;
  try{
    const r=await fetch(BACKEND+'/presence_ping',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email,name:me.name,picture:me.picture})});
    const d=await r.json();
    const presEl=document.getElementById('chatPresenceCount');
    if(presEl) presEl.textContent=(d.active||[]).length||1;
  }catch(e){}
}

async function sendChatMsg(){
  const inp=document.getElementById('chatInput');
  const text=(inp?.value||'').trim();
  if(!text||!me) return;
  const now=new Date();
  const clientTime=now.toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit',hour12:false});
  const clientDate=now.toLocaleDateString('he-IL',{day:'2-digit',month:'2-digit',year:'numeric'});
  inp.value=''; inp.style.height='auto';
  clearTimeout(_chatTypingTimer);
  fetch(BACKEND+'/typing_stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:me.email})}).catch(()=>{});
  try{
    await fetch(BACKEND+'/chat_add',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sender:getDisplayName(me.email,me.name),text,picture:me.picture,email:me.email,clientTime,clientDate,clientTs:now.getTime()})});
    chatLastIds=''; loadAdminChat();
  }catch(e){}
}

function handleChatInputKey(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); sendChatMsg();}
}

function checkChatMention(inp) {
  const val = inp.value;
  const atIdx = val.lastIndexOf('@');
  const drop = document.getElementById('mentionDropdown');
  if (!drop) return;
  if (atIdx === -1 || val.length - atIdx > 15) { drop.innerHTML = ''; drop.style.display = 'none'; return; }
  const query = val.slice(atIdx + 1).toLowerCase();
  const matches = Object.values(_allowedMap).filter(u => (u.name || '').toLowerCase().includes(query)).slice(0, 5);
  if (!matches.length) { drop.innerHTML = ''; drop.style.display = 'none'; return; }
  drop.style.display = 'block';
  drop.innerHTML = matches.map(u =>
    `<div class="mention-item" onclick="insertMention('${escAttr(u.name || u.email)}')">
       ${u.picture ? `<img src="${escAttr(u.picture)}" class="mention-av">` : `<div class="mention-av-i">${esc((u.name||'?')[0])}</div>`}
       <span>${esc(u.name || u.email)}</span>
     </div>`
  ).join('');
}

function insertMention(name) {
  const inp = document.getElementById('chatInput');
  if (!inp) return;
  const val = inp.value;
  const atIdx = val.lastIndexOf('@');
  inp.value = val.slice(0, atIdx) + '@' + name + ' ';
  const drop = document.getElementById('mentionDropdown');
  if (drop) { drop.innerHTML = ''; drop.style.display = 'none'; }
  inp.focus();
}

let _adminMsgsKnownIds = new Set();

async function loadAdminMsgs() {
  try {
    const r = await fetch(BACKEND + '/admin_msgs_get?t=' + Date.now());
    const d = await r.json();
    if (d.status !== 'ok') return;
    const msgs = d.msgs || [];
    const newMsgs = msgs.filter(m => !_adminMsgsKnownIds.has(m.id));
    if (!newMsgs.length) return;
    newMsgs.forEach(m => { _adminMsgsKnownIds.add(m.id); adminMsgsUnread++; });
    const badge = document.getElementById('adminMsgsBadge');
    if (badge) { badge.textContent = adminMsgsUnread; badge.style.display = adminMsgsUnread > 0 ? 'flex' : 'none'; }
    if (document.getElementById('adminMsgsModal')?.style.display === 'flex') renderAdminMsgs(msgs);
  } catch(e) {}
}

function renderAdminMsgs(msgs) {
  const body = document.getElementById('adminMsgsBody');
  if (!body) return;
  if (!msgs.length) { body.innerHTML = '<div style="text-align:center;padding:30px;color:#aaa;font-size:13px;">אין הודעות</div>'; return; }
  body.innerHTML = msgs.map(m => {
    const isMine = m.email === me?.email;
    return `<div style="background:${isMine?'#eff6ff':'#f9fafb'};border:1px solid ${isMine?'#bfdbfe':'#e5e7eb'};border-radius:12px;padding:10px 12px;margin-bottom:8px;">
      <div style="font-size:11px;font-weight:800;color:${isMine?'#1a56db':'#374151'};margin-bottom:3px;">${esc(m.name||m.email)}</div>
      <div style="font-size:13px;color:#111;line-height:1.5;">${esc(m.text)}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:4px;">${m.time||''}</div>
    </div>`;
  }).join('');
  body.scrollTop = body.scrollHeight;
}

async function openAdminMsgs() {
  const modal = document.getElementById('adminMsgsModal');
  if (!modal) return;
  modal.style.display = 'flex';
  adminMsgsUnread = 0;
  const badge = document.getElementById('adminMsgsBadge');
  if (badge) badge.style.display = 'none';
  try {
    const r = await fetch(BACKEND + '/admin_msgs_get?t=' + Date.now());
    const d = await r.json();
    if (d.status === 'ok') renderAdminMsgs(d.msgs || []);
  } catch(e) {
    const body = document.getElementById('adminMsgsBody');
    if (body) body.innerHTML = '<div style="color:red;text-align:center;">שגיאה בטעינה</div>';
  }
  const sendRow = document.getElementById('adminMsgsSendRow');
  if (sendRow) sendRow.style.display = isSuperAdmin() ? 'flex' : 'none';
}

function closeAdminMsgs() {
  const modal = document.getElementById('adminMsgsModal');
  if (modal) modal.style.display = 'none';
}

async function sendAdminMsg() {
  if (!isSuperAdmin()) return;
  const inp = document.getElementById('adminMsgInput');
  const text = (inp?.value || '').trim();
  if (!text) return;
  inp.value = ''; inp.style.height = 'auto';
  try {
    const r = await fetch(BACKEND + '/admin_msgs_add', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ email: me.email, name: _allowedMap[me.email.toLowerCase()]?.name || me.name, text })
    });
    const d = await r.json();
    if (d.status === 'ok') renderAdminMsgs(d.msgs || []);
  } catch(e) {}
}

async function openManageAdmins() {
  document.getElementById('manageAdminsModal').style.display = 'flex';
  document.getElementById('adminMsgResult').style.display = 'none';
  await renderAdminsList();
}

function closeManageAdmins() {
  document.getElementById('manageAdminsModal').style.display = 'none';
}

async function renderAdminsList() {
  const list = document.getElementById('adminsList');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;"><i class="fas fa-spinner fa-spin"></i> טוען...</div>';
  try {
    const r = await fetch(BACKEND + '/allowed_list?t=' + Date.now());
    const d = await r.json();
    const users = (d.emails || []).filter(e => typeof e === 'object' && e.email);
    if (!users.length) { list.innerHTML = '<div style="text-align:center;padding:20px;color:#aaa;font-size:13px;">אין יוצרים/צוות עדיין</div>'; return; }
    
    list.innerHTML = users.map(u => {
      const pic = u.picture ? `<img src="${escAttr(u.picture)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;">` : `<div style="width:36px;height:36px;border-radius:50%;background:#1a56db;color:#fff;font-size:14px;font-weight:800;display:flex;align-items:center;justify-content:center;">${esc((u.name||u.email||'?')[0].toUpperCase())}</div>`;
      const isBoss = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      const roleLabel = isBoss ? 'בעל האתר' : 'כותב מורשה';
      const roleBadgeColor = isBoss ? '#7c3aed' : '#059669';
      const canDelete = isSuperAdmin() && !isBoss;
      const isMe = u.email === me?.email?.toLowerCase();
      
      return `<div style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;background:#f9fafb;border:1px solid #f0f0f0;">
        ${pic}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:800;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(u.name||u.email)}${isMe?' <span style="font-size:10px;color:#aaa;">(אני)</span>':''}</div>
          <div style="font-size:11px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(u.email)}</div>
          <div style="font-size:10px;font-weight:800;color:${roleBadgeColor};margin-top:2px;">${roleLabel}</div>
        </div>
        ${canDelete ? `<button onclick="removeAdmin('${escAttr(u.email)}')" title="הסר מהצוות" style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:5px 10px;cursor:pointer;color:#dc2626;font-size:11px;font-weight:700;font-family:'Heebo',sans-serif;flex-shrink:0;"><i class="fas fa-trash" style="font-size:10px;"></i></button>` : ''}
      </div>`;
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="color:red;text-align:center;">שגיאה בטעינה</div>';
  }
}

async function addAdmin() {
  const email = document.getElementById('newAdminEmail')?.value.trim().toLowerCase();
  const name = document.getElementById('newAdminName')?.value.trim();
  if (!email || !name) { showAdminMsg('יש למלא אימייל ושם', 'red'); return; }
  if (!email.includes('@')) { showAdminMsg('אימייל לא תקין', 'red'); return; }
  try {
    const r = await fetch(BACKEND + '/allowed_add', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ admin_email: me.email, email, name, slug: '', role: 'writer' })
    });
    const d = await r.json();
    if (d.status === 'success') {
      showAdminMsg('נוסף בהצלחה ✓', 'green');
      document.getElementById('newAdminEmail').value = '';
      document.getElementById('newAdminName').value = '';
      await loadAllowedMap();
      await renderAdminsList();
    } else {
      showAdminMsg(d.error || 'שגיאה', 'red');
    }
  } catch(e) { showAdminMsg('שגיאת שרת', 'red'); }
}

async function removeAdmin(targetEmail) {
  if (!isSuperAdmin()) return;
  if (!confirm(`להסיר את ${targetEmail} מהצוות?`)) return;
  try {
    const r = await fetch(BACKEND + '/allowed_remove', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      // התיקון: שונה מ-target_email ל-email
      body: JSON.stringify({ admin_email: me.email, email: targetEmail }) 
    });
    const d = await r.json();
    if (d.status === 'success' || d.status === 'ok') {
      await new Promise(r => setTimeout(r, 400));
      await loadAllowedMap();
      await renderAdminsList();
      showAdminMsg('הוסר בהצלחה', 'green');
    } else { showAdminMsg(d.error || 'שגיאה', 'red'); }
  } catch(e) { showAdminMsg('שגיאת שרת', 'red'); }
}

function showAdminMsg(txt, color) {
  const el = document.getElementById('adminMsgResult');
  if (!el) return;
  el.textContent = txt;
  el.style.color = color === 'green' ? '#16a34a' : '#dc2626';
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3000);
}

function updateEmailCountBadge(count) {
  const badge = document.getElementById('hdrEmailCountBadge');
  if(!badge) return;
  if(count && count > 0) {
    badge.textContent = count > 999 ? '999+' : count;
    badge.style.display = 'block';
  }
}

function initGoogle() {
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogle,
    auto_select: true
  });
  const saved = loadSavedUser();
  if (saved) { verifyAndLogin(saved); return; }
  google.accounts.id.renderButton(
    document.getElementById('googleBtn'),
    { theme: 'outline', size: 'large', locale: 'he', width: 240 }
  );
  google.accounts.id.prompt();
}

function tryInitGoogle() {
  if (window.google && window.google.accounts) { initGoogle(); }
  else { setTimeout(tryInitGoogle, 100); }
}
setInterval(pollAll, 3000);

async function checkUrlForCreator() {
  const urlParams = new URLSearchParams(window.location.search);
  const creatorSlug = urlParams.get('creator');
  if (creatorSlug) {
    // ממתין מעט שהיוצרים ייטענו ואז עובר ליוצר הספציפי
    setTimeout(() => {
        switchToCreator(creatorSlug);
    }, 1500);
  }
}
window.addEventListener('load', checkUrlForCreator);

if (document.readyState === 'complete') {
  tryInitGoogle();
} else {
  window.addEventListener('load', tryInitGoogle);
}

/* ===== CREATORS SIDEBAR ===== */
function renderCreatorsSidebar(admins) {
  const list = document.getElementById('creatorsList');
  if (!list || !admins) return;
  const creators = admins.filter(a => typeof a === 'object' && a.email);
  if (!creators.length) {
    list.innerHTML = '<div style="padding:10px 15px;font-size:12px;color:#aaa;">אין יוצרים עדיין</div>';
    return;
  }
  const colorPalette = ['#1a56db','#7c3aed','#059669','#e02020','#d97706','#0891b2','#db2777'];
  list.innerHTML = creators.map(creator => {
    const name = creator.name || creator.displayName || '?';
    const initials = name.charAt(0).toUpperCase();
    const color = colorPalette[Math.abs(initials.charCodeAt(0)) % colorPalette.length];
    const pic = creator.picture || creator.photoURL || creator.avatar || '';
    const avInner = pic
      ? `<img src="${escAttr(pic)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'">`
      : initials;
    const avStyle = pic ? '' : `background:${color};`;
    
    // תיקון: אם חסר סלאג, ניקח אוטומטית את תחילת האימייל כזיהוי ייחודי
    const slug = creator.slug || creator.email.split('@')[0];
    
    const badge = (creator.role === 'supervisor') ? '<span class="creator-badge">מנהל</span>' : '';
    return `<div class="creator-item" onclick="switchToCreator('${escAttr(slug)}')" data-slug="${escAttr(slug)}">
      <div class="creator-av" style="${avStyle}">${avInner}</div>
      <span class="creator-name">${esc(name)}</span>
      ${badge}
    </div>`;
  }).join('');
}

async function switchToCreator(slug) {
  document.querySelectorAll('.creator-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
  currentChannelId = 'general'; // חוזרים לערוץ הרשמי אבל מסננים עליו

  if (!slug) return;
  const el = document.querySelector('.creator-item[data-slug="' + slug + '"]');
  if (el) el.classList.add('active');
  if (window.innerWidth <= 900) document.getElementById('leftSidebar').classList.remove('open');

  // משיכת היוצרים כדי למצוא את המייל של היוצר הספציפי
  const lr = await fetch(BACKEND + '/allowed_list?t=' + Date.now());
  const ld = await lr.json();
  
  // זיהוי לפי סלאג מוגדר או לפי תחילת אימייל (אם הסלאג ריק)
  const creator = (ld.emails || []).find(e => typeof e === 'object' && (e.slug === slug || e.email.split('@')[0] === slug));
  const creatorEmail = creator ? creator.email.toLowerCase() : null;
  const creatorName = creator ? creator.name : 'יוצר';

  // עדכון כותרת הפיד למעלה
  const hdrName = document.getElementById('hdrChannelName');
  if (hdrName) hdrName.innerHTML = `${esc(siteGlobalSettings.title)} - <span style="color:#1a56db">הפוסטים של ${esc(creatorName)}</span>`;

  items = []; lastTs = 0; knownIds.clear(); oldestTs = 0; allLoaded = false;
  document.getElementById('feedInner').innerHTML = ''; document.getElementById('empty').style.display = 'block';
  applyWritePerm();

  setLoading(true);
  try{
    const r=await fetch(BACKEND+`/feed?channel=${currentChannelId}&limit=500&t=${Date.now()}`); const d=await r.json();
    if(d.status==='ok'){
      let allFeed = d.feed;
      // פה קורה הקסם: סינון רק לפוסטים של היוצר שעליו לחצנו
      if (creatorEmail) {
         allFeed = allFeed.filter(e => (e.senderEmail || '').toLowerCase() === creatorEmail);
      }
      
      items=[...allFeed].reverse(); items.forEach(e=>knownIds.add(e.id)); allLoaded=allFeed.length<20; oldestTs=items.length?Math.min(...items.map(e=>e.ts||Infinity)):0; lastTs=items.length?Math.max(...items.map(e=>e.ts||0)):0;
      const inner=document.getElementById('feedInner');
      inner.innerHTML=items.length?items.map(buildMsg).join(''):'';
      document.getElementById('empty').style.display=items.length?'none':'block';
      document.getElementById('feedWrap').scrollTop=999999;
      if(items.length)await pollAll();
    }
  }catch(e){} setLoading(false);
}
