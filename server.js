// server.js — the main entry point for the PetPawHaven backend.
// This is what you run to start the whole site (frontend + backend together).

require('dotenv').config(); // loads variables from your .env file

const express = require('express');
const path = require('path');
const payfastRoutes = require('./payfast-backend');

const app = express();

// Serve everything in /public as static files (index.html, product.html,
// about.html, contact.html, order-success.html, order-cancelled.html,
// style.css, cart.js)
app.use(express.static(path.join(__dirname, 'public')));

// Parses incoming JSON request bodies (needed for /api/checkout)
app.use(express.json());

// All the PayFast/order routes live in payfast-backend.js — mounted here
app.use(payfastRoutes);

// Your domain's root ("/") currently has no file called index.html, so
// redirect it to index.html. Visiting petpawhaven.co.za/ will land on
// petpawhaven.co.za/index.html automatically.
app.get('/', (req, res) => {
  res.redirect('/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PetPawHaven running on http://localhost:${PORT}`);
});
