const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const cookieParser = require('cookie-parser');
const path = require('path');
const sqlite3 = require('sqlite3');
const { connect } = require('./database/db');
const { initializeDatabase } = require('./database/init');
const expressLayouts = require('express-ejs-layouts');

// Import routes
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const bookingRoutes = require('./routes/bookings');
const organizerRoutes = require('./routes/organizer');
const userRoutes = require('./routes/user');

const app = express();
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Then establish connection for the server
    await connect();

    // Middleware
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    
    // Serve static files from the public directory
    app.use(express.static(path.join(__dirname, 'public')));

    // Set view engine and layouts
    app.use(expressLayouts);
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
    app.set('layout', 'layout');

    // Session configuration
    app.use(session({
      store: new SQLiteStore({
        db: 'sessions.db',
        dir: './database',
        driver: sqlite3.Database
      }),
      secret: 'event-booking-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 1 week
    }));

    // Global middleware to pass user data to all views
    app.use((req, res, next) => {
      res.locals.user = req.session.user || null;
      next();
    });

    // Routes
    app.use('/', authRoutes);
    app.use('/events', eventRoutes);
    app.use('/bookings', bookingRoutes);
    app.use('/organizer', organizerRoutes);
    app.use('/user', userRoutes);

    // Home route
    app.get('/', (req, res) => {
      res.redirect('/events');
    });

    // 404 handler
    app.use((req, res) => {
      res.status(404).render('error', { 
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.' 
      });
    });

    // Error handler
    app.use((err, req, res, next) => {
      console.error(err);
      res.status(500).render('error', { 
        title: 'Server Error',
        message: 'Something went wrong on our end.' 
      });
    });

    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();