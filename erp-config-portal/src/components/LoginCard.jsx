import React, { useState } from 'react';
import { MOCK_CREDENTIALS } from '../constant/auth';
import { loginService } from '../screens/service/authService';

function LoginCard({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    if (username === MOCK_CREDENTIALS.username && password === MOCK_CREDENTIALS.password) {
      const response = await loginService({ username, password });
      if (response?.success) {
        onLoginSuccess(response.data);
      } else {
        setError('Mock login failed.');
      }
    } else {
      setError('Invalid credentials. Try admin@crm.com / Admin@123');
    }

    setLoading(false);
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold text-white">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-400">Sign in to continue to your CRM dashboard</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm text-slate-300">Email</label>
          <input
            type="email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            placeholder="admin@crm.com"
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-slate-300">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none ring-0 placeholder:text-slate-500"
            placeholder="Admin@123"
            required
          />
        </div>

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        Mock credentials: admin@crm.com / Admin@123
      </p>
    </div>
  );
}

export default LoginCard;
