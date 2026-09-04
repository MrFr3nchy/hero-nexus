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
  login: (_email: string, _password: string) => Promise<void>;
  register: (
    _email: string,
    _password: string,
    _displayName?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (_data: {
    displayName?: string;
    image?: string;
  }) => Promise<void>;
  updateEmail: (_email: string, _currentPassword: string) => Promise<void>;
  updatePassword: (
    _currentPassword: string,
    _newPassword: string
  ) => Promise<void>;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  createdAt: string;
}
