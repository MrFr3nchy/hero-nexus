import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';

// Generic function to add a document to a collection
export async function addDocument<T = Record<string, unknown>>(
  collectionName: string,
  data: T
) {
  try {
    const docRef = await addDoc(collection(db, collectionName), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    console.log('Document written with ID: ', docRef.id);
    return docRef;
  } catch (error) {
    console.error('Error adding document: ', error);
    throw error;
  }
}

// Generic function to get a document by ID
export async function getDocument(collectionName: string, docId: string) {
  try {
    const docRef = doc(db, collectionName, docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    console.log('No such document!');
    return null;
  } catch (error) {
    console.error('Error getting document: ', error);
    throw error;
  }
}

// Generic function to get all documents from a collection
export async function getDocuments(collectionName: string) {
  try {
    const querySnapshot = await getDocs(collection(db, collectionName));
    const documents: Array<{ id: string; [key: string]: unknown }> = [];
    querySnapshot.forEach(doc => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    return documents;
  } catch (error) {
    console.error('Error getting documents: ', error);
    throw error;
  }
}

// Generic function to update a document
export async function updateDocument<T = Record<string, unknown>>(
  collectionName: string,
  docId: string,
  data: T
) {
  try {
    const docRef = doc(db, collectionName, docId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
    console.log('Document updated successfully');
  } catch (error) {
    console.error('Error updating document: ', error);
    throw error;
  }
}

// Generic function to delete a document
export async function deleteDocument(collectionName: string, docId: string) {
  try {
    await deleteDoc(doc(db, collectionName, docId));
    console.log('Document deleted successfully');
  } catch (error) {
    console.error('Error deleting document: ', error);
    throw error;
  }
}

// Function to listen to real-time updates
export function subscribeToCollection(
  collectionName: string,
  callback: (_documents: Array<{ id: string; [key: string]: unknown }>) => void
) {
  const q = query(collection(db, collectionName));
  return onSnapshot(q, querySnapshot => {
    const documents: Array<{ id: string; [key: string]: unknown }> = [];
    querySnapshot.forEach(doc => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    callback(documents);
  });
}
