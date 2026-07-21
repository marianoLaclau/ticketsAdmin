import React, { useState } from 'react';
import { useLogin, getGetMeQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { AlertCircle, KeyRound, LogIn, User } from 'lucide-react';
import { useLocation } from 'wouter';
import { getLoginErrorMessage } from '@/lib/error-messages';

// @ts-ignore
import gsbLogo from '@/assets/gsb-logo.jpg';

export default function Login() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const login = useLogin();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { data: { usuario, password } },
      {
        onSuccess: (user) => {
          // Actualizar primero la sesión evita un nuevo pedido mientras se
          // ingresa al área autenticada.
          queryClient.setQueryData(getGetMeQueryKey(), user);
          navigate('/dashboard', { replace: true });
        },
        onError: (err) => {
          setError(getLoginErrorMessage(err));
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-sidebar flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="items-center text-center space-y-3 pb-2">
          <img
            src={gsbLogo}
            alt="GSB Quality Services"
            className="h-36 w-36 object-contain"
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight">Sistema de Tickets</h1>
            <p className="text-sm text-muted-foreground">Iniciá sesión para continuar</p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="usuario">Usuario</Label>
              <div className="relative">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="usuario"
                  className="pl-8"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <KeyRound className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <PasswordInput
                  id="password"
                  className="pl-8"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending || !usuario || !password}
            >
              <LogIn className="mr-2 h-4 w-4" />
              {login.isPending ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
