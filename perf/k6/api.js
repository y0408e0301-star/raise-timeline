// API の性能テスト（開発計画書 3-8、基本設計書 2.4）。要件定義書 11.1 の N-2・N-3・N-5 を P95 で判定する。
// 環境変数 SCENARIO で測り方を選ぶ（frontend/perf/cli.ts から Docker の grafana/k6 で動かす）。
//   baseline … 1 人で各 API を順に 50 回ずつ呼ぶ（基準の測定）
//   load     … 30 人（LOAD_VUS）が同時に使う。考える時間を挟みながら、5 分（LOAD_DURATION）続ける
import { sleep } from 'k6'
import { del, get, login, put, summary, thresholds, username } from './lib.js'

const SCENARIO = __ENV.SCENARIO || 'baseline'
const LOAD_VUS = Number(__ENV.LOAD_VUS || 30)
const LOAD_DURATION = __ENV.LOAD_DURATION || '5m'

const scenarios = {
  baseline: { executor: 'per-vu-iterations', vus: 1, iterations: 50, maxDuration: '10m' },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: LOAD_VUS },
      { duration: LOAD_DURATION, target: LOAD_VUS },
      { duration: '30s', target: 0 },
    ],
    gracefulRampDown: '30s',
  },
}

export const options = {
  scenarios: { [SCENARIO]: scenarios[SCENARIO] },
  thresholds: thresholds(),
  summaryTrendStats: ['p(50)', 'p(95)', 'p(99)', 'max', 'count'],
  // ログインの Cookie を、繰り返しの間も持ち続ける（既定では 1 回ごとに消える）
  noCookiesReset: true,
}

// 検索の言葉：perf_00（99 人が当たる）、テスト（1,000 人。上限まで並べ替える）、0123（1 人）、xyz（0 人）
const SEARCH_WORDS = ['perf_00', 'テスト', '0123', 'xyz']

// フォローの測定で外して付け直す相手。測るユーザー（1〜50 番）はもともと全員をフォローしている
const followTarget = (iteration) => username(900 + (iteration % 100))

let loggedIn = false

function timeline(tab, next) {
  const res = get(`/api/timeline?tab=${tab}`, `timeline_${tab}`)
  const body = res.status === 200 ? res.json() : { items: [], nextCursor: null }
  if (next && body.nextCursor) {
    get(`/api/timeline?tab=${tab}&cursor=${encodeURIComponent(body.nextCursor)}`, 'timeline_next')
  }
  return body.items
}

// いいねして取り消す（データを元に戻す）。もともといいねしていた投稿は、取り消してからいいねし直す
function toggleLike(post) {
  if (post.likedByMe) {
    del(`/api/posts/${post.id}/like`, 'unlike')
    put(`/api/posts/${post.id}/like`, 'like')
  } else {
    put(`/api/posts/${post.id}/like`, 'like')
    del(`/api/posts/${post.id}/like`, 'unlike')
  }
}

function toggleFollow(target) {
  del(`/api/users/${target}/follow`, 'unfollow')
  put(`/api/users/${target}/follow`, 'follow')
}

// 1 人で、各 API を 1 回ずつ順に呼ぶ（これを 50 回）
function baseline(iteration) {
  const items = timeline('following', true)
  timeline('all', false)
  get(`/api/search/users?q=${encodeURIComponent(SEARCH_WORDS[iteration % SEARCH_WORDS.length])}`, 'search')
  if (items.length > 0) {
    toggleLike(items[iteration % items.length])
  }
  toggleFollow(followTarget(iteration))
}

// 利用者の 1 回の操作。タイムラインを開き、ときどき続きを読む・タブを替える・検索する・いいね・フォローする
function session(iteration) {
  const items = timeline('following', Math.random() < 0.3)
  sleep(2 + Math.random() * 3)
  const r = Math.random()
  if (r < 0.2) {
    timeline('all', false)
  } else if (r < 0.3) {
    get(`/api/search/users?q=${encodeURIComponent(SEARCH_WORDS[iteration % SEARCH_WORDS.length])}`, 'search')
  } else if (r < 0.6 && items.length > 0) {
    toggleLike(items[Math.floor(Math.random() * items.length)])
  } else if (r < 0.7) {
    toggleFollow(followTarget(iteration))
  }
  sleep(2 + Math.random() * 3)
}

export default function () {
  // VU（仮想の利用者）ごとに別のユーザーでログインする（1〜50 番。画面の測定は 41〜43 番を使うので、30 人までにする）
  if (!loggedIn) {
    login(__VU)
    loggedIn = true
  }
  const iteration = __ITER
  if (SCENARIO === 'baseline') {
    baseline(iteration)
  } else {
    session(iteration)
  }
}

// 結果のファイル名（mixed のときは load-mixed）と、表の見出し
const RESULT_NAME = __ENV.RESULT_NAME || SCENARIO
const TITLES = {
  baseline: '1 人で順に 50 回（基準の測定）',
  load: `${LOAD_VUS} 人の同時アクセス`,
  'load-mixed': `${LOAD_VUS} 人の同時アクセス（画面の測定と同時）`,
}

export function handleSummary(data) {
  return summary(data, RESULT_NAME, TITLES[RESULT_NAME] ?? RESULT_NAME)
}
