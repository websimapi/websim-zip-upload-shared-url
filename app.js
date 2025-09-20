/* ...existing code... */
import dayjs from 'dayjs';

const fileInput = document.getElementById('fileInput');
const customIdInput = document.getElementById('customId');
const createBtn = document.getElementById('createBtn');
const statusEl = document.getElementById('status');
const generatedEl = document.getElementById('generated');
const finalUrlInput = document.getElementById('finalUrl');
const copyBtn = document.getElementById('copyBtn');
const mapList = document.getElementById('mapList');

const BASE_SHARE = window.location.origin + window.location.pathname;
const COLLECTION = 'zip_map_v2'; // new collection with case-insensitive uniqueness

function setStatus(msg, isError = false){
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#b00020' : '';
}

async function loadMyMappings(){
  console.log('Loading your mappings...');
  try{
    const room = new WebsimSocket();
    const currentUser = await window.websim.getCurrentUser();
    const list = room.collection(COLLECTION).filter({ username: currentUser.username }).getList() || [];
    renderList(list);
    room.collection(COLLECTION).filter({ username: currentUser.username }).subscribe(renderList);
  }catch(e){
    console.warn('Error loading mappings:', e);
  }
}

function renderList(list){
  mapList.innerHTML = '';
  if(!list.length){
    mapList.innerHTML = '<li class="muted">No mappings yet</li>';
    return;
  }
  // records from newest to oldest; show newest first
  list.forEach(rec => {
    const li = document.createElement('li');
    li.className = 'map-item';
    const left = document.createElement('div');
    left.innerHTML = `<div><strong>${rec.custom_id}</strong></div><div class="meta">${rec.file_name} • ${dayjs(rec.created_at).format('YYYY-MM-DD HH:mm')}</div>`;
    const right = document.createElement('div');
    const openBtn = document.createElement('button');
    openBtn.className = 'small-btn';
    openBtn.textContent = 'Open';
    openBtn.onclick = ()=> window.open(rec.file_url, '_blank');
    const copyShare = document.createElement('button');
    copyShare.className = 'small-btn';
    copyShare.textContent = 'Copy link';
    copyShare.onclick = ()=> {
      navigator.clipboard.writeText(`${BASE_SHARE}?url=${encodeURIComponent(rec.custom_id)}`);
    };
    const del = document.createElement('button');
    del.className = 'small-btn danger';
    del.textContent = 'Delete';
    del.onclick = async ()=>{
      try{
        const room = new WebsimSocket();
        await room.collection(COLLECTION).delete(rec.id);
      }catch(err){
        alert('Unable to delete: ' + err.message);
      }
    };
    right.appendChild(openBtn);
    right.appendChild(copyShare);
    right.appendChild(del);
    li.appendChild(left);
    li.appendChild(right);
    mapList.appendChild(li);
  });
}

function sanitizeId(s){
  return String(s || '').trim();
}

function validId(s){
  return /^[A-Za-z0-9_-]{3,48}$/.test(s);
}

// wait for first list emission
function getListOnce(collection){
  return new Promise((resolve)=>{
    const unsub = collection.subscribe((list)=>{ unsub(); resolve(list || []); });
  });
}

createBtn.addEventListener('click', async ()=>{
  console.log('"Create Link" button clicked.');
  setStatus('');
  if (typeof WebsimSocket === 'undefined') {
    const errorMsg = 'Error: Realtime service not available. Please refresh and try again.';
    console.error(errorMsg);
    setStatus(errorMsg, true);
    return;
  }
  if (!window.websim || typeof window.websim.upload !== 'function') {
    const errorMsg = 'Error: Upload service not available. Please refresh and try again.';
    console.error(errorMsg);
    setStatus(errorMsg, true);
    return;
  }
  const file = fileInput.files && fileInput.files[0];
  if(!file){
    console.warn('Validation failed: No file selected.');
    setStatus('Please choose a .zip file to upload', true);
    return;
  }
  if(!/\.zip$/i.test(file.name)){
    console.warn(`Validation failed: File "${file.name}" is not a .zip file.`);
    setStatus('File must be a .zip', true);
    return;
  }
  const customId = sanitizeId(customIdInput.value);
  if(!validId(customId)){
    console.warn(`Validation failed: Custom ID "${customId}" is invalid.`);
    setStatus('ID must be 3–48 chars, letters, numbers, - or _', true);
    return;
  }
  const customIdLc = customId.toLowerCase();
  console.log(`Validation passed. File: ${file.name}, Custom ID: ${customId}`);

  createBtn.disabled = true;
  generatedEl.hidden = true;
  setStatus('Checking availability...');
  try{
    const room = new WebsimSocket();
    console.log(`Checking for existing record with custom_id_lc: "${customIdLc}" in collection "${COLLECTION}"`);
    const existing = await getListOnce(room.collection(COLLECTION).filter({ custom_id_lc: customIdLc }));
    if(existing.length){
      console.warn(`ID "${customId}" is already taken.`);
      setStatus('That ID is already taken. Choose another.', true);
      createBtn.disabled = false;
      return;
    }
    console.log(`ID "${customId}" is available.`);

    setStatus('Uploading file...');
    console.log('Starting file upload...');
    const fileUrl = await window.websim.upload(file);
    console.log('File upload successful. URL:', fileUrl);

    setStatus('Saving mapping...');
    const payload = {
      custom_id: customId,
      custom_id_lc: customIdLc,
      file_url: fileUrl,
      file_name: file.name
    };
    console.log('Creating record in database with payload:', payload);
    const rec = await room.collection(COLLECTION).create(payload);
    console.log('Record created successfully:', rec);

    const shareableLink = `${BASE_SHARE}?url=${encodeURIComponent(customId)}`;
    finalUrlInput.value = shareableLink;
    generatedEl.hidden = false;
    setStatus('Created successfully.');
    console.log('Link generation complete. Shareable link:', shareableLink);
    // clear inputs
    fileInput.value = '';
    customIdInput.value = '';
  }catch(err){
    console.error('An error occurred during link creation:', err);
    setStatus('Error: ' + (err.message || 'An unknown error occurred.'), true);
  }finally{
    createBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', ()=> {
  if(finalUrlInput.value) navigator.clipboard.writeText(finalUrlInput.value);
});

customIdInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){ e.preventDefault(); createBtn.click(); }
});

// On page load: if ?url=ID present, look up and trigger download
(async function handleIncoming(){
  const params = new URLSearchParams(window.location.search);
  const idRaw = params.get('url');
  if(!idRaw) {
    console.log('No "url" parameter found. Loading user mappings.');
    loadMyMappings();
    return;
  }
  console.log(`Found "url" parameter: "${idRaw}". Attempting to trigger download.`);
  
  const mainContent = document.querySelector('.uploader');
  if(mainContent) mainContent.hidden = true;

  if (typeof WebsimSocket === 'undefined') {
    const errorMsg = 'Error: Realtime service not available to resolve the link. Please refresh and try again.';
    console.error(errorMsg);
    setStatus(errorMsg, true);
    return;
  }
  try{
    const id = String(idRaw).trim();
    const idLc = id.toLowerCase();
    console.log(`Looking for record with custom_id_lc: "${idLc}"`);
    const room = new WebsimSocket();
    // Prefer v2 (case-insensitive)
    let list = await getListOnce(room.collection(COLLECTION).filter({ custom_id_lc: idLc }));
    
    if(!list.length){
      console.log(`No record found in "${COLLECTION}". Falling back to legacy "zip_map" with custom_id: "${id}"`);
      list = await getListOnce(room.collection('zip_map').filter({ custom_id: id }));
    }

    if(!list.length){
      console.warn('No mapping found for the given ID.');
      setStatus('No file mapped to that ID', true);
      return;
    }

    const rec = list[0];
    console.log('Found record:', rec);
    console.log('Triggering download for URL:', rec.file_url);
    setStatus('Download will begin shortly...');

    // Trigger file download by creating anchor and click
    const a = document.createElement('a');
    a.href = rec.file_url;
    // recommend filename same as original
    a.download = rec.file_name || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give user feedback for a few seconds before potentially redirecting or cleaning up.
    setTimeout(() => {
        setStatus('Download started. You can now close this page.');
    }, 1500);
  }catch(err){
    console.error('Error handling incoming URL:', err);
    setStatus('Error fetching mapping: ' + err.message, true);
  }
})();
/* ...existing code... */