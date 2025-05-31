const express = require('express');
const bcrypt = require('bcryptjs');
const { get, run } = require('../database/db');
const router = express.Router();

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Middleware to check if user is not logged in
const isNotAuthenticated = (req, res, next) => {
  if (!req.session.user) {
    return next();
  }
  res.redirect('/events');
};

// Login page
router.get('/login', isNotAuthenticated, (req, res) => {
  res.render('auth/login', { title: 'Login', error: null });
});

// Login process
router.post('/login', isNotAuthenticated, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Get user from database
    const user = await get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (!user) {
      return res.render('auth/login', { 
        title: 'Login', 
        error: 'Invalid email or password' 
      });
    }
    
    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      return res.render('auth/login', { 
        title: 'Login', 
        error: 'Invalid email or password' 
      });
    }
    
    // Set session
    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    
    res.redirect('/events');
  } catch (error) {
    console.error(error);
    res.render('auth/login', { 
      title: 'Login', 
      error: 'An error occurred. Please try again.' 
    });
  }
});

// Register page
router.get('/register', isNotAuthenticated, (req, res) => {
  res.render('auth/register', { title: 'Register', error: null });
});

// Register process
router.post('/register', isNotAuthenticated, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;
    
    // Validate password match
    if (password !== confirmPassword) {
      return res.render('auth/register', { 
        title: 'Register', 
        error: 'Passwords do not match' 
      });
    }
    
    // Check if user already exists
    const existingUser = await get('SELECT * FROM users WHERE email = ?', [email]);
    
    if (existingUser) {
      return res.render('auth/register', { 
        title: 'Register', 
        error: 'Email already in use' 
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = await run(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, 'attendee']
    );
    
    // Set session
    req.session.user = {
      id: result.id,
      name,
      email,
      role: 'attendee'
    };
    
    res.redirect('/events');
  } catch (error) {
    console.error(error);
    res.render('auth/register', { 
      title: 'Register', 
      error: 'An error occurred. Please try again.' 
    });
  }
});

// Logout
router.get('/logout', isAuthenticated, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;