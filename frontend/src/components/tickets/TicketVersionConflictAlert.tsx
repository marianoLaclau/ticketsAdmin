import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface TicketVersionConflictAlertProps {
  isReloading: boolean;
  onReload: () => void;
}

export function TicketVersionConflictAlert({
  isReloading,
  onReload,
}: TicketVersionConflictAlertProps) {
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-950">
      <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden="true" />
      <AlertTitle>Hay una versión más reciente</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>
          Conservamos tus cambios en este formulario. Para evitar sobrescribir
          el trabajo de otra persona, cargá la versión actual antes de volver
          a guardar.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-auto whitespace-normal border-amber-400 bg-white py-2 text-left hover:bg-amber-100"
          disabled={isReloading}
          onClick={onReload}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 shrink-0 ${isReloading ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {isReloading ? 'Cargando…' : 'Descartar mis cambios y cargar la versión actual'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
