import React, { useState, useEffect, useRef } from "react";
import { 
  View, 
  Text, 
  TouchableOpacity, 
  ActivityIndicator, 
  Animated, 
  Dimensions, 
  Alert, 
  Keyboard 
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import { MaterialIcons, FontAwesome5 } from "@expo/vector-icons";
import * as Location from "expo-location";
import { 
  VEHICLE_ICONS, 
  DEFAULT_COORDS, 
  GOOGLE_API_KEY, 
  SIMULATION_MODE, 
  LIGHT_MAP_STYLE, 
  MAX_PARTICIPANTS, 
  HTTP_API_URL 
} from "../Constant/constants";
import { JamData, Room } from "../Constant/types";
import { makeRequest } from "../Constant/api";
import styles from "../Constant/styles";

const MapScreen = ({ navigation }: any) => {
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

  const jamAlertAnim = useRef(new Animated.Value(0)).current;
  const checkButtonAnim = useRef(new Animated.Value(1)).current;
  const mapRef = useRef<MapView>(null);
  const lastLocationRef = useRef<Location.LocationObject | null>(null);
  const jamTimerRef = useRef<any>(null);
  const findingPeopleTimerRef = useRef<any>(null);

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

  const updateLocation = (newLocation: Location.LocationObject) => {
    const newRegion: Region = {
      latitude: newLocation.coords.latitude,
      longitude: newLocation.coords.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    setLocation(newRegion);
    setGpsAccuracy(newLocation.coords.accuracy);

    if (lastLocationRef.current) {
      const speed = calculateSpeed(lastLocationRef.current, newLocation);
      setCurrentSpeed(speed);
      checkTrafficJam(newLocation, speed);
    }

    lastLocationRef.current = newLocation;
    updateRoadInfo(newLocation);
  };

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

    return (distance / timeDiff) * 3.6;
  };

  function haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000;
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

  const checkTrafficJam = async (
    location: Location.LocationObject,
    speed: number
  ) => {
    if (gpsAccuracy && gpsAccuracy > 20) return;

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

  const findNearbyRooms = async () => {
    try {
      const response = await makeRequest(
        "GET",
        `/search-rooms?latitude=${location.latitude}&longitude=${
          location.longitude
        }&roomType=${"public"}`
      );

      if (response.statusCode === 200 && Array.isArray(response.data)) {
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

  const confirmTrafficJam = async () => {
    setInTrafficJam(true);
    setJamData({
      duration: "15+ min",
      distance: "1.5 km",
      severity: "High",
      confirmed: true,
    });

    setIsFindingPeople(true);

    const foundRooms = await findNearbyRooms();

    if (foundRooms) {
      setIsFindingPeople(false);
      setCanJoinChat(true);
    } else {
      findingPeopleTimerRef.current = setTimeout(() => {
        setIsFindingPeople(false);
        setCanJoinChat(true);
      }, 5000);
    }
  };

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

  const simulateTrafficJam = () => {
    confirmTrafficJam();
  };

  const endSimulation = () => {
    endTrafficJam();
  };

  const manualTrafficCheck = async () => {
    setIsChecking(true);
    Animated.timing(checkButtonAnim, {
      toValue: 0.8,
      duration: 200,
      useNativeDriver: true,
    }).start();

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

  const joinChatRoom = () => {
    navigation.navigate("UsernameSetup", {
      roadName: currentRoad,
      location: location,
      userId: userId,
      foundRooms: foundRooms,
    });
  };

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

export default MapScreen;