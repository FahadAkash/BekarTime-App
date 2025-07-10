const https = require('https');
const WebSocket = require('ws');
const readline = require('readline');
const colors = require('colors');
const uuid = require('uuid');

// Install required packages: npm install colors ws uuid
colors.enable();

// Configuration - UPDATED TO INCLUDE STAGE NAME
// Configuration
const HTTP_API_URL =  process.env.HTTP_API_URL || '';
const WEBSOCKET_URL = process.env.WEBSOCKET_URL || '';

// Command-line arguments
const args = process.argv.slice(2);
const mode = args[0] || 'auto';
const roomIdArg = args[1];

// User configuration
const USER_ID = `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const USER_NAME = `User-${Math.floor(Math.random() * 1000)}`;
const USER_ICON = `https://robohash.org/${USER_ID}`;
const USER_COLOR = mode === 'create' ? '#FFFF00' : '#00FFFF';
const USER_TYPE = mode === 'create' ? 'Creator' : 'Participant';

console.log(colors.yellow(`\n👤 You are: ${USER_ID} (${USER_TYPE})`));
console.log(colors.yellow(`👤 Name: ${USER_NAME}, Color: ${USER_COLOR}`));

// Test location
const testLocation = {
  latitude: 37.4219983,
  longitude: -122.084
};

// Room management
let roomCreatorId = null;
let currentRoomId = null;
let isCurrentUserCreator = false;
let typingTimeout = null;

// HTTP request helper - FIXED TO HANDLE STAGE PATH
function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(HTTP_API_URL + path);
    const options = {
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

// Create a room
async function createRoom(roomType = 'public', maxParticipants = 5) {
  try {
    const response = await makeRequest('POST', '/create-room', {
      userId: USER_ID,
      latitude: testLocation.latitude,
      longitude: testLocation.longitude,
      roadName: "Test Road",
      roomType,
      maxParticipants
    });

    if (response.statusCode === 200 && response.data.roomId) {
      console.log(colors.green(`✅ Created room: ${response.data.roomId}`));
      roomCreatorId = USER_ID;
      isCurrentUserCreator = true;
      return response.data.roomId;
    } else {
      console.error(colors.red(`❌ Create Room Error: ${response.statusCode}`), response.data);
    }
    return null;
  } catch (error) {
    console.error(colors.red('❌ Create Room Error:'), error);
    return null;
  }
}

// Search for rooms
async function searchRooms(roomType = 'public') {
  try {
    const response = await makeRequest('GET', 
      `/search-rooms?latitude=${testLocation.latitude}&longitude=${testLocation.longitude}&roomType=${roomType}`
    );
    
    if (response.statusCode === 200) {
      return response.data;
    } else {
      console.error(colors.red(`❌ Search Rooms Error: ${response.statusCode}`), response.data);
      return [];
    }
  } catch (error) {
    console.error(colors.red('❌ Search Rooms Error:'), error);
    return [];
  }
}

// Join a room - UPDATED TO HANDLE JOINING BEFORE WEBSOCKET
async function joinRoom(roomId) {
  try {
    const response = await makeRequest('POST', '/join-room', {
      roomId: roomId,
      userId: USER_ID
    });

    if (response.statusCode === 200 && response.data.success) {
      console.log(colors.green(`✅ Joined room: ${roomId}`));
      return true;
    } else {
      console.error(colors.red(`❌ Join Room Error: ${response.statusCode}`), response.data);
    }
    return false;
  } catch (error) {
    console.error(colors.red('❌ Join Room Error:'), error);
    return false;
  }
}

// Close a room
async function closeRoom(roomId) {
  try {
    const response = await makeRequest('POST', '/close-room', {
      roomId: roomId,
      userId: USER_ID
    });

    if (response.statusCode === 200 && response.data.success) {
      console.log(colors.green(`✅ Room ${roomId} closed`));
      return true;
    } else {
      console.error(colors.red(`❌ Close Room Error: ${response.statusCode}`), response.data);
    }
    return false;
  } catch (error) {
    console.error(colors.red('❌ Close Room Error:'), error);
    return false;
  }
}

// Handle WebSocket connection
async function connectWebSocket(roomId) {
  currentRoomId = roomId;
  
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      userId: USER_ID,
      userName: USER_NAME,
      userIcon: USER_ICON,
      userColor: USER_COLOR
    });
    
    const ws = new WebSocket(`${WEBSOCKET_URL}?${params}`);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: ''
    });

    ws.on('open', () => {
      console.log(colors.green('✅ WebSocket Connected'));
      
      // JOIN ROOM AFTER CONNECTION ESTABLISHED
      ws.send(JSON.stringify({
        action: 'join-room',
        roomId: currentRoomId,
        userName: USER_NAME,
        userIcon: USER_ICON,
        userColor: USER_COLOR
      }));
      
      console.log(colors.magenta('\n💬 Start chatting! Commands:'));
      console.log(colors.magenta('  /exit - Quit chat'));
      console.log(colors.magenta('  /close - Close room (creator only)'));
      console.log(colors.magenta('  /info - Show room info\n'));
      
      rl.prompt();
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        
        switch (msg.type) {
          case 'new-message':
            if (msg.userId !== USER_ID) {
              const userTag = msg.userId === roomCreatorId ? 
                colors.yellow(`[${msg.userName}] 👑`) : 
                colors.cyan(`[${msg.userName}]`);
              console.log(`\n${userTag}: ${msg.text}`);
            }
            break;
            
          case 'user-joined':
            console.log(colors.green(`\n👉 ${msg.userName} joined the room`));
            if (msg.creatorId) roomCreatorId = msg.creatorId;
            break;
            
          case 'user-typing':
            if (msg.userId !== USER_ID) {
              console.log(colors.gray(`\n✍️  ${msg.userName} is typing...`));
            }
            break;
            
          case 'room-closed':
            console.log(colors.red('\n🔒 Room closed by owner'));
            ws.close();
            break;
            
          case 'room-info':
            console.log(colors.blue('\n🏠 Room Info:'));
            console.log(colors.blue(`  ID: ${msg.id}`));
            console.log(colors.blue(`  Creator: ${msg.creator}`));
            console.log(colors.blue(`  Participants: ${msg.participants.length}`));
            console.log(colors.blue(`  Location: ${msg.location.latitude}, ${msg.location.longitude}`));
            break;
            
          case 'user-left': // ADDED HANDLER
            console.log(colors.yellow(`\n👋 ${msg.userName} left the room`));
            break;
            
          default:
            console.log(colors.gray(`\n[System] ${JSON.stringify(msg)}`));
        }
        rl.prompt(true);
      } catch (e) {
        console.error('Parse error:', e);
      }
    });

    ws.on('error', (error) => {
      console.error(colors.red('❌ WebSocket Error:'), error);
      resolve(false);
    });

    ws.on('close', () => {
      console.log(colors.yellow('\n🔌 WebSocket Disconnected'));
      rl.close();
      resolve(true);
    });

    // Handle user input
    rl.on('line', (input) => {
      if (input.trim() === '') return rl.prompt();
      
      switch (input.toLowerCase()) {
        case '/exit':
          ws.close();
          return;
          
        case '/close':
          if (isCurrentUserCreator) {
            ws.send(JSON.stringify({
              action: 'close-room',
              roomId: currentRoomId
            }));
          } else {
            console.log(colors.red('\n⚠️ Only room creator can close the room'));
          }
          rl.prompt();
          return;
          
        case '/info':
          ws.send(JSON.stringify({
            action: 'room-info',
            roomId: currentRoomId
          }));
          rl.prompt();
          return;
      }
      
      // Send typing indicator
      ws.send(JSON.stringify({
        action: 'user-typing',
        roomId: currentRoomId,
        userName: USER_NAME
      }));
      
      // Clear previous timeout
      if (typingTimeout) clearTimeout(typingTimeout);
      
      // Set new timeout to send message
      typingTimeout = setTimeout(() => {
        // Send message
        ws.send(JSON.stringify({
          action: 'send-message',
          roomId: currentRoomId,
          messageId: uuid.v4(),
          message: input,
          userName: USER_NAME,
          userIcon: USER_ICON,
          userColor: USER_COLOR
        }));
      }, 1000);
      
      rl.prompt();
    });
  });
}

// Main function - FIXED ROOM HANDLING LOGIC
async function main() {
  let roomId = roomIdArg;

  // Mode handling
  if (mode === 'create') {
    roomId = await createRoom();
    if (roomId) {
      await joinRoom(roomId);
    }
  } else if (mode === 'join' && roomId) {
    await joinRoom(roomId);
  } else if (mode === 'close' && roomId) {
    await closeRoom(roomId);
    return;
  } else {
    // Auto mode
    console.log(colors.blue('\n🔍 Searching for rooms...'));
    const rooms = await searchRooms();
    
    if (rooms.length > 0) {
      roomId = rooms[0].id;
      console.log(colors.blue(`🏠 Found room: ${roomId}`));
      await joinRoom(roomId);
    } else {
      console.log(colors.blue('🆕 Creating new room...'));
      roomId = await createRoom();
      if (roomId) {
        await joinRoom(roomId);
      }
    }
  }

  if (roomId) {
    await connectWebSocket(roomId);
    
    if (isCurrentUserCreator) {
      console.log(colors.yellow(`\n👑 You created this room. To close:`));
      console.log(colors.yellow(`node ${process.argv[1]} close ${roomId}`));
    }
  } else {
    console.log(colors.red('❌ Failed to get room ID'));
  }
}

// Start the application
if (require.main === module) {
  main();
}