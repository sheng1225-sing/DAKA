import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, addDoc, serverTimestamp, onSnapshot, query, orderBy } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDUAoFCmZmJ_nAhDkB_DRypP5vW5xQnf-0",
  authDomain: "daka-1225.firebaseapp.com",
  projectId: "daka-1225",
  storageBucket: "daka-1225.appspot.com",
  messagingSenderId: "145106147517",
  appId: "1:145106147517:web:f285c495ba0340acb53fd4",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export const placesRef = collection(db, "places");
export { db, getDocs, addDoc, serverTimestamp, onSnapshot, query, orderBy };
