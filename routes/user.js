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

// Profile page
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user details
    const user = await get('SELECT id, name, email, role FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return res.status(404).render('error', { 
        title: 'Not Found',
        message: 'User not found' 
      });
    }
    
    res.render('user/profile', {
      title: 'My Profile',
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { 
      title: 'Server Error',
      message: 'Failed to load profile. Please try again later.' 
    });
  }
});

// Update profile
router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { name, email, currentPassword, newPassword, confirmPassword } = req.body;
    
    // Get current user
    const user = await get('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if email is already taken by another user
    if (email !== user.email) {
      const existingUser = await get('SELECT * FROM users WHERE email = ? AND id != ?', [email, userId]);
      
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Email already in use' });
      }
    }
    
    // Update name and email
    await run('UPDATE users SET name = ?, email = ? WHERE id = ?', [name, email, userId]);
    
    // Update session
    req.session.user = {
      ...req.session.user,
      name,
      email
    };
    
    // Check if password change is requested
    if (newPassword) {
      // Validate current password
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      
      if (!isMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
      
      // Validate new password
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'New passwords do not match' });
      }
      
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      await run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
    }
    
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// Become organizer
router.post('/become-organizer', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Check if user is already an organizer
    if (req.session.user.role === 'organizer') {
      return res.status(400).json({ success: false, message: 'You are already an organizer' });
    }
    
    // Update user role
    await run('UPDATE users SET role = ? WHERE id = ?', ['organizer', userId]);
    
    // Update session
    req.session.user = {
      ...req.session.user,
      role: 'organizer'
    };
    
    res.json({ success: true, message: 'You are now an organizer' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to become an organizer' });
  }
});

module.exports = router;