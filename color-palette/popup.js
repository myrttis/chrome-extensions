document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  const pickBtn = document.getElementById('pickBtn');
  const generateBtn = document.getElementById('generateBtn');
  const previewCard = document.getElementById('previewCard');
  const previewImage = document.getElementById('previewImage');
  const previewRemove = document.getElementById('previewRemove');
  const urlInput = document.getElementById('urlInput');
  const urlPasteBtn = document.getElementById('urlPasteBtn');
  const paletteSection = document.getElementById('paletteSection');
  const paletteBgImage = document.getElementById('paletteBgImage');
  const swatches = document.getElementById('swatches');
  const colorList = document.getElementById('colorList');
  const loading = document.getElementById('loading');
  const saveBtn = document.getElementById('saveBtn');
  const copyAllBtn = document.getElementById('copyAllBtn');
  const toast = document.getElementById('toast');
  const historyList = document.getElementById('historyList');
  const historyClear = document.getElementById('historyClear');

  let currentImageSrc = null;
  let extractedColors = [];
  const STORAGE_KEY = 'color_palette_history';

  renderHistory();
  checkPendingUrl();

  pickBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadImageFile(file);
  });

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && urlInput.value.trim()) {
      loadImageUrl(urlInput.value.trim());
    }
  });

  urlPasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text;
        loadImageUrl(text);
      }
    } catch {
      showToast('Cannot access clipboard');
    }
  });

  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) loadImageFile(file);
        return;
      }
    }

    const text = e.clipboardData?.getData('text');
    if (text && (text.startsWith('http') || text.startsWith('data:image'))) {
      e.preventDefault();
      urlInput.value = text;
      loadImageUrl(text);
    }
  });

  previewRemove.addEventListener('click', () => resetAll());
  generateBtn.addEventListener('click', extractColors);
  saveBtn.addEventListener('click', savePaletteAsImage);
  copyAllBtn.addEventListener('click', copyAllColors);

  historyClear.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    renderHistory();
    showToast('History cleared');
  });

  function checkPendingUrl() {
    setTimeout(() => {
      chrome.storage.local.get('pendingImage', (result) => {
        if (result.pendingImage) {
          chrome.storage.local.remove('pendingImage');
          const src = result.pendingImage;
          if (src.startsWith('data:image')) {
            setImage(src);
          } else if (src.startsWith('http')) {
            urlInput.value = src;
            loadImageUrl(src);
          }
        }
      });
    }, 300);
  }

  function loadImageFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImage(e.target.result);
    reader.readAsDataURL(file);
  }

  function loadImageUrl(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(url);
    img.onerror = () => showToast('Failed to load image');
    img.src = url;
  }

  function setImage(src) {
    currentImageSrc = src;
    previewImage.src = src;
    previewCard.hidden = false;
    paletteSection.hidden = true;
    urlInput.value = '';
  }

  function resetAll() {
    currentImageSrc = null;
    fileInput.value = '';
    urlInput.value = '';
    previewCard.hidden = true;
    paletteSection.hidden = true;
  }

  function extractColors() {
    if (!currentImageSrc) {
      showToast('Please select an image first');
      return;
    }

    loading.hidden = false;
    paletteSection.hidden = true;
    generateBtn.disabled = true;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            const pixels = getPixels(img, 15000);
            const colors = kMeansClustering(pixels, 5);
            const optimized = optimizeForAesthetics(colors);
            extractedColors = optimized;
            renderPalette(optimized, currentImageSrc);
            saveToHistory(optimized, currentImageSrc);
          } catch (err) {
            showToast('Error extracting colors');
          }
          loading.hidden = true;
          generateBtn.disabled = false;
        }, 50);
      });
    };
    img.onerror = () => {
      loading.hidden = true;
      generateBtn.disabled = false;
      showToast('Error loading image');
    };
    img.src = currentImageSrc;
  }

  function getPixels(img, maxPixels) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    let { width, height } = img;
    if (width * height > maxPixels) {
      const scale = Math.sqrt(maxPixels / (width * height));
      width = Math.floor(width * scale);
      height = Math.floor(height * scale);
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(img, 0, 0, width, height);

    const data = ctx.getImageData(0, 0, width, height).data;
    const pixels = [];

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 128) continue;
      if (r > 250 && g > 250 && b > 250) continue;
      if (r < 5 && g < 5 && b < 5) continue;
      pixels.push([r, g, b]);
    }
    return pixels;
  }

  function kMeansClustering(pixels, k, maxIter = 40) {
    if (pixels.length === 0) return [];

    const centroids = initCentroids(pixels, k);
    let assignments = new Uint16Array(pixels.length);

    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;

      for (let i = 0; i < pixels.length; i++) {
        let minD = Infinity, best = 0;
        for (let j = 0; j < k; j++) {
          const d = colorDist(pixels[i], centroids[j]);
          if (d < minD) { minD = d; best = j; }
        }
        if (assignments[i] !== best) { assignments[i] = best; changed = true; }
      }
      if (!changed) break;

      for (let j = 0; j < k; j++) {
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < pixels.length; i++) {
          if (assignments[i] === j) {
            r += pixels[i][0]; g += pixels[i][1]; b += pixels[i][2]; n++;
          }
        }
        if (n > 0) centroids[j] = [Math.round(r/n), Math.round(g/n), Math.round(b/n)];
      }
    }

    const sizes = new Uint32Array(k);
    for (let i = 0; i < assignments.length; i++) sizes[assignments[i]]++;

    return centroids.map((c, i) => ({
      rgb: c,
      hsl: rgbToHsl(c[0], c[1], c[2]),
      hex: rgbToHex(c[0], c[1], c[2]),
      pct: (sizes[i] / pixels.length * 100).toFixed(1)
    })).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));
  }

  function initCentroids(pixels, k) {
    const c = [pixels[Math.floor(Math.random() * pixels.length)]];
    for (let i = 1; i < k; i++) {
      const dists = pixels.map(p => {
        let min = Infinity;
        for (const cent of c) { const d = colorDist(p, cent); if (d < min) min = d; }
        return min * min;
      });
      const total = dists.reduce((a, b) => a + b, 0);
      let r = Math.random() * total;
      for (let j = 0; j < pixels.length; j++) {
        r -= dists[j];
        if (r <= 0) { c.push(pixels[j]); break; }
      }
    }
    return c;
  }

  function colorDist(a, b) {
    const dr = a[0]-b[0], dg = a[1]-b[1], db = a[2]-b[2];
    const rm = (a[0]+b[0]) / 2;
    return Math.sqrt((2+rm/256)*dr*dr + 4*dg*dg + (2+(255-rm)/256)*db*db);
  }

  function optimizeForAesthetics(colors) {
    if (colors.length <= 1) return colors;

    const filtered = [colors[0]];
    for (let i = 1; i < colors.length; i++) {
      const tooSimilar = filtered.some(c => {
        const hd = Math.abs(c.hsl[0] - colors[i].hsl[0]);
        const hueDist = Math.min(hd, 360 - hd);
        const sd = Math.abs(c.hsl[1] - colors[i].hsl[1]);
        return hueDist < 15 && sd < 10;
      });
      if (!tooSimilar) filtered.push(colors[i]);
    }

    filtered.sort((a, b) => a.hsl[0] - b.hsl[0]);
    return filtered;
  }

  function renderPalette(colors, bgSrc) {
    swatches.innerHTML = '';
    colorList.innerHTML = '';

    paletteBgImage.src = bgSrc || '';

    colors.forEach(color => {
      const textColor = isLight(color.rgb) ? 'swatch-light' : 'swatch-dark';

      const swatch = document.createElement('div');
      swatch.className = `swatch ${textColor}`;
      swatch.style.backgroundColor = color.hex;
      swatch.innerHTML = `<span class="swatch-hex">${color.hex.toUpperCase()}</span>`;
      swatch.addEventListener('click', () => copyText(color.hex.toUpperCase(), `Copied ${color.hex.toUpperCase()}`));
      swatches.appendChild(swatch);

      const row = document.createElement('div');
      row.className = 'color-row';
      row.innerHTML = `
        <div class="color-dot" style="background:${color.hex}"></div>
        <div class="color-info">
          <div class="color-hex">${color.hex.toUpperCase()}</div>
          <div class="color-meta">RGB(${color.rgb.join(', ')}) · HSL(${color.hsl[0]}°, ${color.hsl[1]}%, ${color.hsl[2]}%) · ${color.pct}%</div>
        </div>
        <div class="color-actions">
          <button class="color-btn" data-copy="${color.hex.toUpperCase()}" title="Copy HEX">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
          <button class="color-btn" data-copy="rgb(${color.rgb.join(', ')})" title="Copy RGB">
            <span style="font-size:9px;font-weight:700;letter-spacing:-0.5px">RGB</span>
          </button>
        </div>
      `;

      row.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.getAttribute('data-copy');
          copyText(val, `Copied ${val}`, btn);
        });
      });

      colorList.appendChild(row);
    });

    paletteSection.hidden = false;
  }

  function copyText(text, msg, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
      if (btnEl) {
        btnEl.classList.add('copied');
        setTimeout(() => btnEl.classList.remove('copied'), 1200);
      }
      showToast(msg);
    });
  }

  function copyAllColors() {
    const all = extractedColors.map(c => c.hex.toUpperCase()).join('\n');
    copyText(all, 'All colors copied');
  }

  function savePaletteAsImage() {
    const colors = extractedColors;
    if (!colors.length) return;

    const sw = 140, sh = 100, pad = 32, gap = 8;
    const w = pad * 2 + colors.length * (sw + gap) - gap;
    const h = pad * 2 + sh + 56;

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    colors.forEach((color, i) => {
      const x = pad + i * (sw + gap);
      ctx.beginPath();
      ctx.roundRect(x, pad, sw, sh, 12);
      ctx.fillStyle = color.hex;
      ctx.fill();

      const textCol = isLight(color.rgb) ? '#1d1d1f' : '#ffffff';
      ctx.fillStyle = textCol;
      ctx.font = 'bold 13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(color.hex.toUpperCase(), x + sw/2, pad + sh - 14);
    });

    ctx.fillStyle = '#86868b';
    ctx.font = '11px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Generated by Color Palette Extractor', pad, h - 14);

    const link = document.createElement('a');
    link.download = 'color-palette.png';
    link.href = c.toDataURL('image/png');
    link.click();
    showToast('Palette saved as image');
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveToHistory(colors, bgSrc) {
    const history = getHistory();
    const entry = {
      id: Date.now(),
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      colors: colors.map(c => ({ hex: c.hex, rgb: c.rgb })),
      bgImage: bgSrc || ''
    };
    history.unshift(entry);
    if (history.length > 20) history.pop();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    renderHistory();
  }

  function deleteFromHistory(id) {
    const history = getHistory().filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    renderHistory();
    showToast('Palette deleted');
  }

  function renderHistory() {
    const history = getHistory();
    historyList.innerHTML = '';

    if (history.length === 0) {
      historyList.innerHTML = '<div class="history-empty">No palettes yet</div>';
      return;
    }

    history.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const bgStyle = entry.bgImage
        ? `background-image: url('${entry.bgImage}'); background-size: cover; background-position: center;`
        : '';

      item.innerHTML = `
        <div class="history-swatches-wrap" style="position:relative">
          ${entry.bgImage ? `<div class="history-bg" style="${bgStyle}"></div>` : ''}
          <div class="history-swatches">
            ${entry.colors.map(c => `<div class="history-swatch" style="background:${c.hex}"></div>`).join('')}
          </div>
          <button class="history-delete" data-id="${entry.id}" title="Delete">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="history-meta">
          <span class="history-date">${entry.date}</span>
          <div class="history-colors">
            ${entry.colors.map(c => `<div class="history-color-dot" style="background:${c.hex}" title="${c.hex.toUpperCase()}"></div>`).join('')}
          </div>
        </div>
      `;

      const deleteBtn = item.querySelector('.history-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteFromHistory(entry.id);
      });

      item.addEventListener('click', () => loadFromHistory(entry));
      historyList.appendChild(item);
    });
  }

  function loadFromHistory(entry) {
    extractedColors = entry.colors.map(c => ({
      hex: c.hex,
      rgb: c.rgb,
      hsl: rgbToHsl(c.rgb[0], c.rgb[1], c.rgb[2]),
      pct: ''
    }));
    renderPalette(extractedColors, entry.bgImage || '');
    showToast('Loaded from history');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  function isLight(rgb) {
    return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.55;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2000);
  }
});