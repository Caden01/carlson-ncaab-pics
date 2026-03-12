import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { Loader2, User, Save, Mail, AtSign, Sparkles } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (user) {
      getProfile();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // getProfile intentionally excluded - only need to fetch on user change

  const getProfile = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setUsername(data.username || "");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setMessage(null);

      const { error } = await supabase
        .from("profiles")
        .update({ username })
        .eq("id", user.id);

      if (error) throw error;
      setMessage({ type: "success", text: "Profile updated successfully!" });
    } catch (error) {
      console.error("Error updating profile:", error);
      setMessage({
        type: "error",
        text: "Error updating profile. Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  return (
    <div className="dashboard-container app-page-content">
      <section className="app-page-hero">
        <div className="app-page-hero-copy">
          <div className="app-page-eyebrow">
            <Sparkles size={14} />
            Account settings
          </div>
          <div className="app-page-title-row">
            <div className="app-page-icon">
              <User size={22} />
            </div>
            <div>
              <h1 className="app-page-title">Your Profile</h1>
              <p className="app-page-subtitle">
                Manage the identity that shows up across the leaderboard,
                dashboard, and recap views.
              </p>
            </div>
          </div>
        </div>
        <div className="app-page-hero-side">
          <div className="app-page-meta-grid">
            <div className="app-page-meta-card">
              <span>Account Email</span>
              <strong>{user.email}</strong>
            </div>
            <div className="app-page-meta-card">
              <span>Display Name</span>
              <strong>{username || "Not set"}</strong>
            </div>
            <div className="app-page-meta-card">
              <span>Status</span>
              <strong>{saving ? "Saving" : "Ready"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="app-page-panel" style={{ maxWidth: "42rem", width: "100%" }}>
        {message && (
          <div className={`app-message ${message.type === "success" ? "success" : ""}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={updateProfile} className="page-stack">
          <div className="app-field">
            <label htmlFor="email">Email Address</label>
            <div className="current-date" style={{ justifyContent: "flex-start", width: "100%" }}>
              <Mail size={16} />
              <span>{user.email}</span>
            </div>
          </div>

          <div className="app-field">
            <label htmlFor="username">Display Name</label>
            <div style={{ position: "relative" }}>
              <AtSign
                size={16}
                style={{
                  position: "absolute",
                  left: "1rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                }}
              />
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your display name"
                className="app-input"
                style={{ paddingLeft: "2.5rem" }}
              />
            </div>
            <p className="helper-text">
              This name appears on the leaderboard and beside your picks.
            </p>
          </div>

          <div>
            <button type="submit" disabled={saving} className="app-button btn-primary">
              {saving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Save size={18} />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
