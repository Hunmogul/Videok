/**
 * VideoKurátor – app.js
 * Főkontroller: UI ↔ Modellek összekötése
 * 1. Fázis: Lokális tárolás
 */

import { createVideo, parsePlatformUrl, PLATFORMS } from './models/VideoModel.js';
import { createRating, RATING_TYPES }                from './models/RatingModel.js';
import {
  saveVideo, getAllVideos, deleteVideo, updateVideo,
  saveRating, getUserRatingForVideo,
} from './models/StorageService.js';
import {
  initializeUser, registerEmail, setDisplayName,
  getCurrentUser, getDisplayLabel, getActiveDangerVideos,
  resolveAndDeleteDangerVideo,
} from './models/UserService.js';

// ── Állapot ──────────────────────────────────────────────────────────────────

const state = {
  user:        null,
  videos:      [],
  sortBy:      'date',
  sortDir:     'desc',
  filterPlat:  'all',
  viewMode:    'list',   // 'list' | 'card'
  addFormOpen: false,
  filterOpen:  false,
};

// ── DOM referenciák ──────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const els = {
  app:             $('app'),
  mainContent:     $('mainContent'),
  bannedScreen:    $('bannedScreen'),
  bannedReason:    $('bannedReason'),
  offlineBar:      $('offlineBar'),
  notifBar:        $('notifBar'),
  notifIcon:       $('notifIcon'),
  notifText:       $('notifText'),
  notifDismiss:    $('notifDismiss'),
  viewList:        $('viewList'),
  viewCard:        $('viewCard'),
  profileBtn:      $('profileBtn'),
  profileLabel:    $('profileLabel'),
  addVideoBtn:     $('addVideoBtn'),
  filterToggleBtn: $('filterToggleBtn'),
  filterRow:       $('filterRow'),
  sortRow:         $('sortRow'),
  addForm:         $('addForm'),
  urlInput:        $('urlInput'),
  urlPreview:      $('urlPreview'),
  previewDot:      $('previewDot'),
  previewText:     $('previewText'),
  titleInput:      $('titleInput'),
  catInput:        $('catInput'),
  formError:       $('formError'),
  cancelAddBtn:    $('cancelAddBtn'),
  submitAddBtn:    $('submitAddBtn'),
  dangerPanel:     $('dangerPanel'),
  dangerList:      $('dangerList'),
  listMeta:        $('listMeta'),
  videoListView:   $('videoListView'),
  videoCardView:   $('videoCardView'),
  emptyState:      $('emptyState'),
  profilePanel:    $('profilePanel'),
  profileOverlay:  $('profileOverlay'),
  profileNameInput:$('profileNameInput'),
  profileEmailInput:$('profileEmailInput'),
  emailStatus:     $('emailStatus'),
  profileError:    $('profileError'),
  profileCancelBtn:$('profileCancelBtn'),
  profileSaveBtn:  $('profileSaveBtn'),
  profileId:       $('profileId'),
  confirmDialog:   $('confirmDialog'),
  confirmTitle:    $('confirmTitle'),
  confirmMsg:      $('confirmMsg'),
  confirmCancel:   $('confirmCancel'),
  confirmOk:       $('confirmOk'),
  toast:           $('toast'),
};

// ── Toast ────────────────────────────────────────────────────────────────────

let toastTimer;

function showToast(msg, type = '') {
  els.toast.textContent = msg;
  els.toast.className   = `toast show${type ? ' ' + type : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 2800);
}

// ── Megerősítő dialog ────────────────────────────────────────────────────────

function showConfirm(title, msg) {
  return new Promise(resolve => {
    els.confirmTitle.textContent = title;
    els.confirmMsg.textContent   = msg;
    els.confirmDialog.classList.add('visible');

    const cleanup = (result) => {
      els.confirmDialog.classList.remove('visible');
      els.confirmOk.removeEventListener('click', onOk);
      els.confirmCancel.removeEventListener('click', onCancel);
      resolve(result);
    };

    const onOk     = () => cleanup(true);
    const onCancel = () => cleanup(false);

    els.confirmOk.addEventListener('click', onOk);
    els.confirmCancel.addEventListener('click', onCancel);
  });
}

// ── Offline figyelés ─────────────────────────────────────────────────────────

function updateOfflineBar() {
  els.offlineBar.classList.toggle('visible', !navigator.onLine);
}

window.addEventListener('online',  updateOfflineBar);
window.addEventListener('offline', updateOfflineBar);

// ── Értesítési sáv ───────────────────────────────────────────────────────────

function showNotif(type, text) {
  const icons = { warning: '⚠️', danger: '🚨', banned: '🚫', welcome: '👋' };
  els.notifIcon.textContent = icons[type] || 'ℹ️';
  els.notifText.textContent = text;
  els.notifBar.className    = `notif-bar visible ${type}`;
}

function hideNotif() {
  els.notifBar.className = 'notif-bar';
}

els.notifDismiss.addEventListener('click', hideNotif);

// ── Rendezés ─────────────────────────────────────────────────────────────────

function sortVideos(videos) {
  const sorted = [...videos];
  const dir    = state.sortDir === 'asc' ? 1 : -1;

  sorted.sort((a, b) => {
    switch (state.sortBy) {
      case 'date':
        return dir * (new Date(a.addedAt) - new Date(b.addedAt));
      case 'title': {
        const ta = (a.title || a.videoId || '').toLowerCase();
        const tb = (b.title || b.videoId || '').toLowerCase();
        return dir * ta.localeCompare(tb, 'hu');
      }
      case 'category': {
        const ca = (a.categories || '').toLowerCase();
        const cb = (b.categories || '').toLowerCase();
        return dir * ca.localeCompare(cb, 'hu');
      }
      case 'platform':
        return dir * (a.platform || '').localeCompare(b.platform || '', 'hu');
      default:
        return 0;
    }
  });

  return sorted;
}

// ── Szűrés ───────────────────────────────────────────────────────────────────

function filterVideos(videos) {
  if (state.filterPlat === 'all') return videos;
  return videos.filter(v => v.platform === state.filterPlat);
}

// ── Dátum formázás ───────────────────────────────────────────────────────────

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' });
}

function formatDeadline(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d - now;
  if (diffMs <= 0) return 'Lejárt';
  const days  = Math.floor(diffMs / 86400000);
  const hours = Math.floor((diffMs % 86400000) / 3600000);
  if (days > 0) return `${days} nap ${hours} óra maradt`;
  return `${hours} óra maradt`;
}

// ── Platform badge ───────────────────────────────────────────────────────────

function platformBadge(platform) {
  const labels = {
    youtube: 'YT', instagram: 'IG', tiktok: 'TT', facebook: 'FB',
  };
  return `<span class="platform-badge badge-${platform}">${labels[platform] || platform}</span>`;
}

// ── Kategória tagek renderelése ──────────────────────────────────────────────

function renderCatTags(categories) {
  if (!categories) return `<span class="add-cat-hint">+ kategória</span>`;
  const tags = categories.split(',').map(t => t.trim()).filter(Boolean);
  if (tags.length === 0) return `<span class="add-cat-hint">+ kategória</span>`;
  return tags.map(t => `<span class="cat-tag">${escHtml(t)}</span>`).join('');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Videó kártya – Lista nézet ───────────────────────────────────────────────

function renderListItem(video) {
  const div = document.createElement('div');
  div.className  = 'video-item';
  div.dataset.id = video.id;

  div.innerHTML = `
    <div class="item-thumb">
      <img src="${escHtml(video.thumbnail)}" alt=""
           onerror="this.style.display='none'" loading="lazy" />
      ${platformBadge(video.platform)}
    </div>
    <div class="item-info">
      <div class="item-title" data-id="${video.id}" title="Kattints a szerkesztéshez">
        ${escHtml(video.title || video.videoId)}
      </div>
      <input class="item-title-input" type="text"
        maxlength="25" data-id="${video.id}"
        value="${escHtml(video.title || '')}"
        placeholder="Cím megadása (max 25 kar.)" />
      <div class="item-meta">
        <span class="item-date">${formatDate(video.addedAt)}</span>
        <div class="item-cats" data-id="${video.id}" title="Kattints a szerkesztéshez">
          ${renderCatTags(video.categories)}
        </div>
        <input class="cat-input" type="text" data-id="${video.id}"
          value="${escHtml(video.categories || '')}"
          placeholder="főzés, humor, tech" />
      </div>
    </div>
    <div class="item-actions">
      ${video.likeCount > 0 ? `<span class="like-count">♥ ${video.likeCount}</span>` : ''}
      <a class="act-btn open" href="${escHtml(video.url)}"
         target="_blank" rel="noopener" title="Megnyitás">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
          <polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      <button class="act-btn delete" data-id="${video.id}" title="Törlés">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
    </div>
  `;

  bindItemEvents(div, video);
  return div;
}

// ── Videó kártya – Kártya nézet ──────────────────────────────────────────────

function renderCardItem(video) {
  const div = document.createElement('div');
  div.className  = 'video-card';
  div.dataset.id = video.id;

  div.innerHTML = `
    <div class="card-thumb">
      <img src="${escHtml(video.thumbnail)}" alt=""
           onerror="this.style.display='none'" loading="lazy" />
      ${platformBadge(video.platform)}
    </div>
    <div class="card-body">
      <div class="item-title card-title" data-id="${video.id}" title="Kattints a szerkesztéshez">
        ${escHtml(video.title || video.videoId)}
      </div>
      <input class="item-title-input" type="text"
        maxlength="25" data-id="${video.id}"
        value="${escHtml(video.title || '')}"
        placeholder="Cím (max 25 kar.)" />
      <div class="item-cats" data-id="${video.id}">
        ${renderCatTags(video.categories)}
      </div>
      <input class="cat-input" type="text" data-id="${video.id}"
        value="${escHtml(video.categories || '')}"
        placeholder="kategóriák" />
      <div class="card-meta">${formatDate(video.addedAt)}</div>
    </div>
    <div class="card-actions">
      ${video.likeCount > 0 ? `<span class="like-count">♥ ${video.likeCount}</span>` : ''}
      <a class="act-btn open" href="${escHtml(video.url)}"
         target="_blank" rel="noopener" title="Megnyitás" style="margin-left:auto">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
          <polyline points="15,3 21,3 21,9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      <button class="act-btn delete" data-id="${video.id}" title="Törlés">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"/>
          <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
      </button>
    </div>
  `;

  bindItemEvents(div, video);
  return div;
}

// ── Elem eseménykötések (cím, kategória szerkesztés, törlés) ─────────────────

function bindItemEvents(el, video) {
  // Cím szerkesztés
  const titleEl  = el.querySelector('.item-title');
  const titleInp = el.querySelector('.item-title-input');

  if (titleEl && titleInp) {
    titleEl.addEventListener('click', () => {
      titleEl.classList.add('editing');
      titleInp.classList.add('visible');
      titleInp.focus();
      titleInp.select();
    });

    titleInp.addEventListener('blur', async () => {
      await saveTitleEdit(video.id, titleInp.value, titleEl, titleInp);
    });

    titleInp.addEventListener('keydown', async e => {
      if (e.key === 'Enter') titleInp.blur();
      if (e.key === 'Escape') {
        titleInp.value = video.title || '';
        titleInp.blur();
      }
    });
  }

  // Kategória szerkesztés
  const catEl  = el.querySelector('.item-cats');
  const catInp = el.querySelector('.cat-input');

  if (catEl && catInp) {
    catEl.addEventListener('click', () => {
      catEl.style.display = 'none';
      catInp.classList.add('visible');
      catInp.focus();
    });

    catInp.addEventListener('blur', async () => {
      await saveCatEdit(video.id, catInp.value, catEl, catInp);
    });

    catInp.addEventListener('keydown', async e => {
      if (e.key === 'Enter') catInp.blur();
      if (e.key === 'Escape') {
        catInp.value = video.categories || '';
        catInp.blur();
      }
    });
  }

  // Törlés gomb
  const delBtn = el.querySelector('.act-btn.delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const confirmed = await showConfirm(
        'Videó törlése',
        'Biztosan törlöd ezt a videót a gyűjteményedből?'
      );
      if (!confirmed) return;
      const result = await deleteVideo(video.id);
      if (result.success) {
        showToast('🗑️ Videó törölve', 'success');
        await refreshList();
      } else {
        showToast(`Törlési hiba: ${result.error}`, 'error');
      }
    });
  }
}

// ── Cím mentése ──────────────────────────────────────────────────────────────

async function saveTitleEdit(id, newTitle, titleEl, titleInp) {
  const trimmed = newTitle.trim();

  if (trimmed.length > 25) {
    showToast('A cím maximum 25 karakter lehet', 'error');
    titleInp.value = state.videos.find(v => v.id === id)?.title || '';
  } else {
    const result = await updateVideo(id, { title: trimmed || null });
    if (result.success) {
      const video = state.videos.find(v => v.id === id);
      if (video) video.title = trimmed || null;
      titleEl.textContent = trimmed || video?.videoId || '–';
      if (trimmed) showToast('✅ Cím mentve');
    } else {
      showToast(`Mentési hiba: ${result.error}`, 'error');
    }
  }

  titleEl.classList.remove('editing');
  titleInp.classList.remove('visible');
}

// ── Kategória mentése ────────────────────────────────────────────────────────

async function saveCatEdit(id, newCats, catEl, catInp) {
  const result = await updateVideo(id, { categories: newCats.trim() });
  if (result.success) {
    const video = state.videos.find(v => v.id === id);
    if (video) video.categories = newCats.trim();
    catEl.innerHTML = renderCatTags(newCats.trim());
    if (newCats.trim()) showToast('✅ Kategóriák mentve');
  } else {
    showToast(`Mentési hiba: ${result.error}`, 'error');
  }

  catEl.style.display = '';
  catInp.classList.remove('visible');

  // Eseménykötés újraindítása (innerHTML frissítés miatt)
  const addHint = catEl.querySelector('.add-cat-hint');
  if (addHint) {
    addHint.addEventListener('click', e => {
      e.stopPropagation();
      catEl.dispatchEvent(new Event('click'));
    });
  }
}

// ── Lista renderelés ─────────────────────────────────────────────────────────

function renderList() {
  const processed = sortVideos(filterVideos(state.videos));

  els.listMeta.textContent = processed.length > 0
    ? `${processed.length} videó`
    : '';

  const isEmpty = processed.length === 0;
  els.emptyState.classList.toggle('visible', isEmpty);

  // Lista nézet
  els.videoListView.innerHTML = '';
  // Kártya nézet
  els.videoCardView.innerHTML = '';

  if (!isEmpty) {
    processed.forEach(video => {
      els.videoListView.appendChild(renderListItem(video));
      els.videoCardView.appendChild(renderCardItem(video));
    });
  }
}

// ── Lista frissítés ──────────────────────────────────────────────────────────

async function refreshList() {
  state.videos = await getAllVideos();
  renderList();
}

// ── Veszélyes linkek panel ───────────────────────────────────────────────────

async function renderDangerPanel() {
  if (!state.user) return;
  const dangerVideos = await getActiveDangerVideos(state.user.id);

  if (dangerVideos.length === 0) {
    els.dangerPanel.classList.remove('visible');
    return;
  }

  els.dangerPanel.classList.add('visible');
  els.dangerList.innerHTML = dangerVideos.map(v => `
    <div class="danger-item">
      <div class="danger-item-info">
        <div class="danger-item-url">${escHtml(v.url)}</div>
        <div class="danger-deadline">⏱ ${formatDeadline(v.dangerDeadline)}</div>
      </div>
      <button class="danger-resolve-btn" data-id="${v.id}">
        Törlöm
      </button>
    </div>
  `).join('');

  els.dangerList.querySelectorAll('.danger-resolve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await showConfirm(
        'Feltöltés visszavonása',
        'Biztosan törlöd ezt a feltöltést a közös gyűjteményből? Ez a jóvátételi lépés törli a letiltást.'
      );
      if (!confirmed) return;

      const result = await resolveAndDeleteDangerVideo(btn.dataset.id);
      if (result.success) {
        showToast('✅ Feltöltés visszavonva', 'success');
        state.user = await getCurrentUser();
        await renderDangerPanel();
        await refreshList();
      } else {
        showToast(result.error, 'error');
      }
    });
  });
}

// ── URL előnézet (hozzáadás formban) ────────────────────────────────────────

function updateUrlPreview(url) {
  if (!url.trim()) {
    els.urlPreview.classList.remove('visible');
    return;
  }

  const parsed = parsePlatformUrl(url);
  if (!parsed) {
    els.urlPreview.classList.remove('visible');
    return;
  }

  const colors = {
    youtube: '#ff0000', instagram: '#e1306c',
    tiktok: '#ffffff',  facebook: '#1877f2',
  };
  const labels = {
    youtube: 'YouTube', instagram: 'Instagram',
    tiktok: 'TikTok',   facebook: 'Facebook',
  };

  els.previewDot.style.background = colors[parsed.platform] || '#888';
  els.previewText.textContent = `${labels[parsed.platform] || parsed.platform} · ${parsed.videoId}`;
  els.urlPreview.classList.add('visible');
}

// ── Videó hozzáadás ──────────────────────────────────────────────────────────

function toggleAddForm(open) {
  state.addFormOpen = open;
  els.addForm.classList.toggle('visible', open);
  if (open) {
    els.urlInput.focus();
    els.formError.classList.remove('visible');
    els.urlPreview.classList.remove('visible');
  } else {
    els.urlInput.value   = '';
    els.titleInput.value = '';
    els.catInput.value   = '';
    els.formError.classList.remove('visible');
    els.urlPreview.classList.remove('visible');
  }
}

async function handleAddVideo() {
  const url   = els.urlInput.value.trim();
  const title = els.titleInput.value.trim();
  const cats  = els.catInput.value.trim();

  els.formError.classList.remove('visible');
  els.submitAddBtn.disabled = true;
  els.submitAddBtn.textContent = 'Mentés…';

  try {
    const result = createVideo({
      url,
      title:      title || null,
      categories: cats || null,
      userId:     state.user?.id || 'anonymous',
    });

    if (!result.success) {
      els.formError.textContent = result.errors.join(' · ');
      els.formError.classList.add('visible');
      return;
    }

    const saveResult = await saveVideo(result.video);
    if (!saveResult.success) {
      els.formError.textContent = saveResult.error;
      els.formError.classList.add('visible');
      return;
    }

    showToast('✅ Videó hozzáadva!', 'success');
    toggleAddForm(false);
    await refreshList();

  } finally {
    els.submitAddBtn.disabled = false;
    els.submitAddBtn.textContent = 'Mentés';
  }
}

// ── Profil panel ─────────────────────────────────────────────────────────────

function openProfilePanel() {
  if (!state.user) return;

  els.profileNameInput.value  = state.user.displayName || '';
  els.profileEmailInput.value = '';
  els.profileId.textContent   = state.user.id;
  els.profileError.classList.remove('visible');

  if (state.user.emailHash) {
    els.profileEmailInput.placeholder = '✅ Email már regisztrálva';
    els.profileEmailInput.disabled    = true;
    els.emailStatus.textContent       = 'Az email cím regisztrálva van (hash-elve tárolódik)';
  } else {
    els.profileEmailInput.placeholder = 'email@cim.hu';
    els.profileEmailInput.disabled    = false;
    els.emailStatus.textContent       = '';
  }

  els.profilePanel.classList.add('visible');
}

function closeProfilePanel() {
  els.profilePanel.classList.remove('visible');
}

async function handleProfileSave() {
  els.profileError.classList.remove('visible');
  els.profileSaveBtn.disabled = true;

  try {
    // Megjelenő név mentése
    const name = els.profileNameInput.value.trim();
    if (name !== (state.user.displayName || '')) {
      const result = await setDisplayName(name || null);
      if (!result.success) {
        els.profileError.textContent = result.error;
        els.profileError.classList.add('visible');
        return;
      }
      state.user = await getCurrentUser();
      els.profileLabel.textContent = getDisplayLabel(state.user);
    }

    // Email regisztráció (ha megadta és még nincs)
    const email = els.profileEmailInput.value.trim();
    if (email && !state.user.emailHash) {
      const result = await registerEmail(email);
      if (!result.success) {
        els.profileError.textContent = result.error;
        els.profileError.classList.add('visible');
        return;
      }
      state.user = await getCurrentUser();
    }

    showToast('✅ Profil mentve', 'success');
    closeProfilePanel();

  } finally {
    els.profileSaveBtn.disabled = false;
  }
}

// ── Rendezés kezelés ─────────────────────────────────────────────────────────

function initSortControls() {
  els.sortRow.querySelectorAll('.sort-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const sort = chip.dataset.sort;

      if (state.sortBy === sort) {
        // Irány váltás
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
        const arrow = chip.querySelector('.arrow');
        if (arrow) arrow.textContent = state.sortDir === 'asc' ? '↑' : '↓';
      } else {
        // Új rendezési szempont
        els.sortRow.querySelectorAll('.sort-chip').forEach(c => {
          c.classList.remove('active');
          const a = c.querySelector('.arrow');
          if (a) a.remove();
        });
        state.sortBy  = sort;
        state.sortDir = 'desc';
        chip.classList.add('active');

        if (!chip.querySelector('.arrow')) {
          const arrow = document.createElement('span');
          arrow.className = 'arrow';
          arrow.dataset.dir = 'desc';
          arrow.textContent = '↓';
          chip.appendChild(arrow);
        }
      }

      renderList();
    });
  });
}

// ── Szűrés kezelés ───────────────────────────────────────────────────────────

function initFilterControls() {
  els.filterToggleBtn.addEventListener('click', () => {
    state.filterOpen = !state.filterOpen;
    els.filterRow.style.display = state.filterOpen ? 'flex' : 'none';
    els.filterToggleBtn.classList.toggle('active', state.filterOpen);
  });

  els.filterRow.querySelectorAll('.filter-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      els.filterRow.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
      tag.classList.add('active');
      state.filterPlat = tag.dataset.filter;
      renderList();
    });
  });
}

// ── Nézet váltás ─────────────────────────────────────────────────────────────

function setView(mode) {
  state.viewMode = mode;
  const isList = mode === 'list';

  els.videoListView.style.display = isList ? 'flex' : 'none';
  els.videoCardView.style.display = isList ? 'none' : 'grid';
  els.viewList.classList.toggle('active', isList);
  els.viewCard.classList.toggle('active', !isList);
}

// ── Értesítések feldolgozása ─────────────────────────────────────────────────

function processNotifications(notifications, dangerVideos = []) {
  if (notifications.includes('banned')) return; // Kitiltott képernyő veszi át

  if (notifications.includes('danger_videos') && dangerVideos.length > 0) {
    showNotif('danger',
      `${dangerVideos.length} feltöltésed letiltásra került. Kattints a piros sávra a részletekért.`
    );
    return;
  }

  if (notifications.includes('deadline_expired')) {
    showNotif('warning',
      'Egy veszélyesnek jelölt feltöltésed határideje lejárt és szankcióba számít.'
    );
    return;
  }

  if (notifications.includes('warning')) {
    showNotif('warning',
      '⚠️ Figyelem! Már 2 feltöltésedet letiltotta a közösség. A 3. letiltás végleges kitiltást jelent.'
    );
    return;
  }

  if (notifications.includes('welcome')) {
    showNotif('welcome',
      'Üdvözlünk a VideoKurátorban! Adj hozzá első videódat a + gombbal.'
    );
    setTimeout(hideNotif, 5000);
  }
}

// ── Share Target kezelés (PWA) ────────────────────────────────────────────────

async function handleShareTarget() {
  const params    = new URLSearchParams(window.location.search);
  const sharedUrl = params.get('url') || params.get('text');
  if (!sharedUrl) return;

  const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) return;

  const url    = urlMatch[0];
  const result = createVideo({ url, userId: state.user?.id || 'anonymous' });

  if (result.success) {
    const save = await saveVideo(result.video);
    if (save.success) {
      showToast('✅ Videó hozzáadva megosztásból!', 'success');
      await refreshList();
    } else {
      showToast(save.error, 'error');
    }
  }

  // URL paraméterek eltávolítása
  history.replaceState({}, '', window.location.pathname);
}

// ── Service Worker regisztráció ──────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('../sw.js').catch(() => {});
  }
}

// ── Eseménykötések ───────────────────────────────────────────────────────────

function bindEvents() {
  // Nézet váltás
  els.viewList.addEventListener('click', () => setView('list'));
  els.viewCard.addEventListener('click', () => setView('card'));

  // Profil
  els.profileBtn.addEventListener('click', openProfilePanel);
  els.profileCancelBtn.addEventListener('click', closeProfilePanel);
  els.profileOverlay.addEventListener('click', closeProfilePanel);
  els.profileSaveBtn.addEventListener('click', handleProfileSave);

  // Videó hozzáadás
  els.addVideoBtn.addEventListener('click', () => toggleAddForm(!state.addFormOpen));
  els.cancelAddBtn.addEventListener('click', () => toggleAddForm(false));
  els.submitAddBtn.addEventListener('click', handleAddVideo);

  els.urlInput.addEventListener('input', e => updateUrlPreview(e.target.value));
  els.urlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') els.titleInput.focus();
  });
  els.titleInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') els.catInput.focus();
  });
  els.catInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddVideo();
  });

  // Clipboard paste helper
  els.urlInput.addEventListener('focus', async () => {
    if (els.urlInput.value) return;
    try {
      const text = await navigator.clipboard.readText();
      if (parsePlatformUrl(text)) {
        els.urlInput.value = text;
        updateUrlPreview(text);
      }
    } catch { /* Clipboard hozzáférés megtagadva – nem kritikus */ }
  });
}

// ── Alkalmazás indítás ───────────────────────────────────────────────────────

async function init() {
  updateOfflineBar();
  registerSW();

  try {
    const { user, notifications, dangerVideos } = await initializeUser();
    state.user = user;

    // Kitiltott felhasználó
    if (user.isBanned) {
      els.mainContent.style.display  = 'none';
      els.bannedScreen.style.display = 'flex';
      els.bannedReason.textContent   = user.bannedReason || 'A fiókod végleges kitiltásra került.';
      return;
    }

    // Profil gomb frissítés
    els.profileLabel.textContent = getDisplayLabel(user);

    // Értesítések
    processNotifications(notifications || [], dangerVideos || []);

    // Veszélyes linkek panel
    await renderDangerPanel();

    // Vezérlők inicializálása
    initSortControls();
    initFilterControls();
    bindEvents();

    // Lista betöltés
    await refreshList();

    // Share target (PWA)
    await handleShareTarget();

  } catch (err) {
    console.error('Inicializálási hiba:', err);
    showToast('Az alkalmazás betöltése sikertelen. Töltsd újra az oldalt.', 'error');
  }
}

// ── Indítás ──────────────────────────────────────────────────────────────────

init();
