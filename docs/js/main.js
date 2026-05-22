(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── 状态 ──
  let shopConfig = null;
  let currentTextIdx = 0;
  let isSupabaseMode = false; // 数据来源是否为 Supabase

  // ── 初始化 ──
  async function init() {
    const shopId = new URLSearchParams(location.search).get('shop') || 'demo';

    // 优先从 Supabase 加载
    if (typeof db !== 'undefined') {
      try {
        const { data: shop, error } = await db
          .from('shops')
          .select('*, reviews(*), images(*)')
          .eq('slug', shopId)
          .maybeSingle();

        if (!error && shop) {
          shopConfig = transformSupabaseShop(shop);
          isSupabaseMode = true;
          currentTextIdx = Math.floor(Math.random() * shopConfig.texts.length);
          render();
          return;
        }
      } catch (e) {
        console.warn('Supabase 加载失败，降级到静态 JSON:', e.message);
      }
    }

    // 降级：从静态 JSON 加载
    try {
      const res = await fetch(`shops/${shopId}/config.json`);
      if (!res.ok) throw new Error('config not found');
      shopConfig = await res.json();
      isSupabaseMode = false;
      currentTextIdx = Math.floor(Math.random() * shopConfig.texts.length);
      render();
    } catch (err) {
      console.error(err);
      $('#loading').classList.add('hidden');
      $('#error').classList.remove('hidden');
    }
  }

  // ── 将 Supabase 数据转为旧格式 ──
  function transformSupabaseShop(shop) {
    const reviews = (shop.reviews || []).sort((a, b) => a.sort_order - b.sort_order);
    const images = (shop.images || []).sort((a, b) => a.sort_order - b.sort_order);
    const links = {};
    if (shop.meituan_url) links.meituanReview = shop.meituan_url;
    if (shop.douyin_url) links.douyinReview = shop.douyin_url;

    return {
      shop: {
        name: shop.name,
        rating: shop.rating || '',
        avgPrice: shop.avg_price || ''
      },
      texts: reviews.map(r => r.text),
      images: images.map(img => img.file_path),
      links
    };
  }

  // ── 获取图片 URL ──
  function getImageUrl(path) {
    if (isSupabaseMode && typeof SUPABASE_URL !== 'undefined') {
      return `${SUPABASE_URL}/storage/v1/object/public/shop-images/${path}`;
    }
    const shopId = new URLSearchParams(location.search).get('shop') || 'demo';
    return `shops/${shopId}/images/${path}`;
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

    grid.innerHTML = images.map((img, i) =>
      `<img src="${getImageUrl(img)}" alt="配图${i + 1}" loading="lazy" data-index="${i}">`
    ).join('');

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

    showToast(`正在保存 ${images.length} 张图片...`);

    for (let i = 0; i < images.length; i++) {
      try {
        const blob = await fetch(getImageUrl(images[i])).then(r => r.blob());
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = images[i].split('/').pop(); // 取文件名
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await sleep(300);
      } catch (err) {
        console.error(`保存图片失败:`, err);
      }
    }

    showToast('保存完成，请查看相册');
  });

  // ── 跳转链接 ──
  function renderLinks() {
    const links = shopConfig.links || {};
    const meituan = $('#linkMeituan');
    const douyin = $('#linkDouyin');

    if (links.meituanReview) {
      meituan.href = links.meituanReview;
      meituan.style.display = '';
    } else {
      meituan.style.display = 'none';
    }

    if (links.douyinReview) {
      const val = links.douyinReview;
      const isUrl = /^https?:\/\//i.test(val);

      if (isUrl) {
        douyin.href = val;
        douyin.textContent = '🎵 去抖音评价';
        douyin.onclick = null;
      } else {
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
    const reviewText = shopConfig.texts[currentTextIdx];

    try {
      await navigator.clipboard.writeText(password);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = password;
      ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }

    showToast('口令已复制，正在打开抖音...');

    setTimeout(() => {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = 'snssdk1128://';
      document.body.appendChild(iframe);
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 300);

    const onVisible = async () => {
      try {
        await navigator.clipboard.writeText(reviewText);
        showToast('✅ 评价文案已自动复制，请切回抖音粘贴发布');
        $('#btnCopy').textContent = '✅ 文案已就绪';
        $('#btnCopy').classList.add('btn-copied');
      } catch {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;';
        overlay.id = 'clipboard-helper';
        overlay.innerHTML = `
          <div style="background:#fff;border-radius:16px;padding:28px 24px;text-align:center;max-width:300px;">
            <p style="font-size:18px;margin-bottom:6px;">📋</p>
            <p style="font-size:16px;font-weight:600;margin-bottom:12px;">点击下方复制文案</p>
            <p style="font-size:13px;color:#666;margin-bottom:20px;line-height:1.6;background:#fafafa;padding:12px;border-radius:8px;">${reviewText.slice(0, 100)}...</p>
            <button id="btn-restore-text" style="width:100%;padding:14px;background:#FF6B35;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;">📋 复制后切回抖音粘贴</button>
          </div>
        `;
        document.body.appendChild(overlay);

        const restoreBtn = overlay.querySelector('#btn-restore-text');
        restoreBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(reviewText);
          } catch {/* 静默 */}
          document.body.removeChild(overlay);
          showToast('已复制，切回抖音粘贴');
        });

        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) document.body.removeChild(overlay);
        });
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        document.removeEventListener('visibilitychange', handleVisibility);
        setTimeout(onVisible, 500);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    setTimeout(() => {
      document.removeEventListener('visibilitychange', handleVisibility);
    }, 30000);
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
