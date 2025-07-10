import { registerRootComponent } from 'expo';

import App from './App';
import Test from './Test';
import MapScreen from './app/MapScreen';
import MainApp from './MainApp';
// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(MainApp);
