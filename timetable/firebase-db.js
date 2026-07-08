// --- firebase-db.js ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBjofFZckWumoJR0oubhM7Xh7Era1lF8QU",
  authDomain: "egyi-18050.firebaseapp.com",
  databaseURL: "https://egyi-18050-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "egyi-18050",
  storageBucket: "egyi-18050.firebasestorage.app",
  messagingSenderId: "237004207210",
  appId: "1:237004207210:web:00f4165b81c89033510613",
  measurementId: "G-GH0CWZ7LDL"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export async function saveSubjectColor(subjectName, colorCode, type) {
    try {
        const resolvedType = type || "Előadás";
        const docId = `${subjectName.trim()}_${resolvedType.trim()}`.toLowerCase();
        await setDoc(doc(db, "subjects", docId), {
            name: subjectName.trim(),
            color: colorCode,
            type: resolvedType
        });
        return true;
    } catch (e) {
        console.error("Hiba: ", e);
        return false;
    }
}

export async function deleteSubjectColor(subjectName, type) {
    try {
        const resolvedType = type || "Előadás";
        const docId = `${subjectName.trim()}_${resolvedType.trim()}`.toLowerCase();
        await deleteDoc(doc(db, "subjects", docId));
        return true;
    } catch (e) {
        console.error("Hiba a törlésnél: ", e);
        return false;
    }
}

export async function getSubjects() {
    const subjects = {};
    try {
        const querySnapshot = await getDocs(collection(db, "subjects"));
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const key = `${data.name.trim()}_${(data.type || 'Előadás').trim()}`.toLowerCase();
            subjects[key] = { color: data.color, name: data.name, type: data.type };
        });
    } catch (e) {
        console.error("Hiba: ", e);
    }
    return subjects; 
}

export async function saveStructureToDB(structureData) {
    try {
        await setDoc(doc(db, "settings", "university_structure"), structureData);
        return true;
    } catch (e) {
        console.error("Hiba a struktúra mentésekor: ", e);
        return false;
    }
}

export async function getStructureFromDB() {
    try {
        const docSnap = await getDoc(doc(db, "settings", "university_structure"));
        if (docSnap.exists()) {
            return docSnap.data();
        }
    } catch (e) {
        console.error("Hiba a struktúra betöltésekor: ", e);
    }
    return { modules: [], sessions: [], vacations: [] }; // Alapértelmezett üres struktúra, vakációkkal kibővítve
}