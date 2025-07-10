export type Message = {
  id: string;
  text: string;
  createdAt: Date;
  userId: string;
  userName: string;
  userIcon: string;
  userColor: string;
  system?: boolean;
};

export type JamData = {
  duration: string;
  distance: string;
  severity: string;
  confirmed: boolean;
};

export type UserProfile = {
  name: string;
  icon: string;
  color: string;
  userId: string;
};

export type Room = {
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