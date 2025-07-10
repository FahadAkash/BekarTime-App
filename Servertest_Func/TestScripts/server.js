const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

// Initialize express first
const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = 3000;
const CHAT_ROOM_RADIUS = 500; // meters
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

let chatRooms = [];
const userSockets = {}; // Track user sockets

// Haversine formula to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}

// Update the createRoomLogic function
function createRoomLogic({ userId, latitude, longitude, roomType = 'private', maxParticipants = 2 }) {
  const roomId = uuidv4();
  const newRoom = {
    id: roomId,
    location: { latitude, longitude },
    radius: CHAT_ROOM_RADIUS,
    creator: userId,
    participants: [userId],
    messages: [],
    lastActivity: Date.now(),
    status: 'active',
    roomType,
    maxParticipants: roomType === 'private' ? 2 : maxParticipants
  };
  chatRooms.push(newRoom);
  return { roomId };
}

// API to create a chat room
app.post('/create-room', (req, res) => {
  const { userId, latitude, longitude, roomType, maxParticipants } = req.body;
  const { roomId } = createRoomLogic({
    userId,
    latitude,
    longitude,
    roomType,
    maxParticipants
  });
  res.json({ roomId });
});

// API to search for nearby chat rooms
app.get('/search-rooms', (req, res) => {
  const { latitude, longitude, roomType } = req.query;
  const nearbyRooms = chatRooms.filter(room => {
    const distance = calculateDistance(
      parseFloat(latitude),
      parseFloat(longitude),
      room.location.latitude,
      room.location.longitude
    );
    return distance <= room.radius && 
           room.status === 'active' &&
           (!roomType || room.roomType === roomType) &&
           room.participants.length < room.maxParticipants;
  });
  res.json(nearbyRooms);
});

// API to join a chat room
app.post('/join-room', (req, res) => {
  const { roomId, userId } = req.body;
  const room = chatRooms.find(r => r.id === roomId);
  if (room && room.status === 'active' && room.participants.length < room.maxParticipants) {
    if (!room.participants.includes(userId)) {
      room.participants.push(userId);
    }
    room.lastActivity = Date.now();
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// API to close a chat room
app.post('/close-room', (req, res) => {
  const { roomId, userId, forceClose } = req.body;
  const room = chatRooms.find(r => r.id === roomId);
  if (room && (room.creator === userId || forceClose)) {
    room.status = 'closed';
    io.to(roomId).emit('room-closed');
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Modify the auto-create-room endpoint
app.post('/auto-create-room', (req, res) => {
  const { userId, latitude, longitude, roomType, maxParticipants = 2 } = req.body;
  const { roomId } = createRoomLogic({
    userId,
    latitude,
    longitude,
    roomType: roomType || 'private',
    maxParticipants: maxParticipants === 999 ? 999 : Math.min(Math.max(maxParticipants, 2), 10)
  });
  res.json({ roomId });
});

// Real-time chat with Socket.IO
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Register user with socket
  socket.on('register-user', (userId) => {
    socket.userId = userId;
    if (!userSockets[userId]) userSockets[userId] = [];
    userSockets[userId].push(socket.id);
  });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
  });

  socket.on('send-message', (data) => {
    const { roomId, userId, message } = data;
    const room = chatRooms.find(r => r.id === roomId);
    if (room && room.status === 'active') {
      const newMessage = { userId, message, timestamp: Date.now() };
      room.messages.push(newMessage);
      room.lastActivity = Date.now();
      io.to(roomId).emit('new-message', newMessage);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    if (socket.userId) {
      // Remove socket from user tracking
      const index = userSockets[socket.userId]?.indexOf(socket.id);
      if (index > -1) userSockets[socket.userId].splice(index, 1);
      
      // Close rooms if creator disconnected
      if (userSockets[socket.userId]?.length === 0) {
        chatRooms.filter(room => 
          room.creator === socket.userId && 
          room.status === 'active'
        ).forEach(room => {
          room.status = 'closed';
          io.to(room.id).emit('room-closed');
        });
      }
    }
  });
});

// Clean up inactive rooms
setInterval(() => {
  const now = Date.now();
  chatRooms = chatRooms.filter(room => {
    if (room.status === 'active' && now - room.lastActivity > INACTIVITY_TIMEOUT) {
      room.status = 'closed';
      io.to(room.id).emit('room-closed');
      return false;
    }
    return true;
  });
}, 5 * 60 * 1000); // Check every 5 minutes

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));