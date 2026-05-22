(function () {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  // ── 状态 ──
  let currentShop = null; // { id, slug, name, rating, avg_price, meituan_url, douyin_url }
  let isNewShop = false;
  let pendingShopKey = null; // 创建店铺前验证过的密钥
  let isAdmin = false;
  // imageStore: Map<key, { id?, file?, dataUrl, storagePath?, isExisting: bool }>
  let imageStore = new Map();

  // ── 初始化 ──
  async function init() {
    if (typeof db === 'undefined') {
      showToast('请先在 js/supabase.js 中配置 Supabase 连接信息', false);
      return;
    }

    const { data: { session } } = await db.auth.getSession();
    if (session) {
      showDashboard();
      loadShops();
    }

    // 监听认证状态变化
    db.auth.onAuthStateChange((event, session) => {
      if (session) {
        showDashboard();
        loadShops();
      } else {
        showLogin();
      }
    });
  }

  // ═══ 认证 ═══
  function showAuthError(msg) {
    const el = $('#authError');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  async function handleLogin() {
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    if (!email || !password) {
      showAuthError('请填写邮箱和密码');
      return;
    }

    $('#authError').classList.add('hidden');
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      showAuthError(error.message === 'Invalid login credentials'
        ? '邮箱或密码错误' : error.message);
    }
  }

  async function handleSignup() {
    const email = $('#authEmail').value.trim();
    const password = $('#authPassword').value;
    if (!email || !password) {
      showAuthError('请填写邮箱和密码');
      return;
    }
    if (password.length < 6) {
      showAuthError('密码至少需要 6 位');
      return;
    }

    $('#authError').classList.add('hidden');
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) {
      showAuthError(error.message.includes('already registered')
        ? '该邮箱已注册，请直接登录' : error.message);
    } else {
      // 分配 merchant 角色
      await db.rpc('assign_merchant_role');
      showToast('注册成功！已自动登录', true);
    }
  }

  async function handleLogout() {
    await db.auth.signOut();
  }

  // ═══ 视图切换 ═══
  function showLogin() {
    $('#viewLogin').classList.remove('hidden');
    $('#viewDashboard').classList.add('hidden');
    $('#viewEditor').classList.add('hidden');
    currentShop = null;
    isNewShop = false;
  }

  function showDashboard() {
    $('#viewLogin').classList.add('hidden');
    $('#viewDashboard').classList.remove('hidden');
    $('#viewEditor').classList.add('hidden');
    db.auth.getUser().then(r => {
      if (r.data.user) $('#displayEmail').textContent = r.data.user.email;
    });
    currentShop = null;
    isNewShop = false;
    pendingShopKey = null;
    checkAdmin();
  }

  async function checkAdmin() {
    try {
      const { data } = await db.from('user_roles').select('role').single();
      isAdmin = data?.role === 'admin';
    } catch { isAdmin = false; }
    if (isAdmin) {
      $('#keyManageSection').classList.remove('hidden');
      loadKeys();
    } else {
      $('#keyManageSection').classList.add('hidden');
    }
  }

  function showEditor(shop, isNew) {
    currentShop = shop;
    isNewShop = isNew;
    $('#viewLogin').classList.add('hidden');
    $('#viewDashboard').classList.add('hidden');
    $('#viewEditor').classList.remove('hidden');
    $('#editorTitle').textContent = isNew ? '创建店铺' : '编辑店铺';
    $('#editSlug').readOnly = !isNew;
    $('#btnDelete').style.display = isNew ? 'none' : '';

    // 填充表单
    $('#editSlug').value = shop.slug || '';
    $('#editName').value = shop.name || '';
    $('#editRating').value = shop.rating || '';
    $('#editPrice').value = shop.avg_price || '';
    $('#editMeituan').value = shop.meituan_url || '';
    $('#editDouyin').value = shop.douyin_url || '';
    updateSlugUrl();
  }

  function updateSlugUrl() {
    const slug = $('#editSlug').value.trim();
    const urlInput = $('#editUrl');
    if (slug) {
      urlInput.value = `https://wgfqygt.github.io/nfc/?shop=${slug}`;
    } else {
      urlInput.value = '填写 ID 后自动生成';
    }
  }

  // ═══ 店铺列表 ═══
  async function loadShops() {
    const { data: { user } } = await db.auth.getUser();
    const { data: shops, error } = await db
      .from('shops')
      .select('*')
      .eq('owner_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      showToast('加载店铺列表失败: ' + error.message, false);
      return;
    }

    renderShopList(shops || []);
  }

  function renderShopList(shops) {
    const list = $('#shopList');
    const emptyState = $('#emptyState');
    $('#shopCountLabel').textContent = `共 ${shops.length} 家店铺`;

    if (shops.length === 0) {
      list.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    list.innerHTML = shops.map(shop => `
      <div class="shop-card" data-id="${shop.id}">
        <div class="shop-info">
          <h3>${escapeHtml(shop.name)}</h3>
          <div class="meta">
            <span>⭐ ${escapeHtml(shop.rating || '-')}</span>
            <span>¥${escapeHtml(shop.avg_price || '-')}</span>
            <span>ID: ${escapeHtml(shop.slug)}</span>
          </div>
        </div>
        <div class="arrow">›</div>
      </div>
    `).join('');

    // 点击进入编辑
    list.querySelectorAll('.shop-card').forEach(card => {
      card.addEventListener('click', async () => {
        const id = card.dataset.id;
        showToast('加载中...', true);
        await loadShop(id);
      });
    });
  }

  // ═══ 编辑器 - 加载店铺 ═══
  async function loadShop(id) {
    const { data: shop, error } = await db
      .from('shops')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !shop) {
      showToast('加载店铺失败', false);
      return;
    }

    // 加载评价
    const { data: reviews } = await db
      .from('reviews')
      .select('*')
      .eq('shop_id', id)
      .order('sort_order');

    // 加载图片
    const { data: images } = await db
      .from('images')
      .select('*')
      .eq('shop_id', id)
      .order('sort_order');

    showEditor({
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      rating: shop.rating,
      avg_price: shop.avg_price,
      meituan_url: shop.meituan_url,
      douyin_url: shop.douyin_url
    }, false);

    // 渲染文案
    const container = $('#editTextEntries');
    container.innerHTML = '';
    if (reviews && reviews.length > 0) {
      reviews.forEach(r => addTextEntry(r.text, false));
    } else {
      addTextEntry('', false);
    }

    // 渲染图片
    imageStore.clear();
    if (images && images.length > 0) {
      images.forEach(img => {
        const key = img.id;
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/shop-images/${img.file_path}`;
        imageStore.set(key, {
          id: img.id,
          file: null,
          dataUrl: publicUrl,
          storagePath: img.file_path,
          isExisting: true
        });
      });
    }
    renderImageList();
  }

  // ═══ 编辑器 - 新建店铺 ═══
  function initNewShop() {
    // 弹出密钥验证弹窗
    $('#keyModal').classList.remove('hidden');
    $('#keyInput').value = '';
    $('#keyError').classList.add('hidden');
    setTimeout(() => $('#keyInput').focus(), 100);
  }

  // ═══ 密钥弹窗 ═══
  async function handleKeyConfirm() {
    const code = $('#keyInput').value.trim().toUpperCase();
    if (!code) {
      $('#keyError').textContent = '请输入密钥';
      $('#keyError').classList.remove('hidden');
      return;
    }

    // 验证密钥是否存在且未使用
    const { data: keyData } = await db.from('shop_keys')
      .select('is_used')
      .eq('code', code)
      .maybeSingle();

    if (!keyData) {
      $('#keyError').textContent = '密钥不存在';
      $('#keyError').classList.remove('hidden');
      return;
    }
    if (keyData.is_used) {
      $('#keyError').textContent = '该密钥已被使用';
      $('#keyError').classList.remove('hidden');
      return;
    }

    // 有效，暂存密钥，进入编辑器
    pendingShopKey = code;
    $('#keyModal').classList.add('hidden');

    showEditor({
      id: null,
      slug: '',
      name: '',
      rating: '',
      avg_price: '',
      meituan_url: '',
      douyin_url: ''
    }, true);

    $('#editTextEntries').innerHTML = '';
    addTextEntry('', false);
    addTextEntry('', false);

    imageStore.clear();
    renderImageList();
  }

  function handleKeyCancel() {
    $('#keyModal').classList.add('hidden');
    pendingShopKey = null;
  }

  // ═══ 编辑器 - 保存 ═══
  async function saveShop() {
    const slug = $('#editSlug').value.trim();
    const name = $('#editName').value.trim();
    const rating = $('#editRating').value.trim();
    const avgPrice = $('#editPrice').value.trim();
    const meituanUrl = $('#editMeituan').value.trim();
    const douyinUrl = $('#editDouyin').value.trim();

    if (!slug) { showToast('请填写店铺 ID', false); return; }
    if (!name) { showToast('请填写店铺名称', false); return; }

    // 检查 slug 格式
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
      showToast('店铺 ID 只允许小写英文、数字和短横线，且不能以短横线开头结尾', false);
      return;
    }

    const texts = getTextEntries().filter(t => t.trim());

    $('#btnSave').textContent = '保存中...';
    $('#btnSave').disabled = true;

    try {
      let shopId = currentShop.id;

      // 1. Upsert 店铺
      if (isNewShop) {
        // 检查 slug 唯一性
        const { data: existing } = await db.from('shops').select('id').eq('slug', slug).maybeSingle();
        if (existing) {
          showToast('该店铺 ID 已被使用，请换一个', false);
          $('#btnSave').textContent = '💾 保存';
          $('#btnSave').disabled = false;
          return;
        }

        const { data: newShop, error: insertErr } = await db
          .from('shops')
          .insert({
            slug, name, rating, avg_price: avgPrice,
            meituan_url: meituanUrl, douyin_url: douyinUrl,
            owner_id: (await db.auth.getUser()).data.user.id
          })
          .select('id')
          .single();

        if (insertErr) throw insertErr;
        shopId = newShop.id;
        currentShop.id = shopId;

        // 兑换密钥
        if (pendingShopKey) {
          const { data: redeemed } = await db.rpc('redeem_shop_key', {
            p_code: pendingShopKey,
            p_shop_id: shopId
          });
          if (!redeemed) {
            showToast('密钥兑换失败，店铺已创建但密钥未消耗', false);
          }
          pendingShopKey = null;
        }

        isNewShop = false;
        $('#editSlug').readOnly = true;
        $('#btnDelete').style.display = '';
        $('#editorTitle').textContent = '编辑店铺';
      } else {
        const { error: updateErr } = await db
          .from('shops')
          .update({
            slug, name, rating, avg_price: avgPrice,
            meituan_url: meituanUrl, douyin_url: douyinUrl
          })
          .eq('id', shopId);

        if (updateErr) throw updateErr;
      }

      // 2. 保存评价（删旧插新）
      await db.from('reviews').delete().eq('shop_id', shopId);
      if (texts.length > 0) {
        const reviewRows = texts.map((text, i) => ({
          shop_id: shopId,
          text,
          sort_order: i
        }));
        await db.from('reviews').insert(reviewRows);
      }

      // 3. 保存图片
      await saveImages(shopId, slug);

      showToast('保存成功！用户端已即时更新', true);
    } catch (err) {
      console.error('保存失败:', err);
      showToast('保存失败: ' + (err.message || '未知错误'), false);
    }

    $('#btnSave').textContent = '💾 保存';
    $('#btnSave').disabled = false;
  }

  async function saveImages(shopId, slug) {
    // 获取旧图片记录
    const { data: oldImages } = await db
      .from('images')
      .select('id, file_path')
      .eq('shop_id', shopId);

    const oldPaths = (oldImages || []).map(img => img.file_path);

    // 找出被用户删除的旧图片
    const keptIds = new Set();
    const keptPaths = new Set();
    imageStore.forEach(v => {
      if (v.id) keptIds.add(v.id);
      if (v.storagePath) keptPaths.add(v.storagePath);
    });

    const pathsToDelete = oldPaths.filter(p => !keptPaths.has(p));

    // 删除存储中不用的文件
    if (pathsToDelete.length > 0) {
      await db.storage.from('shop-images').remove(pathsToDelete);
    }

    // 删除不用的 DB 记录
    const idsToDelete = (oldImages || [])
      .filter(img => !keptIds.has(img.id))
      .map(img => img.id);
    if (idsToDelete.length > 0) {
      await db.from('images').delete().in('id', idsToDelete);
    }

    // 上传新文件
    let sortOrder = 0;
    for (const [key, entry] of imageStore) {
      if (entry.file) {
        // 新文件，上传
        const safeName = entry.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `${Date.now()}_${safeName}`;
        const storagePath = `${slug}/${fileName}`;
        const { error: uploadErr } = await db.storage
          .from('shop-images')
          .upload(storagePath, entry.file);

        if (!uploadErr) {
          await db.from('images').insert({
            shop_id: shopId,
            file_path: storagePath,
            sort_order: sortOrder++
          });
        }
      } else if (entry.isExisting) {
        // 已存在的图片，更新 sort_order
        await db.from('images')
          .update({ sort_order: sortOrder++ })
          .eq('id', entry.id);
      }
    }
  }

  // ═══ 编辑器 - 删除店铺 ═══
  async function deleteShop() {
    if (!currentShop || !currentShop.id) return;
    if (!confirm(`确定删除店铺「${currentShop.name}」吗？\n所有文案和图片将一并删除，不可恢复。`)) return;

    try {
      // 删除 storage 中的图片
      const { data: images } = await db
        .from('images')
        .select('file_path')
        .eq('shop_id', currentShop.id);

      if (images && images.length > 0) {
        const paths = images.map(img => img.file_path);
        await db.storage.from('shop-images').remove(paths);
      }

      // 删除店铺（级联删除 reviews 和 images）
      await db.from('shops').delete().eq('id', currentShop.id);

      showToast('店铺已删除', true);
      showDashboard();
      loadShops();
    } catch (err) {
      showToast('删除失败: ' + (err.message || '未知错误'), false);
    }
  }

  // ═══ 评价文案操作 ═══
  function addTextEntry(text, focus) {
    const container = $('#editTextEntries');
    const div = document.createElement('div');
    div.className = 'text-entry';
    div.innerHTML = `<textarea placeholder="输入评价文案，建议准备3-5条语义不同但都正面的文案...">${escapeHtml(text)}</textarea><button title="删除">✕</button>`;
    div.querySelector('button').addEventListener('click', () => removeTextEntry(div));
    container.appendChild(div);
    if (focus !== false) div.querySelector('textarea').focus();
  }

  function removeTextEntry(container) {
    const entries = $$('#editTextEntries .text-entry');
    if (entries.length <= 1) return;
    container.remove();
  }

  function getTextEntries() {
    return Array.from($$('#editTextEntries textarea')).map(ta => ta.value);
  }

  // ═══ 图片操作 ═══
  function handleImageSelect(e) {
    Array.from(e.target.files).forEach(file => addImage(file));
    e.target.value = '';
  }

  function addImage(file) {
    if (!file.type.startsWith('image/')) return;
    const key = 'new_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const reader = new FileReader();
    reader.onload = () => {
      imageStore.set(key, {
        id: null,
        file: file,
        dataUrl: reader.result,
        storagePath: null,
        isExisting: false
      });
      renderImageList();
    };
    reader.readAsDataURL(file);
  }

  function removeImage(key) {
    imageStore.delete(key);
    renderImageList();
  }

  function renderImageList() {
    const list = $('#editImageList');
    if (imageStore.size === 0) {
      list.innerHTML = '<p style="color:#999;font-size:13px;text-align:center;padding:12px;">暂无配图</p>';
      return;
    }

    let html = '';
    imageStore.forEach((entry, key) => {
      html += `
        <div class="image-item">
          <img src="${entry.dataUrl}" alt="">
          <button class="remove" data-key="${key}">✕</button>
        </div>`;
    });
    list.innerHTML = html;

    list.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage(btn.dataset.key);
      });
    });
  }

  // ═══ 工具函数 ═══
  function showToast(msg, success) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (success ? ' success' : '');
    t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2500);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ═══ 密钥管理 ═══
  async function generateKey() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');

    const { data: { user } } = await db.auth.getUser();
    const { error } = await db.from('shop_keys').insert({
      code,
      created_by: user.id
    });

    if (error) {
      showToast('生成失败: ' + error.message, false);
      return;
    }

    showToast('密钥已生成: ' + code, true);
    loadKeys();
  }

  async function loadKeys() {
    const { data: keys, error } = await db.from('shop_keys')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error || !keys || keys.length === 0) {
      $('#keyList').innerHTML = '<p style="color:var(--text2);">暂无密钥</p>';
      return;
    }

    $('#keyList').innerHTML = keys.map(k => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f0f0f0;">
        <code style="font-size:14px;letter-spacing:1px;">${k.code}</code>
        <span style="font-size:12px;color:${k.is_used ? 'var(--green)' : 'var(--text2)'};">${k.is_used ? '✅ 已用' : '⏳ 未用'}</span>
      </div>
    `).join('');
  }

  // ═══ 一键导入 ggb 店铺 ═══
  async function importGgbShop() {
    $('#btnImportGgb').textContent = '导入中...';
    $('#btnImportGgb').disabled = true;

    try {
      // 获取 ggb 静态配置
      const res = await fetch('shops/ggb/config.json');
      if (!res.ok) throw new Error('ggb 配置文件加载失败');
      const cfg = await res.json();

      const { data: { user } } = await db.auth.getUser();
      const userId = user.id;

      // 检查是否已有 ggb 店铺
      const { data: existing } = await db.from('shops').select('id').eq('slug', 'ggb').maybeSingle();
      if (existing) {
        showToast('ggb 店铺已存在，无需重复导入', false);
        loadShops();
        return;
      }

      // 创建店铺
      const { data: shop, error: shopErr } = await db.from('shops').insert({
        slug: 'ggb',
        name: cfg.shop.name,
        rating: cfg.shop.rating,
        avg_price: cfg.shop.avgPrice,
        meituan_url: (cfg.links || {}).meituanReview || '',
        douyin_url: (cfg.links || {}).douyinReview || '',
        owner_id: userId
      }).select('id').single();

      if (shopErr) throw shopErr;

      // 导入评价文案
      if (cfg.texts && cfg.texts.length > 0) {
        const reviewRows = cfg.texts.map((text, i) => ({
          shop_id: shop.id,
          text,
          sort_order: i
        }));
        await db.from('reviews').insert(reviewRows);
      }

      showToast('ggb 店铺导入成功！', true);
      loadShops();
    } catch (err) {
      console.error('导入失败:', err);
      showToast('导入失败: ' + (err.message || '未知错误'), false);
    }

    $('#btnImportGgb').textContent = '📥 一键导入 ggb 店铺（塔斯汀）';
    $('#btnImportGgb').disabled = false;
  }

  // ═══ 事件绑定 ═══
  $('#btnLogin').addEventListener('click', handleLogin);
  $('#btnSignup').addEventListener('click', handleSignup);
  $('#authPassword').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });

  $('#btnLogout').addEventListener('click', handleLogout);
  $('#btnNewShop').addEventListener('click', initNewShop);
  $('#btnImportGgb').addEventListener('click', importGgbShop);

  // 密钥弹窗
  $('#btnKeyConfirm').addEventListener('click', handleKeyConfirm);
  $('#btnKeyCancel').addEventListener('click', handleKeyCancel);
  $('#keyInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleKeyConfirm();
  });

  // 密钥管理
  $('#btnGenKey').addEventListener('click', generateKey);

  $('#btnBack').addEventListener('click', () => { showDashboard(); loadShops(); });
  $('#btnSave').addEventListener('click', saveShop);
  $('#btnDelete').addEventListener('click', deleteShop);
  $('#btnAddText').addEventListener('click', () => addTextEntry('', true));
  $('#editSlug').addEventListener('input', updateSlugUrl);

  // 图片上传
  const uploadArea = document.getElementById('uploadArea');
  if (uploadArea) {
    uploadArea.addEventListener('click', () => document.getElementById('imageInput').click());
    document.getElementById('imageInput').addEventListener('change', handleImageSelect);

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
      uploadArea.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); });
    });
    ['dragenter', 'dragover'].forEach(evt => {
      uploadArea.addEventListener(evt, () => uploadArea.classList.add('drag'));
    });
    ['dragleave', 'drop'].forEach(evt => {
      uploadArea.addEventListener(evt, () => uploadArea.classList.remove('drag'));
    });
    uploadArea.addEventListener('drop', e => {
      Array.from(e.dataTransfer.files).forEach(file => addImage(file));
    });
  }

  // 启动
  init();
})();
