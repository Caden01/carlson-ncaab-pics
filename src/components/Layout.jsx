import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Trophy, LogOut, User, Menu, X } from 'lucide-react';
import { useState } from 'react';

export default function Layout() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleSignOut = async () => {
        await signOut();
        navigate('/login');
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
                                <Link to="/" className="nav-link">Dashboard</Link>
                                <Link to="/leaderboard" className="nav-link">Leaderboard</Link>
                                <div className="user-menu">
                                    <span className="user-email">{user.email}</span>
                                    <button onClick={handleSignOut} className="sign-out-btn" title="Sign Out">
                                        <LogOut size={20} />
                                    </button>
                                </div>
                            </>
                        ) : (
                            <Link to="/login" className="btn btn-primary">Sign In</Link>
                        )}
                    </div>
                </div>

                {/* Mobile Menu */}
                {isMenuOpen && (
                    <div className="mobile-menu">
                        {user ? (
                            <>
                                <Link to="/" onClick={() => setIsMenuOpen(false)} className="mobile-nav-link">Dashboard</Link>
                                <Link to="/leaderboard" onClick={() => setIsMenuOpen(false)} className="mobile-nav-link">Leaderboard</Link>
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

            <main className="main-content">
                <Outlet />
            </main>
        </div>
    );
}
