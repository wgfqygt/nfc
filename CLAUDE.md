# NFC 评价助手

## 项目概述
帮助餐饮门店（美团/抖音入驻商家）生成用户评价辅助页面。用户通过扫码或NFC碰一碰打开页面，一键复制优质评价文案、保存配图，然后跳转到对应平台发表评价。

## 技术栈
- 纯静态 HTML/CSS/JS（无框架）
- 移动端优先设计
- 后端：Supabase（PostgreSQL + 文件存储 + 认证）
- 部署：GitHub Pages (`wgfqygt.github.io/nfc`)
- Git 代理：`http://127.0.0.1:33210`

## 项目结构
```
docs/                        ← GitHub Pages 根目录
├── index.html               ← 用户端页面（扫码后看到的）
├── admin.html               ← 商家管理后台（登录后在线管理）
├── tools/scraper.html       ← 书签抓取工具（从抖音/美团提取信息）
├── css/style.css
├── js/
│   ├── supabase.js          ← Supabase 客户端配置
│   ├── main.js              ← 用户端逻辑
│   └── admin.js             ← 管理后台逻辑
└── shops/
    ├── demo/                ← 示例店铺（静态 JSON 降级）
    └── ggb/                 ← 塔斯汀中国汉堡(荣昌金科店)（旧数据，已迁移到 Supabase）
supabase-migration.sql       ← 数据库迁移脚本
```

## 数据架构

```
┌──────────────────────────────────────┐
│  管理后台 (admin.html)               │
│  商家登录 → 编辑店铺/文案/图片 → Supabase │
└──────────────────────────────────────┘
              ↕ Supabase API
┌──────────────────────────────────────┐
│  用户端 (index.html?shop=xxx)        │
│  从 Supabase 拉数据 → 展示文案+图片    │
│  查不到时降级到静态 JSON               │
└──────────────────────────────────────┘
```

### Supabase 表结构
- `shops` — 店铺信息（slug, name, rating, avg_price, meituan_url, douyin_url, owner_id）
- `reviews` — 评价文案（shop_id, text, sort_order）
- `images` — 配图文件路径（shop_id, file_path, sort_order）
- RLS: 公开读，所有者写
- Storage bucket `shop-images`: 公开读，认证用户上传

## 商家使用流程
1. 打开 `admin.html` → 注册账号（邮箱+密码）
2. 创建店铺（填写英文 ID，如 `ggb`）
3. 填写基本信息、平台链接、评价文案、上传配图
4. 保存 → 即时生效
5. 客户链接：`https://wgfqygt.github.io/nfc/?shop={店铺ID}`

## 核心功能
1. **文案随机展示**：多套文案轮换，避免被平台判水军
2. **一键复制**：navigator.clipboard API
3. **配图保存**：fetch blob → download
4. **抖音跳转**：识别口令自动复制+唤起App（snssdk1128://），用户切回浏览器时自动恢复文案到剪贴板（visibilitychange 监听）
5. **管理后台**：商家登录后在线编辑，保存即时生效，不再需要 git push
6. **书签抓取**：从店铺页面提取标题/评分/链接

## 新增店铺流程（新版）
1. 商家自行登录 admin.html 注册账号
2. 点击「创建新店铺」→ 填写信息 → 保存
3. 即时上线，无需 git 操作

## Supabase 部署前准备
1. 到 supabase.com 注册，创建项目
2. 在 SQL Editor 执行 `supabase-migration.sql`
3. 在 Storage 中创建 bucket `shop-images`，设为公开
4. 将项目 URL 和 anon key 填入 `docs/js/supabase.js`
