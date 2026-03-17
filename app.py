import os
from datetime import datetime
from flask import (
    Flask, render_template, request, redirect, url_for,
    jsonify, flash, abort
)
from flask_sqlalchemy import SQLAlchemy
from flask_login import (
    LoginManager, UserMixin, login_user, login_required,
    logout_user, current_user
)
from flask_wtf import CSRFProtect
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
app.wsgi_app = ProxyFix(app.wsgi_app)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///aura.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Initialize extensions
db = SQLAlchemy(app)
csrf = CSRFProtect(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"


# ----------------- Database Models -----------------
class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email_phone = db.Column(db.String(255), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)


class Admin(UserMixin):
    def __init__(self, user_id="admin"):
        self.id = str(user_id)


class Enquiry(db.Model):
    __tablename__ = "enquiries"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255))
    phone = db.Column(db.String(20), nullable=False)
    message = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class Booking(db.Model):
    __tablename__ = "bookings"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255))
    phone = db.Column(db.String(20), nullable=False)
    event_type = db.Column(db.String(100), nullable=False)
    date = db.Column(db.String(100), nullable=False)
    location = db.Column(db.String(255), nullable=False)
    budget = db.Column(db.String(100))
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


@login_manager.user_loader
def load_user(user_id):
    if str(user_id) == "admin":
        return Admin()
    
    user = User.query.get(int(user_id))
    if user:
        return user
    return None


# ----------------- Context -----------------
@app.context_processor
def inject_now():
    return {"year": datetime.now().year}


# ----------------- Basic Routes -----------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/services")
def services():
    return render_template("services.html")


@app.route("/gallery")
def gallery():
    images = []
    img_dir = os.path.join(app.static_folder, "images")
    if os.path.isdir(img_dir):
        for name in sorted(os.listdir(img_dir)):
            if name.lower().endswith((".jpg", ".png", ".jpeg", ".webp", ".svg")):
                images.append(f"/static/images/{name}")
    return render_template("gallery.html", images=images)


@app.route("/contact")
def contact():
    return render_template("contact.html")


# ----------------- Event Pages -----------------
@app.route("/birthday")
def birthday():
    return render_template("birthday.html", title="Birthday Decorations — Aura Fest Events")


@app.route("/wedding")
def wedding():
    return render_template("wedding.html", title="Wedding Decorations — Aura Fest Events")


@app.route("/babyshower")
def babyshower():
    return render_template("babyshower.html", title="Baby Shower Decorations — Aura Fest Events")


@app.route("/corporate")
def corporate():
    return render_template("corporate.html", title="Corporate Events — Aura Fest Events")


# ----------------- API: Enquiry & Booking -----------------
@app.post("/api/enquiry")
def api_enquiry():
    data = request.get_json() or request.form
    name = data.get("name")
    phone = data.get("phone")
    if not name or not phone:
        return jsonify({"ok": False, "error": "Missing name or phone"}), 400

    enquiry = Enquiry(
        name=name,
        email=data.get("email"),
        phone=phone,
        message=data.get("message")
    )
    db.session.add(enquiry)
    db.session.commit()
    return jsonify({"ok": True})


@app.post("/api/book")
def api_book():
    data = request.get_json() or request.form
    required = ["name", "phone", "event_type", "date", "location"]
    if not all(data.get(x) for x in required):
        return jsonify({"ok": False, "error": "Missing required fields"}), 400

    booking = Booking(
        name=data.get("name"),
        email=data.get("email"),
        phone=data.get("phone"),
        event_type=data.get("event_type"),
        date=data.get("date"),
        location=data.get("location"),
        budget=data.get("budget"),
        notes=data.get("notes")
    )
    db.session.add(booking)
    db.session.commit()
    return jsonify({"ok": True})


@app.get("/thankyou")
def thankyou():
    return render_template("thankyou.html")


# ----------------- Signup / Login -----------------
@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        data = request.form
        email_phone = data.get("email") or data.get("phone")
        password = data.get("password")
        
        if User.query.filter_by(email_phone=email_phone).first():
            flash("User already exists!", "danger")
            return redirect(url_for("signup"))
        
        hashed_pw = generate_password_hash(password)
        user = User(email_phone=email_phone, password=hashed_pw)
        db.session.add(user)
        db.session.commit()
        flash("Signup successful! Please log in.", "success")
        return redirect(url_for("login"))
    return render_template("signup.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email_phone = request.form.get("email")
        password = request.form.get("password")
        user = User.query.filter_by(email_phone=email_phone).first()
        
        if user and check_password_hash(user.password, password):
            login_user(user)
            return redirect(url_for("user_dashboard"))
        flash("Invalid credentials", "danger")
    return render_template("login.html")


@app.route("/dashboard")
@login_required
def user_dashboard():
    if current_user.id == "admin":
        return redirect(url_for("admin_dashboard"))
    bookings = Booking.query.filter(
        (Booking.email == current_user.email_phone) | 
        (Booking.phone == current_user.email_phone)
    ).all()
    return render_template("dashboard.html", bookings=bookings)


@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("Logged out successfully.", "info")
    return redirect(url_for("login"))


# ----------------- Admin -----------------
@app.route("/admin-login", methods=["GET", "POST"])
def admin_login():
    if request.method == "POST":
        token = request.form.get("token")
        if token == os.getenv("ADMIN_TOKEN"):
            login_user(Admin())
            return redirect(url_for("admin_dashboard"))
        flash("Invalid admin token", "danger")
    return render_template("admin_login.html")


@app.route("/admin")
@login_required
def admin_dashboard():
    if current_user.id != "admin":
        abort(403)
    enquiries = Enquiry.query.order_by(Enquiry.created_at.desc()).all()
    bookings = Booking.query.order_by(Booking.created_at.desc()).all()
    return render_template("admin.html", enquiries=enquiries, bookings=bookings)


# ----------------- Error Handlers -----------------
@app.errorhandler(403)
def forbidden(e):
    return render_template("error.html", code=403, message="Forbidden"), 403


@app.errorhandler(404)
def not_found(e):
    return render_template("error.html", code=404, message="Page not found"), 404


if __name__ == "__main__":
    with app.app_context():
        db.create_all()
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=True)
