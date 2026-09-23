export * from './constants';

/** The shape the app uses for the signed-in user (from the Auth.js session). */
export interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
}

/** Thrown by the auth context helpers; carries a user-facing message. */
export interface AuthError {
  code?: string;
  message: string;
}

export interface AuthContextType {
  currentUser: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: {
    displayName?: string;
    image?: string;
  }) => Promise<void>;
  updateEmail: (email: string, currentPassword: string) => Promise<void>;
  updatePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<void>;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
}
