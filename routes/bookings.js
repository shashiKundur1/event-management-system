const express = require('express');
const moment = require('moment');
const { all, get } = require('../database/db');
const router = express.Router();

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Helper function to get booking status
function getBookingStatus(event) {
  const now = moment();
  const startDateTime = moment(`${event.start_date} ${event.start_time}`);
  const endDateTime = moment(`${event.start_date} ${event.end_time}`);
  
  if (endDateTime.isBefore(now)) {
    return event.attended ? 'attended' : 'missed';
  }
  
  if (startDateTime.diff(now, 'hours') < 7 && startDateTime.isAfter(now)) {
    return 'starting-soon';
  }
  
  if (startDateTime.isBefore(now) && endDateTime.isAfter(now)) {
    return 'in-progress';
  }
  
  return 'upcoming';
}

// My bookings
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get user's bookings
    const bookings = await all(`
      SELECT b.*, e.title, e.description, e.image_url, e.start_date, e.start_time, e.end_time, e.location, e.category,
      u.name as organizer_name,
      (SELECT AVG(rating) FROM reviews WHERE event_id = e.id) as avg_rating,
      (SELECT COUNT(id) FROM reviews WHERE event_id = e.id) as review_count
      FROM bookings b
      JOIN events e ON b.event_id = e.id
      JOIN users u ON e.organizer_id = u.id
      WHERE b.user_id = ?
      ORDER BY e.start_date ASC, e.start_time ASC
    `, [userId]);
    
    // Process bookings to add status
    const processedBookings = bookings.map(booking => {
      return {
        ...booking,
        status: getBookingStatus(booking)
      };
    });
    
    // Group bookings by status
    const upcomingBookings = processedBookings.filter(b => ['upcoming', 'starting-soon', 'in-progress'].includes(b.status));
    const pastBookings = processedBookings.filter(b => ['attended', 'missed'].includes(b.status));
    
    res.render('bookings/index', {
      title: 'My Bookings',
      upcomingBookings,
      pastBookings,
      moment
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { 
      title: 'Server Error',
      message: 'Failed to load bookings. Please try again later.' 
    });
  }
});

module.exports = router;