// frontend/src/components/NotificationBell.tsx
// ADD THIS FILE — new file

import React, { useState, useRef, useEffect } from "react";
import { useNotification, Notification } from "./NotificationContext";

// ── helpers ────────────────────────────────────────────────────────────────
const timeAgo = (date: Date): string => {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const typeStyles: Record<Notification["type"], { dot: string; bg: string; icon: string }> = {
  success: { dot: "#22c55e", bg: "#f0fdf4", icon: "✓" },
  error:   { dot: "#ef4444", bg: "#fef2f2", icon: "✕" },
  warning: { dot: "#f59e0b", bg: "#fffbeb", icon: "!" },
  info:    { dot: "#3b82f6", bg: "#eff6ff", icon: "i" },
};

// ── Toast (pop-up banner) ──────────────────────────────────────────────────
interface ToastProps { notification: Notification; onClose: () => void }

const Toast: React.FC<ToastProps> = ({ notification, onClose }) => {
  const s = typeStyles[notification.type];

  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, zIndex: 9999,
      display: "flex", alignItems: "flex-start", gap: 10,
      background: "#fff", border: `1.5px solid ${s.dot}`,
      borderRadius: 10, padding: "14px 16px", minWidth: 280, maxWidth: 360,
      boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
      animation: "slideIn 0.3s ease",
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: s.dot, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: 14, flexShrink: 0,
      }}>{s.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{notification.title}</div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{notification.message}</div>
      </div>
      <button onClick={onClose} style={{
        background: "none", border: "none", cursor: "pointer",
        color: "#94a3b8", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0,
      }}>×</button>
      <style>{`@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
    </div>
  );
};

// ── Bell + Dropdown ────────────────────────────────────────────────────────
export const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markAllAsRead, markAsRead, clearAll } = useNotification();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Notification[]>([]);
  const prevLen = useRef(notifications.length);
  const dropRef = useRef<HTMLDivElement>(null);

  // Detect new notifications → show toast
  useEffect(() => {
    if (notifications.length > prevLen.current) {
      const newest = notifications[0];
      setToasts((t) => [...t, newest]);
    }
    prevLen.current = notifications.length;
  }, [notifications]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const removeToast = (id: string) => setToasts((t) => t.filter((n) => n.id !== id));

  return (
    <>
      {/* Toasts */}
      {toasts.map((t) => (
        <Toast key={t.id} notification={t} onClose={() => removeToast(t.id)} />
      ))}

      {/* Bell button + dropdown wrapper */}
      <div ref={dropRef} style={{ position: "relative", display: "inline-block" }}>
        <button
          onClick={() => { setOpen((o) => !o); if (!open) markAllAsRead(); }}
          title="Notifications"
          style={{
            position: "relative", background: "none", border: "none",
            cursor: "pointer", padding: 6, borderRadius: 8,
            color: "#475569", transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
        >
          {/* Bell SVG */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>

          {/* Badge */}
          {unreadCount > 0 && (
            <span style={{
              position: "absolute", top: 2, right: 2,
              background: "#ef4444", color: "#fff",
              borderRadius: "50%", width: 17, height: 17,
              fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "2px solid #fff",
            }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {open && (
          <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0,
            width: 340, background: "#fff",
            border: "1px solid #e2e8f0", borderRadius: 12,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            zIndex: 1000, overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderBottom: "1px solid #f1f5f9",
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>
                Notifications {notifications.length > 0 && `(${notifications.length})`}
              </span>
              {notifications.length > 0 && (
                <button onClick={clearAll} style={{
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 12, color: "#64748b",
                }}>Clear all</button>
              )}
            </div>

            {/* List */}
            <div style={{ maxHeight: 380, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div style={{ padding: "32px 16px", textAlign: "center", color: "#94a3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🔔</div>
                  <div style={{ fontSize: 13 }}>No notifications yet</div>
                </div>
              ) : (
                notifications.map((n) => {
                  const s = typeStyles[n.type];
                  return (
                    <div
                      key={n.id}
                      onClick={() => markAsRead(n.id)}
                      style={{
                        display: "flex", gap: 10, padding: "12px 16px",
                        background: n.read ? "#fff" : s.bg,
                        borderBottom: "1px solid #f8fafc",
                        cursor: "pointer", transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = n.read ? "#fff" : s.bg)}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: n.read ? "#cbd5e1" : s.dot,
                        marginTop: 5, flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: n.read ? 500 : 700, fontSize: 13, color: "#1e293b" }}>
                          {n.title}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 1 }}>{n.message}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                          {timeAgo(n.timestamp)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default NotificationBell;