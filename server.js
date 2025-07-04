const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { Server } = require("socket.io");

dotenv.config();

const app = express();
const httpServer = http.createServer(app);

// CORS Configuration - IMPORTANT: Remove trailing slash from Vercel URL
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(url => url.trim().replace(/\/$/, '')) // Removed trailing slash if present
  : ['http://localhost:3000', 'https://dev-track-five.vercel.app']; // <-- FIXED: Removed trailing slash

console.log('Allowed CORS origins:', allowedOrigins);

// Common CORS options object for reusability and consistency
const commonCorsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"], // Added PATCH and OPTIONS
  credentials: true
};

// Configure Socket.IO with CORS
const io = new Server(httpServer, {
  cors: commonCorsOptions // Use the common options
});

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("join_project", (projectId) => {
    socket.join(projectId);
    console.log(`User ${socket.id} joined project: ${projectId}`);
  });

  socket.on("send_message", (data) => {
    io.to(data.projectId).emit("receive_message", data);
    console.log(`Message sent to project ${data.projectId}: ${data.message}`);
  });

  socket.on("disconnect", () => {
    console.log("User Disconnected", socket.id);
  });
});

// Middleware - CORS configuration for Express app
// Use the commonCorsOptions or define explicitly if different logic is needed
app.use(cors(commonCorsOptions)); // Use the common options

app.use(express.json());

// MongoDB connection options
const mongooseOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 45000,
  family: 4
};

const MONGODB_URI = process.env.MONGODB_URI;

const connectWithRetry = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    await mongoose.connect(MONGODB_URI, mongooseOptions);
    console.log('Successfully connected to MongoDB.');
    console.log('Connection state:', mongoose.connection.readyState);
  } catch (err) {
    console.error('MongoDB connection error details:');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.log('Retrying connection in 5 seconds...');
    setTimeout(connectWithRetry, 5000);
  }
};

connectWithRetry();

mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from MongoDB');
  console.log('Attempting to reconnect...');
  connectWithRetry();
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/tickets', require('./routes/tickets'));

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to DevTrack API' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server and Socket.IO are running on port ${PORT}`);
<<<<<<< HEAD
});
=======
});

>>>>>>> eada04168476ec06c04cc4bac1a4853475ebb42c