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

-- ── 邀请码/店铺密钥系统 ──

-- 8. 用户角色表（admin 可生成密钥）
CREATE TABLE user_roles (
  user_id UUID REFERENCES auth.users(id) PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'merchant'
);
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_read_own_role" ON user_roles FOR SELECT USING (auth.uid() = user_id);

-- 9. 店铺密钥表（一个密创建一个店铺）
CREATE TABLE shop_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  is_used BOOLEAN DEFAULT false,
  used_for_shop_id UUID REFERENCES shops(id),
  used_by UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE shop_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_keys" ON shop_keys FOR SELECT USING (true);
CREATE POLICY "admin_manage_keys" ON shop_keys
  FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- 10. 兑换店铺密钥（SECURITY DEFINER 绕过 RLS）
CREATE OR REPLACE FUNCTION redeem_shop_key(p_code TEXT, p_shop_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_key RECORD;
BEGIN
  SELECT * INTO v_key FROM shop_keys WHERE code = p_code AND is_used = false;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  UPDATE shop_keys SET is_used = true, used_by = auth.uid(), used_for_shop_id = p_shop_id, used_at = now()
  WHERE id = v_key.id;
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. 注册后分配 merchant 角色
CREATE OR REPLACE FUNCTION assign_merchant_role()
RETURNS VOID AS $$
BEGIN
  INSERT INTO user_roles (user_id, role) VALUES (auth.uid(), 'merchant') ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. 管理员设置（你注册后在 SQL Editor 执行下面两行，替换你的 UUID）
-- SELECT auth.uid();  -- 先查你的 ID
-- INSERT INTO user_roles (user_id, role) VALUES ('你的UUID', 'admin');

-- 13. 店铺上下架
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
