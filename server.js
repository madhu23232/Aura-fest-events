const path = require('path');
const fs = require('fs');
const express = require('express');
const nunjucks = require('nunjucks');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

function loadEnvFiles() {
	const envFiles = [
		{ file: '.env', override: false },
		{ file: 'madhu.env', override: false }
	];

	for (const envFile of envFiles) {
		const envPath = path.join(__dirname, envFile.file);
		if (fs.existsSync(envPath)) {
			dotenv.config({ path: envPath, override: envFile.override });
		}
	}
}

loadEnvFiles();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auraFest';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || '';
const SECRET_KEY = process.env.SECRET_KEY || 'dev-secret';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DB_TIMEOUT_MS = parseInt(process.env.DB_TIMEOUT_MS || '5000', 10);
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const BOOKING_FROM_EMAIL = process.env.BOOKING_FROM_EMAIL || SMTP_USER || 'aurafestevents@gmail.com';
const SMTP_CONNECTION_TIMEOUT_MS = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS || '10000', 10);

// Trust proxy for session cookies to work behind reverse proxies (Render, Heroku, etc.)
app.set('trust proxy', 1);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static
app.use('/static', express.static(path.join(__dirname, 'static')));

// Views (Nunjucks, Jinja-like)
const env = nunjucks.configure(path.join(__dirname, 'templates'), {
	autoescape: true,
	express: app,
	watch: false
});
app.set('views', path.join(__dirname, 'templates'));
app.set('view engine', 'njk');
const routeMap = {
	index: '/',
	services: '/services',
	gallery: '/gallery',
	contact: '/contact',
	login: '/login',
	signup: '/signup',
	logout: '/logout',
	admin_login: '/admin-login',
	user_dashboard: '/dashboard',
	admin_dashboard: '/admin',
	birthday: '/birthday',
	wedding: '/wedding',
	babyshower: '/babyshower',
	corporate: '/corporate'
};

env.addGlobal('year', new Date().getFullYear());
env.addGlobal('url_for', (name, params) => {
	if (name === 'static' && params && params.filename) {
		return `/static/${params.filename}`;
	}
	return routeMap[name] || '/';
});
env.addGlobal('csrf_token', () => '');
let db; let client;
let mailTransporter = null;

function getMongoHost(uri) {
	try {
		return new URL(uri).host || 'unknown-host';
	} catch (_) {
		return 'unknown-host';
	}
}

function getMongoDbName(uri) {
	if (MONGO_DB_NAME) return MONGO_DB_NAME;
	try {
		const parsed = new URL(uri);
		const dbName = parsed.pathname.replace(/^\//, '');
		return dbName || 'auraFest';
	} catch (_) {
		return 'auraFest';
	}
}

function formatDbConnectionError(err) {
	const message = err && err.message ? err.message : String(err);
	if (/querySrv ENOTFOUND/i.test(message)) {
		return `DNS lookup failed for MongoDB host "${getMongoHost(MONGO_URI)}". Check whether the Atlas cluster hostname in MONGO_URI is correct, the cluster is still active, and your internet/DNS can reach MongoDB Atlas.`;
	}
	if (/Authentication failed/i.test(message)) {
		return 'MongoDB authentication failed. Recheck the username/password in MONGO_URI and URL-encode special characters in the password.';
	}
	if (/ECONNREFUSED/i.test(message)) {
		return 'MongoDB refused the connection. If you are using local MongoDB, make sure the MongoDB service is running. If you are using Atlas, verify the host and port in MONGO_URI.';
	}
	return message;
}

function createMailTransporter() {
	const missingSettings = [];
	if (!SMTP_HOST) missingSettings.push('SMTP_HOST');
	if (!SMTP_USER) missingSettings.push('SMTP_USER');
	if (!SMTP_PASS) missingSettings.push('SMTP_PASS');

	if (missingSettings.length > 0) {
		console.warn(`Booking confirmation emails are disabled because SMTP settings are incomplete. Missing: ${missingSettings.join(', ')}`);
		return null;
	}

	return nodemailer.createTransport({
		host: SMTP_HOST,
		port: SMTP_PORT,
		secure: SMTP_SECURE,
		requireTLS: !SMTP_SECURE,
		connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
		greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
		socketTimeout: SMTP_CONNECTION_TIMEOUT_MS,
		auth: {
			user: SMTP_USER,
			pass: SMTP_PASS
		}
	});
}

function formatSmtpError(err) {
	const message = err && err.message ? err.message : String(err);
	if (/Missing credentials for "PLAIN"/i.test(message) || /EAUTH/i.test(message)) {
		return 'SMTP authentication failed. For Gmail, set SMTP_PASS to a Google App Password for the sending account.';
	}
	if (/Invalid login/i.test(message)) {
		return 'SMTP login was rejected. Double-check SMTP_USER and use a valid Google App Password in SMTP_PASS.';
	}
	if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(message)) {
		return `SMTP server connection failed for ${SMTP_HOST}:${SMTP_PORT}. Check the host, port, firewall, and internet connection.`;
	}
	return message;
}

async function initializeMailTransporter() {
	const transporter = createMailTransporter();
	if (!transporter) {
		return null;
	}

	try {
		await transporter.verify();
		console.log(`SMTP ready for booking emails via ${SMTP_HOST}:${SMTP_PORT} as ${SMTP_USER}`);
		return transporter;
	} catch (err) {
		console.error('SMTP verification failed:', formatSmtpError(err));
		return null;
	}
}

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

async function sendBookingConfirmationEmail(booking) {
	if (!mailTransporter || !booking.email) {
		return 'skipped';
	}

	const safeName = escapeHtml(booking.name);
	const safeEventType = escapeHtml(booking.event_type);
	const safeDate = escapeHtml(booking.date);
	const safeLocation = escapeHtml(booking.location);
	const safeBudget = escapeHtml(booking.budget || 'To be discussed');
	const safeNotes = escapeHtml(booking.notes || 'No additional notes shared yet.');

	await mailTransporter.sendMail({
		from: `"Aura Fest Events" <${BOOKING_FROM_EMAIL}>`,
		to: booking.email,
		replyTo: BOOKING_FROM_EMAIL,
		subject: `Booking received for your ${booking.event_type} event`,
		text: [
			`Hi ${booking.name},`,
			'',
			'Thank you for booking with Aura Fest Events.',
			'We have received your request and our team will contact you shortly.',
			'',
			'Booking details:',
			`Event type: ${booking.event_type}`,
			`Event date: ${booking.date}`,
			`Location: ${booking.location}`,
			`Budget: ${booking.budget || 'To be discussed'}`,
			`Notes: ${booking.notes || 'No additional notes shared yet.'}`,
			'',
			'Regards,',
			'Aura Fest Events'
		].join('\n'),
		html: `
			<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;">
				<p>Hi ${safeName},</p>
				<p>Thank you for booking with <strong>Aura Fest Events</strong>.</p>
				<p>We have received your request and our team will contact you shortly.</p>
				<p><strong>Booking details</strong></p>
				<ul>
					<li><strong>Event type:</strong> ${safeEventType}</li>
					<li><strong>Event date:</strong> ${safeDate}</li>
					<li><strong>Location:</strong> ${safeLocation}</li>
					<li><strong>Budget:</strong> ${safeBudget}</li>
					<li><strong>Notes:</strong> ${safeNotes}</li>
				</ul>
				<p>Regards,<br>Aura Fest Events</p>
			</div>
		`
	});

	return 'sent';
}

async function connectDb() {
	client = new MongoClient(MONGO_URI, {
		serverSelectionTimeoutMS: DB_TIMEOUT_MS
	});
	await client.connect();
	const dbName = getMongoDbName(MONGO_URI);
	db = client.db(dbName);
	await db.command({ ping: 1 });
	console.log(`Connected to MongoDB "${dbName}" on ${getMongoHost(MONGO_URI)}`);
}

// Auth helpers
function requireLogin(req, res, next) {
	if (req.session && req.session.user) return next();
	return res.redirect('/login');
}

function isAdmin(req) {
	const user = req.session && req.session.user;
	return user && (user.isAdmin === true || user.role === 'admin');
}

// Register routes - called after session middleware is set up
function registerRoutes() {
	// Routes
	app.get('/', (req, res) => {
		res.render('index.html');
	});

	app.get('/services', (req, res) => {
		res.render('services.html');
	});

	app.get('/gallery', (req, res) => {
		const fs = require('fs');
		const imgDir = path.join(__dirname, 'static', 'images');
		let images = [];
		if (fs.existsSync(imgDir)) {
			images = fs.readdirSync(imgDir)
				.filter(n => /\.(jpg|png|jpeg|webp|svg)$/i.test(n))
				.sort()
				.map(n => `/static/images/${n}`);
		}
		res.render('gallery.html', { images });
	});

	app.get('/contact', (req, res) => {
		res.render('contact.html');
	});

	// Event pages
	app.get('/birthday', (req, res) => {
		res.render('birthday.html', { title: 'Birthday Decorations — Aura Fest Events' });
	});

	app.get('/wedding', (req, res) => {
		res.render('wedding.html', { title: 'Wedding Decorations — Aura Fest Events' });
	});

	app.get('/babyshower', (req, res) => {
		res.render('babyshower.html', { title: 'Baby Shower Decorations — Aura Fest Events' });
	});

	app.get('/corporate', (req, res) => {
		// Match existing template filename
		res.render('corporate.html', { title: 'Corporate Events — Aura Fest Events' });
	});

	// API
	app.post('/api/enquiry', async (req, res) => {
		const { name, email, phone, message } = req.body || {};
		if (!name || !phone) return res.status(400).json({ ok: false, error: 'Missing name or phone' });
		if (!db) return res.status(500).json({ ok: false, error: 'Database not connected' });
		await db.collection('enquiries').insertOne({ name, email, phone, message, created_at: new Date() });
		res.json({ ok: true });
	});

	app.post('/api/book', async (req, res) => {
		const { name, email, phone, event_type, date, location, budget, notes } = req.body || {};
		const required = [name, email, phone, event_type, date, location];
		if (!required.every(Boolean)) {
			return res.status(400).send('Missing required fields. Please go back and try again.');
		}
		if (!db) return res.status(500).send('Database not connected. Please try again later.');
		const booking = { name, email, phone, event_type, date, location, budget, notes, created_at: new Date() };
		await db.collection('bookings').insertOne(booking);

		let emailStatus = 'skipped';
		try {
			emailStatus = await sendBookingConfirmationEmail(booking);
		} catch (err) {
			emailStatus = 'failed';
			console.error('Booking confirmation email failed:', err);
		}

		res.redirect(`/booking_success?email=${encodeURIComponent(emailStatus)}`);
	});

	app.get('/booking_success', (req, res) => {
		res.render('booking_success.html', { emailStatus: req.query.email || 'skipped' });
	});

	// Signup/Login
	app.route('/signup')
		.get((req, res) => res.render('signup.html'))
		.post(async (req, res) => {
			if (!db) return res.render('signup.html', { error: 'Database not connected' });
			const email_phone = req.body.email || req.body.phone;
			const password = req.body.password;
			if (!email_phone || !password) return res.render('signup.html', { error: 'Missing email or password' });
			const existing = await db.collection('users').findOne({ email_phone });
			if (existing) return res.render('signup.html', { error: 'User already exists' });
			const hashed = await bcrypt.hash(password, 10);
			await db.collection('users').insertOne({ email_phone, password: hashed });
			return res.redirect('/login');
		});

	app.route('/login')
		.get((req, res) => res.render('login.html'))
		.post(async (req, res) => {
			if (!db) return res.render('login.html', { error: 'Database not connected' });
			const email_phone = req.body.email;
			const password = req.body.password;
			const user = await db.collection('users').findOne({ email_phone });
			if (user && await bcrypt.compare(password, user.password)) {
				req.session.user = { id: user._id.toString(), email_phone };
				req.session.save((err) => {
					if (err) {
						console.error('Session save error:', err);
						return res.status(500).render('error.html', { code: 500, message: 'Session error' });
					}
					return res.redirect('/dashboard');
				});
			} else {
				return res.render('login.html', { error: 'Invalid credentials' });
			}
		});

	app.get('/dashboard', requireLogin, async (req, res) => {
		if (isAdmin(req)) return res.redirect('/admin');
		const emailPhone = req.session.user.email_phone || req.session.user.email || '';
		const bookings = db ? await db.collection('bookings').find({
			$or: [{ email: emailPhone }, { phone: emailPhone }]
		}).toArray() : [];
		res.render('dashboard.html', { bookings });
	});

	app.get('/logout', requireLogin, (req, res) => {
		req.session.destroy(() => res.redirect('/login'));
	});

	// Admin
	app.route('/admin-login')
		.get((req, res) => res.render('admin_login.html'))
		.post((req, res) => {
			const token = req.body.token;
			if (token && token === ADMIN_TOKEN) {
				req.session.user = { isAdmin: true, role: 'admin' };
				req.session.save((err) => {
					if (err) {
						console.error('Session save error:', err);
						return res.status(500).render('error.html', { code: 500, message: 'Session error' });
					}
					return res.redirect('/admin');
				});
			} else {
				return res.status(401).render('admin_login.html', { error: 'Invalid admin token' });
			}
		});

	app.get('/admin', requireLogin, async (req, res) => {
		if (!isAdmin(req)) return res.status(403).render('error.html', { code: 403, message: 'Forbidden' });
		if (!db) {
			return res.status(503).render('admin.html', {
				enquiries: [],
				bookings: [],
				dbConnected: false,
				dbError: 'Database is not connected. Admin login works, but bookings and enquiries cannot be loaded until MONGO_URI is fixed.'
			});
		}
		const enquiries = await db.collection('enquiries').find().sort({ created_at: -1 }).toArray();
		const bookings = await db.collection('bookings').find().sort({ created_at: -1 }).toArray();
		res.render('admin.html', { enquiries, bookings, dbConnected: true });
	});

	app.get('/api/admin/data', requireLogin, async (req, res) => {
		if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Forbidden' });
		if (!db) {
			return res.status(503).json({
				ok: false,
				error: 'Database not connected',
				enquiries: [],
				bookings: []
			});
		}
		const enquiries = await db.collection('enquiries').find().sort({ created_at: -1 }).toArray();
		const bookings = await db.collection('bookings').find().sort({ created_at: -1 }).toArray();
		return res.json({ ok: true, enquiries, bookings, dbConnected: true });
	});

	// Errors
	app.use((req, res) => {
		res.status(404).render('error.html', { code: 404, message: 'Page not found' });
	});
}

// Start
(async () => {
	try {
		// Session store configuration (must be async for MongoStore)
		let sessionStore;
		try {
			if (process.env.NODE_ENV === 'production') {
				sessionStore = await MongoStore.create({ mongoUrl: MONGO_URI });
			} else {
				sessionStore = new session.MemoryStore();
			}
		} catch (storeErr) {
			console.warn('MongoStore setup failed, falling back to MemoryStore:', storeErr.message);
			sessionStore = new session.MemoryStore();
		}

		app.use(session({
			store: sessionStore,
			secret: SECRET_KEY,
			resave: false,
			saveUninitialized: false,
			cookie: { 
				secure: false, // Let sameSite handle security; secure is set per-request
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 1000 * 60 * 60 * 24 // 24 hours
			}
		}));

		// Register all routes after session middleware
		registerRoutes();

		// Try to connect to database (non-blocking)
		try {
			await connectDb();
		} catch (dbErr) {
			console.error('Database connection failed:', formatDbConnectionError(dbErr));
		}

		mailTransporter = await initializeMailTransporter();
		app.listen(PORT, '0.0.0.0', () => {
			console.log(`Server listening on http://localhost:${PORT}`);
		});
	} catch (err) {
		console.error('Critical startup error:', err.message);
		process.exit(1);
	}
})();
