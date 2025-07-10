import { StyleSheet, Text, View } from 'react-native'
import React from 'react'
import MapView from 'react-native-maps'
const Test : React.FC = () => {
  return (
    <View>
      <Text>test</Text>
      <MapView
        style={{ width: '100%', height: 400 }}
        initialRegion={{
          latitude: 37.78825,
          longitude: -122.4324,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
      />
    </View>
  )
}

export default Test

const styles = StyleSheet.create({})