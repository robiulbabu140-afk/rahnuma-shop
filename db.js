const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://rahnuma_db_user:H0MNH5LK009fuMm7B4SCmSsJc9yWFxdW@dpg-d8qn9uflk1mc73at0ptg-a/rahnuma_db';

const poolConfig = {
  connectionString: DATABASE_URL,
};

if (DATABASE_URL.includes('render.com') || process.env.NODE_ENV === 'production') {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        name_bn TEXT,
        slug TEXT UNIQUE NOT NULL,
        description TEXT,
        parent_id INT,
        image TEXT,
        is_active INT DEFAULT 1,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
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
        category_id INT,
        stock INT DEFAULT 0,
        low_stock_alert INT DEFAULT 5,
        weight REAL,
        unit TEXT DEFAULT 'piece',
        image TEXT,
        gallery TEXT,
        tags TEXT,
        is_active INT DEFAULT 1,
        is_featured INT DEFAULT 0,
        views INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        email TEXT,
        address TEXT,
        district TEXT,
        city TEXT,
        area TEXT,
        total_orders INT DEFAULT 0,
        total_spent REAL DEFAULT 0,
        fraud_score INT DEFAULT 0,
        notes TEXT,
        is_blocked INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_number TEXT UNIQUE NOT NULL,
        customer_id INT,
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
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        confirmed_at TIMESTAMP,
        shipped_at TIMESTAMP,
        delivered_at TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INT NOT NULL,
        product_id INT,
        product_name TEXT NOT NULL,
        quantity INT DEFAULT 1,
        price REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS coupons (
        id SERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        type TEXT DEFAULT 'fixed',
        value REAL NOT NULL,
        min_order REAL DEFAULT 0,
        max_uses INT,
        used_count INT DEFAULT 0,
        is_active INT DEFAULT 1,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS page_views (
        id SERIAL PRIMARY KEY,
        page TEXT,
        ip TEXT,
        user_agent TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS blocked_entries (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        value TEXT NOT NULL,
        reason TEXT,
        duration_hours INT,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS block_attempts (
        id SERIAL PRIMARY KEY,
        phone TEXT,
        ip TEXT,
        fingerprint TEXT,
        reason TEXT NOT NULL,
        order_data TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS otp_sessions (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        code TEXT NOT NULL,
        attempts INT DEFAULT 0,
        max_attempts INT DEFAULT 5,
        verified INT DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS landing_pages (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'draft',
        content JSON,
        seo_title TEXT,
        seo_description TEXT,
        custom_css TEXT,
        views INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        published_at TIMESTAMP,
        deleted_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS page_revisions (
        id SERIAL PRIMARY KEY,
        page_id INT REFERENCES landing_pages(id) ON DELETE CASCADE,
        content JSON,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create indexes (IF NOT EXISTS is supported in PG 9.5+)
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_blocked_type_value ON blocked_entries(type, value)',
      'CREATE INDEX IF NOT EXISTS idx_blocked_expires ON blocked_entries(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_block_attempts_phone ON block_attempts(phone)',
      'CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_sessions(phone)',
      'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)',
      'CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active)',
      'CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug)',
      'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
      'CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone)',
      'CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
      'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_landing_pages_slug ON landing_pages(slug)',
      'CREATE INDEX IF NOT EXISTS idx_landing_pages_status ON landing_pages(status)',
      'CREATE INDEX IF NOT EXISTS idx_page_revisions_page ON page_revisions(page_id)',
    ];
    for (const idx of indexes) {
      await client.query(idx);
    }

    // Seed admin user
    const adminCount = await client.query('SELECT COUNT(*) as count FROM admin_users');
    if (parseInt(adminCount.rows[0].count) === 0) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await client.query('INSERT INTO admin_users (username, password, name, role) VALUES ($1, $2, $3, $4)', ['admin', hashedPassword, 'Admin', 'superadmin']);
    }

    // Seed default settings
    const settingsDefaults = {
      'shop_name': 'Rahnuma Shop',
      'shop_name_en': 'Rahnuma Shop',
      'shop_phone': '01303073353',
      'shop_email': '',
      'shop_address': '',
      'shipping_inside_dhaka': '60',
      'shipping_outside_dhaka': '120',
      'currency': 'TK',
      'min_order_amount': '0',
      'cod_enabled': '1',
      'bkash_enabled': '0',
      'bkash_number': '',
      'nagad_enabled': '0',
      'nagad_number': '',
      'fraud_protection_enabled': '1',
      'fraud_phone_block_enabled': '1',
      'fraud_ip_block_enabled': '1',
      'fraud_fingerprint_block_enabled': '1',
      'fraud_incomplete_order_block': '1',
      'fraud_incomplete_statuses': 'pending,flagged,returned,cancelled',
      'fraud_processing_cooldown_enabled': '1',
      'fraud_processing_cooldown_hours': '24',
      'fraud_courier_success_block': '0',
      'fraud_courier_min_success_rate': '50',
      'fraud_no_history_block': '0',
      'fraud_phone_validation_bd': '1',
      'fraud_max_orders_per_phone_day': '3',
      'fraud_max_orders_per_ip_day': '5',
      'otp_enabled': '0',
      'otp_expiry_minutes': '5',
      'otp_max_attempts': '5',
      'otp_session_hours': '24',
      'otp_rate_limit_per_hour': '5',
      'otp_sms_provider': '',
      'otp_sms_api_key': '',
      'otp_sms_sender_id': '',
      'otp_sms_template': 'Your OTP is {CODE}. Valid for {MINUTES} minutes. - {SHOP_NAME}',
      'block_message_title': 'Order Blocked',
      'block_message_text': 'Your order could not be placed. Please contact us for assistance.',
      'block_message_phone': '01303073353',
      'block_message_whatsapp': 'https://wa.me/8801303073353',
      'block_message_messenger': '',
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
      'landing_page_default_status': 'draft',
      'landing_page_max_revisions': '20',
    };

    for (const [key, value] of Object.entries(settingsDefaults)) {
      await client.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, value]);
    }

    // Seed categories
    const catCount = await client.query('SELECT COUNT(*) as count FROM categories');
    if (parseInt(catCount.rows[0].count) === 0) {
      const cats = [
        ['Ruqyah Papers', 'Ruqyah Papers', 'ruqyah-papers', 1],
        ['Ruqyah Oil', 'Ruqyah Oil', 'ruqyah-oil', 2],
        ['Ruqyah Water', 'Ruqyah Water', 'ruqyah-water', 3],
        ['Books', 'Books', 'books', 4],
        ['Combo Pack', 'Combo Pack', 'combo-pack', 5],
      ];
      for (const [name, name_bn, slug, sort_order] of cats) {
        await client.query('INSERT INTO categories (name, name_bn, slug, sort_order) VALUES ($1, $2, $3, $4)', [name, name_bn, slug, sort_order]);
      }
    }

    // Seed products
    const prodCount = await client.query('SELECT COUNT(*) as count FROM products');
    if (parseInt(prodCount.rows[0].count) === 0) {
      const products = [
        ['Ruqyah Paper (50 pcs)', 'Ruqyah Paper (50 pcs)', 'ruqyah-paper-50', 'Premium quality Ruqyah papers with Quranic verses for spiritual healing.', 'Premium quality Ruqyah papers with Quranic verses for spiritual healing.', 2001, null, 800, 'RQP-50', 1, 500, '/uploads/ruqyah-paper.jpg', 1],
        ['Ruqyah Olive Oil', 'Ruqyah Olive Oil', 'ruqyah-olive-oil', 'Certified edible olive oil with Ruqyah recitation.', 'Certified edible olive oil with Ruqyah recitation.', 1501, 1201, 600, 'RQO-01', 2, 200, '/uploads/ruqyah-oil.jpg', 1],
        ['Ruqyah Water (1L)', 'Ruqyah Water (1L)', 'ruqyah-water-1l', 'Blessed water with Quranic recitation for healing purposes.', 'Blessed water with Quranic recitation for healing purposes.', 801, null, 300, 'RQW-1L', 3, 300, '/uploads/ruqyah-water.jpg', 1],
        ['Complete Ruqyah Kit', 'Complete Ruqyah Kit', 'complete-ruqyah-kit', 'Everything you need: papers, oil, water, and guidebook.', 'Everything you need: papers, oil, water, and guidebook.', 5001, 4001, 2000, 'RQK-01', 5, 100, '/uploads/ruqyah-kit.jpg', 1],
      ];
      for (const p of products) {
        await client.query(`INSERT INTO products (name, name_bn, slug, description, description_bn, price, sale_price, cost_price, sku, category_id, stock, image, is_featured)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, p);
      }
    }

    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database initialization error:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
