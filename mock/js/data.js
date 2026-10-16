// サンプルデータ。データベースの代わりに、画面を開くたびにメモリ上に作る（再読み込みで元に戻る）。
// 項目はデータ要件定義書（RT-REQ-DATA）のとおり。
(function () {
  'use strict';

  // 毎回同じデータになるよう、決まった種から乱数を作る
  function seeded(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  // 画像ファイルの代わりに SVG で描いた絵を使う
  function svgUrl(svg) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function sampleImage(label, c1, c2) {
    return svgUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="800" height="600" fill="url(#g)"/>' +
      '<circle cx="620" cy="150" r="70" fill="#fff" opacity="0.55"/>' +
      '<path d="M0 470 L180 300 L330 430 L470 280 L800 520 L800 600 L0 600 Z" fill="#000" opacity="0.18"/>' +
      '<text x="400" y="390" text-anchor="middle" font-size="52" font-family="sans-serif" fill="#fff">' + label + '</text></svg>'
    );
  }

  function sampleAvatar(c1, c2, mark) {
    return svgUrl(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
      '<rect width="200" height="200" fill="url(#a)"/>' +
      '<text x="100" y="128" font-size="80" text-anchor="middle" font-family="sans-serif">' + mark + '</text></svg>'
    );
  }

  const IMAGES = [
    ['川沿い', '#7dc3e8', '#2a6f97'], ['夕焼け', '#ffb36b', '#c0245c'], ['公園', '#a8e6a1', '#3c8d40'],
    ['カフェ', '#e9d5b7', '#8a5a2b'], ['山', '#c9d6ff', '#4a5a8a'], ['海', '#8fd3fe', '#1a5fb4'],
    ['花', '#ffd1e8', '#b5487c'], ['夜景', '#4b4f7a', '#0f1419'], ['ねこ', '#f5e1a4', '#a0752c'],
  ];

  const USERS = [
    // [ユーザー ID, 表示名, 自己紹介, アイコン]
    ['taro_y', 'たろう', '川沿いを散歩するのが好きです\n写真も少し撮ります', null],
    ['hana', 'はなこ', '新しいカメラを買いました📷\n風景とねこを撮っています', ['#ffd1e8', '#b5487c', '🌸']],
    ['jiro', 'じろう', 'コーヒーと読書', null],
    ['taro', 'たろう', 'taro です。よろしくお願いします', null],
    ['yamada', '山田taro', '山田です。週末は山に登ります', ['#c9d6ff', '#4a5a8a', '⛰️']],
    ['saburo', 'さぶろう', '', null],
    ['mika', 'みか', 'パンを焼くのが趣味', ['#f5e1a4', '#a0752c', '🍞']],
    ['ken_t', 'けん', 'エンジニア。Java と React を勉強中', null],
    ['yuki_s', 'ゆき', '雪国育ち', null],
    ['sora', 'そら', '空の写真をあげています', ['#8fd3fe', '#1a5fb4', '☁️']],
    ['natsu_a', 'なつ', '夏が好き', null],
    ['akira', 'あきら', 'ランニング始めました', null],
    ['haruka', 'はるか', '', null],
    ['kaito', 'かいと', '釣りとキャンプ', null],
    ['sakura_m', 'さくら', '春生まれ🌸', ['#ffe3ec', '#e76f8b', '🌷']],
    ['daichi', 'だいち', '農業やってます', null],
    ['aoi', 'あおい', 'イラストを描いています', null],
    ['ren_k', 'れん', '', null],
    ['minato', 'みなと', '港町に住んでいます', null],
    ['nana', 'なな', '7 が好きな数字', null],
    ['takashi', 'たかし', '料理の記録', null],
    ['mai_t', 'まい', 'ダンス', null],
    ['shota', 'しょうた', '大学生', null],
    ['ayaka', 'あやか', '旅行が好き✈️', null],
    ['kazuma', 'かずま', '', null],
    ['tamago', 'たまご', '毎日たまご料理', null],
    ['panda_lab', 'パンダ研究所', 'パンダについて話します', null],
  ];

  const TEXTS = [
    '今日は晴れ。川沿いを散歩してきた',
    '新しいカメラで撮った',
    'コーヒーを淹れるのがうまくなってきた気がする',
    'おはようございます。\n今日もがんばります',
    '週末は山に登りました。頂上は風が強かった',
    'パンが焼けた🍞',
    '電車が遅れていて会議に間に合わなさそう…',
    'React の useEffect、やっとわかってきた',
    '雪が降ってきた',
    '空がきれいだった',
    '夕焼けを撮りに行ってきた',
    'ランニング 5km 走った。少しずつ伸ばしていきたい',
    '本を 1 冊読み終えた。おすすめあれば教えてください',
    '釣れなかったけど楽しかった',
    '桜はまだ先かな',
    'トマトがたくさん採れた',
    'ねこが膝の上で寝てしまって動けない',
    '<b>タグ</b> はそのまま文字で出る（W-5 の確認）',
    'お昼はオムライス',
    'ダンスの練習、筋肉痛…',
    'レポートの締め切りが近い',
    '次はどこに旅行しようかな',
    'カフェで作業中',
    'インプレッション数がないので気楽に投稿できる',
    '長い文章のテストです。' + 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん'.repeat(3),
    'たまご焼きに砂糖を入れる派です',
    'パンダの赤ちゃん、かわいい',
    '夜景を見に行った',
    '公園の花が咲いていた',
    '海まで自転車で行った',
  ];

  const COMMENTS = [
    'いい天気ですね', '散歩いいな', 'すてきな写真！', 'わかります', 'おつかれさまです',
    'どこですか？', 'いいね', '行ってみたい', 'おいしそう', 'がんばってください',
  ];

  function create() {
    const rand = seeded(20261017);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const now = Date.now();
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    const DAY = 24 * HOUR;

    const users = USERS.map((u, i) => ({
      id: i + 1,
      userId: u[0],
      name: u[1],
      bio: u[2],
      avatar: u[3] ? sampleAvatar(u[3][0], u[3][1], u[3][2]) : null,
      password: 'password1', // モックでは全員同じ
      joinedAt: new Date(2026, 9 - (i % 4), 1 + i).getTime(),
      failCount: 0,
      lockedUntil: null,
    }));
    users[0].joinedAt = new Date(2026, 9, 1).getTime();
    const byUid = (uid) => users.find((u) => u.userId === uid).id;

    // フォロー：自分（taro_y）は何人かをフォローし、ほかの人も適当にフォローし合う
    const follows = [];
    const addFollow = (from, to, at) => {
      if (from !== to && !follows.some((f) => f.from === from && f.to === to)) follows.push({ from, to, at });
    };
    ['hana', 'jiro', 'mika', 'ken_t', 'sora', 'yamada'].forEach((uid, i) => addFollow(1, byUid(uid), now - (i + 1) * DAY));
    users.forEach((u) => {
      const n = Math.floor(rand() * 8);
      for (let k = 0; k < n; k++) addFollow(u.id, pick(users).id, now - Math.floor(rand() * 60) * DAY);
    });
    // hana は人気者（フォロワーの一覧で「さらに読み込む」を試せるよう全員からフォローされる）
    users.forEach((u) => addFollow(u.id, byUid('hana'), now - Math.floor(rand() * 30) * DAY));

    // 投稿：古いものから作り、新しいものほど ID を大きくする
    const plan = [];
    plan.push({ at: new Date(2025, 11, 24, 20, 0).getTime(), uid: 'hana', text: '去年のクリスマスの写真', imgs: [7, 1] });
    plan.push({ at: new Date(2025, 11, 31, 23, 50).getTime(), uid: 'taro_y', text: '今年もありがとうございました', imgs: [] });
    for (let i = 0; i < 70; i++) {
      const ago = Math.floor(rand() * 20 * DAY) + 2 * HOUR;
      const r = rand();
      const nImg = r < 0.6 ? 0 : r < 0.75 ? 1 : r < 0.85 ? 2 : r < 0.93 ? 3 : 4;
      const imgs = [];
      for (let k = 0; k < nImg; k++) imgs.push(Math.floor(rand() * IMAGES.length));
      plan.push({ at: now - ago, uid: pick(users).userId, text: pick(TEXTS), imgs });
    }
    plan.push({ at: now - 90 * MIN, uid: 'jiro', text: 'いまから本屋に行く', imgs: [] });
    plan.push({ at: now - 50 * MIN, uid: 'hana', text: '新しいカメラで撮った', imgs: [0, 5], editedAt: now - 20 * MIN });
    plan.push({ at: now - 3 * MIN, uid: 'taro_y', text: '今日は晴れ。川沿いを散歩してきた', imgs: [0, 2, 1, 5] });
    plan.push({ at: now - 20 * 1000, uid: 'sora', text: 'たった今の投稿（「たった今」の表示の確認）', imgs: [] });
    plan.sort((a, b) => a.at - b.at);

    const posts = plan.map((p, i) => ({
      id: 100 + i,
      authorId: byUid(p.uid),
      text: p.text,
      images: p.imgs.map((n) => sampleImage(IMAGES[n][0], IMAGES[n][1], IMAGES[n][2])),
      createdAt: p.at,
      editedAt: p.editedAt || (rand() < 0.08 ? p.at + 10 * MIN : null),
      likes: [],
      comments: [],
    }));

    let commentId = 1;
    posts.forEach((p) => {
      const nLike = Math.floor(rand() * 14);
      for (let k = 0; k < nLike; k++) {
        const uid = pick(users).id;
        if (!p.likes.some((l) => l.userId === uid)) p.likes.push({ userId: uid, at: p.createdAt + Math.floor(rand() * HOUR) });
      }
      const nCom = Math.floor(rand() * 4);
      for (let k = 0; k < nCom; k++) {
        p.comments.push({ id: commentId++, userId: pick(users).id, text: pick(COMMENTS), at: Math.min(now, p.createdAt + (k + 1) * 7 * MIN) });
      }
    });

    // コメントが 50 件を超える投稿（「さらに表示」の確認用）と、いいねが 20 件を超える投稿
    const popular = posts.find((p) => p.text === '新しいカメラで撮った' && p.editedAt);
    popular.comments = [];
    for (let k = 0; k < 56; k++) {
      popular.comments.push({ id: commentId++, userId: users[k % users.length].id, text: (k + 1) + ' 件目：' + pick(COMMENTS), at: popular.createdAt + k * 30 * 1000 });
    }
    popular.likes = users.map((u, k) => ({ userId: u.id, at: popular.createdAt + k * MIN })).filter((l) => l.userId !== 1);

    return {
      users,
      posts,
      follows,
      deletedPostIds: [99],
      nextPostId: 100 + posts.length,
      nextCommentId: commentId,
      nextUserId: users.length + 1,
    };
  }

  window.MockData = { create };
})();
