// サンプルの投稿の画像とアイコン。写真の代わりに SVG で描き、ブラウザで PNG にする（readme.spec.ts）。
// 外部の画像を使わないので、権利を気にせずに README に載せられる

const W = 1200
const H = 800

const svg = (body: string, w = W, h = H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`

// 夕方の海
export const sunsetSea = svg(`
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2b3a67"/><stop offset="0.45" stop-color="#e86f51"/><stop offset="0.62" stop-color="#ffc46b"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f29b6b"/><stop offset="1" stop-color="#1d3557"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <circle cx="600" cy="470" r="90" fill="#ffe29a"/>
  <rect y="480" width="${W}" height="320" fill="url(#sea)"/>
  <g fill="#ffe29a" opacity="0.7">
    <rect x="540" y="500" width="120" height="6" rx="3"/><rect x="500" y="530" width="200" height="5" rx="2"/>
    <rect x="560" y="560" width="80" height="4" rx="2"/><rect x="470" y="600" width="260" height="4" rx="2"/>
  </g>`)

// 砂浜
export const beach = svg(`
  <rect width="${W}" height="${H}" fill="#8ecae6"/>
  <rect y="300" width="${W}" height="200" fill="#219ebc"/>
  <path d="M0 470 Q300 430 600 470 T1200 460 V800 H0 Z" fill="#f4e1b5"/>
  <path d="M0 470 Q300 430 600 470 T1200 460" fill="none" stroke="#fff" stroke-width="10" opacity="0.8"/>
  <circle cx="980" cy="140" r="60" fill="#fff6c9"/>
  <g fill="#fff"><ellipse cx="250" cy="150" rx="110" ry="30"/><ellipse cx="320" cy="130" rx="70" ry="30"/></g>`)

// 朝の湖と山
export const lake = svg(`
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8dadc"/><stop offset="1" stop-color="#f1faee"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <path d="M0 420 L260 170 L420 330 L640 110 L900 360 L1040 250 L1200 420 Z" fill="#457b9d"/>
  <path d="M560 190 L640 110 L720 190 L680 175 L640 200 L600 175 Z" fill="#fff"/>
  <rect y="420" width="${W}" height="380" fill="#9ccbd6"/>
  <path d="M0 420 L260 670 L420 510 L640 730 L900 480 L1040 590 L1200 420 Z" fill="#457b9d" opacity="0.35"/>
  <path d="M0 420 H1200" stroke="#2a5c4a" stroke-width="14"/>`)

// 空の写真 4 枚（朝・昼・夕方・夜）
const skyColors = [['#ffd6a5', '#fdffb6'], ['#4ea8de', '#caf0f8'], ['#9d4edd', '#ff9e00'], ['#03045e', '#3a0ca3']]
export const skies = skyColors.map(([top, bottom], i) => svg(`
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  ${i === 3
    ? '<g fill="#fff">' + [[150, 120], [420, 200], [700, 90], [980, 260], [260, 360], [860, 420], [560, 300]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4"/>`).join('') + '</g><circle cx="900" cy="160" r="70" fill="#f1faee"/>'
    : `<g fill="#fff" opacity="0.85"><ellipse cx="${300 + i * 200}" cy="${250 + i * 40}" rx="180" ry="50"/><ellipse cx="${380 + i * 200}" cy="${220 + i * 40}" rx="110" ry="50"/></g>`}
  <path d="M0 700 Q300 640 600 690 T1200 670 V800 H0 Z" fill="#1b263b" opacity="0.85"/>`))

// アイコン（丸く切り抜かれるので、正方形の中に描く）
export const icon = (background: string, foreground: string, shape: 'wave' | 'mountain') => svg(`
  <rect width="400" height="400" fill="${background}"/>
  ${shape === 'wave'
    ? `<path d="M0 240 Q100 180 200 240 T400 240 V400 H0 Z" fill="${foreground}"/><circle cx="270" cy="140" r="50" fill="#fff6c9"/>`
    : `<path d="M0 320 L140 150 L220 240 L300 120 L400 320 Z" fill="${foreground}"/><circle cx="110" cy="100" r="40" fill="#fff6c9"/>`}`, 400, 400)
