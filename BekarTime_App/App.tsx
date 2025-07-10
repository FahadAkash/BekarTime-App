import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  Alert,
  Keyboard,
  AppState,
  BackHandler,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import {
  MaterialIcons,
  FontAwesome5,
  Ionicons,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import * as Location from "expo-location";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { NavigationContainer } from "@react-navigation/native";
import { Easing } from "react-native";
import ReconnectingWebSocket from "react-native-reconnecting-websocket";
import dayjs from "dayjs";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";

// Server configuration
// const HTTP_API_URL = 'https://e28zv9qrel.execute-api.us-east-1.amazonaws.com';
// const WEBSOCKET_URL = 'wss://kexwpc7csc.execute-api.us-east-1.amazonaws.com/dev';

// const HTTP_API_URL = 'https://vje6kk8yvc.execute-api.us-east-1.amazonaws.com';
// const WEBSOCKET_URL = 'wss://q2tw875cma.execute-api.us-east-1.amazonaws.com/prod';
const HTTP_API_URL = 'https://xwpyyt3pmf.execute-api.us-east-1.amazonaws.com';
const WEBSOCKET_URL = 'wss://34qwxy2i4i.execute-api.us-east-1.amazonaws.com/beta';
// Types
type Message = {
  id: string;
  text: string;
  createdAt: Date;
  userId: string;
  userName: string;
  userIcon: string;
  userColor: string;
  system?: boolean;
};

type JamData = {
  duration: string;
  distance: string;
  severity: string;
  confirmed: boolean;
};

type UserProfile = {
  name: string;
  icon: string;
  color: string;
  userId: string;
};

type Room = {
  creator: string;
  id: string;
  lastActivity: number;
  location: {
    latitude: number;
    longitude: number;
  };
  maxParticipants: number;
  participants: string[];
  roadName: string;
  roomType: "public" | "private";
  status: "active" | "inactive";
};

// Config
const GOOGLE_API_KEY = "AIzaSyBHR-dXAEvmqVyxGTAwAZ_oWiEEVHWzBGw";
const SIMULATION_MODE = true;
const { width, height } = Dimensions.get("window");
const MAX_PARTICIPANTS = 20;

// Dhaka coordinates
const DEFAULT_COORDS: Region = {
  latitude: 23.8103,
  longitude: 90.4125,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Vehicle icons
const VEHICLE_ICONS = [
  { name: "car", icon: "car", color: "#3498db" },
  { name: "bus", icon: "bus", color: "#e74c3c" },
  { name: "truck", icon: "truck", color: "#2ecc71" },
  { name: "bike", icon: "bike", color: "#f39c12" },
  { name: "scooter", icon: "moped", color: "#9b59b6" },
];

// Create stack navigator
const Stack = createNativeStackNavigator();

// Helper function to make HTTP requests
async function makeRequest(method: string, path: string, data: any = null) {
  const url = HTTP_API_URL + path;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const responseData = await response.json();
    return { statusCode: response.status, data: responseData };
  } catch (error) {
    console.error("Request error:", error);
    throw error;
  }
}

// ======================
// Map Screen Component
// ======================
const MapScreen = ({ navigation }: any) => {
  // State
  const [location, setLocation] = useState<Region>(DEFAULT_COORDS);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [currentRoad, setCurrentRoad] = useState<string>("");
  const [inTrafficJam, setInTrafficJam] = useState(false);
  const [jamData, setJamData] = useState<JamData>({
    duration: "0 min",
    distance: "0 km",
    severity: "None",
    confirmed: false,
  });
  const [loading, setLoading] = useState(false);
  const [isFindingPeople, setIsFindingPeople] = useState(false);
  const [canJoinChat, setCanJoinChat] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [userId] = useState<string>(
    `user-${Date.now()}-${Math.floor(Math.random() * 1000)}`
  );
  const [foundRooms, setFoundRooms] = useState<Room[]>([]);

  // Animation refs
  const jamAlertAnim = useRef(new Animated.Value(0)).current;
  const checkButtonAnim = useRef(new Animated.Value(1)).current;

  // Refs
  const mapRef = useRef<MapView>(null);
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  const jamTimerRef = useRef<any>(null);
  const findingPeopleTimerRef = useRef<any>(null);

  // Initialize location tracking
  useEffect(() => {
    const initLocationTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        alert("Location permission denied");
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      updateLocation(loc);

      Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 10,
          timeInterval: 5000,
        },
        updateLocation
      );
    };

    initLocationTracking();

    // Animate traffic jam alert when it appears
    if (inTrafficJam) {
      Animated.spring(jamAlertAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      jamAlertAnim.setValue(0);
    }
  }, [inTrafficJam]);

  /** Update location and calculate speed */
  const updateLocation = (newLocation: Location.LocationObject) => {
    const newRegion: Region = {
      latitude: newLocation.coords.latitude,
      longitude: newLocation.coords.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    setLocation(newRegion);
    setGpsAccuracy(newLocation.coords.accuracy);

    // Calculate speed
    if (lastLocationRef.current) {
      const speed = calculateSpeed(lastLocationRef.current, newLocation);
      setCurrentSpeed(speed);
      checkTrafficJam(newLocation, speed);
    }

    lastLocationRef.current = newLocation;
    updateRoadInfo(newLocation);
  };

  /** Calculate speed between two points */
  const calculateSpeed = (
    prevLoc: Location.LocationObject,
    currentLoc: Location.LocationObject
  ): number => {
    const timeDiff = (currentLoc.timestamp - prevLoc.timestamp) / 1000;
    if (timeDiff <= 0) return 0;

    const distance = haversineDistance(
      prevLoc.coords.latitude,
      prevLoc.coords.longitude,
      currentLoc.coords.latitude,
      currentLoc.coords.longitude
    );

    return (distance / timeDiff) * 3.6; // km/h
  };

  /** Haversine distance calculation */
  function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // ======================
  // Traffic Jam Detection
  // ======================

  /** Main traffic jam detection logic */
  const checkTrafficJam = async (
    location: Location.LocationObject,
    speed: number
  ) => {
    // Skip if GPS accuracy is poor
    if (gpsAccuracy && gpsAccuracy > 20) return;

    // Conditions for potential jam
    const isPotentialJam = speed < 10;

    if (isPotentialJam) {
      if (!jamTimerRef.current) {
        jamTimerRef.current = setTimeout(async () => {
          setLoading(true);

          if (SIMULATION_MODE) {
            confirmTrafficJam();
          } else {
            const isConfirmed = await verifyWithGoogleMaps(location);
            if (isConfirmed) confirmTrafficJam();
          }

          jamTimerRef.current = null;
          setLoading(false);
        }, 120000);
      }
    } else {
      if (jamTimerRef.current) {
        clearTimeout(jamTimerRef.current);
        jamTimerRef.current = null;
      }
      if (inTrafficJam) endTrafficJam();
    }
  };

  /** Verify traffic with Google Maps API */
  const verifyWithGoogleMaps = async (
    location: Location.LocationObject
  ): Promise<boolean> => {
    try {
      const destination = {
        latitude: location.coords.latitude + 0.01,
        longitude: location.coords.longitude + 0.01,
      };

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?` +
          `origin=${location.coords.latitude},${location.coords.longitude}` +
          `&destination=${destination.latitude},${destination.longitude}` +
          `&departure_time=now` +
          `&traffic_model=best_guess` +
          `&key=${GOOGLE_API_KEY}`
      );

      const data = await response.json();

      if (data.routes?.[0]?.legs?.[0]) {
        const trafficDuration =
          data.routes[0].legs[0].duration_in_traffic?.value;
        const normalDuration = data.routes[0].legs[0].duration?.value;

        return trafficDuration > normalDuration * 1.5;
      }
      return false;
    } catch (error) {
      console.error("Google Maps API error:", error);
      return false;
    }
  };

  /** Find available chat rooms */
  const findNearbyRooms = async () => {
    try {
      const response = await makeRequest(
        "GET",
        `/search-rooms?latitude=${location.latitude}&longitude=${
          location.longitude
        }&roomType=${"public"}`
      );

      if (response.statusCode === 200 && Array.isArray(response.data)) {
        // Filter by available capacity
        const availableRooms = response.data.filter(
          (room: Room) => room.participants.length < room.maxParticipants
        );

        setFoundRooms(availableRooms);
        return availableRooms.length > 0;
      }
      return false;
    } catch (error) {
      console.error("Room search error:", error);
      return false;
    }
  };

  /** Confirm traffic jam is active */
  const confirmTrafficJam = async () => {
    setInTrafficJam(true);
    setJamData({
      duration: "15+ min",
      distance: "1.5 km",
      severity: "High",
      confirmed: true,
    });

    // Start finding people
    setIsFindingPeople(true);

    // Find available rooms
    const foundRooms = await findNearbyRooms();

    // If rooms found, allow joining immediately
    if (foundRooms) {
      setIsFindingPeople(false);
      setCanJoinChat(true);
    } else {
      // Simulate finding people for 5 seconds
      findingPeopleTimerRef.current = setTimeout(() => {
        setIsFindingPeople(false);
        setCanJoinChat(true);
      }, 5000);
    }
  };

  /** End traffic jam status */
  const endTrafficJam = () => {
    setInTrafficJam(false);
    setCanJoinChat(false);
    setJamData({
      duration: "0 min",
      distance: "0 km",
      severity: "None",
      confirmed: false,
    });
    setFoundRooms([]);

    if (findingPeopleTimerRef.current) {
      clearTimeout(findingPeopleTimerRef.current);
      findingPeopleTimerRef.current = null;
    }
  };

  /** Manual traffic check */
  const manualTrafficCheck = async () => {
    setIsChecking(true);
    Animated.timing(checkButtonAnim, {
      toValue: 0.8,
      duration: 200,
      useNativeDriver: true,
    }).start();

    // Simulate check delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    if (lastLocationRef.current) {
      const isJam = await verifyWithGoogleMaps(lastLocationRef.current);

      if (isJam) {
        confirmTrafficJam();
      } else {
        Alert.alert("Traffic Clear", "No traffic jams detected in your area");
      }
    }

    setIsChecking(false);
    Animated.spring(checkButtonAnim, {
      toValue: 1,
      friction: 6,
      tension: 40,
      useNativeDriver: true,
    }).start();
  };

  // ======================
  // Road Information
  // ======================

  /** Get road name from coordinates */
  const updateRoadInfo = async (location: Location.LocationObject) => {
    if (SIMULATION_MODE) {
      setCurrentRoad("Dhaka-Aricha Highway");
      return;
    }

    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?` +
          `latlng=${location.coords.latitude},${location.coords.longitude}` +
          `&key=${GOOGLE_API_KEY}`
      );

      const data = await response.json();
      const road = data.results?.[0]?.address_components?.find((c: any) =>
        c.types.includes("route")
      )?.long_name;

      if (road) setCurrentRoad(road);
    } catch (error) {
      console.error("Geocoding error:", error);
    }
  };

  // ======================
  // Map Controls
  // ======================

  const zoomIn = () => {
    if (mapRef.current) {
      const newRegion = {
        ...location,
        latitudeDelta: location.latitudeDelta * 0.5,
        longitudeDelta: location.longitudeDelta * 0.5,
      };
      mapRef.current.animateToRegion(newRegion, 1000);
    }
  };

  const zoomOut = () => {
    if (mapRef.current) {
      const newRegion = {
        ...location,
        latitudeDelta: location.latitudeDelta * 2,
        longitudeDelta: location.longitudeDelta * 2,
      };
      mapRef.current.animateToRegion(newRegion, 1000);
    }
  };

  const focusOnUser = () => {
    mapRef.current?.animateToRegion(location, 1000);
  };

  // ======================
  // Simulation Controls
  // ======================

  const simulateTrafficJam = () => {
    confirmTrafficJam();
  };

  const endSimulation = () => {
    endTrafficJam();
  };

  // ======================
  // Navigation
  // ======================

  const joinChatRoom = () => {
    navigation.navigate("UsernameSetup", {
      roadName: currentRoad,
      location: location,
      userId: userId,
      foundRooms: foundRooms,
    });
  };

  // ======================
  // Render
  // ======================

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        region={location}
        provider={PROVIDER_GOOGLE}
        showsUserLocation
        showsTraffic
        showsMyLocationButton={false}
        customMapStyle={LIGHT_MAP_STYLE}
      >
        {inTrafficJam && (
          <Marker coordinate={location}>
            <Animated.View style={styles.jamMarker}>
              <FontAwesome5 name="traffic-light" size={24} color="#ff4757" />
            </Animated.View>
          </Marker>
        )}
      </MapView>

      {/* Map Controls */}
      <View style={styles.mapControls}>
        <TouchableOpacity style={styles.controlButton} onPress={zoomIn}>
          <MaterialIcons name="add" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={zoomOut}>
          <MaterialIcons name="remove" size={24} color="#000" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.controlButton} onPress={focusOnUser}>
          <MaterialIcons name="my-location" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.roadName}>{currentRoad || "Unknown road"}</Text>

        <View style={styles.dataRow}>
          <View style={styles.dataItem}>
            <MaterialIcons name="speed" size={20} color="#666" />
            <Text style={styles.dataText}>{currentSpeed.toFixed(1)} km/h</Text>
          </View>

          <View style={styles.dataItem}>
            <MaterialIcons name="gps-fixed" size={20} color="#666" />
            <Text style={styles.dataText}>{gpsAccuracy?.toFixed(0)}m</Text>
          </View>
        </View>

        {inTrafficJam ? (
          <Animated.View
            style={[
              styles.jamAlert,
              {
                transform: [{ scale: jamAlertAnim }],
                opacity: jamAlertAnim,
              },
            ]}
          >
            <View style={styles.jamHeader}>
              <Text style={styles.jamTitle}>🚨 Traffic Jam Detected</Text>
              {SIMULATION_MODE && (
                <TouchableOpacity onPress={endSimulation}>
                  <Text style={styles.endSimulationText}>End Simulation</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.jamDetails}>
              <View style={styles.jamDetailItem}>
                <Text style={styles.jamDetailLabel}>Duration</Text>
                <Text style={styles.jamDetailValue}>{jamData.duration}</Text>
              </View>

              <View style={styles.jamDetailItem}>
                <Text style={styles.jamDetailLabel}>Severity</Text>
                <Text style={[styles.jamDetailValue, styles.highSeverity]}>
                  {jamData.severity}
                </Text>
              </View>
            </View>

            {isFindingPeople ? (
              <View style={styles.findingPeople}>
                <ActivityIndicator size="small" color="#1e90ff" />
                <Text style={styles.findingPeopleText}>
                  Finding nearby people...
                </Text>
                {foundRooms.length > 0 && (
                  <Text style={styles.roomFoundText}>
                    Found {foundRooms.length} room(s) with{" "}
                    {foundRooms[0].participants.length} participants
                  </Text>
                )}
              </View>
            ) : canJoinChat ? (
              <TouchableOpacity
                style={styles.joinButton}
                onPress={joinChatRoom}
              >
                <Text style={styles.joinButtonText}>Join Chat Room</Text>
                <MaterialIcons
                  name="arrow-forward"
                  size={20}
                  color="#fff"
                  style={styles.joinIcon}
                />
              </TouchableOpacity>
            ) : null}
          </Animated.View>
        ) : (
          <View style={styles.noJamContainer}>
            <Text style={styles.noJam}>✅ No traffic jam detected</Text>

            <Animated.View style={{ transform: [{ scale: checkButtonAnim }] }}>
              <TouchableOpacity
                style={[styles.checkButton, isChecking && { opacity: 0.8 }]}
                onPress={manualTrafficCheck}
                disabled={isChecking}
              >
                {isChecking ? (
                  <>
                    <ActivityIndicator
                      size="small"
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.checkButtonText}>Checking...</Text>
                  </>
                ) : (
                  <Text style={styles.checkButtonText}>Check Traffic Now</Text>
                )}
              </TouchableOpacity>
            </Animated.View>

            {SIMULATION_MODE && (
              <TouchableOpacity
                style={styles.simulateButton}
                onPress={simulateTrafficJam}
              >
                <Text style={styles.simulateButtonText}>
                  Simulate Traffic Jam
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#1e90ff" />
          <Text style={styles.loadingText}>Checking traffic conditions...</Text>
        </View>
      )}
    </View>
  );
};

// ======================
// Username Setup Screen
// ======================
const UsernameSetupScreen = ({ navigation, route }: any) => {
  const [username, setUsername] = useState("");
  const [selectedIcon, setSelectedIcon] = useState(VEHICLE_ICONS[0]);
  const [isValid, setIsValid] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const { roadName, location, userId, foundRooms } = route.params;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      easing: Easing.ease,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    setIsValid(username.trim().length >= 3);
  }, [username]);

  const handleContinue = () => {
    navigation.navigate("Chat", {
      roadName,
      location,
      userProfile: {
        name: username,
        icon: selectedIcon.icon,
        color: selectedIcon.color,
        userId: userId,
      },
      foundRooms,
    });
  };

  return (
    <Animated.View style={[styles.usernameContainer, { opacity: fadeAnim }]}>
      <View style={styles.usernameHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#0f0f0f" />
        </TouchableOpacity>
        <Text style={styles.usernameTitle}>Join Chat Room</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.usernameContent}>
        <Text style={styles.usernameSubtitle}>Set up your profile</Text>

        <View style={styles.usernameForm}>
          <Text style={styles.inputLabel}>Your Name</Text>
          <TextInput
            style={styles.usernameInput}
            placeholder="Enter your name"
            placeholderTextColor="#aaa"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="words"
          />

          <Text style={styles.inputLabel}>Select Vehicle Icon</Text>
          <View style={styles.iconGrid}>
            {VEHICLE_ICONS.map((icon) => (
              <TouchableOpacity
                key={`icon-${icon.name}`}
                style={[
                  styles.iconButton,
                  selectedIcon.name === icon.name && styles.selectedIconButton,
                  { borderColor: icon.color },
                ]}
                onPress={() => setSelectedIcon(icon)}
              >
                <MaterialCommunityIcons
                  name={icon.icon as any}
                  size={32}
                  color={selectedIcon.name === icon.name ? icon.color : "#fff"}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Room info display */}
        {foundRooms.length > 0 && (
          <View style={styles.roomInfoContainer}>
            <Text style={styles.roomInfoTitle}>Available Rooms</Text>
            {foundRooms.map((room: Room, idx: number) => (
              <View key={`room-${room.id}`} style={styles.roomItem}>
                <Text style={styles.roomName}>{room.roadName}</Text>
                <Text style={styles.roomParticipants}>
                  {room.participants.length} / {room.maxParticipants}{" "}
                  participants
                </Text>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueButton, !isValid && styles.disabledButton]}
          onPress={handleContinue}
          disabled={!isValid}
        >
          <Text style={styles.continueButtonText}>Continue to Chat</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

// ======================
// Chat Screen Component
// ======================
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

  /** Leave the chat room and close WebSocket */
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

    // Disable auto-reconnect
    wsRef.current.close(1000);
    wsRef.current = null;
  }
}, [roomId, userProfile]);



  // Handle app state changes
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

  // Handle Android back button
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

  // Initialize chat room
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

  /** Set up chat room (create or join) */
  const setupChatRoom = async () => {
    try {
      let roomIdToUse: string | null = null;

      // Use found room if available
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
        // Search for existing rooms
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
          // Filter by road name and available capacity
          const availableRooms = response.data.filter(
            (room: Room) =>
              room.roadName === roadName &&
              room.participants.length < room.maxParticipants
          );

          if (availableRooms.length > 0) {
            // Join the first available room
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

      // If no room found, create a new one
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

  /** Connect to WebSocket server */
  const connectWebSocket = (roomId: string) => {
    const ws = new ReconnectingWebSocket(
      `${WEBSOCKET_URL}?userId=${userProfile.userId}`
    );
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);

      // Send join-room action to subscribe to the room
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

      // Add welcome message
      addSystemMessage(
        "Welcome to JamChat! Chat with others in this traffic jam"
      );
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

  /** Handle incoming WebSocket messages */
  const handleWebSocketMessage = (messageData: any) => {
    switch (messageData.type) {
      case "new-message":
        // Prevent duplicate messages using unique IDs
        if (!messageIdsRef.current.has(messageData.id)) {
          // Add to tracked IDs
          messageIdsRef.current.add(messageData.id);
          // Add to messages
          setMessages((prev) => {
            // Double-check for duplicates in state
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
          addSystemMessage(`${"Someone"} left the chat`); //messageData.userName
          if (messageData.roomInfo) {
            console.log("Room info on user left:", messageData.roomInfo);
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

          // Clear any existing timeout
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }

          // Set timeout to clear typing indicator
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

  /** Add a system message */
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

    // Add to tracked IDs
    messageIdsRef.current.add(systemMessage.id);
    // Update messages state
    setMessages((prev) => [...prev, systemMessage]);
    scrollToBottom();
  };

  /** Send a new message */
  const sendMessage = () => {
    if (!inputText.trim() || !roomId || !wsRef.current || isSending) return;

    setIsSending(true);

    // Create message object with unique ID
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

    // Add to tracked IDs
    messageIdsRef.current.add(newMessage.id);

    // Add to local state with duplicate check
    setMessages((prev) => [...prev, newMessage]);

    // Send message through WebSocket
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

  /** Handle typing */
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

  /** Scroll to bottom of chat */
  const scrollToBottom = () => {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  /** Render message item with animation */
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

  /** Render typing indicator */
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

  /** Render send button */
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
              {roomInfo.participants.length } / {roomInfo.maxParticipants}{" "}
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

// ======================
// App Component
// ======================
const App = () => {
  return (
    <NavigationContainer>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: "#fff" },
          }}
        >
          <Stack.Screen name="Map" component={MapScreen} />
          <Stack.Screen name="UsernameSetup" component={UsernameSetupScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
        </Stack.Navigator>
      </SafeAreaView>
    </NavigationContainer>
  );
};

// ======================
// Styles
// ======================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  map: { flex: 1 },
  mapControls: {
    position: "absolute",
    top: 60,
    right: 16,
    alignItems: "center",
  },
  controlButton: {
    width: 48,
    height: 48,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 24,
    marginVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  infoPanel: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 16,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(15, 160, 228, 0.05)",
  },
  roadName: {
    fontWeight: "700",
    fontSize: 18,
    color: "#333",
    marginBottom: 12,
  },
  checkButton: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1e90ff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    minHeight: 48,
  },

  checkButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  participantCount: { fontSize: 12, color: "#666", marginTop: 2 },
  disabledButton: { backgroundColor: "#ccc" },
  roomInfoContainer: {
    backgroundColor: "rgba(240, 240, 240, 0.9)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  usernameTitle: { fontSize: 20, fontWeight: "700", color: "#333" },
  usernameContent: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    marginTop: -50,
  },
  usernameSubtitle: {
    fontSize: 28,
    fontWeight: "700",
    color: "#333",
    marginBottom: 32,
    textAlign: "center",
  },
  usernameForm: { marginBottom: 32 },
  inputLabel: {
    fontSize: 16,
    color: "#333",
    marginBottom: 8,
    fontWeight: "500",
  },
  jamMarker: {
    backgroundColor: "rgba(255,255,255,0.9)",
    padding: 10,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#ff4757",
    shadowColor: "#ff4757",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 5,
  },
  simulateButton: {
    backgroundColor: "rgba(46, 213, 115, 0.2)",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "rgba(46, 213, 115, 0.3)",
  },
  simulateButtonText: {
    color: "#2ed573",
    fontSize: 16,
    fontWeight: "600",
  },
  roomInfoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
    textAlign: "center",
  },
  roomItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  roomName: { fontSize: 16, color: "#333" },
  roomParticipants: { fontSize: 14, color: "#666" },
  usernameContainer: { flex: 1, backgroundColor: "#fff" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: "#333" },
  usernameHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 60,
    backgroundColor: "rgba(255,255,255,0.9)",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  continueButton: {
    backgroundColor: "#1e90ff",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  continueButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginRight: 10,
  },
  usernameInput: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    padding: 16,
    color: "#333",
    fontSize: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginTop: 8,
  },
  iconButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(19, 17, 17, 0.9)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedIconButton: {
    borderColor: "#1e90ff",
    backgroundColor: "rgba(240, 240, 240, 1)",
    transform: [{ scale: 1.1 }],
  },
  messagesContainer: { flex: 1, backgroundColor: "#fff" },
  messagesContent: { paddingBottom: 20, paddingTop: 10 },
  otherUserText: { color: "#333" },
  messageContainer: {
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    maxWidth: "80%",
  },
  messageText: { fontSize: 16, lineHeight: 22 },
  currentUserMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#2e2d2d",
    borderTopRightRadius: 4,
  },
  otherUserMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#f0f0f0",
    borderTopLeftRadius: 4,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  messageUsername: {
    fontWeight: "600",
    marginLeft: 6,
    marginRight: 10,
    fontSize: 14,
  },
  typingContainer: {
    padding: 10,
    paddingBottom: 20,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  currentUserText: { color: "#fff" },
  chatContainer: { flex: 1, backgroundColor: "#fff" },
  connectionStatus: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(240,240,240,0.9)",
    borderRadius: 15,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chatTitle: { fontSize: 20, fontWeight: "700", color: "#333" },
  chatSubtitle: { fontSize: 14, color: "#1e90ff", marginTop: 4 },
  backButton: {
    backgroundColor: "rgba(240, 240, 240, 0.9)",
    borderRadius: 20,
    padding: 8,
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ff4757",
    marginRight: 5,
  },
  connectedDot: { backgroundColor: "#2ed573" },
  messageTime: { color: "#888", fontSize: 12 },
  systemMessageContainer: {
    alignItems: "center",
    marginVertical: 10,
  },
  systemMessageText: {
    color: "#888",
    backgroundColor: "rgba(240, 240, 240, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    fontSize: 14,
  },
  connectionText: { color: "#333", fontSize: 12 },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    paddingTop: 60,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  typingText: { color: "#666", fontStyle: "italic", marginLeft: 8 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  textInput: {
    flex: 1,
    backgroundColor: "rgba(240, 240, 240, 0.9)",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: "#333",
    fontSize: 16,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  sendButton: {
    backgroundColor: "#1e90ff",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  chatHeaderCenter: {
    alignItems: "center",
    flex: 1,
  },
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  dataItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  dataText: {
    marginLeft: 6,
    fontSize: 16,
    fontWeight: "500",
    color: "#555",
  },
  jamAlert: {
    backgroundColor: "rgba(255, 71, 87, 0.1)",
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#ff4757",
  },
  jamHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  jamTitle: { fontWeight: "700", fontSize: 18, color: "#ff4757" },
  endSimulationText: { color: "#1e90ff", fontWeight: "500", fontSize: 14 },
  jamDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  jamDetailItem: { alignItems: "center" },
  jamDetailLabel: { fontSize: 14, color: "#777", marginBottom: 4 },
  jamDetailValue: { fontSize: 18, fontWeight: "700", color: "#333" },
  highSeverity: { color: "#ff4757" },
  findingPeople: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  findingPeopleText: {
    marginLeft: 8,
    color: "#1e90ff",
    fontWeight: "500",
  },
  roomFoundText: {
    marginTop: 8,
    color: "#2ed573",
    fontWeight: "600",
    textAlign: "center",
  },
  noJamContainer: { alignItems: "center", paddingVertical: 8 },
  noJam: { fontSize: 16, fontWeight: "500", color: "#2ed573" },
  joinButton: {
    backgroundColor: "#1e90ff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    flexDirection: "row",
    justifyContent: "center",
  },
  joinIcon: { marginLeft: 8 },
  joinButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});

const LIGHT_MAP_STYLE = [
  {
    elementType: "geometry",
    stylers: [
      {
        color: "#f5f5f5",
      },
    ],
  },
  {
    elementType: "labels.icon",
    stylers: [
      {
        visibility: "off",
      },
    ],
  },
  {
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#616161",
      },
    ],
  },
  {
    elementType: "labels.text.stroke",
    stylers: [
      {
        color: "#f5f5f5",
      },
    ],
  },
  {
    featureType: "administrative.land_parcel",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#bdbdbd",
      },
    ],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [
      {
        color: "#eeeeee",
      },
    ],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#757575",
      },
    ],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [
      {
        color: "#e5e5e5",
      },
    ],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#9e9e9e",
      },
    ],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [
      {
        color: "#ffffff",
      },
    ],
  },
  {
    featureType: "road.arterial",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#757575",
      },
    ],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [
      {
        color: "#dadada",
      },
    ],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#616161",
      },
    ],
  },
  {
    featureType: "road.local",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#9e9e9e",
      },
    ],
  },
  {
    featureType: "transit.line",
    elementType: "geometry",
    stylers: [
      {
        color: "#e5e5e5",
      },
    ],
  },
  {
    featureType: "transit.station",
    elementType: "geometry",
    stylers: [
      {
        color: "#eeeeee",
      },
    ],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [
      {
        color: "#c9c9c9",
      },
    ],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [
      {
        color: "#9e9e9e",
      },
    ],
  },
];

export default App;