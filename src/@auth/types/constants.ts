export const NAV_ITEMS = [
  { name: 'Home', href: '/' },
  { name: 'About', href: '/about' },
  { name: 'FAQ', href: '/faq' },
  { name: 'Login', href: '/login' },
  { name: 'Register', href: '/register' },
];

/** Local auth error codes (Firebase codes are gone). */
export const AUTH_ERRORS = {
  'invalid-credentials': 'Incorrect email or password.',
  'email-in-use': 'An account with this email already exists.',
  'weak-password': 'Password must be at least 8 characters.',
  'invalid-email': 'Please enter a valid email address.',
  'wrong-password': 'Your current password is incorrect.',
  'not-authenticated': 'Please sign in again to complete this action.',
  network: 'Network error. Please check your connection.',
  unknown: 'Something went wrong. Please try again.',
} as const;

export type AuthErrorCode = keyof typeof AUTH_ERRORS;
