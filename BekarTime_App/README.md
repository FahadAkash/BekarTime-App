# BekarTime App - README

This project is a React Native application built with Expo,  

## 🚀 Getting Started

Follow these instructions to set up the project on your local machine.

### Prerequisites
- Node.js (v18 or higher recommended)
- npm (v9 or higher)
- Expo CLI (`npm install -g expo-cli`)
- Android Studio/Xcode (for emulator/simulator) or Expo Go app (for physical device)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/FahadAkash/BekarTime-App.git
   cd BekarTime_App
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create a `.env` file in the root directory with the following content:
   ```env
   HTTP_API_URL="your_http_api_url_here"
   WEBSOCKET_URL="your_websocket_url_here"
   GOOGLE_API_KEY="your_google_api_key_here"
   SIMULATION_MODE="false"  # Set to "false" for production
   ```

### Running the App

Start the development server:
```bash
npx expo start
```

You can then:
- Press `a` to run on Android emulator
- Press `i` to run on iOS simulator
- Scan the QR code with the Expo Go app (on your physical device)

### Building for Production

To create a production build:
```bash
eas build -p android --profile preview
```

## 📁 Project Structure

```
project-root/
├── .env                   # Environment variables
├── assets/                # Static assets (images, fonts, etc.)
├── components/            # Reusable UI components
├── constants/             # Application constants
├── context/               # React context providers
├── hooks/                 # Custom React hooks
├── navigation/            # App navigation setup
├── screens/               # Application screens
├── services/              # API services and utilities
├── store/                 # State management (Redux/Zustand)
├── theme/                 # Styling and theming
├── utils/                 # Utility functions
├── App.tsx                 # Main application component
└── package.json           # Project dependencies
```

## ⚙️ Configuration

The application uses the following environment variables:

| Variable          | Description                                     | Example Value                     |
|-------------------|-------------------------------------------------|-----------------------------------|
| `HTTP_API_URL`    | Base URL for HTTP API requests                 | `https://api.example.com/v1`     |
| `WEBSOCKET_URL`   | URL for WebSocket connections                  | `wss://ws.example.com`           |
| `GOOGLE_API_KEY`  | API key for Google services (Maps, etc.)       | `AIzaSyAbc...xyz`                |
| `SIMULATION_MODE` | Enable mock data/simulated features            | `"true"` or `"false"`            |

## 📦 Dependencies

Key dependencies used in this project:

- **React Navigation** - Routing and navigation 
- **React Native Maps** - Map integration (requires Google API key)
- **Reanimated** - Smooth animations

- **dotenv** - Environment variable management

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 📧 Contact

For support or questions, contact [fahadakash@protonmail.com](mailto:fahadakash@protonmail.com)