const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth'); // Middleware for authentication

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user already exists with the given email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists with this email.' });
    }

    // Create a new user instance
    const user = new User({
      name,
      email,
      password,
      role: role || 'Team Member' // Default role to 'Team Member' if not provided
    });

    // Save the user to the database (password hashing happens in pre-save hook)
    await user.save();

    // Generate a JWT token for the newly registered user
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key', // Use environment variable for secret
      { expiresIn: '24h' } // Token expires in 24 hours
    );

    // Respond with the token and user details (excluding password)
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Registration error:', err.message); // Log the specific error message
    res.status(500).json({ message: 'Server error during registration. Please try again later.' }); // Generic error for client
  }
});

/**
 * @route POST /api/auth/login
 * @desc Authenticate user & get token
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials. Please check your email and password.' });
    }

    // Compare provided password with hashed password in database
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials. Please check your email and password.' });
    }

    // Generate JWT token for the logged-in user
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    // Respond with the token and user details (excluding password)
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err.message); // Log the specific error message
    res.status(500).json({ message: 'Server error during login. Please try again later.' }); // Generic error for client
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current authenticated user's details
 * @access Private
 */
router.get('/me', auth, async (req, res) => {
  try {
    // Find user by ID from the authenticated token, exclude password field
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }
    res.json(user);
  } catch (err) {
    console.error('Error fetching current user:', err.message);
    res.status(500).json({ message: 'Server error. Could not fetch user details.' });
  }
});

/**
 * @route GET /api/auth/users
 * @desc Get all users (for populating assignee/reporter dropdowns)
 * @access Private (requires authentication)
 */
router.get('/users', auth, async (req, res) => {
  try {
    // Fetch all users, but only select _id, name, email, and role for security and efficiency
    const users = await User.find().select('_id name email role');
    res.json(users);
  } catch (err) {
    console.error('Error fetching all users:', err.message);
    res.status(500).json({ message: 'Server error. Could not fetch users.' });
  }
});

module.exports = router;
