import { User } from 'firebase/auth';

export interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  login: (_email: string, _password: string) => Promise<void>;
  register: (
    _email: string,
    _password: string,
    _displayName?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (_data: {
    displayName?: string;
    photoURL?: string;
  }) => Promise<void>;
  updateEmail: (_email: string) => Promise<void>;
  updatePassword: (_password: string) => Promise<void>;
  sendPasswordResetEmail: (_email: string) => Promise<void>;
}

export interface FirebaseError {
  code: string;
  message: string;
}

export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: Date;
  lastLoginAt: Date;
}
