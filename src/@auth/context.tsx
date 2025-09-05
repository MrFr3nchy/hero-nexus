'use client';

import { auth } from '@/lib/firebase';
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail as sendFirebasePasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateEmail as updateFirebaseEmail,
  updatePassword as updateFirebasePassword,
  updateProfile as updateFirebaseProfile,
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthContextType, FirebaseError } from './types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: unknown) {
      throw error as FirebaseError;
    }
  };

  const register = async (
    email: string,
    password: string,
    displayName?: string
  ) => {
    try {
      const result = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      if (displayName && result.user) {
        await updateFirebaseProfile(result.user, { displayName });
      }
    } catch (error: unknown) {
      throw error as FirebaseError;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error: unknown) {
      throw error as FirebaseError;
    }
  };

  const updateProfile = async (data: {
    displayName?: string;
    photoURL?: string;
  }) => {
    if (!currentUser) throw new Error('No user logged in');
    try {
      await updateFirebaseProfile(currentUser, data);
    } catch (error: unknown) {
      throw error as FirebaseError;
    }
  };

  const updateEmail = async (email: string) => {
    if (!currentUser) throw new Error('No user logged in');
    try {
      await updateFirebaseEmail(currentUser, email);
    } catch (error: unknown) {
      throw error as FirebaseError;
    }
  };

  const updatePassword = async (password: string) => {
    if (!currentUser) throw new Error('No user logged in');
    try {
      await updateFirebasePassword(currentUser, password);
    } catch (error: unknown) {
      throw error as FirebaseError;
    }
  };

  const sendPasswordResetEmail = async (email: string) => {
    try {
      await sendFirebasePasswordResetEmail(auth, email);
    } catch (error: unknown) {
      throw error as FirebaseError;
    }
  };

  const value: AuthContextType = {
    currentUser,
    loading,
    login,
    register,
    logout,
    updateProfile,
    updateEmail,
    updatePassword,
    sendPasswordResetEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
