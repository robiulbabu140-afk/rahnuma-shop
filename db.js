const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'data', 'shop.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDatabase() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_bn TEXT,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      parent_id INTEGER,
      image TEXT,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_bn TEXT,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      description_bn TEXT,
      price REAL NOT NULL,
      sale_price REAL,
      cost_price REAL,
      sku TEXT UNIQUE,
      barcode TEXT,
      category_id INTEGER,
      stock INTEGER DEFAULT 0,
      low_stock_alert INTEGER DEFAULT 5,
      weight REAL,
      unit TEXT DEFAULT 'piece',
      image TEXT,
      gallery TEXT,
      tags TEXT,
      is_active INTEGER DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      email TEXT,
      address TEXT,
      district TEXT,
      city TEXT,
      area TEXT,
      total_orders INTEGER DEFAULT 0,
      total_spent REAL DEFAULT 0,
      fraud_score INTEGER DEFAULT 0,
      notes TEXT,
      is_blocked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      district TEXT,
      city TEXT,
      area TEXT,
      subtotal REAL DEFAULT 0,
      shipping_cost REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      hadiya_amount REAL,
      status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'cod',
      payment_status TEXT DEFAULT 'unpaid',
      courier TEXT,
      consignment_id TEXT,
      tracking_code TEXT,
      tracking_number TEXT,
      delivery_charge REAL DEFAULT 0,
      courier_status TEXT,
      courier_message TEXT,
      problem_description TEXT,
      notes TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      shipped_at DATETIME,
      delivered_at DATETIME,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS coupons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      type TEXT DEFAULT 'fixed',
      value REAL NOT NULL,
      min_order REAL DEFAULT 0,
      max_uses INTEGER,
      used_count INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS page_views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);

  // Migrate existing DB — add courier columns if missing
  const cols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
  const migrations = [
    ['consignment_id', 'TEXT'], ['tracking_code', 'TEXT'], ['delivery_charge', 'REAL DEFAULT 0'],
    ['courier_status', 'TEXT'], ['courier_message', 'TEXT']
  ];
  for (const [col, type] of migrations) {
    if (!cols.includes(col)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${col} ${type}`);
    }
  }

  const adminCount = db.prepare('SELECT COUNT(*) as count FROM admin_users').get();
  if (adminCount.count === 0) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO admin_users (username, password, name, role) VALUES (?, ?, ?, ?)').run('admin', hashedPassword, 'অ্যাডমিন', 'superadmin');
  }

  const settingsDefaults = {
    'shop_name': 'রাহনুমা শপ',
    'shop_name_en': 'Rahnuma Shop',
    'shop_phone': '01303073353',
    'shop_email': '',
    'shop_address': '',
    'shipping_inside_dhaka': '60',
    'shipping_outside_dhaka': '120',
    'currency': '৳',
    'min_order_amount': '0',
    'cod_enabled': '1',
    'bkash_enabled': '0',
    'bkash_number': '',
    'nagad_enabled': '0',
    'nagad_number': '',
    'steadfast_api_key': '',
    'steadfast_secret_key': '',
    'steadfast_base_url': 'https://portal.packzy.com/api/v1',
    'steadfast_auto_send': '0',
    'default_delivery_charge_dhaka': '60',
    'default_delivery_charge_outside': '120',
    'facebook_pixel_id': '',
    'facebook_access_token': '',
    'facebook_test_event_code': '',
    'facebook_page': '',
    'whatsapp_number': '8801303073353',
    'messenger_link': '',
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(settingsDefaults)) {
    insertSetting.run(key, value);
  }

  const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get();
  if (catCount.count === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, name_bn, slug, sort_order) VALUES (?, ?, ?, ?)');
    insertCat.run('Ruqyah Papers', 'রুকইয়াহ পেপার', 'ruqyah-papers', 1);
    insertCat.run('Ruqyah Oil', 'রুকইয়াহ তেল', 'ruqyah-oil', 2);
    insertCat.run('Ruqyah Water', 'রুকইয়াহ পানি', 'ruqyah-water', 3);
    insertCat.run('Books', 'বই', 'books', 4);
    insertCat.run('Combo Pack', 'কম্বো প্যাক', 'combo-pack', 5);
  }

  const prodCount = db.prepare('SELECT COUNT(*) as count FROM products').get();
  if (prodCount.count === 0) {
    const insertProd = db.prepare(`INSERT INTO products (name, name_bn, slug, description, description_bn, price, sale_price, cost_price, sku, category_id, stock, image, is_featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    insertProd.run(
      'Ruqyah Paper (50 pcs)', 'রুকইয়াহ পেপার (৫০ পিস)', 'ruqyah-paper-50',
      'Premium quality Ruqyah papers with Quranic verses for spiritual healing.',
      '৫০টি রুকইয়াহ পেপার প্রতিটি প্যাকেটে। ১০০% হালাল ও সুন্নাহভিত্তিক।',
      2001, null, 800, 'RQP-50', 1, 500, '/uploads/ruqyah-paper.jpg', 1
    );

    insertProd.run(
      'Ruqyah Olive Oil', 'রুকইয়াহ অলিভ অয়েল', 'ruqyah-olive-oil',
      'Certified edible olive oil with Ruqyah recitation.',
      'হালাল সার্টিফাইড অলিভ অয়েল, রুকইয়াহ তিলাওয়াতসহ।',
      1501, 1201, 600, 'RQO-01', 2, 200, '/uploads/ruqyah-oil.jpg', 1
    );

    insertProd.run(
      'Ruqyah Water (1L)', 'রুকইয়াহ পানি (১ লিটার)', 'ruqyah-water-1l',
      'Blessed water with Quranic recitation for healing purposes.',
      'কুরআনি তিলাওয়াতযুক্ত বরকতময় পানি।',
      801, null, 300, 'RQW-1L', 3, 300, '/uploads/ruqyah-water.jpg', 1
    );

    insertProd.run(
      'Complete Ruqyah Kit', 'কমপ্লিট রুকইয়াহ কিট', 'complete-ruqyah-kit',
      'Everything you need: papers, oil, water, and guidebook.',
      'পেপার, তেল, পানি ও গাইডবুক — সব একসাথে।',
      5001, 4001, 2000, 'RQK-01', 5, 100, '/uploads/ruqyah-kit.jpg', 1
    );
  }
}

module.exports = { getDb, initDatabase };