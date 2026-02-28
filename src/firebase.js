import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

async function ensureUserProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const payload = {
    uid: user.uid,
    email: user.email ?? "",
    emailLower: (user.email ?? "").toLowerCase(),
    displayName: user.displayName ?? "Utente",
    photoURL: user.photoURL ?? "",
    lastSeenAt: serverTimestamp()
  };

  if (!snap.exists()) {
    await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
    return;
  }
  await updateDoc(ref, payload);
}

async function loginWithGoogle() {
  await setPersistence(auth, browserLocalPersistence);
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(result.user);
  } catch {
    await signInWithRedirect(auth, googleProvider);
  }
}

function logout() {
  return signOut(auth);
}

async function syncUserProfile(user) {
  if (!user) return;
  await ensureUserProfile(user);
}

async function createSpace(user, name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Inserisci un nome spazio.");

  const spaceRef = await addDoc(collection(db, "spaces"), {
    name: cleanName,
    ownerId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, "spaces", spaceRef.id, "members", user.uid), {
    uid: user.uid,
    role: "owner",
    email: user.email ?? "",
    emailLower: (user.email ?? "").toLowerCase(),
    displayName: user.displayName ?? "Owner",
    addedAt: serverTimestamp()
  });
}

async function inviteMemberByEmail(spaceId, rawEmail) {
  const emailLower = rawEmail.trim().toLowerCase();
  if (!emailLower) throw new Error("Inserisci una email valida.");

  const usersQ = query(collection(db, "users"), where("emailLower", "==", emailLower));
  const usersSnap = await getDocs(usersQ);
  if (usersSnap.empty) {
    throw new Error("Utente non trovato. Deve fare almeno un login prima.");
  }

  const userDoc = usersSnap.docs[0];
  await setDoc(doc(db, "spaces", spaceId, "members", userDoc.id), {
    uid: userDoc.id,
    role: "editor",
    email: userDoc.data().email ?? "",
    emailLower,
    displayName: userDoc.data().displayName ?? "Editor",
    addedAt: serverTimestamp()
  });
}

async function createList(user, spaceId, name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Inserisci un nome lista.");

  await addDoc(collection(db, "lists"), {
    name: cleanName,
    spaceId,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

async function addItem(user, listId, text) {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Inserisci un elemento.");

  await addDoc(collection(db, "lists", listId, "items"), {
    text: cleanText,
    completed: false,
    completedAt: null,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await updateDoc(doc(db, "lists", listId), {
    updatedAt: serverTimestamp()
  });
}

async function toggleItem(listId, itemId, completed) {
  await updateDoc(doc(db, "lists", listId, "items", itemId), {
    completed,
    completedAt: completed ? serverTimestamp() : null,
    updatedAt: serverTimestamp()
  });

  await updateDoc(doc(db, "lists", listId), {
    updatedAt: serverTimestamp()
  });
}

function watchUserSpaces(userId, onData, onError) {
  const membershipsQ = query(
    collectionGroup(db, "members"),
    where("uid", "==", userId),
    orderBy("addedAt", "desc")
  );

  return onSnapshot(
    membershipsQ,
    async (snap) => {
      const spaceRefs = snap.docs.map((d) => d.ref.parent.parent).filter(Boolean);
      const unique = [...new Map(spaceRefs.map((r) => [r.path, r])).values()];
      const spaces = await Promise.all(
        unique.map(async (ref) => {
          const spaceSnap = await getDoc(ref);
          return spaceSnap.exists() ? { id: spaceSnap.id, ...spaceSnap.data() } : null;
        })
      );
      onData(spaces.filter(Boolean));
    },
    onError
  );
}

function watchLists(spaceId, onData, onError) {
  const listsQ = query(collection(db, "lists"), where("spaceId", "==", spaceId), orderBy("updatedAt", "desc"));
  return onSnapshot(
    listsQ,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

function watchItems(listId, onData, onError) {
  const itemsQ = query(collection(db, "lists", listId, "items"), orderBy("createdAt", "asc"));
  return onSnapshot(
    itemsQ,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export {
  auth,
  createList,
  createSpace,
  addItem,
  inviteMemberByEmail,
  loginWithGoogle,
  logout,
  syncUserProfile,
  toggleItem,
  watchItems,
  watchLists,
  watchUserSpaces
};
