export const NAV_ITEMS = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Login', href: '/login' },
  { name: 'Register', href: '/register' },
];

export const AUTH_ERRORS = {
  'auth/user-not-found': 'No user found with this email address.',
  'auth/wrong-password': 'Incorrect password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password should be at least 6 characters.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/too-many-requests': 'Too many failed attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Please check your connection.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled.',
  'auth/requires-recent-login': 'Please log in again to complete this action.',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;
