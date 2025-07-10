const WebSocket = require('ws');
const readline = require('readline');

// Configuration - replace with your actual values
const WS_ENDPOINT = 'wss://34qwxy2i4i.execute-api.us-east-1.amazonaws.com/beta';
const USER_ID = 'user123'; // Replace with actual user ID
const USER_NAME = 'Test User';
const USER_ICON = 'https://example.com/icon.png';
const USER_COLOR = '#ff0000';

// Create WebSocket connection
const ws = new WebSocket(`${WS_ENDPOINT}?userId=${USER_ID}`);

// Create readline interface for input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server');
  showMainMenu();
});

ws.on('message', (data) => {
  const message = JSON.parse(data);
  console.log('\n📨 Received message:', message);
  showMainMenu();
});

ws.on('close', () => {
  console.log('❌ Disconnected from WebSocket server');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

function showMainMenu() {
  rl.question('\nSelect action:\n1. Join room\n2. Send message\n3. User typing\n4. Room info\n5. Close room\n6. Exit\n> ', (choice) => {
    switch(choice) {
      case '1':
        joinRoom();
        break;
      case '2':
        sendMessage();
        break;
      case '3':
        sendTyping();
        break;
      case '4':
        getRoomInfo();
        break;
      case '5':
        closeRoom();
        break;
      case '6':
        ws.close();
        rl.close();
        break;
      default:
        console.log('Invalid choice');
        showMainMenu();
    }
  });
}

function joinRoom() {
  rl.question('Enter room ID: ', (roomId) => {
    ws.send(JSON.stringify({
      action: 'join-room',
      roomId,
      userName: USER_NAME,
      userIcon: USER_ICON,
      userColor: USER_COLOR
    }));
    console.log('Joining room...');
  });
}

function sendMessage() {
  rl.question('Enter room ID: ', (roomId) => {
    rl.question('Enter message: ', (message) => {
      const messageId = Date.now().toString(); // Simple unique ID
      ws.send(JSON.stringify({
        action: 'send-message',
        roomId,
        messageId,
        message,
        userName: USER_NAME,
        userIcon: USER_ICON,
        userColor: USER_COLOR
      }));
      console.log('Message sent');
    });
  });
}

function sendTyping() {
  rl.question('Enter room ID: ', (roomId) => {
    ws.send(JSON.stringify({
      action: 'user-typing',
      roomId,
      userName: USER_NAME
    }));
    console.log('Typing indicator sent');
  });
}

function getRoomInfo() {
  rl.question('Enter room ID: ', (roomId) => {
    ws.send(JSON.stringify({
      action: 'room-info',
      roomId
    }));
    console.log('Requesting room info...');
  });
}

function closeRoom() {
  rl.question('Enter room ID: ', (roomId) => {
    ws.send(JSON.stringify({
      action: 'close-room',
      roomId
    }));
    console.log('Closing room...');
  });
}