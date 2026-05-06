import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAOa6fGHpW4nx00GLrF2_G3DdOG312TDLg",
  authDomain: "libreria-edumaco-41b3a.firebaseapp.com",
  projectId: "libreria-edumaco-41b3a",
  storageBucket: "libreria-edumaco-41b3a.firebasestorage.app",
  messagingSenderId: "1012842569967",
  appId: "1:1012842569967:web:1df6008b8aff8d1d4bbb1a"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;