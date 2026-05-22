(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── 状态 ──
  let shopConfig = null;
  let currentTextIdx = 0;

  // ── 初始化 ──
  async function init() {
    const shopId = new URLSearchParams(location.search).get('shop') || 'demo';
    try {
      const res = await fetch(`shops/${shopId}/config.json`);
      if (!res.ok) throw new Error('config not found');
      shopConfig = await res.json();
      currentTextIdx = Math.floor(Math.random() * shopConfig.texts.length);
      render();
    } catch (err) {
      console.error(err);
      $('#loading').classList.add('hidden');
      $('#error').classList.remove('hidden');
    }
  }

  // ── 渲染 ──
  function render() {
    const s = shopConfig.shop;
    $('#shopName').textContent = s.name;
    $('#shopRating').textContent = s.rating;
    $('#shopPrice').textContent = s.avgPrice;
    updateText();
    renderImages();
    renderLinks();
    $('#loading').classList.add('hidden');
    $('#app').classList.remove('hidden');
  }

  // ── 文案 ──
  function updateText() {
    const total = shopConfig.texts.length;
    $('#reviewText').textContent = shopConfig.texts[currentTextIdx];
    $('#textIndex').textContent = `${currentTextIdx + 1}/${total}`;
  }

  $('#btnShuffle').addEventListener('click', () => {
    if (shopConfig.texts.length <= 1) return;
    let next;
    do {
      next = Math.floor(Math.random() * shopConfig.texts.length);
    } while (next === currentTextIdx && shopConfig.texts.length > 1);
    currentTextIdx = next;
    updateText();
  });

  // ── 复制 ──
  $('#btnCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shopConfig.texts[currentTextIdx]);
      const btn = $('#btnCopy');
      btn.textContent = '✅ 已复制';
      btn.classList.add('btn-copied');
      setTimeout(() => {
        btn.textContent = '📋 一键复制';
        btn.classList.remove('btn-copied');
      }, 1800);
    } catch {
      // 降级：选中文本让用户手动复制
      const range = document.createRange();
      range.selectNodeContents($('#reviewText'));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      showToast('请手动复制已选中的文字');
    }
  });

  // ── 图片 ──
  function renderImages() {
    const grid = $('#imageGrid');
    const images = shopConfig.images || [];
    $('#imageCount').textContent = `${images.length} 张`;

    if (images.length === 0) {
      grid.innerHTML = '<p style="color:#999;font-size:14px;text-align:center;grid-column:1/-1">暂无配图</p>';
      $('#btnSaveAll').style.display = 'none';
      return;
    }

    const shopId = new URLSearchParams(location.search).get('shop') || 'demo';
    grid.innerHTML = images.map((img, i) =>
      `<img src="shops/${shopId}/images/${img}" alt="配图${i + 1}" loading="lazy" data-index="${i}">`
    ).join('');

    // 点击预览
    grid.addEventListener('click', (e) => {
      if (e.target.tagName === 'IMG') {
        $('#previewImage').src = e.target.src;
        $('#imagePreview').classList.remove('hidden');
      }
    });
  }

  $('#imagePreview').addEventListener('click', (e) => {
    if (e.target === $('#imagePreview') || e.target.classList.contains('preview-close')) {
      $('#imagePreview').classList.add('hidden');
    }
  });

  // 保存全部图片
  $('#btnSaveAll').addEventListener('click', async () => {
    const images = shopConfig.images || [];
    const shopId = new URLSearchParams(location.search).get('shop') || 'demo';

    showToast(`正在保存 ${images.length} 张图片...`);

    for (let i = 0; i < images.length; i++) {
      try {
        const blob = await fetch(`shops/${shopId}/images/${images[i]}`).then(r => r.blob());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = images[i];
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        // 每张间隔 300ms 避免浏览器拦截
        await sleep(300);
      } catch (err) {
        console.error(`保存 ${images[i]} 失败:`, err);
      }
    }

    showToast('保存完成，请查看相册');
  });

  // ── 跳转链接 ──
  function renderLinks() {
    const links = shopConfig.links || {};
    const meituan = $('#linkMeituan');
    const douyin = $('#linkDouyin');

    // 美团：如果是 URL 就用链接，否则隐藏
    if (links.meituanReview) {
      meituan.href = links.meituanReview;
      meituan.style.display = '';
    } else {
      meituan.style.display = 'none';
    }

    // 抖音：判断是 URL 还是口令
    if (links.douyinReview) {
      const val = links.douyinReview;
      const isUrl = /^https?:\/\//i.test(val);

      if (isUrl) {
        // 普通链接，直接跳转
        douyin.href = val;
        douyin.textContent = '🎵 去抖音评价';
        douyin.onclick = null;
      } else {
        // 抖音口令，复制+唤起 App
        douyin.removeAttribute('href');
        douyin.textContent = '🎵 复制口令并打开抖音';
        douyin.onclick = (e) => {
          e.preventDefault();
          copyAndOpenDouyin(val);
        };
      }
      douyin.style.display = '';
    } else {
      douyin.style.display = 'none';
    }
  }

  async function copyAndOpenDouyin(password) {
    // 第一步：复制口令到剪贴板
    try {
      await navigator.clipboard.writeText(password);
      showToast('口令已复制，正在打开抖音...');
    } catch {
      // 降级：用 textarea 兜底复制
      const ta = document.createElement('textarea');
      ta.value = password;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('口令已复制，正在打开抖音...');
    }

    // 第二步：尝试唤起抖音 App
    setTimeout(() => {
      const schemes = ['snssdk1128://', 'douyin://'];
      let opened = false;

      for (const scheme of schemes) {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = scheme;
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 2000);
      }

      // 如果 2.5 秒后还在当前页，说明没装 App，提示手动打开
      setTimeout(() => {
        showToast('请手动打开抖音App，口令已复制，会自动弹窗');
      }, 2500);
    }, 300);
  }

  // ── Toast ──
  function showToast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2000);
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── 启动 ──
  init();
})();
