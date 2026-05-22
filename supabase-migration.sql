-- 评价助手 - Supabase 数据库迁移脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. 建表
CREATE TABLE shops (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  rating TEXT,
  avg_price TEXT,
  meituan_url TEXT,
  douyin_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,
  file_path TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 启用 RLS
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- 3. 公开读（用户端无需登录）
CREATE POLICY "public_read_shops" ON shops FOR SELECT USING (true);
CREATE POLICY "public_read_reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "public_read_images" ON images FOR SELECT USING (true);

-- 4. 所有者管理店铺
CREATE POLICY "owner_manage_shops" ON shops
  FOR ALL USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 5. 通过店铺关联管理评价
CREATE POLICY "owner_manage_reviews" ON reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM shops WHERE shops.id = reviews.shop_id AND shops.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM shops WHERE shops.id = reviews.shop_id AND shops.owner_id = auth.uid())
  );

-- 6. 通过店铺关联管理图片
CREATE POLICY "owner_manage_images" ON images
  FOR ALL USING (
    EXISTS (SELECT 1 FROM shops WHERE shops.id = images.shop_id AND shops.owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM shops WHERE shops.id = images.shop_id AND shops.owner_id = auth.uid())
  );

-- 7. 更新时间自动维护
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shops_updated_at BEFORE UPDATE ON shops
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
