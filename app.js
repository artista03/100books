// ===== 設定 =====
const OWNER = 'artista03';
const REPO = '100books';
const BRANCH = 'main';
const FILE_PATH = 'books.json';

// ===== 状態 =====
let data = null;
let fileSha = null;
let saveTimer = null;

// ===== ユーティリティ =====
const $ = (sel) => document.querySelector(sel);
const statusEl = $('#status');

function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = 'show' + (isError ? ' error' : '');
  clearTimeout(statusEl._t);
  statusEl._t = setTimeout(() => statusEl.classList.remove('show'), 2000);
}

function getToken() {
  return localStorage.getItem('gh_token');
}

function setToken(token) {
  localStorage.setItem('gh_token', token);
}

function authHeaders() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

// ===== GitHub API =====
async function fetchBooks() {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}&t=${Date.now()}`;
  const res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const json = await res.json();
  fileSha = json.sha;
  // Base64デコード（UTF-8対応）
  const content = decodeURIComponent(
    Array.from(atob(json.content.replace(/\n/g, '')))
      .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join('')
  );
  return JSON.parse(content);
}

async function saveBooks() {
  if (!data) return;
  data.updatedAt = new Date().toISOString();
  const body = JSON.stringify(data, null, 2);
  // Base64エンコード（UTF-8対応）
  const encoded = btoa(
    encodeURIComponent(body).replace(/%([0-9A-F]{2})/g, (_, p) =>
      String.fromCharCode('0x' + p)
    )
  );
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE_PATH}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: `update reading status ${new Date().toISOString()}`,
      content: encoded,
      sha: fileSha,
      branch: BRANCH
    })
  });
  if (!res.ok) {
    if (res.status === 409) {
      showStatus('同期競合 → 最新を取得し直してください', true);
      throw new Error('Conflict');
    }
    throw new Error(`Save failed: ${res.status}`);
  }
  const json = await res.json();
  fileSha = json.content.sha;
  showStatus('保存しました');
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveBooks().catch(e => {
      console.error(e);
      showStatus('保存に失敗しました', true);
    });
  }, 500);
}

// ===== レンダリング =====
function render() {
  const list = $('#book-list');
  list.innerHTML = '';
  const categories = {};
  data.books.forEach(b => {
    if (!categories[b.category]) categories[b.category] = [];
    categories[b.category].push(b);
  });

  for (const [cat, books] of Object.entries(categories)) {
    const section = document.createElement('section');
    section.className = 'category';
    const readCount = books.filter(b => b.read).length;
    section.innerHTML = `<h2>${cat}<span class="cat-count">${readCount} / ${books.length}</span></h2>`;
    books.forEach(b => {
      const div = document.createElement('label');
      div.className = 'book' + (b.read ? ' read' : '');
      div.innerHTML = `
        <input type="checkbox" ${b.read ? 'checked' : ''} data-id="${b.id}">
        <div class="info">
          <div class="title">${escapeHtml(b.title)}</div>
          <div class="author">${escapeHtml(b.author)}</div>
        </div>
      `;
      section.appendChild(div);
    });
    list.appendChild(section);
  }

  const total = data.books.length;
  const done = data.books.filter(b => b.read).length;
  $('#progress-text').textContent = `${done} / ${total}`;
  $('#bar-fill').style.width = (done / total * 100) + '%';
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ===== イベント =====
document.addEventListener('change', e => {
  if (e.target.matches('input[type="checkbox"][data-id]')) {
    const id = parseInt(e.target.dataset.id, 10);
    const book = data.books.find(b => b.id === id);
    book.read = e.target.checked;
    book.readAt = book.read ? new Date().toISOString() : null;
    render();
    scheduleSave();
  }
});

$('#settings-btn').addEventListener('click', () => {
  $('#token-input').value = getToken() || '';
  $('#token-dialog').showModal();
});

$('#token-save').addEventListener('click', async () => {
  const v = $('#token-input').value.trim();
  if (!v) return;
  setToken(v);
  $('#token-dialog').close();
  await init();
});

$('#token-cancel').addEventListener('click', () => {
  $('#token-dialog').close();
});

// ===== 起動 =====
async function init() {
  if (!getToken()) {
    $('#token-dialog').showModal();
    return;
  }
  try {
    data = await fetchBooks();
    render();
    showStatus('読み込み完了');
  } catch (e) {
    console.error(e);
    showStatus('読み込み失敗: トークンを確認してください', true);
    $('#token-dialog').showModal();
  }
}

init();
