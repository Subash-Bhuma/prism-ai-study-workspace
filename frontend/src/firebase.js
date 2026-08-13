const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseEnabled = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);

let authContextPromise;

function withTimeout(promise, milliseconds, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), milliseconds)),
  ]);
}

async function authContext() {
  if (!firebaseEnabled) throw new Error('Google and email sign-in are not configured yet. Use the demo workspace for now.');
  if (!authContextPromise) {
    authContextPromise = Promise.all([import('firebase/app'), import('firebase/auth')]).then(([appSdk, authSdk]) => {
      const app = appSdk.getApps().length ? appSdk.getApp() : appSdk.initializeApp(firebaseConfig);
      return { auth: authSdk.getAuth(app), authSdk };
    });
  }
  return authContextPromise;
}

function friendlyAuthError(error) {
  const messages = {
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow popups and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was cancelled.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/weak-password': 'Choose a password with at least 8 characters.',
  };
  return new Error(messages[error?.code] || error?.message || 'Sign-in could not be completed.');
}

async function sessionFromUser(user) {
  const token = await user.getIdToken();
  const session = {
    token,
    provider: 'firebase',
    user: { id: user.uid, name: user.displayName || user.email?.split('@')[0] || 'Student', email: user.email },
  };
  localStorage.setItem('prism-session', JSON.stringify(session));
  return session;
}

export async function signInWithGoogle() {
  try {
    const { auth, authSdk } = await authContext();
    const provider = new authSdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await authSdk.signInWithPopup(auth, provider);
    return sessionFromUser(credential.user);
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

export async function signInWithEmail(email, password, createAccount = false) {
  try {
    const { auth, authSdk } = await authContext();
    const credential = createAccount
      ? await authSdk.createUserWithEmailAndPassword(auth, email, password)
      : await authSdk.signInWithEmailAndPassword(auth, email, password);
    return sessionFromUser(credential.user);
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

export async function sendResetEmail(email) {
  try {
    const { auth, authSdk } = await authContext();
    await authSdk.sendPasswordResetEmail(auth, email);
  } catch (error) {
    throw friendlyAuthError(error);
  }
}

export async function restoreSession() {
  const stored = JSON.parse(localStorage.getItem('prism-session') || 'null');
  if (!firebaseEnabled || stored?.provider === 'demo') return stored;
  try {
    const { auth } = await authContext();
    await withTimeout(auth.authStateReady(), 5000, 'Firebase session restore timed out');
    return auth.currentUser ? sessionFromUser(auth.currentUser) : null;
  } catch {
    return null;
  }
}

export async function getAccessToken() {
  if (firebaseEnabled) {
    try {
      const { auth } = await authContext();
      await auth.authStateReady();
      if (auth.currentUser) return auth.currentUser.getIdToken();
    } catch {
      // A local demo session does not require Firebase initialization.
    }
  }
  return JSON.parse(localStorage.getItem('prism-session') || 'null')?.token || null;
}

export async function signOutSession() {
  if (firebaseEnabled) {
    try {
      const { auth, authSdk } = await authContext();
      await authSdk.signOut(auth);
    } catch {
      // Clear the local session even if Firebase is temporarily unavailable.
    }
  }
  localStorage.removeItem('prism-session');
}
