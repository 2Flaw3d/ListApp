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
  moveItem,
  removeMember,
  renameItem,
  renameList,
  renameSpace,
  syncUserProfile,
  toggleItem,
  updateMemberRole,
  watchItems,
  watchLists,
  watchMembers,
  watchUserSpaces
} from "./firebase";

const APP_VERSION = "1.0.0";

function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [spaces, setSpaces] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [showOpenOnly, setShowOpenOnly] = useState(false);

  const [newSpaceName, setNewSpaceName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [newListName, setNewListName] = useState("");
  const [newItemText, setNewItemText] = useState("");

  const [editingSpace, setEditingSpace] = useState(false);
  const [editingSpaceName, setEditingSpaceName] = useState("");
  const [editingList, setEditingList] = useState(false);
  const [editingListName, setEditingListName] = useState("");
  const [editingItemId, setEditingItemId] = useState("");
  const [editingItemText, setEditingItemText] = useState("");

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
    const root = document.documentElement;
    if (isDarkMode) {
      root.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }, [isDarkMode]);

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

    const unsubLists = watchLists(
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

    return () => {
      unsubLists();
    };
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
  const visibleItems = useMemo(() => (showOpenOnly ? items.filter((x) => !x.completed) : items), [items, showOpenOnly]);
  const isOwner = activeSpace?.ownerId === user?.uid;

  useEffect(() => {
    if (!selectedSpaceId || !isOwner) {
      setMembers([]);
      return;
    }

    const unsub = watchMembers(
      selectedSpaceId,
      (data) => {
        setError("");
        setMembers(data);
      },
      (e) => setError(e.message)
    );

    return () => unsub();
  }, [selectedSpaceId, isOwner]);

  useEffect(() => {
    setEditingSpace(false);
    setEditingSpaceName(activeSpace?.name ?? "");
  }, [activeSpace?.id]);

  useEffect(() => {
    setEditingList(false);
    setEditingListName(activeList?.name ?? "");
    setEditingItemId("");
    setEditingItemText("");
  }, [activeList?.id]);

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
        <h1 className="appTitle">Liste <span className="versionTag">v{APP_VERSION}</span></h1>
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
          <h1 className="appTitle">Liste <span className="versionTag">v{APP_VERSION}</span></h1>
          <p>
            {user.displayName} | {user.email}
          </p>
        </div>
        <div className="topActions">
          <button className="ghost" onClick={() => setIsDarkMode((prev) => !prev)}>
            {isDarkMode ? "Light" : "Dark"}
          </button>
          <button className="ghost" onClick={() => logout()}>
            Logout
          </button>
        </div>
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
            {editingSpace ? (
              <div className="inlineEditor">
                <input value={editingSpaceName} onChange={(e) => setEditingSpaceName(e.target.value)} />
                <button
                  disabled={busy || !editingSpaceName.trim()}
                  onClick={() =>
                    withGuard(async () => {
                      await renameSpace(activeSpace.id, editingSpaceName);
                      setEditingSpace(false);
                    })
                  }
                >
                  Salva
                </button>
                <button className="ghost" onClick={() => setEditingSpace(false)}>
                  Annulla
                </button>
              </div>
            ) : (
              <h2>Condividi spazio: {activeSpace.name}</h2>
            )}

            <div className="topActions">
              {isOwner && !editingSpace ? (
                <button className="ghost" onClick={() => setEditingSpace(true)}>
                  Rinomina
                </button>
              ) : null}
              {isOwner ? (
                <button
                  className="danger iconBtn"
                  title="Elimina spazio"
                  aria-label="Elimina spazio"
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
                  -
                </button>
              ) : null}
            </div>
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
              <div className="membersList">
                {members.map((member) => (
                  <div className="memberRow" key={member.id}>
                    <div>
                      <strong>{member.displayName || member.email || member.id}</strong>
                      <p className="hint">{member.email || member.id}</p>
                    </div>
                    {member.role === "owner" ? (
                      <span className="roleBadge">owner</span>
                    ) : (
                      <div className="memberActions">
                        <select
                          value={member.role || "editor"}
                          onChange={(e) => withGuard(() => updateMemberRole(activeSpace.id, member.id, e.target.value))}
                        >
                          <option value="editor">editor</option>
                          <option value="viewer">viewer</option>
                        </select>
                        <button
                          className="danger iconBtn"
                          title="Rimuovi membro"
                          aria-label="Rimuovi membro"
                          onClick={() => withGuard(() => removeMember(activeSpace.id, member.id))}
                        >
                          -
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="hint">Gestione membri disponibile solo al proprietario.</p>
            </>
          ) : (
            <p className="hint">Solo il proprietario puo invitare persone, gestire ruoli o eliminare lo spazio.</p>
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
            {editingList ? (
              <div className="inlineEditor">
                <input value={editingListName} onChange={(e) => setEditingListName(e.target.value)} />
                <button
                  disabled={busy || !editingListName.trim()}
                  onClick={() =>
                    withGuard(async () => {
                      await renameList(activeList.id, editingListName);
                      setEditingList(false);
                    })
                  }
                >
                  Salva
                </button>
                <button className="ghost" onClick={() => setEditingList(false)}>
                  Annulla
                </button>
              </div>
            ) : (
              <h2>
                {activeList.name} ({completedCount}/{items.length})
              </h2>
            )}

            <div className="topActions">
              {!editingList ? (
                <button className="ghost" onClick={() => setEditingList(true)}>
                  Rinomina
                </button>
              ) : null}
              <button
                className="danger iconBtn"
                title="Elimina lista"
                aria-label="Elimina lista"
                disabled={busy}
                onClick={() =>
                  withGuard(async () => {
                    if (!window.confirm("Eliminare questa lista e tutti i suoi elementi?")) return;
                    await deleteList(activeList.id);
                    setSelectedListId("");
                  })
                }
              >
                -
              </button>
            </div>
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

          <label className="toggle">
            <input type="checkbox" checked={showOpenOnly} onChange={(e) => setShowOpenOnly(e.target.checked)} />
            Mostra solo non completati
          </label>

          <ul className="items">
            {visibleItems.map((item, idx) => (
              <li key={item.id}>
                {editingItemId === item.id ? (
                  <div className="inlineEditor grow">
                    <input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} />
                    <button
                      disabled={busy || !editingItemText.trim()}
                      onClick={() =>
                        withGuard(async () => {
                          await renameItem(activeList.id, item.id, editingItemText);
                          setEditingItemId("");
                          setEditingItemText("");
                        })
                      }
                    >
                      Salva
                    </button>
                    <button
                      className="ghost"
                      onClick={() => {
                        setEditingItemId("");
                        setEditingItemText("");
                      }}
                    >
                      Annulla
                    </button>
                  </div>
                ) : (
                  <>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!item.completed}
                        onChange={(e) => withGuard(() => toggleItem(activeList.id, item.id, e.target.checked))}
                      />
                      <span className={item.completed ? "done" : ""}>{item.text}</span>
                    </label>
                    <div className="itemActions">
                      <button
                        className="ghost iconBtn small"
                        title="Sposta su"
                        aria-label="Sposta su"
                        disabled={busy || idx === 0}
                        onClick={() => withGuard(() => moveItem(activeList.id, item.id, "up"))}
                      >
                        ^
                      </button>
                      <button
                        className="ghost iconBtn small"
                        title="Sposta giu"
                        aria-label="Sposta giu"
                        disabled={busy || idx === visibleItems.length - 1}
                        onClick={() => withGuard(() => moveItem(activeList.id, item.id, "down"))}
                      >
                        v
                      </button>
                      <button
                        className="ghost"
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditingItemText(item.text || "");
                        }}
                      >
                        Rinomina
                      </button>
                      <button
                        className="danger iconBtn small"
                        title="Elimina elemento"
                        aria-label="Elimina elemento"
                        disabled={busy}
                        onClick={() => withGuard(() => deleteItem(activeList.id, item.id))}
                      >
                        -
                      </button>
                    </div>
                  </>
                )}
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
