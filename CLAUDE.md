# NFC 评价助手

## 项目概述
帮助餐饮门店（美团/抖音入驻商家）生成用户评价辅助页面。用户通过扫码或NFC碰一碰打开页面，一键复制优质评价文案、保存配图，然后跳转到对应平台发表评价。

## 技术栈
- 纯静态 HTML/CSS/JS（无框架）
- 移动端优先设计
- 部署：GitHub Pages (`wgfqygt.github.io/nfc`)
- Git 代理：`http://127.0.0.1:33210`

## 项目结构
```
docs/                        ← GitHub Pages 根目录
├── index.html               ← 用户端页面（扫码后看到的）
├── admin.html               ← 管理后台（老板填信息用）
├── tools/scraper.html       ← 书签抓取工具（从抖音/美团提取信息）
├── css/style.css
├── js/main.js
└── shops/
    ├── demo/                ← 示例店铺（海底捞）
    └── ggb/                 ← 真实店铺：塔斯汀中国汉堡(荣昌金科店)
        ├── config.json
        └── images/
```

## 店铺配置格式 (config.json)
```json
{
  "shop": { "name": "...", "rating": "4.8", "avgPrice": "21" },
  "texts": ["评价文案1", "评价文案2", ...],
  "images": ["photo-1.jpg", ...],
  "links": {
    "meituanReview": "https://...",
    "douyinReview": "口令或URL"
  }
}
```

## 核心功能
1. **文案随机展示**：多套文案轮换，避免被平台判水军
2. **一键复制**：navigator.clipboard API
3. **配图保存**：fetch blob → download
4. **抖音跳转**：识别口令自动复制+唤起App（snssdk1128://），用户切回浏览器时自动恢复文案到剪贴板（visibilitychange 监听）
5. **管理后台**：店铺信息填写 + 图片上传 + 导出ZIP
6. **书签抓取**：从店铺页面提取标题/评分/链接

## 新增店铺流程
1. 管理后台填信息 → 导出 ZIP
2. 解压到 `docs/shops/{店铺ID}/`
3. `git push` 上线
4. 客户链接：`https://wgfqygt.github.io/nfc/?shop={店铺ID}`

## 当前状态
- 已完成：用户端 + 管理后台 + 抖音跳转 + 剪贴板恢复
- demo 店铺：海底捞（示例）
- ggb 店铺：塔斯汀中国汉堡(荣昌金科店)（真实，配图待替换为实拍）
- 配图目前是 SVG 占位，需老板提供实拍图

## 下一步
- 后台管理系统（让老板自己登录改内容，不用手动建文件夹）
- 美团 scheme 跳转优化（imeituan://）
- 配图替换为真实照片
- 考虑购买短域名
