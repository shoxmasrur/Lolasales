import { useState, type FormEvent } from 'react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useAuth } from '@/store/auth';
import { Spinner } from '@/components/ui';
import { Logo } from '@/components/Logo';

export default function LoginPage() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
    } catch {
      /* xato store'da ko'rsatiladi */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full items-center justify-center px-4">
      {/* Mavzu tanlagich kirishdan OLDIN ham kerak: panel birinchi marta
          shu sahifada ko'rinadi va tanlov saqlanib qoladi. */}
      <div className="absolute right-4 top-4 w-32">
        <ThemeToggle />
      </div>

      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        {/* Faqat logotip — matnli sarlavha yo'q. */}
        <div className="mb-8 text-center">
          <Logo width={150} className="mx-auto" />
        </div>

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label className="label" htmlFor="password">
            Parol
          </label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner /> : null}
          Kirish
        </button>
      </form>
    </div>
  );
}
