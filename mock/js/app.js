// Raise timeline の画面のモック。API・データベースの代わりに data.js のサンプルデータをメモリ上で書き換える。
// 画面 ID（G-1〜G-11）・要件 ID（A・T・W・I・C・L・F・S・PF）・メッセージ（M-1〜M-21）は docs/ の文書に合わせている。
(function () {
  'use strict';

  // ---------------------------------------------------------------- メッセージ一覧（機能定義書 4 章）
  const M = {
    1: 'このユーザー ID は使われています。',
    2: 'ユーザー ID は 3〜15 文字の半角英数字と「_」で入力してください。',
    3: 'パスワードは英字と数字を含む 8〜64 文字で入力してください。',
    4: 'パスワード（確認）が一致しません。',
    5: '表示名を入力してください。',
    6: 'ユーザー ID かパスワードが違います。',
    7: 'ログインに続けて失敗したため、15 分間ログインできません。',
    8: 'まだ誰もフォローしていません。「すべて」タブやユーザー検索で、フォローする人を探してみましょう。',
    9: '読み込みに失敗しました。時間をおいてもう一度お試しください。',
    10: 'この投稿を削除しますか？画像・コメント・いいねも削除され、元に戻せません。',
    11: 'この投稿は削除されました。',
    12: '画像は 1 つの投稿に 4 枚までです。',
    13: '添えられるのは 5MB までの JPEG・PNG・GIF・WebP の画像です。',
    14: '投稿に失敗しました。時間をおいてもう一度お試しください。',
    15: 'このコメントを削除しますか？',
    16: (q) => '「' + q + '」に一致するユーザーはいません。',
    17: 'このユーザーは見つかりません。',
    18: '操作に失敗しました。時間をおいてもう一度お試しください。',
    19: 'ログインの有効期限が切れました。もう一度ログインしてください。',
    20: 'インターネットに接続されていません。接続を確認してください。',
    21: 'アイコンにできるのは 5MB までの JPEG・PNG・WebP の画像です。',
  };

  const MAX_TEXT = 280;
  const MAX_BIO = 160;
  const MAX_NAME = 30;
  const MAX_SEARCH = 30;
  const MAX_IMAGES = 4;
  const MAX_FILE = 5 * 1024 * 1024;
  const PAGE = 20;
  const COMMENT_PAGE = 50;

  let db = window.MockData.create();
  const state = {
    me: null,
    redirectTo: null,
    loginMessage: null,
    editingPostId: null,
    navCount: 0,
    cleanups: [],
    dialog: null,
    mock: { failLoad: false, failAction: false, offline: false },
  };
  const app = document.getElementById('app');

  // ---------------------------------------------------------------- ブラウザへの記録（使えなくても動くようにする）
  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) { /* 記録できなくても続ける */ }
  }

  // ---------------------------------------------------------------- 小さな道具
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 文字数は Unicode の文字（コードポイント）単位で数える（画面設計書 3.8）
  const len = (s) => Array.from(s).length;
  const trim = (s) => s.replace(/^\s+|\s+$/g, '');
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, '0');
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function fullTime(ts) {
    const d = new Date(ts);
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // 画面設計書 3.9
  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60 * 1000) return 'たった今';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 時間前';
    const d = new Date(ts);
    const md = (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() === new Date().getFullYear() ? md : d.getFullYear() + '年' + md;
  }

  const user = (id) => db.users.find((u) => u.id === id);
  const userByUid = (uid) => db.users.find((u) => u.userId.toLowerCase() === String(uid).toLowerCase());
  const post = (id) => db.posts.find((p) => p.id === id);
  const isFollowing = (from, to) => db.follows.some((f) => f.from === from && f.to === to);
  const followingOf = (id) => db.follows.filter((f) => f.from === id).sort((a, b) => b.at - a.at);
  const followersOf = (id) => db.follows.filter((f) => f.to === id).sort((a, b) => b.at - a.at);
  const newestFirst = (a, b) => b.id - a.id;

  // API の代わり。少し待ってから、モック操作の指定があれば失敗させる
  async function api(kind) {
    await delay(kind === 'load' ? 450 : 300);
    if (state.mock.offline) throw new Error('offline');
    if (kind === 'load' && state.mock.failLoad) { state.mock.failLoad = false; syncMockPanel(); throw new Error('load'); }
    if (kind === 'action' && state.mock.failAction) { state.mock.failAction = false; syncMockPanel(); throw new Error('action'); }
  }

  // 3.11 アイコン：設定していればその画像、なければ（読めないときも）頭文字の丸
  function avatar(u, size) {
    const initial = esc(Array.from(u.name)[0] || '?');
    const img = u.avatar ? '<img src="' + esc(u.avatar) + '" alt="' + esc(u.name) + 'のアイコン">' : '';
    return '<span class="avatar avatar-' + size + '" data-initial="' + initial + '">' + (img || initial) + '</span>';
  }
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && img.parentElement && img.parentElement.classList.contains('avatar')) {
      img.parentElement.textContent = img.parentElement.dataset.initial;
    }
  }, true);

  // 上限を超える文字を入力できないようにする（日本語の変換中は切らない）
  function limitInput(el, max) {
    const cut = () => {
      if (len(el.value) > max) el.value = Array.from(el.value).slice(0, max).join('');
    };
    el.addEventListener('input', (e) => { if (!e.isComposing) cut(); });
    el.addEventListener('compositionend', cut);
  }

  // 本文の入力欄を、入力に合わせて最大 10 行まで高くする
  function autoGrow(el) {
    const grow = () => {
      el.style.height = 'auto';
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22;
      el.style.height = Math.min(el.scrollHeight, lineHeight * 10 + 16) + 'px';
    };
    el.addEventListener('input', grow);
    grow();
  }

  function countText(remaining) {
    return remaining < 0 ? String(remaining) : '残り ' + remaining;
  }

  // ---------------------------------------------------------------- トースト（3.4）
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function toast(msg) {
    $('.toast-text', toastEl).textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 5000);
  }
  $('.toast-close', toastEl).addEventListener('click', () => { toastEl.hidden = true; });

  // ---------------------------------------------------------------- ダイアログ（3.5・G-10・G-11）
  const dialogRoot = document.getElementById('dialog-root');

  function closeDialog() {
    if (!state.dialog) return;
    const back = state.dialog.returnFocus;
    dialogRoot.innerHTML = '';
    state.dialog = null;
    document.body.style.overflow = '';
    if (back && document.contains(back)) back.focus();
  }

  // G-11 確認ダイアログ
  function confirmDialog(title, message, action) {
    dialogRoot.innerHTML =
      '<div class="overlay" data-overlay>' +
      '<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">' +
      '<h2 id="dlg-title">' + esc(title) + '</h2><p id="dlg-msg">' + esc(message) + '</p>' +
      '<div class="dialog-buttons"><button type="button" class="btn btn-secondary" data-dlg="cancel">キャンセル</button>' +
      '<button type="button" class="btn btn-danger" data-dlg="ok">削除</button></div></div></div>';
    state.dialog = { type: 'confirm', busy: false, returnFocus: document.activeElement };
    document.body.style.overflow = 'hidden';
    const cancel = $('[data-dlg="cancel"]', dialogRoot);
    const ok = $('[data-dlg="ok"]', dialogRoot);
    cancel.focus(); // Enter キーで誤って削除しないよう、「キャンセル」にカーソルを置く
    cancel.addEventListener('click', closeDialog);
    ok.addEventListener('click', async () => {
      state.dialog.busy = true;
      ok.disabled = true;
      cancel.disabled = true;
      ok.textContent = '削除中…';
      try {
        await api('action');
        closeDialog();
        action();
      } catch (e) {
        closeDialog();
        toast(M[18]);
      }
    });
  }

  // G-10 画像の拡大ダイアログ
  function openLightbox(images, index) {
    state.dialog = { type: 'lightbox', images, index, returnFocus: document.activeElement };
    document.body.style.overflow = 'hidden';
    drawLightbox();
  }
  function drawLightbox() {
    const d = state.dialog;
    const many = d.images.length > 1;
    dialogRoot.innerHTML =
      '<div class="overlay dark" data-overlay role="dialog" aria-modal="true" aria-label="画像の拡大">' +
      '<img class="lightbox-img" src="' + esc(d.images[d.index]) + '" alt="画像 ' + (d.index + 1) + '">' +
      '<button type="button" class="lb-btn lb-close" data-lb="close" aria-label="閉じる">×</button>' +
      (many ? '<button type="button" class="lb-btn lb-prev" data-lb="prev" aria-label="前の画像">‹</button>' +
        '<button type="button" class="lb-btn lb-next" data-lb="next" aria-label="次の画像">›</button>' +
        '<div class="lb-count">' + (d.index + 1) + ' / ' + d.images.length + '</div>' : '') +
      '</div>';
    $('[data-lb="close"]', dialogRoot).focus();
  }
  function moveLightbox(step) {
    const d = state.dialog;
    if (d.images.length < 2) return;
    d.index = (d.index + step + d.images.length) % d.images.length;
    drawLightbox();
  }

  dialogRoot.addEventListener('click', (e) => {
    if (!state.dialog) return;
    const lb = e.target.closest('[data-lb]');
    if (lb) {
      if (lb.dataset.lb === 'close') closeDialog();
      else moveLightbox(lb.dataset.lb === 'next' ? 1 : -1);
      return;
    }
    // 覆いの部分（画像・ダイアログの外側）のクリックで閉じる
    if (e.target.hasAttribute('data-overlay') && !state.dialog.busy) closeDialog();
  });

  document.addEventListener('keydown', (e) => {
    if (!state.dialog) return;
    if (e.key === 'Escape' && !state.dialog.busy) { e.preventDefault(); closeDialog(); return; }
    if (state.dialog.type === 'lightbox') {
      if (e.key === 'ArrowRight') moveLightbox(1);
      if (e.key === 'ArrowLeft') moveLightbox(-1);
    }
    // ダイアログの外にフォーカスを出さない
    if (e.key === 'Tab') {
      const items = $$('button:not(:disabled)', dialogRoot);
      if (!items.length) return;
      const i = items.indexOf(document.activeElement);
      e.preventDefault();
      items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
    }
  });

  // ---------------------------------------------------------------- 画像ファイルの確認（I-3・PF-8）
  async function detectImageType(file) {
    const b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
    return null;
  }
  const extOk = (name, types) => types.some((t) => (t === 'jpeg' ? /\.(jpe?g)$/i : new RegExp('\\.' + t + '$', 'i')).test(name));
  async function checkImage(file, types) {
    if (file.size > MAX_FILE) return false;
    if (!extOk(file.name, types)) return false;
    const type = await detectImageType(file);
    return types.includes(type);
  }
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------------- ルーティング（画面一覧の URL を「#」の後ろに付ける）
  function parseHash() {
    const h = location.hash.slice(1) || '/';
    const i = h.indexOf('?');
    return { path: i < 0 ? h : h.slice(0, i), query: new URLSearchParams(i < 0 ? '' : h.slice(i + 1)) };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  const routes = [
    [/^\/login$/, renderLogin],
    [/^\/signup$/, renderSignup],
    [/^\/$/, renderTimeline],
    [/^\/posts\/(\d+)$/, renderPostDetail],
    [/^\/posts\/(\d+)\/likes$/, renderLikes],
    [/^\/users\/([^/]+)$/, renderProfile],
    [/^\/users\/([^/]+)\/(following|followers)$/, renderFollows],
    [/^\/settings\/profile$/, renderEditProfile],
    [/^\/search$/, renderSearch],
  ];

  function render() {
    state.cleanups.forEach((fn) => fn());
    state.cleanups = [];
    state.editingPostId = null;
    closeDialog();
    const { path, query } = parseHash();
    const isPublic = path === '/login' || path === '/signup';
    // A-9：ログインしていないときは G-1 を出し、ログインした後に開こうとした画面へ移す
    if (!state.me && !isPublic) {
      state.redirectTo = location.hash || '#/';
      go('#/login');
      return;
    }
    // ログイン済みで G-1・G-2 を開いたときは G-3
    if (state.me && isPublic) { go('#/'); return; }
    for (const [re, fn] of routes) {
      const m = path.match(re);
      if (m) {
        fn(...m.slice(1).map(decodeURIComponent), query);
        window.scrollTo(0, 0);
        return;
      }
    }
    go('#/');
  }

  window.addEventListener('hashchange', () => { state.navCount++; render(); });

  function login(u) {
    state.me = u;
    storageSet('rt.me', u.userId);
    const to = state.redirectTo && state.redirectTo !== '#/login' ? state.redirectTo : '#/';
    state.redirectTo = null;
    go(to);
  }

  function logout(message) {
    state.me = null;
    state.loginMessage = message || null;
    storageSet('rt.me', null);
    go('#/login');
  }

  // ---------------------------------------------------------------- 共通の部品
  // 3.6 ヘッダー
  function header(q) {
    const me = state.me;
    return '<header class="header" id="header"><div class="header-inner">' +
      '<a class="app-name" href="#/"><span class="full">Raise timeline</span><span class="short">RT</span></a>' +
      '<form class="search-form" role="search" id="search-form">' +
      '<div class="search-box"><button type="submit" class="search-icon" aria-label="検索">🔍</button>' +
      '<input type="search" name="q" placeholder="ユーザーを検索" autocomplete="off" value="' + esc(q || '') + '" aria-label="ユーザーを検索"></div>' +
      '<button type="button" class="search-open" data-action="search-open" aria-label="ユーザーを検索">🔍</button>' +
      '<button type="button" class="btn btn-secondary btn-sm search-close" data-action="search-close">閉じる</button>' +
      '</form>' +
      '<div class="header-right">' +
      '<a class="header-me" href="#/users/' + esc(me.userId) + '" title="自分のプロフィール">' + avatar(me, 32) + '</a>' +
      '<button type="button" class="btn btn-secondary" data-action="logout">ログアウト</button>' +
      '</div></div></header>' +
      '<div class="notice" id="notice" role="alert" hidden>' + M[20] + '</div>';
  }

  function layout(content, q) {
    app.innerHTML = header(q) + '<main class="container">' + content + '</main>';
    const form = $('#search-form');
    const input = $('input', form);
    limitInput(input, MAX_SEARCH);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = trim(input.value);
      if (!value) return; // S-5：0 文字のときは何もしない
      go('#/search?q=' + encodeURIComponent(value));
    });
    updateNotice();
  }

  function pageHead(title, backTo) {
    return '<div class="page-head"><button type="button" class="back-btn" data-action="back"' +
      (backTo ? ' data-to="' + esc(backTo) + '"' : '') + ' aria-label="戻る">←</button><h1>' + title + '</h1></div>';
  }

  function followButton(u) {
    if (u.id === state.me.id) return '';
    const on = isFollowing(state.me.id, u.id);
    return '<button type="button" class="btn follow-btn ' + (on ? 'btn-secondary following' : 'btn-primary') +
      '" data-action="follow" data-uid="' + u.id + '" aria-pressed="' + on + '">' +
      (on ? '<span class="def">フォロー中</span><span class="hov">フォロー解除</span>' : 'フォローする') + '</button>';
  }

  // ユーザーの行（G-5・G-8・G-9 で共通）
  function userRow(u, withBio) {
    const bio = withBio && u.bio ? '<span class="bio">' + esc(u.bio.split('\n')[0]) + '</span>' : '';
    return '<div class="user-row" data-href="#/users/' + esc(u.userId) + '">' + avatar(u, 40) +
      '<div class="info"><span class="name">' + esc(u.name) + '</span><span class="uid">@' + esc(u.userId) + '</span>' + bio + '</div>' +
      followButton(u) + '</div>';
  }

  // 3.7 投稿カード
  function postCard(p, detail) {
    const a = user(p.authorId);
    const mine = a.id === state.me.id;
    const liked = p.likes.some((l) => l.userId === state.me.id);
    const n = p.images.length;
    return '<article class="post' + (detail ? ' detail' : '') + '" data-post="' + p.id + '">' +
      '<a href="#/users/' + esc(a.userId) + '">' + avatar(a, 40) + '</a>' +
      '<div class="post-main"><div class="post-head">' +
      '<a class="post-names" href="#/users/' + esc(a.userId) + '"><span class="name">' + esc(a.name) + '</span><span class="uid">@' + esc(a.userId) + '</span></a>' +
      '<span class="time" title="' + fullTime(p.createdAt) + '">· ' + relTime(p.createdAt) + '</span>' +
      (p.editedAt ? '<span class="edited" title="' + fullTime(p.editedAt) + ' に編集">（編集済み）</span>' : '') +
      (mine ? '<div class="menu-wrap"><button type="button" class="menu-btn" data-action="menu" aria-label="メニュー" aria-haspopup="true">…</button></div>' : '') +
      '</div>' +
      '<div class="post-content">' + (p.text ? '<div class="post-body" data-action="open-post">' + esc(p.text) + '</div>' : '') + '</div>' +
      (n ? '<div class="images n' + n + '">' + p.images.map((src, i) =>
        '<img src="' + esc(src) + '" alt="画像 ' + (i + 1) + '" data-action="zoom" data-index="' + i + '">').join('') + '</div>' : '') +
      '<div class="post-actions">' +
      '<span class="action"><button type="button" class="like-btn' + (liked ? ' liked' : '') + '" data-action="like" aria-pressed="' + liked + '" aria-label="いいね">' + (liked ? '♥' : '♡') + '</button>' +
      '<button type="button" class="count-btn" data-action="likes" aria-label="いいねした人">' + p.likes.length + '</button></span>' +
      '<span class="action"><button type="button" class="count-btn" data-action="open-post" aria-label="コメント">💬 <span class="c-count">' + p.comments.length + '</span></button></span>' +
      '</div></div></article>';
  }

  function rerenderPost(id) {
    const p = post(id);
    $$('article[data-post="' + id + '"]').forEach((el) => {
      el.outerHTML = postCard(p, el.classList.contains('detail'));
    });
  }

  // 20 件ずつ読み込み、一番下までスクロールすると次を読み込む一覧（T-2・T-8・L-5・F-6・S-7・PF-2）
  function pagedList(container, opts) {
    const items = opts.items; // 開いた時点の一覧を持つので、途中で増えても重複・抜けが出ない（T-7）
    const list = document.createElement('div');
    const status = document.createElement('div');
    container.append(list, status);
    let shown = 0;
    let loading = false;
    let done = false;

    async function loadMore() {
      if (loading || done) return;
      loading = true;
      status.className = 'list-state';
      status.textContent = '読み込み中…';
      try {
        await api('load');
      } catch (e) {
        status.innerHTML = '<div>' + M[9] + '</div><button type="button" class="btn btn-secondary">再読み込み</button>';
        $('button', status).addEventListener('click', () => { loading = false; loadMore(); });
        return;
      }
      if (!document.contains(status)) return;
      const page = items.slice(shown, shown + PAGE);
      shown += page.length;
      list.insertAdjacentHTML('beforeend', page.map(opts.render).join(''));
      loading = false;
      if (shown >= items.length) {
        done = true;
        if (items.length === 0) { status.className = 'empty'; status.innerHTML = opts.empty; }
        else status.innerHTML = opts.end || '';
      } else {
        status.textContent = '';
        if (status.getBoundingClientRect().top < window.innerHeight + 200) loadMore();
      }
    }

    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '200px' });
    io.observe(status);
    state.cleanups.push(() => io.disconnect());
    loadMore();

    return {
      prepend(html) {
        list.insertAdjacentHTML('afterbegin', html);
        if (status.className === 'empty') { status.className = 'list-state'; status.innerHTML = opts.end || ''; }
      },
    };
  }

  // 投稿フォーム（G-3）とコメントフォーム（G-4）で共通の入力欄（W-1〜W-3・C-1〜C-2・I-1〜I-5）
  function setupComposer(root, opts) {
    const textarea = $('textarea', root);
    const count = $('.count', root);
    const submit = $('[data-c="submit"]', root);
    const previews = $('.previews', root);
    const fileInput = $('input[type="file"]', root);
    const pickBtn = $('[data-c="pick"]', root);
    let images = [];
    let busy = false;

    function update() {
      const n = len(trim(textarea.value));
      const remaining = MAX_TEXT - n;
      count.textContent = countText(remaining);
      count.classList.toggle('over', remaining < 0);
      const empty = n === 0 && (!opts.allowImages || images.length === 0);
      submit.disabled = busy || remaining < 0 || empty;
      if (pickBtn) pickBtn.disabled = busy || images.length >= MAX_IMAGES;
    }

    function drawPreviews() {
      if (!previews) return;
      previews.innerHTML = images.map((src, i) =>
        '<div class="preview"><img src="' + esc(src) + '" alt="選んだ画像 ' + (i + 1) + '"><button type="button" data-remove="' + i + '" aria-label="画像 ' + (i + 1) + ' を外す">×</button></div>').join('');
      previews.hidden = images.length === 0;
    }

    async function send() {
      if (submit.disabled) return;
      busy = true;
      const label = submit.textContent;
      submit.textContent = opts.busyLabel;
      update();
      try {
        await api('action');
        opts.onSubmit({ text: trim(textarea.value), images: images.slice() });
        textarea.value = '';
        images = [];
        drawPreviews();
        textarea.dispatchEvent(new Event('input'));
      } catch (e) {
        toast(opts.failMessage); // 入力した本文と画像はそのまま残す（I-5）
      }
      busy = false;
      submit.textContent = label;
      update();
    }

    textarea.addEventListener('input', update);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); send(); }
    });
    submit.addEventListener('click', send);
    autoGrow(textarea);

    if (opts.allowImages) {
      pickBtn.addEventListener('click', () => fileInput.click());
      previews.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove]');
        if (!b) return;
        images.splice(Number(b.dataset.remove), 1);
        drawPreviews();
        update();
      });
      fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput.files);
        fileInput.value = '';
        let tooMany = false;
        let invalid = false;
        for (const f of files) {
          if (!(await checkImage(f, ['jpeg', 'png', 'gif', 'webp']))) { invalid = true; continue; }
          if (images.length >= MAX_IMAGES) { tooMany = true; continue; }
          images.push(await readAsDataUrl(f));
        }
        drawPreviews();
        update();
        if (invalid) toast(M[13]);
        if (tooMany) toast(M[12]);
      });
      drawPreviews();
    }
    update();
  }

  function composerHtml(kind) {
    if (kind === 'post') {
      return '<section class="composer">' + avatar(state.me, 40) + '<div class="composer-main">' +
        '<textarea rows="2" placeholder="いまどうしてる？" aria-label="投稿の本文"></textarea>' +
        '<div class="previews" hidden></div>' +
        '<div class="composer-actions">' +
        '<button type="button" class="btn btn-secondary" data-c="pick">画像を選ぶ</button>' +
        '<input type="file" hidden multiple accept="image/jpeg,image/png,image/gif,image/webp">' +
        '<span class="spacer"></span><span class="count"></span>' +
        '<button type="button" class="btn btn-primary" data-c="submit">投稿する</button></div></div></section>';
    }
    return '<section class="composer">' + avatar(state.me, 32) + '<div class="composer-main">' +
      '<textarea rows="1" placeholder="コメントを書く" aria-label="コメントの本文"></textarea>' +
      '<div class="composer-actions"><span class="spacer"></span><span class="count"></span>' +
      '<button type="button" class="btn btn-primary" data-c="submit">コメントする</button></div></div></section>';
  }

  // ---------------------------------------------------------------- G-1 ログイン画面（A-5〜A-8）
  function renderLogin() {
    const message = state.loginMessage;
    state.loginMessage = null;
    app.innerHTML =
      '<main class="auth"><h1>Raise timeline</h1><form id="login-form" novalidate>' +
      '<div class="form-message" id="login-message"' + (message ? '' : ' hidden') + '>' + esc(message || '') + '</div>' +
      '<div class="field"><label for="l-uid">ユーザー ID</label><input id="l-uid" autocomplete="username"></div>' +
      '<div class="field"><label for="l-pw">パスワード</label><input id="l-pw" type="password" autocomplete="current-password"></div>' +
      '<button type="submit" class="btn btn-primary btn-block" id="l-submit" disabled>ログイン</button>' +
      '</form><p class="auth-link"><a href="#/signup">アカウントを作る</a></p>' +
      '<div class="demo-note">モック用のアカウント：ユーザー ID <b>taro_y</b>、パスワード <b>password1</b>（ほかのサンプルユーザーも同じパスワード）。' +
      '5 回続けて間違えると 15 分間ログインできなくなります（A-7）。</div></main>';
    const uid = $('#l-uid');
    const pw = $('#l-pw');
    const submit = $('#l-submit');
    const msg = $('#login-message');
    limitInput(uid, 15);
    limitInput(pw, 64);
    const update = () => { submit.disabled = !uid.value || !pw.value; };
    uid.addEventListener('input', update);
    pw.addEventListener('input', update);
    uid.focus();

    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submit.disabled) return;
      msg.hidden = true;
      submit.disabled = true;
      submit.textContent = 'ログイン中…';
      await delay(300);
      const u = userByUid(trim(uid.value));
      let error = null;
      if (u && u.lockedUntil && u.lockedUntil > Date.now()) {
        error = M[7];
      } else if (!u || u.password !== pw.value) {
        error = M[6];
        if (u) {
          u.failCount++;
          if (u.failCount >= 5) { u.lockedUntil = Date.now() + 15 * 60 * 1000; u.failCount = 0; error = M[7]; }
        }
      }
      submit.textContent = 'ログイン';
      update();
      if (error) {
        msg.textContent = error;
        msg.hidden = false;
        return;
      }
      u.failCount = 0;
      u.lockedUntil = null;
      login(u);
    });
  }

  // ---------------------------------------------------------------- G-2 ユーザー登録画面（A-1〜A-4）
  function renderSignup() {
    const field = (id, label, type, hint, auto) =>
      '<div class="field" data-field="' + id + '"><label for="s-' + id + '">' + label + '</label>' +
      '<input id="s-' + id + '" type="' + type + '" autocomplete="' + auto + '">' +
      (hint ? '<p class="hint">' + hint + '</p>' : '') + '<p class="error-text" hidden></p></div>';
    app.innerHTML =
      '<main class="auth"><h1 class="small">アカウントを作る</h1><form id="signup-form" novalidate>' +
      field('uid', 'ユーザー ID', 'text', '3〜15 文字の半角英数字と「_」', 'username') +
      field('name', '表示名', 'text', '', 'nickname') +
      field('pw', 'パスワード', 'password', '英字と数字を含む 8〜64 文字', 'new-password') +
      field('pw2', 'パスワード（確認）', 'password', '', 'new-password') +
      '<button type="submit" class="btn btn-primary btn-block" id="s-submit">登録する</button>' +
      '</form><p class="auth-link"><a href="#/login">ログインはこちら</a></p></main>';

    const inputs = { uid: $('#s-uid'), name: $('#s-name'), pw: $('#s-pw'), pw2: $('#s-pw2') };
    limitInput(inputs.uid, 15);
    limitInput(inputs.name, MAX_NAME);
    limitInput(inputs.pw, 64);
    limitInput(inputs.pw2, 64);

    function setError(key, message) {
      const f = $('[data-field="' + key + '"]');
      const p = $('.error-text', f);
      p.textContent = message || '';
      p.hidden = !message;
      f.classList.toggle('invalid', !!message);
    }
    Object.keys(inputs).forEach((k) => inputs[k].addEventListener('input', () => setError(k, null)));

    const uidOk = (v) => /^[A-Za-z0-9_]{3,15}$/.test(v);
    // 入力欄から離れたときに、使われていないかを確かめる
    inputs.uid.addEventListener('blur', () => {
      const v = trim(inputs.uid.value);
      if (uidOk(v) && userByUid(v)) setError('uid', M[1]);
    });
    inputs.uid.focus();

    $('#signup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const uid = trim(inputs.uid.value);
      const name = trim(inputs.name.value);
      const pw = inputs.pw.value;
      const errors = {
        uid: !uidOk(uid) ? M[2] : userByUid(uid) ? M[1] : null,
        name: !name ? M[5] : null,
        pw: !(len(pw) >= 8 && len(pw) <= 64 && /[A-Za-z]/.test(pw) && /\d/.test(pw)) ? M[3] : null,
        pw2: inputs.pw2.value !== pw ? M[4] : null,
      };
      Object.keys(errors).forEach((k) => setError(k, errors[k]));
      const first = Object.keys(errors).find((k) => errors[k]);
      if (first) { inputs[first].focus(); return; }
      const submit = $('#s-submit');
      submit.disabled = true;
      submit.textContent = '登録中…';
      try {
        await api('action');
      } catch (err) {
        toast(M[18]);
        submit.disabled = false;
        submit.textContent = '登録する';
        return;
      }
      const u = { id: db.nextUserId++, userId: uid, name, bio: '', avatar: null, password: pw, joinedAt: Date.now(), failCount: 0, lockedUntil: null };
      db.users.push(u);
      login(u);
    });
  }

  // ---------------------------------------------------------------- G-3 タイムライン画面（T-1〜T-8・W-1〜W-7・I-1〜I-7）
  function renderTimeline(query) {
    let tab = query.get('tab');
    if (tab !== 'following' && tab !== 'all') tab = storageGet('rt.tab') === 'all' ? 'all' : 'following'; // T-3
    storageSet('rt.tab', tab);

    layout(
      composerHtml('post') +
      '<nav class="tabs" role="tablist">' +
      '<button type="button" role="tab" class="tab' + (tab === 'following' ? ' active' : '') + '" data-action="tab" data-tab="following" aria-selected="' + (tab === 'following') + '">フォロー中</button>' +
      '<button type="button" role="tab" class="tab' + (tab === 'all' ? ' active' : '') + '" data-action="tab" data-tab="all" aria-selected="' + (tab === 'all') + '">すべて</button>' +
      '</nav><div id="feed"></div>'
    );

    const me = state.me.id;
    const items = db.posts
      .filter((p) => tab === 'all' || p.authorId === me || isFollowing(me, p.authorId))
      .sort(newestFirst);
    const feed = pagedList($('#feed'), {
      items,
      render: (p) => postCard(p),
      empty: tab === 'following'
        ? '<div>' + M[8] + '</div><button type="button" class="btn btn-primary" data-action="tab" data-tab="all">「すべて」タブを開く</button>'
        : 'まだ投稿がありません。',
      end: 'これ以上の投稿はありません',
    });

    setupComposer($('.composer'), {
      allowImages: true,
      busyLabel: '投稿中…',
      failMessage: M[14],
      onSubmit: ({ text, images }) => {
        const p = { id: db.nextPostId++, authorId: me, text, images, createdAt: Date.now(), editedAt: null, likes: [], comments: [] };
        db.posts.push(p);
        feed.prepend(postCard(p)); // T-5：表示中のタブの一番上に足す
      },
    });
  }

  // ---------------------------------------------------------------- G-4 投稿の詳細画面（W-6〜W-11・C-1〜C-6）
  async function renderPostDetail(id) {
    const postId = Number(id);
    layout(pageHead('投稿') + '<div id="detail"><div class="list-state">読み込み中…</div></div>');
    const box = $('#detail');
    const load = async () => {
      box.innerHTML = '<div class="list-state">読み込み中…</div>';
      try {
        await api('load');
      } catch (e) {
        box.innerHTML = '<div class="list-state"><div>' + M[9] + '</div><button type="button" class="btn btn-secondary">再読み込み</button></div>';
        $('button', box).addEventListener('click', load);
        return;
      }
      if (!document.contains(box)) return;
      const p = post(postId);
      if (!p) { box.innerHTML = '<div class="empty">' + M[11] + '</div>'; return; } // W-8
      drawDetail(box, p);
    };
    load();
  }

  function commentItem(c) {
    const u = user(c.userId);
    const mine = u.id === state.me.id;
    return '<div class="comment" data-comment="' + c.id + '">' +
      '<a href="#/users/' + esc(u.userId) + '">' + avatar(u, 32) + '</a>' +
      '<div class="comment-main"><div class="comment-head">' +
      '<a class="post-names" href="#/users/' + esc(u.userId) + '"><span class="name">' + esc(u.name) + '</span><span class="uid">@' + esc(u.userId) + '</span></a>' +
      '<span class="sub" title="' + fullTime(c.at) + '">· ' + relTime(c.at) + '</span>' +
      (mine ? '<button type="button" class="del" data-action="delete-comment">削除</button>' : '') +
      '</div><div class="comment-body">' + esc(c.text) + '</div></div></div>';
  }

  function drawDetail(box, p) {
    box.innerHTML = postCard(p, true) + composerHtml('comment') + '<div id="comments"></div><div class="more" hidden><button type="button" class="btn btn-secondary">さらに表示</button></div>';
    const list = $('#comments', box);
    const more = $('.more', box);
    const comments = p.comments.slice().sort((a, b) => a.at - b.at); // 古い順（C-3）
    let shown = 0;
    const showMore = () => {
      const page = comments.slice(shown, shown + COMMENT_PAGE);
      shown += page.length;
      list.insertAdjacentHTML('beforeend', page.map(commentItem).join(''));
      more.hidden = shown >= comments.length;
    };
    $('button', more).addEventListener('click', showMore);
    showMore();

    setupComposer($('.composer', box), {
      allowImages: false,
      busyLabel: '送信中…',
      failMessage: M[18],
      onSubmit: ({ text }) => {
        const c = { id: db.nextCommentId++, userId: state.me.id, text, at: Date.now() };
        p.comments.push(c);
        list.insertAdjacentHTML('beforeend', commentItem(c)); // C-1：一覧の一番下に足す
        updateCommentCount(p);
      },
    });
  }

  function updateCommentCount(p) {
    $$('article[data-post="' + p.id + '"] .c-count').forEach((el) => { el.textContent = p.comments.length; });
  }

  // ---------------------------------------------------------------- 投稿の編集（W-9〜W-11）
  function startEdit(card) {
    const id = Number(card.dataset.post);
    if (state.editingPostId && state.editingPostId !== id) rerenderPost(state.editingPostId); // 編集中にできるのは 1 つだけ
    state.editingPostId = id;
    const p = post(id);
    const content = $('.post-content', card);
    const menu = $('.menu-wrap', card);
    if (menu) menu.hidden = true;
    content.innerHTML =
      '<textarea class="edit-area" aria-label="投稿の本文を編集"></textarea>' +
      '<div class="edit-foot"><span class="count"></span>' +
      '<button type="button" class="btn btn-secondary" data-e="cancel">キャンセル</button>' +
      '<button type="button" class="btn btn-primary" data-e="save">保存する</button></div>';
    const ta = $('textarea', content);
    const count = $('.count', content);
    const save = $('[data-e="save"]', content);
    let busy = false;
    ta.value = p.text;
    const update = () => {
      const t = trim(ta.value);
      const remaining = MAX_TEXT - len(t);
      count.textContent = countText(remaining);
      count.classList.toggle('over', remaining < 0);
      save.disabled = busy || t === p.text || remaining < 0 || (len(t) === 0 && p.images.length === 0);
    };
    const cancel = () => { state.editingPostId = null; rerenderPost(id); };
    const submit = async () => {
      if (save.disabled) return;
      busy = true;
      save.textContent = '保存中…';
      update();
      try {
        await api('action');
      } catch (e) {
        busy = false;
        save.textContent = '保存する';
        update();
        toast(post(id) ? M[18] : M[11]); // 編集中の表示のままにする
        return;
      }
      p.text = trim(ta.value);
      p.editedAt = Date.now(); // 投稿日時と並び順は変えない
      state.editingPostId = null;
      rerenderPost(id);
    };
    ta.addEventListener('input', update);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) { e.preventDefault(); submit(); }
    });
    $('[data-e="cancel"]', content).addEventListener('click', cancel);
    save.addEventListener('click', submit);
    autoGrow(ta);
    update();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function deletePost(id) {
    confirmDialog('投稿を削除', M[10], () => {
      db.posts = db.posts.filter((p) => p.id !== id);
      db.deletedPostIds.push(id);
      if (parseHash().path.startsWith('/posts/')) { go('#/'); return; }
      $$('article[data-post="' + id + '"]').forEach((el) => el.remove());
    });
  }

  // ---------------------------------------------------------------- いいね（L-1〜L-3）
  async function toggleLike(btn, id) {
    if (btn.disabled) return; // 続けて押しても 2 つにならない
    const p = post(id);
    if (!p) return;
    btn.disabled = true;
    try {
      await api('action');
    } catch (e) {
      btn.disabled = false;
      toast(M[18]);
      return;
    }
    const i = p.likes.findIndex((l) => l.userId === state.me.id);
    if (i >= 0) p.likes.splice(i, 1);
    else p.likes.push({ userId: state.me.id, at: Date.now() });
    const liked = i < 0;
    $$('article[data-post="' + id + '"] .like-btn').forEach((b) => {
      b.disabled = false;
      b.classList.toggle('liked', liked);
      b.textContent = liked ? '♥' : '♡';
      b.setAttribute('aria-pressed', liked);
      b.nextElementSibling.textContent = p.likes.length;
    });
  }

  // ---------------------------------------------------------------- フォロー（F-1〜F-4）
  async function toggleFollow(btn) {
    if (btn.disabled) return;
    const targetId = Number(btn.dataset.uid);
    btn.disabled = true;
    try {
      await api('action');
    } catch (e) {
      btn.disabled = false;
      toast(M[18]);
      return;
    }
    const me = state.me.id;
    if (isFollowing(me, targetId)) db.follows = db.follows.filter((f) => !(f.from === me && f.to === targetId));
    else db.follows.push({ from: me, to: targetId, at: Date.now() });
    $$('[data-action="follow"][data-uid="' + targetId + '"]').forEach((b) => { b.outerHTML = followButton(user(targetId)); });
    $$('[data-followers="' + targetId + '"]').forEach((el) => { el.textContent = followersOf(targetId).length; });
    $$('[data-following="' + me + '"]').forEach((el) => { el.textContent = followingOf(me).length; });
  }

  // ---------------------------------------------------------------- G-5 いいねした人の一覧画面（L-5）
  function renderLikes(id) {
    const p = post(Number(id));
    if (!p) { layout(pageHead('いいね') + '<div class="empty">' + M[11] + '</div>'); return; }
    layout(pageHead('いいね ' + p.likes.length + ' 件') + '<div id="list"></div>');
    pagedList($('#list'), {
      items: p.likes.slice().sort((a, b) => b.at - a.at).map((l) => user(l.userId)),
      render: (u) => userRow(u, false),
      empty: 'まだいいねはありません。',
    });
  }

  // ---------------------------------------------------------------- G-6 プロフィール画面（PF-1〜PF-4・F-5）
  function renderProfile(uid) {
    const u = userByUid(uid);
    if (!u) { layout('<div class="empty">' + M[17] + '</div>'); return; }
    const mine = u.id === state.me.id;
    const joined = new Date(u.joinedAt);
    const posts = db.posts.filter((p) => p.authorId === u.id).sort(newestFirst);
    layout(
      '<section class="profile"><div class="profile-top">' + avatar(u, 80) +
      (mine ? '<a class="btn btn-secondary" href="#/settings/profile">プロフィールを編集</a>' : followButton(u)) +
      '</div><span class="name">' + esc(u.name) + '</span><span class="uid">@' + esc(u.userId) + '</span>' +
      (u.bio ? '<div class="bio">' + esc(u.bio) + '</div>' : '') +
      '<div class="sub">' + joined.getFullYear() + '年' + (joined.getMonth() + 1) + '月から利用</div>' +
      '<div class="profile-stats">' +
      '<a href="#/users/' + esc(u.userId) + '/following">フォロー <b data-following="' + u.id + '">' + followingOf(u.id).length + '</b></a>' +
      '<a href="#/users/' + esc(u.userId) + '/followers">フォロワー <b data-followers="' + u.id + '">' + followersOf(u.id).length + '</b></a>' +
      '<span>投稿 <b>' + posts.length + '</b></span></div></section><div id="list"></div>'
    );
    pagedList($('#list'), {
      items: posts,
      render: (p) => postCard(p),
      empty: 'まだ投稿がありません。',
      end: posts.length > PAGE ? 'これ以上の投稿はありません' : '',
    });
  }

  // ---------------------------------------------------------------- G-7 プロフィールの編集画面（PF-5〜PF-9・第 2 版）
  function renderEditProfile() {
    const me = state.me;
    let avatarDraft = me.avatar; // 保存するまで反映しない
    layout(
      pageHead('プロフィールを編集', '#/users/' + me.userId) +
      '<form class="edit-profile" id="profile-form" novalidate>' +
      '<div class="avatar-edit"><span id="avatar-preview"></span>' +
      '<button type="button" class="btn btn-secondary" id="avatar-pick">画像を選ぶ</button>' +
      '<input type="file" id="avatar-file" hidden accept="image/jpeg,image/png,image/webp">' +
      '<button type="button" class="link-btn" id="avatar-remove">アイコンを外す</button></div>' +
      '<p class="error-text" id="avatar-error" hidden></p>' +
      '<div class="field" data-field="name"><label for="p-name">表示名</label><input id="p-name"><p class="error-text" hidden></p></div>' +
      '<div class="field"><label for="p-bio">自己紹介</label><textarea id="p-bio" rows="4"></textarea><div class="counter-right" id="bio-count"></div></div>' +
      '<div class="form-buttons"><a class="btn btn-secondary" href="#/users/' + esc(me.userId) + '">キャンセル</a>' +
      '<button type="submit" class="btn btn-primary" id="p-save">保存する</button></div></form>'
    );
    const name = $('#p-name');
    const bio = $('#p-bio');
    const nameError = $('[data-field="name"] .error-text');
    const avatarError = $('#avatar-error');
    name.value = me.name;
    bio.value = me.bio;
    limitInput(name, MAX_NAME);
    limitInput(bio, MAX_BIO);

    const drawAvatar = () => {
      $('#avatar-preview').innerHTML = avatar({ name: trim(name.value) || me.name, avatar: avatarDraft }, 96);
      $('#avatar-remove').hidden = !avatarDraft;
    };
    const drawBioCount = () => { $('#bio-count').textContent = '残り ' + (MAX_BIO - len(bio.value)); };
    drawAvatar();
    drawBioCount();

    name.addEventListener('input', () => { nameError.hidden = true; $('[data-field="name"]').classList.remove('invalid'); drawAvatar(); });
    bio.addEventListener('input', drawBioCount);
    $('#avatar-pick').addEventListener('click', () => $('#avatar-file').click());
    $('#avatar-file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      avatarError.hidden = true;
      if (!(await checkImage(f, ['jpeg', 'png', 'webp']))) {
        avatarError.textContent = M[21];
        avatarError.hidden = false;
        return;
      }
      avatarDraft = await readAsDataUrl(f);
      drawAvatar();
    });
    $('#avatar-remove').addEventListener('click', () => { avatarDraft = null; avatarError.hidden = true; drawAvatar(); });

    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const n = trim(name.value);
      if (!n) {
        nameError.textContent = M[5];
        nameError.hidden = false;
        $('[data-field="name"]').classList.add('invalid');
        name.focus();
        return;
      }
      const save = $('#p-save');
      save.disabled = true;
      save.textContent = '保存中…';
      try {
        await api('action');
      } catch (err) {
        save.disabled = false;
        save.textContent = '保存する';
        toast(M[18]); // 入力した内容は残す
        return;
      }
      me.name = n;
      me.bio = trim(bio.value);
      me.avatar = avatarDraft;
      go('#/users/' + me.userId);
    });
  }

  // ---------------------------------------------------------------- G-8 フォロー中・フォロワーの一覧画面（F-5・F-6）
  function renderFollows(uid, kind) {
    const u = userByUid(uid);
    if (!u) { layout('<div class="empty">' + M[17] + '</div>'); return; }
    const base = '#/users/' + esc(u.userId);
    layout(
      pageHead(esc(u.name), '#/users/' + u.userId) +
      '<nav class="tabs" role="tablist">' +
      '<a role="tab" class="tab' + (kind === 'following' ? ' active' : '') + '" href="' + base + '/following">フォロー中</a>' +
      '<a role="tab" class="tab' + (kind === 'followers' ? ' active' : '') + '" href="' + base + '/followers">フォロワー</a>' +
      '</nav><div id="list"></div>'
    );
    const rows = kind === 'following' ? followingOf(u.id).map((f) => user(f.to)) : followersOf(u.id).map((f) => user(f.from));
    pagedList($('#list'), {
      items: rows,
      render: (x) => userRow(x, true),
      empty: kind === 'following' ? 'まだ誰もフォローしていません。' : 'まだフォロワーはいません。',
    });
  }

  // ---------------------------------------------------------------- G-9 ユーザー検索の結果画面（S-1〜S-9）
  function searchUsers(q) {
    const k = q.replace(/^@/, '').toLowerCase(); // 先頭の「@」は取り除く（S-4）
    if (!k) return [];
    const rank = (u) => {
      const id = u.userId.toLowerCase();
      if (id === k) return 0;
      if (id.startsWith(k)) return 1;
      if (u.name.toLowerCase().startsWith(k)) return 2;
      return 3;
    };
    return db.users
      .filter((u) => u.userId.toLowerCase().includes(k) || u.name.toLowerCase().includes(k))
      .map((u) => ({ u, r: rank(u), f: followersOf(u.id).length }))
      .sort((a, b) => a.r - b.r || b.f - a.f || a.u.userId.localeCompare(b.u.userId)) // S-6
      .map((x) => x.u);
  }

  function renderSearch(query) {
    const q = trim(query.get('q') || '');
    layout('<h1 class="search-title">「' + esc(q) + '」の検索結果</h1><div id="list"></div>', q);
    pagedList($('#list'), {
      items: searchUsers(q),
      render: (u) => userRow(u, true),
      empty: esc(M[16](q)),
    });
  }

  // ---------------------------------------------------------------- 画面全体の操作
  function closeMenus() {
    $$('.menu').forEach((m) => m.remove());
  }

  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!target.closest('.menu-wrap')) closeMenus();
    const actionEl = target.closest('[data-action]');
    const card = target.closest('article[data-post]');
    const postId = card ? Number(card.dataset.post) : null;

    if (actionEl) {
      switch (actionEl.dataset.action) {
        case 'logout': logout(); return;
        case 'back':
          if (actionEl.dataset.to) go(actionEl.dataset.to);
          else if (state.navCount > 0) history.back();
          else go('#/');
          return;
        case 'tab': {
          const tab = actionEl.dataset.tab;
          storageSet('rt.tab', tab);
          go('#/?tab=' + tab); // 同じタブを押し直したときも最新の 20 件から出し直す（T-6）
          return;
        }
        case 'search-open':
          $('#header').classList.add('searching');
          $('#search-form input').focus();
          return;
        case 'search-close':
          $('#header').classList.remove('searching');
          return;
        case 'menu': {
          const wrap = actionEl.parentElement;
          const open = $('.menu', wrap);
          closeMenus();
          if (!open) {
            wrap.insertAdjacentHTML('beforeend', '<div class="menu" role="menu"><button type="button" role="menuitem" data-action="edit">編集</button>' +
              '<button type="button" role="menuitem" class="danger" data-action="delete-post">削除</button></div>');
          }
          return;
        }
        case 'edit': closeMenus(); startEdit(card); return;
        case 'delete-post': closeMenus(); deletePost(postId); return;
        case 'open-post':
          if (card.classList.contains('detail')) {
            const ta = $('.composer textarea');
            if (ta && actionEl.classList.contains('count-btn')) ta.focus();
            return;
          }
          go('#/posts/' + postId);
          return;
        case 'likes': go('#/posts/' + postId + '/likes'); return;
        case 'like': toggleLike(actionEl, postId); return;
        case 'zoom': openLightbox(post(postId).images, Number(actionEl.dataset.index)); return;
        case 'follow': toggleFollow(actionEl); return;
        case 'delete-comment': {
          const item = actionEl.closest('[data-comment]');
          const cid = Number(item.dataset.comment);
          confirmDialog('コメントを削除', M[15], () => {
            const p = db.posts.find((x) => x.comments.some((c) => c.id === cid));
            if (p) {
              p.comments = p.comments.filter((c) => c.id !== cid);
              updateCommentCount(p);
            }
            item.remove();
          });
          return;
        }
      }
    }
    // ユーザーの行は、ボタン以外のどこを押してもその人の G-6
    const row = target.closest('.user-row');
    if (row && !target.closest('a, button')) go(row.dataset.href);
  });

  // ---------------------------------------------------------------- 通信切れ（M-20）
  function updateNotice() {
    const n = $('#notice');
    if (n) n.hidden = !(state.mock.offline || !navigator.onLine);
  }
  window.addEventListener('online', updateNotice);
  window.addEventListener('offline', updateNotice);

  // ---------------------------------------------------------------- モック操作（本番にはない）
  const panel = document.getElementById('mock-panel');
  function syncMockPanel() {
    $$('input[data-mock]', panel).forEach((el) => { el.checked = !!state.mock[el.dataset.mock]; });
    updateNotice();
  }
  panel.addEventListener('change', (e) => {
    const key = e.target.dataset.mock;
    if (key) { state.mock[key] = e.target.checked; syncMockPanel(); }
  });
  panel.addEventListener('click', (e) => {
    const key = e.target.dataset && e.target.dataset.mock;
    if (key === 'toggle') $('.mock-body', panel).hidden = !$('.mock-body', panel).hidden;
    if (key === 'expire' && state.me) {
      state.redirectTo = location.hash;
      logout(M[19]);
    }
    if (key === 'deleted' && state.me) go('#/posts/' + db.deletedPostIds[db.deletedPostIds.length - 1]);
    if (key === 'reset') {
      db = window.MockData.create();
      state.me = state.me ? userByUid(state.me.userId) || null : null;
      if (!state.me) storageSet('rt.me', null);
      render();
    }
  });

  // ---------------------------------------------------------------- 起動
  // A-8：前回ログインしたままなら続けて使う（サンプルデータにいる人のみ）
  const saved = storageGet('rt.me');
  if (saved) state.me = userByUid(saved) || null;
  render();
})();
