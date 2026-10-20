import { initializeApp } from 'firebase/app'
export const localEmulators =
  import.meta.env.DEV &&
  import.meta.env.VITE_FIREBASE_EMULATORS === 'true' &&
  ['localhost', '127.0.0.1'].includes(location.hostname)
export const app = initializeApp({
  apiKey: 'AIzaSyCOYebX1Rv8HR9pU59fxC8wxLLDcjrFJho',
  authDomain: 'web-app-53618.firebaseapp.com',
  projectId: localEmulators ? 'demo-somewhere' : 'web-app-53618',
  storageBucket: 'web-app-53618.firebasestorage.app',
  messagingSenderId: '385820604011',
  appId: '1:385820604011:web:a61e0ac62e148feefde32e',
})
