/**
 * Paste the web app config from the Firebase console here
 * (Project settings → General → Your apps → SDK setup and configuration → Config).
 * These values are public identifiers, not secrets: access is controlled by
 * firestore.rules, which only lets the allow-listed Google accounts in.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyDGv_3OxvTQNtlCRlQvYBknR1HyhyF2-2c',
  authDomain: 'minecraft-notes-bcca2.firebaseapp.com',
  projectId: 'minecraft-notes-bcca2',
  storageBucket: 'minecraft-notes-bcca2.firebasestorage.app',
  messagingSenderId: '975928945148',
  appId: '1:975928945148:web:e676928dd37a525b966a79',
};

export const isConfigured = firebaseConfig.apiKey !== '' || import.meta.env.VITE_USE_EMULATOR === 'true';
