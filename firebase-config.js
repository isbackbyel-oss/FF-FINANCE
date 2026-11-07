import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC1YyjRogeT5RWKKnrmyyUOoVoWci0qJOg",
  authDomain: "ff-finance-7dad9.firebaseapp.com",
  projectId: "ff-finance-7dad9",
  storageBucket: "ff-finance-7dad9.firebasestorage.app",
  messagingSenderId: "691291153311",
  appId: "1:691291153311:web:d5cb9fd49c82b5d0af13aa"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
