const samplePhotos=Array.from({length:50},(_,i)=>`sample/Photos/40864709_${i+1}.jpg`);
const sample={id:'sample-oak-knoll',listingId:'40864709',address:'2 OAK KNOLL Drive',tags:[],cover:samplePhotos[0],photos:samplePhotos,floorplans:[{name:'Ground Floor',url:'sample/Floorplans/ground_floor_487.jpg'},{name:'2nd Floor',url:'sample/Floorplans/2nd_floor_558.jpg'},{name:'3rd Floor',url:'sample/Floorplans/3rd_floor_745.jpg'},{name:'Basement',url:'sample/Floorplans/basement_166.jpg'}],listing:[{name:'Full-page listing screenshot',url:'sample/Listing/screencapture-realtor-ca-real-estate-30301826-2-oak-knoll-drive-hamilton-2026-09-19-10_30_33.png'},{name:'Listing PDF',url:'sample/Listing/36277012-18b6-4546-9422-ed69d5c5f05b.pdf'}],listingUrl:'',videoUrl:'https://tours.vogelcreative.ca/2oakknolldrive',videoFiles:[],favorite:false,notes:'',addedAt:0};

let properties=[sample],viewMode='all',activeTag='';
let sortMode=localStorage.getItem('listing-library:sort')||'newest';
const $=s=>document.querySelector(s),grid=$('#grid'),lib=$('#libraryView'),detailView=$('#detailView'),back=$('#back');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fold=s=>String(s??'').trim().toLocaleLowerCase();
const appBase=()=>`${location.pathname}${location.search}`;
const slugify=s=>String(s??'').trim().toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const propertySlug=p=>slugify(p.id||p.address);
const propertyUrl=p=>`${appBase()}#property/${encodeURIComponent(propertySlug(p))}`;


// Remember the user's chosen library directory in IndexedDB. File-system handles
// can be persisted by Chromium-based browsers, while permission remains under
// the browser's control.
const HANDLE_DB='listing-library-handles',HANDLE_STORE='settings',HANDLE_KEY='libraryRoot';
let rememberedRoot=null,libraryConnected=false;
function openHandleDB(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(HANDLE_DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(HANDLE_STORE))req.result.createObjectStore(HANDLE_STORE)};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function storeRootHandle(handle){
  try{
    const db=await openHandleDB();
    await new Promise((resolve,reject)=>{const tx=db.transaction(HANDLE_STORE,'readwrite');tx.objectStore(HANDLE_STORE).put(handle,HANDLE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
    db.close();rememberedRoot=handle;return true;
  }catch(e){console.warn('Could not remember the library folder.',e);return false}
}
async function loadRootHandle(){
  try{
    const db=await openHandleDB();
    const value=await new Promise((resolve,reject)=>{const tx=db.transaction(HANDLE_STORE,'readonly');const req=tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});
    db.close();return value;
  }catch(e){console.warn('Could not load the remembered library folder.',e);return null}
}
async function handlePermission(handle,request=false){
  if(!handle)return'denied';
  try{
    const opts={mode:'readwrite'};
    let state=await handle.queryPermission(opts);
    if(state==='granted'||!request)return state;
    return await handle.requestPermission(opts);
  }catch(e){console.warn('Could not check library folder permission.',e);return'denied'}
}
function setLibraryButton(state){
  const btn=$('#openLibrary'),add=$('#addProperty');
  btn.textContent=state==='connected'?'Change Library':state==='reconnect'?'Reconnect Library':'Open Library';
  btn.dataset.libraryState=state;
  add.disabled=state!=='connected';
}
function hashPropertySlug(){const m=location.hash.match(/^#property\/(.+)$/);if(!m)return'';try{return decodeURIComponent(m[1])}catch{return m[1]}}
function findPropertyBySlug(slug){return properties.find(p=>propertySlug(p)===slug)}

function metaKey(p){return `listing-library:${p.address}`}
function parseAddedAt(value){
  if(typeof value==='string'){const n=Date.parse(value);return Number.isFinite(n)?n:0}
  const n=Number(value);return Number.isFinite(n)?n:0;
}
function applyMeta(p,m={}){
  Object.assign(p,{tags:Array.isArray(m.tags)?m.tags:(p.tags||[]),notes:typeof m.notes==='string'?m.notes:(p.notes||''),favorite:typeof m.favorite==='boolean'?m.favorite:!!p.favorite,addedAt:parseAddedAt(m.addedAt)||p.addedAt||0,listingUrl:typeof m.listingUrl==='string'?m.listingUrl:(p.listingUrl||''),videoUrl:typeof m.videoUrl==='string'?m.videoUrl:(p.videoUrl||'')});
}
function localMetaPayload(p){return {tags:p.tags||[],notes:p.notes||'',favorite:!!p.favorite,addedAt:Number(p.addedAt)||0,listingUrl:p.listingUrl||'',videoUrl:p.videoUrl||''}}
function folderMetaPayload(p){return {version:1,favorite:!!p.favorite,tags:p.tags||[],notes:p.notes||'',addedAt:p.addedAt?new Date(Number(p.addedAt)).toISOString():null,listingUrl:p.listingUrl||'',videoUrl:p.videoUrl||''}}
function loadLocalMeta(p){
  try{applyMeta(p,JSON.parse(localStorage.getItem(metaKey(p))||'{}'))}catch{}
}
function cacheMeta(p){
  try{localStorage.setItem(metaKey(p),JSON.stringify(localMetaPayload(p)))}catch{}
}
async function loadFolderMeta(p,dir){
  try{
    const handle=await dir.getFileHandle('property.json');
    const file=await handle.getFile();
    const data=JSON.parse(await file.text());
    applyMeta(p,data);p._metaFileExists=true;cacheMeta(p);return true;
  }catch(e){
    if(e?.name==='NotFoundError')return false;
    p._metaReadError=true;console.warn(`Could not read ${p.address}/property.json`,e);return false;
  }
}
async function writeFolderMeta(p){
  if(!p._dirHandle||p._metaReadError)return false;
  const handle=await p._dirHandle.getFileHandle('property.json',{create:true});
  const writable=await handle.createWritable();
  await writable.write(JSON.stringify(folderMetaPayload(p),null,2)+'\n');
  await writable.close();p._metaFileExists=true;return true;
}
function saveMeta(p){
  cacheMeta(p);
  if(!p._dirHandle||p._metaReadError)return Promise.resolve(false);
  const previous=p._writeChain||Promise.resolve();
  p._writeChain=previous.catch(()=>{}).then(()=>writeFolderMeta(p));
  return p._writeChain.catch(e=>{console.warn(`Could not save ${p.address}/property.json`,e);return false});
}
loadLocalMeta(sample);

function canonicalTags(){
  const seen=new Map();
  properties.flatMap(p=>p.tags||[]).forEach(tag=>{const key=fold(tag);if(key&&!seen.has(key))seen.set(key,String(tag).trim())});
  return [...seen.values()];
}
function tagStats(){
  const stats=new Map();
  properties.forEach(p=>(p.tags||[]).forEach(tag=>{
    const key=fold(tag);if(!key)return;
    const old=stats.get(key)||{tag:String(tag).trim(),count:0};old.count++;stats.set(key,old);
  }));
  return [...stats.values()].sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag));
}
function canonicalizeTag(raw){
  const value=String(raw??'').trim();if(!value)return'';
  const existing=canonicalTags().find(t=>fold(t)===fold(value));
  return existing||value;
}
function uniqueTags(tags){
  const out=[];
  tags.forEach(raw=>{const tag=canonicalizeTag(raw);if(tag&&!out.some(x=>fold(x)===fold(tag)))out.push(tag)});
  return out;
}
function updateTagFilter(){
  const select=$('#tagFilter'),current=activeTag;
  const tags=canonicalTags().sort((a,b)=>a.localeCompare(b));
  select.innerHTML='<option value="">All tags</option>'+tags.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  const match=tags.find(t=>fold(t)===fold(current));activeTag=match||'';select.value=activeTag;
}
function addressSortParts(address=''){
  const full=String(address).trim();
  const match=full.match(/^(\d+(?:[-–]\d+)?[A-Za-z]?)\s+(.+)$/);
  if(!match)return {street:full,number:Number.MAX_SAFE_INTEGER,full};
  return {street:match[2].trim(),number:parseInt(match[1],10),full};
}
function compareStreetAddress(a,b){
  const aa=addressSortParts(a.address),bb=addressSortParts(b.address);
  const street=aa.street.localeCompare(bb.street,undefined,{numeric:true,sensitivity:'base'});
  if(street)return street;
  const number=aa.number-bb.number;
  if(number)return number;
  return aa.full.localeCompare(bb.full,undefined,{numeric:true,sensitivity:'base'});
}
function sortProperties(list){
  return [...list].sort((a,b)=>{
    if(sortMode==='az')return compareStreetAddress(a,b);
    if(sortMode==='za')return -compareStreetAddress(a,b);
    return (Number(b.addedAt)||0)-(Number(a.addedAt)||0)||compareStreetAddress(a,b);
  });
}
function render(){
  updateTagFilter();
  const q=fold($('#search').value);
  let shown=properties.filter(p=>(viewMode!=='favourites'||p.favorite)&&(!activeTag||(p.tags||[]).some(t=>fold(t)===fold(activeTag)))&&(`${p.address} ${(p.tags||[]).join(' ')}`.toLocaleLowerCase().includes(q)));
  shown=sortProperties(shown);
  $('#libraryHeading').textContent=viewMode==='favourites'?'Favourites':'Properties';
  $('#count').textContent=`${shown.length} ${shown.length===1?'property':'properties'}`;
  $('#allView').classList.toggle('active',viewMode==='all');
  $('#favView').classList.toggle('active',viewMode==='favourites');
  $('#sortSelect').value=sortMode;
  grid.innerHTML=shown.map(p=>`<article class="card" data-id="${esc(p.id)}"><div class="cover ${p.cover?'':'emptyCover'}" ${p.cover?`style="background-image:url('${p.cover}')"`:''}>${p.cover?'':'<span>No photos yet</span>'}<button class="heart" data-fav="${esc(p.id)}" aria-label="${p.favorite?'Remove from favourites':'Add to favourites'}">${p.favorite?'♥':'♡'}</button></div><div class="cardBody"><h3>${esc(p.address)}</h3>${p.tags?.length?`<div class="cardTags">${p.tags.slice(0,3).map(t=>`<span>${esc(t)}</span>`).join('')}</div>`:''}</div></article>`).join('');
}

grid.onclick=e=>{
  const f=e.target.closest('[data-fav]');
  if(f){e.stopPropagation();const p=properties.find(x=>x.id===f.dataset.fav);if(!p)return;p.favorite=!p.favorite;saveMeta(p);render();return}
  const c=e.target.closest('.card');if(c){const p=properties.find(x=>x.id===c.dataset.id);if(p)openProperty(p,{historyMode:'push'})}
};

function detailTagsMarkup(p){
  return (p.tags||[]).length?`<div class="detailTags">${p.tags.map(t=>`<button class="tagChip" data-detail-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>`:'';
}
function showLibrary({historyMode='none'}={}){
  detailView.classList.add('hidden');lib.classList.remove('hidden');back.classList.add('hidden');
  if(historyMode==='push')history.pushState({listingLibrary:true,view:'library'},'',appBase());
  else if(historyMode==='replace')history.replaceState({listingLibrary:true,view:'library'},'',appBase());
  render();
}
function openProperty(p,{historyMode='none',initialTab=''}={}){
  if(historyMode==='push')history.pushState({listingLibrary:true,view:'property',slug:propertySlug(p)},'',propertyUrl(p));
  else if(historyMode==='replace')history.replaceState({listingLibrary:true,view:'property',slug:propertySlug(p)},'',propertyUrl(p));
  lib.classList.add('hidden');detailView.classList.remove('hidden');back.classList.remove('hidden');
  const chips=[p.listingId?`<span class="chip">Listing ${esc(p.listingId)}</span>`:'',p.photos?.length?`<span class="chip">${p.photos.length} photos</span>`:'',p.floorplans?.length?`<span class="chip">${p.floorplans.length} floorplans</span>`:''].filter(Boolean).join('');
  const hasVideo=!!(p.videoUrl||(p.videoFiles||[]).length);
  const hasListing=!!((p.listing||[]).length||p.listingUrl);
  const isEmpty=!(p.photos?.length||p.floorplans?.length||hasListing||hasVideo);
  const tabs=[['photos','Photos',p.photos?.length],['floorplans','Floorplans',p.floorplans?.length],['listing','Listing',hasListing],['video','Video',hasVideo],['details','Details',true],['intake','Add Files',!!p._dirHandle]].filter(x=>x[2]);
  const heroStyle=p.cover?` style="background-image:url('${p.cover}')"`:'';
  detailView.innerHTML=`<div class="hero ${p.cover?'':'emptyHero'}"${heroStyle}><div class="heroText"><h2>${esc(p.address)}</h2></div></div><div class="detailTop"><div><div class="chips">${chips}</div><div id="detailTagsSlot">${detailTagsMarkup(p)}</div></div><button class="secondary" id="detailFav">${p.favorite?'♥ Favourite':'♡ Favourite'}</button></div><nav class="tabs">${tabs.map(x=>`<button class="tab" data-tab="${x[0]}">${x[1]}</button>`).join('')}</nav><div id="panel"></div>`;
  const panel=$('#panel'),tagSlot=$('#detailTagsSlot');

  function wireDetailTagClicks(){
    tagSlot.onclick=e=>{const b=e.target.closest('[data-detail-tag]');if(!b)return;activeTag=b.dataset.detailTag;viewMode='all';showLibrary({historyMode:'push'})};
  }
  wireDetailTagClicks();

  async function refreshCurrent(tabName='intake'){
    const fresh=await scanProperty(p._dirHandle),idx=properties.findIndex(x=>x.id===p.id);
    if(idx>=0)properties[idx]=fresh;
    openProperty(fresh,{historyMode:'none',initialTab:tabName});
  }

  function tab(name){
    document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name));
    if(name==='photos')panel.innerHTML=`<div class="gallery">${p.photos.map((x,i)=>`<img src="${x}" loading="lazy" data-viewer="photos" data-index="${i}" tabindex="0" alt="Property photo ${i+1}">`).join('')}</div>`;
    if(name==='floorplans')panel.innerHTML=`<div class="gallery floorplans">${p.floorplans.map((x,i)=>`<figure><img src="${x.url}" loading="lazy" data-viewer="floorplans" data-index="${i}" tabindex="0" alt="${esc(x.name)}"><figcaption>${esc(x.name)}</figcaption></figure>`).join('')}</div>`;
    if(name==='listing')panel.innerHTML=`${p.listingUrl?`<div class="fileCard"><span>Listing page</span><a href="${esc(p.listingUrl)}" target="_blank" rel="noopener">Open ↗</a></div>`:''}${(p.listing||[]).map(x=>`<div class="fileCard"><span>${esc(x.name)}</span><a href="${x.url}" target="_blank">Open ↗</a></div>`).join('')}`;
    if(name==='video')panel.innerHTML=`${p.videoUrl?`<div class="fileCard"><span>Property video / virtual tour</span><a href="${esc(p.videoUrl)}" target="_blank" rel="noopener">Open video ↗</a></div>`:''}${(p.videoFiles||[]).map(x=>`<div class="fileCard"><span>${esc(x.name)}</span><a href="${x.url}" target="_blank">Open ↗</a></div>`).join('')}`;
    if(name==='details')panel.innerHTML=`<div class="notes"><div class="fieldGroup"><div class="fieldHeading">Tags</div><div class="tagEditor"><div id="assignedTags" class="assignedTags"></div><div class="tagInputWrap"><input id="tagInput" type="text" autocomplete="off" placeholder="Add a tag"><div id="tagSuggestions" class="tagSuggestions hidden"></div></div></div></div><label class="fieldLabel">Notes<textarea id="notes" placeholder="Add notes about this property…">${esc(p.notes||'')}</textarea></label><div class="saveStatus" id="saveStatus">${p._dirHandle&&!p._metaReadError?'Saved to property.json':'Saved locally in this browser'}</div></div>`;
    if(name==='intake')panel.innerHTML=`<section class="intake"><div class="intakeIntro"><h3>${isEmpty?'Add files to this property':'Add more files'}</h3><p>Choose files or drag them onto a section. Listing Library copies them into this property's archive folders.</p></div><div class="intakeGrid"><div class="dropZone" data-folder="Photos"><strong>Photos</strong><span>JPG, PNG or WebP</span><label class="uploadButton">Choose photos<input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" data-upload="Photos"></label></div><div class="dropZone" data-folder="Floorplans"><strong>Floorplans</strong><span>JPG, PNG or WebP</span><label class="uploadButton">Choose floorplans<input type="file" hidden multiple accept="image/jpeg,image/png,image/webp" data-upload="Floorplans"></label></div><div class="dropZone" data-folder="Listing"><strong>Listing</strong><span>PDF, image or saved page</span><label class="uploadButton">Choose listing files<input type="file" hidden multiple accept="application/pdf,image/*,.html,.htm" data-upload="Listing"></label></div><div class="dropZone" data-folder="Video"><strong>Video</strong><span>MOV, MP4, M4V or WebM</span><label class="uploadButton">Choose video files<input type="file" hidden multiple accept="video/mp4,video/quicktime,video/webm,.m4v" data-upload="Video"></label></div></div><div class="urlGrid"><label>Listing URL<input id="listingUrlInput" type="url" placeholder="https://…" value="${esc(p.listingUrl||'')}"></label><button class="secondary" id="saveListingUrl">Save URL</button><label>Video / tour URL<input id="videoUrlInput" type="url" placeholder="https://…" value="${esc(p.videoUrl||'')}"></label><button class="secondary" id="saveVideoUrl">Save URL</button></div><div class="saveStatus" id="intakeStatus"></div></section>`;
    wireViewers();if(name==='details')wireMeta();if(name==='intake')wireIntake();
  }

  function wireMeta(){
    const input=$('#tagInput'),assigned=$('#assignedTags'),suggestions=$('#tagSuggestions'),status=$('#saveStatus'),notes=$('#notes');
    let notesTimer;
    const persist=async()=>{
      p.tags=uniqueTags(p.tags||[]);p.notes=notes.value;cacheMeta(p);
      if(p._dirHandle&&!p._metaReadError)status.textContent='Saving to property.json…';
      const savedToFolder=await saveMeta(p);
      status.textContent=savedToFolder?'Saved to property.json':(p._metaReadError?'property.json could not be read — saved locally':'Saved locally in this browser');
      tagSlot.innerHTML=detailTagsMarkup(p);wireDetailTagClicks();
    };
    const save=()=>{clearTimeout(notesTimer);persist()};
    const renderAssigned=()=>{assigned.innerHTML=(p.tags||[]).map((t,i)=>`<span class="assignedTag">${esc(t)}<button type="button" data-remove-tag="${i}" aria-label="Remove ${esc(t)}">×</button></span>`).join('')};
    const suggested=()=>{
      const q=fold(input.value),selected=new Set((p.tags||[]).map(fold));
      return tagStats().filter(x=>!selected.has(fold(x.tag))&&(!q||fold(x.tag).includes(q))).slice(0,7);
    };
    const renderSuggestions=()=>{
      const items=suggested();
      suggestions.innerHTML=items.map(x=>`<button type="button" data-suggest-tag="${esc(x.tag)}"><span>${esc(x.tag)}</span>${x.count>1?`<small>${x.count}</small>`:''}</button>`).join('');
      suggestions.classList.toggle('hidden',items.length===0||document.activeElement!==input);
    };
    const addTag=raw=>{
      const tag=canonicalizeTag(raw);if(!tag)return;
      if(!(p.tags||[]).some(t=>fold(t)===fold(tag)))p.tags=[...(p.tags||[]),tag];
      input.value='';renderAssigned();save();renderSuggestions();
    };
    assigned.onclick=e=>{const b=e.target.closest('[data-remove-tag]');if(!b)return;p.tags.splice(Number(b.dataset.removeTag),1);renderAssigned();save();renderSuggestions()};
    suggestions.onpointerdown=e=>{const b=e.target.closest('[data-suggest-tag]');if(!b)return;e.preventDefault();addTag(b.dataset.suggestTag);input.focus()};
    input.addEventListener('focus',renderSuggestions);
    input.addEventListener('blur',()=>setTimeout(()=>suggestions.classList.add('hidden'),80));
    input.addEventListener('input',()=>{
      if(input.value.includes(',')){const bits=input.value.split(','),tail=bits.pop();bits.forEach(addTag);input.value=tail||''}
      renderSuggestions();
    });
    input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();const first=suggested()[0];addTag(input.value.trim()||(first?.tag||''))}else if(e.key==='Escape'){suggestions.classList.add('hidden')}});
    notes.addEventListener('input',()=>{p.notes=notes.value;cacheMeta(p);if(p._dirHandle&&!p._metaReadError)status.textContent='Saving to property.json…';clearTimeout(notesTimer);notesTimer=setTimeout(persist,450)});
    notes.addEventListener('blur',()=>{clearTimeout(notesTimer);persist()});renderAssigned();
  }

  function wireIntake(){
    const status=$('#intakeStatus');
    const upload=async(folder,files)=>{
      const list=[...files];if(!list.length)return;
      status.textContent=`Adding ${list.length} ${list.length===1?'file':'files'}…`;
      try{for(const file of list)await copyFileIntoProperty(p,folder,file);status.textContent='Files added.';await refreshCurrent('intake')}catch(e){console.error(e);status.textContent='Could not add one or more files.'}
    };
    panel.querySelectorAll('[data-upload]').forEach(input=>input.addEventListener('change',()=>upload(input.dataset.upload,input.files)));
    panel.querySelectorAll('.dropZone').forEach(zone=>{
      zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragOver')});
      zone.addEventListener('dragleave',()=>zone.classList.remove('dragOver'));
      zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragOver');upload(zone.dataset.folder,e.dataTransfer.files)});
    });
    $('#saveListingUrl').onclick=async()=>{status.textContent='Saving listing URL…';try{await savePropertyUrl(p,'listing',$('#listingUrlInput').value.trim());status.textContent='Listing URL saved.';await refreshCurrent('intake')}catch(e){console.error(e);status.textContent='Could not save that URL.'}};
    $('#saveVideoUrl').onclick=async()=>{status.textContent='Saving video URL…';try{await savePropertyUrl(p,'video',$('#videoUrlInput').value.trim());status.textContent='Video URL saved.';await refreshCurrent('intake')}catch(e){console.error(e);status.textContent='Could not save that URL.'}};
  }

  function wireViewers(){
    panel.querySelectorAll('[data-viewer]').forEach(img=>{
      const open=()=>{const items=img.dataset.viewer==='photos'?p.photos:p.floorplans.map(x=>x.url);openViewer(items,Number(img.dataset.index),img.dataset.viewer==='photos'?'Photo':'Floorplan')};
      img.addEventListener('click',open);img.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    });
  }

  const firstTab=initialTab&&tabs.some(x=>x[0]===initialTab)?initialTab:(isEmpty&&p._dirHandle?'intake':tabs[0][0]);
  tab(firstTab);
  document.querySelector('.tabs').onclick=e=>{if(e.target.dataset.tab)tab(e.target.dataset.tab)};
  $('#detailFav').onclick=()=>{p.favorite=!p.favorite;saveMeta(p);openProperty(p,{historyMode:'none',initialTab:firstTab})};
}

function openViewer(items,start=0,label='Photo'){
  let index=start;const overlay=document.createElement('div');overlay.className='viewer';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.innerHTML=`<button class="viewerClose" aria-label="Close viewer">×</button><button class="viewerNav viewerPrev" aria-label="Previous">‹</button><figure><img><figcaption></figcaption></figure><button class="viewerNav viewerNext" aria-label="Next">›</button>`;document.body.appendChild(overlay);
  const image=overlay.querySelector('img'),caption=overlay.querySelector('figcaption');
  const show=()=>{image.src=items[index];image.alt=`${label} ${index+1}`;caption.textContent=`${index+1} / ${items.length}`};
  const close=()=>{document.removeEventListener('keydown',keys);overlay.remove()};
  const move=d=>{index=(index+d+items.length)%items.length;show()};
  const keys=e=>{if(e.key==='Escape')close();else if(e.key==='ArrowLeft')move(-1);else if(e.key==='ArrowRight')move(1)};
  overlay.querySelector('.viewerClose').onclick=close;overlay.querySelector('.viewerPrev').onclick=e=>{e.stopPropagation();move(-1)};overlay.querySelector('.viewerNext').onclick=e=>{e.stopPropagation();move(1)};overlay.onclick=e=>{if(e.target===overlay)close()};overlay.querySelector('figure').onclick=e=>e.stopPropagation();document.addEventListener('keydown',keys);show();overlay.querySelector('.viewerClose').focus();
}

back.onclick=()=>showLibrary({historyMode:'push'});
window.addEventListener('popstate',()=>routeFromLocation());
$('#search').oninput=render;
$('#allView').onclick=()=>{viewMode='all';render()};
$('#favView').onclick=()=>{viewMode='favourites';render()};
$('#tagFilter').onchange=e=>{activeTag=e.target.value;render()};
$('#sortSelect').onchange=e=>{sortMode=e.target.value;localStorage.setItem('listing-library:sort',sortMode);render()};

function xmlEscape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function weblocContents(url){return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>URL</key><string>${xmlEscape(url)}</string></dict></plist>\n`}
async function fileExists(dir,name){try{await dir.getFileHandle(name);return true}catch(e){if(e?.name==='NotFoundError')return false;throw e}}
async function uniqueFileName(dir,name){
  if(!(await fileExists(dir,name)))return name;
  const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'';
  for(let i=2;i<1000;i++){const candidate=`${stem}-${i}${ext}`;if(!(await fileExists(dir,candidate)))return candidate}
  return `${stem}-${Date.now()}${ext}`;
}
async function writeTextFile(dir,name,text){const fh=await dir.getFileHandle(name,{create:true}),w=await fh.createWritable();await w.write(text);await w.close()}
async function copyFileIntoProperty(p,folder,file){
  if(!p._dirHandle)throw new Error('This property is not backed by a folder.');
  const target=await p._dirHandle.getDirectoryHandle(folder,{create:true}),name=await uniqueFileName(target,file.name),fh=await target.getFileHandle(name,{create:true}),w=await fh.createWritable();
  await w.write(file);await w.close();return name;
}
async function savePropertyUrl(p,type,url){
  if(url&&!/^https?:\/\//i.test(url))throw new Error('Use a full http or https URL.');
  if(type==='listing')p.listingUrl=url;else p.videoUrl=url;
  await saveMeta(p);
  if(p._dirHandle){const folder=await p._dirHandle.getDirectoryHandle(type==='listing'?'Listing':'Video',{create:true}),name=type==='listing'?'listing.webloc':'video.webloc';if(url)await writeTextFile(folder,name,weblocContents(url));else{try{await folder.removeEntry(name)}catch(e){if(e?.name!=='NotFoundError')throw e}}}
}
async function directoryExists(root,name){try{await root.getDirectoryHandle(name);return true}catch(e){if(e?.name==='NotFoundError')return false;throw e}}
function showAddPropertyDialog(){
  if(!libraryConnected||!rememberedRoot)return;
  const dialog=document.createElement('dialog');dialog.className='propertyDialog';dialog.innerHTML=`<form method="dialog"><div class="dialogHead"><h2>Add Property</h2><button type="button" class="dialogClose" aria-label="Close">×</button></div><label>Property address<input id="newPropertyAddress" type="text" autocomplete="off" placeholder="e.g. 24 ARKLEDUN Avenue" autofocus></label><p class="dialogHelp">Listing Library will create Photos, Floorplans, Listing and Video folders inside the property folder.</p><div id="dialogError" class="dialogError"></div><div class="dialogActions"><button type="button" class="secondary" data-cancel>Cancel</button><button type="submit" class="primary">Create Property</button></div></form>`;document.body.appendChild(dialog);
  const form=dialog.querySelector('form'),input=dialog.querySelector('#newPropertyAddress'),error=dialog.querySelector('#dialogError');
  const close=()=>dialog.close();dialog.querySelector('.dialogClose').onclick=close;dialog.querySelector('[data-cancel]').onclick=close;dialog.addEventListener('close',()=>dialog.remove());
  form.addEventListener('submit',async e=>{e.preventDefault();const address=input.value.trim();error.textContent='';if(!address){error.textContent='Enter a property address.';input.focus();return}if(/[\\/]/.test(address)){error.textContent='The address cannot contain / or \\.';return}try{if(await directoryExists(rememberedRoot,address)){error.textContent='A folder with that name already exists in this library.';return}const dir=await rememberedRoot.getDirectoryHandle(address,{create:true});for(const name of ['Photos','Floorplans','Listing','Video'])await dir.getDirectoryHandle(name,{create:true});const p={id:address,listingId:'',address,tags:[],photos:[],floorplans:[],listing:[],listingUrl:'',videoUrl:'',videoFiles:[],cover:'',favorite:false,notes:'',addedAt:Date.now(),_dirHandle:dir};await writeFolderMeta(p);cacheMeta(p);properties.push(p);dialog.close();render();openProperty(p,{historyMode:'push',initialTab:'intake'})}catch(err){console.error(err);error.textContent='Could not create the property folder.'}});
  dialog.showModal();setTimeout(()=>input.focus(),0);
}
$('#addProperty').onclick=showAddPropertyDialog;

function floorName(fn){
  const s=fn.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').toLowerCase();
  if(s.includes('ground'))return'Ground Floor';if(s.includes('basement'))return'Basement';if(s.match(/(^| )2(nd)?( |$)/))return'2nd Floor';if(s.match(/(^| )3(rd)?( |$)/))return'3rd Floor';if(s.match(/(^| )1(st)?( |$)/))return'1st Floor';return fn.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ');
}
async function scanProperty(dir){
  const p={id:dir.name,listingId:'',address:dir.name,tags:[],photos:[],floorplans:[],listing:[],listingUrl:'',videoUrl:'',videoFiles:[],favorite:false,notes:'',addedAt:0,_dirHandle:dir};
  const hasFolderMeta=await loadFolderMeta(p,dir);if(!hasFolderMeta)loadLocalMeta(p);
  for await(const [name,h] of dir.entries()){
    if(h.kind!=='directory')continue;const kind=name.toLowerCase();
    for await(const [fn,fh] of h.entries()){
      if(fh.kind!=='file')continue;const file=await fh.getFile();
      if(kind==='photos'&&/\.(jpe?g|png|webp)$/i.test(fn)){
        const url=URL.createObjectURL(file);p.photos.push({fn,url});if(!p.listingId){const m=fn.match(/^(\d+)_\d+\.[^.]+$/);if(m)p.listingId=m[1]}
      }else if(kind==='floorplans'&&/\.(jpe?g|png|webp)$/i.test(fn))p.floorplans.push({name:floorName(fn),url:URL.createObjectURL(file)});
      else if(kind==='listing'&&fn.toLowerCase().endsWith('.webloc')){const txt=await file.text();p.listingUrl=(txt.match(/<string>(https?:\/\/[^<]+)<\/string>/)||[])[1]||p.listingUrl}
      else if(kind==='listing')p.listing.push({name:fn,url:URL.createObjectURL(file)});
      else if(kind==='video'&&fn.toLowerCase().endsWith('.webloc')){const txt=await file.text();p.videoUrl=(txt.match(/<string>(https?:\/\/[^<]+)<\/string>/)||[])[1]||p.videoUrl}
      else if(kind==='video'&&/\.(mp4|mov|m4v|webm)$/i.test(fn))p.videoFiles.push({name:fn,url:URL.createObjectURL(file)});
    }
  }
  p.photos.sort((a,b)=>{const an=parseInt(a.fn.match(/_(\d+)\./)?.[1]),bn=parseInt(b.fn.match(/_(\d+)\./)?.[1]);if(Number.isFinite(an)&&Number.isFinite(bn))return an-bn;return a.fn.localeCompare(b.fn,undefined,{numeric:true,sensitivity:'base'})});
  p.photos=p.photos.map(x=>x.url);p.cover=p.photos[0]||'';return p;
}

async function scanLibraryRoot(root){
  const found=[],scanStamp=Date.now();let unseenOffset=0;
  for await(const [,h] of root.entries())if(h.kind==='directory'){
    const p=await scanProperty(h);
    if(p.photos.length||p.listing.length||p.floorplans.length||p.listingUrl||p.videoUrl||p.videoFiles.length||p._metaFileExists){
      if(!p.addedAt)p.addedAt=scanStamp-(unseenOffset++);
      if(!p._metaFileExists&&!p._metaReadError)await saveMeta(p);
      else cacheMeta(p);
      found.push(p);
    }
  }
  properties=found;activeTag='';rememberedRoot=root;libraryConnected=true;setLibraryButton('connected');routeFromLocation({replaceCurrent:true});return true;
}

$('#openLibrary').onclick=async()=>{
  if(!window.showDirectoryPicker){alert('Folder access is not supported in this browser. Try Chrome or Edge on desktop.');return}
  try{
    const state=$('#openLibrary').dataset.libraryState;
    if(state==='reconnect'&&rememberedRoot){
      const permission=await handlePermission(rememberedRoot,true);
      if(permission==='granted'){await scanLibraryRoot(rememberedRoot);return}
    }
    const root=await showDirectoryPicker({mode:'readwrite'});
    await storeRootHandle(root);
    await scanLibraryRoot(root);
  }catch(e){if(e.name!=='AbortError')alert('Could not open that folder.')}
};

async function restoreRememberedLibrary(){
  if(!('indexedDB'in window)||!window.showDirectoryPicker)return;
  rememberedRoot=await loadRootHandle();
  if(!rememberedRoot){setLibraryButton('open');return}
  const permission=await handlePermission(rememberedRoot,false);
  if(permission==='granted'){
    try{await scanLibraryRoot(rememberedRoot)}catch(e){console.warn('Could not reopen the remembered library.',e);setLibraryButton('reconnect')}
  }else setLibraryButton('reconnect');
}

function routeFromLocation({replaceCurrent=false}={}){
  const slug=hashPropertySlug();
  if(slug){
    const p=findPropertyBySlug(slug);
    if(p){openProperty(p,{historyMode:replaceCurrent?'replace':'none'});return}
    // The URL may refer to a property in a folder-backed library that has not been opened yet.
    lib.classList.remove('hidden');detailView.classList.add('hidden');back.classList.add('hidden');render();
    if(replaceCurrent)history.replaceState({listingLibrary:true,view:'property',slug,pending:true},'',location.href);
    return;
  }
  showLibrary({historyMode:replaceCurrent?'replace':'none'});
}

routeFromLocation({replaceCurrent:true});
restoreRememberedLibrary();
