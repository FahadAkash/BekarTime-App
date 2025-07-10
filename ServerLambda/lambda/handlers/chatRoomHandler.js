const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamodb = new AWS.DynamoDB.DocumentClient();

// Environment variables
const CHAT_ROOMS_TABLE = process.env.CHAT_ROOMS_TABLE || "ChatRooms";
const CONNECTIONS_TABLE = process.env.CONNECTIONS_TABLE || "Connections";
const MESSAGES_TABLE = process.env.MESSAGES_TABLE || "Messages";
const CHAT_ROOM_RADIUS = 500; // meters
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const MAX_PARTICIPANTS = 20;

// Calculate distance between coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Broadcast message to all room participants
async function sendToRoom(roomId, data) {
  try {
    // Get room details
    const roomResult = await dynamodb
      .get({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
      })
      .promise();

    if (!roomResult.Item || roomResult.Item.status !== "active") {
      console.warn(`Room ${roomId} not active or not found`);
      return;
    }

    const participants = roomResult.Item.participants;

    // Get all connections for participants
    const connectionPromises = participants.map((userId) =>
      dynamodb
        .query({
          TableName: CONNECTIONS_TABLE,
          IndexName: "UserIdIndex",
          KeyConditionExpression: "userId = :userId",
          ExpressionAttributeValues: { ":userId": userId },
        })
        .promise()
    );

    const connectionResults = await Promise.all(connectionPromises);
    const connections = connectionResults.flatMap((res) => res.Items);

    // Get WebSocket endpoint
    const endpoint = process.env.WEBSOCKET_ENDPOINT;
    if (!endpoint) {
      throw new Error("WEBSOCKET_ENDPOINT environment variable is not set");
    }

    const apigwManagementApi = new AWS.ApiGatewayManagementApi({
      apiVersion: "2018-11-29",
      endpoint: endpoint.replace("wss://", ""),
    });

    // Send to all active connections
    await Promise.all(
      connections.map(async (connection) => {
        try {
          await apigwManagementApi
            .postToConnection({
              ConnectionId: connection.connectionId,
              Data: JSON.stringify(data),
            })
            .promise();
        } catch (err) {
          if (err.statusCode === 410) {
            // Stale connection
            console.log(
              `Deleting stale connection: ${connection.connectionId}`
            );
            await dynamodb
              .delete({
                TableName: CONNECTIONS_TABLE,
                Key: { connectionId: connection.connectionId },
              })
              .promise();
          } else {
            console.error(
              `Error sending to connection ${connection.connectionId}:`,
              err
            );
          }
        }
      })
    );
  } catch (error) {
    console.error("Error in sendToRoom:", error);
  }
}

exports.connectHandler = async (event) => {
  const { connectionId } = event.requestContext;
  const userId = event.queryStringParameters?.userId;

  if (!userId) {
    return { statusCode: 400, body: "Missing userId" };
  }

  try {
    await dynamodb
      .put({
        TableName: CONNECTIONS_TABLE,
        Item: {
          connectionId,
          userId,
          connectedAt: Date.now(),
        },
      })
      .promise();

    return { statusCode: 200 };
  } catch (error) {
    console.error("Connect error:", error);
    return { statusCode: 500, body: "Failed to connect: " + error.message };
  }
};

exports.disconnectHandler = async (event) => {
  const { connectionId } = event.requestContext;

  try {
    // Get connection record to find user ID
    const connection = await dynamodb.get({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId }
    }).promise();
    
    if (!connection.Item) {
      console.log('Connection not found during disconnect');
      return { statusCode: 200 };
    }
    
    const userId = connection.Item.userId;
    
    // Find all rooms where user is a participant using scan
    const roomsResult = await dynamodb.scan({
      TableName: CHAT_ROOMS_TABLE,
      FilterExpression: 'contains(participants, :userId) AND #status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':userId': userId,
        ':status': 'active'
      }
    }).promise();
    
    // Remove user from all rooms
    await Promise.all(roomsResult.Items.map(async (room) => {
      const newParticipants = room.participants.filter(id => id !== userId);
      
      await dynamodb.update({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: room.id },
        UpdateExpression: 'SET participants = :participants, lastActivity = :now',
        ExpressionAttributeValues: {
          ':participants': newParticipants,
          ':now': Date.now()
        }
      }).promise();
      
      // Broadcast user left event
      await sendToRoom(room.id, {
        type: 'user-left',
        userId,
        roomId: room.id
      });
    }));
    
    // Finally remove the connection
    await dynamodb.delete({
      TableName: CONNECTIONS_TABLE,
      Key: { connectionId }
    }).promise();
    
    return { statusCode: 200 };
  } catch (error) {
    console.error('Disconnect error:', error);
    return { statusCode: 500, body: 'Failed to disconnect: ' + error.message };
  }
};

 
exports.messageHandler = async (event) => {
  const { connectionId } = event.requestContext;
  const body = JSON.parse(event.body);
  const { action } = body;

  try {
    // Get connection to find user ID
    const connection = await dynamodb
      .get({
        TableName: CONNECTIONS_TABLE,
        Key: { connectionId },
      })
      .promise();

    if (!connection.Item) {
      return { statusCode: 404, body: "Connection not found" };
    }

    const userId = connection.Item.userId;

    switch (action) {
      case "join-room":
        return await handleJoinRoom(body, userId, connectionId);

      case "send-message":
        return await handleSendMessage(body, userId);

      case "user-typing":
        return await handleUserTyping(body, userId);

      case "room-info":
        return await handleRoomInfo(body, userId);

      case "close-room":
        return await handleCloseRoom(body, userId);

      default:
        return { statusCode: 400, body: "Invalid action" };
    }
  } catch (error) {
    console.error("Message handler error:", error);
    return { statusCode: 500, body: "Internal server error: " + error.message };
  }
};

// ======================
// Action Handlers
// ======================

async function handleJoinRoom(body, userId, connectionId) {
  const { roomId } = body;

  try {
    // Get room details
    const roomResult = await dynamodb
      .get({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
      })
      .promise();

    const room = roomResult.Item;

    if (!room || room.status !== "active") {
      return { statusCode: 404, body: "Room not found or inactive" };
    }

    // Check if user is already in room
    if (!room.participants.includes(userId)) {
      // Add user to participants
      await dynamodb
        .update({
          TableName: CHAT_ROOMS_TABLE,
          Key: { id: roomId },
          UpdateExpression:
            "SET participants = list_append(participants, :userId), lastActivity = :now",
          ExpressionAttributeValues: {
            ":userId": [userId],
            ":now": Date.now(),
          },
        })
        .promise();
      await dynamodb
        .update({
          TableName: CONNECTIONS_TABLE,
          Key: { connectionId },
          UpdateExpression: "SET roomId = :roomId",
          ExpressionAttributeValues: {
            ":roomId": roomId,
          },
        })
        .promise();
    }

    // Broadcast user joined event
    await sendToRoom(roomId, {
      type: "user-joined",
      userId,
      userName: body.userName,
      userIcon: body.userIcon,
      userColor: body.userColor,
      creatorId: room.creator,
      roomInfo: {
        ...room,
        participants: [...room.participants, userId],
      },
    });

    return { statusCode: 200 };
  } catch (error) {
    console.error("Join room error:", error);
    return { statusCode: 500, body: "Failed to join room: " + error.message };
  }
}

async function handleSendMessage(body, userId) {
  const { roomId, messageId, message, userName, userIcon, userColor } = body;

  if (!roomId || !messageId || !message) {
    return { statusCode: 400, body: "Missing parameters" };
  }

  try {
    // Verify room exists and is active
    const roomResult = await dynamodb
      .get({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
      })
      .promise();

    if (!roomResult.Item || roomResult.Item.status !== "active") {
      return { statusCode: 404, body: "Room not found or inactive" };
    }

    // Create message object
    const newMessage = {
      id: messageId,
      text: message,
      createdAt: new Date().toISOString(),
      userId,
      userName,
      userIcon,
      userColor,
    };

    // Save message (optional)
    await dynamodb
      .put({
        TableName: MESSAGES_TABLE,
        Item: {
          roomId,
          messageId,
          ...newMessage,
          ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days TTL
        },
      })
      .promise();

    // Update room activity
    await dynamodb
      .update({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
        UpdateExpression: "SET lastActivity = :now",
        ExpressionAttributeValues: { ":now": Date.now() },
      })
      .promise();

    // Broadcast message to room
    await sendToRoom(roomId, {
      type: "new-message",
      ...newMessage,
    });

    return { statusCode: 200 };
  } catch (error) {
    console.error("Send message error:", error);
    return {
      statusCode: 500,
      body: "Failed to send message: " + error.message,
    };
  }
}

async function handleUserTyping(body, userId) {
  const { roomId } = body;

  if (!roomId) {
    return { statusCode: 400, body: "Missing roomId" };
  }

  try {
    // Broadcast typing indicator to all except sender
    await sendToRoom(roomId, {
      type: "user-typing",
      userId,
      userName: body.userName,
    });

    return { statusCode: 200 };
  } catch (error) {
    console.error("User typing error:", error);
    return {
      statusCode: 500,
      body: "Failed to send typing indicator: " + error.message,
    };
  }
}

async function handleRoomInfo(body, userId) {
  const { roomId } = body;

  if (!roomId) {
    return { statusCode: 400, body: "Missing roomId" };
  }

  try {
    const roomResult = await dynamodb
      .get({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
      })
      .promise();

    if (!roomResult.Item) {
      return { statusCode: 404, body: "Room not found" };
    }

    // Broadcast room info
    await sendToRoom(roomId, {
      type: "room-info",
      ...roomResult.Item,
    });

    return { statusCode: 200 };
  } catch (error) {
    console.error("Room info error:", error);
    return { statusCode: 500, body: "Failed to get room info" };
  }
}

async function handleCloseRoom(body, userId) {
  const { roomId } = body;

  if (!roomId) {
    return { statusCode: 400, body: "Missing roomId" };
  }

  try {
    // Get room details
    const roomResult = await dynamodb
      .get({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
      })
      .promise();

    const room = roomResult.Item;

    if (!room) {
      return { statusCode: 404, body: "Room not found" };
    }

    // Only creator can close room
    if (room.creator !== userId) {
      return { statusCode: 403, body: "Unauthorized" };
    }

    // Close room
    await dynamodb
      .update({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": "closed" },
      })
      .promise();

    // Broadcast room closed event
    await sendToRoom(roomId, {
      type: "room-closed",
    });

    return { statusCode: 200 };
  } catch (error) {
    console.error("Close room error:", error);
    return { statusCode: 500, body: "Failed to close room" };
  }
}

// ======================
// HTTP Handlers
// ======================

exports.createRoomHandler = async (event) => {
  const body = JSON.parse(event.body);
  const { userId, latitude, longitude, roadName, roomType, maxParticipants } =
    body;

  try {
    const roomId = uuidv4();
    const newRoom = {
      id: roomId,
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
      },
      roadName,
      radius: CHAT_ROOM_RADIUS,
      creator: userId,
      participants: [userId],
      lastActivity: Date.now(),
      status: "active",
      roomType: roomType || "public",
      maxParticipants: Math.min(
        parseInt(maxParticipants) || MAX_PARTICIPANTS,
        MAX_PARTICIPANTS
      ),
    };

    await dynamodb
      .put({
        TableName: CHAT_ROOMS_TABLE,
        Item: newRoom,
      })
      .promise();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        roomId,
        roomInfo: newRoom,
      }),
    };
  } catch (error) {
    console.error("Create room error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to create room: " + error.message,
      }),
    };
  }
};

exports.searchRoomsHandler = async (event) => {
  const { latitude, longitude, roomType } = event.queryStringParameters || {};

  if (!latitude || !longitude) {
    return {
      statusCode: 400,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Missing coordinates" }),
    };
  }

  try {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    // Get all active rooms
    const roomsResult = await dynamodb
      .scan({
        TableName: CHAT_ROOMS_TABLE,
        FilterExpression: "#status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": "active" },
      })
      .promise();

    // Filter nearby rooms
    const nearbyRooms = roomsResult.Items.filter((room) => {
      // Filter by room type if specified
      if (roomType && room.roomType !== roomType) return false;

      // Filter by capacity
      if (room.participants.length >= room.maxParticipants) return false;

      // Filter by distance
      const distance = calculateDistance(
        lat,
        lng,
        room.location.latitude,
        room.location.longitude
      );

      return distance <= room.radius;
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(nearbyRooms),
    };
  } catch (error) {
    console.error("Search rooms error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        error: "Failed to search rooms: " + error.message,
      }),
    };
  }
};

exports.joinRoomHandler = async (event) => {
  const body = JSON.parse(event.body);
  const { roomId, userId } = body;

  try {
    // Get room details
    const roomResult = await dynamodb
      .get({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
      })
      .promise();

    const room = roomResult.Item;

    if (!room || room.status !== "active") {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "Room not found or inactive" }),
      };
    }

    // Check room capacity
    if (room.participants.length >= room.maxParticipants) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "Room is full" }),
      };
    }

    // Add user if not already in room
    if (!room.participants.includes(userId)) {
      await dynamodb
        .update({
          TableName: CHAT_ROOMS_TABLE,
          Key: { id: roomId },
          UpdateExpression:
            "SET participants = list_append(participants, :userId), lastActivity = :now",
          ExpressionAttributeValues: {
            ":userId": [userId],
            ":now": Date.now(),
          },
        })
        .promise();
    }

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        success: true,
        roomInfo: {
          ...room,
          participants: [...room.participants, userId],
        },
      }),
    };
  } catch (error) {
    console.error("Join room error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Failed to join room: " + error.message }),
    };
  }
};

exports.closeRoomHandler = async (event) => {
  const body = JSON.parse(event.body);
  const { roomId, userId } = body;

  try {
    // Get room details
    const roomResult = await dynamodb
      .get({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
      })
      .promise();

    const room = roomResult.Item;

    if (!room) {
      return {
        statusCode: 404,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "Room not found" }),
      };
    }

    // Only creator can close room
    if (room.creator !== userId) {
      return {
        statusCode: 403,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "Unauthorized" }),
      };
    }

    // Close room
    await dynamodb
      .update({
        TableName: CHAT_ROOMS_TABLE,
        Key: { id: roomId },
        UpdateExpression: "SET #status = :status",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":status": "closed" },
      })
      .promise();

    // Broadcast room closed event
    await sendToRoom(roomId, {
      type: "room-closed",
    });

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ success: true }),
    };
  } catch (error) {
    console.error("Close room error:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Failed to close room: " + error.message }),
    };
  }
};

// ======================
// Scheduled Cleanup
// ======================

exports.cleanupHandler = async () => {
  const now = Date.now();

  try {
    // Find inactive rooms
    const roomsResult = await dynamodb
      .scan({
        TableName: CHAT_ROOMS_TABLE,
        FilterExpression: "#status = :status AND lastActivity < :timeout",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":status": "active",
          ":timeout": now - INACTIVITY_TIMEOUT,
        },
      })
      .promise();

    // Close inactive rooms
    await Promise.all(
      roomsResult.Items.map(async (room) => {
        await dynamodb
          .update({
            TableName: CHAT_ROOMS_TABLE,
            Key: { id: room.id },
            UpdateExpression: "SET #status = :status",
            ExpressionAttributeNames: { "#status": "status" },
            ExpressionAttributeValues: { ":status": "closed" },
          })
          .promise();

        await sendToRoom(room.id, {
          type: "room-closed",
        });
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Closed ${roomsResult.Items.length} inactive rooms`,
      }),
    };
  } catch (error) {
    console.error("Cleanup error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Cleanup failed: " + error.message }),
    };
  }
};
