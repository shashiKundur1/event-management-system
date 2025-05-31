const express = require('express');
const moment = require('moment');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const fs = require('fs');
const { all, get, run } = require('../database/db');
const router = express.Router();

// Middleware to check if user is logged in and is an organizer
const isOrganizer = (req, res, next) => {
  if (req.session.user && req.session.user.role === 'organizer') {
    return next();
  }
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.status(403).render('error', { 
    title: 'Access Denied',
    message: 'You do not have permission to access this page.' 
  });
};

// Dashboard
router.get('/dashboard', isOrganizer, async (req, res) => {
  try {
    const organizerId = req.session.user.id;
    
    // Get organizer's events
    const events = await all(`
      SELECT e.*, 
      COUNT(b.id) as booked_seats,
      (SELECT AVG(rating) FROM reviews WHERE event_id = e.id) as avg_rating,
      (SELECT COUNT(id) FROM reviews WHERE event_id = e.id) as review_count
      FROM events e
      LEFT JOIN bookings b ON e.id = b.event_id
      WHERE e.organizer_id = ?
      GROUP BY e.id
      ORDER BY e.start_date DESC
    `, [organizerId]);
    
    // Process events to add status
    const processedEvents = events.map(event => {
      const now = moment();
      const startDateTime = moment(`${event.start_date} ${event.start_time}`);
      const endDateTime = moment(`${event.start_date} ${event.end_time}`);
      
      let status = 'upcoming';
      if (endDateTime.isBefore(now)) {
        status = 'ended';
      } else if (startDateTime.isBefore(now) && endDateTime.isAfter(now)) {
        status = 'in-progress';
      }
      
      return {
        ...event,
        status
      };
    });
    
    res.render('organizer/dashboard', {
      title: 'Organizer Dashboard',
      events: processedEvents,
      moment
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { 
      title: 'Server Error',
      message: 'Failed to load organizer dashboard. Please try again later.' 
    });
  }
});

// Create event
router.post('/events', isOrganizer, async (req, res) => {
  try {
    const organizerId = req.session.user.id;
    const { 
      title, description, image_url, start_date, 
      start_time, end_time, location, max_attendees, category 
    } = req.body;
    
    // Validate input
    if (!title || !description || !image_url || !start_date || !start_time || 
        !end_time || !location || !max_attendees || !category) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    
    // Validate max_attendees
    const attendees = parseInt(max_attendees);
    if (isNaN(attendees) || attendees < 5) {
      return res.status(400).json({ success: false, message: 'Maximum attendees must be at least 5' });
    }
    
    // Validate date and times
    const eventDate = moment(start_date);
    const startTime = moment(`${start_date} ${start_time}`);
    const endTime = moment(`${start_date} ${end_time}`);
    
    if (eventDate.isBefore(moment().startOf('day'))) {
      return res.status(400).json({ success: false, message: 'Event date cannot be in the past' });
    }
    
    if (endTime.isBefore(startTime)) {
      return res.status(400).json({ success: false, message: 'End time must be after start time' });
    }
    
    // Create event
    const result = await run(
      `INSERT INTO events 
       (title, description, image_url, start_date, start_time, end_time, location, max_attendees, category, organizer_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, image_url, start_date, start_time, end_time, location, attendees, category, organizerId]
    );
    
    res.json({ success: true, message: 'Event created successfully', eventId: result.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to create event' });
  }
});

// Get event details
router.get('/events/:id', isOrganizer, async (req, res) => {
  try {
    const eventId = req.params.id;
    const organizerId = req.session.user.id;
    
    // Get event details
    const event = await get(`
      SELECT e.*, 
      COUNT(b.id) as booked_seats,
      (SELECT AVG(rating) FROM reviews WHERE event_id = e.id) as avg_rating,
      (SELECT COUNT(id) FROM reviews WHERE event_id = e.id) as review_count
      FROM events e
      LEFT JOIN bookings b ON e.id = b.event_id
      WHERE e.id = ? AND e.organizer_id = ?
      GROUP BY e.id
    `, [eventId, organizerId]);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found or you do not have permission to view it' });
    }
    
    res.json({ success: true, event });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to get event details' });
  }
});

// Delete event
router.delete('/events/:id', isOrganizer, async (req, res) => {
  try {
    const eventId = req.params.id;
    const organizerId = req.session.user.id;
    
    // Check if event exists and belongs to organizer
    const event = await get('SELECT * FROM events WHERE id = ? AND organizer_id = ?', [eventId, organizerId]);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found or you do not have permission to delete it' });
    }
    
    // Check if event has already started
    const now = moment();
    const eventStartTime = moment(`${event.start_date} ${event.start_time}`);
    
    if (eventStartTime.isBefore(now)) {
      return res.status(400).json({ success: false, message: 'Cannot delete an event that has already started' });
    }
    
    // Delete associated bookings
    await run('DELETE FROM bookings WHERE event_id = ?', [eventId]);
    
    // Delete associated reviews
    await run('DELETE FROM reviews WHERE event_id = ?', [eventId]);
    
    // Delete event
    await run('DELETE FROM events WHERE id = ?', [eventId]);
    
    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to delete event' });
  }
});

// Get attendees
router.get('/events/:id/attendees', isOrganizer, async (req, res) => {
  try {
    const eventId = req.params.id;
    const organizerId = req.session.user.id;
    
    // Check if event exists and belongs to organizer
    const event = await get('SELECT * FROM events WHERE id = ? AND organizer_id = ?', [eventId, organizerId]);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found or you do not have permission to view attendees' });
    }
    
    // Get attendees
    const attendees = await all(`
      SELECT b.id as booking_id, b.attended, b.booking_date, u.id as user_id, u.name, u.email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.event_id = ?
      ORDER BY b.booking_date ASC
    `, [eventId]);
    
    res.json({ success: true, attendees });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to get attendees' });
  }
});

// Mark attendance
router.post('/events/:id/attendees/:bookingId/mark', isOrganizer, async (req, res) => {
  try {
    const eventId = req.params.id;
    const bookingId = req.params.bookingId;
    const organizerId = req.session.user.id;
    
    // Check if event exists and belongs to organizer
    const event = await get('SELECT * FROM events WHERE id = ? AND organizer_id = ?', [eventId, organizerId]);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found or you do not have permission to mark attendance' });
    }
    
    // Check if booking exists for this event
    const booking = await get('SELECT * FROM bookings WHERE id = ? AND event_id = ?', [bookingId, eventId]);
    
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found for this event' });
    }
    
    // Mark attendance
    await run('UPDATE bookings SET attended = 1 WHERE id = ?', [bookingId]);
    
    res.json({ success: true, message: 'Attendance marked successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to mark attendance' });
  }
});

// Export attendees as CSV
router.get('/events/:id/export-attendees', isOrganizer, async (req, res) => {
  try {
    const eventId = req.params.id;
    const organizerId = req.session.user.id;
    
    // Check if event exists and belongs to organizer
    const event = await get('SELECT * FROM events WHERE id = ? AND organizer_id = ?', [eventId, organizerId]);
    
    if (!event) {
      return res.status(404).render('error', { 
        title: 'Not Found',
        message: 'Event not found or you do not have permission to export attendees' 
      });
    }
    
    // Get attendees
    const attendees = await all(`
      SELECT b.id as booking_id, b.attended, b.booking_date, u.id as user_id, u.name, u.email
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      WHERE b.event_id = ?
      ORDER BY b.booking_date ASC
    `, [eventId]);
    
    if (attendees.length === 0) {
      return res.status(404).render('error', { 
        title: 'No Attendees',
        message: 'There are no attendees for this event' 
      });
    }
    
    // Create directory if it doesn't exist
    const dir = path.join(__dirname, '../public/exports');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Generate CSV file
    const filename = `event_${eventId}_attendees_${Date.now()}.csv`;
    const filepath = path.join(dir, filename);
    
    const csvWriter = createCsvWriter({
      path: filepath,
      header: [
        { id: 'booking_id', title: 'Booking ID' },
        { id: 'user_id', title: 'User ID' },
        { id: 'name', title: 'Name' },
        { id: 'email', title: 'Email' },
        { id: 'booking_date', title: 'Booking Date' },
        { id: 'attended', title: 'Attended' }
      ]
    });
    
    const records = attendees.map(attendee => ({
      ...attendee,
      booking_date: moment(attendee.booking_date).format('YYYY-MM-DD HH:mm:ss'),
      attended: attendee.attended ? 'Yes' : 'No'
    }));
    
    await csvWriter.writeRecords(records);
    
    // Send file
    res.download(filepath, `${event.title} - Attendees.csv`, err => {
      if (err) {
        console.error('Download error:', err);
      }
      
      // Delete file after sending
      fs.unlink(filepath, err => {
        if (err) console.error('Error deleting file:', err);
      });
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error', { 
      title: 'Server Error',
      message: 'Failed to export attendees. Please try again later.' 
    });
  }
});

// Get reviews
router.get('/events/:id/reviews', isOrganizer, async (req, res) => {
  try {
    const eventId = req.params.id;
    const organizerId = req.session.user.id;
    
    // Check if event exists and belongs to organizer
    const event = await get('SELECT * FROM events WHERE id = ? AND organizer_id = ?', [eventId, organizerId]);
    
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found or you do not have permission to view reviews' });
    }
    
    // Get reviews
    const reviews = await all(`
      SELECT r.*, u.name as user_name, u.role as user_role,
      (SELECT COUNT(*) FROM review_likes WHERE review_id = r.id) as like_count
      FROM reviews r
      JOIN users u ON r.user_id = u.id
      WHERE r.event_id = ?
      ORDER BY r.created_at DESC
    `, [eventId]);
    
    res.json({ success: true, reviews });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to get reviews' });
  }
});

module.exports = router;