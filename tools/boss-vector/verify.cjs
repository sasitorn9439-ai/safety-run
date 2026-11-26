/** Run with local Vite and Playwright. BOSS_VERIFY_URL, PLAYWRIGHT and CHROME may override defaults.
 * node tools/boss-vector/verify.cjs [output directory]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME,
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.goto(new URL('?dev', process.env.BOSS_VERIFY_URL || 'http://localhost:5178/').href);
    const { images, summary } = await page.evaluate(async () => {
      const { loadBossFrames } = await import('/src/render/boss-vector.ts');
      const frames = await loadBossFrames();
      const original = new Image();
      original.src = '/assets/skins/boss-sprite.png';
      await original.decode();

      function canvas(width, height) {
        const result = document.createElement('canvas');
        result.width = width;
        result.height = height;
        return result;
      }

      function render(scale) {
        const out = canvas(2000 * scale, 577 * scale), ctx = out.getContext('2d');
        for (const [row, poses] of Object.values(frames).entries()) {
          for (const [i, pose] of poses.entries()) {
            ctx.save();
            ctx.translate((i * 125 + 62.5) * scale, (row * 144.25 + 138) * scale);
            pose.draw(ctx, 118 * scale);
            ctx.restore();
          }
        }
        return out;
      }

      const native = render(1), zoom = render(4);
      const flattened = (image) => {
        const plate = canvas(2000, 577), ctx = plate.getContext('2d');
        ctx.fillStyle = '#646464';
        ctx.fillRect(0, 0, 2000, 577);
        ctx.drawImage(image, 0, 0);
        return plate;
      };
      const a = flattened(original), b = flattened(native);
      const rgba = (image) => {
        const cv = canvas(2000, 577), ctx = cv.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return ctx.getImageData(0, 0, 2000, 577);
      };
      const oa = rgba(original).data, va = rgba(native).data, orig = rgba(a).data, vec = rgba(b).data;
      const diff = canvas(2000, 577), diffCtx = diff.getContext('2d');
      const difference = diffCtx.createImageData(2000, 577);
      const stats = [];
      for (const [r, [animation, row]] of Object.entries(frames).entries()) {
        if (row.length !== [12, 16, 16, 14][r]) throw new Error(animation + ' frame count');
        const top = Math.floor(r * 144.25), bottom = Math.floor((r + 1) * 144.25);
        const metrics = row.map((_, i) => {
          let alpha = 0, error = 0, pixels = 0, outliers = 0;
          for (let y = top; y < bottom; y++) {
            for (let x = i * 125; x < (i + 1) * 125; x++) {
              const p = (y * 2000 + x) * 4;
              const e = (Math.abs(orig[p] - vec[p]) + Math.abs(orig[p+1] - vec[p+1]) + Math.abs(orig[p+2] - vec[p+2])) / 3;
              difference.data.set([e * 5, e * 5, e * 5, 255], p);
              if (Math.max(oa[p + 3], va[p + 3]) <= 4) continue;
              error += e;
              alpha += Math.abs(oa[p + 3] - va[p + 3]);
              pixels++;
              outliers += e > 20;
            }
          }
          return { frame: i, pixels, error, alpha, outliers, mae: +(error / pixels).toFixed(2) };
        });
        stats.push({ animation, metrics });
      }
      diffCtx.putImageData(difference, 0, 0);

      const sideBySide = canvas(2000, 577 * 3), panel = sideBySide.getContext('2d');
      [a, b, diff].forEach((image, i) => panel.drawImage(image, 0, 577 * i));
      const detail = canvas(1000, 2308), detailCtx = detail.getContext('2d');
      detailCtx.fillStyle = '#646464';
      detailCtx.fillRect(0, 0, detail.width, detail.height);
      detailCtx.imageSmoothingQuality = 'high';
      detailCtx.drawImage(original, 0, 0, 125, 577, 0, 0, 500, 2308);
      detailCtx.drawImage(zoom, 0, 0, 500, 2308, 500, 0, 500, 2308);

      const summary = stats.map(({ animation, metrics }) => {
        const sum = (key) => metrics.reduce((total, frame) => total + frame[key], 0);
        return {
          animation, frames: metrics.length, pixels: sum('pixels'),
          rgbMeanAbsoluteError: +(sum('error') / sum('pixels')).toFixed(2),
          alphaMeanAbsoluteError: +(sum('alpha') / sum('pixels')).toFixed(2),
          errorAbove20Percent: +(sum('outliers') * 100 / sum('pixels')).toFixed(2),
          worst: [...metrics].sort((a, b) => b.mae - a.mae).slice(0, 2).map(({ frame, mae }) => ({ frame, mae })),
          perFrame: metrics.map(({ mae }) => mae),
        };
      });
      return {
        images: Object.fromEntries(Object.entries({
          'boss-sheet-vector.png': native,
          'boss-sheet-4x.png': zoom,
          'boss-sheet-comparison.png': sideBySide,
          'boss-detail-comparison-4x.png': detail,
        }).map(([name, image]) => [name, image.toDataURL().split(',')[1]])),
        summary,
      };
    });
    const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'safety-run-boss-verification'));
    fs.mkdirSync(out, { recursive: true });
    for (const [name, base64] of Object.entries(images)) fs.writeFileSync(path.join(out, name), Buffer.from(base64, 'base64'));
    fs.writeFileSync(path.join(out, 'metrics.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(summary.map(({ perFrame, ...summary }) => summary), out);
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
