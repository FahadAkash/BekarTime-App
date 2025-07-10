![Cover Image](Assets/BGCover.jpg) 
# 🚗 BekarTime — Talk While You're Stuck

_Because traffic won't move, but conversation can._

**BekarTime** is a location-aware, anonymous chat app for folks stuck in traffic. Think of it as spontaneous adda for strangers on the same road—fun, quick, and gone as soon as the road clears. Built with **React Native + Expo**, this app embraces downtime and turns it into connection time.

---

## 📲 Features

- 📡 **Location-Based Matching**: Automatically connects you with people stuck in the same traffic zone.
- 💬 **Anonymous Conversations**: Chat without revealing your identity.
- 🚦 **Jam Zones**: Detects congestion areas dynamically using geolocation APIs.
- 🎭 **Temp Chat Rooms**: Conversations expire after you leave the traffic zone.
- 🔐 **Local-first, Secure Design**: Minimal data shared, built with privacy in mind.

---

## 🛠️ Built With

| Stack        | Details                              |
|--------------|---------------------------------------|
| React Native | Cross-platform mobile app framework   |
| Expo         | For fast dev, preview, and OTA updates |
| TypeScript   | For predictable, maintainable code     |
| Expo Location | Geolocation services                   |
| Amazon Aws Lambda  | For real-time chat backend, auth |
| WebSocket / Socket.io | Real-time messaging engine |
| React Navigation | Seamless screen transitions       |

---

## 📦 Installation

Clone the repo and get started:

```bash
git clone https://github.com/yourusername/BekarTime.git
cd BekarTime
npm install
npx expo start
```

> ⚠️ Requires `expo-cli` to be installed globally.

---

## ⚙️ Configuration

You'll need API keys for the following:

- **Expo Location API** – For accessing user’s GPS data
- **Firebase (or Supabase)** – For realtime backend (chat, presence, etc.)
- Optional: **Traffic API** (e.g., HERE Maps or TomTom) if you want live jam detection

Create a `.env` file in the project root:

```env
GOOGLE_MAP_API=your_key_here
HTTP_API_URL=your_http_api_url
WEBSOCKET_URL=your_websocket_endpoint
```

And load it with something like `expo-constants`.

---

## 📁 Project Structure APP

```
BekarTime_APP/
├── assets/
├── Constant/
│   └── api.ts
|   └── constant.ts
|   └── styles.ts
|   └── types.ts
├── src/
│   └── ChatScreen.tsx
│   └── MapScreen.tsx
│   └── UsernameSetupScreen.tsx
├── App.tsx
└── app.json
```

---


## 📁 Server Setup Structure  

```
ServerLambda/
├── lambda/
|   └── handlers/
│      └── chatRoomHandler.js (main socket server)
|── serverless.yml
 
```

---

## 🧪 Development

Enable fast refresh and debugging with Expo’s built-in tools.

For WebSocket testing:
```bash
npx websocat ws://localhost:3000
```

Use mock GPS data in Expo Go:
1. Shake your device
2. Click on "Location"
3. Choose your traffic hotspot 📍

---

## 🚧 Roadmap

- [ ] Real-time traffic zone visualization
- [ ] Voice chat support
- [ ] Adaptive UI for jam intensity
- [ ] Offline fallback using local mesh?

---

## 🤝 Contributing

Pull requests are welcome! Submit ideas via Issues if you've got a spicy new feature in mind.

---

## 🧠 Inspiration

Inspired by the weird silence of traffic jams and the human instinct to connect—even when going nowhere fast.

---

## 📃 License

MIT License. Do whatever makes traffic more bearable.

---

> _“BekarTime. Because even a jam deserves a little adda.”_
 

 
