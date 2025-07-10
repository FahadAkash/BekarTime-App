import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapScreen from './src/MapScreen';
import UsernameSetupScreen from './src/UsernameSetupScreen';
import ChatScreen from './src/ChatScreen';

const Stack = createNativeStackNavigator();

const MainApp = () => {
  return (
    <NavigationContainer>
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
    </NavigationContainer>
  );
};

export default MainApp;