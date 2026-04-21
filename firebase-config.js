
const firebaseConfig = {
  apiKey: "AIzaSyAQm0lmkOGOKCr03RCJ6PJs1H8qORdX2VA",
  authDomain: "foodbridge-9f237.firebaseapp.com",
  projectId: "foodbridge-9f237",
  storageBucket: "foodbridge-9f237.firebasestorage.app",
  messagingSenderId: "4653538704",
  appId: "1:4653538704:web:4a056519d2520bd17b2715",
  measurementId: "G-4E77FCYCQK"
};

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const storage = getStorage(app);

export { auth, db, storage };
