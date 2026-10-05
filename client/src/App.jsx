import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import LeagueDetail from './pages/LeagueDetail.jsx';
import TeamDetail from './pages/TeamDetail.jsx';
import GameDetail from './pages/GameDetail.jsx';
import Login from './pages/Login.jsx';

function Header() {
  const { user, isAdmin, logout } = useAuth();
  return (
    <header className="header">
      <div className="header-inner">
        <Link to="/" className="brand">
          <span className="dot">●</span> Pelota
        </Link>
        <nav className="nav">
          <NavLink to="/" end>Ligas</NavLink>
          {isAdmin && <span className="badge">Admin: {user.username}</span>}
          {user
            ? <button className="btn secondary small" onClick={logout}>Salir</button>
            : <NavLink to="/login">Entrar</NavLink>}
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  const { loading } = useAuth();
  if (loading) return <div className="empty">Cargando…</div>;
  return (
    <>
      <Header />
      <main className="container" style={{ paddingBottom: 60 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/leagues/:id" element={<LeagueDetail />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/games/:id" element={<GameDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<div className="empty">Página no encontrada</div>} />
        </Routes>
      </main>
    </>
  );
}
