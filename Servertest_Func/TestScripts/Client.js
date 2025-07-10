const fetch = require('node-fetch');
const readline = require('readline');
const WebSocket = require('ws');

// AWS configuration
const API_URL =  process.env.HTTP_API_URL || 'https://your_http_api_url_here';
const WS_URL = process.env.WEBSOCKET_URL || 'wss://your_websocket_url_here';

// User setup
const userId = 'user_' + Math.floor(Math.random() * 10000);
const MY_LOCATION = {
  latitude: 40.7128,
  longitude: -74.0060
};
const ROOM_TYPE = 'private'; // 'private' or 'group'

// Initialize WebSocket connection with userId in the URL
const socket = new WebSocket(`${WS_URL}?userId=${userId}`);

// Terminal interface setup
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

let currentRoomId = null;

// Improved fetch wrapper with error handling
async function safeFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error.message);
    throw error;
  }
}

// Room joining helper
async function joinRoom(roomId) {
  try {
    const result = await safeFetch(`${API_URL}/join-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, userId })
    });

    if (result.success) {
      socket.send(JSON.stringify({ action: 'join-room', roomId }));
      return true;
    }
    console.log('Join room request failed:', result.message || 'Unknown error');
    return false;
  } catch (err) {
    console.error('Failed to join room:', err.message);
    return false;
  }
}

// Room management logic
async function autoJoinOrCreateRoom() {
  try {
    // 1. Search for available rooms
    const rooms = await safeFetch(
      `${API_URL}/search-rooms?latitude=${MY_LOCATION.latitude}&longitude=${MY_LOCATION.longitude}&roomType=${ROOM_TYPE}`
    );

    // 2. Join existing room if available
    if (rooms && rooms.length > 0) {
      currentRoomId = rooms[0].id;
      if (await joinRoom(currentRoomId)) {
        console.log(`✅ Joined room ${currentRoomId}`);
        promptMessage();
        return;
      } else {
        console.log('Failed to join existing room. Creating a new one...');
        currentRoomId = null;
      }
    }

    // 3. If no rooms found or join failed, prompt for room size
    const roomSize = await new Promise((resolve) => {
      rl.question('No rooms found. Create new room - enter max participants (2-10) or "unlimited": ', (answer) => {
        if (answer.toLowerCase() === 'unlimited') {
          resolve(999);
        } else {
          const size = parseInt(answer);
          if (isNaN(size) || size < 2 || size > 10) {
            console.log('Invalid input. Using default size of 2.');
            resolve(2);
          } else {
            resolve(size);
          }
        }
      });
    });

    // 4. Create new room with chosen size
    const createResponse = await safeFetch(`${API_URL}/create-room`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        latitude: MY_LOCATION.latitude,
        longitude: MY_LOCATION.longitude,
        roomType: ROOM_TYPE,
        maxParticipants: roomSize
      })
    });

    if (!createResponse.roomId) {
      throw new Error('Failed to create room: No roomId returned');
    }

    currentRoomId = createResponse.roomId;
    if (await joinRoom(currentRoomId)) {
      console.log(`✅ Created and joined room ${currentRoomId} (max ${roomSize === 999 ? 'unlimited' : roomSize} participants)`);
      promptMessage();
    } else {
      console.log('Failed to join created room. Retrying...');
      setTimeout(autoJoinOrCreateRoom, 2000);
    }
  } catch (err) {
    console.error('Room management error:', err.message);
    setTimeout(autoJoinOrCreateRoom, 2000);
  }
}

// Chat interface
function promptMessage() {
  rl.question('  Message (/exit, /newroom, /help): ', (msg) => {
    if (msg === '/exit') {
      rl.close();
      return;
    }

    if (msg === '/newroom') {
      console.log('Switching to new room...');
      currentRoomId = null;
      return autoJoinOrCreateRoom();
    }

    if (msg === '/help') {
      console.log('Available commands:');
      console.log('  /exit - Exit the application');
      console.log('  /newroom - Switch to a new room');
      console.log('  /help - Show this help message');
      return promptMessage();
    }

    if (currentRoomId) {
      socket.send(JSON.stringify({
        action: 'send-message',
        roomId: currentRoomId,
        userId,
        message: msg
      }));
    } else {
      console.log('No active room. Creating one...');
      autoJoinOrCreateRoom();
    }
    promptMessage();
  });
}

// WebSocket event handlers
socket.onopen = () => {
  console.log(`🟢 Connected as ${userId}`);
  socket.send(JSON.stringify({ action: 'register-user', userId })); // Kept for compatibility
  autoJoinOrCreateRoom();
};

socket.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.action === 'new-message') {
    if (data.userId !== userId) {
      console.log(`\n[${data.userId}]: ${data.message}`);
      if (rl.line) rl.prompt(true);
    }
  } else if (data.action === 'room-closed') {
    console.log('\n❌ Room closed. Finding new room...');
    currentRoomId = null;
    setTimeout(autoJoinOrCreateRoom, 2000);
  }
};

socket.onerror = (error) => {
  console.error('WebSocket error:', error.message);
};

socket.onclose = () => {
  console.log('🔴 Disconnected from server');
};

// Cleanup on exit
rl.on('close', () => {
  console.log('\nClosing connection...');
  socket.close();
  process.exit(0);
});