import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import {
  addItem,
  auth,
  createList,
  createSpace,
  deleteItem,
  deleteList,
  deleteSpace,
  inviteMemberByEmail,
  loginWithGoogle,
  logout,
  syncUserProfile,
  toggleItem,
  watchItems,
  watchLists,
  watchUserSpaces
} from "./firebase";

function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [spaces, setSpaces] = useState([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [newSpaceName, setNewSpaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [newListName, setNewListName] = useState("");
  const [newItemText, setNewItemText] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (current) => {
      setUser(current);
      if (current) {
        syncUserProfile(current).catch((e) => setError(e.message));
      }
      setLoadingAuth(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setSpaces([]);
      setSelectedSpaceId("");
      return;
    }

    const unsub = watchUserSpaces(
      user.uid,
      (data) => {
        setError("");
        setSpaces(data);
        setSelectedSpaceId((prev) => {
          if (prev && data.some((x) => x.id === prev)) return prev;
          return data[0]?.id ?? "";
        });
      },
      (e) => setError(e.message)
    );
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!selectedSpaceId) {
      setLists([]);
      setSelectedListId("");
      return;
    }

    const unsub = watchLists(
      selectedSpaceId,
      (data) => {
        setError("");
        setLists(data);
        setSelectedListId((prev) => {
          if (prev && data.some((x) => x.id === prev)) return prev;
          return data[0]?.id ?? "";
        });
      },
      (e) => setError(e.message)
    );
    return () => unsub();
  }, [selectedSpaceId]);

  useEffect(() => {
    if (!selectedListId) {
      setItems([]);
      return;
    }

    const unsub = watchItems(
      selectedListId,
      (data) => {
        setError("");
        setItems(data);
      },
      (e) => setError(e.message)
    );
    return () => unsub();
  }, [selectedListId]);

  const activeSpace = useMemo(() => spaces.find((x) => x.id === selectedSpaceId) ?? null, [spaces, selectedSpaceId]);
  const activeList = useMemo(() => lists.find((x) => x.id === selectedListId) ?? null, [lists, selectedListId]);
  const completedCount = items.filter((x) => x.completed).length;
  const isOwner = activeSpace?.ownerId === user?.uid;

  async function withGuard(fn) {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message || "Errore inatteso");
    } finally {
      setBusy(false);
    }
  }

  if (loadingAuth) {
    return <div className="center">Caricamento...</div>;
  }

  if (!user) {
    return (
      <main className="auth">
        <h1>Shared Lists</h1>
        <p>Liste condivise in tempo reale, installabili su iPhone come web app.</p>
        <button onClick={() => withGuard(() => loginWithGoogle())} disabled={busy}>
          Entra con Google
        </button>
        {error ? <p className="error">{error}</p> : null}
      </main>
    );
  }

  return (
    <main className="layout">
      <header className="topbar">
        <div>
          <h1>Shared Lists</h1>
          <p>
            {user.displayName} | {user.email}
          </p>
        </div>
        <button className="ghost" onClick={() => logout()}>
          Logout
        </button>
      </header>

      <section className="panel">
        <h2>Spazi condivisi (cartelle)</h2>
        <div className="row">
          <input
            value={newSpaceName}
            onChange={(e) => setNewSpaceName(e.target.value)}
            placeholder="Es. Casa con Luca"
          />
          <button
            disabled={busy || !newSpaceName.trim()}
            onClick={() =>
              withGuard(async () => {
                await createSpace(user, newSpaceName);
                setNewSpaceName("");
              })
            }
          >
            Crea spazio
          </button>
        </div>

        <div className="chips">
          {spaces.map((space) => (
            <button
              key={space.id}
              className={space.id === selectedSpaceId ? "chip active" : "chip"}
              onClick={() => setSelectedSpaceId(space.id)}
            >
              {space.name}
            </button>
          ))}
        </div>
      </section>

      {activeSpace ? (
        <section className="panel">
          <div className="titleRow">
            <h2>Condividi spazio: {activeSpace.name}</h2>
            {isOwner ? (
              <button
                className="danger"
                disabled={busy}
                onClick={() =>
                  withGuard(async () => {
                    if (!window.confirm("Eliminare questo spazio e tutte le sue liste?")) return;
                    await deleteSpace(activeSpace.id);
                    setSelectedSpaceId("");
                    setSelectedListId("");
                  })
                }
              >
                Elimina spazio
              </button>
            ) : null}
          </div>

          {isOwner ? (
            <>
              <div className="row">
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email utente da invitare"
                  type="email"
                />
                <button
                  disabled={busy || !inviteEmail.trim()}
                  onClick={() =>
                    withGuard(async () => {
                      await inviteMemberByEmail(activeSpace.id, inviteEmail);
                      setInviteEmail("");
                    })
                  }
                >
                  Invita
                </button>
              </div>
              <p className="hint">Nota: l'utente invitato deve aver fatto almeno un login all'app.</p>
            </>
          ) : (
            <p className="hint">Solo il proprietario puo invitare persone o eliminare lo spazio.</p>
          )}
        </section>
      ) : null}

      {activeSpace ? (
        <section className="panel">
          <h2>Liste nello spazio</h2>
          <div className="row">
            <input
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="Es. Lista spesa"
            />
            <button
              disabled={busy || !newListName.trim()}
              onClick={() =>
                withGuard(async () => {
                  await createList(user, activeSpace.id, newListName);
                  setNewListName("");
                })
              }
            >
              Nuova lista
            </button>
          </div>

          <div className="chips">
            {lists.map((list) => (
              <button
                key={list.id}
                className={list.id === selectedListId ? "chip active" : "chip"}
                onClick={() => setSelectedListId(list.id)}
              >
                {list.name}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {activeList ? (
        <section className="panel">
          <div className="titleRow">
            <h2>
              {activeList.name} ({completedCount}/{items.length})
            </h2>
            <button
              className="danger"
              disabled={busy}
              onClick={() =>
                withGuard(async () => {
                  if (!window.confirm("Eliminare questa lista e tutti i suoi elementi?")) return;
                  await deleteList(activeList.id);
                  setSelectedListId("");
                })
              }
            >
              Elimina lista
            </button>
          </div>

          <div className="row">
            <input
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              placeholder="Aggiungi elemento"
            />
            <button
              disabled={busy || !newItemText.trim()}
              onClick={() =>
                withGuard(async () => {
                  await addItem(user, activeList.id, newItemText);
                  setNewItemText("");
                })
              }
            >
              Aggiungi
            </button>
          </div>

          <ul className="items">
            {items.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!item.completed}
                    onChange={(e) => withGuard(() => toggleItem(activeList.id, item.id, e.target.checked))}
                  />
                  <span className={item.completed ? "done" : ""}>{item.text}</span>
                </label>
                <button
                  className="danger small"
                  disabled={busy}
                  onClick={() =>
                    withGuard(async () => {
                      await deleteItem(activeList.id, item.id);
                    })
                  }
                >
                  Elimina
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

export default App;