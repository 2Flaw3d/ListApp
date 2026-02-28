import { initializeApp } from "firebase/app";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  signInWithPopup,
  signInWithRedirect,
  signOut
} from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
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
  where,
  writeBatch
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

let auth;
try {
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence]
  });
} catch {
  auth = getAuth(app);
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /iPhone|iPad|iPod/i.test(ua);
}

function isIosStandaloneMode() {
  if (typeof window === "undefined") return false;
  const standaloneByMedia = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const standaloneByNavigator = window.navigator?.standalone === true;
  return isIosDevice() && (standaloneByMedia || standaloneByNavigator);
}

function sortItems(a, b) {
  const aOrder = Number.isFinite(a?.order) ? a.order : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(b?.order) ? b.order : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;

  const aSec = a?.createdAt?.seconds ?? 0;
  const bSec = b?.createdAt?.seconds ?? 0;
  if (aSec !== bSec) return aSec - bSec;

  const aNs = a?.createdAt?.nanoseconds ?? 0;
  const bNs = b?.createdAt?.nanoseconds ?? 0;
  if (aNs !== bNs) return aNs - bNs;

  return a.id.localeCompare(b.id);
}

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
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserProfile(result.user);
    return;
  } catch (e) {
    const code = e?.code || "";
    const message = e?.message || "";

    const popupBlocked = code.includes("popup-blocked") || code.includes("cancelled-popup-request");
    const popupClosedByUser = code.includes("popup-closed-by-user");
    const popupUnsupported = code.includes("operation-not-supported-in-this-environment");

    if (popupClosedByUser) {
      throw e;
    }

    if (isIosStandaloneMode() && (popupBlocked || popupUnsupported)) {
      throw new Error("Popup Google bloccato su iPhone web app. Apri in Safari e fai login da browser.");
    }

    if (popupBlocked || popupUnsupported) {
      await signInWithRedirect(auth, googleProvider);
      return;
    }

    throw new Error(message || "Login Google non riuscito.");
  }
}

async function completeRedirectSignIn() {
  const result = await getRedirectResult(auth);
  if (result?.user) {
    await ensureUserProfile(result.user);
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

async function renameSpace(spaceId, name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Inserisci un nome spazio valido.");
  await updateDoc(doc(db, "spaces", spaceId), {
    name: cleanName,
    updatedAt: serverTimestamp()
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

async function updateMemberRole(spaceId, memberId, role) {
  if (!["viewer", "editor"].includes(role)) {
    throw new Error("Ruolo non valido.");
  }

  const memberRef = doc(db, "spaces", spaceId, "members", memberId);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) throw new Error("Membro non trovato.");
  if (snap.data().role === "owner") throw new Error("Non puoi modificare il ruolo owner.");

  await updateDoc(memberRef, {
    role,
    updatedAt: serverTimestamp()
  });
}

async function removeMember(spaceId, memberId) {
  const memberRef = doc(db, "spaces", spaceId, "members", memberId);
  const snap = await getDoc(memberRef);
  if (!snap.exists()) return;
  if (snap.data().role === "owner") throw new Error("Non puoi rimuovere il proprietario.");
  await deleteDoc(memberRef);
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

async function renameList(listId, name) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Inserisci un nome lista valido.");

  await updateDoc(doc(db, "lists", listId), {
    name: cleanName,
    updatedAt: serverTimestamp()
  });
}

async function addItem(user, listId, text) {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Inserisci un elemento.");

  const itemsSnap = await getDocs(collection(db, "lists", listId, "items"));
  let maxOrder = 0;
  itemsSnap.docs.forEach((d) => {
    const order = d.data().order;
    if (Number.isFinite(order) && order > maxOrder) {
      maxOrder = order;
    }
  });

  await addDoc(collection(db, "lists", listId, "items"), {
    text: cleanText,
    completed: false,
    completedAt: null,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    order: maxOrder + 1
  });

  await updateDoc(doc(db, "lists", listId), {
    updatedAt: serverTimestamp()
  });
}

async function renameItem(listId, itemId, text) {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Inserisci un testo valido.");

  await updateDoc(doc(db, "lists", listId, "items", itemId), {
    text: cleanText,
    updatedAt: serverTimestamp()
  });
}

async function moveItem(listId, itemId, direction) {
  if (!["up", "down"].includes(direction)) return;

  const itemsSnap = await getDocs(collection(db, "lists", listId, "items"));
  const rows = itemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort(sortItems);

  const currentIndex = rows.findIndex((x) => x.id === itemId);
  if (currentIndex === -1) return;

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= rows.length) return;

  const current = rows[currentIndex];
  const target = rows[targetIndex];

  const currentOrder = Number.isFinite(current.order) ? current.order : currentIndex + 1;
  const targetOrder = Number.isFinite(target.order) ? target.order : targetIndex + 1;

  const batch = writeBatch(db);
  batch.update(doc(db, "lists", listId, "items", current.id), {
    order: targetOrder,
    updatedAt: serverTimestamp()
  });
  batch.update(doc(db, "lists", listId, "items", target.id), {
    order: currentOrder,
    updatedAt: serverTimestamp()
  });
  await batch.commit();

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

async function deleteItem(listId, itemId) {
  await deleteDoc(doc(db, "lists", listId, "items", itemId));
  await updateDoc(doc(db, "lists", listId), {
    updatedAt: serverTimestamp()
  });
}

async function deleteList(listId) {
  const itemsRef = collection(db, "lists", listId, "items");
  const itemsSnap = await getDocs(itemsRef);

  const batch = writeBatch(db);
  itemsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "lists", listId));
  await batch.commit();
}

async function deleteSpace(spaceId) {
  const membersSnap = await getDocs(collection(db, "spaces", spaceId, "members"));
  const listsSnap = await getDocs(query(collection(db, "lists"), where("spaceId", "==", spaceId)));

  for (const listDoc of listsSnap.docs) {
    const itemsSnap = await getDocs(collection(db, "lists", listDoc.id, "items"));
    const itemsBatch = writeBatch(db);
    itemsSnap.docs.forEach((itemDoc) => itemsBatch.delete(itemDoc.ref));
    itemsBatch.delete(listDoc.ref);
    await itemsBatch.commit();
  }

  const membersBatch = writeBatch(db);
  membersSnap.docs.forEach((memberDoc) => membersBatch.delete(memberDoc.ref));
  membersBatch.delete(doc(db, "spaces", spaceId));
  await membersBatch.commit();
}

function watchUserSpaces(userId, onData, onError) {
  const memberSpaces = new Map();
  const ownedSpaces = new Map();

  const emit = () => {
    const merged = new Map([...memberSpaces, ...ownedSpaces]);
    const spaces = [...merged.values()].sort((a, b) => {
      const aSec = a?.updatedAt?.seconds ?? 0;
      const bSec = b?.updatedAt?.seconds ?? 0;
      return bSec - aSec;
    });
    onData(spaces);
  };

  const membershipsQ = query(
    collectionGroup(db, "members"),
    where("uid", "==", userId),
    orderBy("addedAt", "desc")
  );

  const ownedSpacesQ = query(collection(db, "spaces"), where("ownerId", "==", userId));

  const unsubMembers = onSnapshot(
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

      memberSpaces.clear();
      spaces.filter(Boolean).forEach((space) => memberSpaces.set(space.id, space));
      emit();
    },
    onError
  );

  const unsubOwned = onSnapshot(
    ownedSpacesQ,
    (snap) => {
      ownedSpaces.clear();
      snap.docs.forEach((d) => ownedSpaces.set(d.id, { id: d.id, ...d.data() }));
      emit();
    },
    onError
  );

  return () => {
    unsubMembers();
    unsubOwned();
  };
}

function watchMembers(spaceId, onData, onError) {
  const membersQ = query(collection(db, "spaces", spaceId, "members"), orderBy("addedAt", "asc"));
  return onSnapshot(
    membersQ,
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
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
  const itemsRef = collection(db, "lists", listId, "items");
  return onSnapshot(
    itemsRef,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort(sortItems);
      onData(rows);
    },
    onError
  );
}

export {
  auth,
  createList,
  createSpace,
  renameSpace,
  addItem,
  renameList,
  renameItem,
  moveItem,
  deleteItem,
  deleteList,
  deleteSpace,
  inviteMemberByEmail,
  updateMemberRole,
  removeMember,
  loginWithGoogle,
  completeRedirectSignIn,
  logout,
  syncUserProfile,
  toggleItem,
  watchItems,
  watchLists,
  watchMembers,
  watchUserSpaces
};
