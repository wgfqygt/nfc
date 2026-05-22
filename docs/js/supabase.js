// Supabase 配置 — 部署前替换为你的项目信息
const SUPABASE_URL = 'https://mvhyqxnfgbjqxxlmygbf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12aHlxeG5mZ2JqcXh4bG15Z2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NzI4ODQsImV4cCI6MjA5NTA0ODg4NH0.B_BVrqhoASYD98YrN5nr9phVWK_Y0pXm-d_z4R4eLnE';

// 全局 Supabase 客户端实例（依赖 CDN 引入的 window.supabase）
let supabase;
if (SUPABASE_URL.includes('YOUR-PROJECT')) {
  console.warn('⚠️ 请先在 js/supabase.js 中配置 Supabase URL 和 anon key');
} else {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
