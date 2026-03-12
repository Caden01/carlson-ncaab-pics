import { Link, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Trophy,
  LogOut,
  User,
  Menu,
  X,
  Settings,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useScrollRestoration } from "../lib/useScrollRestoration";

export default function Layout() {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const isWideLayout =
    location.pathname === "/leaderboard" || location.pathname === "/recap";

  const navItems = [
    { to: "/", label: "Dashboard", icon: null },
    { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
    { to: "/recap", label: "Recap", icon: Sparkles },
    { to: "/profile", label: "Profile", icon: User },
    ...(isAdmin
      ? [{ to: "/admin", label: "Admin", icon: Settings }]
      : []),
  ];

  // Save and restore scroll position when navigating away and back
  useScrollRestoration();

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="navbar-content">
          <div className="navbar-header">
            <Link to="/" className="navbar-brand">
              <div className="brand-icon">
                <Trophy size={24} color="white" />
              </div>
              <span className="brand-text">NCAAB Picks</span>
            </Link>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="mobile-menu-btn"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

          {/* Desktop Menu */}
          <div className="desktop-menu">
            {user ? (
              <>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`nav-link ${
                        location.pathname === item.to ? "active" : ""
                      }`}
                    >
                      {Icon && <Icon size={18} />}
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
                <div className="user-menu">
                  <span className="user-email">{user.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="sign-out-btn"
                    title="Sign Out"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary">
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="mobile-menu">
            {user ? (
              <>
                {navItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsMenuOpen(false)}
                    className="mobile-nav-link"
                  >
                    {item.label}
                  </Link>
                ))}
                <div className="mobile-user-info">
                  <div className="user-details">
                    <User size={24} className="user-icon" />
                    <span>{user.email}</span>
                  </div>
                  <button
                    onClick={() => {
                      handleSignOut();
                      setIsMenuOpen(false);
                    }}
                    className="mobile-sign-out-btn"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <Link
                to="/login"
                onClick={() => setIsMenuOpen(false)}
                className="btn btn-primary mobile-btn"
              >
                Sign In
              </Link>
            )}
          </div>
        )}
      </nav>

      <main className={isWideLayout ? "full-width-content app-page" : "main-content app-page"}>
        <Outlet />
      </main>
    </div>
  );
}
