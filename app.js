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

const BASE_SHARE = (window.baseUrl || window.location.origin);

function setStatus(msg, isError = false){
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#b00020' : '';
}

async function loadMyMappings(){
  try{
    const room = new WebsimSocket();
    const currentUser = await window.websim.getCurrentUser();
    // fetch records created by current user (collection returns newest-first)
    const list = room.collection('zip_map').filter({ username: currentUser.username }).getList() || [];
    renderList(list);
    // subscribe to live updates
    room.collection('zip_map').filter({ username: currentUser.username }).subscribe(renderList);
  }catch(e){
    console.warn(e);
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
        await room.collection('zip_map').delete(rec.id);
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
  setStatus('');
  const file = fileInput.files && fileInput.files[0];
  if(!file){
    setStatus('Please choose a .zip file to upload', true);
    return;
  }
  if(!/\.zip$/i.test(file.name)){
    setStatus('File must be a .zip', true);
    return;
  }
  const customId = sanitizeId(customIdInput.value);
  if(!validId(customId)){
    setStatus('ID must be 3–48 chars, letters, numbers, - or _', true);
    return;
  }

  createBtn.disabled = true;
  setStatus('Checking availability...');
  try{
    const room = new WebsimSocket();
    // check uniqueness (wait for initial load)
    const existing = await getListOnce(room.collection('zip_map').filter({ custom_id: customId }));
    if(existing.length){
      setStatus('That ID is already taken. Choose another.', true);
      createBtn.disabled = false;
      return;
    }

    setStatus('Uploading file...');
    const fileUrl = await window.websim.upload(file);

    setStatus('Saving mapping...');
    const rec = await room.collection('zip_map').create({
      custom_id: customId,
      file_url: fileUrl,
      file_name: file.name
    });

    finalUrlInput.value = `${BASE_SHARE}?url=${encodeURIComponent(customId)}`;
    generatedEl.hidden = false;
    setStatus('Created successfully.');
    // clear inputs
    fileInput.value = '';
    customIdInput.value = '';
  }catch(err){
    console.error(err);
    setStatus('Error: ' + (err.message || err), true);
  }finally{
    createBtn.disabled = false;
  }
});

copyBtn.addEventListener('click', ()=> {
  if(finalUrlInput.value) navigator.clipboard.writeText(finalUrlInput.value);
});

// On page load: if ?url=ID present, look up and trigger download
(async function handleIncoming(){
  const params = new URLSearchParams(window.location.search);
  const id = params.get('url');
  if(!id) {
    // not a direct download request; initialize UI
    loadMyMappings();
    return;
  }

  // attempt to find mapping and trigger download
  try{
    const room = new WebsimSocket();
    const list = await getListOnce(room.collection('zip_map').filter({ custom_id: id }));
    if(!list.length){
      setStatus('No file mapped to that ID', true);
      return;
    }
    const rec = list[0]; // should be unique
    // Trigger file download by creating anchor and click
    const a = document.createElement('a');
    a.href = rec.file_url;
    // recommend filename same as original
    a.download = rec.file_name || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Download started...');
  }catch(err){
    setStatus('Error fetching mapping: ' + err.message, true);
  }
})();
/* ...existing code... */