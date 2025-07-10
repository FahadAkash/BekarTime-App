import React, { useState, useEffect, useRef } from "react";
import { 
  View, 
  Text, 
  TouchableOpacity, 
  TextInput, 
  Animated, 
  Easing, 
  StyleSheet 
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

// Vehicle icons definition
const VEHICLE_ICONS = [
  { name: "car", icon: "car", color: "#3498db" },
  { name: "bus", icon: "bus", color: "#e74c3c" },
  { name: "truck", icon: "truck", color: "#2ecc71" },
  { name: "bike", icon: "bike", color: "#f39c12" },
  { name: "scooter", icon: "moped", color: "#9b59b6" },
];

// Room type definition
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
      {/* Fixed: Wrap all content in a single parent View */}
      <View style={{ flex: 1 }}>
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

          {/* Fixed room information display */}
          {foundRooms.length > 0 && (
            <View style={styles.roomInfoContainer}>
              <Text style={styles.roomInfoTitle}>Available Rooms</Text>
              {foundRooms.map((room: Room) => (
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
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  usernameContainer: { 
    flex: 1, 
    backgroundColor: "#fff" 
  },
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
  backButton: {
    backgroundColor: "rgba(240, 240, 240, 0.9)",
    borderRadius: 20,
    padding: 8,
  },
  usernameTitle: { 
    fontSize: 20, 
    fontWeight: "700", 
    color: "#333" 
  },
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
  usernameForm: { 
    marginBottom: 32 
  },
  inputLabel: {
    fontSize: 16,
    color: "#333",
    marginBottom: 8,
    fontWeight: "500",
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
  roomInfoContainer: {
    backgroundColor: "rgba(240, 240, 240, 0.9)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
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
  roomName: { 
    fontSize: 16, 
    color: "#333" 
  },
  roomParticipants: { 
    fontSize: 14, 
    color: "#666" 
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
  disabledButton: { 
    backgroundColor: "#ccc" 
  },
});

export default UsernameSetupScreen;