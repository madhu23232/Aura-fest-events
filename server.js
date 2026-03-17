const path = require('path');
const express = require('express');
const nunjucks = require('nunjucks');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/auraFest';
const SECRET_KEY = process.env.SECRET_KEY || 'dev-secret';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

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
	user_dashboard: '/dashboard',
	admin_dashboard: '/admin'
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
async function connectDb() {
	client = new MongoClient(MONGO_URI);
	await client.connect();
	db = client.db();
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

app.get('/corprate', (req, res) => {
	// Match existing template filename
	res.render('corprate.html', { title: 'Corporate Events — Aura Fest Events' });
});

// API
app.post('/api/enquiry', async (req, res) => {
	const { name, email, phone, message } = req.body || {};
	if (!name || !phone) return res.status(400).json({ ok: false, error: 'Missing name or phone' });
	await db.collection('enquiries').insertOne({ name, email, phone, message, created_at: new Date() });
	res.json({ ok: true });
});

app.post('/api/book', async (req, res) => {
	const { name, email, phone, event_type, date, location, budget, notes } = req.body || {};
	const required = [name, phone, event_type, date, location];
	if (!required.every(Boolean)) {
		return res.status(400).send('Missing required fields. Please go back and try again.');
	}
	await db.collection('bookings').insertOne({ name, email, phone, event_type, date, location, budget, notes, created_at: new Date() });
	res.redirect('/thankyou');
});

app.get('/thankyou', (req, res) => {
	res.render('thankyou.html');
});

// Signup/Login
app.route('/signup')
	.get((req, res) => res.render('signup.html'))
	.post(async (req, res) => {
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
	const bookings = await db.collection('bookings').find({
		$or: [{ email: emailPhone }, { phone: emailPhone }]
	}).toArray();
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
		return res.render('admin_login.html');
	});

app.get('/admin', requireLogin, async (req, res) => {
	if (!isAdmin(req)) return res.status(403).render('error.html', { code: 403, message: 'Forbidden' });
	const enquiries = await db.collection('enquiries').find().sort({ created_at: -1 }).toArray();
	const bookings = await db.collection('bookings').find().sort({ created_at: -1 }).toArray();
	res.render('admin.html', { enquiries, bookings });
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
		console.error('Database connection failed. Starting server without DB:', err && err.message ? err.message : err);
		app.listen(PORT, '0.0.0.0', () => {
			console.log(`Server listening (no DB) on http://localhost:${PORT}`);
		});
	}
})();
