# Aura Fest Events - website

A premium event-decoration and planning website inspired by modern design trends.

## Tech Stack
- **Backend:** Node.js, Express
- **Database:** MongoDB (via native `mongodb` driver)
- **Frontend:** HTML/CSS/JS with Nunjucks templating
- **Authentication:** bcrypt & express-session

## Features
- Home, Services, Gallery, Contact pages
- Booking & Enquiry forms natively integrating with MongoDB
- User Authentication (Login / Signup)
- Call-agent & Chat functionality widget built-in
- Admin Dashboard to view all enquiries and bookings
- Responsive, dark-themed UI with fluid animations

## Local Setup
1. **Install Node.js** (v18+)
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Environment Setup:** Create a `.env` file in the root based on your needs.
   ```env
   PORT=5000
   MONGO_URI=mongodb://localhost:27017/auraFest
   SECRET_KEY=your_secret_key
   ADMIN_TOKEN=your_admin_token
   ```
   *(For production, use your MongoDB Atlas connection string).*
4. **Run the Server:**
   ```bash
   npm start
   ```
   or for development:
   ```bash
   npm run dev
   ```
5. **Access Application:** Open `http://localhost:5000` in your browser.

## Admin Access
Go to `/admin-login` and input your `ADMIN_TOKEN` to view leads and bookings.

---
Made for: **Aura Fest Events** 
