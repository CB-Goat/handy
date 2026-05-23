const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ---------- 中间件 ----------
app.use(cors());
app.use(express.json({ limit: '10kb' }));

// ---------- 数据库初始化 ----------
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'messages.db');
const db = new Database(DB_PATH);

// 数据库迁移：为旧 messages 表添加 product_id 列
try {
  const cols = db.prepare("PRAGMA table_info(messages)").all().map(c => c.name);
  if (!cols.includes('product_id')) {
    db.exec(`ALTER TABLE messages ADD COLUMN product_id INTEGER DEFAULT 0`);
    console.log('[DB] 迁移: messages 表添加 product_id 列');
  }
} catch (e) {
  console.log('[DB] 迁移检查跳过:', e.message);
}

// 创建产品表
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    features TEXT NOT NULL,
    images TEXT DEFAULT '[]',
    video_url TEXT DEFAULT '',
    icon TEXT DEFAULT '📦',
    color TEXT DEFAULT '#6C5CE7',
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 创建点赞表
db.exec(`
  CREATE TABLE IF NOT EXISTS likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    ip_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, ip_hash)
  )
`);

// 创建分享表
db.exec(`
  CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    platform TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 创建索引
db.exec(`CREATE INDEX IF NOT EXISTS idx_messages_product ON messages(product_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_likes_product ON likes(product_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_shares_product ON shares(product_id)`);

// 初始化示例产品数据
const initProducts = () => {
  const count = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (count.count === 0) {
    const products = [
      {
        name: '悦读小将',
        slug: 'yuedujiang',
        description: '趣味阅读助手，让阅读变成一场精彩的冒险之旅！陪伴孩子快乐阅读，培养终身学习的好习惯。',
        features: '趣味阅读|成长记录|阅读打卡|好书推荐|成就系统',
        icon: '📚',
        color: '#E63946',
        sort_order: 1
      },
      {
        name: '闻风标',
        slug: 'wenfengbiao',
        description: '及时而全面的全国标讯信息，助您捕捉商机先人一步。',
        features: '实时标讯|智能推送|商机分析|全国覆盖|精准筛选',
        icon: '🎯',
        color: '#1E4A7C',
        sort_order: 2
      },
      {
        name: 'TextMaster',
        slug: 'textmaster',
        description: '专业文本处理工具，支持格式转换、翻译、排版、统计等功能。',
        features: '格式转换|多语言翻译|智能排版|字数统计|正则替换',
        icon: '📝',
        color: '#FD79A8',
        sort_order: 3
      }
    ];
    
    const insert = db.prepare(`
      INSERT INTO products (name, slug, description, features, icon, color, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    products.forEach(p => {
      insert.run(p.name, p.slug, p.description, p.features, p.icon, p.color, p.sort_order);
    });
    
    console.log('[DB] 初始化示例产品数据');
  }
};

initProducts();

// 数据迁移：更新旧产品数据
const migrateProducts = () => {
  const old1 = db.prepare("SELECT * FROM products WHERE slug = 'toolbox-pro'").get();
  if (old1) {
    db.prepare(`UPDATE products SET name = '悦读小将', slug = 'yuedujiang', description = '趣味阅读助手，让阅读变成一场精彩的冒险之旅！陪伴孩子快乐阅读，培养终身学习的好习惯。', features = '趣味阅读|成长记录|阅读打卡|好书推荐|成就系统', icon = '📚', color = '#E63946' WHERE slug = 'toolbox-pro'`).run();
    console.log('[DB] 迁移: ToolBox Pro → 悦读小将');
  }
  const old2 = db.prepare("SELECT * FROM products WHERE slug = 'imagemagic'").get();
  if (old2) {
    db.prepare(`UPDATE products SET name = '闻风标', slug = 'wenfengbiao', description = '及时而全面的全国标讯信息，助您捕捉商机先人一步。', features = '实时标讯|智能推送|商机分析|全国覆盖|精准筛选', icon = '🎯', color = '#1E4A7C' WHERE slug = 'imagemagic'`).run();
    console.log('[DB] 迁移: ImageMagic → 闻风标');
  }
};
migrateProducts();

console.log(`[DB] 数据库已初始化: ${DB_PATH}`);

// ---------- 辅助函数 ----------
const getClientIP = (req) => {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
};

const hashIP = (ip) => {
  return require('crypto').createHash('md5').update(ip).digest('hex');
};

// ---------- API 路由 ----------

// 获取所有产品列表
app.get('/api/products', (req, res) => {
  try {
    const products = db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM likes WHERE product_id = p.id) as like_count,
        (SELECT COUNT(*) FROM shares WHERE product_id = p.id) as share_count,
        (SELECT COUNT(*) FROM messages WHERE product_id = p.id) as message_count
      FROM products p
      ORDER BY p.sort_order ASC, p.id ASC
    `).all();
    
    // 解析 features 和 images
    const formatted = products.map(p => ({
      ...p,
      features: p.features ? p.features.split('|') : [],
      images: p.images ? JSON.parse(p.images) : []
    }));
    
    res.json({ success: true, products: formatted });
  } catch (err) {
    console.error('[ERROR] 获取产品列表失败:', err.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 获取单个产品详情
app.get('/api/products/:slug', (req, res) => {
  try {
    const { slug } = req.params;
    const product = db.prepare(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM likes WHERE product_id = p.id) as like_count,
        (SELECT COUNT(*) FROM shares WHERE product_id = p.id) as share_count,
        (SELECT COUNT(*) FROM messages WHERE product_id = p.id) as message_count
      FROM products p
      WHERE p.slug = ?
    `).get(slug);
    
    if (!product) {
      return res.status(404).json({ success: false, error: '产品不存在' });
    }
    
    // 获取产品留言
    const messages = db.prepare(`
      SELECT id, name, content, created_at
      FROM messages
      WHERE product_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).all(product.id);
    
    product.features = product.features ? product.features.split('|') : [];
    product.images = product.images ? JSON.parse(product.images) : [];
    
    res.json({ 
      success: true, 
      product,
      messages
    });
  } catch (err) {
    console.error('[ERROR] 获取产品详情失败:', err.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 点赞产品
app.post('/api/products/:id/like', (req, res) => {
  try {
    const { id } = req.params;
    const ipHash = hashIP(getClientIP(req));
    
    // 检查是否已点赞
    const existing = db.prepare('SELECT id FROM likes WHERE product_id = ? AND ip_hash = ?').get(id, ipHash);
    
    if (existing) {
      // 取消点赞
      db.prepare('DELETE FROM likes WHERE product_id = ? AND ip_hash = ?').run(id, ipHash);
      const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE product_id = ?').get(id);
      return res.json({ success: true, liked: false, count: count.count });
    }
    
    // 添加点赞
    db.prepare('INSERT INTO likes (product_id, ip_hash) VALUES (?, ?)').run(id, ipHash);
    const count = db.prepare('SELECT COUNT(*) as count FROM likes WHERE product_id = ?').get(id);
    
    res.json({ success: true, liked: true, count: count.count });
  } catch (err) {
    console.error('[ERROR] 点赞失败:', err.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 分享产品
app.post('/api/products/:id/share', (req, res) => {
  try {
    const { id } = req.params;
    const { platform = '' } = req.body;
    
    db.prepare('INSERT INTO shares (product_id, platform) VALUES (?, ?)').run(id, platform);
    const count = db.prepare('SELECT COUNT(*) as count FROM shares WHERE product_id = ?').get(id);
    
    res.json({ success: true, count: count.count });
  } catch (err) {
    console.error('[ERROR] 分享失败:', err.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 获取所有留言（支持按产品筛选）
app.get('/api/messages', (req, res) => {
  try {
    const { product_id = 0 } = req.query;
    
    let messages;
    if (product_id && product_id !== '0') {
      messages = db.prepare(`
        SELECT m.*, p.name as product_name
        FROM messages m
        LEFT JOIN products p ON m.product_id = p.id
        WHERE m.product_id = ?
        ORDER BY m.created_at DESC
      `).all(product_id);
    } else {
      messages = db.prepare(`
        SELECT m.*, p.name as product_name
        FROM messages m
        LEFT JOIN products p ON m.product_id = p.id
        ORDER BY m.created_at DESC
      `).all();
    }
    
    res.json({ success: true, messages });
  } catch (err) {
    console.error('[ERROR] 获取留言失败:', err.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 提交留言（支持产品关联）
app.post('/api/messages', (req, res) => {
  try {
    const { product_id = 0, name, email, content } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: '昵称不能为空' });
    }
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ success: false, error: '留言内容不能为空' });
    }

    const trimmedName = name.trim().slice(0, 50);
    const trimmedEmail = (email || '').trim().slice(0, 100);
    const trimmedContent = content.trim().slice(0, 1000);

    if (trimmedName.length === 0) {
      return res.status(400).json({ success: false, error: '昵称不能为空' });
    }
    if (trimmedContent.length === 0) {
      return res.status(400).json({ success: false, error: '留言内容不能为空' });
    }

    const result = db.prepare(
      'INSERT INTO messages (product_id, name, email, content) VALUES (?, ?, ?, ?)'
    ).run(product_id, trimmedName, trimmedEmail, trimmedContent);

    res.status(201).json({
      success: true,
      message: '留言提交成功',
      id: result.lastInsertRowid
    });
  } catch (err) {
    console.error('[ERROR] 提交留言失败:', err.message);
    res.status(500).json({ success: false, error: '服务器内部错误' });
  }
});

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------- 启动服务 ----------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Handy.xin API 服务已启动: http://0.0.0.0:${PORT}`);
});
