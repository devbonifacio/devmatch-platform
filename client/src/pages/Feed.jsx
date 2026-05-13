import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useScramble } from "../hooks/useScramble";

export default function Feed() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [posts, setPosts]               = useState([]);
  const [storyGroups, setStoryGroups]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showCreate, setShowCreate]     = useState(false);
  const [activeStory, setActiveStory]   = useState(null);
  const [viewedGroups, setViewedGroups] = useState(new Set());
  const [matchMap, setMatchMap]         = useState({}); // authorId → matchId
  const headingText = useScramble("Feed", { duration: 800, delay: 80 });

  const fetchFeed = async () => {
    try {
      const [feedRes, storiesRes] = await Promise.all([
        api.get("/posts/feed"),
        api.get("/posts/stories"),
      ]);
      setPosts(feedRes.data.posts || []);
      setStoryGroups(storiesRes.data.storyGroups || []);
    } catch (err) {
      console.error("Feed error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Build userId→matchId map for "send message from story"
  useEffect(() => {
    if (!user) return;
    api.get("/matches").then(res => {
      const map = {};
      (res.data.matches || []).forEach(m => {
        const other = m.users?.find(u => String(u._id) !== String(user._id));
        if (other) map[String(other._id)] = String(m._id);
      });
      setMatchMap(map);
    }).catch(() => {});
  }, [user]);

  useEffect(() => { fetchFeed(); }, []);

  const handlePostCreated = (newPost) => {
    if (newPost.type === "story") fetchFeed();
    else setPosts((prev) => [newPost, ...prev]);
    setShowCreate(false);
  };

  const handleStoryClick = (gi) => {
    setViewedGroups(prev => new Set([...prev, storyGroups[gi].author._id]));
    setActiveStory({ groups: storyGroups, groupIndex: gi, storyIndex: 0 });
  };

  const handleDeleteStory = (postId) => {
    setStoryGroups(prev => {
      const updated = prev.map(g => ({
        ...g,
        stories: g.stories.filter(s => s._id !== postId),
      })).filter(g => g.stories.length > 0);
      return updated;
    });
  };

  const handleLike = async (postId) => {
    try {
      await api.post(`/posts/${postId}/like`);
      setPosts(prev => prev.map(p => {
        if (p._id !== postId) return p;
        const uid = user._id;
        const alreadyLiked = p.likes?.includes(uid);
        return { ...p, likes: alreadyLiked ? p.likes.filter(id => id !== uid) : [...(p.likes || []), uid] };
      }));
    } catch {}
  };

  const handleDelete = async (postId) => {
    try {
      await api.delete(`/posts/${postId}`);
      setPosts(prev => prev.filter(p => p._id !== postId));
    } catch {}
  };

  const handleComment = async (postId, text) => {
    try {
      const res = await api.post(`/posts/${postId}/comment`, { text });
      setPosts(prev => prev.map(p =>
        p._id === postId ? { ...p, comments: [...(p.comments || []), res.data.comment] } : p
      ));
    } catch {}
  };

  return (
    <div className="min-h-screen px-4 py-8 animate-page-enter">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold heading-gradient font-mono">{headingText}</h1>
            <p className="mt-0.5 text-sm text-slate-500">O que está a acontecer na comunidade.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg,#4f6ef7 0%,#6366f1 100%)", boxShadow: "0 4px 16px rgba(79,110,247,0.35)" }}
          >
            <PlusIcon />
            <span className="hidden sm:inline">Publicar</span>
          </button>
        </div>

        {/* Stories bar */}
        <div className="mb-6 rounded-2xl py-4 px-3" style={{ background: "rgba(11,11,20,0.72)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex gap-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <StoryBubble label="Tua story" avatar={user?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user?._id}`} isOwn onClick={() => setShowCreate(true)} />
            {storyGroups.map((group, gi) => (
              <StoryBubble
                key={group.author._id}
                label={group.author.name}
                avatar={group.author.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${group.author._id}`}
                viewed={viewedGroups.has(group.author._id)}
                onClick={() => handleStoryClick(gi)}
              />
            ))}
          </div>
        </div>

        {showCreate && <CreatePostModal user={user} onClose={() => setShowCreate(false)} onCreated={handlePostCreated} />}

        {activeStory && (
          <StoryViewer
            groups={activeStory.groups}
            initialGroup={activeStory.groupIndex}
            initialStory={activeStory.storyIndex}
            currentUser={user}
            matchMap={matchMap}
            onClose={() => setActiveStory(null)}
            onDeleteStory={handleDeleteStory}
            navigate={navigate}
          />
        )}

        {loading ? (
          <div className="space-y-5">{[1, 2, 3].map(i => <SkeletonPost key={i} />)}</div>
        ) : posts.length === 0 ? (
          <EmptyFeed onCreatePost={() => setShowCreate(true)} />
        ) : (
          <div className="space-y-5">
            {posts.map(post => (
              <PostCard key={post._id} post={post} currentUserId={user?._id} onLike={handleLike} onDelete={handleDelete} onComment={handleComment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Story Bubble ─────────────────────────────────────────────────────────── */
function StoryBubble({ label, avatar, isOwn, viewed, onClick }) {
  const ringBg = isOwn
    ? "rgba(255,255,255,0.15)"
    : viewed
    ? "rgba(71,85,105,0.5)"
    : "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)";

  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1.5 flex-shrink-0 group" style={{ minWidth: "70px" }}>
      <div className="relative">
        <div className="rounded-full" style={{ background: ringBg, padding: "2.5px" }}>
          <div className="rounded-full" style={{ background: "#07070e", padding: "2.5px" }}>
            <img src={avatar} alt={label} className="h-[58px] w-[58px] rounded-full object-cover block" />
          </div>
        </div>
        {isOwn && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white shadow-lg"
            style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)", fontSize: "12px", fontWeight: 700, lineHeight: 1, border: "1.5px solid #07070e" }}>
            +
          </span>
        )}
      </div>
      <span className="truncate text-center leading-tight text-slate-400 group-hover:text-slate-200 transition-colors" style={{ fontSize: "11px", maxWidth: "70px" }}>
        {label}
      </span>
    </button>
  );
}

/* ── Story Viewer ─────────────────────────────────────────────────────────── */
function StoryViewer({ groups, initialGroup, initialStory, currentUser, matchMap, onClose, onDeleteStory, navigate }) {
  const [gIdx, setGIdx]       = useState(initialGroup);
  const [sIdx, setSIdx]       = useState(initialStory);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused]   = useState(false);
  const [viewers, setViewers] = useState(null); // { views, likes } — null = not loaded
  const [showViewers, setShowViewers] = useState(false);
  const [msgText, setMsgText] = useState("");
  const timerRef = useRef(null);
  const videoRef = useRef(null);

  const currentGroup = groups[gIdx];
  const currentStory = currentGroup?.stories[sIdx];
  const isOwnStory   = String(currentGroup?.author._id) === String(currentUser?._id);
  const matchId      = matchMap?.[String(currentGroup?.author._id)];

  // Mark as viewed when story changes
  useEffect(() => {
    if (!currentStory?._id || isOwnStory) return;
    api.post(`/posts/${currentStory._id}/view`).catch(() => {});
  }, [currentStory?._id]);

  // Load viewer stats for own stories
  useEffect(() => {
    if (!isOwnStory || !currentStory?._id) return;
    setViewers(null);
    api.get(`/posts/${currentStory._id}/views`)
      .then(res => setViewers(res.data))
      .catch(() => {});
  }, [currentStory?._id, isOwnStory]);

  const next = useCallback(() => {
    if (sIdx < currentGroup.stories.length - 1) { setSIdx(i => i + 1); setProgress(0); }
    else if (gIdx < groups.length - 1) { setGIdx(i => i + 1); setSIdx(0); setProgress(0); }
    else onClose();
  }, [sIdx, gIdx, currentGroup, groups, onClose]);

  const prev = useCallback(() => {
    if (sIdx > 0) { setSIdx(i => i - 1); setProgress(0); }
    else if (gIdx > 0) { setGIdx(i => i - 1); setSIdx(0); setProgress(0); }
  }, [sIdx, gIdx]);

  // Timer for image/text stories
  useEffect(() => {
    if (currentStory?.video) return; // video handles its own timing
    clearInterval(timerRef.current);
    setProgress(0);
    if (paused) return;
    timerRef.current = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(timerRef.current); next(); return 0; }
        return p + 2;
      });
    }, 100);
    return () => clearInterval(timerRef.current);
  }, [gIdx, sIdx, paused, currentStory?.video]);

  const handleDeleteStory = async () => {
    if (!currentStory?._id) return;
    try {
      await api.delete(`/posts/${currentStory._id}`);
      onDeleteStory(currentStory._id);
      next();
    } catch {}
  };

  const handleLikeStory = async () => {
    if (!currentStory?._id) return;
    try {
      await api.post(`/posts/${currentStory._id}/like`);
    } catch {}
  };

  const handleSendMessage = () => {
    if (!msgText.trim()) return;
    if (matchId) navigate(`/chat/${matchId}`);
    setMsgText("");
    onClose();
  };

  if (!currentStory) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.92)" }} onClick={onClose}>
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl"
        style={{ width: "min(100vw,400px)", height: "min(90vh,710px)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Background */}
        <div className="absolute inset-0" style={{ background: "#000" }} />

        {/* Media */}
        {currentStory.video ? (
          <video
            ref={videoRef}
            key={currentStory._id}
            src={currentStory.video}
            autoPlay
            playsInline
            className="absolute inset-0 h-full w-full object-contain"
            onTimeUpdate={e => {
              const el = e.target;
              if (el.duration) setProgress((el.currentTime / el.duration) * 100);
            }}
            onEnded={next}
          />
        ) : currentStory.image ? (
          <img src={currentStory.image} alt="story" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8" style={{ background: "linear-gradient(135deg,#1e1e3a,#2d1b4e)" }}>
            <p className="text-center text-2xl font-bold text-white">{currentStory.caption}</p>
          </div>
        )}

        {/* Top gradient */}
        <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: "100px", background: "linear-gradient(to bottom,rgba(0,0,0,0.7),transparent)" }} />

        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 flex gap-1 z-10 pointer-events-none">
          {currentGroup.stories.map((_, i) => (
            <div key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
              <div className="h-full rounded-full bg-white" style={{ width: i < sIdx ? "100%" : i === sIdx ? `${progress}%` : "0%" }} />
            </div>
          ))}
        </div>

        {/* Header: author + controls */}
        <div className="absolute top-8 left-3 right-3 z-10 flex items-center gap-2.5">
          <img
            src={currentGroup.author.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${currentGroup.author._id}`}
            className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40"
            alt={currentGroup.author.name}
          />
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">{currentGroup.author.name}</p>
            <p className="text-[11px] text-white/60">{formatTime(currentStory.createdAt)}</p>
          </div>

          {/* Own story controls */}
          {isOwnStory && (
            <>
              <button
                type="button"
                onClick={() => setShowViewers(v => !v)}
                className="flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-white/80 hover:text-white bg-black/30"
              >
                <EyeIcon />
                <span>{viewers?.views?.length ?? "..."}</span>
              </button>
              <button
                type="button"
                onClick={handleDeleteStory}
                className="flex h-8 w-8 items-center justify-center rounded-full text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <TrashIcon />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <XIcon />
          </button>
        </div>

        {/* Caption overlay */}
        {currentStory.caption && (currentStory.image || currentStory.video) && (
          <div className="absolute bottom-20 left-0 right-0 px-5 pointer-events-none">
            <p className="text-sm text-white drop-shadow">{currentStory.caption}</p>
          </div>
        )}

        {/* Bottom bar: like + message (non-owner) OR viewer list (owner) */}
        {!isOwnStory ? (
          <div className="absolute bottom-0 left-0 right-0 z-10 px-3 pb-4 pt-2" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.7),transparent)" }}>
            <div className="flex items-center gap-2">
              <button type="button" onClick={handleLikeStory} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white hover:text-red-400 transition-colors" style={{ background: "rgba(255,255,255,0.1)" }}>
                <HeartIcon />
              </button>
              <div className="flex flex-1 items-center gap-2 rounded-full px-3 py-2" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}>
                <input
                  type="text"
                  value={msgText}
                  onChange={e => { setMsgText(e.target.value); setPaused(!!e.target.value); }}
                  placeholder={matchId ? "Enviar mensagem..." : "Sem match para enviar..."}
                  disabled={!matchId}
                  onKeyDown={e => e.key === "Enter" && handleSendMessage()}
                  className="flex-1 bg-transparent text-sm text-white placeholder-white/50 outline-none"
                />
                {msgText && matchId && (
                  <button type="button" onClick={handleSendMessage} className="text-white/80 hover:text-white">
                    <SendIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : showViewers && viewers ? (
          <div className="absolute bottom-0 left-0 right-0 z-10 max-h-56 overflow-y-auto rounded-t-2xl" style={{ background: "rgba(10,10,18,0.96)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="px-4 pt-3 pb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">Visualizações · {viewers.views.length}</p>
            {viewers.views.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-slate-600">Ninguém viu ainda.</p>
            ) : viewers.views.map(v => (
              <div key={v._id} className="flex items-center gap-3 px-4 py-2">
                <img src={v.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${v._id}`} className="h-8 w-8 rounded-full object-cover" alt={v.name} />
                <span className="flex-1 text-sm text-white">{v.name}</span>
                {viewers.likes?.some(l => String(l._id) === String(v._id)) && (
                  <span className="text-red-400 text-xs">curtiu</span>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {/* Navigation zones */}
        <button className="absolute inset-y-0 left-0 w-1/3 z-20" onClick={prev} />
        <button className="absolute inset-y-0 right-1/3 w-1/3 z-20" onClick={next} style={{ right: "33.33%" }} />
      </div>
    </div>
  );
}

/* ── Post Card ────────────────────────────────────────────────────────────── */
function PostCard({ post, currentUserId, onLike, onDelete, onComment }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText]   = useState("");
  const [showMenu, setShowMenu]         = useState(false);

  const isOwnPost = post.author?._id === currentUserId;
  const isLiked   = post.likes?.includes(currentUserId);

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: "rgba(11,11,20,0.88)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <img src={post.author?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${post.author?._id}`} alt={post.author?.name} className="h-9 w-9 rounded-full object-cover" style={{ boxShadow: "0 0 0 2px rgba(79,110,247,0.3)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{post.author?.name}</p>
          <p className="text-xs text-slate-500">{formatTime(post.createdAt)}</p>
        </div>
        {isOwnPost && (
          <div className="relative">
            <button type="button" onClick={() => setShowMenu(v => !v)} className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"><DotsIcon /></button>
            {showMenu && (
              <div className="absolute right-0 top-8 z-20 overflow-hidden rounded-xl py-1 shadow-xl" style={{ background: "#13131f", border: "1px solid rgba(255,255,255,0.1)", minWidth: "140px" }}>
                <button type="button" onClick={() => { setShowMenu(false); onDelete(post._id); }} className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10"><TrashIcon />Eliminar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {post.video && (
        <div className="overflow-hidden" style={{ maxHeight: "560px", background: "#000" }}>
          <video src={post.video} controls loop playsInline className="w-full" style={{ maxHeight: "560px", objectFit: "contain" }} />
        </div>
      )}
      {!post.video && post.image && (
        <div className="overflow-hidden" style={{ maxHeight: "500px" }}>
          <img src={post.image} alt="post" className="w-full object-cover" style={{ maxHeight: "500px" }} />
        </div>
      )}
      {post.caption && <div className="px-4 py-3"><p className="text-sm leading-relaxed text-slate-200">{post.caption}</p></div>}

      <div className="flex items-center gap-4 px-4 pb-3 pt-1">
        <button type="button" onClick={() => onLike(post._id)} className={`flex items-center gap-1.5 text-sm font-medium transition-all active:scale-95 ${isLiked ? "text-red-400" : "text-slate-500 hover:text-slate-300"}`}>
          <HeartIcon filled={isLiked} /><span>{post.likes?.length || 0}</span>
        </button>
        <button type="button" onClick={() => setShowComments(v => !v)} className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-300">
          <CommentIcon /><span>{post.comments?.length || 0}</span>
        </button>
      </div>

      {showComments && (
        <div className="border-t px-4 py-3 space-y-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {post.comments?.map(c => (
            <div key={c._id} className="flex gap-2">
              <img src={c.author?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${c.author?._id}`} alt={c.author?.name} className="h-6 w-6 flex-shrink-0 rounded-full object-cover mt-0.5" />
              <div><span className="text-xs font-semibold text-slate-300">{c.author?.name} </span><span className="text-xs text-slate-400">{c.text}</span></div>
            </div>
          ))}
          {post.comments?.length === 0 && <p className="text-xs text-slate-600 text-center py-1">Sem comentários ainda.</p>}
          <form onSubmit={e => { e.preventDefault(); if (!commentText.trim()) return; onComment(post._id, commentText.trim()); setCommentText(""); }} className="flex gap-2 pt-1">
            <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Adicionar comentário..." className="min-w-0 flex-1 rounded-xl px-3 py-1.5 text-sm text-white placeholder-slate-600 outline-none" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} maxLength={500} />
            <button type="submit" disabled={!commentText.trim()} className="rounded-xl px-3 py-1.5 text-sm font-medium text-white transition-all active:scale-95 disabled:opacity-40" style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)" }}>OK</button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ── Create Post Modal ────────────────────────────────────────────────────── */
function CreatePostModal({ user, onClose, onCreated }) {
  const [type, setType]         = useState("post");
  const [mediaType, setMediaType] = useState("image"); // 'image' | 'video' for story/reel
  const [caption, setCaption]   = useState("");
  const [image, setImage]       = useState("");
  const [video, setVideo]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const fileRef  = useRef(null);
  const videoRef = useRef(null);

  const handleTypeChange = t => { setType(t); setImage(""); setVideo(""); setError(""); setMediaType("image"); };

  const handleImageChange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Imagem demasiado grande (máx 5 MB)."); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleVideoChange = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const valid = ["video/mp4", "video/webm", "video/quicktime"];
    if (!valid.includes(file.type)) { setError("Formato inválido. Usa MP4, WebM ou MOV."); return; }
    const maxMB = type === "reel" ? 50 : 50;
    if (file.size > maxMB * 1024 * 1024) { setError(`Vídeo demasiado grande (máx ${maxMB} MB).`); return; }
    setError("");
    const reader = new FileReader();
    reader.onload = () => setVideo(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const needsMedia = type === "reel" || (type === "story" && mediaType === "video");
    if (needsMedia) {
      if (!video) { setError("Adiciona um vídeo."); return; }
    } else if (type === "post" || (type === "story" && mediaType === "image")) {
      if (!caption.trim() && !image) { setError("Adiciona texto ou imagem."); return; }
    }
    setLoading(true); setError("");
    try {
      const body = (type === "reel" || (type === "story" && mediaType === "video"))
        ? { type, caption, video }
        : { type, caption, image };
      const res = await api.post("/posts", body);
      onCreated(res.data.post);
    } catch (err) {
      setError(err?.response?.data?.message || "Erro ao publicar.");
    } finally { setLoading(false); }
  };

  const showVideo = type === "reel" || (type === "story" && mediaType === "video");
  const showImage = type === "post" || (type === "story" && mediaType === "image");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl" style={{ background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)" }}>
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <h2 className="font-semibold text-white">Nova publicação</h2>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300"><XIcon /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Type */}
          <div className="flex gap-2">
            {["post", "story", "reel"].map(t => (
              <button key={t} type="button" onClick={() => handleTypeChange(t)} className="flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition-all"
                style={type === t ? { background: "linear-gradient(135deg,#4f6ef7,#6366f1)", color: "white" } : { background: "rgba(255,255,255,0.04)", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}>
                {t === "post" ? "Post" : t === "story" ? "Story" : "Reel"}
              </button>
            ))}
          </div>

          {/* Story media type toggle */}
          {type === "story" && (
            <div className="flex gap-2">
              {["image", "video"].map(mt => (
                <button key={mt} type="button" onClick={() => { setMediaType(mt); setImage(""); setVideo(""); }} className="flex-1 rounded-lg py-1.5 text-xs font-medium transition-all"
                  style={mediaType === mt ? { background: "rgba(79,110,247,0.2)", color: "#818cf8", border: "1px solid rgba(79,110,247,0.4)" } : { background: "transparent", color: "#64748b", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {mt === "image" ? "📷 Foto" : "🎬 Vídeo"}
                </button>
              ))}
            </div>
          )}

          {/* Author */}
          <div className="flex items-center gap-2">
            <img src={user?.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user?._id}`} className="h-8 w-8 rounded-full object-cover" alt={user?.name} />
            <span className="text-sm font-medium text-slate-300">{user?.name}</span>
          </div>

          {/* Caption */}
          <textarea value={caption} onChange={e => setCaption(e.target.value)}
            placeholder={type === "story" ? "Escreve a tua story..." : type === "reel" ? "Legenda (opcional)..." : "O que queres partilhar?"}
            rows={showVideo ? 2 : 3} maxLength={2000}
            className="w-full resize-none rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          />

          {/* Video picker */}
          {showVideo && (
            <div>
              {video ? (
                <div className="relative">
                  <video src={video} controls playsInline className="max-h-52 w-full rounded-xl object-contain" style={{ background: "#000" }} />
                  <button type="button" onClick={() => setVideo("")} className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black/90"><XIcon className="h-3 w-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => videoRef.current?.click()} className="flex w-full flex-col items-center justify-center gap-2 rounded-xl py-5 text-sm text-slate-500 hover:text-slate-300 transition-colors" style={{ border: "2px dashed rgba(255,255,255,0.1)" }}>
                  <VideoIcon />
                  <span>Adicionar vídeo</span>
                  <span className="text-xs text-slate-600">MP4, WebM, MOV · máx 50 MB{type === "story" ? " · mín. 30s recomendado" : ""}</span>
                </button>
              )}
              <input ref={videoRef} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={handleVideoChange} />
            </div>
          )}

          {/* Image picker */}
          {showImage && (
            <div>
              {image ? (
                <div className="relative">
                  <img src={image} alt="preview" className="max-h-56 w-full rounded-xl object-cover" />
                  <button type="button" onClick={() => setImage("")} className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-white hover:bg-black/90"><XIcon className="h-3 w-3" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors" style={{ border: "2px dashed rgba(255,255,255,0.1)" }}>
                  <ImageIcon />Adicionar imagem
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#4f6ef7,#6366f1)" }}>
              {loading ? "A publicar..." : "Publicar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
function EmptyFeed({ onCreatePost }) {
  return (
    <div className="rounded-2xl p-10 text-center" style={{ background: "rgba(11,11,20,0.7)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="mb-4 text-5xl">📸</div>
      <h2 className="text-xl font-bold text-white">Feed vazio</h2>
      <p className="mt-2 text-sm text-slate-500">Faz match com devs ou adiciona amigos para ver o feed deles.</p>
      <button type="button" onClick={onCreatePost} className="btn-primary mt-6 px-6 py-2.5 text-sm">Criar primeira publicação</button>
    </div>
  );
}

function SkeletonPost() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl" style={{ background: "rgba(11,11,20,0.7)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-3 p-4"><div className="h-9 w-9 rounded-full bg-dark-600" /><div className="space-y-1.5"><div className="h-3 w-24 rounded bg-dark-600" /><div className="h-2.5 w-16 rounded bg-dark-600" /></div></div>
      <div className="h-52 bg-dark-600" />
      <div className="p-4"><div className="h-3 w-3/4 rounded bg-dark-600" /></div>
    </div>
  );
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
function PlusIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
}
function HeartIcon({ filled }) {
  return filled
    ? <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
    : <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></svg>;
}
function CommentIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}
function DotsIcon() {
  return <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>;
}
function TrashIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>;
}
function XIcon({ className = "h-5 w-5" }) {
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
}
function ImageIcon() {
  return <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" /></svg>;
}
function VideoIcon() {
  return <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.277A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>;
}
function EyeIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>;
}
function SendIcon() {
  return <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>;
}
