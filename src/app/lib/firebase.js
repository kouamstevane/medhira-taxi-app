// lib/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";



const firebaseConfig = {
  apiKey: "AIzaSyDMXeXZCFAVGeSFW_-3MYkrqV2bN1SXY-8",
  authDomain: "medjira-service.firebaseapp.com",
  projectId: "medjira-service",
  storageBucket: "medjira-service.firebasestorage.app",
  messagingSenderId: "113581657187",
  appId: "1:113581657187:web:cd8e2ef19a25b4a424bc56",
  measurementId: "G-3LNHS26HML"
};
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
