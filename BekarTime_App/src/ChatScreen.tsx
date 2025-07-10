import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  FlatList, 
  ActivityIndicator, 
  Animated, 
  KeyboardAvoidingView, 
  Platform, 
  BackHandler, 
  AppState, 
  Alert, 
  Keyboard , 
  Easing
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import dayjs from "dayjs";
import ReconnectingWebSocket from "react-native-reconnecting-websocket";
import { WEBSOCKET_URL, MAX_PARTICIPANTS } from "../Constant/constants";
import { makeRequest } from "../Constant/api";
import styles from "../Constant/styles";
import { Message, Room, UserProfile } from "../Constant/types";
 
const ChatScreen = ({ navigation, route }: any) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomCreatorId, setRoomCreatorId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [roomInfo, setRoomInfo] = useState<Room | null>(null);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const wsRef = useRef<ReconnectingWebSocket | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const { roadName, location, userProfile, foundRooms } = route.params;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const messageIdsRef = useRef(new Set<string>());
  const typingTimeoutRef = useRef<any>(null);

  const leaveRoom = useCallback(() => {
    if (wsRef.current && roomId) {
      wsRef.current.send(
        JSON.stringify({
          action: "leave-room",
          roomId: roomId,
          userId: userProfile.userId,
          userName: userProfile.name,
          userIcon: userProfile.icon,
          userColor: userProfile.color,
        })
      );
      wsRef.current.close(1000);
      wsRef.current = null;
    }
  }, [roomId, userProfile]);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      if (nextAppState === "background" || nextAppState === "inactive") {
        leaveRoom();
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        leaveRoom();
        navigation.goBack();
        return true;
      }
    );

    return () => backHandler.remove();
  }, [leaveRoom]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start();

    setupChatRoom();

    return () => {
      leaveRoom();
    };
  }, []);

  const setupChatRoom = async () => {
    try {
      let roomIdToUse: string | null = null;

      if (foundRooms && foundRooms.length > 0) {
        roomIdToUse = foundRooms[0].id;
        const joinResponse = await makeRequest("POST", "/join-room", {
          roomId: roomIdToUse,
          userId: userProfile.userId,
        });

        if (joinResponse.statusCode === 200 && joinResponse.data.success) {
          if (joinResponse.data.creatorId) {
            setRoomCreatorId(joinResponse.data.creatorId);
          }
          setRoomInfo(joinResponse.data.roomInfo);
          addSystemMessage(`Joined chat room for ${roadName}`);
        }
      } else {
        const response = await makeRequest(
          "GET",
          `/search-rooms?latitude=${location.latitude}&longitude=${
            location.longitude
          }&roadName=${encodeURIComponent(roadName)}`
        );

        if (
          response.statusCode === 200 &&
          Array.isArray(response.data) &&
          response.data.length > 0
        ) {
          const availableRooms = response.data.filter(
            (room: Room) =>
              room.roadName === roadName &&
              room.participants.length < room.maxParticipants
          );

          if (availableRooms.length > 0) {
            roomIdToUse = availableRooms[0].id;
            const joinResponse = await makeRequest("POST", "/join-room", {
              roomId: roomIdToUse,
              userId: userProfile.userId,
            });

            if (joinResponse.statusCode === 200 && joinResponse.data.success) {
              if (joinResponse.data.creatorId) {
                setRoomCreatorId(joinResponse.data.creatorId);
              }
              setRoomInfo(joinResponse.data.roomInfo);
              addSystemMessage(`Joined chat room for ${roadName}`);
            }
          }
        }
      }

      if (!roomIdToUse) {
        const createResponse = await makeRequest("POST", "/create-room", {
          userId: userProfile.userId,
          latitude: location.latitude,
          longitude: location.longitude,
          roadName: roadName,
          roomType: "public",
          maxParticipants: MAX_PARTICIPANTS,
        });

        if (createResponse.statusCode === 200 && createResponse.data.roomId) {
          roomIdToUse = createResponse.data.roomId;
          setRoomCreatorId(userProfile.userId);
          setRoomInfo(createResponse.data.roomInfo);
          addSystemMessage(`Created chat room for ${roadName}`);
        }
      }

      if (roomIdToUse) {
        setRoomId(roomIdToUse);
        connectWebSocket(roomIdToUse);
      } else {
        Alert.alert("Error", "Failed to create or join chat room");
      }
    } catch (error) {
      console.error("Room setup error:", error);
      Alert.alert("Error", "Failed to set up chat room");
    }
  };

  const connectWebSocket = (roomId: string) => {
    const ws = new ReconnectingWebSocket(
      `${WEBSOCKET_URL}?userId=${userProfile.userId}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(
        JSON.stringify({
          action: "join-room",
          roomId: roomId,
          userId: userProfile.userId,
          userName: userProfile.name,
          userIcon: userProfile.icon,
          userColor: userProfile.color,
        })
      );
      addSystemMessage("Welcome to JamChat! Chat with others in this traffic jam");
    };

    ws.onmessage = (event: any) => {
      try {
        const messageData = JSON.parse(event.data);
        handleWebSocketMessage(messageData);
      } catch (error) {
        console.error("Error parsing WebSocket message:", error);
      }
    };

    ws.onerror = (event: any) => {
      console.error("WebSocket error:", event);
    };

    ws.onclose = (event: any) => {
      setIsConnected(false);
    };
  };

  const handleWebSocketMessage = (messageData: any) => {
    switch (messageData.type) {
      case "new-message":
        if (!messageIdsRef.current.has(messageData.id)) {
          messageIdsRef.current.add(messageData.id);
          setMessages((prev) => {
            if (prev.some((m) => m.id === messageData.id)) return prev;
            return [
              ...prev,
              {
                id: messageData.id,
                text: messageData.text,
                createdAt: new Date(messageData.createdAt),
                userId: messageData.userId,
                userName: messageData.userName,
                userIcon: messageData.userIcon,
                userColor: messageData.userColor,
              },
            ];
          });
          scrollToBottom();
        }
        break;

      case "user-joined":
        if (messageData.userId !== userProfile.userId) {
          addSystemMessage(`${messageData.userName} joined the chat`);
          if (messageData.creatorId) {
            setRoomCreatorId(messageData.creatorId);
          }
          if (messageData.roomInfo) {
            setRoomInfo(messageData.roomInfo);
          }
        }
        break;

      case "user-left":
        if (messageData.userId !== userProfile.userId) {
          addSystemMessage(`Someone left the chat`);
          if (messageData.roomInfo) {
            setRoomInfo(messageData.roomInfo);
          }
        }
        break;

      case "room-info":
        if (messageData.creatorId) {
          setRoomCreatorId(messageData.creatorId);
        }
        if (messageData.roomInfo) {
          setRoomInfo(messageData.roomInfo);
        }
        break;

      case "room-closed":
        addSystemMessage("🔒 Room closed by owner");
        if (wsRef.current) {
          wsRef.current.close();
        }
        break;

      case "user-typing":
        if (messageData.userId !== userProfile.userId) {
          setTypingUser(messageData.userName);
          setIsTyping(true);

          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }

          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
            setTypingUser(null);
          }, 3000);
        }
        break;

      default:
        console.log("Unknown message type:", messageData);
    }
  };

  const addSystemMessage = (text: string) => {
    const systemMessage: Message = {
      id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: text,
      createdAt: new Date(),
      userId: "system",
      userName: "System",
      userIcon: "info",
      userColor: "#666",
      system: true,
    };

    messageIdsRef.current.add(systemMessage.id);
    setMessages((prev) => [...prev, systemMessage]);
    scrollToBottom();
  };

  const sendMessage = () => {
    if (!inputText.trim() || !roomId || !wsRef.current || isSending) return;

    setIsSending(true);

    const newMessage: Message = {
      id: `${userProfile.userId}-${Date.now()}-${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      text: inputText.trim(),
      createdAt: new Date(),
      userId: userProfile.userId,
      userName: userProfile.name,
      userIcon: userProfile.icon,
      userColor: userProfile.color,
    };

    messageIdsRef.current.add(newMessage.id);
    setMessages((prev) => [...prev, newMessage]);

    wsRef.current.send(
      JSON.stringify({
        action: "send-message",
        roomId: roomId,
        userId: userProfile.userId,
        userName: userProfile.name,
        userIcon: userProfile.icon,
        userColor: userProfile.color,
        message: inputText.trim(),
        messageId: newMessage.id,
      })
    );

    setInputText("");
    scrollToBottom();
    Keyboard.dismiss();
    setIsSending(false);
  };

  const handleTextChange = (text: string) => {
    setInputText(text);

    if (text.length > 0 && wsRef.current && roomId) {
      wsRef.current.send(
        JSON.stringify({
          action: "user-typing",
          roomId: roomId,
          userId: userProfile.userId,
          userName: userProfile.name,
        })
      );
    } else {
      setIsTyping(false);
      setTypingUser(null);
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isCurrentUser = item.userId === userProfile.userId;
    const isCreator = item.userId === roomCreatorId;
    const isSystem = item.userId === "system";

    if (isSystem) {
      return (
        <View key={`${item.id}-${index}`} style={styles.systemMessageContainer}>
          <Text style={styles.systemMessageText}>{item.text}</Text>
        </View>
      );
    }

    return (
      <Animated.View
        key={`${item.id}-${index}`}
        style={[
          styles.messageContainer,
          isCurrentUser ? styles.currentUserMessage : styles.otherUserMessage,
          {
            opacity: 1,
            transform: [{ scale: 1 }],
          },
        ]}
      >
        <View style={styles.messageHeader}>
          <MaterialCommunityIcons
            name={item.userIcon as any}
            size={20}
            color={isCreator ? "#ff9f43" : item.userColor}
          />
          <Text
            style={[
              styles.messageUsername,
              isCreator && { color: "#ff9f43" },
              { color: item.userColor },
            ]}
          >
            {item.userName}
          </Text>
          <Text style={styles.messageTime}>
            {dayjs(item.createdAt).format("h:mm A")}
          </Text>
        </View>

        <Text
          style={[
            styles.messageText,
            isCurrentUser ? styles.currentUserText : styles.otherUserText,
          ]}
        >
          {item.text}
        </Text>
      </Animated.View>
    );
  };

  const renderTypingIndicator = () => {
    if (isTyping && typingUser) {
      return (
        <View style={styles.typingContainer}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.typingText}>{typingUser} is typing...</Text>
        </View>
      );
    }
    return null;
  };

  const renderSendButton = () => (
    <TouchableOpacity
      style={[styles.sendButton, !isConnected && styles.disabledButton]}
      onPress={sendMessage}
      disabled={!isConnected || inputText.trim().length === 0}
    >
      <Ionicons name="send" size={20} color="#fff" />
    </TouchableOpacity>
  );

  return (
    <Animated.View style={[styles.chatContainer, { opacity: fadeAnim }]}>
      <View style={styles.chatHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            leaveRoom();
            navigation.goBack();
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>

        <View style={styles.chatHeaderCenter}>
          <Text style={styles.chatTitle}>BekarTime</Text>
          <Text style={styles.chatSubtitle}>{roadName}</Text>
          {roomInfo && (
            <Text style={styles.participantCount}>
              {roomInfo.participants.length} / {roomInfo.maxParticipants}{" "}
              participants
            </Text>
          )}
        </View>

        <View style={styles.connectionStatus}>
          <View
            style={[styles.connectionDot, isConnected && styles.connectedDot]}
          />
          <Text style={styles.connectionText}>
            {isConnected ? "Connected" : "Disconnected"}
          </Text>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
        ListFooterComponent={renderTypingIndicator}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        windowSize={21}
        initialNumToRender={15}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={handleTextChange}
            placeholder="Message anonymously..."
            placeholderTextColor="#888"
            editable={isConnected}
            multiline
          />
          {renderSendButton()}
        </View>
      </KeyboardAvoidingView>
    </Animated.View>
  );
};

export default ChatScreen;