import { Field, Spinner } from "../components/Ui";
import { useEffect, useRef, useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import api from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { useScramble } from "../hooks/useScramble";

// ── Avatar helpers ────────────────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return "?";
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#4f6ef7,#7c3aed)",
  "linear-gradient(135deg,#10b981,#059669)",
  "linear-gradient(135deg,#f59e0b,#d97706)",
  "linear-gradient(135deg,#ef4444,#b91c1c)",
  "linear-gradient(135deg,#8b5cf6,#6d28d9)",
  "linear-gradient(135deg,#06b6d4,#0e7490)",
  "linear-gradient(135deg,#ec4899,#be185d)",
];

function getAvatarGradient(name) {
  if (!name) return AVATAR_GRADIENTS[0];
  const code = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[code % AVATAR_GRADIENTS.length];
}

async function getCroppedImg(imageSrc, pixelCrop, outputSize = 320) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0, outputSize, outputSize
      );
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    image.onerror = reject;
    image.src = imageSrc;
  });
}

const BIO_MAX = 300;

export default function Profile() {
  const { user, setUser } = useAuthStore();
  const headingText = useScramble("O teu perfil", { duration: 1000, delay: 80 });

  const LOOKING_FOR_OPTIONS = ["open-source", "startup", "freelance", "learning", "hackathon"];

  const [form, setForm] = useState({
    name: "", bio: "", github: "", avatar: "", stack: "", lookingFor: [],
  });
  const [toast, setToast]           = useState(null);
  const [saving, setSaving]         = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Crop modal state
  const [cropSrc, setCropSrc]                 = useState(null);
  const [crop, setCrop]                       = useState({ x: 0, y: 0 });
  const [zoom, setZoom]                       = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setForm({
        name:       user.name              || "",
        bio:        user.bio               || "",
        github:     user.github            || "",
        avatar:     user.avatar            || "",
        stack:      user.stack?.join(", ") || "",
        lookingFor: user.lookingFor        || [],
      });
    }
  }, [user]);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openCropModal = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    // GIFs: skip crop editor (canvas kills the animation), use directly
    if (file.type === "image/gif") {
      if (file.size > 5 * 1024 * 1024) { showToast("GIF demasiado grande (máx 5 MB).", "error"); return; }
      const reader = new FileReader();
      reader.onload = (ev) => setForm((f) => ({ ...f, avatar: ev.target.result }));
      reader.readAsDataURL(file);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSrc(ev.target.result);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarFile = (e) => {
    const file = e.target.files?.[0];
    if (file) openCropModal(file);
    e.target.value = "";
  };

  // Drag-and-drop handlers
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) openCropModal(file);
  };

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleCropSave = async () => {
    if (!croppedAreaPixels) return;
    try {
      const cropped = await getCroppedImg(cropSrc, croppedAreaPixels);
      setForm((f) => ({ ...f, avatar: cropped }));
    } catch {
      showToast("Erro ao cortar imagem.", "error");
    } finally {
      setCropSrc(null);
    }
  };

  const saveAvatar = async () => {
    setSavingAvatar(true);
    try {
      const res = await api.put("/users/profile", { avatar: form.avatar });
      setUser(res.data.user);
      showToast("Foto guardada!", "success");
    } catch {
      showToast("Erro ao guardar foto.", "error");
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        bio: form.bio.slice(0, BIO_MAX),
        github: form.github,
        stack: form.stack.split(",").map((s) => s.trim()).filter(Boolean),
        lookingFor: form.lookingFor,
      };
      const res = await api.put("/users/profile", payload);
      setUser(res.data.user);
      showToast("Perfil atualizado com sucesso!", "success");
    } catch (err) {
      const msg = err.response?.data?.message || "Erro ao atualizar perfil.";
      showToast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const stackPreview  = form.stack.split(",").map((s) => s.trim()).filter(Boolean);
  const displayName   = form.name || user?.name || "";
  const bioCharsLeft  = BIO_MAX - form.bio.length;
  const bioNearLimit  = bioCharsLeft <= 20;
  const bioAtLimit    = bioCharsLeft <= 0;

  return (
    <div className="min-h-screen px-6 py-10 animate-page-enter">
      {/* Toast */}
      <div
        className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2"
        style={{
          transition: "all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          opacity: toast ? 1 : 0,
          transform: toast ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(-16px)",
        }}
      >
        {toast && (
          <div
            className={`rounded-2xl px-5 py-3 text-sm font-semibold shadow-lg backdrop-blur-sm ${
              toast.type === "success"
                ? "border border-green-400/20 bg-green-500/90 text-white"
                : "border border-red-500/20 bg-red-500/90 text-white"
            }`}
          >
            {toast.message}
          </div>
        )}
      </div>

      {/* Crop modal */}
      {cropSrc && (
        <CropModal
          src={cropSrc}
          crop={crop}
          zoom={zoom}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          onClose={() => setCropSrc(null)}
          onSave={handleCropSave}
        />
      )}

      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold heading-gradient font-mono">{headingText}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Mantém o teu perfil atualizado para atrair os melhores matches.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_220px]">
          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Avatar uploader */}
            <div className="card flex flex-col items-center gap-3 p-6">
              {/* Drag-and-drop zone */}
              <div
                className="relative w-full flex flex-col items-center gap-3 rounded-xl py-4 transition-all cursor-pointer"
                style={{
                  border: isDragging
                    ? "2px dashed #4f6ef7"
                    : "2px dashed rgba(255,255,255,0.08)",
                  background: isDragging ? "rgba(79,110,247,0.07)" : "transparent",
                }}
                onDragOver={handleDragOver}
                onDragEnter={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="relative">
                  {/* Avatar circle */}
                  <div className="group relative h-24 w-24 overflow-hidden rounded-2xl ring-2 ring-white/10 transition-all hover:ring-brand-500/60">
                    {form.avatar ? (
                      <img src={form.avatar} alt="avatar" className="h-full w-full object-cover" />
                    ) : (
                      <div
                        className="flex h-full w-full items-center justify-center text-2xl font-bold tracking-tight text-white select-none"
                        style={{ background: getAvatarGradient(displayName) }}
                      >
                        {getInitials(displayName)}
                      </div>
                    )}
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 opacity-0 transition-opacity group-hover:opacity-100">
                      <CameraIcon />
                      <span className="text-xs font-medium text-white">Alterar</span>
                    </div>
                  </div>

                  {/* Remove button */}
                  {form.avatar && (
                    <button
                      type="button"
                      title="Remover foto"
                      onClick={(e) => { e.stopPropagation(); setForm((f) => ({ ...f, avatar: "" })); }}
                      className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-colors hover:bg-red-400"
                    >
                      <XSmallIcon />
                    </button>
                  )}
                </div>

                <div className="text-center pointer-events-none">
                  <p className="text-xs font-medium text-brand-400">
                    {isDragging ? "Solta para fazer upload" : "Clica ou arrasta uma imagem"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">JPG, PNG · editor de corte · GIF animado direto</p>
                </div>
              </div>

              {form.avatar !== (user?.avatar || "") && (
                <button
                  type="button"
                  onClick={saveAvatar}
                  disabled={savingAvatar}
                  className="btn-primary px-6 py-2 text-sm disabled:opacity-60"
                >
                  {savingAvatar ? <Spinner /> : "Guardar foto"}
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFile}
              />
            </div>

            {/* Fields */}
            <div className="card space-y-5 p-5">
              <Field label="Nome">
                <input
                  type="text"
                  placeholder="O teu nome"
                  className="input-field"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>

              <Field label="Bio">
                <div className="relative">
                  <textarea
                    rows={3}
                    placeholder="Fala sobre ti, projetos passados, o que queres construir..."
                    className="input-field resize-none leading-relaxed"
                    value={form.bio}
                    maxLength={BIO_MAX}
                    onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  />
                  <span
                    className={`absolute bottom-2.5 right-3 text-xs transition-colors ${
                      bioAtLimit ? "text-red-400" : bioNearLimit ? "text-amber-400" : "text-slate-600"
                    }`}
                  >
                    {bioCharsLeft}
                  </span>
                </div>
              </Field>

              <Field label="GitHub URL">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-600">
                    github.com/
                  </span>
                  <input
                    type="text"
                    placeholder="o-teu-username"
                    className="input-field pl-[6.5rem]"
                    value={form.github.replace(/^https?:\/\/(www\.)?github\.com\//, "")}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const username = raw.replace(/^https?:\/\/(www\.)?github\.com\//, "");
                      setForm({ ...form, github: username ? `https://github.com/${username}` : "" });
                    }}
                  />
                </div>
              </Field>

              <Field label="Stack tecnológica" hint="Separa por vírgulas">
                <input
                  type="text"
                  placeholder="React, Node.js, TypeScript, MongoDB..."
                  className="input-field font-mono text-sm"
                  value={form.stack}
                  onChange={(e) => setForm({ ...form, stack: e.target.value })}
                />
              </Field>

              <Field label="À procura de">
                <div className="flex flex-wrap gap-2 pt-1">
                  {LOOKING_FOR_OPTIONS.map((option) => {
                    const active = form.lookingFor.includes(option);
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            lookingFor: active
                              ? form.lookingFor.filter((o) => o !== option)
                              : [...form.lookingFor, option],
                          })
                        }
                        className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-brand-500/60 bg-brand-500/20 text-brand-400"
                            : "border-white/10 bg-dark-700 text-slate-500 hover:border-white/20 hover:text-slate-300"
                        }`}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </div>

            <button type="submit" className="btn-primary w-full py-3" disabled={saving}>
              {saving ? <Spinner /> : "Guardar alterações"}
            </button>
          </form>

          {/* Preview panel */}
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-600">Preview</p>
            <div className="card overflow-hidden">
              <div className="flex h-24 items-end bg-dark-700 p-3">
                {form.avatar ? (
                  <img
                    src={form.avatar}
                    alt="preview"
                    className="h-14 w-14 rounded-xl object-cover ring-2 ring-dark-800"
                  />
                ) : (
                  <div
                    className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white ring-2 ring-dark-800 select-none"
                    style={{ background: getAvatarGradient(displayName) }}
                  >
                    {getInitials(displayName)}
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="font-semibold text-white">{form.name || "O teu nome"}</p>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{form.bio || "A tua bio aparece aqui..."}</p>
                {stackPreview.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {stackPreview.slice(0, 4).map((t) => (
                      <span key={t} className="tech-badge text-xs">{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="card p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-600">A tua conta</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Email</span>
                  <span className="truncate text-slate-300 max-w-[120px]">{user?.email || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Stack</span>
                  <span className="text-slate-300">{stackPreview.length} tecnologias</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">À procura de</span>
                  <span className="text-slate-300">{form.lookingFor.length} opções</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Crop Modal ───────────────────────────────────────────────────────────── */
function CropModal({ src, crop, zoom, onCropChange, onZoomChange, onCropComplete, onClose, onSave }) {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave();
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl"
        style={{ background: "#0c0c18", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
          <h3 className="font-semibold text-white">Ajustar foto</h3>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <XSmallIconLg />
          </button>
        </div>

        {/* Cropper */}
        <div className="relative" style={{ height: "300px", background: "#000" }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">Zoom</span>
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(e) => onZoomChange(Number(e.target.value))}
              className="flex-1 accent-indigo-500"
              style={{ cursor: "pointer" }}
            />
            <span className="w-8 text-right text-xs text-slate-500">{zoom.toFixed(1)}x</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-5 pb-5">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #4f6ef7, #6366f1)" }}
          >
            {saving ? "A guardar..." : "Aplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Icons ────────────────────────────────────────────────────────────────── */
function CameraIcon() {
  return (
    <svg width="20" height="20" fill="none" stroke="white" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
    </svg>
  );
}

function XSmallIcon() {
  return (
    <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function XSmallIconLg() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
