const express = require('express');
const moment = require('moment');
const { all, get, run } = require('../database/db');
const router = express.Router();

// Middleware to check if user is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Helper function to get event status
function getEventStatus(event) {
  const now = moment();
  const startDateTime = moment(`${event.start_date} ${event.start_time}`);
  const endDateTime = moment(`${event.start_date} ${event.end_time}`);
  
  // Check if event is ended
  if (endDateTime.isBefore(now)) {
    return 'ended';
  }
  
  // Check if event is starting soon (less than 7 hours)
  if (startDateTime.diff(now, 'hours') < 7 && startDateTime.isAfter(now)) {
    return 'starting-soon';
  }
  
  // Check if event is filling fast (less than 20% seats remaining)
  const bookedSeats = event.booked_seats || 0;
  const availableSeats = event.max_attendees - bookedSeats;
  if (availableSeats <= event.max_attendees * 0.2 && availableSeats > 0) {
    return 'filling-fast';
  }
  
  // Check if event is filled
  if (availableSeats <= 0) {
    return 'filled';
  }
  
  return 'upcoming';
}

// Home/Events page
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const category = req.query.category || '';
    const dateFilter = req.query.date || '';
    const organizerFilter = req.query.organizer || '';
    
    let query = `
      SELECT e.*, u.name as organizer_name, 
      COUNT(b.id) as booked_seats,
      (SELECT AVG(rating) FROM reviews WHERE event_id = e.id) as avg_rating,
      (SELECT COUNT(id) FROM reviews WHERE event_id = e.id) as review_count
      FROM events e
      LEFT JOIN users u ON e.organizer_id = u.id
      LEFT JOIN bookings b ON e.id = b.event_id
    `;
    
    let countQuery = 'SELECT COUNT(*) as total FROM events e';
    
    let whereConditions = [];
    let params = [];
    let countParams = [];
    
    // Search filter
    if (search) {
      whereConditions.push("(e.title LIKE ? OR u.name LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
      countParams.push(`%${search}%`, `%${search}%`);
    }
    
    // Category filter
    if (category) {
      whereConditions.push("e.category = ?");
      params.push(category);
      countParams.push(category);
    }
    
    // Date filter
    if (dateFilter) {
      whereConditions.push("e.start_date = ?");
      params.push(dateFilter);
      countParams.push(dateFilter);
    }
    
    // Organizer filter
    if (organizerFilter) {
      whereConditions.push("u.name LIKE ?");
      params.push(`%${organizerFilter}%`);
      countParams.push(`%${organizerFilter}%`);
    }
    
    // Exclude events that ended more than 7 days ago (unless user is an organizer)
    if (!req.session.user || req.session.user.role !== 'organizer') {
      const sevenDaysAgo = moment().subtract(7, 'days').format('YYYY-MM-DD');
      whereConditions.push(`(e.start_date >= ? OR (e.start_date >= ? AND datetime(e.start_date || ' ' || e.end_time) >= datetime('now')))`);
      params.push(sevenDaysAgo, sevenDaysAgo);
      countParams.push(sevenDaysAgo, sevenDaysAgo);
    }
    
    if (whereConditions.length > 0) {
      query += ' WHERE ' + whereConditions.join(' AND ');
      countQuery += ' LEFT JOIN users u ON e.organizer_id = u.id WHERE ' + whereConditions.join(' AND ');
    }
    
    query += ' GROUP BY e.id ORDER BY e.start_date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const events = await all(query, params);
    const countResult = await get(countQuery, countParams);
    const totalEvents = countResult.total;
    const totalPages = Math.ceil(totalEvents / limit);
    
    // Get categories for filter
    const categories = await all('SELECT DISTINCT category FROM events');
    
    // Process events to add status
    const processedEvents = events.map(event => {
      return {
        ...event,
        status: getEventStatus(event)
      };
    });
    
    res.render('events/index', {
      title: 'Events',
      events: processedEvents,
      categories: categories.map(c => c.category),
      currentPage: page,
      totalPages,
      search,
      category,
      dateFilter,
      organizerFilter,
      moment
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { 
      title: 'Server Error',
      message: 'Failed to load events. Please try again later.' 
    });
  }
});

// Event details
router.get('/:id', async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.session.user ? req.session.user.id : null;
    
    // Get event details
    const event = await get(`
      SELECT e.*, u.name as organizer_name, 
      COUNT(b.id) as booked_seats,
      (SELECT AVG(rating) FROM reviews WHERE event_id = e.id) as avg_rating,
      (SELECT COUNT(id) FROM reviews WHERE event_id = e.id) as review_count
      FROM events e
      LEFT JOIN users u ON e.organizer_id = u.id
      LEFT JOIN bookings b ON e.id = b.event_id
      WHERE e.id = ?
      GROUP BY e.id
    `, [eventId]);
    
    if (!event) {
      return res.status(404).render('error', { 
        title: 'Not Found',
        message: 'Event not found' 
      });
    }
    
    // Add status to event
    event.status = getEventStatus(event);
    
    // Check if user has booked this event
    let userBooking = null;
    if (userId) {
      userBooking = await get('SELECT * FROM bookings WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    }
    
    // Get reviews
    const reviews = await all(`
      SELECT r.*, u.name as user_name, u.role as user_role,
      (SELECT COUNT(*) FROM review_likes WHERE review_id = r.id) as like_count,
      (SELECT COUNT(*) FROM review_likes WHERE review_id = r.id AND user_id = ?) as user_liked
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = ?
      ORDER BY r.created_at DESC
    `, [userId || 0, eventId]);
    
    // Check if user has already reviewed
    let userReview = null;
    if (userId) {
      userReview = await get('SELECT * FROM reviews WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    }
    
    res.render('events/detail', {
      title: event.title,
      event,
      userBooking,
      reviews,
      userReview,
      moment
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { 
      title: 'Server Error',
      message: 'Failed to load event details. Please try again later.' 
    });
  }
});

// Book event
router.post('/:id/book', isAuthenticated, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.session.user.id;
    
    // Check if event exists and has available seats
    const event = await get(`
      SELECT e.*, COUNT(b.id) as booked_seats
      FROM events e
      LEFT JOIN bookings b ON e.id = b.event_id
      WHERE e.id = ?
      GROUP BY e.id
    `, [eventId]);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Check if event has already ended
    const now = moment();
    const eventEndTime = moment(`${event.start_date} ${event.end_time}`);
    if (eventEndTime.isBefore(now)) {
      return res.status(400).json({ success: false, message: 'This event has already ended' });
    }
    
    // Check if there are available seats
    if (event.booked_seats >= event.max_attendees) {
      return res.status(400).json({ success: false, message: 'No seats available' });
    }
    
    // Check if user has already booked this event
    const existingBooking = await get('SELECT * FROM bookings WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    
    if (existingBooking) {
      return res.status(400).json({ success: false, message: 'You have already booked this event' });
    }
    
    // Create booking
    await run('INSERT INTO bookings (event_id, user_id) VALUES (?, ?)', [eventId, userId]);
    
    res.json({ success: true, message: 'Event booked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to book event' });
  }
});

// Cancel booking
router.post('/:id/cancel', isAuthenticated, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.session.user.id;
    
    // Check if booking exists
    const booking = await get('SELECT * FROM bookings WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }
    
    // Check if event has already started
    const event = await get('SELECT * FROM events WHERE id = ?', [eventId]);
    const now = moment();
    const eventStartTime = moment(`${event.start_date} ${event.start_time}`);
    
    if (eventStartTime.isBefore(now)) {
      return res.status(400).json({ success: false, message: 'Cannot cancel booking for an event that has already started' });
    }
    
    // Delete booking
    await run('DELETE FROM bookings WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    
    res.json({ success: true, message: 'Booking cancelled successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to cancel booking' });
  }
});

// Add review
router.post('/:id/review', isAuthenticated, async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.session.user.id;
    const { rating, comment } = req.body;
    
    // Check if event exists
    const event = await get('SELECT * FROM events WHERE id = ?', [eventId]);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found' });
    }
    
    // Check if event has already ended
    const now = moment();
    const eventEndTime = moment(`${event.start_date} ${event.end_time}`);
    
    if (!eventEndTime.isBefore(now)) {
      return res.status(400).json({ success: false, message: 'Cannot review an event that has not ended yet' });
    }
    
    // Check if user has booked this event
    const booking = await get('SELECT * FROM bookings WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    
    if (!booking && req.session.user.role !== 'organizer') {
      return res.status(400).json({ success: false, message: 'You can only review events you have booked' });
    }
    
    // Check if user has already reviewed this event
    const existingReview = await get('SELECT * FROM reviews WHERE event_id = ? AND user_id = ?', [eventId, userId]);
    
    if (existingReview) {
      return res.status(400).json({ success: false, message: 'You have already reviewed this event' });
    }
    
    // Create review
    await run(
      'INSERT INTO reviews (event_id, user_id, rating, comment) VALUES (?, ?, ?, ?)',
      [eventId, userId, rating, comment]
    );
    
    res.json({ success: true, message: 'Review added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to add review' });
  }
});

// Delete review
router.delete('/:eventId/review/:reviewId', isAuthenticated, async (req, res) => {
  try {
    const reviewId = req.params.reviewId;
    const userId = req.session.user.id;
    
    // Check if review exists and belongs to user
    const review = await get('SELECT * FROM reviews WHERE id = ? AND user_id = ?', [reviewId, userId]);
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found or you are not authorized to delete it' });
    }
    
    // Delete review
    await run('DELETE FROM reviews WHERE id = ?', [reviewId]);
    
    // Delete associated likes
    await run('DELETE FROM review_likes WHERE review_id = ?', [reviewId]);
    
    res.json({ success: true, message: 'Review deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
});

// Like review
router.post('/:eventId/review/:reviewId/like', isAuthenticated, async (req, res) => {
  try {
    const reviewId = req.params.reviewId;
    const userId = req.session.user.id;
    
    // Check if review exists
    const review = await get('SELECT * FROM reviews WHERE id = ?', [reviewId]);
    
    if (!review) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    
    // Check if user has already liked this review
    const existingLike = await get('SELECT * FROM review_likes WHERE review_id = ? AND user_id = ?', [reviewId, userId]);
    
    if (existingLike) {
      // Unlike the review
      await run('DELETE FROM review_likes WHERE review_id = ? AND user_id = ?', [reviewId, userId]);
      return res.json({ success: true, message: 'Review unliked successfully', action: 'unliked' });
    }
    
    // Like the review
    await run('INSERT INTO review_likes (review_id, user_id) VALUES (?, ?)', [reviewId, userId]);
    
    res.json({ success: true, message: 'Review liked successfully', action: 'liked' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to like/unlike review' });
  }
});

module.exports = router;