import React, { useState } from "react";
import { useLogin, getGetMeQueryKey } from "@workspace/api-client-react";
import {
  LOGIN_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "@workspace/password-policy";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AlertCircle, KeyRound, LogIn, User } from "lucide-react";
import { getLoginErrorMessage } from "@/lib/error-messages";
import { clearIdentityScopedCache } from "@/lib/session-state";
import { publishSessionTransition } from "@/lib/session-sync";

const gsbLogo = new URL("../assets/gsb-logo.jpg", import.meta.url).href;

export default function Login() {
  const queryClient = useQueryClient();
  const login = useLogin();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    login.mutate(
      { data: { usuario, password } },
      {
        onSuccess: (user) => {
          // Ninguna query o mutación de una sesión anterior puede sobrevivir
          // al login, incluso si vuelve a entrar el mismo usuario. /auth/me se
          // preserva para reemplazarla sin recrear el observer de la entrada.
          clearIdentityScopedCache(queryClient, getGetMeQueryKey());
          queryClient.setQueryData(getGetMeQueryKey(), user);
          publishSessionTransition(import.meta.env.BASE_URL);
          // PublicEntry acepta la nueva identidad y recién entonces navega.
          // Así ningún árbol protegido ve datos del usuario anterior.
        },
        onError: (err) => {
          setError(getLoginErrorMessage(err));
        },
      },
    );
  };

  return (
    <main className="flex h-full min-h-0 justify-center overflow-y-auto bg-sidebar p-4">
      <Card className="my-auto w-full max-w-sm shadow-xl">
        <CardHeader className="items-center text-center space-y-3 pb-2">
          <img
            src={gsbLogo}
            alt="GSB Quality Services"
            className="h-36 w-36 object-contain"
          />
          <div>
            <h1 className="text-lg font-bold tracking-tight">
              Sistema de Tickets
            </h1>
            <p className="text-sm text-muted-foreground">
              Iniciá sesión para continuar
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="usuario">Usuario</Label>
              <div className="relative">
                <User
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="usuario"
                  className="pl-8"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <KeyRound
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <PasswordInput
                  id="password"
                  className="pl-8"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={LOGIN_PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error && (
              <div
                className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2"
                role="alert"
              >
                <AlertCircle
                  className="h-4 w-4 mt-0.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending || !usuario || !password}
            >
              <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
              {login.isPending ? "Ingresando..." : "Ingresar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
