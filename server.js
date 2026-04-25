const path = require('path');
const fs = require('fs');
const express = require('express');
const nunjucks = require('nunjucks');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');
const dotenv = require('dotenv');

function loadEnvFiles() {
	const envFiles = [
		{ file: '.env', override: false },
		{ file: 'madhu.env', override: true }
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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
	secret: SECRET_KEY,
	resave: false,
	saveUninitialized: false
}));

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
	return req.session && req.session.user && req.session.user.isAdmin === true;
}

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
	const required = [name, phone, event_type, date, location];
	if (!required.every(Boolean)) {
		return res.status(400).send('Missing required fields. Please go back and try again.');
	}
	if (!db) return res.status(500).send('Database not connected. Please try again later.');
	await db.collection('bookings').insertOne({ name, email, phone, event_type, date, location, budget, notes, created_at: new Date() });
	res.redirect('/booking_success');
});

app.get('/booking_success', (req, res) => {
	res.render('booking_success.html');
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
			return res.redirect('/dashboard');
		}
		return res.render('login.html', { error: 'Invalid credentials' });
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
			req.session.user = { isAdmin: true };
			return res.redirect('/admin');
		}
		return res.status(401).render('admin_login.html', { error: 'Invalid admin token' });
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

// Start
(async () => {
	try {
		await connectDb();
		app.listen(PORT, '0.0.0.0', () => {
			console.log(`Server listening on http://localhost:${PORT}`);
		});
	} catch (err) {
		console.error('Database connection failed. Starting server without DB:', formatDbConnectionError(err));
		app.listen(PORT, '0.0.0.0', () => {
			console.log(`Server listening (no DB) on http://localhost:${PORT}`);
		});
	}
})();
