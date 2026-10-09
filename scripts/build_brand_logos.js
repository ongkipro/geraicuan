const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

// 1. Load smooth vector path definitions
const markSvg = fs.readFileSync('logos/geraicuan-mark.svg', 'utf8');
const cresD = markSvg.match(/fill="#0B2D5B" d="([^"]+)"/)[1];
const arrowD = markSvg.match(/fill="url\(#gcArrowGradColor\)" d="([^"]+)"/)[1];

// 2. Load authentic Inter font vector outlines (from Inter-Variable.ttf)
const fv = JSON.parse(fs.readFileSync('brain_scratch/font_vectors.json', 'utf8'));

function pathsToSvg(paths, fill) {
  return paths.map(p => `<path fill="${fill}" d="${p.d}" transform="translate(${p.x}, 0)" />`).join('\n');
}

console.log('Building 100% mathematically precise brand assets according to Brand Guideline 2026...');

// Ensure output directories exist
fs.mkdirSync('logos', { recursive: true });
fs.mkdirSync('public/logos', { recursive: true });

// ==========================================
// 1. STANDALONE G-MARK (ICON)
// ==========================================
// Section 02 - Full Color
const markColorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1684 1672" width="100%" height="100%">
  <defs>
    <linearGradient id="gcArrowGradColor" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
  </defs>
  <path fill="#0B2D5B" d="${cresD}" />
  <path fill="url(#gcArrowGradColor)" d="${arrowD}" />
</svg>`;

// Section 02 - Dark Background
const markWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1684 1672" width="100%" height="100%">
  <defs>
    <linearGradient id="gcArrowGradWhite" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
  </defs>
  <path fill="#FFFFFF" d="${cresD}" />
  <path fill="url(#gcArrowGradWhite)" d="${arrowD}" />
</svg>`;

// Section 01 / Monochrome
const markMonochromeSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1684 1672" width="100%" height="100%">
  <path fill="#0B2D5B" d="${cresD}" />
  <path fill="#0B2D5B" d="${arrowD}" />
</svg>`;

const markMonochromeWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1684 1672" width="100%" height="100%">
  <path fill="#FFFFFF" d="${cresD}" />
  <path fill="#FFFFFF" d="${arrowD}" />
</svg>`;

// ==========================================
// 2. LOGO HORIZONTAL (OFFICIAL TAGLINE STACKED)
// ==========================================
// Brand Guideline 2026 Section 01
const logoHColorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 84" width="320" height="84">
  <defs>
    <linearGradient id="gcArrowGradHColor" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
  </defs>
  <!-- G-Mark: 64x64 at x=10, y=10 -->
  <g transform="translate(10, 10) scale(0.038)">
    <path fill="#0B2D5B" d="${cresD}" />
    <path fill="url(#gcArrowGradHColor)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan: Inter ExtraBold (wght 800) -->
  <g transform="translate(88, 38) scale(0.0188, -0.0188)">
    <g fill="#0B2D5B">
      ${pathsToSvg(fv.gerai.paths, '#0B2D5B')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
  <!-- Tagline Line 1: LEBIH DARI SEKEDAR (Inter Medium wght 500) -->
  <g transform="translate(97, 54) scale(0.0076, -0.0076)">
    ${pathsToSvg(fv.tag1.paths, '#475569')}
  </g>
  <!-- Tagline Line 2: PENGIRIMAN -->
  <g transform="translate(131.5, 68) scale(0.0076, -0.0076)">
    ${pathsToSvg(fv.tag2.paths, '#475569')}
  </g>
</svg>`;

const logoHWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 84" width="320" height="84">
  <defs>
    <linearGradient id="gcArrowGradHWhite" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
  </defs>
  <!-- G-Mark -->
  <g transform="translate(10, 10) scale(0.038)">
    <path fill="#FFFFFF" d="${cresD}" />
    <path fill="url(#gcArrowGradHWhite)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan -->
  <g transform="translate(88, 38) scale(0.0188, -0.0188)">
    <g fill="#FFFFFF">
      ${pathsToSvg(fv.gerai.paths, '#FFFFFF')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
  <!-- Tagline Line 1 -->
  <g transform="translate(97, 54) scale(0.0076, -0.0076)">
    ${pathsToSvg(fv.tag1.paths, '#94A3B8')}
  </g>
  <!-- Tagline Line 2 -->
  <g transform="translate(131.5, 68) scale(0.0076, -0.0076)">
    ${pathsToSvg(fv.tag2.paths, '#94A3B8')}
  </g>
</svg>`;

// ==========================================
// 3. LOGO CLEAN (WORDMARK ONLY, NO TAGLINE)
// ==========================================
// Ideal for 36px-48px compact headers
const logoCleanColorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 60" width="280" height="60">
  <defs>
    <linearGradient id="gcArrowGradClean" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
  </defs>
  <!-- G-Mark: 44x44 at x=8, y=8 -->
  <g transform="translate(8, 8) scale(0.0261)">
    <path fill="#0B2D5B" d="${cresD}" />
    <path fill="url(#gcArrowGradClean)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan -->
  <g transform="translate(64, 40) scale(0.0188, -0.0188)">
    <g fill="#0B2D5B">
      ${pathsToSvg(fv.gerai.paths, '#0B2D5B')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
</svg>`;

const logoCleanWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 60" width="280" height="60">
  <defs>
    <linearGradient id="gcArrowGradCleanWhite" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
  </defs>
  <!-- G-Mark: 44x44 at x=8, y=8 -->
  <g transform="translate(8, 8) scale(0.0261)">
    <path fill="#FFFFFF" d="${cresD}" />
    <path fill="url(#gcArrowGradCleanWhite)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan -->
  <g transform="translate(64, 40) scale(0.0188, -0.0188)">
    <g fill="#FFFFFF">
      ${pathsToSvg(fv.gerai.paths, '#FFFFFF')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
</svg>`;

// ==========================================
// 4. CO-BRANDING: POWERED BY MENGANTAR
// ==========================================
const totalMengW = (fv.meng_powered.width + fv.meng_brand.width) * 0.0076;
const geraiCuanW = (fv.gerai.width + fv.cuan.width) * 0.0188;
const geraiCuanCenter = 88 + geraiCuanW / 2;
const mengX = Math.round((geraiCuanCenter - totalMengW / 2) * 10) / 10;

const logoMengDarkSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="320" height="80">
  <defs>
    <linearGradient id="gcArrowGradMDark" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
  </defs>
  <!-- G-Mark -->
  <g transform="translate(10, 8) scale(0.038)">
    <path fill="#0B2D5B" d="${cresD}" />
    <path fill="url(#gcArrowGradMDark)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan -->
  <g transform="translate(88, 38) scale(0.0188, -0.0188)">
    <g fill="#0B2D5B">
      ${pathsToSvg(fv.gerai.paths, '#0B2D5B')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
  <!-- powered by mengantar -->
  <g transform="translate(${mengX}, 60) scale(0.0076, -0.0076)">
    <g fill="#475569">
      ${pathsToSvg(fv.meng_powered.paths, '#475569')}
    </g>
    <g transform="translate(${fv.meng_powered.width}, 0)" fill="#0B2D5B">
      ${pathsToSvg(fv.meng_brand.paths, '#0B2D5B')}
    </g>
  </g>
</svg>`;

const logoMengWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 80" width="320" height="80">
  <defs>
    <linearGradient id="gcArrowGradMWhite" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
  </defs>
  <!-- G-Mark -->
  <g transform="translate(10, 8) scale(0.038)">
    <path fill="#FFFFFF" d="${cresD}" />
    <path fill="url(#gcArrowGradMWhite)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan -->
  <g transform="translate(88, 38) scale(0.0188, -0.0188)">
    <g fill="#FFFFFF">
      ${pathsToSvg(fv.gerai.paths, '#FFFFFF')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
  <!-- powered by mengantar -->
  <g transform="translate(${mengX}, 60) scale(0.0076, -0.0076)">
    <g fill="#94A3B8">
      ${pathsToSvg(fv.meng_powered.paths, '#94A3B8')}
    </g>
    <g transform="translate(${fv.meng_powered.width}, 0)" fill="#38BDF8">
      ${pathsToSvg(fv.meng_brand.paths, '#38BDF8')}
    </g>
  </g>
</svg>`;

// ==========================================
// 5. LOGO UTAMA (VERTIKAL)
// ==========================================
// Brand Guideline 2026 Section 01
const logoVColorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220" width="240" height="220">
  <defs>
    <linearGradient id="gcArrowGradVColor" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#3B82F6" />
    </linearGradient>
  </defs>
  <!-- G-Mark -->
  <g transform="translate(72, 16) scale(0.057)">
    <path fill="#0B2D5B" d="${cresD}" />
    <path fill="url(#gcArrowGradVColor)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan -->
  <g transform="translate(27.4, 154) scale(0.01745, -0.01745)">
    <g fill="#0B2D5B">
      ${pathsToSvg(fv.gerai.paths, '#0B2D5B')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
  <!-- Tagline Line 1 -->
  <g transform="translate(36, 180) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag1.paths, '#475569')}
  </g>
  <!-- Tagline Line 2 -->
  <g transform="translate(68, 198) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag2.paths, '#475569')}
  </g>
</svg>`;

const logoVWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220" width="240" height="220">
  <defs>
    <linearGradient id="gcArrowGradVWhite" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1A73E8" />
      <stop offset="100%" stop-color="#38BDF8" />
    </linearGradient>
  </defs>
  <!-- G-Mark -->
  <g transform="translate(72, 16) scale(0.057)">
    <path fill="#FFFFFF" d="${cresD}" />
    <path fill="url(#gcArrowGradVWhite)" d="${arrowD}" />
  </g>
  <!-- GeraiCuan -->
  <g transform="translate(27.4, 154) scale(0.01745, -0.01745)">
    <g fill="#FFFFFF">
      ${pathsToSvg(fv.gerai.paths, '#FFFFFF')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#1A73E8">
      ${pathsToSvg(fv.cuan.paths, '#1A73E8')}
    </g>
  </g>
  <!-- Tagline Line 1 -->
  <g transform="translate(36, 180) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag1.paths, '#94A3B8')}
  </g>
  <!-- Tagline Line 2 -->
  <g transform="translate(68, 198) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag2.paths, '#94A3B8')}
  </g>
</svg>`;

// ==========================================
// 6. LOGO MONOKROM
// ==========================================
// Section 01
const logoMonoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220" width="240" height="220">
  <g transform="translate(72, 16) scale(0.057)">
    <path fill="#0B2D5B" d="${cresD}" />
    <path fill="#0B2D5B" d="${arrowD}" />
  </g>
  <g transform="translate(27.4, 154) scale(0.01745, -0.01745)" fill="#0B2D5B">
    <g fill="#0B2D5B">
      ${pathsToSvg(fv.gerai.paths, '#0B2D5B')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#0B2D5B">
      ${pathsToSvg(fv.cuan.paths, '#0B2D5B')}
    </g>
  </g>
  <g transform="translate(36, 180) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag1.paths, '#0B2D5B')}
  </g>
  <g transform="translate(68, 198) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag2.paths, '#0B2D5B')}
  </g>
</svg>`;

const logoMonoWhiteSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220" width="240" height="220">
  <g transform="translate(72, 16) scale(0.057)">
    <path fill="#FFFFFF" d="${cresD}" />
    <path fill="#FFFFFF" d="${arrowD}" />
  </g>
  <g transform="translate(27.4, 154) scale(0.01745, -0.01745)" fill="#FFFFFF">
    <g fill="#FFFFFF">
      ${pathsToSvg(fv.gerai.paths, '#FFFFFF')}
    </g>
    <g transform="translate(${fv.gerai.width}, 0)" fill="#FFFFFF">
      ${pathsToSvg(fv.cuan.paths, '#FFFFFF')}
    </g>
  </g>
  <g transform="translate(36, 180) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag1.paths, '#FFFFFF')}
  </g>
  <g transform="translate(68, 198) scale(0.0070, -0.0070)">
    ${pathsToSvg(fv.tag2.paths, '#FFFFFF')}
  </g>
</svg>`;

// ==========================================
// 7. APP ICON / FAVICON (SECTION 02)
// ==========================================
// Blue gradient squircle + solid white G-mark
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="favGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2B7FFF" />
      <stop offset="100%" stop-color="#0B2D5B" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="118" fill="url(#favGrad)" />
  <g transform="translate(96, 97) scale(0.190)">
    <path fill="#FFFFFF" d="${cresD}" />
    <path fill="#FFFFFF" d="${arrowD}" />
  </g>
</svg>`;

// Write all SVGs to both logos/ and public/logos/
const files = {
  // Mark
  'geraicuan-mark.svg': markColorSvg,
  'geraicuan-mark-white.svg': markWhiteSvg,
  'geraicuan-mark-monochrome.svg': markMonochromeSvg,
  // Horizontal (Official Brand Guideline 2026)
  'geraicuan-logo-horizontal.svg': logoHColorSvg,
  'geraicuan-logo-horizontal-white.svg': logoHWhiteSvg,
  // Clean lockup (Compact header)
  'geraicuan-logo-clean.svg': logoCleanColorSvg,
  'geraicuan-logo-clean-white.svg': logoCleanWhiteSvg,
  // Co-branding (Web)
  'logo-geraicuan-mengantar-dark.svg': logoMengDarkSvg,
  'logo-geraicuan-mengantar-white.svg': logoMengWhiteSvg,
  // Vertical
  'geraicuan-logo-vertical.svg': logoVColorSvg,
  'geraicuan-logo-vertical-white.svg': logoVWhiteSvg,
  // Monochrome
  'geraicuan-logo-monochrome.svg': logoMonoSvg,
  'geraicuan-logo-monochrome-white.svg': logoMonoWhiteSvg,
};

Object.entries(files).forEach(([name, content]) => {
  fs.writeFileSync(`logos/${name}`, content);
  fs.writeFileSync(`public/logos/${name}`, content);
});

// Favicon SVG
fs.writeFileSync('favicon.svg', faviconSvg);
fs.writeFileSync('public/favicon.svg', faviconSvg);

// Export High-Res PNGs using Resvg
function exportPng(svgStr, targetFile, width) {
  const resvg = new Resvg(svgStr, { fitTo: { mode: 'width', value: width } });
  const pngData = resvg.render().asPng();
  fs.writeFileSync(targetFile, pngData);
  return pngData;
}

// PNG outputs
exportPng(faviconSvg, 'favicon.png', 512);
exportPng(faviconSvg, 'public/favicon.png', 512);
exportPng(faviconSvg, 'apple-touch-icon.png', 180);
exportPng(faviconSvg, 'public/apple-touch-icon.png', 180);

exportPng(logoHColorSvg, 'logos/geraicuan-logo-horizontal.png', 960);
exportPng(logoHColorSvg, 'public/logos/geraicuan-logo-horizontal.png', 960);

exportPng(logoMengDarkSvg, 'logos/logo-geraicuan-mengantar-dark.png', 960);
exportPng(logoMengDarkSvg, 'public/logos/logo-geraicuan-mengantar-dark.png', 960);

exportPng(logoMengWhiteSvg, 'logos/logo-geraicuan-mengantar-white.png', 960);
exportPng(logoMengWhiteSvg, 'public/logos/logo-geraicuan-mengantar-white.png', 960);

exportPng(logoVColorSvg, 'logos/geraicuan-logo-vertical.png', 720);
exportPng(logoVColorSvg, 'public/logos/geraicuan-logo-vertical.png', 720);

exportPng(markColorSvg, 'logos/geraicuan-mark.png', 512);
exportPng(markColorSvg, 'public/logos/geraicuan-mark.png', 512);

console.log('✓ All brand vector and raster assets generated with 100% precision.');
