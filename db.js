const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://rahnuma_db_user:H0MNH5LK009fuMm7B4SCmSsJc9yWFxdW@dpg-d8qn9uflk1mc73at0ptg-a/rahnuma_db';

const isInternal = DATABASE_URL.includes('dpg-') && !DATABASE_URL.includes('.render.com');
const isLocal = DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');
const poolConfig = {
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 15000,
};
if (!isLocal && !isInternal) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Pool error:', err.message);
});

async function initDatabase() {
  console.log('DATABASE_URL:', DATABASE_URL.replace(/:[^:@]+@/, ':***@'));
  let client;
  try {
    client = await pool.connect();
  } catch(err) {
    console.error('Cannot connect to database:', err.message);
    console.error('Server will start but database features will not work.');
    return;
  }
  console.log('Connected to PostgreSQL.');
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

      CREATE TABLE IF NOT EXISTS product_variants (
        id SERIAL PRIMARY KEY,
        product_id INT NOT NULL,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        price_adjustment REAL DEFAULT 0,
        stock INT DEFAULT 0,
        sku TEXT,
        is_active INT DEFAULT 1,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);

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

      CREATE TABLE IF NOT EXISTS ad_spends (
        id SERIAL PRIMARY KEY,
        date TEXT NOT NULL,
        platform TEXT DEFAULT 'facebook',
        spend_usd REAL NOT NULL DEFAULT 0,
        spend_bdt REAL NOT NULL DEFAULT 0,
        impressions INT DEFAULT 0,
        clicks INT DEFAULT 0,
        purchases INT DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ad_spends_date ON ad_spends(date);

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

      CREATE TABLE IF NOT EXISTS suppliers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS purchases (
        id SERIAL PRIMARY KEY,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        supplier_name TEXT,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        cost_per_unit NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
        purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Safe column additions for existing tables
    const alterCols = [
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS damaged_stock INT DEFAULT 0`,
    ];
    for (const alter of alterCols) {
      try { await client.query(alter); } catch(e) { console.warn('Alter warning:', e.message); }
    }

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
      'usd_to_bdt_rate': '122',
      'steadfast_api_key': 'xgcdt3ngyiul7qopivm7v4xwguxa3opn',
      'steadfast_secret_key': 'fwvz0oglkrutwxtqgpz4hk6n',
      'steadfast_base_url': 'https://portal.packzy.com/api/v1',
      'steadfast_auto_send': '0',
      'pathao_client_id': '7N1aMJQbWm',
      'pathao_client_secret': 'wRcaibZkUdSNz2EI9ZyuXLlNrnAv0TdPUPXMnD39',
      'pathao_username': 'robiul.babu1@gmail.com',
      'pathao_password': 'robi206039',
      'pathao_store_id': '',
      'pathao_city_id': '1',
      'pathao_zone_id': '1',
      'pathao_base_url': 'https://courier-api-sandbox.pathao.com',
      'redx_api_key': '',
      'redx_base_url': 'https://openapi.redx.com.bd',
      'bdcourier_api_key': 'NdB66Zlw775caHq0U2YzfvSQmEd1Toh5bQ3e084MzC6QtFnR4Pe8ar4ly7pP',
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

    // Steadfast credentials — update if currently empty
    const steadfastCredentials = {
      'steadfast_api_key': 'xgcdt3ngyiul7qopivm7v4xwguxa3opn',
      'steadfast_secret_key': 'fwvz0oglkrutwxtqgpz4hk6n',
    };
    for (const [key, value] of Object.entries(steadfastCredentials)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
         WHERE settings.value = ''`,
        [key, value]
      );
    }

    // Pathao credentials — update if currently empty (preserves admin changes)
    const pathaoCredentials = {
      'pathao_base_url': 'https://courier-api-sandbox.pathao.com',
      'pathao_client_id': '7N1aMJQbWm',
      'pathao_client_secret': 'wRcaibZkUdSNz2EI9ZyuXLlNrnAv0TdPUPXMnD39',
      'pathao_username': 'robiul.babu1@gmail.com',
      'pathao_password': 'robi206039',
    };
    for (const [key, value] of Object.entries(pathaoCredentials)) {
      await client.query(
        `INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
         WHERE settings.value = ''`,
        [key, value]
      );
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

    // Seed homepage as landing page
    const pageCount = await client.query('SELECT COUNT(*) as count FROM landing_pages');
    if (parseInt(pageCount.rows[0].count) === 0) {
      const homeBlocks = [
        {
          type: 'hero',
          data: {
            badge: 'সুন্নাহভিত্তিক চিকিৎসা',
            arabicVerse: 'وَنُنَزِّلُ مِنَ الْقُرْآنِ مَا هُوَ شِفَاءٌ',
            arabicTrans: 'আমি কুরআনে এমন কিছু নাযিল করি যা রোগের আরোগ্য — সূরা বনী ইসরাঈল: ৮২',
            title: 'কালো জাদু ও বদনজর থেকে মুক্তি পান কুরআনিক রুকইয়াহয়',
            subtitle: 'জিন্নর আছর, কালো জাদু, বান মারা, বদনজর, মানসিক চাপ — যেকোনো সমস্যায় ১০০% হালাল রুকইয়াহ পেপার।',
            stats: [
              { number: '৩০০০+', label: 'সন্তুষ্ট গ্রাহক' },
              { number: '⭐ ৪.৯', label: 'গ্রাহক রেটিং' },
              { number: '১–৯০', label: 'দিনে ফলাফল' }
            ],
            ctaText: 'আজই অর্ডার করুন',
            ctaLink: '#order',
            trustItems: ['ক্যাশ অন ডেলিভারি', '১০০% হালাল', 'গোপনীয়তা সুরক্ষিত'],
            bgColor: '#0d2818'
          }
        },
        {
          type: 'text',
          data: {
            title: 'আপনি কি এই সমস্যাগুলোতে ভুগছেন?',
            content: '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-top:16px"><div style="border:1.5px solid #e8e0d0;border-radius:12px;padding:20px 14px;text-align:center"><div style="font-size:32px;margin-bottom:10px">🪬</div><strong>কালো জাদু / বান</strong><br><small>তাবিজ বা যাদুর প্রভাব থেকে মুক্তি</small></div><div style="border:1.5px solid #e8e0d0;border-radius:12px;padding:20px 14px;text-align:center"><div style="font-size:32px;margin-bottom:10px">🧿</div><strong>বদনজর</strong><br><small>হিংসা ও বদনজরের ক্ষতি থেকে সুরক্ষা</small></div><div style="border:1.5px solid #e8e0d0;border-radius:12px;padding:20px 14px;text-align:center"><div style="font-size:32px;margin-bottom:10px">👻</div><strong>জিন্নর আছর</strong><br><small>জিন্নর প্রভাব ও আছর থেকে মুক্তি</small></div><div style="border:1.5px solid #e8e0d0;border-radius:12px;padding:20px 14px;text-align:center"><div style="font-size:32px;margin-bottom:10px">😰</div><strong>মানসিক চাপ</strong><br><small>ডিপ্রেশন ও উদ্বেগ কমাতে রুকইয়াহ</small></div><div style="border:1.5px solid #e8e0d0;border-radius:12px;padding:20px 14px;text-align:center"><div style="font-size:32px;margin-bottom:10px">💑</div><strong>দাম্পত্য সমস্যা</strong><br><small>সম্পর্কে বিচ্ছেদের জাদু থেকে মুক্তি</small></div><div style="border:1.5px solid #e8e0d0;border-radius:12px;padding:20px 14px;text-align:center"><div style="font-size:32px;margin-bottom:10px">🏥</div><strong>শারীরিক সমস্যা</strong><br><small>বদনজরের কারণে রোগ থেকে সুরক্ষা</small></div></div>'
          }
        },
        {
          type: 'testimonial',
          data: {
            items: [
              { name: 'Afsana Haque', text: 'আলহামদুলিল্লাহ, রুকিয়া পেপার খুব মানসম্মত। আমার প্রত্যাশার চেয়েও ভালো। শেষ হলে অবশ্যই আবার নেবো।', rating: 5 },
              { name: 'Ashraful Karim', text: 'মনে হয় আগেই যদি পেতাম! রুকিয়া পেপার সত্যিই উপকারী। আলহামদুলিল্লাহ অনেক ভালো ফিল করছি।', rating: 5 },
              { name: 'Imran Hossain', text: 'রুকিয়া পেপার আলহামদুলিল্লাহ অনেক ভালো কাজ করেছে। শেষ হলে আবার নেবো।', rating: 5 },
              { name: 'Rahim Uddin', text: 'খুবই আমেজিং সার্ভিস! পণ্যটি পাওয়ার পর থেকে অনেক বেশি নিরাপদ বোধ করছি।', rating: 5 }
            ]
          }
        },
        {
          type: 'faq',
          data: {
            items: [
              { question: 'হাদিয়া কত দিতে হবে?', answer: 'যেহেতু কুরআন এবং হাদিসের ব্যাপার, হাদিয়ার ব্যাপারে আমরা কিছু বলব না। আপনি আনসাফ করে আপনার সমস্যার গভীরতা অনুযায়ী ৫০১, ১০০১, ২০০১, ৫০০১ — যা মনে করেন তাই দিন।' },
              { question: 'কীভাবে রুকইয়াহ করবো?', answer: 'প্যাকেটের সাথে একটি বিস্তারিত ব্যবহার বিধিমালার কিটি দেওয়া হবে। আপনার সমস্যার ধরন অনুযায়ী পেপারে কুরআনি রুকইয়াহ লেখা থাকবে এবং সেভাবে পরিপালন করলেই হবে।' },
              { question: 'ফলাফল কতদিনে পাওয়া যাবে?', answer: 'কুরআন ও হাদিসের আলোকে এবং আমাদের ব্যক্তিগত অভিজ্ঞতা অনুযায়ী ১ থেকে ৯০ দিনের মধ্যে সমস্যার সমাধান পেতে শুরু করবেন, ইনশাআল্লাহ।' },
              { question: 'আমার তথ্য কি গোপন থাকবে?', answer: 'সম্পূর্ণ গোপনীয়তা নিশ্চিত করা হয়। আপনার সব তথ্য আমাদের কাছে সুরক্ষিত এবং কখনো তৃতীয় পক্ষের সাথে শেয়ার করা হয় না।' },
              { question: 'ডেলিভারি চার্জ কত?', answer: 'ঢাকার ভিতরে ৳৬০ এবং ঢাকার বাইরে ৳১২০। পণ্য হাতে পেয়ে টাকা পরিশোধ করতে পারবেন (ক্যাশ অন ডেলিভারি)।' }
            ]
          }
        },
        {
          type: 'contact',
          data: {
            phone: '01303073353',
            whatsapp: 'https://wa.me/8801303073353',
            messenger: ''
          }
        }
      ];

      await client.query(`INSERT INTO landing_pages (title, slug, status, content, seo_title, seo_description, published_at)
        VALUES ($1, $2, $3, $4::json, $5, $6, NOW())
        ON CONFLICT (slug) DO NOTHING`,
        [
          'রুকইয়াহ পেপার — রাহনুমা শপ',
          'home',
          'published',
          JSON.stringify(homeBlocks),
          'রুকইয়াহ পেপার — রাহনুমা শপ | সুন্নাহভিত্তিক রুকইয়াহ পণ্য',
          'কালো জাদু ও বদনজর থেকে মুক্তি পান কুরআনিক রুকইয়াহয়। ১০০% হালাল ও সুন্নাহভিত্তিক। ক্যাশ অন ডেলিভারি।'
        ]
      );
      console.log('Homepage landing page seeded.');
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
