const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { pool, initDatabase } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database before starting
(async () => {
  await initDatabase();
})();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahnuma-shop-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));

function generateOrderNumber() {
  const d = new Date();
  const prefix = 'RN';
  const date = d.getFullYear().toString().slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}${date}${rand}`;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

async function getSettings() {
  const result = await pool.query('SELECT key, value FROM settings');
  const settings = {};
  result.rows.forEach(r => { settings[r.key] = r.value; });
  return settings;
}

// ===== STEADFAST COURIER API =====

function steadfastRequest(method, endpoint, body) {
  return new Promise(async (resolve, reject) => {
    const settings = await getSettings();
    const apiKey = settings.steadfast_api_key;
    const secretKey = settings.steadfast_secret_key;
    const baseUrl = settings.steadfast_base_url || 'https://portal.packzy.com/api/v1';

    if (!apiKey || !secretKey) return reject(new Error('Steadfast API credentials not configured'));

    const url = new URL(baseUrl + endpoint);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Api-Key': apiKey,
        'Secret-Key': secretKey,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Invalid response from Steadfast')); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sendOrderToCourier(orderId) {
  const orderRes = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  const order = orderRes.rows[0];
  if (!order) throw new Error('Order not found');
  if (order.consignment_id) throw new Error('Already sent to courier');

  const itemsRes = await pool.query('SELECT product_name, quantity FROM order_items WHERE order_id = $1', [orderId]);
  const itemDesc = itemsRes.rows.map(i => `${i.product_name} x${i.quantity}`).join(', ');

  const result = await steadfastRequest('POST', '/create_order', {
    invoice: order.order_number,
    recipient_name: order.customer_name,
    recipient_phone: order.phone,
    recipient_address: [order.address, order.area, order.city, order.district].filter(Boolean).join(', '),
    cod_amount: order.payment_method === 'cod' ? order.total_amount : 0,
    note: order.notes || order.problem_description || '',
    item_description: itemDesc,
  });

  if (result.status === 200 && result.consignment) {
    const c = result.consignment;
    await pool.query(`UPDATE orders SET
      courier = 'Steadfast',
      consignment_id = $1,
      tracking_code = $2,
      tracking_number = $3,
      courier_status = $4,
      status = 'shipped',
      shipped_at = NOW(),
      updated_at = NOW()
    WHERE id = $5`, [c.consignment_id, c.tracking_code, c.tracking_code, c.status || 'in_review', orderId]);

    return { success: true, consignment: c };
  }

  throw new Error(result.message || 'Steadfast API error');
}

async function handleCourierStatusUpdate(order, newStatus, deliveryCharge, trackingMessage) {
  const statusMap = {
    'pending': 'shipped',
    'in_review': 'shipped',
    'delivered': 'delivered',
    'partial_delivered': 'delivered',
    'delivered_approval_pending': 'shipped',
    'partial_delivered_approval_pending': 'shipped',
    'cancelled': 'cancelled',
    'cancelled_approval_pending': 'shipped',
    'hold': 'shipped',
    'unknown': 'shipped',
  };

  const mappedStatus = statusMap[newStatus] || 'shipped';
  const charge = Number(deliveryCharge) || 0;

  let updateSql = `UPDATE orders SET
    courier_status = $1,
    courier_message = $2,
    delivery_charge = $3,
    status = $4,
    updated_at = NOW()`;
  const params = [newStatus, trackingMessage || '', charge, mappedStatus];

  if (mappedStatus === 'delivered') {
    updateSql += `, delivered_at = NOW(), payment_status = 'paid'`;
  }
  updateSql += ` WHERE id = $${params.length + 1}`;
  params.push(order.id);

  await pool.query(updateSql, params);

  if (mappedStatus === 'delivered') {
    if (charge > 0) {
      await pool.query('INSERT INTO expenses (category, amount, description, date) VALUES ($1, $2, $3, $4)',
        ['Courier', charge, `Steadfast charge - ${order.order_number}`, new Date().toISOString().split('T')[0]]);
    }
    if (order.customer_id) {
      await pool.query('UPDATE customers SET total_spent = total_spent + $1, updated_at = NOW() WHERE id = $2', [order.total_amount, order.customer_id]);
    }
  }

  if (mappedStatus === 'cancelled') {
    const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
    for (const item of items.rows) {
      if (item.product_id) {
        await pool.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
      }
    }
    if (charge > 0) {
      await pool.query('INSERT INTO expenses (category, amount, description, date) VALUES ($1, $2, $3, $4)',
        ['Courier (Cancelled)', charge, `Steadfast return charge - ${order.order_number}`, new Date().toISOString().split('T')[0]]);
    }
  }

  console.log(`Order ${order.order_number}: ${newStatus} -> ${mappedStatus}`);
}

// ===== FACEBOOK CONVERSION API =====

function hashSHA256(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

async function sendFBConversionEvent(eventName, eventData, userData, customData, sourceUrl) {
  const settings = await getSettings();
  const pixelId = settings.facebook_pixel_id;
  const accessToken = settings.facebook_access_token;
  if (!pixelId || !accessToken) return;

  const payload = {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventData.event_id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      event_source_url: sourceUrl || '',
      action_source: 'website',
      user_data: {
        ph: userData.phone ? [hashSHA256(userData.phone)] : undefined,
        fn: userData.name ? [hashSHA256(userData.name.split(' ')[0])] : undefined,
        ln: userData.name && userData.name.split(' ').length > 1 ? [hashSHA256(userData.name.split(' ').slice(1).join(' '))] : undefined,
        ct: userData.city ? [hashSHA256(userData.city)] : undefined,
        country: [hashSHA256('bd')],
        client_ip_address: userData.ip || undefined,
        client_user_agent: userData.user_agent || undefined,
        fbc: userData.fbc || undefined,
        fbp: userData.fbp || undefined,
      },
      custom_data: customData
    }]
  };

  const testCode = settings.facebook_test_event_code;
  if (testCode) payload.test_event_code = testCode;

  const postData = JSON.stringify(payload);
  const options = {
    hostname: 'graph.facebook.com',
    path: `/v21.0/${pixelId}/events?access_token=${accessToken}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
  };

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', chunk => { body += chunk; });
    res.on('end', () => {
      if (res.statusCode !== 200) console.error('FB CAPI Error:', body);
      else console.log('FB CAPI sent:', eventName);
    });
  });
  req.on('error', (e) => console.error('FB CAPI request error:', e.message));
  req.write(postData);
  req.end();
}

// ===== PUBLIC API =====

app.get('/api/settings', async (req, res) => {
  try {
    const s = await getSettings();
    res.json({
      shop_name: s.shop_name,
      shop_name_en: s.shop_name_en,
      shop_phone: s.shop_phone,
      shipping_inside_dhaka: Number(s.shipping_inside_dhaka),
      shipping_outside_dhaka: Number(s.shipping_outside_dhaka),
      currency: s.currency,
      cod_enabled: s.cod_enabled === '1',
      bkash_enabled: s.bkash_enabled === '1',
      bkash_number: s.bkash_number,
      nagad_enabled: s.nagad_enabled === '1',
      nagad_number: s.nagad_number,
      whatsapp_number: s.whatsapp_number,
      messenger_link: s.messenger_link,
      facebook_page: s.facebook_page,
      facebook_pixel_id: s.facebook_pixel_id || '',
    });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/products', async (req, res) => {
  try {
    const { category, featured, search, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT p.*, c.name as category_name, c.name_bn as category_name_bn FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1';
    const params = [];
    let paramIndex = 1;

    if (category) {
      sql += ` AND c.slug = $${paramIndex++}`;
      params.push(category);
    }
    if (featured === '1') {
      sql += ' AND p.is_featured = 1';
    }
    if (search) {
      sql += ` AND (p.name ILIKE $${paramIndex} OR p.name_bn ILIKE $${paramIndex + 1} OR p.description ILIKE $${paramIndex + 2})`;
      const s = `%${search}%`;
      params.push(s, s, s);
      paramIndex += 3;
    }

    const countSql = sql.replace('SELECT p.*, c.name as category_name, c.name_bn as category_name_bn', 'SELECT COUNT(*) as total');
    const countResult = await pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].total);

    sql += ` ORDER BY p.is_featured DESC, p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const result = await pool.query(sql, params);
    res.json({ products: result.rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/products/:slug', async (req, res) => {
  try {
    const result = await pool.query('SELECT p.*, c.name as category_name, c.name_bn as category_name_bn FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1 AND p.is_active = 1', [req.params.slug]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    const product = result.rows[0];
    await pool.query('UPDATE products SET views = views + 1 WHERE id = $1', [product.id]);
    res.json(product);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC');
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FRAUD PROTECTION =====

function getClientIP(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (cf) return cf;
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '';
}

async function checkFraudBlocking(phoneClean, ip, fingerprint) {
  const settings = await getSettings();
  if (settings.fraud_protection_enabled !== '1') return null;

  const now = new Date().toISOString();

  // 1. Manual block check
  const blockChecks = [];
  if (settings.fraud_phone_block_enabled === '1' && phoneClean) {
    blockChecks.push({ type: 'phone', value: phoneClean });
  }
  if (settings.fraud_ip_block_enabled === '1' && ip) {
    blockChecks.push({ type: 'ip', value: ip });
  }
  if (settings.fraud_fingerprint_block_enabled === '1' && fingerprint) {
    blockChecks.push({ type: 'fingerprint', value: fingerprint });
  }

  for (const check of blockChecks) {
    const blocked = await pool.query('SELECT * FROM blocked_entries WHERE type = $1 AND value = $2 AND (expires_at IS NULL OR expires_at > $3)', [check.type, check.value, now]);
    if (blocked.rows.length > 0) return { blocked: true, reason: `manual_${check.type}`, message: `Blocked by ${check.type}` };
  }

  // 2. BD Phone validation
  if (settings.fraud_phone_validation_bd === '1' && phoneClean) {
    if (!/^01[3-9]\d{8}$/.test(phoneClean)) {
      return { blocked: true, reason: 'invalid_phone', message: 'Invalid Bangladesh phone number' };
    }
  }

  // 3. Incomplete order block
  if (settings.fraud_incomplete_order_block === '1' && phoneClean) {
    const statuses = (settings.fraud_incomplete_statuses || 'pending,flagged').split(',').map(s => s.trim());
    const placeholders = statuses.map((_, i) => `$${i + 2}`).join(',');
    const incomplete = await pool.query(`SELECT COUNT(*) as c FROM orders WHERE phone = $1 AND status IN (${placeholders})`, [phoneClean, ...statuses]);
    if (parseInt(incomplete.rows[0].c) > 0) return { blocked: true, reason: 'incomplete_order', message: 'You have incomplete orders' };
  }

  // 4. Processing cooldown
  if (settings.fraud_processing_cooldown_enabled === '1' && phoneClean) {
    const hours = Number(settings.fraud_processing_cooldown_hours) || 24;
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const recent = await pool.query("SELECT COUNT(*) as c FROM orders WHERE phone = $1 AND status = 'processing' AND created_at > $2", [phoneClean, cutoff]);
    if (parseInt(recent.rows[0].c) > 0) return { blocked: true, reason: 'processing_cooldown', message: `Please wait ${hours}h before ordering again` };
  }

  // 5. Rate limiting
  const maxPerPhone = Number(settings.fraud_max_orders_per_phone_day) || 3;
  const maxPerIP = Number(settings.fraud_max_orders_per_ip_day) || 5;
  const today = new Date().toISOString().split('T')[0];

  if (phoneClean) {
    const phoneOrders = await pool.query("SELECT COUNT(*) as c FROM orders WHERE phone = $1 AND DATE(created_at) = $2", [phoneClean, today]);
    if (parseInt(phoneOrders.rows[0].c) >= maxPerPhone) return { blocked: true, reason: 'rate_limit_phone', message: `Maximum ${maxPerPhone} orders per day exceeded` };
  }
  if (ip) {
    const ipOrders = await pool.query("SELECT COUNT(*) as c FROM orders WHERE ip_address = $1 AND DATE(created_at) = $2", [ip, today]);
    if (parseInt(ipOrders.rows[0].c) >= maxPerIP) return { blocked: true, reason: 'rate_limit_ip', message: `Maximum ${maxPerIP} orders per day exceeded` };
  }

  return null;
}

async function logBlockAttempt(phone, ip, fingerprint, reason, orderData) {
  await pool.query('INSERT INTO block_attempts (phone, ip, fingerprint, reason, order_data) VALUES ($1, $2, $3, $4, $5)', [phone || '', ip || '', fingerprint || '', reason, JSON.stringify(orderData || {})]);
}

app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, phone, address, district, city, area, items, hadiya_amount, payment_method, problem_description, coupon_code } = req.body;

    if (!customer_name || !phone || !address || !items || !items.length) {
      return res.status(400).json({ error: 'Name, phone, address and products are required' });
    }

    const phoneClean = phone.replace(/[^0-9]/g, '');
    if (phoneClean.length < 11) {
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    // Fraud check
    const clientIP = getClientIP(req);
    const fingerprint = req.body._fingerprint || '';
    const fraudResult = await checkFraudBlocking(phoneClean, clientIP, fingerprint);
    if (fraudResult && fraudResult.blocked) {
      const s = await getSettings();
      await logBlockAttempt(phoneClean, clientIP, fingerprint, fraudResult.reason, { customer_name, phone: phoneClean });
      return res.status(403).json({
        error: 'blocked',
        reason: fraudResult.reason,
        title: s.block_message_title || 'Order Blocked',
        message: s.block_message_text || fraudResult.message,
        phone: s.block_message_phone,
        whatsapp: s.block_message_whatsapp,
        messenger: s.block_message_messenger
      });
    }

    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const prodResult = await pool.query('SELECT * FROM products WHERE id = $1 AND is_active = 1', [item.product_id]);
      if (prodResult.rows.length === 0) return res.status(400).json({ error: `Product not found (ID: ${item.product_id})` });
      const product = prodResult.rows[0];
      if (product.stock < item.quantity) return res.status(400).json({ error: `"${product.name_bn || product.name}" is out of stock` });
      const price = product.sale_price || product.price;
      const total = price * item.quantity;
      subtotal += total;
      orderItems.push({ product_id: product.id, product_name: product.name_bn || product.name, quantity: item.quantity, price, total });
    }

    let discount = 0;
    if (coupon_code) {
      const couponResult = await pool.query('SELECT * FROM coupons WHERE code = $1 AND is_active = 1', [coupon_code.toUpperCase()]);
      if (couponResult.rows.length > 0) {
        const coupon = couponResult.rows[0];
        if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
          return res.status(400).json({ error: 'Coupon has expired' });
        }
        if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
          return res.status(400).json({ error: 'Coupon usage limit reached' });
        }
        if (subtotal < coupon.min_order) {
          return res.status(400).json({ error: `Minimum order of TK ${coupon.min_order} required` });
        }
        discount = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
        if (discount > subtotal) discount = subtotal;
        await pool.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = $1', [coupon.id]);
      }
    }

    const settings = await getSettings();
    const isDhaka = district && district.toLowerCase().includes('dhaka');
    const shippingCost = isDhaka ? Number(settings.shipping_inside_dhaka) : Number(settings.shipping_outside_dhaka);
    const totalAmount = subtotal - discount + shippingCost;

    const orderNumber = generateOrderNumber();

    const custResult = await pool.query('SELECT * FROM customers WHERE phone = $1', [phoneClean]);
    let customerId;
    if (custResult.rows.length > 0) {
      const customer = custResult.rows[0];
      customerId = customer.id;
      await pool.query('UPDATE customers SET name = $1, address = $2, district = $3, city = $4, area = $5, total_orders = total_orders + 1, total_spent = total_spent + $6, updated_at = NOW() WHERE id = $7',
        [customer_name, address, district || '', city || '', area || '', totalAmount, customer.id]);
    } else {
      const newCust = await pool.query('INSERT INTO customers (name, phone, address, district, city, area, total_orders, total_spent) VALUES ($1, $2, $3, $4, $5, $6, 1, $7) RETURNING id',
        [customer_name, phoneClean, address, district || '', city || '', area || '', totalAmount]);
      customerId = newCust.rows[0].id;
    }

    const fraudScore = await calculateFraudScore(phoneClean);

    const orderResult = await pool.query(`INSERT INTO orders (order_number, customer_id, customer_name, phone, address, district, city, area, subtotal, shipping_cost, discount, total_amount, hadiya_amount, status, payment_method, payment_status, problem_description, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
      [orderNumber, customerId, customer_name, phoneClean, address, district || '', city || '', area || '', subtotal, shippingCost, discount, totalAmount, hadiya_amount || 0, fraudScore > 70 ? 'flagged' : 'pending', payment_method || 'cod', 'unpaid', problem_description || '', req.ip]);

    const orderId = orderResult.rows[0].id;

    for (const item of orderItems) {
      await pool.query('INSERT INTO order_items (order_id, product_id, product_name, quantity, price, total) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderId, item.product_id, item.product_name, item.quantity, item.price, item.total]);
      await pool.query('UPDATE products SET stock = stock - $1 WHERE id = $2', [item.quantity, item.product_id]);
    }

    // Facebook Conversion API
    const eventId = `purchase_${orderNumber}_${Date.now()}`;
    sendFBConversionEvent('Purchase', { event_id: eventId }, {
      phone: phoneClean,
      name: customer_name,
      city: city || district || '',
      ip: req.ip,
      user_agent: req.headers['user-agent'],
      fbc: req.body._fbc || null,
      fbp: req.body._fbp || null,
    }, {
      currency: 'BDT',
      value: totalAmount,
      content_type: 'product',
      contents: orderItems.map(i => ({ id: String(i.product_id), quantity: i.quantity, item_price: i.price })),
      order_id: orderNumber,
      num_items: orderItems.reduce((s, i) => s + i.quantity, 0),
    }, req.body._source_url || '');

    res.json({ success: true, order_number: orderNumber, total: totalAmount, event_id: eventId, message: 'Order placed successfully!' });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Server-side CAPI relay for client events
app.post('/api/fb-event', async (req, res) => {
  const { event_name, event_id, custom_data, user_data, source_url } = req.body;
  if (!event_name) return res.status(400).json({ error: 'event_name required' });

  sendFBConversionEvent(event_name, { event_id: event_id || undefined }, {
    phone: user_data?.phone || null,
    name: user_data?.name || null,
    city: user_data?.city || null,
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    fbc: user_data?.fbc || null,
    fbp: user_data?.fbp || null,
  }, custom_data || {}, source_url || req.headers.referer || '');

  res.json({ success: true });
});

app.get('/api/orders/track/:orderNumber', async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT order_number, customer_name, status, total_amount, shipping_cost, payment_method, payment_status, courier, tracking_number, created_at FROM orders WHERE order_number = $1', [req.params.orderNumber]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const itemsResult = await pool.query('SELECT product_name, quantity, price, total FROM order_items WHERE order_id = (SELECT id FROM orders WHERE order_number = $1)', [req.params.orderNumber]);
    res.json({ order: orderResult.rows[0], items: itemsResult.rows });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/coupon/verify', async (req, res) => {
  try {
    const { code } = req.body;
    const result = await pool.query('SELECT * FROM coupons WHERE code = $1 AND is_active = 1', [(code || '').toUpperCase()]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Coupon not found' });
    const coupon = result.rows[0];
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ error: 'Coupon has expired' });
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.status(400).json({ error: 'Coupon usage limit reached' });
    res.json({ type: coupon.type, value: coupon.value, min_order: coupon.min_order });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

async function calculateFraudScore(phone) {
  const custResult = await pool.query('SELECT * FROM customers WHERE phone = $1', [phone]);
  if (custResult.rows.length === 0) return 0;
  const customer = custResult.rows[0];
  let score = 0;
  const cancelled = (await pool.query("SELECT COUNT(*) as c FROM orders WHERE phone = $1 AND status = 'cancelled'", [phone])).rows[0].c;
  const returned = (await pool.query("SELECT COUNT(*) as c FROM orders WHERE phone = $1 AND status = 'returned'", [phone])).rows[0].c;
  const total = (await pool.query('SELECT COUNT(*) as c FROM orders WHERE phone = $1', [phone])).rows[0].c;
  if (parseInt(total) > 0) {
    const failRate = (parseInt(cancelled) + parseInt(returned)) / parseInt(total);
    if (failRate > 0.5) score += 50;
    else if (failRate > 0.3) score += 30;
  }
  if (parseInt(cancelled) > 3) score += 20;
  if (parseInt(returned) > 2) score += 20;
  if (customer.is_blocked) score = 100;
  return Math.min(score, 100);
}

// ===== ADMIN AUTH =====

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
    if (result.rows.length === 0 || !bcrypt.compareSync(password, result.rows[0].password)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = result.rows[0];
    req.session.admin = { id: user.id, username: user.username, name: user.name, role: user.role };
    res.json({ success: true, user: { name: user.name, role: user.role } });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json(req.session.admin);
});

// ===== ADMIN DASHBOARD =====

app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';

    const todaySales = (await pool.query("SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE DATE(created_at) = $1 AND status != 'cancelled'", [today])).rows[0];
    const monthSales = (await pool.query("SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE DATE(created_at) >= $1 AND status != 'cancelled'", [monthStart])).rows[0];
    const totalOrders = parseInt((await pool.query('SELECT COUNT(*) as c FROM orders')).rows[0].c);
    const totalCustomers = parseInt((await pool.query('SELECT COUNT(*) as c FROM customers')).rows[0].c);
    const totalProducts = parseInt((await pool.query('SELECT COUNT(*) as c FROM products WHERE is_active = 1')).rows[0].c);

    const statusCounts = (await pool.query("SELECT status, COUNT(*) as c FROM orders GROUP BY status")).rows;
    const statusMap = {};
    statusCounts.forEach(s => { statusMap[s.status] = parseInt(s.c); });

    const pendingOrders = statusMap.pending || 0;
    const confirmedOrders = statusMap.confirmed || 0;
    const shippedOrders = statusMap.shipped || 0;
    const deliveredOrders = statusMap.delivered || 0;
    const cancelledOrders = statusMap.cancelled || 0;
    const returnedOrders = statusMap.returned || 0;
    const flaggedOrders = statusMap.flagged || 0;

    const lowStockProducts = (await pool.query('SELECT id, name, name_bn, stock, low_stock_alert FROM products WHERE is_active = 1 AND stock <= low_stock_alert ORDER BY stock ASC LIMIT 10')).rows;

    const recentOrders = (await pool.query('SELECT order_number, customer_name, phone, total_amount, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10')).rows;

    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const data = (await pool.query("SELECT COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue FROM orders WHERE DATE(created_at) = $1 AND status != 'cancelled'", [dateStr])).rows[0];
      last7Days.push({ date: dateStr, orders: parseInt(data.orders), revenue: parseFloat(data.revenue) });
    }

    const delivered = parseFloat((await pool.query("SELECT COALESCE(SUM(total_amount),0) as total FROM orders WHERE status = 'delivered'")).rows[0].total);
    const totalExpenses = parseFloat((await pool.query('SELECT COALESCE(SUM(amount),0) as total FROM expenses')).rows[0].total);
    const costOfGoods = parseFloat((await pool.query("SELECT COALESCE(SUM(oi.quantity * p.cost_price),0) as total FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id WHERE o.status = 'delivered'")).rows[0].total);

    res.json({
      today: { orders: parseInt(todaySales.orders), revenue: parseFloat(todaySales.revenue) },
      month: { orders: parseInt(monthSales.orders), revenue: parseFloat(monthSales.revenue) },
      totalOrders, totalCustomers, totalProducts,
      pendingOrders, confirmedOrders, shippedOrders, deliveredOrders, cancelledOrders, returnedOrders, flaggedOrders,
      lowStockProducts,
      recentOrders,
      last7Days,
      profit: { revenue: delivered, costOfGoods, expenses: totalExpenses, net: delivered - costOfGoods - totalExpenses }
    });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN ORDERS =====

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 25, date_from, date_to } = req.query;
    let sql = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') { sql += ` AND status = $${paramIndex++}`; params.push(status); }
    if (search) {
      sql += ` AND (order_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex + 1} OR phone ILIKE $${paramIndex + 2})`;
      const s = `%${search}%`;
      params.push(s, s, s);
      paramIndex += 3;
    }
    if (date_from) { sql += ` AND DATE(created_at) >= $${paramIndex++}`; params.push(date_from); }
    if (date_to) { sql += ` AND DATE(created_at) <= $${paramIndex++}`; params.push(date_to); }

    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = parseInt((await pool.query(countSql, params)).rows[0].total);

    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const result = await pool.query(sql, params);
    res.json({ orders: result.rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const order = orderResult.rows[0];
    const items = (await pool.query('SELECT oi.*, p.image FROM order_items oi LEFT JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1', [order.id])).rows;
    const customer = order.customer_id ? (await pool.query('SELECT * FROM customers WHERE id = $1', [order.customer_id])).rows[0] || null : null;
    res.json({ order, items, customer });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'returned', 'cancelled', 'flagged'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const order = orderResult.rows[0];

    let updateParts = ['status = $1', 'updated_at = NOW()'];
    const updateParams = [status];
    let paramIdx = 2;

    if (status === 'confirmed') { updateParts.push(`confirmed_at = NOW()`); }
    if (status === 'shipped') { updateParts.push(`shipped_at = NOW()`); }
    if (status === 'delivered') {
      updateParts.push(`delivered_at = NOW()`);
      updateParts.push(`payment_status = 'paid'`);
    }

    if (status === 'cancelled' && order.status !== 'delivered') {
      const items = (await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id])).rows;
      for (const item of items) {
        if (item.product_id) {
          await pool.query('UPDATE products SET stock = stock + $1 WHERE id = $2', [item.quantity, item.product_id]);
        }
      }
    }

    updateParams.push(req.params.id);
    await pool.query(`UPDATE orders SET ${updateParts.join(', ')} WHERE id = $${paramIdx}`, updateParams);

    res.json({ success: true });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const { courier, tracking_number, notes, payment_status } = req.body;
    await pool.query('UPDATE orders SET courier = COALESCE($1, courier), tracking_number = COALESCE($2, tracking_number), notes = COALESCE($3, notes), payment_status = COALESCE($4, payment_status), updated_at = NOW() WHERE id = $5',
      [courier || null, tracking_number || null, notes || null, payment_status || null, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Send order to Steadfast Courier
app.post('/api/admin/orders/:id/send-courier', requireAdmin, async (req, res) => {
  try {
    const result = await sendOrderToCourier(req.params.id);
    res.json(result);
  } catch(e) {
    res.status(400).json({ error: e.message });
  }
});

// Check courier status manually
app.get('/api/admin/orders/:id/courier-status', requireAdmin, async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    if (orderResult.rows.length === 0 || !orderResult.rows[0].consignment_id) return res.status(400).json({ error: 'No courier data' });
    const order = orderResult.rows[0];
    const result = await steadfastRequest('GET', `/status_by_cid/${order.consignment_id}`);
    if (result.delivery_status) {
      await pool.query('UPDATE orders SET courier_status = $1, updated_at = NOW() WHERE id = $2', [result.delivery_status, order.id]);
    }
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Check Steadfast balance
app.get('/api/admin/courier/balance', requireAdmin, async (req, res) => {
  try {
    const result = await steadfastRequest('GET', '/get_balance');
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM order_items WHERE order_id = $1', [req.params.id]);
    await pool.query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== STEADFAST WEBHOOK =====
app.post('/api/webhook/steadfast', async (req, res) => {
  try {
    const payload = req.body;
    console.log('Steadfast Webhook:', JSON.stringify(payload));

    if (!payload.consignment_id && !payload.invoice) {
      return res.status(400).json({ status: 'error', message: 'Missing consignment_id or invoice' });
    }

    let order;
    if (payload.consignment_id) {
      const r = await pool.query('SELECT * FROM orders WHERE consignment_id = $1', [String(payload.consignment_id)]);
      order = r.rows[0];
    }
    if (!order && payload.invoice) {
      const r = await pool.query('SELECT * FROM orders WHERE order_number = $1', [payload.invoice]);
      order = r.rows[0];
    }

    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }

    if (payload.notification_type === 'delivery_status' && payload.status) {
      const statusLower = payload.status.toLowerCase();
      await handleCourierStatusUpdate(order, statusLower, payload.delivery_charge, payload.tracking_message);
    } else if (payload.notification_type === 'tracking_update') {
      await pool.query('UPDATE orders SET courier_message = $1, updated_at = NOW() WHERE id = $2', [payload.tracking_message || '', order.id]);
    }

    res.json({ status: 'success', message: 'Webhook received successfully.' });
  } catch(e) { console.error(e); res.status(500).json({ status: 'error', message: 'Server error' }); }
});

// ===== ADMIN PRODUCTS =====

app.get('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const { search, category, page = 1, limit = 25 } = req.query;
    let sql = 'SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (p.name ILIKE $${paramIndex} OR p.name_bn ILIKE $${paramIndex + 1} OR p.sku ILIKE $${paramIndex + 2})`;
      const s = `%${search}%`;
      params.push(s, s, s);
      paramIndex += 3;
    }
    if (category) { sql += ` AND p.category_id = $${paramIndex++}`; params.push(Number(category)); }

    const countSql = sql.replace('SELECT p.*, c.name as category_name', 'SELECT COUNT(*) as total');
    const total = parseInt((await pool.query(countSql, params)).rows[0].total);

    sql += ` ORDER BY p.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const result = await pool.query(sql, params);
    res.json({ products: result.rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/products', requireAdmin, async (req, res) => {
  try {
    const { name, name_bn, description, description_bn, price, sale_price, cost_price, sku, category_id, stock, low_stock_alert, image, tags, is_active, is_featured } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    const slug = (name_bn || name).toLowerCase().replace(/[^a-z0-9ঀ-৿]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

    const result = await pool.query(`INSERT INTO products (name, name_bn, slug, description, description_bn, price, sale_price, cost_price, sku, category_id, stock, low_stock_alert, image, tags, is_active, is_featured)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
      [name, name_bn || '', slug, description || '', description_bn || '', price, sale_price || null, cost_price || null, sku || null, category_id || null, stock || 0, low_stock_alert || 5, image || '', tags || '', is_active !== undefined ? is_active : 1, is_featured || 0]);

    res.json({ success: true, id: result.rows[0].id });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    const fields = req.body;
    const allowed = ['name', 'name_bn', 'description', 'description_bn', 'price', 'sale_price', 'cost_price', 'sku', 'category_id', 'stock', 'low_stock_alert', 'image', 'tags', 'is_active', 'is_featured'];
    const sets = [];
    const vals = [];
    let paramIndex = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) { sets.push(`${key} = $${paramIndex++}`); vals.push(fields[key]); }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = NOW()');
    vals.push(req.params.id);
    await pool.query(`UPDATE products SET ${sets.join(', ')} WHERE id = $${paramIndex}`, vals);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== PRODUCT VARIANTS =====

// Public: get variants for a product
app.get('/api/products/:id/variants', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_variants WHERE product_id = $1 AND is_active = 1 ORDER BY sort_order ASC', [req.params.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Admin: get all variants for a product
app.get('/api/admin/products/:id/variants', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_variants WHERE product_id = $1 ORDER BY sort_order ASC', [req.params.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Admin: add variant
app.post('/api/admin/products/:id/variants', requireAdmin, async (req, res) => {
  try {
    const { name, value, price_adjustment, stock, sku } = req.body;
    if (!name || !value) return res.status(400).json({ error: 'Name and value required' });
    const result = await pool.query(
      'INSERT INTO product_variants (product_id, name, value, price_adjustment, stock, sku) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [req.params.id, name, value, price_adjustment || 0, stock || 0, sku || null]
    );
    res.json({ success: true, variant: result.rows[0] });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Admin: update variant
app.put('/api/admin/variants/:id', requireAdmin, async (req, res) => {
  try {
    const { name, value, price_adjustment, stock, sku, is_active, sort_order } = req.body;
    await pool.query(
      'UPDATE product_variants SET name = COALESCE($1, name), value = COALESCE($2, value), price_adjustment = COALESCE($3, price_adjustment), stock = COALESCE($4, stock), sku = COALESCE($5, sku), is_active = COALESCE($6, is_active), sort_order = COALESCE($7, sort_order) WHERE id = $8',
      [name || null, value || null, price_adjustment !== undefined ? price_adjustment : null, stock !== undefined ? stock : null, sku || null, is_active !== undefined ? is_active : null, sort_order !== undefined ? sort_order : null, req.params.id]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Admin: delete variant
app.delete('/api/admin/variants/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM product_variants WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN CATEGORIES =====

app.get('/api/admin/categories', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM categories ORDER BY sort_order ASC');
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/categories', requireAdmin, async (req, res) => {
  try {
    const { name, name_bn, description, parent_id } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const result = await pool.query('INSERT INTO categories (name, name_bn, slug, description, parent_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, name_bn || '', slug, description || '', parent_id || null]);
    res.json({ success: true, id: result.rows[0].id });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, name_bn, description, is_active, sort_order } = req.body;
    await pool.query('UPDATE categories SET name = COALESCE($1, name), name_bn = COALESCE($2, name_bn), description = COALESCE($3, description), is_active = COALESCE($4, is_active), sort_order = COALESCE($5, sort_order) WHERE id = $6',
      [name || null, name_bn || null, description || null, is_active !== undefined ? is_active : null, sort_order !== undefined ? sort_order : null, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN CUSTOMERS =====

app.get('/api/admin/customers', requireAdmin, async (req, res) => {
  try {
    const { search, page = 1, limit = 25 } = req.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    if (search) {
      sql += ` AND (name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex + 1} OR address ILIKE $${paramIndex + 2})`;
      const s = `%${search}%`;
      params.push(s, s, s);
      paramIndex += 3;
    }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = parseInt((await pool.query(countSql, params)).rows[0].total);
    sql += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(Number(limit), (Number(page) - 1) * Number(limit));
    const result = await pool.query(sql, params);
    res.json({ customers: result.rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/customers/:id', requireAdmin, async (req, res) => {
  try {
    const custResult = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (custResult.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const customer = custResult.rows[0];
    const orders = (await pool.query('SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC', [customer.id])).rows;
    res.json({ customer, orders });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/customers/:id', requireAdmin, async (req, res) => {
  try {
    const { notes, is_blocked } = req.body;
    await pool.query('UPDATE customers SET notes = COALESCE($1, notes), is_blocked = COALESCE($2, is_blocked), updated_at = NOW() WHERE id = $3',
      [notes !== undefined ? notes : null, is_blocked !== undefined ? is_blocked : null, req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN COUPONS =====

app.get('/api/admin/coupons', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/coupons', requireAdmin, async (req, res) => {
  try {
    const { code, type, value, min_order, max_uses, expires_at } = req.body;
    const result = await pool.query('INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [(code || '').toUpperCase(), type || 'fixed', value, min_order || 0, max_uses || null, expires_at || null]);
    res.json({ success: true, id: result.rows[0].id });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/coupons/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM coupons WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN EXPENSES =====

app.get('/api/admin/expenses', requireAdmin, async (req, res) => {
  try {
    const { month } = req.query;
    let sql = 'SELECT * FROM expenses';
    const params = [];
    if (month) { sql += ' WHERE date LIKE $1'; params.push(month + '%'); }
    sql += ' ORDER BY date DESC';
    const result = await pool.query(sql, params);

    let totalSql = 'SELECT COALESCE(SUM(amount),0) as total FROM expenses';
    if (month) totalSql += ' WHERE date LIKE $1';
    const totalResult = await pool.query(totalSql, month ? [month + '%'] : []);

    res.json({ expenses: result.rows, total: parseFloat(totalResult.rows[0].total) });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/expenses', requireAdmin, async (req, res) => {
  try {
    const { category, amount, description, date } = req.body;
    const result = await pool.query('INSERT INTO expenses (category, amount, description, date) VALUES ($1, $2, $3, $4) RETURNING id',
      [category, amount, description || '', date || new Date().toISOString().split('T')[0]]);
    res.json({ success: true, id: result.rows[0].id });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/expenses/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN SETTINGS =====

app.get('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    res.json(await getSettings());
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/settings', requireAdmin, async (req, res) => {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, String(value)]);
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN REPORTS =====

app.get('/api/admin/reports/sales', requireAdmin, async (req, res) => {
  try {
    const { from, to, group_by = 'day' } = req.query;
    let dateFormat = 'YYYY-MM-DD';
    if (group_by === 'month') dateFormat = 'YYYY-MM';
    if (group_by === 'year') dateFormat = 'YYYY';

    let sql = `SELECT TO_CHAR(created_at, '${dateFormat}') as period, COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue, COALESCE(SUM(CASE WHEN status='delivered' THEN total_amount ELSE 0 END),0) as delivered_revenue FROM orders WHERE status != 'cancelled'`;
    const params = [];
    let paramIndex = 1;
    if (from) { sql += ` AND DATE(created_at) >= $${paramIndex++}`; params.push(from); }
    if (to) { sql += ` AND DATE(created_at) <= $${paramIndex++}`; params.push(to); }
    sql += ` GROUP BY period ORDER BY period DESC`;

    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/reports/products', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT oi.product_name, SUM(oi.quantity) as total_sold, SUM(oi.total) as total_revenue FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE o.status != 'cancelled' GROUP BY oi.product_name ORDER BY total_sold DESC LIMIT 20`);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== FILE UPLOAD =====

app.post('/api/admin/upload', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ===== FRAUD PROTECTION ADMIN API =====

app.get('/api/admin/fraud/dashboard', requireAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const today = new Date().toISOString().split('T')[0];
    const dateFrom = from || today;
    const dateTo = to || today;

    const total = parseInt((await pool.query('SELECT COUNT(*) as c FROM block_attempts WHERE DATE(created_at) BETWEEN $1 AND $2', [dateFrom, dateTo])).rows[0].c);
    const byReason = (await pool.query('SELECT reason, COUNT(*) as c FROM block_attempts WHERE DATE(created_at) BETWEEN $1 AND $2 GROUP BY reason', [dateFrom, dateTo])).rows;
    const recent = (await pool.query('SELECT * FROM block_attempts WHERE DATE(created_at) BETWEEN $1 AND $2 ORDER BY created_at DESC LIMIT 20', [dateFrom, dateTo])).rows;
    const daily = (await pool.query("SELECT DATE(created_at)::text as day, COUNT(*) as c FROM block_attempts WHERE DATE(created_at) >= CURRENT_DATE - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY DATE(created_at)")).rows;
    const topIPs = (await pool.query("SELECT ip, COUNT(*) as c FROM block_attempts WHERE DATE(created_at) BETWEEN $1 AND $2 AND ip != '' GROUP BY ip ORDER BY c DESC LIMIT 5", [dateFrom, dateTo])).rows;
    const topPhones = (await pool.query("SELECT phone, COUNT(*) as c FROM block_attempts WHERE DATE(created_at) BETWEEN $1 AND $2 AND phone != '' GROUP BY phone ORDER BY c DESC LIMIT 5", [dateFrom, dateTo])).rows;
    const totalBlocked = parseInt((await pool.query('SELECT COUNT(*) as c FROM blocked_entries')).rows[0].c);

    res.json({ total, byReason, recent, daily, topIPs, topPhones, totalBlocked });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

// Blocked entries CRUD
app.get('/api/admin/fraud/blocked', requireAdmin, async (req, res) => {
  try {
    const { page = 1, type } = req.query;
    let sql = 'SELECT * FROM blocked_entries WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    if (type) { sql += ` AND type = $${paramIndex++}`; params.push(type); }
    sql += ` ORDER BY created_at DESC LIMIT 25 OFFSET $${paramIndex++}`;
    params.push((Number(page) - 1) * 25);
    const result = await pool.query(sql, params);
    const total = parseInt((await pool.query('SELECT COUNT(*) as c FROM blocked_entries')).rows[0].c);
    res.json({ entries: result.rows, total, page: Number(page), pages: Math.ceil(total / 25) });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/fraud/blocked', requireAdmin, async (req, res) => {
  try {
    const { type, value, reason, duration_hours } = req.body;
    if (!type || !value) return res.status(400).json({ error: 'Type and value required' });
    const expires = duration_hours ? new Date(Date.now() + Number(duration_hours) * 3600000).toISOString() : null;
    const existing = await pool.query('SELECT id FROM blocked_entries WHERE type = $1 AND value = $2', [type, value]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Already blocked' });
    await pool.query('INSERT INTO blocked_entries (type, value, reason, duration_hours, expires_at) VALUES ($1, $2, $3, $4, $5)', [type, value, reason || '', duration_hours || null, expires]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/fraud/blocked/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM blocked_entries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Block attempts log
app.get('/api/admin/fraud/attempts', requireAdmin, async (req, res) => {
  try {
    const { page = 1, reason } = req.query;
    let sql = 'SELECT * FROM block_attempts WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    if (reason) { sql += ` AND reason = $${paramIndex++}`; params.push(reason); }
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as c');
    const total = parseInt((await pool.query(countSql, params)).rows[0].c);
    sql += ` ORDER BY created_at DESC LIMIT 25 OFFSET $${paramIndex++}`;
    params.push((Number(page) - 1) * 25);
    const result = await pool.query(sql, params);
    res.json({ attempts: result.rows, total, page: Number(page), pages: Math.ceil(total / 25) });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/fraud/attempts/clear', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM block_attempts');
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Quick block from order
app.post('/api/admin/fraud/block-from-order/:orderId', requireAdmin, async (req, res) => {
  try {
    const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.orderId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const order = orderResult.rows[0];
    const { block_phone, block_ip, reason, duration_hours } = req.body;
    const expires = duration_hours ? new Date(Date.now() + Number(duration_hours) * 3600000).toISOString() : null;
    let blocked = 0;
    if (block_phone && order.phone) {
      const exists = await pool.query('SELECT id FROM blocked_entries WHERE type = $1 AND value = $2', ['phone', order.phone]);
      if (exists.rows.length === 0) {
        await pool.query('INSERT INTO blocked_entries (type, value, reason, duration_hours, expires_at) VALUES ($1, $2, $3, $4, $5)', ['phone', order.phone, reason || 'Blocked from order', duration_hours || null, expires]);
        blocked++;
      }
    }
    if (block_ip && order.ip_address) {
      const exists = await pool.query('SELECT id FROM blocked_entries WHERE type = $1 AND value = $2', ['ip', order.ip_address]);
      if (exists.rows.length === 0) {
        await pool.query('INSERT INTO blocked_entries (type, value, reason, duration_hours, expires_at) VALUES ($1, $2, $3, $4, $5)', ['ip', order.ip_address, reason || 'Blocked from order', duration_hours || null, expires]);
        blocked++;
      }
    }
    res.json({ success: true, blocked });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// OTP endpoints (public)
app.post('/api/otp/send', async (req, res) => {
  try {
    const settings = await getSettings();
    if (settings.otp_enabled !== '1') return res.status(400).json({ error: 'OTP not enabled' });

    const { phone } = req.body;
    const phoneClean = (phone || '').replace(/[^0-9]/g, '');
    if (!phoneClean) return res.status(400).json({ error: 'Phone required' });

    const maxPerHour = Number(settings.otp_rate_limit_per_hour) || 5;
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const recentOTPs = parseInt((await pool.query('SELECT COUNT(*) as c FROM otp_sessions WHERE phone = $1 AND created_at > $2', [phoneClean, hourAgo])).rows[0].c);
    if (recentOTPs >= maxPerHour) return res.status(429).json({ error: 'Too many OTP requests. Try later.' });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiryMin = Number(settings.otp_expiry_minutes) || 5;
    const expiresAt = new Date(Date.now() + expiryMin * 60000).toISOString();
    const maxAttempts = Number(settings.otp_max_attempts) || 5;

    await pool.query('INSERT INTO otp_sessions (phone, code, max_attempts, expires_at) VALUES ($1, $2, $3, $4)', [phoneClean, code, maxAttempts, expiresAt]);

    console.log(`OTP for ${phoneClean}: ${code}`);

    res.json({ success: true, message: 'OTP sent', expires_in: expiryMin * 60 });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/otp/verify', async (req, res) => {
  try {
    const { phone, code } = req.body;
    const phoneClean = (phone || '').replace(/[^0-9]/g, '');

    const sessionResult = await pool.query('SELECT * FROM otp_sessions WHERE phone = $1 AND verified = 0 ORDER BY created_at DESC LIMIT 1', [phoneClean]);
    if (sessionResult.rows.length === 0) return res.status(400).json({ error: 'No OTP session found' });
    const otpSession = sessionResult.rows[0];
    if (new Date(otpSession.expires_at) < new Date()) return res.status(400).json({ error: 'OTP expired' });
    if (otpSession.attempts >= otpSession.max_attempts) return res.status(400).json({ error: 'Max attempts exceeded' });

    await pool.query('UPDATE otp_sessions SET attempts = attempts + 1 WHERE id = $1', [otpSession.id]);

    if (otpSession.code !== code) return res.status(400).json({ error: 'Invalid OTP' });

    await pool.query('UPDATE otp_sessions SET verified = 1 WHERE id = $1', [otpSession.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN PASSWORD =====

app.put('/api/admin/password', requireAdmin, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const userResult = await pool.query('SELECT * FROM admin_users WHERE id = $1', [req.session.admin.id]);
    const user = userResult.rows[0];
    if (!bcrypt.compareSync(current_password, user.password)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const hashed = bcrypt.hashSync(new_password, 10);
    await pool.query('UPDATE admin_users SET password = $1 WHERE id = $2', [hashed, user.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== LANDING PAGES — PUBLIC =====

app.get('/p/:slug', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM landing_pages WHERE slug = $1 AND status = 'published' AND deleted_at IS NULL", [req.params.slug]);
    if (result.rows.length === 0) return res.status(404).send('Page not found');
    const page = result.rows[0];

    // Increment views
    await pool.query('UPDATE landing_pages SET views = views + 1 WHERE id = $1', [page.id]);

    // Get settings for pixel
    const settings = await getSettings();

    // Read the template
    const templatePath = path.join(__dirname, 'public', 'page-template.html');
    let template = fs.readFileSync(templatePath, 'utf8');

    // Inject page data
    template = template.replace('{{PAGE_DATA}}', JSON.stringify(page));
    template = template.replace('{{SETTINGS_DATA}}', JSON.stringify({
      shop_name: settings.shop_name_en || settings.shop_name,
      shop_phone: settings.shop_phone,
      whatsapp_number: settings.whatsapp_number,
      messenger_link: settings.messenger_link,
      facebook_pixel_id: settings.facebook_pixel_id || '',
      currency: settings.currency || 'TK',
      shipping_inside_dhaka: settings.shipping_inside_dhaka,
      shipping_outside_dhaka: settings.shipping_outside_dhaka,
    }));

    res.send(template);
  } catch(e) { console.error(e); res.status(500).send('Server error'); }
});

// ===== LANDING PAGES — ADMIN API =====

app.get('/api/admin/pages', requireAdmin, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    let sql = 'SELECT id, title, slug, status, views, created_at, updated_at, published_at, deleted_at FROM landing_pages WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      if (status === 'trash') {
        sql += ' AND deleted_at IS NOT NULL';
      } else {
        sql += ` AND status = $${paramIndex++} AND deleted_at IS NULL`;
        params.push(status);
      }
    } else {
      sql += ' AND deleted_at IS NULL';
    }

    if (search) {
      sql += ` AND (title ILIKE $${paramIndex} OR slug ILIKE $${paramIndex + 1})`;
      const s = `%${search}%`;
      params.push(s, s);
      paramIndex += 2;
    }

    const countSql = sql.replace(/SELECT .+ FROM/, 'SELECT COUNT(*) as total FROM');
    const total = parseInt((await pool.query(countSql, params)).rows[0].total);

    sql += ` ORDER BY updated_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    const offset = (Number(page) - 1) * Number(limit);
    params.push(Number(limit), offset);

    const result = await pool.query(sql, params);
    res.json({ pages: result.rows, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/pages', requireAdmin, async (req, res) => {
  try {
    const { title, slug, status, content, seo_title, seo_description, custom_css } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const pageSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36).slice(-4);

    // Check slug uniqueness
    const existing = await pool.query('SELECT id FROM landing_pages WHERE slug = $1', [pageSlug]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'A page with this slug already exists' });

    const publishedAt = status === 'published' ? new Date().toISOString() : null;

    const result = await pool.query(
      `INSERT INTO landing_pages (title, slug, status, content, seo_title, seo_description, custom_css, published_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [title, pageSlug, status || 'draft', JSON.stringify(content || { blocks: [] }), seo_title || '', seo_description || '', custom_css || '', publishedAt]
    );

    // Save initial revision
    await pool.query('INSERT INTO page_revisions (page_id, content) VALUES ($1, $2)',
      [result.rows[0].id, JSON.stringify(content || { blocks: [] })]);

    res.json({ success: true, page: result.rows[0] });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/pages/:id', requireAdmin, async (req, res) => {
  try {
    const pageResult = await pool.query('SELECT * FROM landing_pages WHERE id = $1', [req.params.id]);
    if (pageResult.rows.length === 0) return res.status(404).json({ error: 'Page not found' });

    const revisions = (await pool.query('SELECT id, created_at FROM page_revisions WHERE page_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.id])).rows;

    res.json({ page: pageResult.rows[0], revisions });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/pages/:id', requireAdmin, async (req, res) => {
  try {
    const { title, slug, content, seo_title, seo_description, custom_css } = req.body;

    // Check slug uniqueness if changed
    if (slug) {
      const existing = await pool.query('SELECT id FROM landing_pages WHERE slug = $1 AND id != $2', [slug, req.params.id]);
      if (existing.rows.length > 0) return res.status(400).json({ error: 'A page with this slug already exists' });
    }

    const sets = [];
    const vals = [];
    let idx = 1;

    if (title !== undefined) { sets.push(`title = $${idx++}`); vals.push(title); }
    if (slug !== undefined) { sets.push(`slug = $${idx++}`); vals.push(slug); }
    if (content !== undefined) { sets.push(`content = $${idx++}`); vals.push(JSON.stringify(content)); }
    if (seo_title !== undefined) { sets.push(`seo_title = $${idx++}`); vals.push(seo_title); }
    if (seo_description !== undefined) { sets.push(`seo_description = $${idx++}`); vals.push(seo_description); }
    if (custom_css !== undefined) { sets.push(`custom_css = $${idx++}`); vals.push(custom_css); }
    sets.push('updated_at = NOW()');

    vals.push(req.params.id);
    await pool.query(`UPDATE landing_pages SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

    // Auto-save revision if content changed
    if (content !== undefined) {
      await pool.query('INSERT INTO page_revisions (page_id, content) VALUES ($1, $2)', [req.params.id, JSON.stringify(content)]);

      // Keep only last N revisions
      const settings = await getSettings();
      const maxRevisions = Number(settings.landing_page_max_revisions) || 20;
      await pool.query(`DELETE FROM page_revisions WHERE page_id = $1 AND id NOT IN (SELECT id FROM page_revisions WHERE page_id = $1 ORDER BY created_at DESC LIMIT $2)`, [req.params.id, maxRevisions]);
    }

    const updated = await pool.query('SELECT * FROM landing_pages WHERE id = $1', [req.params.id]);
    res.json({ success: true, page: updated.rows[0] });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/admin/pages/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['draft', 'published', 'trash'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let idx = 2;

    if (status === 'published') {
      updates.push(`published_at = NOW()`);
      updates.push(`deleted_at = NULL`);
    }
    if (status === 'trash') {
      updates.push(`deleted_at = NOW()`);
    }
    if (status === 'draft') {
      updates.push(`deleted_at = NULL`);
    }

    params.push(req.params.id);
    await pool.query(`UPDATE landing_pages SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/pages/:id/duplicate', requireAdmin, async (req, res) => {
  try {
    const original = await pool.query('SELECT * FROM landing_pages WHERE id = $1', [req.params.id]);
    if (original.rows.length === 0) return res.status(404).json({ error: 'Page not found' });
    const p = original.rows[0];

    const newSlug = p.slug + '-copy-' + Date.now().toString(36).slice(-4);
    const result = await pool.query(
      `INSERT INTO landing_pages (title, slug, status, content, seo_title, seo_description, custom_css)
       VALUES ($1, $2, 'draft', $3, $4, $5, $6) RETURNING *`,
      [p.title + ' (Copy)', newSlug, JSON.stringify(p.content), p.seo_title || '', p.seo_description || '', p.custom_css || '']
    );

    res.json({ success: true, page: result.rows[0] });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/admin/pages/:id', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM page_revisions WHERE page_id = $1', [req.params.id]);
    await pool.query('DELETE FROM landing_pages WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/admin/pages/:id/revisions', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM page_revisions WHERE page_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/pages/:id/revisions/:revId/restore', requireAdmin, async (req, res) => {
  try {
    const rev = await pool.query('SELECT * FROM page_revisions WHERE id = $1 AND page_id = $2', [req.params.revId, req.params.id]);
    if (rev.rows.length === 0) return res.status(404).json({ error: 'Revision not found' });

    await pool.query('UPDATE landing_pages SET content = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(rev.rows[0].content), req.params.id]);

    // Save as new revision
    await pool.query('INSERT INTO page_revisions (page_id, content) VALUES ($1, $2)', [req.params.id, JSON.stringify(rev.rows[0].content)]);

    const updated = await pool.query('SELECT * FROM landing_pages WHERE id = $1', [req.params.id]);
    res.json({ success: true, page: updated.rows[0] });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== ADMIN PRODUCTS LIST FOR PAGE BUILDER =====
app.get('/api/admin/products/list', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`SELECT p.id, p.name, p.name_bn, p.price, p.sale_price, p.image,
      (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.is_active = 1) as variant_count
      FROM products p WHERE p.is_active = 1 ORDER BY p.name ASC`);
    res.json(result.rows);
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// Public: product with variants for landing page
app.get('/api/products/:id/full', async (req, res) => {
  try {
    const product = await pool.query('SELECT * FROM products WHERE id = $1 AND is_active = 1', [req.params.id]);
    if (product.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const variants = await pool.query('SELECT * FROM product_variants WHERE product_id = $1 AND is_active = 1 ORDER BY sort_order ASC', [req.params.id]);
    res.json({ ...product.rows[0], variants: variants.rows });
  } catch(e) { res.status(500).json({ error: 'Server error' }); }
});

// ===== SPA FALLBACKS =====

app.get('/admin/*', (req, res, next) => {
  if (req.path.match(/\.(html|css|js|png|jpg|ico)$/)) return next();
  res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Rahnuma Shop server is running!`);
  console.log(`  Shop:    http://localhost:${PORT}`);
  console.log(`  Admin:   http://localhost:${PORT}/admin/`);
  console.log(`  Login:   admin / admin123\n`);
});
