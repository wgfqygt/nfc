// Supabase 配置 — 部署前替换为你的项目信息
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

// 全局 Supabase 客户端实例（依赖 CDN 引入的 window.supabase）
let supabase;
if (SUPABASE_URL.includes('YOUR-PROJECT')) {
  console.warn('⚠️ 请先在 js/supabase.js 中配置 Supabase URL 和 anon key');
} else {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
